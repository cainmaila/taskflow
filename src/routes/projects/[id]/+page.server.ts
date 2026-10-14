import { fail, redirect } from '@sveltejs/kit';
import { env } from 'cloudflare:workers';
import { getDb } from '#lib/server/db/index.ts';
import { projectFailure, projectLoadError } from '#lib/server/project-http.ts';
import {
	addMember,
	detachTask,
	getProject,
	listAddableUsers,
	listProjectTasks,
	removeMember,
	setArchived,
	setMemberRole,
	updateProject,
	type ProjectActor
} from '#lib/server/projects.ts';
import { todayISO } from '#lib/server/task-rules.ts';
import type { Actions, PageServerLoad } from './$types';

const actor = (me: NonNullable<App.Locals['user']>): ProjectActor => ({
	userId: me.id,
	systemRole: me.role
});

export const load: PageServerLoad = async ({ locals, params }) => {
	const me = locals.user;
	if (!me) redirect(302, '/login');
	const db = getDb(env.DB);
	try {
		const project = await getProject(db, actor(me), params.id);
		const writable = project.canManage && !project.archivedAt;
		return {
			project,
			meId: me.id,
			today: todayISO(),
			tasks: await listProjectTasks(db, actor(me), params.id),
			// 加成員的候選只給有管理權限且未封存者
			addable: writable ? await listAddableUsers(db, actor(me), params.id) : []
		};
	} catch (e) {
		return projectLoadError(e);
	}
};

/** 讀 form → 呼叫 → 對應錯誤；成功時回傳 { ok } 供畫面顯示訊息 */
const run =
	(
		fn: (
			db: ReturnType<typeof getDb>,
			a: ProjectActor,
			id: string,
			form: FormData
		) => Promise<unknown>,
		ok: string,
		// 訊息顯示在哪個區塊旁（info 為頁首）
		section: 'info' | 'members' | 'tasks'
	): import('@sveltejs/kit').Action<{ id: string }> =>
	async ({ request, locals, params }) => {
		const me = locals.user;
		if (!me) redirect(302, '/login');
		try {
			await fn(getDb(env.DB), actor(me), params.id, await request.formData());
		} catch (e) {
			const r = projectFailure(e);
			return fail(r.status, { ...r.data, section });
		}
		return { ok, section };
	};

const str = (f: FormData, k: string) => f.get(k)?.toString() ?? '';

export const actions: Actions = {
	update: run(
		(db, a, id, f) =>
			updateProject(db, a, id, { name: str(f, 'name'), description: str(f, 'description') }),
		'已儲存',
		'info'
	),
	// 封存狀態由頁面上的橫幅與標籤呈現，不另外顯示成功訊息
	archive: run((db, a, id) => setArchived(db, a, id, true), '', 'info'),
	unarchive: run((db, a, id) => setArchived(db, a, id, false), '', 'info'),
	addMember: run(
		(db, a, id, f) => addMember(db, a, id, str(f, 'userId'), f.get('role')),
		'已加入成員',
		'members'
	),
	setRole: run(
		(db, a, id, f) => setMemberRole(db, a, id, str(f, 'userId'), f.get('role')),
		'已更新角色',
		'members'
	),
	removeMember: run(
		(db, a, id, f) => removeMember(db, a, id, str(f, 'userId')),
		'已移除成員',
		'members'
	),
	detachTask: run((db, a, id, f) => detachTask(db, a, id, str(f, 'taskId')), '已取消掛接', 'tasks')
};
