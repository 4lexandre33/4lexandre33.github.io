"use strict";
definePlugin({
    id: 'instances',
    version: '1.2.0',
    needs: ['utils', 'state', 'boards', 'camera'],
    provides: ['instances'],
    uses: ['history', 'ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'boards': '^1.0.0', 'camera': '^1.0.0', 'history': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'instances': '1.1.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const stateApi = await kernel.require('state');
        const S = stateApi.data;
        const camera = await kernel.require('camera');
        function nextZ() {
            let max = 0;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return 1;
            for (const i of b.instances)
                max = Math.max(max, i.zIndex || 0);
            return max + 1;
        }
        function defaultSize(asset) {
            const zoom = camera.data.zoom;
            const comp = Math.max(0.5, Math.min(3, 1 / zoom));
            const maxW = 280 * comp, maxH = 280 * comp;
            let w = asset.originalWidth || 320, h = asset.originalHeight || 240;
            const scale = Math.min(maxW / w, maxH / h, 1);
            return { width: Math.max(24, Math.round(w * scale)), height: Math.max(24, Math.round(h * scale)) };
        }
        async function addImage(assetId, worldX, worldY) {
            const asset = S.assets.find(a => a.id === assetId);
            if (!asset)
                return null;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return null;
            const before = await kernel.call('history', 'snapshot');
            const size = defaultSize(asset);
            const inst = {
                id: utils.uid('inst'), type: 'image', assetId,
                x: Math.round(worldX - size.width / 2),
                y: Math.round(worldY - size.height / 2),
                width: size.width, height: size.height,
                zIndex: nextZ(), rotation: 0, locked: false, visible: true
            };
            b.instances.push(inst);
            S.selection.clear();
            S.selection.add(inst.id);
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return inst;
        }
        async function addBoard(boardId, worldX, worldY) {
            const b = stateApi.getCurrentBoard();
            if (!b)
                return null;
            const before = await kernel.call('history', 'snapshot');
            // Board card compacto: só ícone + nome
            const W = 180, H = 130;
            const inst = {
                id: utils.uid('inst'), type: 'board', boardId,
                x: Math.round(worldX - W / 2),
                y: Math.round(worldY - H / 2),
                width: W, height: H,
                zIndex: nextZ(), rotation: 0, locked: false, visible: true
            };
            b.instances.push(inst);
            S.selection.clear();
            S.selection.add(inst.id);
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return inst;
        }
        async function removeSelection() {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const ids = Array.from(S.selection);
            const links = ids.map(id => b.instances.find(i => i.id === id))
                .filter((i) => !!i && i.type === 'board');
            let alsoDelete = false;
            if (links.length) {
                const deletable = links.filter(l => l.boardId !== S.rootBoardId);
                if (deletable.length) {
                    alsoDelete = await kernel.call('ui.dialogs', 'confirm', {
                        title: 'Delete board link',
                        message: 'Also delete the target board(s) and their contents? ' +
                            'Cancel = remove only the link.',
                        danger: true
                    });
                }
            }
            const before = await kernel.call('history', 'snapshot');
            if (alsoDelete) {
                const doomed = new Set();
                for (const l of links) {
                    if (l.boardId === S.rootBoardId)
                        continue;
                    doomed.add(l.boardId);
                    let ch = true;
                    while (ch) {
                        ch = false;
                        for (const x of S.boards) {
                            if (!doomed.has(x.id) && doomed.has(x.parentBoardId)) {
                                doomed.add(x.id);
                                ch = true;
                            }
                        }
                    }
                }
                S.boards = S.boards.filter(x => !doomed.has(x.id));
                for (const x of S.boards) {
                    x.instances = x.instances.filter(i => !(i.type === 'board' && doomed.has(i.boardId)));
                }
            }
            const set = new Set(ids);
            b.instances = b.instances.filter(i => !set.has(i.id));
            S.selection.clear();
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
        }
        async function duplicateSelection() {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const before = await kernel.call('history', 'snapshot');
            const created = [];
            for (const id of Array.from(S.selection)) {
                const src = b.instances.find(i => i.id === id);
                if (!src)
                    continue;
                const copy = Object.assign({}, src, {
                    id: utils.uid('inst'),
                    x: src.x + 24, y: src.y + 24,
                    zIndex: nextZ()
                });
                b.instances.push(copy);
                created.push(copy.id);
            }
            S.selection.clear();
            created.forEach(id => S.selection.add(id));
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
        }
        async function reorder(mode) {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const before = await kernel.call('history', 'snapshot');
            const all = b.instances.slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            const sel = all.filter(i => S.selection.has(i.id));
            if (mode === 'front') {
                let z = nextZ();
                sel.forEach(i => i.zIndex = z++);
            }
            else if (mode === 'back') {
                const min = all.length ? (all[0].zIndex || 0) : 0;
                let z = min - sel.length;
                sel.forEach(i => i.zIndex = z++);
            }
            else if (mode === 'forward') {
                for (let i = all.length - 2; i >= 0; i--) {
                    if (S.selection.has(all[i].id) && !S.selection.has(all[i + 1].id)) {
                        const t = all[i].zIndex;
                        Object.assign(all[i], { zIndex: all[i + 1].zIndex });
                        Object.assign(all[i + 1], { zIndex: t });
                        const tmp = all[i];
                        all[i] = all[i + 1];
                        all[i + 1] = tmp;
                    }
                }
            }
            else if (mode === 'backward') {
                for (let i = 1; i < all.length; i++) {
                    if (S.selection.has(all[i].id) && !S.selection.has(all[i - 1].id)) {
                        const t = all[i].zIndex;
                        Object.assign(all[i], { zIndex: all[i - 1].zIndex });
                        Object.assign(all[i - 1], { zIndex: t });
                        const tmp = all[i];
                        all[i] = all[i - 1];
                        all[i - 1] = tmp;
                    }
                }
            }
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
        }
        async function rotateSelection() {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const before = await kernel.call('history', 'snapshot');
            for (const id of S.selection) {
                const i = b.instances.find(x => x.id === id);
                if (i)
                    i.rotation = ((i.rotation || 0) + 90) % 360;
            }
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
        }
        async function restoreAspect() {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const before = await kernel.call('history', 'snapshot');
            let changed = false;
            for (const id of S.selection) {
                const i = b.instances.find(x => x.id === id);
                if (!i || i.type === 'board')
                    continue;
                const a = S.assets.find(x => x.id === i.assetId);
                if (!a)
                    continue;
                const ratio = (a.originalWidth || 1) / (a.originalHeight || 1);
                const newH = Math.round(i.width / ratio);
                if (Math.abs(newH - i.height) > 0.5) {
                    i.height = newH;
                    changed = true;
                }
            }
            if (changed) {
                await kernel.call('history', 'push', before);
                kernel.emit('instances:changed');
            }
        }
        async function nudge(dx, dy) {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const before = await kernel.call('history', 'snapshot');
            for (const id of S.selection) {
                const i = b.instances.find(x => x.id === id);
                if (i && !i.locked) {
                    i.x += dx;
                    i.y += dy;
                }
            }
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
        }
        let clipboard = [];
        function copySelection() {
            if (!S.selection.size)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            clipboard = b.instances.filter(i => S.selection.has(i.id)).map(i => JSON.parse(JSON.stringify(i)));
            kernel.emit('toast', { message: clipboard.length + ' copied.' });
        }
        async function pasteClipboard() {
            if (!clipboard.length)
                return;
            const b = stateApi.getCurrentBoard();
            if (!b)
                return;
            const before = await kernel.call('history', 'snapshot');
            const created = [];
            for (const src of clipboard) {
                const copy = Object.assign({}, src, {
                    id: utils.uid('inst'),
                    x: src.x + 28, y: src.y + 28,
                    zIndex: nextZ()
                });
                b.instances.push(copy);
                created.push(copy.id);
            }
            S.selection.clear();
            created.forEach(id => S.selection.add(id));
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
        }
        // ---- Additive v1.1: operations addressed by instance id (no dependency on the UI selection).
        function findOnCurrent(id) {
            const b = stateApi.getCurrentBoard();
            return b ? (b.instances.find(i => i.id === id) || null) : null;
        }
        /** Replaces the selection with the given ids (unknown ids are ignored). Returns the ids actually selected. */
        function selectByIds(ids) {
            const b = stateApi.getCurrentBoard();
            const present = new Set((b ? b.instances : []).map(i => i.id));
            const next = Array.from(new Set(ids)).filter(id => present.has(id));
            S.selection.clear();
            next.forEach(id => S.selection.add(id));
            kernel.emit('selection:changed');
            return next;
        }
        function clearSelection() {
            S.selection.clear();
            kernel.emit('selection:changed');
        }
        /** Moves/resizes/rotates one instance. Locked instances are rejected. Undoable. */
        async function updateById(id, patch) {
            const inst = findOnCurrent(id);
            if (!inst || !patch || typeof patch !== 'object')
                return false;
            const geometry = ['x', 'y', 'width', 'height', 'rotation'];
            const touchesGeometry = geometry.some(k => patch[k] !== undefined);
            if (inst.locked && touchesGeometry && patch.locked !== false)
                throw Error('Instance is locked');
            for (const k of geometry) {
                const v = patch[k];
                if (v !== undefined && !Number.isFinite(v))
                    throw Error(k + ' must be a finite number');
            }
            if (patch.width !== undefined && patch.width < 8)
                throw Error('width must be at least 8');
            if (patch.height !== undefined && patch.height < 8)
                throw Error('height must be at least 8');
            const before = await kernel.call('history', 'snapshot');
            let changed = false;
            const set = (k, v) => { if (v !== undefined && inst[k] !== v) {
                inst[k] = v;
                changed = true;
            } };
            set('x', patch.x);
            set('y', patch.y);
            set('width', patch.width);
            set('height', patch.height);
            if (patch.rotation !== undefined) {
                const r = ((patch.rotation % 360) + 360) % 360;
                if ((inst.rotation || 0) !== r) {
                    inst.rotation = r;
                    changed = true;
                }
            }
            if (typeof patch.visible === 'boolean' && inst.visible !== patch.visible) {
                inst.visible = patch.visible;
                changed = true;
            }
            if (typeof patch.locked === 'boolean' && inst.locked !== patch.locked) {
                inst.locked = patch.locked;
                changed = true;
            }
            if (!changed)
                return false;
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return true;
        }
        /** Removes one instance. A board link is removed without deleting its target board. Undoable. */
        async function removeById(id) {
            const b = stateApi.getCurrentBoard();
            const inst = findOnCurrent(id);
            if (!b || !inst)
                return false;
            if (inst.locked)
                throw Error('Instance is locked');
            const before = await kernel.call('history', 'snapshot');
            b.instances = b.instances.filter(i => i.id !== id);
            S.selection.delete(id);
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            kernel.emit('selection:changed');
            return true;
        }
        /** Duplicates one instance (offset by 24) and returns the copy's id. Undoable. */
        async function duplicateById(id) {
            const b = stateApi.getCurrentBoard();
            const src = findOnCurrent(id);
            if (!b || !src)
                return null;
            const before = await kernel.call('history', 'snapshot');
            const copy = Object.assign(JSON.parse(JSON.stringify(src)), {
                id: utils.uid('inst'), x: src.x + 24, y: src.y + 24, zIndex: nextZ()
            });
            b.instances.push(copy);
            S.selection.clear();
            S.selection.add(copy.id);
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            kernel.emit('selection:changed');
            return copy.id;
        }
        /** Reorders one instance in z-order. Reuses the selection-based algorithm so both paths stay identical. */
        async function reorderById(id, mode) {
            if (!findOnCurrent(id))
                return false;
            const keep = Array.from(S.selection);
            S.selection.clear();
            S.selection.add(id);
            try {
                await reorder(mode);
            }
            finally {
                S.selection.clear();
                keep.forEach(k => S.selection.add(k));
            }
            return true;
        }
        /** Aligns the given instances to their common bounds. Locked instances are skipped. Undoable. */
        async function align(ids, mode) {
            const list = ids.map(findOnCurrent).filter((i) => !!i);
            if (list.length < 2)
                return 0;
            const bb = camera.bounds(list);
            if (!bb)
                return 0;
            const before = await kernel.call('history', 'snapshot');
            let moved = 0;
            for (const i of list) {
                if (i.locked)
                    continue;
                const ox = i.x, oy = i.y;
                if (mode === 'left')
                    i.x = bb.minX;
                else if (mode === 'right')
                    i.x = bb.maxX - i.width;
                else if (mode === 'center')
                    i.x = Math.round((bb.minX + bb.maxX) / 2 - i.width / 2);
                else if (mode === 'top')
                    i.y = bb.minY;
                else if (mode === 'bottom')
                    i.y = bb.maxY - i.height;
                else if (mode === 'middle')
                    i.y = Math.round((bb.minY + bb.maxY) / 2 - i.height / 2);
                else
                    throw Error('Unknown alignment: ' + String(mode));
                if (i.x !== ox || i.y !== oy)
                    moved++;
            }
            if (!moved)
                return 0;
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return moved;
        }
        /** Distributes 3+ instances with equal gaps along an axis. Locked instances are skipped. Undoable. */
        async function distribute(ids, axis) {
            const list = ids.map(findOnCurrent).filter((i) => !!i);
            if (list.length < 3)
                return 0;
            const h = axis === 'horizontal';
            const sorted = list.slice().sort((a, b) => h ? a.x - b.x : a.y - b.y);
            const first = sorted[0], last = sorted[sorted.length - 1];
            const total = h ? (last.x + last.width) - first.x : (last.y + last.height) - first.y;
            const sizes = sorted.reduce((n, i) => n + (h ? i.width : i.height), 0);
            const gap = (total - sizes) / (sorted.length - 1);
            const before = await kernel.call('history', 'snapshot');
            let cursor = h ? first.x : first.y, moved = 0;
            for (const i of sorted) {
                const target = Math.round(cursor);
                if (!i.locked && (h ? i.x : i.y) !== target) {
                    if (h)
                        i.x = target;
                    else
                        i.y = target;
                    moved++;
                }
                cursor += (h ? i.width : i.height) + gap;
            }
            if (!moved)
                return 0;
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return moved;
        }
        kernel.provide('instances', {
            addImage, addBoard, removeSelection, duplicateSelection,
            reorder, rotateSelection, restoreAspect, nudge,
            copySelection, pasteClipboard,
            selectByIds, clearSelection, updateById, removeById, duplicateById,
            reorderById, align, distribute
        });
    }
});
