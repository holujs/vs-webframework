import { resolve } from 'node:path';
import type { Profile, Scenario } from '../apps/shared/config.mjs';
import { preflight } from './http.mjs';
import { metadata } from './metadata.mjs';
import { help, readOptions, shuffled } from './options.mjs';
import { startServer } from './process.mjs';
import { writeReport, type Report, type Run } from './report.mjs';
import { coverageLines, scenarioCoverage } from './selection.mjs';
import type { Target } from './targets.mjs';
import { errorCount, load, parseWorkload } from './wrk.mjs';

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  if (options.help) {
    console.log(help);
    return;
  }
  for (const line of coverageLines(scenarioCoverage(options.frameworks, options.scenarios))) console.log(line);
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  const cases: { target: Target; scenario: Scenario; profile: Profile }[] = [];
  const skipped: string[] = [];
  for (const target of options.frameworks) {
    for (const scenario of options.scenarios) {
      if (!target.scenarios.includes(scenario)) {
        skipped.push(`${target.name} / ${scenario}`);
        continue;
      }
      for (const profile of options.profiles) cases.push({ target, scenario, profile });
    }
  }
  const report: Report = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    complete: false,
    metadata: await metadata(options.wrk, options.mode !== 'startup'),
    options: { ...options, runtime: process.execPath },
    skipped,
    runs: [],
  };
  const output = resolve(options.output);
  try {
    await writeReport(output, report);
    for (let repetition = 1; repetition <= options.repeats; repetition++) {
      for (const item of shuffled(cases, options.seed + repetition - 1)) {
        controller.signal.throwIfAborted();
        const run: Run = {
          framework: item.target.name,
          scenario: item.scenario,
          profile: item.profile,
          repetition,
          raw: {},
        };
        console.log(`[${repetition}/${options.repeats}] ${run.framework} / ${run.scenario} / ${run.profile}`);
        try {
          const server = await startServer(
            item.target,
            { host: '127.0.0.1', port: 0, profile: item.profile, scenario: item.scenario },
            {
              startupTimeoutMs: options.startupTimeoutMs,
              signal: controller.signal,
            },
          );
          try {
            const firstRequestMs = await preflight(server.url, item.scenario, item.profile, controller.signal);
            run.startup = { ...server.startup, firstRequestMs, processFirstResponseMs: server.sinceSpawn() };
            server.assertRunning();
            if (options.mode !== 'startup') {
              if (options.warmup > 0) {
                const warmup = await load(
                  server.url,
                  item.scenario,
                  item.profile,
                  options.warmup,
                  options,
                  controller.signal,
                );
                run.raw.warmup = warmup.stdout + warmup.stderr;
                if (errorCount(parseWorkload(warmup.stdout))) throw new Error('wrk reported errors during warmup');
                server.assertRunning();
              }
              const measured = await load(
                server.url,
                item.scenario,
                item.profile,
                options.duration,
                options,
                controller.signal,
              );
              run.raw.measurement = measured.stdout + measured.stderr;
              run.workload = parseWorkload(measured.stdout);
              server.assertRunning();
              if (errorCount(run.workload)) throw new Error('wrk reported errors during measurement');
            }
          } finally {
            await server.stop();
            run.raw.server = server.logs();
          }
        } catch (error) {
          run.error = error instanceof Error ? error.message : String(error);
          console.error(run.error);
        }
        report.runs.push(run);
        await writeReport(output, report);
        if (controller.signal.aborted) throw new Error('Benchmark interrupted');
      }
    }
    report.complete = true;
  } finally {
    report.finishedAt = new Date().toISOString();
    await writeReport(output, report);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    console.log(`Results: ${output}`);
    if (report.runs.some((run) => run.error)) process.exitCode = 1;
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
