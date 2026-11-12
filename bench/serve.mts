import type { AddressInfo } from 'node:net';
import { readAppConfig, type AppConfig } from '../apps/shared/config.mjs';
import type { RunningApp } from '../apps/shared/server.mjs';
import { findTarget } from './targets.mjs';
import { READY_PREFIX, type ReadyMessage } from './protocol.mjs';

async function main(): Promise<void> {
  const target = findTarget(process.argv[2] ?? '');
  const config = readAppConfig();
  if (!target.scenarios.includes(config.scenario)) {
    throw new Error(`${target.name} does not support scenario ${config.scenario}`);
  }
  const state: { running?: RunningApp } = {};
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (state.running) {
      await state.running.close();
      process.exit(0);
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => void shutdown().catch(fail));
  }

  const beforeImport = performance.now();
  const implementation = (await import(target.entry)) as { start(config: AppConfig): Promise<RunningApp> };
  const imported = performance.now();
  const running = await implementation.start(config);
  state.running = running;
  const initialized = performance.now();
  if (shuttingDown) {
    await running.close();
    process.exit(0);
  }
  const message: ReadyMessage = {
    port: (running.server.address() as AddressInfo).port,
    importMs: imported - beforeImport,
    appInitMs: initialized - imported,
  };
  console.log(`${READY_PREFIX}${JSON.stringify(message)}`);
}

function fail(error: unknown): void {
  console.error(error);
  process.exit(1);
}

// This file is an executable; protocol types/constants live separately for the parent.
void main().catch(fail);
