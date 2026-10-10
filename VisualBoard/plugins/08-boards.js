"use strict";
/* TS-009: typed board hierarchy, navigation and deletion logic. */
definePlugin({
    id: 'boards',
    version: '1.1.0',
    needs: ['utils', 'state', 'camera'],
    provides: ['boards'],
    uses: ['ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'boards': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        const cam = await kernel.require('camera');
        function uniqueName(name, excludeId) {
            const base = name || 'Board';
            let c = base, n = 2;
            const taken = new Set(S.boards.filter(b => b.id !== excludeId).map(b => b.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        function create(name, parentId) {
            const b = {
                id: utils.uid('board'),
                name: uniqueName(name),
                parentBoardId: parentId || null,
                instances: [],
                camera: { x: 0, y: 0, zoom: 1 },
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            S.boards.push(b);
            kernel.emit('boards:changed');
            return b.id;
        }
        function getBoard(id) { return S.boards.find(b => b.id === id) || null; }
        function current() { return getBoard(S.currentBoardId); }
        /** Caminho da raiz até o board informado (inclusive). */
        function pathOf(boardId) {
            const target = getBoard(boardId);
            if (!target)
                return [];
            const path = [];
            let cursor = target;
            const guard = new Set();
            while (cursor && !guard.has(cursor.id)) {
                guard.add(cursor.id);
                path.unshift(cursor);
                cursor = cursor.parentBoardId ? getBoard(cursor.parentBoardId) : null;
            }
            return path;
        }
        /** Profundidade: 0 = root board. */
        function depthOf(boardId) {
            return Math.max(0, pathOf(boardId).length - 1);
        }
        function navigate(id) {
            const target = getBoard(id);
            if (!target)
                return;
            if (id === S.currentBoardId)
                return;
            // Persiste câmera do board atual antes de sair
            const cur = current();
            if (cur) {
                if (cam)
                    cur.camera = { x: cam.data.x, y: cam.data.y, zoom: cam.data.zoom };
            }
            S.currentBoardId = id;
            S.selection.clear();
            S.settings.lastBoardId = id;
            // Carrega câmera do board destino
            if (target.camera) {
                cam.data.x = target.camera.x || 0;
                cam.data.y = target.camera.y || 0;
                cam.data.zoom = target.camera.zoom || 1;
            }
            kernel.emit('board:navigated', { boardId: id, parentBoardId: target.parentBoardId });
            kernel.emit('selection:changed');
            kernel.emit('state:changed');
            kernel.emit('camera:changed');
        }
        function navigateUp() {
            const cur = current();
            if (!cur || !cur.parentBoardId)
                return;
            navigate(cur.parentBoardId);
        }
        function rename(id, name) {
            const b = getBoard(id);
            if (!b)
                return;
            b.name = uniqueName(name, id);
            b.updatedAt = Date.now();
            kernel.emit('boards:changed');
        }
        async function remove(id) {
            if (id === S.rootBoardId) {
                kernel.emit('toast', { message: 'Root board cannot be deleted.', kind: 'error' });
                return;
            }
            const b = getBoard(id);
            if (!b)
                return;
            const toDelete = new Set([id]);
            let changed = true;
            while (changed) {
                changed = false;
                for (const x of S.boards) {
                    if (!toDelete.has(x.id) && toDelete.has(x.parentBoardId)) {
                        toDelete.add(x.id);
                        changed = true;
                    }
                }
            }
            const ok = await kernel.call('ui.dialogs', 'confirm', {
                title: 'Delete board',
                message: 'Delete "' + b.name + '"' +
                    (toDelete.size > 1 ? ' and ' + (toDelete.size - 1) + ' nested board(s)' : '') + '?',
                danger: true
            });
            if (!ok)
                return;
            if (toDelete.has(S.currentBoardId)) {
                S.currentBoardId = b.parentBoardId || S.rootBoardId;
            }
            S.boards = S.boards.filter(x => !toDelete.has(x.id));
            for (const x of S.boards) {
                x.instances = x.instances.filter(i => !(i.type === 'board' && toDelete.has(i.boardId)));
            }
            kernel.emit('boards:changed');
            kernel.emit('state:changed');
            kernel.emit('camera:changed');
        }
        kernel.provide('boards', {
            create, getBoard, current, navigate, navigateUp, rename, remove,
            pathOf, depthOf
        });
    }
});
