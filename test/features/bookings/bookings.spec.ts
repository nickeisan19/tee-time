import { describe, expect, it } from 'vitest';
import { BOOKING_RATE_LIMITS } from '../../../src/features/bookings/rate-limits';
import { createVerifiedUser } from '../../helpers';
import { updateTeeTimes } from '../courses/helpers';
import { createMember, createTierOrFail, data, errorCode, setUpClub } from '../memberships/helpers';
import {
	availability,
	book,
	type BookingView,
	bookedPlayers,
	cancelBooking,
	daysFromToday,
	setPublicRates,
	setUpCourse,
	teeTimeId,
} from './helpers';

const IN_TWO_DAYS = daysFromToday(2);

async function setUpBookableClub() {
	const setup = await setUpClub();
	const course = await setUpCourse(setup);
	const golfer = await createVerifiedUser(setup.client, 'Jack');
	return { setup, course, golfer };
}

describe('booking 9 holes', () => {
	it('books a tee time for a golfer and their guests at public rates', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		await setPublicRates(setup, { nine: 3500 });
		const id = await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:00');

		const response = await book(setup, golfer, { holes: 9, teeTimeId: id, guests: [{ name: 'Arnie' }, { name: 'Gary' }] });

		expect(response.status).toBe(201);
		const booking = await data<BookingView>(response);
		expect(booking).toMatchObject({
			status: 'confirmed',
			holes: 9,
			playerCount: 3,
			route: null,
			paymentStatus: 'unpaid',
			totalCents: 10500,
			bookedBy: { id: golfer.userId, name: 'Jack' },
			teeTimes: [{ leg: 1, teeTimeId: id, nine: { name: 'Front' }, date: IN_TWO_DAYS, time: '08:00' }],
			players: [
				{ position: 1, name: 'Jack', isBooker: true, rateAudience: 'public', rateCents: 3500 },
				{ position: 2, name: 'Arnie', isBooker: false, rateAudience: 'public', rateCents: 3500 },
				{ position: 3, name: 'Gary', isBooker: false, rateAudience: 'public', rateCents: 3500 },
			],
		});
		expect(await bookedPlayers(setup, course.front, IN_TWO_DAYS, '08:00')).toBe(3);
		expect(setup.client.outbox.findLast((message) => message.to === golfer.email)?.subject).toMatch(/confirmed/i);
	});

	it('prices an active member at their tier’s member rate and their guests at the tier’s guest rate', async () => {
		const { setup, course } = await setUpBookableClub();
		const gold = await createTierOrFail(setup, 'Gold', 14);
		for (const dayType of ['weekday', 'weekend']) {
			for (const [audience, amountCents] of [
				['member', 0],
				['member_guest', 4000],
			] as const) {
				await setup.client.request(`/api/orgs/${setup.slug}/rates`, {
					method: 'PUT',
					cookie: setup.owner.cookie,
					json: { holes: 9, audience, tierId: gold.id, dayType, amountCents },
				});
			}
		}
		const { golfer: member } = await createMember(setup, gold);

		const response = await book(setup, member, {
			holes: 9,
			teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:00'),
			guests: [{ name: 'Guest' }],
		});

		const booking = await data<BookingView>(response);
		expect(booking.players.map((player) => [player.rateAudience, player.rateCents])).toEqual([
			['member', 0],
			['member_guest', 4000],
		]);
		expect(booking.totalCents).toBe(4000);
	});

	it('leaves prices empty when the club has not set a rate', async () => {
		const { setup, course, golfer } = await setUpBookableClub();

		const booking = await data<BookingView>(
			await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:00') }),
		);

		expect(booking.totalCents).toBeNull();
		expect(booking.players[0].rateCents).toBeNull();
	});
});

