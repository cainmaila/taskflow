import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders markdown', () => {
		expect(renderMarkdown('**hi**')).toContain('<strong>hi</strong>');
	});
	it('strips scripts, event handlers and javascript: links', () => {
		const out = renderMarkdown(
			'<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">\n\n[a](javascript:alert(3))\n\n<a href="x" onclick="alert(4)">k</a>'
		);
		expect(out).not.toMatch(/<script/i);
		expect(out).not.toMatch(/onerror|onclick/i);
		expect(out).not.toMatch(/javascript:/i);
	});
	it('drops images and target attributes', () => {
		const out = renderMarkdown(
			'![x](https://evil.test/p.png)\n\n<a href="https://a.test" target="_blank">k</a>'
		);
		expect(out).not.toMatch(/<img/i);
		expect(out).not.toMatch(/target=/i);
		expect(out).toContain('href="https://a.test"');
	});
});
