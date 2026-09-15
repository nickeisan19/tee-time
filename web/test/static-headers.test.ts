import { describe, expect, it } from 'vitest';
import rules from '../../public/_headers?raw';

// Cloudflare applies public/_headers to the static web app; the Worker never sees those requests.

describe('static asset security headers', () => {
	it('applies to every page', () => {
		expect(rules).toMatch(/^\/\*$/m);
	});

	it.each([
		/Content-Security-Policy: .*default-src 'self'/,
		/Content-Security-Policy: .*frame-ancestors 'none'/,
		/Content-Security-Policy: .*script-src 'self';/,
		/X-Frame-Options: DENY/,
		/X-Content-Type-Options: nosniff/,
		/Referrer-Policy: strict-origin-when-cross-origin/,
	])('includes %s', (header) => {
		expect(rules).toMatch(header);
	});
});
