import { Body, Controller, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRoute } from '../../context/access.decorators';
import { LogWasteDto, WasteEntryDto } from './dto/waste.dto';
import { WasteService } from './waste.service';

/** The Waste Form: workers, managers and admins log waste (ARCHITECTURE §3). */
@ApiTags('waste')
@TenantRoute()
@Roles('MANAGER', 'WORKER')
@Controller(':tenantSlug/waste')
export class WasteController {
  constructor(private readonly waste: WasteService) {}

  @Post()
  @ApiOperation({
    summary: 'Log waste: stock drops at once and a WASTE row is written to the ledger',
    description:
      'In the caller’s branch, as the caller. Stock may go below zero (`negative: true`, ADR 0006). ' +
      'Errors: 404 INVENTORY_ITEM_NOT_FOUND, 400 MIXED_ITEM_NOT_STOCKED, UNIT_DIMENSION_MISMATCH, ' +
      'QUANTITY_TOO_PRECISE, BRANCH_REQUIRED (an ADMIN with no branch chosen).',
  })
  @ApiCreatedResponse({ type: WasteEntryDto })
  logWaste(@Body() dto: LogWasteDto): Promise<WasteEntryDto> {
    return this.waste.logWaste(dto);
  }
}
