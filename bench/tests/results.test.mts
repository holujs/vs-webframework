import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chart, charts, median, summaries, type Run } from '../report.mjs';
import { errorCount, parseWorkload } from '../wrk.mjs';

const metrics = {
  durationSeconds: 30,
  requests: 3000,
  bytes: 100_000,
  requestsPerSecond: 100,
  latencyP50Ms: 0.1,
  latencyP95Ms: 0.5,
  latencyP99Ms: 1,
  errors: { connect: 0, read: 0, write: 0, status: 0, timeout: 0 },
};
const output = (value: unknown) => `Running 30s test...\nRequests/sec: 100\nBENCH_RESULT ${JSON.stringify(value)}\n`;

function measuredRun(
  framework: string,
  rate: number,
  profile: Run['profile'] = 'keep-alive',
  scenario: Run['scenario'] = 'perRoute',
): Run {
  return {
    framework,
    profile,
    scenario,
    repetition: 1,
    raw: {},
    workload: { ...metrics, requestsPerSecond: rate },
  };
}

function chartGroups(runs: Run[]) {
  return [...chart({ runs }).matchAll(/<g aria-label="([^"]+)">([\s\S]*?)<\/g>/g)].map((match) => {
    const section = match[2] as string;
    const bars = [...section.matchAll(/<rect class="bar"([^>]*)><title>[^<]*<\/title><desc>([^<]*)<\/desc><\/rect>/g)];
    const attribute = (attributes: string, name: string) => attributes.match(new RegExp(`${name}="([^"]+)"`))?.[1];
    return {
      name: match[1],
      frameworks: bars.map((bar) => attribute(bar[1] as string, 'data-framework')),
      labels: bars.map((bar) => bar[2]),
      heights: bars.map((bar) => Number(attribute(bar[1] as string, 'height'))),
    };
  });
}

test('reads structured wrk results and preserves error counts', () => {
  assert.deepEqual(parseWorkload(output(metrics)), metrics);
  const failed = { ...metrics, errors: { ...metrics.errors, status: 2, timeout: 1 } };
  assert.equal(errorCount(parseWorkload(output(failed))), 3);
});

test('rejects incomplete or unusable load measurements', () => {
  for (const stdout of [
    'Requests/sec: 100',
    'BENCH_RESULT {',
    output({ ...metrics, requests: 0 }),
    output({ ...metrics, latencyP99Ms: null }),
    output({ ...metrics, errors: {} }),
  ])
    assert.throws(() => parseWorkload(stdout));
});

test('computes medians for odd/even samples without changing input', () => {
  const values = [10, 1, 5, 2];
  assert.equal(median(values), 3.5);
  assert.deepEqual(values, [10, 1, 5, 2]);
  assert.equal(median([2, 100, 1]), 2);
});

test('keeps chart rankings, leader gaps, previous gaps, and scales within each scenario/profile', () => {
  const runs = [
    measuredRun('holu', 80, 'close'),
    measuredRun('express', 810),
    measuredRun('nestjs-node', 5000, 'keep-alive', 'perRequest'),
    measuredRun('holu', 900),
    measuredRun('holu', 30, 'close', 'perRequest'),
    measuredRun('node', 1000),
    measuredRun('node', 100, 'close'),
    measuredRun('holu', 10000, 'keep-alive', 'perRequest'),
    { ...measuredRun('express', 100000), error: 'measurement failed' },
    { ...measuredRun('fastify', 999999), workload: undefined },
  ];
  const original = structuredClone(runs);
  assert.deepEqual(chartGroups(runs), [
    {
      name: 'perRoute / keep-alive (connection reused)',
      frameworks: ['node', 'holu', 'express'],
      labels: [
        '1000 req/s (leader)',
        '900 req/s (−10.0% vs previous; −10.0% vs leader)',
        '810 req/s (−10.0% vs previous; −19.0% vs leader)',
      ],
      heights: [240, 216, 194.4],
    },
    {
      name: 'perRoute / close (new connection per request)',
      frameworks: ['node', 'holu'],
      labels: ['100 req/s (leader)', '80 req/s (−20.0% vs previous; −20.0% vs leader)'],
      heights: [240, 192],
    },
    {
      name: 'perRequest / keep-alive (connection reused)',
      frameworks: ['holu', 'nestjs-node'],
      labels: ['10000 req/s (leader)', '5000 req/s (−50.0% vs previous; −50.0% vs leader)'],
      heights: [240, 120],
    },
    {
      name: 'perRequest / close (new connection per request)',
      frameworks: ['holu'],
      labels: ['30 req/s (leader)'],
      heights: [240],
    },
  ]);
  assert.deepEqual(runs, original);
});

