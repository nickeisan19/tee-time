import { z } from 'zod';
import { MAX_TURN_MINUTES, MIN_TURN_MINUTES } from './schema';

const MAX_NAME_LENGTH = 60;
const MAX_SORT_ORDER = 1000;
const NINES_PER_ROUTE = 2;
/** Enough for large multi-course facilities; bounds tee sheet generation cost. */
export const MAX_NINES_PER_CLUB = 18;

const nameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH);
export const idSchema = z.string().min(1).max(64);

export const createNineSchema = z.object({
	name: nameSchema,
	sortOrder: z.number().int().min(0).max(MAX_SORT_ORDER).optional(),
	turnMinutes: z.number().int().min(MIN_TURN_MINUTES).max(MAX_TURN_MINUTES).optional(),
});

export const updateNineSchema = createNineSchema
	.partial()
	.refine((patch) => Object.keys(patch).length > 0, { message: 'Provide at least one field to update' });

export const createRouteSchema = z.object({
	name: nameSchema,
	nineIds: z
		.array(idSchema)
		.length(NINES_PER_ROUTE, 'An 18-hole route uses exactly two nines')
		.refine(([first, second]) => first !== second, 'A route must use two different nines'),
});

export const updateRouteSchema = z.object({ name: nameSchema });

export type CreateNineInput = z.output<typeof createNineSchema>;
export type UpdateNineInput = z.output<typeof updateNineSchema>;
export type CreateRouteInput = z.output<typeof createRouteSchema>;
