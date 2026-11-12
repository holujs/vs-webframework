# Benchmark data

The runner writes each experiment into `results/runs/<UTC timestamp>/`:

- `run.json`: environment, installed dependency versions, options, individual samples, raw server/wrk output, and errors.
- `summary.md`: medians, minimum/maximum throughput, per-run latency percentiles, and failure counts.
- `chart.svg`: generated chart with a separate section for each scenario/profile pair, sorted by median throughput (highest first) or startup time (lowest first) within each section.

Charts include recorded framework versions as `major.minor`. Holu uses
`@holu/core`, NestJS uses `@nestjs/core`, and NestJS Express/Fastify labels also
include the underlying Express/Fastify version. Versions come from the experiment's
saved package selection and installed dependency metadata. Full versions remain in
`run.json` and `summary.md`; unavailable versions are marked as unknown.

The header records the full Node.js version, mode, repeat count, seed, startup
timeout, start time, and completion status. Throughput runs also show measurement
and warmup seconds, wrk threads, and connections. Startup-only runs omit those
unused load parameters.

The chart header and the summary's scenario selection table list included and
skipped frameworks for each requested scenario. Only selected frameworks appear
in these lists. Skips mean that the benchmark has no implementation of that
scenario for the selected framework. These lists use the capabilities recorded
in the experiment, including when regenerating historical reports.

The description also explains each selected scenario: `perRoute` reuses a
handler/controller across requests; `perRequest` creates a controller for each
request.

Each section has its own ranking and bar scale. Throughput labels mark the
fastest result in that section as `leader`. Subsequent labels show the drop in
req/s relative to the preceding result and the leader in the same section.
Results from different HTTP profiles or scenarios are never compared.
For example, for results of 100, 90, and 81 req/s, the last label is
`81 req/s (−10.0% vs previous; −19.0% vs leader)`. A 10% drop means 10% fewer
requests per second. Percentages use unrounded medians; comparisons with a zero
reference or unavailable throughput measurements are omitted.

Section headings explain the HTTP profiles: `keep-alive (connection reused)`
and `close (new connection per request)`.

Scenario names are `perRoute` and `perRequest`. Historical `hello`/`request`
samples are displayed under the new names when regenerating charts and summaries;
their original names remain recorded in `run.json`.

Local runs are ignored by Git. Publish the latest successful result with:

```bash
npm run results:publish
# Optional source and publication name:
npm run results:publish -- results/runs/<experiment-directory> <descriptive-name>
npm run results:publish -- --name <descriptive-name>
```

The source and name are optional. The command selects the most recent successful
experiment from local and published data, ordered by measurement time. It generates
a name from that timestamp, or reuses the existing name for identical published
data. Repeating the command, including in a fresh clone, does not repeat a benchmark
when successful data is available.

If no successful experiment exists, it runs the compact example first: Node.js,
Fastify, NestJS (`platform-node`), and Holu in `perRoute`, both HTTP profiles,
5 seconds of warmup and 10 seconds of measurement per repetition, 3 repetitions.
Budget about 6 minutes plus startup. See the root README for the timing rationale
and longer-run guidance.

The command copies the complete experiment into
`results/published/<name>/`, regenerates its summary/chart, and updates
the latest-result block in the root README. Commit the published directory and
the root README together, then push them to GitHub. The command does not perform
Git commits or network uploads. Existing datasets cannot be overwritten with different data.

Only completed, nonempty runs without failed samples or wrk errors are accepted.
The README embeds the chart and links to the report and raw JSON from the newest
successful published experiment, ordered by `finishedAt` with `startedAt` as a
fallback. Publishing an older experiment preserves the newer README selection.

Rebuild reports with `npm run report -- results/published/<descriptive-name>`.
After manual changes to published directories, run `npm run results:latest` to
refresh the README. `npm run check` verifies that the block is current. Generated
published artifacts are excluded from Prettier; regenerate them from `run.json`.

Use the same runtime, lockfile, machine, workload, and connection profile when
comparing experiments. The old root-level PNG files are historical results
without the metadata needed to reproduce them.
