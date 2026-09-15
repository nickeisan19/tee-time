import { z } from 'zod';
import { MAX_BOOKING_WINDOW_DAYS, MAX_CANCELLATION_CUTOFF_HOURS, STAFF_ROLES } from './schema';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_SLUG_LENGTH = 2;
const MAX_SLUG_LENGTH = 60;
const MAX_NAME_LENGTH = 120;
const MAX_TOKEN_LENGTH = 200;

function isKnownTimezone(timezone: string): boolean {
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });
		return true;
	} catch {
		return false;
	}
}

export const createClubSchema = z.object({
	name: z.string().trim().min(1).max(MAX_NAME_LENGTH),
	slug: z.string().min(MIN_SLUG_LENGTH).max(MAX_SLUG_LENGTH).regex(SLUG_PATTERN, 'Use lowercase letters, numbers and single hyphens'),
	timezone: z.string().refine(isKnownTimezone, 'Unknown timezone'),
});

export const bookingWindowDaysSchema = z.number().int().min(0).max(MAX_BOOKING_WINDOW_DAYS);

export const clubSettingsSchema = z
	.object({
		publicBookingWindowDays: bookingWindowDaysSchema,
		cancellationCutoffHours: z.number().int().min(0).max(MAX_CANCELLATION_CUTOFF_HOURS),
	})
	.partial()
	.refine((settings) => Object.keys(settings).length > 0, { message: 'Provide at least one setting to update' });

export const inviteStaffSchema = z.object({
	email: z.email().transform((email) => email.toLowerCase()),
	role: z.enum(STAFF_ROLES),
});

export const acceptInviteSchema = z.object({
	token: z.string().min(1).max(MAX_TOKEN_LENGTH),
});

export type CreateClubInput = z.output<typeof createClubSchema>;
export type InviteStaffInput = z.output<typeof inviteStaffSchema>;
export type ClubSettingsInput = z.output<typeof clubSettingsSchema>;
