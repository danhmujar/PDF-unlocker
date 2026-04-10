/* global importScripts, Module */

/**
 * PDF Processing Worker
 * Handles WASM initialization and PDF processing in a background thread.
 * Part of Phase 1: Engine Optimization.
 */

// Import the QPDF WASM wrapper from local vendor directory
importScripts('../assets/vendor/qpdf/qpdf.js');

let qpdfModule = null;

/**
 * Helper to convert buffer to hex string.
 * @param {ArrayBuffer} buffer 
 * @returns {string}
 */
function bufferToHex(buffer) {
    const hashArray = Array.from(new Uint8Array(buffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

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

        // DEP-INT-04: Subresource Integrity (SRI) validation for local WASM binary
        const wasmUrl = '../assets/vendor/qpdf/qpdf.wasm';
        const wasmSri = 'sha384-9ESKDLiqwqZ9ln5RdWhoE5TM/zLYG2UoW/AMa0KeND/fhDO5ZJsRH6FTJ3Dera+p';

        qpdfModule = await Module({
            locateFile: (path) => `../assets/vendor/qpdf/${path}`,
            instantiateWasm: (info, receiveInstance) => {
                // Manual fetch with SRI to ensure binary has not been tampered with
                fetch(wasmUrl, { integrity: wasmSri })
                    .then(response => {
                        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                        return response.arrayBuffer();
                    })
                    .then(buffer => WebAssembly.instantiate(buffer, info))
                    .then(result => receiveInstance(result.instance))
                    .catch(error => {
                        console.error("Worker: SRI Validation or WASM instantiation failed:", error);
                        self.postMessage({ 
                            type: 'error', 
                            main: 'Security Error', 
                            sub: 'The PDF engine failed integrity validation and was blocked.' 
                        });
                    });
                return {}; // instantiateWasm is asynchronous
            },
            print: (text) => console.log('Worker stdout:', text),
            printErr: (text) => console.error('Worker stderr:', text)
        });

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
 * Process a PDF file using WorkerFS zero-copy mounting.
 * @param {File|Blob} file - The input PDF file.
 * @param {string} fileName - Original filename for display.
 */
async function processFile(file, fileName) {
    if (!qpdfModule) {
        await initWasm();
    }

    const mountPoint = '/mnt';
    let isMounted = false;

    try {
        self.postMessage({ 
            type: 'status', 
            state: 'processing', 
            main: 'Unlocking locally...', 
            sub: 'Accessing file via WorkerFS zero-copy mounting.' 
        });

        // Magic-byte validation using minimal memory (only 4 bytes)
        const headerBuffer = await file.slice(0, 4).arrayBuffer();
        const header = new Uint8Array(headerBuffer);
        
        if (header.length < 4 ||
            header[0] !== 0x25 || header[1] !== 0x50 ||
            header[2] !== 0x44 || header[3] !== 0x46) {
            self.postMessage({ 
                type: 'error', 
                main: 'Invalid PDF', 
                sub: 'File header does not match a valid PDF signature.' 
            });
            return;
        }

        // Create mount point if it doesn't exist
        try {
            qpdfModule.FS.mkdir(mountPoint);
        } catch (e) {
            // Directory might already exist (code 17 is EEXIST)
            if (e.errno !== 17) console.warn('Worker: FS.mkdir error:', e);
        }

        // Mount the file via WorkerFS. This provides a virtual file in the WASM FS
        // that points directly to the browser's File handle, avoiding a memory copy.
        qpdfModule.FS.mount(qpdfModule.WORKERFS, { files: [file] }, mountPoint);
        isMounted = true;

        // Path inside WorkerFS is simply the name of the file object
        const inputPath = `${mountPoint}/${file.name}`;
        const outputName = `output_${Date.now()}.pdf`;

        self.postMessage({ 
            type: 'status', 
            state: 'processing', 
            main: 'Decrypting...', 
            sub: 'Removing restrictions securely via QPDF core.' 
        });

        // Execute QPDF decryption
        qpdfModule.callMain(["--decrypt", inputPath, outputName]);
        
        self.postMessage({ 
            type: 'status', 
            state: 'processing', 
            main: 'Finalizing...', 
            sub: 'Preparing output.' 
        });

        // Read the result from MEMFS (output is in MEMFS)
        const outputFile = qpdfModule.FS.readFile(outputName);
        
        // Calculate SHA-256 hash of the output
        const hashBuffer = await self.crypto.subtle.digest('SHA-256', outputFile);
        const hashHex = bufferToHex(hashBuffer);

        // Send back the processed file using Transferable Objects
        const outputBuffer = new Uint8Array(outputFile).buffer;
        
        self.postMessage({ 
            type: 'success', 
            blob: outputBuffer, 
            name: fileName,
            hash: hashHex
        }, [outputBuffer]);

        // Cleanup output from MEMFS immediately
        try {
            qpdfModule.FS.unlink(outputName);
        } catch (e) {
            console.warn('Worker: Failed to unlink output file:', e);
        }

    } catch (error) {
        console.error("Worker: PDF Processing error:", error);
        self.postMessage({ 
            type: 'error', 
            main: 'Processing Failed', 
            sub: 'The document appears to be corrupted or too heavily encrypted.' 
        });
    } finally {
        // Ensure we always unmount to free up the mount point and file handle
        if (isMounted) {
            try {
                qpdfModule.FS.unmount(mountPoint);
            } catch (e) {
                console.warn('Worker: Failed to unmount WorkerFS:', e);
            }
        }
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
            // file is now a File/Blob object (from Task 1 refactor)
            await processFile(file, name);
            break;
        default:
            console.warn('Worker: Unknown message type:', type);
    }
};
