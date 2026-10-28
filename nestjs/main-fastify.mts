console.time('cold-start');

import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from './app.module.mjs';

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), { logger: false });
app.getHttpServer().keepAliveTimeout = 0;
const port = 3000;
await app.listen(port, () => {
  console.timeEnd('cold-start');
  console.log(`Nestjs started on port ${port}`);
});
