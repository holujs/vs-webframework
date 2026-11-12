import { createServer } from 'node:http';
import { BODY, CONTENT_TYPE, scenarioPath, type AppConfig } from './shared/config.mjs';
import { closeServer, listen, type RunningApp } from './shared/server.mjs';

export async function start(config: AppConfig): Promise<RunningApp> {
  const path = scenarioPath(config.scenario);
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url !== path) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPE, 'Content-Length': Buffer.byteLength(BODY) }).end(BODY);
  });
  await listen(server, config);
  return { server, close: () => closeServer(server) };
}
