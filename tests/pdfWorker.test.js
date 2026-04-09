import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * pdfWorker unit tests
 * Part of Phase 1: Engine Optimization.
 */

// Load the worker script content
const pdfWorkerPath = path.resolve(__dirname, '../services/pdfWorker.js');
const pdfWorkerContent = fs.readFileSync(pdfWorkerPath, 'utf8');

describe('pdfWorker', () => {
    let workerScope;
    let postMessage;
    let mockModule;

    beforeEach(() => {
        // Setup mock worker environment
        postMessage = vi.fn();
        
        // Mock global Module for Emscripten
        mockModule = vi.fn().mockImplementation(async (options) => {
            const moduleInstance = mockModule.instance || { 
                FS: { writeFile: vi.fn(), readFile: vi.fn(), unlink: vi.fn() }, 
                callMain: vi.fn() 
            };

            if (options.instantiateWasm) {
                // Return an object indicating async instantiation to Emscripten
                // and trigger the underlying WebAssembly promise flow.
                options.instantiateWasm({}, (instance) => {
                    // receiveInstance callback
                });
            }
            
            return moduleInstance;
        });
        vi.stubGlobal('Module', mockModule);
        
        // Mock global importScripts
        const mockImportScripts = vi.fn();
        vi.stubGlobal('importScripts', mockImportScripts);
        
        // Mock global fetch
        const mockFetch = vi.fn();
        vi.stubGlobal('fetch', mockFetch);

        // Mock WebAssembly
        const mockWebAssembly = {
            instantiateStreaming: vi.fn().mockResolvedValue({ instance: { exports: {} } }),
            instantiate: vi.fn()
        };
        vi.stubGlobal('WebAssembly', mockWebAssembly);

        // Mock navigator
        vi.stubGlobal('navigator', { onLine: true });

        workerScope = {
            postMessage: postMessage,
            importScripts: mockImportScripts,
            onmessage: null,
            console: {
                log: vi.fn(),
                warn: vi.fn(),
                error: vi.fn(),
            }
        };

        // Evaluate the worker code in a simulated worker scope
        const fn = new Function('self', 'importScripts', 'Module', 'fetch', 'Uint8Array', 'WebAssembly', 'navigator', pdfWorkerContent);
        fn(workerScope, workerScope.importScripts, mockModule, mockFetch, Uint8Array, mockWebAssembly, navigator);
    });

    it('should initialize WASM successfully', async () => {
        const mockQpdf = { FS: {}, callMain: vi.fn() };
        mockModule.instance = mockQpdf;
        
        global.fetch.mockResolvedValue({
            ok: true
        });

        // Trigger init message
        await workerScope.onmessage({ data: { type: 'init' } });

        expect(postMessage).toHaveBeenCalledWith({ type: 'ready' });
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'status', 
            state: 'loading' 
        }));
        expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('qpdf.wasm'), expect.objectContaining({ integrity: expect.any(String) }));
    });

    it('should handle WASM initialization failure', async () => {
        global.fetch.mockResolvedValue({
            ok: false,
            statusText: 'Not Found'
        });

        await workerScope.onmessage({ data: { type: 'init' } });

        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'error', 
            main: 'Engine Error'
        }));
    });

    it('should reject non-PDF files via magic byte validation', async () => {
        global.fetch.mockResolvedValue({ ok: true });
        const invalidPdfContent = new Uint8Array([0, 1, 2, 3]).buffer;

        await workerScope.onmessage({ 
            data: { 
                type: 'process', 
                file: invalidPdfContent, 
                name: 'fake.pdf' 
            } 
        });

        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'error', 
            main: 'Invalid PDF' 
        }));
    });

    it('should process a valid PDF and return success message with Transferable', async () => {
        const mockQpdf = {
            FS: {
                writeFile: vi.fn(),
                readFile: vi.fn().mockReturnValue(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31])),
                unlink: vi.fn()
            },
            callMain: vi.fn()
        };
        mockModule.instance = mockQpdf;
        global.fetch.mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10))
        });

        const validPdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00]).buffer;

        await workerScope.onmessage({ 
            data: { 
                type: 'process', 
                file: validPdfContent, 
                name: 'test.pdf' 
            } 
        });

        // Check if status processing message was sent
        expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ 
            type: 'status', 
            state: 'processing' 
        }));

        // Check for success message
        expect(postMessage).toHaveBeenCalledWith(
            expect.objectContaining({ 
                type: 'success', 
                name: 'test.pdf' 
            }),
            expect.any(Array) // Transferable Objects (ArrayBuffer)
        );

        // Verify MEMFS interactions
        expect(mockQpdf.FS.writeFile).toHaveBeenCalled();
        expect(mockQpdf.FS.unlink).toHaveBeenCalledTimes(2);
    });

    it('should zero-out the source buffer for security (SEC-3)', async () => {
        const mockQpdf = {
            FS: {
                writeFile: vi.fn(),
                readFile: vi.fn().mockReturnValue(new Uint8Array([0x25, 0x50, 0x44, 0x46])),
                unlink: vi.fn()
            },
            callMain: vi.fn()
        };
        mockModule.instance = mockQpdf;
        global.fetch.mockResolvedValue({
            ok: true,
            arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(10))
        });

        const validPdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xFF]).buffer;
        const view = new Uint8Array(validPdfContent);

        await workerScope.onmessage({ 
            data: { 
                type: 'process', 
                file: validPdfContent, 
                name: 'security.pdf' 
            } 
        });

        // The source buffer (view) should be all zeros now
        const isAllZeros = view.every(byte => byte === 0);
        expect(isAllZeros).toBe(true);
    });
});
