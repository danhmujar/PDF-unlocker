import { test, expect } from '@playwright/test';

test.describe('Phase 6-03: Resume Logic & UI Recovery', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        // Wait for engine to be ready
        await page.waitForSelector('.drop-zone:not(.loading)');
    });

    test('should show recovery banner when interrupted jobs are found', async ({ page }) => {
        // Wait for pdfService to be defined
        await page.waitForFunction(() => window.pdfService !== undefined);

        // Mock interrupted job in persistenceService
        await page.evaluate(() => {
            const mockJob = {
                id: 1,
                status: 'processing',
                totalFiles: 2,
                timestamp: Date.now()
            };
            
            // Override pdfService.getInterruptedJobs
            window.pdfService.getInterruptedJobs = () => Promise.resolve([mockJob]);
        });

        // Trigger the check manually in test context
        await page.evaluate(() => {
            if (window.checkForInterruptedJobs) window.checkForInterruptedJobs();
        });

        const banner = page.locator('#recovery-banner');
        await expect(banner).toBeVisible();
    });

    test('should populate Bento Grid and resume when "Resume" is clicked', async ({ page }) => {
        // Wait for pdfService to be defined
        await page.waitForFunction(() => window.pdfService !== undefined);
        
        // Mock interrupted job and files
        await page.evaluate(() => {
            const mockJob = { id: 123, status: 'processing', totalFiles: 2 };
            const mockFiles = [
                {
                    id: 1, jobId: 123, name: 'done.pdf', status: 'completed',
                    originalBlob: new Blob(['original'], { type: 'application/pdf', size: 100 }),
                    outputBlob: new Blob(['decrypted'], { type: 'application/pdf', size: 100 }),
                    hash: 'hash1'
                },
                {
                    id: 2, jobId: 123, name: 'todo.pdf', status: 'processing',
                    originalBlob: new Blob(['%PDF-1.4\n%todo'], { type: 'application/pdf', size: 100 }),
                    outputBlob: null
                }
            ];
            
            // Define size for originalBlob as it's used in cardId calculation
            Object.defineProperty(mockFiles[0].originalBlob, 'size', { value: 100 });
            Object.defineProperty(mockFiles[1].originalBlob, 'size', { value: 100 });

            window.pdfService.getInterruptedJobs = () => Promise.resolve([mockJob]);
            window.pdfService.getJobFiles = () => Promise.resolve(mockFiles);
            
            // Mock worker pool for the resumed task
            window.pdfService.WorkerPool.enqueue = async (file, callbacks) => {
                await new Promise(r => setTimeout(r, 100));
                if (callbacks && callbacks.onStatus) {
                    callbacks.onStatus('success', 'Success', 'Unlocked');
                }
                return { 
                    blob: new Blob(['mock content'], { type: 'application/pdf' }),
                    hash: 'new-hash'
                };
            };
        });

        // Trigger recovery banner
        await page.evaluate(() => window.checkForInterruptedJobs());
        
        // Click Resume
        await page.click('#resume-btn');

        // Verify Bento Grid is visible
        const grid = page.locator('.bento-grid');
        await expect(grid).toBeVisible();

        // Verify 2 cards are present
        const cards = page.locator('.file-card');
        await expect(cards).toHaveCount(2);

        // Verify "done.pdf" is already marked success
        const doneCard = page.locator('.file-card.success').filter({ hasText: 'done.pdf' });
        await expect(doneCard).toBeVisible();

        // Verify batch overlay appears eventually (after todo.pdf finishes)
        const overlay = page.locator('.batch-complete-overlay');
        await expect(overlay).toBeVisible({ timeout: 15000 });
    });

    test('should hide banner when "Discard" is clicked', async ({ page }) => {
        // Wait for pdfService to be defined
        await page.waitForFunction(() => window.pdfService !== undefined);

        await page.evaluate(() => {
            window.pdfService.getInterruptedJobs = () => Promise.resolve([{ id: 1 }]);
        });

        await page.evaluate(() => window.checkForInterruptedJobs());
        
        const banner = page.locator('#recovery-banner');
        await expect(banner).toBeVisible();
        
        await page.click('#discard-btn');
        await expect(banner).toHaveClass(/hidden/);
    });
});
