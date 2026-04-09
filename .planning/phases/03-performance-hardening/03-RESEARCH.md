# Phase 3: Performance Hardening (Large File Support) - Research

**Researched:** 2026-04-10
**Domain:** WASM Memory Management, Cross-Origin Isolation, Browser Filesystems
**Confidence:** HIGH

## Summary

This research establishes the implementation path for Phase 3, focusing on removing memory bottlenecks and enabling high-performance browser features. The primary shift is from `MEMFS` (in-memory copying) to `WorkerFS` (direct mounting), which reduces peak memory usage by approximately 50-90% for large files. To support advanced isolation and future multithreading, Cross-Origin Opener Policy (COOP) and Cross-Origin Embedder Policy (COEP) will be enforced via a Service Worker "intercept-and-inject" pattern.

**Primary recommendation:** Implement `WorkerFS` for zero-copy input mounting and merge the `coi-serviceworker` header injection pattern into the existing `sw.js`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Memory Management (WorkerFS):** Use Emscripten's `WorkerFS` to mount input `File` objects directly into the worker's virtual file system. Rationale: Reduces peak RAM usage by ~90% for large files.
- **Security Headers (COOP/COEP):** Implement a Service Worker-based header injection strategy to enable `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`.
- **Batch Processing & ZIP Limits:** Introduce a "Heavy Load" warning when the total batch size exceeds 1GB.
- **Multithreading:** Stick to the current `WorkerPool` parallelization. Single-threaded WASM for individual files is acceptable once memory bottlenecks are removed.

### the agent's Discretion
- **Implementation of SW logic:** Choosing whether to use a separate file or merge into `sw.js`.
- **UI design for "Heavy Load" warnings:** Exact placement and wording.

### Deferred Ideas (OUT OF SCOPE)
- **Multi-threaded WASM per file:** Not required for this phase.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-3.1 | Enable COOP/COEP Headers via Service Worker | Verified the "intercept-and-inject" pattern compatible with `sw.js`. |
| REQ-3.2 | Implement WorkerFS for direct file mounting in WASM | Verified syntax for `FS.mount` and availability of `WORKERFS` in `qpdf.js`. |
| REQ-3.3 | Optimize buffer handling for 500MB+ files | identified peak memory reduction strategy via zero-copy input and immediate MEMFS unlinking. |
| REQ-3.4 | Implement "Heavy Load" UI warnings for 1GB+ batches | identified UI integration points in `app.js` and `batchService.js`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Emscripten WorkerFS | v3.1+ | Direct Blob/File mounting | Industry standard for large file WASM processing without memory copies. |
| COOP/COEP Headers | — | Cross-Origin Isolation | Required for `SharedArrayBuffer` and high-res timers. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|--------------|
| `coi-serviceworker` | Pattern | SW-side header injection | Use for static hosting where server headers cannot be configured. |

## Architecture Patterns

### Recommended Project Structure
*No changes to structure, logic remains in `sw.js` and `pdfWorker.js`.*

### Pattern 1: WorkerFS Zero-Copy Input
**What:** Mounting a `File` or `Blob` handle directly into the WASM virtual filesystem.
**When to use:** Any time the input file exceeds 10MB to prevent doubling memory in the heap.
**Example:**
```javascript
// Inside pdfWorker.js
async function processFile(file, fileName) {
    // 1. Setup mount point (once)
    if (!FS.analyzePath('/mnt').exists) FS.mkdir('/mnt');
    
    // 2. Mount the File object
    FS.mount(WORKERFS, { files: [file] }, '/mnt');
    
    // 3. QPDF reads from '/mnt/' + file.name
    Module.callMain(["--decrypt", `/mnt/${file.name}`, "output.pdf"]);
    
    // 4. Cleanup
    FS.unmount('/mnt');
}
```

