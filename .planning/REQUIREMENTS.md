# 📋 Project Requirements - Phase 1: Engine Optimization

## 🛠️ Performance Requirements
- [x] **FR-1:** Move WASM engine to a dedicated **Web Worker** to ensure the main UI thread is never blocked during file processing.
- [x] **FR-2:** Implement **Streaming Initialization** (`instantiateStreaming`) for the WASM module to reduce time-to-first-processing.
- [x] **FR-3:** Update the Service Worker fetch strategy to **Cache-First** for versioned assets (WASM, JS libraries) to ensure fast load times and offline reliability.
- [x] **FR-4:** Add a **WASM Engine Ready State** in the UI to provide clear feedback when the engine is loading vs. ready to accept files.
- [x] **FR-5:** Maintain current **Security Standards** (SRI validation) during engine loading.

## 🎨 UI/UX Requirements
- [x] **UI-1:** Display a distinct "Loading Engine..." indicator in the drop zone during initial bootstrap.
- [x] **UI-2:** Transition to "Drop PDF Here" once the engine (Worker) reports it is initialized.
- [x] **UI-3:** Provide detailed error reporting if WASM fails to initialize (e.g., "Network Error", "WASM Blocked by CSP").

## 🔒 Security Requirements
- [x] **SEC-1:** Ensure the Web Worker also respects the Content Security Policy (CSP).
- [x] **SEC-2:** Validate subresource integrity (SRI) for the WASM binary.
- [x] **SEC-3:** All document processing MUST remain entirely in-memory or in the virtual MEMFS within the worker.

## 🧪 Testing Requirements
- [x] **TST-1:** Unit tests for `pdfWorker.js` (Worker logic and message protocol).
- [x] **TST-2:** Integration tests for `pdfService.js` and the UI -> Worker -> UI message flow.
- [x] **TST-3:** Performance benchmark comparing main-thread vs. worker-thread processing for large files (>50MB).

## 📦 Dependency Internalization (Phase 4)
- [x] **DEP-INT-01:** Host all engine dependencies locally in `assets/vendor/`.
- [x] **DEP-INT-02:** Load WASM and JS assets from local relative paths in workers.
- [x] **DEP-INT-03:** Pre-cache local vendor assets in Service Worker.
- [x] **DEP-INT-04:** Maintain SRI (Subresource Integrity) for all internalized assets.

## 💅 UX Polish & Batch Management (Phase 2)
- [x] **REQ-2.1:** Individual File Progress (Worker Pool + Progress events)
- [x] **REQ-2.2:** Advanced ZIP Options (Post-processing selector + Throttled downloads)
- [x] **REQ-2.3:** Drag-and-Drop Improvements (View Transitions API + Bento Grid cards)
- [x] **REQ-2.4:** Theme Customization (Aurora/Midnight/Frost/Ember theme implementation)

## 🚀 Performance Hardening (Phase 3)
- [x] **REQ-3.1:** Enable COOP/COEP Headers via Service Worker (Cross-Origin Isolation)
- [x] **REQ-3.2:** WorkerFS Migration (Zero-copy file mounting for WASM)
- [x] **REQ-3.3:** Memory Optimization (Buffer unlinking and heap management)
- [ ] **REQ-3.4:** Heavy Load UI Warnings (Scale-aware progress and batch limits)
