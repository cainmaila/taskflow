import { error, fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { APIError } from 'better-auth/api';
import { getDb } from '#lib/server/db/index.ts';
import {
	acceptInvitation,
	findUsableInvitation,
	InvitationError
} from '#lib/server/invitations.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const inv = await findUsableInvitation(getDb(env.DB), params.token);
	if (!inv) error(404, '邀請連結無效或已過期');
	return { email: inv.email };
};

export const actions: Actions = {
	default: async ({ request, params, locals }) => {
		const form = await request.formData();
		const name = form.get('name')?.toString() ?? '';
		const password = form.get('password')?.toString() ?? '';

		let email: string;
		try {
			({ email } = await acceptInvitation(getDb(env.DB), locals.auth, {
				token: params.token,
				name,
				password
			}));
		} catch (e) {
			if (e instanceof InvitationError || e instanceof APIError)
				return fail(400, { message: e.message, name });
			throw e;
		}
		await locals.auth.api.signInEmail({ body: { email, password } });
		redirect(302, '/members');
	}
};
