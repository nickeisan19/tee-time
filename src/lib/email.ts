import { type AppConfig, ConfigError } from '../config/env';
import type { Logger } from './logger';

export interface EmailMessage {
	to: string;
	subject: string;
	text: string;
}

export interface EmailSender {
	send(message: EmailMessage): Promise<void>;
}

const ENVIRONMENTS_WITH_REAL_EMAIL = new Set<AppConfig['environment']>(['staging', 'production']);

/**
 * Local environments log emails (including verification links) instead of sending them.
 * Deployed environments must use a real provider so tokens never end up in logs.
 */
export function createEmailSender(config: AppConfig, logger: Logger): EmailSender {
	if (ENVIRONMENTS_WITH_REAL_EMAIL.has(config.environment)) {
		throw new ConfigError(`No email provider is configured for the ${config.environment} environment`);
	}

	return {
		send: async (message) => {
			logger.info('email.dev_outbox', { to: message.to, subject: message.subject, text: message.text });
		},
	};
}
