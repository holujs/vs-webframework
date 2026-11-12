import assert from 'node:assert/strict';
import { Agent } from 'node:http';
import { setImmediate } from 'node:timers/promises';
import { profiles, scenarioPath } from '../apps/shared/config.mjs';
import { checkResponse, request } from './http.mjs';
import { startServer } from './process.mjs';
import { targets } from './targets.mjs';

let checked = 0;
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
try {
  for (const target of targets) {
    for (const scenario of target.scenarios) {
      for (const profile of profiles) {
        const server = await startServer(
          target,
          { host: '127.0.0.1', port: 0, profile, scenario },
          { signal: controller.signal },
        );
        const agent = new Agent({ keepAlive: true, maxSockets: 1 });
        try {
          const url = server.url + scenarioPath(scenario);
          checkResponse(await request(url, profile, agent, controller.signal), profile);
          await setImmediate();
          const second = await request(url, profile, agent, controller.signal);
          checkResponse(second, profile);
          assert.equal(second.reusedSocket, profile === 'keep-alive', `${target.name}: socket reuse for ${profile}`);
          const absentPath = scenario === 'perRoute' ? '/hello2' : '/hello';
          assert.equal((await request(server.url + absentPath, profile, agent, controller.signal)).status, 404);
          server.assertRunning();
          checked++;
          console.log(`OK ${target.name} / ${scenario} / ${profile}`);
        } finally {
          agent.destroy();
          await server.stop();
        }
      }
    }
  }
  console.log(`Passed ${checked} server/scenario/profile combinations`);
} finally {
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
