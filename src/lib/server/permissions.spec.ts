import { describe, it, expect } from 'vitest';
import { canInvite, canManageMembers, parseRole, wouldRemoveLastAdmin } from './permissions';

describe('role permissions', () => {
	it('only manager and system_admin can invite', () => {
		expect(canInvite('system_admin')).toBe(true);
		expect(canInvite('manager')).toBe(true);
		expect(canInvite('member')).toBe(false);
		expect(canInvite(null)).toBe(false);
	});

	it('only system_admin manages members', () => {
		expect(canManageMembers('system_admin')).toBe(true);
		expect(canManageMembers('manager')).toBe(false);
		expect(canManageMembers(undefined)).toBe(false);
	});

	it('parseRole rejects unknown and inherited keys', () => {
		expect(parseRole('manager')).toBe('manager');
		expect(parseRole('root')).toBeNull();
		expect(parseRole('toString')).toBeNull();
	});
});

describe('last system_admin invariant', () => {
	const admin = { role: 'system_admin', banned: false };

	it('blocks demoting or banning the only active admin', () => {
		expect(wouldRemoveLastAdmin(admin, 1, { role: 'manager' })).toBe(true);
		expect(wouldRemoveLastAdmin(admin, 1, { banned: true })).toBe(true);
	});

	it('allows it when another active admin remains', () => {
		expect(wouldRemoveLastAdmin(admin, 2, { role: 'member' })).toBe(false);
		expect(wouldRemoveLastAdmin(admin, 2, { banned: true })).toBe(false);
	});

	it('allows no-op and unrelated targets', () => {
		expect(wouldRemoveLastAdmin(admin, 1, { role: 'system_admin' })).toBe(false);
		expect(wouldRemoveLastAdmin(admin, 1, { banned: false })).toBe(false);
		expect(wouldRemoveLastAdmin({ role: 'member', banned: false }, 1, { banned: true })).toBe(
			false
		);
		expect(
			wouldRemoveLastAdmin({ role: 'system_admin', banned: true }, 1, { role: 'member' })
		).toBe(false);
	});
});
