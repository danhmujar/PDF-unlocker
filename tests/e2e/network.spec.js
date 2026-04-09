import { test, expect } from '@playwright/test';

test.describe('Phase 4: Engine Internalization & Offline Capability', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        // Ensure Service Worker is registered
        await page.evaluate(async () => {
            const registration = await navigator.serviceWorker.register('sw.js');
            await navigator.serviceWorker.ready;
        });
    });

    test('should not make any external network requests to unpkg.com', async ({ page }) => {
        const externalRequests = [];
        page.on('request', request => {
            if (request.url().includes('unpkg.com')) {
                externalRequests.push(request.url());
            }
        });

        await page.reload();
        expect(externalRequests).toHaveLength(0);
    });

    test('should load vendor scripts locally', async ({ page }) => {
        const vendorRequests = [];
        page.on('request', request => {
            if (request.url().includes('/assets/vendor/')) {
                vendorRequests.push(request.url());
            }
        });

        await page.reload();
        const vendorPaths = vendorRequests.map(url => new URL(url).pathname);
        expect(vendorPaths).toContain('/assets/vendor/jszip.min.js');
        expect(vendorPaths).toContain('/assets/vendor/qpdf/qpdf.js');
    });

    test('should function offline', async ({ context, page }) => {
        // 1. Visit page while online to cache assets
        await page.goto('http://localhost:3000');
        
        // Wait for SW to be ready and assets likely cached
        await page.evaluate(async () => {
            await navigator.serviceWorker.ready;
        });

        // 2. Go offline
        await context.setOffline(true);
        
        // 3. Reload
        await page.reload();

        // 4. Verify app loads
        await expect(page.locator('h1')).toContainText('Secure PDF Unlocker');
        
        // 5. Cleanup
        await context.setOffline(false);
    });

    test('should attempt to process a PDF locally', async ({ page }) => {
        // Create a dummy PDF file
        const dummyPdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
        
        // Set up listener for worker initialization or status text changes
        const statusText = page.locator('#status-text');
        
        // Upload the dummy PDF
        await page.setInputFiles('#file-input', {
            name: 'test.pdf',
            mimeType: 'application/pdf',
            buffer: dummyPdf
        });

        // It should at least attempt to process it (or ask for password if it looks encrypted, 
        // though this dummy isn't encrypted, it should show processing or success)
        // Since it's a valid (albeit empty) PDF, it might even 'succeed' or show 'Decrypting...'
        await expect(statusText).not.toHaveText('Awaiting Document');
        
        // If it was successful:
        // await expect(statusText).toContainText('Success');
    });
});
