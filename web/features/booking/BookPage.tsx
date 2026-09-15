import { useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router';
import { clubToday } from '../../../src/lib/dates';
import { addDays } from '../../../src/lib/zoned-time';
import { Eyebrow } from '../../components/Eyebrow';
import { Icon } from '../../components/Icon';
import { Loading } from '../../components/Loading';
import { Notice } from '../../components/Notice';
import { RequireSession } from '../../components/RequireSession';
import type { ClubOutletContext } from '../../layouts/ClubLayout';
import { errorMessage } from '../../lib/api';
import { clockLabel, dayOfMonth, formatMoney, longDate, weekdayShort } from '../../lib/format';
import { useAvailability, useMyMembership } from '../../lib/queries';
import type { Availability, ClubDetails } from '../../lib/types';
import { BookingSheet, type SelectedOption } from './BookingSheet';

const MIN_PLAYERS = 1;
const MAX_PLAYERS = 4;

function toOptions(availability: Availability): SelectedOption[] {
	if (availability.holes === 9) {
		return availability.options.map((option) => ({
			key: option.teeTimeId,
			holes: 9,
			teeTimeId: option.teeTimeId,
			time: option.time,
			detail: option.nine.name,
			spotsLeft: option.spotsLeft,
			pricePerPlayer: option.pricePerPlayer,
		}));
	}
	return availability.options.map((option) => ({
		key: `${option.route.id}:${option.start.teeTimeId}`,
		holes: 18,
		teeTimeId: option.start.teeTimeId,
		routeId: option.route.id,
		time: option.start.time,
		detail: `${option.start.nine.name} · turn ${clockLabel(option.crossover.time)} ${option.crossover.nine.name}`,
		spotsLeft: option.spotsLeft,
		pricePerPlayer: option.pricePerPlayer,
	}));
}

const legendClasses = 'mb-2 font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-600';

function HolesToggle({ value, onChange }: { value: 9 | 18; onChange: (value: 9 | 18) => void }) {
	return (
		<fieldset>
			<legend className={legendClasses}>Holes</legend>
			<div className="grid grid-cols-2 border border-ink">
				{([9, 18] as const).map((holes) => {
					const isSelected = holes === value;
					return (
						<button
							key={holes}
							type="button"
							aria-pressed={isSelected}
							onClick={() => onChange(holes)}
							className={`min-h-12 font-display text-xl font-bold uppercase tracking-[0.08em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
								isSelected ? 'bg-ink text-paper' : 'bg-paper text-ink hover:bg-bone'
							}`}
						>
							{holes}
						</button>
					);
				})}
			</div>
		</fieldset>
	);
}

function PlayersStepper({ value, onChange }: { value: number; onChange: (value: number) => void }) {
	return (
		<fieldset>
			<legend className={legendClasses}>Players</legend>
			<div className="flex min-h-12 items-stretch border border-ink">
				<button
					type="button"
					aria-label="Fewer players"
					disabled={value <= MIN_PLAYERS}
					onClick={() => onChange(value - 1)}
					className="grid w-12 place-items-center hover:bg-bone disabled:opacity-30"
				>
					<Icon name="minus" />
				</button>
				<output
					aria-live="polite"
					aria-label="Players"
					className="grid flex-1 place-items-center border-x border-ink font-display text-2xl font-bold"
				>
					{value}
				</output>
				<button
					type="button"
					aria-label="More players"
					disabled={value >= MAX_PLAYERS}
					onClick={() => onChange(value + 1)}
					className="grid w-12 place-items-center hover:bg-bone disabled:opacity-30"
				>
					<Icon name="plus" />
				</button>
			</div>
		</fieldset>
	);
}

function DateStrip({ dates, selected, onSelect }: { dates: string[]; selected: string; onSelect: (date: string) => void }) {
	return (
		<fieldset>
			<legend className={legendClasses}>Date</legend>
			<div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:mx-0 md:px-0">
				<div className="flex gap-2">
					{dates.map((date) => {
						const isSelected = date === selected;
						return (
							<button
								key={date}
								type="button"
								aria-pressed={isSelected}
								aria-label={longDate(date)}
								onClick={() => onSelect(date)}
								className={`relative flex h-20 w-16 shrink-0 flex-col items-center justify-center border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal ${
									isSelected ? 'border-ink bg-ink text-paper' : 'border-stone-200 bg-paper text-ink hover:border-ink'
								}`}
							>
								<span className="text-xs font-semibold uppercase tracking-[0.14em]">{weekdayShort(date)}</span>
								<span className="font-display text-3xl font-bold leading-none">{dayOfMonth(date)}</span>
								{isSelected && <span className="absolute inset-x-3 bottom-1.5 h-0.5 bg-signal" aria-hidden />}
							</button>
						);
					})}
				</div>
			</div>
		</fieldset>
	);
}

function TeeTimeList({
	club,
	date,
	holes,
	players,
	onSelect,
}: {
	club: ClubDetails;
	date: string;
	holes: 9 | 18;
	players: number;
	onSelect: (option: SelectedOption) => void;
}) {
	const { data, isPending, error } = useAvailability(club.slug, date, holes, players);

	if (isPending) return <Loading label="Finding tee times" />;
	if (error) {
		return (
			<Notice tone="error" title="Couldn’t load tee times">
				{errorMessage(error)}
			</Notice>
		);
	}

	const options = toOptions(data);
	if (options.length === 0) {
		return (
			<Notice title="No tee times">
				Nothing open for {players} {players === 1 ? 'player' : 'players'} on {longDate(date)}. Try another day or fewer players.
			</Notice>
		);
	}

	return (
		<ul className="divide-y divide-stone-200 border-y border-stone-200" aria-label="Available tee times">
			{options.map((option) => (
				<li key={option.key}>
					<button
						type="button"
						onClick={() => onSelect(option)}
						className="group flex w-full items-center gap-4 py-4 text-left transition-colors hover:bg-bone focus-visible:bg-bone focus-visible:outline-none sm:px-4"
					>
						<span className="w-24 shrink-0 font-display text-3xl font-bold leading-none tracking-tight sm:w-28">
							{clockLabel(option.time)}
						</span>
						<span className="min-w-0 flex-1">
							<span className="block truncate font-medium">{option.detail}</span>
							<span className="text-sm text-stone-600">
								{option.spotsLeft} {option.spotsLeft === 1 ? 'spot' : 'spots'} left
							</span>
						</span>
						<span className="shrink-0 text-right">
							<span className="block font-display text-xl font-bold text-signal">{formatMoney(option.pricePerPlayer.booker)}</span>
							{option.pricePerPlayer.booker !== null && <span className="text-xs uppercase tracking-wide text-stone-600">per player</span>}
						</span>
						<Icon
							name="arrow"
							className="hidden h-5 w-5 text-stone-400 transition-transform group-hover:translate-x-1 group-hover:text-ink sm:block"
						/>
					</button>
				</li>
			))}
		</ul>
	);
}

function BookTeeTime() {
	const { club } = useOutletContext<ClubOutletContext>();
	const { data: mine, isPending: isMembershipPending } = useMyMembership(club.slug, true);
	const [searchParams, setSearchParams] = useSearchParams();
	const [selected, setSelected] = useState<SelectedOption | null>(null);

	const today = clubToday(club.timezone);
	const windowDays = mine?.bookingWindowDays ?? club.publicBookingWindowDays;
	const dates = Array.from({ length: windowDays + 1 }, (_, index) => addDays(today, index));
	const requestedDate = searchParams.get('date');
	const date = requestedDate && dates.includes(requestedDate) ? requestedDate : today;
	const holes = searchParams.get('holes') === '9' ? 9 : 18;
	const requestedPlayers = Number(searchParams.get('players'));
	const players =
		Number.isInteger(requestedPlayers) && requestedPlayers >= MIN_PLAYERS && requestedPlayers <= MAX_PLAYERS
			? requestedPlayers
			: MIN_PLAYERS;

	// Members can book further ahead, so a shared link to a later date waits for the real window.
	if (isMembershipPending) return <Loading label="Loading tee sheet" />;

	// The search lives in the URL so a refresh, the back button, or a shared link shows the same tee sheet.
	function updateSearch(key: 'date' | 'holes' | 'players', value: string) {
		setSearchParams(
			(current) => {
				const next = new URLSearchParams(current);
				next.set(key, value);
				return next;
			},
			{ replace: true },
		);
	}

	return (
		<main className="mx-auto max-w-3xl px-5 pb-10 pt-8 md:pt-12">
			<Eyebrow>{club.name}</Eyebrow>
			<h1 className="font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight md:text-7xl">Book a tee time</h1>

			<div className="mt-8 space-y-6">
				<DateStrip dates={dates} selected={date} onSelect={(value) => updateSearch('date', value)} />
				<div className="grid grid-cols-2 gap-4">
					<HolesToggle value={holes} onChange={(value) => updateSearch('holes', String(value))} />
					<PlayersStepper value={players} onChange={(value) => updateSearch('players', String(value))} />
				</div>
			</div>

			<section className="mt-10" aria-labelledby="results-heading">
				<h2
					id="results-heading"
					className="mb-4 flex items-baseline justify-between gap-4 font-display text-2xl font-bold uppercase tracking-wide"
				>
					{longDate(date)}
					<span className="shrink-0 text-sm font-semibold tracking-[0.16em] text-stone-600">{holes} holes</span>
				</h2>
				<TeeTimeList club={club} date={date} holes={holes} players={players} onSelect={setSelected} />
			</section>

			<p className="mt-8 text-sm text-stone-600">
				Already booked?{' '}
				<Link
					to={`/c/${club.slug}/bookings`}
					className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4"
				>
					My tee times
				</Link>
			</p>

			{selected && (
				<BookingSheet
					key={`${selected.key}:${players}`}
					club={club}
					date={date}
					players={players}
					option={selected}
					onClose={() => setSelected(null)}
				/>
			)}
		</main>
	);
}

export function BookPage() {
	return (
		<RequireSession>
			<BookTeeTime />
		</RequireSession>
	);
}
