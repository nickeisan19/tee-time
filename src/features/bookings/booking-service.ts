import type { SessionUser } from '../../app-env';
import { isCheckViolation } from '../../db/errors';
import { clubToday, type IsoDate } from '../../lib/dates';
import type { EmailSender } from '../../lib/email';
import { AppError, conflict, notFound, validationError } from '../../lib/errors';
import type { RateLimiter } from '../../lib/rate-limit';
import { addDays } from '../../lib/zoned-time';
import type { NineRepository } from '../courses/nine-repository';
import type { RouteRepository } from '../courses/route-repository';
import type { MembershipRepository } from '../memberships/membership-repository';
import { bookingWindowDays, membershipState } from '../memberships/standing';
import { loadClub, requireStaffRole } from '../organizations/club-access';
import type { Club, OrganizationRepository } from '../organizations/repository';
import { dayTypeOf, findRate, type RateCard } from '../rates/pricing';
import type { RateRepository } from '../rates/repository';
import {
	type AvailabilityNine,
	type AvailabilityRoute,
	eighteenHoleOptions,
	findCrossover,
	isBookable,
	nineHoleOptions,
	spotsLeft,
} from './availability';
import { BOOKING_RATE_LIMITS } from './rate-limits';
import type { BookableTeeTime, BookingLeg, BookingRepository, BookingView, NewBookingPlayer, PlayerRateAudience } from './repository';
import type { AvailabilityQuery, CreateBookingInput } from './validation';

const MS_PER_HOUR = 3_600_000;

interface BookingServiceDependencies {
	organizations: OrganizationRepository;
	memberships: MembershipRepository;
	nines: NineRepository;
	routes: RouteRepository;
	rates: RateRepository;
	bookings: BookingRepository;
	emailSender: EmailSender;
	rateLimiter?: RateLimiter;
	now?: () => Date;
}

interface TeeTimeSummary {
	teeTimeId: string;
	nine: { id: string; name: string };
	time: string;
	startsAt: Date;
	spotsLeft: number;
}

interface PricePerPlayer {
	booker: number | null;
	guest: number | null;
}

export type AvailabilityResult =
	| { holes: 9; options: (TeeTimeSummary & { pricePerPlayer: PricePerPlayer })[] }
	| {
			holes: 18;
			options: {
				route: { id: string; name: string };
				start: TeeTimeSummary;
				crossover: TeeTimeSummary;
				spotsLeft: number;
				pricePerPlayer: PricePerPlayer;
			}[];
	  };

export interface BookingService {
	availability(slug: string, golfer: SessionUser, query: AvailabilityQuery): Promise<AvailabilityResult>;
	book(slug: string, golfer: SessionUser, input: CreateBookingInput): Promise<BookingView>;
	cancel(slug: string, actor: SessionUser, bookingId: string): Promise<BookingView>;
	mine(slug: string, golfer: SessionUser): Promise<BookingView[]>;
	forDate(slug: string, actorUserId: string, date: IsoDate): Promise<BookingView[]>;
}

/** Who a golfer is at this club today: whether they count as a member, their tier, and how far ahead they may book. */
interface Standing {
	isMember: boolean;
	tierId: string | null;
	windowDays: number;
	today: IsoDate;
}

const teeTimeUnavailable = () => conflict('TEE_TIME_UNAVAILABLE', 'That tee time is full or not available to you');
const outsideBookingWindow = () => new AppError(403, 'OUTSIDE_BOOKING_WINDOW', 'That tee time is outside your booking window');

