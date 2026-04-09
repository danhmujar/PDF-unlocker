/**
 * Presentation Layer
 * DOM references, SVG helpers, event listeners, theme toggle, and modal logic.
 * Depends on: pdfService.js (loaded first via classic script tag).
 */

/* global pdfService, JSZip */

// --- DOM References ---
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const statusText = document.getElementById('status-text');
const subStatusText = document.getElementById('sub-status-text');
const statusIcon = document.getElementById('status-icon');
const spinner = document.getElementById('spinner');
const bentoGrid = document.getElementById('bento-grid');

// --- Worker & Engine State ---
let isEngineReady = false;

async function initEngine() {
    updateStatus('loading', 'Loading engine...', 'Preparing local environment');
    
    try {
        await pdfService.initWasm();
        isEngineReady = true;
        updateStatus('default', 'Awaiting Document', 'Drag & drop protected PDFs here, or click to browse');
    } catch (err) {
        console.error("Engine initialization failed:", err);
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
    error: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>`,
    pdf: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>`,
    aurora: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path>`,
    midnight: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path>`,
    frost: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 13l3 3m0 0l3-3m-3 3v-6"></path>`,
    ember: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.99 7.99 0 0120 13a7.98 7.98 0 01-2.343 5.657z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14l.879 2.121z"></path>`
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

    if (bentoGrid && !bentoGrid.classList.contains('hidden')) {
        dropZone.classList.add('compact');
    }

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
            const hasFiles = bentoGrid && bentoGrid.children.length > 0;
            if (hasFiles) {
                updateStatus('default', 'Batch Complete', 'Select more files to append to the batch');
            } else {
                updateStatus('default', 'Awaiting Document', 'Drag & drop protected PDFs here, or click to browse');
            }
        }
    }, 6000);
}

// --- Bento Grid Rendering ---
function renderBentoGrid(files) {
    const update = () => {
        bentoGrid.classList.remove('hidden');
        dropZone.classList.add('compact');

        files.forEach(file => {
            // Check if card already exists for this file object (by name and size as proxy)
            const cardId = `file-${file.name.replace(/[^a-z0-9]/gi, '-')}-${file.size}`;
            if (document.getElementById(cardId)) return;

            const card = document.createElement('div');
            card.className = 'file-card pending';
            card.id = cardId;
            card.innerHTML = `
                <div class="file-info">
                    <svg class="file-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        ${SVGS.pdf}
                    </svg>
                    <span class="file-name" title="${file.name}">${file.name}</span>
                </div>
                <div class="file-status">Pending</div>
            `;
            bentoGrid.appendChild(card);
        });
    };

    if (document.startViewTransition) {
        document.startViewTransition(update);
    } else {
        update();
    }
}

function updateCardStatus(file, state, text) {
    const cardId = `file-${file.name.replace(/[^a-z0-9]/gi, '-')}-${file.size}`;
    const card = document.getElementById(cardId);
    if (!card) return;

    card.className = `file-card ${state}`;
    const statusEl = card.querySelector('.file-status');
    if (statusEl) statusEl.textContent = text;
}

const MAX_BATCH_FILES = 20;
let fileQueue = [];
let isQueueRunning = false;
let currentBatchFiles = []; // Stores {blob, name}
let currentBatchTotal = 0;
let currentBatchProcessed = 0;
let currentBatchSuccessful = 0;

// --- Queue Manager ---
async function processQueue() {
    if (isQueueRunning || !isEngineReady) return;
    isQueueRunning = true;

    currentBatchTotal = fileQueue.length;
    currentBatchProcessed = 0;
    currentBatchSuccessful = 0;
    currentBatchFiles = [];

    // Render/Update grid with all files in queue
    renderBentoGrid(fileQueue);

    const filesToProcess = [...fileQueue];
    fileQueue = [];

    const processingPromises = filesToProcess.map(async (file) => {
        updateCardStatus(file, 'processing', 'Unlocking...');

        const callbacks = {
            onStatus: (state, main, sub) => {
                // Update global status with current file info
                if (isQueueRunning) {
                    updateStatus('processing', `Unlocking (${currentBatchProcessed + 1}/${currentBatchTotal})`, `${file.name}: ${main}`);
                    updateCardStatus(file, 'processing', main);
                }
            }
        };

        try {
            const resultBlob = await pdfService.WorkerPool.enqueue(file, callbacks, { returnBlob: true });
            currentBatchProcessed++;
            if (resultBlob) {
                currentBatchSuccessful++;
                updateCardStatus(file, 'success', 'Unlocked');
                handleProcessedFile(resultBlob, file.name);
            } else {
                updateCardStatus(file, 'error', 'Failed');
            }
        } catch (error) {
            currentBatchProcessed++;
            console.error(`Queue: Failed to process ${file.name}:`, error);
            updateCardStatus(file, 'error', 'Error');
        }
    });

    await Promise.all(processingPromises);
    finalizeBatch();
}

