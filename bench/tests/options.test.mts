import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readAppConfig, scenarioPath } from '../../apps/shared/config.mjs';
import { readOptions, shuffled } from '../options.mjs';
import { scenarioCoverage } from '../selection.mjs';

test('rejects invalid workloads before starting any processes', () => {
  for (const args of [
    ['--frameworks', 'missing'],
    ['--frameworks', 'nestjs,missing'],
    ['--frameworks', 'nestjs,nestjs'],
    ['--profiles', 'missing'],
    ['--scenarios', 'missing'],
    ['--duration', '0'],
    ['--repeats', '-1'],
    ['--threads', '4', '--connections', '1'],
    ['--frameworks', 'express', '--scenarios', 'perRequest'],
    ['--scenarios', 'hello,perRoute'],
    ['--scenarios', 'request,perRequest'],
    ['--profiles', 'close,close'],
    ['--seed', '4294967296'],
    ['--unknown'],
  ])
    assert.throws(() => readOptions(args), args.join(' '));
});

test('expands nestjs to all adapters in a mixed framework selection', () => {
  const options = readOptions([
    '--frameworks',
    'node,nestjs,holu',
    '--duration',
    '2',
    '--warmup',
    '1',
    '--repeats',
    '2',
  ]);
  assert.deepEqual(
    options.frameworks.map((target) => target.name),
    ['node', 'nestjs-node', 'nestjs-express', 'nestjs-fastify', 'holu'],
  );
  assert.equal(options.duration, 2);
  assert.equal(options.warmup, 1);
  assert.equal(options.repeats, 2);
});

test('supports the nestjs group with request-scoped scenarios', () => {
  const options = readOptions(['--frameworks', 'nestjs', '--scenarios', 'perRequest']);
  assert.deepEqual(
    options.frameworks.map((target) => target.name),
    ['nestjs-node', 'nestjs-express', 'nestjs-fastify'],
  );
  assert.deepEqual(options.scenarios, ['perRequest']);
});

test('runs each adapter once when the nestjs group overlaps explicit selections', () => {
  for (const selection of ['nestjs,nestjs-node', 'nestjs-node,nestjs']) {
    const options = readOptions(['--frameworks', selection]);
    assert.deepEqual(
      options.frameworks.map((target) => target.name),
      ['nestjs-node', 'nestjs-express', 'nestjs-fastify'],
    );
  }
});

test('supports startup-only runs and explicit request-scoped scenarios', () => {
  const options = readOptions(['--frameworks', 'holu,nestjs-node', '--scenarios', 'perRequest', '--mode', 'startup']);
  assert.equal(options.mode, 'startup');
  assert.deepEqual(
    options.frameworks.map((target) => target.name),
    ['holu', 'nestjs-node'],
  );
  assert.deepEqual(options.scenarios, ['perRequest']);
});

test('uses perRoute and perRequest consistently in CLI and server configuration', () => {
  assert.deepEqual(readOptions([]).scenarios, ['perRoute']);
  assert.equal(readAppConfig({}).scenario, 'perRoute');
  assert.deepEqual(readOptions(['--scenarios', 'perRoute,perRequest']).scenarios, ['perRoute', 'perRequest']);
  for (const scenario of ['perRoute', 'perRequest'] as const) {
    assert.equal(readAppConfig({ BENCH_SCENARIO: scenario }).scenario, scenario);
  }
  assert.equal(scenarioPath('perRoute'), '/hello');
  assert.equal(scenarioPath('perRequest'), '/hello2');
});

test('normalizes historical scenario names before running benchmarks', () => {
  assert.deepEqual(readOptions(['--scenarios', 'hello,request']).scenarios, ['perRoute', 'perRequest']);
  assert.equal(readAppConfig({ BENCH_SCENARIO: 'hello' }).scenario, 'perRoute');
  assert.equal(readAppConfig({ BENCH_SCENARIO: 'request' }).scenario, 'perRequest');
});

test('lists perRequest inclusion and skips for the selected frameworks only', () => {
  const all = readOptions(['--scenarios', 'perRequest']);
  assert.deepEqual(scenarioCoverage(all.frameworks, all.scenarios), [
    {
      scenario: 'perRequest',
      included: ['holu', 'nestjs-node', 'nestjs-express', 'nestjs-fastify'],
      skipped: ['node', 'express', 'koa', 'fastify', 'hapi'],
    },
  ]);
  const subset = readOptions(['--frameworks', 'node,holu', '--scenarios', 'perRequest']);
  assert.deepEqual(scenarioCoverage(subset.frameworks, subset.scenarios), [
    { scenario: 'perRequest', included: ['holu'], skipped: ['node'] },
  ]);
});

test('explains skipped selections even when no framework can run the scenario', () => {
  assert.throws(
    () => readOptions(['--frameworks', 'node,express', '--scenarios', 'perRequest']),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes('[perRequest] Included: none'));
      assert.ok(error.message.includes('[perRequest] Skipped (not implemented): node, express'));
      assert.doesNotMatch(error.message, /holu|hapi|nestjs/);
      return true;
    },
  );
});

test('shuffles reproducibly without mutating cases', () => {
  const cases = Array.from({ length: 20 }, (_, index) => index);
  assert.deepEqual(shuffled(cases, 42), shuffled(cases, 42));
  assert.notDeepEqual(shuffled(cases, 42), shuffled(cases, 43));
  assert.deepEqual(
    [...shuffled(cases, 42)].sort((a, b) => a - b),
    cases,
  );
});

test('accepts ephemeral ports and rejects incompatible server settings', () => {
  assert.equal(readAppConfig({ PORT: '0' }).port, 0);
  for (const env of [
    { PORT: '-1' },
    { PORT: '65536' },
    { PORT: 'NaN' },
    { BENCH_PROFILE: 'off' },
    { HOST: 'localhost' },
  ]) {
    assert.throws(() => readAppConfig(env));
  }
});
