import { setupServer } from 'msw/node';

/** Network mock shared by web tests; each test registers the handlers it needs with server.use(). */
export const server = setupServer();
