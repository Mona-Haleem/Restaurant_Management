import { StaffController } from './staff.controller';
import type { StaffService } from './staff.service';

// The controller is thin: each route hands its input to one service call (CLAUDE.md).

describe('StaffController', () => {
  const service = {
    listStaff: jest.fn().mockResolvedValue('list'),
    getStaffMember: jest.fn().mockResolvedValue('one'),
    createStaffMember: jest.fn().mockResolvedValue('created'),
    updateStaffMember: jest.fn().mockResolvedValue('updated'),
  };
  const controller = new StaffController(service as unknown as StaffService);

  it('delegates every route', async () => {
    await expect(controller.listStaff({ status: 'ACTIVE' })).resolves.toBe('list');
    await expect(controller.getStaffMember('id')).resolves.toBe('one');
    const dto = { name: 'N', password: 'a-long-password', role: 'WORKER' as const };
    await expect(controller.createStaffMember(dto)).resolves.toBe('created');
    await expect(controller.updateStaffMember('id', { isActive: false })).resolves.toBe('updated');
    expect(service.listStaff).toHaveBeenCalledWith({ status: 'ACTIVE' });
    expect(service.getStaffMember).toHaveBeenCalledWith('id');
    expect(service.createStaffMember).toHaveBeenCalledWith(dto);
    expect(service.updateStaffMember).toHaveBeenCalledWith('id', { isActive: false });
  });
});
