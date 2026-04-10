/**
 * Audit Service
 * Persistent logging for PDF processing events using IndexedDB.
 */

window.auditService = (function () {
    const DB_NAME = 'PDF_UNLOCKER_DB';
    const STORE_NAME = 'logs';
    const DB_VERSION = 1;

    let db = null;

    /**
     * Initialize the database.
     * @returns {Promise<IDBDatabase>}
     */
    function initDB() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);

            // In some test environments, indexedDB might not be present on window
            const idb = window.indexedDB || indexedDB;
            if (!idb) {
                return reject(new Error("IndexedDB not supported"));
            }

            const request = idb.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (event) => {
                const dbInstance = event.target.result;
                if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
                    dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onerror = (event) => {
                console.error("AuditService: Database error", event.target.error);
                reject(event.target.error);
            };
        });
    }

    /**
     * Log an event to IndexedDB.
     * @param {string} type - 'INFO' | 'SUCCESS' | 'ERROR'
     * @param {object} details - Event metadata
     */
    async function logEvent(type, details) {
        try {
            const dbInstance = await initDB();
            const transaction = dbInstance.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);

            const entry = {
                timestamp: new Date().toISOString(),
                type,
                details
            };

            return new Promise((resolve, reject) => {
                const request = store.add(entry);
                request.onsuccess = () => resolve();
                request.onerror = (event) => reject(event.target.error);
                transaction.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error("AuditService: Failed to log event", error);
            // Non-blocking error
        }
    }

    /**
     * Retrieve all logs from IndexedDB.
     * @returns {Promise<Array>}
     */
    async function getLogs() {
        try {
            const dbInstance = await initDB();
            const transaction = dbInstance.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            return new Promise((resolve, reject) => {
                request.onsuccess = () => resolve(request.result);
                request.onerror = (event) => reject(event.target.error);
            });
        } catch (error) {
            console.error("AuditService: Failed to get logs", error);
            return [];
        }
    }

    return {
        logEvent,
        getLogs
    };
})();
