import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRoute } from '../../context/access.decorators';
import { CreateReconciliationDto, ReconciliationDto } from './dto/reconciliation.dto';
import { ReconciliationService } from './reconciliation.service';

/** End-of-day reconciliation: managers (and admins) count stock (ARCHITECTURE §3, §5). */
@ApiTags('reconciliations')
@TenantRoute()
@Roles('MANAGER')
@Controller(':tenantSlug/reconciliations')
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  @Post()
  @ApiOperation({
    summary: 'Submit a physical count: flags only the unexplained gap and starts a new snapshot',
    description:
      'Per item: expected = latest count + every ledger row since (logged waste included, so it is ' +
      'never part of the gap); a non-zero gap writes an ADJUSTMENT row so stock equals the count; ' +
      'a new snapshot becomes the base of the next expected stock. All items or none. Errors: ' +
      '404 INVENTORY_ITEM_NOT_FOUND, 400 MIXED_ITEM_NOT_STOCKED, UNIT_DIMENSION_MISMATCH, ' +
      'QUANTITY_TOO_PRECISE, QUANTITY_TOO_LARGE, DUPLICATE_COUNT, BRANCH_REQUIRED.',
  })
  @ApiCreatedResponse({ type: ReconciliationDto })
  createReconciliation(@Body() dto: CreateReconciliationDto): Promise<ReconciliationDto> {
    return this.reconciliation.createReconciliation(dto);
  }
}
