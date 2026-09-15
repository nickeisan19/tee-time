import { z } from 'zod';
import { idSchema } from '../courses/validation';
import { isoDateSchema } from '../memberships/validation';
import { MAX_PLAYERS_PER_TEE_TIME } from '../tee-sheet/schema';

const MAX_GUEST_NAME_LENGTH = 60;

const holesSchema = z.union([z.literal(9), z.literal(18)]);

export const createBookingSchema = z
	.object({
		holes: holesSchema,
		teeTimeId: idSchema,
		routeId: idSchema.optional(),
		guests: z
			.array(z.object({ name: z.string().trim().min(1).max(MAX_GUEST_NAME_LENGTH) }))
			.max(MAX_PLAYERS_PER_TEE_TIME - 1)
			.default([]),
	})
	.refine((booking) => (booking.holes === 18) === (booking.routeId !== undefined), {
		message: '18-hole bookings need a routeId; 9-hole bookings must not have one',
		path: ['routeId'],
	});

export const availabilityQuerySchema = z.object({
	date: isoDateSchema,
	holes: z.coerce.number().pipe(holesSchema),
	players: z.coerce.number().int().min(1).max(MAX_PLAYERS_PER_TEE_TIME),
});

export const bookingsByDateQuerySchema = z.object({ date: isoDateSchema });

export type CreateBookingInput = z.output<typeof createBookingSchema>;
export type AvailabilityQuery = z.output<typeof availabilityQuerySchema>;
