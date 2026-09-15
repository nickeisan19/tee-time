import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// One build: the React app in web/ becomes static assets served by the Worker in src/.
export default defineConfig({
	plugins: [react(), tailwindcss(), cloudflare()],
	build: {
		// Public source maps would expose internal code (ECC react/security).
		sourcemap: false,
	},
});
