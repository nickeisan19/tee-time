export function Loading({ label = 'Loading' }: { label?: string }) {
	return (
		<div role="status" className="flex items-center gap-3 py-12 text-stone-600">
			<span className="block h-0.5 w-10 animate-pulse bg-signal motion-reduce:animate-none" aria-hidden />
			<span className="font-display text-sm font-semibold uppercase tracking-[0.2em]">{label}…</span>
		</div>
	);
}
