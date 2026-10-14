import { error, fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { listMembers } from '#lib/server/members.ts';
import { projectFailure } from '#lib/server/project-http.ts';
import { attachTask, detachTask, listTaskProjects } from '#lib/server/projects.ts';
import { canAssign, todayISO } from '#lib/server/task-rules.ts';
import {
	attachChild,
	createTask,
	deleteTask,
	detachChild,
	getTask,
	listChildren,
	listParents,
	TaskConflictError,
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
			parents: await listParents(db, me.id, params.id),
			projects: await listTaskProjects(db, me.id, params.id),
			children: await listChildren(db, me.id, params.id),
			today: todayISO(),
			canDelete: canChangeAssignee,
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
	if (e instanceof TaskConflictError) return fail(409, { message: e.message, plan: e.plan });
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
	addChild: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		const title = form.get('title')?.toString() ?? '';
		const dueDate = form.get('dueDate')?.toString() ?? '';
		try {
			await createTask(getDb(env.DB), me.id, { title, dueDate, parentId: params.id });
		} catch (e) {
			return failure(e);
		}
		return { added: true };
	},
	attach: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		try {
			await attachChild(getDb(env.DB), me.id, params.id, form.get('childId')?.toString() ?? '');
		} catch (e) {
			return failure(e);
		}
		return { attached: true };
	},
	// 移除「這個任務」與某個 parent 的關聯（D50：需對這個任務有操作權）
	detach: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		try {
			await detachChild(getDb(env.DB), me.id, form.get('parentId')?.toString() ?? '', params.id);
		} catch (e) {
			return failure(e);
		}
		return { detached: true };
	},
	attachProject: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		try {
			await attachTask(
				getDb(env.DB),
				{ userId: me.id, systemRole: me.role },
				form.get('projectId')?.toString() ?? '',
				params.id
			);
		} catch (e) {
			return projectFailure(e);
		}
		return { projectAttached: true };
	},
	detachProject: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		try {
			await detachTask(
				getDb(env.DB),
				{ userId: me.id, systemRole: me.role },
				form.get('projectId')?.toString() ?? '',
				params.id
			);
		} catch (e) {
			return projectFailure(e);
		}
		return { projectDetached: true };
	},
	delete: async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		const form = await request.formData();
		try {
			await deleteTask(
				getDb(env.DB),
				me.id,
				params.id,
				form.get('mode')?.toString() === 'tree' ? 'tree' : 'single',
				// 缺少確認內容一律視為不一致
				form.get('expect')?.toString() ?? ''
			);
		} catch (e) {
			return failure(e);
		}
		redirect(303, '/tasks');
	}
};
