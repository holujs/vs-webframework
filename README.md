## Install and build

```bash
git clone --depth 1 https://github.com/holujs/vs-webframework.git
cd vs-webframework
npm i
npm run build
```

All applications are built in ESM format and `keepAliveTimeout: 0` is set.

## Cold start

The shorter the cold-start time, the better the frameworks are suited for serverless technology. So, the results of a cold start are as follows:

| framework            | result, ms    |
|----------------------|:-------------:|
| koa v2.15            |  4            |
| express v5.2         |  5            |
| hapi v21.3           |  22           |
| holu v0.3            |  30           |
| fastify v5.12        |  67           |
| nest v12.3 + fastify |  89           |
| nest v12.3 + express |  108          |

For now, this benchmark is run manually, for example:

```bash
node dist/holu/main.mjs
# OR
node koa.mjs
# OR
node dist/nestjs/main-express.mjs
# ...
```

See `package.json` for more examples with start script.

## Run benchmarks

From first terminal:

```bash
npm run holu
```

"Hello, World!" performance comparison for web frameworks:

- `holu`
- `fastify`
- `koa`
- `express`
- `nestjs-express`
- `nestjs-fastify`
- `hapi`

From second terminal:

```bash
wrk -t4 -c20 -d30 -H 'Connection: close' http://localhost:3000/hello
```



![req-per-sec-frameworks1.png](req-per-sec-frameworks4.png)

You can also check the work of Holu and NestJS with controllers that are created "per request". To do this, request for the path `/hello2`, for example:

```bash
wrk -t4 -c20 -d30 -H 'Connection: close' http://localhost:3000/hello2
```
