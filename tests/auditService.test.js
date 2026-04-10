import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

const auditServiceContent = fs.readFileSync(path.resolve(__dirname, '../services/auditService.js'), 'utf8');

describe('AuditService', () => {
    let auditService;
    let mockDb;
    let mockStore;
    let mockTransaction;
    let mockIDBRequest;

    beforeEach(() => {
        mockStore = {
            add: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null };
                setTimeout(() => req.onsuccess && req.onsuccess(), 0);
                return req;
            }),
            getAll: vi.fn().mockImplementation(() => {
                const req = { onsuccess: null, onerror: null, result: [] };
                setTimeout(() => req.onsuccess && req.onsuccess(), 0);
                return req;
            }),
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
        };

        mockIDBRequest = {
            onsuccess: null,
            onerror: null,
            onupgradeneeded: null,
            result: mockDb,
        };

        const mockIndexedDB = {
            open: vi.fn().mockImplementation(() => {
                setTimeout(() => {
                    if (mockIDBRequest.onsuccess) {
                        mockIDBRequest.onsuccess({ target: { result: mockDb } });
                    }
                }, 0);
                return mockIDBRequest;
            }),
        };

        vi.stubGlobal('indexedDB', mockIndexedDB);
        vi.stubGlobal('console', {
            log: vi.fn(),
            error: vi.fn(),
        });

        // Evaluate the service code
        const mockWindow = { indexedDB: mockIndexedDB };
        const fn = new Function('window', auditServiceContent);
        fn(mockWindow);
        auditService = mockWindow.auditService;
    });

    it('should log an event', async () => {
        const details = { file: 'test.pdf' };
        await auditService.logEvent('SUCCESS', details);

        expect(mockStore.add).toHaveBeenCalledWith(expect.objectContaining({
            type: 'SUCCESS',
            details: details,
            timestamp: expect.any(String)
        }));
    });

    it('should retrieve logs', async () => {
        const mockLogs = [{ id: 1, type: 'INFO', details: {} }];
        
        // Mock getAll to return logs
        mockStore.getAll.mockImplementation(() => {
            const req = { onsuccess: null, onerror: null, result: mockLogs };
            setTimeout(() => req.onsuccess && req.onsuccess(), 0);
            return req;
        });

        const logs = await auditService.getLogs();
        expect(logs).toEqual(mockLogs);
        expect(mockStore.getAll).toHaveBeenCalled();
    });
});
