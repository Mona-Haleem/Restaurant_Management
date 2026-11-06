import { Body, Controller, Get, Inject, Module, Param, Patch, Post } from '@nestjs/common';
import { AppException } from '../src/common/errors/app-exception';
import { AllowGuest, CurrentContext, Roles } from '../src/context/access.decorators';
import type { RequestContext } from '../src/context/request-context';
import { TENANT_DB, type TenantDb } from '../src/prisma/tenant-prisma';

// Test-only routes over the tenant-scoped client, so the isolation suite can aim real HTTP
// reads and writes at another tenant's ids. Never part of the app or openapi.json.

@Controller(':tenantSlug/probe/categories')
class ProbeCategoriesController {
  constructor(@Inject(TENANT_DB) private readonly db: TenantDb) {}

  @Get()
  @AllowGuest()
  async listProbeCategories(): Promise<{ id: string; tenantId: string }[]> {
    return this.db.category.findMany({ select: { id: true, tenantId: true } });
  }

  @Get(':id')
  @AllowGuest()
  async getProbeCategory(@Param('id') id: string): Promise<{ id: string; tenantId: string }> {
    const row = await this.db.category.findUnique({
      where: { id },
      select: { id: true, tenantId: true },
    });
    if (!row) throw new AppException(404, 'NOT_FOUND', 'No such category');
    return row;
  }

  @Patch(':id')
  async renameProbeCategory(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ count: number }> {
    return this.db.category.updateMany({ where: { id }, data: { name: String(body.name) } });
  }

  /** Passes the body straight through, like buggy feature code that trusts client input. */
  @Post()
  async createProbeCategory(
    @Body() body: Record<string, unknown>,
    @CurrentContext() ctx: RequestContext,
  ): Promise<{ tenantId: string }> {
    const tenantId = typeof body.tenantId === 'string' ? body.tenantId : ctx.tenantId;
    const data = { name: String(body.name), tenantId };
    return this.db.category.create({ data, select: { tenantId: true } });
  }
}

@Controller(':tenantSlug/probe/access')
class ProbeAccessController {
  @Get('staff')
  staffProbe(): { ok: true } {
    return { ok: true };
  }

  @Get('managers')
  @Roles('MANAGER')
  managersProbe(): { ok: true } {
    return { ok: true };
  }
}

@Module({ controllers: [ProbeCategoriesController, ProbeAccessController] })
export class TenantProbeModule {}
