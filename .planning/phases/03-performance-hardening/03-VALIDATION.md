# 🧪 Phase 3 Validation: Performance Hardening

This document outlines the validation protocol for Phase 3, focusing on Cross-Origin Isolation and Large File handling.

## 🏁 Success Criteria
- [ ] `window.crossOriginIsolated` is `true`.
- [ ] Network responses for local assets include COOP/COEP headers.
- [ ] PDF files up to 1GB can be processed without browser crashes.
- [ ] Peak memory usage for a 500MB file is < 700MB (WASM heap + Buffer).
- [ ] UI provides clear warnings for 1GB+ batches.

## 🛠️ Automated Test Suite

### 1. Network & Security Isolation
**Command:** `npx playwright test tests/e2e/network.spec.js`
- **Verifies:**
    - `Cross-Origin-Opener-Policy: same-origin` is present.
    - `Cross-Origin-Embedder-Policy: require-corp` is present.
    - `window.crossOriginIsolated` evaluates to `true`.

### 2. Large File Engine (WorkerFS)
**Command:** `npm test tests/pdfService.test.js`
- **Verifies:**
    - WorkerPool accepts `File` objects directly.
    - `WorkerFS` successfully mounts and reads files.
    - Decryption is successful for "large" mocks (100MB+).

### 3. Memory & Performance
**Command:** `npm test tests/perf.test.js`
- **Verifies:**
    - Worker unlinks MEMFS buffers after completion.
    - Sequential processing doesn't leak memory.

### 4. UI Feedback
**Command:** `npx playwright test tests/e2e/pwa_ui.spec.js`
- **Verifies:**
    - Auto-reload triggers on first load (if SW ready).
    - Heavy load warning appears for large drops.

## 🧪 Manual Verification Protocol

| Step | Action | Expected Result |
| :--- | :--- | :--- |
| 1 | Clear Site Data & Reload | SW installs, page reloads once, `crossOriginIsolated` becomes true. |
| 2 | Drop a 500MB+ PDF | Status shows "Large File Optimization active...", processing completes without tab crash. |
| 3 | Drop a batch totaling 1.2GB | Sub-status shows "Heavy Load Warning". |
| 4 | Inspect Memory (Chrome Task Manager) | During 500MB processing, memory peak is significantly lower than (2x file size). |

## 📊 Benchmarks
| Scenario | Baseline (P2) | Target (P3) |
| :--- | :--- | :--- |
| 200MB File RAM | ~450MB | ~250MB |
| 500MB File | Crash/OOM | Successful |
| 1GB Batch | Slow/Unstable | Warned + Robust |

---
*Date:* 2026-04-10
*Phase:* 03-performance-hardening
