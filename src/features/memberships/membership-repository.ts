import { and, asc, desc, eq, inArray, or, type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Database } from '../../db/client';
import type { IsoDate } from '../../lib/dates';
import { users } from '../auth/schema';
import {
	type MembershipEventAction,
	type MembershipEventChanges,
	membershipEvents,
	membershipInvites,
	memberships,
	type MembershipStatus,
	membershipTiers,
} from './schema';
import { type Tier, tierColumns } from './tier-repository';

export interface MembershipRow {
	id: string;
	userId: string;
	status: MembershipStatus;
	tierId: string | null;
	startsOn: IsoDate | null;
	endsOn: IsoDate | null;
}

export interface MembershipRecord {
	id: string;
	user: { id: string; name: string; email: string };
	status: MembershipStatus;
	tier: Tier | null;
	requestedTier: { id: string; name: string } | null;
	memberNumber: string | null;
	startsOn: IsoDate | null;
	endsOn: IsoDate | null;
	requestNote: string | null;
	decidedAt: Date | null;
}

export interface StaffMembershipRecord extends MembershipRecord {
	/** Other people at the same club with the same name (ignoring case and outer spaces). */
	possibleDuplicates: number;
}

export interface MembershipTerms {
	tierId: string;
	startsOn: IsoDate;
	endsOn: IsoDate | null;
	memberNumber: string | null;
}

export interface MembershipChanges {
	status?: MembershipStatus;
	tierId?: string;
	startsOn?: IsoDate;
	endsOn?: IsoDate | null;
	memberNumber?: string | null;
	decidedByUserId?: string;
	decidedAt?: Date;
}

/** An audit entry written in the same transaction as the change it describes. */
export interface AuditEntry {
	actorUserId: string | null;
	action: MembershipEventAction;
	changes: MembershipEventChanges;
	note: string | null;
	at: Date;
}

export interface MembershipEventRecord {
	id: string;
	membershipId: string;
	member: { id: string; name: string; email: string };
	action: MembershipEventAction;
	actor: { id: string | null; name: string | null; email: string | null } | null;
	changes: MembershipEventChanges;
	note: string | null;
	createdAt: Date;
}

export interface StaffListFilters {
	status?: MembershipStatus;
	search?: string;
}

/** Data access for memberships. Every query is scoped by `orgId` to keep clubs isolated. */
export interface MembershipRepository {
	findRowForUser(orgId: string, userId: string): Promise<MembershipRow | null>;
	findRecord(orgId: string, membershipId: string): Promise<MembershipRecord | null>;
	findRecordForUser(orgId: string, userId: string): Promise<MembershipRecord | null>;
	listForStaff(orgId: string, filters: StaffListFilters): Promise<StaffMembershipRecord[]>;
	/**
	 * Creates a pending request, or reopens a denied or cancelled membership as a request.
	 * Returns the membership id, or null if the golfer already has a pending, active or suspended membership.
	 */
	upsertRequest(
		orgId: string,
		userId: string,
		request: { requestedTierId: string | null; note: string | null },
		audit: AuditEntry,
	): Promise<string | null>;
	/** Applies changes only if the membership currently has one of `fromStatuses`. Returns whether it changed. */
	updateIfStatus(
		orgId: string,
		membershipId: string,
		fromStatuses: readonly MembershipStatus[],
		changes: MembershipChanges,
		audit: AuditEntry,
	): Promise<boolean>;
	hasCurrentMembershipForEmail(orgId: string, email: string): Promise<boolean>;
	/**
	 * Activates a membership from an invite and consumes the invite in one transaction. Returns the
	 * membership id, or null if the golfer already has an active or suspended membership.
	 */
	activateFromInvite(
		invite: { id: string; orgId: string; invitedByUserId: string | null },
		userId: string,
		terms: MembershipTerms,
		audit: AuditEntry,
	): Promise<string | null>;
	listEvents(orgId: string, options: { membershipId?: string; limit: number }): Promise<MembershipEventRecord[]>;
}

/** Statuses a new request or invite may replace. */
const REOPENABLE_STATUSES: readonly MembershipStatus[] = ['denied', 'cancelled'];
const INVITE_REPLACEABLE_STATUSES: readonly MembershipStatus[] = ['pending', 'denied', 'cancelled'];