describe('booking 18 holes', () => {
	it('reserves the start tee time and the crossover on the route’s other nine', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		await setPublicRates(setup, { eighteen: 6500 });

		const response = await book(setup, golfer, {
			holes: 18,
			teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00'),
			routeId: course.route.id,
			guests: [{ name: 'Arnie' }],
		});

		expect(response.status).toBe(201);
		const booking = await data<BookingView>(response);
		// Front's 120-minute turn puts the crossover at 09:00 on Back.
		expect(booking.teeTimes.map((leg) => [leg.leg, leg.nine.name, leg.time])).toEqual([
			[1, 'Front', '07:00'],
			[2, 'Back', '09:00'],
		]);
		expect(booking).toMatchObject({ route: { id: course.route.id, name: 'Championship' }, totalCents: 13000 });
		expect(await bookedPlayers(setup, course.front, IN_TWO_DAYS, '07:00')).toBe(2);
		expect(await bookedPlayers(setup, course.back, IN_TWO_DAYS, '09:00')).toBe(2);
	});

	it('supports a split tee: starting on the back nine crosses over to the front', async () => {
		const { setup, course, golfer } = await setUpBookableClub();

		const booking = await data<BookingView>(
			await book(setup, golfer, {
				holes: 18,
				teeTimeId: await teeTimeId(setup, course.back, IN_TWO_DAYS, '07:00'),
				routeId: course.route.id,
			}),
		);

		// Back's 130-minute turn puts the crossover at 09:10 on Front.
		expect(booking.teeTimes.map((leg) => [leg.nine.name, leg.time])).toEqual([
			['Back', '07:00'],
			['Front', '09:10'],
		]);
	});

	it('moves to the next crossover when the first one is full', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const other = await createVerifiedUser(setup.client, 'Other');
		await book(setup, other, {
			holes: 9,
			teeTimeId: await teeTimeId(setup, course.back, IN_TWO_DAYS, '09:00'),
			guests: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
		});

		const booking = await data<BookingView>(
			await book(setup, golfer, {
				holes: 18,
				teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00'),
				routeId: course.route.id,
			}),
		);

		expect(booking.teeTimes[1].time).toBe('09:10');
	});

	it('refuses when no crossover has room', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		await updateTeeTimes(setup, setup.owner, {
			date: IN_TWO_DAYS,
			fromTime: '09:00',
			toTime: '11:00',
			nineIds: [course.back.id],
			status: 'blocked',
		});

		const response = await book(setup, golfer, {
			holes: 18,
			teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00'),
			routeId: course.route.id,
		});

		expect(response.status).toBe(409);
		expect(await errorCode(response)).toBe('NO_CROSSOVER');
		expect(await bookedPlayers(setup, course.front, IN_TWO_DAYS, '07:00')).toBe(0);
	});

	it('requires a route that includes the starting nine, from the same club', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const otherClub = await setUpClub('Other Club');
		const otherCourse = await setUpCourse(otherClub, 3);
		const start = await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00');

		expect((await book(setup, golfer, { holes: 18, teeTimeId: start })).status).toBe(400);
		expect((await book(setup, golfer, { holes: 18, teeTimeId: start, routeId: otherCourse.route.id })).status).toBe(404);
	});
});

