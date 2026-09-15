import type { AppConfig } from './config/env';
import type { Database } from './db/client';
import type { Auth } from './features/auth/auth';
import type { EmailSender } from './lib/email';
import type { Logger } from './lib/logger';

export interface SessionUser {
	id: string;
	email: string;
	name: string;
}

/** Hono context types shared by every route. */
export interface AppEnv {
	Bindings: Env;
	Variables: {
		config: AppConfig;
		db: Database;
		auth: Auth;
		emailSender: EmailSender;
		logger: Logger;
		user: SessionUser;
	};
}
