"use strict";
/* =====================================================================
 * plugins/06-assets.js
 * Assets da biblioteca. Fornece: assets.
 * Passa a usar a fachada `backend` (IDB ou FS, transparente).
 * ===================================================================== */
definePlugin({
    id: 'assets',
    version: '1.1.0',
    needs: ['utils', 'backend', 'state'],
    provides: ['assets'],
    uses: ['history', 'ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'backend': '^1.0.0', 'state': '^1.0.0', 'history': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'assets': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const backend = await kernel.require('backend');
        const S = (await kernel.require('state')).data;
        const urls = new Map(); // assetId -> object URL
        const blobs = new Map(); // assetId -> Blob (cache em memória)
        const missing = new Set();
        function getUrl(id) { return urls.get(id); }
        function hasUrl(id) { return urls.has(id); }
        function ensureDefaultPackage() {
            if (S.packages.length) {
                return S.packages.slice().sort((a, b) => (a.order || 0) - (b.order || 0))[0].id;
            }
            const p = {
                id: utils.uid('pkg'),
                name: 'Unfiled',
                order: 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            S.packages.push(p);
            return p.id;
        }
        function uniqueName(name) {
            const base = name || 'Image';
            let c = base, n = 2;
            const taken = new Set(S.assets.map(a => a.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        async function createFromFile(file, packageId) {
            const url = URL.createObjectURL(file);
            const dims = await utils.getImageSize(url);
            const asset = {
                id: utils.uid('asset'),
                name: uniqueName(utils.baseName(file.name)),
                packageId: packageId,
                mimeType: file.type || 'image/png',
                originalWidth: dims.width,
                originalHeight: dims.height,
                size: file.size || 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            // Persiste via fachada (IDB ou FS). Se estiver volátil, ignora.
            try {
                await kernel.call('backend', 'put', 'blobs', asset.id, file);
            }
            catch (e) {
                kernel.log.warn('blob não persistido (modo volátil?):', asset.id, e.message);
            }
            // Cache em memória sempre — o app funciona mesmo sem persistência.
            blobs.set(asset.id, file);
            urls.set(asset.id, url);
            S.assets.push(asset);
            return asset;
        }
        async function importFiles(fileList, packageId) {
            const files = Array.from(fileList).filter(utils.isSupportedImageFile);
            if (!files.length) {
                kernel.emit('toast', { message: 'Nenhuma imagem suportada encontrada.', kind: 'error' });
                return 0;
            }
            const before = await kernel.call('history', 'snapshot');
            let ok = 0, fail = 0;
            for (const f of files) {
                try {
                    await createFromFile(f, packageId);
                    ok++;
                }
                catch (e) {
                    fail++;
                    kernel.log.warn('import failed', f.name, e);
                }
            }
            await kernel.call('history', 'push', before);
            kernel.emit('assets:changed');
            kernel.emit('state:changed');
            if (ok)
                kernel.emit('toast', { message: 'Importadas ' + ok + ' imagem(ns).', kind: 'ok' });
            if (fail)
                kernel.emit('toast', { message: fail + ' falharam.', kind: 'error' });
            return ok;
        }
        async function deleteAsset(id) {
            const asset = S.assets.find(a => a.id === id);
            if (!asset)
                return;
            let used = 0;
            for (const b of S.boards)
                for (const i of b.instances) {
                    if (i.assetId === id)
                        used++;
                    if (i.type === 'manga-page') {
                        for (const p of i.panels || []) {
                            used += (p.layers || []).filter(l => l.assetId === id).length;
                        }
                        used += (i.overlays || []).filter(l => l.assetId === id).length;
                        for (const item of i.unassignedPanels || []) {
                            used += (item.layers || []).filter(l => l.assetId === id).length;
                        }
                    }
                }
            const ok = await kernel.call('ui.dialogs', 'confirm', {
                title: 'Excluir imagem',
                message: 'Excluir "' + asset.name + '"' +
                    (used ? ' (usada por ' + used + ' instância(s))' : '') + '?',
                danger: true
            });
            if (!ok)
                return;
            const before = await kernel.call('history', 'snapshot');
            for (const b of S.boards) {
                b.instances = b.instances.filter(i => i.assetId !== id);
                for (const i of b.instances) {
                    if (i.type !== 'manga-page')
                        continue;
                    for (const p of i.panels || []) {
                        p.layers = (p.layers || []).filter(l => l.assetId !== id);
                        p.layers.forEach((l, index) => { l.zIndex = index + 1; });
                    }
                    i.overlays = (i.overlays || []).filter(l => l.assetId !== id);
                    i.overlays.forEach((l, index) => { l.zIndex = index + 1; });
                    for (const item of i.unassignedPanels || []) {
                        item.layers = (item.layers || []).filter(l => l.assetId !== id);
                        item.layers.forEach((l, index) => { l.zIndex = index + 1; });
                    }
                }
            }
            S.assets = S.assets.filter(a => a.id !== id);
            const u = urls.get(id);
            if (u) {
                URL.revokeObjectURL(u);
                urls.delete(id);
            }
            blobs.delete(id);
            try {
                await kernel.call('backend', 'del', 'blobs', id);
            }
            catch (e) { /* ignora */ }
            await kernel.call('history', 'push', before);
            kernel.emit('assets:changed');
            kernel.emit('state:changed');
        }
        async function restoreFromStorage() {
            for (const asset of S.assets) {
                let blob = null;
                try {
                    blob = await kernel.call('backend', 'get', 'blobs', asset.id);
                }
                catch (e) {
                    blob = null;
                }
                if (blob) {
                    blobs.set(asset.id, blob);
                    urls.set(asset.id, URL.createObjectURL(blob));
                }
                else {
                    missing.add(asset.id);
                }
            }
        }
        /**
         * Reconcile image binaries for a document snapshot (Undo/Redo).
         * Blob objects are immutable references retained by the history stack.
         * Metadata changes only after backend writes have succeeded.
         */
        async function restoreHistoryBlobs(savedBlobs, beforeAssets, afterAssets) {
            if (!(savedBlobs instanceof Map))
                throw new Error('Expected Blob map');
            const targetIds = new Set(afterAssets.map(a => a.id));
            const oldIds = new Set(beforeAssets.map(a => a.id));
            const oldBlobs = new Map(blobs);
            const nextBlobs = new Map();
            for (const id of targetIds) {
                if (savedBlobs.has(id))
                    nextBlobs.set(id, savedBlobs.get(id));
                else if (blobs.has(id) && oldIds.has(id))
                    nextBlobs.set(id, blobs.get(id));
            }
            const changes = [];
            if (backend.isAvailable && backend.isAvailable()) {
                try {
                    for (const [id, blob] of nextBlobs) {
                        if (oldBlobs.get(id) !== blob) {
                            await backend.put('blobs', id, blob);
                            changes.push({ id: id, old: oldBlobs.get(id) });
                        }
                    }
                    for (const id of oldIds) {
                        if (!targetIds.has(id)) {
                            await backend.del('blobs', id);
                            changes.push({ id: id, old: oldBlobs.get(id) });
                        }
                    }
                }
                catch (err) {
                    // Best effort compensation before rejecting the history operation.
                    for (const c of changes.reverse()) {
                        try {
                            if (c.old)
                                await backend.put('blobs', c.id, c.old);
                            else
                                await backend.del('blobs', c.id);
                        }
                        catch (rollbackError) {
                            kernel.log.error('blob history rollback failed', c.id, rollbackError);
                        }
                    }
                    throw err;
                }
            }
            urls.forEach(url => URL.revokeObjectURL(url));
            urls.clear();
            blobs.clear();
            missing.clear();
            for (const a of afterAssets) {
                const blob = nextBlobs.get(a.id);
                if (blob) {
                    blobs.set(a.id, blob);
                    urls.set(a.id, URL.createObjectURL(blob));
                }
                else {
                    missing.add(a.id);
                }
            }
        }
        kernel.provide('assets', {
            urls, blobs, missing,
            getUrl, hasUrl,
            importFiles, createFromFile, deleteAsset,
            ensureDefaultPackage, restoreFromStorage, restoreHistoryBlobs
        });
    }
});
