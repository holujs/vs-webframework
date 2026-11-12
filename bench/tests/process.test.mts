import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { preflight } from '../http.mjs';
import { runCommand, startServer } from '../process.mjs';
import { findTarget } from '../targets.mjs';

const config = { host: '127.0.0.1', port: 0, profile: 'keep-alive', scenario: 'perRoute' } as const;

test('handles missing executables and children exiting before readiness', async () => {
  await assert.rejects(startServer(findTarget('node'), config, { runtime: '/no-such-benchmark-runtime' }), /ENOENT/);
  await assert.rejects(startServer({ ...findTarget('node'), name: 'missing' }, config), /exited before readiness/);
});

test('terminates timed-out startup and permits subsequent successful runs', async () => {
  await assert.rejects(startServer(findTarget('node'), config, { startupTimeoutMs: 1 }), /startup timed out/);
  const server = await startServer(findTarget('node'), config);
  try {
    assert.ok(server.startup.processReadyMs >= server.startup.importMs);
    await preflight(server.url, config.scenario, config.profile);
  } finally {
    await server.stop();
    await server.stop();
  }
});

test('Fastify rejects an occupied port instead of reporting readiness', async () => {
  const occupied = createServer();
  await new Promise<void>((resolve, reject) => {
    occupied.once('error', reject);
    occupied.listen(0, config.host, resolve);
  });
  try {
    await assert.rejects(
      startServer(findTarget('fastify'), { ...config, port: (occupied.address() as AddressInfo).port }),
      /EADDRINUSE/,
    );
  } finally {
    await new Promise<void>((resolve) => occupied.close(() => resolve()));
  }
});

test('cancels a server during startup', async () => {
  const controller = new AbortController();
  const started = startServer(findTarget('node'), config, { signal: controller.signal });
  controller.abort();
  await assert.rejects(started, /interrupted/);
});

test('load command reports missing executables', async () => {
  await assert.rejects(runCommand('/no-such-wrk', [], 1000), /ENOENT/);
});
