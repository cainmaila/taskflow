// 清單依到期日分段（client 端；段內維持伺服器給的順序）
const parse = (iso: string) => {
	const [y, m, d] = iso.split('-').map(Number);
	return Date.UTC(y, m - 1, d);
};
const DAY = 86_400_000;

/** 含 today 的週一到週日，與 server 的 weekRange 一致 */
const weekEnd = (today: string) => {
	const sinceMonday = (new Date(parse(today)).getUTCDay() + 6) % 7;
	return new Date(parse(today) + (6 - sinceMonday) * DAY).toISOString().slice(0, 10);
};

export const SECTIONS = [
	{ key: 'overdue', label: '逾期' },
	{ key: 'today', label: '今天' },
	{ key: 'week', label: '本週' },
	{ key: 'later', label: '之後' },
	{ key: 'none', label: '無日期' }
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];

const sectionOf = (dueDate: string | null, today: string, end: string): SectionKey =>
	dueDate === null
		? 'none'
		: dueDate < today
			? 'overdue'
			: dueDate === today
				? 'today'
				: dueDate <= end
					? 'week'
					: 'later';

export const groupByDue = <T extends { dueDate: string | null }>(rows: T[], today: string) => {
	const end = weekEnd(today);
	const by = new Map<SectionKey, T[]>();
	for (const r of rows) {
		const k = sectionOf(r.dueDate, today, end);
		by.set(k, [...(by.get(k) ?? []), r]);
	}
	return SECTIONS.flatMap((s) => (by.has(s.key) ? [{ ...s, rows: by.get(s.key)! }] : []));
};

/** 到期日短標籤：今天／明天／昨天，其餘 M/D（跨年加年份） */
export const dueLabel = (dueDate: string, today: string) => {
	const diff = Math.round((parse(dueDate) - parse(today)) / DAY);
	if (diff === 0) return '今天';
	if (diff === 1) return '明天';
	if (diff === -1) return '昨天';
	const [y, m, d] = dueDate.split('-').map(Number);
	return dueDate.slice(0, 4) === today.slice(0, 4) ? `${m}/${d}` : `${y}/${m}/${d}`;
};
