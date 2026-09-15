import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { verifyJWT } from 'better-auth/crypto';
import { z } from 'zod';

export const VERIFY_EMAIL_WITH_PASSWORD_PATH = '/verify-email-with-password';
const MAX_ATTEMPTS_PER_WINDOW = 5;
const ATTEMPT_WINDOW_SECONDS = 60;

const bodySchema = z.object({
	token: z.string().min(1),
	password: z.string().min(1),
});

const tokenPayloadSchema = z.object({
	email: z.email(),
	updateTo: z.string().optional(),
});

/**
 * Replaces Better Auth's one-click `/verify-email` link. Clicking a link only proves someone can
 * read the inbox; also requiring the account password stops a person who signed up with someone
 * else's email address from getting that address verified on their account.
 */
export function verifyEmailWithPassword() {
	return {
		id: 'verify-email-with-password',
		endpoints: {
			verifyEmailWithPassword: createAuthEndpoint(VERIFY_EMAIL_WITH_PASSWORD_PATH, { method: 'POST', body: bodySchema }, async (ctx) => {
				const payload = tokenPayloadSchema.safeParse(await verifyJWT(ctx.body.token, ctx.context.secret));
				// Email-change tokens (updateTo) are not supported by this flow.
				if (!payload.success || payload.data.updateTo) {
					throw APIError.from('BAD_REQUEST', {
						code: 'INVALID_VERIFICATION_TOKEN',
						message: 'This verification link is invalid or has expired',
					});
				}

				const record = await ctx.context.internalAdapter.findUserByEmail(payload.data.email, { includeAccounts: true });
				const passwordHash = record?.accounts.find(
					(account) => account.providerId === 'credential' && account.accountId === record.user.id,
				)?.password;
				const passwordMatches = passwordHash
					? await ctx.context.password.verify({ hash: passwordHash, password: ctx.body.password })
					: // Hash anyway so response time doesn't reveal whether the account has a password.
						(await ctx.context.password.hash(ctx.body.password), false);

				if (!record || !passwordMatches) {
					throw APIError.from('UNAUTHORIZED', { code: 'INCORRECT_PASSWORD', message: 'Incorrect password' });
				}

				if (!record.user.emailVerified) {
					await ctx.context.internalAdapter.updateUserByEmail(payload.data.email, { emailVerified: true });
				}
				return ctx.json({ status: true });
			}),
		},
		rateLimit: [
			{
				pathMatcher: (path: string) => path === VERIFY_EMAIL_WITH_PASSWORD_PATH,
				window: ATTEMPT_WINDOW_SECONDS,
				max: MAX_ATTEMPTS_PER_WINDOW,
			},
		],
	} satisfies BetterAuthPlugin;
}
