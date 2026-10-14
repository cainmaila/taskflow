import { fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { parseFilters, todayISO } from '#lib/server/task-rules.ts';
import { listMemberProjects } from '#lib/server/projects.ts';
import { createTask, ensurePersonalRoot, listMyTasks, TaskError } from '#lib/server/tasks.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	const db = getDb(env.DB);
	await ensurePersonalRoot(db, me.id);
	const today = todayISO();
	const filters = parseFilters(url.searchParams);
	return {
		today,
		filters,
		projects: await listMemberProjects(db, me.id),
		...(await listMyTasks(db, me.id, filters, today))
	};
};

export const actions: Actions = {
	create: async ({ request, locals }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		const title = form.get('title')?.toString() ?? '';
		const dueDate = form.get('dueDate')?.toString() ?? '';
		try {
			await createTask(getDb(env.DB), me.id, { title, dueDate });
		} catch (e) {
			if (e instanceof TaskError) return fail(400, { message: e.message, title, dueDate });
			throw e;
		}
	}
};
