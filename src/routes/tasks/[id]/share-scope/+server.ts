import { error, json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { getTask, shareScope, TaskNotFoundError } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

/** D15：把 ?child= 掛到這個任務底下時，新增得以看到它的人。兩邊都必須是呼叫者看得到的 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user) error(401, '請先登入');
	const db = getDb(env.DB);
	const childId = url.searchParams.get('child') ?? '';
	try {
		await getTask(db, locals.user.id, params.id);
		await getTask(db, locals.user.id, childId);
		return json(await shareScope(db, params.id, childId));
	} catch (e) {
		if (e instanceof TaskNotFoundError) error(404, '找不到任務');
		throw e;
	}
};
