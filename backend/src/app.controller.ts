import { Controller, Get } from '@nestjs/common';

export interface ApiInfo {
  name: string;
}

/**
 * Placeholder root route so the app has something to answer in tests.
 * Real health checks (`/v1/health`, `/v1/health/db`) arrive in B503.
 */
@Controller()
export class AppController {
  @Get()
  getInfo(): ApiInfo {
    return { name: 'tablz-api' };
  }
}
