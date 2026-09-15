import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link, type LinkProps } from 'react-router';

type Variant = 'primary' | 'signal' | 'outline' | 'ghost' | 'inverse';
type Size = 'md' | 'lg';

const BASE =
	'inline-flex min-h-12 items-center justify-center gap-2 px-6 font-display text-base font-semibold uppercase tracking-[0.14em] ' +
	'transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-signal ' +
	'disabled:cursor-not-allowed disabled:opacity-40';

const VARIANTS: Record<Variant, string> = {
	primary: 'bg-ink text-paper hover:bg-signal active:bg-signal-dark',
	signal: 'bg-signal text-paper hover:bg-signal-dark active:bg-ink',
	outline: 'border border-ink bg-transparent text-ink hover:bg-ink hover:text-paper',
	ghost: 'bg-transparent px-2 text-ink underline-offset-8 hover:underline hover:decoration-signal hover:decoration-2',
	inverse: 'bg-paper text-ink hover:bg-signal hover:text-paper',
};

const SIZES: Record<Size, string> = {
	md: '',
	lg: 'min-h-14 px-8 text-lg',
};

export function buttonClasses(variant: Variant = 'primary', size: Size = 'md', isFullWidth = false): string {
	return [BASE, VARIANTS[variant], SIZES[size], isFullWidth ? 'w-full' : ''].join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: Variant;
	size?: Size;
	isFullWidth?: boolean;
	isLoading?: boolean;
	children: ReactNode;
};

export function Button({ variant, size, isFullWidth, isLoading = false, disabled, children, type = 'button', ...rest }: ButtonProps) {
	return (
		<button type={type} className={buttonClasses(variant, size, isFullWidth)} disabled={disabled || isLoading} aria-busy={isLoading} {...rest}>
			{children}
		</button>
	);
}

type ButtonLinkProps = LinkProps & { variant?: Variant; size?: Size; isFullWidth?: boolean };

export function ButtonLink({ variant, size, isFullWidth, className, ...rest }: ButtonLinkProps) {
	return <Link className={`${buttonClasses(variant, size, isFullWidth)} ${className ?? ''}`} {...rest} />;
}
