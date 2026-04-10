/**
 * Presentation Layer
 * DOM references, SVG helpers, event listeners, theme toggle, and modal logic.
 * Depends on: pdfService.js (loaded first via classic script tag).
 */

/* global pdfService, JSZip */

// --- Cross-Origin Isolation Enforcement ---
// Enables high-performance features like SharedArrayBuffer by enforcing COOP/COEP via Service Worker.
// If not isolated but under SW control, reload once to apply injected headers.
if (!window.crossOriginIsolated && navigator.serviceWorker && navigator.serviceWorker.controller && !navigator.webdriver) {
    const isReloaded = sessionStorage.getItem('coi_reload_attempted');
    if (!isReloaded) {
        console.log("🔒 Enabling Cross-Origin Isolation (Reloading...)");
        sessionStorage.setItem('coi_reload_attempted', 'true');
        window.location.reload();
    } else {
        console.warn("⚠️ Cross-Origin Isolation failed to activate after reload.");
    }
} else if (window.crossOriginIsolated) {
    sessionStorage.removeItem('coi_reload_attempted');
}

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
    ember: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.99 7.99 0 0120 13a7.98 7.98 0 01-2.343 5.657z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.879 16.121A3 3 0 1012.015 11L11 14l.879 2.121z"></path>`,
    slate: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path>`,
    sage: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path>`,
    steel: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path>`,
    rose: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"></path>`,
    peach: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5"></path>`,
    lilac: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path>`
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
async function renderBentoGrid(files) {
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
                    <div class="file-details">
                        <span class="file-name" title="${file.name}">${file.name}</span>
                        <div class="file-hash hidden"></div>
                    </div>
                </div>
                <div class="file-meta">
                    <div class="file-status">Pending</div>
                    <div class="verified-badge hidden" title="Cryptographically Verified: This file was processed locally and its integrity confirmed via SHA-256.">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                        </svg>
                        <span>Verified</span>
                    </div>
                </div>
            `;
            bentoGrid.appendChild(card);
        });
    };

    if (document.startViewTransition) {
        const transition = document.startViewTransition(update);
        await transition.updateCallbackDone;
    } else {
        update();
    }
}

