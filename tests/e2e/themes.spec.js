import { test, expect } from '@playwright/test';

test.describe('Phase 2-04: Theme Visual Audit (HUD Edition)', () => {
    
    const meshThemes = ['aurora', 'midnight', 'frost', 'ember'];
    const solidThemes = ['slate', 'sage', 'steel', 'rose', 'peach', 'lilac'];
    const allThemes = [...meshThemes, ...solidThemes];

    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
        await page.waitForSelector('.drop-zone:not(.loading)');
    });

    for (const theme of allThemes) {
        test(`verify and capture theme: ${theme}`, async ({ page }) => {
            // Ensure HUD is expanded (trigger is 6px wide + off-screen, so use programmatic expansion)
            const hud = page.locator('#theme-hud');
            const isExpanded = await hud.evaluate(el => el.classList.contains('expanded'));
            if (!isExpanded) {
                await hud.evaluate(el => el.classList.add('expanded'));
            }
            await expect(hud).toHaveClass(/expanded/);

            // Click the swatch (force: true because it might be partially offscreen during animation)
            const swatch = page.locator(`.theme-swatch[data-id="${theme}"]`);
            await swatch.click({ force: true });
            
            // Wait for transitions
            await page.waitForTimeout(600);

            // Verify the attribute on HTML
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

            // Take the screenshot (viewport only — WebKit fullPage hits 32767px PNG dimension limit)
            await page.screenshot({ 
                path: `test-results/screenshots/v3-hud-theme-${theme}.png`
            });
            
            console.log(`Verified and captured ${theme} theme via HUD.`);
        });
    }
});
