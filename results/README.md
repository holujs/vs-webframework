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

Runs are ignored by Git. To publish an experiment, copy its complete directory to
`results/published/<descriptive-name>/` and commit the JSON together with its generated reports.
Rebuild reports with `npm run report -- results/published/<descriptive-name>`.

Use the same runtime, lockfile, machine, workload, and connection profile when
comparing experiments. The old root-level PNG files are historical results
without the metadata needed to reproduce them.
