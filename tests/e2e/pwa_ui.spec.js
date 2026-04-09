import { test, expect } from '@playwright/test';

test.describe('PWA & UI Verification', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('should have a functional about modal with updated analyst credit', async ({ page }) => {
        const aboutBtn = page.locator('#about-toggle');
        await aboutBtn.click();

        const aboutModal = page.locator('#modal-backdrop');
        // Wait for class change and opacity transition
        await expect(aboutModal).toHaveClass(/open/);
        
        // Use a more robust check for visibility that ignores opacity: 0 if needed, 
        // but here we just want to ensure it's "open"
        await expect(aboutModal).not.toHaveClass(/hidden/);

        // Verify updated role
        await expect(page.locator('.dev-credit-info span')).toContainText('Analyst at WTW');
        
        // Verify batch limit text
        await expect(page.locator('#section-features + ul')).toContainText('up to 20 files');
        await expect(page.locator('#section-limitations + ul')).toContainText('limit of 20 files');
    });

    test('should have aurora as the default theme regardless of system preference', async ({ page }) => {
        const html = page.locator('html');
        await expect(html).toHaveAttribute('data-theme', 'aurora');
    });
});

test.describe('Connectivity & Updates UI', () => {
    test('capture offline indicator screenshot', async ({ page, context }) => {
        await page.goto('/');
        
        // Simulate offline mode
        await context.setOffline(true);
        
        const offlineIndicator = page.locator('#offline-indicator');
        await expect(offlineIndicator).toBeVisible();
        await expect(offlineIndicator).toHaveText('Offline');
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/offline-indicator.png' });
        
        // Go back online
        await context.setOffline(false);
        await expect(offlineIndicator).toBeHidden();
    });

    test('capture update toast screenshot', async ({ page }) => {
        await page.goto('/');
        
        // Mock the Service Worker update found event by manually triggering the toast visibility
        // Since triggering a real SW update in a test is flaky, we verify the UI component exists and is styled
        await page.evaluate(() => {
            const toast = document.getElementById('update-toast');
            if (toast) toast.classList.remove('hidden');
        });
        
        const updateToast = page.locator('#update-toast');
        await expect(updateToast).toBeVisible();
        await expect(updateToast).toContainText('new version');
        
        // Take screenshot
        await page.screenshot({ path: 'test-results/screenshots/update-toast.png' });
    });
});
