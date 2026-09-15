import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { type AppConfig, appOrigin } from '../../config/env';
import type { Database } from '../../db/client';
import * as schema from '../../db/schema';
import type { EmailSender } from '../../lib/email';
import { verifyEmailWithPassword } from './verify-email-plugin';

export const AUTH_BASE_PATH = '/api/auth';
/** Frontend page that asks for the account password, then calls /api/auth/verify-email-with-password. */
export const VERIFY_EMAIL_PAGE_PATH = '/verify-email';

interface AuthDependencies {
	config: AppConfig;
	db: Database;
	emailSender: EmailSender;
}

// Created per request because Worker bindings and secrets are only available inside a request.
export function createAuth({ config, db, emailSender }: AuthDependencies) {
	return betterAuth({
		appName: 'Tee Time',
		baseURL: config.authUrl,
		basePath: AUTH_BASE_PATH,
		secret: config.authSecret,
		database: drizzleAdapter(db, { provider: 'sqlite', schema, usePlural: true }),
		advanced: {
			database: { generateId: 'uuid' },
			// Cloudflare sets this header at the edge; clients cannot spoof it.
			ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
		},
		// Better Auth only enables rate limiting when NODE_ENV=production, which Workers never set,
		// so enable it explicitly. Built-in rules: 3 sign-in/sign-up attempts per 10s and
		// 3 password-reset/verification emails per 60s, per IP.
		rateLimit: { enabled: true, storage: 'database' },
		// One-click verification is replaced by verifyEmailWithPassword (see verify-email-plugin.ts).
		disabledPaths: ['/verify-email'],
		plugins: [verifyEmailWithPassword()],
		emailAndPassword: {
			enabled: true,
			requireEmailVerification: true,
			revokeSessionsOnPasswordReset: true,
			sendResetPassword: async ({ user, url }) => {
				await emailSender.send({
					to: user.email,
					subject: 'Reset your password',
					text: `Reset your password: ${url}\n\nIf you didn't ask to reset your password, ignore this email. Your password won't change.`,
				});
			},
		},
		emailVerification: {
			sendOnSignUp: true,
			sendVerificationEmail: async ({ user, token }) => {
				const link = `${appOrigin(config)}${VERIFY_EMAIL_PAGE_PATH}?token=${encodeURIComponent(token)}`;
				await emailSender.send({
					to: user.email,
					subject: 'Verify your email',
					text:
						`Confirm your email address: ${link}\n\n` +
						"You'll be asked for the password you chose when you signed up. " +
						"If you didn't create this account, ignore this email.",
				});
			},
		},
		socialProviders: config.google ? { google: { clientId: config.google.clientId, clientSecret: config.google.clientSecret } } : {},
		account: {
			// Google only returns verified emails, so a Google sign-in may attach to an existing account.
			accountLinking: { enabled: true, trustedProviders: ['google'] },
		},
		user: {
			additionalFields: {
				phone: { type: 'string', required: false, input: true },
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
