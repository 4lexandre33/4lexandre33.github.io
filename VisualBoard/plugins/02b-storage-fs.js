"use strict";
/* =====================================================================
 * plugins/02b-storage-fs.js
 * ---------------------------------------------------------------------
 * Persistência via File System Access API (Chrome/Edge, inclui file://).
 *
 * Modelo:
 *   - O usuário escolhe UM arquivo .nvb.json (novo ou existente).
 *   - O plugin mantém o conteúdo em memória (kv + blobs).
 *   - flush() escreve o arquivo inteiro no MESMO formato do botão Export
 *     ("narrative-visual-board"), então o arquivo é 100% interoperável
 *     com o botão Load do app.
 *   - A escrita é debounced para não castigar o disco.
 *
 * Fornece: storage-fs
 * ===================================================================== */
definePlugin({
    id: 'storage-fs',
    version: '1.0.0',
    needs: ['utils', 'projectFormat'],
    provides: ['storage-fs'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'projectFormat': '^1.0.0' },
    contractVersions: { 'storage-fs': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const codec = await kernel.require('projectFormat');
        const FORMAT = 'narrative-visual-board';
        const VERSION = 3;
        let handle = null; // FileSystemFileHandle
        const memKv = new Map(); // 'kv' store
        const memBlobs = new Map(); // 'blobs' store: id -> Blob (em memória)
        let flushTimer = null;
        let flushing = false;
        let pendingFlushAfter = false;
        /* ---------- Disponibilidade / estado ---------- */
        function isAvailable() {
            return typeof window.showSaveFilePicker === 'function' &&
                typeof window.showOpenFilePicker === 'function';
        }
        function hasHandle() { return handle !== null; }
        function getHandleName() { return handle ? handle.name : null; }
        /* ---------- Escolha de arquivos (requer gesto do usuário) ---------- */
        async function pickNew() {
            const h = await window.showSaveFilePicker({
                suggestedName: 'narrative-board.nvb.json',
                types: [{
                        description: 'Narrative Visual Board project',
                        accept: { 'application/json': ['.nvb.json', '.json'] }
                    }]
            });
            handle = h;
            memKv.clear();
            memBlobs.clear();
            return h;
        }
        async function pickExisting() {
            const [h] = await window.showOpenFilePicker({
                multiple: false,
                types: [{
                        description: 'Narrative Visual Board project',
                        accept: { 'application/json': ['.nvb.json', '.json'] }
                    }]
            });
            handle = h;
            return h;
        }
        /* ---------- Leitura ---------- */
        async function loadFromHandle() {
            if (!handle)
                throw new Error('Nenhum arquivo selecionado');
            const text = await (await handle.getFile()).text();
            if (!text.trim()) {
                memKv.clear();
                memBlobs.clear();
                return;
            }
            let payload;
            try {
                payload = JSON.parse(text);
            }
            catch (e) {
                throw Error('Arquivo JSON inválido');
            }
            // Decode and verify the COMPLETE incoming envelope before mutating caches.
            const prepared = codec.prepare(payload);
            const nextBlobs = new Map();
            for (const [id, dataUrl] of prepared.blobs) {
                const blob = await utils.dataURLToBlob(dataUrl);
                if (!(blob instanceof Blob) || !blob.size)
                    throw Error('Blob inválido: ' + id);
                nextBlobs.set(id, blob);
            }
            for (const asset of prepared.doc.assets)
                if (!nextBlobs.has(asset.id))
                    throw Error('Imagem ausente no arquivo: ' + asset.id);
            memKv.clear();
            memBlobs.clear();
            memKv.set('project-doc', prepared.doc);
            for (const [id, blob] of nextBlobs)
                memBlobs.set(id, blob);
        }
        /* ---------- Escrita ---------- */
        let flushPromise = null;
        function flushNow() {
            if (!handle)
                return Promise.resolve();
            if (flushPromise) {
                pendingFlushAfter = true;
                return flushPromise.then(() => flushNow());
            }
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            const current = handle;
            flushPromise = (async function () {
                const doc = memKv.get('project-doc');
                if (!doc)
                    return;
                const assetsOut = [];
                for (const asset of doc.assets || []) {
                    const blob = memBlobs.get(asset.id);
                    if (!(blob instanceof Blob))
                        throw Error('Imagem ausente: ' + asset.id);
                    const data = await utils.blobToDataURL(blob);
                    if (!data)
                        throw Error('Falha ao serializar imagem: ' + asset.id);
                    assetsOut.push(Object.assign({}, asset, { data }));
                }
                const payload = codec.envelope(doc, assetsOut);
                const writable = await current.createWritable();
                try {
                    await writable.write(JSON.stringify(payload));
                    await writable.close();
                }
                catch (err) {
                    try {
                        await writable.abort();
                    }
                    catch (_) { }
                    throw err;
                }
            })();
            return flushPromise.catch(err => {
                kernel.log.error('fs-single flush failed', err);
                kernel.emit('storage:failed', { mode: 'fs-single', message: err.message });
                throw err;
            }).finally(() => {
                flushPromise = null;
                if (pendingFlushAfter) {
                    pendingFlushAfter = false;
                    scheduleFlush();
                }
            });
        }
        function scheduleFlush() {
            if (flushTimer)
                clearTimeout(flushTimer);
            flushTimer = setTimeout(function () {
                flushTimer = null;
                void flushNow().catch(() => { });
            }, 550);
        }
        /* ---------- Interface storage (compatível com 02-storage.js) ---------- */
        async function put(storeName, key, value) {
            if (storeName === 'kv') {
                memKv.set(key, value);
            }
            else if (storeName === 'blobs') {
                memBlobs.set(key, value); // Blob / File direto
            }
            scheduleFlush();
        }
        async function get(storeName, key) {
            if (storeName === 'kv')
                return memKv.get(key);
            if (storeName === 'blobs')
                return memBlobs.get(key);
            return undefined;
        }
        async function del(storeName, key) {
            if (storeName === 'kv')
                memKv.delete(key);
            else if (storeName === 'blobs')
                memBlobs.delete(key);
            scheduleFlush();
        }
        async function clear(storeName) {
            if (storeName === 'kv')
                memKv.clear();
            else if (storeName === 'blobs')
                memBlobs.clear();
            scheduleFlush();
        }
        async function keys(storeName) {
            if (storeName === 'kv')
                return Array.from(memKv.keys());
            if (storeName === 'blobs')
                return Array.from(memBlobs.keys());
            return [];
        }
        /* ---------- Desanexar (voltar a modo volátil) ---------- */
        function detach() {
            handle = null;
            memKv.clear();
            memBlobs.clear();
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
        }
        kernel.provide('storage-fs', {
            isAvailable,
            hasHandle,
            getHandleName,
            pickNew, pickExisting, loadFromHandle,
            put, get, del, clear, keys,
            flushNow, scheduleFlush,
            detach
        });
    },
    teardown: function () { }
});
