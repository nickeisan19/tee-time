import { type InputHTMLAttributes, useId } from 'react';

type Props = InputHTMLAttributes<HTMLInputElement> & {
	label: string;
	hint?: string;
	error?: string;
};

export function TextField({ label, hint, error, className, ...rest }: Props) {
	const id = useId();
	const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
	return (
		<div className={className}>
			<label htmlFor={id} className="mb-2 block font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-600">
				{label}
			</label>
			<input
				id={id}
				aria-invalid={error ? true : undefined}
				aria-describedby={describedBy}
				className={
					'block min-h-12 w-full border bg-paper px-4 text-base text-ink placeholder:text-stone-400 ' +
					'transition-colors focus:border-ink focus:outline-2 focus:outline-offset-0 focus:outline-ink ' +
					(error ? 'border-signal' : 'border-stone-200 hover:border-stone-400')
				}
				{...rest}
			/>
			{hint && !error && (
				<p id={`${id}-hint`} className="mt-2 text-sm text-stone-600">
					{hint}
				</p>
			)}
			{error && (
				<p id={`${id}-error`} className="mt-2 text-sm font-medium text-signal">
					{error}
				</p>
			)}
		</div>
	);
}
