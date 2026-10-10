"use strict";
/* =====================================================================
 * plugins/09b-manga-page.js
 * ---------------------------------------------------------------------
 * MangaPage = instância de um PanelSet no canvas.
 *
 * FASE 4:
 *   - duplicate(inst)              → clona a página + layers com novos ids
 *   - changePanelSet(inst, newId, options) → migração sem perda
 *   - promptChangePanelSet(inst)   → modal + migração
 *
 * FASE B:
 *   - insertLayerAt(inst, panelId, assetId, index)
 *       Insere uma camada numa POSIÇÃO ESPECÍFICA do array (0 = fundo).
 *       Reindexa zIndex de todas as camadas para 1..N.
 * ===================================================================== */
definePlugin({
    id: 'manga-page',
    version: '1.3.0',
    needs: ['utils', 'state', 'panelSets', 'history', 'panelMigration', 'svgGeometry'],
    provides: ['mangaPage'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'panelSets': '^1.0.0', 'history': '^1.0.0', 'panelMigration': '^1.0.0', 'svgGeometry': '^1.0.0' },
    contractVersions: { 'mangaPage': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const migration = await kernel.require('panelMigration');
        const svgGeometry = await kernel.require('svgGeometry');
        let focus = { instanceId: null, panelId: null };
        function getCurrentBoard() {
            for (let i = 0; i < S.boards.length; i++) {
                if (S.boards[i].id === S.currentBoardId)
                    return S.boards[i];
            }
            return S.boards[0] || null;
        }
        function nextZ() {
            const b = getCurrentBoard();
            if (!b)
                return 1;
            let max = 0;
            for (let i = 0; i < b.instances.length; i++) {
                max = Math.max(max, b.instances[i].zIndex || 0);
            }
            return max + 1;
        }
        function getPanelSet(inst) { return PS.get(inst.panelSetId); }
        function getPanel(inst, panelId) {
            if (!inst.panels)
                return null;
            for (let i = 0; i < inst.panels.length; i++) {
                if (inst.panels[i].id === panelId)
                    return inst.panels[i];
            }
            return null;
        }
        /* ---------------- Create instance ---------------- */
        async function addToBoard(panelSetId, worldX, worldY) {
            const ps = PS.get(panelSetId);
            if (!ps)
                return null;
            const before = await kernel.call('history', 'snapshot');
            const W = 480;
            const scale = W / ps.width;
            const H = Math.round(ps.height * scale);
            const inst = {
                id: utils.uid('inst'),
                type: 'manga-page',
                panelSetId: panelSetId,
                x: Math.round(worldX - W / 2),
                y: Math.round(worldY - H / 2),
                width: W,
                height: H,
                zIndex: nextZ(),
                rotation: 0,
                locked: false,
                visible: true,
                panels: ps.panels.map(function (p) { return { id: p.id, layers: [] }; }),
                overlays: [],
                unassignedPanels: []
            };
            const b = getCurrentBoard();
            if (!b)
                return null;
            b.instances.push(inst);
            S.selection.clear();
            S.selection.add(inst.id);
            focus.instanceId = inst.id;
            focus.panelId = ps.panels[0] ? ps.panels[0].id : null;
            await kernel.call('history', 'push', before);
            kernel.emit('manga-page:changed', { instanceId: inst.id });
            kernel.emit('manga-page:focus', { instanceId: focus.instanceId, panelId: focus.panelId });
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return inst;
        }
        /* ---------------- Duplicate ---------------- */
        async function duplicate(inst) {
            if (!inst || inst.type !== 'manga-page')
                return null;
            const b = getCurrentBoard();
            if (!b)
                return null;
            const before = await kernel.call('history', 'snapshot');
            const copy = JSON.parse(JSON.stringify(inst));
            copy.id = utils.uid('inst');
            copy.x = inst.x + 40;
            copy.y = inst.y + 40;
            copy.zIndex = nextZ();
            (copy.panels || []).forEach(function (p) {
                (p.layers || []).forEach(function (l) { l.id = utils.uid('layer'); });
            });
            (copy.overlays || []).forEach(function (l) { l.id = utils.uid('layer'); });
            (copy.unassignedPanels || []).forEach(function (entry) {
                entry.id = utils.uid('unassigned');
                (entry.layers || []).forEach(function (layer) { layer.id = utils.uid('layer'); });
            });
            b.instances.push(copy);
            S.selection.clear();
            S.selection.add(copy.id);
            await kernel.call('history', 'push', before);
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return copy;
        }
        /* ---------------- Safe template migration / recovery ---------------- */
        function validatePage(inst) {
            return migration.validatePage(inst, inst && PS.get(inst.panelSetId), S.assets);
        }
        function planPanelSetChange(inst, newPanelSetId, options) {
            const current = inst && PS.get(inst.panelSetId);
            const next = PS.get(newPanelSetId);
            if (!current || !next)
                throw new Error('Source or destination template not found');
            return migration.plan(inst, current, next, options);
        }
        function getUnassignedPanels(inst) {
            return (inst && Array.isArray(inst.unassignedPanels) ? inst.unassignedPanels : [])
                .filter(entry => entry && typeof entry.id === 'string')
                .map(function (entry) {
                const layers = Array.isArray(entry.layers) ? entry.layers : [];
                return { id: entry.id, sourcePanelId: entry.sourcePanelId || '(unknown)',
                    sourcePanelSetId: entry.sourcePanelSetId || '(unknown)',
                    layerCount: layers.length,
                    layers: layers.filter(Boolean).map(function (l) {
                        return { id: l.id, assetId: l.assetId };
                    }) };
            });
        }
        async function changePanelSet(inst, newPanelSetId, options) {
            if (!inst || inst.type !== 'manga-page')
                return false;
            if (inst.panelSetId === newPanelSetId)
                return false;
            const oldPs = PS.get(inst.panelSetId);
            const newPs = PS.get(newPanelSetId);
            if (!oldPs || !newPs)
                return false;
            return kernel.call('history', 'transaction', 'manga.changePanelSet', async function () {
                const next = migration.migrate(inst, oldPs, newPs, options, S.assets);
                inst.panelSetId = newPanelSetId;
                inst.panels = next.panels;
                inst.unassignedPanels = next.unassignedPanels;
                const newAspect = newPs.width / newPs.height;
                if (newAspect > 0 && isFinite(newAspect)) {
                    inst.height = Math.max(1, Math.round(inst.width / newAspect));
                }
                if (focus.instanceId === inst.id) {
                    const exists = inst.panels.some(function (p) { return p.id === focus.panelId; });
                    if (!exists)
                        focus.panelId = inst.panels[0] ? inst.panels[0].id : null;
                }
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('manga-page:focus', getFocus());
                kernel.emit('instances:changed');
                kernel.emit('state:changed');
                return true;
            });
        }
        async function recoverUnassignedPanel(inst, archiveId, targetPanelId) {
            if (!inst || inst.type !== 'manga-page')
                return false;
            const ps = PS.get(inst.panelSetId);
            if (!ps)
                return false;
            return kernel.call('history', 'transaction', 'manga.recoverLayers', async function () {
                const recovered = migration.recover(inst, ps, archiveId, targetPanelId, S.assets);
                if (!recovered)
                    return false;
                inst.panels = recovered.panels;
                inst.unassignedPanels = recovered.unassignedPanels;
                if (focus.instanceId === inst.id)
                    focus.panelId = targetPanelId;
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('manga-page:focus', getFocus());
                kernel.emit('state:changed');
                return true;
            });
        }
        // An explicit mapping UI prevents accidental loss and makes merging discoverable.
        function promptPanelMapping(inst, newPs) {
            const proposal = planPanelSetChange(inst, newPs.id);
            return new Promise(function (resolve) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                const backdrop = document.createElement('div');
                backdrop.className = 'modal-backdrop';
                modal.appendChild(backdrop);
                const dlg = document.createElement('div');
                dlg.className = 'dialog panel-migration-dialog';
                dlg.setAttribute('role', 'dialog');
                dlg.setAttribute('aria-modal', 'true');
                const h = document.createElement('h3');
                h.textContent = 'Mapear painéis para ' + newPs.name;
                dlg.appendChild(h);
                const info = document.createElement('p');
                info.textContent = 'Selecione o destino de cada painel. Se escolher Recuperar depois, nenhuma camada será apagada; ela ficará guardada no Inspetor.';
                dlg.appendChild(info);
                const selects = [];
                const controls = document.createElement('div');
                controls.className = 'panel-migration-mappings';
                (inst.panels || []).forEach(function (old, i) {
                    const row = document.createElement('label');
                    row.className = 'panel-migration-row';
                    const label = document.createElement('span');
                    label.textContent = 'Painel ' + (i + 1) + ' (' + old.layers.length + ' camadas)';
                    const select = document.createElement('select');
                    const keep = document.createElement('option');
                    keep.value = '';
                    keep.textContent = 'Recuperar depois (sem destino)';
                    select.appendChild(keep);
                    newPs.panels.forEach(function (target, j) {
                        const option = document.createElement('option');
                        option.value = target.id;
                        option.textContent = 'Painel destino ' + (j + 1);
                        select.appendChild(option);
                    });
                    select.value = proposal.mapping[old.id] || '';
                    row.appendChild(label);
                    row.appendChild(select);
                    controls.appendChild(row);
                    selects.push({ id: old.id, select: select });
                });
                dlg.appendChild(controls);
                const summary = document.createElement('p');
                summary.className = 'panel-migration-summary';
                dlg.appendChild(summary);
                function refreshSummary() {
                    const unassigned = selects.filter(x => !x.select.value).reduce(function (total, x) {
                        const p = inst.panels.find(p => p.id === x.id);
                        return total + (p ? p.layers.length : 0);
                    }, 0);
                    summary.textContent = unassigned
                        ? unassigned + ' camadas ficarão na área Recuperar depois.'
                        : 'Todas as camadas serão atribuídas aos painéis de destino.';
                }
                selects.forEach(x => x.select.addEventListener('change', refreshSummary));
                refreshSummary();
                const actions = document.createElement('div');
                actions.className = 'dialog-actions';
                const cancel = document.createElement('button');
                cancel.className = 'btn';
                cancel.type = 'button';
                cancel.textContent = 'Cancelar';
                const apply = document.createElement('button');
                apply.className = 'btn primary';
                apply.type = 'button';
                apply.textContent = 'Aplicar sem perder camadas';
                actions.appendChild(cancel);
                actions.appendChild(apply);
                dlg.appendChild(actions);
                modal.appendChild(dlg);
                let finished = false;
                function finish(result) {
                    if (finished)
                        return;
                    finished = true;
                    document.removeEventListener('keydown', onKey);
                    modal.remove();
                    resolve(result);
                }
                function onKey(e) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        finish(null);
                    }
                }
                document.addEventListener('keydown', onKey);
                backdrop.addEventListener('click', () => finish(null));
                cancel.addEventListener('click', () => finish(null));
                apply.addEventListener('click', function () {
                    const mapping = {};
                    selects.forEach(x => { mapping[x.id] = x.select.value || null; });
                    finish({ mapping: mapping });
                });
                document.body.appendChild(modal);
            });
        }
        async function promptChangePanelSet(inst) {
            if (!inst || inst.type !== 'manga-page')
                return false;
            const picked = await PS.promptPick({
                excludeId: inst.panelSetId,
                title: 'Change panel set',
                subtitle: 'As camadas excedentes são preservadas. Na próxima etapa você pode remapear os painéis.'
            });
            if (!picked)
                return false;
            const options = await promptPanelMapping(inst, picked);
            if (!options)
                return false;
            try {
                const success = await changePanelSet(inst, picked.id, options);
                if (success) {
                    const n = getUnassignedPanels(inst).reduce((count, p) => count + p.layerCount, 0);
                    if (n)
                        kernel.emit('toast', { message: n + ' camada(s) preservadas em Recuperar depois no Inspetor.', kind: 'ok' });
                }
                return success;
            }
            catch (err) {
                kernel.log.error('panel set migration failed', err);
                kernel.emit('toast', { message: 'Falha ao trocar painéis: ' + err.message, kind: 'error' });
                return false;
            }
        }
        kernel.on('history:applied', function () {
            if (!focus.instanceId)
                return;
            const inst = S.boards.flatMap(b => b.instances).find(i => i.id === focus.instanceId);
            if (!inst || inst.type !== 'manga-page') {
                clearFocus();
                return;
            }
            if (focus.panelId !== '__overlay__' && !(inst.panels || []).some(p => p.id === focus.panelId)) {
                focus.panelId = inst.panels[0] ? inst.panels[0].id : null;
                kernel.emit('manga-page:focus', getFocus());
            }
        });
        /* ---------------- Layers ---------------- */
        function targetArray(inst, panelId) {
            if (panelId === '__overlay__')
                return inst.overlays;
            const panel = getPanel(inst, panelId);
            return panel ? panel.layers : null;
        }
        async function addLayer(inst, panelId, assetId, opts) {
            return kernel.call('history', 'transaction', 'manga.addLayer', async function () {
                if (!inst || inst.type !== 'manga-page')
                    return null;
                const ps = getPanelSet(inst);
                if (!ps)
                    return null;
                const arr = targetArray(inst, panelId);
                if (!arr)
                    return null;
                opts = opts || {};
                const asset = S.assets.find(function (a) { return a.id === assetId; });
                const natW = asset ? (asset.originalWidth || 320) : 320;
                const natH = asset ? (asset.originalHeight || 240) : 240;
                const defW = opts.width !== undefined ? opts.width : Math.round(ps.width * 0.5);
                const defH = opts.height !== undefined ? opts.height : Math.round(defW * (natH / natW));
                const layer = {
                    id: utils.uid('layer'),
                    assetId: assetId,
                    x: opts.x !== undefined ? opts.x : Math.round((ps.width - defW) / 2),
                    y: opts.y !== undefined ? opts.y : Math.round((ps.height - defH) / 2),
                    width: defW,
                    height: defH,
                    rotation: 0,
                    opacity: 1,
                    zIndex: arr.length + 1
                };
                arr.push(layer);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return layer;
            });
        }
        /**
         * FASE B — insere uma camada numa posição específica do array.
         * @param {Object} inst
         * @param {string} panelId  id do painel OU '__overlay__'
         * @param {string} assetId
         * @param {number} index    0 = fundo; arr.length = topo. Clampado.
         */
        async function insertLayerAt(inst, panelId, assetId, index) {
            return kernel.call('history', 'transaction', 'manga.insertLayerAt', async function () {
                if (!inst || inst.type !== 'manga-page')
                    return null;
                const ps = getPanelSet(inst);
                if (!ps)
                    return null;
                const arr = targetArray(inst, panelId);
                if (!arr)
                    return null;
                index = Math.max(0, Math.min(arr.length, index | 0));
                const asset = S.assets.find(function (a) { return a.id === assetId; });
                if (!asset)
                    return null;
                const natW = asset.originalWidth || 320;
                const natH = asset.originalHeight || 240;
                const defW = ps.width * 0.4;
                const defH = defW * (natH / natW);
                const layer = {
                    id: utils.uid('layer'),
                    assetId: assetId,
                    x: Math.round((ps.width - defW) / 2),
                    y: Math.round((ps.height - defH) / 2),
                    width: Math.round(defW),
                    height: Math.round(defH),
                    rotation: 0,
                    opacity: 1,
                    zIndex: 0 // corrigido abaixo
                };
                arr.splice(index, 0, layer);
                arr.forEach(function (l, i) { l.zIndex = i + 1; });
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return layer;
            });
        }
        function addOverlayLayer(inst, assetId, opts) {
            return addLayer(inst, '__overlay__', assetId, opts);
        }
        async function removeLayer(inst, panelId, layerId) {
            return kernel.call('history', 'transaction', 'manga.removeLayer', async function () {
                if (!inst)
                    return;
                const arr = targetArray(inst, panelId);
                if (!arr)
                    return;
                const idx = arr.findIndex(function (l) { return l.id === layerId; });
                if (idx === -1)
                    return;
                arr.splice(idx, 1);
                arr.forEach(function (l, i) { l.zIndex = i + 1; });
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
            });
        }
        async function updateLayer(inst, panelId, layerId, patch) {
            return kernel.call('history', 'transaction', 'manga.updateLayer', async function () {
                if (!inst)
                    return;
                const arr = targetArray(inst, panelId);
                if (!arr)
                    return;
                const layer = arr.find(function (l) { return l.id === layerId; });
                if (!layer)
                    return;
                Object.assign(layer, patch);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
            });
        }
        async function reorderLayer(inst, panelId, layerId, mode) {
            return kernel.call('history', 'transaction', 'manga.reorderLayer', async function () {
                if (!inst)
                    return;
                const arr = targetArray(inst, panelId);
                if (!arr)
                    return;
                arr.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
                const i = arr.findIndex(function (l) { return l.id === layerId; });
                if (i === -1)
                    return;
                if (mode === 'front') {
                    const item = arr.splice(i, 1)[0];
                    arr.push(item);
                }
                else if (mode === 'back') {
                    const item = arr.splice(i, 1)[0];
                    arr.unshift(item);
                }
                else if (mode === 'forward' && i < arr.length - 1) {
                    const t = arr[i];
                    arr[i] = arr[i + 1];
                    arr[i + 1] = t;
                }
                else if (mode === 'backward' && i > 0) {
                    const t = arr[i];
                    arr[i] = arr[i - 1];
                    arr[i - 1] = t;
                }
                arr.forEach(function (l, idx) { l.zIndex = idx + 1; });
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
            });
        }
        async function reorderLayerTo(inst, panelId, draggedId, targetId, position) {
            return kernel.call('history', 'transaction', 'manga.reorderLayerTo', async function () {
                if (!inst)
                    return false;
                if (draggedId === targetId)
                    return false;
                const arr = targetArray(inst, panelId);
                if (!arr)
                    return false;
                arr.sort(function (a, b) { return (a.zIndex || 0) - (b.zIndex || 0); });
                const fromIdx = arr.findIndex(function (l) { return l.id === draggedId; });
                if (fromIdx === -1)
                    return false;
                const moved = arr.splice(fromIdx, 1)[0];
                const toIdx = arr.findIndex(function (l) { return l.id === targetId; });
                if (toIdx === -1) {
                    arr.push(moved);
                }
                else {
                    if (position === 'before') {
                        arr.splice(toIdx + 1, 0, moved);
                    }
                    else {
                        arr.splice(toIdx, 0, moved);
                    }
                }
                arr.forEach(function (l, i) { l.zIndex = i + 1; });
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        /* ---------------- Focus ---------------- */
        function getFocus() { return { instanceId: focus.instanceId, panelId: focus.panelId }; }
        function setFocus(instanceId, panelId) {
            focus.instanceId = instanceId || null;
            focus.panelId = panelId || null;
            kernel.emit('manga-page:focus', { instanceId: focus.instanceId, panelId: focus.panelId });
        }
        function clearFocus() {
            focus.instanceId = null;
            focus.panelId = null;
            kernel.emit('manga-page:focus', { instanceId: null, panelId: null });
        }
        function getActivePanelId(inst) {
            if (!inst || focus.instanceId !== inst.id)
                return null;
            return focus.panelId;
        }
        /* ---------------- Hit testing ---------------- */
        function hitTestMangaPage(worldX, worldY) {
            const b = getCurrentBoard();
            if (!b)
                return null;
            const sorted = b.instances
                .filter(function (i) { return i.type === 'manga-page' && i.visible !== false; })
                .sort(function (a, b) { return (b.zIndex || 0) - (a.zIndex || 0); });
            for (let k = 0; k < sorted.length; k++) {
                const inst = sorted[k];
                if (worldX >= inst.x && worldX <= inst.x + inst.width &&
                    worldY >= inst.y && worldY <= inst.y + inst.height) {
                    return inst;
                }
            }
            return null;
        }
        /* Compounds honor evenodd/nonzero winding (including internal holes). */
        function hitTestPanel(inst, worldX, worldY) {
            const ps = getPanelSet(inst);
            if (!ps)
                return null;
            const scale = inst.width / ps.width;
            const px = (worldX - inst.x) / scale;
            const py = (worldY - inst.y) / scale;
            for (let i = ps.panels.length - 1; i >= 0; i--) {
                const p = ps.panels[i];
                if (svgGeometry.contains(p, px, py))
                    return p.id;
            }
            return null;
        }
        async function tryDrop(assetId, worldX, worldY) {
            const inst = hitTestMangaPage(worldX, worldY);
            if (!inst)
                return false;
            const ps = getPanelSet(inst);
            if (!ps)
                return false;
            const panelId = hitTestPanel(inst, worldX, worldY);
            const isOverlay = !panelId;
            const targetPanelId = panelId || '__overlay__';
            const before = await kernel.call('history', 'snapshot');
            const scale = inst.width / ps.width;
            const localX = (worldX - inst.x) / scale;
            const localY = (worldY - inst.y) / scale;
            const asset = S.assets.find(function (a) { return a.id === assetId; });
            const natW = asset ? (asset.originalWidth || 320) : 320;
            const natH = asset ? (asset.originalHeight || 240) : 240;
            const defW = ps.width * 0.4;
            const defH = defW * (natH / natW);
            const arr = targetArray(inst, targetPanelId);
            if (!arr)
                return false;
            const layer = {
                id: utils.uid('layer'),
                assetId: assetId,
                x: Math.round(localX - defW / 2),
                y: Math.round(localY - defH / 2),
                width: Math.round(defW),
                height: Math.round(defH),
                rotation: 0,
                opacity: 1,
                zIndex: arr.length + 1
            };
            arr.push(layer);
            if (!isOverlay) {
                focus.instanceId = inst.id;
                focus.panelId = targetPanelId;
            }
            await kernel.call('history', 'push', before);
            kernel.emit('manga-page:changed', { instanceId: inst.id });
            kernel.emit('manga-page:focus', { instanceId: focus.instanceId, panelId: focus.panelId });
            kernel.emit('state:changed');
            return true;
        }
        kernel.provide('mangaPage', {
            addToBoard: addToBoard,
            duplicate: duplicate,
            changePanelSet: changePanelSet,
            planPanelSetChange: planPanelSetChange,
            recoverUnassignedPanel: recoverUnassignedPanel,
            getUnassignedPanels: getUnassignedPanels,
            validatePage: validatePage,
            promptChangePanelSet: promptChangePanelSet,
            getPanelSet: getPanelSet,
            getPanel: getPanel,
            addLayer: addLayer,
            insertLayerAt: insertLayerAt,
            addOverlayLayer: addOverlayLayer,
            removeLayer: removeLayer,
            updateLayer: updateLayer,
            reorderLayer: reorderLayer,
            reorderLayerTo: reorderLayerTo,
            getFocus: getFocus,
            setFocus: setFocus,
            clearFocus: clearFocus,
            getActivePanelId: getActivePanelId,
            hitTestMangaPage: hitTestMangaPage,
            hitTestPanel: hitTestPanel,
            tryDrop: tryDrop
        });
    }
});
