const MS_PER_MINUTE = 60_000;

/** How far past the turn a crossover tee time may be before the start is no longer offered. */
export const CROSSOVER_WINDOW_MINUTES = 20;

export interface AvailabilityTeeTime {
	id: string;
	nineId: string;
	startsAt: number;
	maxPlayers: number;
	bookedPlayers: number;
	status: 'open' | 'blocked';
	membersOnly: boolean;
}

export interface AvailabilityNine {
	id: string;
	name: string;
	turnMinutes: number;
}

export interface AvailabilityRoute {
	id: string;
	name: string;
	nineIds: readonly [string, string];
}

export interface NineHoleOption {
	teeTime: AvailabilityTeeTime;
}

export interface EighteenHoleOption {
	route: AvailabilityRoute;
	start: AvailabilityTeeTime;
	crossover: AvailabilityTeeTime;
}

export function spotsLeft(teeTime: AvailabilityTeeTime): number {
	return teeTime.maxPlayers - teeTime.bookedPlayers;
}

/** Whether a group of `players` may book this tee time. */
export function isBookable(teeTime: AvailabilityTeeTime, players: number, isMember: boolean): boolean {
	return teeTime.status === 'open' && (!teeTime.membersOnly || isMember) && spotsLeft(teeTime) >= players;
}

/**
 * The tee time an 18-hole group reaches the second nine: the first bookable tee time on the other
 * nine at or after the start plus the starting nine's turn, within CROSSOVER_WINDOW_MINUTES.
 */
export function findCrossover(
	start: AvailabilityTeeTime,
	startNine: AvailabilityNine,
	crossoverNineId: string,
	teeTimes: readonly AvailabilityTeeTime[],
	players: number,
	isMember: boolean,
): AvailabilityTeeTime | null {
	const earliest = start.startsAt + startNine.turnMinutes * MS_PER_MINUTE;
	const latest = earliest + CROSSOVER_WINDOW_MINUTES * MS_PER_MINUTE;
	const candidates = teeTimes
		.filter((teeTime) => teeTime.nineId === crossoverNineId && teeTime.startsAt >= earliest && teeTime.startsAt < latest)
		.sort((first, second) => first.startsAt - second.startsAt);
	return candidates.find((teeTime) => isBookable(teeTime, players, isMember)) ?? null;
}

export function nineHoleOptions(teeTimes: readonly AvailabilityTeeTime[], players: number, isMember: boolean): NineHoleOption[] {
	return teeTimes
		.filter((teeTime) => isBookable(teeTime, players, isMember))
		.sort((first, second) => first.startsAt - second.startsAt)
		.map((teeTime) => ({ teeTime }));
}

/** Every bookable 18-hole start on every route, starting from either nine, ordered by start time. */
export function eighteenHoleOptions(
	teeTimes: readonly AvailabilityTeeTime[],
	nines: readonly AvailabilityNine[],
	routes: readonly AvailabilityRoute[],
	players: number,
	isMember: boolean,
): EighteenHoleOption[] {
	const nineOrder = new Map(nines.map((nine, index) => [nine.id, index]));
	const options: EighteenHoleOption[] = [];

	for (const route of routes) {
		for (const [startNineId, crossoverNineId] of [route.nineIds, [route.nineIds[1], route.nineIds[0]]] as const) {
			const startNine = nines.find((nine) => nine.id === startNineId);
			if (!startNine) continue;
			for (const start of teeTimes) {
				if (start.nineId !== startNineId || !isBookable(start, players, isMember)) continue;
				const crossover = findCrossover(start, startNine, crossoverNineId, teeTimes, players, isMember);
				if (crossover) options.push({ route, start, crossover });
			}
		}
	}

	return options.sort(
		(first, second) =>
			first.start.startsAt - second.start.startsAt ||
			(nineOrder.get(first.start.nineId) ?? 0) - (nineOrder.get(second.start.nineId) ?? 0) ||
			first.route.name.localeCompare(second.route.name),
	);
}
