export const BODY = 'Hello, World!';
export const CONTENT_TYPE = 'text/plain; charset=utf-8';
export const profiles = ['keep-alive', 'close'] as const;
export const scenarios = ['perRoute', 'perRequest'] as const;
export type Profile = (typeof profiles)[number];
export type Scenario = (typeof scenarios)[number];

export interface AppConfig {
  host: string;
  port: number;
  profile: Profile;
  scenario: Scenario;
}

export function parseScenario(value: string): Scenario {
  if (value === 'hello') return 'perRoute';
  if (value === 'request') return 'perRequest';
  if (scenarios.includes(value as Scenario)) return value as Scenario;
  throw new Error(`Unknown scenario: ${value}`);
}

export function readAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const profile = env.BENCH_PROFILE ?? 'keep-alive';
  const scenario = parseScenario(env.BENCH_SCENARIO ?? 'perRoute');
  const port = Number(env.PORT ?? '3000');
  const host = env.HOST ?? '127.0.0.1';
  if (!profiles.includes(profile as Profile)) throw new Error(`Unknown HTTP profile: ${profile}`);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);
  if (host !== '127.0.0.1') throw new Error('HOST must be 127.0.0.1 for comparable local benchmarks');
  return { host, port, profile: profile as Profile, scenario };
}

export function scenarioPath(scenario: Scenario): string {
  return scenario === 'perRoute' ? '/hello' : '/hello2';
}
