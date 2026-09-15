import { type FormEvent, useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { authRequest, errorMessage } from '../../lib/api';
import { AuthLayout } from '../../layouts/AuthLayout';

export function ForgotPasswordPage() {
	const [error, setError] = useState<string | null>(null);
	const [isSent, setIsSent] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		setError(null);
		setIsSubmitting(true);
		try {
			await authRequest('/request-password-reset', { body: { email: String(form.get('email')) } });
			setIsSent(true);
		} catch (caught) {
			setError(errorMessage(caught));
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<AuthLayout eyebrow="Account help" title="Reset password">
			{isSent ? (
				<Notice tone="success" title="Check your email">
					If an account uses that address, we sent a link to reset its password.
				</Notice>
			) : (
				<form onSubmit={handleSubmit} className="space-y-5">
					{error && <Notice tone="error">{error}</Notice>}
					<TextField label="Email" name="email" type="email" autoComplete="email" required />
					<Button type="submit" size="lg" isFullWidth isLoading={isSubmitting}>
						Send reset link
					</Button>
				</form>
			)}
			<Link to="/sign-in" className="mt-8 inline-block font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4">
				Back to sign in
			</Link>
		</AuthLayout>
	);
}
