import { test, expect } from '@playwright/test';

test('verify audit info font size', async ({ page }) => {
    await page.goto('http://localhost:3000');
    
    // Open the About modal to make the element visible/measurable
    await page.click('#about-toggle');
    
    const selector = '.audit-footnote-text';
    const element = page.locator(selector);
    
    // Get computed style
    const fontSize = await element.evaluate((el) => window.getComputedStyle(el).fontSize);
    
    console.log(`Computed font-size for "${selector}": ${fontSize}`);
    
    // 0.4rem should be exactly 6.4px (assuming 16px base)
    // We allow a small tolerance for browser rounding
    const sizeValue = parseFloat(fontSize);
    console.log(`Numeric value: ${sizeValue}`);
    
    if (sizeValue > 7) {
        console.error('DEBUG: Font size is too large! Check Service Worker cache.');
    } else {
        console.log('DEBUG: Font size matches the 0.4rem target.');
    }
    
    expect(sizeValue).toBeLessThanOrEqual(7);
});
