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
    uses: ['history', 'mangaEdit', 'mangaExport'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0', 'history': '^1.0.0', 'mangaEdit': '^1.0.0', 'mangaExport': '^2.0.0' },
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
        /* VP1-043–051: panel/page manga effects inside existing inspector. */
        function buildMangaFxSection(inst, panelId, ps) {
            const sec = document.createElement('section');
            sec.className = 'insp-section vp1-manga-fx-inspector';
            const label = document.createElement('div');
            label.className = 'insp-label';
            label.textContent = 'Ink • Eraser • Manga Effects';
            sec.appendChild(label);
            const actions = document.createElement('div');
            actions.className = 'vp1-manga-fx-actions';
            const tool = MP.getMangaToolMode();
            const mode = tool?.instanceId === inst.id ? tool : null;
            const run = async (action) => {
                try {
                    await action();
                    render();
                }
                catch (error) {
                    D.toast('Manga effect: ' + error.message, 'error');
                }
            };
            const button = (text, onClick) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn vp1-manga-fx-btn';
                b.textContent = text;
                b.disabled = !!inst.locked;
                b.addEventListener('click', onClick);
                return b;
            };
            if (panelId && panelId !== '__overlay__') {
                for (const kind of ['ink', 'eraser']) {
                    const active = mode?.tool === kind && mode?.panelId === panelId;
                    const b = button(kind === 'ink' ? 'Draw Ink (I)' : 'Erase Ink (E)', () => {
                        if (active)
                            MP.setMangaToolMode(null);
                        else
                            MP.setMangaToolMode(inst.id, panelId, kind);
                        render();
                    });
                    b.classList.add('vp1-tool-' + kind);
                    b.setAttribute('aria-pressed', String(active));
                    actions.appendChild(b);
                }
                if (mode) {
                    const color = document.createElement('input');
                    color.type = 'color';
                    color.value = mode.color;
                    color.disabled = !!inst.locked;
                    color.setAttribute('aria-label', 'Ink color');
                    color.addEventListener('change', () => {
                        MP.setMangaToolMode(inst.id, mode.panelId, mode.tool, { color: color.value });
                        render();
                    });
                    actions.appendChild(color);
                    const number = (name, value, min, max, set) => {
                        const field = document.createElement('label');
                        field.className = 'vp1-fx-input';
                        const caption = document.createElement('span');
                        caption.textContent = name;
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.setAttribute('aria-label', 'Ink ' + name);
                        input.min = String(min);
                        input.max = String(max);
                        input.step = '0.05';
                        input.value = String(value);
                        input.disabled = !!inst.locked;
                        input.addEventListener('change', () => {
                            const v = Number(input.value);
                            if (!Number.isFinite(v) || v < min || v > max) {
                                D.toast('Invalid Ink ' + name, 'error');
                                render();
                                return;
                            }
                            try {
                                set(v);
                                render();
                            }
                            catch (e) {
                                D.toast(e.message, 'error');
                                render();
                            }
                        });
                        field.append(caption, input);
                        actions.appendChild(field);
                    };
                    number('size', mode.size, .5, 64, v => MP.setMangaToolMode(inst.id, mode.panelId, mode.tool, { size: v }));
                    number('opacity', mode.opacity, 0, 1, v => MP.setMangaToolMode(inst.id, mode.panelId, mode.tool, { opacity: v }));
                    number('tip', mode.tip, 0, .5, v => MP.setMangaToolMode(inst.id, mode.panelId, mode.tool, { tip: v }));
                }
            }
            sec.appendChild(actions);
            const create = document.createElement('div');
            create.className = 'vp1-manga-fx-actions';
            for (const kind of ['halftone', 'speedLines', 'focusLines'])
                for (const scope of ['panel', 'page']) {
                    if (scope === 'panel' && (!panelId || panelId === '__overlay__'))
                        continue;
                    const names = { halftone: 'Halftone', speedLines: 'Speed Lines',
                        focusLines: 'Focus Lines' };
                    create.appendChild(button('Add ' + names[kind] + ' · ' + scope, () => {
                        void run(async () => {
                            const e = await MP.addMangaEffect(inst, { kind, scope,
                                panelId: scope === 'panel' ? panelId : null });
                            MP.selectMangaEffect(inst.id, e.id);
                        });
                    }));
                }
            sec.appendChild(create);
            const visible = MP.listMangaEffects(inst, panelId && panelId !== '__overlay__' ?
                panelId : undefined);
            const selected = MP.getSelectedMangaEffect();
            if (!visible.length) {
                const empty = document.createElement('p');
                empty.className = 'muted';
                empty.textContent = 'Draw a stroke or add a procedural tone/lines generator.';
                sec.appendChild(empty);
            }
            for (const effect of visible) {
                const card = document.createElement('div');
                card.className = 'vp1-fx-object';
                const top = document.createElement('div');
                top.className = 'vp1-manga-fx-actions';
                const picked = selected?.instanceId === inst.id && selected.id === effect.id;
                const choose = button(effect.kind + ' · ' + effect.scope + (effect.scope === 'panel' ?
                    ' / ' + effect.panelId : ''), () => {
                    MP.selectMangaEffect(inst.id, picked ? null : effect.id);
                    render();
                });
                choose.className = 'btn vp1-fx-select';
                choose.dataset.vp1EffectId = effect.id;
                choose.setAttribute('aria-pressed', String(picked));
                const remove = button('Delete', () => {
                    void run(async () => {
                        await MP.removeMangaEffect(inst, effect.id);
                        MP.selectMangaEffect(null);
                    });
                });
                remove.classList.add('danger');
                top.append(choose, remove);
                card.appendChild(top);
                if (picked) {
                    const settings = document.createElement('div');
                    settings.className = 'vp1-fx-settings';
                    // Rebuild only the transient SVG preview on input: no model writes.
                    const preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    preview.classList.add('vp1-fx-preview');
                    preview.setAttribute('viewBox', '0 0 ' + ps.width + ' ' + ps.height);
                    preview.setAttribute('role', 'img');
                    preview.setAttribute('aria-label', 'Manga effect preview');
                    const candidate = JSON.parse(JSON.stringify(effect));
                    const repaint = () => {
                        preview.replaceChildren();
                        for (const p of MP.mangaEffectPrimitives(candidate).slice(0, 1800)) {
                            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                            path.setAttribute('d', p.d);
                            path.setAttribute('fill', p.fill);
                            path.setAttribute('stroke', p.stroke);
                            path.setAttribute('stroke-width', String(p.strokeWidth));
                            path.setAttribute('opacity', String(p.opacity));
                            preview.appendChild(path);
                        }
                    };
                    const apply = (patch) => {
                        void run(() => MP.updateMangaEffect(inst, effect.id, patch));
                    };
                    function numeric(key, min, max, step) {
                        const field = document.createElement('label');
                        field.className = 'vp1-fx-input';
                        const cap = document.createElement('span');
                        cap.textContent = key;
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.min = String(min);
                        input.max = String(max);
                        input.step = String(step);
                        input.value = String(effect[key]);
                        input.setAttribute('aria-label', 'Manga effect ' + key);
                        input.disabled = !!inst.locked;
                        input.addEventListener('input', () => {
                            const num = Number(input.value);
                            if (Number.isFinite(num) && num >= min && num <= max) {
                                candidate[key] = num;
                                repaint();
                            }
                        });
                        input.addEventListener('change', () => {
                            const v = Number(input.value);
                            if (!Number.isFinite(v) || v < min || v > max) {
                                D.toast('Invalid ' + key, 'error');
                                render();
                                return;
                            }
                            apply({ [key]: v });
                        });
                        field.append(cap, input);
                        if (effect.kind === 'halftone' &&
                            ['density', 'diameter', 'spacing', 'gradient', 'angle'].includes(key)) {
                            const slider = document.createElement('input');
                            slider.type = 'range';
                            slider.min = String(min);
                            slider.max = String(max);
                            slider.step = String(step);
                            slider.value = String(effect[key]);
                            slider.setAttribute('aria-label', 'Manga effect ' + key + ' slider');
                            slider.disabled = !!inst.locked;
                            slider.addEventListener('input', () => {
                                input.value = slider.value;
                                candidate[key] = Number(slider.value);
                                repaint();
                            });
                            slider.addEventListener('change', () => apply({ [key]: Number(slider.value) }));
                            field.appendChild(slider);
                        }
                        settings.appendChild(field);
                    }
                    const col = document.createElement('label');
                    col.className = 'vp1-fx-input';
                    col.textContent = 'Color';
                    const color = document.createElement('input');
                    color.type = 'color';
                    color.value = effect.color;
                    color.disabled = !!inst.locked;
                    color.setAttribute('aria-label', 'Manga effect color');
                    color.addEventListener('input', () => { candidate.color = color.value; repaint(); });
                    color.addEventListener('change', () => apply({ color: color.value }));
                    col.appendChild(color);
                    settings.appendChild(col);
                    for (const field of ['x', 'y'])
                        numeric(field, -65536, 65536, 1);
                    if (effect.kind !== 'ink') {
                        numeric('width', 1, 8192, 1);
                        numeric('height', 1, 8192, 1);
                    }
                    numeric('opacity', 0, 1, .05);
                    numeric('size', .5, 64, .5);
                    if (effect.kind === 'ink')
                        numeric('tip', 0, .5, .05);
                    if (effect.kind === 'halftone') {
                        const select = document.createElement('select');
                        select.setAttribute('aria-label', 'Halftone shape');
                        for (const shape of ['circle', 'square', 'triangle', 'star', 'cross', 'heart']) {
                            const option = document.createElement('option');
                            option.value = shape;
                            option.textContent = shape;
                            option.selected = shape === effect.shape;
                            select.appendChild(option);
                        }
                        select.addEventListener('change', () => apply({ shape: select.value }));
                        settings.appendChild(select);
                        numeric('density', .01, 1, .05);
                        numeric('diameter', .5, 100, 1);
                        numeric('spacing', 4, 200, 1);
                        numeric('gradient', -1, 1, .05);
                        numeric('angle', -360, 360, 5);
                    }
                    else if (effect.kind === 'speedLines') {
                        const select = document.createElement('select');
                        select.setAttribute('aria-label', 'Speed line type');
                        for (const kind of ['straight', 'tapered', 'wavy']) {
                            const option = document.createElement('option');
                            option.value = kind;
                            option.textContent = kind;
                            option.selected = kind === effect.lineType;
                            select.appendChild(option);
                        }
                        select.addEventListener('change', () => apply({ lineType: select.value }));
                        settings.appendChild(select);
                        numeric('angle', -360, 360, 5);
                        numeric('count', 1, 500, 1);
                        numeric('length', 1, 8192, 5);
                        numeric('spread', 0, 360, 5);
                    }
                    else if (effect.kind === 'focusLines') {
                        numeric('centerX', -8192, 16384, 5);
                        numeric('centerY', -8192, 16384, 5);
                        numeric('count', 1, 500, 1);
                        numeric('minRadius', 0, 8192, 5);
                        numeric('maxRadius', 1, 8192, 5);
                        numeric('variation', 0, 1, .05);
                    }
                    card.appendChild(settings);
                    card.appendChild(preview);
                    repaint();
                }
                sec.appendChild(card);
            }
            return sec;
        }
        /* VP1-053–060: the whole 48-preset gallery and editable balloon inspector
         * live in the existing page inspector, not a new global toolbar. */
        function buildBalloonSection(inst) {
            const section = document.createElement('section');
            section.className = 'insp-section vp1-balloon-inspector';
            const heading = document.createElement('div');
            heading.className = 'insp-label';
            heading.textContent = 'Dialogue balloons (48 presets)';
            section.appendChild(heading);
            const presets = MP.listBalloonPresets();
            const buttons = document.createElement('div');
            buttons.className = 'vp1-balloon-actions';
            const makeButton = (label, onClick) => {
                const button = document.createElement('button');
                button.type = 'button';
                button.className = 'btn vp1-balloon-button';
                button.textContent = label;
                button.disabled = !!inst.locked;
                button.addEventListener('click', onClick);
                return button;
            };
            const run = (action) => {
                void action().then(() => render()).catch(error => {
                    D.toast('Dialogue balloon: ' + error.message, 'error');
                    render();
                });
            };
            const presetSelect = document.createElement('select');
            presetSelect.className = 'vp1-balloon-preset';
            presetSelect.setAttribute('aria-label', 'Choose dialogue balloon style');
            for (const preset of presets) {
                const option = document.createElement('option');
                option.value = preset.id;
                option.textContent = preset.name;
                presetSelect.appendChild(option);
            }
            buttons.appendChild(presetSelect);
            buttons.appendChild(makeButton('Add balloon', () => {
                const p = presets.find(item => item.id === presetSelect.value);
                run(async () => {
                    const b = await MP.addBalloon(inst, { presetId: p.id, shape: p.shape, tail: p.tail });
                    MP.selectBalloon(inst.id, b.id);
                });
            }));
            const drawing = MP.getBalloonDrawMode()?.instanceId === inst.id;
            const draw = makeButton(drawing ? 'Cancel outline' : 'Draw custom outline', () => {
                MP.setBalloonDrawMode(drawing ? null : inst.id);
                render();
            });
            draw.setAttribute('aria-pressed', String(drawing));
            buttons.appendChild(draw);
            if (drawing)
                buttons.appendChild(makeButton('Finish outline (Enter)', () => {
                    run(async () => {
                        const created = await MP.completeBalloonDraw();
                        if (!created)
                            throw Error('Draw at least three vertices before finishing');
                    });
                }));
            section.appendChild(buttons);
            if (drawing) {
                const help = document.createElement('p');
                help.className = 'muted';
                help.textContent = 'Click on the page to add polygon vertices. Enter finishes; Escape cancels.';
                section.appendChild(help);
            }
            const selected = MP.getSelectedBalloon();
            for (const balloon of MP.listBalloons(inst)) {
                const active = selected?.instanceId === inst.id && selected.id === balloon.id;
                const row = document.createElement('div');
                row.className = 'vp1-balloon-card';
                const header = document.createElement('div');
                header.className = 'vp1-balloon-actions';
                const select = makeButton((active ? '● ' : '○ ') + (balloon.text.trim() ||
                    balloon.presetId || 'Custom outline'), () => {
                    MP.selectBalloon(inst.id, active ? null : balloon.id);
                    render();
                });
                select.setAttribute('aria-pressed', String(active));
                select.setAttribute('data-vp1-balloon-select', balloon.id);
                header.appendChild(select);
                header.appendChild(makeButton('Delete', () => run(() => MP.removeBalloon(inst, balloon.id))));
                row.appendChild(header);
                if (active) {
                    const options = document.createElement('div');
                    options.className = 'vp1-balloon-fields';
                    const caption = (name, control) => {
                        const label = document.createElement('label');
                        label.className = 'vp1-balloon-field';
                        const span = document.createElement('span');
                        span.textContent = name;
                        label.append(span, control);
                        options.appendChild(label);
                    };
                    const edit = (patch) => {
                        run(() => MP.updateBalloon(inst, balloon.id, patch));
                    };
                    const presetChoice = document.createElement('select');
                    const customOption = document.createElement('option');
                    customOption.value = '';
                    customOption.textContent = 'Custom geometry';
                    presetChoice.appendChild(customOption);
                    for (const p of presets) {
                        const item = document.createElement('option');
                        item.value = p.id;
                        item.textContent = p.name;
                        presetChoice.appendChild(item);
                    }
                    presetChoice.value = balloon.presetId || '';
                    presetChoice.disabled = !!inst.locked;
                    presetChoice.addEventListener('change', () => {
                        if (!presetChoice.value)
                            return;
                        const p = presets.find(item => item.id === presetChoice.value);
                        edit({ presetId: p.id, shape: p.shape, tail: p.tail, vertices: null });
                    });
                    caption('Style', presetChoice);
                    const text = document.createElement('textarea');
                    text.rows = 3;
                    text.maxLength = 4000;
                    text.value = balloon.text;
                    text.dataset.vp1BalloonText = balloon.id;
                    text.setAttribute('aria-label', 'Balloon dialogue text');
                    text.disabled = !!inst.locked || balloon.locked;
                    text.addEventListener('change', () => edit({ text: text.value }));
                    caption('Dialogue text', text);
                    const color = (name, key) => {
                        const control = document.createElement('input');
                        control.type = 'color';
                        control.value = balloon[key];
                        control.disabled = !!inst.locked || balloon.locked;
                        control.addEventListener('change', () => edit({ [key]: control.value }));
                        caption(name, control);
                    };
                    color('Fill color', 'fill');
                    color('Outline color', 'stroke');
                    color('Text color', 'textColor');
                    const number = (name, key, min, max, step) => {
                        const control = document.createElement('input');
                        control.type = 'number';
                        control.min = String(min);
                        control.max = String(max);
                        control.step = String(step);
                        control.value = String(balloon[key]);
                        control.disabled = !!inst.locked || balloon.locked;
                        control.setAttribute('aria-label', 'Balloon ' + name);
                        control.addEventListener('change', () => {
                            const v = Number(control.value);
                            if (!Number.isFinite(v) || v < min || v > max) {
                                D.toast('Invalid balloon ' + name, 'error');
                                render();
                                return;
                            }
                            edit({ [key]: v });
                        });
                        caption(name, control);
                    };
                    number('X', 'x', -65536, 65536, 1);
                    number('Y', 'y', -65536, 65536, 1);
                    number('Width', 'width', 8, 8192, 1);
                    number('Height', 'height', 8, 8192, 1);
                    number('Rotation', 'rotation', -360, 360, 1);
                    number('Fill opacity', 'fillOpacity', 0, 1, .05);
                    number('Outline width', 'strokeWidth', 0, 64, .5);
                    number('Font size', 'textSize', 8, 160, 1);
                    const move = document.createElement('div');
                    move.className = 'vp1-balloon-actions';
                    move.appendChild(makeButton('Bring forward', () => run(() => MP.reorderBalloon(inst, balloon.id, 'forward'))));
                    move.appendChild(makeButton('Send backward', () => run(() => MP.reorderBalloon(inst, balloon.id, 'backward'))));
                    options.appendChild(move);
                    if (balloon.vertices) {
                        const verts = document.createElement('div');
                        verts.className = 'vp1-balloon-actions';
                        verts.appendChild(makeButton('Add vertex', () => {
                            const vs = balloon.vertices;
                            if (vs.length >= 128)
                                return;
                            let index = 0, max = 0;
                            for (let i = 0; i < vs.length; i++) {
                                const a = vs[i], b = vs[(i + 1) % vs.length];
                                const delta = Math.hypot(a.x - b.x, a.y - b.y);
                                if (delta > max) {
                                    index = i;
                                    max = delta;
                                }
                            }
                            const a = vs[index], b = vs[(index + 1) % vs.length];
                            const copy = vs.map(p => ({ ...p }));
                            copy.splice(index + 1, 0, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                            edit({ vertices: copy });
                        }));
                        verts.appendChild(makeButton('Remove last vertex', () => {
                            if (balloon.vertices.length <= 3)
                                return;
                            edit({ vertices: balloon.vertices.slice(0, -1) });
                        }));
                        options.appendChild(verts);
                    }
                    row.appendChild(options);
                }
                section.appendChild(row);
            }
            if (!MP.listBalloons(inst).length) {
                const empty = document.createElement('p');
                empty.className = 'muted';
                empty.textContent = 'Add a preset or draw a custom polygon on the page.';
                section.appendChild(empty);
            }
            return section;
        }
        /* VP1-083–084: explicit PNG page export in page inspector, with bounded
         * DPI and a preflight memory check via mangaExport.validateExport. */
        function buildPngDpiSection(inst) {
            const section = document.createElement('section');
            section.className = 'insp-section vp1-png-dpi';
            const title = document.createElement('div');
            title.className = 'insp-label';
            title.textContent = 'PNG export · DPI';
            section.appendChild(title);
            const label = document.createElement('label');
            label.className = 'vp1-png-dpi-field';
            const caption = document.createElement('span');
            caption.textContent = 'Output DPI (36–600)';
            const input = document.createElement('input');
            input.type = 'number';
            input.id = 'vp1-png-dpi';
            input.min = '36';
            input.max = '600';
            input.step = '1';
            input.setAttribute('aria-label', 'PNG export DPI');
            input.value = String(S.settings.vp1PngDpi ?? 300);
            input.disabled = !!inst.locked;
            input.addEventListener('change', () => {
                const v = Number(input.value);
                if (!Number.isFinite(v) || !Number.isInteger(v) || v < 36 || v > 600) {
                    D.toast('DPI must be an integer between 36 and 600', 'error');
                    render();
                    return;
                }
                void kernel.call('history', 'transaction', 'manga.pngDpi', () => {
                    S.settings.vp1PngDpi = v;
                    kernel.emit('state:changed');
                }).catch((e) => D.toast('DPI: ' + e.message, 'error'));
            });
            label.append(caption, input);
            section.appendChild(label);
            const exportButton = document.createElement('button');
            exportButton.type = 'button';
            exportButton.className = 'btn wide';
            exportButton.textContent = 'Export current page PNG';
            exportButton.disabled = !!inst.locked;
            exportButton.addEventListener('click', () => {
                const dpi = Number(input.value);
                if (!Number.isInteger(dpi) || dpi < 36 || dpi > 600) {
                    D.toast('Invalid PNG DPI', 'error');
                    return;
                }
                exportButton.disabled = true;
                void kernel.require('mangaExport').then(async (exporter) => {
                    const opts = { dpi, silent: true };
                    const check = await exporter.validateExport([inst], opts);
                    if (!check.valid) {
                        D.toast('PNG export blocked: ' + check.errors[0]?.message, 'error');
                        return;
                    }
                    const report = await exporter.exportPng(inst, opts);
                    if (!report.success)
                        D.toast('PNG export failed: ' +
                            (report.errors[0]?.message || 'Unknown error'), 'error');
                    else if (report.warnings.length)
                        D.toast('PNG DPI reduced by memory limits: ' + report.warnings[0]?.message, 'error');
                }).catch(e => D.toast('PNG: ' + e.message, 'error'))
                    .finally(() => { exportButton.disabled = false; });
            });
            section.appendChild(exportButton);
            return section;
        }
        /* VP1-062–067: independent horizontal text inspector. Changes are
         * committed on change/blur, never for each keystroke. */
        function buildHorizontalTextSection(inst) {
            const sec = document.createElement('section');
            sec.className = 'insp-section vp1-horizontal-text-inspector';
            const label = document.createElement('div');
            label.className = 'insp-label';
            label.textContent = 'Horizontal text';
            sec.appendChild(label);
            const run = (action) => {
                void action().then(() => render()).catch(error => {
                    D.toast('Horizontal text: ' + error.message, 'error');
                    render();
                });
            };
            const button = (name, fn) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = name;
                b.className = 'btn vp1-text-button';
                b.disabled = !!inst.locked;
                b.addEventListener('click', fn);
                return b;
            };
            const editOnCanvas = (id) => {
                document.getElementById('viewport')?.dispatchEvent(new CustomEvent('nvb-horizontal-text-edit', { detail: { instanceId: inst.id, id } }));
            };
            sec.appendChild(button('Add horizontal text (T)', () => {
                run(async () => {
                    const item = await MP.addHorizontalText(inst);
                    MP.selectHorizontalText(inst.id, item.id);
                    // Inspector update is event-driven; request editing after render.
                    queueMicrotask(() => editOnCanvas(item.id));
                });
            }));
            const selected = MP.getSelectedHorizontalText();
            const texts = MP.listHorizontalTexts(inst);
            for (const item of texts) {
                const chosen = selected?.instanceId === inst.id && selected.id === item.id;
                const card = document.createElement('div');
                card.className = 'vp1-text-object';
                const row = document.createElement('div');
                row.className = 'vp1-text-actions';
                const select = button((chosen ? '● ' : '○ ') + (item.text.split('\n')[0] || 'Empty text'), () => {
                    MP.selectHorizontalText(inst.id, chosen ? null : item.id);
                    render();
                });
                select.dataset.vp1TextSelect = item.id;
                select.setAttribute('aria-pressed', String(chosen));
                row.appendChild(select);
                row.appendChild(button('Edit on canvas', () => editOnCanvas(item.id)));
                row.appendChild(button('Delete', () => run(() => MP.removeHorizontalText(inst, item.id))));
                card.appendChild(row);
                if (chosen) {
                    const grid = document.createElement('div');
                    grid.className = 'vp1-text-fields';
                    const field = (labelText, input) => {
                        const wrapper = document.createElement('label');
                        wrapper.className = 'vp1-text-field';
                        const label = document.createElement('span');
                        label.textContent = labelText;
                        wrapper.append(label, input);
                        grid.appendChild(wrapper);
                    };
                    const update = (patch) => run(() => MP.updateHorizontalText(inst, item.id, patch));
                    const textArea = document.createElement('textarea');
                    textArea.rows = 3;
                    textArea.maxLength = 4000;
                    textArea.setAttribute('aria-label', 'Horizontal text content');
                    textArea.value = item.text;
                    textArea.disabled = !!inst.locked || item.locked;
                    textArea.addEventListener('change', () => update({ text: textArea.value }));
                    field('Text', textArea);
                    const font = document.createElement('select');
                    font.setAttribute('aria-label', 'Horizontal font family');
                    for (const name of MP.listHorizontalFonts()) {
                        const option = document.createElement('option');
                        option.value = name;
                        option.textContent = name;
                        option.selected = name === item.fontFamily;
                        font.appendChild(option);
                    }
                    font.disabled = !!inst.locked || item.locked;
                    font.addEventListener('change', () => update({ fontFamily: font.value }));
                    field('Font', font);
                    const bold = document.createElement('input');
                    bold.type = 'checkbox';
                    bold.checked = item.bold;
                    bold.disabled = !!inst.locked || item.locked;
                    bold.setAttribute('aria-label', 'Horizontal text bold');
                    bold.addEventListener('change', () => update({ bold: bold.checked }));
                    field('Bold', bold);
                    const align = document.createElement('select');
                    align.setAttribute('aria-label', 'Horizontal text alignment');
                    for (const a of ['left', 'center', 'right']) {
                        const option = document.createElement('option');
                        option.value = a;
                        option.textContent = a;
                        option.selected = a === item.align;
                        align.appendChild(option);
                    }
                    align.disabled = !!inst.locked || item.locked;
                    align.addEventListener('change', () => update({ align: align.value }));
                    field('Alignment', align);
                    const color = (labelText, key) => {
                        const input = document.createElement('input');
                        input.type = 'color';
                        input.value = item[key];
                        input.disabled = !!inst.locked || item.locked;
                        input.setAttribute('aria-label', 'Horizontal ' + labelText);
                        input.addEventListener('change', () => update({ [key]: input.value }));
                        field(labelText, input);
                    };
                    color('Text color', 'color');
                    color('Outline color', 'outlineColor');
                    const number = (name, key, min, max, step) => {
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.value = String(item[key]);
                        input.min = String(min);
                        input.max = String(max);
                        input.step = String(step);
                        input.disabled = !!inst.locked || item.locked;
                        input.setAttribute('aria-label', 'Horizontal ' + name);
                        input.addEventListener('change', () => {
                            const v = Number(input.value);
                            if (!Number.isFinite(v) || v < min || v > max) {
                                D.toast('Invalid horizontal ' + name, 'error');
                                render();
                                return;
                            }
                            update({ [key]: v });
                        });
                        field(name, input);
                    };
                    number('Font size', 'fontSize', 8, 160, 1);
                    number('Outline width', 'outlineWidth', 0, 24, .5);
                    number('Opacity', 'opacity', 0, 1, .05);
                    number('X', 'x', -65536, 65536, 1);
                    number('Y', 'y', -65536, 65536, 1);
                    number('Width', 'width', 16, 8192, 1);
                    number('Height', 'height', 16, 8192, 1);
                    number('Rotation', 'rotation', -360, 360, 1);
                    card.appendChild(grid);
                }
                sec.appendChild(card);
            }
            if (!texts.length) {
                const empty = document.createElement('p');
                empty.className = 'muted';
                empty.textContent = 'Create text or press T with a manga page focused.';
                sec.appendChild(empty);
            }
            return sec;
        }
        /* VP1-069–075 — canonical hierarchy and context actions in one inspector.
         * Miniatures are local panel SVG / object URLs; never load remote assets. */
        const treeExpanded = new Set();
        let treeMenu = null;
        function closeTreeMenu() { treeMenu?.remove(); treeMenu = null; }
        function treeError(error) {
            D.toast('Layer tree: ' + error.message, 'error');
        }
        function treeRun(work) {
            void work().then(() => render()).catch(e => { treeError(e); render(); });
        }
        function selectTreeNode(page, node) {
            closeTreeMenu();
            if (node.kind !== 'image')
                treeImageSelection = null;
            if (node.kind === 'panel') {
                MP.selectBalloon(null);
                MP.selectMangaEffect(null);
                MP.selectHorizontalText(null);
                MP.setFocus(page.id, node.id);
                render();
                return;
            }
            if (node.kind === 'image') {
                const panelId = node.parentId || '__overlay__';
                treeImageSelection = { instanceId: page.id, id: node.id };
                MP.selectBalloon(null);
                MP.selectMangaEffect(null);
                MP.selectHorizontalText(null);
                MP.setFocus(page.id, panelId);
                void kernel.require('mangaEdit').then(ME => {
                    if (ME.enter(page.id, panelId))
                        ME.setSelectedLayer(node.id);
                    render();
                }).catch(treeError);
                return;
            }
            if (node.kind === 'text')
                MP.selectHorizontalText(page.id, node.id);
            else if (node.kind === 'balloon')
                MP.selectBalloon(page.id, node.id);
            else if (node.kind === 'drawing')
                MP.selectMangaEffect(page.id, node.id);
            render();
        }
        function isTreeSelected(page, node) {
            if (node.kind === 'balloon') {
                const s = MP.getSelectedBalloon();
                return s?.instanceId === page.id && s.id === node.id;
            }
            if (node.kind === 'text') {
                const s = MP.getSelectedHorizontalText();
                return s?.instanceId === page.id && s.id === node.id;
            }
            if (node.kind === 'drawing') {
                const s = MP.getSelectedMangaEffect();
                return s?.instanceId === page.id && s.id === node.id;
            }
            if (node.kind === 'image') {
                // Source of truth for image selection is the existing mangaEdit mode.
                const mode = window;
                void mode; // No global UI state is written.
                return !MP.getSelectedBalloon() && !MP.getSelectedMangaEffect() &&
                    !MP.getSelectedHorizontalText() &&
                    treeImageSelection?.instanceId === page.id && treeImageSelection.id === node.id;
            }
            return MP.getFocus().instanceId === page.id &&
                MP.getFocus().panelId === node.id &&
                !MP.getSelectedBalloon() && !MP.getSelectedHorizontalText() &&
                !MP.getSelectedMangaEffect();
        }
        let treeImageSelection = null;
        function renameTreeNode(page, node) {
            void D.prompt({ title: 'Rename ' + node.kind, message: 'Layer name',
                input: node.name, confirmText: 'Rename' }).then(name => {
                if (name !== null && name !== undefined && name !== node.name)
                    treeRun(() => MP.updateLayerTreeNode(page, node.kind, node.id, { name }));
            }).catch(treeError);
        }
        function treeDelete(page, node) {
            if (node.kind === 'panel')
                return Promise.resolve(false);
            if (node.kind === 'image')
                return MP.removeLayer(page, node.parentId || '__overlay__', node.id);
            if (node.kind === 'drawing')
                return MP.removeMangaEffect(page, node.id);
            if (node.kind === 'balloon')
                return MP.removeBalloon(page, node.id);
            return MP.removeHorizontalText(page, node.id);
        }
        function treeAction(page, node, command) {
            closeTreeMenu();
            if (command === 'select') {
                selectTreeNode(page, node);
                return;
            }
            if (command === 'rename') {
                renameTreeNode(page, node);
                return;
            }
            if (command === 'visibility') {
                treeRun(() => MP.updateLayerTreeNode(page, node.kind, node.id, { ownVisible: !node.ownVisible }));
                return;
            }
            if (command === 'lock') {
                treeRun(() => MP.updateLayerTreeNode(page, node.kind, node.id, { ownLocked: !node.ownLocked }));
                return;
            }
            if (command === 'up' || command === 'down') {
                treeRun(() => MP.reorderLayerTreeNode(page, node.kind, node.id, command === 'up' ? 'forward' : 'backward'));
                return;
            }
            if (node.kind !== 'panel')
                treeRun(() => treeDelete(page, node));
        }
        function showTreeMenu(e, page, node) {
            e.preventDefault();
            e.stopPropagation();
            closeTreeMenu();
            const menu = document.createElement('div');
            treeMenu = menu;
            menu.className = 'vp1-tree-context';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', 'Actions for ' + node.name);
            menu.style.left = Math.min(e.clientX, window.innerWidth - 188) + 'px';
            menu.style.top = Math.min(e.clientY, window.innerHeight - 285) + 'px';
            const commands = [
                ['select', 'Select'], ['rename', 'Rename'],
                ['visibility', node.ownVisible ? 'Hide' : 'Show'],
                ['lock', node.ownLocked ? 'Unlock' : 'Lock'],
                ['up', 'Bring forward'], ['down', 'Send backward'],
                ['delete', 'Delete']
            ];
            for (const [action, title] of commands) {
                if (node.kind === 'panel' && ['up', 'down', 'delete'].includes(action))
                    continue;
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = title;
                button.setAttribute('role', 'menuitem');
                button.disabled = !!page.locked && action !== 'select';
                button.addEventListener('click', () => treeAction(page, node, action));
                menu.appendChild(button);
            }
            document.body.appendChild(menu);
            const dismiss = (event) => {
                if (!menu.contains(event.target)) {
                    closeTreeMenu();
                    document.removeEventListener('pointerdown', dismiss, true);
                }
            };
            document.addEventListener('pointerdown', dismiss, true);
        }
        function treeThumbnail(page, node, ps) {
            const frame = document.createElement('span');
            frame.className = 'vp1-tree-thumb';
            frame.setAttribute('aria-hidden', 'true');
            if (node.kind === 'panel' && node.id !== '__overlay__') {
                const img = document.createElement('img');
                img.alt = '';
                img.src = 'data:image/svg+xml;charset=utf-8,' +
                    encodeURIComponent(PS.thumbSvg(ps, node.id, 28));
                frame.appendChild(img);
            }
            else if (node.kind === 'image' && node.assetId) {
                const img = document.createElement('img');
                img.alt = '';
                const url = A.urls.get(node.assetId);
                if (url)
                    img.src = url;
                frame.appendChild(img);
            }
            else {
                frame.textContent = { panel: '▤', drawing: '✎', balloon: '◯', text: 'Aa',
                    image: '▣' }[node.kind];
            }
            return frame;
        }
        function buildLayerTree(page, ps) {
            const root = document.createElement('section');
            root.className = 'insp-section vp1-layer-tree';
            root.setAttribute('aria-label', 'Layer hierarchy');
            const heading = document.createElement('div');
            heading.className = 'insp-label';
            heading.textContent = 'Layers · hierarchical';
            root.appendChild(heading);
            const nodes = MP.listLayerTree(page);
            for (const parent of nodes.filter(n => n.depth === 0)) {
                const folder = document.createElement('details');
                folder.className = 'vp1-tree-folder';
                const key = page.id + ':' + parent.id;
                folder.open = treeExpanded.has(key) || !treeExpanded.has('init:' + key);
                folder.addEventListener('toggle', () => {
                    treeExpanded.add('init:' + key);
                    if (folder.open)
                        treeExpanded.add(key);
                    else
                        treeExpanded.delete(key);
                });
                const summary = document.createElement('summary');
                summary.className = 'vp1-tree-summary';
                summary.appendChild(treeThumbnail(page, parent, ps));
                const label = document.createElement('button');
                label.type = 'button';
                label.className = 'vp1-tree-label';
                label.textContent = parent.name;
                label.dataset.vp1TreeKind = 'panel';
                label.dataset.vp1TreeId = parent.id;
                label.setAttribute('aria-pressed', String(isTreeSelected(page, parent)));
                label.addEventListener('click', e => {
                    e.preventDefault();
                    selectTreeNode(page, parent);
                });
                summary.appendChild(label);
                const actions = document.createElement('span');
                actions.className = 'vp1-tree-actions';
                const addAction = (name, title, command) => {
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.textContent = name;
                    b.title = title;
                    b.setAttribute('aria-label', title + ' ' + parent.name);
                    b.disabled = !!page.locked;
                    b.addEventListener('click', e => {
                        e.preventDefault();
                        e.stopPropagation();
                        treeAction(page, parent, command);
                    });
                    actions.appendChild(b);
                };
                addAction(parent.ownVisible ? '◉' : '◎', 'Toggle visibility', 'visibility');
                addAction(parent.ownLocked ? '🔒' : '♙', 'Toggle lock', 'lock');
                summary.appendChild(actions);
                summary.addEventListener('contextmenu', e => showTreeMenu(e, page, parent));
                folder.appendChild(summary);
                const children = document.createElement('div');
                children.className = 'vp1-tree-children';
                for (const node of nodes.filter(x => x.parentId === parent.id)) {
                    const row = document.createElement('div');
                    row.className = 'vp1-tree-row';
                    row.dataset.vp1TreeKind = node.kind;
                    row.dataset.vp1TreeId = node.id;
                    row.dataset.vp1TreeParent = parent.id;
                    row.classList.toggle('is-hidden', !node.visible);
                    row.classList.toggle('is-locked', node.locked);
                    row.classList.toggle('is-selected', isTreeSelected(page, node));
                    row.appendChild(treeThumbnail(page, node, ps));
                    const b = document.createElement('button');
                    b.type = 'button';
                    b.className = 'vp1-tree-label';
                    b.textContent = node.name;
                    b.title = node.kind + ' · ' + node.name;
                    b.setAttribute('aria-label', 'Select ' + node.kind + ' ' + node.name);
                    b.setAttribute('aria-pressed', String(isTreeSelected(page, node)));
                    b.addEventListener('click', () => selectTreeNode(page, node));
                    b.addEventListener('dblclick', () => renameTreeNode(page, node));
                    row.appendChild(b);
                    const kind = document.createElement('small');
                    kind.className = 'vp1-tree-kind';
                    kind.textContent = node.kind;
                    row.appendChild(kind);
                    const acts = document.createElement('div');
                    acts.className = 'vp1-tree-actions';
                    for (const [command, glyph, title] of [
                        ['visibility', node.ownVisible ? '◉' : '◎', 'Toggle visibility'],
                        ['lock', node.ownLocked ? '🔒' : '♙', 'Toggle lock'],
                        ['up', '↑', 'Bring forward'], ['down', '↓', 'Send backward']
                    ]) {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.textContent = glyph;
                        button.title = title;
                        button.setAttribute('aria-label', title + ' ' + node.name);
                        button.disabled = !!page.locked;
                        button.addEventListener('click', () => treeAction(page, node, command));
                        acts.appendChild(button);
                    }
                    const more = document.createElement('button');
                    more.type = 'button';
                    more.textContent = '⋯';
                    more.title = 'Context menu';
                    more.setAttribute('aria-label', 'Context menu ' + node.name);
                    more.addEventListener('click', e => {
                        const rect = more.getBoundingClientRect();
                        showTreeMenu({ preventDefault: () => { }, stopPropagation: () => { },
                            clientX: rect.left, clientY: rect.bottom }, page, node);
                    });
                    acts.appendChild(more);
                    row.appendChild(acts);
                    row.addEventListener('contextmenu', e => showTreeMenu(e, page, node));
                    children.appendChild(row);
                }
                folder.appendChild(children);
                root.appendChild(folder);
            }
            return root;
        }
        const canvas = document.getElementById('viewport');
        canvas?.addEventListener('contextmenu', e => {
            const t = e.target;
            const group = t.closest?.('[data-vp1-text-id],[data-vp1-balloon-id],' +
                '[data-vp1-effect-id],.manga-layer,.manga-panel');
            const parent = group?.closest('.manga-page');
            const page = parent && instanceById(parent.dataset.id || '');
            if (!group || !page || page.type !== 'manga-page')
                return;
            let kind = 'panel', id = null;
            if (group.hasAttribute('data-vp1-text-id')) {
                kind = 'text';
                id = group.dataset.vp1TextId || null;
            }
            else if (group.hasAttribute('data-vp1-balloon-id')) {
                kind = 'balloon';
                id = group.dataset.vp1BalloonId || null;
            }
            else if (group.hasAttribute('data-vp1-effect-id')) {
                kind = 'drawing';
                id = group.dataset.vp1EffectId || null;
            }
            else if (group.classList.contains('manga-layer')) {
                kind = 'image';
                id = group.dataset.layerId || null;
            }
            else
                id = group.dataset.panelId || null;
            const node = MP.listLayerTree(page).find(n => n.id === id && n.kind === kind);
            if (node)
                showTreeMenu(e, page, node);
        });
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
            content.appendChild(buildLayerTree(inst, ps));
            content.appendChild(buildMangaFxSection(inst, activePanelId, ps));
            content.appendChild(buildBalloonSection(inst));
            content.appendChild(buildHorizontalTextSection(inst));
            content.appendChild(buildPngDpiSection(inst));
            /* VP1-012/017/018 — contextual Knife and gutter, no parallel toolbar. */
            if (activePanelId && activePanelId !== '__overlay__') {
                const tools = document.createElement('div');
                tools.className = 'insp-section vp1-knife-controls';
                const name = document.createElement('div');
                name.className = 'insp-label';
                name.textContent = 'Knife Tool / Gutter';
                tools.appendChild(name);
                const hint = document.createElement('p');
                hint.className = 'muted';
                hint.textContent = 'Select Knife (K), then drag across the selected panel. Press Esc to cancel.';
                tools.appendChild(hint);
                const active = MP.getKnifeMode();
                const isActive = active?.instanceId === inst.id && active.panelId === activePanelId;
                const knife = document.createElement('button');
                knife.type = 'button';
                knife.className = 'btn wide vp1-knife-toggle';
                knife.textContent = isActive ? 'Exit Knife Tool' : 'Knife: cut selected panel (K)';
                knife.setAttribute('aria-pressed', String(isActive));
                knife.addEventListener('click', () => {
                    if (isActive)
                        MP.setKnifeMode(null);
                    else if (!MP.setKnifeMode(inst.id, activePanelId))
                        D.toast('This panel is locked or not available.', 'error');
                    render();
                });
                tools.appendChild(knife);
                const row = document.createElement('label');
                row.className = 'vp1-gutter-row';
                const txt = document.createElement('span');
                txt.textContent = 'Gutter (page units)';
                const num = document.createElement('input');
                num.type = 'number';
                num.min = '0';
                num.max = '80';
                num.step = '1';
                num.className = 'vp1-gutter-input';
                num.value = String(ps.vp1KnifeGutter || 0);
                num.setAttribute('aria-label', 'Panel gutter in page units');
                num.disabled = !!inst.locked;
                row.append(txt, num);
                tools.appendChild(row);
                const note = document.createElement('p');
                note.className = 'muted';
                note.textContent = 'Affects all panels in this page only. 0 restores the base outlines.';
                tools.appendChild(note);
                num.addEventListener('change', async () => {
                    const amount = Number(num.value);
                    if (!Number.isInteger(amount) || amount < 0 || amount > 80) {
                        D.toast('Gutter must be an integer from 0 to 80.', 'error');
                        num.value = String(PS.get(inst.panelSetId)?.vp1KnifeGutter || 0);
                        return;
                    }
                    num.disabled = true;
                    try {
                        const current = instanceById(inst.id);
                        if (!current || current.type !== 'manga-page')
                            throw Error('Page no longer exists.');
                        await MP.setPanelGutter(current, amount);
                        if (MP.getKnifeMode()?.instanceId === current.id)
                            MP.setKnifeMode(current.id, activePanelId);
                        render();
                    }
                    catch (err) {
                        D.toast('Gutter could not be applied: ' + err.message, 'error');
                        const current = PS.get(inst.panelSetId);
                        num.value = String(current?.vp1KnifeGutter || 0);
                    }
                    finally {
                        num.disabled = false;
                    }
                });
                content.appendChild(tools);
            }
            /* VP1-021–028: direct vertices and appearance on the selected panel. */
            if (activePanelId && activePanelId !== '__overlay__') {
                const style = MP.getPanelStyle(inst, activePanelId);
                if (style) {
                    const group = document.createElement('div');
                    group.className = 'insp-section vp1-panel-properties';
                    const title = document.createElement('div');
                    title.className = 'insp-label';
                    title.textContent = 'Vertices / Panel properties';
                    group.appendChild(title);
                    const editing = MP.getVertexMode();
                    const selected = editing?.instanceId === inst.id && editing.panelId === activePanelId;
                    const toggle = document.createElement('button');
                    toggle.className = 'btn wide vp1-vertices-toggle';
                    toggle.type = 'button';
                    toggle.disabled = !!inst.locked;
                    toggle.setAttribute('aria-pressed', String(selected));
                    toggle.textContent = selected ? 'Exit vertices (V)' : 'Edit vertices (V)';
                    toggle.addEventListener('click', () => {
                        if (selected)
                            MP.setVertexMode(null);
                        else if (!MP.setVertexMode(inst.id, activePanelId)) {
                            D.toast('Only simple unlocked panel polygons can be edited.', 'error');
                        }
                        render();
                    });
                    group.appendChild(toggle);
                    const help = document.createElement('p');
                    help.className = 'muted';
                    help.textContent = 'Drag blue vertex handles. Invalid self-intersecting or overlapping shapes are rejected. Esc cancels.';
                    group.appendChild(help);
                    const commit = async (patch) => {
                        try {
                            const latest = instanceById(inst.id);
                            if (!latest || latest.type !== 'manga-page')
                                throw Error('Page not found.');
                            await MP.updatePanelStyle(latest, activePanelId, patch);
                            render();
                        }
                        catch (error) {
                            D.toast('Panel style not updated: ' + error.message, 'error');
                            render();
                        }
                    };
                    const isLocked = !!inst.locked;
                    function makeColor(labelText, key, fallback) {
                        const row = document.createElement('label');
                        row.className = 'vp1-property-row';
                        const name = document.createElement('span');
                        name.textContent = labelText;
                        const picker = document.createElement('input');
                        picker.type = 'color';
                        picker.value = style[key] === 'none' ? fallback : style[key];
                        picker.disabled = isLocked;
                        picker.setAttribute('aria-label', labelText);
                        picker.addEventListener('change', () => { void commit({ [key]: picker.value }); });
                        row.append(name, picker);
                        group.appendChild(row);
                        const visible = document.createElement('label');
                        visible.className = 'vp1-property-row';
                        const text = document.createElement('span');
                        text.textContent = key === 'fill' ? 'Enable panel fill' : 'Enable border';
                        const checkbox = document.createElement('input');
                        checkbox.type = 'checkbox';
                        checkbox.checked = style[key] !== 'none';
                        checkbox.disabled = isLocked;
                        checkbox.setAttribute('aria-label', text.textContent);
                        checkbox.addEventListener('change', () => { void commit({ [key]: checkbox.checked ? picker.value : 'none' }); });
                        visible.append(text, checkbox);
                        group.appendChild(visible);
                    }
                    makeColor('Fill color', 'fill', '#ffffff');
                    makeColor('Border color', 'stroke', '#1a1a1a');
                    function numericProperty(labelText, key, min, max, step, value, multiplier) {
                        const row = document.createElement('label');
                        row.className = 'vp1-property-row';
                        const title = document.createElement('span');
                        title.textContent = labelText;
                        const input = document.createElement('input');
                        input.type = 'number';
                        input.min = String(min);
                        input.max = String(max);
                        input.step = String(step);
                        input.value = String(value);
                        input.disabled = isLocked;
                        input.setAttribute('aria-label', labelText);
                        input.addEventListener('change', () => {
                            const number = Number(input.value);
                            if (!Number.isFinite(number) || number < min || number > max) {
                                D.toast('Value must be between ' + min + ' and ' + max + '.', 'error');
                                render();
                                return;
                            }
                            void commit({ [key]: number / multiplier });
                        });
                        row.append(title, input);
                        group.appendChild(row);
                    }
                    numericProperty('Border thickness', 'strokeWidth', 0, 32, 0.5, style.strokeWidth, 1);
                    numericProperty('Fill opacity (%)', 'fillOpacity', 0, 100, 1, Math.round(style.fillOpacity * 100), 100);
                    numericProperty('Border opacity (%)', 'strokeOpacity', 0, 100, 1, Math.round(style.strokeOpacity * 100), 100);
                    content.appendChild(group);
                }
            }
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
        /* VP1-030–040: compact per-layer image framing, no duplicate image editor. */
        const openedFraming = new Set();
        function buildFraming(inst, panelId, layer) {
            const box = document.createElement('div');
            box.className = 'vp1-framing';
            const snapshot = MP.getLayerFraming(inst, panelId, layer.id);
            if (!snapshot)
                return box;
            const status = document.createElement('p');
            status.className = 'muted';
            status.textContent = 'Image moves behind a fixed panel mask. Original asset is unchanged.';
            box.appendChild(status);
            const run = async (label, operation) => {
                try {
                    await operation();
                    render();
                }
                catch (error) {
                    D.toast(label + ': ' + error.message, 'error');
                }
            };
            const button = (text, action) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'btn vp1-image-action';
                b.textContent = text;
                b.disabled = !!inst.locked;
                b.addEventListener('click', () => { void run(text, action); });
                return b;
            };
            const buttons = document.createElement('div');
            buttons.className = 'vp1-framing-actions';
            buttons.append(button('Auto-Fit cover', () => MP.autoFitLayer(inst, panelId, layer.id, 'cover')), button('Fit contain', () => MP.autoFitLayer(inst, panelId, layer.id, 'contain')), button('Zoom +', () => MP.zoomLayer(inst, panelId, layer.id, 1.15)), button('Zoom −', () => MP.zoomLayer(inst, panelId, layer.id, 1 / 1.15)), button('Reset framing', () => MP.resetLayerFraming(inst, panelId, layer.id)));
            const cropMode = MP.getCropMode();
            const active = !!cropMode && cropMode.instanceId === inst.id &&
                cropMode.panelId === panelId && cropMode.layerId === layer.id;
            const cropToggle = document.createElement('button');
            cropToggle.type = 'button';
            cropToggle.className = 'btn vp1-crop-toggle';
            cropToggle.disabled = !!inst.locked;
            cropToggle.setAttribute('aria-pressed', String(active));
            cropToggle.textContent = active ? 'Exit Crop handles' : 'Crop handles';
            cropToggle.addEventListener('click', () => {
                MP.setCropMode(active ? null : inst.id, active ? null : panelId, active ? null : layer.id);
                render();
            });
            buttons.appendChild(cropToggle);
            box.appendChild(buttons);
            // Numeric editor in page units for transform; crop/limits in percentages.
            const fields = document.createElement('div');
            fields.className = 'vp1-framing-fields';
            const number = (label, current, min, max, step, action) => {
                const row = document.createElement('label');
                row.className = 'vp1-framing-field';
                const title = document.createElement('span');
                title.textContent = label;
                const input = document.createElement('input');
                input.type = 'number';
                input.min = String(min);
                input.max = String(max);
                input.step = String(step);
                input.value = String(Number(current.toFixed(3)));
                input.setAttribute('aria-label', label);
                input.disabled = !!inst.locked;
                input.addEventListener('change', () => {
                    const value = Number(input.value);
                    if (!Number.isFinite(value) || value < min || value > max) {
                        D.toast('Invalid ' + label, 'error');
                        render();
                        return;
                    }
                    void run(label, () => action(value));
                });
                row.append(title, input);
                fields.appendChild(row);
            };
            for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity']) {
                const pct = key === 'opacity';
                number(key === 'opacity' ? 'Opacity %' : key, snapshot[key] * (pct ? 100 : 1), pct ? 0 : key === 'rotation' ? -360 : key === 'width' || key === 'height' ? 1 : -65536, pct ? 100 : key === 'rotation' ? 360 : key === 'width' || key === 'height' ? 16384 : 65536, pct ? 1 : 0.5, value => MP.updateLayerFraming(inst, panelId, layer.id, { [key]: pct ? value / 100 : value }));
            }
            const bounds = ['left', 'top', 'right', 'bottom'];
            for (const type of ['crop', 'viewLimits']) {
                const group = document.createElement('fieldset');
                group.className = 'vp1-framing-group';
                const title = document.createElement('legend');
                title.textContent = type === 'crop' ? 'Source Crop (%)' : 'View Limits (%)';
                group.appendChild(title);
                for (const key of bounds) {
                    const row = document.createElement('label');
                    row.className = 'vp1-framing-field';
                    const name = document.createElement('span');
                    name.textContent = key;
                    const input = document.createElement('input');
                    input.type = 'number';
                    input.min = '0';
                    input.max = '98';
                    input.step = '1';
                    input.value = String(Math.round(snapshot[type][key] * 100));
                    input.setAttribute('aria-label', title.textContent + ' ' + key);
                    input.disabled = !!inst.locked;
                    input.addEventListener('change', () => {
                        const num = Number(input.value);
                        if (!Number.isFinite(num) || num < 0 || num > 98) {
                            D.toast('Crop/View Limits must be 0–98%.', 'error');
                            render();
                            return;
                        }
                        const update = { ...snapshot[type], [key]: num / 100 };
                        void run(type, () => MP.updateLayerFraming(inst, panelId, layer.id, { [type]: update }));
                    });
                    row.append(name, input);
                    group.appendChild(row);
                }
                fields.appendChild(group);
            }
            box.appendChild(fields);
            const replaceRow = document.createElement('div');
            replaceRow.className = 'vp1-replace-row';
            const select = document.createElement('select');
            select.setAttribute('aria-label', 'Replacement image');
            S.assets.forEach(asset => {
                const opt = document.createElement('option');
                opt.value = asset.id;
                opt.textContent = asset.name;
                opt.selected = asset.id === layer.assetId;
                select.appendChild(opt);
            });
            const preserve = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = true;
            preserve.append(checkbox, document.createTextNode(' Preserve framing'));
            replaceRow.append(select, preserve);
            replaceRow.appendChild(button('Replace image', () => MP.replaceLayerAsset(inst, panelId, layer.id, select.value, checkbox.checked)));
            box.appendChild(replaceRow);
            if (panelId !== '__overlay__') {
                box.appendChild(button('Export visible crop PNG', async () => {
                    const exporter = await kernel.require('mangaExport');
                    await exporter.exportCroppedLayer(inst, panelId, layer.id);
                }));
            }
            return box;
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
            const framingButton = document.createElement('button');
            framingButton.className = 'btn vp1-framing-toggle';
            framingButton.type = 'button';
            framingButton.textContent =
                openedFraming.has(layer.id) ? 'Hide image framing' : 'Image framing / crop';
            framingButton.setAttribute('aria-expanded', String(openedFraming.has(layer.id)));
            framingButton.addEventListener('click', () => {
                if (openedFraming.has(layer.id))
                    openedFraming.delete(layer.id);
                else
                    openedFraming.add(layer.id);
                render();
            });
            row.appendChild(framingButton);
            if (openedFraming.has(layer.id))
                row.appendChild(buildFraming(inst, panelId, layer));
            return row;
        }
        /* ---------------- Events ---------------- */
        kernel.on('manga-edit:selection', (payload) => {
            const inst = currentFocusInstance();
            treeImageSelection = inst && payload.layerId ?
                { instanceId: inst.id, id: payload.layerId } : null;
            render();
        });
        kernel.on('manga-edit:exit', () => { treeImageSelection = null; render(); });
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
