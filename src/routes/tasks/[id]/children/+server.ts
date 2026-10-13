import { error, json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { listChildren, TaskNotFoundError } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, '請先登入');
	try {
		return json(await listChildren(getDb(env.DB), locals.user.id, params.id));
	} catch (e) {
		if (e instanceof TaskNotFoundError) error(404, '找不到任務');
		throw e;
	}
};
