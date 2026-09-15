import type { Club } from './repository';

/** What the API shows about a club. The logo URL carries a version so browsers can cache it forever. */
export interface ClubDetails {
	id: string;
	name: string;
	slug: string;
	timezone: string;
	publicBookingWindowDays: number;
	cancellationCutoffHours: number;
	logoUrl: string | null;
}

export function toClubDetails({ logoUpdatedAt, ...club }: Club): ClubDetails {
	return {
		id: club.id,
		name: club.name,
		slug: club.slug,
		timezone: club.timezone,
		publicBookingWindowDays: club.publicBookingWindowDays,
		cancellationCutoffHours: club.cancellationCutoffHours,
		logoUrl: logoUpdatedAt ? `/api/orgs/${club.slug}/logo?v=${logoUpdatedAt.getTime()}` : null,
	};
}
