import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { invitation, user } from './db/schema';
import {
	acceptInvitation,
	createInvitation,
	hashToken,
	INVITATION_TTL_MS,
	InvitationError,
	listPendingInvitations,
	revokeInvitation
} from './invitations';
import { createTestDb } from './test-db';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

beforeEach(async () => {
	await t.db.delete(invitation);
	await t.db.delete(user);
	await t.db
		.insert(user)
		.values({ id: 'admin', name: 'Admin', email: 'admin@x.io', role: 'system_admin' });
});

const row = async (token: string) =>
	t.db
		.select()
		.from(invitation)
		.where(eq(invitation.tokenHash, await hashToken(token)))
		.get();

const okApi = () => {
	const createUser = vi.fn(async ({ body }: { body: { email: string; name: string } }) => {
		await t.db.insert(user).values({ id: crypto.randomUUID(), name: body.name, email: body.email });
	});
	return { api: { createUser }, createUser };
};

describe('createInvitation', () => {
	it('stores only the hash, lowercases email, expires in 7 days', async () => {
		const now = new Date('2026-01-01T00:00:00Z');
		const token = await createInvitation(
			t.db,
			{ email: ' New@X.io ', role: 'manager', invitedBy: 'admin' },
			now
		);
		const inv = await row(token);
		expect(inv).toMatchObject({ email: 'new@x.io', role: 'manager', usedAt: null });
		expect(inv?.tokenHash).not.toBe(token);
		expect(inv?.expiresAt.getTime()).toBe(now.getTime() + INVITATION_TTL_MS);
	});

	it('rejects already-registered emails and bad roles', async () => {
		await expect(
			createInvitation(t.db, { email: 'ADMIN@x.io', role: 'member', invitedBy: 'admin' })
		).rejects.toThrow('已註冊');
		await expect(
			createInvitation(t.db, {
				email: 'a@x.io',
				role: 'system_admin' as 'member',
				invitedBy: 'admin'
			})
		).rejects.toThrow(InvitationError);
		await expect(
			createInvitation(t.db, { email: 'not-an-email', role: 'member', invitedBy: 'admin' })
		).rejects.toThrow(InvitationError);
	});
});

describe('acceptInvitation', () => {
	const input = (token: string) => ({ token, name: 'Bob', password: 'password123' });
	const invite = (email = 'bob@x.io') =>
		createInvitation(t.db, { email, role: 'member', invitedBy: 'admin' });

	it('creates the user with the invited role and consumes the invitation', async () => {
		const token = await invite();
		const { api, createUser } = okApi();
		await acceptInvitation(t.db, { api }, input(token));
		expect(createUser).toHaveBeenCalledWith({
			body: { email: 'bob@x.io', password: 'password123', name: 'Bob', role: 'member' }
		});
		expect((await row(token))?.usedAt).toBeInstanceOf(Date);
	});

	it('second accept of the same token fails without creating another user', async () => {
		const token = await invite();
		const { api, createUser } = okApi();
		await acceptInvitation(t.db, { api }, input(token));
		await expect(acceptInvitation(t.db, { api }, input(token))).rejects.toThrow(InvitationError);
		expect(createUser).toHaveBeenCalledTimes(1);
	});

	it('concurrent accepts: only one wins', async () => {
		const token = await invite();
		const { api, createUser } = okApi();
		const results = await Promise.allSettled([
			acceptInvitation(t.db, { api }, input(token)),
			acceptInvitation(t.db, { api }, input(token))
		]);
		expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
		expect(createUser).toHaveBeenCalledTimes(1);
	});

	it('rejects expired invitations and unknown tokens', async () => {
		const token = await invite();
		const { api, createUser } = okApi();
		const later = new Date(Date.now() + INVITATION_TTL_MS + 1000);
		await expect(acceptInvitation(t.db, { api }, input(token), later)).rejects.toThrow(
			'無效或已過期'
		);
		await expect(acceptInvitation(t.db, { api }, input('nope'))).rejects.toThrow('無效或已過期');
		expect(createUser).not.toHaveBeenCalled();
	});

	it('does not consume the invitation on invalid input', async () => {
		const token = await invite();
		const { api } = okApi();
		await expect(
			acceptInvitation(t.db, { api }, { token, name: 'Bob', password: 'short' })
		).rejects.toThrow(InvitationError);
		expect((await row(token))?.usedAt).toBeNull();
	});

	it('rolls back used_at when createUser fails and rethrows the original error', async () => {
		const token = await invite();
		const boom = new Error('createUser failed');
		const api = { createUser: vi.fn().mockRejectedValue(boom) };
		await expect(acceptInvitation(t.db, { api }, input(token))).rejects.toBe(boom);
		expect((await row(token))?.usedAt).toBeNull();
	});

	describe('inviter status (D37)', () => {
		const setInviter = (patch: Partial<typeof user.$inferInsert>) =>
			t.db.update(user).set(patch).where(eq(user.id, 'admin'));

		it.each([
			['demoted to member', { role: 'member' }],
			['banned', { role: 'manager', banned: true }]
		])('rejects when inviter is %s, without consuming', async (_, patch) => {
			const token = await invite();
			await setInviter(patch);
			const { api, createUser } = okApi();
			await expect(acceptInvitation(t.db, { api }, input(token))).rejects.toThrow('邀請已失效');
			expect((await row(token))?.usedAt).toBeNull();
			expect(createUser).not.toHaveBeenCalled();
		});

		it('accepts when inviter is still manager', async () => {
			const token = await invite();
			await setInviter({ role: 'manager', banned: false });
			const { api, createUser } = okApi();
			await acceptInvitation(t.db, { api }, input(token));
			expect(createUser).toHaveBeenCalledTimes(1);
		});
	});

	it('rejects when the email got registered after the invitation was made', async () => {
		const token = await invite('admin@x.io').catch(() => null);
		expect(token).toBeNull(); // 建立時就擋掉
		const late = await invite('late@x.io');
		await t.db.insert(user).values({ id: 'late', name: 'L', email: 'late@x.io' });
		const { api, createUser } = okApi();
		await expect(acceptInvitation(t.db, { api }, input(late))).rejects.toThrow('已註冊');
		expect((await row(late))?.usedAt).toBeNull();
		expect(createUser).not.toHaveBeenCalled();
	});
});

