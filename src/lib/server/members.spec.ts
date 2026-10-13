import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { user } from './db/schema';
import { changeRole, countActiveAdmins, MemberError, setBanned, type MemberApi } from './members';
import { createTestDb } from './test-db';

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => (t = await createTestDb()));
afterAll(() => t.dispose());

const headers = new Headers();
const add = (id: string, role: string, banned: boolean | null) =>
	t.db.insert(user).values({ id, name: id, email: `${id}@x.io`, role, banned });
const get = (id: string) => t.db.select().from(user).where(eq(user.id, id)).get();

// 假的 better-auth admin API：直接改 DB，並記錄呼叫
let calls: string[];
const api: MemberApi = {
	async setRole({ body }) {
		calls.push(`role:${body.userId}:${body.role}`);
		await t.db.update(user).set({ role: body.role }).where(eq(user.id, body.userId));
	},
	async banUser({ body }) {
		calls.push(`ban:${body.userId}`);
		await t.db.update(user).set({ banned: true }).where(eq(user.id, body.userId));
	},
	async unbanUser({ body }) {
		calls.push(`unban:${body.userId}`);
		await t.db.update(user).set({ banned: false }).where(eq(user.id, body.userId));
	}
};

beforeEach(async () => {
	calls = [];
	await t.db.delete(user);
});

describe('countActiveAdmins', () => {
	it('counts banned NULL and false, skips banned true and non-admins', async () => {
		await add('a1', 'system_admin', null);
		await add('a2', 'system_admin', false);
		await add('a3', 'system_admin', true);
		await add('m1', 'manager', null);
		expect(await countActiveAdmins(t.db)).toBe(2);
	});
});

describe('changeRole / setBanned', () => {
	it('rejects non system_admin actors without touching the API', async () => {
		await add('a1', 'system_admin', null);
		await add('m1', 'member', false);
		await expect(changeRole(t.db, api, headers, 'manager', 'm1', 'manager')).rejects.toThrow(
			MemberError
		);
		await expect(setBanned(t.db, api, headers, 'member', 'm1', true)).rejects.toThrow(MemberError);
		expect(calls).toEqual([]);
	});

	it('rejects unknown targets', async () => {
		await expect(changeRole(t.db, api, headers, 'system_admin', 'nope', 'member')).rejects.toThrow(
			'找不到成員'
		);
	});

	it('blocks demoting or banning the only active admin (banned NULL counts as active)', async () => {
		await add('a1', 'system_admin', null);
		await add('a2', 'system_admin', true);
		await expect(changeRole(t.db, api, headers, 'system_admin', 'a1', 'manager')).rejects.toThrow(
			'至少要保留'
		);
		await expect(setBanned(t.db, api, headers, 'system_admin', 'a1', true)).rejects.toThrow(
			'至少要保留'
		);
		expect(calls).toEqual([]);
		expect((await get('a1'))?.role).toBe('system_admin');
	});

	it('allows demoting and banning when another active admin remains', async () => {
		await add('a1', 'system_admin', null);
		await add('a2', 'system_admin', false);
		await changeRole(t.db, api, headers, 'system_admin', 'a1', 'manager');
		expect((await get('a1'))?.role).toBe('manager');
		await expect(setBanned(t.db, api, headers, 'system_admin', 'a2', true)).rejects.toThrow(
			'至少要保留'
		);
	});

	it('reverts when a concurrent change already removed the other admin (post-check)', async () => {
		await add('a1', 'system_admin', false);
		await add('a2', 'system_admin', false);
		// 模擬競態：事前檢查看到 2 位，但 apply 時另一位已被同時停用
		const racing: MemberApi = {
			...api,
			async banUser(o) {
				await t.db.update(user).set({ banned: true }).where(eq(user.id, 'a2'));
				return api.banUser(o);
			}
		};
		await expect(setBanned(t.db, racing, headers, 'system_admin', 'a1', true)).rejects.toThrow(
			'至少要保留'
		);
		expect((await get('a1'))?.banned).toBe(false);
		expect(calls).toEqual(['ban:a1', 'unban:a1']);
	});

	it('rollback restores the prior state: an already-banned target stays banned', async () => {
		await add('a1', 'system_admin', false);
		await add('m1', 'member', true);
		const racing: MemberApi = {
			...api,
			async banUser(o) {
				await t.db.update(user).set({ banned: true }).where(eq(user.id, 'a1'));
				return api.banUser(o);
			}
		};
		await expect(setBanned(t.db, racing, headers, 'system_admin', 'm1', true)).rejects.toThrow(
			'至少要保留'
		);
		expect((await get('m1'))?.banned).toBe(true);
		expect(calls).toEqual(['ban:m1', 'ban:m1']);
	});

	it('bans and unbans regular members', async () => {
		await add('a1', 'system_admin', null);
		await add('m1', 'member', null);
		await setBanned(t.db, api, headers, 'system_admin', 'm1', true);
		expect((await get('m1'))?.banned).toBe(true);
		await setBanned(t.db, api, headers, 'system_admin', 'm1', false);
		expect((await get('m1'))?.banned).toBe(false);
	});
});