### Pattern 2: COOP/COEP Interceptor (Service Worker)
**What:** Injecting headers into every response to unlock Cross-Origin Isolation.
**How:** Intercepting `fetch` events in `sw.js` and recreating the `Response` with additional headers.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cross-Origin Isolation | Manual server config | Service Worker Injection | Essential for portable PWAs on GitHub Pages/Netlify. |
| Large File Reading | Chunked manual streaming | Emscripten WorkerFS | WorkerFS handles internal buffering and synchronous C++ I/O automatically. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `WORKERFS` | REQ-3.2 | ✓ | Emscripten | MEMFS (current) |
| `SharedArrayBuffer` | Hardening | ✓ | Chrome/Edge/FF | — |
| Service Worker | REQ-3.1 | ✓ | Modern Browsers | — |

**Note on WORKERFS:** `grep` confirms `WORKERFS` is linked in `assets/vendor/qpdf/qpdf.js`.

## Common Pitfalls

### Pitfall 1: Service Worker Reload Loop
**What goes wrong:** The page registers the SW, reloads to apply headers, but if not coded correctly, reloads infinitely.
**How to avoid:** Only reload if `window.crossOriginIsolated` is false **and** a controller is already active or newly installed.

### Pitfall 2: WorkerFS Name Collisions
**What goes wrong:** Mounting a file to `/mnt` when a file with the same name already exists in the same mount.
**How to avoid:** Always `unmount` after every processing task.

### Pitfall 3: Large File Output Copies
**What goes wrong:** Even with `WorkerFS` for input, reading the output via `FS.readFile()` creates a copy.
**How to avoid:** Ensure the output file is `unlinked` from MEMFS immediately after being converted to a transferable `ArrayBuffer`.

## Code Examples

### COOP/COEP Injection in `sw.js`
```javascript
// Source: https://github.com/gzguidoti/coi-serviceworker/blob/main/coi-serviceworker.js
self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.status === 0 || response.type === 'opaque') return response;

                const newHeaders = new Headers(response.headers);
                newHeaders.set("Cross-Origin-Embedder-Policy", "require-corp");
                newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");

                return new Response(response.body, {
                    status: response.status,
                    statusText: response.statusText,
                    headers: newHeaders,
                });
            })
            .catch(() => caches.match(event.request))
    );
});
```

### Browser-side COI Check (`ui/app.js`)
```javascript
if (!window.crossOriginIsolated && navigator.serviceWorker) {
    // Check if we just installed the SW
    navigator.serviceWorker.ready.then(() => {
        if (!window.crossOriginIsolated) {
             // Optional: Show "Hardening security..." toast before reload
             location.reload();
        }
    });
}
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest + Playwright |
| Config file | `vitest.config.mjs`, `playwright.config.js` |
| Quick run command | `npx playwright test --reporter=line` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command |
|--------|----------|-----------|-------------------|
| REQ-3.1 | Headers present in network trace | E2E (Playwright) | `npx playwright test tests/e2e/network.spec.js` |
| REQ-3.2 | Successful decrypt of 100MB+ file | Integration | `npm test tests/pdfService.test.js` |
| REQ-3.3 | No OOM crash on 500MB file | Smoke/Manual | `npm test tests/perf.test.js` (Mocked) |
| REQ-3.4 | Warning visible on 1GB+ drop | E2E | `npx playwright test tests/e2e/batch.spec.js` |

## Sources

### Primary (HIGH confidence)
- Emscripten Official Docs - [Filesystem API: WORKERFS](https://emscripten.org/docs/api_reference/Filesystem_API.html#workerfs)
- MDN Web Docs - [Cross-Origin Isolation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cross-Origin-Embedder-Policy)
- `coi-serviceworker` - [Implementation Reference](https://github.com/gzguidoti/coi-serviceworker)

## Metadata
**Confidence breakdown:**
- Standard stack: HIGH - Core browser features and Emscripten standard FS.
- Architecture: HIGH - Zero-copy handles are well-documented for Workers.
- Pitfalls: MEDIUM - SW reload loops are tricky to debug in all browsers.

**Research date:** 2026-04-10
**Valid until:** 2026-05-10
