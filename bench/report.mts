import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseScenario, profiles, scenarios, type Profile, type Scenario } from '../apps/shared/config.mjs';
import type { Metadata } from './metadata.mjs';
import type { Startup } from './process.mjs';
import type { Workload } from './wrk.mjs';
import { coverageLines, scenarioCoverage, scenarioDescriptions, type ScenarioFramework } from './selection.mjs';

export interface Run {
  framework: string;
  profile: Profile;
  scenario: Scenario | 'hello' | 'request';
  repetition: number;
  startup?: Startup & { firstRequestMs: number; processFirstResponseMs: number };
  workload?: Workload;
  raw: { server?: string; warmup?: string; measurement?: string };
  error?: string;
}

export interface Report {
  schemaVersion: 1;
  startedAt: string;
  finishedAt?: string;
  complete: boolean;
  metadata: Metadata;
  options: Record<string, unknown>;
  skipped: string[];
  runs: Run[];
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? (sorted[middle] as number)
    : ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2;
}

export function summaries(report: Pick<Report, 'runs'>) {
  const groups = new Map<string, Run[]>();
  for (const run of report.runs) {
    const key = `${run.framework} / ${parseScenario(run.scenario)} / ${run.profile}`;
    const group = groups.get(key) ?? [];
    group.push(run);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, runs]) => {
      const { framework, profile } = runs[0] as Run;
      const scenario = parseScenario((runs[0] as Run).scenario);
      const successful = runs.filter((run) => !run.error);
      const workloads = successful.flatMap((run) => (run.workload ? [run.workload] : []));
      const starts = successful.flatMap((run) => (run.startup ? [run.startup] : []));
      const rates = workloads.map((run) => run.requestsPerSecond);
      return {
        name,
        framework,
        scenario,
        profile,
        samples: successful.length,
        failed: runs.length - successful.length,
        processReadyMs: median(starts.map((run) => run.processReadyMs)),
        processFirstResponseMs: median(starts.map((run) => run.processFirstResponseMs)),
        requestsPerSecond: rates.length ? median(rates) : null,
        minRequestsPerSecond: rates.length ? Math.min(...rates) : null,
        maxRequestsPerSecond: rates.length ? Math.max(...rates) : null,
        latencyP95Ms: workloads.length ? median(workloads.map((run) => run.latencyP95Ms)) : null,
        latencyP99Ms: workloads.length ? median(workloads.map((run) => run.latencyP99Ms)) : null,
        errors: runs.reduce(
          (total, run) => total + Object.values(run.workload?.errors ?? {}).reduce((sum, count) => sum + count, 0),
          0,
        ),
      };
    });
}

function format(value: number | null, digits = 2): string {
  return value === null ? '—' : value.toFixed(digits);
}

function reportCoverage(options: Report['options'] | undefined) {
  if (!Array.isArray(options?.frameworks) || !Array.isArray(options.scenarios)) return [];
  return scenarioCoverage(options.frameworks as ScenarioFramework[], options.scenarios as string[]);
}

