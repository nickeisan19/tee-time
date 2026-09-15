import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import type { IsoDate } from '../../lib/dates';
import { membershipInvites, membershipTiers } from './schema';

export interface PendingMembershipInvite {
	id: string;
	email: string;
	tier: { id: string; name: string };
	startsOn: IsoDate;
	endsOn: IsoDate | null;
	memberNumber: string | null;
	expiresAt: Date;
}

export interface StoredMembershipInvite {
	id: string;
	orgId: string;
	email: string;
	tierId: string;
	startsOn: IsoDate;
	endsOn: IsoDate | null;
	memberNumber: string | null;
	invitedByUserId: string | null;
	expiresAt: Date;
}

export interface NewMembershipInvite {
	orgId: string;
	email: string;
	tierId: string;
	startsOn: IsoDate;
	endsOn: IsoDate | null;
	memberNumber: string | null;
	tokenHash: string;
	invitedByUserId: string;
	expiresAt: Date;
}

/** Data access for membership invites. Club-facing reads and deletes are scoped by `orgId`. */
export interface MembershipInviteRepository {
	/** Creates the invite, or replaces the pending invite for the same club and email. */
	upsert(invite: NewMembershipInvite): Promise<void>;
	listPending(orgId: string, now: Date): Promise<PendingMembershipInvite[]>;
	findByTokenHash(tokenHash: string): Promise<StoredMembershipInvite | null>;
	revoke(orgId: string, inviteId: string): Promise<boolean>;
}

export function createMembershipInviteRepository(db: Database): MembershipInviteRepository {
	return {
		async upsert(invite) {
			await db
				.insert(membershipInvites)
				.values(invite)
				.onConflictDoUpdate({
					target: [membershipInvites.orgId, membershipInvites.email],
					set: {
						tierId: invite.tierId,
						startsOn: invite.startsOn,
						endsOn: invite.endsOn,
						memberNumber: invite.memberNumber,
						tokenHash: invite.tokenHash,
						invitedByUserId: invite.invitedByUserId,
						expiresAt: invite.expiresAt,
						createdAt: new Date(),
					},
				});
		},

		async listPending(orgId, now) {
			return db
				.select({
					id: membershipInvites.id,
					email: membershipInvites.email,
					tier: { id: membershipTiers.id, name: membershipTiers.name },
					startsOn: membershipInvites.startsOn,
					endsOn: membershipInvites.endsOn,
					memberNumber: membershipInvites.memberNumber,
					expiresAt: membershipInvites.expiresAt,
				})
				.from(membershipInvites)
				.innerJoin(membershipTiers, eq(membershipTiers.id, membershipInvites.tierId))
				.where(and(eq(membershipInvites.orgId, orgId), gt(membershipInvites.expiresAt, now)))
				.orderBy(asc(membershipInvites.createdAt), sql`${membershipInvites}.rowid`);
		},

		async findByTokenHash(tokenHash) {
			const [invite] = await db
				.select({
					id: membershipInvites.id,
					orgId: membershipInvites.orgId,
					email: membershipInvites.email,
					tierId: membershipInvites.tierId,
					startsOn: membershipInvites.startsOn,
					endsOn: membershipInvites.endsOn,
					memberNumber: membershipInvites.memberNumber,
					invitedByUserId: membershipInvites.invitedByUserId,
					expiresAt: membershipInvites.expiresAt,
				})
				.from(membershipInvites)
				.where(eq(membershipInvites.tokenHash, tokenHash))
				.limit(1);
			return invite ?? null;
		},

		async revoke(orgId, inviteId) {
			const deleted = await db
				.delete(membershipInvites)
				.where(and(eq(membershipInvites.orgId, orgId), eq(membershipInvites.id, inviteId)))
				.returning({ id: membershipInvites.id });
			return deleted.length > 0;
		},
	};
}
