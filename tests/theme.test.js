import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * @vitest-environment jsdom
 */

const appJsContent = fs.readFileSync(path.resolve(__dirname, '../ui/app.js'), 'utf8');

describe('Theme Logic (app.js HUD Integration)', () => {
    let themeHud;
    let rootElement;
    let body;

    beforeEach(() => {
        // Setup DOM structure required by app.js
        document.documentElement.innerHTML = `
            <head></head>
            <body>
                <div id="theme-hud" class="theme-hud">
                    <div id="theme-trigger"></div>
                    <div class="theme-ribbon"></div>
                </div>
                <div id="drop-zone">
                    <svg id="status-icon"></svg>
                    <svg id="spinner"></svg>
                    <div id="status-text"></div>
                    <div id="sub-status-text"></div>
                    <input type="file" id="file-input">
                </div>
                <div id="bento-grid"></div>
                <div id="batch-complete-overlay" class="hidden">
                    <div id="batch-summary-text"></div>
                    <button id="download-zip-btn"></button>
                    <button id="download-individual-btn"></button>
                    <div id="zip-warning" class="hidden"></div>
                    <button id="reset-batch-btn"></button>
                </div>
                <button id="about-toggle"></button>
                <div id="modal-backdrop" class="hidden">
                    <button id="modal-close"></button>
                    <div class="about-panel"></div>
                </div>
            </body>
        `;

        themeHud = document.getElementById('theme-hud');
        rootElement = document.documentElement;
        body = document.body;

        // Mock Globals
        vi.stubGlobal('pdfService', {
            initWasm: vi.fn().mockResolvedValue(),
            WorkerPool: { init: vi.fn(), enqueue: vi.fn() }
        });
        vi.stubGlobal('batchService', { MAX_ZIP_SIZE_BYTES: 150 * 1024 * 1024 });
        
        // Mock matchMedia
        vi.stubGlobal('matchMedia', vi.fn().mockImplementation(query => ({
            matches: false,
            media: query,
            onchange: null,
            addListener: vi.fn(),
            removeListener: vi.fn(),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })));

        // Mock View Transitions
        document.startViewTransition = (cb) => cb();
        localStorage.clear();

        // Evaluate app.js
        try {
            const fn = new Function('window', 'document', 'localStorage', 'pdfService', 'batchService', appJsContent);
            fn(window, document, localStorage, window.pdfService, window.batchService);
        } catch (e) {
            console.error("Failed to load app.js in test:", e);
        }
    });

    it('should initialize with default theme (aurora) and generate swatches', () => {
        expect(rootElement.getAttribute('data-theme')).toBe('aurora');
        const swatches = document.querySelectorAll('.theme-swatch');
        expect(swatches.length).toBe(10);
        expect(document.querySelector('.theme-swatch.active').dataset.id).toBe('aurora');
    });

    it('should switch theme correctly on swatch click', () => {
        const sageSwatch = document.querySelector('.theme-swatch[data-id="sage"]');
        sageSwatch.click();
        
        expect(rootElement.getAttribute('data-theme')).toBe('sage');
        expect(body.classList.contains('solid-bg')).toBe(true);
        expect(sageSwatch.classList.contains('active')).toBe(true);
        expect(localStorage.getItem('theme')).toBe('sage');
    });

    it('should hide HUD immediately after theme selection', () => {
        themeHud.classList.add('expanded');
        const roseSwatch = document.querySelector('.theme-swatch[data-id="rose"]');
        roseSwatch.click();
        
        expect(themeHud.classList.contains('expanded')).toBe(false);
    });

    it('should toggle HUD expansion on trigger click', () => {
        const trigger = document.getElementById('theme-trigger');
        
        // Force expanded to start
        themeHud.classList.add('expanded');
        expect(themeHud.classList.contains('expanded')).toBe(true);
        
        trigger.click();
        expect(themeHud.classList.contains('expanded')).toBe(false);
        
        trigger.click();
        expect(themeHud.classList.contains('expanded')).toBe(true);
    });
});
