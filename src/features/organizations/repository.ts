import { and, asc, eq, ne, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { users } from '../auth/schema';
import { DEFAULT_CANCELLATION_CUTOFF_HOURS, DEFAULT_PUBLIC_BOOKING_WINDOW_DAYS, organizations, orgStaff, type StaffRole } from './schema';
import type { ClubSettingsInput, CreateClubInput } from './validation';

export interface Club {
	id: string;
	name: string;
	slug: string;
	timezone: string;
	publicBookingWindowDays: number;
	cancellationCutoffHours: number;
}

export interface StaffMember {
	userId: string;
	name: string;
	email: string;
	role: StaffRole;
}

/** Data access for clubs. Every staff query is scoped by `orgId` to keep tenants isolated. */
export interface OrganizationRepository {
	findBySlug(slug: string): Promise<Club | null>;
	findById(orgId: string): Promise<Club | null>;
	createWithOwner(input: CreateClubInput, ownerUserId: string): Promise<Club>;
	updateSettings(orgId: string, settings: ClubSettingsInput): Promise<Club>;
	findStaffRole(orgId: string, userId: string): Promise<StaffRole | null>;
	hasStaffWithEmail(orgId: string, email: string): Promise<boolean>;
	listStaff(orgId: string): Promise<StaffMember[]>;
	/** Removes the staff member unless they are the club's only owner. Returns whether a row was deleted. */
	removeStaffKeepingAnOwner(orgId: string, userId: string): Promise<boolean>;
}

const clubColumns = {
	id: organizations.id,
	name: organizations.name,
	slug: organizations.slug,
	timezone: organizations.timezone,
	publicBookingWindowDays: organizations.publicBookingWindowDays,
	cancellationCutoffHours: organizations.cancellationCutoffHours,
};

export function createOrganizationRepository(db: Database): OrganizationRepository {
	return {
		async findBySlug(slug) {
			const [club] = await db.select(clubColumns).from(organizations).where(eq(organizations.slug, slug)).limit(1);
			return club ?? null;
		},

		async findById(orgId) {
			const [club] = await db.select(clubColumns).from(organizations).where(eq(organizations.id, orgId)).limit(1);
			return club ?? null;
		},

		async createWithOwner(input, ownerUserId) {
			const id = crypto.randomUUID();
			// D1 runs a batch as one transaction: the club never exists without its owner.
			await db.batch([
				db.insert(organizations).values({ id, ...input }),
				db.insert(orgStaff).values({ orgId: id, userId: ownerUserId, role: 'owner' }),
			]);
			return {
				id,
				...input,
				publicBookingWindowDays: DEFAULT_PUBLIC_BOOKING_WINDOW_DAYS,
				cancellationCutoffHours: DEFAULT_CANCELLATION_CUTOFF_HOURS,
			};
		},

		async updateSettings(orgId, settings) {
			const [club] = await db.update(organizations).set(settings).where(eq(organizations.id, orgId)).returning(clubColumns);
			return club;
		},

		async findStaffRole(orgId, userId) {
			const [row] = await db
				.select({ role: orgStaff.role })
				.from(orgStaff)
				.where(and(eq(orgStaff.orgId, orgId), eq(orgStaff.userId, userId)))
				.limit(1);
			return row?.role ?? null;
		},

		async listStaff(orgId) {
			return db
				.select({ userId: orgStaff.userId, name: users.name, email: users.email, role: orgStaff.role })
				.from(orgStaff)
				.innerJoin(users, eq(users.id, orgStaff.userId))
				.where(eq(orgStaff.orgId, orgId))
				.orderBy(asc(orgStaff.createdAt), sql`${orgStaff}.rowid`);
		},

		async hasStaffWithEmail(orgId, email) {
			const [row] = await db
				.select({ userId: orgStaff.userId })
				.from(orgStaff)
				.innerJoin(users, eq(users.id, orgStaff.userId))
				.where(and(eq(orgStaff.orgId, orgId), eq(users.email, email.toLowerCase())))
				.limit(1);
			return row !== undefined;
		},

		async removeStaffKeepingAnOwner(orgId, userId) {
			// Single statement so two owners removing each other at once can't leave the club ownerless.
			const otherOwnerExists = sql`(SELECT COUNT(*) FROM ${orgStaff} WHERE ${orgStaff.orgId} = ${orgId} AND ${orgStaff.role} = 'owner') > 1`;
			const deleted = await db
				.delete(orgStaff)
				.where(and(eq(orgStaff.orgId, orgId), eq(orgStaff.userId, userId), or(ne(orgStaff.role, 'owner'), otherOwnerExists)))
				.returning({ userId: orgStaff.userId });
			return deleted.length > 0;
		},
	};
}
