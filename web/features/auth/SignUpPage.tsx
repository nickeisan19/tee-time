import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { ApiError, authRequest, errorMessage } from '../../lib/api';
import { safeNextPath } from '../../lib/navigation';
import { AuthLayout } from '../../layouts/AuthLayout';

const MIN_PASSWORD_LENGTH = 8;

export function SignUpPage() {
	const [searchParams] = useSearchParams();
	const next = safeNextPath(searchParams.get('next'));
	const [error, setError] = useState<string | null>(null);
	const [sentTo, setSentTo] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const email = String(form.get('email'));
		setError(null);
		setIsSubmitting(true);
		try {
			await authRequest('/sign-up/email', { body: { name: String(form.get('name')).trim(), email, password: String(form.get('password')) } });
			setSentTo(email);
		} catch (caught) {
			const tooMany = caught instanceof ApiError && caught.status === 429;
			setError(tooMany ? 'Too many attempts. Wait a moment and try again.' : errorMessage(caught));
		} finally {
			setIsSubmitting(false);
		}
	}

	if (sentTo) {
		return (
			<AuthLayout eyebrow="One more step" title="Check your email">
				<p className="text-lg leading-relaxed text-stone-600">
					We sent a link to <strong className="text-ink">{sentTo}</strong>. Open it and confirm your password to finish creating your account.
				</p>
				<Link to={`/sign-in?next=${encodeURIComponent(next)}`} className="mt-8 inline-block font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4">
					Back to sign in
				</Link>
			</AuthLayout>
		);
	}

	return (
		<AuthLayout eyebrow="Join" title="Create account">
			<form onSubmit={handleSubmit} className="space-y-5">
				{error && <Notice tone="error" title="Couldn’t create your account">{error}</Notice>}
				<TextField label="Full name" name="name" autoComplete="name" required maxLength={100} />
				<TextField label="Email" name="email" type="email" autoComplete="email" required />
				<TextField
					label="Password"
					name="password"
					type="password"
					autoComplete="new-password"
					required
					minLength={MIN_PASSWORD_LENGTH}
					hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
				/>
				<Button type="submit" size="lg" isFullWidth isLoading={isSubmitting}>
					Create account
				</Button>
			</form>
			<p className="mt-8 text-stone-600">
				Already have an account?{' '}
				<Link to={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4">
					Sign in
				</Link>
			</p>
		</AuthLayout>
	);
}
