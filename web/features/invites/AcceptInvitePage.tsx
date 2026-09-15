import { useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';
import { Button, ButtonLink } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { RequireSession } from '../../components/RequireSession';
import { ApiError, apiRequest, errorMessage } from '../../lib/api';
import { AuthLayout } from '../../layouts/AuthLayout';

type InviteKind = 'staff' | 'membership';

interface AcceptedStaff {
	slug: string;
	name: string;
	role: string;
}

interface AcceptedMembership {
	club: { slug: string; name: string };
}

const COPY: Record<InviteKind, { endpoint: string; eyebrow: string; title: string }> = {
	staff: { endpoint: '/invites/accept', eyebrow: 'Staff invite', title: 'Join the team' },
	membership: { endpoint: '/membership-invites/accept', eyebrow: 'Membership invite', title: 'Become a member' },
};

function inviteError(error: unknown): string {
	if (error instanceof ApiError && error.status === 403) return 'This invite was sent to a different email address. Sign in with that account.';
	if (error instanceof ApiError && error.status === 404) return 'This invite is invalid, expired, or already used.';
	if (error instanceof ApiError && error.code === 'ALREADY_MEMBER') return 'You already have a membership at this club.';
	if (error instanceof ApiError && error.code === 'ALREADY_STAFF') return 'You’re already on staff at this club.';
	return errorMessage(error);
}

function AcceptInvite({ kind, token }: { kind: InviteKind; token: string }) {
	const copy = COPY[kind];
	const accept = useMutation({
		mutationFn: () => apiRequest<AcceptedStaff | AcceptedMembership>(copy.endpoint, { method: 'POST', body: { token } }),
	});

	if (accept.isSuccess) {
		const club = 'club' in accept.data ? accept.data.club : accept.data;
		return (
			<AuthLayout eyebrow={copy.eyebrow} title="You’re in">
				<p className="mb-8 text-lg text-stone-600">
					Welcome to <strong className="text-ink">{club.name}</strong>.
				</p>
				<ButtonLink to={`/c/${club.slug}`} size="lg" isFullWidth>
					Go to {club.name}
				</ButtonLink>
			</AuthLayout>
		);
	}

	return (
		<AuthLayout eyebrow={copy.eyebrow} title={copy.title}>
			<div className="space-y-6">
				{accept.isError && <Notice tone="error" title="Couldn’t accept this invite">{inviteError(accept.error)}</Notice>}
				<Button size="lg" isFullWidth onClick={() => accept.mutate()} isLoading={accept.isPending}>
					Accept invite
				</Button>
			</div>
		</AuthLayout>
	);
}

export function AcceptInvitePage({ kind }: { kind: InviteKind }) {
	const [searchParams] = useSearchParams();
	const token = searchParams.get('token');

	if (!token) {
		return (
			<AuthLayout eyebrow={COPY[kind].eyebrow} title="Link missing">
				<Notice tone="error">This page needs the link from your invite email.</Notice>
				<Link to="/" className="mt-8 inline-block font-semibold underline decoration-signal decoration-2 underline-offset-4">
					Go home
				</Link>
			</AuthLayout>
		);
	}

	return (
		<RequireSession>
			<AcceptInvite kind={kind} token={token} />
		</RequireSession>
	);
}
