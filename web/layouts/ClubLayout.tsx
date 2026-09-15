import { NavLink, Outlet, useParams } from 'react-router';
import { ClubMark } from '../components/ClubMark';
import { Icon } from '../components/Icon';
import { Loading } from '../components/Loading';
import { Notice } from '../components/Notice';
import { Wordmark } from '../components/Wordmark';
import { ApiError } from '../lib/api';
import { signInPath } from '../lib/navigation';
import { useClub, useSession } from '../lib/queries';
import type { ClubDetails } from '../lib/types';

export type ClubOutletContext = { club: ClubDetails };

const NAV = [
	{ to: 'book', label: 'Book', shortLabel: 'Book', icon: 'flag' },
	{ to: 'bookings', label: 'My tee times', shortLabel: 'Tee times', icon: 'calendar' },
	{ to: 'membership', label: 'Membership', shortLabel: 'Member', icon: 'card' },
] as const;

const desktopLink = ({ isActive }: { isActive: boolean }) =>
	`relative py-2 font-display text-sm font-semibold uppercase tracking-[0.18em] transition-colors hover:text-ink ${
		isActive ? 'text-ink after:absolute after:inset-x-0 after:-bottom-[21px] after:h-0.5 after:bg-signal' : 'text-stone-600'
	}`;

const mobileLink = ({ isActive }: { isActive: boolean }) =>
	`flex min-h-14 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${
		isActive ? 'text-ink' : 'text-stone-400'
	}`;

export function ClubLayout() {
	const { slug = '' } = useParams();
	const { data: club, isPending, error } = useClub(slug);
	const { data: session } = useSession();

	if (isPending) return <Loading label="Loading club" />;
	if (error || !club) {
		const missing = error instanceof ApiError && error.status === 404;
		return (
			<main className="mx-auto max-w-xl px-6 py-16">
				<Wordmark />
				<div className="mt-10">
					<Notice tone="error" title={missing ? 'Club not found' : 'Couldn’t load this club'}>
						{missing ? 'Check the link you were given.' : 'Please try again.'}
					</Notice>
				</div>
			</main>
		);
	}

	const clubPath = `/c/${club.slug}`;
	return (
		<div className="min-h-dvh bg-paper pb-20 text-ink md:pb-0">
			<header className="sticky top-0 z-30 border-b border-stone-200 bg-paper/95 backdrop-blur">
				<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-5 md:h-20">
					<NavLink to={clubPath} end className="flex min-w-0 items-center" aria-label={`${club.name} home`}>
						<ClubMark club={club} />
					</NavLink>
					<nav aria-label="Club" className="hidden items-center gap-8 md:flex">
						{NAV.map((item) => (
							<NavLink key={item.to} to={`${clubPath}/${item.to}`} className={desktopLink}>
								{item.label}
							</NavLink>
						))}
					</nav>
					{session ? (
						<NavLink to="/account" className="hidden text-sm font-medium text-stone-600 hover:text-ink md:block">
							{session.user.name}
						</NavLink>
					) : (
						<NavLink to={signInPath(clubPath)} className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-ink">
							Sign in
						</NavLink>
					)}
				</div>
			</header>

			<Outlet context={{ club } satisfies ClubOutletContext} />

			<footer className="mx-auto mt-16 hidden max-w-6xl items-center justify-between border-t border-stone-200 px-5 py-8 text-sm text-stone-600 md:flex">
				<span>{club.name}</span>
				<span className="flex items-center gap-2">
					Booking by <Wordmark />
				</span>
			</footer>

			<nav aria-label="Club tabs" className="fixed inset-x-0 bottom-0 z-30 flex border-t border-stone-200 bg-paper pb-[env(safe-area-inset-bottom)] md:hidden">
				{NAV.map((item) => (
					<NavLink key={item.to} to={`${clubPath}/${item.to}`} className={mobileLink}>
						<Icon name={item.icon} />
						{item.shortLabel}
					</NavLink>
				))}
				<NavLink to="/account" className={mobileLink}>
					<Icon name="user" />
					Account
				</NavLink>
			</nav>
		</div>
	);
}
