import { describe, it, expect, vi, beforeEach } from 'vitest';
import batchService from '../services/batchService.js';

describe('batchService', () => {
    
    beforeEach(() => {
        vi.stubGlobal('JSZip', class MockJSZip {
            constructor() {
                this.files = {};
            }
            file(name, blob) {
                this.files[name] = blob;
            }
            generateAsync({ type }) {
                return Promise.resolve(new Blob(['mock zip content'], { type: 'application/zip' }));
            }
        });
    });

    it('should package multiple files into a ZIP', async () => {
        const files = [
            { name: 'file1.pdf', blob: new Blob(['content1'], { type: 'application/pdf' }) },
            { name: 'file2.pdf', blob: new Blob(['content2'], { type: 'application/pdf' }) }
        ];

        const zipBlob = await batchService.packageAsZip(files);
        
        expect(zipBlob).toBeDefined();
        expect(zipBlob.type).toBe('application/zip');
    });

    it('should throw error if batch exceeds size limit', async () => {
        const largeBlob = { size: batchService.MAX_ZIP_SIZE_BYTES + 1 };
        const files = [{ name: 'large.pdf', blob: largeBlob }];

        await expect(batchService.packageAsZip(files)).rejects.toThrow(/exceeds 150MB limit/);
    });

    it('should process files individually with a throttle', async () => {
        const files = [
            { name: 'file1.pdf', blob: new Blob(['1']) },
            { name: 'file2.pdf', blob: new Blob(['2']) }
        ];
        const onFile = vi.fn();
        
        const startTime = Date.now();
        await batchService.processIndividually(files, onFile);
        const duration = Date.now() - startTime;

        expect(onFile).toHaveBeenCalledTimes(2);
        // 2 files, 1 delay of 400ms = ~400ms minimum
        expect(duration).toBeGreaterThanOrEqual(400);
    });

    it('should throw error if JSZip is missing', async () => {
        vi.stubGlobal('JSZip', undefined);
        const files = [{ name: 'file1.pdf', blob: new Blob(['1']) }];

        await expect(batchService.packageAsZip(files)).rejects.toThrow('JSZip library not found.');
    });
});
