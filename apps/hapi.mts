import Hapi from '@hapi/hapi';
import { BODY, CONTENT_TYPE, scenarioPath, type AppConfig } from './shared/config.mjs';
import { configureServer, type RunningApp } from './shared/server.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = Hapi.server({ port: config.port, host: config.host });
  app.route({
    method: 'GET',
    path: scenarioPath(config.scenario),
    handler: (_request, toolkit) => toolkit.response(BODY).code(200).type(CONTENT_TYPE),
  });
  configureServer(app.listener, config);
  await app.start();
  return { server: app.listener, close: () => app.stop({ timeout: 1000 }) };
}
