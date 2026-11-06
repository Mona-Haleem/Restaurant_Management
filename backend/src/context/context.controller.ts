import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { AllowGuest, CurrentContext, TenantRoute } from './access.decorators';
import type { RequestContext } from './request-context';

export class TenantSummaryDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'nile-bites' })
  slug!: string;

  @ApiProperty({ example: 'Nile Bites' })
  name!: string;

  @ApiProperty({ description: 'Phase 1: only the demo restaurant accepts changes.' })
  isDemo!: boolean;
}

export class ActorDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Omar Hassan' })
  name!: string;

  @ApiProperty({ enum: ['ADMIN', 'MANAGER', 'WORKER'] })
  role!: 'ADMIN' | 'MANAGER' | 'WORKER';
}

export class RequestContextDto {
  @ApiProperty({ type: TenantSummaryDto })
  tenant!: TenantSummaryDto;

  @ApiProperty({
    type: String,
    format: 'uuid',
    nullable: true,
    description: 'Null when an ADMIN of a multi-branch restaurant has not chosen a branch.',
  })
  branchId!: string | null;

  @ApiProperty({ type: ActorDto, nullable: true, description: 'Null for a guest.' })
  actor!: ActorDto | null;
}

@ApiTags('context')
@TenantRoute()
@Controller(':tenantSlug/context')
export class ContextController {
  @Get()
  @AllowGuest()
  @ApiOperation({
    summary: 'Who the API thinks is calling',
    description:
      'The restaurant, branch and actor resolved for this request (guest when no identity header is sent).',
  })
  @ApiOkResponse({ type: RequestContextDto })
  getRequestContext(@CurrentContext() ctx: RequestContext): RequestContextDto {
    return {
      tenant: {
        id: ctx.tenantId,
        slug: ctx.tenantSlug,
        name: ctx.tenantName,
        isDemo: ctx.isDemoTenant,
      },
      branchId: ctx.branchId,
      actor: ctx.actor,
    };
  }
}
