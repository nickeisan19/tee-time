import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../../src/config/env';

const validEnv = {
	ENVIRONMENT: 'development',
	BETTER_AUTH_URL: 'http://localhost:8787',
	BETTER_AUTH_SECRET: 'a'.repeat(32),
};

describe('parseConfig', () => {
	it('parses a valid environment without Google sign-in', () => {
		const config = parseConfig(validEnv);

		expect(config).toEqual({
			environment: 'development',
			authUrl: 'http://localhost:8787',
			authSecret: 'a'.repeat(32),
			google: undefined,
		});
	});

	it('enables Google sign-in when both credentials are set', () => {
		const config = parseConfig({ ...validEnv, GOOGLE_CLIENT_ID: 'id', GOOGLE_CLIENT_SECRET: 'secret' });

		expect(config.google).toEqual({ clientId: 'id', clientSecret: 'secret' });
	});

	it('throws when BETTER_AUTH_SECRET is missing', () => {
		const env = Object.fromEntries(Object.entries(validEnv).filter(([key]) => key !== 'BETTER_AUTH_SECRET'));

		expect(() => parseConfig(env)).toThrowError(ConfigError);
		expect(() => parseConfig(env)).toThrowError(/BETTER_AUTH_SECRET/);
	});

	it('throws when BETTER_AUTH_SECRET is shorter than 32 characters', () => {
		expect(() => parseConfig({ ...validEnv, BETTER_AUTH_SECRET: 'short' })).toThrowError(/BETTER_AUTH_SECRET/);
	});

	it('never includes secret values in the error message', () => {
		const secret = 'too-short-secret-value';

		expect(() => parseConfig({ ...validEnv, BETTER_AUTH_SECRET: secret })).toThrowError(
			expect.objectContaining({ message: expect.not.stringContaining(secret) }),
		);
	});

	it('throws when only one Google credential is set', () => {
		expect(() => parseConfig({ ...validEnv, GOOGLE_CLIENT_ID: 'id' })).toThrowError(/GOOGLE_CLIENT_SECRET/);
	});

	it('throws for an unknown ENVIRONMENT', () => {
		expect(() => parseConfig({ ...validEnv, ENVIRONMENT: 'qa' })).toThrowError(/ENVIRONMENT/);
	});
});
