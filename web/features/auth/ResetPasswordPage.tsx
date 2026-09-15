import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { ApiError, authRequest, errorMessage } from '../../lib/api';
import { AuthLayout } from '../../layouts/AuthLayout';

const MIN_PASSWORD_LENGTH = 8;

export function ResetPasswordPage() {
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token');
	const [error, setError] = useState<string | null>(null);
	const [isReset, setIsReset] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const newPassword = String(form.get('password'));
		if (newPassword !== String(form.get('confirm'))) {
			setError('The two passwords don’t match.');
			return;
		}
		setError(null);
		setIsSubmitting(true);
		try {
			await authRequest('/reset-password', { body: { token, newPassword } });
			setIsReset(true);
		} catch (caught) {
			const expired = caught instanceof ApiError && caught.status === 400;
			setError(expired ? 'This reset link is invalid or has expired. Request a new one.' : errorMessage(caught));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (!token) {
		return (
			<AuthLayout eyebrow="Account help" title="Link missing">
				<Notice tone="error">This page needs the link from your password reset email.</Notice>
				<Link to="/forgot-password" className="mt-8 inline-block font-semibold underline decoration-signal decoration-2 underline-offset-4">
					Request a new link
				</Link>
			</AuthLayout>
		);
	}

	if (isReset) {
		return (
			<AuthLayout eyebrow="All set" title="Password updated">
				<p className="mb-8 text-lg text-stone-600">Sign in with your new password.</p>
				<ButtonLink to="/sign-in" size="lg" isFullWidth>
					Sign in
				</ButtonLink>
			</AuthLayout>
		);
	}

	return (
		<AuthLayout eyebrow="Account help" title="New password">
			<form onSubmit={handleSubmit} className="space-y-5">
				{error && <Notice tone="error">{error}</Notice>}
				<TextField label="New password" name="password" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
				<TextField label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} />
				<Button type="submit" size="lg" isFullWidth isLoading={isSubmitting}>
					Update password
				</Button>
			</form>
		</AuthLayout>
	);
}
