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
});
