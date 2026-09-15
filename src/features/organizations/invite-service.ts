import type { SessionUser } from '../../app-env';
import { isUniqueViolation } from '../../db/errors';
import type { EmailSender } from '../../lib/email';
import { conflict, forbidden, notFound } from '../../lib/errors';
import { generateToken, sha256Hex } from '../../lib/tokens';
import { loadClub, requireStaffRole } from './club-access';
import type { InviteRepository, PendingInvite } from './invite-repository';
import { canManageStaffRole, manageableRoles } from './permissions';
import type { OrganizationRepository } from './repository';
import type { StaffRole } from './schema';
import type { InviteStaffInput } from './validation';

const INVITE_TTL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const ACCEPT_INVITE_PATH = '/invites/accept';

interface InviteServiceDependencies {
	organizations: OrganizationRepository;
	invites: InviteRepository;
	emailSender: EmailSender;
	appOrigin: string;
	now?: () => Date;
}

export interface AcceptedInvite {
	slug: string;
	name: string;
	role: StaffRole;
}

export interface InviteService {
	invite(slug: string, actorUserId: string, input: InviteStaffInput): Promise<void>;
	listPending(slug: string, actorUserId: string): Promise<PendingInvite[]>;
	revoke(slug: string, actorUserId: string, inviteId: string): Promise<void>;
	accept(token: string, user: SessionUser): Promise<AcceptedInvite>;
}

export function createInviteService({
	organizations,
	invites,
	emailSender,
	appOrigin,
	now = () => new Date(),
}: InviteServiceDependencies): InviteService {
	return {
		async invite(slug, actorUserId, { email, role }) {
			const club = await loadClub(organizations, slug);
			const actorRole = await requireStaffRole(organizations, club, actorUserId);
			if (!canManageStaffRole(actorRole, role)) throw forbidden(`You cannot invite someone as ${role}`);
			// Staff can already see the staff list, so this reveals nothing new about who has an account.
			if (await organizations.hasStaffWithEmail(club.id, email)) {
				throw conflict('ALREADY_STAFF', 'That person is already on staff');
			}

			const token = generateToken();
			const written = await invites.upsert(
				{
					orgId: club.id,
					email,
					role,
					tokenHash: await sha256Hex(token),
					invitedByUserId: actorUserId,
					expiresAt: new Date(now().getTime() + INVITE_TTL_DAYS * MS_PER_DAY),
				},
				// Replacing an invite is as strong as revoking it, so apply the same role rule.
				manageableRoles(actorRole),
			);
			if (!written) throw forbidden('A pending invite for that email was sent by someone with a higher role');

			const link = `${appOrigin}${ACCEPT_INVITE_PATH}?token=${encodeURIComponent(token)}`;
			await emailSender.send({
				to: email,
				subject: `You're invited to join ${club.name}`,
				text:
					`${club.name} invited you to join their staff as ${role}.\n\n` +
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
			const actorRole = await requireStaffRole(organizations, club, actorUserId);
			const invite = await invites.findInClub(club.id, inviteId);
			if (!invite) throw notFound('Invite not found');
			if (!canManageStaffRole(actorRole, invite.role)) throw forbidden(`You cannot revoke an invite for ${invite.role}`);

			await invites.revoke(club.id, inviteId);
		},

		async accept(token, user) {
			const invite = await invites.findByTokenHash(await sha256Hex(token));
			if (!invite || invite.expiresAt <= now()) throw notFound('This invite is invalid or has expired');
			if (invite.email !== user.email.toLowerCase()) {
				throw forbidden('This invite was sent to a different email address');
			}

			const club = await organizations.findById(invite.orgId);
			if (!club) throw notFound('This invite is invalid or has expired');

			try {
				await invites.accept(invite, user.id);
			} catch (error) {
				if (isUniqueViolation(error, 'org_staff.org_id')) throw conflict('ALREADY_STAFF', 'You are already on staff');
				throw error;
			}
			return { slug: club.slug, name: club.name, role: invite.role };
		},
	};
}
