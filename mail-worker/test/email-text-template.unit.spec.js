import { describe, expect, it } from 'vitest';
import emailTextTemplate from '../src/template/email-text';

describe('emailTextTemplate', () => {
	it('renders hostile plain-text email content as text, not active HTML', () => {
		const payload = `<script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)>&lt;iframe srcdoc="<script>alert(1)</script>">`;
		const html = emailTextTemplate(payload);

		expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
		expect(html).toContain('&lt;svg onload=alert(1)&gt;');
		expect(html).toContain('&amp;lt;iframe');
		expect(html).not.toContain('<script>alert(1)</script>');
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		expect(html).not.toContain('<svg onload=alert(1)>');
	});
});
