import { screen } from '@testing-library/react';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { club, fail, mockSignedIn, ok } from '../../test/api';
import { renderApp } from '../../test/render';
import { server } from '../../test/server';

describe('AcceptInvitePage', () => {
	it('needs the link from the email', async () => {
		mockSignedIn(null);
		renderApp('/invites/accept');

		expect(await screen.findByRole('heading', { name: 'Link missing' })).toBeInTheDocument();
	});

	it('asks signed-out invitees to sign in first and brings them back to the invite', async () => {
		mockSignedIn(null);
		const { router } = renderApp('/membership-invites/accept?token=tok');

		expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
		expect(new URLSearchParams(router.state.location.search).get('next')).toBe('/membership-invites/accept?token=tok');
	});

	it('accepts a membership invite and links to the club', async () => {
		mockSignedIn();
		const bodies: unknown[] = [];
		server.use(
			http.post('/api/membership-invites/accept', async ({ request }) => {
				bodies.push(await request.json());
				return ok({ club: { slug: club.slug, name: club.name } });
			}),
		);
		const { user } = renderApp('/membership-invites/accept?token=tok');

		await user.click(await screen.findByRole('button', { name: 'Accept invite' }));

		expect(await screen.findByRole('link', { name: 'Go to Pine Valley' })).toHaveAttribute('href', `/c/${club.slug}`);
		expect(bodies).toEqual([{ token: 'tok' }]);
	});

	it('accepts a staff invite', async () => {
		mockSignedIn();
		server.use(http.post('/api/invites/accept', () => ok({ slug: club.slug, name: club.name, role: 'pro_shop' })));
		const { user } = renderApp('/invites/accept?token=tok');

		expect(await screen.findByRole('heading', { name: 'Join the team' })).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Accept invite' }));

		expect(await screen.findByText('Pine Valley', { selector: 'strong' })).toBeInTheDocument();
	});

	it.each([
		[403, 'FORBIDDEN', 'sent to a different email address'],
		[404, 'NOT_FOUND', 'invalid, expired, or already used'],
		[409, 'ALREADY_MEMBER', 'already have a membership'],
		[409, 'ALREADY_STAFF', 'already on staff'],
	])('explains a %i %s response', async (status, code, message) => {
		mockSignedIn();
		server.use(http.post('/api/membership-invites/accept', () => fail(status, code)));
		const { user } = renderApp('/membership-invites/accept?token=tok');

		await user.click(await screen.findByRole('button', { name: 'Accept invite' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(message);
	});
});
