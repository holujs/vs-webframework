import { controller, restRootModule, route } from '@holu/rest';
import { BODY, readAppConfig } from '../shared/config.mjs';

@controller({ scope: 'route' })
class PerRouteController {
  @route('GET', 'hello')
  hello(): string {
    return BODY;
  }
}

@controller()
class PerRequestController {
  @route('GET', 'hello2')
  hello(): string {
    return BODY;
  }
}

@restRootModule({
  controllers: [readAppConfig().scenario === 'perRoute' ? PerRouteController : PerRequestController],
})
export class AppModule {}
