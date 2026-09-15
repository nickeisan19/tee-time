import { describe, expect, it } from 'vitest';
import { safeNextPath, signInPath } from './navigation';

describe('safeNextPath', () => {
	it.each([
		['/c/pine/book', '/c/pine/book'],
		[null, '/'],
		['', '/'],
		['https://evil.example', '/'],
		['//evil.example', '/'],
		['/\\evil.example', '/'],
		['javascript:alert(1)', '/'],
		['/\t/evil.example', '/'],
		['/\n/evil.example', '/'],
	])('turns %j into %j', (next, expected) => {
		expect(safeNextPath(next)).toBe(expected);
	});

	it('builds a sign-in link that returns to the current page', () => {
		expect(signInPath('/c/pine/book?date=2026-10-05')).toBe('/sign-in?next=%2Fc%2Fpine%2Fbook%3Fdate%3D2026-10-05');
	});
});
