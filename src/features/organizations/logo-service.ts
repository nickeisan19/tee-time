import { validationError } from '../../lib/errors';
import type { RateLimiter, RateLimitRule } from '../../lib/rate-limit';
import { readBodyWithLimit } from '../../lib/streams';
import { loadClub, requireClubManager } from './club-access';
import type { Club, OrganizationRepository } from './repository';

export const MAX_LOGO_BYTES = 512 * 1024;
const SECONDS_PER_HOUR = 3600;

/** Uploads and removals both write to R2, so they share one budget per club. */
export const LOGO_CHANGES_RATE_LIMIT = { name: 'logo-change', limit: 20, windowSeconds: SECONDS_PER_HOUR } satisfies RateLimitRule;
const TOO_LARGE_MESSAGE = 'Logos must be 512 KB or smaller';

type LogoContentType = 'image/png' | 'image/jpeg' | 'image/webp';

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
	signature.every((value, index) => bytes[offset + index] === value);

/**
 * Identifies a logo by its file signature rather than trusting the declared type. SVG is not
 * accepted because it can contain scripts.
 */
export function detectLogoType(bytes: Uint8Array): LogoContentType | null {
	if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
	if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
	// RIFF....WEBP
	if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
	return null;
}

interface LogoServiceDependencies {
	organizations: OrganizationRepository;
	bucket: R2Bucket;
	rateLimiter: RateLimiter;
	now?: () => Date;
}

export interface LogoUpload {
	declaredType: string | undefined;
	declaredLength: string | undefined;
	body: ReadableStream<Uint8Array> | null;
}

export interface StoredLogo {
	body: ReadableStream;
	contentType: string;
}

export interface LogoService {
	upload(slug: string, actorUserId: string, upload: LogoUpload): Promise<Club>;
	remove(slug: string, actorUserId: string): Promise<Club>;
	get(slug: string): Promise<StoredLogo | null>;
}

const logoKey = (orgId: string) => `logos/${orgId}`;

export function createLogoService({ organizations, bucket, rateLimiter, now = () => new Date() }: LogoServiceDependencies): LogoService {
	return {
		async upload(slug, actorUserId, { declaredType, declaredLength, body }) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			await rateLimiter.enforce([{ rule: LOGO_CHANGES_RATE_LIMIT, subject: club.id }]);

			// Refuse oversized uploads before reading them when the client says how big they are.
			if (declaredLength !== undefined && Number(declaredLength) > MAX_LOGO_BYTES) throw validationError(TOO_LARGE_MESSAGE);
			// Content-Length can be missing or wrong, so the read itself is capped too.
			const bytes = await readBodyWithLimit(body, MAX_LOGO_BYTES);
			if (!bytes) throw validationError(TOO_LARGE_MESSAGE);

			const contentType = detectLogoType(bytes);
			const declared = declaredType?.split(';')[0]?.trim().toLowerCase();
			if (!contentType || declared !== contentType) throw validationError('Upload a PNG, JPEG or WebP image');

			await bucket.put(logoKey(club.id), bytes, { httpMetadata: { contentType } });
			return organizations.setLogoUpdatedAt(club.id, now());
		},

		async remove(slug, actorUserId) {
			const club = await loadClub(organizations, slug);
			await requireClubManager(organizations, club, actorUserId);
			await rateLimiter.enforce([{ rule: LOGO_CHANGES_RATE_LIMIT, subject: club.id }]);
			await bucket.delete(logoKey(club.id));
			return organizations.setLogoUpdatedAt(club.id, null);
		},

		async get(slug) {
			const club = await loadClub(organizations, slug);
			if (!club.logoUpdatedAt) return null;
			const object = await bucket.get(logoKey(club.id));
			if (!object) return null;
			return { body: object.body, contentType: object.httpMetadata?.contentType ?? 'application/octet-stream' };
		},
	};
}
