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
            const idChanges = new Map();
            const remap = (kind, old, next) => {
                idChanges.set(kind + ':' + old, kind + ':' + next);
            };
            (copy.vp1MangaEffects || []).forEach(e => {
                const old = e.id;
                e.id = utils.uid('fx');
                remap('drawing', old, e.id);
            });
            (copy.vp1Balloons || []).forEach(b => {
                const old = b.id;
                b.id = utils.uid('balloon');
                remap('balloon', old, b.id);
            });
            (copy.vp1HorizontalTexts || []).forEach(t => {
                const old = t.id;
                t.id = utils.uid('text');
                remap('text', old, t.id);
            });
            (copy.panels || []).forEach(function (p) {
                (p.layers || []).forEach(function (l) {
                    const old = l.id;
                    l.id = utils.uid('layer');
                    remap('image', old, l.id);
                });
            });
            (copy.overlays || []).forEach(function (l) {
                const old = l.id;
                l.id = utils.uid('layer');
                remap('image', old, l.id);
            });
            (copy.unassignedPanels || []).forEach(function (entry) {
                entry.id = utils.uid('unassigned');
                (entry.layers || []).forEach(function (layer) { layer.id = utils.uid('layer'); });
            });
            if (copy.vp1LayerTreeMeta) {
                const rebuilt = {};
                for (const [key, value] of Object.entries(copy.vp1LayerTreeMeta))
                    rebuilt[idChanges.get(key) || key] = value;
                copy.vp1LayerTreeMeta = rebuilt;
            }
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
                if (getLayerNodeState(inst, 'image', layerId)?.locked)
                    throw Error('Image locked');
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
                if (getLayerNodeState(inst, 'image', layerId)?.locked)
                    throw Error('Image locked');
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
                if (getLayerNodeState(inst, 'image', layerId)?.locked)
                    throw Error('Image locked');
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
                if (getLayerNodeState(inst, 'image', draggedId)?.locked ||
                    getLayerNodeState(inst, 'image', targetId)?.locked)
                    throw Error('Image locked');
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
        /* ================= VP1-012–020: Knife and gutter =================
         * Pure polygon previews; live edits are atomic and copy-on-write.
         * Imported SVGs with compound holes cannot be safely polygon-split:
         * reject rather than quietly deleting holes or converting their fill.
         */
        let knifeMode = null;
        const knEPS = 1e-5;
        const cloneGeometry = (p) => JSON.parse(JSON.stringify(p));
        const polygonArea = (points) => points.reduce((a, p, i) => {
            const q = points[(i + 1) % points.length];
            return a + p.x * q.y - q.x * p.y;
        }, 0) / 2;
        function cross(a, b, c) {
            return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        }
        function segmentsIntersect(a, b, c, d) {
            const s1 = cross(a, b, c), s2 = cross(a, b, d), s3 = cross(c, d, a), s4 = cross(c, d, b);
            return s1 * s2 < -knEPS && s3 * s4 < -knEPS;
        }
        function cleanPolygon(points) {
            let out = [];
            for (const p of points) {
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
                    return [];
                if (!out.length || Math.hypot(out[out.length - 1].x - p.x, out[out.length - 1].y - p.y) > knEPS)
                    out.push({ x: p.x, y: p.y });
            }
            if (out.length > 1 && Math.hypot(out[0].x - out[out.length - 1].x, out[0].y - out[out.length - 1].y) < knEPS)
                out.pop();
            let changed = true;
            while (changed && out.length >= 3) {
                changed = false;
                for (let i = 0; i < out.length; i++) {
                    const a = out[(i + out.length - 1) % out.length], b = out[i], c = out[(i + 1) % out.length];
                    if (Math.abs(cross(a, b, c)) < knEPS &&
                        (b.x - a.x) * (b.x - c.x) + (b.y - a.y) * (b.y - c.y) <= knEPS) {
                        out.splice(i, 1);
                        changed = true;
                        break;
                    }
                }
            }
            return out;
        }
        function simplePolygon(points) {
            if (points.length < 3 || points.length > 4096 || Math.abs(polygonArea(points)) < 1)
                return false;
            for (let i = 0; i < points.length; i++)
                for (let j = i + 2; j < points.length; j++) {
                    if (i === 0 && j === points.length - 1)
                        continue;
                    if (segmentsIntersect(points[i], points[(i + 1) % points.length], points[j], points[(j + 1) % points.length]))
                        return false;
                }
            return true;
        }
        function halfClip(points, line, keepPositive) {
            const a = { x: line.x1, y: line.y1 }, b = { x: line.x2, y: line.y2 };
            const signed = (p) => cross(a, b, p);
            const out = [];
            for (let i = 0; i < points.length; i++) {
                const p = points[i], q = points[(i + 1) % points.length];
                const dp = signed(p), dq = signed(q);
                const insideP = keepPositive ? dp >= -knEPS : dp <= knEPS;
                const insideQ = keepPositive ? dq >= -knEPS : dq <= knEPS;
                if (insideP)
                    out.push({ x: p.x, y: p.y });
                if (insideP !== insideQ && Math.abs(dp - dq) > knEPS) {
                    const t = Math.max(0, Math.min(1, dp / (dp - dq)));
                    out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
                }
            }
            return cleanPolygon(out);
        }
        /** Exact inward offset for polygon edges using adjacent shifted lines.
         * Invalid or self-crossing offsets are rejected, never committed. */
        function insetPolygon(poly, radius) {
            if (!radius)
                return poly.map(p => ({ x: p.x, y: p.y }));
            const orientation = Math.sign(polygonArea(poly));
            if (!orientation)
                return [];
            const result = [];
            for (let i = 0; i < poly.length; i++) {
                const prev = poly[(i + poly.length - 1) % poly.length], cur = poly[i], next = poly[(i + 1) % poly.length];
                const u = { x: cur.x - prev.x, y: cur.y - prev.y }, v = { x: next.x - cur.x, y: next.y - cur.y };
                const ul = Math.hypot(u.x, u.y), vl = Math.hypot(v.x, v.y);
                if (ul < knEPS || vl < knEPS)
                    return [];
                const n1 = { x: -u.y / ul * orientation, y: u.x / ul * orientation };
                const n2 = { x: -v.y / vl * orientation, y: v.x / vl * orientation };
                const denom = u.x * v.y - u.y * v.x;
                if (Math.abs(denom) < knEPS) {
                    result.push({ x: cur.x + radius * n1.x, y: cur.y + radius * n1.y });
                    continue;
                }
                const delta = { x: radius * (n2.x - n1.x), y: radius * (n2.y - n1.y) };
                const t = (delta.x * v.y - delta.y * v.x) / denom;
                const newX = cur.x + radius * n1.x + t * u.x;
                const newY = cur.y + radius * n1.y + t * u.y;
                if (!Number.isFinite(newX) || !Number.isFinite(newY) ||
                    Math.hypot(newX - cur.x, newY - cur.y) > Math.max(8 * radius, 1))
                    return [];
                result.push({ x: newX, y: newY });
            }
            const cleaned = cleanPolygon(result);
            // Insets are only accepted when resulting geometry remains valid.
            if (!simplePolygon(cleaned) || Math.sign(polygonArea(cleaned)) !== orientation ||
                Math.abs(polygonArea(cleaned)) >= Math.abs(polygonArea(poly)))
                return [];
            return cleaned;
        }
        function splitPure(poly, line) {
            const invalid = (reason) => ({ valid: false, reason,
                sourcePanelId: '', first: [], second: [] });
            const a = { x: line.x1, y: line.y1 }, b = { x: line.x2, y: line.y2 };
            if (![a.x, a.y, b.x, b.y].every(Number.isFinite) ||
                Math.hypot(b.x - a.x, b.y - a.y) < 2)
                return invalid('Draw a longer cut line.');
            if (!simplePolygon(poly))
                return invalid('Panel geometry is not a simple polygon.');
            // A single polygon can become multiple disconnected islands after a cut.
            // Reject that case until a multi-contour splitting contract exists.
            let crossings = 0;
            for (let i = 0; i < poly.length; i++) {
                const p = poly[i], q = poly[(i + 1) % poly.length];
                const da = cross(a, b, p), db = cross(a, b, q);
                if (da * db < -knEPS)
                    crossings++;
            }
            if (crossings !== 2)
                return invalid('Cut must cross the panel at exactly two edges.');
            const first = halfClip(poly, line, true), second = halfClip(poly, line, false);
            if (!simplePolygon(first) || !simplePolygon(second) ||
                Math.min(Math.abs(polygonArea(first)), Math.abs(polygonArea(second))) < 25)
                return invalid('Cut creates a degenerate panel.');
            const sum = Math.abs(polygonArea(first)) + Math.abs(polygonArea(second));
            if (Math.abs(sum - Math.abs(polygonArea(poly))) > Math.max(0.1, sum * 1e-4))
                return invalid('Cut did not preserve panel area.');
            return { valid: true, reason: null, sourcePanelId: '', first, second };
        }
        function editableBase(ps) {
            return ps.vp1KnifeBasePanels || ps.panels;
        }
        function previewKnife(inst, panelId, line, gutter) {
            const ps = PS.get(inst.panelSetId);
            const invalid = (reason) => ({ valid: false, reason,
                sourcePanelId: panelId, first: [], second: [] });
            if (!ps || inst.locked)
                return invalid('Page missing or locked.');
            const source = editableBase(ps).find(p => p.id === panelId);
            if (!source)
                return invalid('Panel not found.');
            if (source.contours && source.contours.length !== 1)
                return invalid('Compound SVG holes cannot be split non-destructively.');
            const amount = gutter ?? ps.vp1KnifeGutter ?? 0;
            if (!Number.isFinite(amount) || amount < 0 || amount > 80)
                return invalid('Gutter must be between 0 and 80.');
            const base = splitPure(source.points, line);
            if (!base.valid)
                return { ...base, sourcePanelId: panelId };
            const left = insetPolygon(base.first, amount / 2), right = insetPolygon(base.second, amount / 2);
            if (!simplePolygon(left) || !simplePolygon(right))
                return invalid('Gutter is too large for the resulting panels.');
            return { valid: true, reason: null, sourcePanelId: panelId, first: left, second: right };
        }
        function changedGeometry(ps, base, gutter) {
            return base.map(p => {
                if (p.contours && p.contours.length !== 1)
                    throw Error('Compound SVG paths cannot receive geometric gutter.');
                const newPoints = insetPolygon(p.points, gutter / 2);
                if (!simplePolygon(newPoints))
                    throw Error('Gutter is too large or unsupported for ' + p.id);
                if (gutter === 0)
                    return cloneGeometry(p);
                return { id: p.id, points: newPoints, fillRule: 'nonzero',
                    ...(p.vp1Style ? { vp1Style: { ...p.vp1Style } } : {}) };
            });
        }
        function svgOfPanels(ps, panels) {
            const esc = (value) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
                .replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const paths = panels.map(panel => {
                // Uncut imported vectors (curves and holes) retain original SVG geometry.
                const vector = svgGeometry.serializeVector(panel);
                const transform = vector.transform ? ' transform="' + esc(vector.transform) + '"' : '';
                const st = styleFor(panel);
                return '<path d="' + esc(vector.d) + '"' + transform +
                    ' fill-rule="' + esc(vector.fillRule) + '"' +
                    ' fill="' + esc(st.fill) + '" fill-opacity="' + st.fillOpacity +
                    '" stroke="' + esc(st.stroke) + '" stroke-opacity="' + st.strokeOpacity +
                    '" stroke-width="' + st.strokeWidth + '" stroke-linejoin="miter"/>';
            });
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
                ps.width + ' ' + ps.height + '">' + paths.join('') + '</svg>';
        }
        function ensureOwnedSet(inst) {
            const old = PS.get(inst.panelSetId);
            if (!old)
                throw Error('Panel set not found');
            if (old.vp1KnifeOwner === inst.id)
                return old;
            const base = old.vp1KnifeBasePanels || old.panels;
            const parsed = {
                width: old.width, height: old.height,
                panels: old.panels.map(cloneGeometry),
                ...(old.svgSource ? { svgSource: old.svgSource } : {}),
                ...(old.viewBox ? { viewBox: old.viewBox } : {})
            };
            const owned = PS.create(parsed, (old.name || 'Manga') + ' (edited)');
            owned.vp1KnifeOwner = inst.id;
            owned.vp1KnifeBasePanels = base.map(cloneGeometry);
            owned.vp1KnifeGutter = old.vp1KnifeGutter || 0;
            const originalSource = old.vp1KnifeOriginalSvg ?? old.svgSource;
            if (originalSource !== undefined)
                owned.vp1KnifeOriginalSvg = originalSource;
            inst.panelSetId = owned.id;
            return owned;
        }
        function emitKnifeChange(inst) {
            kernel.emit('panelSets:changed');
            kernel.emit('manga-page:changed', { instanceId: inst.id });
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
        }
        async function splitPanel(inst, panelId, line, gutter) {
            const initial = previewKnife(inst, panelId, line, gutter);
            if (!initial.valid)
                throw Error(initial.reason || 'Invalid cut');
            const cut = await kernel.call('history', 'transaction', 'manga.knife.cut', async () => {
                const ps = ensureOwnedSet(inst);
                const amount = gutter ?? ps.vp1KnifeGutter ?? 0;
                const base = editableBase(ps).map(cloneGeometry);
                const index = base.findIndex(p => p.id === panelId);
                if (index < 0)
                    throw Error('Panel no longer exists');
                const current = splitPure(base[index].points, line);
                if (!current.valid)
                    throw Error(current.reason || 'Invalid cut');
                const fresh = utils.uid('panel');
                const originalBase = base[index];
                const appearance = originalBase.vp1Style ? { vp1Style: { ...originalBase.vp1Style } } : {};
                const a = { id: panelId, points: current.first, ...appearance };
                const b = { id: fresh, points: current.second, ...appearance };
                base.splice(index, 1, a, b);
                const output = changedGeometry(ps, base, amount);
                const originalPanel = inst.panels.find(p => p.id === panelId);
                if (!originalPanel)
                    throw Error('Cannot match panel content.');
                const newLayers = originalPanel.layers.map(l => ({
                    ...l, id: utils.uid('layer'), vp1KnifeSourceLayerId: l.id
                }));
                inst.panels.splice(inst.panels.indexOf(originalPanel) + 1, 0, { id: fresh, layers: newLayers });
                // A split makes a second independently clipped instance of each panel
                // effect; the original effect remains bound to the preserved panel ID.
                for (const fx of (inst.vp1MangaEffects || []).filter(e => e.scope === 'panel' &&
                    e.panelId === panelId)) {
                    inst.vp1MangaEffects.push({ ...JSON.parse(JSON.stringify(fx)),
                        id: utils.uid('fx'), panelId: fresh });
                }
                ps.vp1KnifeBasePanels = base;
                ps.vp1KnifeGutter = amount;
                ps.panels = output;
                ps.svgSource = svgOfPanels(ps, output);
                ps.updatedAt = Date.now();
                const validation = migration.validatePage(inst, ps, S.assets);
                if (!validation.valid)
                    throw Error(validation.errors.join('; '));
                if (focus.instanceId === inst.id)
                    focus.panelId = panelId;
                emitKnifeChange(inst);
                return { panelSetId: ps.id, panelIds: [panelId, fresh] };
            });
            // The FS-directory adapter keeps a separate .svg copy for every PanelSet.
            // Synchronize only after the state transaction has committed successfully.
            await PS.syncAll();
            return cut;
        }
        async function setPanelGutter(inst, gutter) {
            if (!Number.isFinite(gutter) || gutter < 0 || gutter > 80)
                throw Error('Gutter must be between 0 and 80.');
            if (inst.locked)
                throw Error('Locked page.');
            const current = PS.get(inst.panelSetId);
            if (!current)
                throw Error('Missing page layout.');
            if ((current.vp1KnifeGutter || 0) === gutter)
                return false;
            // Validate before mutation so invalid values cause no new PanelSet.
            changedGeometry(current, editableBase(current), gutter);
            const changed = await kernel.call('history', 'transaction', 'manga.knife.gutter', async () => {
                const ps = ensureOwnedSet(inst);
                const base = editableBase(ps).map(cloneGeometry);
                const next = changedGeometry(ps, base, gutter);
                ps.vp1KnifeBasePanels = base;
                ps.vp1KnifeGutter = gutter;
                ps.panels = next;
                ps.svgSource = gutter === 0 && ps.vp1KnifeOriginalSvg &&
                    base.every(p => !!p.vector && !p.vp1Style) ? ps.vp1KnifeOriginalSvg : svgOfPanels(ps, next);
                ps.updatedAt = Date.now();
                emitKnifeChange(inst);
                return true;
            });
            await PS.syncAll();
            return changed;
        }
        /* =========== VP1-021–028: vertex and appearance editing =========== */
        let vertexMode = null;
        const defaultStyle = () => ({
            fill: 'none', stroke: '#1a1a1a', strokeWidth: 5, fillOpacity: 1, strokeOpacity: 1
        });
        const styleFor = (p) => ({
            ...defaultStyle(), ...(p.vp1Style || {})
        });
        const hexColor = /^#[0-9a-fA-F]{6}$/;
        function stylePatch(base, patch) {
            const proposed = { ...base, ...patch };
            if (![proposed.fill, proposed.stroke].every(v => v === 'none' || hexColor.test(v)) ||
                !Number.isFinite(proposed.strokeWidth) || proposed.strokeWidth < 0 || proposed.strokeWidth > 32 ||
                !Number.isFinite(proposed.fillOpacity) || proposed.fillOpacity < 0 || proposed.fillOpacity > 1 ||
                !Number.isFinite(proposed.strokeOpacity) || proposed.strokeOpacity < 0 || proposed.strokeOpacity > 1)
                throw Error('Invalid panel appearance: use #RRGGBB/none, stroke 0–32 and opacity 0–1.');
            return proposed;
        }
        function strictlyInside(p, polygon) {
            // Boundary contacts are permitted between neighboring original panels.
            let inside = false;
            for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
                const a = polygon[i], b = polygon[j];
                if (Math.abs(cross(a, b, p)) < knEPS &&
                    p.x >= Math.min(a.x, b.x) - knEPS && p.x <= Math.max(a.x, b.x) + knEPS &&
                    p.y >= Math.min(a.y, b.y) - knEPS && p.y <= Math.max(a.y, b.y) + knEPS)
                    return false;
                if ((a.y > p.y) !== (b.y > p.y) &&
                    p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
                    inside = !inside;
            }
            return inside;
        }
        function polygonsOverlap(a, b) {
            for (let i = 0; i < a.length; i++)
                for (let j = 0; j < b.length; j++) {
                    if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length]))
                        return true;
                }
            if (a.some(p => strictlyInside(p, b)) || b.some(p => strictlyInside(p, a)))
                return true;
            // Containment where all tested vertices lie on edges: sample polygon centers.
            const centroid = (poly) => ({
                x: poly.reduce((s, p) => s + p.x, 0) / poly.length,
                y: poly.reduce((s, p) => s + p.y, 0) / poly.length
            });
            return strictlyInside(centroid(a), b) || strictlyInside(centroid(b), a);
        }
        function getVertexMode() { return vertexMode ? { ...vertexMode } : null; }
        function setVertexMode(instanceId, panelId) {
            if (!instanceId || !panelId) {
                vertexMode = null;
                kernel.emit('state:changed');
                return false;
            }
            const b = getCurrentBoard();
            const inst = b?.instances.find(p => p.id === instanceId && p.type === 'manga-page');
            const ps = inst && PS.get(inst.panelSetId);
            const panel = ps && editableBase(ps).find(p => p.id === panelId);
            if (!inst || inst.locked || !panel || panel.contours && panel.contours.length !== 1)
                return false;
            if (knifeMode)
                knifeMode = null;
            if (mangaToolMode)
                mangaToolMode = null;
            vertexMode = { instanceId, panelId, selectedIndex: null };
            kernel.emit('state:changed');
            return true;
        }
        function previewVertex(inst, panelId, index, point) {
            const fail = (reason) => ({ valid: false, reason, panelId, points: [] });
            const ps = PS.get(inst.panelSetId);
            if (!ps || inst.locked)
                return fail('Page missing or locked.');
            const base = editableBase(ps);
            const source = base.find(p => p.id === panelId);
            if (!source)
                return fail('Panel not found.');
            if (source.contours && source.contours.length !== 1)
                return fail('Compound SVG contours cannot be edited with point handles.');
            if (!Number.isInteger(index) || index < 0 || index >= source.points.length)
                return fail('Vertex index is not valid.');
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
                point.x < 0 || point.y < 0 || point.x > ps.width || point.y > ps.height)
                return fail('Vertex must remain inside page bounds.');
            const changed = source.points.map(p => ({ ...p }));
            changed[index] = { x: point.x, y: point.y };
            if (!simplePolygon(changed) || Math.sign(polygonArea(changed)) !== Math.sign(polygonArea(source.points)) ||
                changed.some((p, i) => Math.hypot(p.x - changed[(i + 1) % changed.length].x, p.y - changed[(i + 1) % changed.length].y) < 2))
                return fail('Polygon is degenerate, reversed or self-intersecting.');
            const gutter = ps.vp1KnifeGutter || 0;
            let after;
            try {
                const previewBase = base.map(cloneGeometry);
                const updated = previewBase.find(p => p.id === panelId);
                updated.points = changed;
                delete updated.contours;
                delete updated.vector;
                after = changedGeometry(ps, previewBase, gutter);
            }
            catch (error) {
                return fail(error.message);
            }
            const candidate = after.find(p => p.id === panelId);
            for (const other of after) {
                if (other.id !== panelId && polygonsOverlap(candidate.points, other.points))
                    return fail('Panel may not overlap another panel.');
            }
            return { valid: true, reason: null, panelId, points: candidate.points.map(p => ({ ...p })) };
        }
        async function moveVertex(inst, panelId, index, point) {
            const draft = previewVertex(inst, panelId, index, point);
            if (!draft.valid)
                throw Error(draft.reason || 'Invalid vertex');
            const origin = PS.get(inst.panelSetId);
            const source = editableBase(origin).find(p => p.id === panelId);
            if (Math.hypot(source.points[index].x - point.x, source.points[index].y - point.y) < knEPS)
                return false;
            const changed = await kernel.call('history', 'transaction', 'manga.vertex.move', async () => {
                const owned = ensureOwnedSet(inst);
                const base = editableBase(owned).map(cloneGeometry);
                const panel = base.find(p => p.id === panelId);
                panel.points[index] = { x: point.x, y: point.y };
                // The original curved/compound SVG stays in vp1KnifeOriginalSvg.
                // The adjusted polygon becomes the new authoritative vector outline.
                delete panel.vector;
                delete panel.contours;
                const output = changedGeometry(owned, base, owned.vp1KnifeGutter || 0);
                owned.vp1KnifeBasePanels = base;
                owned.panels = output;
                owned.svgSource = svgOfPanels(owned, output);
                owned.updatedAt = Date.now();
                if (vertexMode?.instanceId === inst.id && vertexMode.panelId === panelId)
                    vertexMode.selectedIndex = index;
                emitKnifeChange(inst);
                return true;
            });
            await PS.syncAll();
            return changed;
        }
        function getPanelStyle(inst, panelId) {
            const ps = PS.get(inst.panelSetId);
            const p = ps?.panels.find(p => p.id === panelId);
            return p ? { ...styleFor(p) } : null;
        }
        async function updatePanelStyle(inst, panelId, patch) {
            const ps = PS.get(inst.panelSetId);
            if (!ps || inst.locked)
                throw Error('Page missing or locked.');
            const src = editableBase(ps).find(p => p.id === panelId);
            if (!src)
                throw Error('Panel not found.');
            const before = styleFor(src);
            const next = stylePatch(before, patch);
            if (JSON.stringify(before) === JSON.stringify(next))
                return false;
            const changed = await kernel.call('history', 'transaction', 'manga.panel.appearance', async () => {
                const owned = ensureOwnedSet(inst);
                const base = editableBase(owned).map(cloneGeometry);
                const p = base.find(p => p.id === panelId);
                p.vp1Style = next;
                owned.vp1KnifeBasePanels = base;
                owned.panels = changedGeometry(owned, base, owned.vp1KnifeGutter || 0);
                owned.svgSource = svgOfPanels(owned, owned.panels);
                owned.updatedAt = Date.now();
                emitKnifeChange(inst);
                return true;
            });
            await PS.syncAll();
            return changed;
        }
        function getKnifeMode() {
            return knifeMode ? { ...knifeMode } : null;
        }
        function setKnifeMode(instanceId, panelId) {
            if (instanceId && vertexMode)
                vertexMode = null;
            if (instanceId && mangaToolMode)
                mangaToolMode = null;
            if (!instanceId || !panelId) {
                knifeMode = null;
                kernel.emit('state:changed');
                return false;
            }
            const b = getCurrentBoard();
            const inst = b?.instances.find(p => p.id === instanceId && p.type === 'manga-page');
            const ps = inst && PS.get(inst.panelSetId);
            if (!inst || inst.locked || !ps?.panels.some(p => p.id === panelId))
                return false;
            knifeMode = { instanceId, panelId, gutter: ps.vp1KnifeGutter || 0 };
            kernel.emit('state:changed');
            return true;
        }
        kernel.on('history:applied', () => {
            const changed = !!knifeMode || !!vertexMode;
            knifeMode = null;
            vertexMode = null;
            if (changed)
                kernel.emit('state:changed');
        });
        kernel.on('board:navigated', () => {
            const changed = !!knifeMode || !!vertexMode;
            knifeMode = null;
            vertexMode = null;
            if (changed)
                kernel.emit('state:changed');
        });
        /* ============= VP1-029–041: non-destructive image framing =============
         * Image transform lives on MangaLayer; shape/clipping lives on PanelSet.
         * Crop is a source-relative inset. View limits are page-relative insets.
         * Neither field ever modifies the imported asset or a polygon.
         */
        const emptyCrop = () => ({ left: 0, top: 0, right: 0, bottom: 0 });
        const emptyLimits = () => ({ left: 0, top: 0, right: 0, bottom: 0 });
        const limitKeys = ['left', 'top', 'right', 'bottom'];
        function validInsets(value, label) {
            if (!value || typeof value !== 'object')
                throw Error('Invalid ' + label);
            const v = value;
            for (const k of limitKeys) {
                if (!Number.isFinite(v[k]) || v[k] < 0 || v[k] > 0.98)
                    throw Error(label + ' ' + k + ' must be a fraction between 0 and 0.98');
            }
            if (v.left + v.right >= 0.99 || v.top + v.bottom >= 0.99)
                throw Error(label + ' must preserve at least 1% on each axis');
        }
        function framingLayer(inst, panelId, layerId) {
            const arr = targetArray(inst, panelId);
            return arr?.find(layer => layer.id === layerId) || null;
        }
        function getLayerFraming(inst, panelId, layerId) {
            const layer = framingLayer(inst, panelId, layerId);
            if (!layer)
                return null;
            return {
                x: layer.x, y: layer.y, width: layer.width, height: layer.height,
                rotation: layer.rotation || 0, opacity: layer.opacity ?? 1,
                crop: { ...emptyCrop(), ...(layer.vp1Crop || {}) },
                viewLimits: { ...emptyLimits(), ...(layer.vp1ViewLimits || {}) }
            };
        }
        function validateFraming(p) {
            for (const k of ['x', 'y', 'width', 'height', 'rotation', 'opacity'])
                if (!Number.isFinite(p[k]))
                    throw Error('Invalid image transform ' + k);
            if (Math.abs(p.x) > 65536 || Math.abs(p.y) > 65536 ||
                p.width < 1 || p.width > 16384 || p.height < 1 || p.height > 16384)
                throw Error('Image framing exceeds dimension limits');
            if (Math.abs(p.rotation) > 360 || p.opacity < 0 || p.opacity > 1)
                throw Error('Rotation or opacity outside supported range');
            validInsets(p.crop, 'Crop');
            validInsets(p.viewLimits, 'View limits');
        }
        function mergedFraming(current, patch) {
            // Reject unknown keys, never allow arbitrary object assignment to model.
            const allowed = ['x', 'y', 'width', 'height', 'rotation', 'opacity', 'crop', 'viewLimits'];
            if (!patch || typeof patch !== 'object' || Object.keys(patch).some(k => !allowed.includes(k)))
                throw Error('Unsupported framing property');
            const proposed = { ...current, ...patch,
                crop: patch.crop ? { ...patch.crop } : { ...current.crop },
                viewLimits: patch.viewLimits ? { ...patch.viewLimits } : { ...current.viewLimits } };
            validateFraming(proposed);
            return proposed;
        }
        async function updateLayerFraming(inst, panelId, layerId, patch) {
            if (!inst || inst.type !== 'manga-page' || inst.locked)
                throw Error('Page missing or locked');
            const original = getLayerFraming(inst, panelId, layerId);
            if (!original)
                throw Error('Layer does not exist in this page');
            const next = mergedFraming(original, patch);
            if (JSON.stringify(next) === JSON.stringify(original))
                return false;
            return kernel.call('history', 'transaction', 'manga.image.framing', async () => {
                const layer = framingLayer(inst, panelId, layerId);
                if (!layer)
                    throw Error('Layer removed before edit');
                Object.assign(layer, { x: next.x, y: next.y, width: next.width, height: next.height,
                    rotation: next.rotation, opacity: next.opacity,
                    vp1Crop: { ...next.crop }, vp1ViewLimits: { ...next.viewLimits } });
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        function frameBounds(inst, panelId) {
            const ps = PS.get(inst.panelSetId);
            if (!ps)
                throw Error('Panel set missing');
            if (panelId === '__overlay__')
                return { x: 0, y: 0, width: ps.width, height: ps.height };
            const panel = ps.panels.find(p => p.id === panelId);
            if (!panel || !panel.points.length)
                throw Error('Panel not found');
            const x0 = Math.min(...panel.points.map(p => p.x)), x1 = Math.max(...panel.points.map(p => p.x)), y0 = Math.min(...panel.points.map(p => p.y)), y1 = Math.max(...panel.points.map(p => p.y));
            return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        }
        function autoFitPatch(inst, panelId, layer, mode) {
            const a = S.assets.find(x => x.id === layer.assetId);
            if (!a)
                throw Error('Image asset not found');
            const natW = a.originalWidth || 1, natH = a.originalHeight || 1;
            if (natW <= 0 || natH <= 0)
                throw Error('Invalid asset dimensions');
            const b = frameBounds(inst, panelId);
            const scale = (mode === 'contain' ? Math.min : Math.max)(b.width / natW, b.height / natH);
            const width = natW * scale, height = natH * scale;
            return { x: b.x + (b.width - width) / 2, y: b.y + (b.height - height) / 2,
                width, height, rotation: 0, crop: emptyCrop() };
        }
        async function autoFitLayer(inst, panelId, layerId, mode = 'cover') {
            if (mode !== 'cover' && mode !== 'contain')
                throw Error('Invalid Auto-Fit mode');
            const layer = framingLayer(inst, panelId, layerId);
            if (!layer)
                throw Error('Layer not found');
            return updateLayerFraming(inst, panelId, layerId, autoFitPatch(inst, panelId, layer, mode));
        }
        async function zoomLayer(inst, panelId, layerId, factor) {
            if (!Number.isFinite(factor) || factor < 0.1 || factor > 10)
                throw Error('Zoom factor must be between 0.1 and 10');
            const current = getLayerFraming(inst, panelId, layerId);
            if (!current)
                throw Error('Layer not found');
            const width = current.width * factor, height = current.height * factor;
            return updateLayerFraming(inst, panelId, layerId, {
                x: current.x + (current.width - width) / 2,
                y: current.y + (current.height - height) / 2, width, height
            });
        }
        async function replaceLayerAsset(inst, panelId, layerId, newAssetId, preserve = true) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            const asset = S.assets.find(a => a.id === newAssetId);
            if (!asset)
                throw Error('Replacement asset does not exist');
            const original = framingLayer(inst, panelId, layerId);
            if (!original)
                throw Error('Layer not found');
            if (original.assetId === newAssetId && preserve)
                return false;
            const next = preserve ? null : autoFitPatch(inst, panelId, { ...original, assetId: newAssetId }, 'cover');
            if (next)
                mergedFraming(getLayerFraming(inst, panelId, layerId), next);
            return kernel.call('history', 'transaction', 'manga.image.replace', async () => {
                const layer = framingLayer(inst, panelId, layerId);
                layer.assetId = newAssetId;
                if (next)
                    Object.assign(layer, next, { vp1Crop: emptyCrop(), vp1ViewLimits: emptyLimits() });
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        async function resetLayerFraming(inst, panelId, layerId) {
            const layer = framingLayer(inst, panelId, layerId);
            if (!layer)
                throw Error('Layer not found');
            const fit = autoFitPatch(inst, panelId, layer, 'cover');
            return updateLayerFraming(inst, panelId, layerId, {
                ...fit, viewLimits: emptyLimits(), opacity: 1
            });
        }
        let cropMode = null;
        function getCropMode() { return cropMode ? { ...cropMode } : null; }
        function setCropMode(instanceId, panelId, layerId) {
            if (!instanceId || !panelId || !layerId) {
                cropMode = null;
                kernel.emit('state:changed');
                return false;
            }
            const board = getCurrentBoard();
            const inst = board?.instances.find(i => i.id === instanceId && i.type === 'manga-page');
            if (!inst || inst.locked || !framingLayer(inst, panelId, layerId))
                return false;
            cropMode = { instanceId, panelId, layerId };
            if (knifeMode)
                knifeMode = null;
            if (vertexMode)
                vertexMode = null;
            if (mangaToolMode)
                mangaToolMode = null;
            kernel.emit('state:changed');
            return true;
        }
        kernel.on('board:navigated', () => { cropMode = null; });
        kernel.on('history:applied', () => { cropMode = null; });
        /* ================= VP1-043–051 — vector manga-effects pipeline =================
         * Fully page-owned data, independent from image blobs and PanelSet geometry.
         * Both live SVG and Canvas exports consume exactly the same primitives.
         * Strict bounded generation: no random seeds, no remote data, no injected SVG.
         */
        let selectedMangaEffect = null;
        function getSelectedMangaEffect() {
            return selectedMangaEffect ? { ...selectedMangaEffect } : null;
        }
        function selectMangaEffect(instanceId, effectId) {
            if (!instanceId || !effectId) {
                selectedMangaEffect = null;
                kernel.emit('state:changed');
                return false;
            }
            const inst = getCurrentBoard()?.instances.find(i => i.id === instanceId);
            if (!inst || inst.type !== 'manga-page' ||
                !inst.vp1MangaEffects?.some(e => e.id === effectId))
                return false;
            selectedMangaEffect = { instanceId, id: effectId };
            selectedHorizontalText = null;
            mangaToolMode = null;
            knifeMode = null;
            vertexMode = null;
            cropMode = null;
            kernel.emit('state:changed');
            return true;
        }
        let mangaToolMode = null;
        const allowedKinds = new Set(['ink', 'halftone', 'speedLines', 'focusLines']);
        const allowedShapes = new Set(['circle', 'square', 'triangle', 'star', 'cross', 'heart']);
        const allowedLines = new Set(['straight', 'tapered', 'wavy']);
        const effectKeys = new Set(['kind', 'scope', 'panelId', 'x', 'y', 'width', 'height',
            'rotation', 'color', 'opacity', 'size', 'tip', 'points', 'shape', 'density',
            'diameter', 'spacing', 'gradient', 'angle', 'count', 'lineType', 'length',
            'spread', 'centerX', 'centerY', 'minRadius', 'maxRadius', 'variation']);
        const n3 = (n) => Number(n.toFixed(3));
        const xy = (p) => n3(p.x) + ' ' + n3(p.y);
        const deterministic = (index, salt = 0) => {
            const v = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
            return v - Math.floor(v);
        };
        function effectDefaults(inst, kind, scope, panelId) {
            const ps = PS.get(inst.panelSetId);
            if (!ps)
                throw Error('Panel set missing');
            const p = panelId && ps.panels.find(p => p.id === panelId);
            const box = p ? {
                x: Math.min(...p.points.map(pt => pt.x)), y: Math.min(...p.points.map(pt => pt.y)),
                width: Math.max(...p.points.map(pt => pt.x)) - Math.min(...p.points.map(pt => pt.x)),
                height: Math.max(...p.points.map(pt => pt.y)) - Math.min(...p.points.map(pt => pt.y))
            } : { x: 0, y: 0, width: ps.width, height: ps.height };
            return { kind, scope, panelId: scope === 'panel' ? (panelId || null) : null,
                x: kind === 'ink' ? 0 : box.x, y: kind === 'ink' ? 0 : box.y,
                width: box.width, height: box.height, rotation: 0,
                color: '#111111', opacity: 0.85, size: 5, tip: 0.24, points: [],
                shape: 'circle', density: 0.72, diameter: 5, spacing: 16,
                gradient: 0, angle: 0, count: 70, lineType: 'tapered',
                length: Math.min(box.width, 320), spread: 45,
                centerX: box.width / 2, centerY: box.height / 2,
                minRadius: 35, maxRadius: Math.max(box.width, box.height) * 0.62,
                variation: 0.24 };
        }
        function validateEffect(e, inst) {
            if (!allowedKinds.has(e.kind) || !['panel', 'page'].includes(e.scope))
                throw Error('Invalid manga effect kind/scope');
            const ps = PS.get(inst.panelSetId);
            if (!ps)
                throw Error('Missing panel set');
            if (e.scope === 'panel' && !ps.panels.some(p => p.id === e.panelId))
                throw Error('Effect target panel does not exist');
            if (e.scope === 'page' && e.panelId !== null)
                throw Error('Page effect must not bind a panel');
            if (!/^#[0-9a-fA-F]{6}$/.test(e.color))
                throw Error('Color must be #RRGGBB');
            const numbers = {
                x: [-65536, 65536], y: [-65536, 65536],
                width: [1, 8192], height: [1, 8192], rotation: [-360, 360],
                opacity: [0, 1], size: [0.5, 64], tip: [0, 0.5],
                density: [0.01, 1], diameter: [0.5, 100], spacing: [4, 200],
                gradient: [-1, 1], angle: [-360, 360], count: [1, 500],
                length: [1, 8192], spread: [0, 360],
                centerX: [-8192, 16384], centerY: [-8192, 16384],
                minRadius: [0, 8192], maxRadius: [1, 8192], variation: [0, 1]
            };
            for (const key of Object.keys(numbers)) {
                const value = e[key], lim = numbers[key];
                if (!Number.isFinite(value) || value < lim[0] || value > lim[1])
                    throw Error('Invalid manga effect ' + key);
            }
            if (!Number.isInteger(e.count))
                throw Error('Effect count must be integer');
            if (!allowedShapes.has(e.shape) || !allowedLines.has(e.lineType))
                throw Error('Unrecognized halftone shape or line type');
            if (e.minRadius >= e.maxRadius)
                throw Error('Focus radius must have positive span');
            if (!Array.isArray(e.points) || e.points.length > 2048)
                throw Error('Ink exceeds maximum 2048 points');
            if (e.kind === 'ink' && e.points.length < 1)
                throw Error('Ink requires a stroke');
            for (const p of e.points) {
                if (!p || ![p.x, p.y, p.pressure].every(Number.isFinite) ||
                    Math.abs(p.x) > 65536 || Math.abs(p.y) > 65536 || p.pressure < 0.05 || p.pressure > 1)
                    throw Error('Invalid ink sample');
            }
            if (e.kind === 'halftone' &&
                Math.ceil(e.width / e.spacing) * Math.ceil(e.height / e.spacing) > 8000)
                throw Error('Halftone grid too dense; increase spacing or reduce bounds');
        }
        function listMangaEffects(inst, panelId) {
            const arr = Array.isArray(inst?.vp1MangaEffects) ? inst.vp1MangaEffects : [];
            return arr.filter(e => !panelId || e.scope === 'page' || e.panelId === panelId)
                .map(e => JSON.parse(JSON.stringify(e)))
                .sort((a, b) => (a.zIndex || arr.indexOf(arr.find(x => x.id === a.id)) + 1) -
                (b.zIndex || arr.indexOf(arr.find(x => x.id === b.id)) + 1));
        }
        async function addMangaEffect(inst, draft) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!draft || Object.keys(draft).some(k => !effectKeys.has(k)))
                throw Error('Unsupported effect property');
            const base = effectDefaults(inst, draft.kind, draft.scope, draft.panelId);
            const full = { ...base, ...draft,
                points: (draft.points || base.points).map(p => ({ ...p })),
                panelId: draft.scope === 'page' ? null : (draft.panelId || null) };
            validateEffect(full, inst);
            return kernel.call('history', 'transaction', 'manga.effects.add', async () => {
                const item = { ...full, id: utils.uid('fx') };
                if (!inst.vp1MangaEffects)
                    inst.vp1MangaEffects = [];
                if (inst.vp1MangaEffects.length >= 256)
                    throw Error('Page limit: 256 manga effects');
                inst.vp1MangaEffects.push(item);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return JSON.parse(JSON.stringify(item));
            });
        }
        async function updateMangaEffect(inst, id, patch) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!patch || Object.keys(patch).some(k => !effectKeys.has(k)))
                throw Error('Unsupported effect property');
            const original = inst.vp1MangaEffects?.find(x => x.id === id);
            if (!original)
                throw Error('Effect does not exist');
            if (getLayerNodeState(inst, 'drawing', id)?.locked)
                throw Error('Effect locked');
            const next = { ...original, ...patch,
                points: patch.points ? patch.points.map(p => ({ ...p })) : original.points.map(p => ({ ...p })),
                panelId: patch.scope === 'page' ? null : patch.panelId ?? original.panelId };
            validateEffect(next, inst);
            if (JSON.stringify(next) === JSON.stringify(original))
                return false;
            return kernel.call('history', 'transaction', 'manga.effects.update', async () => {
                const i = inst.vp1MangaEffects?.findIndex(x => x.id === id) ?? -1;
                if (i < 0)
                    throw Error('Effect removed during edit');
                inst.vp1MangaEffects[i] = next;
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        async function removeMangaEffect(inst, id) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!inst.vp1MangaEffects?.some(e => e.id === id))
                return false;
            if (getLayerNodeState(inst, 'drawing', id)?.locked)
                throw Error('Effect locked');
            return kernel.call('history', 'transaction', 'manga.effects.remove', async () => {
                inst.vp1MangaEffects = inst.vp1MangaEffects.filter(e => e.id !== id);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        function previewMangaInk(inst, points, settings) {
            const base = effectDefaults(inst, 'ink', 'panel', inst.panels[0]?.id || null);
            const draft = { ...base, ...settings, points: points.map(p => ({ ...p })),
                id: 'vp1-preview-ink' };
            if (!points.length)
                return [];
            validateEffect(draft, inst);
            return mangaEffectPrimitives(draft);
        }
        const distanceToSegment = (p, a, b) => {
            const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
            return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
        };
        async function eraseMangaInkAt(inst, panelId, point, radius) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!Number.isFinite(point.x) || !Number.isFinite(point.y) ||
                !Number.isFinite(radius) || radius < 1 || radius > 100)
                throw Error('Invalid eraser brush');
            const affected = (inst.vp1MangaEffects || []).filter(e => {
                if (e.kind !== 'ink' || (e.scope === 'panel' && e.panelId !== panelId) ||
                    getLayerNodeState(inst, 'drawing', e.id)?.locked)
                    return false;
                const pts = e.points.map(p => ({ x: p.x + e.x, y: p.y + e.y }));
                return pts.some((p, i) => distanceToSegment(point, p, pts[Math.min(i + 1, pts.length - 1)]) <=
                    radius + e.size / 2);
            });
            if (!affected.length)
                return 0;
            return kernel.call('history', 'transaction', 'manga.effects.erase', async () => {
                const ids = new Set(affected.map(e => e.id));
                inst.vp1MangaEffects = inst.vp1MangaEffects.filter(e => !ids.has(e.id));
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return affected.length;
            });
        }
        async function eraseMangaInkPath(inst, panelId, points, radius) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!Array.isArray(points) || points.length > 2048 || !points.length ||
                !Number.isFinite(radius) || radius < 1 || radius > 100 ||
                points.some(p => ![p.x, p.y].every(Number.isFinite)))
                throw Error('Invalid eraser path');
            const affected = (inst.vp1MangaEffects || []).filter(e => {
                if (e.kind !== 'ink' || (e.scope === 'panel' && e.panelId !== panelId) ||
                    getLayerNodeState(inst, 'drawing', e.id)?.locked)
                    return false;
                const pts = e.points.map(p => ({ x: p.x + e.x, y: p.y + e.y }));
                for (const sample of points) {
                    if (pts.some((p, i) => distanceToSegment(sample, p, pts[Math.min(i + 1, pts.length - 1)]) <= radius + e.size / 2))
                        return true;
                }
                return false;
            });
            if (!affected.length)
                return 0;
            return kernel.call('history', 'transaction', 'manga.effects.eraseStroke', async () => {
                const ids = new Set(affected.map(e => e.id));
                inst.vp1MangaEffects = inst.vp1MangaEffects.filter(e => !ids.has(e.id));
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return affected.length;
            });
        }
        function getMangaToolMode() {
            return mangaToolMode ? { ...mangaToolMode } : null;
        }
        function setMangaToolMode(instanceId, panelId, tool = 'ink', settings) {
            if (!instanceId || !panelId) {
                mangaToolMode = null;
                kernel.emit('state:changed');
                return false;
            }
            if (tool !== 'ink' && tool !== 'eraser')
                throw Error('Unknown manga brush tool');
            const board = getCurrentBoard();
            const inst = board?.instances.find(i => i.type === 'manga-page' && i.id === instanceId);
            if (!inst || inst.locked || !PS.get(inst.panelSetId)?.panels.some(p => p.id === panelId))
                return false;
            const cfg = { ...mangaToolMode, ...settings };
            const mode = {
                instanceId, panelId, tool, color: cfg.color || '#161616',
                size: cfg.size || 7, opacity: cfg.opacity ?? 1, tip: cfg.tip ?? 0.28
            };
            if (!/^#[0-9a-fA-F]{6}$/.test(mode.color) || !Number.isFinite(mode.size) ||
                mode.size < .5 || mode.size > 64 || !Number.isFinite(mode.opacity) ||
                mode.opacity < 0 || mode.opacity > 1 || !Number.isFinite(mode.tip) ||
                mode.tip < 0 || mode.tip > .5)
                throw Error('Invalid Ink/Eraser settings');
            knifeMode = null;
            vertexMode = null;
            cropMode = null;
            selectedMangaEffect = null;
            selectedHorizontalText = null;
            mangaToolMode = mode;
            kernel.emit('state:changed');
            return true;
        }
        kernel.on('history:applied', () => { if (mangaToolMode) {
            mangaToolMode = null;
            kernel.emit('state:changed');
        } });
        kernel.on('board:navigated', () => { mangaToolMode = null; selectedMangaEffect = null; });
        kernel.on('history:applied', () => { selectedMangaEffect = null; });
        /* Bounded, deterministic path recipe. Same primitives feed DOM SVG and
           Path2D in exported PNG/PDF. No HTML from user content is interpolated. */
        function mangaEffectPrimitives(e) {
            const out = [];
            const push = (d, fill = e.color, stroke = 'none', sw = 0) => out.push({ d, fill, stroke, strokeWidth: sw, opacity: e.opacity });
            const pt = (x, y) => ({ x: n3(x), y: n3(y) });
            const polar = (cx, cy, r, t) => pt(cx + r * Math.cos(t), cy + r * Math.sin(t));
            const pointPath = (points) => points.map((p, i) => (i ? 'L' : 'M') + xy(p)).join(' ') + ' Z';
            const rotated = (p, cx, cy, angle) => {
                const a = angle * Math.PI / 180, dx = p.x - cx, dy = p.y - cy;
                return pt(cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a));
            };
            if (e.kind === 'ink') {
                // Chaikin corner cutting yields a smooth trajectory but leaves the
                // stored pointer samples untouched; pressure is interpolated too.
                const raw = e.points.map(p => ({ x: p.x + e.x, y: p.y + e.y,
                    pressure: p.pressure }));
                let samples = raw;
                if (raw.length > 2) {
                    samples = [raw[0]];
                    for (let i = 0; i < raw.length - 1; i++) {
                        const a = raw[i], b = raw[i + 1];
                        samples.push({
                            x: .75 * a.x + .25 * b.x, y: .75 * a.y + .25 * b.y,
                            pressure: .75 * a.pressure + .25 * b.pressure
                        }, {
                            x: .25 * a.x + .75 * b.x, y: .25 * a.y + .75 * b.y,
                            pressure: .25 * a.pressure + .75 * b.pressure
                        });
                    }
                    samples.push(raw[raw.length - 1]);
                }
                const points = samples.map(p => pt(p.x, p.y));
                if (!points.length)
                    return out;
                if (points.length === 1) {
                    const r = Math.max(.25, e.size * samples[0].pressure * .5);
                    push('M' + xy(pt(points[0].x - r, points[0].y)) +
                        ' a' + n3(r) + ' ' + n3(r) + ' 0 1 0 ' + n3(r * 2) + ' 0' +
                        ' a' + n3(r) + ' ' + n3(r) + ' 0 1 0 ' + n3(-r * 2) + ' 0');
                    return out;
                }
                const left = [], right = [];
                let length = 0;
                const cumulative = [0];
                for (let i = 1; i < points.length; i++) {
                    length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
                    cumulative.push(length);
                }
                for (let i = 0; i < points.length; i++) {
                    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
                    const dx = b.x - a.x, dy = b.y - a.y, m = Math.hypot(dx, dy) || 1;
                    const progress = length ? cumulative[i] / length : 0;
                    const taper = e.tip ? Math.max(.05, Math.min(1, progress / e.tip, (1 - progress) / e.tip)) : 1;
                    const radius = Math.max(.12, e.size * .5 * samples[i].pressure * taper);
                    left.push(pt(points[i].x - dy / m * radius, points[i].y + dx / m * radius));
                    right.push(pt(points[i].x + dy / m * radius, points[i].y - dx / m * radius));
                }
                push(pointPath([...left, ...right.reverse()]));
            }
            else if (e.kind === 'halftone') {
                const centerX = e.x + e.width / 2, centerY = e.y + e.height / 2;
                const nx = Math.ceil(e.width / e.spacing), ny = Math.ceil(e.height / e.spacing);
                if (nx * ny > 8000)
                    return out;
                const theta = e.angle * Math.PI / 180;
                let idx = 0;
                for (let j = 0; j < ny; j++)
                    for (let i = 0; i < nx; i++, idx++) {
                        const px = e.x + (i + .5) * e.spacing, py = e.y + (j + .5) * e.spacing;
                        if (px > e.x + e.width || py > e.y + e.height)
                            continue;
                        const position = ((px - centerX) * Math.cos(theta) + (py - centerY) * Math.sin(theta)) /
                            Math.max(1, Math.hypot(e.width, e.height) / 2);
                        const weight = Math.max(0, Math.min(1, e.density * (1 + e.gradient * position)));
                        if (deterministic(idx, 7) > weight)
                            continue;
                        const r = Math.max(.25, e.diameter / 2 * Math.max(.1, 1 + e.gradient * position));
                        let poly = [];
                        const shape = e.shape;
                        if (shape === 'square')
                            poly = [pt(px - r, py - r), pt(px + r, py - r),
                                pt(px + r, py + r), pt(px - r, py + r)];
                        else if (shape === 'triangle')
                            poly = [polar(px, py, r, Math.PI * 1.5),
                                polar(px, py, r, Math.PI / 6), polar(px, py, r, Math.PI * 5 / 6)];
                        else if (shape === 'star') {
                            for (let k = 0; k < 10; k++)
                                poly.push(polar(px, py, k % 2 ? r * .45 : r, -Math.PI / 2 + k * Math.PI / 5));
                        }
                        else if (shape === 'cross')
                            poly = [
                                pt(px - r * .3, py - r), pt(px + r * .3, py - r), pt(px + r * .3, py - r * .3),
                                pt(px + r, py - r * .3), pt(px + r, py + r * .3), pt(px + r * .3, py + r * .3),
                                pt(px + r * .3, py + r), pt(px - r * .3, py + r), pt(px - r * .3, py + r * .3),
                                pt(px - r, py + r * .3), pt(px - r, py - r * .3), pt(px - r * .3, py - r * .3)
                            ];
                        if (shape === 'heart') {
                            // A polygonal heart remains deterministic in Path2D and exported SVG.
                            const a = [[-1, -.2], [-.9, -.7], [-.5, -1], [0, -.55],
                                [.5, -1], [.9, -.7], [1, -.2], [.7, .35], [0, 1], [-.7, .35]];
                            poly = a.map(([x, y]) => pt(px + x * r, py + y * r));
                        }
                        if (shape === 'circle')
                            push('M' + xy(pt(px - r, py)) + ' a' + n3(r) + ' ' + n3(r) +
                                ' 0 1 0 ' + n3(r * 2) + ' 0 a' + n3(r) + ' ' + n3(r) + ' 0 1 0 ' + n3(-r * 2) + ' 0');
                        else
                            push(pointPath(poly));
                    }
            }
            else if (e.kind === 'speedLines') {
                const centerX = e.x + e.width / 2, centerY = e.y + e.height / 2;
                for (let i = 0; i < e.count; i++) {
                    const t = (i + .5) / e.count - .5;
                    const y = e.y + (t + .5) * e.height;
                    const localSpread = t * e.spread;
                    const a = (e.angle + localSpread) * Math.PI / 180;
                    const origin = pt(e.x, y);
                    const len = e.length * (.65 + .35 * deterministic(i, 3));
                    const dest = pt(origin.x + len * Math.cos(a), origin.y + len * Math.sin(a));
                    const width = e.size * (.6 + .7 * deterministic(i, 10));
                    if (e.lineType === 'straight')
                        push('M' + xy(origin) + ' L' + xy(dest), 'none', e.color, width);
                    else if (e.lineType === 'wavy') {
                        const mid = pt((origin.x + dest.x) / 2 - (dest.y - origin.y) * .06, (origin.y + dest.y) / 2 + (dest.x - origin.x) * .06);
                        push('M' + xy(origin) + ' Q' + xy(mid) + ' ' + xy(dest), 'none', e.color, width);
                    }
                    else {
                        const d = Math.hypot(dest.x - origin.x, dest.y - origin.y) || 1;
                        const nx = -(dest.y - origin.y) / d * width / 2, ny = (dest.x - origin.x) / d * width / 2;
                        push(pointPath([pt(origin.x + nx, origin.y + ny),
                            pt(origin.x - nx, origin.y - ny), dest]));
                    }
                }
            }
            else if (e.kind === 'focusLines') {
                for (let i = 0; i < e.count; i++) {
                    const a = i * Math.PI * 2 / e.count;
                    const delta = deterministic(i, 5) * e.variation;
                    const outer = e.maxRadius * (1 - delta * .45);
                    const inner = e.minRadius + delta * (e.maxRadius - e.minRadius) * .45;
                    const p = polar(e.centerX + e.x, e.centerY + e.y, inner, a), q = polar(e.centerX + e.x, e.centerY + e.y, outer, a);
                    const d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
                    const nx = -(q.y - p.y) / d * e.size * .48, ny = (q.x - p.x) / d * e.size * .48;
                    push(pointPath([pt(p.x + nx, p.y + ny), pt(p.x - nx, p.y - ny), q]));
                }
            }
            return out.slice(0, 8000);
        }
        /* VP1-052–061 — editable, persisted vector dialogue balloons. Shapes and
         * text are data; no SVG/HTML from a user or third-party catalog is parsed. */
        const balloonShapes = ['oval', 'round', 'cloud', 'thought',
            'shout', 'burst', 'box', 'caption'];
        const balloonTails = ['none', 'bottom-left', 'bottom',
            'bottom-right', 'left', 'right'];
        const balloonPresets = balloonShapes.flatMap(shape => balloonTails.map(tail => ({ id: shape + '-' + tail,
            name: shape.charAt(0).toUpperCase() + shape.slice(1) + ' / ' + tail,
            shape, tail })));
        const balloonKeys = new Set(['presetId', 'shape', 'tail', 'vertices', 'x', 'y', 'width',
            'height', 'rotation', 'fill', 'fillOpacity', 'stroke', 'strokeWidth', 'text',
            'textColor', 'textSize', 'visible', 'locked', 'zIndex']);
        let selectedBalloon = null;
        let balloonDrawMode = null;
        const deepBalloon = (b) => JSON.parse(JSON.stringify(b));
        function listBalloonPresets() {
            return balloonPresets.map(p => ({ ...p }));
        }
        function pageBalloons(inst) {
            return Array.isArray(inst.vp1Balloons) ? inst.vp1Balloons : [];
        }
        function listBalloons(inst) {
            return pageBalloons(inst).map(deepBalloon).sort((a, b) => a.zIndex - b.zIndex);
        }
        function balloonDefaults(inst, presetId) {
            const ps = PS.get(inst.panelSetId);
            if (!ps)
                throw Error('Balloon page template missing');
            const preset = balloonPresets.find(p => p.id === presetId);
            if (presetId !== null && !preset)
                throw Error('Unknown balloon preset');
            return { presetId, shape: preset?.shape || 'round', tail: preset?.tail || 'none',
                vertices: preset ? null : [{ x: .08, y: .08 }, { x: .92, y: .08 },
                    { x: .92, y: .92 }, { x: .08, y: .92 }],
                x: ps.width * .3, y: ps.height * .16, width: ps.width * .4, height: ps.height * .23,
                rotation: 0, fill: '#ffffff', fillOpacity: 1, stroke: '#111111', strokeWidth: 3,
                text: '', textColor: '#111111', textSize: 24, visible: true, locked: false,
                zIndex: pageBalloons(inst).reduce((n, b) => Math.max(n, b.zIndex), 0) + 1 };
        }
        function validateBalloon(inst, b) {
            const ps = PS.get(inst.panelSetId);
            if (!ps)
                throw Error('Balloon page template missing');
            const nums = [
                b.x, b.y, b.width, b.height, b.rotation, b.fillOpacity, b.strokeWidth, b.textSize
            ];
            if (!nums.every(Number.isFinite) || b.width < 8 || b.height < 8 ||
                b.width > 8192 || b.height > 8192 || Math.abs(b.x) > 65536 ||
                Math.abs(b.y) > 65536 || Math.abs(b.rotation) > 360 ||
                b.fillOpacity < 0 || b.fillOpacity > 1 || b.strokeWidth < 0 ||
                b.strokeWidth > 64 || b.textSize < 8 || b.textSize > 160)
                throw Error('Invalid balloon dimensions or styling');
            if (!Number.isSafeInteger(b.zIndex) || b.zIndex < 1 || b.zIndex > 100000 ||
                typeof b.visible !== 'boolean' || typeof b.locked !== 'boolean')
                throw Error('Invalid balloon order/visibility');
            if (!/^#[a-fA-F0-9]{6}$/.test(b.fill) || !/^#[a-fA-F0-9]{6}$/.test(b.stroke) ||
                !/^#[a-fA-F0-9]{6}$/.test(b.textColor))
                throw Error('Invalid balloon color');
            if (typeof b.text !== 'string' || b.text.length > 4000 ||
                /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.text))
                throw Error('Invalid balloon text');
            if (!balloonShapes.includes(b.shape) || !balloonTails.includes(b.tail))
                throw Error('Unknown balloon shape/tail');
            if (b.presetId !== null) {
                const p = balloonPresets.find(x => x.id === b.presetId);
                if (!p || p.shape !== b.shape || p.tail !== b.tail || b.vertices !== null)
                    throw Error('Invalid balloon preset pairing');
            }
            else {
                if (!b.vertices || b.vertices.length < 3 || b.vertices.length > 128)
                    throw Error('Custom balloon requires 3–128 vertices');
                if (!b.vertices.every(v => Number.isFinite(v.x) && Number.isFinite(v.y) &&
                    v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1))
                    throw Error('Invalid custom balloon vertex');
                let area = 0;
                for (let i = 0; i < b.vertices.length; i++) {
                    const a = b.vertices[i], c = b.vertices[(i + 1) % b.vertices.length];
                    area += a.x * c.y - c.x * a.y;
                }
                if (Math.abs(area) < .00001)
                    throw Error('Degenerate custom balloon polygon');
            }
            if (pageBalloons(inst).length > 256)
                throw Error('Too many balloons');
        }
        function getSelectedBalloon() {
            return selectedBalloon ? { ...selectedBalloon } : null;
        }
        function selectBalloon(instanceId, id) {
            if (!instanceId || !id) {
                selectedBalloon = null;
                kernel.emit('state:changed');
                return false;
            }
            const board = getCurrentBoard();
            const page = board?.instances.find(i => i.type === 'manga-page' && i.id === instanceId);
            if (!page || page.type !== 'manga-page' || !pageBalloons(page).some(b => b.id === id))
                return false;
            selectedBalloon = { instanceId, id };
            selectedHorizontalText = null;
            mangaToolMode = null;
            selectedMangaEffect = null;
            balloonDrawMode = null;
            kernel.emit('state:changed');
            return true;
        }
        function getBalloonDrawMode() {
            return balloonDrawMode ? { instanceId: balloonDrawMode.instanceId,
                points: balloonDrawMode.points.map(p => ({ ...p })) } : null;
        }
        function setBalloonDrawMode(instanceId) {
            if (!instanceId) {
                balloonDrawMode = null;
                kernel.emit('state:changed');
                return false;
            }
            const page = getCurrentBoard()?.instances.find(i => i.id === instanceId);
            if (!page || page.type !== 'manga-page' || page.locked)
                return false;
            balloonDrawMode = { instanceId, points: [] };
            selectedHorizontalText = null;
            selectedBalloon = null;
            selectedMangaEffect = null;
            mangaToolMode = null;
            knifeMode = null;
            vertexMode = null;
            cropMode = null;
            kernel.emit('state:changed');
            return true;
        }
        function appendBalloonPoint(point) {
            if (!balloonDrawMode || balloonDrawMode.points.length >= 128 ||
                !Number.isFinite(point.x) || !Number.isFinite(point.y))
                return false;
            const page = getCurrentBoard()?.instances.find(i => i.id === balloonDrawMode.instanceId);
            if (!page || page.type !== 'manga-page' || page.locked)
                return false;
            const ps = PS.get(page.panelSetId);
            if (!ps || point.x < 0 || point.y < 0 || point.x > ps.width || point.y > ps.height)
                return false;
            balloonDrawMode.points.push({ ...point });
            kernel.emit('state:changed');
            return true;
        }
        async function completeBalloonDraw() {
            const mode = getBalloonDrawMode();
            if (!mode || mode.points.length < 3)
                return null;
            const page = getCurrentBoard()?.instances.find(i => i.id === mode.instanceId);
            if (!page || page.type !== 'manga-page' || page.locked)
                return null;
            const xs = mode.points.map(p => p.x), ys = mode.points.map(p => p.y);
            const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
            if (w < 8 || h < 8)
                throw Error('Custom balloon too small');
            const vertices = mode.points.map(p => ({ x: (p.x - x) / w, y: (p.y - y) / h }));
            const created = await addBalloon(page, { presetId: null, shape: 'round', tail: 'none',
                x, y, width: w, height: h, vertices });
            balloonDrawMode = null;
            selectBalloon(page.id, created.id);
            return created;
        }
        async function addBalloon(inst, patch = { presetId: 'oval-bottom' }) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!patch || Object.keys(patch).some(k => !balloonKeys.has(k)))
                throw Error('Unsupported balloon property');
            const base = balloonDefaults(inst, patch.presetId === undefined ? 'oval-bottom' : patch.presetId);
            const full = { ...base, ...patch,
                vertices: patch.vertices === undefined ? base.vertices :
                    patch.vertices === null ? null : patch.vertices.map(p => ({ ...p })) };
            validateBalloon(inst, full);
            if (pageBalloons(inst).length >= 256)
                throw Error('Page limit: 256 balloons');
            return kernel.call('history', 'transaction', 'manga.balloon.add', async () => {
                const result = { ...full, id: utils.uid('balloon') };
                if (!inst.vp1Balloons)
                    inst.vp1Balloons = [];
                inst.vp1Balloons.push(result);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return deepBalloon(result);
            });
        }
        async function updateBalloon(inst, id, patch) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            if (!patch || Object.keys(patch).some(k => !balloonKeys.has(k)))
                throw Error('Unsupported balloon property');
            const old = pageBalloons(inst).find(x => x.id === id);
            if (!old || old.locked || getLayerNodeState(inst, 'balloon', id)?.locked)
                throw Error('Balloon missing or locked');
            const full = { ...old, ...patch,
                vertices: patch.vertices === undefined ? old.vertices :
                    patch.vertices === null ? null : patch.vertices.map(p => ({ ...p })) };
            validateBalloon(inst, full);
            if (JSON.stringify(full) === JSON.stringify(old))
                return false;
            return kernel.call('history', 'transaction', 'manga.balloon.update', async () => {
                const index = pageBalloons(inst).findIndex(x => x.id === id);
                if (index < 0)
                    throw Error('Balloon removed during edit');
                inst.vp1Balloons[index] = full;
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        async function removeBalloon(inst, id) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            const old = pageBalloons(inst).find(x => x.id === id);
            if (!old)
                return false;
            if (old.locked || getLayerNodeState(inst, 'balloon', id)?.locked)
                throw Error('Balloon locked');
            return kernel.call('history', 'transaction', 'manga.balloon.remove', async () => {
                inst.vp1Balloons = pageBalloons(inst).filter(x => x.id !== id);
                if (selectedBalloon?.instanceId === inst.id && selectedBalloon.id === id)
                    selectedBalloon = null;
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        async function setBalloonVertex(inst, id, index, point) {
            const balloon = pageBalloons(inst).find(b => b.id === id);
            if (!balloon || !balloon.vertices || !Number.isSafeInteger(index) ||
                index < 0 || index >= balloon.vertices.length)
                throw Error('Unknown balloon vertex');
            const local = { x: (point.x - balloon.x) / balloon.width,
                y: (point.y - balloon.y) / balloon.height };
            return updateBalloon(inst, id, { vertices: balloon.vertices.map((p, i) => i === index ? local : { ...p }) });
        }
        async function reorderBalloon(inst, id, direction) {
            if (!inst || inst.locked)
                throw Error('Page missing or locked');
            const ordered = pageBalloons(inst).slice().sort((a, b) => a.zIndex - b.zIndex);
            const index = ordered.findIndex(b => b.id === id);
            if (index < 0)
                throw Error('Balloon missing');
            const target = direction === 'forward' ? index + 1 : index - 1;
            if (target < 0 || target >= ordered.length)
                return false;
            if (ordered[index].locked || ordered[target].locked)
                throw Error('Cannot reorder a locked balloon');
            return kernel.call('history', 'transaction', 'manga.balloon.reorder', async () => {
                const a = ordered[index], b = ordered[target];
                const z = a.zIndex;
                a.zIndex = b.zIndex;
                b.zIndex = z;
                // Renumber to ensure that even legacy ties have deterministic stacking.
                ordered.sort((x, y) => x.zIndex - y.zIndex).forEach((item, i) => item.zIndex = i + 1);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        function balloonPaths(b) {
            if (b.visible === false)
                return [];
            const X = (n) => b.x + n * b.width, Y = (n) => b.y + n * b.height;
            const pt = (u, v) => X(u) + ' ' + Y(v);
            let d = '';
            if (b.vertices) {
                d = 'M' + b.vertices.map(p => pt(p.x, p.y)).join(' L') + ' Z';
            }
            else if (b.shape === 'oval' || b.shape === 'thought') {
                d = 'M' + pt(.5, .08) + ' C' + pt(.78, .08) + ' ' + pt(.96, .24) + ' ' + pt(.96, .5) +
                    ' C' + pt(.96, .76) + ' ' + pt(.78, .92) + ' ' + pt(.5, .92) +
                    ' C' + pt(.22, .92) + ' ' + pt(.04, .76) + ' ' + pt(.04, .5) +
                    ' C' + pt(.04, .24) + ' ' + pt(.22, .08) + ' ' + pt(.5, .08) + ' Z';
            }
            else if (b.shape === 'round') {
                d = 'M' + pt(.2, .07) + ' L' + pt(.8, .07) + ' Q' + pt(.95, .07) + ' ' + pt(.95, .24) +
                    ' L' + pt(.95, .76) + ' Q' + pt(.95, .93) + ' ' + pt(.8, .93) +
                    ' L' + pt(.2, .93) + ' Q' + pt(.05, .93) + ' ' + pt(.05, .76) +
                    ' L' + pt(.05, .24) + ' Q' + pt(.05, .07) + ' ' + pt(.2, .07) + ' Z';
            }
            else if (b.shape === 'box' || b.shape === 'caption') {
                d = 'M' + pt(.05, .08) + ' L' + pt(.95, .08) + ' L' + pt(.95, .92) +
                    ' L' + pt(.05, .92) + ' Z';
            }
            else {
                const steps = b.shape === 'burst' ? 32 : b.shape === 'shout' ? 24 : 20;
                const nodes = [];
                for (let i = 0; i < steps; i++) {
                    const angle = i * Math.PI * 2 / steps - Math.PI / 2;
                    const radius = b.shape === 'cloud' ? (i % 2 === 0 ? .44 : .49) :
                        (i % 2 === 0 ? .5 : b.shape === 'shout' ? .37 : .29);
                    nodes.push(pt(.5 + Math.cos(angle) * radius, .5 + Math.sin(angle) * radius * .86));
                }
                d = 'M' + nodes.join(' L') + ' Z';
            }
            const result = [];
            if (b.tail !== 'none' && !b.vertices) {
                const cfg = {
                    'bottom-left': [.22, .83, .08, 1.12, .35, .86],
                    'bottom': [.44, .89, .5, 1.14, .56, .89],
                    'bottom-right': [.65, .86, .91, 1.12, .78, .83],
                    'left': [.1, .42, -.15, .55, .1, .62],
                    'right': [.9, .42, 1.15, .55, .9, .62]
                };
                const t = cfg[b.tail];
                if (t) {
                    result.push({ d: 'M' + pt(t[0], t[1]) + ' L' + pt(t[2], t[3]) +
                            ' L' + pt(t[4], t[5]) + ' Z', fill: b.fill, stroke: b.stroke,
                        strokeWidth: b.strokeWidth, opacity: b.fillOpacity });
                }
            }
            result.push({ d, fill: b.fill, stroke: b.stroke,
                strokeWidth: b.strokeWidth, opacity: b.fillOpacity });
            return result;
        }
        function balloonTextLayout(b) {
            // Shared deterministic wrapping for SVG preview and Canvas export.
            const maxChars = Math.max(4, Math.floor(b.width * .72 / (b.textSize * .58)));
            const lines = [];
            for (const paragraph of b.text.split(/\r?\n/)) {
                const words = paragraph.split(/\s+/);
                let line = '';
                for (const word of words) {
                    if ((line + ' ' + word).trim().length <= maxChars) {
                        line = (line + ' ' + word).trim();
                        continue;
                    }
                    if (line)
                        lines.push(line);
                    let rest = word;
                    while (rest.length > maxChars) {
                        lines.push(rest.slice(0, maxChars));
                        rest = rest.slice(maxChars);
                    }
                    line = rest;
                }
                lines.push(line);
            }
            const lineHeight = b.textSize * 1.2;
            const top = b.y + b.height / 2 - (lines.length - 1) * lineHeight / 2;
            return { lines, x: b.x + b.width / 2, y: top, lineHeight, fontSize: b.textSize };
        }
        kernel.on('history:applied', () => { selectedBalloon = null; balloonDrawMode = null; });
        kernel.on('board:navigated', () => { selectedBalloon = null; balloonDrawMode = null; });
        /* VP1-062–068 — independent, page-local horizontal text objects.
         * No balloon link, no image mutation, and no external font loading. */
        const horizontalFonts = [
            'Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New'
        ];
        const horizontalKeys = new Set(['text', 'x', 'y', 'width', 'height', 'rotation',
            'fontFamily', 'fontSize', 'bold', 'align', 'color', 'outlineColor',
            'outlineWidth', 'opacity', 'visible', 'locked', 'zIndex']);
        let selectedHorizontalText = null;
        const textsOf = (page) => Array.isArray(page.vp1HorizontalTexts) ? page.vp1HorizontalTexts : [];
        const cloneHorizontalText = (item) => JSON.parse(JSON.stringify(item));
        function listHorizontalFonts() { return horizontalFonts.slice(); }
        function listHorizontalTexts(page) {
            return textsOf(page).map(cloneHorizontalText).sort((a, b) => a.zIndex - b.zIndex);
        }
        function horizontalDefault(page) {
            const ps = PS.get(page.panelSetId);
            if (!ps)
                throw Error('Text page template missing');
            return { text: 'Text', x: Math.round(ps.width * .3), y: Math.round(ps.height * .3),
                width: Math.min(320, Math.max(100, ps.width * .5)), height: 90, rotation: 0,
                fontFamily: 'Arial', fontSize: 28, bold: false, align: 'center', color: '#111111',
                outlineColor: '#ffffff', outlineWidth: 0, opacity: 1, visible: true, locked: false,
                zIndex: textsOf(page).reduce((n, t) => Math.max(n, t.zIndex), 0) + 1 };
        }
        function validateHorizontalText(page, t) {
            if (!PS.get(page.panelSetId))
                throw Error('Text page template missing');
            if (typeof t.text !== 'string' || t.text.length > 4000 ||
                /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(t.text))
                throw Error('Invalid horizontal text content');
            if (!horizontalFonts.includes(t.fontFamily) || !['left', 'center', 'right'].includes(t.align))
                throw Error('Unsupported offline font or alignment');
            if (![t.x, t.y, t.width, t.height, t.rotation, t.fontSize, t.outlineWidth,
                t.opacity, t.zIndex].every(Number.isFinite) ||
                t.width < 16 || t.width > 8192 || t.height < 16 || t.height > 8192 ||
                Math.abs(t.x) > 65536 || Math.abs(t.y) > 65536 || Math.abs(t.rotation) > 360 ||
                t.fontSize < 8 || t.fontSize > 160 || t.outlineWidth < 0 || t.outlineWidth > 24 ||
                t.opacity < 0 || t.opacity > 1 || !Number.isSafeInteger(t.zIndex) ||
                t.zIndex < 1 || t.zIndex > 100000)
                throw Error('Invalid text dimensions or style');
            if (typeof t.bold !== 'boolean' || typeof t.visible !== 'boolean' ||
                typeof t.locked !== 'boolean' || !/^#[0-9a-fA-F]{6}$/.test(t.color) ||
                !/^#[0-9a-fA-F]{6}$/.test(t.outlineColor))
                throw Error('Invalid text state or color');
        }
        function getSelectedHorizontalText() {
            return selectedHorizontalText ? { ...selectedHorizontalText } : null;
        }
        function selectHorizontalText(instanceId, id) {
            if (!instanceId || !id) {
                selectedHorizontalText = null;
                kernel.emit('state:changed');
                return false;
            }
            const pg = getCurrentBoard()?.instances.find(i => i.id === instanceId);
            if (!pg || pg.type !== 'manga-page' || !textsOf(pg).some(t => t.id === id))
                return false;
            selectedHorizontalText = { instanceId, id };
            selectedBalloon = null;
            balloonDrawMode = null;
            mangaToolMode = null;
            selectedMangaEffect = null;
            knifeMode = null;
            vertexMode = null;
            cropMode = null;
            kernel.emit('state:changed');
            return true;
        }
        async function addHorizontalText(page, patch = {}) {
            if (!page || page.locked)
                throw Error('Page missing or locked');
            if (!patch || Object.keys(patch).some(k => !horizontalKeys.has(k)))
                throw Error('Unsupported horizontal text property');
            const text = { ...horizontalDefault(page), ...patch };
            validateHorizontalText(page, text);
            if (textsOf(page).length >= 256)
                throw Error('Page limit: 256 horizontal texts');
            return kernel.call('history', 'transaction', 'manga.text.add', async () => {
                const obj = { ...text, id: utils.uid('text') };
                if (!page.vp1HorizontalTexts)
                    page.vp1HorizontalTexts = [];
                page.vp1HorizontalTexts.push(obj);
                kernel.emit('manga-page:changed', { instanceId: page.id });
                kernel.emit('state:changed');
                return cloneHorizontalText(obj);
            });
        }
        async function updateHorizontalText(page, id, patch) {
            if (!page || page.locked)
                throw Error('Page missing or locked');
            if (!patch || Object.keys(patch).some(k => !horizontalKeys.has(k)))
                throw Error('Unsupported horizontal text property');
            const old = textsOf(page).find(t => t.id === id);
            if (!old || old.locked || getLayerNodeState(page, 'text', id)?.locked)
                throw Error('Text missing or locked');
            const next = { ...old, ...patch };
            validateHorizontalText(page, next);
            if (JSON.stringify(old) === JSON.stringify(next))
                return false;
            return kernel.call('history', 'transaction', 'manga.text.update', async () => {
                const i = textsOf(page).findIndex(t => t.id === id);
                if (i < 0)
                    throw Error('Text removed during edit');
                page.vp1HorizontalTexts[i] = next;
                kernel.emit('manga-page:changed', { instanceId: page.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        async function removeHorizontalText(page, id) {
            if (!page || page.locked)
                throw Error('Page missing or locked');
            const old = textsOf(page).find(t => t.id === id);
            if (!old)
                return false;
            if (old.locked || getLayerNodeState(page, 'text', id)?.locked)
                throw Error('Text locked');
            return kernel.call('history', 'transaction', 'manga.text.remove', async () => {
                page.vp1HorizontalTexts = textsOf(page).filter(t => t.id !== id);
                if (selectedHorizontalText?.instanceId === page.id &&
                    selectedHorizontalText.id === id)
                    selectedHorizontalText = null;
                kernel.emit('manga-page:changed', { instanceId: page.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        function horizontalTextLayout(t) {
            // Equal segmentation for DOM SVG and Canvas 2D. Explicit newlines persist.
            const width = Math.max(1, Math.floor(t.width / (t.fontSize * (t.bold ? .66 : .59))));
            const lines = [];
            for (const paragraph of t.text.split(/\r?\n/)) {
                if (!paragraph.length) {
                    lines.push('');
                    continue;
                }
                let line = '';
                for (const word of paragraph.split(/(\s+)/)) {
                    if (!word)
                        continue;
                    let pending = word;
                    while (pending.length) {
                        const remain = width - line.length;
                        if (remain <= 0) {
                            lines.push(line.trimEnd());
                            line = '';
                            continue;
                        }
                        if (pending.length <= remain) {
                            line += pending;
                            pending = '';
                        }
                        else if (!line) {
                            lines.push(pending.slice(0, remain));
                            pending = pending.slice(remain);
                        }
                        else {
                            lines.push(line.trimEnd());
                            line = '';
                            pending = pending.trimStart();
                        }
                    }
                }
                lines.push(line.trimEnd());
            }
            const lineHeight = t.fontSize * 1.2;
            return { lines, x: t.align === 'left' ? t.x : t.align === 'right' ? t.x + t.width :
                    t.x + t.width / 2, y: t.y + t.fontSize * .6, lineHeight,
                maxWidth: t.width, fontSize: t.fontSize };
        }
        kernel.on('history:applied', () => { selectedHorizontalText = null; });
        kernel.on('board:navigated', () => { selectedHorizontalText = null; });
        const treeKey = (kind, id) => kind + ':' + id;
        const treeMeta = (page, kind, id) => page.vp1LayerTreeMeta?.[treeKey(kind, id)] || {};
        function findTreeNode(page, kind, id) {
            if (kind === 'panel') {
                if (id === '__overlay__')
                    return { object: { id, layers: page.overlays || [] }, panelId: id };
                const panel = page.panels.find(p => p.id === id);
                return panel ? { object: panel, panelId: panel.id } : null;
            }
            if (kind === 'image') {
                for (const panel of page.panels) {
                    const obj = panel.layers.find(l => l.id === id);
                    if (obj)
                        return { object: obj, panelId: panel.id };
                }
                const obj = (page.overlays || []).find(l => l.id === id);
                return obj ? { object: obj, panelId: '__overlay__' } : null;
            }
            if (kind === 'drawing') {
                const obj = (page.vp1MangaEffects || []).find(e => e.id === id);
                return obj ? { object: obj, panelId: obj.scope === 'panel' ? obj.panelId : '__overlay__' } : null;
            }
            if (kind === 'balloon') {
                const obj = (page.vp1Balloons || []).find(b => b.id === id);
                return obj ? { object: obj, panelId: '__overlay__' } : null;
            }
            const obj = (page.vp1HorizontalTexts || []).find(t => t.id === id);
            return obj ? { object: obj, panelId: '__overlay__' } : null;
        }
        function getLayerNodeState(page, kind, id) {
            const found = findTreeNode(page, kind, id);
            if (!found)
                return null;
            const meta = treeMeta(page, kind, id);
            const object = found.object;
            const ownVisible = meta.visible ?? object.visible ?? true;
            const ownLocked = meta.locked ?? object.locked ?? false;
            const inherited = kind !== 'panel' && found.panelId ?
                treeMeta(page, 'panel', found.panelId) : null;
            return { visible: ownVisible && (inherited?.visible ?? true),
                locked: ownLocked || (inherited?.locked ?? false),
                ownVisible, ownLocked,
                name: meta.name || '', panelId: found.panelId };
        }
        function listLayerTree(page) {
            const ps = PS.get(page.panelSetId);
            if (!ps)
                return [];
            const nodes = [];
            const put = (kind, id, parentId, fallback, zIndex, assetId) => {
                const state = getLayerNodeState(page, kind, id);
                if (!state)
                    return;
                const meta = treeMeta(page, kind, id);
                nodes.push({ kind, id, parentId, depth: parentId === null ? 0 : 1,
                    name: meta.name || fallback, visible: state.visible, locked: state.locked,
                    ownVisible: state.ownVisible, ownLocked: state.ownLocked,
                    zIndex, assetId: assetId || null });
            };
            ps.panels.forEach((panel, i) => {
                put('panel', panel.id, null, 'Panel ' + (i + 1), i + 1);
                const owned = page.panels.find(p => p.id === panel.id);
                (owned?.layers || []).slice().sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
                    .forEach((layer, n) => put('image', layer.id, panel.id, S.assets.find(a => a.id === layer.assetId)?.name || 'Image ' + (n + 1), layer.zIndex || n + 1, layer.assetId));
                (page.vp1MangaEffects || []).filter(e => e.scope === 'panel' &&
                    e.panelId === panel.id).forEach((effect, n) => put('drawing', effect.id, panel.id, effect.kind + ' ' + (n + 1), n + 1));
            });
            putOverlay();
            function putOverlay() {
                put('panel', '__overlay__', null, 'Page overlay', ps.panels.length + 1);
                // The overlay itself is a virtual folder, not a persisted MangaPanel.
                (page.overlays || []).slice().sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
                    .forEach((layer, n) => put('image', layer.id, '__overlay__', S.assets.find(a => a.id === layer.assetId)?.name || 'Image ' + (n + 1), layer.zIndex || n + 1, layer.assetId));
                (page.vp1MangaEffects || []).filter(e => e.scope === 'page')
                    .forEach((e, n) => put('drawing', e.id, '__overlay__', e.kind + ' ' + (n + 1), e.zIndex || n + 1));
                (page.vp1Balloons || []).slice().sort((a, b) => b.zIndex - a.zIndex)
                    .forEach(b => put('balloon', b.id, '__overlay__', b.text.slice(0, 30) || b.shape, b.zIndex));
                (page.vp1HorizontalTexts || []).slice().sort((a, b) => b.zIndex - a.zIndex)
                    .forEach(t => put('text', t.id, '__overlay__', t.text.split('\n')[0].slice(0, 30) || 'Text', t.zIndex));
            }
            return nodes;
        }
        async function updateLayerTreeNode(page, kind, id, patch) {
            if (!page || page.locked)
                throw Error('Page missing or locked');
            const item = findTreeNode(page, kind, id);
            if (!item)
                throw Error('Layer tree node missing');
            if (!patch || Object.keys(patch).some(k => !['name', 'ownVisible', 'ownLocked'].includes(k)))
                throw Error('Unsupported tree node property');
            if (patch.name !== undefined && (typeof patch.name !== 'string' ||
                patch.name.length > 80 || /[\u0000-\u001f]/.test(patch.name)))
                throw Error('Invalid layer name');
            if (patch.ownVisible !== undefined && typeof patch.ownVisible !== 'boolean')
                throw Error('Invalid layer visibility');
            if (patch.ownLocked !== undefined && typeof patch.ownLocked !== 'boolean')
                throw Error('Invalid layer lock');
            const before = treeMeta(page, kind, id);
            const next = { ...before };
            if (patch.name !== undefined)
                next.name = patch.name.trim();
            if (patch.ownVisible !== undefined)
                next.visible = patch.ownVisible;
            if (patch.ownLocked !== undefined)
                next.locked = patch.ownLocked;
            if (JSON.stringify(before) === JSON.stringify(next))
                return false;
            return kernel.call('history', 'transaction', 'manga.tree.update', async () => {
                page.vp1LayerTreeMeta = { ...(page.vp1LayerTreeMeta || {}),
                    [treeKey(kind, id)]: next };
                // Keep native balloon/text edit guards consistent with tree locks.
                if (patch.ownLocked !== undefined && (kind === 'text' || kind === 'balloon'))
                    item.object.locked = patch.ownLocked;
                kernel.emit('manga-page:changed', { instanceId: page.id });
                kernel.emit('state:changed');
                return true;
            });
        }
        async function reorderLayerTreeNode(page, kind, id, direction) {
            if (!page || page.locked)
                throw Error('Page missing or locked');
            const found = findTreeNode(page, kind, id);
            if (!found || kind === 'panel')
                return false;
            const state = getLayerNodeState(page, kind, id);
            if (!state || state.locked)
                throw Error('Layer locked');
            if (kind === 'image') {
                const p = found.panelId;
                const rows = p === '__overlay__' ? page.overlays || [] :
                    page.panels.find(x => x.id === p)?.layers || [];
                const sorted = rows.slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                const i = sorted.findIndex(x => x.id === id), j = i + (direction === 'forward' ? 1 : -1);
                if (j < 0 || j >= sorted.length)
                    return false;
                if (getLayerNodeState(page, 'image', sorted[j].id)?.locked)
                    throw Error('Adjacent layer locked');
                await reorderLayer(page, p, id, direction);
                return true;
            }
            if (kind === 'balloon')
                return reorderBalloon(page, id, direction);
            const records = kind === 'text' ? page.vp1HorizontalTexts || [] :
                (page.vp1MangaEffects || []).filter(e => e.scope ===
                    (found.panelId === '__overlay__' ? 'page' : 'panel') &&
                    (found.panelId === '__overlay__' || e.panelId === found.panelId));
            const sorted = records.slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
            const i = sorted.findIndex(x => x.id === id), j = i + (direction === 'forward' ? 1 : -1);
            if (j < 0 || j >= sorted.length)
                return false;
            if (getLayerNodeState(page, kind, sorted[j].id)?.locked)
                throw Error('Adjacent layer locked');
            return kernel.call('history', 'transaction', 'manga.tree.reorder', async () => {
                const a = sorted[i], b = sorted[j];
                // Renumber every sibling, including legacy effects with no zIndex.
                sorted.forEach((item, n) => { item.zIndex = n + 1; });
                a.zIndex = j + 1;
                b.zIndex = i + 1;
                kernel.emit('manga-page:changed', { instanceId: page.id });
                kernel.emit('state:changed');
                return true;
            });
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
            tryDrop: tryDrop,
            getKnifeMode, setKnifeMode, previewKnife, splitPanel, setPanelGutter,
            getVertexMode, setVertexMode, previewVertex, moveVertex, getPanelStyle, updatePanelStyle,
            getLayerFraming, updateLayerFraming, autoFitLayer, zoomLayer, replaceLayerAsset, resetLayerFraming,
            getCropMode, setCropMode,
            listLayerTree, getLayerNodeState, updateLayerTreeNode, reorderLayerTreeNode,
            listHorizontalFonts, listHorizontalTexts, addHorizontalText, updateHorizontalText,
            removeHorizontalText, selectHorizontalText, getSelectedHorizontalText, horizontalTextLayout,
            listBalloonPresets, listBalloons, addBalloon, updateBalloon, removeBalloon, reorderBalloon,
            getSelectedBalloon, selectBalloon, getBalloonDrawMode, setBalloonDrawMode,
            appendBalloonPoint, completeBalloonDraw, setBalloonVertex, balloonPaths, balloonTextLayout,
            listMangaEffects, addMangaEffect, updateMangaEffect, removeMangaEffect, eraseMangaInkAt,
            getMangaToolMode, setMangaToolMode, mangaEffectPrimitives,
            getSelectedMangaEffect, selectMangaEffect, previewMangaInk, eraseMangaInkPath
        });
    }
});
