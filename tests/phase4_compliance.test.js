import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Phase 4 Compliance: Internalize Engine Dependencies', () => {

    it('DEP-INT-01: index.html should not have external dependencies in CSP and script tags', () => {
        const html = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');

        // Check CSP
        const cspMatch = html.match(/content="default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' https:\/\/fonts\.googleapis\.com; font-src https:\/\/fonts\.gstatic\.com; connect-src 'self'; img-src 'self' data:; worker-src 'self' blob:; object-src 'none';"/);
        expect(cspMatch, 'CSP should strictly allow self and specific fonts/blobs, no CDNs for scripts/connect').not.toBeNull();
        expect(html).not.toContain('unpkg.com');

        // Check JSZip path
        expect(html).toContain('src="assets/vendor/jszip.min.js"');
        
        // Check SRI for JSZip
        expect(html).toContain('integrity="sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG"');
    });

    it('DEP-INT-02 & DEP-INT-04: pdfWorker.js should use local assets and maintain SRI', () => {
        const workerScript = fs.readFileSync(path.resolve(__dirname, '../services/pdfWorker.js'), 'utf8');

        // Check importScripts
        expect(workerScript).toContain("importScripts('../assets/vendor/qpdf/qpdf.js')");

        // Check locateFile
        expect(workerScript).toContain("locateFile: (path) => `../assets/vendor/qpdf/${path}`");
    });

    it('DEP-INT-03: sw.js should cache local vendor assets', () => {
        const swScript = fs.readFileSync(path.resolve(__dirname, '../sw.js'), 'utf8');

        expect(swScript).toContain("'./assets/vendor/jszip.min.js'");
        expect(swScript).toContain("'./assets/vendor/qpdf/qpdf.js'");
        expect(swScript).toContain("'./assets/vendor/qpdf/qpdf.wasm'");
        
        // Ensure no unpkg.com in sw.js cache list
        expect(swScript).not.toContain('unpkg.com');
    });

    it('Environment: Vendor assets should exist on disk', () => {
        const vendorPath = path.resolve(__dirname, '../assets/vendor');
        expect(fs.existsSync(path.join(vendorPath, 'jszip.min.js'))).toBe(true);
        expect(fs.existsSync(path.join(vendorPath, 'qpdf/qpdf.js'))).toBe(true);
        expect(fs.existsSync(path.join(vendorPath, 'qpdf/qpdf.wasm'))).toBe(true);
    });
});
