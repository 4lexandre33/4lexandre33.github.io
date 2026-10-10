"use strict";
/** TS-016: typed UI/inspector/app plugin with unchanged legacy runtime structure. */
/* =====================================================================
 * plugins/25b-panel-inspector.js
 * Painel lateral de inspeção da manga page.
 *
 * FASE B (Layer drop zones):
 *   - Drop zones entre cada par de layers
 *   - Drop de asset da library sobre uma drop zone → insertLayerAt
 *   - Drop de asset sobre uma row → acima/abaixo conforme metade clicada
 *   - Botão [+ Add image here] → file picker, insere no topo (frente)
 *   - Drag interno (reorder) continua funcionando
 *
 * FASE D (Polish):
 *   - Cabeçalhos de seção com barra de ações (✎ Edit · + Add · 🧹 Clear)
 *
 * FASE E1 (Refatoração):
 *   - Extraído `buildLayerListBody(layers, panelId, inst)` de
 *     `buildLayerListSection`, para reuso no overlay.
 *
 * FASE E2 (Overlay drag habilitado):
 *   - Rows do overlay agora são draggable + dragstart + dragend.
 *   - Guards de isOverlay removidos no dragover/drop do drag interno.
 *   - Overlay passa a usar `buildLayerListBody` (traz drop zones).
 *   - Cross-container continua bloqueado por `drag.panelId !== panelId`.
 *
 * FASE E3 (Guard cross-container defensivo):
 *   - `drag.containerKey = panelId` (identifica o container de origem).
 *   - Row sob o cursor de um container diferente recebe `.drop-forbidden`
 *     (contorno vermelho) + cursor no-drop. O drop é ignorado.
 *
 * FASE E4 (Overlay edit):
 *   - Botão ✎ habilitado para o overlay (ME.enter(inst.id, '__overlay__')).
 *
 * FIX v1.6.2:
 *   - Arquivo truncado no commit anterior. Recuperado com o wrapper
 *     definePlugin({...}) completo + todas as funções auxiliares.
 * ===================================================================== */
