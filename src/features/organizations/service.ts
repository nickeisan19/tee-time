import { isUniqueViolation } from '../../db/errors';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { loadClub, requireStaffRole } from './club-access';
import { canManageStaffRole } from './permissions';
import type { Club, OrganizationRepository, StaffMember } from './repository';
import type { CreateClubInput } from './validation';

interface OrganizationServiceDependencies {
	organizations: OrganizationRepository;
}

export interface OrganizationService {
	createClub(input: CreateClubInput, actorUserId: string): Promise<Club>;
	getClub(slug: string): Promise<Club>;
	listStaff(slug: string, actorUserId: string): Promise<StaffMember[]>;
	removeStaff(slug: string, actorUserId: string, targetUserId: string): Promise<void>;
}

export function createOrganizationService({ organizations }: OrganizationServiceDependencies): OrganizationService {
	return {
		getClub: (slug) => loadClub(organizations, slug),

		async createClub(input, actorUserId) {
			try {
				return await organizations.createWithOwner(input, actorUserId);
			} catch (error) {
				if (isUniqueViolation(error, 'organizations.slug')) throw conflict('SLUG_TAKEN', 'That club address is already taken');
				throw error;
			}
		},

		async listStaff(slug, actorUserId) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			return organizations.listStaff(club.id);
		},

		async removeStaff(slug, actorUserId, targetUserId) {
			const club = await loadClub(organizations, slug);
			const actorRole = await requireStaffRole(organizations, club, actorUserId);

			const targetRole = await organizations.findStaffRole(club.id, targetUserId);
			if (!targetRole) throw notFound('That person is not on staff');
			if (!canManageStaffRole(actorRole, targetRole)) throw forbidden(`You cannot remove someone who is ${targetRole}`);

			const removed = await organizations.removeStaffKeepingAnOwner(club.id, targetUserId);
			if (!removed) throw conflict('LAST_OWNER', 'A club must always have at least one owner');
		},
	};
}
