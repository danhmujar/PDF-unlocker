/* global importScripts, Module */

/**
 * PDF Processing Worker
 * Handles WASM initialization and PDF processing in a background thread.
 * Part of Phase 1: Engine Optimization.
 */

// Import the QPDF WASM wrapper from unpkg
importScripts('https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.js');

let qpdfModule = null;

/**
 * Initialize the QPDF WebAssembly module.
 */
async function initWasm() {
    if (qpdfModule) {
        self.postMessage({ type: 'ready' });
        return;
    }

    try {
        self.postMessage({ 
            type: 'status', 
            state: 'loading', 
            main: 'Initializing Engine', 
            sub: 'Loading WebAssembly core...' 
        });

        const wasmUrl = 'https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.wasm';
        const sriHash = 'sha384-9ESKDLiqwqZ9ln5RdWhoE5TM/zLYG2UoW/AMa0KeND/fhDO5ZJsRH6FTJ3Dera+p';

        // Use a promise to track instantiation status
        let resolveInit;
        let rejectInit;
        const initPromise = new Promise((resolve, reject) => {
            resolveInit = resolve;
            rejectInit = reject;
        });

        qpdfModule = await Module({
            /**
             * Optimized instantiation using streaming and SRI.
             * This overrides Emscripten's default fetch logic.
             */
            instantiateWasm: (info, receiveInstance) => {
                fetch(wasmUrl, { integrity: sriHash })
                    .then(response => {
                        if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
                        return WebAssembly.instantiateStreaming(response, info);
                    })
                    .then(result => {
                        receiveInstance(result.instance);
                        resolveInit(); // Signal success to initWasm
                    })
                    .catch(error => {
                        let errorMsg = 'Failed to load PDF engine.';
                        if (error instanceof TypeError && error.message.includes('integrity')) {
                            errorMsg = 'Security Error: WASM binary integrity check failed.';
                        } else if (error.name === 'CompileError' || error.name === 'EvalError') {
                            errorMsg = 'Security Error: WASM execution blocked (check CSP).';
                        } else if (error.message.includes('fetch') || !navigator.onLine) {
                            errorMsg = 'Network Error: Check your internet connection.';
                        }

                        console.error("Worker: WASM init error:", error);
                        self.postMessage({ 
                            type: 'error', 
                            main: 'Engine Error', 
                            sub: errorMsg 
                        });
                        rejectInit(new Error(errorMsg)); // Signal failure to initWasm
                    });
                return {}; // Indicates async instantiation to Emscripten
            },
            locateFile: (path) => `https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/${path}`,
            print: (text) => console.log('Worker stdout:', text),
            printErr: (text) => console.error('Worker stderr:', text)
        });

        // Wait for instantiateWasm to actually finish
        await initPromise;

        self.postMessage({ type: 'ready' });
    } catch (error) {
        console.error("Worker: Failed to initialize QPDF WASM:", error);
        // Avoid sending duplicate error if already sent in instantiateWasm
        if (!qpdfModule) {
            self.postMessage({ 
                type: 'error', 
                main: 'Engine Error', 
                sub: 'Failed to initialize the PDF processing engine.' 
            });
        }
    }
}

/**
 * Process a PDF file using MEMFS in-memory processing.
 * @param {ArrayBuffer} fileBuffer - The input PDF data.
 * @param {string} fileName - Original filename.
 */
async function processFile(fileBuffer, fileName) {
    if (!qpdfModule) {
        await initWasm();
    }

    try {
        self.postMessage({ 
            type: 'status', 
            state: 'processing', 
            main: 'Unlocking locally...', 
            sub: 'Parsing structure and removing restrictions securely.' 
        });

        const uint8Array = new Uint8Array(fileBuffer);

        // Magic-byte validation: PDF files must start with %PDF
        if (uint8Array.length < 4 ||
            uint8Array[0] !== 0x25 || uint8Array[1] !== 0x50 ||
            uint8Array[2] !== 0x44 || uint8Array[3] !== 0x46) {
            self.postMessage({ 
                type: 'error', 
                main: 'Invalid PDF', 
                sub: 'File header does not match a valid PDF signature.' 
            });
            return;
        }

        const inputName = `input_${Date.now()}.pdf`;
        const outputName = `output_${Date.now()}.pdf`;

        // Task 2: Implement MEMFS In-Memory Processing (SEC-3)
        // Mounting ArrayBuffer directly into MEMFS
        qpdfModule.FS.writeFile(inputName, uint8Array);
        
        // Zero the source buffer after writing to WASM FS (Security: SEC-3)
        uint8Array.fill(0);

        // Execute QPDF decryption
        qpdfModule.callMain(["--decrypt", inputName, outputName]);
        
        // Read the result directly from MEMFS
        const outputFile = qpdfModule.FS.readFile(outputName);
        
        // Cleanup MEMFS immediately to free memory
        try {
            qpdfModule.FS.unlink(inputName);
            qpdfModule.FS.unlink(outputName);
        } catch (e) {
            console.warn('Worker: FS cleanup failed:', e);
        }

        // Send back the processed file using Transferable Objects for zero-copy
        // We need a NEW ArrayBuffer to transfer, readFile returns a Uint8Array view 
        // that might be part of the WASM heap.
        const outputBuffer = new Uint8Array(outputFile).buffer;
        
        self.postMessage({ 
            type: 'success', 
            blob: outputBuffer, 
            name: fileName 
        }, [outputBuffer]);

    } catch (error) {
        console.error("Worker: PDF Processing error:", error);
        self.postMessage({ 
            type: 'error', 
            main: 'Processing Failed', 
            sub: 'The document appears to be corrupted or too heavily encrypted.' 
        });
    }
}

/**
 * Listen for messages from the main thread.
 */
self.onmessage = async (e) => {
    const { type, file, name } = e.data;

    switch (type) {
        case 'init':
            await initWasm();
            break;
        case 'process':
            // file is expected to be an ArrayBuffer
            await processFile(file, name);
            break;
        default:
            console.warn('Worker: Unknown message type:', type);
    }
};
