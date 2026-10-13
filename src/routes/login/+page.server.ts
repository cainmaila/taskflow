import { fail, redirect } from '@sveltejs/kit';
import { APIError } from 'better-auth/api';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) redirect(302, '/members');
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		const form = await request.formData();
		const email = form.get('email')?.toString().trim() ?? '';
		const password = form.get('password')?.toString() ?? '';
		if (!email || !password) return fail(400, { message: '請輸入 Email 與密碼', email });

		try {
			await locals.auth.api.signInEmail({ body: { email, password } });
		} catch (e) {
			if (e instanceof APIError) {
				const banned = e.body?.code === 'BANNED_USER';
				return fail(400, { message: banned ? '此帳號已停用' : 'Email 或密碼錯誤', email });
			}
			throw e;
		}
		redirect(302, '/members');
	}
};