test('sorts startup times independently within each HTTP profile and omits failed-only groups', () => {
  const startupRun = (framework: string, readyMs: number, profile: Run['profile']): Run => ({
    ...measuredRun(framework, 0, profile),
    workload: undefined,
    startup: {
      processReadyMs: readyMs,
      importMs: 0,
      appInitMs: 0,
      firstRequestMs: 0,
      processFirstResponseMs: readyMs,
    },
  });
  assert.deepEqual(
    chartGroups([
      startupRun('holu', 5, 'keep-alive'),
      startupRun('node', 20, 'close'),
      startupRun('node', 2, 'keep-alive'),
      startupRun('holu', 10, 'close'),
      { ...measuredRun('holu', 1000, 'keep-alive', 'perRequest'), error: 'startup failed' },
    ]),
    [
      {
        name: 'perRoute / keep-alive (connection reused)',
        frameworks: ['node', 'holu'],
        labels: ['2.00', '5.00'],
        heights: [80, 200],
      },
      {
        name: 'perRoute / close (new connection per request)',
        frameworks: ['holu', 'node'],
        labels: ['10.00', '20.00'],
        heights: [120, 240],
      },
    ],
  );
});

test('renders historical scenario names as perRoute and perRequest without changing recorded samples', () => {
  const runs = [
    measuredRun('node', 100, 'keep-alive', 'hello'),
    measuredRun('holu', 90, 'keep-alive', 'perRoute'),
    measuredRun('holu', 80, 'close', 'request'),
    measuredRun('holu', 100, 'close', 'perRequest'),
  ];
  const original = structuredClone(runs);
  assert.deepEqual(chartGroups(runs), [
    {
      name: 'perRoute / keep-alive (connection reused)',
      frameworks: ['node', 'holu'],
      labels: ['100 req/s (leader)', '90 req/s (−10.0% vs previous; −10.0% vs leader)'],
      heights: [240, 216],
    },
    {
      name: 'perRequest / close (new connection per request)',
      frameworks: ['holu'],
      labels: ['90 req/s (leader)'],
      heights: [216],
    },
  ]);
  assert.deepEqual(
    summaries({ runs }).map((row) => row.name),
    ['holu / perRequest / close', 'holu / perRoute / keep-alive', 'node / perRoute / keep-alive'],
  );
  assert.deepEqual(runs, original);
});

