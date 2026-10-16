import { describe, expect, it } from 'vitest';
import { plainText } from './plain-text';

describe('plainText', () => {
	it('strips common markdown into one line', () => {
		expect(plainText('# Title\n\n- **bold** and [link](http://x.io)\n\n`code`')).toBe(
			'Title bold and link code'
		);
	});
	it('drops fenced code and html tags', () => {
		expect(plainText('a\n```\nsecret\n```\n<b>b</b>')).toBe('a b');
	});
	it('handles empty input', () => {
		expect(plainText('')).toBe('');
	});
	it('drops an unclosed code fence to the end', () => {
		expect(plainText('a\n```\nsecret')).toBe('a');
	});
	it('keeps image alt text and link text with brackets', () => {
		expect(plainText('![alt](x.png) [a [b] c](u)')).toBe('alt a [b] c');
	});
	it('keeps snake_case underscores', () => {
		expect(plainText('use snake_case_name and __bold__')).toBe('use snake_case_name and bold');
	});
});
