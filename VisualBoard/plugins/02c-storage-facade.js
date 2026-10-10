"use strict";
/* =====================================================================
 * plugins/02c-storage-facade.js
 * ---------------------------------------------------------------------
 * Fachada única de persistência. Ninguém além de `app` decide qual
 * backend está ativo; todo o resto do app chama `kernel.call('backend', …)`
 * e não precisa saber se é IndexedDB ou File System Access API.
 *
 * Fornece: backend
 * ===================================================================== */
definePlugin({
    id: 'storage-facade',
    version: '1.0.0',
    needs: ['utils'],
    provides: ['backend'],
    uses: [],
    accepts: { 'utils': '^1.0.0' },
    contractVersions: { 'backend': '1.0.0' },
    setup: function (kernel) {
        let activeBackend = null;
        let activeName = 'volatile'; // 'idb' | 'fs' | 'volatile'
        function setBackend(name, obj) {
            activeName = name || 'volatile';
            activeBackend = obj || null;
            kernel.log.info('backend ativo:', activeName);
            kernel.emit('backend:changed', { mode: activeName });
        }
        function isAvailable() { return activeBackend !== null; }
        function mode() { return activeName; }
        function raw() { return activeBackend; }
        async function put(store, key, value) {
            if (!activeBackend)
                throw new Error('StorageUnavailable');
            return activeBackend.put(store, key, value);
        }
        async function get(store, key) {
            if (!activeBackend)
                return undefined;
            return activeBackend.get(store, key);
        }
        async function del(store, key) {
            if (!activeBackend)
                return;
            return activeBackend.del(store, key);
        }
        async function clear(store) {
            if (!activeBackend)
                return;
            return activeBackend.clear(store);
        }
        async function keys(store) {
            if (!activeBackend)
                return [];
            return activeBackend.keys(store);
        }
        kernel.provide('backend', {
            setBackend, isAvailable, mode, raw,
            put, get, del, clear, keys
        });
    }
});
