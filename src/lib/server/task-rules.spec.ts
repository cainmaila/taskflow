import { describe, expect, it } from 'vitest';
import {
	applyFilters,
	canAssign,
	canDelete,
	canEdit,
	computeTreeDelete,
	canView,
	isOverdue,
	isValidDate,
	parseFilters,
	todayISO,
	validateDates,
	validateTitle,
	weekRange,
	type TaskFilters
} from './task-rules';

describe('dates', () => {
	it('accepts only real calendar days', () => {
		expect(isValidDate('2026-02-28')).toBe(true);
		expect(isValidDate('2028-02-29')).toBe(true);
		expect(isValidDate('2026-02-30')).toBe(false);
		expect(isValidDate('2026-13-01')).toBe(false);
		expect(isValidDate('2026-2-1')).toBe(false);
		expect(isValidDate(null)).toBe(false);
	});

	it('validateDates requires due and start <= due', () => {
		expect(() => validateDates(null, null)).toThrow('到期日');
		expect(() => validateDates(null, '2026-02-30')).toThrow('到期日');
		expect(() => validateDates('2026-03-02', '2026-03-01')).toThrow('晚於');
		expect(() => validateDates('2026-03-01', '2026-03-01')).not.toThrow();
		expect(() => validateDates(null, '2026-03-01')).not.toThrow();
	});

	it('todayISO uses Taipei time', () => {
		expect(todayISO(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
	});

	it('week runs Monday to Sunday', () => {
		expect(weekRange('2026-10-12')).toEqual({ start: '2026-10-12', end: '2026-10-18' }); // Mon
		expect(weekRange('2026-10-18')).toEqual({ start: '2026-10-12', end: '2026-10-18' }); // Sun
		expect(weekRange('2026-10-19')).toEqual({ start: '2026-10-19', end: '2026-10-25' }); // next Mon
		expect(weekRange('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' }); // year boundary
	});

	it('overdue excludes done and today', () => {
		expect(isOverdue({ dueDate: '2026-10-11', status: 'todo' }, '2026-10-12')).toBe(true);
		expect(isOverdue({ dueDate: '2026-10-12', status: 'todo' }, '2026-10-12')).toBe(false);
		expect(isOverdue({ dueDate: '2026-10-11', status: 'done' }, '2026-10-12')).toBe(false);
	});
});

describe('validateTitle', () => {
	it('trims, rejects empty and too long', () => {
		expect(validateTitle('  hi ')).toBe('hi');
		expect(() => validateTitle('   ')).toThrow();
		expect(() => validateTitle(undefined)).toThrow();
		expect(() => validateTitle('x'.repeat(201))).toThrow('200');
		expect(validateTitle('x'.repeat(200))).toHaveLength(200);
	});
});

describe('permissions', () => {
	const t = { createdBy: 'c', assigneeId: 'a' };
	const parent = { createdBy: 'p', assigneeId: 'pa' };
	it('creator and assignee see/edit; others do not', () => {
		for (const u of ['c', 'a']) {
			expect(canView([t], { userId: u })).toBe(true);
			expect(canEdit(t, { userId: u })).toBe(true);
		}
		expect(canView([t], { userId: 'x' })).toBe(false);
		expect(canEdit(t, { userId: 'x' })).toBe(false);
	});
	it('ancestors grant view but not edit (D14/D45)', () => {
		for (const u of ['p', 'pa']) {
			expect(canView([t, parent], { userId: u })).toBe(true);
			expect(canEdit(t, { userId: u })).toBe(false);
		}
		expect(canView([t, parent], { userId: 'x' })).toBe(false);
	});
	it('only creator assigns/deletes', () => {
		expect(canAssign(t, { userId: 'c' })).toBe(true);
		expect(canDelete(t, { userId: 'c' })).toBe(true);
		expect(canAssign(t, { userId: 'a' })).toBe(false);
		expect(canDelete(t, { userId: 'a' })).toBe(false);
	});
});

describe('computeTreeDelete', () => {
	const e = (childId: string, parentId: string, createdBy = 'me') => ({
		childId,
		parentId,
		createdBy
	});
	it('deletes my descendants whose parents are all inside, handling diamonds', () => {
		// T -> A, T -> B, A -> D, B -> D (diamond), T -> X(not mine), X -> Y(mine, only parent X)
		const r = computeTreeDelete('T', 'me', [
			e('A', 'T'),
			e('B', 'T'),
			e('D', 'A'),
			e('D', 'B'),
			e('X', 'T', 'other'),
			e('Y', 'X')
		]);
		expect(r.deleteIds.sort()).toEqual(['A', 'B', 'D', 'T']);
		expect(r).toMatchObject({ keptNotMine: 1, keptShared: 1, becomingTopLevel: 1 });
	});
	it('keeps a descendant that still has a parent outside', () => {
		const r = computeTreeDelete('T', 'me', [e('A', 'T'), e('A', 'OUT'), e('B', 'A')]);
		expect(r.deleteIds).toEqual(['T']);
		expect(r).toMatchObject({ keptShared: 2, keptNotMine: 0, becomingTopLevel: 0 });
	});
	it('is independent of edge order', () => {
		const edges = [e('D', 'A'), e('D', 'B'), e('B', 'T'), e('A', 'T')];
		expect(computeTreeDelete('T', 'me', edges).deleteIds.sort()).toEqual(['A', 'B', 'D', 'T']);
		expect(computeTreeDelete('T', 'me', [...edges].reverse()).deleteIds.sort()).toEqual([
			'A',
			'B',
			'D',
			'T'
		]);
	});
});

describe('parseFilters', () => {
	it('defaults and ignores unknown values without throwing', () => {
		expect(parseFilters(new URLSearchParams(''))).toEqual({
			statuses: [],
			source: 'all',
			due: 'all'
		});
		expect(
			parseFilters(
				new URLSearchParams(
					'status=todo&status=bogus&status=todo&status=done&source=x&due=week&p=1'
				)
			)
		).toEqual({ statuses: ['todo', 'done'], source: 'all', due: 'week' });
	});
});

describe('applyFilters', () => {
	const rows = [
		{ id: 1, dueDate: '2026-10-10', status: 'todo', source: 'own' as const },
		{ id: 2, dueDate: '2026-10-14', status: 'in_progress', source: 'assigned' as const },
		{ id: 3, dueDate: '2026-10-25', status: 'done', source: 'own' as const },
		{ id: 4, dueDate: '2026-10-09', status: 'done', source: 'assigned' as const }
	];
	const today = '2026-10-12';
	const f = (o: Partial<TaskFilters> = {}): TaskFilters => ({
		statuses: [],
		source: 'all',
		due: 'all',
		...o
	});
	const ids = (r: { id: number }[]) => r.map((x) => x.id);

	it('splits active and done', () => {
		const r = applyFilters(rows, f(), today);
		expect(ids(r.active)).toEqual([1, 2]);
		expect(ids(r.done)).toEqual([3, 4]);
	});
	it('filters by status, source, due', () => {
		expect(ids(applyFilters(rows, f({ statuses: ['todo', 'done'] }), today).active)).toEqual([1]);
		expect(applyFilters(rows, f({ source: 'assigned' }), today).active.map((r) => r.id)).toEqual([
			2
		]);
		expect(ids(applyFilters(rows, f({ due: 'overdue' }), today).active)).toEqual([1]);
		expect(ids(applyFilters(rows, f({ due: 'overdue' }), today).done)).toEqual([]);
		const wk = applyFilters(rows, f({ due: 'week' }), today);
		expect(ids(wk.active)).toEqual([2]);
		expect(ids(wk.done)).toEqual([]);
	});
});
