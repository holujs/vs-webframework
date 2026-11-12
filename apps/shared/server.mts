import type { Server } from 'node:http';
import type { AppConfig } from './config.mjs';

export interface RunningApp {
  server: Server;
  close(): Promise<void>;
}

export function configureServer(server: Server, config: AppConfig): void {
  server.keepAliveTimeout = 5000;
  server.keepAliveTimeoutBuffer = 1000;
  server.headersTimeout = 60_000;
  server.requestTimeout = 300_000;
  server.maxRequestsPerSocket = config.profile === 'close' ? 1 : 0;
}

export async function listen(server: Server, config: AppConfig): Promise<void> {
  configureServer(server, config);
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(config.port, config.host);
  });
}

export async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
