import type { ClubDetails } from '../lib/types';

const LOGO_HEIGHT_PX = 40;

/** A club's logo when it has one, otherwise its name set as a wordmark. */
export function ClubMark({ club, size = 'md' }: { club: Pick<ClubDetails, 'name' | 'logoUrl'>; size?: 'md' | 'lg' }) {
	if (club.logoUrl) {
		const height = size === 'lg' ? LOGO_HEIGHT_PX * 2 : LOGO_HEIGHT_PX;
		return <img src={club.logoUrl} alt={club.name} height={height} style={{ height }} className="w-auto max-w-48 object-contain" />;
	}
	const text = size === 'lg' ? 'text-4xl' : 'text-xl';
	return <span className={`font-display font-bold uppercase leading-none tracking-[0.08em] ${text}`}>{club.name}</span>;
}
