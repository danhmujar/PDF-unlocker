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

        // Fetch WASM manually. SRI is planned for Plan 02.
        const wasmResponse = await fetch('https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/qpdf.wasm');
        if (!wasmResponse.ok) throw new Error('Failed to fetch WASM binary');
        
        const wasmBinary = await wasmResponse.arrayBuffer();

        qpdfModule = await Module({
            wasmBinary: wasmBinary,
            locateFile: (path) => `https://unpkg.com/@neslinesli93/qpdf-wasm@0.3.0/dist/${path}`,
            print: (text) => console.log('Worker stdout:', text),
            printErr: (text) => console.error('Worker stderr:', text)
        });

        self.postMessage({ type: 'ready' });
    } catch (error) {
        console.error("Worker: Failed to initialize QPDF WASM:", error);
        self.postMessage({ 
            type: 'error', 
            main: 'Engine Error', 
            sub: 'Failed to initialize the PDF processing engine.' 
        });
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
