import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const persistenceServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/persistenceService.js'), 'utf8');

describe('PersistenceService', () => {
    let persistenceService;
    let mockDb;
    let mockStore;
    let mockTransaction;
    let mockIndex;

    beforeEach(() => {
        mockIndex = {
            openCursor: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null, result: null };
                setTimeout(() => {
                    if (req.onsuccess) req.onsuccess({ target: { result: null } });
                }, 0);
                return req;
            }),
            getAll: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null, result: [] };
                setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                }, 0);
                return req;
            }),
        };

        mockStore = {
            add: vi.fn().mockImplementation((data) => {
                const req = { onsuccess: null, onerror: null, result: 1 };
                setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                }, 0);
                return req;
            }),
            get: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null, result: {} };
                setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                }, 0);
                return req;
            }),
            put: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null, result: 1 };
                setTimeout(() => {
                    if (req.onsuccess) req.onsuccess();
                }, 0);
                return req;
            }),
            index: vi.fn().mockReturnValue(mockIndex),
            createIndex: vi.fn(),
        };

        mockTransaction = {
            objectStore: vi.fn().mockReturnValue(mockStore),
            oncomplete: null,
            onerror: null,
        };

        mockDb = {
            transaction: vi.fn().mockReturnValue(mockTransaction),
            objectStoreNames: {
                contains: vi.fn().mockReturnValue(true),
            },
            createObjectStore: vi.fn().mockReturnValue(mockStore),
        };

        const mockIndexedDB = {
            open: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null, onupgradeneeded: null, result: mockDb };
                setTimeout(() => {
                    if (req.onsuccess) {
                        req.onsuccess({ target: { result: mockDb } });
                    }
                }, 0);
                return req;
            }),
        };

        vi.stubGlobal('indexedDB', mockIndexedDB);
        vi.stubGlobal('IDBKeyRange', {
            only: vi.fn().mockReturnValue('mock-range')
        });

        // Evaluate the service code
        const mockWindow = { indexedDB: mockIndexedDB };
        const fn = new Function('window', persistenceServiceContent);
        fn(mockWindow);
        persistenceService = mockWindow.persistenceService;
    });

    it('should create a job', async () => {
        const jobId = await persistenceService.createJob({ totalFiles: 5 });
        expect(jobId).toBe(1);
        expect(mockStore.add).toHaveBeenCalledWith(expect.objectContaining({
            status: 'pending',
            totalFiles: 5,
            processedCount: 0
        }));
    });

    it('should update a job', async () => {
        mockStore.get.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null, result: { id: 1, status: 'pending' } };
            setTimeout(() => {
                if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
        });

        await persistenceService.updateJob(1, { status: 'processing' });
        expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({
            id: 1,
            status: 'processing'
        }));
    });

    it('should add a file', async () => {
        const fileId = await persistenceService.addFile({ jobId: 1, name: 'test.pdf' });
        expect(fileId).toBe(1);
        expect(mockStore.add).toHaveBeenCalledWith(expect.objectContaining({
            jobId: 1,
            name: 'test.pdf',
            status: 'pending'
        }));
    });

    it('should update a file', async () => {
        mockStore.get.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null, result: { id: 1, name: 'test.pdf' } };
            setTimeout(() => {
                if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
        });

        await persistenceService.updateFile(1, { status: 'completed' });
        expect(mockStore.put).toHaveBeenCalledWith(expect.objectContaining({
            id: 1,
            status: 'completed'
        }));
    });

    it('should get incomplete jobs', async () => {
        const mockJob = { id: 1, status: 'processing' };
        mockIndex.openCursor.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null };
            let called = false;
            setTimeout(() => {
                if (!called) {
                    called = true;
                    req.onsuccess({ 
                        target: { 
                            result: { 
                                value: mockJob, 
                                continue: () => {
                                    req.onsuccess({ target: { result: null } });
                                } 
                            } 
                        } 
                    });
                }
            }, 0);
            return req;
        });

        const jobs = await persistenceService.getIncompleteJobs();
        expect(jobs).toContainEqual(mockJob);
    });

    it('should save a chunk', async () => {
        const chunkId = await persistenceService.saveChunk(1, 0, new Uint8Array([1, 2, 3]));
        expect(chunkId).toBe(1);
        expect(mockStore.add).toHaveBeenCalledWith(expect.objectContaining({
            fileId: 1,
            index: 0,
            data: expect.any(Uint8Array)
        }));
    });

    it('should get chunks sorted by index', async () => {
        const mockChunks = [
            { id: 2, fileId: 1, index: 1, data: new Uint8Array([4, 5, 6]) },
            { id: 1, fileId: 1, index: 0, data: new Uint8Array([1, 2, 3]) }
        ];
        mockIndex.getAll.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null, result: mockChunks };
            setTimeout(() => {
                if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
        });

        const chunks = await persistenceService.getChunks(1);
        expect(chunks[0].index).toBe(0);
        expect(chunks[1].index).toBe(1);
    });

    it('should assemble file from chunks', async () => {
        const mockChunks = [
            { id: 1, fileId: 1, index: 0, data: new Uint8Array([1, 2, 3]) },
            { id: 2, fileId: 1, index: 1, data: new Uint8Array([4, 5, 6]) }
        ];
        mockIndex.getAll.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null, result: mockChunks };
            setTimeout(() => {
                if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
        });

        // Mock Blob if not available in environment
        if (typeof global.Blob === 'undefined') {
            global.Blob = class {
                constructor(parts) { this.parts = parts; }
            };
        }

        const blob = await persistenceService.assembleFileFromChunks(1);
        expect(blob).toBeDefined();
        // If it's our mock Blob, check parts
        if (blob.parts) {
            expect(blob.parts).toHaveLength(2);
            expect(blob.parts[0]).toEqual(new Uint8Array([1, 2, 3]));
        }
    });

    it('should save a metric', async () => {
        const metricId = await persistenceService.saveMetric({ type: 'worker_start', timestamp: 12345 });
        expect(metricId).toBe(1);
        expect(mockStore.add).toHaveBeenCalledWith(expect.objectContaining({
            type: 'worker_start',
            timestamp: 12345
        }));
    });

    it('should get recent metrics', async () => {
        const mockMetric = { id: 1, type: 'process_complete', timestamp: 12345 };
        mockIndex.openCursor.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null };
            setTimeout(() => {
                req.onsuccess({ 
                    target: { 
                        result: { 
                            value: mockMetric, 
                            continue: () => {
                                req.onsuccess({ target: { result: null } });
                            } 
                        } 
                    } 
                });
            }, 0);
            return req;
        });

        const metrics = await persistenceService.getRecentMetrics(10);
        expect(metrics).toContainEqual(mockMetric);
    });
});
