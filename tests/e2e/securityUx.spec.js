const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Security UX', () => {
    test.beforeEach(async ({ page }) => {
        page.on('console', msg => console.log('BROWSER:', msg.text()));

        // Intercept HTML to remove SRI integrity attributes for testing with mocks
        await page.route(url => url.toString().includes('localhost') && (url.toString().endsWith('/') || url.toString().endsWith('.html')), async route => {
            const response = await route.fetch();
            let body = await response.text();
            body = body.replace(/\s+integrity="[^"]*"/g, '');
            await route.fulfill({
                response,
                body,
                contentType: 'text/html'
            });
        });

        // Intercept pdfService.js and return a mock
        await page.route('**/services/pdfService.js', route => {
            route.fulfill({
                contentType: 'application/javascript',
                body: `
                    window.pdfService = {
                        initWasm: () => Promise.resolve(),
                        WorkerPool: {
                            enqueue: async (file, callbacks, config) => {
                                console.log('MOCK: Processing file', file.name);
                                await new Promise(r => setTimeout(r, 100));
                                if (callbacks && callbacks.onStatus) {
                                    callbacks.onStatus('processing', 'Unlocking...', 'Mocking');
                                }
                                
                                const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
                                if (window.auditService) {
                                    window.auditService.logEvent('SUCCESS', {
                                        file: file.name,
                                        hash: hash
                                    });
                                }

                                return {
                                    blob: new Blob(['mock content'], { type: 'application/pdf' }),
                                    hash: hash
                                };
                            }
                        },
                        processFile: (file, callbacks, config) => window.pdfService.WorkerPool.enqueue(file, callbacks, config)
                    };
                `
            });
        });

        // Load the app
        await page.goto('/');
        
        // Wait for engine to be ready
        await expect(page.locator('#status-text')).toHaveText('Awaiting Document', { timeout: 10000 });
    });

    test('should display SHA-256 hash and Verified badge after processing', async ({ page }) => {
        // Create a dummy PDF file in memory
        const pdfFile = {
            name: 'test.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%test')
        };
        
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles([pdfFile]);

        // Wait for processing to complete
        const fileCard = page.locator('.file-card.success');
        await expect(fileCard).toBeVisible({ timeout: 15000 });

        // Verify status text
        await expect(fileCard.locator('.file-status')).toHaveText('Unlocked');

        // Verify SHA-256 hash is displayed
        const hashEl = fileCard.locator('.file-hash');
        await expect(hashEl).toBeVisible();
        await expect(hashEl).toHaveText(/SHA-256: [a-f0-9]{8}\.\.\.[a-f0-9]{8}/);

        // Verify Verified badge is displayed
        const badge = fileCard.locator('.verified-badge');
        await expect(badge).toBeVisible();
        await expect(badge).toHaveText('Verified');
    });

    test('should record and display process in the Security Audit Log', async ({ page }) => {
        // 1. Process a file
        const pdfFile = {
            name: 'audit-test.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%audit')
        };
        await page.locator('input[type="file"]').setInputFiles([pdfFile]);
        await expect(page.locator('.file-card.success')).toBeVisible({ timeout: 15000 });

        // 2. Open About Modal
        await page.click('#about-toggle');
        await expect(page.locator('#modal-backdrop .about-panel')).toBeVisible();

        // 3. Open Audit Log
        await page.click('#view-audit-log-btn');
        await expect(page.locator('#audit-modal-backdrop')).toBeVisible();

        // 4. Verify log entry
        const logTable = page.locator('.audit-table');
        await expect(logTable).toBeVisible();
        
        const firstRow = logTable.locator('tbody tr').first();
        await expect(firstRow.locator('td').nth(1)).toHaveText('Unlock');
        await expect(firstRow.locator('td').nth(2)).toHaveText('audit-test.pdf');
        await expect(firstRow.locator('.status-pill')).toHaveText('SUCCESS');
        
        const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
        await expect(firstRow.locator('code')).toHaveText(new RegExp(hash.substring(0, 8)));
    });

    test('should copy hash to clipboard from Audit Log', async ({ page, context }) => {
        // Grant clipboard permissions
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);

        // 1. Process a file
        const pdfFile = {
            name: 'copy-test.pdf',
            mimeType: 'application/pdf',
            buffer: Buffer.from('%PDF-1.4\n%copy')
        };
        await page.locator('input[type="file"]').setInputFiles([pdfFile]);
        await expect(page.locator('.file-card.success')).toBeVisible({ timeout: 15000 });

        // 2. Open Audit Log
        await page.click('#about-toggle');
        await page.click('#view-audit-log-btn');

        // 3. Click copy button
        const copyBtn = page.locator('.copy-hash-btn').first();
        await copyBtn.click();

        // 4. Verify clipboard content
        const handle = await page.evaluateHandle(() => navigator.clipboard.readText());
        const clipboardContent = await handle.jsonValue();
        expect(clipboardContent).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        
        // 5. Verify visual feedback (success icon)
        await expect(copyBtn.locator('svg path')).toHaveAttribute('d', 'M5 13l4 4L19 7');
    });
});
