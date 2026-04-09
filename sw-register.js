if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('Service Worker registered', reg);

                // Check if a new version is already waiting (on page load)
                if (reg.waiting) {
                    showUpdateToast();
                }

                // Listen for new version arrival
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New version is installed and ready to take over
                            showUpdateToast();
                        }
                    });
                });
            })
            .catch(err => console.log('Service Worker registration failed', err));
    });

    // Handle controller change (reloads the page once the new SW takes over)
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            refreshing = true;
            window.location.reload(true); // Hard refresh
        }
    });
}

function showUpdateToast() {
    const toast = document.getElementById('update-toast');
    const refreshBtn = document.getElementById('refresh-btn');

    if (toast && refreshBtn) {
        toast.classList.remove('hidden');
        refreshBtn.onclick = () => {
            // Tell the waiting worker to skipWaiting and take over
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg && reg.waiting) {
                    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                } else {
                    // Fallback for edge cases
                    window.location.reload(true);
                }
            });
        };
    }
}
