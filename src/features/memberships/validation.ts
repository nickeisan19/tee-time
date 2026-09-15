import { z } from 'zod';
import { bookingWindowDaysSchema } from '../organizations/validation';

const MAX_TIER_NAME_LENGTH = 60;
const MAX_NOTE_LENGTH = 500;
const MAX_MEMBER_NUMBER_LENGTH = 40;
const MAX_TOKEN_LENGTH = 200;

/** A real calendar date as YYYY-MM-DD (rejects e.g. 2026-02-30). */
export const isoDateSchema = z.iso.date();
const idSchema = z.string().min(1).max(64);
const memberNumberSchema = z.string().trim().min(1).max(MAX_MEMBER_NUMBER_LENGTH);

const endsOnOrAfterStart = (terms: { startsOn: string; endsOn?: string | null }) => !terms.endsOn || terms.endsOn >= terms.startsOn;
const DATE_ORDER_MESSAGE = { message: 'End date must be on or after the start date', path: ['endsOn'] };

export const createTierSchema = z.object({
	name: z.string().trim().min(1).max(MAX_TIER_NAME_LENGTH),
	bookingWindowDays: bookingWindowDaysSchema,
});

export const updateTierSchema = createTierSchema
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, { message: 'Provide at least one field to update' });

export const membershipRequestSchema = z.object({
	requestedTierId: idSchema.optional(),
	note: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});

export const approveMembershipSchema = z
	.object({
		tierId: idSchema,
		startsOn: isoDateSchema,
		endsOn: isoDateSchema.optional(),
		memberNumber: memberNumberSchema.optional(),
	})
	.refine(endsOnOrAfterStart, DATE_ORDER_MESSAGE);

export const denyMembershipSchema = z.object({
	reason: z.string().trim().max(MAX_NOTE_LENGTH).optional(),
});

/** Statuses staff can set directly. `pending` and `denied` only come from the request flow. */
export const MANAGED_STATUSES = ['active', 'suspended', 'cancelled'] as const;

export const updateMembershipSchema = z
	.object({
		status: z.enum(MANAGED_STATUSES),
		tierId: idSchema,
		startsOn: isoDateSchema,
		endsOn: isoDateSchema.nullable(),
		memberNumber: memberNumberSchema.nullable(),
	})
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, { message: 'Provide at least one field to update' });

const MAX_SEARCH_LENGTH = 100;
const MAX_EVENTS_PAGE_SIZE = 200;
const DEFAULT_EVENTS_PAGE_SIZE = 100;

export const listMembershipsQuerySchema = z.object({
	status: z.enum(['pending', 'denied', 'active', 'suspended', 'cancelled']).optional(),
	/** Matches part of the golfer's name or email, ignoring case. */
	q: z.string().trim().max(MAX_SEARCH_LENGTH).optional(),
});

export const membershipEventsQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(MAX_EVENTS_PAGE_SIZE).default(DEFAULT_EVENTS_PAGE_SIZE),
});

export const membershipInviteSchema = z
	.object({
		email: z.email().transform((email) => email.toLowerCase()),
		tierId: idSchema,
		startsOn: isoDateSchema,
		endsOn: isoDateSchema.optional(),
		memberNumber: memberNumberSchema.optional(),
	})
	.refine(endsOnOrAfterStart, DATE_ORDER_MESSAGE);

export const acceptMembershipInviteSchema = z.object({
	token: z.string().min(1).max(MAX_TOKEN_LENGTH),
});

export type CreateTierInput = z.output<typeof createTierSchema>;
export type UpdateTierInput = z.output<typeof updateTierSchema>;
export type MembershipRequestInput = z.output<typeof membershipRequestSchema>;
export type ApproveMembershipInput = z.output<typeof approveMembershipSchema>;
export type DenyMembershipInput = z.output<typeof denyMembershipSchema>;
export type UpdateMembershipInput = z.output<typeof updateMembershipSchema>;
export type MembershipInviteInput = z.output<typeof membershipInviteSchema>;
