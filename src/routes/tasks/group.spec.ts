import { describe, expect, it } from 'vitest';
import { dueLabel, groupByDue } from './group';

// 2026-10-15 是週四；本週 = 10/12–10/18
const today = '2026-10-15';
const row = (id: string, dueDate: string | null) => ({ id, dueDate });

describe('groupByDue', () => {
	it('依逾期／今天／本週／之後／無日期分段，段內保持原順序，略過空段', () => {
		const out = groupByDue(
			[
				row('a', '2026-10-20'),
				row('b', '2026-10-16'),
				row('c', null),
				row('d', '2026-10-15'),
				row('e', '2026-10-01'),
				row('f', '2026-10-18'),
				row('g', '2026-10-14')
			],
			today
		);
		expect(out.map((s) => [s.key, s.rows.map((r) => r.id)])).toEqual([
			['overdue', ['e', 'g']],
			['today', ['d']],
			['week', ['b', 'f']],
			['later', ['a']],
			['none', ['c']]
		]);
	});

	it('沒有任務時回傳空陣列', () => {
		expect(groupByDue([], today)).toEqual([]);
	});
});

describe('dueLabel', () => {
	it('相對日與 M/D', () => {
		expect(dueLabel('2026-10-15', today)).toBe('今天');
		expect(dueLabel('2026-10-16', today)).toBe('明天');
		expect(dueLabel('2026-10-14', today)).toBe('昨天');
		expect(dueLabel('2026-11-03', today)).toBe('11/3');
		expect(dueLabel('2027-01-03', today)).toBe('2027/1/3');
	});
});
