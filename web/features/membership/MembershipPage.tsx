import { type FormEvent, useState } from 'react';
import { useOutletContext } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Eyebrow } from '../../components/Eyebrow';
import { Loading } from '../../components/Loading';
import { Notice } from '../../components/Notice';
import { RequireSession } from '../../components/RequireSession';
import type { ClubOutletContext } from '../../layouts/ClubLayout';
import { ApiError, errorMessage } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { useMyMembership, useRequestMembership, useTiers } from '../../lib/queries';
import type { ClubDetails, MembershipState, MyMembership } from '../../lib/types';

const MAX_NOTE_LENGTH = 500;
const REQUESTABLE_STATES: ReadonlySet<MembershipState> = new Set(['none', 'denied', 'cancelled', 'expired']);

function requestError(error: unknown): string {
	if (error instanceof ApiError && error.status === 429) return 'You’ve sent several requests recently. Try again later.';
	return errorMessage(error);
}

function ActiveMembership({ mine }: { mine: MyMembership }) {
	const membership = mine.membership;
	return (
		<div className="bg-ink p-6 text-paper md:p-10">
			<p className="flex items-center gap-3 font-display text-sm font-semibold uppercase tracking-[0.24em] text-paper/70">
				<span className="block h-0.5 w-8 bg-signal" aria-hidden />
				Active member
			</p>
			<p className="mt-3 font-display text-6xl font-bold uppercase leading-none">{membership?.tier?.name ?? 'Member'}</p>
			<dl className="mt-8 grid grid-cols-2 gap-6 border-t border-paper/20 pt-6">
				<div>
					<dt className="text-xs uppercase tracking-[0.16em] text-paper/60">Book ahead</dt>
					<dd className="font-display text-3xl font-bold">{mine.bookingWindowDays} days</dd>
				</div>
				{membership?.memberNumber && (
					<div>
						<dt className="text-xs uppercase tracking-[0.16em] text-paper/60">Member no.</dt>
						<dd className="font-display text-3xl font-bold">{membership.memberNumber}</dd>
					</div>
				)}
				{membership?.endsOn && (
					<div>
						<dt className="text-xs uppercase tracking-[0.16em] text-paper/60">Ends</dt>
						<dd className="font-display text-3xl font-bold">{shortDate(membership.endsOn)}</dd>
					</div>
				)}
			</dl>
		</div>
	);
}

function MembershipStatus({ club, mine }: { club: ClubDetails; mine: MyMembership }) {
	switch (mine.state) {
		case 'active':
			return <ActiveMembership mine={mine} />;
		case 'pending':
			return <Notice title="Request under review">Staff at {club.name} will review your request.</Notice>;
		case 'not_started':
			return (
				<Notice title="Membership approved">
					{mine.membership?.startsOn ? `Your membership starts ${shortDate(mine.membership.startsOn)}.` : 'Your membership starts soon.'}
				</Notice>
			);
		case 'suspended':
			return (
				<Notice tone="error" title="Membership on hold">
					Contact the pro shop about your membership.
				</Notice>
			);
		case 'denied':
			return <Notice title="Request not approved">You can send a new request below.</Notice>;
		case 'expired':
		case 'cancelled':
			return <Notice title="Membership ended">You can ask to rejoin below.</Notice>;
		case 'none':
			return null;
	}
}

function RequestForm({ club }: { club: ClubDetails }) {
	const { data: tiers = [] } = useTiers(club.slug);
	const request = useRequestMembership(club.slug);
	const [tierId, setTierId] = useState('');

	function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		const note = String(new FormData(event.currentTarget).get('note') ?? '').trim();
		request.mutate({ requestedTierId: tierId || undefined, note: note || undefined });
	}

	return (
		<form onSubmit={handleSubmit} className="space-y-6" aria-labelledby="request-heading">
			<div>
				<h2 id="request-heading" className="font-display text-3xl font-bold uppercase">
					Request membership
				</h2>
				<p className="mt-2 text-stone-600">Members book further ahead and get member rates for their guests. Staff review every request.</p>
			</div>

			{request.isError && (
				<Notice tone="error" title="Couldn’t send your request">
					{requestError(request.error)}
				</Notice>
			)}

			{tiers.length > 0 && (
				<fieldset>
					<legend className="mb-3 font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-600">
						Membership type (optional)
					</legend>
					<div className="grid gap-3 sm:grid-cols-2">
						{tiers.map((tier) => {
							const isSelected = tierId === tier.id;
							return (
								<label
									key={tier.id}
									className={`flex cursor-pointer flex-col border p-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-signal ${
										isSelected ? 'border-ink bg-ink text-paper' : 'border-stone-200 hover:border-ink'
									}`}
								>
									<input
										type="radio"
										name="tier"
										value={tier.id}
										checked={isSelected}
										onChange={() => setTierId(tier.id)}
										className="sr-only"
									/>
									<span className="font-display text-2xl font-bold uppercase">{tier.name}</span>
									<span className={`text-sm ${isSelected ? 'text-paper/70' : 'text-stone-600'}`}>
										Book {tier.bookingWindowDays} days ahead
									</span>
								</label>
							);
						})}
					</div>
				</fieldset>
			)}

			<div>
				<label
					htmlFor="membership-note"
					className="mb-2 block font-display text-sm font-semibold uppercase tracking-[0.16em] text-stone-600"
				>
					Note for staff (optional)
				</label>
				<textarea
					id="membership-note"
					name="note"
					rows={3}
					maxLength={MAX_NOTE_LENGTH}
					className="block w-full border border-stone-200 p-4 text-base hover:border-stone-400 focus:border-ink focus:outline-2 focus:outline-ink"
				/>
			</div>

			<Button type="submit" variant="signal" size="lg" isLoading={request.isPending}>
				Send request
			</Button>
		</form>
	);
}

function Membership() {
	const { club } = useOutletContext<ClubOutletContext>();
	const { data: mine, isPending, error } = useMyMembership(club.slug, true);

	if (isPending) return <Loading label="Loading membership" />;

	return (
		<main className="mx-auto max-w-3xl px-5 pb-10 pt-8 md:pt-12">
			<Eyebrow>{club.name}</Eyebrow>
			<h1 className="font-display text-5xl font-bold uppercase leading-[0.9] tracking-tight md:text-7xl">Membership</h1>
			<div className="mt-10 space-y-10">
				{error && (
					<Notice tone="error" title="Couldn’t load your membership">
						{errorMessage(error)}
					</Notice>
				)}
				{mine && <MembershipStatus club={club} mine={mine} />}
				{mine && REQUESTABLE_STATES.has(mine.state) && <RequestForm club={club} />}
				{mine?.state === 'active' && (
					<ButtonLink to={`/c/${club.slug}/book`} variant="signal" size="lg">
						Book a tee time
					</ButtonLink>
				)}
			</div>
		</main>
	);
}

export function MembershipPage() {
	return (
		<RequireSession>
			<Membership />
		</RequireSession>
	);
}
