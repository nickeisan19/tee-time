import { describe, expect, it } from 'vitest';
import { canManageStaffRole } from '../../../src/features/organizations/permissions';

describe('canManageStaffRole', () => {
	it('lets owners manage every role', () => {
		expect(canManageStaffRole('owner', 'owner')).toBe(true);
		expect(canManageStaffRole('owner', 'admin')).toBe(true);
		expect(canManageStaffRole('owner', 'staff')).toBe(true);
	});

	it('lets admins manage staff but not owners or other admins', () => {
		expect(canManageStaffRole('admin', 'owner')).toBe(false);
		expect(canManageStaffRole('admin', 'admin')).toBe(false);
		expect(canManageStaffRole('admin', 'staff')).toBe(true);
	});

	it('does not let staff manage anyone', () => {
		expect(canManageStaffRole('staff', 'owner')).toBe(false);
		expect(canManageStaffRole('staff', 'admin')).toBe(false);
		expect(canManageStaffRole('staff', 'staff')).toBe(false);
	});
});
