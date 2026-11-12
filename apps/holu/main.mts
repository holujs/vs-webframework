import { RestApplication } from '@holu/rest';
import type { Server } from 'node:http';
import type { AppConfig } from '../shared/config.mjs';
import { listen, type RunningApp } from '../shared/server.mjs';
import { AppModule } from './app.module.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = await RestApplication.create(AppModule, { shutdownTimeout: 1000, logLevel: 'off' });
  const server = app.server as Server;
  await listen(server, config);
  return { server, close: () => app.close() };
}