describe('booking rules', () => {
	it('never overfills a tee time when two golfers race for the last spot', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const id = await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:00');
		await book(setup, golfer, { holes: 9, teeTimeId: id, guests: [{ name: 'A' }, { name: 'B' }] });
		const racerOne = await createVerifiedUser(setup.client, 'Racer One');
		const racerTwo = await createVerifiedUser(setup.client, 'Racer Two');

		const results = await Promise.all([
			book(setup, racerOne, { holes: 9, teeTimeId: id }),
			book(setup, racerTwo, { holes: 9, teeTimeId: id }),
			book(setup, golfer, { holes: 9, teeTimeId: id }),
		]);

		expect(results.map((response) => response.status).sort()).toEqual([201, 409, 409]);
		expect(await bookedPlayers(setup, course.front, IN_TWO_DAYS, '08:00')).toBe(4);
	});

	it('leaves both tee times untouched when an 18-hole booking fails on its crossover', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const start = await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00');
		const crossover = await teeTimeId(setup, course.back, IN_TWO_DAYS, '09:00');
		// Leave the 09:00 crossover with a single spot, and block the later ones.
		await book(setup, golfer, { holes: 9, teeTimeId: crossover, guests: [{ name: 'A' }, { name: 'B' }] });
		await updateTeeTimes(setup, setup.owner, {
			date: IN_TWO_DAYS,
			fromTime: '09:10',
			toTime: '11:00',
			nineIds: [course.back.id],
			status: 'blocked',
		});
		const foursome = await createVerifiedUser(setup.client, 'Foursome');

		const response = await book(setup, foursome, { holes: 18, teeTimeId: start, routeId: course.route.id, guests: [{ name: 'X' }] });

		expect(response.status).toBe(409);
		expect(await bookedPlayers(setup, course.front, IN_TWO_DAYS, '07:00')).toBe(0);
		expect(await bookedPlayers(setup, course.back, IN_TWO_DAYS, '09:00')).toBe(3);
	});

	it('refuses blocked tee times and more players than the tee time holds', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		await updateTeeTimes(setup, setup.owner, { date: IN_TWO_DAYS, fromTime: '08:00', toTime: '08:00', status: 'blocked' });

		const blocked = await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:00') });
		const tooMany = await book(setup, golfer, {
			holes: 9,
			teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:10'),
			guests: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
		});

		expect(blocked.status).toBe(409);
		expect(await errorCode(blocked)).toBe('TEE_TIME_UNAVAILABLE');
		expect(tooMany.status).toBe(409);
	});

	it('only lets active members book members-only tee times', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const tier = await createTierOrFail(setup, 'Full', 14);
		const { golfer: member } = await createMember(setup, tier);
		await updateTeeTimes(setup, setup.owner, { date: IN_TWO_DAYS, fromTime: '08:00', toTime: '08:00', membersOnly: true });
		const id = await teeTimeId(setup, course.front, IN_TWO_DAYS, '08:00');

		expect((await book(setup, golfer, { holes: 9, teeTimeId: id })).status).toBe(409);
		expect((await book(setup, member, { holes: 9, teeTimeId: id })).status).toBe(201);
	});

	it('enforces booking windows: public golfers book less far ahead than members', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const tier = await createTierOrFail(setup, 'Full', 14);
		const { golfer: member } = await createMember(setup, tier);
		const inTenDays = await teeTimeId(setup, course.front, daysFromToday(10), '08:00');

		const publicAttempt = await book(setup, golfer, { holes: 9, teeTimeId: inTenDays });

		expect(publicAttempt.status).toBe(403);
		expect(await errorCode(publicAttempt)).toBe('OUTSIDE_BOOKING_WINDOW');
		expect((await book(setup, member, { holes: 9, teeTimeId: inTenDays })).status).toBe(201);
	});

	it('refuses tee times that have already started', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const yesterday = daysFromToday(-1);
		await setup.client.request(`/api/orgs/${setup.slug}/tee-sheet/generate`, {
			method: 'POST',
			cookie: setup.owner.cookie,
			json: { fromDate: yesterday, toDate: yesterday },
		});

		const response = await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, yesterday, '08:00') });

		expect(response.status).toBe(403);
		expect(await errorCode(response)).toBe('OUTSIDE_BOOKING_WINDOW');
	});

	it('requires a signed-in golfer and a tee time from the same club', async () => {
		const { setup, golfer } = await setUpBookableClub();
		const otherClub = await setUpClub('Other Club');
		const otherCourse = await setUpCourse(otherClub, 3);
		const foreignTeeTime = await teeTimeId(otherClub, otherCourse.front, IN_TWO_DAYS, '08:00');

		expect(
			(await setup.client.request(`/api/orgs/${setup.slug}/bookings`, { method: 'POST', json: { holes: 9, teeTimeId: foreignTeeTime } }))
				.status,
		).toBe(401);
		expect((await book(setup, golfer, { holes: 9, teeTimeId: foreignTeeTime })).status).toBe(404);
	});

	it('limits how many bookings one golfer can make per hour', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const times = ['07:00', '07:10', '07:20', '07:30', '07:40', '07:50', '08:00', '08:10', '08:20', '08:30', '08:40', '08:50'];

		for (let index = 0; index < BOOKING_RATE_LIMITS.booker.limit; index++) {
			expect(
				(await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, times[index]) })).status,
			).toBe(201);
		}
		const overLimit = await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.back, IN_TWO_DAYS, '07:00') });

		expect(overLimit.status).toBe(429);
	});
});

