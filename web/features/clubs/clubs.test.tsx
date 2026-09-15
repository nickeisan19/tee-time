import { screen, within } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { activeMembership, club, fail, mockSignedIn, noMembership, ok } from '../../test/api';
import { accessibilityViolations, renderApp } from '../../test/render';
import { server } from '../../test/server';

describe('HomePage', () => {
	beforeEach(() => mockSignedIn(null));

	it('takes the golfer to the club they enter', async () => {
		const { user, router } = renderApp('/');

		await user.type(screen.getByLabelText('Club address'), ' Pine-Valley ');
		await user.click(screen.getByRole('button', { name: 'Go' }));

		expect(router.state.location.pathname).toBe('/c/pine-valley');
		expect(await screen.findByRole('heading', { name: 'Pine Valley' })).toBeInTheDocument();
	});

	it('rejects addresses that are not club slugs', async () => {
		const { user, router } = renderApp('/');

		await user.type(screen.getByLabelText('Club address'), '../admin');
		await user.click(screen.getByRole('button', { name: 'Go' }));

		expect(screen.getByLabelText('Club address')).toHaveAccessibleDescription(/club address from your invite/);
		expect(router.state.location.pathname).toBe('/');
	});

	it('has no detectable accessibility issues', async () => {
		const { container } = renderApp('/');

		expect(await accessibilityViolations(container)).toEqual([]);
	});
});

describe('club pages', () => {
	it('shows the club name, booking policy and a sign-in link to signed-out visitors', async () => {
		mockSignedIn(null);
		renderApp(`/c/${club.slug}`);

		expect(await screen.findByRole('heading', { name: 'Pine Valley' })).toBeInTheDocument();
		const details = screen.getByRole('region', { name: 'Booking details' });
		expect(details).toHaveTextContent('7 days');
		expect(details).toHaveTextContent('24 hours');
		expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', `/sign-in?next=${encodeURIComponent(`/c/${club.slug}`)}`);
		expect(within(screen.getByRole('main')).getByRole('link', { name: 'Membership' })).toBeInTheDocument();
	});

	it('shows the club logo in the header when it has one', async () => {
		mockSignedIn(null, { ...club, logoUrl: '/api/orgs/pine-valley/logo?v=1' });
		renderApp(`/c/${club.slug}`);

		const home = await screen.findByRole('link', { name: 'Pine Valley home' });
		expect(within(home).getByRole('img', { name: 'Pine Valley' })).toHaveAttribute('src', '/api/orgs/pine-valley/logo?v=1');
	});

	it('welcomes members with their own booking window', async () => {
		mockSignedIn();
		server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(activeMembership())));
		renderApp(`/c/${club.slug}`);

		expect(await screen.findByText('Welcome back, member')).toBeInTheDocument();
		expect(screen.getByRole('region', { name: 'Booking details' })).toHaveTextContent('14 days');
		expect(screen.getByRole('link', { name: 'Jamie Golfer' })).toHaveAttribute('href', '/account');
		expect(within(screen.getByRole('main')).queryByRole('link', { name: 'Membership' })).not.toBeInTheDocument();
	});

	it('shows the club navigation on every club page', async () => {
		mockSignedIn();
		server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(noMembership)));
		renderApp(`/c/${club.slug}`);

		const tabs = await screen.findByRole('navigation', { name: 'Club tabs' });
		expect(
			within(tabs)
				.getAllByRole('link')
				.map((link) => link.getAttribute('href')),
		).toEqual([`/c/${club.slug}/book`, `/c/${club.slug}/bookings`, `/c/${club.slug}/membership`, '/account']);
	});

	it('says when a club does not exist', async () => {
		mockSignedIn(null);
		server.use(http.get('/api/orgs/nowhere', () => fail(404, 'NOT_FOUND', 'Club not found')));
		renderApp('/c/nowhere');

		expect(await screen.findByRole('alert')).toHaveTextContent('Club not found');
	});

	it('says when a club fails to load', async () => {
		mockSignedIn(null);
		server.use(http.get(`/api/orgs/${club.slug}`, () => fail(500, 'INTERNAL_ERROR', 'Boom')));
		renderApp(`/c/${club.slug}`);

		expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load this club');
	});

	it('has no detectable accessibility issues', async () => {
		mockSignedIn();
		server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(noMembership)));
		const { container } = renderApp(`/c/${club.slug}`);
		await screen.findByRole('heading', { name: 'Pine Valley' });

		expect(await accessibilityViolations(container)).toEqual([]);
	});
});

describe('unknown pages', () => {
	it('shows the 404 page', async () => {
		mockSignedIn(null);
		renderApp('/somewhere/else');

		expect(await screen.findByRole('heading', { name: 'Out of bounds' })).toBeInTheDocument();
	});
});
