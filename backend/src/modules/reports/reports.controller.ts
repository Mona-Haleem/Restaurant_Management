import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRoute } from '../../context/access.decorators';
import {
  AnomaliesDto,
  DailyReportDto,
  DateRangeQueryDto,
  KpisDto,
  KpisQueryDto,
} from './dto/reports.dto';
import { ReportsService } from './reports.service';

/** Manager dashboard and Reports (PRD): KPIs, daily aggregates, anomalies. Read-only. */
@ApiTags('reports')
@TenantRoute()
@Roles('MANAGER')
@Controller(':tenantSlug/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('kpis')
  @ApiOperation({
    summary: 'Dashboard KPIs for one local day',
    description:
      "Revenue, order count and waste cost for a day in the restaurant's timezone (default " +
      'today), plus the current low-stock count. 400 INVALID_DATE_RANGE for a date that does ' +
      'not exist.',
  })
  @ApiOkResponse({ type: KpisDto })
  getKpis(@Query() query: KpisQueryDto): Promise<KpisDto> {
    return this.reports.getKpis(query);
  }

  @Get('daily')
  @ApiOperation({
    summary: 'Revenue, orders and waste cost per local day, with totals',
    description: '1 to 366 days (400 INVALID_DATE_RANGE otherwise).',
  })
  @ApiOkResponse({ type: DailyReportDto })
  getDailyReport(@Query() query: DateRangeQueryDto): Promise<DailyReportDto> {
    return this.reports.getDailyReport(query);
  }

  @Get('anomalies')
  @ApiOperation({
    summary: 'Deductions that do not match the recipe expectation',
    description:
      'Every order that reached a `deductsInventory` stage in the range, compared with its ' +
      'recipe; each flag carries a readable reason. Orders whose recipe changed after delivery ' +
      'are listed as unchecked (ADR 0026).',
  })
  @ApiOkResponse({ type: AnomaliesDto })
  getAnomalies(@Query() query: DateRangeQueryDto): Promise<AnomaliesDto> {
    return this.reports.getAnomalies(query);
  }
}
