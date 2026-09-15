import type { IsoDate } from '../../lib/dates';
import { dayOfWeek } from '../../lib/zoned-time';

export const HOLE_COUNTS = [9, 18] as const;
export type HoleCount = (typeof HOLE_COUNTS)[number];

/** `member_guest` is a member's guest, priced by the member's tier. */
export const RATE_AUDIENCES = ['member', 'member_guest', 'public'] as const;
export type RateAudience = (typeof RATE_AUDIENCES)[number];

export const DAY_TYPES = ['weekday', 'weekend'] as const;
export type DayType = (typeof DAY_TYPES)[number];

export interface RateKey {
	holes: HoleCount;
	audience: RateAudience;
	/** The member's tier for `member` and `member_guest`; null for `public`. */
	tierId: string | null;
	dayType: DayType;
}

export interface RateEntry extends RateKey {
	amountCents: number;
}

export type RateCard = readonly RateEntry[];

const SATURDAY = 6;
const SUNDAY = 0;

export function dayTypeOf(date: IsoDate): DayType {
	const weekday = dayOfWeek(date);
	return weekday === SATURDAY || weekday === SUNDAY ? 'weekend' : 'weekday';
}

/** The price in cents for a round, or null if the club hasn't set one for that combination. */
export function findRate(rates: RateCard, key: RateKey): number | null {
	const rate = rates.find(
		(candidate) =>
			candidate.holes === key.holes &&
			candidate.audience === key.audience &&
			candidate.tierId === key.tierId &&
			candidate.dayType === key.dayType,
	);
	return rate?.amountCents ?? null;
}
