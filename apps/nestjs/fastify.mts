import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AppConfig } from '../shared/config.mjs';
import { configureServer, type RunningApp } from '../shared/server.mjs';
import { AppModule } from './app.module.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }), {
    logger: false,
    abortOnError: false,
  });
  const server = app.getHttpServer();
  configureServer(server, config);
  await app.listen(config.port, config.host);
  return { server, close: () => app.close() };
}
