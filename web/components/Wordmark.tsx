import { Link } from 'react-router';

/** The platform's own mark. Clubs show their name and logo; this stays small and secondary. */
export function Wordmark({ tone = 'ink' }: { tone?: 'ink' | 'paper' }) {
	const color = tone === 'ink' ? 'text-ink' : 'text-paper';
	return (
		<Link to="/" className={`font-display text-lg font-bold uppercase tracking-[0.3em] ${color}`}>
			Tee<span className="text-signal">·</span>Time
		</Link>
	);
}
