import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { publishResult, publishSelectedResult, readPublishOptions, updateLatestReadme } from '../publication.mjs';
import { exampleOptions } from '../presets.mjs';
import { writeReport, type Report } from '../report.mjs';

async function workspace(context: TestContext) {
  const directory = await mkdtemp(join(tmpdir(), 'benchmark-publication-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const repository = join(directory, 'repository');
  await mkdir(repository);
  await writeFile(
    join(repository, 'README.md'),
    [
      '# Test repository',
      '',
      'Intro stays.',
      '',
      '<!-- benchmark:latest:start -->',
      '',
      'Old content.',
      '',
      '<!-- benchmark:latest:end -->',
      '',
      'Tail stays.',
      '',
    ].join('\n'),
  );
  return { directory, repository };
}

function report(at: string): Report {
  return {
    schemaVersion: 1,
    startedAt: at,
    finishedAt: at,
    complete: true,
    metadata: {
      node: 'v20.11.1',
      versions: process.versions,
      execPath: '/recorded/node',
      platform: 'linux',
      architecture: 'x64',
      osRelease: 'recorded',
      cpuModels: ['Recorded CPU'],
      logicalCpus: 4,
      memoryBytes: 1000,
      freeMemoryBytes: 500,
      commit: 'recorded-commit',
      dirty: false,
      npm: '10.2.4',
      wrk: 'recorded-wrk',
      lockfileSha256: 'recorded-hash',
      dependencyTree: {},
      environment: { NODE_ENV: 'production', NODE_OPTIONS: '', host: '127.0.0.1' },
    },
    options: {
      frameworks: [{ name: 'node', packages: [], scenarios: ['perRoute'] }],
      scenarios: ['perRoute'],
      profiles: ['keep-alive'],
      mode: 'startup',
      repeats: 1,
      seed: 42,
    },
    skipped: [],
    runs: [
      {
        framework: 'node',
        profile: 'keep-alive',
        scenario: 'perRoute',
        repetition: 1,
        raw: {},
        startup: { processReadyMs: 10, importMs: 1, appInitMs: 2, firstRequestMs: 1, processFirstResponseMs: 11 },
      },
    ],
  };
}

test('shows an empty publication state without changing surrounding README content', async (context) => {
  const { repository } = await workspace(context);
  assert.equal(await updateLatestReadme(repository), undefined);
  const readme = await readFile(join(repository, 'README.md'), 'utf8');
  assert.match(readme, /No benchmark results have been published yet/);
  assert.ok(readme.startsWith('# Test repository\n\nIntro stays.\n'));
  assert.ok(readme.endsWith('\nTail stays.\n'));
  assert.doesNotMatch(readme, /!\[/);
  await updateLatestReadme(repository, true);
});

test('publishes the complete dataset and preserves a newer selection when publishing older data', async (context) => {
  const { directory, repository } = await workspace(context);
  const source = join(directory, 'source');
  const newer = report('2026-11-12T10:00:00.000Z');
  await writeReport(source, newer);
  await writeFile(join(source, 'notes.txt'), 'Recorded experiment notes');
  const original = await readFile(join(source, 'run.json'), 'utf8');
  await publishResult(source, 'a-newer', repository);
  const destination = join(repository, 'results/published/a-newer');
  assert.deepEqual(JSON.parse(await readFile(join(destination, 'run.json'), 'utf8')), newer);
  assert.equal(await readFile(join(destination, 'notes.txt'), 'utf8'), 'Recorded experiment notes');
  assert.match(await readFile(join(destination, 'summary.md'), 'utf8'), /Node: v20.11.1/);
  assert.match(await readFile(join(destination, 'chart.svg'), 'utf8'), /Node.js v20.11.1/);
  assert.equal(await readFile(join(source, 'run.json'), 'utf8'), original);
  const readme = await readFile(join(repository, 'README.md'), 'utf8');
  assert.match(readme, /results\/published\/a-newer\/chart.svg/);
  assert.match(readme, /results\/published\/a-newer\/run.json/);
  assert.match(readme, /Measured: 2026-11-12T10:00:00.000Z/);

  await writeReport(source, report('2026-11-11T10:00:00.000Z'));
  await publishResult(source, 'z-older', repository);
  assert.equal(await readFile(join(repository, 'README.md'), 'utf8'), readme);
  await assert.rejects(publishResult(source, 'a-newer', repository), { code: 'EEXIST' });
  assert.deepEqual(JSON.parse(await readFile(join(destination, 'run.json'), 'utf8')), newer);
  await updateLatestReadme(repository, true);
});

test('detects README drift and selects remaining successful data after removing the latest', async (context) => {
  const { directory, repository } = await workspace(context);
  const source = join(directory, 'source');
  const historical = report('2026-11-01T10:00:00.000Z');
  delete historical.finishedAt;
  await writeReport(source, historical);
  await publishResult(source, 'historical', repository);
  await writeReport(source, report('2026-11-12T10:00:00.000Z'));
  await publishResult(source, 'latest', repository);
  const path = join(repository, 'README.md');
  const stale = (await readFile(path, 'utf8')).replaceAll('results/published/latest/', 'results/published/historical/');
  await writeFile(path, stale);
  await assert.rejects(updateLatestReadme(repository, true), /out of date/);
  assert.equal(await readFile(path, 'utf8'), stale);
  await updateLatestReadme(repository);
  await rm(join(repository, 'results/published/latest'), { recursive: true });
  const incomplete = report('2026-12-01T10:00:00.000Z');
  incomplete.complete = false;
  await writeReport(join(repository, 'results/published/incomplete'), incomplete);
  assert.equal(await updateLatestReadme(repository), 'historical');
  assert.match(await readFile(path, 'utf8'), /Measured: 2026-11-01T10:00:00.000Z/);
  await updateLatestReadme(repository, true);
});

test('rejects incomplete, empty, failed, or invalidly named publications', async (context) => {
  const { directory, repository } = await workspace(context);
  const source = join(directory, 'source');
  const invalid: Report[] = [
    { ...report('2026-11-12T10:00:00.000Z'), complete: false },
    { ...report('2026-11-12T10:00:00.000Z'), runs: [] },
    report('invalid-date'),
  ];
  const failed = report('2026-11-12T10:00:00.000Z');
  (failed.runs[0] as Report['runs'][number]).error = 'wrk failed';
  invalid.push(failed);
  for (const item of invalid) {
    await writeReport(source, item);
    await assert.rejects(publishResult(source, 'invalid', repository), /Only completed/);
  }
  await writeReport(source, report('2026-11-12T10:00:00.000Z'));
  for (const name of ['../escape', '/absolute', 'two words', '.hidden']) {
    await assert.rejects(publishResult(source, name, repository), /Result name/);
  }
});

test('fails clearly when README markers are missing instead of appending another block', async (context) => {
  const { repository } = await workspace(context);
  await writeFile(join(repository, 'README.md'), '# Keep this README\n');
  await assert.rejects(updateLatestReadme(repository), /exactly one/);
  assert.equal(await readFile(join(repository, 'README.md'), 'utf8'), '# Keep this README\n');
});

test('accepts automatic publication, optional sources, and positional or named publication names', () => {
  assert.deepEqual(readPublishOptions([]), { source: undefined, name: undefined, help: false });
  assert.deepEqual(readPublishOptions(['results/runs/chosen']), {
    source: 'results/runs/chosen',
    name: undefined,
    help: false,
  });
  assert.deepEqual(readPublishOptions(['results/runs/chosen', 'custom']), {
    source: 'results/runs/chosen',
    name: 'custom',
    help: false,
  });
  assert.deepEqual(readPublishOptions(['--name', 'custom']), { source: undefined, name: 'custom', help: false });
  assert.equal(readPublishOptions(['--help']).help, true);
  for (const args of [['a', 'b', 'c'], ['a', 'b', '--name', 'c'], ['--name', '../bad'], [''], ['--unknown']]) {
    assert.throws(() => readPublishOptions(args));
  }
});

test('automatically selects the latest successful measurements and ignores incomplete or corrupt local data', async (context) => {
  const { repository } = await workspace(context);
  const runs = join(repository, 'results/runs');
  const newestReport = report('2026-11-12T10:00:00.000Z');
  newestReport.startedAt = '2026-11-01T10:00:00.000Z';
  await writeReport(join(runs, 'a-newest'), newestReport);
  await writeReport(join(runs, 'z-older'), report('2026-11-10T10:00:00.000Z'));
  await writeReport(join(runs, 'incomplete'), { ...report('2026-11-13T10:00:00.000Z'), complete: false });
  const failed = report('2026-11-14T10:00:00.000Z');
  (failed.runs[0] as Report['runs'][number]).error = 'wrk failed';
  await writeReport(join(runs, 'failed'), failed);
  await mkdir(join(runs, 'corrupt'));
  await writeFile(join(runs, 'corrupt/run.json'), '{');
  const result = await publishSelectedResult(repository, {}, async () => {
    throw new Error('An existing result must not trigger a benchmark');
  });
  assert.deepEqual(result, { name: '2026-11-12T10-00-00.000Z', created: true, generated: false });
  assert.deepEqual(
    JSON.parse(await readFile(join(repository, 'results/published', result.name, 'run.json'), 'utf8')),
    newestReport,
  );
});

test('runs an example only when no successful data exists and reuses its publication on subsequent calls', async (context) => {
  const { repository } = await workspace(context);
  let executed = 0;
  const runExample = async (output: string) => {
    executed++;
    assert.ok(output.startsWith(join(repository, 'results/runs/')));
    await writeReport(output, report('2026-11-12T10:00:00.000Z'));
  };
  const first = await publishSelectedResult(repository, { name: 'example' }, runExample);
  assert.deepEqual(first, { name: 'example', created: true, generated: true });
  assert.equal(executed, 1);
  assert.deepEqual(await publishSelectedResult(repository, {}, runExample), {
    name: 'example',
    created: false,
    generated: false,
  });
  await rm(join(repository, 'results/runs'), { recursive: true });
  assert.deepEqual(await publishSelectedResult(repository, {}, runExample), {
    name: 'example',
    created: false,
    generated: false,
  });
  assert.equal(executed, 1);
  assert.deepEqual(await readdir(join(repository, 'results/published')), ['example']);
  await updateLatestReadme(repository, true);
});

test('honors an explicit source and permits an automatic name or a named automatic selection', async (context) => {
  const { directory, repository } = await workspace(context);
  const older = join(directory, 'chosen');
  await writeReport(older, report('2026-11-01T10:00:00.000Z'));
  await writeReport(join(repository, 'results/runs/latest'), report('2026-11-12T10:00:00.000Z'));
  const noExample = async () => {
    throw new Error('Unexpected example benchmark');
  };
  const selected = await publishSelectedResult(repository, { source: older }, noExample);
  assert.equal(selected.name, '2026-11-01T10-00-00.000Z');
  const automatic = await publishSelectedResult(repository, { name: 'current' }, noExample);
  assert.deepEqual(automatic, { name: 'current', created: true, generated: false });
  assert.match(await readFile(join(repository, 'README.md'), 'utf8'), /results\/published\/current\/chart.svg/);
  await assert.rejects(publishSelectedResult(repository, { source: join(directory, 'missing') }, noExample), {
    code: 'ENOENT',
  });
});

test('leaves the README and published data untouched when the example fails or returns incomplete data', async (context) => {
  const { repository } = await workspace(context);
  const readme = await readFile(join(repository, 'README.md'), 'utf8');
  await assert.rejects(
    publishSelectedResult(repository, {}, async () => {
      throw new Error('wrk unavailable');
    }),
    /wrk unavailable/,
  );
  await assert.rejects(
    publishSelectedResult(repository, {}, async (output) => {
      await writeReport(output, { ...report('2026-11-12T10:00:00.000Z'), complete: false });
    }),
    /Only completed/,
  );
  assert.equal(await readFile(join(repository, 'README.md'), 'utf8'), readme);
  await assert.rejects(readdir(join(repository, 'results/published')), { code: 'ENOENT' });
});

test('the compact example retains warmup and repeats for Node.js, Fastify, NestJS platform-node, and Holu only', () => {
  const options = exampleOptions('/chosen/example');
  assert.equal(options.duration, 10);
  assert.equal(options.warmup, 5);
  assert.equal(options.repeats, 3);
  assert.equal(options.mode, 'all');
  assert.equal(options.output, '/chosen/example');
  assert.deepEqual(options.scenarios, ['perRoute']);
  assert.deepEqual(options.profiles, ['keep-alive', 'close']);
  assert.deepEqual(
    options.frameworks.map((target) => target.name),
    ['node', 'fastify', 'nestjs-node', 'holu'],
  );
});
