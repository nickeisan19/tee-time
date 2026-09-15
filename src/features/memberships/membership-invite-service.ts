import type { SessionUser } from '../../app-env';
import { clubToday } from '../../lib/dates';
import type { EmailSender } from '../../lib/email';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { INVITE_TTL_DAYS, inviteExpiresAt, inviteRateLimitChecks } from '../../lib/invites';
import type { RateLimiter } from '../../lib/rate-limit';
import { generateToken, sha256Hex } from '../../lib/tokens';
import { loadClub, requireStaffRole } from '../organizations/club-access';
import type { OrganizationRepository } from '../organizations/repository';
import type { MembershipInviteRepository, PendingMembershipInvite } from './membership-invite-repository';
import type { MembershipRepository } from './membership-repository';
import { auditedTermsOf, diffTerms, type MembershipView, rethrowMembershipWriteError, toMembershipView } from './membership-service';
import type { TierRepository } from './tier-repository';
import type { MembershipInviteInput } from './validation';

export const ACCEPT_MEMBERSHIP_INVITE_PATH = '/membership-invites/accept';

interface MembershipInviteServiceDependencies {
	organizations: OrganizationRepository;
	tiers: TierRepository;
	memberships: MembershipRepository;
	invites: MembershipInviteRepository;
	emailSender: EmailSender;
	rateLimiter?: RateLimiter;
	appOrigin: string;
	now?: () => Date;
}

export interface AcceptedMembershipInvite {
	club: { slug: string; name: string };
	membership: MembershipView;
}

export interface MembershipInviteService {
	invite(slug: string, actorUserId: string, input: MembershipInviteInput): Promise<void>;
	listPending(slug: string, actorUserId: string): Promise<PendingMembershipInvite[]>;
	revoke(slug: string, actorUserId: string, inviteId: string): Promise<void>;
	accept(token: string, golfer: SessionUser): Promise<AcceptedMembershipInvite>;
}

const INVALID_INVITE_MESSAGE = 'This invite is invalid or has expired';

export function createMembershipInviteService({
	organizations,
	tiers,
	memberships,
	invites,
	emailSender,
	rateLimiter,
	appOrigin,
	now = () => new Date(),
}: MembershipInviteServiceDependencies): MembershipInviteService {
	return {
		async invite(slug, actorUserId, { email, tierId, startsOn, endsOn, memberNumber }) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			const tier = await tiers.findInClub(club.id, tierId);
			if (!tier) throw notFound('Membership tier not found');
			// Staff can already list members, so this reveals nothing new about who has an account.
			if (await memberships.hasCurrentMembershipForEmail(club.id, email)) {
				throw conflict('ALREADY_MEMBER', 'That person is already a member');
			}
			// Checked after permissions so people who aren't staff can't use up the club's allowance.
			if (rateLimiter) {
				await rateLimiter.enforce(inviteRateLimitChecks(actorUserId, club.id, await rateLimiter.hashSubject(email)));
			}

			const token = generateToken();
			await invites.upsert({
				orgId: club.id,
				email,
				tierId,
				startsOn,
				endsOn: endsOn ?? null,
				memberNumber: memberNumber ?? null,
				tokenHash: await sha256Hex(token),
				invitedByUserId: actorUserId,
				expiresAt: inviteExpiresAt(now()),
			});

			const link = `${appOrigin}${ACCEPT_MEMBERSHIP_INVITE_PATH}?token=${encodeURIComponent(token)}`;
			await emailSender.send({
				to: email,
				subject: `You're invited to become a member of ${club.name}`,
				text:
					`${club.name} invited you to join as a ${tier.name} member, starting ${startsOn}.\n\n` +
					`Accept the invite: ${link}\n\n` +
					`The link expires in ${INVITE_TTL_DAYS} days. If you weren't expecting this invite, you can ignore this email.`,
			});
		},

		async listPending(slug, actorUserId) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			return invites.listPending(club.id, now());
		},

		async revoke(slug, actorUserId, inviteId) {
			const club = await loadClub(organizations, slug);
			await requireStaffRole(organizations, club, actorUserId);
			if (!(await invites.revoke(club.id, inviteId))) throw notFound('Invite not found');
		},

		async accept(token, golfer) {
			const invite = await invites.findByTokenHash(await sha256Hex(token));
			if (!invite || invite.expiresAt <= now()) throw notFound(INVALID_INVITE_MESSAGE);
			if (invite.email !== golfer.email.toLowerCase()) throw forbidden('This invite was sent to a different email address');

			const club = await organizations.findById(invite.orgId);
			if (!club) throw notFound(INVALID_INVITE_MESSAGE);

			const tier = await tiers.findInClub(club.id, invite.tierId);
			if (!tier) throw notFound(INVALID_INVITE_MESSAGE);
			const before = await memberships.findRecordForUser(club.id, golfer.id);
			const terms = { tierId: invite.tierId, startsOn: invite.startsOn, endsOn: invite.endsOn, memberNumber: invite.memberNumber };
			const changes = diffTerms(auditedTermsOf(before), {
				status: 'active',
				tier: { id: tier.id, name: tier.name },
				startsOn: terms.startsOn,
				endsOn: terms.endsOn,
				memberNumber: terms.memberNumber,
			});
			// Credited to the staff member who sent the invite: they chose the tier and dates.
			const membershipId = await memberships
				.activateFromInvite(invite, golfer.id, terms, {
					actorUserId: invite.invitedByUserId,
					action: 'joined_by_invite',
					changes,
					note: null,
					at: now(),
				})
				.catch(rethrowMembershipWriteError);
			if (!membershipId) throw conflict('ALREADY_MEMBER', 'You already have a membership at this club');

			const record = await memberships.findRecord(club.id, membershipId);
			if (!record) throw notFound('Membership not found');
			return {
				club: { slug: club.slug, name: club.name },
				membership: toMembershipView(record, clubToday(club.timezone, now())),
			};
		},
	};
}
