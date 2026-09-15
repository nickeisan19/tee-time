import { useOutletContext } from 'react-router';
import { ButtonLink } from '../../components/Button';
import { Eyebrow } from '../../components/Eyebrow';
import type { ClubOutletContext } from '../../layouts/ClubLayout';
import { useMyMembership, useSession } from '../../lib/queries';

export function ClubHomePage() {
	const { club } = useOutletContext<ClubOutletContext>();
	const { data: session } = useSession();
	const { data: mine } = useMyMembership(club.slug, Boolean(session));
	const windowDays = mine?.bookingWindowDays ?? club.publicBookingWindowDays;
	const isMember = mine?.state === 'active';

	return (
		<main>
			<section className="relative overflow-hidden bg-ink text-paper">
				<div className="mx-auto max-w-6xl px-5 pb-14 pt-12 md:pb-24 md:pt-20">
					<p className="mb-4 flex items-center gap-3 font-display text-sm font-semibold uppercase tracking-[0.24em] text-paper/70">
						<span className="block h-0.5 w-8 bg-signal" aria-hidden />
						{isMember ? 'Welcome back, member' : 'Tee times'}
					</p>
					<h1 className="max-w-3xl font-display text-6xl font-bold uppercase leading-[0.88] tracking-tight sm:text-7xl md:text-8xl">{club.name}</h1>
					<div className="mt-10 flex flex-col gap-3 sm:flex-row">
						<ButtonLink to="book" variant="signal" size="lg">
							Book a tee time
						</ButtonLink>
						{!isMember && (
							<ButtonLink to="membership" variant="inverse" size="lg">
								Membership
							</ButtonLink>
						)}
					</div>
				</div>
				<span className="absolute -right-24 top-1/2 hidden h-[28rem] w-[28rem] -translate-y-1/2 rounded-full border border-paper/10 md:block" aria-hidden />
			</section>

			<section className="mx-auto grid max-w-6xl gap-px bg-stone-200 md:grid-cols-3" aria-label="Booking details">
				<div className="bg-paper px-5 py-8 md:py-12">
					<Eyebrow>Book ahead</Eyebrow>
					<p className="font-display text-5xl font-bold">
						{windowDays} <span className="text-2xl uppercase tracking-wide text-stone-600">days</span>
					</p>
					<p className="mt-2 text-stone-600">{isMember ? 'Your membership booking window.' : 'How far ahead you can book.'}</p>
				</div>
				<div className="bg-paper px-5 py-8 md:py-12">
					<Eyebrow>Cancel by</Eyebrow>
					<p className="font-display text-5xl font-bold">
						{club.cancellationCutoffHours} <span className="text-2xl uppercase tracking-wide text-stone-600">hours</span>
					</p>
					<p className="mt-2 text-stone-600">Before your tee time, online.</p>
				</div>
				<div className="bg-paper px-5 py-8 md:py-12">
					<Eyebrow>Pay</Eyebrow>
					<p className="font-display text-5xl font-bold uppercase">Pro shop</p>
					<p className="mt-2 text-stone-600">Check in and pay when you arrive.</p>
				</div>
			</section>
		</main>
	);
}
