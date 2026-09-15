import { type FormEvent, useEffect, useEffectEvent, useRef, useState } from 'react';
import { Button, ButtonLink } from '../../components/Button';
import { Icon } from '../../components/Icon';
import { Notice } from '../../components/Notice';
import { TextField } from '../../components/TextField';
import { ApiError, errorMessage } from '../../lib/api';
import { clockLabel, formatMoney, longDate } from '../../lib/format';
import { useCreateBooking } from '../../lib/queries';
import type { Booking, ClubDetails, PricePerPlayer } from '../../lib/types';

const MAX_GUEST_NAME_LENGTH = 60;

export interface SelectedOption {
	key: string;
	holes: 9 | 18;
	teeTimeId: string;
	routeId?: string;
	time: string;
	detail: string;
	spotsLeft: number;
	pricePerPlayer: PricePerPlayer;
}

function bookingError(error: unknown): string {
	if (error instanceof ApiError) {
		if (error.code === 'TEE_TIME_UNAVAILABLE' || error.code === 'NO_CROSSOVER') return 'Someone just took that tee time. Pick another one.';
		if (error.code === 'OUTSIDE_BOOKING_WINDOW') return 'That tee time is outside your booking window.';
		if (error.status === 429) return 'You’ve made a lot of bookings recently. Try again later.';
	}
	return errorMessage(error);
}

/** Guests without a published guest rate make the total unknown until the pro shop prices them. */
function estimatedTotal(prices: PricePerPlayer, players: number): number | null {
	if (prices.booker === null) return null;
	if (players === 1) return prices.booker;
	return prices.guest === null ? null : prices.booker + (players - 1) * prices.guest;
}

function Confirmation({ club, booking }: { club: ClubDetails; booking: Booking }) {
	const [first, second] = booking.teeTimes;
	return (
		<div className="space-y-6">
			<p className="flex items-center gap-3 font-display text-sm font-semibold uppercase tracking-[0.24em] text-signal">
				<span className="block h-0.5 w-8 bg-signal" aria-hidden />
				Confirmed
			</p>
			<h2 id="booking-sheet-title" className="font-display text-5xl font-bold uppercase leading-[0.9]">
				You’re on the tee
			</h2>
			<p className="text-lg text-stone-600">
				{longDate(first.date)} at <strong className="text-ink">{clockLabel(first.time)}</strong> on {first.nine.name}
				{second && `, turning at ${clockLabel(second.time)} on ${second.nine.name}`}. Pay at the pro shop when you arrive.
			</p>
			<ButtonLink to={`/c/${club.slug}/bookings`} size="lg" isFullWidth>
				View my tee times
			</ButtonLink>
		</div>
	);
}

const FOCUSABLE =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Wraps Tab and Shift+Tab around the dialog so keyboard users can't wander onto the page behind it. */
function keepFocusInside(container: HTMLElement, event: KeyboardEvent) {
	const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
	const first = focusable[0];
	const last = focusable.at(-1);
	if (!first || !last) return;
	const active = document.activeElement;
	const isOutside = !container.contains(active);
	if (event.shiftKey && (active === first || isOutside)) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && (active === last || isOutside)) {
		event.preventDefault();
		first.focus();
	}
}

interface BookingSheetProps {
	club: ClubDetails;
	date: string;
	players: number;
	option: SelectedOption;
	onClose: () => void;
}

/** A bottom sheet on phones and a centred panel on larger screens. */
export function BookingSheet({ club, date, players, option, onClose }: BookingSheetProps) {
	const createBooking = useCreateBooking(club.slug);
	const [guests, setGuests] = useState<string[]>(() => Array.from({ length: players - 1 }, () => ''));
	const closeButton = useRef<HTMLButtonElement>(null);
	const total = estimatedTotal(option.pricePerPlayer, players);

	const dialog = useRef<HTMLElement>(null);

	const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
		if (event.key === 'Escape') {
			onClose();
			return;
		}
		if (event.key === 'Tab' && dialog.current) keepFocusInside(dialog.current, event);
	});

	// Runs once per opening: a parent re-render (e.g. availability refetching) must not steal focus mid-typing.
	useEffect(() => {
		const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
		closeButton.current?.focus();
		const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
		window.addEventListener('keydown', onKeyDown);
		document.body.style.overflow = 'hidden';
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			document.body.style.overflow = '';
			previouslyFocused?.focus();
		};
	}, []);

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		createBooking.mutate({
			holes: option.holes,
			teeTimeId: option.teeTimeId,
			routeId: option.routeId,
			guests: guests.map((name) => ({ name: name.trim() })),
		});
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
			<div className="absolute inset-0 bg-ink/60" aria-hidden onClick={onClose} />
			<section
				ref={dialog}
				role="dialog"
				aria-modal="true"
				aria-labelledby="booking-sheet-title"
				className="relative max-h-[92dvh] w-full overflow-y-auto bg-paper px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-3 md:max-w-lg md:p-8"
			>
				<div className="mb-2 flex items-center justify-between">
					<span className="mx-auto block h-1 w-10 bg-stone-200 md:hidden" aria-hidden />
					<button
						ref={closeButton}
						type="button"
						onClick={onClose}
						aria-label="Close"
						className="absolute right-3 top-3 grid h-11 w-11 place-items-center hover:bg-bone"
					>
						<Icon name="close" />
					</button>
				</div>

				{createBooking.isSuccess ? (
					<Confirmation club={club} booking={createBooking.data} />
				) : (
					<form onSubmit={handleSubmit} className="space-y-6 pt-6">
						<div>
							<p className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-stone-600">
								{longDate(date)} · {option.holes} holes
							</p>
							<h2 id="booking-sheet-title" className="mt-1 font-display text-6xl font-bold uppercase leading-none tracking-tight">
								{clockLabel(option.time)}
							</h2>
							<p className="mt-2 text-stone-600">{option.detail}</p>
						</div>

						{createBooking.isError && (
							<Notice tone="error" title="Couldn’t book">
								{bookingError(createBooking.error)}
							</Notice>
						)}

						{guests.length > 0 && (
							<fieldset className="space-y-4">
								<legend className="mb-2 font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-600">Your guests</legend>
								{guests.map((name, index) => (
									<TextField
										// Guest slots are fixed for the sheet's lifetime, so the position is a stable key.
										key={index}
										label={`Guest ${index + 1} name`}
										value={name}
										required
										maxLength={MAX_GUEST_NAME_LENGTH}
										autoComplete="off"
										onChange={(event) => {
											const value = event.target.value;
											setGuests((current) => current.map((existing, position) => (position === index ? value : existing)));
										}}
									/>
								))}
							</fieldset>
						)}

						<div className="flex items-end justify-between border-t border-ink pt-4">
							<div>
								<p className="font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-600">
									{players} {players === 1 ? 'player' : 'players'}
								</p>
								<p className="text-sm text-stone-600">Pay at the pro shop</p>
							</div>
							<p className="text-right">
								<span className="sr-only">Estimated total: </span>
								<span className="font-display text-4xl font-bold text-signal">{formatMoney(total)}</span>
							</p>
						</div>

						<Button type="submit" variant="signal" size="lg" isFullWidth isLoading={createBooking.isPending}>
							Confirm booking
						</Button>
					</form>
				)}
			</section>
		</div>
	);
}
