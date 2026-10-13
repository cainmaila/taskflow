// 用法：node --env-file=.env scripts/seed-admin.ts [--remote]
// 預設寫入本機 D1；--remote 必須明確指定。系統內已有任何使用者時不寫入（D31）。
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hashPassword } from 'better-auth/crypto';

const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error('ADMIN_EMAIL 與 ADMIN_PASSWORD 必須設定');
if (ADMIN_PASSWORD.length < 8) throw new Error('ADMIN_PASSWORD 至少 8 個字元');

const target = process.argv.includes('--remote') ? '--remote' : '--local';
const email = ADMIN_EMAIL.trim().toLowerCase();
const name = ADMIN_NAME?.trim() || 'Admin';
const userId = randomUUID();
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const now = Date.now();
const passwordHash = await hashPassword(ADMIN_PASSWORD);

// wrangler 不保證多個陳述式是同一個交易，所以不假設 user 與 account 一起成功：
// 執行後另外檢查，若只有 user 沒有 account，就刪掉這個半成品 user 並失敗，讓 seed 可以重跑。
// account 只在剛建立 user 時寫入（以 user.id 判斷），所以已有使用者時兩者都不寫。
const sql = `
INSERT INTO user (id, name, email, email_verified, role, banned, created_at, updated_at)
SELECT ${q(userId)}, ${q(name)}, ${q(email)}, 1, 'system_admin', 0, ${now}, ${now}
WHERE NOT EXISTS (SELECT 1 FROM user);
INSERT INTO account (id, account_id, provider_id, user_id, password, created_at, updated_at)
SELECT ${q(randomUUID())}, ${q(userId)}, 'credential', ${q(userId)}, ${q(passwordHash)}, ${now}, ${now}
WHERE EXISTS (SELECT 1 FROM user WHERE id = ${q(userId)});
`;

const wrangler = (args: string[]) =>
	execFileSync('pnpm', ['exec', 'wrangler', 'd1', 'execute', 'DB', target, '--json', ...args], {
		encoding: 'utf8'
	});
const query = (command: string) =>
	JSON.parse(wrangler(['--command', command])).at(-1)?.results?.[0];

const dir = mkdtempSync(join(tmpdir(), 'seed-admin-'));
const file = join(dir, 'seed.sql');
writeFileSync(file, sql, { mode: 0o600 }); // 內含密碼雜湊
try {
	wrangler(['--file', file]);
} finally {
	rmSync(dir, { recursive: true, force: true });
}

const { users, accounts } = query(
	`SELECT (SELECT COUNT(*) FROM user WHERE id = ${q(userId)}) AS users, (SELECT COUNT(*) FROM account WHERE user_id = ${q(userId)}) AS accounts`
);
if (users === 1 && accounts !== 1) {
	wrangler(['--command', `DELETE FROM user WHERE id = ${q(userId)}`]);
	console.error('建立帳號到一半失敗，已清除半成品，請重跑。');
	process.exit(1);
}
if (users !== 1) {
	console.error('系統內已有使用者，未建立管理員。');
	process.exit(1);
}
console.log(`已建立系統管理員 ${email}（${target.slice(2)}）`);