function handleProcessedFile(blob, originalName) {
    const nameWithoutExt = originalName.toLowerCase().endsWith('.pdf') ? originalName.slice(0, -4) : originalName;
    const newFilename = `${nameWithoutExt}_unlocked.pdf`;

    currentBatchFiles.push({ blob, name: newFilename });
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

function showBatchOverlay() {
    const overlay = document.getElementById('batch-complete-overlay');
    const summaryText = document.getElementById('batch-summary-text');
    const zipBtn = document.getElementById('download-zip-btn');
    const zipWarning = document.getElementById('zip-warning');
    
    summaryText.textContent = `${currentBatchSuccessful} of ${currentBatchTotal} files successfully unlocked.`;
    
    // Check size limit for ZIP
    const totalSize = currentBatchFiles.reduce((acc, f) => acc + f.blob.size, 0);
    const isTooLarge = totalSize > batchService.MAX_ZIP_SIZE_BYTES;
    
    zipBtn.disabled = isTooLarge;
    zipWarning.classList.toggle('hidden', !isTooLarge);
    
    overlay.classList.remove('hidden');
    updateStatus('success', 'Batch Complete', 'Select your download preference.');
}

function hideBatchOverlay() {
    document.getElementById('batch-complete-overlay').classList.add('hidden');
}

async function finalizeBatch() {
    isQueueRunning = false;
    
    if (currentBatchFiles.length === 0) {
        if (currentBatchTotal > 0) {
             updateStatus('error', 'Batch Failed', 'Could not unlock any documents.');
        }
        resetState();
        return;
    }

    if (currentBatchFiles.length === 1) {
        // For single file, just download immediately
        const file = currentBatchFiles[0];
        triggerDownload(file.blob, file.name);
        updateStatus('success', 'Success!', `${file.name} is ready.`);
        currentBatchFiles = [];
        resetState();
    } else {
        // Show batch complete overlay for multiple files
        showBatchOverlay();
    }
}

// --- Overlay Event Listeners ---
document.getElementById('download-zip-btn').addEventListener('click', async () => {
    try {
        updateStatus('processing', 'Creating ZIP...', 'Packaging your files securely.');
        const zipBlob = await batchService.packageAsZip(currentBatchFiles);
        triggerDownload(zipBlob, 'Unlocked_PDFs.zip');
        hideBatchOverlay();
        currentBatchFiles = [];
        updateStatus('success', 'Downloaded!', 'Your ZIP archive is ready.');
        resetState();
    } catch (err) {
        console.error("ZIP Generation failed:", err);
        updateStatus('error', 'ZIP Error', err.message);
    }
});

document.getElementById('download-individual-btn').addEventListener('click', async () => {
    hideBatchOverlay();
    updateStatus('processing', 'Downloading...', 'Delivering files individually.');
    await batchService.processIndividually(currentBatchFiles, (file) => {
        triggerDownload(file.blob, file.name);
    });
    currentBatchFiles = [];
    updateStatus('success', 'Complete!', 'All files have been downloaded.');
    resetState();
});

document.getElementById('reset-batch-btn').addEventListener('click', () => {
    hideBatchOverlay();
    currentBatchFiles = [];
    bentoGrid.innerHTML = '';
    bentoGrid.classList.add('hidden');
    dropZone.classList.remove('compact');
    updateStatus('default', 'Awaiting Document', 'Drag & drop protected PDFs here, or click to browse');
});

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
const themeIcon = document.getElementById('theme-icon');
const rootElement = document.documentElement;
const themes = ['aurora', 'midnight', 'frost', 'ember'];

function setTheme(theme) {
    rootElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (themeIcon && SVGS[theme]) {
        setSvgContent(themeIcon, SVGS[theme]);
    }
}

const savedTheme = localStorage.getItem('theme');
const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

let currentThemePref = savedTheme;
if (!currentThemePref) {
    currentThemePref = systemPrefersDark ? 'midnight' : 'aurora';
} else if (currentThemePref === 'dark') {
    currentThemePref = 'midnight';
} else if (currentThemePref === 'light') {
    currentThemePref = 'aurora';
}

setTheme(currentThemePref);

themeToggle.addEventListener('click', () => {
    const activeTheme = rootElement.getAttribute('data-theme') || 'aurora';
    const currentIndex = themes.indexOf(activeTheme);
    const nextIndex = (currentIndex + 1) % themes.length;
    const nextTheme = themes[nextIndex];
    
    if (document.startViewTransition) {
        document.startViewTransition(() => setTheme(nextTheme));
    } else {
        setTheme(nextTheme);
    }
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
