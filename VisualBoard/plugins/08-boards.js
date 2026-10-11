"use strict";
/* TS-009: typed board hierarchy, navigation and deletion logic. */
definePlugin({
    id: 'boards',
    version: '1.2.0',
    needs: ['utils', 'state', 'camera'],
    provides: ['boards'],
    uses: ['ui.dialogs', 'history'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0', 'history': '^1.0.0' },
    contractVersions: { 'boards': '1.1.0' },
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
        /** Flat, ordered view of every board (additive, v1.1). */
        function list() {
            return S.boards.map(b => ({
                id: b.id, name: b.name, parentBoardId: b.parentBoardId || null,
                depth: depthOf(b.id), instanceCount: b.instances.length,
                isRoot: b.id === S.rootBoardId, isCurrent: b.id === S.currentBoardId
            }));
        }
        function descendantsOf(id) {
            const out = new Set([id]);
            let changed = true;
            while (changed) {
                changed = false;
                for (const x of S.boards) {
                    if (!out.has(x.id) && x.parentBoardId && out.has(x.parentBoardId)) {
                        out.add(x.id);
                        changed = true;
                    }
                }
            }
            return out;
        }
        /**
         * Duplicates a board and every nested board. Board-link instances that point into the copied
         * subtree are remapped to the copies; links to boards outside it keep their target.
         * Undoable. The root board cannot be duplicated (it has no parent to receive the copy).
         */
        async function duplicate(id) {
            const src = getBoard(id);
            if (!src)
                return null;
            if (id === S.rootBoardId)
                throw Error('The root board cannot be duplicated');
            const subtree = descendantsOf(id);
            const before = await kernel.call('history', 'snapshot');
            const map = new Map();
            for (const old of subtree)
                map.set(old, utils.uid('board'));
            const copies = [];
            for (const old of S.boards) {
                if (!subtree.has(old.id))
                    continue;
                const copy = JSON.parse(JSON.stringify(old));
                copy.id = map.get(old.id);
                copy.parentBoardId = old.id === id ? old.parentBoardId : (map.get(old.parentBoardId) || old.parentBoardId);
                copy.name = uniqueName(old.id === id ? old.name + ' copy' : old.name);
                copy.createdAt = Date.now();
                copy.updatedAt = Date.now();
                copy.instances = copy.instances.map(inst => {
                    inst.id = utils.uid('inst');
                    if (inst.type === 'board' && map.has(inst.boardId))
                        inst.boardId = map.get(inst.boardId);
                    return inst;
                });
                S.boards.push(copy);
                copies.push(copy);
            }
            // Unique names are checked against the live list, so later copies see earlier ones.
            await kernel.call('history', 'push', before);
            kernel.emit('boards:changed');
            kernel.emit('state:changed');
            return map.get(id);
        }
        /** Moves a board among its siblings by `delta` positions (negative = earlier). Undoable. */
        async function move(id, delta) {
            const b = getBoard(id);
            if (!b || !Number.isInteger(delta) || delta === 0)
                return false;
            const parent = b.parentBoardId || null;
            const sibs = S.boards.filter(x => (x.parentBoardId || null) === parent);
            const from = sibs.findIndex(x => x.id === id);
            const to = Math.max(0, Math.min(sibs.length - 1, from + delta));
            if (to === from)
                return false;
            const before = await kernel.call('history', 'snapshot');
            const target = sibs[to];
            const [moved] = S.boards.splice(S.boards.indexOf(b), 1);
            S.boards.splice(S.boards.indexOf(target) + (to > from ? 1 : 0), 0, moved);
            await kernel.call('history', 'push', before);
            kernel.emit('boards:changed');
            kernel.emit('state:changed');
            return true;
        }
        /** Updates name and/or saved camera of a board. Undoable. */
        async function update(id, patch) {
            const b = getBoard(id);
            if (!b || !patch || typeof patch !== 'object')
                return false;
            const before = await kernel.call('history', 'snapshot');
            let changed = false;
            if (typeof patch.name === 'string' && patch.name.trim()) {
                const name = uniqueName(patch.name.trim().slice(0, 120), id);
                if (name !== b.name) {
                    b.name = name;
                    changed = true;
                }
            }
            if (patch.camera) {
                const c = patch.camera, cur = b.camera || { x: 0, y: 0, zoom: 1 };
                const next = {
                    x: Number.isFinite(c.x) ? Number(c.x) : cur.x,
                    y: Number.isFinite(c.y) ? Number(c.y) : cur.y,
                    zoom: Number.isFinite(c.zoom) ? Math.max(cam.MIN_ZOOM, Math.min(cam.MAX_ZOOM, Number(c.zoom))) : cur.zoom
                };
                if (next.x !== cur.x || next.y !== cur.y || next.zoom !== cur.zoom) {
                    b.camera = next;
                    changed = true;
                    if (id === S.currentBoardId) {
                        cam.data.x = next.x;
                        cam.data.y = next.y;
                        cam.data.zoom = next.zoom;
                        kernel.emit('camera:changed');
                    }
                }
            }
            if (!changed)
                return false;
            b.updatedAt = Date.now();
            await kernel.call('history', 'push', before);
            kernel.emit('boards:changed');
            kernel.emit('state:changed');
            return true;
        }
        kernel.provide('boards', {
            create, getBoard, current, navigate, navigateUp, rename, remove,
            pathOf, depthOf, list, duplicate, move, update
        });
    }
});
