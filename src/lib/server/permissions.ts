import { createAccessControl } from 'better-auth/plugins/access';
import { adminAc, defaultStatements } from 'better-auth/plugins/admin/access';

export const ac = createAccessControl(defaultStatements);

// system_admin: 管理成員；manager 與 member 本身無 admin API 權限（邀請權限由應用層以角色檢查）
export const roles = {
	system_admin: ac.newRole(adminAc.statements),
	manager: ac.newRole({ user: [], session: [] }),
	member: ac.newRole({ user: [], session: [] })
};

export type Role = keyof typeof roles;

export const INVITABLE_ROLES = ['member', 'manager'] as const satisfies readonly Role[];

const isRole = (value: unknown): value is Role =>
	typeof value === 'string' && Object.hasOwn(roles, value);

export const parseRole = (value: unknown): Role | null => (isRole(value) ? value : null);

// D27: 管理人與系統管理員可邀請
export const canInvite = (role: string | null | undefined) =>
	role === 'manager' || role === 'system_admin';

// D27/D32: 只有系統管理員能改角色、停用／啟用
export const canManageMembers = (role: string | null | undefined) => role === 'system_admin';

/**
 * D27 不變量：最後一位有效（未停用）的系統管理員不能被降級或停用。
 * `activeAdminCount` 為變更前有效系統管理員人數。
 */
export const wouldRemoveLastAdmin = (
	target: { role: string | null; banned: boolean | null },
	activeAdminCount: number,
	change: { role?: Role; banned?: boolean }
) => {
	const isActiveAdmin = target.role === 'system_admin' && !target.banned;
	if (!isActiveAdmin || activeAdminCount > 1) return false;
	return (change.role !== undefined && change.role !== 'system_admin') || change.banned === true;
};
