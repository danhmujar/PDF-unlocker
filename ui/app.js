/**
 * Presentation Layer
 * DOM references, SVG helpers, event listeners, theme toggle, and modal logic.
 * Depends on: pdfService.js (loaded first via classic script tag).
 */

/* global pdfService */

// --- DOM References ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const subStatusText = document.getElementById('sub-status-text');
const statusIcon = document.getElementById('status-icon');
const spinner = document.getElementById('spinner');

// --- Worker & Engine State ---
let pdfWorker = null;
let isEngineReady = false;

function initEngine() {
    updateStatus('loading', 'Loading engine...', 'Preparing local environment');
    
    try {
        pdfWorker = new Worker('services/pdfWorker.js');
        
        pdfWorker.onmessage = (e) => {
            const { type, state, main, sub, blob, name } = e.data;
            
            switch (type) {
                case 'ready':
                    isEngineReady = true;
                    updateStatus('default', 'Awaiting Document', 'Drag & drop protected PDFs here, or click to browse');
                    break;
                    
                case 'status':
                    // Map worker status to UI updates
                    updateStatus(state, main, sub);
                    break;
                    
                case 'success':
                    handleWorkerSuccess(blob, name);
                    break;
                    
                case 'error':
                    if (!isEngineReady) {
                        updateStatus('error', 'Engine Initialization Failed', sub);
                    } else {
                        updateStatus('error', main, sub);
                    }
                    isEngineReady = false; // Block interaction on fatal error
                    break;
            }
        };

        pdfWorker.onerror = (err) => {
            console.error("Worker Error:", err);
            isEngineReady = false;
            updateStatus('error', 'Engine Error', 'Failed to start background processor. Please reload.');
        };

        // Trigger worker initialization
        pdfWorker.postMessage({ type: 'init' });

    } catch (err) {
        console.error("Worker initialization failed:", err);
        isEngineReady = false;
        updateStatus('error', 'Browser Restricted', 'Your browser does not support background processing (WebWorkers).');
    }
}

// Initial engine bootstrap
initEngine();

// --- Async Font Swap (CSP-safe alternative to inline onload) ---
const fontLink = document.getElementById('google-fonts');
if (fontLink) {
    fontLink.addEventListener('load', () => { fontLink.media = 'all'; });
    // If already loaded (cached), swap immediately
    if (fontLink.sheet) fontLink.media = 'all';
}

// --- SVG Path Constants ---
const SVGS = {
    upload: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>`,
    success: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>`,
    error: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>`
};

// Safe SVG update — avoids innerHTML on the live document to prevent latent XSS vectors
function setSvgContent(svgElement, pathMarkup) {
    while (svgElement.firstChild) {
        svgElement.removeChild(svgElement.firstChild);
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${pathMarkup}</svg>`, 'image/svg+xml');
    const newPaths = doc.documentElement.childNodes;

    // Convert NodeList to array before appending to avoid live-collection mutation issues
    Array.from(newPaths).forEach(node => {
        svgElement.appendChild(node);
    });
}

// --- Status Management ---
function updateStatus(state, mainText, subText) {
    statusText.textContent = mainText;
    subStatusText.textContent = subText;

    // Manage ARIA attributes for screen readers
    dropZone.setAttribute('aria-busy', (state === 'processing' || state === 'loading') ? 'true' : 'false');

    dropZone.className = 'drop-zone';
    spinner.classList.remove('visible');
    statusIcon.classList.remove('hidden');

    if (state === 'processing' || state === 'loading') {
        dropZone.classList.add(state); // adds .processing or .loading
        spinner.classList.add('visible');
        statusIcon.classList.add('hidden');
    } else if (state === 'success') {
        dropZone.classList.add('success');
        setSvgContent(statusIcon, SVGS.success);
    } else if (state === 'error') {
        dropZone.classList.add('error');
        setSvgContent(statusIcon, SVGS.error);
    } else {
        setSvgContent(statusIcon, SVGS.upload);
    }
}

function resetState() {
    setTimeout(() => {
        // Guard: only reset if the service layer and queue are no longer processing
        // and engine is ready
        if (!isQueueRunning && isEngineReady) {
            updateStatus('default', 'Awaiting Document', 'Drag & drop protected PDFs here, or click to browse');
        }
    }, 6000);
}

const MAX_BATCH_FILES = 20;
let fileQueue = [];
let isQueueRunning = false;
let currentBatchZip = null;
let currentBatchTotal = 0;
let currentBatchProcessed = 0;
let currentBatchSuccessful = 0;

const ZIP_MEMORY_LIMIT_MB = 150;
const ZIP_MEMORY_LIMIT_BYTES = ZIP_MEMORY_LIMIT_MB * 1024 * 1024;

// --- Queue Manager ---
async function processQueue() {
    if (isQueueRunning || !isEngineReady) return;
    isQueueRunning = true;

    currentBatchTotal = fileQueue.length;
    currentBatchProcessed = 0;
    currentBatchSuccessful = 0;

    // Calculate total size to determine if we can safely zip in RAM
    const totalBatchSize = fileQueue.reduce((acc, f) => acc + f.size, 0);
    const useZip = (totalBatchSize < ZIP_MEMORY_LIMIT_BYTES) && (currentBatchTotal > 1);

    currentBatchZip = useZip ? new JSZip() : null;

    nextInQueue();
}

