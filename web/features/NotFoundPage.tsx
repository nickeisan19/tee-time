import { ButtonLink } from '../components/Button';
import { Wordmark } from '../components/Wordmark';

export function NotFoundPage() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-6xl flex-col px-5 py-6">
			<Wordmark />
			<div className="flex flex-1 flex-col justify-center">
				<p className="font-display text-9xl font-bold leading-none text-signal">404</p>
				<h1 className="mt-4 font-display text-5xl font-bold uppercase">Out of bounds</h1>
				<p className="mt-3 text-stone-600">That page doesn’t exist.</p>
				<div className="mt-8">
					<ButtonLink to="/">Go home</ButtonLink>
				</div>
			</div>
		</main>
	);
}
