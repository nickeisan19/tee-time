import type { SessionUser } from '../../app-env';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors';
import { clubToday } from '../../lib/dates';
import type { EmailSender } from '../../lib/email';
import { conflict, notFound, validationError } from '../../lib/errors';
import type { RateLimiter } from '../../lib/rate-limit';
import { loadClub, requireClubManager, requireStaffRole } from '../organizations/club-access';
import type { Club, OrganizationRepository } from '../organizations/repository';
import type {
	MembershipChanges,
	MembershipEventRecord,
	MembershipRecord,
	MembershipRepository,
	StaffMembershipRecord,
	StaffListFilters,
} from './membership-repository';
import { MEMBERSHIP_REQUEST_RATE_LIMITS } from './rate-limits';
import type { MembershipEventChanges, MembershipStatus } from './schema';
import { bookingWindowDays, type MembershipState, membershipState } from './standing';
import type { Tier, TierRepository } from './tier-repository';
import {
	type ApproveMembershipInput,
	type DenyMembershipInput,
	MANAGED_STATUSES,
	type MembershipRequestInput,
	type UpdateMembershipInput,
} from './validation';

export interface MembershipView extends MembershipRecord {
	state: MembershipState;
}

export interface StaffMembershipView extends StaffMembershipRecord {
	state: MembershipState;
}

export interface MyMembership {
	membership: MembershipView | null;
	state: MembershipState;
	bookingWindowDays: number;
}

interface MembershipServiceDependencies {
	organizations: OrganizationRepository;
	tiers: TierRepository;
	memberships: MembershipRepository;
	emailSender: EmailSender;
	rateLimiter?: RateLimiter;
	now?: () => Date;
}

export interface MembershipService {
	request(slug: string, golfer: SessionUser, input: MembershipRequestInput): Promise<MembershipView>;
	mine(slug: string, golfer: SessionUser): Promise<MyMembership>;
	list(slug: string, actorUserId: string, filters: StaffListFilters): Promise<StaffMembershipView[]>;
	approve(slug: string, actorUserId: string, membershipId: string, input: ApproveMembershipInput): Promise<MembershipView>;
	deny(slug: string, actorUserId: string, membershipId: string, input: DenyMembershipInput): Promise<MembershipView>;
	update(slug: string, actorUserId: string, membershipId: string, input: UpdateMembershipInput): Promise<MembershipView>;
	membershipEvents(slug: string, actorUserId: string, membershipId: string): Promise<MembershipEventRecord[]>;
	clubEvents(slug: string, actorUserId: string, limit: number): Promise<MembershipEventRecord[]>;
}

/** The parts of a membership the audit log tracks. Tiers are logged as `{ id, name }`. */
export interface AuditedTerms {
	status: MembershipStatus | null;
	tier: { id: string; name: string } | null;
	startsOn: string | null;
	endsOn: string | null;
	memberNumber: string | null;
}

const EMPTY_TERMS: AuditedTerms = { status: null, tier: null, startsOn: null, endsOn: null, memberNumber: null };
const MEMBERSHIP_EVENTS_LIMIT = 200;

export function auditedTermsOf(record: MembershipRecord | null): AuditedTerms {
	if (!record) return EMPTY_TERMS;
	return {
		status: record.status,
		tier: record.tier ? { id: record.tier.id, name: record.tier.name } : null,
		startsOn: record.startsOn,
		endsOn: record.endsOn,
		memberNumber: record.memberNumber,
	};
}

/** Lists only the fields whose values differ between `before` and `after`. */
export function diffTerms(before: AuditedTerms, after: Partial<AuditedTerms>): MembershipEventChanges {
	const changes: MembershipEventChanges = {};
	for (const field of Object.keys(after) as (keyof AuditedTerms)[]) {
		const from = before[field];
		const to = after[field] ?? null;
		const same = field === 'tier' ? before.tier?.id === (to as AuditedTerms['tier'])?.id : from === to;
		if (!same) changes[field] = { from, to };
	}
	return changes;
}

export function toMembershipView<Record extends MembershipRecord>(record: Record, today: string): Record & { state: MembershipState } {
	return { ...record, state: membershipState(record, today) };
}

