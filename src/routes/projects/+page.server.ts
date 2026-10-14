import { fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { projectFailure } from '#lib/server/project-http.ts';
import { canCreateProject } from '#lib/server/project-rules.ts';
import { createProject, listMyProjects } from '#lib/server/projects.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	const includeArchived = url.searchParams.get('archived') === '1';
	return {
		includeArchived,
		canCreate: canCreateProject(me.role),
		projects: await listMyProjects(
			getDb(env.DB),
			{ userId: me.id, systemRole: me.role },
			{ includeArchived }
		)
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		const name = form.get('name')?.toString() ?? '';
		const description = form.get('description')?.toString() ?? '';
		let id: string;
		try {
			id = await createProject(
				getDb(env.DB),
				{ userId: me.id, systemRole: me.role },
				{ name, description }
			);
		} catch (e) {
			const r = projectFailure(e);
			return fail(r.status, { ...r.data, name, description });
		}
		redirect(303, `/projects/${id}`);
	}
};
