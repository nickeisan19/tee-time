import type { ReactNode } from 'react';

type Tone = 'error' | 'success' | 'info';

const TONES: Record<Tone, string> = {
	error: 'border-signal bg-signal/5 text-ink',
	success: 'border-ink bg-bone text-ink',
	info: 'border-stone-400 bg-bone text-ink',
};

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
	return (
		<div role={tone === 'error' ? 'alert' : 'status'} className={`border-l-4 px-4 py-3 ${TONES[tone]}`}>
			{title && <p className="font-display text-base font-semibold uppercase tracking-[0.12em]">{title}</p>}
			{children && <div className="text-sm leading-relaxed text-stone-600">{children}</div>}
		</div>
	);
}
