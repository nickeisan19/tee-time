import type { ReactNode } from 'react';
import { Wordmark } from '../components/Wordmark';

/** Black editorial panel beside the form on desktop; a slim black band above it on phones. */
export function AuthLayout({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
	return (
		<div className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
			<aside className="relative flex flex-col justify-between overflow-hidden bg-ink px-6 py-6 text-paper lg:px-12 lg:py-12">
				<Wordmark tone="paper" />
				<div className="hidden lg:block">
					<p className="font-display text-7xl font-bold uppercase leading-[0.9] tracking-tight">
						Your
						<br />
						tee time
						<br />
						<span className="text-signal">awaits.</span>
					</p>
				</div>
				<span className="absolute -bottom-10 -right-10 hidden h-64 w-64 rounded-full border border-paper/10 lg:block" aria-hidden />
			</aside>
			<main className="flex items-start justify-center px-6 py-10 sm:px-10 lg:items-center lg:py-16">
				<div className="w-full max-w-md">
					<p className="mb-3 flex items-center gap-3 font-display text-sm font-semibold uppercase tracking-[0.24em] text-stone-600">
						<span className="block h-0.5 w-8 bg-signal" aria-hidden />
						{eyebrow}
					</p>
					<h1 className="mb-8 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-ink sm:text-6xl">{title}</h1>
					{children}
				</div>
			</main>
		</div>
	);
}
