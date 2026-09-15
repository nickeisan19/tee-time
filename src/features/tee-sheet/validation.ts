import { z } from 'zod';
import { daysBetween, parseClockTime } from '../../lib/zoned-time';
import { idSchema } from '../courses/validation';
import { isoDateSchema } from '../memberships/validation';
import { TEE_SHEET_LIMITS } from './limits';
import { MAX_PLAYERS_PER_TEE_TIME, TEE_TIME_STATUSES } from './schema';

export const MAX_GENERATION_DAYS = 365;
const MAX_INTERVAL_MINUTES = 120;
const DAYS_PER_WEEK = 7;
const MAX_NINES_PER_UPDATE = 20;

export const clockTimeSchema = z.string().refine((value) => parseClockTime(value) !== null, 'Use a 24-hour time like 07:30');

export const teeSheetRuleSchema = z
	.object({
		dayOfWeek: z.number().int().min(0).max(6),
		firstTee: clockTimeSchema,
		lastTee: clockTimeSchema,
		intervalMinutes: z.number().int().min(TEE_SHEET_LIMITS.minIntervalMinutes).max(MAX_INTERVAL_MINUTES),
		maxPlayers: z.number().int().min(1).max(MAX_PLAYERS_PER_TEE_TIME),
	})
	.refine((rule) => rule.lastTee >= rule.firstTee, { message: 'Last tee time must not be before the first', path: ['lastTee'] });

export const setTeeSheetRulesSchema = z.object({
	rules: z
		.array(teeSheetRuleSchema)
		.max(DAYS_PER_WEEK)
		.refine((rules) => new Set(rules.map((rule) => rule.dayOfWeek)).size === rules.length, 'Use at most one rule per day of the week'),
});

export const generateTeeSheetSchema = z
	.object({ fromDate: isoDateSchema, toDate: isoDateSchema })
	.refine(({ fromDate, toDate }) => toDate >= fromDate, { message: 'End date must not be before the start date', path: ['toDate'] })
	.refine(({ fromDate, toDate }) => daysBetween(fromDate, toDate) <= MAX_GENERATION_DAYS, {
		message: `Generate at most ${MAX_GENERATION_DAYS} days at a time`,
		path: ['toDate'],
	});

export const teeSheetQuerySchema = z.object({ date: isoDateSchema });

export const updateTeeTimesSchema = z
	.object({
		date: isoDateSchema,
		fromTime: clockTimeSchema,
		toTime: clockTimeSchema,
		nineIds: z.array(idSchema).min(1).max(MAX_NINES_PER_UPDATE).optional(),
		status: z.enum(TEE_TIME_STATUSES).optional(),
		membersOnly: z.boolean().optional(),
	})
	.refine((update) => update.toTime >= update.fromTime, { message: 'End time must not be before the start time', path: ['toTime'] })
	.refine((update) => update.status !== undefined || update.membersOnly !== undefined, 'Provide a status or membersOnly to change');

export type TeeSheetRuleInput = z.output<typeof teeSheetRuleSchema>;
export type UpdateTeeTimesInput = z.output<typeof updateTeeTimesSchema>;
