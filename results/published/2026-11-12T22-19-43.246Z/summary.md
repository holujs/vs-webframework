# Benchmark results

Started: 2026-11-12T22:13:34.605Z. Complete: true. Node: v26.13.1. Commit: adcd657f9b68a424cfe0ec7c61102e29995110e7. Dirty: true.

## Scenario selection

- `perRoute`: A handler/controller is reused across requests.

| Scenario | Included | Skipped (not implemented) |
| --- | --- | --- |
| perRoute | node, fastify, nestjs-node, holu | none |

Medians of successful repetitions. p95/p99 are medians of per-run percentiles, not pooled percentiles. Failed runs remain in run.json and are excluded from timing/rate summaries.

| Framework / scenario / profile | OK / failed | Ready ms | First response ms | Req/s | Req/s min–max | p95 ms | p99 ms | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| fastify / perRoute / close | 3 / 0 | 168.33 | 176.27 | 8822 | 8748–8920 | 12.51 | 13.27 | 0 |
| fastify / perRoute / keep-alive | 3 / 0 | 168.94 | 176.22 | 27753 | 27016–28247 | 4.22 | 4.58 | 0 |
| holu / perRoute / close | 3 / 0 | 219.91 | 228.21 | 8692 | 8361–8866 | 13.00 | 15.76 | 0 |
| holu / perRoute / keep-alive | 3 / 0 | 212.22 | 220.35 | 27637 | 27317–29076 | 4.12 | 4.50 | 0 |
| nestjs-node / perRoute / close | 3 / 0 | 485.93 | 493.36 | 8166 | 8108–8253 | 14.05 | 16.20 | 0 |
| nestjs-node / perRoute / keep-alive | 3 / 0 | 489.16 | 497.20 | 23685 | 23655–26118 | 4.71 | 5.15 | 0 |
| node / perRoute / close | 3 / 0 | 78.77 | 84.20 | 8818 | 8816–9189 | 12.27 | 12.75 | 0 |
| node / perRoute / keep-alive | 3 / 0 | 79.07 | 84.28 | 30152 | 29643–33477 | 3.85 | 4.19 | 0 |

## Installed framework packages

| Package | Version |
| --- | --- |
| @holu/core | 0.3.0 |
| @holu/rest | 0.3.0 |
| @nestjs/common | 12.3.2 |
| @nestjs/core | 12.3.2 |
| @nestjs/platform-node | 12.3.2 |
| fastify | 5.12.7 |
