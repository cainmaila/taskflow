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
	// 逾期段內依日期由舊到新（同日維持原順序，sort 為 stable）
	by.get('overdue')?.sort((a, b) =>
		a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0
	);
	return SECTIONS.flatMap((s) => (by.has(s.key) ? [{ ...s, rows: by.get(s.key)! }] : []));
};

/** 到期日短標籤：今天／明天／昨天；同一週（週一起算）用「週X」；其餘 M/D（跨年加年份） */
export const dueLabel = (dueDate: string, today: string) => {
	const diff = Math.round((parse(dueDate) - parse(today)) / DAY);
	if (diff === 0) return '今天';
	if (diff === 1) return '明天';
	if (diff === -1) return '昨天';
	const t = parse(today);
	const weekStart = t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
	const d = parse(dueDate);
	// 「週X」只給今天之後、同一週的日期；過去日期用 M/D
	if (d > t && d < weekStart + 7 * DAY) return `週${'日一二三四五六'[new Date(d).getUTCDay()]}`;
	const [y, m, day] = dueDate.split('-').map(Number);
	return dueDate.slice(0, 4) === today.slice(0, 4) ? `${m}/${day}` : `${y}/${m}/${day}`;
};
