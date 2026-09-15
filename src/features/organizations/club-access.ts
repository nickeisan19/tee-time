import { forbidden, notFound } from '../../lib/errors';
import { isClubManager } from './permissions';
import type { Club, OrganizationRepository } from './repository';
import type { StaffRole } from './schema';

export async function loadClub(organizations: OrganizationRepository, slug: string): Promise<Club> {
	const club = await organizations.findBySlug(slug);
	if (!club) throw notFound('Club not found');
	return club;
}

/** Requires an owner or admin of the club. */
export async function requireClubManager(organizations: OrganizationRepository, club: Club, userId: string): Promise<StaffRole> {
	const role = await requireStaffRole(organizations, club, userId);
	if (!isClubManager(role)) throw forbidden('Only club owners and admins can do that');
	return role;
}

export async function requireStaffRole(organizations: OrganizationRepository, club: Club, userId: string): Promise<StaffRole> {
	const role = await organizations.findStaffRole(club.id, userId);
	if (!role) throw forbidden('You are not on the staff of this club');
	return role;
}
