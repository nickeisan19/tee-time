import type { StaffRole } from './schema';

const MANAGEABLE_ROLES: Readonly<Record<StaffRole, readonly StaffRole[]>> = {
	owner: ['owner', 'admin', 'staff'],
	admin: ['staff'],
	staff: [],
};

/** Owners and admins manage club-wide setup (booking windows, membership tiers). */
export function isClubManager(role: StaffRole): boolean {
	return role === 'owner' || role === 'admin';
}

/** Roles that someone with `actorRole` may invite, revoke invites for, or remove. */
export function manageableRoles(actorRole: StaffRole): readonly StaffRole[] {
	return MANAGEABLE_ROLES[actorRole];
}

/** Whether someone with `actorRole` may add or remove a staff member holding `targetRole`. */
export function canManageStaffRole(actorRole: StaffRole, targetRole: StaffRole): boolean {
	return MANAGEABLE_ROLES[actorRole].includes(targetRole);
}
