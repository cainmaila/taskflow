// 專案的純函式規則（不碰資料庫，方便單元測試）
import { PROJECT_ROLES, type ProjectRole } from './db/schema';

export const NAME_MAX = 100;
export const DESC_MAX = 20000;

export class ProjectError extends Error {}
export class ProjectForbiddenError extends ProjectError {}
export class ProjectNotFoundError extends ProjectError {}

export const isProjectRole = (v: unknown): v is ProjectRole =>
	(PROJECT_ROLES as readonly unknown[]).includes(v);

export const validateName = (value: unknown) => {
	const name = typeof value === 'string' ? value.trim() : '';
	if (!name) throw new ProjectError('請輸入專案名稱');
	if (name.length > NAME_MAX) throw new ProjectError(`專案名稱最多 ${NAME_MAX} 字`);
	return name;
};

export const validateDescription = (value: unknown) => {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string') throw new ProjectError('描述格式不正確');
	if (value.length > DESC_MAX) throw new ProjectError(`描述最多 ${DESC_MAX} 字`);
	return value;
};

type Actor = { userId: string; systemRole: string | null | undefined };

// D56
export const canCreateProject = (systemRole: string | null | undefined) =>
	systemRole === 'manager' || systemRole === 'system_admin';

/** D63：成員或 system_admin 可見 */
export const canViewProject = (memberRole: ProjectRole | null, a: Actor) =>
	memberRole !== null || a.systemRole === 'system_admin';

/** D58：owner 或 system_admin 能管理成員、改資料、封存 */
export const canManageProject = (memberRole: ProjectRole | null, a: Actor) =>
	memberRole === 'owner' || a.systemRole === 'system_admin';

/** D59：任務的建立者或指派人，且是專案成員 */
export const canAttachTask = (
	task: { createdBy: string; assigneeId: string | null },
	memberRole: ProjectRole | null,
	userId: string
) => memberRole !== null && (task.createdBy === userId || task.assigneeId === userId);
