const TOKEN_BYTES = 32;

/** URL-safe random token with 256 bits of entropy. */
export function generateToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES));
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Hex HMAC-SHA-256 of `value`, keyed so the result can't be reversed without the secret. */
export async function hmacSha256Hex(secret: string, value: string): Promise<string> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	return toHex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}

/** Hex SHA-256 digest, used to store tokens without keeping the usable value. */
export async function sha256Hex(value: string): Promise<string> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
	return toHex(digest);
}
