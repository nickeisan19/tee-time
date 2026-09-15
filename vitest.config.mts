import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// Test-only secret; real secrets live in .dev.vars (local) or `wrangler secret put`.
const TEST_AUTH_SECRET = 'test-secret-that-is-at-least-32-characters-long';
// Integration tests hash and verify real passwords with scrypt, which is deliberately slow.
const SLOW_TEST_TIMEOUT_MS = 30_000;

export default defineConfig({
	test: {
		coverage: {
			provider: 'istanbul',
			include: ['src/**/*.ts', 'web/**/*.{ts,tsx}'],
			exclude: ['src/index.ts', 'src/db/schema.ts', 'web/main.tsx', 'web/test/**', '**/*.test.{ts,tsx}'],
			thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
		},
		projects: [
			{
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
					name: 'api',
					include: ['test/**/*.spec.ts'],
					setupFiles: ['./test/apply-migrations.ts'],
					testTimeout: SLOW_TEST_TIMEOUT_MS,
					hookTimeout: SLOW_TEST_TIMEOUT_MS,
				},
			},
			{
				plugins: [react()],
				test: {
					name: 'web',
					environment: 'jsdom',
					include: ['web/**/*.test.{ts,tsx}'],
					setupFiles: ['./web/test/setup.ts'],
				},
			},
		],
	},
});
