import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles, TenantRoute } from '../../context/access.decorators';
import {
  CreateStaffMemberDto,
  ListStaffQueryDto,
  StaffMemberDto,
  UpdateStaffMemberDto,
} from './dto/staff.dto';
import { StaffService } from './staff.service';

/** Staff screen (PRD §14.2): ADMIN for the whole tenant, MANAGER for their branch's workers. */
@ApiTags('staff')
@TenantRoute()
@Roles('MANAGER')
@Controller(':tenantSlug/staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  @ApiOperation({
    summary: 'Staff, inactive ones included unless filtered',
    description: 'A MANAGER sees their own branch only. `status=ACTIVE` is the list for pickers.',
  })
  @ApiOkResponse({ type: [StaffMemberDto] })
  listStaff(@Query() query: ListStaffQueryDto): Promise<StaffMemberDto[]> {
    return this.staff.listStaff(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One staff member, active or not' })
  @ApiOkResponse({ type: StaffMemberDto })
  getStaffMember(@Param('id', ParseUUIDPipe) id: string): Promise<StaffMemberDto> {
    return this.staff.getStaffMember(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create a staff member (409 STAFF_EMAIL_TAKEN for a duplicate email)',
    description: 'The password is stored as an argon2id hash; there is no login until Phase 2.',
  })
  @ApiCreatedResponse({ type: StaffMemberDto })
  createStaffMember(@Body() dto: CreateStaffMemberDto): Promise<StaffMemberDto> {
    return this.staff.createStaffMember(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Edit, assign a role, deactivate or reactivate a staff member',
    description:
      'Never deletes. Demo users cannot be deactivated or change role (409 DEMO_USER_PROTECTED); ' +
      'nobody can deactivate themselves (409 CANNOT_DEACTIVATE_SELF).',
  })
  @ApiOkResponse({ type: StaffMemberDto })
  updateStaffMember(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffMemberDto,
  ): Promise<StaffMemberDto> {
    return this.staff.updateStaffMember(id, dto);
  }
}
