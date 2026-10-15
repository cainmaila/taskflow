import { asc, eq } from 'drizzle-orm';
import { getDb } from './db/index';
import { comment, user } from './db/schema';
import type { ProjectActor } from './projects';
import { TaskForbiddenError, TaskNotFoundError, validateComment } from './task-rules';
import { getTask } from './tasks';

type Db = ReturnType<typeof getDb>;

/** D67：看得到任務的人才能讀寫留言；不可見視同找不到任務 */
export const listComments = async (db: Db, userId: string, taskId: string) => {
	await getTask(db, userId, taskId);
	return db
		.select({
			id: comment.id,
			body: comment.body,
			createdAt: comment.createdAt,
			editedAt: comment.editedAt,
			authorId: comment.authorId,
			// D71：停用者名字照常顯示
			authorName: user.name
		})
		.from(comment)
		.innerJoin(user, eq(user.id, comment.authorId))
		.where(eq(comment.taskId, taskId))
		.orderBy(asc(comment.createdAt), asc(comment.id))
		.all();
};

export const addComment = async (db: Db, userId: string, taskId: string, body: unknown) => {
	await getTask(db, userId, taskId);
	const text = validateComment(body);
	const id = crypto.randomUUID();
	await db.insert(comment).values({ id, taskId, authorId: userId, body: text });
	return id;
};

/** taskId 必須與留言所屬任務一致，否則視同找不到（避免拿 A 任務的權限操作 B 任務的留言） */
const loadComment = async (db: Db, taskId: string, commentId: string) => {
	const c = await db.select().from(comment).where(eq(comment.id, commentId)).get();
	if (!c || c.taskId !== taskId) throw new TaskNotFoundError('找不到留言');
	return c;
};

/** D68：只有作者能編輯（system_admin 也不行） */
export const editComment = async (
	db: Db,
	userId: string,
	taskId: string,
	commentId: string,
	body: unknown
) => {
	const c = await loadComment(db, taskId, commentId);
	await getTask(db, userId, c.taskId);
	if (c.authorId !== userId) throw new TaskForbiddenError('只能編輯自己的留言');
	await db
		.update(comment)
		.set({ body: validateComment(body), editedAt: new Date() })
		.where(eq(comment.id, commentId));
};

/** D68：作者或 system_admin（後者不需看得到任務，管理用途） */
export const deleteComment = async (
	db: Db,
	actor: ProjectActor,
	taskId: string,
	commentId: string
) => {
	const c = await loadComment(db, taskId, commentId);
	if (actor.systemRole !== 'system_admin') {
		await getTask(db, actor.userId, c.taskId);
		if (c.authorId !== actor.userId) throw new TaskForbiddenError('只能刪除自己的留言');
	}
	await db.delete(comment).where(eq(comment.id, commentId));
};
