import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Wordmark } from '../../components/Wordmark';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function HomePage() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | undefined>();

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const slug = String(new FormData(event.currentTarget).get('club')).trim().toLowerCase();
		if (!SLUG_PATTERN.test(slug)) {
			setError('Use the club address from your invite or the club’s website, like pine-valley.');
			return;
		}
		navigate(`/c/${slug}`);
	}

	return (
		<div className="flex min-h-dvh flex-col bg-ink text-paper">
			<header className="mx-auto flex w-full max-w-6xl items-center px-5 py-6">
				<Wordmark tone="paper" />
			</header>
			<main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-16">
				<h1 className="max-w-4xl font-display text-6xl font-bold uppercase leading-[0.88] tracking-tight sm:text-8xl">
					Book your
					<br />
					next <span className="text-signal">round.</span>
				</h1>
				<form onSubmit={handleSubmit} className="mt-12 grid max-w-xl gap-4 bg-paper p-5 text-ink sm:grid-cols-[1fr_auto] sm:items-end sm:p-6">
					<TextField label="Club address" name="club" placeholder="pine-valley" autoCapitalize="none" autoCorrect="off" error={error} required />
					<Button type="submit" size="lg">
						Go
					</Button>
				</form>
			</main>
		</div>
	);
}
