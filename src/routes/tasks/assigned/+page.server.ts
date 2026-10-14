import { redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { parseFilters, todayISO } from '#lib/server/task-rules.ts';
import { listMemberProjects } from '#lib/server/projects.ts';
import { listAssignedByMe } from '#lib/server/tasks.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	const today = todayISO();
	const filters = parseFilters(url.searchParams);
	const db = getDb(env.DB);
	return {
		today,
		filters,
		projects: await listMemberProjects(db, me.id),
		...(await listAssignedByMe(db, me.id, filters, today))
	};
};
