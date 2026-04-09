# 🌌 PDF Unlocker - Project Context

This document provides a comprehensive overview of the PDF Unlocker project to assist AI agents in understanding the codebase, architecture, and development workflows.

## 📖 Project Overview
PDF Unlocker is a high-performance, **zero-trust client-side** Progressive Web App (PWA) designed to remove restrictions from PDF files. It performs all processing locally in the browser using WebAssembly, ensuring that sensitive documents never leave the user's device.

- **Primary Goal:** Provide a secure, private, and fast way to decrypt PDF files.
- **Key Features:**
    - Local decryption using `qpdf` via WebAssembly.
    - Batch processing (up to 20 files).
    - Intelligent output: Single file download or automatic ZIP creation for batches.
    - Offline-first capability via Service Workers.
    - Responsive, theme-aware UI (Dark/Light mode).

## 🛠️ Technology Stack
- **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3.
- **Core Engine:** `@neslinesli93/qpdf-wasm` (WebAssembly port of QPDF).
- **Compression:** `jszip` for batch ZIP generation.
- **Testing:** `Vitest` with `JSDOM`.
- **Infrastructure:** Service Workers for PWA support.

## 🏗️ Architecture (2-Tier Client-Side)
The project follows a strict separation between the presentation and business logic layers.

### 1. Presentation Layer (`ui/`)
- **`ui/app.js`**: Handles DOM manipulation, event listeners (Drag & Drop, Click), UI state management (status indicators, spinners), and the **Queue Manager** for batch processing.
- **`ui/styles.css`**: Contains all styling, including theme definitions and responsive layouts.
- **`index.html`**: The main entry point, defining the UI structure and security headers (CSP).

### 2. Business Logic Layer (`services/`)
- **`services/pdfService.js`**: Encapsulates the WebAssembly engine.
    - **WASM Initialization:** Manages the lifecycle and security (SRI validation) of the QPDF module.
    - **Validation:** Performs magic-byte checks (`%PDF`) and file size validation.
    - **Processing:** Orchestrates the virtual filesystem (MEMFS) and executes `qpdf --decrypt`.

## 🚀 Key Commands
| Command | Description |
| :--- | :--- |
| `npm test` | Runs the Vitest suite (unit and integration tests). |
| `npm run lint` | *(TODO: Add ESLint/Prettier script)* |
| `npm run build` | *(N/A: This is a buildless vanilla project)* |

## 📏 Development Conventions
- **Indentation:** 4 spaces.
- **Naming:** 
    - `camelCase` for JavaScript files and functions.
    - `kebab-case` for CSS/HTML files.
    - `UPPER_SNAKE_CASE` for configuration constants (e.g., `MAX_FILE_SIZE_MB`).
- **Patterns:** 
    - **Revealing Module Pattern (IIFE):** Used in `pdfService.js` to encapsulate private state.
    - **Callback-based Updates:** Services communicate status back to the UI via `onStatus` callbacks.
    - **Security:** Strict Content Security Policy (CSP) and Subresource Integrity (SRI) for external dependencies.
- **Testing:** New features or bug fixes should include corresponding tests in the `tests/` directory.

## 📂 Directory Structure
```text
C:\Users\Danh Mujar\Desktop\test\PDF Unlocker\
├── services/          # Business logic & WASM orchestration
│   └── pdfService.js  # Core PDF processing engine
├── ui/                # Presentation layer
│   ├── app.js         # UI logic & Queue management
│   └── styles.css     # Styling & Themes
├── tests/             # Vitest test suites
├── sw.js              # Service Worker (PWA)
├── index.html         # Main entry point
├── manifest.json      # PWA metadata
└── .planning/         # Detailed codebase documentation
```

## ⚠️ Known Constraints & Concerns
- **WASM Security:** Some browser configurations or corporate policies may block `wasm-unsafe-eval`.
- **Memory Limits:** Batch processing is limited to ~150MB total for ZIP generation to prevent browser crashes.
- **Single Threaded:** WASM processing happens on the main thread; the UI uses spinners to maintain responsiveness.

---
*Last updated: April 9, 2026*
