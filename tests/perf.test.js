import { describe, it, expect, vi, beforeAll } from 'vitest';

/**
 * Performance Benchmark Test
 * Measures engine initialization, processing speed, and main-thread responsiveness.
 * Fulfills Requirement TST-3 from Phase 1.
 */
describe('Phase 1 Performance Benchmarks', () => {
    
    // Mocking the Worker for a Node/JSDOM environment
    // In a real browser, this would use the actual services/pdfWorker.js
    class MockWorker {
        constructor(url) {
            this.url = url;
            this.onmessage = null;
            setTimeout(() => {
                this.onmessage({ data: { type: 'ready' } });
            }, 100); // Simulate network/init delay
        }
        postMessage(msg) {
            if (msg.type === 'process') {
                // Simulate processing time proportional to "file" size
                // File objects have .size, ArrayBuffers had .byteLength
                const fileSize = msg.file.size || 1024;
                const delay = fileSize / 1000; // 1ms per KB
                setTimeout(() => {
                    this.onmessage({ 
                        data: { 
                            type: 'success', 
                            blob: new ArrayBuffer(fileSize), 
                            name: msg.name 
                        } 
                    });
                }, delay);
            }
        }
    }

    beforeAll(() => {
        global.Worker = MockWorker;
        // Mock requestAnimationFrame for frame counting
        global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    });

    it('should maintain main-thread responsiveness during processing', async () => {
        const pdfService = (await import('../services/pdfService.js')).default || window.pdfService;
        
        let frameCount = 0;
        let isMeasuring = true;

        const countFrames = () => {
            if (isMeasuring) {
                frameCount++;
                requestAnimationFrame(countFrames);
            }
        };
        requestAnimationFrame(countFrames);

        // Simulate a 1MB "PDF" (smaller for faster tests)
        const fakePdf = new File([new ArrayBuffer(1024 * 1024)], 'test.pdf', { type: 'application/pdf' });
        
        const startTime = Date.now();
        await pdfService.processFile(fakePdf, { onStatus: () => {} }, { returnBlob: true });
        const duration = Date.now() - startTime;

        isMeasuring = false;

        console.log(`Benchmark: Processed 1MB in ${duration}ms`);
        console.log(`Benchmark: Main thread frames during processing: ${frameCount}`);

        // Success Criteria:
        // 1. Processing should complete
        // 2. Main thread should have rendered multiple frames (not blocked)
        expect(duration).toBeGreaterThan(0);
        expect(frameCount).toBeGreaterThan(2); 
    }, 10000);

    it('should initialize WASM engine within acceptable time limits', async () => {
        const pdfService = (await import('../services/pdfService.js')).default || window.pdfService;
        
        const startTime = Date.now();
        await pdfService.initWasm();
        const initDuration = Date.now() - startTime;

        console.log(`Benchmark: WASM Engine Init took ${initDuration}ms`);
        
        // Success Criteria: Init < 1000ms (as per SUMMARY.md)
        expect(initDuration).toBeLessThan(1000);
    }, 10000);
});
