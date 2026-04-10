const { test, expect } = require('@playwright/test');

test.describe('Accessibility & Keyboard Navigation (REQ-7.3)', () => {
    test.beforeEach(async ({ page }) => {
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
                    window.diagnosticsService = {
                        recordWorkerStart: () => {},
                        recordProcessComplete: () => {},
                        recordError: () => {},
                        getStats: () => ({})
                    };
                    window.auditService = {
                        getLogs: () => Promise.resolve([]),
                        logEvent: () => Promise.resolve()
                    };
                    window.pdfService = {
                        initWasm: () => Promise.resolve(),
                        startJob: () => Promise.resolve(),
                        getInterruptedJobs: () => Promise.resolve([]),
                        resumeJob: () => {},
                        getJobFiles: () => Promise.resolve([]),
                        WorkerPool: {
                            enqueue: async (file, callbacks, config) => {
                                if (callbacks && callbacks.onStatus) {
                                    callbacks.onStatus('processing', 'Unlocking...', 'Mocking');
                                }
                                await new Promise(r => setTimeout(r, 100));
                                return {
                                    blob: new Blob(['mock content'], { type: 'application/pdf' }),
                                    hash: 'mock-hash'
                                };
                            }
                        },
                        processFile: (file, callbacks, config) => window.pdfService.WorkerPool.enqueue(file, callbacks, config)
                    };
                `
            });
        });

        await page.goto('/');
        // Wait for engine ready
        await expect(page.locator('#status-text')).toHaveText('Awaiting Document', { timeout: 10000 });
    });

    test('should support keyboard navigation (roving tabindex) in Bento Grid', async ({ page }) => {
        // 1. Upload multiple dummy files to populate the grid
        const files = [
            { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n1') },
            { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n2') },
            { name: 'file3.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n3') }
        ];
        
        await page.locator('input[type="file"]').setInputFiles(files);
        await page.locator('input[type="file"]').dispatchEvent('change');
        
        // Wait for grid to render
        const bentoGrid = page.locator('#bento-grid');
        await expect(bentoGrid).not.toHaveClass(/hidden/, { timeout: 10000 });
        
        const cards = bentoGrid.locator('.file-card');
        await expect(cards).toHaveCount(3);

        // 2. Initial state: first card should be focusable
        await expect(cards.nth(0)).toHaveAttribute('tabindex', '0');
        await expect(cards.nth(1)).toHaveAttribute('tabindex', '-1');
        await expect(cards.nth(2)).toHaveAttribute('tabindex', '-1');

        // 3. Focus the grid/card
        await cards.nth(0).focus();
        await expect(cards.nth(0)).toBeFocused();

        // 4. Navigate Right/Down
        await page.keyboard.press('ArrowRight');
        await expect(cards.nth(1)).toBeFocused();
        await expect(cards.nth(1)).toHaveAttribute('tabindex', '0');
        await expect(cards.nth(0)).toHaveAttribute('tabindex', '-1');

        await page.keyboard.press('ArrowDown');
        await expect(cards.nth(2)).toBeFocused();
        await expect(cards.nth(2)).toHaveAttribute('tabindex', '0');

        // 5. Navigate Left/Up
        await page.keyboard.press('ArrowLeft');
        await expect(cards.nth(1)).toBeFocused();

        // 6. Home/End keys
        await page.keyboard.press('Home');
        await expect(cards.nth(0)).toBeFocused();

        await page.keyboard.press('End');
        await expect(cards.nth(2)).toBeFocused();
    });

    test('should support keyboard navigation in Theme HUD', async ({ page }) => {
        const themeTrigger = page.locator('#theme-trigger');
        const themeHud = page.locator('#theme-hud');

        // 1. Open HUD via keyboard
        await themeTrigger.focus();
        await page.keyboard.press('Enter');
        await expect(themeHud).toHaveClass(/expanded/);

        // 2. Verify roving tabindex in swatches
        const swatches = themeHud.locator('.theme-swatch');
        await expect(swatches.nth(0)).toBeFocused();
        await expect(swatches.nth(0)).toHaveAttribute('tabindex', '0');
        await expect(swatches.nth(1)).toHaveAttribute('tabindex', '-1');

        // 3. Navigate Down
        await page.keyboard.press('ArrowDown');
        await expect(swatches.nth(1)).toBeFocused();
        await expect(swatches.nth(1)).toHaveAttribute('tabindex', '0');

        // 4. Select theme via keyboard
        await page.keyboard.press('Enter');
        await expect(themeHud).not.toHaveClass(/expanded/);
        // Verify theme changed (swatch index 1 is 'midnight' based on app.js definitions)
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight');
    });

    test('should enforce focus traps in About modal', async ({ page }) => {
        const aboutToggle = page.locator('#about-toggle');
        await aboutToggle.click();
        await page.waitForTimeout(500); // Wait for programmatic focus delay

        const modal = page.locator('#modal-backdrop');
        await expect(modal).toHaveClass(/open/);

        const closeBtn = page.locator('#modal-close');
        const linkedinLink = page.locator('.dev-credit-info a');
        const viewAuditBtn = page.locator('#view-audit-log-btn');
        
        // Initial focus should be on close button
        await expect(closeBtn).toBeFocused();

        // Path: Close -> LinkedIn -> View Audit
        await page.keyboard.press('Tab');
        await expect(linkedinLink).toBeFocused();

        await page.keyboard.press('Tab');
        await expect(viewAuditBtn).toBeFocused();

        // Tab again should loop back to closeBtn
        await page.keyboard.press('Tab');
        await expect(closeBtn).toBeFocused();

        // Escape to close
        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/open/);
        await expect(aboutToggle).toBeFocused();
    });

    test('should enforce focus traps in Audit Log modal', async ({ page }) => {
        // Open Audit Log via About modal
        await page.click('#about-toggle');
        await page.click('#view-audit-log-btn');
        await page.waitForTimeout(500); // Wait for programmatic focus delay

        const auditModal = page.locator('#audit-modal-backdrop');
        await expect(auditModal).toHaveClass(/open/);

        const closeBtn = page.locator('#audit-modal-close');
        await expect(closeBtn).toBeFocused();

        // Tab should loop back if no other focusable (empty state)
        await page.keyboard.press('Tab');
        await expect(closeBtn).toBeFocused();

        // Escape to close
        await page.keyboard.press('Escape');
        await expect(auditModal).not.toHaveClass(/open/);
        // It returns focus to aboutToggle (per app.js line 952)
        await expect(page.locator('#about-toggle')).toBeFocused();
    });

    test('should have comprehensive ARIA landmarks and busy states', async ({ page }) => {
        // Landmarks
        await expect(page.locator('header[role="banner"]')).toBeVisible();
        await expect(page.locator('main[role="main"]')).toBeVisible();
        await expect(page.locator('nav[role="navigation"]')).toBeVisible();
        await expect(page.locator('footer.app-footer')).toBeVisible();

        // Busy state during "upload"
        await page.evaluate(() => {
            window.pdfService = {
                initWasm: () => Promise.resolve(),
                WorkerPool: {
                    enqueue: () => new Promise(r => setTimeout(r, 5000)) // Hang
                },
                startJob: () => Promise.resolve()
            };
        });

        const pdfFile = { name: 'hang.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') };
        await page.locator('input[type="file"]').setInputFiles([pdfFile]);
        
        // Wait for processing status
        await expect(page.locator('#drop-zone')).toHaveAttribute('aria-busy', 'true', { timeout: 5000 });
    });
});
