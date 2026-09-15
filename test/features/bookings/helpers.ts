import { expect } from 'vitest';
import { clubToday } from '../../../src/lib/dates';
import { addDays } from '../../../src/lib/zoned-time';
import type { TestUser } from '../../helpers';
import { createNineOrFail, generateTeeSheet, type Nine, type Route, setRules, type TeeSheet, viewTeeSheet } from '../courses/helpers';
import { type ClubSetup, data } from '../memberships/helpers';

export const CLUB_TIMEZONE = 'America/Chicago';

/** A club-local date `days` from today, so tests stay valid whatever day they run. */
export function daysFromToday(days: number): string {
	return addDays(clubToday(CLUB_TIMEZONE), days);
}

export interface Course {
	front: Nine;
	back: Nine;
	route: Route;
}

/**
 * Two nines (Front turns in 120 minutes, Back in 130) joined by one route, with tee times every
 * 10 minutes from 07:00 to 11:00 generated for the next `days` days.
 */
export async function setUpCourse(setup: ClubSetup, days = 30): Promise<Course> {
	const front = await createNineOrFail(setup, 'Front', 120);
	const back = await createNineOrFail(setup, 'Back', 130);
	const everyDay = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
		dayOfWeek,
		firstTee: '07:00',
		lastTee: '11:00',
		intervalMinutes: 10,
		maxPlayers: 4,
	}));
	for (const nine of [front, back]) expect((await setRules(setup, setup.owner, nine.id, everyDay)).status).toBe(200);
	const routeResponse = await setup.client.request(`/api/orgs/${setup.slug}/routes`, {
		method: 'POST',
		cookie: setup.owner.cookie,
		json: { name: 'Championship', nineIds: [front.id, back.id] },
	});
	expect(routeResponse.status).toBe(201);
	const generated = await generateTeeSheet(setup, setup.owner, { fromDate: daysFromToday(0), toDate: daysFromToday(days) });
	expect(generated.status).toBe(200);
	return { front, back, route: await data<Route>(routeResponse) };
}

export async function teeTimeId(setup: ClubSetup, nine: Nine, date: string, time: string): Promise<string> {
	const sheet = await data<TeeSheet>(await viewTeeSheet(setup, setup.owner, date));
	const match = sheet.nines.find((candidate) => candidate.id === nine.id)?.teeTimes.find((candidate) => candidate.time === time);
	if (!match) throw new Error(`No ${time} tee time on ${nine.name} for ${date}`);
	return match.id;
}

export async function bookedPlayers(setup: ClubSetup, nine: Nine, date: string, time: string): Promise<number> {
	const sheet = await data<TeeSheet>(await viewTeeSheet(setup, setup.owner, date));
	return (
		sheet.nines.find((candidate) => candidate.id === nine.id)?.teeTimes.find((candidate) => candidate.time === time)?.bookedPlayers ?? -1
	);
}

export interface BookingBody {
	holes: 9 | 18;
	teeTimeId: string;
	routeId?: string;
	guests?: { name: string }[];
}

export interface BookingView {
	id: string;
	status: string;
	holes: number;
	playerCount: number;
	route: { id: string; name: string } | null;
	teeTimes: { leg: number; teeTimeId: string; nine: { id: string; name: string }; date: string; time: string; startsAt: string }[];
	players: { position: number; name: string; isBooker: boolean; rateAudience: string; rateCents: number | null }[];
	totalCents: number | null;
	paymentStatus: string;
	bookedBy: { id: string; name: string; email: string };
	cancelledAt: string | null;
}

export async function book({ client, slug }: ClubSetup, golfer: TestUser, body: BookingBody): Promise<Response> {
	return client.request(`/api/orgs/${slug}/bookings`, { method: 'POST', cookie: golfer.cookie, json: body });
}

export async function cancelBooking({ client, slug }: ClubSetup, actor: TestUser, bookingId: string): Promise<Response> {
	return client.request(`/api/orgs/${slug}/bookings/${bookingId}/cancel`, { method: 'POST', cookie: actor.cookie });
}

export async function availability(
	{ client, slug }: ClubSetup,
	golfer: TestUser,
	query: { date: string; holes: number; players: number },
): Promise<Response> {
	const params = new URLSearchParams({ date: query.date, holes: String(query.holes), players: String(query.players) });
	return client.request(`/api/orgs/${slug}/availability?${params}`, { cookie: golfer.cookie });
}

export async function setPublicRates({ client, slug, owner }: ClubSetup, amounts: { nine?: number; eighteen?: number }): Promise<void> {
	for (const dayType of ['weekday', 'weekend']) {
		for (const [holes, amountCents] of [
			[9, amounts.nine],
			[18, amounts.eighteen],
		] as const) {
			if (amountCents === undefined) continue;
			const response = await client.request(`/api/orgs/${slug}/rates`, {
				method: 'PUT',
				cookie: owner.cookie,
				json: { holes, audience: 'public', dayType, amountCents },
			});
			expect(response.status).toBe(200);
		}
	}
}
