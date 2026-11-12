import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import type { AppConfig } from '../apps/shared/config.mjs';
import { READY_PREFIX, type ReadyMessage } from './protocol.mjs';
import type { Target } from './targets.mjs';

export interface Startup {
  processReadyMs: number;
  importMs: number;
  appInitMs: number;
}

export interface ServerProcess {
  url: string;
  startup: Startup;
  logs(): string;
  assertRunning(): void;
  stop(): Promise<void>;
  sinceSpawn(): number;
}

export interface ProcessOptions {
  runtime?: string;
  startupTimeoutMs?: number;
  shutdownTimeoutMs?: number;
  signal?: AbortSignal;
}

export async function startServer(
  target: Target,
  config: AppConfig,
  options: ProcessOptions = {},
): Promise<ServerProcess> {
  options.signal?.throwIfAborted();
  const started = performance.now();
  const child = spawn(
    options.runtime ?? process.execPath,
    [fileURLToPath(new URL('./serve.mjs', import.meta.url)), target.name],
    {
      env: {
        ...process.env,
        NODE_OPTIONS: '',
        NODE_ENV: 'production',
        HOST: config.host,
        PORT: String(config.port),
        BENCH_PROFILE: config.profile,
        BENCH_SCENARIO: config.scenario,
      },
      stdio: 'pipe',
    },
  );
  let log = '';
  let stopping = false;
  let failure: Error | undefined;
  let closed = false;
  let stopPromise: Promise<void> | undefined;
  const append = (data: Buffer) => {
    log = (log + data.toString()).slice(-65_536);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  const lines = createInterface({ input: child.stdout });
  const close = new Promise<void>((resolve) =>
    child.once('close', () => {
      closed = true;
      resolve();
    }),
  );
  child.on('error', (error) => {
    failure = error;
  });
  child.on('exit', (code, signal) => {
    if (!stopping) failure = new Error(`${target.name} exited (${signal ?? code})`);
  });
  const abort = () => {
    child.kill('SIGTERM');
  };
  options.signal?.addEventListener('abort', abort, { once: true });

  const stop = (): Promise<void> => {
    stopPromise ??= (async () => {
      stopping = true;
      options.signal?.removeEventListener('abort', abort);
      if (!closed) {
        child.kill('SIGTERM');
        await waitForClose(close, options.shutdownTimeoutMs ?? 3000);
        if (!closed) {
          child.kill('SIGKILL');
          if (!(await waitForClose(close, 3000))) throw new Error(`Cannot stop ${target.name}`);
        }
      }
      lines.close();
    })();
    return stopPromise;
  };

  try {
    const ready = await new Promise<ReadyMessage>((resolve, reject) => {
      const timeout = setTimeout(
        () => finish(new Error(`${target.name} startup timed out`)),
        options.startupTimeoutMs ?? 15_000,
      );
      const onError = (error: Error) => finish(error);
      const onExit = (code: number | null, signal: NodeJS.Signals | null) =>
        finish(new Error(`${target.name} exited before readiness (${signal ?? code})`));
      const onAbort = () => finish(new Error('Benchmark interrupted'));
      const onLine = (line: string) => {
        if (!line.startsWith(READY_PREFIX)) return;
        try {
          const message = JSON.parse(line.slice(READY_PREFIX.length)) as ReadyMessage;
          if (
            !Number.isInteger(message.port) ||
            message.port < 1 ||
            message.port > 65535 ||
            !Number.isFinite(message.importMs) ||
            message.importMs < 0 ||
            !Number.isFinite(message.appInitMs) ||
            message.appInitMs < 0
          ) {
            throw new Error('Invalid readiness message');
          }
          finish(undefined, message);
        } catch (error) {
          finish(error);
        }
      };
      function finish(error?: unknown, ready?: ReadyMessage): void {
        clearTimeout(timeout);
        lines.off('line', onLine);
        child.off('error', onError);
        child.off('exit', onExit);
        options.signal?.removeEventListener('abort', onAbort);
        if (error) reject(error);
        else if (ready) resolve(ready);
      }
      lines.on('line', onLine);
      child.once('error', onError);
      child.once('exit', onExit);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      if (options.signal?.aborted) onAbort();
    });
    return {
      url: `http://${config.host}:${ready.port}`,
      startup: { processReadyMs: performance.now() - started, importMs: ready.importMs, appInitMs: ready.appInitMs },
      logs: () => log,
      assertRunning: () => {
        if (failure) throw new Error(`${failure.message}\n${log}`, { cause: failure });
      },
      stop,
      sinceSpawn: () => performance.now() - started,
    };
  } catch (error) {
    await stop();
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${log}`, { cause: error });
  }
}

async function waitForClose(closed: Promise<void>, milliseconds: number): Promise<boolean> {
  const controller = new AbortController();
  try {
    return await Promise.race([closed.then(() => true), delay(milliseconds, false, { signal: controller.signal })]);
  } finally {
    controller.abort();
  }
}

export interface CommandResult {
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<CommandResult> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child: ChildProcessWithoutNullStreams = spawn(command, args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    const terminate = () => child.kill('SIGKILL');
    const timer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);
    signal?.addEventListener('abort', terminate, { once: true });
    child.once('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', terminate);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', terminate);
      if (signal?.aborted) reject(new Error('Benchmark interrupted'));
      else if (timedOut) reject(new Error(`${command} timed out\n${stderr}`));
      else if (code !== 0) reject(new Error(`${command} exited ${code}\n${stdout}\n${stderr}`));
      else resolve({ stdout, stderr });
    });
    if (signal?.aborted) terminate();
  });
}
