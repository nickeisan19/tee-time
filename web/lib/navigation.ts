/**
 * Where to send someone after signing in. Only same-site paths are allowed, so a crafted
 * `?next=` link can't bounce a golfer to another website.
 */
// eslint-disable-next-line no-control-regex -- matching control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
	if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
	// Browsers drop tabs and newlines when parsing URLs, which would turn "/\t/evil.example" into "//evil.example".
	if (CONTROL_CHARACTERS.test(next)) return fallback;
	return next;
}

export function signInPath(next: string): string {
	return `/sign-in?next=${encodeURIComponent(next)}`;
}
