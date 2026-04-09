/**
 * Batch Service
 * 
 * Handles business logic for batch operations including ZIP orchestration.
 * Strictly decoupled from the DOM.
 */

const MAX_ZIP_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB limit

const batchService = (function() {
    
    /**
     * Iterates through files with a throttle. 
     * The actual download triggering is handled by the caller via a callback.
     * @param {Array<{blob: Blob, name: string}>} files 
     * @param {Function} onFile Callback to trigger download (file) => void
     */
    async function processIndividually(files, onFile) {
        for (const file of files) {
            onFile(file);
            // Throttled loop (400ms delay) as per requirement
            await new Promise(resolve => setTimeout(resolve, 400));
        }
    }

    /**
     * Packages multiple blobs into a single ZIP file.
     * @param {Array<{blob: Blob, name: string}>} files 
     * @returns {Promise<Blob>}
     * @throws {Error} if total size exceeds limit
     */
    async function packageAsZip(files) {
        const totalSize = files.reduce((acc, file) => acc + file.blob.size, 0);
        
        if (totalSize > MAX_ZIP_SIZE_BYTES) {
            throw new Error(`Batch size (${(totalSize / 1024 / 1024).toFixed(1)}MB) exceeds 1GB limit for ZIP generation.`);
        }

        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library not found.');
        }

        const zip = new JSZip();
        files.forEach(file => {
            zip.file(file.name, file.blob);
        });

        return await zip.generateAsync({ type: 'blob' });
    }

    return {
        processIndividually,
        packageAsZip,
        MAX_ZIP_SIZE_BYTES
    };
})();

// Export for ES modules or global use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = batchService;
} else {
    window.batchService = batchService;
}
