import Fastify from 'fastify';
import { BODY, CONTENT_TYPE, scenarioPath, type AppConfig } from './shared/config.mjs';
import { configureServer, type RunningApp } from './shared/server.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = Fastify({ logger: false });
  app.get(scenarioPath(config.scenario), (_request, reply) => {
    return reply.code(200).type(CONTENT_TYPE).send(BODY);
  });
  configureServer(app.server, config);
  await app.listen({ port: config.port, host: config.host });
  return { server: app.server, close: () => app.close() };
}
