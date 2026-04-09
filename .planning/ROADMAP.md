# 🗺️ Project Roadmap - PDF Unlocker v2.0

## 🚦 Status Summary
- **Phase 1 (Optimization):** 🛠️ Planned (5 plans)
- **Phase 2 (UX Polish):** ⏳ Upcoming
- **Phase 3 (Enterprise):** ⏳ Backlog

---

## Phase 1: Engine Optimization & Worker Migration 🛠️
**Goal:** Remove main-thread blocking and provide instant feedback during engine bootstrap.

**Plans:** 2/5 plans executed

- [x] 01-01-PLAN.md — Web Worker Infrastructure & Foundation
- [x] 01-02-PLAN.md — Streaming WASM Loading & SRI
- [ ] 01-03-PLAN.md — UI Engine Ready State & SW Cache Optimization
- [ ] 01-04-PLAN.md — Performance Benchmarking & Integration
- [ ] 01-05-PLAN.md — Main Thread Proxy & UI Integration

### ✅ Tasks
- [x] **1.1 Web Worker Infrastructure** (Plan 01)
    - [x] Create `services/pdfWorker.js`.
    - [x] Implement core worker logic (message handling, QPDF calls).
- [x] **1.2 Streaming WASM Loading** (Plan 02)
    - [x] Refactor `initWasm` to use `WebAssembly.instantiateStreaming`.
    - [x] Implement robust error handling for CSP and network failures in the Worker context.
- [ ] **1.3 UI State Management** (Plan 03)
    - [ ] Implement "Engine Loading" UI state in `ui/app.js`.
    - [ ] Transition state only after the Worker signals a "READY" event.
- [ ] **1.4 Service Worker Cache Strategy** (Plan 03)
    - [ ] Update `sw.js` fetch listener to prioritize Cache-First for `.wasm` and `.js` dependencies.
- [ ] **1.5 Performance Benchmarking** (Plan 04)
    - [ ] Create a benchmark script `tests/perf_test.js` to compare V1 vs V2 engine performance.
- [ ] **1.6 Main Thread Proxy & UI Integration** (Plan 05)
    - [ ] Refactor `pdfService.js` to act as a light wrapper (Proxy/Client) for the Worker.
    - [ ] Handle message passing (Blob transfer vs. copying).

### 🏁 Success Criteria
- Engine initializes < 500ms on repeat visits (cached).
- Drop zone displays "Loading engine..." if initialization takes > 100ms.
- Main UI remains responsive (60fps) during heavy PDF decryption tasks.

---

## Phase 2: UX Polish & Batch Management ⏳
*Goal: Provide enterprise-level feedback for batch processing.*

### ✅ Tasks
- [ ] **2.1 Individual File Progress**
    - [ ] Update `ui/app.js` to show specific status for each file in the batch.
- [ ] **2.2 Advanced ZIP Options**
    - [ ] Allow users to choose between individual downloads or a ZIP file.
- [ ] **2.3 Drag-and-Drop Improvements**
    - [ ] Add animations for file drop events using Bento Grid transitions.
- [ ] **2.4 Theme Customization**
    - [ ] Add more themes beyond Light/Dark (Aurora, Glassmorphism variants).

---

## Phase 3: Enterprise & Security Features ⏳
*Goal: Expand utility while maintaining strict zero-trust principles.*

### ✅ Tasks
- [ ] **3.1 Encrypted PDF Support**
    - [ ] Support password-protected files via prompt.
- [ ] **3.2 PDF Metadata Editor**
    - [ ] Allow viewing and optionally scrubbing sensitive metadata (Author, Software, etc.) before save.
- [ ] **3.3 Desktop App (Electron/Tauri)**
    - [ ] Wrap the PWA into a standalone desktop application for easier access.
