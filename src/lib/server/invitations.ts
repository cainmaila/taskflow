import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from './db/index';
import { invitation, user } from './db/schema';
import { INVITABLE_ROLES } from './permissions';

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
	inv: { usedAt: Date | null; expiresAt: Date },
	now = new Date()
) => inv.usedAt === null && inv.expiresAt.getTime() > now.getTime();

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
	await db.insert(invitation).values({
		email,
		role: input.role,
		invitedBy: input.invitedBy,
		tokenHash: await hashToken(token),
		expiresAt: new Date(now.getTime() + INVITATION_TTL_MS)
	});
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

	const pending = await findUsableInvitation(db, input.token, now);
	if (!pending) throw new InvitationError('邀請連結無效或已過期');
	if (await emailTaken(db, pending.email)) throw new InvitationError('此 Email 已註冊');

	// 原子消耗：同一連結只有一個請求能成功
	const [consumed] = await db
		.update(invitation)
		.set({ usedAt: now })
		.where(
			and(
				eq(invitation.tokenHash, tokenHash),
				isNull(invitation.usedAt),
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
