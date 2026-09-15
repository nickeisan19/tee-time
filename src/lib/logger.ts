export type LogFields = Record<string, unknown>;

export interface Logger {
	info(event: string, fields?: LogFields): void;
	warn(event: string, fields?: LogFields): void;
	error(event: string, fields?: LogFields): void;
}

function serialize(fields: LogFields): LogFields {
	return Object.fromEntries(
		Object.entries(fields).map(([key, value]) =>
			value instanceof Error ? [key, { name: value.name, message: value.message, stack: value.stack }] : [key, value],
		),
	);
}

/** Structured logger; Workers Logs indexes the object fields. */
export function createLogger(baseFields: LogFields = {}): Logger {
	const entry = (level: string, event: string, fields: LogFields) => ({
		level,
		event,
		...baseFields,
		...serialize(fields),
	});

	return {
		info: (event, fields = {}) => console.info(entry('info', event, fields)),
		warn: (event, fields = {}) => console.warn(entry('warn', event, fields)),
		error: (event, fields = {}) => console.error(entry('error', event, fields)),
	};
}
