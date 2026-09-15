import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../lib/types';
import { golfer, mockSignedIn, ok } from '../../test/api';
import { accessibilityViolations, renderApp } from '../../test/render';
import { server } from '../../test/server';

function authError(status: number, message = 'Nope') {
	return HttpResponse.json({ code: 'ERROR', message }, { status });
}

describe('SignInPage', () => {
	it('signs in and returns to the page the golfer came from', async () => {
		let session: Session | null = null;
		const bodies: unknown[] = [];
		server.use(
			http.get('/api/auth/get-session', () => HttpResponse.json(session)),
			http.get('/api/auth-options', () => ok({ google: false })),
			http.post('/api/auth/sign-in/email', async ({ request }) => {
				bodies.push(await request.json());
				session = golfer;
				return HttpResponse.json({ user: golfer.user });
			}),
		);
		const { user, router } = renderApp(`/sign-in?next=${encodeURIComponent('/account')}`);

		await user.type(screen.getByLabelText('Email'), 'jamie@example.com');
		await user.type(screen.getByLabelText('Password'), 'correct-horse');
		await user.click(screen.getByRole('button', { name: 'Sign in' }));

		expect(await screen.findByRole('heading', { name: 'Jamie Golfer' })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/account');
		expect(bodies).toEqual([{ email: 'jamie@example.com', password: 'correct-horse' }]);
	});

	it('ignores off-site “next” links', async () => {
		mockSignedIn(null);
		server.use(http.post('/api/auth/sign-in/email', () => HttpResponse.json({ user: golfer.user })));
		const { user, router } = renderApp(`/sign-in?next=${encodeURIComponent('//evil.example')}`);

		await user.type(screen.getByLabelText('Email'), 'jamie@example.com');
		await user.type(screen.getByLabelText('Password'), 'correct-horse');
		await user.click(screen.getByRole('button', { name: 'Sign in' }));

		await expect.poll(() => router.state.location.pathname).toBe('/');
	});

	it.each([
		[401, 'That email and password don’t match.'],
		[403, 'Confirm your email address first.'],
		[429, 'Too many attempts.'],
	])('explains a %i response', async (status, message) => {
		mockSignedIn(null);
		server.use(http.post('/api/auth/sign-in/email', () => authError(status)));
		const { user } = renderApp('/sign-in');

		await user.type(screen.getByLabelText('Email'), 'jamie@example.com');
		await user.type(screen.getByLabelText('Password'), 'wrong-password');
		await user.click(screen.getByRole('button', { name: 'Sign in' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(message);
	});

	it('offers Google only when the platform has it configured', async () => {
		mockSignedIn(null);
		server.use(http.get('/api/auth-options', () => ok({ google: true })));
		renderApp('/sign-in');

		expect(await screen.findByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
	});

	it('shows Google sign-in failures', async () => {
		mockSignedIn(null);
		server.use(
			http.get('/api/auth-options', () => ok({ google: true })),
			http.post('/api/auth/sign-in/social', () => authError(500, 'Google is unavailable')),
		);
		const { user } = renderApp('/sign-in');

		await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Google is unavailable');
	});

	it('hides Google when it is not configured, and has no detectable accessibility issues', async () => {
		mockSignedIn(null);
		const { container } = renderApp('/sign-in');
		await screen.findByRole('heading', { name: 'Sign in' });

		expect(screen.queryByRole('button', { name: 'Continue with Google' })).not.toBeInTheDocument();
		expect(await accessibilityViolations(container)).toEqual([]);
	});
});

describe('SignUpPage', () => {
	beforeEach(() => mockSignedIn(null));

	it('creates the account and asks the golfer to check their email', async () => {
		const bodies: unknown[] = [];
		server.use(
			http.post('/api/auth/sign-up/email', async ({ request }) => {
				bodies.push(await request.json());
				return HttpResponse.json({ user: null });
			}),
		);
		const { user, container } = renderApp('/sign-up');
		expect(await accessibilityViolations(container)).toEqual([]);

		await user.type(screen.getByLabelText('Full name'), ' Jamie Golfer ');
		await user.type(screen.getByLabelText('Email'), 'jamie@example.com');
		await user.type(screen.getByLabelText('Password'), 'correct-horse');
		await user.click(screen.getByRole('button', { name: 'Create account' }));

		expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
		expect(screen.getByText('jamie@example.com')).toBeInTheDocument();
		expect(bodies).toEqual([{ name: 'Jamie Golfer', email: 'jamie@example.com', password: 'correct-horse' }]);
	});

	it('explains sign-up errors', async () => {
		server.use(http.post('/api/auth/sign-up/email', () => authError(429)));
		const { user } = renderApp('/sign-up');

		await user.type(screen.getByLabelText('Full name'), 'Jamie');
		await user.type(screen.getByLabelText('Email'), 'jamie@example.com');
		await user.type(screen.getByLabelText('Password'), 'correct-horse');
		await user.click(screen.getByRole('button', { name: 'Create account' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts.');
	});
});

describe('VerifyEmailPage', () => {
	beforeEach(() => mockSignedIn(null));

	it('needs the link from the email', async () => {
		renderApp('/verify-email');

		expect(await screen.findByRole('heading', { name: 'Link missing' })).toBeInTheDocument();
	});

	it('confirms the email with the account password', async () => {
		const bodies: unknown[] = [];
		server.use(
			http.post('/api/auth/verify-email-with-password', async ({ request }) => {
				bodies.push(await request.json());
				return HttpResponse.json({ status: true });
			}),
		);
		const { user } = renderApp('/verify-email?token=abc.def');

		await user.type(screen.getByLabelText('Password'), 'correct-horse');
		await user.click(screen.getByRole('button', { name: 'Confirm email' }));

		expect(await screen.findByRole('heading', { name: 'Email confirmed' })).toBeInTheDocument();
		expect(bodies).toEqual([{ token: 'abc.def', password: 'correct-horse' }]);
	});

	it.each([
		[401, 'That password doesn’t match this account.'],
		[400, 'This link is invalid or has expired.'],
		[429, 'Too many attempts.'],
	])('explains a %i response', async (status, message) => {
		server.use(http.post('/api/auth/verify-email-with-password', () => authError(status)));
		const { user } = renderApp('/verify-email?token=abc');

		await user.type(screen.getByLabelText('Password'), 'guess');
		await user.click(screen.getByRole('button', { name: 'Confirm email' }));

		expect(await screen.findByRole('alert')).toHaveTextContent(message);
	});
});

describe('ForgotPasswordPage', () => {
	beforeEach(() => mockSignedIn(null));

	it('shows the same confirmation whether or not the account exists', async () => {
		server.use(http.post('/api/auth/request-password-reset', () => HttpResponse.json({ status: true })));
		const { user } = renderApp('/forgot-password');

		await user.type(screen.getByLabelText('Email'), 'nobody@example.com');
		await user.click(screen.getByRole('button', { name: 'Send reset link' }));

		expect(await screen.findByText('If an account uses that address, we sent a link to reset its password.')).toBeInTheDocument();
	});

	it('shows request failures', async () => {
		server.use(http.post('/api/auth/request-password-reset', () => authError(500, 'Email is down')));
		const { user } = renderApp('/forgot-password');

		await user.type(screen.getByLabelText('Email'), 'jamie@example.com');
		await user.click(screen.getByRole('button', { name: 'Send reset link' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('Email is down');
	});
});

describe('ResetPasswordPage', () => {
	beforeEach(() => mockSignedIn(null));

	it('needs the link from the email', async () => {
		renderApp('/reset-password');

		expect(await screen.findByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
	});

	it('requires both passwords to match before calling the server', async () => {
		const { user } = renderApp('/reset-password?token=t1');

		await user.type(screen.getByLabelText('New password'), 'new-password-1');
		await user.type(screen.getByLabelText('Confirm new password'), 'new-password-2');
		await user.click(screen.getByRole('button', { name: 'Update password' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords don’t match.');
	});

	it('sets the new password', async () => {
		const bodies: unknown[] = [];
		server.use(
			http.post('/api/auth/reset-password', async ({ request }) => {
				bodies.push(await request.json());
				return HttpResponse.json({ status: true });
			}),
		);
		const { user } = renderApp('/reset-password?token=t1');

		await user.type(screen.getByLabelText('New password'), 'new-password-1');
		await user.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
		await user.click(screen.getByRole('button', { name: 'Update password' }));

		expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
		expect(bodies).toEqual([{ token: 't1', newPassword: 'new-password-1' }]);
	});

	it('explains an expired link', async () => {
		server.use(http.post('/api/auth/reset-password', () => authError(400)));
		const { user } = renderApp('/reset-password?token=t1');

		await user.type(screen.getByLabelText('New password'), 'new-password-1');
		await user.type(screen.getByLabelText('Confirm new password'), 'new-password-1');
		await user.click(screen.getByRole('button', { name: 'Update password' }));

		expect(await screen.findByRole('alert')).toHaveTextContent('This reset link is invalid or has expired.');
	});
});

describe('AccountPage', () => {
	it('signs out and returns home', async () => {
		let session: Session | null = golfer;
		mockSignedIn();
		server.use(
			http.get('/api/auth/get-session', () => HttpResponse.json(session)),
			http.post('/api/auth/sign-out', () => {
				session = null;
				return HttpResponse.json({ success: true });
			}),
		);
		const { user, router } = renderApp('/account');

		expect(await screen.findByText('jamie@example.com')).toBeInTheDocument();
		await user.click(screen.getByRole('button', { name: 'Sign out' }));

		expect(await screen.findByRole('heading', { name: /Book your/ })).toBeInTheDocument();
		expect(router.state.location.pathname).toBe('/');
	});
});
