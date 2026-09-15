/**
 * True when the error (or any error in its `cause` chain, since Drizzle wraps D1 errors)
 * is a SQLite UNIQUE/PRIMARY KEY violation on the given `table.column`.
 */
export function isUniqueViolation(error: unknown, tableColumn: string): boolean {
	let current: unknown = error;
	while (current instanceof Error) {
		if (current.message.includes('UNIQUE constraint failed') && current.message.includes(tableColumn)) {
			return true;
		}
		current = current.cause;
	}
	return false;
}

/** True when the error (or its `cause` chain) is a SQLite FOREIGN KEY violation. */
export function isForeignKeyViolation(error: unknown): boolean {
	let current: unknown = error;
	while (current instanceof Error) {
		if (current.message.includes('FOREIGN KEY constraint failed')) return true;
		current = current.cause;
	}
	return false;
}

/** True when the error (or its `cause` chain) is a failure of the named SQLite CHECK constraint. */
export function isCheckViolation(error: unknown, constraintName: string): boolean {
	let current: unknown = error;
	while (current instanceof Error) {
		if (current.message.includes('CHECK constraint failed') && current.message.includes(constraintName)) return true;
		current = current.cause;
	}
	return false;
}
