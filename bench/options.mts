import { parseArgs } from 'node:util';
import { parseScenario, profiles, type Profile, type Scenario } from '../apps/shared/config.mjs';
import { findTarget, targets, type Target } from './targets.mjs';
import { coverageLines, scenarioCoverage } from './selection.mjs';

export interface Options {
  frameworks: Target[];
  profiles: Profile[];
  scenarios: Scenario[];
  mode: 'all' | 'startup' | 'throughput';
  duration: number;
  warmup: number;
  repeats: number;
  threads: number;
  connections: number;
  seed: number;
  startupTimeoutMs: number;
  output: string;
  wrk: string;
  help: boolean;
}

export const help = `Usage: npm run bench -- [options]
  --frameworks node,express,...   Default: all registered frameworks
                                 nestjs selects all three NestJS adapters
                                 Choices: ${targets.map((target) => target.name).join(', ')}, nestjs
  --profiles keep-alive,close     Default: both profiles
  --scenarios perRoute,perRequest Default: perRoute
                                 ${coverageLines(scenarioCoverage(targets, ['perRequest'])).join('\n                                 ')}
  --mode all|startup|throughput   Default: all
  --duration 30                  Measurement seconds per repetition
  --warmup 5                     Warmup seconds (0 disables)
  --repeats 5                    Fresh process for each repetition
  --threads 4 --connections 100  wrk load parameters
  --seed 42                      Reproducible shuffled order
  --startup-timeout-ms 15000      Maximum time to server readiness
  --output results/runs/<time>    Output directory for JSON/Markdown/SVG
  --wrk wrk                      wrk executable
  --help                         Show this help`;

function list(value: string): string[] {
  const parts = value.split(',');
  if (parts.some((item) => !item || item.trim() !== item) || new Set(parts).size !== parts.length) {
    throw new Error(`Expected a comma-separated list without duplicates: ${value}`);
  }
  return parts;
}

function selectFrameworks(value: string): Target[] {
  if (value === 'all') return [...targets];
  const selected = list(value).flatMap((name) =>
    name === 'nestjs' ? targets.filter((target) => target.name.startsWith('nestjs-')) : [findTarget(name)],
  );
  return [...new Set(selected)];
}

function integer(name: string, value: string, minimum: number): number {
  if (!/^\d+$/.test(value)) throw new Error(`--${name} must be an integer >= ${minimum}`);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) throw new Error(`--${name} must be an integer >= ${minimum}`);
  return number;
}

export function readOptions(args: string[]): Options {
  const { values } = parseArgs({
    args,
    options: {
      frameworks: { type: 'string', default: 'all' },
      profiles: { type: 'string', default: profiles.join(',') },
      scenarios: { type: 'string', default: 'perRoute' },
      mode: { type: 'string', default: 'all' },
      duration: { type: 'string', default: '30' },
      warmup: { type: 'string', default: '5' },
      repeats: { type: 'string', default: '5' },
      threads: { type: 'string', default: '4' },
      connections: { type: 'string', default: '100' },
      seed: { type: 'string', default: '42' },
      'startup-timeout-ms': { type: 'string', default: '15000' },
      output: { type: 'string', default: `results/runs/${new Date().toISOString().replaceAll(':', '-')}` },
      wrk: { type: 'string', default: 'wrk' },
      help: { type: 'boolean', default: false },
    },
  });
  const selectedProfiles = list(values.profiles);
  const selectedScenarios = list(values.scenarios).map(parseScenario);
  if (selectedProfiles.some((item) => !profiles.includes(item as Profile)))
    throw new Error(`Unknown HTTP profile: ${values.profiles}`);
  if (new Set(selectedScenarios).size !== selectedScenarios.length)
    throw new Error(`Duplicate scenarios: ${values.scenarios}`);
  if (!['all', 'startup', 'throughput'].includes(values.mode)) throw new Error(`Unknown mode: ${values.mode}`);
  const options: Options = {
    frameworks: selectFrameworks(values.frameworks),
    profiles: selectedProfiles as Profile[],
    scenarios: selectedScenarios,
    mode: values.mode as Options['mode'],
    duration: integer('duration', values.duration, 1),
    warmup: integer('warmup', values.warmup, 0),
    repeats: integer('repeats', values.repeats, 1),
    threads: integer('threads', values.threads, 1),
    connections: integer('connections', values.connections, 1),
    seed: integer('seed', values.seed, 0),
    startupTimeoutMs: integer('startup-timeout-ms', values['startup-timeout-ms'], 1),
    output: values.output,
    wrk: values.wrk,
    help: values.help,
  };
  if (options.threads > options.connections) throw new Error('--connections must be >= --threads');
  if (options.seed > 0xffffffff) throw new Error('--seed must fit in an unsigned 32-bit integer');
  if (!options.frameworks.some((target) => options.scenarios.some((scenario) => target.scenarios.includes(scenario)))) {
    throw new Error(
      [
        'No selected framework supports the selected scenarios',
        ...coverageLines(scenarioCoverage(options.frameworks, options.scenarios)),
      ].join('\n'),
    );
  }
  return options;
}

export function shuffled<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = seed >>> 0;
  for (let index = result.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const other = Math.floor((state / 0x100000000) * (index + 1));
    const item = result[index] as T;
    result[index] = result[other] as T;
    result[other] = item;
  }
  return result;
}
