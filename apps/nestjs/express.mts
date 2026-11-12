import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AppConfig } from '../shared/config.mjs';
import { configureServer, type RunningApp } from '../shared/server.mjs';
import { AppModule } from './app.module.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false, abortOnError: false });
  app.getHttpAdapter().getInstance().disable('etag').disable('x-powered-by');
  const server = app.getHttpServer();
  configureServer(server, config);
  await app.listen(config.port, config.host);
  return { server, close: () => app.close() };
}
