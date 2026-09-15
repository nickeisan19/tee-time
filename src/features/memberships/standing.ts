import type { IsoDate } from '../../lib/dates';
import type { MembershipStatus } from './schema';

/** How a membership stands on a given day, combining the staff-set status with the membership dates. */
export type MembershipState = 'none' | 'pending' | 'denied' | 'active' | 'not_started' | 'expired' | 'suspended' | 'cancelled';

export interface MembershipTerms {
	status: MembershipStatus;
	startsOn: IsoDate | null;
	endsOn: IsoDate | null;
}

export function membershipState(membership: MembershipTerms | null, today: IsoDate): MembershipState {
	if (!membership) return 'none';
	if (membership.status !== 'active') return membership.status;
	if (!membership.startsOn || today < membership.startsOn) return 'not_started';
	if (membership.endsOn && today > membership.endsOn) return 'expired';
	return 'active';
}

/** Members book ahead by their tier's window; everyone else uses the club's public window. */
export function bookingWindowDays(state: MembershipState, tierWindowDays: number | null, publicWindowDays: number): number {
	return state === 'active' && tierWindowDays !== null ? tierWindowDays : publicWindowDays;
}
