"use strict";
definePlugin({
    id: 'instances',
    version: '1.1.0',
    needs: ['utils', 'state', 'boards', 'camera'],
    provides: ['instances'],
    uses: ['history', 'ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'boards': '^1.0.0', 'camera': '^1.0.0', 'history': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'instances': '1.0.0' },
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
        kernel.provide('instances', {
            addImage, addBoard, removeSelection, duplicateSelection,
            reorder, rotateSelection, restoreAspect, nudge,
            copySelection, pasteClipboard
        });
    }
});