function updateCardStatus(file, state, text, hash = null) {
    const cardId = `file-${file.name.replace(/[^a-z0-9]/gi, '-')}-${file.size}`;
    const card = document.getElementById(cardId);
    if (!card) {
        console.warn(`Card not found for ID: ${cardId}`, file);
        console.log('DEBUG: Available IDs:', Array.from(document.querySelectorAll('[id]')).map(el => el.id));
        return;
    }

    console.log(`Updating card ${cardId} to state ${state}`);
    card.className = `file-card ${state}`;
    const statusEl = card.querySelector('.file-status');
    if (statusEl) statusEl.textContent = text;

    if (hash && state === 'success') {
        const hashEl = card.querySelector('.file-hash');
        if (hashEl) {
            hashEl.textContent = `SHA-256: ${hash.substring(0, 8)}...${hash.substring(hash.length - 8)}`;
            hashEl.title = hash;
            hashEl.classList.remove('hidden');
        }
        const badge = card.querySelector('.verified-badge');
        if (badge) badge.classList.remove('hidden');
    }
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
    await renderBentoGrid([...fileQueue]);

    const filesToProcess = [...fileQueue];
    fileQueue = [];

    const processingPromises = filesToProcess.map(async (file) => {
        updateCardStatus(file, 'processing', 'Unlocking...');

        const callbacks = {
            onStatus: (state, main, sub) => {
                // Update global status with current file info
                if (isQueueRunning) {
                    let displaySub = sub;
                    
                    // Task 2: Scale-aware feedback & Granular steps
                    if (file.size > 250 * 1024 * 1024) {
                        displaySub = `Large File Optimization active... ${sub}`;
                    }

                    if (sub.includes("Accessing file via WorkerFS")) {
                        displaySub = `Step 1/3: Mounting virtual filesystem (${(file.size / 1024 / 1024).toFixed(0)}MB)`;
                    } else if (sub.includes("Removing restrictions securely")) {
                        displaySub = "Step 2/3: Unlocking core...";
                    } else if (sub.includes("Preparing output")) {
                        displaySub = "Step 3/3: Finalizing memory...";
                    }

                    updateStatus('processing', `Unlocking (${currentBatchProcessed + 1}/${currentBatchTotal})`, `${file.name}: ${displaySub}`);
                    updateCardStatus(file, 'processing', main);
                }
            }
        };

        try {
            const result = await pdfService.WorkerPool.enqueue(file, callbacks, { returnBlob: true });
            currentBatchProcessed++;
            if (result && result.blob) {
                currentBatchSuccessful++;
                updateCardStatus(file, 'success', 'Unlocked', result.hash);
                handleProcessedFile(result.blob, file.name);
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

    // Heavy Load Detection
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > 1024 * 1024 * 1024) {
        updateStatus('processing', 'Heavy Load Detected', 'Processing 1GB+ may take several minutes. Ensure your browser tab remains active.');
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

// --- Theme Selection Logic (Vertical HUD) ---
const themeHud = document.getElementById('theme-hud');
const themeTrigger = document.getElementById('theme-trigger');
const themeRibbon = themeHud.querySelector('.theme-ribbon');
const rootElement = document.documentElement;

const meshThemes = ['aurora', 'midnight', 'frost', 'ember'];
const themeDefinitions = [
    { id: 'aurora', label: 'Aurora', group: 'mesh' },
    { id: 'midnight', label: 'Midnight', group: 'mesh' },
    { id: 'frost', label: 'Frost', group: 'mesh' },
    { id: 'ember', label: 'Ember', group: 'mesh' },
    { id: 'slate', label: 'Slate Blue', group: 'masculine' },
    { id: 'sage', label: 'Sage Green', group: 'masculine' },
    { id: 'steel', label: 'Steel Gray', group: 'masculine' },
    { id: 'rose', label: 'Dusty Rose', group: 'feminine' },
    { id: 'peach', label: 'Soft Peach', group: 'feminine' },
    { id: 'lilac', label: 'Gentle Lilac', group: 'feminine' }
];

let hudTimer;

function resetHudTimer() {
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => {
        themeHud.classList.remove('expanded');
    }, 5000);
}

function setTheme(themeId) {
    rootElement.setAttribute('data-theme', themeId);
    localStorage.setItem('theme', themeId);
    
    // Toggle solid-bg class on body
    if (!meshThemes.includes(themeId)) {
        document.body.classList.add('solid-bg');
    } else {
        document.body.classList.remove('solid-bg');
    }

    // Update active swatch
    document.querySelectorAll('.theme-swatch').forEach(sw => {
        sw.classList.toggle('active', sw.dataset.id === themeId);
    });

    // Auto-hide HUD after selection
    themeHud.classList.remove('expanded');
}

// Generate Swatches
function initThemeHud() {
    themeRibbon.innerHTML = '';
    themeDefinitions.forEach(theme => {
        const swatch = document.createElement('div');
        swatch.className = 'theme-swatch';
        swatch.dataset.id = theme.id;
        swatch.dataset.label = theme.label;
        
        // Inline styles for swatch colors (fallback to theme vars if needed)
        // Note: In a real app we'd grab these from a config or computed style
        const svgIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svgIcon.setAttribute("viewBox", "0 0 24 24");
        svgIcon.setAttribute("fill", "none");
        svgIcon.setAttribute("stroke", "currentColor");
        setSvgContent(svgIcon, SVGS[theme.id]);
        
        swatch.appendChild(svgIcon);
        
        swatch.addEventListener('click', () => {
            if (document.startViewTransition) {
                document.startViewTransition(() => setTheme(theme.id));
            } else {
                setTheme(theme.id);
            }
        });

        themeRibbon.appendChild(swatch);
    });

    // HUD Interactions
    themeTrigger.addEventListener('click', () => {
        themeHud.classList.toggle('expanded');
        if (themeHud.classList.contains('expanded')) resetHudTimer();
    });

    themeHud.addEventListener('mouseenter', () => clearTimeout(hudTimer));
    themeHud.addEventListener('mouseleave', () => {
        if (themeHud.classList.contains('expanded')) resetHudTimer();
    });

    // Initial load
    const savedTheme = localStorage.getItem('theme');
    let initialTheme = savedTheme || 'aurora';
    
    // Legacy support
    if (initialTheme === 'dark') initialTheme = 'midnight';
    if (initialTheme === 'light') initialTheme = 'aurora';

    setTheme(initialTheme);
    resetHudTimer();
}

initThemeHud();

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

// --- Audit Log Modal Logic ---
const viewAuditBtn = document.getElementById('view-audit-log-btn');
const auditModalBackdrop = document.getElementById('audit-modal-backdrop');
const auditModalClose = document.getElementById('audit-modal-close');
const auditLogBody = document.getElementById('audit-log-body');
const auditEmptyState = document.getElementById('audit-empty-state');

async function openAuditLog() {
    closeModal(); // Close About modal first
    auditModalBackdrop.classList.add('open');
    auditModalBackdrop.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
    auditModalClose.focus();

    await refreshAuditLog();
}

async function refreshAuditLog() {
    if (!window.auditService) return;

    try {
        const logs = await window.auditService.getLogs();
        auditLogBody.innerHTML = '';
        
        if (logs.length === 0) {
            auditEmptyState.classList.remove('hidden');
            return;
        }

        auditEmptyState.classList.add('hidden');
        
        // Sort logs descending by timestamp
        logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        logs.forEach(log => {
            const row = document.createElement('tr');
            const date = new Date(log.timestamp).toLocaleString();
            const type = log.type;
            const details = log.details || {};
            
            row.innerHTML = `
                <td>${date}</td>
                <td>${type === 'SUCCESS' ? 'Unlock' : 'Error'}</td>
                <td title="${details.file || 'Unknown'}">${details.file || 'Unknown'}</td>
                <td><span class="status-pill ${type.toLowerCase()}">${type}</span></td>
                <td>
                    <div class="hash-cell">
                        <code title="${details.hash || 'N/A'}">${details.hash ? details.hash.substring(0, 8) + '...' : 'N/A'}</code>
                        ${details.hash ? `
                            <button class="copy-hash-btn" data-hash="${details.hash}" title="Copy full SHA-256">
                                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path>
                                </svg>
                            </button>
                        ` : ''}
                    </div>
                </td>
            `;
            auditLogBody.appendChild(row);
        });

        // Add event listeners for copy buttons
        auditLogBody.querySelectorAll('.copy-hash-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const hash = e.currentTarget.dataset.hash;
                copyToClipboard(hash, e.currentTarget);
            });
        });
    } catch (err) {
        console.error("Failed to load audit logs:", err);
    }
}

function closeAuditModal() {
    auditModalBackdrop.classList.remove('open');
    auditModalBackdrop.setAttribute('aria-hidden', 'true');
    document.body.classList.add('modal-open'); // Stay modal-open if we might go back, but actually we should check if other modals are open
    
    // Check if about modal is somehow still open (shouldn't be)
    if (!modalBackdrop.classList.contains('open')) {
        document.body.classList.remove('modal-open');
    }
    aboutToggle.focus();
}

async function copyToClipboard(text, element) {
    try {
        await navigator.clipboard.writeText(text);
        const originalHtml = element.innerHTML;
        element.innerHTML = '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        element.classList.add('copied');
        setTimeout(() => {
            element.innerHTML = originalHtml;
            element.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

viewAuditBtn.addEventListener('click', openAuditLog);
auditModalClose.addEventListener('click', closeAuditModal);

// Close modal when clicking outside
auditModalBackdrop.addEventListener('click', (e) => {
    if (e.target === auditModalBackdrop) closeAuditModal();
});

// Close modal on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && auditModalBackdrop.classList.contains('open')) {
        closeAuditModal();
    }
});

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

// --- Connectivity Monitoring ---
const offlineIndicator = document.getElementById('offline-indicator');

function updateOnlineStatus() {
    if (navigator.onLine) {
        offlineIndicator.classList.add('hidden');
    } else {
        offlineIndicator.classList.remove('hidden');
    }
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Initial check
updateOnlineStatus();