/** Maps constraint failures from a membership write to client-safe errors. */
export function rethrowMembershipWriteError(error: unknown): never {
	if (isUniqueViolation(error, 'memberships.member_number')) {
		throw conflict('MEMBER_NUMBER_TAKEN', 'Another member at this club already has that member number');
	}
	// The tier passed validation but was deleted before the write landed.
	if (isForeignKeyViolation(error)) throw notFound('Membership tier not found');
	throw error;
}

const tierSummary = (tier: Tier) => ({ id: tier.id, name: tier.name });

export function createMembershipService({
	organizations,
	tiers,
	memberships,
	emailSender,
	rateLimiter,
	now = () => new Date(),
}: MembershipServiceDependencies): MembershipService {
	const today = (club: Club) => clubToday(club.timezone, now());

	async function requireTierInClub(club: Club, tierId: string): Promise<Tier> {
		const tier = await tiers.findInClub(club.id, tierId);
		if (!tier) throw notFound('Membership tier not found');
		return tier;
	}

	async function requireRecordInClub(club: Club, membershipId: string): Promise<MembershipRecord> {
		const record = await memberships.findRecord(club.id, membershipId);
		if (!record) throw notFound('Membership not found');
		return record;
	}

	async function viewOf(club: Club, membershipId: string): Promise<MembershipView> {
		return toMembershipView(await requireRecordInClub(club, membershipId), today(club));
	}

	function invalidStatus(status: MembershipStatus, action: string) {
		return conflict('INVALID_STATUS', `A ${status} membership cannot be ${action}`);
	}

	return {
		async request(slug, golfer, { requestedTierId, note }) {
			const club = await loadClub(organizations, slug);
			const requestedTier = requestedTierId ? await requireTierInClub(club, requestedTierId) : null;
			await rateLimiter?.enforce([{ rule: MEMBERSHIP_REQUEST_RATE_LIMITS.requester, subject: golfer.id }]);

			const existing = await memberships.findRowForUser(club.id, golfer.id);
			const requestNote = note || null;
			const changes: MembershipEventChanges = { status: { from: existing?.status ?? null, to: 'pending' } };
			if (requestedTier) changes.requestedTier = { from: null, to: tierSummary(requestedTier) };

			const membershipId = await memberships.upsertRequest(
				club.id,
				golfer.id,
				{ requestedTierId: requestedTier?.id ?? null, note: requestNote },
				{ actorUserId: golfer.id, action: 'requested', changes, note: requestNote, at: now() },
			);
			if (!membershipId) {
				const current = await memberships.findRowForUser(club.id, golfer.id);
				if (current?.status === 'pending') throw conflict('REQUEST_PENDING', 'You already have a membership request waiting for review');
				throw conflict('ALREADY_MEMBER', 'You already have a membership at this club');
			}
			return viewOf(club, membershipId);
		},

		async mine(slug, golfer) {
			const club = await loadClub(organizations, slug);
			const record = await memberships.findRecordForUser(club.id, golfer.id);
			const membership = record ? toMembershipView(record, today(club)) : null;
			const state = membership?.state ?? 'none';
			return {
				membership,
				state,
				bookingWindowDays: bookingWindowDays(state, membership?.tier?.bookingWindowDays ?? null, club.publicBookingWindowDays),
			};
		},

		async list(slug, actorUserId, filters) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			const records = await memberships.listForStaff(club.id, filters);
			return records.map((record) => toMembershipView(record, today(club)));
		},

		async approve(slug, actorUserId, membershipId, { tierId, startsOn, endsOn, memberNumber }) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			const before = await requireRecordInClub(club, membershipId);
			if (before.status !== 'pending') throw invalidStatus(before.status, 'approved');
			const tier = await requireTierInClub(club, tierId);

			const after: AuditedTerms = {
				status: 'active',
				tier: tierSummary(tier),
				startsOn,
				endsOn: endsOn ?? null,
				memberNumber: memberNumber ?? null,
			};
			const decidedAt = now();
			const approved = await memberships
				.updateIfStatus(
					club.id,
					membershipId,
					['pending'],
					{
						status: 'active',
						tierId,
						startsOn,
						endsOn: after.endsOn,
						memberNumber: after.memberNumber,
						decidedByUserId: actorUserId,
						decidedAt,
					},
					{ actorUserId, action: 'approved', changes: diffTerms(auditedTermsOf(before), after), note: null, at: decidedAt },
				)
				.catch(rethrowMembershipWriteError);
			if (!approved) throw conflict('INVALID_STATUS', 'This request was already decided');

			const view = await viewOf(club, membershipId);
			await emailSender.send({
				to: view.user.email,
				subject: `Your ${club.name} membership was approved`,
				text:
					`Welcome to ${club.name}! Your ${tier.name} membership starts on ${startsOn}` + (endsOn ? ` and runs through ${endsOn}.` : '.'),
			});
			return view;
		},

		async deny(slug, actorUserId, membershipId, { reason }) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			const before = await requireRecordInClub(club, membershipId);
			if (before.status !== 'pending') throw invalidStatus(before.status, 'denied');

			const decidedAt = now();
			const denied = await memberships.updateIfStatus(
				club.id,
				membershipId,
				['pending'],
				{ status: 'denied', decidedByUserId: actorUserId, decidedAt },
				{
					actorUserId,
					action: 'denied',
					changes: diffTerms(auditedTermsOf(before), { status: 'denied' }),
					note: reason || null,
					at: decidedAt,
				},
			);
			if (!denied) throw conflict('INVALID_STATUS', 'This request was already decided');

			const view = await viewOf(club, membershipId);
			await emailSender.send({
				to: view.user.email,
				subject: `Update on your ${club.name} membership request`,
				text: `Your membership request at ${club.name} was not approved.` + (reason ? `\n\nReason: ${reason}` : ''),
			});
			return view;
		},

		async update(slug, actorUserId, membershipId, input) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			const before = await requireRecordInClub(club, membershipId);
			if (!(MANAGED_STATUSES as readonly string[]).includes(before.status)) throw invalidStatus(before.status, 'updated');
			const tier = input.tierId ? await requireTierInClub(club, input.tierId) : null;

			const startsOn = input.startsOn ?? before.startsOn;
			const endsOn = input.endsOn === undefined ? before.endsOn : input.endsOn;
			if (startsOn && endsOn && endsOn < startsOn) throw validationError('endsOn: End date must be on or after the start date');

			const requested: Partial<AuditedTerms> = {};
			if (input.status !== undefined) requested.status = input.status;
			if (tier) requested.tier = tierSummary(tier);
			if (input.startsOn !== undefined) requested.startsOn = input.startsOn;
			if (input.endsOn !== undefined) requested.endsOn = input.endsOn;
			if (input.memberNumber !== undefined) requested.memberNumber = input.memberNumber;
			const changes = diffTerms(auditedTermsOf(before), requested);
			if (Object.keys(changes).length === 0) return toMembershipView(before, today(club));

			const updates: MembershipChanges = {};
			if ('status' in changes) updates.status = input.status;
			if ('tier' in changes) updates.tierId = input.tierId;
			if ('startsOn' in changes) updates.startsOn = input.startsOn;
			if ('endsOn' in changes) updates.endsOn = input.endsOn;
			if ('memberNumber' in changes) updates.memberNumber = input.memberNumber;

			const updated = await memberships
				.updateIfStatus(club.id, membershipId, MANAGED_STATUSES, updates, {
					actorUserId,
					action: 'updated',
					changes,
					note: null,
					at: now(),
				})
				.catch(rethrowMembershipWriteError);
			if (!updated) throw conflict('INVALID_STATUS', 'This membership changed while you were editing it');
			return viewOf(club, membershipId);
		},

		async membershipEvents(slug, actorUserId, membershipId) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			await requireRecordInClub(club, membershipId);
			return memberships.listEvents(club.id, { membershipId, limit: MEMBERSHIP_EVENTS_LIMIT });
		},

		async clubEvents(slug, actorUserId, limit) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			return memberships.listEvents(club.id, { limit });
		},
	};
}
