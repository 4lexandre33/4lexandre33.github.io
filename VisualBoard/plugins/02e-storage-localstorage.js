"use strict";
/* =====================================================================
 * plugins/02e-storage-localstorage.js
 * ---------------------------------------------------------------------
 * Persistência em localStorage — funciona em file:// no Chrome.
 *
 * Modelo:
 *   nvb:doc              → JSON do documento (meta, packages, assets,
 *                          boards, rootBoardId, settings)
 *   nvb:blob:<assetId>   → data URL (base64) do binário da imagem
 *
 * Limitações honestas:
 *   - localStorage tem ~5 MB por origem (Chrome pode dar até 10 MB)
 *   - Imagens em base64 inflam ~33%
 *   - Sem armazenamento binário nativo
 *   → Para projetos sérios, prefira servidor local (localhost) ou Firefox
 *
 * Otimizações:
 *   - Writes são debounced (500 ms) para não bloquear a UI
 *   - Se estourar quota, avisa o usuário e para de tentar
 *   - Detecção prévia de disponibilidade faz um round-trip de teste
 * ===================================================================== */
definePlugin({
    id: 'storage-localstorage',
    version: '1.0.0',
    needs: ['utils'],
    provides: ['storage-ls'],
    uses: [],
    accepts: { 'utils': '^1.0.0' },
    contractVersions: { 'storage-ls': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const PREFIX_DOC = 'nvb:doc';
        const PREFIX_BLOB = 'nvb:blob:';
        // Espelho em memória
        const memKv = new Map();
        const memBlobs = new Map();
        // Filas de escrita
        const dirtyKv = new Set();
        const dirtyBlobs = new Set();
        const deletedBlobs = new Set();
        let flushTimer = null;
        let flushPending = false;
        let quotaExceeded = false;
        /* ---------------- Disponibilidade ---------------- */
        function isAvailable() {
            if (quotaExceeded)
                return false;
            try {
                if (typeof window.localStorage !== 'object' || !window.localStorage)
                    return false;
                // Round-trip de teste
                const k = 'nvb:__probe__';
                window.localStorage.setItem(k, '1');
                window.localStorage.removeItem(k);
                return true;
            }
            catch (e) {
                return false;
            }
        }
        function estimateUsedBytes() {
            try {
                let total = 0;
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || (key.indexOf('nvb:') !== 0))
                        continue;
                    const v = localStorage.getItem(key) || '';
                    total += key.length + v.length;
                }
                return total;
            }
            catch (e) {
                return 0;
            }
        }
        /* ---------------- Leitura ---------------- */
        function loadFromStorage() {
            memKv.clear();
            memBlobs.clear();
            dirtyKv.clear();
            dirtyBlobs.clear();
            deletedBlobs.clear();
            quotaExceeded = false;
            // Documento
            try {
                const raw = localStorage.getItem(PREFIX_DOC);
                if (raw)
                    memKv.set('project-doc', JSON.parse(raw));
            }
            catch (e) {
                throw Error('Corrupt localStorage project: ' + e.message);
            }
            // Blobs
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    if (!key || key.indexOf(PREFIX_BLOB) !== 0)
                        continue;
                    const id = key.slice(PREFIX_BLOB.length);
                    const dataUrl = localStorage.getItem(key);
                    if (dataUrl)
                        memBlobs.set(id, dataUrl); // string data URL
                }
            }
            catch (e) {
                kernel.log.warn('localStorage: blob scan failed', e);
            }
        }
        /* ---------------- Escrita ---------------- */
        let flushPromise = null;
        function flushNow() {
            if (flushPromise)
                return flushPromise;
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            flushPromise = (async function () {
                const savedBlobs = [];
                // Save binary assets FIRST; do not publish references until blobs persist.
                for (const id of Array.from(dirtyBlobs)) {
                    const dataUrl = memBlobs.get(id);
                    if (!dataUrl)
                        throw Error('Missing blob for ' + id);
                    localStorage.setItem(PREFIX_BLOB + id, dataUrl);
                    savedBlobs.push(id);
                    dirtyBlobs.delete(id);
                }
                if (dirtyKv.has('project-doc')) {
                    const doc = memKv.get('project-doc');
                    if (doc === undefined)
                        throw Error('Missing project document');
                    // Preserve previous JSON if the new write fails.
                    const old = localStorage.getItem(PREFIX_DOC);
                    if (old && old !== JSON.stringify(doc)) {
                        // Quota is small: failure to retain an auxiliary copy must not block
                        // updating the primary doc (full download backups are provided by UI).
                        try {
                            localStorage.setItem('nvb:doc:backup', old);
                        }
                        catch (error) {
                            kernel.log.warn('localStorage backup copy unavailable', error);
                        }
                    }
                    localStorage.setItem(PREFIX_DOC, JSON.stringify(doc));
                    dirtyKv.delete('project-doc');
                }
                for (const id of Array.from(deletedBlobs)) {
                    localStorage.removeItem(PREFIX_BLOB + id);
                    deletedBlobs.delete(id);
                }
                quotaExceeded = false;
                kernel.emit('storage:saved');
            })();
            return flushPromise.catch(err => {
                quotaExceeded = err?.name === 'QuotaExceededError' || /quota/i.test(err?.message || '');
                kernel.log.error('localStorage save failed', err);
                kernel.emit('storage:failed', { mode: 'ls', message: err.message });
                kernel.emit('toast', { message: 'Storage write failed: ' + err.message +
                        '. Export a project backup before continuing.', kind: 'error' });
                throw err;
            }).finally(() => { flushPromise = null; });
        }
        function scheduleFlush() {
            if (flushTimer)
                clearTimeout(flushTimer);
            flushTimer = setTimeout(function () {
                flushTimer = null;
                void flushNow().catch(() => { });
            }, 500);
        }
        /* ---------------- Interface storage ---------------- */
        async function put(store, key, value) {
            if (store === 'kv') {
                memKv.set(key, value);
                if (key === 'project-doc')
                    dirtyKv.add('project-doc');
            }
            else if (store === 'blobs') {
                // Converte Blob → data URL para caber em localStorage
                if (value instanceof Blob) {
                    try {
                        const dataUrl = await utils.blobToDataURL(value);
                        memBlobs.set(key, dataUrl);
                    }
                    catch (e) {
                        kernel.log.warn('localStorage: blob serialize failed', key, e);
                        return;
                    }
                }
                else if (typeof value === 'string' && value.indexOf('data:') === 0) {
                    memBlobs.set(key, value);
                }
                else {
                    kernel.log.warn('localStorage: unsupported blob type', typeof value);
                    return;
                }
                dirtyBlobs.add(key);
                deletedBlobs.delete(key);
            }
            kernel.emit('storage:saving');
            scheduleFlush();
        }
        async function get(store, key) {
            if (store === 'kv')
                return memKv.get(key);
            if (store === 'blobs') {
                const dataUrl = memBlobs.get(key);
                if (!dataUrl)
                    return undefined;
                // Reconstroi Blob a partir do data URL
                try {
                    // Decode persisted data locally; never resolve storage contents as a URL.
                    return await utils.dataURLToBlob(dataUrl);
                }
                catch (e) {
                    kernel.log.warn('localStorage: blob deserialize failed', key, e);
                    return undefined;
                }
            }
            return undefined;
        }
        async function del(store, key) {
            if (store === 'kv') {
                memKv.delete(key);
                dirtyKv.delete(key);
            }
            else if (store === 'blobs') {
                memBlobs.delete(key);
                dirtyBlobs.delete(key);
                deletedBlobs.add(key);
            }
            scheduleFlush();
        }
        async function clear(store) {
            if (store === 'kv') {
                memKv.clear();
                dirtyKv.clear();
                try {
                    localStorage.removeItem(PREFIX_DOC);
                }
                catch (e) { }
            }
            else if (store === 'blobs') {
                for (const id of memBlobs.keys())
                    deletedBlobs.add(id);
                memBlobs.clear();
                dirtyBlobs.clear();
            }
            scheduleFlush();
        }
        async function keys(store) {
            if (store === 'kv')
                return Array.from(memKv.keys());
            if (store === 'blobs')
                return Array.from(memBlobs.keys());
            return [];
        }
        /* ---------------- Utilitários ---------------- */
        function detach() {
            memKv.clear();
            memBlobs.clear();
            dirtyKv.clear();
            dirtyBlobs.clear();
            deletedBlobs.clear();
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
        }
        function usageBytes() { return estimateUsedBytes(); }
        async function saveAll() {
            dirtyKv.add('project-doc');
            for (const id of memBlobs.keys())
                dirtyBlobs.add(id);
            await flushNow();
        }
        kernel.provide('storage-ls', {
            isAvailable, loadFromStorage, detach, usageBytes, saveAll,
            put, get, del, clear, keys,
            flushNow, scheduleFlush
        });
    },
    teardown: function () { }
});
