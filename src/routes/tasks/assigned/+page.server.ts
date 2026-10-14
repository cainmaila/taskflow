import { redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { parseFilters, todayISO } from '#lib/server/task-rules.ts';
import { listAssignedByMe } from '#lib/server/tasks.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	const today = todayISO();
	const filters = parseFilters(url.searchParams);
	return { today, filters, ...(await listAssignedByMe(getDb(env.DB), me.id, filters, today)) };
};
