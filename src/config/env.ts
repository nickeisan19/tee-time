import { z } from 'zod';

export const ENVIRONMENTS = ['development', 'test', 'staging', 'production'] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

const MIN_AUTH_SECRET_LENGTH = 32;

export interface AppConfig {
	environment: Environment;
	authUrl: string;
	authSecret: string;
	google: { clientId: string; clientSecret: string } | undefined;
}

export class ConfigError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ConfigError';
	}
}

const envSchema = z
	.object({
		ENVIRONMENT: z.enum(ENVIRONMENTS),
		BETTER_AUTH_URL: z.url(),
		BETTER_AUTH_SECRET: z.string().min(MIN_AUTH_SECRET_LENGTH),
		GOOGLE_CLIENT_ID: z.string().min(1).optional(),
		GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
	})
	.superRefine((env, ctx) => {
		if (env.GOOGLE_CLIENT_ID && !env.GOOGLE_CLIENT_SECRET) {
			ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_SECRET'], message: 'Required when GOOGLE_CLIENT_ID is set' });
		}
		if (env.GOOGLE_CLIENT_SECRET && !env.GOOGLE_CLIENT_ID) {
			ctx.addIssue({ code: 'custom', path: ['GOOGLE_CLIENT_ID'], message: 'Required when GOOGLE_CLIENT_SECRET is set' });
		}
	});

/** Origin (scheme + host) where the app's pages are served; email links point here. */
export function appOrigin(config: AppConfig): string {
	return new URL(config.authUrl).origin;
}

/**
 * Validates Worker bindings and secrets. Error messages name the offending variables
 * but never include their values.
 */
export function parseConfig(env: unknown): AppConfig {
	const result = envSchema.safeParse(env);
	if (!result.success) {
		const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
		throw new ConfigError(`Invalid environment configuration: ${problems}`);
	}

	const parsed = result.data;
	return {
		environment: parsed.ENVIRONMENT,
		authUrl: parsed.BETTER_AUTH_URL,
		authSecret: parsed.BETTER_AUTH_SECRET,
		google:
			parsed.GOOGLE_CLIENT_ID && parsed.GOOGLE_CLIENT_SECRET
				? { clientId: parsed.GOOGLE_CLIENT_ID, clientSecret: parsed.GOOGLE_CLIENT_SECRET }
				: undefined,
	};
}