describe('player spot limit', () => {
	it('limits how many player spots one golfer can reserve per hour, counting guests', { timeout: 120_000 }, async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const threeGuests = [{ name: 'A' }, { name: 'B' }, { name: 'C' }];
		const foursomes = BOOKING_RATE_LIMITS.playerSpots.limit / 4;
		const times = ['07:00', '07:10', '07:20', '07:30', '07:40', '07:50', '08:00'];

		for (let index = 0; index < foursomes; index++) {
			const response = await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, times[index]), guests: threeGuests });
			expect(response.status).toBe(201);
		}
		const overLimit = await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.back, IN_TWO_DAYS, '07:00') });

		expect(overLimit.status).toBe(429);
	});
});

describe('availability', () => {
	it('lists 9-hole tee times with room for the group, within the golfer’s window', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		await setPublicRates(setup, { nine: 3500 });
		await book(setup, golfer, {
			holes: 9,
			teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00'),
			guests: [{ name: 'A' }, { name: 'B' }],
		});
		await updateTeeTimes(setup, setup.owner, {
			date: IN_TWO_DAYS,
			fromTime: '07:10',
			toTime: '07:10',
			nineIds: [course.front.id],
			status: 'blocked',
		});

		const response = await availability(setup, golfer, { date: IN_TWO_DAYS, holes: 9, players: 2 });

		const { options } = await data<{
			options: {
				teeTimeId: string;
				nine: { name: string };
				time: string;
				spotsLeft: number;
				pricePerPlayer: { booker: number | null; guest: number | null };
			}[];
		}>(response);
		const frontTimes = options.filter((option) => option.nine.name === 'Front').map((option) => option.time);
		expect(frontTimes[0]).toBe('07:20');
		expect(options[0]).toMatchObject({ spotsLeft: 4, pricePerPlayer: { booker: 3500, guest: 3500 } });
		expect(
			(await data<{ options: unknown[] }>(await availability(setup, golfer, { date: daysFromToday(10), holes: 9, players: 1 }))).options,
		).toEqual([]);
	});

	it('lists 18-hole starts with their crossover tee times', async () => {
		const { setup, course, golfer } = await setUpBookableClub();

		const response = await availability(setup, golfer, { date: IN_TWO_DAYS, holes: 18, players: 4 });

		const { options } = await data<{
			options: {
				route: { id: string };
				start: { nine: { name: string }; time: string };
				crossover: { nine: { name: string }; time: string };
			}[];
		}>(response);
		expect(options[0]).toMatchObject({
			route: { id: course.route.id },
			start: { nine: { name: 'Front' }, time: '07:00' },
			crossover: { nine: { name: 'Back' }, time: '09:00' },
		});
		// Tee times run until 11:00, so the last Front start with a crossover is 09:00 (crossover 11:00).
		expect(options.filter((option) => option.start.nine.name === 'Front').at(-1)?.start.time).toBe('09:00');
	});

	it('rejects invalid queries and requires sign-in', async () => {
		const { setup, golfer } = await setUpBookableClub();

		expect((await availability(setup, golfer, { date: IN_TWO_DAYS, holes: 27, players: 1 })).status).toBe(400);
		expect((await availability(setup, golfer, { date: IN_TWO_DAYS, holes: 9, players: 0 })).status).toBe(400);
		expect((await setup.client.request(`/api/orgs/${setup.slug}/availability?date=${IN_TWO_DAYS}&holes=9&players=1`)).status).toBe(401);
	});
});

