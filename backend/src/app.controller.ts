import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

export class ApiInfoDto {
  @ApiProperty({ example: 'tablz-api' })
  name!: string;
}

/**
 * Root route, so the app has something to answer. Health checks live in src/health
 * (`/v1/health`, `/v1/health/db`).
 */
@ApiTags('meta')
@Controller()
export class AppController {
  @Get()
  @ApiOperation({ summary: 'API name' })
  @ApiOkResponse({ type: ApiInfoDto })
  getApiInfo(): ApiInfoDto {
    return { name: 'tablz-api' };
  }
}
