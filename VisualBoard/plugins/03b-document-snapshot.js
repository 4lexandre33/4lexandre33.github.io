"use strict";
/* =====================================================================
 * Canonical document snapshot contract for Undo/Redo and persistence.
 * Snapshots keep immutable Blob references (no binary JSON duplication).
 * ===================================================================== */
definePlugin({
    id: 'document-snapshot',
    version: '1.0.0',
    needs: ['state', 'assets', 'camera'],
    provides: ['documentSnapshot'],
    uses: ['storage-fs-dir'],
    accepts: { 'state': '^1.0.0', 'assets': '^1.0.0', 'camera': '^1.0.0', 'storage-fs-dir': '^1.0.0' },
    contractVersions: { 'documentSnapshot': '1.0.0' },
    setup: async function (kernel) {
        const stateApi = await kernel.require('state');
        const S = stateApi.data;
        const assets = await kernel.require('assets');
        const camera = await kernel.require('camera');
        function serialize() {
            const board = stateApi.getCurrentBoard();
            if (board) {
                board.camera = { x: camera.data.x, y: camera.data.y, zoom: camera.data.zoom };
            }
            return {
                meta: S.meta, packages: S.packages, assets: S.assets,
                boards: S.boards, rootBoardId: S.rootBoardId,
                settings: S.settings, panelSets: S.panelSets || []
            };
        }
        function digest(doc) {
            const data = JSON.parse(JSON.stringify(doc));
            if (data.meta)
                delete data.meta.updatedAt; // autosave timestamps are not edits
            return JSON.stringify(data);
        }
        function capture() {
            const doc = serialize();
            return {
                document: JSON.stringify(doc),
                fingerprint: digest(doc),
                blobs: new Map(assets.blobs),
                currentBoardId: S.currentBoardId,
                selection: Array.from(S.selection)
            };
        }
        function equal(a, b) {
            if (!a || !b || a.fingerprint !== b.fingerprint)
                return false;
            if (a.blobs.size !== b.blobs.size)
                return false;
            for (const [id, blob] of a.blobs) {
                if (b.blobs.get(id) !== blob)
                    return false;
            }
            return true;
        }
        async function syncSvgCopies(previous, next) {
            if (!kernel.has('storage-fs-dir'))
                return;
            const fsDir = await kernel.require('storage-fs-dir');
            if (!fsDir.hasHandle || !fsDir.hasHandle())
                return;
            const ids = new Set((next || []).map(p => p.id));
            for (const p of previous || []) {
                if (!ids.has(p.id)) {
                    try {
                        await fsDir.deleteSvgFile(p.id);
                    }
                    catch (e) {
                        kernel.log.warn('history SVG cleanup failed', p.id, e);
                    }
                }
            }
            for (const p of next || []) {
                if (!p.svgSource)
                    continue;
                try {
                    await fsDir.writeSvgFile(p.id, p.svgSource);
                }
                catch (e) {
                    kernel.log.warn('history SVG restore failed', p.id, e);
                }
            }
        }
        async function restore(snapshot, options) {
            const currentIdBefore = S.currentBoardId;
            const currentSelectionBefore = Array.from(S.selection);
            if (!snapshot || typeof snapshot.document !== 'string' || !(snapshot.blobs instanceof Map)) {
                throw new Error('Invalid document snapshot');
            }
            const doc = JSON.parse(snapshot.document);
            if (!Array.isArray(doc.assets) || !Array.isArray(doc.boards)) {
                throw new Error('Corrupt document snapshot');
            }
            const previousAssets = S.assets.slice();
            const previousPanelSets = (S.panelSets || []).slice();
            // Restore backing image data BEFORE publishing restored references.
            await assets.restoreHistoryBlobs(snapshot.blobs, previousAssets, doc.assets);
            S.meta = doc.meta || S.meta;
            S.packages = (doc.packages || []);
            S.assets = doc.assets;
            S.boards = doc.boards;
            S.rootBoardId = doc.rootBoardId || (S.boards[0] && S.boards[0].id) || null;
            S.settings = doc.settings || {};
            S.panelSets = doc.panelSets || [];
            const wanted = options?.preserveActiveBoard ? currentIdBefore : snapshot.currentBoardId;
            S.currentBoardId = S.boards.some(b => b.id === wanted)
                ? wanted : S.rootBoardId;
            const board = stateApi.getCurrentBoard();
            if (board && board.camera) {
                camera.data.x = Number(board.camera.x) || 0;
                camera.data.y = Number(board.camera.y) || 0;
                camera.data.zoom = Math.max(camera.MIN_ZOOM, Math.min(camera.MAX_ZOOM, Number(board.camera.zoom) || 1));
            }
            const present = new Set((board ? board.instances : []).map(i => i.id));
            S.selection.clear();
            for (const id of (options?.preserveActiveBoard ?
                currentSelectionBefore : snapshot.selection || [])) {
                if (present.has(id))
                    S.selection.add(id);
            }
            await syncSvgCopies(previousPanelSets, S.panelSets);
            kernel.emit('history:applied');
            kernel.emit('assets:changed');
            kernel.emit('packages:changed');
            kernel.emit('boards:changed');
            kernel.emit('panelSets:changed');
            kernel.emit('instances:changed');
            kernel.emit('selection:changed');
            kernel.emit('board:navigated', { boardId: S.currentBoardId });
            kernel.emit('state:changed');
            kernel.emit('camera:changed');
            return true;
        }
        kernel.provide('documentSnapshot', { serialize, capture, restore, equal });
    }
});
