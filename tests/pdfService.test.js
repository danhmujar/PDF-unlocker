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

        // Mock auditService
        vi.stubGlobal('auditService', {
            logEvent: vi.fn().mockResolvedValue(undefined),
            getLogs: vi.fn().mockResolvedValue([]),
        });

        // Mock persistenceService
        vi.stubGlobal('persistenceService', {
            init: vi.fn().mockResolvedValue(undefined),
            createJob: vi.fn().mockResolvedValue(1),
            updateJob: vi.fn().mockResolvedValue(undefined),
            addFile: vi.fn().mockResolvedValue(1),
            updateFile: vi.fn().mockResolvedValue(undefined),
            getFilesByJob: vi.fn().mockResolvedValue([]),
            saveMetric: vi.fn().mockResolvedValue(undefined),
        });

        // Mock diagnosticsService
        vi.stubGlobal('diagnosticsService', {
            recordWorkerStart: vi.fn(),
            recordProcessComplete: vi.fn(),
            recordError: vi.fn()
        });

        // Evaluate the service code
        const mockWindow = { 
            auditService: window.auditService,
            persistenceService: window.persistenceService,
            diagnosticsService: window.diagnosticsService
        };
        const fn = new Function('window', pdfServiceContent);
        fn(mockWindow);
        pdfService = mockWindow.pdfService;
    });

    it('should persist job and file records during processing', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'persist.pdf',
            size: 100
        };

        // Start a job
        await pdfService.startJob(1);
        expect(window.persistenceService.createJob).toHaveBeenCalledWith({ totalFiles: 1 });

        const processPromise = pdfService.processFile(mockFile, { onStatus }, { returnBlob: true });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(window.persistenceService.addFile).toHaveBeenCalledWith(
            expect.objectContaining({ jobId: 1, name: 'persist.pdf' })
        ));

        // Wait for the service to proceed to 'process' message after addFile resolves
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' })
        ));

        // Simulate success from worker
        const outputBuffer = new ArrayBuffer(4);
        window.persistenceService.getFilesByJob.mockResolvedValue([
            { id: 1, jobId: 1, status: 'completed' }
        ]);

        workers[0].onmessage({ 
            data: { 
                type: 'success', 
                blob: outputBuffer, 
                name: 'persist.pdf',
                hash: 'abc123hash'
            } 
        });

        await processPromise;
        
        expect(window.persistenceService.updateFile).toHaveBeenCalledWith(1, expect.objectContaining({
            status: 'completed',
            hash: 'abc123hash'
        }));

        expect(window.persistenceService.updateJob).toHaveBeenCalledWith(1, expect.objectContaining({
            processedCount: 1,
            status: 'completed'
        }));
    });

    it('should log success event when processing completes', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'test.pdf',
            size: 100
        };

        const processPromise = pdfService.processFile(mockFile, { onStatus }, { returnBlob: true });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' })
        ));

        // Simulate success from worker
        const outputBuffer = new ArrayBuffer(4);
        workers[0].onmessage({ 
            data: { 
                type: 'success', 
                blob: outputBuffer, 
                name: 'test.pdf',
                hash: 'abc123hash'
            } 
        });

        await processPromise;
        
        expect(window.auditService.logEvent).toHaveBeenCalledWith('SUCCESS', expect.objectContaining({
            file: 'test.pdf',
            hash: 'abc123hash'
        }));
    });

    it('should log error event when processing fails', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'error.pdf',
            size: 100
        };

        const processPromise = pdfService.processFile(mockFile, { onStatus });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' })
        ));

        // Simulate error from worker
        workers[0].onmessage({ 
            data: { 
                type: 'error', 
                main: 'Processing Failed', 
                sub: 'Corrupt file' 
            } 
        });

        await processPromise;
        
        expect(window.auditService.logEvent).toHaveBeenCalledWith('ERROR', expect.objectContaining({
            file: 'error.pdf',
            error: 'Processing Failed'
        }));
    });

    it('should reject non-PDF files and log ERROR', async () => {
        const mockFile = { type: 'text/plain', name: 'test.txt' };
        const onStatus = vi.fn();
        const fileInput = { value: 'something' };

        const result = await pdfService.processFile(mockFile, { onStatus, fileInput });

        expect(result).toBeNull();
        expect(onStatus).toHaveBeenCalledWith('error', 'Invalid Format', expect.any(String));
        expect(window.auditService.logEvent).toHaveBeenCalledWith('ERROR', expect.objectContaining({
            file: 'test.txt',
            error: 'Invalid Format'
        }));
    });

    it('should reject files that are too large and log ERROR', async () => {
        const mockFile = {
            type: 'application/pdf',
            name: 'large.pdf',
            size: 1025 * 1024 * 1024 // 1025MB
        };
        const onStatus = vi.fn();
        const fileInput = { value: 'something' };

        const result = await pdfService.processFile(mockFile, { onStatus, fileInput });

        expect(result).toBeNull();
        expect(onStatus).toHaveBeenCalledWith('error', 'File Too Large', expect.any(String));
        expect(window.auditService.logEvent).toHaveBeenCalledWith('ERROR', expect.objectContaining({
            file: 'large.pdf',
            error: 'File Too Large'
        }));
    });

    it('should initialize worker pool and send init message to all', async () => {
        const initPromise = pdfService.initWasm();

        await vi.waitFor(() => expect(mockWorkerConstructor).toHaveBeenCalledTimes(4));
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers.forEach(w => {
            expect(w.postMessage).toHaveBeenCalledWith({ type: 'init' });
        });

        // Simulate one worker becoming ready (or all)
        workers[0].onmessage({ data: { type: 'ready' } });

        await expect(initPromise).resolves.toBeUndefined();
        expect(pdfService.wasmSupportStatus).toBe('supported');
    });

    it('should proxy processFile to worker pool transferring File objects', async () => {
        const onStatus = vi.fn();
        const fileInput = { value: 'something' };
        const mockFile = {
            type: 'application/pdf',
            name: 'test.pdf',
            size: 100
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
            expect.objectContaining({ type: 'process' })
        ));

        expect(workers[0].postMessage).toHaveBeenCalledWith(
            { type: 'process', file: mockFile, name: 'test.pdf' }
        );

        // Simulate success from worker
        const outputBuffer = new ArrayBuffer(4);
        workers[0].onmessage({ 
            data: { 
                type: 'success', 
                blob: outputBuffer, 
                name: 'test.pdf',
                hash: 'hash123'
            } 
        });

        const result = await processPromise;
        expect(result).toBeDefined();
        expect(result.blob.options.type).toBe("application/pdf");
        expect(result.hash).toBe("hash123");
        expect(pdfService.isProcessing).toBe(false);
    });

    it('should handle chunked messages and reassemble streamed file', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'large.pdf',
            size: 300 * 1024 * 1024
        };

        // Mock persistenceService for chunks
        window.persistenceService.saveChunk = vi.fn().mockResolvedValue(1);
        window.persistenceService.assembleFileFromChunks = vi.fn().mockResolvedValue(new Blob([], { type: 'application/pdf' }));
        window.persistenceService.getFilesByJob.mockResolvedValue([{ id: 1, status: 'completed' }]);

        // Start a job to enable file persistence
        await pdfService.startJob(1);

        const processPromise = pdfService.processFile(mockFile, { onStatus }, { returnBlob: true });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);

        // Wait for persistence layer to create the file record
        await vi.waitFor(() => expect(window.persistenceService.addFile).toHaveBeenCalled());

        workers[0].onmessage({ data: { type: 'ready' } });

        // Wait for the service to proceed to 'process' message after addFile resolves
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' })
        ));
        
        // Simulate a chunk message
        const chunkData = new ArrayBuffer(1024);
        workers[0].onmessage({ 
            data: { 
                type: 'chunk', 
                chunkIndex: 0, 
                totalChunks: 1, 
                data: chunkData 
            } 
        });

        expect(window.persistenceService.saveChunk).toHaveBeenCalledWith(1, 0, chunkData);

        // Simulate success message for streamed file
        workers[0].onmessage({ 
            data: { 
                type: 'success', 
                streamed: true, 
                name: 'large.pdf',
                hash: 'streamed-hash'
            } 
        });

        const result = await processPromise;
        
        expect(window.persistenceService.assembleFileFromChunks).toHaveBeenCalledWith(1);
        expect(result.hash).toBe('streamed-hash');
        expect(onStatus).toHaveBeenCalledWith('processing', 'Finalizing...', expect.any(String));
    });

    it('should handle status updates from worker', async () => {
        const onStatus = vi.fn();
        const mockFile = {
            type: 'application/pdf',
            name: 'test.pdf',
            size: 100
        };

        pdfService.processFile(mockFile, { onStatus });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' })
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
            size: 100
        };

        const processPromise = pdfService.processFile(mockFile, { onStatus });
        
        const workers = mockWorkerConstructor.mock.results.map(r => r.value);
        workers[0].onmessage({ data: { type: 'ready' } });
        
        await vi.waitFor(() => expect(workers[0].postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'process' })
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
                size: 100
            };
            const callbacks = { onStatus: vi.fn() };

            pdfService.WorkerPool.enqueue(mockFile, callbacks);

            const workers = mockWorkerConstructor.mock.results.map(r => r.value);
            const firstWorker = workers[0];
            
            expect(firstWorker.postMessage).toHaveBeenCalledWith({ type: 'init' });
            firstWorker.onmessage({ data: { type: 'ready' } });
            
            await vi.waitFor(() => expect(firstWorker.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'process' })
            ));
        });

        it('should handle concurrent tasks up to pool size', async () => {
            vi.stubGlobal('navigator', { hardwareConcurrency: 2 });
            pdfService.WorkerPool.init();

            const mockFile = (name) => ({
                type: 'application/pdf',
                name: name,
                size: 100
            });

            pdfService.WorkerPool.enqueue(mockFile('1.pdf'), { onStatus: vi.fn() });
            pdfService.WorkerPool.enqueue(mockFile('2.pdf'), { onStatus: vi.fn() });
            pdfService.WorkerPool.enqueue(mockFile('3.pdf'), { onStatus: vi.fn() });

            const workers = mockWorkerConstructor.mock.results.map(r => r.value);
            
            workers[0].onmessage({ data: { type: 'ready' } });
            workers[1].onmessage({ data: { type: 'ready' } });

            await vi.waitFor(() => {
                expect(workers[0].postMessage).toHaveBeenCalledWith(expect.objectContaining({ name: '1.pdf' }));
                expect(workers[1].postMessage).toHaveBeenCalledWith(expect.objectContaining({ name: '2.pdf' }));
            });

            const thirdProcessed = workers.some(w => 
                w.postMessage.mock.calls.some(call => call[0].name === '3.pdf')
            );
            expect(thirdProcessed).toBe(false);
        });
    });
});
