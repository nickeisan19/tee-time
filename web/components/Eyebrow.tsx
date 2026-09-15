import type { ReactNode } from 'react';

/** Small uppercase label above a headline, with the red accent rule. */
export function Eyebrow({ children }: { children: ReactNode }) {
	return (
		<p className="mb-3 flex items-center gap-3 font-display text-sm font-semibold uppercase tracking-[0.24em] text-stone-600">
			<span className="block h-0.5 w-8 bg-signal" aria-hidden />
			{children}
		</p>
	);
}
