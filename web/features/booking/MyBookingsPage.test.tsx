import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Booking } from '../../lib/types';
import { booking, club, fail, mockSignedIn, ok } from '../../test/api';
import { accessibilityViolations, renderApp } from '../../test/render';
import { server } from '../../test/server';

const path = `/c/${club.slug}/bookings`;

// The API lists newest tee time first.
const later = booking({ id: 'later', date: '2026-09-22', time: '09:00' });
const sooner = booking({ id: 'sooner', date: '2026-09-18', time: '07:10', holes: 18 });
const cancelled = booking({ id: 'cancelled', date: '2026-09-19', time: '10:00', status: 'cancelled', cancelledAt: '2026-09-14T12:00:00Z' });
const played = booking({ id: 'played', date: '2026-09-01', time: '08:00', status: 'checked_in' });

function mockBookings(bookings: Booking[]) {
	server.use(http.get(`/api/orgs/${club.slug}/bookings/mine`, () => ok(bookings)));
}

describe('MyBookingsPage', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-09-15T15:00:00Z'));
		mockSignedIn();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('lists upcoming tee times soonest first, then past and cancelled ones', async () => {
		mockBookings([later, cancelled, sooner, played]);
		renderApp(path);

		const upcoming = await screen.findByRole('region', { name: 'Upcoming' });
		const upcomingCards = within(upcoming).getAllByRole('article');
		expect(upcomingCards.map((card) => card.getAttribute('aria-label'))).toEqual([
			'Friday, September 18 at 7:10 AM',
			'Tuesday, September 22 at 9:00 AM',
		]);
		expect(upcomingCards[0]).toHaveTextContent('$55.00');
		expect(upcomingCards[0]).toHaveTextContent('Jamie Golfer, Sam Guest');

		const history = screen.getByRole('region', { name: 'Past & cancelled' });
		const historyCards = within(history).getAllByRole('article');
		expect(historyCards).toHaveLength(2);
		expect(historyCards[0]).toHaveTextContent('Cancelled');
		expect(historyCards[1]).toHaveTextContent('Checked in');
		expect(within(history).queryByRole('button', { name: 'Cancel booking' })).not.toBeInTheDocument();
	});

	it('invites the golfer to book when nothing is coming up', async () => {
		mockBookings([]);
		renderApp(path);

		expect(await screen.findByText('No upcoming tee times.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Book a tee time' })).toHaveAttribute('href', `/c/${club.slug}/book`);
		expect(screen.queryByRole('region', { name: 'Past & cancelled' })).not.toBeInTheDocument();
	});

	it('asks for confirmation, cancels, and moves the booking to history', async () => {
		let bookings: Booking[] = [sooner];
		const cancelRequests: string[] = [];
		server.use(
			http.get(`/api/orgs/${club.slug}/bookings/mine`, () => ok(bookings)),
			http.post(`/api/orgs/${club.slug}/bookings/:bookingId/cancel`, ({ params }) => {
				cancelRequests.push(String(params.bookingId));
				bookings = [{ ...sooner, status: 'cancelled', cancelledAt: '2026-09-15T15:00:00Z' }];
				return ok(bookings[0]);
			}),
		);
		const { user } = renderApp(path);

		await user.click(await screen.findByRole('button', { name: 'Cancel booking' }));
		expect(screen.getByText('Cancel this tee time?')).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Keep it' }));
		expect(cancelRequests).toEqual([]);

		await user.click(screen.getByRole('button', { name: 'Cancel booking' }));
		await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));

		const history = await screen.findByRole('region', { name: 'Past & cancelled' });
		expect(within(history).getByRole('article')).toHaveTextContent('Cancelled');
		expect(cancelRequests).toEqual(['sooner']);
	});

	it('explains the cancellation cutoff when it has passed', async () => {
		mockBookings([sooner]);
		server.use(http.post(`/api/orgs/${club.slug}/bookings/:bookingId/cancel`, () => fail(409, 'CANCELLATION_CLOSED', 'Too late')));
		const { user } = renderApp(path);

		await user.click(await screen.findByRole('button', { name: 'Cancel booking' }));
		await user.click(screen.getByRole('button', { name: 'Yes, cancel' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(
			'Online cancellation closes 24 hours before the tee time. Call the pro shop.',
		);
	});

	it('shows an error when bookings fail to load', async () => {
		server.use(http.get(`/api/orgs/${club.slug}/bookings/mine`, () => fail(500, 'INTERNAL_ERROR', 'Something went wrong')));
		renderApp(path);

		expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load your tee times');
	});

	it('has no detectable accessibility issues', async () => {
		mockBookings([later, cancelled]);
		const { container } = renderApp(path);
		await screen.findByRole('region', { name: 'Upcoming' });

		expect(await accessibilityViolations(container)).toEqual([]);
	});
});
