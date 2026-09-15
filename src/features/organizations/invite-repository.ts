import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { orgStaff, type StaffRole, staffInvites } from './schema';

export interface PendingInvite {
	id: string;
	email: string;
	role: StaffRole;
	expiresAt: Date;
}

export interface StoredInvite extends PendingInvite {
	orgId: string;
}

export interface NewInvite {
	orgId: string;
	email: string;
	role: StaffRole;
	tokenHash: string;
	invitedByUserId: string;
	expiresAt: Date;
}

/** Data access for staff invites. Club-facing reads and deletes are scoped by `orgId`. */
export interface InviteRepository {
	/**
	 * Creates the invite, or replaces the pending invite for the same club and email when that
	 * invite's role is in `replaceableRoles`. Returns false if an existing invite was left untouched.
	 */
	upsert(invite: NewInvite, replaceableRoles: readonly StaffRole[]): Promise<boolean>;
	listPending(orgId: string, now: Date): Promise<PendingInvite[]>;
	findInClub(orgId: string, inviteId: string): Promise<PendingInvite | null>;
	findByTokenHash(tokenHash: string): Promise<StoredInvite | null>;
	revoke(orgId: string, inviteId: string): Promise<void>;
	/** Adds the user to staff and consumes the invite in one transaction. */
	accept(invite: StoredInvite, userId: string): Promise<void>;
}

const pendingColumns = {
	id: staffInvites.id,
	email: staffInvites.email,
	role: staffInvites.role,
	expiresAt: staffInvites.expiresAt,
};

export function createInviteRepository(db: Database): InviteRepository {
	return {
		async upsert(invite, replaceableRoles) {
			// The role guard lives in the same statement so a concurrent change can't slip past it.
			// When the guard blocks the update, SQLite returns no row.
			const written = await db
				.insert(staffInvites)
				.values(invite)
				.onConflictDoUpdate({
					target: [staffInvites.orgId, staffInvites.email],
					set: {
						role: invite.role,
						tokenHash: invite.tokenHash,
						invitedByUserId: invite.invitedByUserId,
						expiresAt: invite.expiresAt,
						createdAt: new Date(),
					},
					setWhere: inArray(staffInvites.role, [...replaceableRoles]),
				})
				.returning({ id: staffInvites.id });
			return written.length > 0;
		},

		async listPending(orgId, now) {
			return db
				.select(pendingColumns)
				.from(staffInvites)
				.where(and(eq(staffInvites.orgId, orgId), gt(staffInvites.expiresAt, now)))
				.orderBy(asc(staffInvites.createdAt), sql`${staffInvites}.rowid`);
		},

		async findInClub(orgId, inviteId) {
			const [invite] = await db
				.select(pendingColumns)
				.from(staffInvites)
				.where(and(eq(staffInvites.orgId, orgId), eq(staffInvites.id, inviteId)))
				.limit(1);
			return invite ?? null;
		},

		async findByTokenHash(tokenHash) {
			const [invite] = await db
				.select({ ...pendingColumns, orgId: staffInvites.orgId })
				.from(staffInvites)
				.where(eq(staffInvites.tokenHash, tokenHash))
				.limit(1);
			return invite ?? null;
		},

		async revoke(orgId, inviteId) {
			await db.delete(staffInvites).where(and(eq(staffInvites.orgId, orgId), eq(staffInvites.id, inviteId)));
		},

		async accept(invite, userId) {
			await db.batch([
				db.insert(orgStaff).values({ orgId: invite.orgId, userId, role: invite.role }),
				db.delete(staffInvites).where(eq(staffInvites.id, invite.id)),
			]);
		},
	};
}
