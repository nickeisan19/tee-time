import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	{ ignores: ['node_modules', 'coverage', 'migrations', '.wrangler', 'worker-configuration.d.ts'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			'no-console': 'error',
			'@typescript-eslint/no-explicit-any': 'error',
		},
	},
	{
		// The logger is the only place allowed to write to the console.
		files: ['src/lib/logger.ts'],
		rules: { 'no-console': 'off' },
	},
);
