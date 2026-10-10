"use strict";
/* =====================================================================
 * plugins/02-storage.js
 * IndexedDB com TIMEOUT no open() — evita travamento no Chrome file://.
 * ===================================================================== */
definePlugin({
    id: 'storage',
    version: '1.2.0',
    needs: ['utils'],
    provides: ['storage'],
    uses: [],
    accepts: { 'utils': '^1.0.0' },
    contractVersions: { 'storage': '1.0.0' },
    setup: function (kernel) {
        const DB_NAME = 'nvb-db';
        const DB_VERSION = 2;
        const OPEN_TIMEOUT_MS = 3000;
        let db = null;
        function isAvailable() { return db !== null; }
        function open() {
            return new Promise(function (resolve, reject) {
                if (!window.indexedDB) {
                    return reject(new Error('IndexedDB is not available in this browser.'));
                }
                let settled = false;
                let req;
                try {
                    req = indexedDB.open(DB_NAME, DB_VERSION);
                }
                catch (e) {
                    return reject(e);
                }
                // Timeout: Chrome file:// pode nunca disparar onsuccess nem onerror.
                const timer = setTimeout(function () {
                    if (settled)
                        return;
                    settled = true;
                    try {
                        if (req) {
                            req.onupgradeneeded = null;
                            req.onsuccess = null;
                            req.onerror = null;
                            req.onblocked = null;
                            if (req.result) {
                                try {
                                    req.result.close();
                                }
                                catch (e) { }
                            }
                        }
                    }
                    catch (e) { }
                    reject(new Error('IndexedDB open timed out (likely blocked on file://)'));
                }, OPEN_TIMEOUT_MS);
                req.onupgradeneeded = function (e) {
                    try {
                        const d = e.target.result;
                        if (!d.objectStoreNames.contains('kv'))
                            d.createObjectStore('kv');
                        if (!d.objectStoreNames.contains('blobs'))
                            d.createObjectStore('blobs');
                    }
                    catch (err) {
                        kernel.log.warn('onupgradeneeded failed', err);
                    }
                };
                req.onsuccess = function () {
                    if (settled) {
                        try {
                            req.result.close();
                        }
                        catch (e) { }
                        return;
                    }
                    settled = true;
                    clearTimeout(timer);
                    db = req.result;
                    kernel.log.info('IndexedDB opened successfully');
                    resolve();
                };
                req.onerror = function () {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    db = null;
                    reject(req.error || new Error('Could not open IndexedDB.'));
                };
                req.onblocked = function () {
                    if (settled)
                        return;
                    settled = true;
                    clearTimeout(timer);
                    db = null;
                    reject(new Error('IndexedDB blocked.'));
                };
            });
        }
        function store(name, mode) {
            if (!db)
                throw new Error('StorageUnavailable');
            return db.transaction(name, mode).objectStore(name);
        }
        function put(s, k, v) {
            return new Promise((res, rej) => {
                let r;
                try {
                    r = store(s, 'readwrite').put(v, k);
                }
                catch (e) {
                    return rej(e);
                }
                r.onsuccess = function () { res(); };
                r.onerror = function () { rej(r.error); };
            });
        }
        function get(s, k) {
            return new Promise((res, rej) => {
                let r;
                try {
                    r = store(s, 'readonly').get(k);
                }
                catch (e) {
                    return rej(e);
                }
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { rej(r.error); };
            });
        }
        function del(s, k) {
            return new Promise((res, rej) => {
                let r;
                try {
                    r = store(s, 'readwrite').delete(k);
                }
                catch (e) {
                    return rej(e);
                }
                r.onsuccess = function () { res(); };
                r.onerror = function () { rej(r.error); };
            });
        }
        function clear(s) {
            return new Promise((res, rej) => {
                let r;
                try {
                    r = store(s, 'readwrite').clear();
                }
                catch (e) {
                    return rej(e);
                }
                r.onsuccess = function () { res(); };
                r.onerror = function () { rej(r.error); };
            });
        }
        function keys(s) {
            return new Promise((res, rej) => {
                let r;
                try {
                    r = store(s, 'readonly').getAllKeys();
                }
                catch (e) {
                    return rej(e);
                }
                r.onsuccess = function () { res((r.result || [])); };
                r.onerror = function () { rej(r.error); };
            });
        }
        kernel.provide('storage', {
            open, put, get, del, clear, keys,
            isAvailable
        });
    },
    teardown: function (kernel) {
        kernel.log.debug('storage teardown');
    }
});
