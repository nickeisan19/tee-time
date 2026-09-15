/** A calendar date as `YYYY-MM-DD`. ISO dates compare correctly as strings. */
export type IsoDate = string;

/** Today's calendar date in the given IANA timezone (clubs decide dates in their local time). */
export function clubToday(timezone: string, now: Date = new Date()): IsoDate {
	// en-CA formats dates as YYYY-MM-DD.
	return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
