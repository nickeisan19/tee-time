import { screen } from '@testing-library/react';
import { http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { MyMembership } from '../../lib/types';
import { activeMembership, club, fail, goldTier, mockSignedIn, noMembership, ok } from '../../test/api';
import { accessibilityViolations, renderApp } from '../../test/render';
import { server } from '../../test/server';

const path = `/c/${club.slug}/membership`;
const silverTier = { id: 'tier-silver', name: 'Silver', bookingWindowDays: 10 };

function mockMembership(mine: MyMembership) {
	server.use(http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(mine)));
}

function membershipIn(state: MyMembership['state'], startsOn: string | null = null): MyMembership {
	return { ...noMembership, state, membership: { ...activeMembership().membership!, state, status: state, startsOn } };
}

describe('MembershipPage', () => {
	beforeEach(() => {
		mockSignedIn();
		server.use(http.get(`/api/orgs/${club.slug}/membership-tiers`, () => ok([goldTier, silverTier])));
	});

	it('shows an active member their tier, window and member number', async () => {
		mockMembership(activeMembership());
		renderApp(path);

		expect(await screen.findByText('Active member')).toBeInTheDocument();
		expect(screen.getByText('Gold')).toBeInTheDocument();
		expect(screen.getByText('14 days')).toBeInTheDocument();
		expect(screen.getByText('G-104')).toBeInTheDocument();
		expect(screen.queryByRole('form', { name: 'Request membership' })).not.toBeInTheDocument();
	});

	it('sends a membership request with the chosen tier and note, then shows it under review', async () => {
		let mine: MyMembership = noMembership;
		const requests: unknown[] = [];
		server.use(
			http.get(`/api/orgs/${club.slug}/memberships/me`, () => ok(mine)),
			http.post(`/api/orgs/${club.slug}/membership-requests`, async ({ request }) => {
				requests.push(await request.json());
				mine = membershipIn('pending');
				return ok(null, 201);
			}),
		);
		const { user } = renderApp(path);

		await user.click(await screen.findByRole('radio', { name: /Silver/ }));
		await user.type(screen.getByLabelText('Note for staff (optional)'), ' Member at Oak Hill for 5 years ');
		await user.click(screen.getByRole('button', { name: 'Send request' }));

		expect(await screen.findByText('Request under review')).toBeInTheDocument();
		expect(requests).toEqual([{ requestedTierId: 'tier-silver', note: 'Member at Oak Hill for 5 years' }]);
		expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument();
	});

	it('sends a request without a tier or note', async () => {
		mockMembership(noMembership);
		const requests: unknown[] = [];
		server.use(
			http.post(`/api/orgs/${club.slug}/membership-requests`, async ({ request }) => {
				requests.push(await request.json());
				return ok(null, 201);
			}),
		);
		const { user } = renderApp(path);

		await user.click(await screen.findByRole('button', { name: 'Send request' }));

		await expect.poll(() => requests).toEqual([{}]);
	});

	it('explains request limits', async () => {
		mockMembership(noMembership);
		server.use(http.post(`/api/orgs/${club.slug}/membership-requests`, () => fail(429, 'RATE_LIMITED', 'Slow down')));
		const { user } = renderApp(path);

		await user.click(await screen.findByRole('button', { name: 'Send request' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('sent several requests recently');
	});

	it.each([
		['denied', 'Request not approved', true],
		['cancelled', 'Membership ended', true],
		['expired', 'Membership ended', true],
		['suspended', 'Membership on hold', false],
	] as const)('shows the %s state', async (state, heading, canRequest) => {
		mockMembership(membershipIn(state));
		renderApp(path);

		expect(await screen.findByText(heading)).toBeInTheDocument();
		expect(Boolean(screen.queryByRole('button', { name: 'Send request' }))).toBe(canRequest);
	});

	it('tells an approved member when their membership starts', async () => {
		mockMembership(membershipIn('not_started', '2026-10-01'));
		renderApp(path);

		expect(await screen.findByText('Your membership starts Oct 1.')).toBeInTheDocument();
	});

	it('has no detectable accessibility issues on the request form', async () => {
		mockMembership(noMembership);
		const { container } = renderApp(path);
		await screen.findByRole('button', { name: 'Send request' });

		expect(await accessibilityViolations(container)).toEqual([]);
	});
});
