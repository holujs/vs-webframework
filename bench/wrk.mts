import { fileURLToPath } from 'node:url';
import { scenarioPath, type Profile, type Scenario } from '../apps/shared/config.mjs';
import type { Options } from './options.mjs';
import { runCommand, type CommandResult } from './process.mjs';
import { RESULT_PREFIX } from './protocol.mjs';

export interface Workload {
  durationSeconds: number;
  requests: number;
  bytes: number;
  requestsPerSecond: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyP99Ms: number;
  errors: { connect: number; read: number; write: number; status: number; timeout: number };
}

export function parseWorkload(stdout: string): Workload {
  const line = stdout.split('\n').find((line) => line.startsWith(RESULT_PREFIX));
  if (!line) throw new Error('wrk did not return structured results');
  const workload = JSON.parse(line.slice(RESULT_PREFIX.length)) as Workload;
  for (const key of [
    'durationSeconds',
    'requests',
    'bytes',
    'requestsPerSecond',
    'latencyP50Ms',
    'latencyP95Ms',
    'latencyP99Ms',
  ] as const) {
    if (!Number.isFinite(workload[key]) || workload[key] < 0) throw new Error(`Invalid wrk metric: ${key}`);
  }
  for (const key of ['connect', 'read', 'write', 'status', 'timeout'] as const) {
    if (!Number.isInteger(workload.errors?.[key]) || workload.errors[key] < 0)
      throw new Error(`Invalid wrk error count: ${key}`);
  }
  if (workload.durationSeconds === 0 || workload.requests === 0) throw new Error('wrk completed no requests');
  return workload;
}

export function errorCount(workload: Workload): number {
  return Object.values(workload.errors).reduce((sum, value) => sum + value, 0);
}

export async function load(
  url: string,
  scenario: Scenario,
  profile: Profile,
  seconds: number,
  options: Options,
  signal: AbortSignal,
): Promise<CommandResult> {
  const args = [
    '-t',
    String(options.threads),
    '-c',
    String(options.connections),
    '-d',
    `${seconds}s`,
    '--latency',
    '--timeout',
    '3s',
    '-s',
    fileURLToPath(new URL('../../bench/wrk.lua', import.meta.url)),
  ];
  if (profile === 'close') args.push('-H', 'Connection: close');
  args.push(url + scenarioPath(scenario));
  return runCommand(options.wrk, args, (seconds + 10) * 1000, signal);
}
