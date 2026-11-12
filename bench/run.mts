import { help, readOptions } from './options.mjs';
import { runBenchmark } from './runner.mjs';

async function main(): Promise<void> {
  const options = readOptions(process.argv.slice(2));
  if (options.help) console.log(help);
  else await runBenchmark(options);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
