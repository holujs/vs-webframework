import { Agent, get, type IncomingHttpHeaders } from 'node:http';
import { BODY, CONTENT_TYPE, scenarioPath, type Profile, type Scenario } from '../apps/shared/config.mjs';

export interface HttpResult {
  status: number | undefined;
  headers: IncomingHttpHeaders;
  body: string;
  reusedSocket: boolean;
  elapsedMs: number;
}

export async function request(url: string, profile: Profile, agent: Agent, signal?: AbortSignal): Promise<HttpResult> {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const outgoing = get(
      url,
      { agent, signal, headers: { Connection: profile === 'close' ? 'close' : 'keep-alive' } },
      (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk: string) => {
          body += chunk;
        });
        response.on('error', reject);
        response.on('end', () =>
          resolve({
            status: response.statusCode,
            headers: response.headers,
            body,
            reusedSocket: outgoing.reusedSocket,
            elapsedMs: performance.now() - started,
          }),
        );
      },
    );
    outgoing.setTimeout(3000, () => outgoing.destroy(new Error(`HTTP request timed out: ${url}`)));
    outgoing.on('error', reject);
  });
}

export function checkResponse(response: HttpResult, profile: Profile): void {
  if (response.status !== 200 || response.body !== BODY || response.headers['content-type'] !== CONTENT_TYPE) {
    throw new Error(`Response contract failed: ${JSON.stringify(response)}`);
  }
  if (response.headers.connection?.toLowerCase() !== (profile === 'close' ? 'close' : 'keep-alive')) {
    throw new Error(`Unexpected Connection header: ${response.headers.connection}`);
  }
}

export async function preflight(
  url: string,
  scenario: Scenario,
  profile: Profile,
  signal?: AbortSignal,
): Promise<number> {
  const agent = new Agent({ keepAlive: true, maxSockets: 1 });
  try {
    const response = await request(url + scenarioPath(scenario), profile, agent, signal);
    checkResponse(response, profile);
    return response.elapsedMs;
  } finally {
    agent.destroy();
  }
}
