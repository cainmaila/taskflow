import { error, json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { searchAttachable, TaskNotFoundError } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, '請先登入');
	try {
		const q = url.searchParams.get('q') ?? '';
		return json(await searchAttachable(getDb(env.DB), locals.user.id, params.id, q.slice(0, 100)));
	} catch (e) {
		if (e instanceof TaskNotFoundError) error(404, '找不到任務');
		throw e;
	}
};
