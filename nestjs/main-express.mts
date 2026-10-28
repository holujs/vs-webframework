console.time('cold-start');

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module.mjs';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: false });
app.getHttpAdapter().getInstance().set('etag', false).set('x-powered-by', false);
app.getHttpServer().keepAliveTimeout = 0;
const port = 3000;
await app.listen(port, () => {
  console.timeEnd('cold-start');
  console.log(`Nestjs started on port ${port}`);
});
