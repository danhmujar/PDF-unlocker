# ⚡ Performance Optimization Research

## 🔍 Initial Findings
The current implementation of PDF Unlocker initializes the QPDF WASM engine on the main thread during the initial load or lazily when the first file is dropped. This leads to a suboptimal user experience:
1.  **Network Overhead:** Initial load requires a synchronous-feeling fetch of ~20MB for the WASM module.
2.  **Main Thread Blocking:** Parsing and instantiating the WASM module on the UI thread can cause noticeable frame drops and unresponsiveness.
3.  **UI Silence:** The UI does not provide explicit feedback during the "warm-up" phase, leading users to believe the app is unresponsive.

## 🚀 Optimization Strategies

### 1. Web Workers
Moving all WASM-related logic (initialization, FS management, PDF processing) to a **Web Worker** is the most significant performance gain.
- **Why?** It isolates CPU-heavy tasks from the UI thread, ensuring 60fps responsiveness even during heavy decryption.
- **Implementation:** Create a `pdfWorker.js` that loads the WASM and communicates via `postMessage`.

### 2. Streaming Initialization
Currently, the app uses `fetch() -> arrayBuffer() -> instantiate()`.
- **Better:** Use `WebAssembly.instantiateStreaming(fetch(url))`.
- **Benefits:** The browser starts compiling the WASM while the bytes are still being downloaded, significantly reducing the "time-to-ready".
- **Security:** Must continue to support SRI checks (which can be tricky with streaming; may need to use `Response.clone()` or headers).

### 3. Service Worker Caching Strategy
The current fetch handler in `sw.js` is **Network-First**.
- **Issue:** Every load triggers a network check for the large WASM file.
- **Better:** **Cache-First** or **Stale-While-Revalidate** for versioned static assets (`.wasm`, `.js`).

### 4. Zero-Copy Data Transfer
When sending PDF data to the worker, use **Transferable Objects**.
- **Benefit:** `postMessage(data, [data.buffer])` transfers ownership of the memory, avoiding expensive structured cloning (copying) of large PDF buffers.

## 📝 Benchmark Baseline (Current V1)
- **Engine Initialization:** ~1200ms (Cold), ~300ms (Warm).
- **Decryption (10MB File):** ~800ms (Main thread blocked).
- **UI Responsiveness:** Blocked during WASM bootstrap and processing.
