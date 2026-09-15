import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Test-only secret; real secrets live in .dev.vars (local) or `wrangler secret put`.
const TEST_AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';

export default defineConfig({
	plugins: [
		cloudflareTest(async () => ({
			wrangler: { configPath: './wrangler.jsonc' },
			miniflare: {
				bindings: {
					ENVIRONMENT: 'test',
					BETTER_AUTH_SECRET: TEST_AUTH_SECRET,
					TEST_MIGRATIONS: await readD1Migrations('./migrations'),
				},
			},
		})),
	],
	test: {
		setupFiles: ['./test/apply-migrations.ts'],
		// Integration tests hash and verify real passwords with scrypt, which is deliberately slow.
		testTimeout: 30_000,
		hookTimeout: 30_000,
		coverage: {
			provider: 'istanbul',
			include: ['src/**/*.ts'],
			exclude: ['src/index.ts', 'src/db/schema.ts'],
			thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
		},
	},
});
