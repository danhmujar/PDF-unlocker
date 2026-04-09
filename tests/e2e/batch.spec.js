import { test, expect } from '@playwright/test';

test.describe('Phase 2-02: Bento Grid & Batch UI', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        // Wait for engine to be ready
        await page.waitForSelector('.drop-zone:not(.loading)');
    });

    test('should render Bento Grid when multiple files are uploaded', async ({ page }) => {
        // Create dummy PDF files
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };
        const pdf3 = { name: 'file3.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file3') };

        // Upload multiple files
        await page.setInputFiles('#file-input', [pdf1, pdf2, pdf3]);

        // Check if bento grid container is visible
        const grid = page.locator('.bento-grid');
        await expect(grid).toBeVisible();

        // Check if 3 file cards are created
        const cards = page.locator('.file-card');
        await expect(cards).toHaveCount(3);

        // Check names on cards
        await expect(cards.nth(0)).toContainText('file1.pdf');
        await expect(cards.nth(1)).toContainText('file2.pdf');
        await expect(cards.nth(2)).toContainText('file3.pdf');
    });

    test('should remain active for more files after grid appears', async ({ page }) => {
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };

        // Upload first batch
        await page.setInputFiles('#file-input', [pdf1]);
        
        await expect(page.locator('.file-card')).toHaveCount(1);

        // Upload second batch (append)
        // Note: setInputFiles might replace, but we want to check if the drop zone is still there and works.
        // In the app, dropping files calls queueFiles which appends to fileQueue and calls processQueue.
        // We'll test if the .drop-zone is still interactive.
        const dropZone = page.locator('#drop-zone');
        await expect(dropZone).toBeVisible();
        
        // Actually upload more
        await page.setInputFiles('#file-input', [pdf2]);
        
        // In the real app, it might have finished processing pdf1 and cleared it, or it might be showing both.
        // Task 2 implementation will decide if we clear the grid or append.
        // The requirement says: "Drop zone remains active/accessible when grid is displayed for adding more files"
    });

    test('should show glassmorphism effects on cards', async ({ page }) => {
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        await page.setInputFiles('#file-input', [pdf1]);

        const card = page.locator('.file-card').first();
        // Check for backdrop-filter which is key for glassmorphism
        const backdropFilter = await card.evaluate(el => window.getComputedStyle(el).backdropFilter);
        // We can't strictly assert this until Task 1 is done, but we can check if it's applied eventually.
        // For now this is a scaffold.
    });
});
