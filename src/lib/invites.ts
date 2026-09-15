import type { RateLimitCheck, RateLimitRule } from './rate-limit';

export const INVITE_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86_400;

/**
 * Layered limits on invite emails (staff and membership invites share them):
 * - sender: stops one account, e.g. a compromised front-desk login, from mass-mailing
 * - club: caps total volume sent under one club's name
 * - recipient: stops repeated re-invites from flooding one inbox
 */
export const INVITE_RATE_LIMITS = {
	sender: { name: 'invite-sender', limit: 50, windowSeconds: SECONDS_PER_HOUR },
	club: { name: 'invite-club', limit: 300, windowSeconds: SECONDS_PER_DAY },
	recipient: { name: 'invite-recipient', limit: 5, windowSeconds: SECONDS_PER_DAY },
} as const satisfies Record<string, RateLimitRule>;

/** When an invite created at `now` stops working. Shared by staff and membership invites. */
export function inviteExpiresAt(now: Date): Date {
	return new Date(now.getTime() + INVITE_TTL_DAYS * MS_PER_DAY);
}

/** `recipientKey` must be a keyed hash of the recipient's email (see RateLimiter.hashSubject). */
export function inviteRateLimitChecks(senderUserId: string, orgId: string, recipientKey: string): RateLimitCheck[] {
	return [
		{ rule: INVITE_RATE_LIMITS.sender, subject: senderUserId },
		{ rule: INVITE_RATE_LIMITS.club, subject: orgId },
		{ rule: INVITE_RATE_LIMITS.recipient, subject: `${orgId}:${recipientKey}` },
	];
}
