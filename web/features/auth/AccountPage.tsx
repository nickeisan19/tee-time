import { useNavigate } from 'react-router';
import { Button } from '../../components/Button';
import { Eyebrow } from '../../components/Eyebrow';
import { RequireSession } from '../../components/RequireSession';
import { Wordmark } from '../../components/Wordmark';
import { useSession, useSignOut } from '../../lib/queries';

function AccountDetails() {
	const { data: session } = useSession();
	const signOut = useSignOut();
	const navigate = useNavigate();

	return (
		<main className="mx-auto max-w-xl px-5 py-10">
			<Wordmark />
			<div className="mt-12">
				<Eyebrow>Account</Eyebrow>
				<h1 className="font-display text-5xl font-bold uppercase leading-none">{session?.user.name}</h1>
				<p className="mt-3 text-stone-600">{session?.user.email}</p>
				<div className="mt-10 flex flex-col gap-3 sm:flex-row">
					<Button variant="outline" onClick={() => navigate(-1)}>
						Back
					</Button>
					<Button onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })} isLoading={signOut.isPending}>
						Sign out
					</Button>
				</div>
			</div>
		</main>
	);
}

export function AccountPage() {
	return (
		<RequireSession>
			<AccountDetails />
		</RequireSession>
	);
}