describe('revokeInvitation (D39)', () => {
	const admin = { id: 'admin', role: 'system_admin' };
	const invite = () =>
		createInvitation(t.db, { email: 'bob@x.io', role: 'member', invitedBy: 'mgr' });
	const input = (token: string) => ({ token, name: 'Bob', password: 'password123' });
	const idOf = async (token: string) => (await row(token))!.id;

	beforeEach(async () => {
		await t.db.insert(user).values({ id: 'mgr', name: 'M', email: 'mgr@x.io', role: 'manager' });
		await t.db.insert(user).values({ id: 'mgr2', name: 'M2', email: 'mgr2@x.io', role: 'manager' });
	});

	it('inviter and system_admin can revoke; other manager and member cannot', async () => {
		const token = await invite();
		const id = await idOf(token);
		await expect(revokeInvitation(t.db, { id: 'mgr2', role: 'manager' }, id)).rejects.toThrow(
			'沒有權限'
		);
		await expect(revokeInvitation(t.db, { id: 'x', role: 'member' }, id)).rejects.toThrow(
			'沒有權限'
		);
		expect((await row(token))?.revokedAt).toBeNull();
		await revokeInvitation(t.db, { id: 'mgr', role: 'manager' }, id);
		expect((await row(token))?.revokedAt).toBeInstanceOf(Date);

		const token2 = await invite();
		await revokeInvitation(t.db, admin, await idOf(token2));
		expect((await row(token2))?.revokedAt).toBeInstanceOf(Date);
	});

	it('revoked link cannot be accepted, and used_at stays null', async () => {
		const token = await invite();
		await revokeInvitation(t.db, admin, await idOf(token));
		const createUser = vi.fn();
		await expect(acceptInvitation(t.db, { api: { createUser } }, input(token))).rejects.toThrow(
			'邀請已失效'
		);
		expect(createUser).not.toHaveBeenCalled();
		expect((await row(token))?.usedAt).toBeNull();
	});

	it('used invitation cannot be revoked; revoking twice fails', async () => {
		const used = await invite();
		const createUser = vi.fn(async () => {});
		await acceptInvitation(t.db, { api: { createUser } }, input(used));
		await expect(revokeInvitation(t.db, admin, await idOf(used))).rejects.toThrow('已被使用');
		expect((await row(used))?.revokedAt).toBeNull();

		await t.db.delete(invitation);
		const token = await invite();
		const id = await idOf(token);
		await revokeInvitation(t.db, admin, id);
		await expect(revokeInvitation(t.db, admin, id)).rejects.toThrow('已被使用或撤銷');
	});

	it('pending list excludes used, revoked, expired and exposes no token data', async () => {
		const pending = await invite();
		const revoked = await createInvitation(t.db, {
			email: 'r@x.io',
			role: 'member',
			invitedBy: 'mgr'
		});
		await revokeInvitation(t.db, admin, await idOf(revoked));
		await createInvitation(
			t.db,
			{ email: 'old@x.io', role: 'member', invitedBy: 'mgr' },
			new Date(Date.now() - INVITATION_TTL_MS - 1000)
		);
		const list = await listPendingInvitations(t.db);
		expect(list.map((i) => i.email)).toEqual(['bob@x.io']);
		expect(list[0]).toMatchObject({ inviterName: 'M', id: await idOf(pending) });
		expect(JSON.stringify(list)).not.toMatch(/token/i);
	});
});
