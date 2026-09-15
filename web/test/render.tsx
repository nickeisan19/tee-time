import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { configureAxe } from 'vitest-axe';
import { routes } from '../routes';

/** Renders the real app routes at `path`, so tests exercise layouts, guards and pages together. */
export function renderApp(path: string) {
	const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
	const router = createMemoryRouter(routes, { initialEntries: [path] });
	const user = userEvent.setup();
	const view = render(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
	return { ...view, router, user };
}

// jsdom can't compute colours or layout, so contrast is checked in the browser, not here.
const axe = configureAxe({ rules: { 'color-contrast': { enabled: false } } });

export async function accessibilityViolations(container: Element): Promise<string[]> {
	const results = await axe(container);
	return results.violations.map((violation) => `${violation.id}: ${violation.help}`);
}
