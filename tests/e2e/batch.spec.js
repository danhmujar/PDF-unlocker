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
    });

    test('should remain active for more files after grid appears', async ({ page }) => {
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };

        // Upload first batch
        await page.setInputFiles('#file-input', [pdf1]);
        
        await expect(page.locator('.file-card')).toHaveCount(1);

        const dropZone = page.locator('#drop-zone');
        await expect(dropZone).toBeVisible();
        
        await page.setInputFiles('#file-input', [pdf2]);
    });
});

test.describe('Phase 2-03: Advanced ZIP Options & Post-Processing', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        
        // Mock the pdfService to avoid real WASM processing which fails with dummy data
        await page.evaluate(() => {
            window.pdfService = {
                initWasm: () => Promise.resolve(),
                WorkerPool: {
                    enqueue: async (file, callbacks, config) => {
                        // Simulate some processing time
                        await new Promise(r => setTimeout(r, 100));
                        if (callbacks && callbacks.onStatus) {
                            callbacks.onStatus('processing', 'Unlocking...', 'Mocking');
                        }
                        return { 
                            blob: new Blob(['mock content'], { type: 'application/pdf' }),
                            hash: 'mock-hash-' + Math.random().toString(36).substring(7)
                        };
                    }
                }
            };
        });

        await page.waitForSelector('.drop-zone:not(.loading)');
    });

    test('should show download options after batch processing completes', async ({ page }) => {
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };

        await page.setInputFiles('#file-input', [pdf1, pdf2]);

        // Wait for overlay to appear
        const overlay = page.locator('.batch-complete-overlay');
        await expect(overlay).toBeVisible({ timeout: 10000 });

        const zipBtn = page.locator('#download-zip-btn');
        const individualBtn = page.locator('#download-individual-btn');

        await expect(zipBtn).toBeVisible();
        await expect(individualBtn).toBeVisible();
    });

    test('should trigger ZIP download when ZIP option is clicked', async ({ page }) => {
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };
        
        await page.setInputFiles('#file-input', [pdf1, pdf2]);

        await expect(page.locator('.batch-complete-overlay')).toBeVisible();

        const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.click('#download-zip-btn')
        ]);

        expect(download.suggestedFilename()).toContain('.zip');
    });

    test('should trigger multiple downloads when individual option is clicked', async ({ page }) => {
        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };
        await page.setInputFiles('#file-input', [pdf1, pdf2]);

        await expect(page.locator('.batch-complete-overlay')).toBeVisible();

        // Prepare to catch multiple downloads
        const downloads = [];
        page.on('download', download => downloads.push(download));

        // Trigger individual downloads
        await page.click('#download-individual-btn');
        
        // Wait for downloads to be captured
        await expect.poll(() => downloads.length, { timeout: 10000 }).toBe(2);
        
        expect(downloads[0].suggestedFilename()).toContain('.pdf');
        expect(downloads[1].suggestedFilename()).toContain('.pdf');
    });

    test('should disable ZIP option for large batches', async ({ page }) => {
        // Mock large file size
        await page.evaluate(() => {
            window.pdfService.WorkerPool.enqueue = async (file, callbacks, config) => {
                // Return a "large" blob mock (1.1GB)
                return { 
                    blob: { size: 1.1 * 1024 * 1024 * 1024, type: 'application/pdf' },
                    hash: 'large-mock-hash'
                };
            };
        });

        const pdf1 = { name: 'file1.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file1') };
        const pdf2 = { name: 'file2.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%file2') };
        await page.setInputFiles('#file-input', [pdf1, pdf2]);

        await expect(page.locator('.batch-complete-overlay')).toBeVisible({ timeout: 10000 });
        
        const zipBtn = page.locator('#download-zip-btn');
        await expect(zipBtn).toBeDisabled();
        
        const warning = page.locator('#zip-warning');
        await expect(warning).toBeVisible();
    });
});