describe('cancelling', () => {
	it('lets a golfer cancel before the cutoff and frees both tee times', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const inThreeDays = daysFromToday(3);
		const booking = await data<BookingView>(
			await book(setup, golfer, {
				holes: 18,
				teeTimeId: await teeTimeId(setup, course.front, inThreeDays, '07:00'),
				routeId: course.route.id,
				guests: [{ name: 'A' }],
			}),
		);

		const response = await cancelBooking(setup, golfer, booking.id);

		expect(response.status).toBe(200);
		expect(await data<BookingView>(response)).toMatchObject({ status: 'cancelled', cancelledAt: expect.any(String) });
		expect(await bookedPlayers(setup, course.front, inThreeDays, '07:00')).toBe(0);
		expect(await bookedPlayers(setup, course.back, inThreeDays, '09:00')).toBe(0);
		const again = await cancelBooking(setup, golfer, booking.id);
		expect(again.status).toBe(409);
		expect(await bookedPlayers(setup, course.front, inThreeDays, '07:00')).toBe(0);
	});

	it('closes golfer cancellations at the club’s cutoff but lets staff cancel', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		await setup.client.request(`/api/orgs/${setup.slug}/settings`, {
			method: 'PATCH',
			cookie: setup.owner.cookie,
			json: { cancellationCutoffHours: 168 },
		});
		const booking = await data<BookingView>(
			await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, daysFromToday(3), '07:00') }),
		);

		const golferAttempt = await cancelBooking(setup, golfer, booking.id);

		expect(golferAttempt.status).toBe(409);
		expect(await errorCode(golferAttempt)).toBe('CANCELLATION_CLOSED');
		expect((await cancelBooking(setup, setup.owner, booking.id)).status).toBe(200);
	});

	it('does not let one golfer cancel another golfer’s booking', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const other = await createVerifiedUser(setup.client, 'Other');
		const booking = await data<BookingView>(
			await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, daysFromToday(3), '07:00') }),
		);

		expect((await cancelBooking(setup, other, booking.id)).status).toBe(404);
	});
});

describe('viewing bookings', () => {
	it('lists a golfer’s bookings with the latest tee time first', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const later = await data<BookingView>(
			await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, daysFromToday(4), '07:00') }),
		);
		const sooner = await data<BookingView>(
			await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00') }),
		);

		const myBookings = await data<BookingView[]>(
			await setup.client.request(`/api/orgs/${setup.slug}/bookings/mine`, { cookie: golfer.cookie }),
		);

		expect(myBookings.map((booking) => booking.id)).toEqual([later.id, sooner.id]);
	});

	it('shows golfers their own bookings and staff every booking on a date', async () => {
		const { setup, course, golfer } = await setUpBookableClub();
		const other = await createVerifiedUser(setup.client, 'Other');
		const mine = await data<BookingView>(
			await book(setup, golfer, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:00') }),
		);
		const theirs = await data<BookingView>(
			await book(setup, other, { holes: 9, teeTimeId: await teeTimeId(setup, course.front, IN_TWO_DAYS, '07:10') }),
		);

		const myBookings = await data<BookingView[]>(
			await setup.client.request(`/api/orgs/${setup.slug}/bookings/mine`, { cookie: golfer.cookie }),
		);
		const staffView = await data<BookingView[]>(
			await setup.client.request(`/api/orgs/${setup.slug}/bookings?date=${IN_TWO_DAYS}`, { cookie: setup.owner.cookie }),
		);

		expect(myBookings.map((booking) => booking.id)).toEqual([mine.id]);
		expect(staffView.map((booking) => booking.id)).toEqual([mine.id, theirs.id]);
		expect((await setup.client.request(`/api/orgs/${setup.slug}/bookings?date=${IN_TWO_DAYS}`, { cookie: golfer.cookie })).status).toBe(
			403,
		);
	});
});
