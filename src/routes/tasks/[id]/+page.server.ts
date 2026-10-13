import { error, fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { listMembers } from '#lib/server/members.ts';
import { canAssign } from '#lib/server/task-rules.ts';
import {
	deleteTask,
	getTask,
	TaskError,
	TaskForbiddenError,
	TaskNotFoundError,
	updateTask
} from '#lib/server/tasks.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	const db = getDb(env.DB);
	try {
		const task = await getTask(db, me.id, params.id);
		const canChangeAssignee = canAssign(task, { userId: me.id });
		return {
			task,
			canChangeAssignee,
			// 指派選單：未停用成員；目前的指派人即使已停用也保留在清單中以免被誤清掉
			members: canChangeAssignee
				? (await listMembers(db))
						.filter((m) => !m.banned || m.id === task.assigneeId)
						.map((m) => ({ id: m.id, name: m.banned ? `${m.name}（已停用）` : m.name }))
				: []
		};
	} catch (e) {
		if (e instanceof TaskNotFoundError) error(404, '找不到任務');
		throw e;
	}
};

const failure = (e: unknown) => {
	if (e instanceof TaskNotFoundError) error(404, '找不到任務');
	if (e instanceof TaskForbiddenError) return fail(403, { message: e.message });
	if (e instanceof TaskError) return fail(400, { message: e.message });
	throw e;
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		const get = (k: string) => form.get(k)?.toString();
		try {
			await updateTask(getDb(env.DB), me.id, params.id, {
				title: get('title'),
				description: get('description'),
				status: get('status'),
				startDate: get('startDate'),
				dueDate: get('dueDate'),
				// 非建立者的表單沒有此欄位（undefined = 不變）
				assigneeId: get('assigneeId')
			});
		} catch (e) {
			return failure(e);
		}
		return { saved: true };
	},
	delete: async ({ locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		try {
			await deleteTask(getDb(env.DB), me.id, params.id);
		} catch (e) {
			return failure(e);
		}
		redirect(303, '/tasks');
	}
};
