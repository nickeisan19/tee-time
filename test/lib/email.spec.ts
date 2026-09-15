import { describe, expect, it, vi } from 'vitest';
import { parseConfig } from '../../src/config/env';
import { createEmailSender } from '../../src/lib/email';
import type { Logger } from '../../src/lib/logger';

function fakeLogger(): Logger {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

function configFor(environment: string) {
	return parseConfig({
		ENVIRONMENT: environment,
		BETTER_AUTH_URL: 'http://localhost:8787',
		BETTER_AUTH_SECRET: 'a'.repeat(32),
	});
}

describe('createEmailSender', () => {
	it('logs emails instead of sending them in development', async () => {
		const logger = fakeLogger();
		const sender = createEmailSender(configFor('development'), logger);

		await sender.send({ to: 'golfer@example.com', subject: 'Verify your email', text: 'http://link' });

		expect(logger.info).toHaveBeenCalledWith('email.dev_outbox', {
			to: 'golfer@example.com',
			subject: 'Verify your email',
			text: 'http://link',
		});
	});

	it('refuses to start in production without a real email provider', () => {
		expect(() => createEmailSender(configFor('production'), fakeLogger())).toThrowError(/email provider/i);
	});
});
