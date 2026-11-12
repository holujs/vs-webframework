import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseScenario, profiles, scenarios, type Profile, type Scenario } from '../apps/shared/config.mjs';
import type { Metadata } from './metadata.mjs';
import type { Startup } from './process.mjs';
import type { Workload } from './wrk.mjs';
import { coverageLines, scenarioCoverage, scenarioDescriptions, type ScenarioFramework } from './selection.mjs';

export interface Run {
  framework: string;
  profile: Profile;
  scenario: Scenario | 'hello' | 'request';
  repetition: number;
  startup?: Startup & { firstRequestMs: number; processFirstResponseMs: number };
  workload?: Workload;
  raw: { server?: string; warmup?: string; measurement?: string };
  error?: string;
}

export interface Report {
  schemaVersion: 1;
  startedAt: string;
  finishedAt?: string;
  complete: boolean;
  metadata: Metadata;
  options: Record<string, unknown>;
  skipped: string[];
  runs: Run[];
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function summaries(report: Pick<Report, 'runs'>) {
  const groups = new Map<string, Run[]>();
  for (const run of report.runs) {
    const key = `${run.framework} / ${parseScenario(run.scenario)} / ${run.profile}`;
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, runs]) => {
      const { framework, profile } = runs[0] as Run;
      const scenario = parseScenario((runs[0] as Run).scenario);
      const successful = runs.filter((run) => !run.error);
      const workloads = successful.flatMap((run) => (run.workload ? [run.workload] : []));
      const starts = successful.flatMap((run) => (run.startup ? [run.startup] : []));
      const rates = workloads.map((run) => run.requestsPerSecond);
      return {
        name,
        framework,
        scenario,
        profile,
        samples: successful.length,
        failed: runs.length - successful.length,
        processReadyMs: median(starts.map((run) => run.processReadyMs)),
        processFirstResponseMs: median(starts.map((run) => run.processFirstResponseMs)),
        requestsPerSecond: rates.length ? median(rates) : null,
        minRequestsPerSecond: rates.length ? Math.min(...rates) : null,
        maxRequestsPerSecond: rates.length ? Math.max(...rates) : null,
        latencyP95Ms: workloads.length ? median(workloads.map((run) => run.latencyP95Ms)) : null,
        latencyP99Ms: workloads.length ? median(workloads.map((run) => run.latencyP99Ms)) : null,
        errors: runs.reduce(
          (total, run) => total + Object.values(run.workload?.errors ?? {}).reduce((sum, count) => sum + count, 0),
          0,
        ),
      };
    });
}

function format(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits);
}

function reportCoverage(options: Report['options'] | undefined) {
  if (!Array.isArray(options?.frameworks) || !Array.isArray(options.scenarios)) return [];
  return scenarioCoverage(options.frameworks as ScenarioFramework[], options.scenarios as string[]);
}

