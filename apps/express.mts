import express from 'express';
import { createServer } from 'node:http';
import { BODY, CONTENT_TYPE, scenarioPath, type AppConfig } from './shared/config.mjs';
import { closeServer, listen, type RunningApp } from './shared/server.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const app = express();
  app.disable('etag');
  app.disable('x-powered-by');
  app.get(scenarioPath(config.scenario), (_request, response) => {
    response.status(200).set('Content-Type', CONTENT_TYPE).send(BODY);
  });
  const server = createServer(app);
  await listen(server, config);
  return { server, close: () => closeServer(server) };
}