test('renders recorded framework versions and workload parameters without using current dependencies', () => {
  const svg = chart({
    runs: ['node', 'holu', 'nestjs-node', 'nestjs-express', 'nestjs-fastify', 'hapi'].map((name) =>
      measuredRun(name, 100),
    ),
    metadata: {
      node: 'v20.11.1',
      dependencyTree: {
        'node_modules/@holu/core': '0.2.9',
        'node_modules/@holu/rest': '0.3.8',
        'node_modules/@nestjs/common': '99.9.0',
        'node_modules/@nestjs/core': '10.4.3',
        'node_modules/express': '4.21.2',
        'node_modules/fastify': '4.28.1',
      },
    },
    options: {
      frameworks: [
        { name: 'node', packages: [] },
        { name: 'holu', packages: ['@holu/core', '@holu/rest'] },
        { name: 'nestjs-node', packages: ['@nestjs/common', '@nestjs/core', '@nestjs/platform-node'] },
        { name: 'nestjs-express', packages: ['@nestjs/common', '@nestjs/core', 'express'] },
        { name: 'nestjs-fastify', packages: ['@nestjs/common', '@nestjs/core', 'fastify'] },
        { name: 'hapi', packages: ['@hapi/hapi'] },
      ],
      mode: 'all',
      duration: 2,
      warmup: 0,
      repeats: 2,
      threads: 4,
      connections: 100,
      seed: 7,
      startupTimeoutMs: 12345,
    },
    startedAt: '2026-01-01T00:00:00.000Z',
    complete: false,
  });
  for (const label of [
    'node 20.11',
    'holu 0.2',
    'nestjs-node 10.4',
    'nestjs-express 10.4 (express 4.21)',
    'nestjs-fastify 10.4 (fastify 4.28)',
    'hapi (version unknown)',
  ]) {
    assert.ok(svg.includes(`<title>${label}: `), label);
  }
  assert.ok(svg.includes('Node.js v20.11.1 · Mode: all · Repeats: 2 · Seed: 7'));
  assert.ok(svg.includes('Measurement: 2 s · Warmup: 0 s · wrk threads: 4 · Connections: 100'));
  assert.ok(svg.includes('Startup timeout: 12345 ms · Started: 2026-01-01T00:00:00.000Z · Status: partial'));
});

test('omits unused load parameters from startup-only chart metadata', () => {
  const svg = chart({
    runs: [],
    options: {
      mode: 'startup',
      duration: 30,
      warmup: 5,
      repeats: 10,
      threads: 4,
      connections: 100,
      seed: 42,
      startupTimeoutMs: 15000,
    },
    complete: true,
  });
  assert.ok(svg.includes('Mode: startup · Repeats: 10 · Seed: 42'));
  assert.ok(svg.includes('Startup timeout: 15000 ms · Status: complete'));
  assert.doesNotMatch(svg, /Measurement:|Warmup:|wrk threads:|Connections:/);
});

test('shows scenario inclusion and skips from recorded selections and capabilities', () => {
  const svg = chart({
    runs: [measuredRun('holu', 100, 'keep-alive', 'perRequest')],
    options: {
      scenarios: ['hello', 'request'],
      frameworks: [
        { name: 'node', scenarios: ['hello'] },
        { name: 'holu', scenarios: ['hello', 'request'] },
        { name: 'nestjs-node', scenarios: ['hello'] },
      ],
    },
  });
  assert.ok(svg.includes('[perRoute] Included: node, holu, nestjs-node'));
  assert.ok(svg.includes('[perRoute] Skipped (not implemented): none'));
  assert.ok(svg.includes('[perRequest] Included: holu'));
  assert.ok(svg.includes('[perRequest] Skipped (not implemented): node, nestjs-node'));
  assert.doesNotMatch(svg, /nestjs-express|nestjs-fastify|express,|fastify,/);
});

test('generates separate vertical charts with zero baselines and values above the bars', () => {
  const generated = charts({
    runs: [measuredRun('node', 100), measuredRun('holu', 0), measuredRun('holu', 10, 'close', 'request')],
  });
  assert.deepEqual(
    generated.map((item) => item.filename),
    ['chart-perRoute-keep-alive.svg', 'chart-perRequest-close.svg'],
  );
  for (const item of generated) {
    assert.match(item.svg, /width="600"[^>]*viewBox="0 0 600 \d+"/);
    assert.doesNotMatch(item.svg, /NaN|Infinity/);
    const bars = [...item.svg.matchAll(/<rect class="bar"[^>]* y="([^"]+)"[^>]* height="([^"]+)"/g)];
    const values = [...item.svg.matchAll(/<text class="value"[^>]* y="([^"]+)"/g)];
    assert.ok(bars.length > 0);
    assert.equal(bars.length, values.length);
    const baseline = Number(bars[0]?.[1]) + Number(bars[0]?.[2]);
    bars.forEach((bar, index) => {
      assert.equal(Number(bar[1]) + Number(bar[2]), baseline);
      assert.ok(Number(values[index]?.[1]) < Number(bar[1]));
    });
  }
  assert.equal(charts({ runs: [] }).length, 0);
  assert.match(chart({ runs: [] }), /No successful measurements/);
});
