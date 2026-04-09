# 🌌 PDF Unlocker - Project Context

## 📖 Vision
PDF Unlocker is a high-performance, **zero-trust client-side** Progressive Web App (PWA) designed to remove restrictions from PDF files. It performs all processing locally in the browser using WebAssembly, ensuring that sensitive documents never leave the user's device.

The vision is to provide a seamless, private, and extremely fast "utility-belt" tool for document management that feels like a native desktop application but runs entirely in the browser.

## 🎯 Core Goals
- **Privacy First:** 100% client-side processing. No document is ever uploaded to a server.
- **Performance:** Instantaneous engine startup and non-blocking background processing.
- **Accessibility:** Easy to use for non-technical users, fully accessible via keyboard/screen readers.
- **Offline Capability:** Works perfectly without an internet connection once cached.
- **Scalability:** Handle batch processing of multiple files efficiently without crashing the browser.

## 🛠️ High-Level Tech Stack
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Engine:** `@neslinesli93/qpdf-wasm` (WASM port of QPDF).
- **Concurrency:** Web Workers for background processing.
- **Storage/Cache:** Service Workers (PWA) and Cache API.
- **Compression:** `jszip` for batch handling.

## 👥 Stakeholders
- **Users:** Individuals handling sensitive PDF documents who need to remove restrictions safely.
- **Developers:** AI agents and contributors maintaining the zero-trust architecture.
