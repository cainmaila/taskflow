// 測試用：以 wrangler 的本機 D1（記憶體，不落地）套用 drizzle migration
import { readdirSync, readFileSync } from 'node:fs';
import { getPlatformProxy } from 'wrangler';
import { getDb } from './db/index';

export const createTestDb = async () => {
	const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: false });
	for (const file of readdirSync('drizzle')
		.filter((f) => f.endsWith('.sql'))
		.sort()) {
		const statements = readFileSync(`drizzle/${file}`, 'utf8')
			.replace(/^-- .*$/gm, '') // 行內註解會被下面的換行合併吃掉整句
			.split('--> statement-breakpoint');
		for (const sql of statements)
			if (sql.trim()) await proxy.env.DB.exec(sql.replaceAll('\n', ' '));
	}
	return { db: getDb(proxy.env.DB), dispose: () => proxy.dispose() };
};
