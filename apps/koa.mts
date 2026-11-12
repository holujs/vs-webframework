import Koa from 'koa';
import Router from '@koa/router';
import { createServer } from 'node:http';
import { BODY, CONTENT_TYPE, scenarioPath, type AppConfig } from './shared/config.mjs';
import { closeServer, listen, type RunningApp } from './shared/server.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = new Koa();
  const router = new Router();
  router.get(scenarioPath(config.scenario), (context) => {
    context.status = 200;
    context.set('Content-Type', CONTENT_TYPE);
    context.body = BODY;
  });
  app.use(router.routes());
  const server = createServer(app.callback());
  await listen(server, config);
  return { server, close: () => closeServer(server) };
}
