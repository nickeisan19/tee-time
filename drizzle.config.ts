import { defineConfig } from 'drizzle-kit';

// drizzle-kit only generates SQL files here; Wrangler applies them to D1
// (`npm run db:migrate:local` / `npm run db:migrate:remote`).
export default defineConfig({
	dialect: 'sqlite',
	schema: './src/db/schema.ts',
	out: './migrations',
});
