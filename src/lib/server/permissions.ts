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
