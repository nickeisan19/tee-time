import { integer, text } from 'drizzle-orm/sqlite-core';

// Shared column builders so every table stores ids and timestamps the same way:
// ids are random UUID text, timestamps are UTC epoch milliseconds.

export const uuidPrimaryKey = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

export const createdAt = () =>
	integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date());

export const updatedAt = () =>
	integer('updated_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
		.$onUpdateFn(() => new Date());
