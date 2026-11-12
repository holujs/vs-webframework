import { spawnSync } from 'node:child_process';
import { readOptions, type Options } from './options.mjs';
import { runBenchmark } from './runner.mjs';

// Practical floor for the automatic comparison, not a statistical significance
// threshold. Keep smoke-test durations separate from this publication preset.
export const examplePreset = Object.freeze({ duration: 10, warmup: 5, repeats: 3 });

export function exampleOptions(output: string): Options {
  return readOptions([
    '--frameworks',
    'node,fastify,nestjs-node,holu',
    '--scenarios',
    'perRoute',
    '--profiles',
    'keep-alive,close',
    '--mode',
    'all',
    '--duration',
    String(examplePreset.duration),
    '--warmup',
    String(examplePreset.warmup),
    '--repeats',
    String(examplePreset.repeats),
    '--output',
    output,
  ]);
}

export async function runExampleBenchmark(output: string): Promise<void> {
  // wrk --version exits 1 on some builds; an OS spawn error is the relevant check.
  const wrk = spawnSync('wrk', ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (wrk.error)
    throw new Error('The example benchmark requires wrk. Install it and run results:publish again.', {
      cause: wrk.error,
    });
  const options = exampleOptions(output);
  const cases = options.frameworks.length * options.profiles.length;
  const minutes = Math.ceil((cases * options.repeats * (options.warmup + options.duration)) / 60);
  console.log(
    `No successful results found. Running the example benchmark: ${cases} cases, ${options.repeats} repetitions, ${options.warmup}s warmup + ${options.duration}s measurement (about ${minutes} minutes plus startup).`,
  );
  await runBenchmark(options);
}
