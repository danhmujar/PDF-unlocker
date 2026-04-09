# 📋 Project Requirements - Phase 1: Engine Optimization

## 🛠️ Performance Requirements
- [x] **FR-1:** Move WASM engine to a dedicated **Web Worker** to ensure the main UI thread is never blocked during file processing.
- [ ] **FR-2:** Implement **Streaming Initialization** (`instantiateStreaming`) for the WASM module to reduce time-to-first-processing.
- [ ] **FR-3:** Update the Service Worker fetch strategy to **Cache-First** for versioned assets (WASM, JS libraries) to ensure fast load times and offline reliability.
- [ ] **FR-4:** Add a **WASM Engine Ready State** in the UI to provide clear feedback when the engine is loading vs. ready to accept files.
- [ ] **FR-5:** Maintain current **Security Standards** (SRI validation) during engine loading.

## 🎨 UI/UX Requirements
- [ ] **UI-1:** Display a distinct "Loading Engine..." indicator in the drop zone during initial bootstrap.
- [ ] **UI-2:** Transition to "Drop PDF Here" once the engine (Worker) reports it is initialized.
- [ ] **UI-3:** Provide detailed error reporting if WASM fails to initialize (e.g., "Network Error", "WASM Blocked by CSP").

## 🔒 Security Requirements
- [ ] **SEC-1:** Ensure the Web Worker also respects the Content Security Policy (CSP).
- [ ] **SEC-2:** Validate subresource integrity (SRI) for the WASM binary.
- [x] **SEC-3:** All document processing MUST remain entirely in-memory or in the virtual MEMFS within the worker.

## 🧪 Testing Requirements
- [x] **TST-1:** Unit tests for `pdfWorker.js` (Worker logic and message protocol).
- [ ] **TST-2:** Integration tests for `pdfService.js` and the UI -> Worker -> UI message flow.
- [ ] **TST-3:** Performance benchmark comparing main-thread vs. worker-thread processing for large files (>50MB).
