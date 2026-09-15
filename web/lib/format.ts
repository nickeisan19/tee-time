const MONEY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatMoney(cents: number | null): string {
	return cents === null ? 'Price at pro shop' : MONEY.format(cents / 100);
}

function parts(date: string): Date {
	const [year, month, day] = date.split('-').map(Number);
	return new Date(Date.UTC(year, month - 1, day, 12));
}

/** "Mon" */
export function weekdayShort(date: string): string {
	return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(parts(date));
}

/** "Monday, October 5" */
export function longDate(date: string): string {
	return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(parts(date));
}

/** "Oct 5" */
export function shortDate(date: string): string {
	return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parts(date));
}

export function dayOfMonth(date: string): string {
	return String(Number(date.slice(8, 10)));
}

/** "7:30 AM" from a club-local "07:30". */
export function clockLabel(time: string): string {
	const [hours, minutes] = time.split(':').map(Number);
	const suffix = hours >= 12 ? 'PM' : 'AM';
	const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
	return `${twelveHour}:${String(minutes).padStart(2, '0')} ${suffix}`;
}