const rowColumns = {
	id: memberships.id,
	userId: memberships.userId,
	status: memberships.status,
	tierId: memberships.tierId,
	startsOn: memberships.startsOn,
	endsOn: memberships.endsOn,
};

function escapeLikePattern(text: string): string {
	return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export function createMembershipRepository(db: Database): MembershipRepository {
	const requestedTiers = alias(membershipTiers, 'requested_tiers');

	const recordColumns = {
		id: memberships.id,
		user: { id: users.id, name: users.name, email: users.email },
		status: memberships.status,
		tier: tierColumns,
		requestedTier: { id: requestedTiers.id, name: requestedTiers.name },
		memberNumber: memberships.memberNumber,
		startsOn: memberships.startsOn,
		endsOn: memberships.endsOn,
		requestNote: memberships.requestNote,
		decidedAt: memberships.decidedAt,
	};

	const selectRecords = () =>
		db
			.select(recordColumns)
			.from(memberships)
			.innerJoin(users, eq(users.id, memberships.userId))
			.leftJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
			.leftJoin(requestedTiers, eq(requestedTiers.id, memberships.requestedTierId));

	const actors = alias(users, 'actor');

	/**
	 * Inserts an audit row only if the statement just before it in the batch changed a row
	 * (SQLite's changes()), and snapshots the actor's current name and email.
	 * Fields are listed in the table's column order, as INSERT ... SELECT requires.
	 */
	const auditIfChanged = (orgId: string, membershipId: SQL, audit: AuditEntry) =>
		db.insert(membershipEvents).select(
			db
				.select({
					id: sql<string>`${crypto.randomUUID()}`.as('id'),
					orgId: sql<string>`${orgId}`.as('org_id'),
					membershipId: sql<string>`${membershipId}`.as('membership_id'),
					actorUserId: sql<string | null>`${audit.actorUserId}`.as('actor_user_id'),
					actorName: sql<string | null>`${actors.name}`.as('actor_name'),
					actorEmail: sql<string | null>`${actors.email}`.as('actor_email'),
					action: sql<MembershipEventAction>`${audit.action}`.as('action'),
					changes: sql<string>`${JSON.stringify(audit.changes)}`.as('changes'),
					note: sql<string | null>`${audit.note}`.as('note'),
					createdAt: sql<number>`${audit.at.getTime()}`.as('created_at'),
				})
				.from(sql`(SELECT 1) AS anchor`)
				.leftJoin(actors, eq(actors.id, sql`${audit.actorUserId}`))
				.where(sql`changes() > 0`),
		);

	const membershipIdFor = (orgId: string, userId: string) =>
		sql`(SELECT ${memberships.id} FROM ${memberships} WHERE ${memberships.orgId} = ${orgId} AND ${memberships.userId} = ${userId})`;

	return {
		async findRowForUser(orgId, userId) {
			const [row] = await db
				.select(rowColumns)
				.from(memberships)
				.where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
				.limit(1);
			return row ?? null;
		},

		async findRecord(orgId, membershipId) {
			const [record] = await selectRecords()
				.where(and(eq(memberships.orgId, orgId), eq(memberships.id, membershipId)))
				.limit(1);
			return record ?? null;
		},

		async findRecordForUser(orgId, userId) {
			const [record] = await selectRecords()
				.where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
				.limit(1);
			return record ?? null;
		},

		async listForStaff(orgId, { status, search }) {
			const conditions: SQL[] = [eq(memberships.orgId, orgId)];
			if (status) conditions.push(eq(memberships.status, status));
			if (search) {
				const pattern = `%${escapeLikePattern(search.toLowerCase())}%`;
				const nameMatches = sql`lower(${users.name}) LIKE ${pattern} ESCAPE '\\'`;
				const emailMatches = sql`lower(${users.email}) LIKE ${pattern} ESCAPE '\\'`;
				conditions.push(or(nameMatches, emailMatches) as SQL);
			}

			const possibleDuplicates = sql<number>`(
				SELECT COUNT(*) FROM memberships AS other
				INNER JOIN users AS other_user ON other_user.id = other.user_id
				WHERE other.org_id = ${memberships.orgId}
					AND other.user_id <> ${memberships.userId}
					AND lower(trim(other_user.name)) = lower(trim(${users.name}))
			)`.mapWith(Number);

			return db
				.select({ ...recordColumns, possibleDuplicates })
				.from(memberships)
				.innerJoin(users, eq(users.id, memberships.userId))
				.leftJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
				.leftJoin(requestedTiers, eq(requestedTiers.id, memberships.requestedTierId))
				.where(and(...conditions))
				.orderBy(asc(memberships.createdAt), sql`${memberships}.rowid`);
		},

		async upsertRequest(orgId, userId, { requestedTierId, note }, audit) {
			const [written] = await db.batch([
				db
					.insert(memberships)
					.values({ orgId, userId, status: 'pending', requestedTierId, requestNote: note })
					.onConflictDoUpdate({
						target: [memberships.orgId, memberships.userId],
						set: {
							status: 'pending',
							requestedTierId,
							requestNote: note,
							decidedByUserId: null,
							decidedAt: null,
							updatedAt: audit.at,
						},
						setWhere: inArray(memberships.status, [...REOPENABLE_STATUSES]),
					})
					.returning({ id: memberships.id }),
				auditIfChanged(orgId, membershipIdFor(orgId, userId), audit),
			]);
			return written[0]?.id ?? null;
		},

		async updateIfStatus(orgId, membershipId, fromStatuses, changes, audit) {
			const [updated] = await db.batch([
				db
					.update(memberships)
					.set(changes)
					.where(and(eq(memberships.orgId, orgId), eq(memberships.id, membershipId), inArray(memberships.status, [...fromStatuses])))
					.returning({ id: memberships.id }),
				auditIfChanged(orgId, sql`${membershipId}`, audit),
			]);
			return updated.length > 0;
		},

		async hasCurrentMembershipForEmail(orgId, email) {
			const [row] = await db
				.select({ id: memberships.id })
				.from(memberships)
				.innerJoin(users, eq(users.id, memberships.userId))
				.where(
					and(eq(memberships.orgId, orgId), eq(users.email, email.toLowerCase()), inArray(memberships.status, ['active', 'suspended'])),
				)
				.limit(1);
			return row !== undefined;
		},

		async activateFromInvite(invite, userId, terms, audit) {
			// Name each column explicitly so no extra fields (like an id) can leak into the update.
			const activation = {
				status: 'active' as const,
				tierId: terms.tierId,
				startsOn: terms.startsOn,
				endsOn: terms.endsOn,
				memberNumber: terms.memberNumber,
				decidedByUserId: invite.invitedByUserId,
				decidedAt: audit.at,
			};
			const [written] = await db.batch([
				db
					.insert(memberships)
					.values({ orgId: invite.orgId, userId, ...activation })
					.onConflictDoUpdate({
						target: [memberships.orgId, memberships.userId],
						set: { ...activation, updatedAt: audit.at },
						setWhere: inArray(memberships.status, [...INVITE_REPLACEABLE_STATUSES]),
					})
					.returning({ id: memberships.id }),
				auditIfChanged(invite.orgId, membershipIdFor(invite.orgId, userId), audit),
				// An invite for someone who is already a member is consumed too; it has nothing left to grant.
				db.delete(membershipInvites).where(eq(membershipInvites.id, invite.id)),
			]);
			return written[0]?.id ?? null;
		},

		async listEvents(orgId, { membershipId, limit }) {
			const members = alias(users, 'members');
			const conditions = [eq(membershipEvents.orgId, orgId)];
			if (membershipId) conditions.push(eq(membershipEvents.membershipId, membershipId));

			const rows = await db
				.select({
					id: membershipEvents.id,
					membershipId: membershipEvents.membershipId,
					member: { id: members.id, name: members.name, email: members.email },
					action: membershipEvents.action,
					actorUserId: membershipEvents.actorUserId,
					actorName: membershipEvents.actorName,
					actorEmail: membershipEvents.actorEmail,
					changes: membershipEvents.changes,
					note: membershipEvents.note,
					createdAt: membershipEvents.createdAt,
				})
				.from(membershipEvents)
				.innerJoin(memberships, eq(memberships.id, membershipEvents.membershipId))
				.innerJoin(members, eq(members.id, memberships.userId))
				.where(and(...conditions))
				.orderBy(desc(membershipEvents.createdAt), sql`${membershipEvents}.rowid DESC`)
				.limit(limit);

			return rows.map(({ actorUserId, actorName, actorEmail, ...event }) => ({
				...event,
				actor: actorUserId || actorName || actorEmail ? { id: actorUserId, name: actorName, email: actorEmail } : null,
			}));
		},
	};
}
