import type { Context } from 'hono';
import type { z } from 'zod';
import { validationError } from './errors';

export async function parseJsonBody<Schema extends z.ZodType>(c: Context, schema: Schema): Promise<z.output<Schema>> {
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		throw validationError('Request body must be valid JSON');
	}

	const result = schema.safeParse(body);
	if (!result.success) {
		const problems = result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`);
		throw validationError(problems.join('; '));
	}
	return result.data;
}
