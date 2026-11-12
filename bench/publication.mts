import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { format, resolveConfig } from 'prettier';
import { readReport, regenerateReport, type Report } from './report.mjs';
import { runExampleBenchmark } from './presets.mjs';

const startMarker = '<!-- benchmark:latest:start -->';
const endMarker = '<!-- benchmark:latest:end -->';

interface Publication {
  name: string;
  source: string;
  published: boolean;
  report: Report;
  measuredAt: number;
}

export interface PublishOptions {
  source?: string;
  name?: string;
}

export const publishHelp = `Usage: npm run results:publish -- [run-directory] [name]
  No arguments     Publish the latest successful local or published result.
                   If none exists, run the compact example benchmark first.
  run-directory    Optional explicit source; its name is generated from the measurement date.
  name             Optional unique name for the published directory.
  --name <name>    Name the automatically selected result.
  --help           Show this help.

Example benchmark: Node.js, Fastify, NestJS platform-node, and Holu,
perRoute, both HTTP profiles, 5s warmup + 10s measurement,
3 repetitions (about 6 minutes plus startup).`;

function validateName(name: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name)) {
    throw new Error(
      'Result name must start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens',
    );
  }
}

export function readPublishOptions(args: string[]): PublishOptions & { help: boolean } {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: { name: { type: 'string' }, help: { type: 'boolean', default: false } },
  });
  if (
    positionals.length > 2 ||
    positionals.some((value) => !value) ||
    (positionals[1] !== undefined && values.name !== undefined)
  ) {
    throw new Error(publishHelp);
  }
  const name = values.name ?? positionals[1];
  if (name !== undefined) validateName(name);
  return { source: positionals[0], name, help: values.help };
}

function measuredAt(report: Report): number {
  return Date.parse(report.finishedAt ?? report.startedAt);
}

function publishable(report: Report): boolean {
  return (
    report.complete === true &&
    report.runs.length > 0 &&
    Number.isFinite(measuredAt(report)) &&
    report.runs.every(
      (run) =>
        !run.error &&
        (run.workload !== undefined || run.startup !== undefined) &&
        Object.values(run.workload?.errors ?? {}).every((count) => count === 0),
    )
  );
}

async function readResults(directory: string, published: boolean): Promise<Publication[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const publications: Publication[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const source = join(directory, entry.name);
    const report = await readReport(source).catch((error: NodeJS.ErrnoException) => {
      if (
        error.code === 'ENOENT' ||
        (!published && (error instanceof SyntaxError || error.message === 'Unsupported benchmark report'))
      )
        return undefined;
      throw error;
    });
    if (report && publishable(report))
      publications.push({ name: entry.name, source, published, report, measuredAt: measuredAt(report) });
  }
  return publications;
}

function newest(publications: Publication[]): Publication | undefined {
  return publications.sort(
    (a, b) => b.measuredAt - a.measuredAt || Number(b.published) - Number(a.published) || a.name.localeCompare(b.name),
  )[0];
}

function latestBlock(publication: Publication | undefined): string {
  if (!publication) {
    return 'No benchmark results have been published yet. Run `npm run results:publish` to publish the latest successful result or create an example benchmark.';
  }
  const { name, report } = publication;
  const directory = `results/published/${encodeURIComponent(name)}`;
  return [
    `Measured: ${new Date(publication.measuredAt).toISOString()} · Node.js ${report.metadata.node} · Mode: ${String(report.options.mode)}.`,
    '',
    `![Latest published benchmark](${directory}/chart.svg)`,
    '',
    `[Full report](${directory}/summary.md) · [Raw results and environment](${directory}/run.json) · [All published results](results/published/)`,
  ].join('\n');
}

export async function updateLatestReadme(repository: string, check = false): Promise<string | undefined> {
  const path = join(repository, 'README.md');
  const readme = await readFile(path, 'utf8');
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (
    start === -1 ||
    end < start ||
    start !== readme.lastIndexOf(startMarker) ||
    end !== readme.lastIndexOf(endMarker)
  ) {
    throw new Error('README.md must contain exactly one benchmark:latest:start/end block');
  }
  const latest = newest(await readResults(join(repository, 'results/published'), true));
  const updated =
    readme.slice(0, start + startMarker.length) + '\n\n' + latestBlock(latest) + '\n\n' + readme.slice(end);
  const formatted = await format(updated, { ...(await resolveConfig(path)), parser: 'markdown' });
  if (formatted !== readme) {
    if (check) throw new Error('Latest benchmark in README.md is out of date. Run npm run results:latest.');
    await writeFile(path, formatted);
  }
  return latest?.name;
}

export async function publishResult(source: string, name: string, repository: string): Promise<void> {
  validateName(name);
  const report = await readReport(source);
  if (!publishable(report))
    throw new Error('Only completed, nonempty benchmark runs without failed samples can be published');
  const destination = join(repository, 'results/published', name);
  const inside = relative(resolve(source), destination);
  if (inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))) {
    throw new Error('Published destination must be outside the source directory');
  }
  await mkdir(join(repository, 'results/published'), { recursive: true });
  // mkdir is exclusive: a published dataset is never overwritten, even on retry.
  await mkdir(destination);
  try {
    for (const entry of await readdir(source)) {
      await cp(join(source, entry), join(destination, entry), { recursive: true, force: false, errorOnExist: true });
    }
    await regenerateReport(destination);
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  await updateLatestReadme(repository);
}

export async function publishSelectedResult(
  repository: string,
  options: PublishOptions = {},
  runExample: (output: string) => Promise<void> = runExampleBenchmark,
): Promise<{ name: string; created: boolean; generated: boolean }> {
  if (options.name !== undefined) validateName(options.name);
  const published = await readResults(join(repository, 'results/published'), true);
  const local = options.source === undefined ? await readResults(join(repository, 'results/runs'), false) : [];
  let selected = newest([...published, ...local]);
  if (options.source !== undefined) {
    const report = await readReport(options.source);
    selected = { name: '', source: resolve(options.source), report, measuredAt: measuredAt(report), published: false };
  }
  let generated = false;
  if (!selected) {
    const runs = join(repository, 'results/runs');
    await mkdir(runs, { recursive: true });
    const output = await mkdtemp(join(runs, `${new Date().toISOString().replaceAll(':', '-')}-example-`));
    await runExample(output);
    const report = await readReport(output);
    selected = { name: '', source: output, report, measuredAt: measuredAt(report), published: false };
    generated = true;
  }
  if (!publishable(selected.report))
    throw new Error('Only completed, nonempty benchmark runs without failed samples can be published');
  const identical = published.find((item) => JSON.stringify(item.report) === JSON.stringify(selected.report));
  const name = options.name ?? identical?.name ?? new Date(selected.measuredAt).toISOString().replaceAll(':', '-');
  if (identical?.name === name) {
    await regenerateReport(identical.source);
    await updateLatestReadme(repository);
    return { name, created: false, generated };
  }
  await publishResult(selected.source, name, repository);
  return { name, created: true, generated };
}
