const CACHE_NAME = 'pdf-unlocker-v5';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './ui/styles.css',
    './ui/app.js',
    './services/pdfService.js',
    './favicon.svg',
    './assets/vendor/jszip.min.js',
    './assets/vendor/qpdf/qpdf.js',
    './assets/vendor/qpdf/qpdf.wasm',
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@500;600;700&display=swap'
];

// Install Event - Caching basic assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

// Activate Event - Cleaning up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    return caches.delete(key);
                }
            }));
        })
    );
    self.clients.claim();
});

// Handle messages from the client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Function to add COOP/COEP headers for Cross-Origin Isolation
function addCOIHeaders(response) {
    if (!response || response.type === 'opaque') {
        return response;
    }

    const newHeaders = new Headers(response.headers);
    newHeaders.set('Cross-Origin-Embedder-Policy', 'require-corp');
    newHeaders.set('Cross-Origin-Opener-Policy', 'same-origin');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders
    });
}

// Fetch Event - Optimized Cache Strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Only intercept GET requests
    if (event.request.method !== 'GET') return;

    // Cache-First for local vendor assets (highly stable)
    const isVendorAsset = url.pathname.includes('/assets/vendor/');

    if (isVendorAsset) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return addCOIHeaders(cachedResponse);
                }
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return addCOIHeaders(networkResponse);
                    });
                });
            })
        );
    } else {
        // Default: Network-First Strategy for app shell and non-versioned assets
        event.respondWith(
            fetch(event.request).then((networkResponse) => {
                // Update cache with fresh response for successful fetches
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return addCOIHeaders(networkResponse);
            }).catch(() => {
                // Network unavailable — serve from cache (offline mode)
                return caches.match(event.request).then(response => addCOIHeaders(response));
            })
        );
    }
});
