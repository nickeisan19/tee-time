import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { signInPath } from '../lib/navigation';
import { useSession } from '../lib/queries';
import { Loading } from './Loading';

/** Renders children for signed-in golfers; everyone else goes to sign in and comes back here after. */
export function RequireSession({ children }: { children: ReactNode }) {
	const { data: session, isPending } = useSession();
	const location = useLocation();

	if (isPending) return <Loading />;
	if (!session) return <Navigate to={signInPath(`${location.pathname}${location.search}`)} replace />;
	return <>{children}</>;
}
