import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AllowGuest, Roles, TenantRoute } from '../../context/access.decorators';
import { OrderDto, PlaceOrderDto, PlacedOrderDto, WorkflowDto } from './dto/order.dto';
import { OrdersService } from './orders.service';
import { TRACKING_TOKEN_PATTERN, TrackingTokenPipe } from './tracking-token';

/** The tenant's order workflow (ADR 0014). Guests read it for the tracking stepper. */
@ApiTags('workflow')
@TenantRoute()
@Controller(':tenantSlug/workflow')
export class WorkflowController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  @AllowGuest()
  @ApiOperation({
    summary: 'The order workflow stages, by position',
    description: 'Behavior reads only `cancellable`, `deductsInventory` and `position`.',
  })
  @ApiOkResponse({ type: WorkflowDto })
  getOrderWorkflow(): Promise<WorkflowDto> {
    return this.orders.getWorkflow();
  }
}

/** Placing orders (guests and staff) and moving them through the workflow (staff). */
@ApiTags('orders')
@TenantRoute()
@Controller(':tenantSlug/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @AllowGuest()
  @ApiOperation({
    summary: 'Place an order',
    description:
      'Starts at the first stage. A guest order returns `trackingToken` once (ADR 0008); a ' +
      'staff caller places a STAFF order. 400 MENU_ITEM_UNAVAILABLE lists `details.menuItemIds`; ' +
      '400 BRANCH_REQUIRED when the caller has no branch.',
  })
  @ApiCreatedResponse({ type: PlacedOrderDto })
  placeOrder(@Body() dto: PlaceOrderDto): Promise<PlacedOrderDto> {
    return this.orders.placeOrder(dto);
  }

  @Post(':id/advance')
  @HttpCode(200)
  @Roles('WORKER', 'MANAGER')
  @ApiOperation({
    summary: 'Move an order to the next stage',
    description:
      'Reaching a `deductsInventory` stage deducts the order from inventory in the same ' +
      'transaction, once. 409: ORDER_AT_LAST_STAGE, ORDER_CANCELED, ORDER_STAGE_CHANGED.',
  })
  @ApiOkResponse({ type: OrderDto })
  advanceOrder(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDto> {
    return this.orders.advanceOrder(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('WORKER', 'MANAGER')
  @ApiOperation({
    summary: 'Cancel an order',
    description:
      'Only while its stage is `cancellable`; no inventory change. 409: ORDER_NOT_CANCELLABLE, ' +
      'ORDER_CANCELED, ORDER_STAGE_CHANGED.',
  })
  @ApiOkResponse({ type: OrderDto })
  cancelOrder(@Param('id', ParseUUIDPipe) id: string): Promise<OrderDto> {
    return this.orders.cancelOrder(id);
  }
}

/** Guest access to their own order by its tracking token (ADR 0008). */
@ApiTags('tracking')
@TenantRoute()
@Controller(':tenantSlug/track')
export class TrackingController {
  constructor(private readonly orders: OrdersService) {}

  @Post(':token/cancel')
  @HttpCode(200)
  @AllowGuest()
  @ApiParam({
    name: 'token',
    schema: { type: 'string', pattern: TRACKING_TOKEN_PATTERN.source },
    description: 'The `trackingToken` returned when placing the order.',
  })
  @ApiOperation({
    summary: 'Cancel my order (guest)',
    description:
      'Only while its stage is `cancellable`. An unknown token is 404 ORDER_NOT_FOUND. 409: ' +
      'ORDER_NOT_CANCELLABLE, ORDER_CANCELED, ORDER_STAGE_CHANGED.',
  })
  @ApiOkResponse({ type: OrderDto })
  cancelTrackedOrder(@Param('token', TrackingTokenPipe) token: string): Promise<OrderDto> {
    return this.orders.cancelTrackedOrder(token);
  }
}
