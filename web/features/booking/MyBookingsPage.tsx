import { useState } from 'react';
import { useOutletContext } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Eyebrow } from '../../components/Eyebrow';
import { Loading } from '../../components/Loading';
import { Notice } from '../../components/Notice';
import { RequireSession } from '../../components/RequireSession';
import type { ClubOutletContext } from '../../layouts/ClubLayout';
import { ApiError, errorMessage } from '../../lib/api';
import { clockLabel, formatMoney, longDate } from '../../lib/format';
import { useCancelBooking, useMyBookings } from '../../lib/queries';
import type { Booking, ClubDetails } from '../../lib/types';

const STATUS_LABELS: Record<Booking['status'], string | null> = {
	confirmed: null,
	cancelled: 'Cancelled',
	checked_in: 'Checked in',
	no_show: 'No show',
};

function cancelError(error: unknown, club: ClubDetails): string {
	if (error instanceof ApiError && error.code === 'CANCELLATION_CLOSED') {
		return `Online cancellation closes ${club.cancellationCutoffHours} hours before the tee time. Call the pro shop.`;
	}
	return errorMessage(error);
}

function BookingCard({ club, booking, canCancel }: { club: ClubDetails; booking: Booking; canCancel: boolean }) {
	const cancel = useCancelBooking(club.slug);
	const [isConfirming, setIsConfirming] = useState(false);
	const [first, second] = booking.teeTimes;
	const statusLabel = STATUS_LABELS[booking.status];

	return (
		<article className="border-t border-stone-200 py-6" aria-label={`${longDate(first.date)} at ${clockLabel(first.time)}`}>
			<div className="flex items-start justify-between gap-4">
				<div className={booking.status === 'cancelled' ? 'text-stone-600' : ''}>
					<p className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-stone-600">{longDate(first.date)}</p>
					<p
						className={`font-display text-5xl font-bold leading-none tracking-tight ${booking.status === 'cancelled' ? 'line-through decoration-2' : ''}`}
					>
						{clockLabel(first.time)}
					</p>
					<p className="mt-2">
						{booking.holes} holes · {first.nine.name}
						{second && ` · turn ${clockLabel(second.time)} ${second.nine.name}`}
					</p>
					<p className="text-stone-600">{booking.players.map((player) => player.name).join(', ')}</p>
				</div>
				<div className="shrink-0 text-right">
					{statusLabel ? (
						<span className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-signal">{statusLabel}</span>
					) : (
						<>
							<span className="block font-display text-2xl font-bold text-signal">{formatMoney(booking.totalCents)}</span>
							<span className="text-xs uppercase tracking-wide text-stone-600">at pro shop</span>
						</>
					)}
				</div>
			</div>

			{cancel.isError && (
				<div className="mt-4">
					<Notice tone="error">{cancelError(cancel.error, club)}</Notice>
				</div>
			)}

			{canCancel && (
				<div className="mt-4 flex flex-wrap items-center gap-3">
					{isConfirming ? (
						<>
							<span className="w-full font-medium sm:w-auto">Cancel this tee time?</span>
							<Button variant="signal" onClick={() => cancel.mutate(booking.id)} isLoading={cancel.isPending}>
								Yes, cancel
							</Button>
							<Button variant="ghost" onClick={() => setIsConfirming(false)} disabled={cancel.isPending}>
								Keep it
							</Button>
						</>
					) : (
						<Button variant="outline" onClick={() => setIsConfirming(true)}>
							Cancel booking
						</Button>
					)}
				</div>
			)}
		</article>
	);
}

function MyBookings() {
	const { club } = useOutletContext<ClubOutletContext>();
	const { data: bookings = [], isPending, error } = useMyBookings(club.slug);
	// Captured once per visit; the page refetches on return, which re-splits upcoming and past.
	const [now] = useState(() => Date.now());

	if (isPending) return <Loading label="Loading your tee times" />;

	const isUpcoming = (booking: Booking) => booking.status === 'confirmed' && Date.parse(booking.teeTimes[0].startsAt) > now;
	// The API lists newest first; upcoming rounds read best soonest first.
	const upcoming = bookings.filter(isUpcoming).toReversed();
	const history = bookings.filter((booking) => !isUpcoming(booking));

	return (
		<main className="mx-auto max-w-3xl px-5 pb-10 pt-8 md:pt-12">
			<Eyebrow>{club.name}</Eyebrow>
			<h1 className="font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight md:text-7xl">My tee times</h1>

			{error && (
				<div className="mt-8">
					<Notice tone="error" title="Couldn’t load your tee times">
						{errorMessage(error)}
					</Notice>
				</div>
			)}

			<section className="mt-10" aria-labelledby="upcoming-heading">
				<h2 id="upcoming-heading" className="mb-2 font-display text-2xl font-bold uppercase tracking-wide">
					Upcoming
				</h2>
				{upcoming.length === 0 ? (
					<div className="border-t border-stone-200 py-8">
						<p className="mb-6 text-stone-600">No upcoming tee times.</p>
						<ButtonLink to={`/c/${club.slug}/book`} variant="signal">
							Book a tee time
						</ButtonLink>
					</div>
				) : (
					upcoming.map((booking) => <BookingCard key={booking.id} club={club} booking={booking} canCancel />)
				)}
			</section>

			{history.length > 0 && (
				<section className="mt-12" aria-labelledby="history-heading">
					<h2 id="history-heading" className="mb-2 font-display text-2xl font-bold uppercase tracking-wide text-stone-600">
						Past &amp; cancelled
					</h2>
					{history.map((booking) => (
						<BookingCard key={booking.id} club={club} booking={booking} canCancel={false} />
					))}
				</section>
			)}
		</main>
	);
}

export function MyBookingsPage() {
	return (
		<RequireSession>
			<MyBookings />
		</RequireSession>
	);
}