definePlugin({
    id: 'panel-inspector',
    version: '1.6.2',
    needs: ['utils', 'state', 'mangaPage', 'panelSets', 'assets', 'ui.dialogs'],
    provides: ['panelInspector'],
    uses: ['history', 'mangaEdit'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0', 'history': '^1.0.0', 'mangaEdit': '^1.0.0' },
    contractVersions: { 'panelInspector': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        const MP = await kernel.require('mangaPage');
        const PS = await kernel.require('panelSets');
        const A = await kernel.require('assets');
        const D = await kernel.require('ui.dialogs');
        const rightBody = document.querySelector('#right .nav-body');
        if (!rightBody)
            return;
        const head = document.createElement('div');
        head.className = 'side-head';
        head.id = 'inspector-head';
        head.hidden = true;
        head.innerHTML = '<h2>Panel Inspector</h2>';
        const body = document.createElement('div');
        body.className = 'side-body inspector-body';
        body.id = 'inspector-body';
        body.hidden = true;
        const content = document.createElement('div');
        content.className = 'insp-content';
        content.id = 'insp-content';
        body.appendChild(content);
        // Mount the dynamic inspector between the fixed Navigator and Package Manager
        // splitters. This preserves the DOM ABI and keeps all three sections resizable.
        const inspectorDivider = document.getElementById('resize-inspector');
        rightBody.parentNode.insertBefore(head, inspectorDivider || rightBody.nextSibling);
        rightBody.parentNode.insertBefore(body, head.nextSibling);
        /* ---------------- Drag state (interno) ---------------- */
        let drag = null; // { layerId, panelId, containerKey, instanceId }
        function clearInternalDropIndicators() {
            content.querySelectorAll('.insp-layer').forEach(function (el) {
                el.classList.remove('drop-above', 'drop-below', 'is-dragging', 'ext-drop-above', 'ext-drop-below', 'drop-forbidden');
            });
            content.querySelectorAll('.layer-drop-zone').forEach(function (el) {
                el.classList.remove('drag-over');
            });
            content.querySelectorAll('.insp-add-zone').forEach(function (el) {
                el.classList.remove('drag-over');
            });
        }
        /* ---------------- Helpers ---------------- */
        function instanceById(id) {
            if (!id)
                return null;
            for (let bi = 0; bi < S.boards.length; bi++) {
                const b = S.boards[bi];
                for (let ii = 0; ii < b.instances.length; ii++) {
                    if (b.instances[ii].id === id)
                        return b.instances[ii];
                }
            }
            return null;
        }
        function currentFocusInstance() {
            const f = MP.getFocus();
            if (!f || !f.instanceId)
                return null;
            const inst = instanceById(f.instanceId);
            if (!inst || inst.type !== 'manga-page')
                return null;
            return inst;
        }
        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
            });
        }
        function hasAssetDrag(e) {
            if (!e.dataTransfer)
                return false;
            const types = Array.from(e.dataTransfer.types || []);
            return types.indexOf('application/x-nvb-asset') !== -1;
        }
        function readAssetId(e) {
            try {
                return e.dataTransfer.getData('application/x-nvb-asset') ||
                    e.dataTransfer.getData('text/plain') || '';
            }
            catch (err) {
                return '';
            }
        }
        /* ---------------- Insert helpers ---------------- */
        async function insertAssetAt(inst, panelId, assetId, index) {
            const layer = await MP.insertLayerAt(inst, panelId, assetId, index);
            if (!layer)
                return false;
            render();
            return true;
        }
        function openFilePickerAndInsert(inst, panelId, baseIndex) {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.multiple = true;
            input.style.display = 'none';
            document.body.appendChild(input);
            input.addEventListener('change', async function () {
                const files = Array.from(input.files || []);
                if (input.parentNode)
                    input.parentNode.removeChild(input);
                if (!files.length)
                    return;
                let inserted = 0;
                await kernel.call('history', 'transaction', 'inspector.importImages', async function () {
                    let idx = baseIndex;
                    for (const file of files) {
                        if (!utils.isSupportedImageFile(file))
                            continue;
                        try {
                            const asset = await A.createFromFile(file, A.ensureDefaultPackage());
                            await MP.insertLayerAt(inst, panelId, asset.id, idx);
                            idx++;
                            inserted++;
                        }
                        catch (err) {
                            kernel.log.warn('insert from file failed', file.name, err);
                        }
                    }
                });
                kernel.emit('assets:changed');
                render();
                if (inserted)
                    D.toast(inserted + ' image' + (inserted === 1 ? '' : 's') + ' inserted.', 'ok');
            });
            input.click();
        }
        /* ---------------- Clear helper ---------------- */
        async function clearPanel(inst, panelId, label) {
            const isOverlay = panelId === '__overlay__';
            const arr = isOverlay
                ? (inst.overlays || [])
                : ((inst.panels || []).find(function (p) { return p.id === panelId; }) || {}).layers || [];
            const count = arr.length;
            if (!count)
                return;
            const ok = await D.confirm({
                title: 'Clear ' + label + '?',
                message: 'Remove all ' + count + ' layer(s) from this ' + (isOverlay ? 'overlay' : 'panel') + '.',
                danger: true
            });
            if (!ok)
                return;
            const before = await kernel.call('history', 'snapshot');
            if (isOverlay)
                inst.overlays = [];
            else {
                const p = (inst.panels || []).find(function (x) { return x.id === panelId; });
                if (p)
                    p.layers = [];
            }
            await kernel.call('history', 'push', before);
            kernel.emit('manga-page:changed', { instanceId: inst.id });
            kernel.emit('state:changed');
            render();
        }
        /* ---------------- Action bar builder ---------------- */
        function buildSectionHead(inst, panelId, title, layers) {
            const wrap = document.createElement('div');
            wrap.className = 'insp-section-head';
            const label = document.createElement('div');
            label.className = 'insp-label';
            label.textContent = title;
            wrap.appendChild(label);
            const actions = document.createElement('div');
            actions.className = 'insp-head-actions';
            const isOverlay = panelId === '__overlay__';
            // ✎ Edit mode — para painel E overlay (Fase E4)
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'insp-mini-btn';
            editBtn.title = isOverlay
                ? 'Edit overlay (drag & resize layers)'
                : 'Enter panel edit mode';
            editBtn.textContent = '✎';
            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (!kernel.has('mangaEdit'))
                    return;
                kernel.require('mangaEdit').then(function (ME) {
                    ME.enter(inst.id, panelId);
                });
            });
            actions.appendChild(editBtn);
            // + Add image (file picker)
            const addBtn = document.createElement('button');
            addBtn.type = 'button';
            addBtn.className = 'insp-mini-btn primary';
            addBtn.title = isOverlay ? 'Add image to overlay (from file)…' : 'Add image to this panel (from file)…';
            addBtn.textContent = '+';
            addBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const baseIdx = isOverlay
                    ? (inst.overlays || []).length
                    : (layers ? layers.length : 0);
                openFilePickerAndInsert(inst, panelId, baseIdx);
            });
            actions.appendChild(addBtn);
            // 🧹 Clear
            if (layers && layers.length) {
                const clearBtn = document.createElement('button');
                clearBtn.type = 'button';
                clearBtn.className = 'insp-mini-btn danger';
                clearBtn.title = isOverlay ? 'Clear overlay' : 'Clear this panel';
                clearBtn.textContent = '🧹';
                clearBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    const label = isOverlay ? 'overlay' : title.replace(/^Layers in /, '');
                    clearPanel(inst, panelId, label);
                });
                actions.appendChild(clearBtn);
            }
            wrap.appendChild(actions);
            return wrap;
        }
        /* ---------------- Drop zone builder ---------------- */
        function buildDropZone(inst, panelId, insertionIndex) {
            const zone = document.createElement('div');
            zone.className = 'layer-drop-zone';
            zone.dataset.insertIndex = String(insertionIndex);
            zone.addEventListener('dragover', function (e) {
                if (drag)
                    return;
                if (!hasAssetDrag(e))
                    return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                content.querySelectorAll('.layer-drop-zone').forEach(function (z) {
                    if (z !== zone)
                        z.classList.remove('drag-over');
                });
                content.querySelectorAll('.insp-layer').forEach(function (r) {
                    r.classList.remove('ext-drop-above', 'ext-drop-below', 'drop-above', 'drop-below');
                });
                content.querySelectorAll('.insp-add-zone').forEach(function (z) {
                    z.classList.remove('drag-over');
                });
                zone.classList.add('drag-over');
            });
            zone.addEventListener('dragleave', function () {
                zone.classList.remove('drag-over');
            });
            zone.addEventListener('drop', async function (e) {
                if (drag)
                    return;
                if (!hasAssetDrag(e))
                    return;
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('drag-over');
                const assetId = readAssetId(e);
                if (!assetId)
                    return;
                await insertAssetAt(inst, panelId, assetId, insertionIndex);
            });
            return zone;
        }
        /* ---------------- Add zone builder ---------------- */
        function buildAddZone(inst, panelId, insertionIndex) {
            const zone = document.createElement('div');
            zone.className = 'insp-add-zone';
            zone.title = 'Click to pick a file, or drag an image from the library';
            const icon = document.createElement('span');
            icon.className = 'insp-add-icon';
            icon.textContent = '+';
            zone.appendChild(icon);
            const label = document.createElement('span');
            label.textContent = panelId === '__overlay__'
                ? 'Add image to overlay'
                : 'Add image here';
            zone.appendChild(label);
            zone.addEventListener('click', function () {
                openFilePickerAndInsert(inst, panelId, insertionIndex);
            });
            zone.addEventListener('dragover', function (e) {
                if (drag)
                    return;
                if (!hasAssetDrag(e))
                    return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'copy';
                content.querySelectorAll('.layer-drop-zone').forEach(function (z) {
                    z.classList.remove('drag-over');
                });
                content.querySelectorAll('.insp-add-zone').forEach(function (z) {
                    if (z !== zone)
                        z.classList.remove('drag-over');
                });
                content.querySelectorAll('.insp-layer').forEach(function (r) {
                    r.classList.remove('ext-drop-above', 'ext-drop-below');
                });
                zone.classList.add('drag-over');
            });
            zone.addEventListener('dragleave', function () {
                zone.classList.remove('drag-over');
            });
            zone.addEventListener('drop', async function (e) {
                if (drag)
                    return;
                if (!hasAssetDrag(e))
                    return;
                e.preventDefault();
                e.stopPropagation();
                zone.classList.remove('drag-over');
                const assetId = readAssetId(e);
                if (!assetId)
                    return;
                await insertAssetAt(inst, panelId, assetId, insertionIndex);
            });
            return zone;
        }
        /* =================================================================
         * Helper comum — corpo de lista com rows + drop zones.
         * Usado por painéis e pelo overlay.
         * ================================================================= */
        function buildLayerListBody(layers, panelId, inst) {
            const list = document.createElement('div');
            list.className = 'insp-layer-list';
            const displayed = layers.slice().sort(function (a, b) {
                return (b.zIndex || 0) - (a.zIndex || 0);
            });
            const N = displayed.length;
            list.appendChild(buildDropZone(inst, panelId, N));
            if (N === 0) {
                const em = document.createElement('div');
                em.className = 'insp-empty';
                em.textContent = 'Empty. Drag images here, or click Add below.';
                list.appendChild(em);
            }
            else {
                displayed.forEach(function (layer, displayIdx) {
                    list.appendChild(buildLayerRow(layer, panelId, inst, displayIdx, N));
                    const idxBelow = N - (displayIdx + 1);
                    list.appendChild(buildDropZone(inst, panelId, idxBelow));
                });
            }
            return list;
        }
        /* ---------------- Render ---------------- */
        function render() {
            const inst = currentFocusInstance();
            if (!inst) {
                head.hidden = true;
                body.hidden = true;
                return;
            }
            head.hidden = false;
            body.hidden = false;
            const ps = PS.get(inst.panelSetId);
            if (!ps) {
                content.innerHTML = '<div class="insp-empty">Missing panel set</div>';
                return;
            }
            const focus = MP.getFocus();
            const activePanelId = focus.panelId;
            content.innerHTML = '';
            // Header
            const hdr = document.createElement('div');
            hdr.className = 'insp-section';
            const hdrTitle = document.createElement('div');
            hdrTitle.className = 'insp-title';
            hdrTitle.textContent = ps.name || '';
            const hdrMeta = document.createElement('div');
            hdrMeta.className = 'insp-meta';
            hdrMeta.textContent = ps.width + ' × ' + ps.height +
                ' · ' + ps.panels.length + ' panel' + (ps.panels.length === 1 ? '' : 's');
            hdr.append(hdrTitle, hdrMeta);
            content.appendChild(hdr);
            // Panels list
            const pl = document.createElement('div');
            pl.className = 'insp-section';
            const plLabel = document.createElement('div');
            plLabel.className = 'insp-label';
            plLabel.textContent = 'Panels';
            pl.appendChild(plLabel);
            const plList = document.createElement('div');
            plList.className = 'insp-panel-list';
            ps.panels.forEach(function (psPanel, idx) {
                const instPanel = (inst.panels || []).find(function (p) { return p.id === psPanel.id; });
                const count = instPanel ? instPanel.layers.length : 0;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'insp-panel' + (psPanel.id === activePanelId ? ' is-active' : '');
                btn.dataset.panelId = psPanel.id;
                const thumb = document.createElement('div');
                thumb.className = 'insp-panel-thumb';
                thumb.innerHTML = PS.thumbSvg(ps, psPanel.id, 44);
                btn.appendChild(thumb);
                const body2 = document.createElement('div');
                body2.className = 'insp-panel-body';
                const numEl = document.createElement('span');
                numEl.className = 'insp-panel-num';
                numEl.textContent = String(idx + 1);
                body2.appendChild(numEl);
                const nameEl = document.createElement('span');
                nameEl.className = 'insp-panel-name';
                nameEl.textContent = 'Panel ' + (idx + 1);
                body2.appendChild(nameEl);
                const countEl = document.createElement('span');
                countEl.className = 'insp-panel-count';
                countEl.textContent = count + ' layer' + (count === 1 ? '' : 's');
                body2.appendChild(countEl);
                btn.appendChild(body2);
                btn.addEventListener('click', function () {
                    MP.setFocus(inst.id, psPanel.id);
                    render();
                });
                plList.appendChild(btn);
            });
            pl.appendChild(plList);
            content.appendChild(pl);
            /* ---- Conteúdo preservado após troca de template ---- */
            const integrity = MP.validatePage(inst);
            if (integrity.errors.length || integrity.warnings.length) {
                const report = document.createElement('div');
                report.className = 'insp-section insp-migration-warning';
                const title = document.createElement('div');
                title.className = 'insp-label';
                title.textContent = 'Integridade da página';
                report.appendChild(title);
                const messages = integrity.errors.concat(integrity.warnings);
                messages.slice(0, 4).forEach(function (message) {
                    const p = document.createElement('p');
                    p.textContent = message;
                    report.appendChild(p);
                });
                if (messages.length > 4) {
                    const rest = document.createElement('p');
                    rest.textContent = '+' + (messages.length - 4) + ' avisos adicionais';
                    report.appendChild(rest);
                }
                content.appendChild(report);
            }
            const unassigned = MP.getUnassignedPanels(inst);
            if (unassigned.length) {
                const recoveredBox = document.createElement('div');
                recoveredBox.className = 'insp-section insp-recovery-section';
                const heading = document.createElement('div');
                heading.className = 'insp-label';
                heading.textContent = 'Recuperar camadas sem painel (' +
                    unassigned.reduce((n, entry) => n + entry.layerCount, 0) + ')';
                recoveredBox.appendChild(heading);
                const explain = document.createElement('p');
                explain.className = 'muted';
                explain.textContent = 'Estas camadas não são apagadas. Escolha um painel para restaurá-las.';
                recoveredBox.appendChild(explain);
                unassigned.forEach(function (entry) {
                    const row = document.createElement('div');
                    row.className = 'insp-recovery-row';
                    const caption = document.createElement('div');
                    caption.textContent = entry.sourcePanelId + ' (' + entry.layerCount + ' camada(s))';
                    row.appendChild(caption);
                    const select = document.createElement('select');
                    select.setAttribute('aria-label', 'Painel de destino');
                    ps.panels.forEach(function (panel, j) {
                        const option = document.createElement('option');
                        option.value = panel.id;
                        option.textContent = 'Painel ' + (j + 1);
                        select.appendChild(option);
                    });
                    row.appendChild(select);
                    const button = document.createElement('button');
                    button.type = 'button';
                    button.className = 'btn';
                    button.textContent = 'Recuperar';
                    button.addEventListener('click', async function () {
                        button.disabled = true;
                        try {
                            const current = instanceById(inst.id);
                            const ok = current && current.type === 'manga-page' && await MP.recoverUnassignedPanel(current, entry.id, select.value);
                            if (ok)
                                render();
                            else
                                D.toast('Não foi possível recuperar estas camadas.', 'error');
                        }
                        catch (err) {
                            kernel.log.error('layer recovery failed', err);
                            D.toast('Erro ao recuperar camadas: ' + err.message, 'error');
                        }
                        finally {
                            button.disabled = false;
                        }
                    });
                    row.appendChild(button);
                    recoveredBox.appendChild(row);
                });
                content.appendChild(recoveredBox);
            }
            // Layers of active panel
            if (activePanelId && activePanelId !== '__overlay__') {
                const instPanel = (inst.panels || []).find(function (p) { return p.id === activePanelId; });
                if (instPanel) {
                    const panelIdx = ps.panels.findIndex(function (p) { return p.id === activePanelId; });
                    const panelLabel = panelIdx >= 0 ? 'Panel ' + (panelIdx + 1) : activePanelId;
                    content.appendChild(buildLayerListSection('Layers in ' + panelLabel, instPanel.layers, activePanelId, inst));
                }
            }
            // Overlay section
            const ov = document.createElement('div');
            ov.className = 'insp-section';
            const ovHead = buildSectionHead(inst, '__overlay__', 'Overlay (above all panels)', inst.overlays || []);
            ov.appendChild(ovHead);
            ov.appendChild(buildLayerListBody(inst.overlays || [], '__overlay__', inst));
            const ovAddIdx = (inst.overlays || []).length;
            ov.appendChild(buildAddZone(inst, '__overlay__', ovAddIdx));
            content.appendChild(ov);
            // Actions
            const ac = document.createElement('div');
            ac.className = 'insp-section insp-actions';
            const changeBtn = document.createElement('button');
            changeBtn.className = 'btn wide';
            changeBtn.type = 'button';
            changeBtn.textContent = 'Change panel set…';
            changeBtn.addEventListener('click', function () {
                MP.promptChangePanelSet(inst).then(function () { render(); });
            });
            ac.appendChild(changeBtn);
            const del = document.createElement('button');
            del.className = 'btn danger wide';
            del.type = 'button';
            del.textContent = 'Clear all layers';
            del.addEventListener('click', async function () {
                const ok = await D.confirm({
                    title: 'Clear all layers?',
                    message: 'Remove every layer from every panel and the overlay of this manga page.',
                    danger: true
                });
                if (!ok)
                    return;
                const before = await kernel.call('history', 'snapshot');
                inst.panels.forEach(function (p) { p.layers = []; });
                inst.overlays = [];
                await kernel.call('history', 'push', before);
                kernel.emit('manga-page:changed', { instanceId: inst.id });
                kernel.emit('state:changed');
                render();
            });
            ac.appendChild(del);
            content.appendChild(ac);
        }
        /* ---------------- Layer list with header + add zone (painéis) ---------------- */
        function buildLayerListSection(title, layers, panelId, inst) {
            const sec = document.createElement('div');
            sec.className = 'insp-section';
            sec.appendChild(buildSectionHead(inst, panelId, title, layers));
            sec.appendChild(buildLayerListBody(layers, panelId, inst));
            sec.appendChild(buildAddZone(inst, panelId, layers.length));
            return sec;
        }
        /* ---------------- Layer row ---------------- */
        function buildLayerRow(layer, panelId, inst, displayIdx, totalInPanel) {
            const row = document.createElement('div');
            row.className = 'insp-layer';
            row.dataset.layerId = layer.id;
            row.dataset.panelId = panelId;
            row.dataset.instanceId = inst.id;
            /* ---- Drag interno ---- */
            row.draggable = true;
            row.addEventListener('dragstart', function (e) {
                drag = {
                    layerId: layer.id,
                    panelId: panelId,
                    containerKey: panelId, // '__overlay__' ou 'p1'/'p2'/...
                    instanceId: inst.id
                };
                row.classList.add('is-dragging');
                e.dataTransfer.effectAllowed = 'move';
                try {
                    e.dataTransfer.setData('text/x-nvb-layer', layer.id);
                }
                catch (er) { }
            });
            row.addEventListener('dragend', function () {
                drag = null;
                clearInternalDropIndicators();
            });
            /* ---- dragover / drop ---- */
            row.addEventListener('dragover', function (e) {
                // 1) Drag externo (asset da library)
                if (!drag && hasAssetDrag(e)) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    const rect = row.getBoundingClientRect();
                    const isAbove = (e.clientY - rect.top) < rect.height / 2;
                    content.querySelectorAll('.insp-layer').forEach(function (r) {
                        if (r !== row)
                            r.classList.remove('ext-drop-above', 'ext-drop-below', 'drop-forbidden');
                    });
                    content.querySelectorAll('.layer-drop-zone').forEach(function (z) {
                        z.classList.remove('drag-over');
                    });
                    content.querySelectorAll('.insp-add-zone').forEach(function (z) {
                        z.classList.remove('drag-over');
                    });
                    row.classList.remove('drop-forbidden', 'drop-above', 'drop-below');
                    row.classList.toggle('ext-drop-above', isAbove);
                    row.classList.toggle('ext-drop-below', !isAbove);
                    return;
                }
                // 2) Drag interno (reorder)
                if (!drag)
                    return;
                if (drag.instanceId !== inst.id)
                    return;
                if (drag.layerId === layer.id)
                    return;
                // FASE E3: cross-container → feedback "no-drop"
                const currentContainerKey = panelId;
                if (drag.containerKey !== currentContainerKey) {
                    e.preventDefault(); // necessário para o cursor mudar
                    e.dataTransfer.dropEffect = 'none'; // cursor no-drop
                    content.querySelectorAll('.insp-layer').forEach(function (r) {
                        if (r !== row)
                            r.classList.remove('drop-forbidden', 'drop-above', 'drop-below');
                    });
                    row.classList.remove('drop-above', 'drop-below');
                    row.classList.add('drop-forbidden');
                    return;
                }
                // Mesmo container → feedback normal
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = row.getBoundingClientRect();
                const isAbove = (e.clientY - rect.top) < rect.height / 2;
                content.querySelectorAll('.insp-layer').forEach(function (r) {
                    if (r !== row)
                        r.classList.remove('drop-above', 'drop-below', 'drop-forbidden');
                });
                row.classList.remove('drop-forbidden');
                row.classList.toggle('drop-above', isAbove);
                row.classList.toggle('drop-below', !isAbove);
            });
            row.addEventListener('dragleave', function () {
                row.classList.remove('ext-drop-above', 'ext-drop-below', 'drop-above', 'drop-below', 'drop-forbidden');
            });
            row.addEventListener('drop', async function (e) {
                // 1) Drag externo (asset da library)
                if (!drag && hasAssetDrag(e)) {
                    e.preventDefault();
                    e.stopPropagation();
                    const rect = row.getBoundingClientRect();
                    const isAbove = (e.clientY - rect.top) < rect.height / 2;
                    row.classList.remove('ext-drop-above', 'ext-drop-below');
                    const assetId = readAssetId(e);
                    if (!assetId)
                        return;
                    const N = totalInPanel;
                    const insertionIndex = isAbove ? (N - displayIdx) : (N - displayIdx - 1);
                    await insertAssetAt(inst, panelId, assetId, insertionIndex);
                    return;
                }
                // 2) Drag interno (reorder)
                if (!drag)
                    return;
                if (drag.instanceId !== inst.id)
                    return;
                if (drag.layerId === layer.id)
                    return;
                // FASE E3: se for cross-container, ignora o drop
                if (drag.containerKey !== panelId) {
                    row.classList.remove('drop-forbidden');
                    return;
                }
                e.preventDefault();
                e.stopPropagation();
                const rect = row.getBoundingClientRect();
                const isAbove = (e.clientY - rect.top) < rect.height / 2;
                const position = isAbove ? 'before' : 'after';
                await MP.reorderLayerTo(inst, panelId, drag.layerId, layer.id, position);
                drag = null;
                clearInternalDropIndicators();
                render();
            });
            /* ---- Thumb ---- */
            const thumb = document.createElement('img');
            thumb.className = 'insp-layer-thumb';
            const url = A.urls.get(layer.assetId);
            if (url)
                thumb.src = url;
            thumb.alt = '';
            thumb.draggable = false;
            row.appendChild(thumb);
            /* ---- Meta ---- */
            const meta = document.createElement('div');
            meta.className = 'insp-layer-meta';
            const asset = S.assets.find(function (a) { return a.id === layer.assetId; });
            const nameEl = document.createElement('div');
            nameEl.className = 'insp-layer-name';
            nameEl.textContent = asset ? asset.name : '(missing asset)';
            nameEl.title = nameEl.textContent;
            meta.appendChild(nameEl);
            const sub = document.createElement('div');
            sub.className = 'insp-layer-sub';
            sub.textContent = layer.width + '×' + layer.height + ' · z' + (layer.zIndex || 1);
            meta.appendChild(sub);
            row.appendChild(meta);
            /* ---- Actions ---- */
            const actions = document.createElement('div');
            actions.className = 'insp-layer-actions';
            const up = document.createElement('button');
            up.type = 'button';
            up.title = 'Bring forward';
            up.textContent = '↑';
            up.addEventListener('click', async function (e) {
                e.stopPropagation();
                await MP.reorderLayer(inst, panelId, layer.id, 'forward');
                render();
            });
            const dn = document.createElement('button');
            dn.type = 'button';
            dn.title = 'Send backward';
            dn.textContent = '↓';
            dn.addEventListener('click', async function (e) {
                e.stopPropagation();
                await MP.reorderLayer(inst, panelId, layer.id, 'backward');
                render();
            });
            const rm = document.createElement('button');
            rm.type = 'button';
            rm.title = 'Remove layer';
            rm.className = 'danger';
            rm.textContent = '🗑';
            rm.addEventListener('click', async function (e) {
                e.stopPropagation();
                await MP.removeLayer(inst, panelId, layer.id);
                render();
            });
            actions.appendChild(up);
            actions.appendChild(dn);
            actions.appendChild(rm);
            row.appendChild(actions);
            return row;
        }
        /* ---------------- Events ---------------- */
        kernel.on('manga-page:focus', render);
        kernel.on('manga-page:changed', render);
        kernel.on('panelSets:changed', render);
        kernel.on('selection:changed', function () {
            const f = MP.getFocus();
            if (f && f.instanceId && !S.selection.has(f.instanceId)) {
                let hasMangaSelected = false;
                S.selection.forEach(function (id) {
                    const inst = instanceById(id);
                    if (inst && inst.type === 'manga-page')
                        hasMangaSelected = true;
                });
                if (!hasMangaSelected)
                    MP.clearFocus();
            }
            render();
        });
        kernel.on('state:changed', render);
        kernel.provide('panelInspector', { render: render });
        render();
    }
});
