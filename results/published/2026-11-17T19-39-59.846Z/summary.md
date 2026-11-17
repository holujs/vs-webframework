# Benchmark results

Started: 2026-11-17T19:27:57.457Z. Complete: true. Node: v26.13.1. Commit: 18a58c429331feec3bcb6941140f46ddf3e75d69. Dirty: false.

## Scenario selection

- `perRoute`: A handler/controller is reused across requests.

| Scenario | Included | Skipped (not implemented) |
| --- | --- | --- |
| perRoute | node, fastify, holu, nestjs-node, nestjs-express, nestjs-fastify, express, hapi, koa | none |

Medians of successful repetitions. p95/p99 are medians of per-run percentiles, not pooled percentiles. Failed runs remain in run.json and are excluded from timing/rate summaries.

| Framework / scenario / profile | OK / failed | Ready ms | First response ms | Req/s | Req/s min–max | p95 ms | p99 ms | Errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| express / perRoute / close | 3 / 0 | 152.33 | 160.12 | 7484 | 7169–7685 | 15.49 | 16.19 | 0 |
| express / perRoute / keep-alive | 3 / 0 | 153.68 | 162.22 | 19955 | 19714–20004 | 5.72 | 6.17 | 0 |
| fastify / perRoute / close | 3 / 0 | 174.43 | 181.60 | 8249 | 8192–8694 | 15.09 | 16.03 | 0 |
| fastify / perRoute / keep-alive | 3 / 0 | 174.47 | 181.62 | 27402 | 26445–27875 | 4.22 | 4.61 | 0 |
| hapi / perRoute / close | 3 / 0 | 199.68 | 211.41 | 6613 | 6528–6774 | 17.24 | 20.54 | 0 |
| hapi / perRoute / keep-alive | 3 / 0 | 200.19 | 212.05 | 16518 | 15734–17087 | 6.96 | 8.15 | 0 |
| holu / perRoute / close | 3 / 0 | 223.54 | 231.69 | 8547 | 8398–9110 | 13.76 | 16.05 | 0 |
| holu / perRoute / keep-alive | 3 / 0 | 219.23 | 227.13 | 26291 | 25110–26975 | 4.48 | 4.68 | 0 |
| koa / perRoute / close | 3 / 0 | 128.79 | 136.40 | 7678 | 7536–7734 | 14.25 | 15.11 | 0 |
| koa / perRoute / keep-alive | 3 / 0 | 132.07 | 139.51 | 20030 | 19681–20473 | 5.78 | 6.24 | 0 |
| nestjs-express / perRoute / close | 3 / 0 | 453.57 | 463.43 | 7061 | 6813–7151 | 16.41 | 18.02 | 0 |
| nestjs-express / perRoute / keep-alive | 3 / 0 | 453.90 | 464.61 | 17037 | 16513–17494 | 6.71 | 7.25 | 0 |
| nestjs-fastify / perRoute / close | 3 / 0 | 570.09 | 578.71 | 7767 | 7204–7856 | 14.84 | 16.97 | 0 |
| nestjs-fastify / perRoute / keep-alive | 3 / 0 | 580.79 | 589.15 | 22240 | 21850–22524 | 5.16 | 5.60 | 0 |
| nestjs-node / perRoute / close | 3 / 0 | 491.67 | 498.90 | 7894 | 7853–7961 | 14.54 | 16.43 | 0 |
| nestjs-node / perRoute / keep-alive | 3 / 0 | 486.45 | 493.70 | 23672 | 22312–24907 | 4.87 | 5.32 | 0 |
| node / perRoute / close | 3 / 0 | 80.16 | 84.98 | 8777 | 8527–8880 | 12.58 | 13.31 | 0 |
| node / perRoute / keep-alive | 3 / 0 | 81.64 | 86.55 | 28151 | 28073–28937 | 4.27 | 4.84 | 0 |

## Installed framework packages

| Package | Version |
| --- | --- |
| @hapi/hapi | 21.4.10 |
| @holu/core | 0.3.0 |
| @holu/rest | 0.3.0 |
| @koa/router | 15.7.0 |
| @nestjs/common | 12.3.2 |
| @nestjs/core | 12.3.2 |
| @nestjs/platform-express | 12.3.2 |
| @nestjs/platform-fastify | 12.3.2 |
| @nestjs/platform-node | 12.3.2 |
| express | 5.3.0 |
| fastify | 5.12.7 |
| koa | 3.2.1 |
