console.time('cold-start');

import { NestFactory } from '@nestjs/core';
import { NestNodeApplication } from '@nestjs/platform-node';

import { AppModule } from './app.module.mjs';

const app = await NestFactory.create<NestNodeApplication>(AppModule, { logger: false });
app.getHttpServer().keepAliveTimeout = 0;
const port = 3000;
await app.listen(port, () => {
  console.timeEnd('cold-start');
  console.log(`Nestjs started on port ${port}`);
});
