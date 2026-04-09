/**
 * PDF Processing Service Layer (Worker Proxy & Pool)
 * Acts as a lightweight client for the background pdfWorker.
 * Now supports concurrent processing via WorkerPool.
 */

window.pdfService = (function () {
    const MAX_FILE_SIZE_MB = 100;
    const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
    
    let wasmSupportStatus = 'pending'; // 'pending' | 'supported' | 'blocked'

    /**
     * WorkerPool Module
     * Manages a collection of Web Workers for parallel PDF processing.
     */
    const WorkerPool = (function () {
        let poolSize = navigator.hardwareConcurrency || 4;
        const workers = [];
        const taskQueue = [];
        let isInitialized = false;

        /**
         * Initialize the worker pool.
         */
        function init() {
            if (isInitialized) return;
            
            // Re-check pool size in case navigator.hardwareConcurrency was mocked
            poolSize = navigator.hardwareConcurrency || 4;

            for (let i = 0; i < poolSize; i++) {
                const worker = new Worker('services/pdfWorker.js');
                const workerObj = {
                    id: i,
                    worker: worker,
                    isReady: false,
                    isBusy: false,
                    currentTask: null
                };
                
                setupWorker(workerObj);
                workers.push(workerObj);
                
                // Start WASM initialization for each worker
                worker.postMessage({ type: 'init' });
            }
            
            isInitialized = true;
            wasmSupportStatus = 'supported';
        }

        /**
         * Set up message routing for a worker.
         */
        function setupWorker(workerObj) {
            workerObj.worker.onmessage = (e) => {
                const { type, state, main, sub, blob, name } = e.data;

                switch (type) {
                    case 'ready':
                        workerObj.isReady = true;
                        if (workerObj.isBusy && workerObj.currentTask) {
                            // If it was already assigned a task while waiting for ready
                            startTask(workerObj);
                        } else {
                            processQueue();
                        }
                        break;

                    case 'status':
                        if (workerObj.currentTask?.callbacks?.onStatus) {
                            workerObj.currentTask.callbacks.onStatus(state, main, sub);
                        }
                        break;

                    case 'success':
                        handleWorkerSuccess(workerObj, blob, name);
                        break;

                    case 'error':
                        handleWorkerError(workerObj, main, sub);
                        break;
                }
            };

            workerObj.worker.onerror = (error) => {
                console.error(`Worker ${workerObj.id} error:`, error);
                handleWorkerError(workerObj, 'Worker Error', 'A background processing error occurred.');
            };
        }

        /**
         * Enqueue a file for processing.
         * @param {File} file 
         * @param {object} callbacks 
         * @param {object} config 
         */
        function enqueue(file, callbacks, config = { returnBlob: false }) {
            if (!isInitialized) init();

            const task = { file, callbacks, config, resolve: null };
            const promise = new Promise((resolve) => {
                task.resolve = resolve;
            });

            taskQueue.push(task);
            processQueue();
            
            return promise;
        }

        /**
         * Attempt to assign tasks from the queue to idle workers.
         */
        function processQueue() {
            if (taskQueue.length === 0) return;

            const idleWorker = workers.find(w => !w.isBusy);
            if (!idleWorker) return;

            const task = taskQueue.shift();
            idleWorker.isBusy = true;
            idleWorker.currentTask = task;

            if (idleWorker.isReady) {
                startTask(idleWorker);
            }
            // If not ready, it will startTask when 'ready' message is received
        }

        /**
         * Actually send the process command to the worker.
         */
        async function startTask(workerObj) {
            const { file, callbacks } = workerObj.currentTask;
            
            try {
                const fileBuffer = await file.arrayBuffer();
                workerObj.worker.postMessage({ 
                    type: 'process', 
                    file: fileBuffer, 
                    name: file.name 
                }, [fileBuffer]);
            } catch (error) {
                console.error("WorkerPool: Failed to start task:", error);
                handleWorkerError(workerObj, 'Task Error', 'Failed to read file for processing.');
            }
        }

        /**
         * Handle successful task completion.
         */
        function handleWorkerSuccess(workerObj, outputBuffer, fileName) {
            const { currentTask } = workerObj;
            if (!currentTask) return;

            const outputBlob = new Blob([outputBuffer], { type: "application/pdf" });
            
            if (currentTask.config?.returnBlob) {
                currentTask.resolve(outputBlob);
            } else {
                // Auto-download (legacy behavior support)
                const nameWithoutExt = fileName.toLowerCase().endsWith('.pdf') ? fileName.slice(0, -4) : fileName;
                const newFilename = `${nameWithoutExt}_unlocked.pdf`;
                const url = URL.createObjectURL(outputBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = newFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                if (currentTask.callbacks?.onStatus) {
                    currentTask.callbacks.onStatus('success', 'Success! Downloading...', `${newFilename} is ready.`);
                }
                currentTask.resolve(null);
            }

            cleanupWorker(workerObj);
        }

        /**
         * Handle task error.
         */
        function handleWorkerError(workerObj, main, sub) {
            const { currentTask } = workerObj;
            if (currentTask) {
                if (currentTask.callbacks?.onStatus) {
                    currentTask.callbacks.onStatus('error', main, sub);
                }
                currentTask.resolve(null);
            }
            cleanupWorker(workerObj);
        }

        /**
         * Reset worker state and move to next task.
         */
        function cleanupWorker(workerObj) {
            workerObj.isBusy = false;
            workerObj.currentTask = null;
            processQueue();
        }

        return {
            init,
            enqueue,
            get activeWorkerCount() { return workers.filter(w => w.isBusy).length; },
            get poolSize() { return workers.length; }
        };
    })();

    /**
     * Legacy/Simplified API: processFile
     * Now routes through the WorkerPool.
     */
    async function processFile(file, callbacks, config = { returnBlob: false }) {
        if (wasmSupportStatus === 'blocked') {
            callbacks.onStatus('error', 'Browser Restricted', 'Your browser or organization security policy blocks WebAssembly.');
            return null;
        }

        if (!file || file.type !== "application/pdf") {
            callbacks.onStatus('error', 'Invalid Format', 'Please upload a valid PDF document.');
            return null;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            callbacks.onStatus('error', 'File Too Large', `Maximum file size is ${MAX_FILE_SIZE_MB} MB.`);
            return null;
        }

        return WorkerPool.enqueue(file, callbacks, config);
    }

    return {
        initWasm: async () => {
            WorkerPool.init();
            return Promise.resolve();
        },
        processFile,
        WorkerPool,
        get isProcessing() { return WorkerPool.activeWorkerCount > 0; },
        get wasmSupportStatus() { return wasmSupportStatus; }
    };
})();
