type IconName = 'flag' | 'calendar' | 'card' | 'user' | 'minus' | 'plus' | 'close' | 'arrow';

const PATHS: Record<IconName, string> = {
	flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
	calendar: 'M4 7h16v13H4zM4 11h16M8 3v4m8-4v4',
	card: 'M3 6h18v12H3zM3 10h18M7 15h4',
	user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
	minus: 'M5 12h14',
	plus: 'M12 5v14M5 12h14',
	close: 'M6 6l12 12M18 6L6 18',
	arrow: 'M5 12h14m-6-6 6 6-6 6',
};

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="square" className={className} aria-hidden>
			<path d={PATHS[name]} />
		</svg>
	);
}
