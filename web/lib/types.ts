/** Shapes returned by the API, as the web app uses them. */

export interface SessionUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
}

export interface Session {
	user: SessionUser;
}

export interface ClubDetails {
	id: string;
	name: string;
	slug: string;
	timezone: string;
	publicBookingWindowDays: number;
	cancellationCutoffHours: number;
	logoUrl: string | null;
}

export interface Tier {
	id: string;
	name: string;
	bookingWindowDays: number;
}

export type MembershipState = 'none' | 'pending' | 'denied' | 'active' | 'not_started' | 'expired' | 'suspended' | 'cancelled';

export interface Membership {
	id: string;
	status: string;
	state: MembershipState;
	tier: Tier | null;
	requestedTier: { id: string; name: string } | null;
	memberNumber: string | null;
	startsOn: string | null;
	endsOn: string | null;
}

export interface MyMembership {
	membership: Membership | null;
	state: MembershipState;
	bookingWindowDays: number;
}

export interface TeeTimeSummary {
	teeTimeId: string;
	nine: { id: string; name: string };
	time: string;
	startsAt: string;
	spotsLeft: number;
}

export interface PricePerPlayer {
	booker: number | null;
	guest: number | null;
}

export type NineHoleOption = TeeTimeSummary & { pricePerPlayer: PricePerPlayer };

export interface EighteenHoleOption {
	route: { id: string; name: string };
	start: TeeTimeSummary;
	crossover: TeeTimeSummary;
	spotsLeft: number;
	pricePerPlayer: PricePerPlayer;
}

export type Availability = { holes: 9; options: NineHoleOption[] } | { holes: 18; options: EighteenHoleOption[] };

export interface Booking {
	id: string;
	status: 'confirmed' | 'cancelled' | 'checked_in' | 'no_show';
	holes: number;
	playerCount: number;
	route: { id: string; name: string } | null;
	teeTimes: { leg: number; teeTimeId: string; nine: { id: string; name: string }; date: string; time: string; startsAt: string }[];
	players: { position: number; name: string; isBooker: boolean; rateAudience: string; rateCents: number | null }[];
	totalCents: number | null;
	paymentStatus: string;
	cancelledAt: string | null;
}
