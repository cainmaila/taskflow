import { and, eq, ne, or, isNull } from 'drizzle-orm';
import { getDb } from './db/index';
import { user } from './db/schema';
import { canManageMembers, wouldRemoveLastAdmin, type Role } from './permissions';
import type { createAuth } from './auth';

type Db = ReturnType<typeof getDb>;
type Auth = ReturnType<typeof createAuth>;

export class MemberError extends Error {}

export const listMembers = (db: Db) =>
	db
		.select({
			id: user.id,
			name: user.name,
			email: user.email,
			role: user.role,
			banned: user.banned
		})
		.from(user)
		.orderBy(user.createdAt)
		.all();

const countActiveAdmins = async (db: Db) =>
	(
		await db
			.select({ id: user.id })
			.from(user)
			.where(and(eq(user.role, 'system_admin'), or(isNull(user.banned), ne(user.banned, true))))
			.all()
	).length;

/** 角色變更／停用的共用檢查：操作者須為系統管理員，且不得違反最後管理員不變量 */
const guard = async (
	db: Db,
	actorRole: string | null | undefined,
	targetId: string,
	change: { role?: Role; banned?: boolean }
) => {
	if (!canManageMembers(actorRole)) throw new MemberError('沒有權限');
	const target = await db.select().from(user).where(eq(user.id, targetId)).get();
	if (!target) throw new MemberError('找不到成員');
	if (wouldRemoveLastAdmin(target, await countActiveAdmins(db), change))
		throw new MemberError('系統至少要保留一位有效的系統管理員');
};

// 以下呼叫帶 headers，由 better-auth admin 外掛再驗一次操作者權限
export const changeRole = async (
	db: Db,
	auth: Auth,
	headers: Headers,
	actorRole: string | null | undefined,
	targetId: string,
	role: Role
) => {
	await guard(db, actorRole, targetId, { role });
	await auth.api.setRole({ headers, body: { userId: targetId, role } });
};

export const setBanned = async (
	db: Db,
	auth: Auth,
	headers: Headers,
	actorRole: string | null | undefined,
	targetId: string,
	banned: boolean
) => {
	await guard(db, actorRole, targetId, { banned });
	if (banned) await auth.api.banUser({ headers, body: { userId: targetId } });
	else await auth.api.unbanUser({ headers, body: { userId: targetId } });
};
