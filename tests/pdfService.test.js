import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Helper to load the script into the test environment
const pdfServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/pdfService.js'), 'utf8');

describe('pdfService (Worker Proxy)', () => {
    let pdfService;
    let mockWorkerConstructor;

    beforeEach(() => {
        // Setup mock environment
        vi.stubGlobal('console', {
            log: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        });

        // Mock URL and Blob for browser-only APIs
        vi.stubGlobal('URL', {
            createObjectURL: vi.fn().mockReturnValue('blob:mock-url'),
            revokeObjectURL: vi.fn(),
        });

        vi.stubGlobal('Blob', class Blob {
            constructor(parts, options) {
                this.parts = parts;
                this.options = options;
            }
        });

        // Mock document.createElement for auto-download testing
        vi.stubGlobal('document', {
            createElement: vi.fn().mockReturnValue({
                appendChild: vi.fn(),
                removeChild: vi.fn(),
                click: vi.fn(),
                style: {},
            }),
            body: {
                appendChild: vi.fn(),
                removeChild: vi.fn(),
            }
        });

        // Mock Worker
        mockWorkerConstructor = vi.fn().mockImplementation(function() {
            this.postMessage = vi.fn();
            this.onmessage = null;
            this.onerror = null;
            return this;
        });
        vi.stubGlobal('Worker', mockWorkerConstructor);

        vi.stubGlobal('navigator', { hardwareConcurrency: 4 });

        // Evaluate the service code
        const mockWindow = {};
        const fn = new Function('window', pdfServiceContent);
        fn(mockWindow);
        pdfService = mockWindow.pdfService;
    });

    it('should reject non-PDF files', async () => {
        const mockFile = { type: 'text/plain', name: 'test.txt' };
        const onStatus = vi.fn();
        const fileInput = { value: 'something' };

        const result = await pdfService.processFile(mockFile, { onStatus, fileInput });

        expect(result).toBeNull();
        expect(onStatus).toHaveBeenCalledWith('error', 'Invalid Format', expect.any(String));
    });

    it('should reject files that are too large', async () => {
        const mockFile = {
            type: 'application/pdf',
            name: 'large.pdf',
            size: 101 * 1024 * 1024 // 101MB
        };
        const onStatus = vi.fn();
        const fileInput = { value: 'something' };

        const result = await pdfService.processFile(mockFile, { onStatus, fileInput });

        expect(result).toBeNull();
        expect(onStatus).toHaveBeenCalledWith('error', 'File Too Large', expect.any(String));
    });

    it('should initialize worker pool and send init message to all', async () => {
        const initPromise = pdfService.initWasm();

        expect(mockWorkerConstructor).toHaveBeenCalledTimes(4);
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers.forEach(w => {
            expect(w.postMessage).toHaveBeenCalledWith({ type: 'init' });
        });

        // Simulate one worker becoming ready (or all)
        workers[0].onmessage({ data: { type: 'ready' } });

        await expect(initPromise).resolves.toBeUndefined();
        expect(pdfService.wasmSupportStatus).toBe('supported');
    });

    it('should proxy processFile to worker pool with Transferables', async () => {
        const onStatus = vi.fn();
        const fileInput = { value: 'something' };
        const mockBuffer = new ArrayBuffer(8);
        const mockFile = {
            type: 'application/pdf',
            name: 'test.pdf',
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(mockBuffer)
        };

        // Start processing
        const processPromise = pdfService.processFile(mockFile, { onStatus, fileInput }, { returnBlob: true });

        // Should have initialized workers
        expect(mockWorkerConstructor).toHaveBeenCalled();
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        
        // Simulate worker ready
        workers[0].onmessage({ data: { type: 'ready' } });

        // Wait for the service to proceed to 'process' message
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' }),
            expect.any(Array)
        ));

        expect(workers[0].postMessage).toHaveBeenCalledWith(
            { type: 'process', file: mockBuffer, name: 'test.pdf' },
            [mockBuffer]
        );

        // Simulate success from worker
        const outputBuffer = new ArrayBuffer(4);
        workers[0].onmessage({ data: { type: 'success', blob: outputBuffer, name: 'test.pdf' } });

        const result = await processPromise;
        expect(result).toBeDefined();
        expect(result.options.type).toBe("application/pdf");
        expect(pdfService.isProcessing).toBe(false);
    });

    it('should handle status updates from worker', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'test.pdf',
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        };

        pdfService.processFile(mockFile, { onStatus });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' }),
            expect.any(Array)
        ));

        // Simulate status update
        workers[0].onmessage({ 
            data: { 
                type: 'status', 
                state: 'processing', 
                main: 'Unlocking...', 
                sub: 'Step 1' 
            } 
        });

        expect(onStatus).toHaveBeenCalledWith('processing', 'Unlocking...', 'Step 1');
    });

    it('should handle errors from worker', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'corrupt.pdf',
            size: 100,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
        };

        const processPromise = pdfService.processFile(mockFile, { onStatus });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' }),
            expect.any(Array)
        ));

        // Simulate error from worker
        workers[0].onmessage({ 
            data: { 
                type: 'error', 
                main: 'Failed', 
                sub: 'Corrupt file' 
            } 
        });

        const result = await processPromise;
        expect(result).toBeNull();
        expect(onStatus).toHaveBeenCalledWith('error', 'Failed', 'Corrupt file');
        expect(pdfService.isProcessing).toBe(false);
    });

    describe('WorkerPool', () => {
        it('should initialize multiple workers based on hardwareConcurrency', () => {
            vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
            pdfService.WorkerPool.init();
            expect(mockWorkerConstructor).toHaveBeenCalledTimes(4);
        });

        it('should distribute tasks to idle workers', async () => {
            vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
            pdfService.WorkerPool.init();
            
            const mockFile = {
                type: 'application/pdf',
                name: 'test.pdf',
                size: 100,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            };
            const callbacks = { onStatus: vi.fn() };

            pdfService.WorkerPool.enqueue(mockFile, callbacks);

            const workers = mockWorkerConstructor.mock.results.map(r => r.value);
            const firstWorker = workers[0];
            
            expect(firstWorker.postMessage).toHaveBeenCalledWith({ type: 'init' });
            firstWorker.onmessage({ data: { type: 'ready' } });
            
            await vi.waitFor(() => expect(firstWorker.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'process' }),
                expect.any(Array)
            ));
        });

        it('should handle concurrent tasks up to pool size', async () => {
            vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
            pdfService.WorkerPool.init();

            const mockFile = (name) => ({
                type: 'application/pdf',
                name: name,
                size: 100,
                arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8))
            });

            pdfService.WorkerPool.enqueue(mockFile('1.pdf'), { onStatus: vi.fn() });
            pdfService.WorkerPool.enqueue(mockFile('2.pdf'), { onStatus: vi.fn() });
            pdfService.WorkerPool.enqueue(mockFile('3.pdf'), { onStatus: vi.fn() });

            const workers = mockWorkerConstructor.mock.results.map(r => r.value);
            
            workers[0].onmessage({ data: { type: 'ready' } });
            workers[1].onmessage({ data: { type: 'ready' } });

            await vi.waitFor(() => {
                expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ name: '1.pdf' }), expect.any(Array));
                expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ name: '2.pdf' }), expect.any(Array));
            });

            const thirdProcessed = workers.some(w => 
                w.postMessage.mock.calls.some(call => call[0].name === '3.pdf')
            );
            expect(thirdProcessed).toBe(false);
        });
    });
});
