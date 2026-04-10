import { test, expect } from '@playwright/test';

test.describe('Phase 5: Security & Policy Hardening', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
    });

    test('should block script with mismatched SRI', async ({ page }) => {
        // Intercept auditService.js and tamper with it
        await page.route('**/services/auditService.js', async route => {
            const response = await route.fetch();
            let body = await response.text();
            body += '\nconsole.log("TAMPERED");';
            await route.fulfill({
                response,
                contentType: 'application/javascript',
                body: body
            });
        });

        // Capture console messages (SRI errors show up here)
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        // Reload the page to trigger the tampered script load
        await page.reload();

        // SRI error should be present
        const hasSriError = consoleErrors.some(msg => 
            msg.includes('integrity') && 
            (msg.includes('blocked') || msg.includes('failed to find a valid digest'))
        );
        
        expect(hasSriError).toBe(true);
    });

    test('should have hardened CSP headers and block eval()', async ({ page }) => {
        const [response] = await Promise.all([
            page.waitForResponse(resp => resp.url() === 'http://localhost:3000/' || resp.url().includes('index.html')),
            page.reload()
        ]);

        const csp = response.headers()['content-security-policy'] || await page.evaluate(() => {
            const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
            return meta ? meta.content : '';
        });

        expect(csp).toContain("object-src 'none'");
        expect(csp).toContain("worker-src 'self' blob:");
        expect(csp).not.toContain("'unsafe-eval'");
        expect(csp).toContain("'wasm-unsafe-eval'");
        expect(csp).toContain("default-src 'self'");
    });
});
