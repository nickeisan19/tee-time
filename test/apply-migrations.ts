import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';

// Runs before every test file so tests always hit the real schema in a local D1 database.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
