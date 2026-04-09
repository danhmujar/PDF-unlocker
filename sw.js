const CACHE_NAME = 'pdf-unlocker-v3';
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
            console.log('[Service Worker] Caching all: app shell and content');
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
    self.skipWaiting();
});

// Activate Event - Cleaning up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keyList) => {
            return Promise.all(keyList.map((key) => {
                if (key !== CACHE_NAME) {
                    console.log('[Service Worker] Removing old cache', key);
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

// Fetch Event - Optimized Cache Strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Cache-First for local vendor assets (highly stable)
    const isVendorAsset = url.pathname.includes('/assets/vendor/');

    if (isVendorAsset) {
        event.respondWith(
            caches.match(event.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                return fetch(event.request).then((networkResponse) => {
                    return caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, networkResponse.clone());
                        return networkResponse;
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
                return networkResponse;
            }).catch(() => {
                // Network unavailable — serve from cache (offline mode)
                return caches.match(event.request);
            })
        );
    }
});
