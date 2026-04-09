# 🧪 Phase 1 Validation Plan: Engine Optimization & Worker Migration

This document outlines the validation strategy for Phase 1, ensuring all performance, security, and functional requirements are met through a combination of automated testing and manual verification.

## 📋 Requirements Mapping

| ID | Requirement | Plan | Verification Method | Status |
|----|-------------|------|---------------------|--------|
| **FR-1** | Move WASM engine to a dedicated Web Worker | 01-01 | Automated (TST-1) + Manual (DevTools) | 🔄 PENDING |
| **FR-2** | Implement Streaming Initialization | 01-02 | Manual (Network Tab / Console) | 🔄 PENDING |
| **FR-3** | Update SW strategy to Cache-First | 01-03 | Manual (Application Tab) | 🔄 PENDING |
| **FR-4** | Add WASM Engine Ready State in UI | 01-03 | Manual (UI Observation) | 🔄 PENDING |
| **FR-5** | Maintain Security Standards (SRI) during loading | 01-02 | Automated (TST-1) + Manual | 🔄 PENDING |
| **UI-1** | "Loading Engine..." indicator in drop zone | 01-03 | Manual (UI Observation) | 🔄 PENDING |
| **UI-2** | Transition to "Drop PDF Here" when ready | 01-03 | Manual (UI Observation) | 🔄 PENDING |
| **UI-3** | Detailed error reporting if WASM fails | 01-02 | Manual (Console/UI Audit) | 🔄 PENDING |
| **SEC-1** | Ensure Worker CSP compliance | 01-04 | Manual (Console Auditing) | 🔄 PENDING |
| **SEC-2** | Validate SRI for WASM binary | 01-02 | Automated (TST-1) + Manual (Corruption Test) | 🔄 PENDING |
| **SEC-3** | Document processing remains in-memory/MEMFS | 01-01 | Automated (TST-1) + Manual Audit | 🔄 PENDING |
| **TST-1** | Create `tests/pdfWorker.test.js` | 01-01 | Automated (`npm test tests/pdfWorker.test.js`) | 🔄 PENDING |
| **TST-2** | Integration tests for UI -> Worker -> UI | 01-05 | Automated (`npm test tests/pdfService.test.js`) | 🔄 PENDING |
| **TST-3** | Create `tests/perf_test.js` | 01-04 | Automated (`node tests/perf_test.js`) | 🔄 PENDING |

---

## 🤖 Automated Testing

### TST-1: Worker Logic Isolation (`tests/pdfWorker.test.js`)
- **Goal:** Verify the internal logic of the worker (message handling, QPDF calls) without a full browser environment.
- **Scope:**
    - Initialization success/failure.
    - Message protocol adherence ({ type, payload }).
    - Error propagation.
- **Command:** `npx vitest tests/pdfWorker.test.js`

### TST-2: Main-Thread Proxy (`tests/pdfService.test.js`)
- **Goal:** Ensure `pdfService.js` correctly manages the Worker lifecycle and proxies calls.
- **Scope:**
    - Worker instantiation.
    - Transferable object support (ArrayBuffer handling).
    - Callback mapping (onStatus).
- **Command:** `npx vitest tests/pdfService.test.js`

### TST-3: Performance Benchmark (`tests/perf_test.js`)
- **Goal:** Quantify the performance impact and ensure main-thread responsiveness.
- **Success Criteria:**
    - Main thread frame rate remains at ~60fps during processing.
    - Worker processing time for a 10MB PDF is compared to previous main-thread performance.
- **Command:** `node tests/perf_test.js`

---

## 🛠️ Manual Verification Steps

### 1. Web Worker Isolation (FR-1)
1. Open Browser DevTools.
2. Navigate to the **Sources** or **Debugger** tab.
3. Verify `pdfWorker.js` appears under a "Threads" or "Worker" section.
4. Set a breakpoint in `pdfWorker.js` and verify it hits during PDF processing.

### 2. Streaming & SRI (FR-2, SEC-2, FR-5)
1. Open the **Network** tab.
2. Reload the page and locate the `qpdf.wasm` request.
3. Verify the "Type" is `wasm` and look for streaming indicators (e.g., download and compilation happen concurrently).
4. **SRI Test:** Temporarily modify the SRI hash in `pdfWorker.js`.
5. Verify the console shows an "Integrity" error and the engine fails to load.

### 3. Service Worker Cache-First (FR-3)
1. Open **Application** > **Service Workers**.
2. Verify the Service Worker is active and controlling the page.
3. Reload the page and check the **Network** tab.
4. Confirm `qpdf.wasm` and `qpdf.js` (from unpkg) show "(ServiceWorker)" in the **Size** or **Time** column.

### 4. UI Engine Ready State & Error Reporting (FR-4, UI-1, UI-2, UI-3)
1. Throttle the network to "Slow 3G" in DevTools.
2. Reload the page.
3. Verify the drop zone displays "Loading engine..." immediately.
4. Verify the drop zone transitions to "Awaiting Document" only after the Worker is ready.
5. **Error Test:** Trigger a load failure (e.g., block unpkg.com).
6. Verify a detailed error message is displayed (UI-3).

### 5. CSP Compliance & MEMFS (SEC-1, SEC-3)
1. Check the **Console** for any `Content-Security-Policy` violations.
2. Specifically look for `worker-src` or `wasm-unsafe-eval` errors.
3. Verify that the app functions correctly with the CSP headers defined in `index.html`.
4. Audit `pdfWorker.js` to ensure no disk persistence is used.

---

## 📈 Final Validation Results

| Task ID | Requirement | Test File / Command | Result |
|---------|-------------|---------------------|--------|
| 1.1 | FR-1 | `tests/pdfWorker.test.js` | |
| 1.1 | TST-1 | `tests/pdfWorker.test.js` | |
| 1.1 | SEC-3 | Manual Audit | |
| 1.2 | FR-2 | Manual (DevTools) | |
| 1.2 | SEC-2 | Manual (SRI Corruption) | |
| 1.2 | FR-5 | Manual (Network Check) | |
| 1.2 | UI-3 | Manual (Error Trigger) | |
| 1.3 | FR-3 | Manual (SW Inspection) | |
| 1.3 | FR-4 | Manual (UI Observation) | |
| 1.3 | UI-1 | Manual (Slow 3G) | |
| 1.3 | UI-2 | Manual (State Check) | |
| 1.4 | TST-3 | `tests/perf_test.js` | |
| 1.4 | SEC-1 | Manual (CSP Audit) | |
| 1.5 | TST-2 | `tests/pdfService.test.js` | |

**Overall Status:** 🔄 IN PROGRESS
**Verified By:** [Agent Name/ID]
**Date:** 2026-04-09
