import { Controller, Get, Header, Module, Scope } from '@nestjs/common';
import { BODY, CONTENT_TYPE, readAppConfig } from '../shared/config.mjs';

@Controller({ scope: Scope.DEFAULT })
class PerRouteController {
  @Get('/hello')
  @Header('Content-Type', CONTENT_TYPE)
  hello(): string {
    return BODY;
  }
}

@Controller({ scope: Scope.REQUEST })
class PerRequestController {
  @Get('/hello2')
  @Header('Content-Type', CONTENT_TYPE)
  hello(): string {
    return BODY;
  }
}

@Module({ controllers: [readAppConfig().scenario === 'perRoute' ? PerRouteController : PerRequestController] })
export class AppModule {}
