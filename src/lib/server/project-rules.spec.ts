import { describe, expect, it } from 'vitest';
import {
	canAttachTask,
	canCreateProject,
	canManageProject,
	canViewProject,
	validateDescription,
	validateName
} from './project-rules';

describe('project rules', () => {
	it('only manager / system_admin create (D56)', () => {
		expect(canCreateProject('manager')).toBe(true);
		expect(canCreateProject('system_admin')).toBe(true);
		expect(canCreateProject('member')).toBe(false);
		expect(canCreateProject(null)).toBe(false);
	});

	it('view: members and system_admin (D63); manage: owner and system_admin (D58)', () => {
		const m = { userId: 'u', systemRole: 'member' };
		const admin = { userId: 'u', systemRole: 'system_admin' };
		expect(canViewProject(null, m)).toBe(false);
		expect(canViewProject('member', m)).toBe(true);
		expect(canViewProject(null, admin)).toBe(true);
		expect(canManageProject('member', m)).toBe(false);
		expect(canManageProject('owner', m)).toBe(true);
		expect(canManageProject(null, admin)).toBe(true);
	});

	it('attach needs creator or assignee AND membership (D59)', () => {
		const t = { createdBy: 'c', assigneeId: 'a' };
		expect(canAttachTask(t, 'member', 'c')).toBe(true);
		expect(canAttachTask(t, 'member', 'a')).toBe(true);
		expect(canAttachTask(t, 'member', 'x')).toBe(false);
		expect(canAttachTask(t, null, 'c')).toBe(false);
	});

	it('validates name and description', () => {
		expect(validateName('  P ')).toBe('P');
		expect(() => validateName(' ')).toThrow();
		expect(() => validateName('x'.repeat(101))).toThrow('100');
		expect(validateDescription('')).toBeNull();
		expect(() => validateDescription('x'.repeat(20001))).toThrow('20000');
	});
});
