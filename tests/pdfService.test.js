import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Helper to load the script into the test environment
const pdfServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/pdfService.js'), 'utf8');

describe('pdfService (Worker Proxy)', () => {
    let pdfService;
    let mockWorker;

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
        mockWorker = {
            postMessage: vi.fn(),
            onmessage: null,
            onerror: null,
        };
        vi.stubGlobal('Worker', vi.fn().mockImplementation(function() {
            return mockWorker;
        }));

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

    it('should initialize worker and send init message', async () => {
        const initPromise = pdfService.initWasm();

        expect(Worker).toHaveBeenCalledWith('services/pdfWorker.js');
        expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'init' });

        // Simulate worker becoming ready
        mockWorker.onmessage({ data: { type: 'ready' } });

        await expect(initPromise).resolves.toBeUndefined();
        expect(pdfService.wasmSupportStatus).toBe('supported');
    });

    it('should proxy processFile to worker with Transferables', async () => {
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

        // First call should be init because worker is created lazily
        expect(mockWorker.postMessage).toHaveBeenCalledWith({ type: 'init' });
        
        // Simulate worker ready
        mockWorker.onmessage({ data: { type: 'ready' } });

        // Wait for the service to proceed to 'process' message
        await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledTimes(2));

        expect(mockWorker.postMessage).toHaveBeenLastCalledWith(
            { type: 'process', file: mockBuffer, name: 'test.pdf' },
            [mockBuffer]
        );

        // Simulate success from worker
        const outputBuffer = new ArrayBuffer(4);
        mockWorker.onmessage({ data: { type: 'success', blob: outputBuffer, name: 'test.pdf' } });

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
        
        // Handle lazy init
        mockWorker.onmessage({ data: { type: 'ready' } });
        await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledTimes(2));

        // Simulate status update
        mockWorker.onmessage({ 
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
        
        // Handle lazy init
        mockWorker.onmessage({ data: { type: 'ready' } });
        await vi.waitFor(() => expect(mockWorker.postMessage).toHaveBeenCalledTimes(2));

        // Simulate error from worker
        mockWorker.onmessage({ 
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
});
