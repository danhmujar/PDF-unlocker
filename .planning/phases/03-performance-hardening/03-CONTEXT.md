# 🌌 Phase 3 Context: Performance Hardening

## 🎯 High-Level Goal
Optimize the PDF Unlocker for "Pro" use cases, specifically handling large files (>500MB) without browser crashes and improving processing speed through environmental hardening.

## 🛠️ Implementation Decisions

### 1. Memory Management (WorkerFS)
- **Decision:** Use Emscripten's `WorkerFS` to mount input `File` objects directly into the worker's virtual file system.
- **Rationale:** Current `MEMFS` copies files into the WASM heap, doubling memory usage. `WorkerFS` allows QPDF to read directly from the browser's file blob, reducing peak RAM usage by ~90% for large files.
- **Impact:** Enables 500MB+ file support on standard consumer devices.

### 2. Security Headers (COOP/COEP)
- **Decision:** Implement a Service Worker-based header injection strategy to enable `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- **Rationale:** These headers are required to unlock `SharedArrayBuffer` and high-performance timers. Using the SW approach ensures compatibility across different hosting environments (Netlify, Vercel, Local) without server-specific config.

### 3. Batch Processing & ZIP Limits
- **Decision:** Introduce a "Heavy Load" warning when the total batch size exceeds 1GB.
- **Rationale:** `jszip` and the browser's download manager have limits. For extremely large batches, individual downloads (via the existing `batchService`) are more reliable than single massive ZIPs.

### 4. Multithreading
- **Decision:** Stick to the current `WorkerPool` parallelization.
- **Rationale:** Parallel processing of multiple files provides the best perceived performance for users. Single-threaded WASM for individual files is acceptable once memory bottlenecks are removed via WorkerFS.

## 🚧 Known Constraints
- **Browser Compatibility:** `WorkerFS` is widely supported in modern browsers but requires specific worker-side initialization.
- **Security:** COOP/COEP headers will prevent loading any cross-origin assets unless they explicitly allow it (though the project is currently 100% self-contained, so this is low risk).
