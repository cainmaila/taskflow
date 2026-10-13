import { fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { APIError } from 'better-auth/api';
import { getDb } from '#lib/server/db/index.ts';
import { createInvitation, InvitationError } from '#lib/server/invitations.ts';
import { changeRole, listMembers, MemberError, setBanned } from '#lib/server/members.ts';
import { canInvite, canManageMembers, parseRole } from '#lib/server/permissions.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	return {
		me: { id: me.id, role: me.role ?? 'member' },
		canInvite: canInvite(me.role),
		canManage: canManageMembers(me.role),
		members: await listMembers(getDb(env.DB))
	};
};

const message = (e: unknown) => {
	if (e instanceof InvitationError || e instanceof MemberError || e instanceof APIError)
		return e.message;
	throw e;
};

export const actions: Actions = {
	invite: async ({ request, locals, url }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		if (!canInvite(me.role)) return fail(403, { message: '沒有權限' });

		const form = await request.formData();
		const role = form.get('role')?.toString();
		try {
			const token = await createInvitation(getDb(env.DB), {
				email: form.get('email')?.toString() ?? '',
				role: role === 'manager' ? 'manager' : 'member',
				invitedBy: me.id
			});
			return { inviteLink: `${url.origin}/invite/${token}` };
		} catch (e) {
			return fail(400, { message: message(e) });
		}
	},
	setRole: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		const role = parseRole(form.get('role'));
		if (!role) return fail(400, { message: '角色不正確' });
		try {
			await changeRole(
				getDb(env.DB),
				locals.auth.api,
				request.headers,
				locals.user.role,
				form.get('userId')?.toString() ?? '',
				role
			);
		} catch (e) {
			return fail(400, { message: message(e) });
		}
	},
	setBanned: async ({ request, locals }) => {
		if (!locals.user) redirect(302, '/login');
		const form = await request.formData();
		try {
			await setBanned(
				getDb(env.DB),
				locals.auth.api,
				request.headers,
				locals.user.role,
				form.get('userId')?.toString() ?? '',
				form.get('banned') === 'true'
			);
		} catch (e) {
			return fail(400, { message: message(e) });
		}
	},
	signOut: async ({ request, locals }) => {
		await locals.auth.api.signOut({ headers: request.headers });
		redirect(302, '/login');
	}
};
