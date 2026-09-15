import { http, HttpResponse, type JsonBodyType } from 'msw';
import type { Availability, Booking, ClubDetails, MyMembership, Session, Tier } from '../lib/types';
import { server } from './server';

export function ok(data: JsonBodyType, status = 200) {
	return HttpResponse.json({ success: true, data, error: null }, { status });
}

export function fail(status: number, code: string, message = 'Request failed') {
	return HttpResponse.json({ success: false, data: null, error: { code, message } }, { status });
}

export const golfer: Session = {
	user: { id: 'user-1', name: 'Jamie Golfer', email: 'jamie@example.com', emailVerified: true },
};

export const club: ClubDetails = {
	id: 'club-1',
	name: 'Pine Valley',
	slug: 'pine-valley',
	timezone: 'America/Chicago',
	publicBookingWindowDays: 7,
	cancellationCutoffHours: 24,
	logoUrl: null,
};

export const goldTier: Tier = { id: 'tier-gold', name: 'Gold', bookingWindowDays: 14 };

export const noMembership: MyMembership = { membership: null, state: 'none', bookingWindowDays: 7 };

export function activeMembership(tier: Tier = goldTier): MyMembership {
	return {
		state: 'active',
		bookingWindowDays: tier.bookingWindowDays,
		membership: {
			id: 'membership-1',
			status: 'active',
			state: 'active',
			tier,
			requestedTier: null,
			memberNumber: 'G-104',
			startsOn: '2026-01-01',
			endsOn: null,
		},
	};
}

function teeTime(id: string, nine: string, date: string, time: string) {
	return { teeTimeId: id, nine: { id: `nine-${nine}`, name: nine }, time, startsAt: `${date}T${time}:00-05:00`, spotsLeft: 4 };
}

export function nineHoleAvailability(date: string): Availability {
	return {
		holes: 9,
		options: [
			{ ...teeTime('tt-front-0800', 'Front', date, '08:00'), pricePerPlayer: { booker: 2500, guest: 3000 } },
			{ ...teeTime('tt-back-0810', 'Back', date, '08:10'), spotsLeft: 1, pricePerPlayer: { booker: null, guest: null } },
		],
	};
}

export function eighteenHoleAvailability(date: string): Availability {
	return {
		holes: 18,
		options: [
			{
				route: { id: 'route-front-back', name: 'Front / Back' },
				start: teeTime('tt-front-0730', 'Front', date, '07:30'),
				crossover: teeTime('tt-back-0920', 'Back', date, '09:20'),
				spotsLeft: 4,
				pricePerPlayer: { booker: 6000, guest: 7500 },
			},
		],
	};
}

export function booking(overrides: Partial<Booking> & { date?: string; time?: string } = {}): Booking {
	const { date = '2026-09-20', time = '08:00', ...rest } = overrides;
	return {
		id: 'booking-1',
		status: 'confirmed',
		holes: 9,
		playerCount: 2,
		route: null,
		teeTimes: [
			{ leg: 1, teeTimeId: 'tt-front-0800', nine: { id: 'nine-front', name: 'Front' }, date, time, startsAt: `${date}T${time}:00-05:00` },
		],
		players: [
			{ position: 1, name: 'Jamie Golfer', isBooker: true, rateAudience: 'public', rateCents: 2500 },
			{ position: 2, name: 'Sam Guest', isBooker: false, rateAudience: 'guest', rateCents: 3000 },
		],
		totalCents: 5500,
		paymentStatus: 'unpaid',
		cancelledAt: null,
		...rest,
	};
}

/** Registers the handlers most pages need: the session, auth options, and the club. */
export function mockSignedIn(session: Session | null = golfer, clubDetails: ClubDetails = club) {
	server.use(
		http.get('/api/auth/get-session', () => HttpResponse.json(session)),
		http.get('/api/auth-options', () => ok({ google: false })),
		http.get(`/api/orgs/${clubDetails.slug}`, () => ok(clubDetails)),
	);
}
