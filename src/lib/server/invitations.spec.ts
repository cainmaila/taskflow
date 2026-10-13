import { describe, it, expect } from 'vitest';
import {
	generateToken,
	hashToken,
	isInvitationUsable,
	validateAccept,
	InvitationError
} from './invitations';

describe('invitation token', () => {
	it('is random, url-safe, and hashes deterministically to sha256 hex', async () => {
		const a = generateToken();
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(generateToken()).not.toBe(a);
		const h = await hashToken(a);
		expect(h).toMatch(/^[0-9a-f]{64}$/);
		expect(h).not.toContain(a);
		expect(await hashToken(a)).toBe(h);
		expect(await hashToken('abc')).toBe(
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
		);
	});
});

describe('isInvitationUsable', () => {
	const now = new Date('2026-01-10T00:00:00Z');
	const future = new Date('2026-01-11T00:00:00Z');

	it('accepts unused, unexpired', () => {
		expect(isInvitationUsable({ usedAt: null, expiresAt: future }, now)).toBe(true);
	});
	it('rejects used', () => {
		expect(isInvitationUsable({ usedAt: now, expiresAt: future }, now)).toBe(false);
	});
	it('rejects expired, including exactly at expiry', () => {
		expect(isInvitationUsable({ usedAt: null, expiresAt: now }, now)).toBe(false);
		expect(isInvitationUsable({ usedAt: null, expiresAt: new Date(0) }, now)).toBe(false);
	});
});

describe('validateAccept', () => {
	it('rejects blank name and short password', () => {
		expect(() => validateAccept({ name: '  ', password: '12345678' })).toThrow(InvitationError);
		expect(() => validateAccept({ name: 'A', password: '1234567' })).toThrow(InvitationError);
		expect(() => validateAccept({ name: 'A', password: '12345678' })).not.toThrow();
	});
});
