import { and, eq, ne, or, isNull } from 'drizzle-orm';
import { getDb } from './db/index';
import { user } from './db/schema';
import { canManageMembers, wouldRemoveLastAdmin, type Role } from './permissions';

type Db = ReturnType<typeof getDb>;

/** better-auth admin API 的最小子集（測試可替換） */
export type MemberApi = {
	setRole(o: { headers: Headers; body: { userId: string; role: Role } }): Promise<unknown>;
	banUser(o: { headers: Headers; body: { userId: string } }): Promise<unknown>;
	unbanUser(o: { headers: Headers; body: { userId: string } }): Promise<unknown>;
};

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

export const countActiveAdmins = async (db: Db) =>
	(
		await db
			.select({ id: user.id })
			.from(user)
			.where(and(eq(user.role, 'system_admin'), or(isNull(user.banned), ne(user.banned, true))))
			.all()
	).length;

const LAST_ADMIN_MESSAGE = '系統至少要保留一位有效的系統管理員';

/** 角色變更／停用的事前檢查：操作者須為系統管理員，且不得讓唯一的有效系統管理員失效 */
export const guard = async (
	db: Db,
	actorRole: string | null | undefined,
	targetId: string,
	change: { role?: Role; banned?: boolean }
) => {
	if (!canManageMembers(actorRole)) throw new MemberError('沒有權限');
	const target = await db.select().from(user).where(eq(user.id, targetId)).get();
	if (!target) throw new MemberError('找不到成員');
	if (wouldRemoveLastAdmin(target, await countActiveAdmins(db), change))
		throw new MemberError(LAST_ADMIN_MESSAGE);
	return target;
};

/**
 * 先檢查、套用變更，再重算有效系統管理員；為 0 就還原。
 * D1 沒有跨呼叫的交易，所以這是「盡力而為」：同時的請求會各自在套用後重算並還原，
 * 但還原本身失敗時（或程序在兩步之間中斷）仍可能留下 0 位管理員，需用 seed 以外的手段修復。
 */
const applyGuarded = async (
	db: Db,
	actorRole: string | null | undefined,
	targetId: string,
	change: { role?: Role; banned?: boolean },
	apply: () => Promise<unknown>,
	revert: (previous: { role: string | null; banned: boolean | null }) => Promise<unknown>
) => {
	const target = await guard(db, actorRole, targetId, change);
	await apply();
	if ((await countActiveAdmins(db)) > 0) return;
	await revert(target);
	throw new MemberError(LAST_ADMIN_MESSAGE);
};

// 以下呼叫帶 headers，由 better-auth admin 外掛再驗一次操作者權限
export const changeRole = (
	db: Db,
	api: MemberApi,
	headers: Headers,
	actorRole: string | null | undefined,
	targetId: string,
	role: Role
) =>
	applyGuarded(
		db,
		actorRole,
		targetId,
		{ role },
		() => api.setRole({ headers, body: { userId: targetId, role } }),
		(prev) =>
			api.setRole({ headers, body: { userId: targetId, role: (prev.role ?? 'member') as Role } })
	);

export const setBanned = (
	db: Db,
	api: MemberApi,
	headers: Headers,
	actorRole: string | null | undefined,
	targetId: string,
	banned: boolean
) =>
	applyGuarded(
		db,
		actorRole,
		targetId,
		{ banned },
		() =>
			banned
				? api.banUser({ headers, body: { userId: targetId } })
				: api.unbanUser({ headers, body: { userId: targetId } }),
		// 還原到變更前的狀態（原本就停用的要維持停用）
		(prev) =>
			prev.banned
				? api.banUser({ headers, body: { userId: targetId } })
				: api.unbanUser({ headers, body: { userId: targetId } })
	);
