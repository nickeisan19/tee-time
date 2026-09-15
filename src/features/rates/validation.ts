import { z } from 'zod';
import { idSchema } from '../courses/validation';
import { DAY_TYPES, HOLE_COUNTS, RATE_AUDIENCES } from './pricing';

const MAX_AMOUNT_CENTS = 1_000_000;

export const setRateSchema = z
	.object({
		holes: z
			.number()
			.refine((holes): holes is (typeof HOLE_COUNTS)[number] => (HOLE_COUNTS as readonly number[]).includes(holes), 'Use 9 or 18 holes'),
		audience: z.enum(RATE_AUDIENCES),
		tierId: idSchema.optional(),
		dayType: z.enum(DAY_TYPES),
		amountCents: z.number().int().min(0).max(MAX_AMOUNT_CENTS),
	})
	.refine((rate) => (rate.audience === 'public') === (rate.tierId === undefined), {
		message: 'Member and member-guest rates need a tier; public rates must not have one',
		path: ['tierId'],
	});

export type SetRateInput = z.output<typeof setRateSchema>;
