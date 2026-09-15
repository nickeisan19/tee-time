import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	activeMembership,
	booking,
	club,
	eighteenHoleAvailability,
	fail,
	mockSignedIn,
	nineHoleAvailability,
	noMembership,
	ok,
} from '../../test/api';
import { accessibilityViolations, renderApp } from '../../test/render';
import { server } from '../../test/server';
import type { Booking } from '../../lib/types';

const TODAY = '2026-09-15';

interface AvailabilityCall {
	date: string | null;
	holes: string | null;
	players: string | null;
}

function mockAvailability(calls: AvailabilityCall[] = []) {
	server.use(
		http.get(`/api/orgs/${club.slug}/availability`, ({ request }) => {
			const params = new URL(request.url).searchParams;
			calls.push({ date: params.get('date'), holes: params.get('holes'), players: params.get('players') });
			const date = params.get('date') ?? TODAY;
			return ok(params.get('holes') === '9' ? nineHoleAvailability(date) : eighteenHoleAvailability(date));
		}),
	);
	return calls;
}

describe('BookPage', () => {
	beforeEach(() => {
		// Only Date is faked so MSW and user-event timers keep running. 10:00 in Chicago.
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-15T15:00:00Z'));
		mockSignedIn();
		server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(noMembership)));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('sends signed-out golfers to sign in and back to the same search', async () => {
		mockSignedIn(null);
		const { router } = renderApp(`/c/${club.slug}/book?holes=9`);

		expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/sign-in');
		expect(router.state.location.search).toBe(`?next=${encodeURIComponent(`/c/${club.slug}/book?holes=9`)}`);
	});

	it('shows 18-hole tee times for one player today by default, with the crossover and price', async () => {
		const calls = mockAvailability();
		renderApp(`/c/${club.slug}/book`);

		const list = await screen.findByRole('list', { name: 'Available tee times' });
		const option = within(list).getByRole('button', { name: /7:30/ });
		expect(option).toHaveTextContent('Front · turn 9:20 AM Back');
		expect(option).toHaveTextContent('$60.00');
		expect(calls).toEqual([{ date: TODAY, holes: '18', players: '1' }]);
	});

	it('offers dates up to the public booking window for non-members', async () => {
		mockAvailability();
		renderApp(`/c/${club.slug}/book`);

		await screen.findByRole('list', { name: 'Available tee times' });
		const dates = within(screen.getByRole('group', { name: 'Date' })).getAllByRole('button');
		expect(dates).toHaveLength(club.publicBookingWindowDays + 1);
		expect(dates[0]).toHaveAttribute('aria-pressed', 'true');
	});

	it('offers the longer tier window to members', async () => {
		server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(activeMembership())));
		mockAvailability();
		renderApp(`/c/${club.slug}/book`);

		await screen.findByRole('list', { name: 'Available tee times' });
		expect(within(screen.getByRole('group', { name: 'Date' })).getAllByRole('button')).toHaveLength(15);
	});

	it('keeps the search in the URL as the golfer changes date, holes and players', async () => {
		const calls = mockAvailability();
		const { user, router } = renderApp(`/c/${club.slug}/book`);
		await screen.findByRole('list', { name: 'Available tee times' });

		await user.click(screen.getByRole('button', { name: '9' }));
		await user.click(screen.getByRole('button', { name: 'More players' }));
		await user.click(screen.getByRole('button', { name: 'Thursday, September 17' }));

		await screen.findByRole('heading', { name: /Thursday, September 17/ });
		expect(Object.fromEntries(new URLSearchParams(router.state.location.search))).toEqual({ holes: '9', players: '2', date: '2026-09-17' });
		expect(calls.at(-1)).toEqual({ date: '2026-09-17', holes: '9', players: '2' });
	});

	it('ignores dates outside the booking window and invalid player counts in the URL', async () => {
		const calls = mockAvailability();
		renderApp(`/c/${club.slug}/book?date=2027-01-01&players=9`);

		await screen.findByRole('list', { name: 'Available tee times' });
		expect(calls).toEqual([{ date: TODAY, holes: '18', players: '1' }]);
	});

	it('does not let players go below one or above four', async () => {
		mockAvailability();
		const { user } = renderApp(`/c/${club.slug}/book?players=3`);
		await screen.findByRole('list', { name: 'Available tee times' });

		expect(screen.getByRole('button', { name: 'Fewer players' })).toBeEnabled();
		await user.click(screen.getByRole('button', { name: 'More players' }));
		expect(screen.getByRole('button', { name: 'More players' })).toBeDisabled();
	});

	it('explains when nothing is open', async () => {
		server.use(http.get(`/api/orgs/${club.slug}/availability`, () => ok({ holes: 18, options: [] })));
		renderApp(`/c/${club.slug}/book?players=2`);

		expect(await screen.findByText(/Nothing open for 2 players/)).toBeInTheDocument();
	});

	it('shows an error when tee times fail to load', async () => {
		server.use(http.get(`/api/orgs/${club.slug}/availability`, () => fail(500, 'INTERNAL_ERROR', 'Something went wrong')));
		renderApp(`/c/${club.slug}/book`);

		expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load tee times');
	});

	it('shows “price at pro shop” when a tee time has no published rate', async () => {
		mockAvailability();
		renderApp(`/c/${club.slug}/book?holes=9`);

		const option = await screen.findByRole('button', { name: /8:10/ });
		expect(option).toHaveTextContent('Price at pro shop');
		expect(option).toHaveTextContent('1 spot left');
	});

	it('books a tee time with guest names and shows the confirmation', async () => {
		mockAvailability();
		const requests: unknown[] = [];
		const created: Booking = booking({ date: TODAY, time: '08:00' });
		server.use(
			http.post(`/api/orgs/${club.slug}/bookings`, async ({ request }) => {
				requests.push(await request.json());
				return ok(created, 201);
			}),
			http.get(`/api/orgs/${club.slug}/bookings/mine`, () => ok([created])),
		);
		const { user } = renderApp(`/c/${club.slug}/book?holes=9&players=2`);

		await user.click(await screen.findByRole('button', { name: /8:00/ }));
		const dialog = screen.getByRole('dialog', { name: '8:00 AM' });
		expect(within(dialog).getByText('$55.00')).toBeInTheDocument();
		await user.type(within(dialog).getByLabelText('Guest 1 name'), '  Sam Guest ');
		await user.click(within(dialog).getByRole('button', { name: 'Confirm booking' }));

		expect(await within(dialog).findByRole('heading', { name: 'You’re on the tee' })).toBeInTheDocument();
		expect(requests).toEqual([{ holes: 9, teeTimeId: 'tt-front-0800', guests: [{ name: 'Sam Guest' }] }]);

		await user.click(within(dialog).getByRole('link', { name: 'View my tee times' }));
		expect(await screen.findByRole('heading', { name: 'My tee times' })).toBeInTheDocument();
	});

	it('books an 18-hole route with its route id', async () => {
		mockAvailability();
		const requests: unknown[] = [];
		server.use(
			http.post(`/api/orgs/${club.slug}/bookings`, async ({ request }) => {
				requests.push(await request.json());
				return ok(booking({ holes: 18 }), 201);
			}),
		);
		const { user } = renderApp(`/c/${club.slug}/book`);

		await user.click(await screen.findByRole('button', { name: /7:30/ }));
		await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

		await screen.findByRole('heading', { name: 'You’re on the tee' });
		expect(requests).toEqual([{ holes: 18, teeTimeId: 'tt-front-0730', routeId: 'route-front-back', guests: [] }]);
	});

	it('tells the golfer when someone else took the tee time first', async () => {
		mockAvailability();
		server.use(http.post(`/api/orgs/${club.slug}/bookings`, () => fail(409, 'TEE_TIME_UNAVAILABLE', 'Full')));
		const { user } = renderApp(`/c/${club.slug}/book`);

		await user.click(await screen.findByRole('button', { name: /7:30/ }));
		await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Someone just took that tee time');
	});

	it('explains booking limits', async () => {
		mockAvailability();
		server.use(http.post(`/api/orgs/${club.slug}/bookings`, () => fail(429, 'RATE_LIMITED', 'Slow down')));
		const { user } = renderApp(`/c/${club.slug}/book`);

		await user.click(await screen.findByRole('button', { name: /7:30/ }));
		await user.click(screen.getByRole('button', { name: 'Confirm booking' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('made a lot of bookings recently');
	});

	it('closes the booking panel with Escape and returns focus to the tee time', async () => {
		mockAvailability();
		const { user } = renderApp(`/c/${club.slug}/book`);
		const option = await screen.findByRole('button', { name: /7:30/ });

		await user.click(option);
		expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
		await user.keyboard('{Escape}');

		expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		expect(option).toHaveFocus();
	});

	it('keeps keyboard focus inside the booking panel', async () => {
		mockAvailability();
		const { user } = renderApp(`/c/${club.slug}/book`);
		await user.click(await screen.findByRole('button', { name: /7:30/ }));
		const close = screen.getByRole('button', { name: 'Close' });
		const confirm = screen.getByRole('button', { name: 'Confirm booking' });

		await user.tab({ shift: true });
		expect(confirm).toHaveFocus();
		await user.tab();
		expect(close).toHaveFocus();
	});

	it('does not move focus while the golfer types when the page refreshes in the background', async () => {
		mockAvailability();
		const { user, router } = renderApp(`/c/${club.slug}/book?players=2`);
		await user.click(await screen.findByRole('button', { name: /7:30/ }));
		const guest = screen.getByLabelText('Guest 1 name');

		await user.type(guest, 'Sam');
		// Re-rendering the page (as a refetch would) must leave the open panel alone.
		await router.navigate(`/c/${club.slug}/book?players=2&holes=18`, { replace: true });

		expect(guest).toHaveFocus();
		expect(guest).toHaveValue('Sam');
	});

	it('honours a shared link to a date only a member can book', async () => {
		server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(activeMembership())));
		const calls = mockAvailability();
		renderApp(`/c/${club.slug}/book?date=2026-09-27`);

		await screen.findByRole('list', { name: 'Available tee times' });
		expect(calls).toEqual([{ date: '2026-09-27', holes: '18', players: '1' }]);
	});

	it('has no detectable accessibility issues in the search or the booking panel', async () => {
		mockAvailability();
		const { user, container } = renderApp(`/c/${club.slug}/book?players=2`);
		await user.click(await screen.findByRole('button', { name: /7:30/ }));

		expect(await accessibilityViolations(container)).toEqual([]);
	});
});
