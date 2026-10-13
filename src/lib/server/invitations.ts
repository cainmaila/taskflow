import { and, eq, gt, isNull, ne } from 'drizzle-orm';
import { getDb } from './db/index';
import { invitation, user } from './db/schema';
import { canInvite, INVITABLE_ROLES } from './permissions';

type Db = ReturnType<typeof getDb>;
type UserCreator = {
	createUser(o: {
		body: { email: string; password: string; name: string; role: InvitableRole };
	}): Promise<unknown>;
};
type InvitableRole = (typeof INVITABLE_ROLES)[number];

export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MIN_PASSWORD_LENGTH = 8;

/** 驗證失敗的訊息可直接顯示給使用者 */
export class InvitationError extends Error {}

export const generateToken = () => {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return btoa(String.fromCharCode(...bytes))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
};

export const hashToken = async (token: string) => {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
};

export const isInvitationUsable = (
	inv: { usedAt: Date | null; revokedAt?: Date | null; expiresAt: Date },
	now = new Date()
) => inv.usedAt === null && !inv.revokedAt && inv.expiresAt.getTime() > now.getTime();

export const validateAccept = (input: { name: string; password: string }) => {
	if (!input.name.trim()) throw new InvitationError('請輸入姓名');
	if (input.password.length < MIN_PASSWORD_LENGTH)
		throw new InvitationError(`密碼至少 ${MIN_PASSWORD_LENGTH} 個字元`);
};

const emailTaken = async (db: Db, email: string) =>
	!!(await db.select({ id: user.id }).from(user).where(eq(user.email, email)).get());

/** 回傳原始 token（僅此一次，DB 只存雜湊） */
export const createInvitation = async (
	db: Db,
	input: { email: string; role: InvitableRole; invitedBy: string },
	now = new Date()
) => {
	const email = input.email.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvitationError('Email 格式不正確');
	if (!INVITABLE_ROLES.includes(input.role)) throw new InvitationError('角色不正確');
	if (await emailTaken(db, email)) throw new InvitationError('此 Email 已註冊');

	const token = generateToken();
	const [created] = await db
		.insert(invitation)
		.values({
			email,
			role: input.role,
			invitedBy: input.invitedBy,
			tokenHash: await hashToken(token),
			expiresAt: new Date(now.getTime() + INVITATION_TTL_MS)
		})
		.returning({ id: invitation.id });
	// D40：先插入新邀請，再作廢同 email 其他未用邀請（email 已在入口正規化為小寫）
	await db
		.update(invitation)
		.set({ revokedAt: now })
		.where(
			and(
				eq(invitation.email, email),
				ne(invitation.id, created.id),
				isNull(invitation.usedAt),
				isNull(invitation.revokedAt)
			)
		);
	return token;
};

/** 回傳仍可用的邀請；無效、過期或已使用皆為 null */
export const findUsableInvitation = async (db: Db, token: string, now = new Date()) => {
	const inv = await db
		.select()
		.from(invitation)
		.where(eq(invitation.tokenHash, await hashToken(token)))
		.get();
	return inv && isInvitationUsable(inv, now) ? inv : null;
};

export const acceptInvitation = async (
	db: Db,
	auth: { api: UserCreator },
	input: { token: string; name: string; password: string },
	now = new Date()
) => {
	validateAccept(input);
	const tokenHash = await hashToken(input.token);

	const found = await db.select().from(invitation).where(eq(invitation.tokenHash, tokenHash)).get();
	if (found?.revokedAt) throw new InvitationError('邀請已失效');
	const pending = found && isInvitationUsable(found, now) ? found : null;
	if (!pending) throw new InvitationError('邀請連結無效或已過期');
	if (await emailTaken(db, pending.email)) throw new InvitationError('此 Email 已註冊');

	// D37：邀請隨邀請人失效（缺席、停用或不再是管理人以上）
	const inviter = await db.select().from(user).where(eq(user.id, pending.invitedBy)).get();
	if (!inviter || inviter.banned || !canInvite(inviter.role))
		throw new InvitationError('邀請已失效');

	// 原子消耗：同一連結只有一個請求能成功
	const [consumed] = await db
		.update(invitation)
		.set({ usedAt: now })
		.where(
			and(
				eq(invitation.tokenHash, tokenHash),
				isNull(invitation.usedAt),
				isNull(invitation.revokedAt),
				gt(invitation.expiresAt, now)
			)
		)
		.returning();
	if (!consumed) throw new InvitationError('邀請連結無效或已過期');

	try {
		await auth.api.createUser({
			body: {
				email: consumed.email,
				password: input.password,
				name: input.name.trim(),
				role: consumed.role
			}
		});
	} catch (e) {
		// D1 沒有交易：消耗邀請與建立使用者不是原子的。還原失敗時只記錄，不遮蔽原始錯誤；
		// 另外 createUser 若在寫入後才失敗，可能留下孤兒使用者（email 已被佔用，需人工處理）。
		try {
			await db.update(invitation).set({ usedAt: null }).where(eq(invitation.id, consumed.id));
		} catch (revertError) {
			console.error('failed to revert invitation used_at', consumed.id, revertError);
		}
		throw e;
	}
	return { email: consumed.email };
};

/** D39：待使用（未用、未撤銷、未過期）的邀請；不含 token 與雜湊 */
export const listPendingInvitations = (db: Db, now = new Date()) =>
	db
		.select({
			id: invitation.id,
			email: invitation.email,
			role: invitation.role,
			invitedBy: invitation.invitedBy,
			inviterName: user.name,
			expiresAt: invitation.expiresAt
		})
		.from(invitation)
		.innerJoin(user, eq(user.id, invitation.invitedBy))
		.where(
			and(isNull(invitation.usedAt), isNull(invitation.revokedAt), gt(invitation.expiresAt, now))
		)
		.orderBy(invitation.createdAt)
		.all();

/** D39：邀請人本人或系統管理員可撤銷；與接受以同一條件式 UPDATE 互斥 */
export const revokeInvitation = async (
	db: Db,
	actor: { id: string; role?: string | null },
	invitationId: string,
	now = new Date()
) => {
	if (!canInvite(actor.role)) throw new InvitationError('沒有權限');
	const inv = await db.select().from(invitation).where(eq(invitation.id, invitationId)).get();
	if (!inv) throw new InvitationError('找不到邀請');
	if (inv.invitedBy !== actor.id && actor.role !== 'system_admin')
		throw new InvitationError('沒有權限');

	const [revoked] = await db
		.update(invitation)
		.set({ revokedAt: now })
		.where(
			and(eq(invitation.id, invitationId), isNull(invitation.usedAt), isNull(invitation.revokedAt))
		)
		.returning({ id: invitation.id });
	if (!revoked) throw new InvitationError('邀請已被使用或撤銷');
};
