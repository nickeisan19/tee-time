import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { ApiError, authRequest, errorMessage } from '../../lib/api';
import { AuthLayout } from '../../layouts/AuthLayout';

function verifyError(error: unknown): string {
	if (error instanceof ApiError && error.status === 401) return 'That password doesn’t match this account.';
	if (error instanceof ApiError && error.status === 400) return 'This link is invalid or has expired. Sign in to get a new one.';
	if (error instanceof ApiError && error.status === 429) return 'Too many attempts. Wait a minute and try again.';
	return errorMessage(error);
}

/** The emailed verification link lands here; the password proves the account really is yours. */
export function VerifyEmailPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token');
	const [error, setError] = useState<string | null>(null);
	const [isVerified, setIsVerified] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setError(null);
		setIsSubmitting(true);
		try {
			await authRequest('/verify-email-with-password', { body: { token, password: String(form.get('password')) } });
			setIsVerified(true);
		} catch (caught) {
			setError(verifyError(caught));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!token) {
		return (
			<AuthLayout eyebrow="Verify email" title="Link missing">
				<Notice tone="error">This page needs the link from your verification email.</Notice>
				<Link to="/sign-in" className="mt-8 inline-block font-semibold underline decoration-signal decoration-2 underline-offset-4">
					Back to sign in
				</Link>
			</AuthLayout>
		);
	}

	if (isVerified) {
		return (
			<AuthLayout eyebrow="You’re in" title="Email confirmed">
				<p className="mb-8 text-lg text-stone-600">Your account is ready. Sign in to book your first tee time.</p>
				<ButtonLink to="/sign-in" size="lg" isFullWidth>
					Sign in
				</ButtonLink>
			</AuthLayout>
		);
	}

	return (
		<AuthLayout eyebrow="Verify email" title="Confirm it’s you">
			<p className="mb-6 text-stone-600">Enter the password you chose when you signed up.</p>
			<form onSubmit={handleSubmit} className="space-y-5">
				{error && <Notice tone="error" title="Couldn’t confirm your email">{error}</Notice>}
				<TextField label="Password" name="password" type="password" autoComplete="current-password" required />
				<Button type="submit" size="lg" isFullWidth isLoading={isSubmitting}>
					Confirm email
				</Button>
			</form>
		</AuthLayout>
	);
}
