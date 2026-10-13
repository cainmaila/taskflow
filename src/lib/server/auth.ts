import { ORIGIN, BETTER_AUTH_SECRET } from '$app/env/private';
import { betterAuth } from 'better-auth/minimal';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { getRequestEvent } from '$app/server';
import { getDb } from '#lib/server/db/index.ts';
import { ac, roles } from '#lib/server/permissions.ts';

const authConfig = {
	baseURL: ORIGIN,
	secret: BETTER_AUTH_SECRET,
	// 邀請制（D26）：不開放自行註冊，帳號只能由邀請流程或 seed 建立
	emailAndPassword: { enabled: true, disableSignUp: true },
	plugins: [
		admin({ ac, roles, defaultRole: 'member', adminRoles: ['system_admin'] }),
		sveltekitCookies(getRequestEvent) // make sure this is the last plugin in the array
	]
} satisfies Omit<Parameters<typeof betterAuth>[0], 'database'>;

export const createAuth = (d1: D1Database) =>
	betterAuth({
		...authConfig,
		database: drizzleAdapter(getDb(d1), { provider: 'sqlite' })
	});

/**
 * DO NOT USE!
 *
 * This instance is used by the `auth` CLI for schema generation ONLY.
 * To access `auth` at runtime, use `event.locals.auth`.
 */
export const auth = createAuth(null!);
