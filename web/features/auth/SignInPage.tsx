import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { ApiError, authRequest, errorMessage } from '../../lib/api';
import { safeNextPath } from '../../lib/navigation';
import { queryKeys, useAuthOptions } from '../../lib/queries';
import { AuthLayout } from '../../layouts/AuthLayout';

function signInError(error: unknown): string {
	if (error instanceof ApiError && error.status === 403) return 'Confirm your email address first. Check your inbox for the verification link.';
	if (error instanceof ApiError && error.status === 401) return 'That email and password don’t match.';
	if (error instanceof ApiError && error.status === 429) return 'Too many attempts. Wait a moment and try again.';
	return errorMessage(error);
}

export function SignInPage() {
	const [searchParams] = useSearchParams();
	const next = safeNextPath(searchParams.get('next'));
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { data: authOptions } = useAuthOptions();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setError(null);
		setIsSubmitting(true);
		try {
			await authRequest('/sign-in/email', { body: { email: String(form.get('email')), password: String(form.get('password')) } });
			await queryClient.invalidateQueries({ queryKey: queryKeys.session });
			navigate(next, { replace: true });
		} catch (caught) {
			setError(signInError(caught));
		} finally {
			setIsSubmitting(false);
		}
	}

	async function handleGoogle() {
		setError(null);
		try {
			const { url } = await authRequest<{ url: string }>('/sign-in/social', { body: { provider: 'google', callbackURL: next } });
			window.location.assign(url);
		} catch (caught) {
			setError(errorMessage(caught));
		}
	}

	return (
		<AuthLayout eyebrow="Welcome back" title="Sign in">
			<form onSubmit={handleSubmit} className="space-y-5" noValidate={false}>
				{error && <Notice tone="error" title="Couldn’t sign in">{error}</Notice>}
				<TextField label="Email" name="email" type="email" autoComplete="email" required />
				<TextField label="Password" name="password" type="password" autoComplete="current-password" required />
				<div className="flex justify-end">
					<Link to="/forgot-password" className="text-sm font-medium text-stone-600 underline-offset-4 hover:text-ink hover:underline">
						Forgot password?
					</Link>
				</div>
				<Button type="submit" size="lg" isFullWidth isLoading={isSubmitting}>
					Sign in
				</Button>
			</form>
			{authOptions?.google && (
				<>
					<div className="my-6 flex items-center gap-4 text-sm uppercase tracking-[0.2em] text-stone-400" aria-hidden>
						<span className="h-px flex-1 bg-stone-200" />
						or
						<span className="h-px flex-1 bg-stone-200" />
					</div>
					<Button variant="outline" size="lg" isFullWidth onClick={handleGoogle}>
						Continue with Google
					</Button>
				</>
			)}
			<p className="mt-8 text-stone-600">
				New here?{' '}
				<Link to={`/sign-up?next=${encodeURIComponent(next)}`} className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4">
					Create an account
				</Link>
			</p>
		</AuthLayout>
	);
}
