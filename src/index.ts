import { createApp } from './app';
import { runDailyTeeSheetGeneration } from './features/tee-sheet/scheduled';

const app = createApp();

export default {
	fetch: app.fetch,
	async scheduled(_controller, env, ctx) {
		ctx.waitUntil(runDailyTeeSheetGeneration(env));
	},
} satisfies ExportedHandler<Env>;
