import { forbidden, notFound } from '../../lib/errors';
import type { Club, OrganizationRepository } from './repository';
import type { StaffRole } from './schema';

export async function loadClub(organizations: OrganizationRepository, slug: string): Promise<Club> {
	const club = await organizations.findBySlug(slug);
	if (!club) throw notFound('Club not found');
	return club;
}

export async function requireStaffRole(organizations: OrganizationRepository, club: Club, userId: string): Promise<StaffRole> {
	const role = await organizations.findStaffRole(club.id, userId);
	if (!role) throw forbidden('You are not on the staff of this club');
	return role;
}
