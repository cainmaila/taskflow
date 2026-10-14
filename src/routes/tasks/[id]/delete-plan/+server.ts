import { error, json } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { planDelete, planKey, TaskForbiddenError, TaskNotFoundError } from '#lib/server/tasks.ts';
import type { RequestHandler } from './$types';

/** 刪除預覽（開對話框時才查）；keys 是送出刪除時要帶回的確認內容 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) error(401, '請先登入');
	try {
		const plan = await planDelete(getDb(env.DB), locals.user.id, params.id);
		return json({ plan, keys: { single: planKey(plan, 'single'), tree: planKey(plan, 'tree') } });
	} catch (e) {
		if (e instanceof TaskNotFoundError) error(404, '找不到任務');
		if (e instanceof TaskForbiddenError) error(403, e.message);
		throw e;
	}
};
