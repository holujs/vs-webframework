import { parseScenario, type Scenario } from '../apps/shared/config.mjs';

export const scenarioDescriptions: Readonly<Record<Scenario, string>> = {
  perRoute: 'A handler/controller is reused across requests.',
  perRequest: 'A new controller is created for each request.',
};

export interface ScenarioFramework {
  name: string;
  scenarios: readonly string[];
}

export interface ScenarioCoverage {
  scenario: Scenario;
  included: string[];
  skipped: string[];
}

export function scenarioCoverage(
  frameworks: readonly ScenarioFramework[],
  requestedScenarios: readonly string[],
): ScenarioCoverage[] {
  return [...new Set(requestedScenarios.map(parseScenario))].map((scenario) => {
    const included: string[] = [];
    const skipped: string[] = [];
    for (const framework of frameworks) {
      const supported = framework.scenarios.some((name) => parseScenario(name) === scenario);
      (supported ? included : skipped).push(framework.name);
    }
    return { scenario, included, skipped };
  });
}

export function coverageLines(coverage: readonly ScenarioCoverage[]): string[] {
  return coverage.flatMap(({ scenario, included, skipped }) => [
    `[${scenario}] ${scenarioDescriptions[scenario]}`,
    `[${scenario}] Included: ${included.join(', ') || 'none'}`,
    `[${scenario}] Skipped (not implemented): ${skipped.join(', ') || 'none'}`,
  ]);
}
