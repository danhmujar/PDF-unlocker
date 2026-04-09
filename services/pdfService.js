/**
 * PDF Processing Service Layer (Worker Proxy)
 * Acts as a lightweight client for the background pdfWorker.
 */

window.pdfService = (function () {
    let worker = null;
    let isProcessing = false;
    let wasmSupportStatus = 'pending'; // 'pending' | 'supported' | 'blocked'
    
    // Internal state for managing async worker responses
    let initResolver = null;
    let processResolver = null;
    let currentCallbacks = null;
    let currentConfig = null;

    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

    /**
     * Initialize the Web Worker and the underlying WASM engine.
     */
    async function initWasm() {
        if (wasmSupportStatus === 'supported' && worker) return;
        
        return new Promise((resolve, reject) => {
            try {
                if (!worker) {
                    worker = new Worker('services/pdfWorker.js');
                    setupWorkerListeners();
                }
                
                initResolver = resolve;
                worker.postMessage({ type: 'init' });
            } catch (error) {
                wasmSupportStatus = 'blocked';
                console.error("Failed to initialize PDF Worker:", error);
                reject(error);
            }
        });
    }

    /**
     * Set up message routing from the worker back to the main thread.
     */
    function setupWorkerListeners() {
        worker.onmessage = (e) => {
            const { type, state, main, sub, blob, name } = e.data;

            switch (type) {
                case 'ready':
                    wasmSupportStatus = 'supported';
                    if (initResolver) {
                        initResolver();
                        initResolver = null;
                    }
                    break;

                case 'status':
                    if (currentCallbacks?.onStatus) {
                        currentCallbacks.onStatus(state, main, sub);
                    }
                    break;

                case 'success':
                    handleSuccess(blob, name);
                    break;

                case 'error':
                    handleError(main, sub);
                    break;
            }
        };

        worker.onerror = (error) => {
            console.error("Worker error:", error);
            handleError('Worker Error', 'A background processing error occurred.');
        };
    }

    /**
     * Internal handler for successful processing.
     */
    function handleSuccess(outputBuffer, fileName) {
        const outputBlob = new Blob([outputBuffer], { type: "application/pdf" });
        const nameWithoutExt = fileName.toLowerCase().endsWith('.pdf') ? fileName.slice(0, -4) : fileName;
        const newFilename = `${nameWithoutExt}_unlocked.pdf`;

        if (currentConfig?.returnBlob) {
            if (processResolver) {
                processResolver(outputBlob);
            }
        } else {
            // Auto-download on the main thread
            const url = URL.createObjectURL(outputBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = newFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            if (currentCallbacks?.onStatus) {
                currentCallbacks.onStatus('success', 'Success! Downloading...', `${newFilename} is ready.`);
            }
            if (processResolver) processResolver(null);
        }

        cleanupProcessing();
    }

    /**
     * Internal handler for processing errors.
     */
    function handleError(main, sub) {
        if (currentCallbacks?.onStatus) {
            currentCallbacks.onStatus('error', main, sub);
        }
        if (processResolver) processResolver(null);
        cleanupProcessing();
    }

    /**
     * Reset processing state and clear UI references.
     */
    function cleanupProcessing() {
        isProcessing = false;
        if (currentCallbacks?.fileInput) {
            currentCallbacks.fileInput.value = '';
        }
        processResolver = null;
        currentCallbacks = null;
        currentConfig = null;
    }

    /**
     * Validate and proxy the PDF file to the worker for decryption.
     * @param {File} file - The PDF file to process.
     * @param {object} callbacks - UI callback functions.
     * @param {object} config - Configuration options.
     * @returns {Promise<Blob|null>}
     */
    async function processFile(file, callbacks, config = { returnBlob: false }) {
        if (isProcessing) return null;

        const { onStatus } = callbacks;

        if (wasmSupportStatus === 'blocked') {
            onStatus('error', 'Browser Restricted', 'Your browser or organization security policy blocks WebAssembly.');
            return null;
        }

        if (!file || file.type !== "application/pdf") {
            onStatus('error', 'Invalid Format', 'Please upload a valid PDF document.');
            return null;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            onStatus('error', 'File Too Large', `Maximum file size is ${MAX_FILE_SIZE_MB} MB.`);
            return null;
        }

        isProcessing = true;
        currentCallbacks = callbacks;
        currentConfig = config;

        try {
            if (!worker) await initWasm();

            const fileBuffer = await file.arrayBuffer();
            
            return new Promise((resolve) => {
                processResolver = resolve;
                // Transfer ownership of the buffer to the worker (zero-copy)
                worker.postMessage({ 
                    type: 'process', 
                    file: fileBuffer, 
                    name: file.name 
                }, [fileBuffer]);
            });

        } catch (error) {
            console.error("Proxy: Processing error:", error);
            handleError('Processing Failed', 'Could not communicate with the background engine.');
            return null;
        }
    }

    return {
        initWasm,
        processFile,
        get isProcessing() { return isProcessing; },
        get wasmSupportStatus() { return wasmSupportStatus; }
    };
})();