export function markdown(report: Report): string {
  const coverage = reportCoverage(report.options);
  const selection = coverage.length
    ? [
        '## Scenario selection',
        '',
        ...coverage.map(({ scenario }) => `- \`${scenario}\`: ${scenarioDescriptions[scenario]}`),
        '',
        '| Scenario | Included | Skipped (not implemented) |',
        '| --- | --- | --- |',
        ...coverage.map(
          ({ scenario, included, skipped }) =>
            `| ${scenario} | ${included.join(', ') || 'none'} | ${skipped.join(', ') || 'none'} |`,
        ),
        '',
      ]
    : [];
  const lines = [
    '# Benchmark results',
    '',
    `Started: ${report.startedAt}. Complete: ${report.complete}. Node: ${report.metadata.node}. Commit: ${report.metadata.commit}. Dirty: ${report.metadata.dirty}.`,
    '',
    ...selection,
    'Medians of successful repetitions. p95/p99 are medians of per-run percentiles, not pooled percentiles. Failed runs remain in run.json and are excluded from timing/rate summaries.',
    '',
    '| Framework / scenario / profile | OK / failed | Ready ms | First response ms | Req/s | Req/s min–max | p95 ms | p99 ms | Errors |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const row of summaries(report)) {
    lines.push(
      `| ${row.name} | ${row.samples} / ${row.failed} | ${row.samples ? format(row.processReadyMs) : '—'} | ${row.samples ? format(row.processFirstResponseMs) : '—'} | ${format(row.requestsPerSecond, 0)} | ${format(row.minRequestsPerSecond, 0)}–${format(row.maxRequestsPerSecond, 0)} | ${format(row.latencyP95Ms)} | ${format(row.latencyP99Ms)} | ${row.errors} |`,
    );
  }
  lines.push('', '## Installed framework packages', '', '| Package | Version |', '| --- | --- |');
  const selected = report.options.frameworks as { packages: string[] }[];
  for (const name of [...new Set(selected.flatMap((target) => target.packages))].sort()) {
    lines.push(`| ${name} | ${report.metadata.dependencyTree[`node_modules/${name}`] ?? 'unknown'} |`);
  }
  if (report.runs.some((run) => run.error)) {
    lines.push('', '## Failed runs', '');
    for (const run of report.runs.filter((run) => run.error)) {
      lines.push(
        `- ${run.framework} / ${parseScenario(run.scenario)} / ${run.profile} #${run.repetition}: ${run.error?.split('\n')[0]}`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function percentageDrop(current: number, reference: number): string {
  const drop = format(((reference - current) / reference) * 100, 1);
  return `${drop === '0.0' ? '' : '−'}${drop}%`;
}

interface ChartReport {
  runs: Run[];
  metadata?: Pick<Metadata, 'node' | 'dependencyTree'>;
  options?: Report['options'];
  startedAt?: string;
  complete?: boolean;
}

function majorMinor(version: string | undefined): string | undefined {
  return version?.match(/^v?(\d+\.\d+)(?:\.|$|-|\+)/)?.[1];
}

function frameworkLabels(framework: string, report: ChartReport) {
  if (!report.metadata) return { name: framework, version: '', full: framework, adapter: '' };
  const selections = report.options?.frameworks as { name: string; packages: string[] }[] | undefined;
  const packages = selections?.find((target) => target.name === framework)?.packages ?? [];
  const primary = packages.includes('@nestjs/core') ? '@nestjs/core' : packages[0];
  const version = majorMinor(
    framework === 'node' ? report.metadata.node : report.metadata.dependencyTree[`node_modules/${primary}`],
  );
  if (!version) return { name: framework, version: 'unknown', full: `${framework} (version unknown)`, adapter: '' };
  const adapters = packages
    .filter((name) => name !== primary && (name === 'express' || name === 'fastify'))
    .flatMap((name) => {
      const adapterVersion = majorMinor(report.metadata?.dependencyTree[`node_modules/${name}`]);
      return adapterVersion ? [`${name} ${adapterVersion}`] : [];
    });
  return {
    name: framework,
    version,
    full: `${framework} ${version}${adapters.length ? ` (${adapters.join(', ')})` : ''}`,
    adapter: adapters.length ? `${framework}: ${adapters.join(', ')}` : '',
  };
}

function chartDetails(report: ChartReport): string[] {
  const options = report.options ?? {};
  const option = (label: string, key: string, unit = ''): string[] =>
    options[key] === undefined ? [] : [`${label}: ${String(options[key])}${unit}`];
  return [
    [
      ...(report.metadata ? [`Node.js ${report.metadata.node}`] : []),
      ...option('Mode', 'mode'),
      ...option('Repeats', 'repeats'),
      ...option('Seed', 'seed'),
    ].join(' · '),
    options.mode === 'startup'
      ? ''
      : [
          ...option('Measurement', 'duration', ' s'),
          ...option('Warmup', 'warmup', ' s'),
          ...option('wrk threads', 'threads'),
          ...option('Connections', 'connections'),
        ].join(' · '),
    [
      ...option('Startup timeout', 'startupTimeoutMs', ' ms'),
      ...(report.startedAt ? [`Started: ${report.startedAt}`] : []),
      ...(report.complete === undefined ? [] : [`Status: ${report.complete ? 'complete' : 'partial'}`]),
    ].join(' · '),
    ...coverageLines(reportCoverage(report.options)),
  ].filter(Boolean);
}

const profileLabels: Readonly<Record<Profile, string>> = {
  'keep-alive': 'keep-alive (connection reused)',
  close: 'close (new connection per request)',
};

function wrapChartLine(line: string): string[] {
  const lines: string[] = [];
  for (const word of line.split(' ')) {
    const last = lines.length - 1;
    if (last < 0 || `${lines[last]} ${word}`.length > 86) lines.push(word);
    else lines[last] += ` ${word}`;
  }
  return lines;
}

function chartData(report: ChartReport) {
  const successful = summaries(report).filter((row) => row.samples > 0);
  const throughput = successful.some((row) => row.requestsPerSecond !== null);
  const rows = successful.filter((row) => !throughput || row.requestsPerSecond !== null);
  const value = (row: (typeof rows)[number]) => (throughput ? (row.requestsPerSecond ?? 0) : row.processReadyMs);
  const groups = scenarios.flatMap((scenario) =>
    profiles.map((profile) => ({
      scenario,
      profile,
      name: `${scenario} / ${profileLabels[profile]}`,
      rows: rows
        .filter((row) => row.scenario === scenario && row.profile === profile)
        .sort((a, b) => (throughput ? value(b) - value(a) : value(a) - value(b)) || a.name.localeCompare(b.name)),
    })),
  );
  return { throughput, groups: groups.filter((group) => group.rows.length > 0) };
}

function chartPanel(report: ChartReport, group: ReturnType<typeof chartData>['groups'][number], throughput: boolean) {
  const value = (row: (typeof group.rows)[number]) => (throughput ? (row.requestsPerSecond ?? 0) : row.processReadyMs);
  const plot = { left: 52, right: 588, bottom: 332, height: 240 };
  const maximum = Math.max(...group.rows.map(value)) || 1;
  const power = 10 ** Math.floor(Math.log10(maximum / 4));
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * power >= maximum / 4) ?? 10) * power;
  const intervals = Math.ceil(maximum / step);
  const ceiling = intervals * step;
  const slot = (plot.right - plot.left) / group.rows.length;
  const barWidth = Math.min(64, slot * 0.66);
  const labels = group.rows.map((row) => {
    const label = frameworkLabels(row.framework, report);
    const nameLines = slot < 80 ? label.name.split(/(?<=-)/) : [label.name];
    return { ...label, nameLines };
  });
  const nameY = plot.bottom + 18;
  const nameLineHeight = 13;
  const versionY = nameY + Math.max(...labels.map((label) => label.nameLines.length)) * nameLineHeight;
  const tickFormat = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    maximumFractionDigits: Math.max(0, -Math.floor(Math.log10(step))),
  });
  const numberFormat = new Intl.NumberFormat('en-US', {
    useGrouping: false,
    minimumFractionDigits: throughput ? 0 : 2,
    maximumFractionDigits: throughput ? 0 : 2,
  });
  const grid = Array.from({ length: intervals + 1 }, (_, index) => {
    const y = plot.bottom - (index / intervals) * plot.height;
    return `<line x1="${plot.left}" x2="${plot.right}" y1="${y}" y2="${y}" stroke="#dce2e8"/><text x="${plot.left - 8}" y="${y + 4}" text-anchor="end" font-size="12" fill="#526171">${tickFormat.format(index * step)}</text>`;
  }).join('');
  const leaderRate = group.rows[0]?.requestsPerSecond ?? 0;
  const bars = group.rows
    .map((row, index) => {
      const center = plot.left + slot * (index + 0.5);
      const height = Number(((value(row) / ceiling) * plot.height).toFixed(4));
      const top = plot.bottom - height;
      const previousRate = group.rows[index - 1]?.requestsPerSecond ?? 0;
      const comparisons: string[] = [];
      if (throughput && row.requestsPerSecond !== null) {
        if (index === 0) comparisons.push('leader');
        else {
          if (previousRate > 0) comparisons.push(`${percentageDrop(row.requestsPerSecond, previousRate)} vs previous`);
          if (leaderRate > 0) comparisons.push(`${percentageDrop(row.requestsPerSecond, leaderRate)} vs leader`);
        }
      }
      const relative = comparisons.length ? ` (${comparisons.join('; ')})` : '';
      const label = `${format(value(row), throughput ? 0 : 2)}${throughput ? ' req/s' : ''}${relative}`;
      const result = numberFormat.format(value(row));
      const fitsInside = height >= 17 && result.length * 6.2 + 4 <= barWidth;
      const resultY = fitsInside ? top + 13 : top - 5;
      const resultColor = fitsInside ? 'white' : '#526171';
      const framework = labels[index] as (typeof labels)[number];
      const name = framework.nameLines
        .map(
          (line, lineIndex) =>
            `<tspan x="${center}" y="${nameY + lineIndex * nameLineHeight}">${escapeXml(line)}</tspan>`,
        )
        .join('');
      return [
        `<rect class="bar" data-framework="${escapeXml(row.framework)}" data-value="${value(row)}" x="${center - barWidth / 2}" y="${top}" width="${barWidth}" height="${height}" fill="#326fc8"><title>${escapeXml(framework.full)}: ${escapeXml(label)}</title><desc>${escapeXml(label)}</desc></rect>`,
        `<text class="value" x="${center}" y="${resultY}" text-anchor="middle" font-size="11" fill="${resultColor}">${result}</text>`,
        `<text class="framework" text-anchor="middle" font-size="11">${name}</text>`,
        `<text x="${center}" y="${versionY}" text-anchor="middle" font-size="9" fill="#526171">${escapeXml(framework.version)}</text>`,
      ].join('');
    })
    .join('');
  const options = report.options ?? {};
  const footer = [
    [
      ...(report.metadata ? [`Node.js ${report.metadata.node}`] : []),
      ...(options.repeats === undefined ? [] : [`Repeats: ${String(options.repeats)}`]),
      ...(!throughput || options.duration === undefined ? [] : [`Measurement: ${String(options.duration)} s`]),
      ...(report.complete === false ? ['Partial result'] : []),
    ].join(' · '),
    ...labels.map((label) => label.adapter).filter(Boolean),
  ]
    .filter(Boolean)
    .flatMap(wrapChartLine);
  const footerY = versionY + 24;
  const context = footer
    .map(
      (line, index) =>
        `<text x="16" y="${footerY + index * 18}" font-size="12" fill="#526171">${escapeXml(line)}</text>`,
    )
    .join('');
  const caption = throughput ? 'Median requests/s · higher is better' : 'Median process to ready, ms · lower is better';
  return {
    height: footerY + Math.max(1, footer.length) * 18 + 12,
    svg: `<g aria-label="${escapeXml(group.name)}"><text x="16" y="28" font-size="20" font-weight="600">${escapeXml(group.name)}</text><text x="16" y="52" font-size="14" fill="#526171">${caption}</text>${grid}${bars}${context}</g>`,
  };
}

