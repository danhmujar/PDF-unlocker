/**
 * Diagnostics Service
 * Handles performance telemetry and engine health monitoring.
 * Follows the Revealing Module Pattern.
 */

/* global persistenceService */

window.diagnosticsService = (function () {
    const stats = {
        totalFilesProcessed: 0,
        totalBytesProcessed: 0,
        totalDurationMs: 0,
        errorCount: 0,
        workerStarts: 0
    };

    /**
     * Record a worker initialization event.
     */
    function recordWorkerStart() {
        stats.workerStarts++;
        const event = {
            type: 'worker_start',
            timestamp: Date.now()
        };
        console.log('[Diagnostics] Worker initialization started');
        saveToPersistence(event);
    }

    /**
     * Record a successful file processing event.
     * @param {number} fileSize - Size of the file in bytes.
     * @param {number} duration - Duration of processing in milliseconds.
     * @param {Object} memory - Memory usage info (optional).
     */
    function recordProcessComplete(fileSize, duration, memory = null) {
        stats.totalFilesProcessed++;
        stats.totalBytesProcessed += fileSize;
        stats.totalDurationMs += duration;

        const event = {
            type: 'process_complete',
            timestamp: Date.now(),
            fileSize,
            duration,
            memory: memory || getMemoryUsage(),
            speedMBps: fileSize > 0 ? (fileSize / 1024 / 1024) / (duration / 1000) : 0
        };

        console.log(`[Diagnostics] Process complete: ${(fileSize / 1024 / 1024).toFixed(2)} MB in ${duration.toFixed(0)}ms (${event.speedMBps.toFixed(2)} MB/s)`);
        saveToPersistence(event);
    }

    /**
     * Record an error event.
     * @param {string} context - Where the error occurred.
     * @param {Error|string} error - The error details.
     */
    function recordError(context, error) {
        stats.errorCount++;
        const event = {
            type: 'error',
            timestamp: Date.now(),
            context,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : null
        };

        console.error(`[Diagnostics] Error in ${context}:`, error);
        saveToPersistence(event);
    }

    /**
     * Get current memory usage if supported by the browser.
     */
    function getMemoryUsage() {
        if (window.performance && window.performance.memory) {
            return {
                usedJSHeapSize: window.performance.memory.usedJSHeapSize,
                totalJSHeapSize: window.performance.memory.totalJSHeapSize,
                jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit
            };
        }
        return null;
    }

    /**
     * Save the event to persistence service.
     * @param {Object} event 
     */
    async function saveToPersistence(event) {
        if (window.persistenceService && typeof window.persistenceService.saveMetric === 'function') {
            try {
                await window.persistenceService.saveMetric(event);
            } catch (err) {
                console.warn('[Diagnostics] Failed to persist metric:', err);
            }
        }
    }

    /**
     * Get aggregated statistics.
     */
    function getStats() {
        return {
            ...stats,
            averageSpeedMBps: stats.totalDurationMs > 0 
                ? (stats.totalBytesProcessed / 1024 / 1024) / (stats.totalDurationMs / 1000) 
                : 0,
            averageDurationPerFile: stats.totalFilesProcessed > 0 
                ? stats.totalDurationMs / stats.totalFilesProcessed 
                : 0,
            errorRate: stats.totalFilesProcessed > 0 
                ? (stats.errorCount / (stats.totalFilesProcessed + stats.errorCount)) * 100 
                : 0
        };
    }

    return {
        recordWorkerStart,
        recordProcessComplete,
        recordError,
        getStats
    };
})();
