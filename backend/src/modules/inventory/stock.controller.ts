import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRoute } from '../../context/access.decorators';
import {
  ListStockQueryDto,
  RestockDto,
  RestockResultDto,
  StockItemDetailDto,
  StockItemDto,
} from './dto/stock.dto';
import { StockService } from './stock.service';

/** Inventory screen (PRD §8.3): stock per branch, low-stock alerts, restock. ADMIN and MANAGER. */
@ApiTags('stock')
@TenantRoute()
@Roles('MANAGER')
@Controller(':tenantSlug/stock')
export class StockController {
  constructor(private readonly stock: StockService) {}

  @Get()
  @ApiOperation({
    summary: "Stock of every active item in the caller's branch",
    description:
      '400 BRANCH_REQUIRED when an ADMIN of a multi-branch restaurant sent no x-dev-branch.',
  })
  @ApiOkResponse({ type: [StockItemDto] })
  listStock(@Query() query: ListStockQueryDto): Promise<StockItemDto[]> {
    return this.stock.listStock(query);
  }

  @Get('low')
  @ApiOperation({ summary: 'Items below zero, out of stock or below their threshold, worst first' })
  @ApiOkResponse({ type: [StockItemDto] })
  listLowStock(): Promise<StockItemDto[]> {
    return this.stock.listLowStock();
  }

  @Get(':inventoryItemId')
  @ApiOperation({ summary: 'One item, with how its expected stock is built up' })
  @ApiOkResponse({ type: StockItemDetailDto })
  getStockItem(
    @Param('inventoryItemId', ParseUUIDPipe) inventoryItemId: string,
  ): Promise<StockItemDetailDto> {
    return this.stock.getStockItem(inventoryItemId);
  }

  @Post(':inventoryItemId/restock')
  @ApiOperation({
    summary: 'Restock an item (a PURCHASE ledger row)',
    description: 'Adds to the current stock. A unit cost, if given, updates the moving average.',
  })
  @ApiCreatedResponse({ type: RestockResultDto })
  restockItem(
    @Param('inventoryItemId', ParseUUIDPipe) inventoryItemId: string,
    @Body() dto: RestockDto,
  ): Promise<RestockResultDto> {
    return this.stock.restock(inventoryItemId, dto);
  }
}
