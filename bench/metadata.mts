import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cpus, freemem, release, totalmem } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const root = fileURLToPath(new URL('../../', import.meta.url));

function output(command: string, args: string[]): string | null {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 5000 });
  if (result.error) return null;
  return (result.stdout + result.stderr).trim() || null;
}

export async function metadata(wrk: string, includeWrk: boolean) {
  const lockText = await readFile(resolve(root, 'package-lock.json'), 'utf8');
  const lock = JSON.parse(lockText) as { packages: Record<string, { version?: string }> };
  const dependencyTree: Record<string, string> = {};
  await Promise.all(
    Object.keys(lock.packages)
      .filter(Boolean)
      .map(async (path) => {
        const installed = JSON.parse(await readFile(resolve(root, path, 'package.json'), 'utf8')) as {
          version: string;
        };
        dependencyTree[path] = installed.version;
      }),
  );
  return {
    node: process.version,
    versions: process.versions,
    execPath: process.execPath,
    platform: process.platform,
    architecture: process.arch,
    osRelease: release(),
    cpuModels: [...new Set(cpus().map((cpu) => cpu.model))],
    logicalCpus: cpus().length,
    memoryBytes: totalmem(),
    freeMemoryBytes: freemem(),
    commit: output('git', ['rev-parse', 'HEAD']),
    dirty: Boolean(output('git', ['status', '--porcelain'])),
    npm: output('npm', ['--version']),
    wrk: includeWrk ? output(wrk, ['--version']) : null,
    lockfileSha256: createHash('sha256').update(lockText).digest('hex'),
    dependencyTree,
    environment: { NODE_ENV: 'production', NODE_OPTIONS: '', host: '127.0.0.1' },
  };
}

export type Metadata = Awaited<ReturnType<typeof metadata>>;