function nextInQueue() {
    if (fileQueue.length === 0) {
        finalizeBatch();
        return;
    }

    const currentFile = fileQueue.shift();
    currentBatchProcessed++;

    // Update UI to show progress
    updateStatus('processing', `Unlocking (${currentBatchProcessed}/${currentBatchTotal})...`, `Processing: ${currentFile.name}`);

    // Read file as ArrayBuffer for the worker
    const reader = new FileReader();
    reader.onload = (e) => {
        const buffer = e.target.result;
        pdfWorker.postMessage({ 
            type: 'process', 
            file: buffer, 
            name: currentFile.name 
        }, [buffer]); // Transfer buffer for performance
    };
    reader.onerror = () => {
        updateStatus('error', 'Read Error', `Failed to read ${currentFile.name}`);
        nextInQueue();
    };
    reader.readAsArrayBuffer(currentFile);
}

function handleWorkerSuccess(buffer, originalName) {
    currentBatchSuccessful++;
    const blob = new Blob([buffer], { type: "application/pdf" });
    const nameWithoutExt = originalName.toLowerCase().endsWith('.pdf') ? originalName.slice(0, -4) : originalName;
    const newFilename = `${nameWithoutExt}_unlocked.pdf`;

    if (currentBatchZip) {
        currentBatchZip.file(newFilename, blob);
        nextInQueue();
    } else {
        // Individual auto-download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = newFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        if (currentBatchTotal === 1) {
            updateStatus('success', 'Success! Downloading...', `${newFilename} is ready.`);
            finalizeBatch();
        } else {
            nextInQueue();
        }
    }
}

async function finalizeBatch() {
    if (currentBatchZip && currentBatchSuccessful > 0) {
        updateStatus('processing', 'Compressing files...', 'Building your ZIP archive securely in memory.');
        try {
            const zipBlob = await currentBatchZip.generateAsync({ type: "blob" });
            const url = URL.createObjectURL(zipBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Unlocked_PDFs.zip`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            updateStatus('success', 'Success! Downloading ZIP...', 'All documents preserved and unlocked.');
        } catch (error) {
            console.error("ZIP Generation error:", error);
            updateStatus('error', 'ZIP Failed', 'Failed to compress files due to browser memory limits.');
        }
    }

    isQueueRunning = false;
    currentBatchZip = null;
    resetState();
}

// --- Interaction Logic ---
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        if (isEngineReady && !isQueueRunning) dropZone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
        dropZone.classList.remove('dragover');
    }, false);
});

function queueFiles(fileList) {
    if (!isEngineReady) {
        updateStatus('error', 'Engine Not Ready', 'Please wait for the engine to finish loading.');
        return;
    }
    const files = Array.from(fileList).filter(f => f.type === "application/pdf");
    if (files.length === 0) {
        updateStatus('error', 'Invalid Format', 'Please upload valid PDF documents.');
        resetState();
        return;
    }
    if (files.length > MAX_BATCH_FILES) {
        updateStatus('error', 'Batch Limit Exceeded', `Maximum batch size is ${MAX_BATCH_FILES} files.`);
        resetState();
        return;
    }
    fileQueue.push(...files);
    processQueue();
}

dropZone.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length > 0) {
        queueFiles(e.dataTransfer.files);
    }
    dropZone.blur();
});

dropZone.addEventListener('click', () => {
    if (isEngineReady && !isQueueRunning) fileInput.click();
});

// Keyboard accessibility: trigger specific actions on Enter/Space
dropZone.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && isEngineReady && !isQueueRunning) {
        preventDefaults(e);
        fileInput.click();
    }
});


fileInput.addEventListener('change', function () {
    if (this.files.length > 0) {
        queueFiles(this.files);
    }
    this.value = ''; // Reset input so same file can be re-selected if needed
    dropZone.blur();
});

// --- Theme Toggle Logic ---
const themeToggle = document.getElementById('theme-toggle');
const rootElement = document.documentElement;
const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
    rootElement.setAttribute('data-theme', 'dark');
}

themeToggle.addEventListener('click', () => {
    const currentTheme = rootElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    rootElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

// --- Modal About Toggle Logic ---
const aboutToggle = document.getElementById('about-toggle');
const modalBackdrop = document.getElementById('modal-backdrop');
const modalClose = document.getElementById('modal-close');
const aboutPanel = document.querySelector('.about-panel');

function openModal() {
    modalBackdrop.classList.add('open');
    modalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    // Move focus into the modal for screen readers
    modalClose.focus();
}

function closeModal() {
    modalBackdrop.classList.remove('open');
    modalBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
    // Return focus to the trigger element
    aboutToggle.focus();
}

aboutToggle.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);

// Close modal when clicking outside the panel
modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
});

// Close modal on Escape key + focus trap
document.addEventListener('keydown', (e) => {
    if (!modalBackdrop.classList.contains('open')) return;

    if (e.key === 'Escape') {
        closeModal();
        return;
    }

    // Focus trap: cycle Tab within modal
    if (e.key === 'Tab') {
        const focusable = aboutPanel.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
});