export function createBookingService({
	organizations,
	memberships,
	nines,
	routes,
	rates,
	bookings,
	emailSender,
	rateLimiter,
	now = () => new Date(),
}: BookingServiceDependencies): BookingService {
	async function standingFor(club: Club, golferId: string): Promise<Standing> {
		const today = clubToday(club.timezone, now());
		const record = await memberships.findRecordForUser(club.id, golferId);
		const state = membershipState(record, today);
		const isMember = state === 'active';
		return {
			isMember,
			tierId: isMember ? (record?.tier?.id ?? null) : null,
			windowDays: bookingWindowDays(state, record?.tier?.bookingWindowDays ?? null, club.publicBookingWindowDays),
			today,
		};
	}

	function withinWindow(teeTime: BookableTeeTime, standing: Standing): boolean {
		return teeTime.startsAt > now().getTime() && teeTime.localDate <= addDays(standing.today, standing.windowDays);
	}

	async function rateCardFor(club: Club): Promise<RateCard> {
		const rows = await rates.list(club.id);
		return rows.map((rate) => ({
			holes: rate.holes,
			audience: rate.audience,
			tierId: rate.tier?.id ?? null,
			dayType: rate.dayType,
			amountCents: rate.amountCents,
		}));
	}

	function audiencesFor(standing: Standing): { booker: PlayerRateAudience; guest: PlayerRateAudience } {
		return standing.isMember ? { booker: 'member', guest: 'member_guest' } : { booker: 'public', guest: 'public' };
	}

	function pricesFor(card: RateCard, standing: Standing, holes: 9 | 18, date: IsoDate): PricePerPlayer {
		const audiences = audiencesFor(standing);
		const key = { holes, tierId: standing.tierId, dayType: dayTypeOf(date) };
		return { booker: findRate(card, { ...key, audience: audiences.booker }), guest: findRate(card, { ...key, audience: audiences.guest }) };
	}

	async function coursesFor(club: Club): Promise<{ nines: AvailabilityNine[]; routes: AvailabilityRoute[] }> {
		const [clubNines, clubRoutes] = await Promise.all([nines.list(club.id), routes.list(club.id)]);
		return {
			nines: clubNines.map((nine) => ({ id: nine.id, name: nine.name, turnMinutes: nine.turnMinutes })),
			routes: clubRoutes.map((route) => ({ id: route.id, name: route.name, nineIds: [route.nines[0].id, route.nines[1].id] as const })),
		};
	}

	return {
		async availability(slug, golfer, { date, holes, players }) {
			const club = await loadClub(organizations, slug);
			const standing = await standingFor(club, golfer.id);
			const inWindow = date >= standing.today && date <= addDays(standing.today, standing.windowDays);
			if (!inWindow) return { holes, options: [] };

			const [teeTimes, courses, card] = await Promise.all([bookings.teeTimesOnDate(club.id, date), coursesFor(club), rateCardFor(club)]);
			const startable = teeTimes.filter((teeTime) => teeTime.startsAt > now().getTime());
			const nineNames = new Map(courses.nines.map((nine) => [nine.id, nine.name]));
			const summarize = (teeTime: BookableTeeTime): TeeTimeSummary => ({
				teeTimeId: teeTime.id,
				nine: { id: teeTime.nineId, name: nineNames.get(teeTime.nineId) ?? '' },
				time: teeTime.localTime,
				startsAt: new Date(teeTime.startsAt),
				spotsLeft: spotsLeft(teeTime),
			});
			const pricePerPlayer = pricesFor(card, standing, holes, date);
			const byId = new Map(teeTimes.map((teeTime) => [teeTime.id, teeTime]));

			if (holes === 9) {
				return {
					holes,
					options: nineHoleOptions(startable, players, standing.isMember).map(({ teeTime }) => ({
						...summarize(byId.get(teeTime.id) ?? (teeTime as BookableTeeTime)),
						pricePerPlayer,
					})),
				};
			}

			const options = eighteenHoleOptions(startable, courses.nines, courses.routes, players, standing.isMember);
			return {
				holes,
				options: options.map(({ route, start, crossover }) => ({
					route: { id: route.id, name: route.name },
					start: summarize(byId.get(start.id) as BookableTeeTime),
					crossover: summarize(byId.get(crossover.id) as BookableTeeTime),
					spotsLeft: Math.min(spotsLeft(start), spotsLeft(crossover)),
					pricePerPlayer,
				})),
			};
		},

		async book(slug, golfer, { holes, teeTimeId, routeId, guests }) {
			const club = await loadClub(organizations, slug);
			const playerCount = 1 + guests.length;
			await rateLimiter?.enforce([
				{ rule: BOOKING_RATE_LIMITS.booker, subject: golfer.id },
				{ rule: BOOKING_RATE_LIMITS.playerSpots, subject: golfer.id, cost: playerCount },
			]);

			const start = await bookings.findTeeTime(club.id, teeTimeId);
			if (!start) throw notFound('Tee time not found');
			const standing = await standingFor(club, golfer.id);
			if (!withinWindow(start, standing)) throw outsideBookingWindow();

			if (!isBookable(start, playerCount, standing.isMember)) throw teeTimeUnavailable();
			const legs: BookingLeg[] = [{ leg: 1, teeTimeId: start.id }];

			if (holes === 18) {
				const route = routeId ? await routes.find(club.id, routeId) : null;
				if (!route) throw notFound('Route not found');
				const routeNineIds = route.nines.map((nine) => nine.id);
				if (!routeNineIds.includes(start.nineId)) throw validationError('routeId: That route does not include this tee time’s nine');

				const { nines: clubNines } = await coursesFor(club);
				const startNine = clubNines.find((nine) => nine.id === start.nineId);
				const crossoverNineId = routeNineIds.find((nineId) => nineId !== start.nineId);
				const sameDay = await bookings.teeTimesOnDate(club.id, start.localDate);
				const crossover =
					startNine && crossoverNineId ? findCrossover(start, startNine, crossoverNineId, sameDay, playerCount, standing.isMember) : null;
				if (!crossover) throw conflict('NO_CROSSOVER', 'There is no room at the turn for that start; try another time');
				legs.push({ leg: 2, teeTimeId: crossover.id });
			}

			const card = await rateCardFor(club);
			const prices = pricesFor(card, standing, holes, start.localDate);
			const audiences = audiencesFor(standing);
			const players: NewBookingPlayer[] = [
				{ position: 1, userId: golfer.id, guestName: null, rateAudience: audiences.booker, rateCents: prices.booker },
				...guests.map((guest, index) => ({
					position: index + 2,
					userId: null,
					guestName: guest.name,
					rateAudience: audiences.guest,
					rateCents: prices.guest,
				})),
			];
			const totalCents = players.every((player) => player.rateCents !== null)
				? players.reduce((sum, player) => sum + (player.rateCents ?? 0), 0)
				: null;

			const bookingId = crypto.randomUUID();
			try {
				await bookings.create({
					id: bookingId,
					orgId: club.id,
					bookedByUserId: golfer.id,
					holes,
					routeId: holes === 18 ? (routeId ?? null) : null,
					startNineId: start.nineId,
					totalCents,
					legs,
					players,
					isMember: standing.isMember,
					now: now(),
				});
			} catch (error) {
				// Someone else took the last spots, or staff blocked a tee time, since we checked.
				if (isCheckViolation(error, 'tee_times_capacity_check')) throw teeTimeUnavailable();
				throw error;
			}

			const view = await bookings.findView(club.id, bookingId);
			if (!view) throw notFound('Booking not found');
			const legsText = view.teeTimes.map((leg) => `${leg.nine.name} ${leg.time}`).join(', then ');
			await emailSender.send({
				to: golfer.email,
				subject: `Your tee time at ${club.name} is confirmed`,
				text: `You're booked for ${holes} holes on ${start.localDate}: ${legsText}, for ${playerCount} player(s). Pay at the pro shop.`,
			});
			return view;
		},

		async cancel(slug, actor, bookingId) {
			const club = await loadClub(organizations, slug);
			const summary = await bookings.findSummary(club.id, bookingId);
			const isStaff = (await organizations.findStaffRole(club.id, actor.id)) !== null;
			// Golfers only see their own bookings; don't reveal that other bookings exist.
			if (!summary || (!isStaff && summary.bookedByUserId !== actor.id)) throw notFound('Booking not found');
			if (summary.status !== 'confirmed') throw conflict('INVALID_STATUS', `A ${summary.status} booking cannot be cancelled`);
			if (!isStaff && now().getTime() > summary.startsAt.getTime() - club.cancellationCutoffHours * MS_PER_HOUR) {
				throw conflict(
					'CANCELLATION_CLOSED',
					`Bookings can be cancelled up to ${club.cancellationCutoffHours} hours before the tee time; call the pro shop`,
				);
			}

			const cancelled = await bookings.cancel(club.id, bookingId, actor.id, now());
			if (!cancelled) throw conflict('INVALID_STATUS', 'This booking was already cancelled');

			const view = await bookings.findView(club.id, bookingId);
			if (!view) throw notFound('Booking not found');
			await emailSender.send({
				to: view.bookedBy.email,
				subject: `Your tee time at ${club.name} was cancelled`,
				text: `Your booking for ${view.teeTimes[0]?.date} at ${view.teeTimes[0]?.time} has been cancelled.`,
			});
			return view;
		},

		async mine(slug, golfer) {
			const club = await loadClub(organizations, slug);
			return bookings.listForBooker(club.id, golfer.id);
		},

		async forDate(slug, actorUserId, date) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			return bookings.listForDate(club.id, date);
		},
	};
}