export function markdown(report: Report): string {
  const coverage = reportCoverage(report.options);
  const selection = coverage.length
    ? [
        '## Scenario selection',
        '',
        ...coverage.map(({ scenario }) => `- \`${scenario}\`: ${scenarioDescriptions[scenario]}`),
        '',
        '| Scenario | Included | Skipped (not implemented) |',
        '| --- | --- | --- |',
        ...coverage.map(
          ({ scenario, included, skipped }) =>
            `| ${scenario} | ${included.join(', ') || 'none'} | ${skipped.join(', ') || 'none'} |`,
        ),
        '',
      ]
    : [];
  const lines = [
    '# Benchmark results',
    '',
    `Started: ${report.startedAt}. Complete: ${report.complete}. Node: ${report.metadata.node}. Commit: ${report.metadata.commit}. Dirty: ${report.metadata.dirty}.`,
    '',
    ...selection,
    'Medians of successful repetitions. p95/p99 are medians of per-run percentiles, not pooled percentiles. Failed runs remain in run.json and are excluded from timing/rate summaries.',
    '',
    '| Framework / scenario / profile | OK / failed | Ready ms | First response ms | Req/s | Req/s min–max | p95 ms | p99 ms | Errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of summaries(report)) {
    lines.push(
      `| ${row.name} | ${row.samples} / ${row.failed} | ${row.samples ? format(row.processReadyMs) : '—'} | ${row.samples ? format(row.processFirstResponseMs) : '—'} | ${format(row.requestsPerSecond, 0)} | ${format(row.minRequestsPerSecond, 0)}–${format(row.maxRequestsPerSecond, 0)} | ${format(row.latencyP95Ms)} | ${format(row.latencyP99Ms)} | ${row.errors} |`,
    );
  }
  lines.push('', '## Installed framework packages', '', '| Package | Version |', '| --- | --- |');
  const selected = report.options.frameworks as { packages: string[] }[];
  for (const name of [...new Set(selected.flatMap((target) => target.packages))].sort()) {
    lines.push(`| ${name} | ${report.metadata.dependencyTree[`node_modules/${name}`] ?? 'unknown'} |`);
  }
  if (report.runs.some((run) => run.error)) {
    lines.push('', '## Failed runs', '');
    for (const run of report.runs.filter((run) => run.error)) {
      lines.push(
        `- ${run.framework} / ${parseScenario(run.scenario)} / ${run.profile} #${run.repetition}: ${run.error?.split('\n')[0]}`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function percentageDrop(current: number, reference: number): string {
  const drop = format(((reference - current) / reference) * 100, 1);
  return `${drop === '0.0' ? '' : '−'}${drop}%`;
}

interface ChartReport {
  runs: Run[];
  metadata?: Pick<Metadata, 'node' | 'dependencyTree'>;
  options?: Report['options'];
  startedAt?: string;
  complete?: boolean;
}

function majorMinor(version: string | undefined): string | undefined {
  return version?.match(/^v?(\d+\.\d+)(?:\.|$|-|\+)/)?.[1];
}

function frameworkLabel(framework: string, report: ChartReport): string {
  if (!report.metadata) return framework;
  const selections = report.options?.frameworks as { name: string; packages: string[] }[] | undefined;
  const packages = selections?.find((target) => target.name === framework)?.packages ?? [];
  const primary = packages.includes('@nestjs/core') ? '@nestjs/core' : packages[0];
  const version = majorMinor(
    framework === 'node' ? report.metadata.node : report.metadata.dependencyTree[`node_modules/${primary}`],
  );
  if (!version) return `${framework} (version unknown)`;
  const adapters = packages
    .filter((name) => name !== primary && (name === 'express' || name === 'fastify'))
    .flatMap((name) => {
      const adapterVersion = majorMinor(report.metadata?.dependencyTree[`node_modules/${name}`]);
      return adapterVersion ? [`${name} ${adapterVersion}`] : [];
    });
  return `${framework} ${version}${adapters.length ? ` (${adapters.join(', ')})` : ''}`;
}

function chartDetails(report: ChartReport): string[] {
  const options = report.options ?? {};
  const option = (label: string, key: string, unit = ''): string[] =>
    options[key] === undefined ? [] : [`${label}: ${String(options[key])}${unit}`];
  return [
    [
      ...(report.metadata ? [`Node.js ${report.metadata.node}`] : []),
      ...option('Mode', 'mode'),
      ...option('Repeats', 'repeats'),
      ...option('Seed', 'seed'),
    ].join(' · '),
    options.mode === 'startup'
      ? ''
      : [
          ...option('Measurement', 'duration', ' s'),
          ...option('Warmup', 'warmup', ' s'),
          ...option('wrk threads', 'threads'),
          ...option('Connections', 'connections'),
        ].join(' · '),
    [
      ...option('Startup timeout', 'startupTimeoutMs', ' ms'),
      ...(report.startedAt ? [`Started: ${report.startedAt}`] : []),
      ...(report.complete === undefined ? [] : [`Status: ${report.complete ? 'complete' : 'partial'}`]),
    ].join(' · '),
    ...coverageLines(reportCoverage(report.options)),
  ].filter(Boolean);
}

const profileLabels: Readonly<Record<Profile, string>> = {
  'keep-alive': 'keep-alive (connection reused)',
  close: 'close (new connection per request)',
};

export function chart(report: ChartReport): string {
  const successful = summaries(report).filter((row) => row.samples > 0);
  const throughput = successful.some((row) => row.requestsPerSecond !== null);
  const rows = successful.filter((row) => !throughput || row.requestsPerSecond !== null);
  const value = (row: (typeof rows)[number]) => (throughput ? (row.requestsPerSecond ?? 0) : row.processReadyMs);
  const groups = scenarios.flatMap((scenario) =>
    profiles.map((profile) => ({
      name: `${scenario} / ${profileLabels[profile]}`,
      rows: rows.filter((row) => row.scenario === scenario && row.profile === profile),
    })),
  );
  const details = chartDetails(report);
  const context = details
    .map((line, index) => `<text x="16" y="${50 + index * 20}">${escapeXml(line)}</text>`)
    .join('');
  const noteY = 50 + details.length * 20;
  let y = noteY + 28;
  const sections = groups
    .filter((group) => group.rows.length > 0)
    .map((group) => {
      group.rows.sort(
        (a, b) => (throughput ? value(b) - value(a) : value(a) - value(b)) || a.name.localeCompare(b.name),
      );
      const leaderRate = group.rows[0]?.requestsPerSecond ?? 0;
      const maximum = Math.max(...group.rows.map(value)) || 1;
      const heading = `<text x="16" y="${y}" font-size="16" font-weight="600">${escapeXml(group.name)}</text>`;
      y += 16;
      const bars = group.rows.map((row, index) => {
        const barY = y;
        y += 32;
        const width = (value(row) / maximum) * 500;
        const previousRate = group.rows[index - 1]?.requestsPerSecond ?? 0;
        const comparisons: string[] = [];
        if (throughput && row.requestsPerSecond !== null) {
          if (index === 0) {
            comparisons.push('leader');
          } else {
            if (previousRate > 0)
              comparisons.push(`${percentageDrop(row.requestsPerSecond, previousRate)} vs previous`);
            if (leaderRate > 0) comparisons.push(`${percentageDrop(row.requestsPerSecond, leaderRate)} vs leader`);
          }
        }
        const relative = comparisons.length ? ` (${comparisons.join('; ')})` : '';
        const label = `${format(value(row), throughput ? 0 : 2)}${throughput ? ' req/s' : ''}${relative}`;
        return `<text x="16" y="${barY + 16}">${escapeXml(frameworkLabel(row.framework, report))}</text><rect x="380" y="${barY}" width="${width}" height="23" fill="#2673c9"/><text x="${390 + width}" y="${barY + 16}">${label}</text>`;
      });
      y += 24;
      return `<g aria-label="${escapeXml(group.name)}">${heading}${bars.join('')}</g>`;
    });
  const height = Math.max(80, y);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${throughput ? 1280 : 1000}" height="${height}" role="img" aria-label="Benchmark medians"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" font-size="13" fill="#17212b"><text x="16" y="28" font-size="18">${throughput ? 'Median requests per second (higher is better)' : 'Median process to ready, ms (lower is better)'}</text>${context}<text x="16" y="${noteY}">Rankings, comparisons, and bar scales are per scenario/profile.</text>${sections.join('')}</g></svg>\n`;
}

export async function writeReport(directory: string, report: Report): Promise<void> {
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, 'run.json');
  await writeFile(destination + '.tmp', JSON.stringify(report, null, 2) + '\n');
  await rename(destination + '.tmp', destination);
  await writeFile(resolve(directory, 'summary.md'), markdown(report));
  await writeFile(resolve(directory, 'chart.svg'), chart(report));
}

export async function readReport(directory: string): Promise<Report> {
  const report = JSON.parse(await readFile(resolve(directory, 'run.json'), 'utf8')) as Report;
  if (report.schemaVersion !== 1 || !Array.isArray(report.runs)) throw new Error('Unsupported benchmark report');
  return report;
}

export async function regenerateReport(directory: string): Promise<void> {
  const report = await readReport(directory);
  await writeReport(directory, report);
}