function chartDocument(report: ChartReport, panels: { height: number; svg: string }[]): string {
  let height = 0;
  const content = panels
    .map((panel) => {
      const svg = `<g transform="translate(0 ${height})">${panel.svg}</g>`;
      height += panel.height;
      return svg;
    })
    .join('');
  height = Math.max(100, height);
  const empty = panels.length ? '' : '<text x="16" y="40" font-size="16">No successful measurements yet.</text>';
  // Use GitHub's preview width directly, so labels are never scaled down.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${height}" viewBox="0 0 600 ${height}" role="img" aria-label="Benchmark medians" font-family="Arial, sans-serif" fill="#17212b"><title>Benchmark medians</title><desc>${escapeXml(chartDetails(report).join('\n'))}</desc><rect width="100%" height="100%" fill="white"/>${content}${empty}</svg>\n`;
}

export function charts(report: ChartReport) {
  const { throughput, groups } = chartData(report);
  return groups.map((group) => ({
    filename: `chart-${group.scenario}-${group.profile}.svg`,
    title: group.name,
    svg: chartDocument(report, [chartPanel(report, group, throughput)]),
  }));
}

export function chart(report: ChartReport): string {
  const { throughput, groups } = chartData(report);
  return chartDocument(
    report,
    groups.map((group) => chartPanel(report, group, throughput)),
  );
}

export async function writeReport(directory: string, report: Report): Promise<void> {
  await mkdir(directory, { recursive: true });
  const destination = resolve(directory, 'run.json');
  await writeFile(destination + '.tmp', JSON.stringify(report, null, 2) + '\n');
  await rename(destination + '.tmp', destination);
  await writeFile(resolve(directory, 'summary.md'), markdown(report));
  await writeFile(resolve(directory, 'chart.svg'), chart(report));
  const generated = charts(report);
  for (const item of generated) await writeFile(resolve(directory, item.filename), item.svg);
  for (const scenario of scenarios) {
    for (const profile of profiles) {
      const filename = `chart-${scenario}-${profile}.svg`;
      if (!generated.some((item) => item.filename === filename))
        await rm(resolve(directory, filename), { force: true });
    }
  }
}

export async function readReport(directory: string): Promise<Report> {
  const report = JSON.parse(await readFile(resolve(directory, 'run.json'), 'utf8')) as Report;
  if (report.schemaVersion !== 1 || !Array.isArray(report.runs)) throw new Error('Unsupported benchmark report');
  return report;
}

export async function regenerateReport(directory: string): Promise<void> {
  const report = await readReport(directory);
  await writeReport(directory, report);
}
