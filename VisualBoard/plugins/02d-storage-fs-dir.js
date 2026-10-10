"use strict";
/* =====================================================================
 * plugins/02d-storage-fs-dir.js
 * ---------------------------------------------------------------------
 * Persistência em PASTA via File System Access API:
 *
 *   <folder>/
 *   ├── metadata.json        { format, version, projectName, lastSaved }
 *   ├── project.json         estado completo (JSON puro, ~50 KB)
 *   ├── assets/
 *   │   └── <assetId>.bin    binário cru (sem base64)
 *   └── .svg/                ← FASE 3
 *       └── <panelSetId>.svg cópia crua do SVG importado
 *
 * Interface idêntica ao `storage` (IndexedDB) para que a fachada
 * `backend` possa rotear transparentemente.
 *
 * Novos métodos para SVG:
 *   writeSvgFile(id, svgText)  → grava .svg/<id>.svg
 *   deleteSvgFile(id)          → remove .svg/<id>.svg
 *   readSvgFile(id)            → lê .svg/<id>.svg (útil p/ auditoria)
 *   listSvgFiles()             → lista IDs dos SVGs salvos
 * ===================================================================== */
definePlugin({
    id: 'storage-fs-dir',
    version: '1.1.0',
    needs: ['utils'],
    provides: ['storage-fs-dir'],
    uses: [],
    accepts: { 'utils': '^1.0.0' },
    contractVersions: { 'storage-fs-dir': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const PROJECT_FILE = 'project.json';
        const METADATA_FILE = 'metadata.json';
        const ASSETS_DIR = 'assets';
        const BLOB_EXT = '.bin';
        const SVG_DIR = '.svg';
        const SVG_EXT = '.svg';
        let dirHandle = null;
        // Espelho em memória (mesma semântica do IndexedDB)
        const memKv = new Map();
        const memBlobs = new Map();
        // Filas de escrita pendentes
        const dirtyKv = new Set();
        const dirtyBlobs = new Set();
        const deletedBlobs = new Set();
        let flushTimer = null;
        let flushing = false;
        let pendingFlush = false;
        /* ---------------- Disponibilidade / estado ---------------- */
        function isAvailable() {
            return typeof window.showDirectoryPicker === 'function';
        }
        function hasHandle() { return dirHandle !== null; }
        function getFolderName() { return dirHandle ? dirHandle.name : null; }
        /* ---------------- Seleção de pasta ---------------- */
        async function pickDirectory() {
            const h = await window.showDirectoryPicker({
                id: 'nvb-project',
                mode: 'readwrite'
            });
            dirHandle = h;
            return h;
        }
        /* ---------------- Leitura ---------------- */
        async function readJsonFile(name) {
            if (!dirHandle)
                throw new Error('No directory');
            const fh = await dirHandle.getFileHandle(name);
            const file = await fh.getFile();
            const text = await file.text();
            if (!text || !text.trim())
                throw Error('Empty project data: ' + name);
            try {
                return JSON.parse(text);
            }
            catch (e) {
                throw Error('Invalid JSON in ' + name);
            }
        }
        async function loadFromDirectory() {
            if (!dirHandle)
                throw Error('No directory selected');
            // Stage all reads before replacing the previous in-memory project.
            let doc = null;
            try {
                doc = await readJsonFile(PROJECT_FILE);
            }
            catch (e) {
                if (e.name !== 'NotFoundError')
                    throw e;
            }
            if (doc && (!Array.isArray(doc.boards) || !Array.isArray(doc.assets)))
                throw Error('Invalid project.json document structure');
            const nextBlobs = new Map();
            try {
                const assetsDir = await dirHandle.getDirectoryHandle(ASSETS_DIR);
                for await (const [name, entry] of assetsDir.entries()) {
                    if (entry.kind !== 'file' || !name.endsWith(BLOB_EXT))
                        continue;
                    const id = name.slice(0, -BLOB_EXT.length);
                    nextBlobs.set(id, await (await assetsDir.getFileHandle(name)).getFile());
                }
            }
            catch (e) {
                if (e.name !== 'NotFoundError')
                    throw e;
            }
            if (doc) {
                for (const asset of doc.assets) {
                    if (!nextBlobs.has(asset.id))
                        throw Error('Missing asset file: ' + asset.id);
                }
            }
            memKv.clear();
            memBlobs.clear();
            dirtyKv.clear();
            dirtyBlobs.clear();
            deletedBlobs.clear();
            if (doc)
                memKv.set('project-doc', doc);
            for (const [id, blob] of nextBlobs)
                memBlobs.set(id, blob);
        }
        /* ---------------- Escrita atômica ---------------- */
        async function writeTextFile(name, text) {
            if (!dirHandle)
                throw new Error('No directory');
            const fh = await dirHandle.getFileHandle(name, { create: true });
            const w = await fh.createWritable();
            await w.write(text);
            await w.close();
        }
        async function writeBlobFile(assetId, blob) {
            if (!dirHandle)
                return;
            const assetsDir = await dirHandle.getDirectoryHandle(ASSETS_DIR, { create: true });
            const fh = await assetsDir.getFileHandle(assetId + BLOB_EXT, { create: true });
            const w = await fh.createWritable();
            await w.write(blob);
            await w.close();
        }
        async function deleteBlobFile(assetId) {
            if (!dirHandle)
                return;
            try {
                const assetsDir = await dirHandle.getDirectoryHandle(ASSETS_DIR);
                await assetsDir.removeEntry(assetId + BLOB_EXT);
            }
            catch (e) {
                // arquivo pode não existir
            }
        }
        /* ---------------- SVG (Fase 3) ---------------- */
        async function writeSvgFile(id, svgText) {
            if (!dirHandle)
                return false;
            if (!id || typeof svgText !== 'string' || !svgText.length)
                return false;
            try {
                const svgDir = await dirHandle.getDirectoryHandle(SVG_DIR, { create: true });
                const fh = await svgDir.getFileHandle(id + SVG_EXT, { create: true });
                const w = await fh.createWritable();
                await w.write(svgText);
                await w.close();
                return true;
            }
            catch (err) {
                kernel.log.warn('writeSvgFile failed for ' + id, err);
                return false;
            }
        }
        async function deleteSvgFile(id) {
            if (!dirHandle)
                return false;
            if (!id)
                return false;
            try {
                const svgDir = await dirHandle.getDirectoryHandle(SVG_DIR);
                await svgDir.removeEntry(id + SVG_EXT);
                return true;
            }
            catch (e) {
                // pasta ou arquivo pode não existir
                return false;
            }
        }
        async function readSvgFile(id) {
            if (!dirHandle)
                return null;
            if (!id)
                return null;
            try {
                const svgDir = await dirHandle.getDirectoryHandle(SVG_DIR);
                const fh = await svgDir.getFileHandle(id + SVG_EXT);
                const file = await fh.getFile();
                return await file.text();
            }
            catch (e) {
                return null;
            }
        }
        async function listSvgFiles() {
            if (!dirHandle)
                return [];
            const ids = [];
            try {
                const svgDir = await dirHandle.getDirectoryHandle(SVG_DIR);
                for await (const [name, entry] of svgDir.entries()) {
                    if (entry.kind !== 'file')
                        continue;
                    if (name.slice(-SVG_EXT.length) !== SVG_EXT)
                        continue;
                    ids.push(name.slice(0, -SVG_EXT.length));
                }
            }
            catch (e) { /* .svg/ não existe ainda */ }
            return ids;
        }
        /* ---------------- Flush ---------------- */
        let flushPromise = null;
        function flushNow() {
            if (!dirHandle)
                return Promise.resolve();
            if (flushPromise) {
                pendingFlush = true;
                return flushPromise.then(() => flushNow());
            }
            if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
            }
            const writeIds = Array.from(dirtyBlobs);
            const delIds = Array.from(deletedBlobs);
            const docDirty = dirtyKv.has('project-doc');
            flushPromise = (async function () {
                // Files first: never commit a document that references images not yet stored.
                for (const id of writeIds) {
                    const blob = memBlobs.get(id);
                    if (!(blob instanceof Blob))
                        throw Error('Missing blob before save: ' + id);
                    await writeBlobFile(id, blob);
                    if (memBlobs.get(id) === blob)
                        dirtyBlobs.delete(id);
                }
                if (docDirty) {
                    const doc = memKv.get('project-doc');
                    const serialized = doc ? JSON.stringify(doc) : null;
                    if (doc) {
                        // Retain one previous project.json alongside the current project.
                        let previous = null;
                        try {
                            const file = await dirHandle.getFileHandle(PROJECT_FILE);
                            previous = await (await file.getFile()).text();
                        }
                        catch (e) {
                            if (e.name !== 'NotFoundError')
                                throw e;
                        }
                        if (previous)
                            await writeTextFile('project.backup.json', previous);
                        await writeTextFile(PROJECT_FILE, serialized);
                        const meta = { format: 'narrative-visual-board', version: 3,
                            projectName: doc.meta?.name || 'Untitled Project',
                            lastSaved: new Date().toISOString(), createdAt: doc.meta?.createdAt || Date.now() };
                        await writeTextFile(METADATA_FILE, JSON.stringify(meta, null, 2));
                    }
                    if (serialized !== null && JSON.stringify(memKv.get('project-doc')) === serialized)
                        dirtyKv.delete('project-doc');
                }
                for (const id of delIds) {
                    if (!deletedBlobs.has(id) || memBlobs.has(id))
                        continue;
                    await deleteBlobFile(id);
                    deletedBlobs.delete(id);
                }
            })();
            return flushPromise.catch(err => {
                kernel.log.error('fs-dir flush failed', err);
                kernel.emit('storage:failed', { mode: 'fs-dir', message: err.message });
                throw err;
            }).finally(() => {
                flushPromise = null;
                if (pendingFlush) {
                    pendingFlush = false;
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
        /* ---------------- Interface compatível com `storage` ---------------- */
        async function put(store, key, value) {
            if (store === 'kv') {
                memKv.set(key, value);
                if (key === 'project-doc')
                    dirtyKv.add('project-doc');
            }
            else if (store === 'blobs') {
                memBlobs.set(key, value);
                dirtyBlobs.add(key);
                deletedBlobs.delete(key);
            }
            scheduleFlush();
        }
        async function get(store, key) {
            if (store === 'kv')
                return memKv.get(key);
            if (store === 'blobs')
                return memBlobs.get(key);
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
        /* ---------------- Utilitários públicos ---------------- */
        async function saveAll() {
            if (!dirHandle)
                return;
            dirtyKv.add('project-doc');
            for (const id of memBlobs.keys())
                dirtyBlobs.add(id);
            await flushNow();
        }
        function detach() {
            dirHandle = null;
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
        kernel.provide('storage-fs-dir', {
            isAvailable, hasHandle, getFolderName,
            pickDirectory, loadFromDirectory,
            put, get, del, clear, keys,
            flushNow, scheduleFlush, saveAll, detach,
            // SVG (Fase 3)
            writeSvgFile, deleteSvgFile, readSvgFile, listSvgFiles
        });
    },
    teardown: function () { }
});
