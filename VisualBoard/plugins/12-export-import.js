"use strict";
/* =====================================================================
 * Phase 7 — lossless project backup/export and staged import.
 * Import NEVER changes the live document before decoding and persisting.
 * ===================================================================== */
definePlugin({
    id: 'export-import',
    version: '2.0.0',
    needs: ['utils', 'backend', 'state', 'assets', 'boards', 'projectFormat', 'documentSnapshot'],
    provides: ['exportImport'],
    uses: ['camera', 'ui.dialogs', 'history', 'app'],
    accepts: { 'utils': '^1.0.0', 'backend': '^1.0.0', 'state': '^1.0.0',
        'assets': '^1.0.0', 'boards': '^1.0.0', 'projectFormat': '^1.0.0',
        'documentSnapshot': '^1.0.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0',
        'history': '^1.0.0', 'app': '^1.0.0' },
    contractVersions: { exportImport: '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const backend = await kernel.require('backend');
        const state = await kernel.require('state');
        const S = state.data;
        const A = await kernel.require('assets');
        const codec = await kernel.require('projectFormat');
        const docs = await kernel.require('documentSnapshot');
        const DOC_KEY = 'project-doc';
        function issue(code, message) { return { code, message }; }
        function failed(code, message) {
            kernel.emit('toast', { message, kind: 'error' });
            return { success: false, errors: [issue(code, message)] };
        }
        function fileName(s) {
            return String(s || 'VisualBoard').replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 55);
        }
        async function exportProject(options) {
            options = options || {};
            try {
                const doc = codec.normalize(docs.serialize());
                const assets = [];
                for (const meta of doc.assets) {
                    let blob = A.blobs.get(meta.id);
                    if (!(blob instanceof Blob))
                        blob = await backend.get('blobs', meta.id);
                    if (!(blob instanceof Blob))
                        throw Error('Missing image data: ' + meta.name + ' [' + meta.id + ']');
                    const data = await utils.blobToDataURL(blob);
                    if (!data)
                        throw Error('Could not serialize image: ' + meta.id);
                    assets.push(Object.assign({}, meta, { data }));
                }
                const payload = codec.envelope(doc, assets);
                const json = JSON.stringify(payload);
                if (options.download !== false) {
                    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const suffix = options.backup ? '-backup-' + stamp : '';
                    utils.downloadText(fileName(doc.meta.name) + suffix + '.nvb.json', json, 'application/json');
                    kernel.emit('toast', { message: 'Saved complete project backup (' + assets.length + ' images).', kind: 'ok' });
                }
                return { success: true, payload, json, assets: assets.length };
            }
            catch (err) {
                kernel.log.error('project export failed', err);
                return failed('EXPORT_FAILED', err.message);
            }
        }
        async function importProjectFile(file) {
            let payload, prepared;
            const staged = new Map();
            try {
                payload = JSON.parse(await file.text());
                prepared = codec.prepare(payload);
                for (const [id, data] of prepared.blobs) {
                    const blob = await utils.dataURLToBlob(data);
                    if (!(blob instanceof Blob) || !blob.size)
                        throw Error('Invalid image binary: ' + id);
                    staged.set(id, blob);
                }
                for (const asset of prepared.doc.assets) {
                    if (!staged.has(asset.id))
                        throw Error('Image missing from backup: ' + asset.name + ' [' + asset.id + ']');
                }
            }
            catch (err) {
                return failed('INVALID_IMPORT', 'File is invalid or incomplete: ' + err.message);
            }
            const ok = await kernel.call('ui.dialogs', 'confirm', {
                title: 'Replace current project?',
                message: 'Incoming project: ' + (prepared.doc.meta.name || 'Untitled') +
                    '\nImages: ' + prepared.doc.assets.length +
                    '\nBoards: ' + prepared.doc.boards.length +
                    '\nPanel templates: ' + prepared.doc.panelSets.length +
                    '\n\nA complete backup of the current project will be downloaded first.',
                danger: true, confirmText: 'Back up and replace'
            });
            if (!ok)
                return { success: false, cancelled: true, errors: [] };
            // A backed-up original is a prerequisite, not a best-effort side effect.
            const backup = await exportProject({ backup: true });
            if (!backup.success)
                return failed('BACKUP_FAILED', 'Import blocked: current project backup could not be created');
            const oldDoc = codec.normalize(docs.serialize());
            const oldBlobs = new Map();
            for (const meta of oldDoc.assets) {
                const blob = A.blobs.get(meta.id) || await backend.get('blobs', meta.id);
                if (!(blob instanceof Blob))
                    return failed('BACKUP_FAILED', 'Original image is missing: ' + meta.id);
                oldBlobs.set(meta.id, blob);
            }
            const raw = backend.raw();
            try {
                // Persist the NEXT set without touching live state; retain old blobs until commit.
                for (const [id, blob] of staged)
                    await backend.put('blobs', id, blob);
                await backend.put('kv', DOC_KEY, prepared.doc);
                if (raw?.flushNow)
                    await raw.flushNow();
                else if (raw?.saveAll)
                    await raw.saveAll();
            }
            catch (err) {
                // Compensate even when a partial storage write was successful.
                try {
                    for (const [id, blob] of oldBlobs)
                        await backend.put('blobs', id, blob);
                    for (const id of staged.keys())
                        if (!oldBlobs.has(id))
                            await backend.del('blobs', id);
                    await backend.put('kv', DOC_KEY, oldDoc);
                    if (raw?.flushNow)
                        await raw.flushNow();
                    else if (raw?.saveAll)
                        await raw.saveAll();
                }
                catch (recovery) {
                    kernel.log.error('import storage rollback failed', recovery);
                    kernel.emit('storage:failed', { mode: backend.mode(), message: recovery.message });
                }
                return failed('IMPORT_WRITE_FAILED', 'Could not save imported project: ' + err.message);
            }
            const doc = prepared.doc;
            A.urls.forEach(url => URL.revokeObjectURL(url));
            A.urls.clear();
            A.blobs.clear();
            A.missing.clear();
            for (const [id, blob] of staged) {
                A.blobs.set(id, blob);
                A.urls.set(id, URL.createObjectURL(blob));
            }
            S.meta = doc.meta;
            S.packages = doc.packages;
            S.assets = doc.assets;
            S.boards = doc.boards;
            S.panelSets = doc.panelSets;
            S.settings = doc.settings;
            S.rootBoardId = doc.rootBoardId;
            const settings = doc.settings;
            S.currentBoardId = settings.lastBoardId &&
                doc.boards.some(b => b.id === settings.lastBoardId)
                ? settings.lastBoardId : doc.rootBoardId;
            for (const board of S.boards) {
                if (!board.camera)
                    board.camera = { x: 0, y: 0, zoom: 1 };
                for (const inst of board.instances)
                    if (!inst.type)
                        inst.type = 'image';
            }
            const current = state.getCurrentBoard();
            if (kernel.has('camera') && current?.camera) {
                const camera = await kernel.require('camera');
                camera.data.x = current.camera.x || 0;
                camera.data.y = current.camera.y || 0;
                camera.data.zoom = current.camera.zoom || 1;
            }
            S.selection.clear();
            S.ui.filterPackage = 'all';
            S.ui.expanded.clear();
            await kernel.call('history', 'clear');
            // Old unreferenced blobs removed only AFTER new project is persistent.
            for (const id of oldBlobs.keys())
                if (!staged.has(id)) {
                    try {
                        await backend.del('blobs', id);
                    }
                    catch (err) {
                        kernel.log.warn('unused old blob cleanup failed', id, err);
                    }
                }
            for (const name of ['state:changed', 'assets:changed', 'packages:changed',
                'boards:changed', 'camera:changed', 'panelSets:changed', 'history:changed'])
                kernel.emit(name);
            kernel.emit('board:navigated', { boardId: S.currentBoardId });
            kernel.emit('toast', { message: 'Project imported; previous project backed up.', kind: 'ok' });
            return { success: true, version: prepared.version, assets: doc.assets.length,
                boards: doc.boards.length, panelSets: doc.panelSets.length };
        }
        kernel.provide('exportImport', { exportProject, importProjectFile });
    }
});
