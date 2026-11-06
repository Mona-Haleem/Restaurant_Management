import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

/** B1001: staff list, creation, roles and deactivation. */
@Module({
  controllers: [StaffController],
  providers: [StaffService],
})
export class StaffModule {}
