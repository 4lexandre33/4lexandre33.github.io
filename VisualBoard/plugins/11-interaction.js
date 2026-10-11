"use strict";
/* =====================================================================
 * plugins/11-interaction.js
 * ---------------------------------------------------------------------
 * Ponteiro, teclado, marquee, auto-pan, drag&drop, e Panel Edit Mode.
 *
 * FASE E4 (Overlay edit):
 *   - getLayer() reconhece '__overlay__'.
 *   - onDown() no edit mode trata o overlay como alvo válido.
 * ===================================================================== */
definePlugin({
    id: 'interaction',
    version: '1.6.0',
    needs: ['state', 'camera', 'boards', 'instances', 'renderer', 'ui.dialogs'],
    provides: ['interaction'],
    uses: ['mangaEdit', 'mangaPage', 'panelSets', 'history', 'assets'],
    accepts: { 'state': '^1.0.0', 'camera': '^1.0.0', 'boards': '^1.0.0', 'instances': '^1.0.0', 'renderer': '^1.0.0', 'ui.dialogs': '^1.0.0', 'mangaEdit': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0', 'history': '^1.0.0', 'assets': '^1.0.0' },
    contractVersions: { 'interaction': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const cam = await kernel.require('camera');
        const B = await kernel.require('boards');
        const instApi = await kernel.require('instances');
        const rend = await kernel.require('renderer');
        const D = await kernel.require('ui.dialogs');
        const H = await kernel.require('history');
        const viewport = document.getElementById('viewport');
        const marqueeEl = document.getElementById('marquee');
        let drag = null;
        let spaceDown = false;
        let lastPointer = { x: 0, y: 0 };
        let autoPanRAF = null;
        const EDGE = 70, MAX_AUTOPAN = 22;
        /* ---------------- Refs assíncronas ---------------- */
        let ME = null;
        let MP = null;
        let PS = null;
        if (kernel.has('mangaEdit'))
            kernel.require('mangaEdit').then(function (m) { ME = m; });
        if (kernel.has('mangaPage'))
            kernel.require('mangaPage').then(function (m) { MP = m; });
        if (kernel.has('panelSets'))
            kernel.require('panelSets').then(function (m) { PS = m; });
        /* VP1-012–014: page-local Knife gesture and screen-space SVG preview.
         * It does not modify a PanelSet before pointerup commits atomically.
         */
        let knifeDrag = null;
        const knifeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        knifeSvg.setAttribute('aria-hidden', 'true');
        knifeSvg.classList.add('vp1-knife-overlay');
        knifeSvg.style.display = 'none';
        knifeSvg.style.pointerEvents = 'none';
        viewport.appendChild(knifeSvg);
        function pageAt(id) {
            const page = S.getInstance(id);
            return page?.type === 'manga-page' ? page : null;
        }
        function knifeLocal(inst, world) {
            const ps = PS?.get(inst.panelSetId);
            if (!ps || !inst.width || !inst.height)
                return null;
            const angle = (inst.rotation || 0) * Math.PI / 180;
            const dx = world.x - (inst.x + inst.width / 2), dy = world.y - (inst.y + inst.height / 2);
            return {
                x: (inst.width / 2 + dx * Math.cos(angle) + dy * Math.sin(angle)) * ps.width / inst.width,
                y: (inst.height / 2 - dx * Math.sin(angle) + dy * Math.cos(angle)) * ps.height / inst.height
            };
        }
        function knifeWorld(inst, local) {
            const ps = PS?.get(inst.panelSetId);
            if (!ps)
                return null;
            const dx = local.x * inst.width / ps.width - inst.width / 2, dy = local.y * inst.height / ps.height - inst.height / 2;
            const angle = (inst.rotation || 0) * Math.PI / 180;
            return { x: inst.x + inst.width / 2 + dx * Math.cos(angle) - dy * Math.sin(angle),
                y: inst.y + inst.height / 2 + dx * Math.sin(angle) + dy * Math.cos(angle) };
        }
        function knifeScreen(inst, pt) {
            const world = knifeWorld(inst, pt);
            return world ? cam.worldToScreen(world.x, world.y) : null;
        }
        function clearKnifePreview() {
            knifeSvg.replaceChildren();
            knifeSvg.style.display = 'none';
        }
        function paintKnifePreview() {
            knifeSvg.replaceChildren();
            if (!knifeDrag || !MP) {
                clearKnifePreview();
                return;
            }
            const inst = pageAt(knifeDrag.instanceId), mode = MP.getKnifeMode();
            if (!inst || !mode || mode.instanceId !== inst.id) {
                clearKnifePreview();
                return;
            }
            const line = { x1: knifeDrag.start.x, y1: knifeDrag.start.y,
                x2: knifeDrag.end.x, y2: knifeDrag.end.y };
            const draft = MP.previewKnife(inst, knifeDrag.panelId, line, mode.gutter);
            knifeSvg.style.display = 'block';
            knifeSvg.setAttribute('width', String(viewport.clientWidth));
            knifeSvg.setAttribute('height', String(viewport.clientHeight));
            knifeSvg.setAttribute('viewBox', '0 0 ' + viewport.clientWidth + ' ' + viewport.clientHeight);
            if (draft.valid) {
                for (const polygon of [draft.first, draft.second]) {
                    const pts = polygon.map(pt => knifeScreen(inst, pt)).filter((x) => !!x);
                    if (pts.length !== polygon.length)
                        continue;
                    const el = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                    el.setAttribute('points', pts.map(p => p.x + ',' + p.y).join(' '));
                    el.setAttribute('fill', 'rgba(41,180,124,0.22)');
                    el.setAttribute('stroke', '#25c78e');
                    el.setAttribute('stroke-width', '2');
                    knifeSvg.appendChild(el);
                }
            }
            const aa = knifeScreen(inst, knifeDrag.start), bb = knifeScreen(inst, knifeDrag.end);
            if (aa && bb) {
                const lineEl = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                lineEl.setAttribute('x1', String(aa.x));
                lineEl.setAttribute('y1', String(aa.y));
                lineEl.setAttribute('x2', String(bb.x));
                lineEl.setAttribute('y2', String(bb.y));
                lineEl.setAttribute('stroke', draft.valid ? '#25c78e' : '#ed6975');
                lineEl.setAttribute('stroke-width', '2.5');
                lineEl.setAttribute('stroke-dasharray', '8 4');
                knifeSvg.appendChild(lineEl);
            }
        }
        function knifeBegin(e) {
            const mode = MP?.getKnifeMode();
            if (!mode || !MP)
                return false;
            e.preventDefault();
            e.stopPropagation();
            const page = pageAt(mode.instanceId);
            const target = e.target.closest('.manga-page');
            if (!page || page.locked || target?.dataset.id !== page.id)
                return true;
            const screen = vp(e), world = cam.screenToWorld(screen.x, screen.y);
            const local = knifeLocal(page, world);
            if (!local)
                return true;
            // Verify that starting point belongs to the selected polygon.
            const ps = PS?.get(page.panelSetId);
            if (!ps)
                return true;
            const poly = ps.panels.find(p => p.id === mode.panelId);
            if (!poly)
                return true;
            const x = local.x, y = local.y;
            const within = PS && MP.hitTestPanel(page, world.x, world.y) === mode.panelId;
            if (!within && (x < 0 || x > ps.width || y < 0 || y > ps.height))
                return true;
            knifeDrag = { pointerId: e.pointerId, instanceId: page.id, panelId: mode.panelId,
                start: local, end: local, screenStart: screen };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (_) { }
            paintKnifePreview();
            return true;
        }
        async function knifeFinish(evt) {
            if (!knifeDrag)
                return false;
            if (evt && evt.pointerId !== knifeDrag.pointerId)
                return true;
            const d = knifeDrag;
            knifeDrag = null;
            clearKnifePreview();
            try {
                viewport.releasePointerCapture(d.pointerId);
            }
            catch (_) { }
            if (evt?.type === 'pointercancel' || !MP)
                return true;
            const page = pageAt(d.instanceId), mode = MP.getKnifeMode();
            if (!page || !mode || mode.instanceId !== d.instanceId)
                return true;
            const travel = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
            if (travel < 2)
                return true;
            try {
                await MP.splitPanel(page, d.panelId, {
                    x1: d.start.x, y1: d.start.y, x2: d.end.x, y2: d.end.y
                }, mode.gutter);
                MP.setKnifeMode(null);
                D.toast('Panel split. Both sides retain their layers.', 'ok');
            }
            catch (error) {
                D.toast('Invalid cut: ' + error.message, 'error');
                kernel.log.warn('[VP1 Knife] cut rejected', error);
            }
            return true;
        }
        /* VP1-021–024: pointer-accessible vertex handles, separate from Knife. */
        let vertexDrag = null;
        const vertexSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        vertexSvg.classList.add('vp1-vertex-overlay');
        vertexSvg.setAttribute('aria-label', 'Selected panel vertex handles');
        vertexSvg.style.display = 'none';
        viewport.appendChild(vertexSvg);
        function drawVertexHandles() {
            vertexSvg.replaceChildren();
            const mode = MP?.getVertexMode();
            if (!mode) {
                vertexSvg.style.display = 'none';
                return;
            }
            const inst = pageAt(mode.instanceId), ps = inst && PS?.get(inst.panelSetId);
            const base = ps && (ps.vp1KnifeBasePanels || ps.panels).find(p => p.id === mode.panelId);
            if (!inst || !base) {
                vertexSvg.style.display = 'none';
                return;
            }
            const active = vertexDrag && vertexDrag.instanceId === inst.id ? vertexDrag : null;
            const draft = active?.draft;
            const localPoints = draft?.valid ? draft.points :
                ps?.panels.find(p => p.id === mode.panelId)?.points || base.points;
            const screenPoints = localPoints.map(pt => knifeScreen(inst, pt));
            const pts = screenPoints.filter((pt) => !!pt);
            vertexSvg.style.display = 'block';
            vertexSvg.setAttribute('width', String(viewport.clientWidth));
            vertexSvg.setAttribute('height', String(viewport.clientHeight));
            vertexSvg.setAttribute('viewBox', '0 0 ' + viewport.clientWidth + ' ' + viewport.clientHeight);
            if (pts.length === localPoints.length) {
                const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
                polygon.setAttribute('points', pts.map(p => p.x + ',' + p.y).join(' '));
                polygon.setAttribute('fill', 'rgba(73,163,255,0.08)');
                polygon.setAttribute('stroke', active && !draft?.valid ? '#f36b79' : '#4da3ff');
                polygon.setAttribute('stroke-width', '1.5');
                polygon.setAttribute('stroke-dasharray', '5 4');
                polygon.setAttribute('pointer-events', 'none');
                vertexSvg.appendChild(polygon);
            }
            base.points.forEach((pt, index) => {
                const projected = knifeScreen(inst, active?.index === index ? active.point : pt);
                if (!projected)
                    return;
                const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                handle.setAttribute('cx', String(projected.x));
                handle.setAttribute('cy', String(projected.y));
                handle.setAttribute('r', String(index === mode.selectedIndex ? 8 : 7));
                handle.setAttribute('fill', active?.index === index && !draft?.valid ? '#f36b79' : '#ffffff');
                handle.setAttribute('stroke', '#2189ef');
                handle.setAttribute('stroke-width', '2');
                handle.setAttribute('pointer-events', 'all');
                handle.setAttribute('role', 'button');
                handle.setAttribute('aria-label', 'Vertex ' + (index + 1));
                handle.setAttribute('data-vp1-vertex-index', String(index));
                vertexSvg.appendChild(handle);
            });
        }
        function vertexBegin(e) {
            const mode = MP?.getVertexMode();
            if (!mode || !MP)
                return false;
            const handle = e.target.closest?.('[data-vp1-vertex-index]');
            if (handle) {
                e.preventDefault();
                e.stopPropagation();
                const index = Number(handle.getAttribute('data-vp1-vertex-index'));
                const inst = pageAt(mode.instanceId), ps = inst && PS?.get(inst.panelSetId);
                const panel = ps && (ps.vp1KnifeBasePanels || ps.panels).find(p => p.id === mode.panelId);
                if (!inst || !panel || !Number.isInteger(index) || !panel.points[index])
                    return true;
                vertexDrag = { pointerId: e.pointerId, instanceId: inst.id, panelId: mode.panelId,
                    index, point: { ...panel.points[index] }, draft: null };
                try {
                    viewport.setPointerCapture(e.pointerId);
                }
                catch (_) { }
                drawVertexHandles();
                return true;
            }
            const page = e.target.closest?.('.manga-page');
            if (page) {
                e.preventDefault();
                e.stopPropagation();
                const inst = pageAt(page.dataset.id || '');
                if (inst) {
                    const at = vp(e), world = cam.screenToWorld(at.x, at.y);
                    const target = MP.hitTestPanel(inst, world.x, world.y);
                    if (target)
                        MP.setVertexMode(inst.id, target);
                }
                return true;
            }
            return false;
        }
        async function vertexFinish(e) {
            if (!vertexDrag)
                return false;
            if (e && e.pointerId !== vertexDrag.pointerId)
                return true;
            const d = vertexDrag;
            vertexDrag = null;
            try {
                viewport.releasePointerCapture(d.pointerId);
            }
            catch (_) { }
            if (e?.type === 'pointercancel') {
                drawVertexHandles();
                return true;
            }
            const page = pageAt(d.instanceId);
            if (page && MP && d.draft?.valid) {
                try {
                    await MP.moveVertex(page, d.panelId, d.index, d.point);
                }
                catch (error) {
                    D.toast('Vertex not changed: ' + error.message, 'error');
                    kernel.log.warn('[VP1 vertex] rejected', error);
                }
            }
            else if (d.draft && !d.draft.valid) {
                D.toast(d.draft.reason || 'Invalid polygon.', 'error');
            }
            drawVertexHandles();
            return true;
        }
        /* VP1-029/037: crop handles change only source inset, never original pixels. */
        let cropDrag = null;
        function cropBegin(e) {
            const mode = MP?.getCropMode();
            if (!mode || !MP)
                return false;
            const handle = e.target.closest?.('[data-vp1-crop-handle]');
            if (!handle)
                return false;
            if (handle.dataset.vp1CropLayerId !== mode.layerId)
                return false;
            const page = pageAt(mode.instanceId);
            const frame = page && MP.getLayerFraming(page, mode.panelId, mode.layerId);
            if (!page || !frame)
                return false;
            e.preventDefault();
            e.stopPropagation();
            cropDrag = { pointerId: e.pointerId, ...mode,
                edge: handle.dataset.vp1CropHandle,
                crop: { ...frame.crop } };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (_) { }
            return true;
        }
        function cropUpdate(e) {
            if (!cropDrag || !MP || e.pointerId !== cropDrag.pointerId)
                return;
            const d = cropDrag, page = pageAt(d.instanceId);
            const layer = page && getLayer(page, d.panelId, d.layerId);
            const point = page && knifeLocal(page, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!page || !layer || !point)
                return;
            const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
            const angle = -(layer.rotation || 0) * Math.PI / 180;
            const dx = point.x - cx, dy = point.y - cy;
            const u = (dx * Math.cos(angle) - dy * Math.sin(angle) + layer.width / 2) / layer.width;
            const v = (dx * Math.sin(angle) + dy * Math.cos(angle) + layer.height / 2) / layer.height;
            const crop = { ...d.crop };
            if (d.edge === 'left')
                crop.left = Math.max(0, Math.min(0.98 - crop.right, u));
            if (d.edge === 'right')
                crop.right = Math.max(0, Math.min(0.98 - crop.left, 1 - u));
            if (d.edge === 'top')
                crop.top = Math.max(0, Math.min(0.98 - crop.bottom, v));
            if (d.edge === 'bottom')
                crop.bottom = Math.max(0, Math.min(0.98 - crop.top, 1 - v));
            if (crop.left + crop.right >= 0.99 || crop.top + crop.bottom >= 0.99)
                return;
            d.crop = crop;
            const elem = Array.from(viewport.querySelectorAll('.manga-page'))
                .find(p => p.dataset.id === d.instanceId);
            const imageLayer = elem && Array.from(elem.querySelectorAll('.manga-layer'))
                .find(l => l.dataset.layerId === d.layerId);
            if (!imageLayer)
                return;
            const img = imageLayer.querySelector('img');
            const mask = 'inset(' + crop.top * 100 + '% ' + crop.right * 100 + '% ' +
                crop.bottom * 100 + '% ' + crop.left * 100 + '%)';
            if (img)
                img.style.clipPath = mask;
            const pageElement = elem?.querySelector('.vp1-crop-page-overlay');
            if (pageElement) {
                const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
                const angle = (layer.rotation || 0) * Math.PI / 180;
                for (const edge of ['left', 'right', 'top', 'bottom']) {
                    const h = pageElement.querySelector('[data-vp1-crop-handle="' + edge + '"]');
                    if (!h)
                        continue;
                    const u = edge === 'left' ? crop.left : edge === 'right' ? 1 - crop.right :
                        crop.left + (1 - crop.left - crop.right) / 2;
                    const v = edge === 'top' ? crop.top : edge === 'bottom' ? 1 - crop.bottom :
                        crop.top + (1 - crop.top - crop.bottom) / 2;
                    const dx = layer.x + layer.width * u - cx, dy = layer.y + layer.height * v - cy;
                    h.style.left = (cx + dx * Math.cos(angle) - dy * Math.sin(angle)) + 'px';
                    h.style.top = (cy + dx * Math.sin(angle) + dy * Math.cos(angle)) + 'px';
                }
            }
        }
        async function cropFinish(e) {
            if (!cropDrag)
                return false;
            if (e && e.pointerId !== cropDrag.pointerId)
                return true;
            const d = cropDrag;
            cropDrag = null;
            try {
                viewport.releasePointerCapture(d.pointerId);
            }
            catch (_) { }
            const page = pageAt(d.instanceId);
            if (!page || !MP)
                return true;
            if (e?.type === 'pointercancel') {
                rend.updateEl(page);
                return true;
            }
            try {
                await MP.updateLayerFraming(page, d.panelId, d.layerId, { crop: d.crop });
            }
            catch (err) {
                D.toast('Crop not changed: ' + err.message, 'error');
                rend.updateEl(page);
            }
            return true;
        }
        /* VP1-029: paste an image directly into a selected manga panel using the
         * pre-existing asset pipeline. Keyboard paste of non-image items is untouched. */
        async function onImagePaste(e) {
            if (isTyping(e.target) || !MP || !e.clipboardData)
                return;
            const file = Array.from(e.clipboardData.items)
                .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
                .map(item => item.getAsFile()).find((v) => !!v);
            if (!file)
                return;
            const focus = MP.getFocus(), page = focus.instanceId && pageAt(focus.instanceId);
            if (!page || !focus.panelId || page.locked)
                return;
            e.preventDefault();
            try {
                const assets = await kernel.require('assets');
                const created = await assets.createFromFile(file);
                await MP.addLayer(page, focus.panelId, created.id);
                kernel.emit('assets:changed');
            }
            catch (err) {
                D.toast('Image paste failed: ' + err.message, 'error');
            }
        }
        /* VP1-043–046: stroke and selection gestures in page coordinates, with
         * exact vector preview but no document writes until pointerup. */
        let mangaStroke = null;
        let fxMove = null;
        const mangaPreview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        mangaPreview.classList.add('vp1-manga-brush-preview');
        mangaPreview.setAttribute('aria-hidden', 'true');
        mangaPreview.style.display = 'none';
        viewport.appendChild(mangaPreview);
        function clearMangaPreview() {
            mangaPreview.replaceChildren();
            mangaPreview.style.display = 'none';
        }
        function paintMangaPreview() {
            mangaPreview.replaceChildren();
            if (!mangaStroke || !MP) {
                clearMangaPreview();
                return;
            }
            const stroke = mangaStroke;
            const inst = pageAt(stroke.instanceId);
            if (!inst)
                return;
            const origin = knifeScreen(inst, { x: 0, y: 0 });
            const unitX = knifeScreen(inst, { x: 1, y: 0 });
            const unitY = knifeScreen(inst, { x: 0, y: 1 });
            if (!origin || !unitX || !unitY)
                return;
            mangaPreview.style.display = 'block';
            mangaPreview.setAttribute('width', String(viewport.clientWidth));
            mangaPreview.setAttribute('height', String(viewport.clientHeight));
            mangaPreview.setAttribute('viewBox', '0 0 ' + viewport.clientWidth + ' ' + viewport.clientHeight);
            const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            g.setAttribute('transform', 'matrix(' +
                [unitX.x - origin.x, unitX.y - origin.y, unitY.x - origin.x,
                    unitY.y - origin.y, origin.x, origin.y].join(' ') + ')');
            mangaPreview.appendChild(g);
            if (stroke.tool === 'eraser') {
                const last = stroke.points[stroke.points.length - 1];
                const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ring.setAttribute('cx', String(last.x));
                ring.setAttribute('cy', String(last.y));
                ring.setAttribute('r', String(stroke.mode.size));
                ring.setAttribute('fill', 'rgba(240,80,80,.12)');
                ring.setAttribute('stroke', '#ef5050');
                ring.setAttribute('stroke-width', '1');
                g.appendChild(ring);
                return;
            }
            for (const p of MP.previewMangaInk(inst, stroke.points, stroke.mode)) {
                const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                node.setAttribute('d', p.d);
                node.setAttribute('fill', p.fill);
                node.setAttribute('stroke', p.stroke);
                node.setAttribute('stroke-width', String(p.strokeWidth));
                node.setAttribute('opacity', String(p.opacity));
                g.appendChild(node);
            }
        }
        function beginMangaGesture(e) {
            if (!MP || e.button !== 0)
                return false;
            const selected = MP.getSelectedMangaEffect();
            const target = e.target.closest?.('[data-vp1-effect-selected="true"]');
            if (target && selected && selected.id === target.dataset.vp1EffectId) {
                const pg = e.target.closest?.('.manga-page');
                const inst = pg && pageAt(pg.dataset.id || '');
                if (!inst || inst.locked || inst.id !== selected.instanceId)
                    return false;
                const effect = MP.listMangaEffects(inst).find(x => x.id === selected.id);
                if (MP.getLayerNodeState(inst, 'drawing', selected.id)?.locked)
                    return true;
                if (!effect)
                    return false;
                const point = knifeLocal(inst, cam.screenToWorld(vp(e).x, vp(e).y));
                if (!point)
                    return false;
                e.preventDefault();
                e.stopPropagation();
                fxMove = { pointerId: e.pointerId, instanceId: inst.id, id: effect.id,
                    start: point, delta: { x: 0, y: 0 }, origin: { x: effect.x, y: effect.y } };
                try {
                    viewport.setPointerCapture(e.pointerId);
                }
                catch (_) { }
                return true;
            }
            const mode = MP.getMangaToolMode();
            if (!mode)
                return false;
            const pageEl = e.target.closest?.('.manga-page');
            const panelEl = e.target.closest?.('.manga-panel');
            const inst = pageEl && pageAt(pageEl.dataset.id || '');
            if (!inst || inst.locked || inst.id !== mode.instanceId ||
                panelEl?.dataset.panelId !== mode.panelId)
                return false;
            const point = knifeLocal(inst, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!point)
                return false;
            e.preventDefault();
            e.stopPropagation();
            mangaStroke = { pointerId: e.pointerId, instanceId: inst.id,
                panelId: mode.panelId, tool: mode.tool, mode, points: [
                    { x: point.x, y: point.y, pressure: e.pointerType === 'pen' ?
                            Math.max(.05, Math.min(1, e.pressure || 1)) : 1 }
                ] };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (_) { }
            paintMangaPreview();
            return true;
        }
        function moveMangaGesture(e) {
            if (!MP)
                return false;
            if (fxMove) {
                if (fxMove.pointerId !== e.pointerId)
                    return true;
                const inst = pageAt(fxMove.instanceId);
                const point = inst && knifeLocal(inst, cam.screenToWorld(vp(e).x, vp(e).y));
                if (!point)
                    return true;
                fxMove.delta = { x: point.x - fxMove.start.x, y: point.y - fxMove.start.y };
                const pageEl = Array.from(viewport.querySelectorAll('.manga-page'))
                    .find(x => x.dataset.id === fxMove.instanceId);
                const group = pageEl && Array.from(pageEl.querySelectorAll('.vp1-manga-effects [data-vp1-effect-id]'))
                    .find(x => x.dataset.vp1EffectId === fxMove.id);
                if (group)
                    group.setAttribute('transform', 'translate(' +
                        fxMove.delta.x + ' ' + fxMove.delta.y + ')');
                return true;
            }
            if (!mangaStroke)
                return false;
            if (mangaStroke.pointerId !== e.pointerId)
                return true;
            const inst = pageAt(mangaStroke.instanceId);
            const point = inst && knifeLocal(inst, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!point)
                return true;
            const pts = mangaStroke.points, last = pts[pts.length - 1];
            if (Math.hypot(point.x - last.x, point.y - last.y) > .85 && pts.length < 2048) {
                pts.push({ x: point.x, y: point.y, pressure: e.pointerType === 'pen' ?
                        Math.max(.05, Math.min(1, e.pressure || 1)) : 1 });
                paintMangaPreview();
            }
            return true;
        }
        async function finishMangaGesture(e) {
            if (fxMove) {
                if (e && e.pointerId !== fxMove.pointerId)
                    return true;
                const d = fxMove;
                fxMove = null;
                try {
                    viewport.releasePointerCapture(d.pointerId);
                }
                catch (_) { }
                const inst = pageAt(d.instanceId);
                if (inst && MP) {
                    if (e?.type === 'pointercancel')
                        rend.updateEl(inst);
                    else
                        try {
                            if (Math.hypot(d.delta.x, d.delta.y) > 0.5)
                                await MP.updateMangaEffect(inst, d.id, {
                                    x: d.origin.x + d.delta.x, y: d.origin.y + d.delta.y
                                });
                        }
                        catch (error) {
                            D.toast('Move effect: ' + error.message, 'error');
                        }
                    rend.updateEl(inst);
                }
                return true;
            }
            if (!mangaStroke)
                return false;
            if (e && e.pointerId !== mangaStroke.pointerId)
                return true;
            const stroke = mangaStroke;
            mangaStroke = null;
            try {
                viewport.releasePointerCapture(stroke.pointerId);
            }
            catch (_) { }
            clearMangaPreview();
            if (e?.type === 'pointercancel')
                return true;
            const inst = pageAt(stroke.instanceId);
            if (!inst || !MP)
                return true;
            try {
                if (stroke.tool === 'ink') {
                    await MP.addMangaEffect(inst, {
                        kind: 'ink', scope: 'panel', panelId: stroke.panelId,
                        points: stroke.points, color: stroke.mode.color,
                        size: stroke.mode.size, opacity: stroke.mode.opacity, tip: stroke.mode.tip
                    });
                }
                else {
                    await MP.eraseMangaInkPath(inst, stroke.panelId, stroke.points, stroke.mode.size);
                }
            }
            catch (error) {
                D.toast('Manga stroke failed: ' + error.message, 'error');
            }
            return true;
        }
        let balloonDrag = null;
        const balloonSketch = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        balloonSketch.classList.add('vp1-balloon-sketch');
        balloonSketch.style.position = 'absolute';
        balloonSketch.style.inset = '0';
        balloonSketch.style.pointerEvents = 'none';
        balloonSketch.style.zIndex = '900';
        balloonSketch.setAttribute('aria-hidden', 'true');
        viewport.appendChild(balloonSketch);
        function paintBalloonSketch() {
            balloonSketch.replaceChildren();
            const mode = MP?.getBalloonDrawMode();
            if (!mode || mode.points.length === 0)
                return;
            const page = pageAt(mode.instanceId);
            if (!page)
                return;
            balloonSketch.setAttribute('width', String(viewport.clientWidth));
            balloonSketch.setAttribute('height', String(viewport.clientHeight));
            balloonSketch.setAttribute('viewBox', '0 0 ' + viewport.clientWidth + ' ' + viewport.clientHeight);
            const points = mode.points.map(p => knifeScreen(page, p)).filter((p) => p !== null);
            if (points.length !== mode.points.length)
                return;
            const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
            poly.setAttribute('points', points.map(p => p.x + ',' + p.y).join(' '));
            poly.setAttribute('fill', 'rgba(255,255,255,.2)');
            poly.setAttribute('stroke', '#1580dc');
            poly.setAttribute('stroke-width', '2');
            poly.setAttribute('stroke-dasharray', '5 4');
            balloonSketch.appendChild(poly);
            for (const p of points) {
                const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                node.setAttribute('cx', String(p.x));
                node.setAttribute('cy', String(p.y));
                node.setAttribute('r', '4');
                node.setAttribute('fill', '#1580dc');
                balloonSketch.appendChild(node);
            }
        }
        function beginBalloonGesture(e) {
            if (!MP || e.button !== 0)
                return false;
            const mode = MP.getBalloonDrawMode();
            if (mode) {
                e.preventDefault();
                e.stopPropagation();
                const page = pageAt(mode.instanceId);
                const target = e.target.closest?.('.manga-page');
                if (page && target?.dataset.id === page.id) {
                    const p = knifeLocal(page, cam.screenToWorld(vp(e).x, vp(e).y));
                    if (p)
                        MP.appendBalloonPoint(p);
                }
                paintBalloonSketch();
                return true;
            }
            const hit = e.target.closest?.('[data-vp1-balloon-id]');
            const pageEl = hit?.closest('.manga-page');
            const page = pageEl && pageAt(pageEl.dataset.id || '');
            if (!hit || !page || page.locked)
                return false;
            const b = MP.listBalloons(page).find(x => x.id === hit.dataset.vp1BalloonId);
            if (!b || MP.getLayerNodeState(page, 'balloon', b.id)?.locked)
                return false;
            e.preventDefault();
            e.stopPropagation();
            MP.selectBalloon(page.id, b.id);
            const handle = e.target.closest?.('[data-vp1-balloon-handle]');
            const vertex = e.target.closest?.('[data-vp1-balloon-vertex-index]');
            const start = knifeLocal(page, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!start)
                return true;
            balloonDrag = { pointerId: e.pointerId, instanceId: page.id, id: b.id,
                kind: vertex ? 'vertex' : handle ? 'resize' : 'move', start, current: start, source: b,
                handle: handle?.getAttribute('data-vp1-balloon-handle') || '',
                vertex: vertex ? Number(vertex.getAttribute('data-vp1-balloon-vertex-index')) : -1 };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (_) { }
            return true;
        }
        function moveBalloonGesture(e) {
            const d = balloonDrag;
            if (!d)
                return false;
            if (e.pointerId !== d.pointerId)
                return true;
            const page = pageAt(d.instanceId);
            const p = page && knifeLocal(page, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!p)
                return true;
            d.current = p;
            // Transient visual move: the stored JSON remains untouched until commit.
            if (d.kind === 'move') {
                const root = rend.els.get(d.instanceId);
                const group = root && Array.from(root.querySelectorAll('[data-vp1-balloon-id]')).find(x => x.dataset.vp1BalloonId === d.id);
                if (group) {
                    const dx = p.x - d.start.x, dy = p.y - d.start.y;
                    const b = d.source;
                    group.setAttribute('transform', 'translate(' + dx + ' ' + dy + ') rotate(' +
                        b.rotation + ' ' + (b.x + b.width / 2) + ' ' + (b.y + b.height / 2) + ')');
                }
            }
            return true;
        }
        async function endBalloonGesture(e) {
            const d = balloonDrag;
            if (!d)
                return false;
            if (e && e.pointerId !== d.pointerId)
                return true;
            balloonDrag = null;
            try {
                viewport.releasePointerCapture(d.pointerId);
            }
            catch (_) { }
            const page = pageAt(d.instanceId);
            if (!page || !MP)
                return true;
            if (e?.type === 'pointercancel') {
                rend.updateEl(page);
                return true;
            }
            const b = d.source, dx = d.current.x - d.start.x, dy = d.current.y - d.start.y;
            try {
                if (d.kind === 'move' && Math.hypot(dx, dy) > .5) {
                    await MP.updateBalloon(page, d.id, { x: b.x + dx, y: b.y + dy });
                }
                else if (d.kind === 'vertex' && Math.hypot(dx, dy) > .5 &&
                    b.vertices && d.vertex >= 0) {
                    const x = b.x + b.vertices[d.vertex].x * b.width + dx;
                    const y = b.y + b.vertices[d.vertex].y * b.height + dy;
                    await MP.setBalloonVertex(page, d.id, d.vertex, { x, y });
                }
                else if (d.kind === 'resize' && Math.hypot(dx, dy) > .5) {
                    let x = b.x, y = b.y, w = b.width, h = b.height;
                    if (d.handle.includes('w')) {
                        x += dx;
                        w -= dx;
                    }
                    if (d.handle.includes('e'))
                        w += dx;
                    if (d.handle.includes('n')) {
                        y += dy;
                        h -= dy;
                    }
                    if (d.handle.includes('s'))
                        h += dy;
                    if (w >= 8 && h >= 8)
                        await MP.updateBalloon(page, d.id, { x, y, width: w, height: h });
                }
            }
            catch (error) {
                D.toast('Balloon: ' + error.message, 'error');
            }
            rend.updateEl(page);
            return true;
        }
        /* VP1-063/067 — edit directly in the page overlay. A textarea draft
         * owns keyboard input; one blur/Ctrl+Enter produces one history step.
         * Escape cancels, and unrelated canvas hotkeys never fire while typing. */
        let horizontalEditor = null;
        let horizontalDrag = null;
        function endHorizontalEditor(commit) {
            const editor = horizontalEditor;
            if (!editor)
                return;
            horizontalEditor = null;
            const page = pageAt(editor.dataset.vp1TextPage || '');
            const id = editor.dataset.vp1TextEditing || '';
            const value = editor.value;
            editor.remove();
            if (commit && page && MP && !page.locked) {
                void MP.updateHorizontalText(page, id, { text: value }).catch(error => D.toast('Horizontal text: ' + error.message, 'error'));
            }
        }
        function editHorizontalText(page, id) {
            if (!MP || page.locked)
                return false;
            const item = MP.listHorizontalTexts(page).find(t => t.id === id);
            if (!item || MP.getLayerNodeState(page, 'text', id)?.locked)
                return false;
            endHorizontalEditor(true);
            MP.selectHorizontalText(page.id, id);
            const root = rend.els.get(page.id);
            const slot = root?.querySelector('.manga-page-inner .manga-overlay');
            if (!slot)
                return false;
            const editor = document.createElement('textarea');
            horizontalEditor = editor;
            editor.className = 'vp1-text-inline-editor';
            editor.dataset.vp1TextEditing = id;
            editor.dataset.vp1TextPage = page.id;
            editor.setAttribute('aria-label', 'Edit horizontal text on canvas');
            editor.value = item.text;
            editor.maxLength = 4000;
            editor.spellcheck = false;
            Object.assign(editor.style, {
                left: item.x + 'px', top: item.y + 'px', width: item.width + 'px',
                minHeight: item.height + 'px', height: item.height + 'px',
                transform: item.rotation ? 'rotate(' + item.rotation + 'deg)' : '',
                fontFamily: '"' + item.fontFamily + '", sans-serif', fontSize: item.fontSize + 'px',
                fontWeight: item.bold ? '700' : '400', textAlign: item.align,
                color: item.color, opacity: String(item.opacity)
            });
            editor.addEventListener('pointerdown', e => e.stopPropagation());
            editor.addEventListener('dblclick', e => e.stopPropagation());
            editor.addEventListener('keydown', e => {
                e.stopPropagation();
                if (e.key === 'Escape') {
                    e.preventDefault();
                    endHorizontalEditor(false);
                }
                else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    endHorizontalEditor(true);
                }
            });
            editor.addEventListener('blur', () => {
                if (horizontalEditor === editor)
                    endHorizontalEditor(true);
            });
            slot.appendChild(editor);
            editor.focus();
            editor.select();
            return true;
        }
        viewport.addEventListener('nvb-horizontal-text-edit', event => {
            const detail = event.detail;
            const page = pageAt(detail?.instanceId || '');
            if (page && detail?.id)
                editHorizontalText(page, detail.id);
        });
        function beginHorizontalGesture(e) {
            if (!MP || e.button !== 0 || horizontalEditor)
                return false;
            const target = e.target.closest?.('[data-vp1-text-id]');
            const pageEl = target?.closest('.manga-page');
            const page = pageEl && pageAt(pageEl.dataset.id || '');
            if (!page || page.locked || !target)
                return false;
            const source = MP.listHorizontalTexts(page).find(t => t.id === target.dataset.vp1TextId);
            if (!source || MP.getLayerNodeState(page, 'text', source.id)?.locked)
                return false;
            const point = knifeLocal(page, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!point)
                return false;
            e.preventDefault();
            e.stopPropagation();
            const handle = e.target.closest?.('[data-vp1-text-handle]');
            const selected = MP.getSelectedHorizontalText();
            if (selected?.instanceId !== page.id || selected.id !== source.id)
                MP.selectHorizontalText(page.id, source.id);
            horizontalDrag = { pointerId: e.pointerId, instanceId: page.id, id: source.id,
                start: point, current: point, source,
                handle: handle?.getAttribute('data-vp1-text-handle') || '' };
            // No pointer capture on a click: preserve DOM dblclick targets.
            return true;
        }
        function moveHorizontalGesture(e) {
            const d = horizontalDrag;
            if (!d)
                return false;
            if (e.pointerId !== d.pointerId)
                return true;
            const page = pageAt(d.instanceId);
            const point = page && knifeLocal(page, cam.screenToWorld(vp(e).x, vp(e).y));
            if (!point)
                return true;
            d.current = point;
            if (!d.handle) {
                const root = rend.els.get(d.instanceId);
                const group = root && Array.from(root.querySelectorAll('.vp1-horizontal-texts [data-vp1-text-id]'))
                    .find(node => node.dataset.vp1TextId === d.id);
                if (group) {
                    const dx = point.x - d.start.x, dy = point.y - d.start.y, t = d.source;
                    group.setAttribute('transform', 'translate(' + dx + ' ' + dy + ') rotate(' +
                        t.rotation + ' ' + (t.x + t.width / 2) + ' ' + (t.y + t.height / 2) + ')');
                }
            }
            return true;
        }
        async function endHorizontalGesture(e) {
            const drag = horizontalDrag;
            if (!drag)
                return false;
            if (e && e.pointerId !== drag.pointerId)
                return true;
            horizontalDrag = null;
            try {
                viewport.releasePointerCapture(drag.pointerId);
            }
            catch (_) { }
            const page = pageAt(drag.instanceId);
            if (!page || !MP)
                return true;
            if (e?.type === 'pointercancel') {
                rend.updateEl(page);
                return true;
            }
            const dx = drag.current.x - drag.start.x, dy = drag.current.y - drag.start.y, t = drag.source;
            // Avoid SVG redraw between the two clicks of a double-click.
            if (Math.hypot(dx, dy) <= .5)
                return true;
            try {
                if (Math.hypot(dx, dy) > .5) {
                    if (!drag.handle) {
                        await MP.updateHorizontalText(page, t.id, { x: t.x + dx, y: t.y + dy });
                    }
                    else {
                        let x = t.x, y = t.y, width = t.width, height = t.height;
                        if (drag.handle.includes('w')) {
                            x += dx;
                            width -= dx;
                        }
                        if (drag.handle.includes('e'))
                            width += dx;
                        if (drag.handle.includes('n')) {
                            y += dy;
                            height -= dy;
                        }
                        if (drag.handle.includes('s'))
                            height += dy;
                        if (width >= 16 && height >= 16)
                            await MP.updateHorizontalText(page, t.id, { x, y, width, height });
                    }
                }
            }
            catch (error) {
                D.toast('Horizontal text: ' + error.message, 'error');
            }
            rend.updateEl(page);
            return true;
        }
        /* ---------------- FASE C: drag target state ---------------- */
        let lastDragTarget = null;
        function clearDragTarget() {
            if (!lastDragTarget)
                return;
            if (lastDragTarget.type === 'panel') {
                lastDragTarget.el.classList.remove('drop-target');
            }
            else if (lastDragTarget.type === 'overlay') {
                lastDragTarget.el.classList.remove('overlay-target');
            }
            lastDragTarget = null;
        }
        function updateDragTarget(worldX, worldY) {
            if (!MP || !rend) {
                clearDragTarget();
                return;
            }
            const inst = MP.hitTestMangaPage(worldX, worldY);
            if (!inst) {
                clearDragTarget();
                return;
            }
            const instEl = rend.els.get(inst.id);
            if (!instEl) {
                clearDragTarget();
                return;
            }
            const panelId = MP.hitTestPanel(inst, worldX, worldY);
            if (panelId) {
                const panelEl = instEl.querySelector('.manga-panel[data-panel-id="' + panelId + '"]');
                if (!panelEl) {
                    clearDragTarget();
                    return;
                }
                if (lastDragTarget && lastDragTarget.type === 'panel' &&
                    lastDragTarget.el === panelEl)
                    return;
                clearDragTarget();
                panelEl.classList.add('drop-target');
                lastDragTarget = { type: 'panel', el: panelEl, instanceId: inst.id };
            }
            else {
                const overlayEl = instEl.querySelector('.manga-overlay');
                if (!overlayEl) {
                    clearDragTarget();
                    return;
                }
                if (lastDragTarget && lastDragTarget.type === 'overlay' &&
                    lastDragTarget.el === overlayEl)
                    return;
                clearDragTarget();
                overlayEl.classList.add('overlay-target');
                lastDragTarget = { type: 'overlay', el: overlayEl, instanceId: inst.id };
            }
        }
        function vp(evt) {
            const r = viewport.getBoundingClientRect();
            return { x: evt.clientX - r.left, y: evt.clientY - r.top };
        }
        function select(inst, additive) {
            if (additive) {
                if (S.data.selection.has(inst.id))
                    S.data.selection.delete(inst.id);
                else
                    S.data.selection.add(inst.id);
            }
            else if (!S.data.selection.has(inst.id)) {
                S.data.selection.clear();
                S.data.selection.add(inst.id);
            }
            kernel.emit('selection:changed');
        }
        /* ==========================================================
         * Normal drags
         * ========================================================== */
        function startMove(e) {
            const p = vp(e);
            lastPointer = p;
            const w = cam.screenToWorld(p.x, p.y);
            const items = [];
            S.data.selection.forEach(function (id) {
                const i = S.getInstance(id);
                if (i && !i.locked)
                    items.push({ id: id, ox: i.x - w.x, oy: i.y - w.y });
            });
            if (!items.length)
                return;
            drag = { type: 'move', items: items, before: H.snapshot(), moved: false, pointerId: e.pointerId };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            startAutoPan();
        }
        function startResize(e, inst, corner) {
            const p = vp(e);
            lastPointer = p;
            const startWorld = cam.screenToWorld(p.x, p.y);
            const r = { x: inst.x, y: inst.y, w: inst.width, h: inst.height };
            let anchor;
            if (corner === 'se')
                anchor = { x: r.x, y: r.y };
            else if (corner === 'nw')
                anchor = { x: r.x + r.w, y: r.y + r.h };
            else if (corner === 'ne')
                anchor = { x: r.x, y: r.y + r.h };
            else
                anchor = { x: r.x + r.w, y: r.y };
            drag = {
                type: 'resize', corner: corner, instId: inst.id, anchorWorld: anchor,
                startRect: r, aspect: (inst.width / inst.height) || 1,
                before: H.snapshot(), moved: false, pointerId: e.pointerId
            };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            startAutoPan();
        }
        function startPan(e) {
            const p = vp(e);
            lastPointer = p;
            drag = {
                type: 'pan', startScreen: p,
                startCam: { x: cam.data.x, y: cam.data.y },
                moved: false, pointerId: e.pointerId
            };
            viewport.classList.add('panning');
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
        }
        function startMarquee(e) {
            const p = vp(e);
            lastPointer = p;
            drag = {
                type: 'marquee', startScreen: p,
                additive: e.shiftKey || e.ctrlKey || e.metaKey,
                base: new Set(S.data.selection), pointerId: e.pointerId
            };
            marqueeEl.hidden = false;
            drawMarquee(p, p);
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
            startAutoPan();
        }
        function drawMarquee(a, b) {
            const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
            const w = Math.abs(a.x - b.x), h = Math.abs(a.y - b.y);
            marqueeEl.style.left = x + 'px';
            marqueeEl.style.top = y + 'px';
            marqueeEl.style.width = w + 'px';
            marqueeEl.style.height = h + 'px';
        }
        /* ==========================================================
         * Manga layer drags (edit mode)
         * ========================================================== */
        function worldToLocal(inst, ps, worldX, worldY) {
            const scale = inst.width / ps.width;
            return { x: (worldX - inst.x) / scale, y: (worldY - inst.y) / scale };
        }
        /* FASE E4: reconhece '__overlay__' */
        function getLayer(inst, panelId, layerId) {
            if (!inst)
                return null;
            if (panelId === '__overlay__') {
                const arr = inst.overlays || [];
                for (let j = 0; j < arr.length; j++) {
                    if (arr[j].id === layerId)
                        return arr[j];
                }
                return null;
            }
            if (!inst.panels)
                return null;
            for (let i = 0; i < inst.panels.length; i++) {
                if (inst.panels[i].id !== panelId)
                    continue;
                const arr = inst.panels[i].layers || [];
                for (let j = 0; j < arr.length; j++) {
                    if (arr[j].id === layerId)
                        return arr[j];
                }
            }
            return null;
        }
        function startLayerMove(e, inst, panelId, layerId) {
            const ps = MP && MP.getPanelSet(inst);
            if (!ps)
                return;
            const layer = getLayer(inst, panelId, layerId);
            if (!layer || MP?.getLayerNodeState(inst, 'image', layerId)?.locked)
                return;
            const p = vp(e);
            lastPointer = p;
            const w = cam.screenToWorld(p.x, p.y);
            const local = worldToLocal(inst, ps, w.x, w.y);
            drag = {
                type: 'manga-layer-move',
                instId: inst.id, panelId: panelId, layerId: layerId,
                startLocal: local,
                startLayer: { x: layer.x, y: layer.y },
                before: H.snapshot(), moved: false, pointerId: e.pointerId
            };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
        }
        function startLayerResize(e, inst, panelId, layerId, corner) {
            const ps = MP && MP.getPanelSet(inst);
            if (!ps)
                return;
            const layer = getLayer(inst, panelId, layerId);
            if (!layer || MP?.getLayerNodeState(inst, 'image', layerId)?.locked)
                return;
            const r = { x: layer.x, y: layer.y, w: layer.width, h: layer.height };
            let anchor;
            if (corner === 'se')
                anchor = { x: r.x, y: r.y };
            else if (corner === 'nw')
                anchor = { x: r.x + r.w, y: r.y + r.h };
            else if (corner === 'ne')
                anchor = { x: r.x, y: r.y + r.h };
            else
                anchor = { x: r.x + r.w, y: r.y };
            drag = {
                type: 'manga-layer-resize',
                instId: inst.id, panelId: panelId, layerId: layerId,
                corner: corner, anchorLocal: anchor,
                aspect: (layer.width / layer.height) || 1,
                before: H.snapshot(), moved: false, pointerId: e.pointerId
            };
            try {
                viewport.setPointerCapture(e.pointerId);
            }
            catch (er) { }
        }
        /* ==========================================================
         * pointerdown
         * ========================================================== */
        function onDown(e) {
            if (e.button === 2)
                return;
            const wantPan = e.button === 1 || spaceDown || e.altKey;
            if (wantPan) {
                startPan(e);
                return;
            }
            /* VP1-071: clicking a drawn effect activates its inspector/selection,
             * unless Ink/Eraser is consuming the page pointer. */
            const fxTarget = e.target.closest?.('[data-vp1-effect-id]');
            const fxOwner = fxTarget?.closest('.manga-page');
            const fxPage = fxOwner && pageAt(fxOwner.dataset.id || '');
            if (fxPage && MP && fxTarget && e.button === 0 && !MP.getMangaToolMode()) {
                const id = fxTarget.getAttribute('data-vp1-effect-id') || '';
                if (MP.listMangaEffects(fxPage).some(f => f.id === id)) {
                    const chosen = MP.getSelectedMangaEffect();
                    if (chosen?.instanceId !== fxPage.id || chosen.id !== id) {
                        e.preventDefault();
                        e.stopPropagation();
                        MP.selectMangaEffect(fxPage.id, id);
                        return;
                    }
                }
            }
            if (beginHorizontalGesture(e))
                return;
            if (beginBalloonGesture(e))
                return;
            if (beginMangaGesture(e))
                return;
            if (cropBegin(e))
                return;
            if (vertexBegin(e))
                return;
            if (knifeBegin(e))
                return;
            /* ---------- EDIT MODE ---------- */
            if (ME && ME.isActive()) {
                const mode = ME.getMode();
                const inst = ME.instanceById(mode.instanceId);
                if (!inst) {
                    ME.exit(true);
                    return;
                }
                const layerHandleEl = e.target.closest && e.target.closest('[data-mlayer-handle]');
                const layerEl = e.target.closest && e.target.closest('.manga-layer');
                const panelEl = e.target.closest && e.target.closest('.manga-panel');
                const overlayEl = e.target.closest && e.target.closest('.manga-overlay');
                const isOverlayMode = mode.panelId === '__overlay__';
                // --- Handles ---
                if (layerHandleEl && layerEl) {
                    const belongs = isOverlayMode
                        ? !!(overlayEl && layerEl.closest('.manga-overlay'))
                        : !!(panelEl && panelEl.dataset.panelId === mode.panelId);
                    if (belongs) {
                        startLayerResize(e, inst, mode.panelId, layerEl.dataset.layerId, layerHandleEl.dataset.mlayerHandle);
                        return;
                    }
                }
                // --- Overlay edit ---
                if (isOverlayMode) {
                    if (layerEl && overlayEl && layerEl.closest('.manga-overlay') === overlayEl) {
                        ME.setSelectedLayer(layerEl.dataset.layerId || null);
                        startLayerMove(e, inst, mode.panelId, layerEl.dataset.layerId);
                        return;
                    }
                    // Clique em qualquer lugar do overlay → desseleciona
                    ME.setSelectedLayer(null);
                    return;
                }
                // --- Panel edit ---
                if (layerEl && panelEl && panelEl.dataset.panelId === mode.panelId) {
                    ME.setSelectedLayer(layerEl.dataset.layerId || null);
                    startLayerMove(e, inst, mode.panelId, layerEl.dataset.layerId);
                    return;
                }
                if (panelEl) {
                    ME.setSelectedLayer(null);
                    return;
                }
                ME.setSelectedLayer(null);
                return;
            }
            /* ---------- FIM EDIT MODE ---------- */
            const target = e.target;
            const handleEl = target.closest && target.closest('.handle');
            const iconEl = target.closest && target.closest('.board-card-icon');
            const mangaPageEl = target.closest && target.closest('.manga-page');
            const instEl = target.closest && target.closest('.instance');
            if (iconEl)
                return;
            if (mangaPageEl && !handleEl) {
                const pageInst = S.getInstance(mangaPageEl.dataset.id);
                if (pageInst && pageInst.type === 'manga-page') {
                    select(pageInst, e.shiftKey || e.ctrlKey || e.metaKey);
                    if (MP) {
                        MP.selectBalloon(null);
                        MP.selectHorizontalText(null);
                        MP.selectMangaEffect(null);
                        let panelId = null;
                        const panelEl = e.target.closest && e.target.closest('.manga-panel');
                        if (panelEl && panelEl.dataset && panelEl.dataset.panelId) {
                            panelId = panelEl.dataset.panelId;
                        }
                        else {
                            const ps = MP.getPanelSet(pageInst);
                            panelId = ps && ps.panels && ps.panels[0] ? ps.panels[0].id : null;
                        }
                        if (panelId) {
                            const curFocus = MP.getFocus();
                            if (!curFocus || curFocus.instanceId !== pageInst.id ||
                                curFocus.panelId !== panelId) {
                                MP.setFocus(pageInst.id, panelId);
                            }
                        }
                    }
                    if (!pageInst.locked)
                        startMove(e);
                    return;
                }
            }
            if (instEl) {
                const inst = S.getInstance(instEl.dataset.id);
                if (!inst)
                    return;
                if (inst.type === 'board') {
                    if (handleEl && !inst.locked) {
                        startResize(e, inst, handleEl.dataset.handle);
                        return;
                    }
                    const add = e.shiftKey || e.ctrlKey || e.metaKey;
                    select(inst, add);
                    if (!inst.locked)
                        startMove(e);
                    return;
                }
                e.preventDefault();
                if (handleEl && !inst.locked && S.data.selection.size === 1) {
                    startResize(e, inst, handleEl.dataset.handle);
                    return;
                }
                const add = e.shiftKey || e.ctrlKey || e.metaKey;
                select(inst, add);
                if (!inst.locked)
                    startMove(e);
                return;
            }
            e.preventDefault();
            if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
                S.data.selection.clear();
                kernel.emit('selection:changed');
            }
            if (MP)
                MP.clearFocus();
            startMarquee(e);
        }
        /* ==========================================================
         * pointermove
         * ========================================================== */
        function onMove(e) {
            const p = vp(e);
            lastPointer = p;
            if (moveHorizontalGesture(e))
                return;
            if (moveBalloonGesture(e))
                return;
            if (moveMangaGesture(e))
                return;
            if (cropDrag) {
                cropUpdate(e);
                return;
            }
            if (vertexDrag) {
                if (vertexDrag.pointerId === e.pointerId && MP) {
                    const page = pageAt(vertexDrag.instanceId);
                    const local = page && knifeLocal(page, cam.screenToWorld(p.x, p.y));
                    if (page && local) {
                        vertexDrag.point = local;
                        vertexDrag.draft = MP.previewVertex(page, vertexDrag.panelId, vertexDrag.index, local);
                        drawVertexHandles();
                    }
                }
                return;
            }
            if (knifeDrag) {
                if (e.pointerId === knifeDrag.pointerId) {
                    const page = pageAt(knifeDrag.instanceId);
                    const local = page && knifeLocal(page, cam.screenToWorld(p.x, p.y));
                    if (local) {
                        knifeDrag.end = local;
                        paintKnifePreview();
                    }
                }
                return;
            }
            if (!drag)
                return;
            if (drag.type === 'pan') {
                const dx = p.x - drag.startScreen.x;
                const dy = p.y - drag.startScreen.y;
                if (Math.abs(dx) > 1 || Math.abs(dy) > 1)
                    drag.moved = true;
                cam.data.x = drag.startCam.x - dx / cam.data.zoom;
                cam.data.y = drag.startCam.y - dy / cam.data.zoom;
                cam.apply();
                return;
            }
            if (drag.type === 'move') {
                const w = cam.screenToWorld(p.x, p.y);
                for (const it of drag.items) {
                    const i = S.getInstance(it.id);
                    if (!i)
                        continue;
                    i.x = w.x + it.ox;
                    i.y = w.y + it.oy;
                    rend.updateEl(i);
                }
                drag.moved = true;
                return;
            }
            if (drag.type === 'resize') {
                const w = cam.screenToWorld(p.x, p.y);
                const i = S.getInstance(drag.instId);
                if (!i)
                    return;
                const a = drag.anchorWorld;
                const dx = w.x - a.x, dy = w.y - a.y;
                const c = drag.corner;
                let absW, absH;
                if (c === 'se') {
                    absW = Math.max(24, dx);
                    absH = Math.max(24, dy);
                }
                else if (c === 'nw') {
                    absW = Math.max(24, -dx);
                    absH = Math.max(24, -dy);
                }
                else if (c === 'ne') {
                    absW = Math.max(24, dx);
                    absH = Math.max(24, -dy);
                }
                else {
                    absW = Math.max(24, -dx);
                    absH = Math.max(24, dy);
                }
                const aspect = drag.aspect;
                let nw, nh;
                if (absW / aspect > absH) {
                    nw = absW;
                    nh = nw / aspect;
                }
                else {
                    nh = absH;
                    nw = nh * aspect;
                }
                if (c === 'se') {
                    i.x = a.x;
                    i.y = a.y;
                }
                else if (c === 'nw') {
                    i.x = a.x - nw;
                    i.y = a.y - nh;
                }
                else if (c === 'ne') {
                    i.x = a.x;
                    i.y = a.y - nh;
                }
                else {
                    i.x = a.x - nw;
                    i.y = a.y;
                }
                i.width = Math.round(nw);
                i.height = Math.round(nh);
                drag.moved = true;
                rend.updateEl(i);
                return;
            }
            if (drag.type === 'marquee') {
                const a = drag.startScreen, b = p;
                drawMarquee(a, b);
                const rect = {
                    x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
                    w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y)
                };
                const tl = cam.screenToWorld(rect.x, rect.y);
                const br = cam.screenToWorld(rect.x + rect.w, rect.y + rect.h);
                S.data.selection.clear();
                drag.base.forEach(function (id) { S.data.selection.add(id); });
                for (const i of S.currentInstances()) {
                    if (i.x < br.x && i.x + i.width > tl.x && i.y < br.y && i.y + i.height > tl.y) {
                        S.data.selection.add(i.id);
                    }
                }
                kernel.emit('selection:changed');
                return;
            }
            if (drag.type === 'manga-layer-move') {
                const inst = S.getInstance(drag.instId);
                if (!inst || inst.type !== 'manga-page')
                    return;
                const ps = MP && MP.getPanelSet(inst);
                if (!ps)
                    return;
                const layer = getLayer(inst, drag.panelId, drag.layerId);
                if (!layer)
                    return;
                const w = cam.screenToWorld(p.x, p.y);
                const local = worldToLocal(inst, ps, w.x, w.y);
                layer.x = Math.round(drag.startLayer.x + (local.x - drag.startLocal.x));
                layer.y = Math.round(drag.startLayer.y + (local.y - drag.startLocal.y));
                drag.moved = true;
                rend.updateEl(inst);
                return;
            }
            if (drag.type === 'manga-layer-resize') {
                const inst = S.getInstance(drag.instId);
                if (!inst || inst.type !== 'manga-page')
                    return;
                const ps = MP && MP.getPanelSet(inst);
                if (!ps)
                    return;
                const layer = getLayer(inst, drag.panelId, drag.layerId);
                if (!layer)
                    return;
                const w = cam.screenToWorld(p.x, p.y);
                const local = worldToLocal(inst, ps, w.x, w.y);
                const a = drag.anchorLocal;
                const c = drag.corner;
                const dx = local.x - a.x, dy = local.y - a.y;
                let absW, absH;
                if (c === 'se') {
                    absW = Math.max(10, dx);
                    absH = Math.max(10, dy);
                }
                else if (c === 'nw') {
                    absW = Math.max(10, -dx);
                    absH = Math.max(10, -dy);
                }
                else if (c === 'ne') {
                    absW = Math.max(10, dx);
                    absH = Math.max(10, -dy);
                }
                else {
                    absW = Math.max(10, -dx);
                    absH = Math.max(10, dy);
                }
                if (e.shiftKey && drag.aspect) {
                    const asp = drag.aspect;
                    let nw, nh;
                    if (absW / asp > absH) {
                        nw = absW;
                        nh = nw / asp;
                    }
                    else {
                        nh = absH;
                        nw = nh * asp;
                    }
                    absW = nw;
                    absH = nh;
                }
                let nx, ny;
                if (c === 'se') {
                    nx = a.x;
                    ny = a.y;
                }
                else if (c === 'nw') {
                    nx = a.x - absW;
                    ny = a.y - absH;
                }
                else if (c === 'ne') {
                    nx = a.x;
                    ny = a.y - absH;
                }
                else {
                    nx = a.x - absW;
                    ny = a.y;
                }
                layer.x = Math.round(nx);
                layer.y = Math.round(ny);
                layer.width = Math.round(absW);
                layer.height = Math.round(absH);
                drag.moved = true;
                rend.updateEl(inst);
                return;
            }
        }
        /* ==========================================================
         * pointerup
         * ========================================================== */
        function onUp(e) {
            if (horizontalDrag) {
                void endHorizontalGesture(e);
                return;
            }
            if (balloonDrag) {
                void endBalloonGesture(e);
                return;
            }
            if (mangaStroke || fxMove) {
                void finishMangaGesture(e);
                return;
            }
            if (cropDrag) {
                void cropFinish(e);
                return;
            }
            if (vertexDrag) {
                void vertexFinish(e);
                return;
            }
            if (knifeDrag) {
                void knifeFinish(e);
                return;
            }
            if (!drag)
                return;
            const d = drag;
            drag = null;
            stopAutoPan();
            viewport.classList.remove('panning');
            marqueeEl.hidden = true;
            try {
                viewport.releasePointerCapture(d.pointerId);
            }
            catch (e) { }
            const isMangaLayerDrag = d.type === 'manga-layer-move' || d.type === 'manga-layer-resize';
            if (d.type === 'move' || d.type === 'resize' || isMangaLayerDrag) {
                if (e?.type === 'pointercancel' && d.before) {
                    void H.cancelGesture(d.before);
                    return;
                }
                if (d.moved && d.before)
                    H.push(d.before);
                if (d.moved) {
                    kernel.emit('state:changed');
                    if (isMangaLayerDrag) {
                        kernel.emit('manga-page:changed', { instanceId: d.instId });
                    }
                }
            }
            else if (d.type === 'pan') {
                if (d.moved)
                    kernel.emit('camera:changed');
            }
        }
        /* ---------------- Auto-pan ---------------- */
        function startAutoPan() { if (autoPanRAF)
            return; autoPanRAF = requestAnimationFrame(autopan); }
        function stopAutoPan() { if (autoPanRAF) {
            cancelAnimationFrame(autoPanRAF);
            autoPanRAF = null;
        } }
        function autopan() {
            autoPanRAF = null;
            if (!drag)
                return;
            const vw = viewport.clientWidth, vh = viewport.clientHeight;
            const p = lastPointer;
            let vx = 0, vy = 0;
            if (p.x < EDGE)
                vx = -((EDGE - p.x) / EDGE) * MAX_AUTOPAN;
            else if (p.x > vw - EDGE)
                vx = ((p.x - (vw - EDGE)) / EDGE) * MAX_AUTOPAN;
            if (p.y < EDGE)
                vy = -((EDGE - p.y) / EDGE) * MAX_AUTOPAN;
            else if (p.y > vh - EDGE)
                vy = ((p.y - (vh - EDGE)) / EDGE) * MAX_AUTOPAN;
            if (vx || vy) {
                cam.data.x += vx / cam.data.zoom;
                cam.data.y += vy / cam.data.zoom;
                cam.apply();
                if (drag.type === 'move' && drag.items.length) {
                    const w = cam.screenToWorld(p.x, p.y);
                    for (const it of drag.items) {
                        const i = S.getInstance(it.id);
                        if (i) {
                            i.x = w.x + it.ox;
                            i.y = w.y + it.oy;
                            rend.updateEl(i);
                        }
                    }
                }
            }
            autoPanRAF = requestAnimationFrame(autopan);
        }
        /* ---------------- Wheel ---------------- */
        function onWheel(e) {
            e.preventDefault();
            const p = vp(e);
            const factor = Math.exp(-e.deltaY * 0.0016);
            cam.zoomAt(p.x, p.y, cam.data.zoom * factor);
        }
        /* ---------------- Double-click ---------------- */
        async function onDblClick(e) {
            const horizontal = e.target.closest?.('[data-vp1-text-id]');
            const owner = horizontal?.closest('.manga-page');
            const textPage = owner && pageAt(owner.dataset.id || '');
            if (horizontal && textPage) {
                e.preventDefault();
                e.stopPropagation();
                editHorizontalText(textPage, horizontal.dataset.vp1TextId || '');
                return;
            }
            const balloon = e.target.closest?.('[data-vp1-balloon-id]');
            const page = balloon?.closest('.manga-page');
            if (balloon && page && MP) {
                e.preventDefault();
                e.stopPropagation();
                const id = balloon.dataset.vp1BalloonId;
                MP.selectBalloon(page.dataset.id, id);
                const editor = Array.from(document.querySelectorAll('[data-vp1-balloon-text]')).find(t => t.dataset.vp1BalloonText === id);
                editor?.focus();
                return;
            }
            if (MP?.getVertexMode())
                return;
            const panelEl = e.target.closest && e.target.closest('.manga-panel');
            if (panelEl && ME) {
                const pageEl = panelEl.closest('.manga-page');
                if (pageEl) {
                    e.preventDefault();
                    e.stopPropagation();
                    ME.enter(pageEl.dataset.id, panelEl.dataset.panelId);
                    return;
                }
            }
            const nameEl = e.target.closest && e.target.closest('.board-card-name');
            if (nameEl) {
                e.preventDefault();
                e.stopPropagation();
                const cardEl = nameEl.closest('.board-card');
                const inst = cardEl ? S.getInstance(cardEl.dataset.id) : null;
                if (!inst || inst.type !== 'board' || !inst.boardId)
                    return;
                const board = B.getBoard(inst.boardId);
                if (!board)
                    return;
                const newName = await D.prompt({
                    title: 'Rename board',
                    message: 'Choose a new name for this board.',
                    input: board.name,
                    confirmText: 'Rename'
                });
                if (newName && newName !== board.name) {
                    B.rename(board.id, newName);
                    kernel.emit('state:changed');
                }
            }
        }
        /* ---------------- Keyboard ---------------- */
        function isTyping(el) {
            if (!el)
                return false;
            const target = el;
            const t = target.tagName;
            return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' ||
                t === 'BUTTON' || t === 'A' || target.isContentEditable ||
                Boolean(target.closest?.('[role="menuitem"], [role="button"]:not(.instance)'));
        }
        async function onKey(e) {
            const dialog = document.getElementById('dialog');
            const preview = document.getElementById('preview');
            if (dialog && !dialog.hidden)
                return;
            if (preview && !preview.hidden) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    kernel.emit('ui:preview-close');
                }
                return;
            }
            if (isTyping(e.target) && !(MP?.getBalloonDrawMode() && (e.key === 'Enter' || e.key === 'Escape')))
                return;
            if (horizontalDrag && e.key === 'Escape') {
                e.preventDefault();
                const page = pageAt(horizontalDrag.instanceId);
                horizontalDrag = null;
                if (page)
                    rend.updateEl(page);
                return;
            }
            const horizontalSelected = MP?.getSelectedHorizontalText();
            if (horizontalSelected && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const pg = pageAt(horizontalSelected.instanceId);
                if (pg && !pg.locked) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        MP.selectHorizontalText(null);
                        return;
                    }
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        editHorizontalText(pg, horizontalSelected.id);
                        return;
                    }
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        try {
                            await MP.removeHorizontalText(pg, horizontalSelected.id);
                        }
                        catch (error) {
                            D.toast('Text: ' + error.message, 'error');
                        }
                        return;
                    }
                    const step = e.shiftKey ? 10 : 1;
                    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                    if (dx || dy) {
                        e.preventDefault();
                        const item = MP.listHorizontalTexts(pg).find(t => t.id === horizontalSelected.id);
                        if (item)
                            await MP.updateHorizontalText(pg, item.id, {
                                x: item.x + dx, y: item.y + dy
                            });
                        return;
                    }
                }
            }
            if (balloonDrag && e.key === 'Escape') {
                e.preventDefault();
                const page = pageAt(balloonDrag.instanceId);
                balloonDrag = null;
                if (page)
                    rend.updateEl(page);
                return;
            }
            if (MP?.getBalloonDrawMode()) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    MP.setBalloonDrawMode(null);
                    paintBalloonSketch();
                    return;
                }
                if (e.key === 'Enter') {
                    e.preventDefault();
                    try {
                        await MP.completeBalloonDraw();
                    }
                    catch (error) {
                        D.toast('Custom balloon: ' + error.message, 'error');
                    }
                    paintBalloonSketch();
                    return;
                }
                return;
            }
            const balloonSelection = MP?.getSelectedBalloon();
            if (balloonSelection && !e.ctrlKey && !e.metaKey && !e.altKey) {
                const page = pageAt(balloonSelection.instanceId);
                if (page && !page.locked) {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        MP.selectBalloon(null);
                        return;
                    }
                    if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        try {
                            await MP.removeBalloon(page, balloonSelection.id);
                        }
                        catch (error) {
                            D.toast(error.message, 'error');
                        }
                        return;
                    }
                    const step = e.shiftKey ? 10 : 1;
                    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                    if (dx || dy) {
                        e.preventDefault();
                        const balloon = MP.listBalloons(page).find(x => x.id === balloonSelection.id);
                        if (balloon)
                            await MP.updateBalloon(page, balloon.id, {
                                x: balloon.x + dx, y: balloon.y + dy
                            });
                        return;
                    }
                }
            }
            if ((mangaStroke || fxMove) && e.key === 'Escape') {
                e.preventDefault();
                const active = mangaStroke, move = fxMove;
                mangaStroke = null;
                fxMove = null;
                balloonDrag = null;
                horizontalDrag = null;
                endHorizontalEditor(false);
                clearMangaPreview();
                paintBalloonSketch();
                if (move) {
                    const p = pageAt(move.instanceId);
                    if (p)
                        rend.updateEl(p);
                }
                try {
                    if (active)
                        viewport.releasePointerCapture(active.pointerId);
                    if (move)
                        viewport.releasePointerCapture(move.pointerId);
                }
                catch (_) { }
                return;
            }
            if (MP?.getMangaToolMode() && e.key === 'Escape') {
                e.preventDefault();
                MP.setMangaToolMode(null);
                return;
            }
            if (MP?.getSelectedMangaEffect() && e.key === 'Escape') {
                e.preventDefault();
                MP.selectMangaEffect(null);
                return;
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
                (e.key === 't' || e.key === 'T') && MP) {
                const focus = MP.getFocus();
                const pg = focus.instanceId && pageAt(focus.instanceId);
                if (pg && !pg.locked) {
                    e.preventDefault();
                    try {
                        const item = await MP.addHorizontalText(pg);
                        MP.selectHorizontalText(pg.id, item.id);
                        editHorizontalText(pg, item.id);
                    }
                    catch (error) {
                        D.toast('Add text: ' + error.message, 'error');
                    }
                    return;
                }
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey &&
                (e.key === 'i' || e.key === 'I' || e.key === 'e' || e.key === 'E') && MP) {
                const focus = MP.getFocus();
                if (focus.instanceId && focus.panelId && focus.panelId !== '__overlay__') {
                    const tool = e.key.toLowerCase() === 'i' ? 'ink' : 'eraser';
                    const current = MP.getMangaToolMode();
                    e.preventDefault();
                    MP.setMangaToolMode(current?.tool === tool ? null : focus.instanceId, current?.tool === tool ? null : focus.panelId, tool);
                    return;
                }
            }
            if (MP?.getCropMode() && e.key === 'Escape') {
                e.preventDefault();
                cropDrag = null;
                MP.setCropMode(null);
                return;
            }
            if (MP?.getVertexMode()) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    vertexDrag = null;
                    MP.setVertexMode(null);
                    drawVertexHandles();
                    return;
                }
                if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'v' || e.key === 'V')) {
                    e.preventDefault();
                    MP.setVertexMode(null);
                    drawVertexHandles();
                    return;
                }
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'v' || e.key === 'V') && MP) {
                const focused = MP.getFocus();
                if (focused.instanceId && focused.panelId && focused.panelId !== '__overlay__') {
                    e.preventDefault();
                    MP.setVertexMode(focused.instanceId, focused.panelId);
                    drawVertexHandles();
                    return;
                }
            }
            if (MP?.getKnifeMode()) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    knifeDrag = null;
                    clearKnifePreview();
                    MP.setKnifeMode(null);
                    return;
                }
                if (e.key === 'Enter')
                    return;
            }
            if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'k' || e.key === 'K') && MP) {
                const focus = MP.getFocus();
                if (focus.instanceId && focus.panelId && focus.panelId !== '__overlay__') {
                    e.preventDefault();
                    const mode = MP.getKnifeMode();
                    MP.setKnifeMode(mode ? null : focus.instanceId, mode ? null : focus.panelId);
                    return;
                }
            }
            const ctrl = e.ctrlKey || e.metaKey;
            if (ME && ME.isActive()) {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    ME.exit();
                    return;
                }
                if (e.key === 'Delete' || e.key === 'Backspace') {
                    e.preventDefault();
                    const mode = ME.getMode();
                    const inst = ME.instanceById(mode.instanceId);
                    const layerId = ME.getSelectedLayerId();
                    if (inst && inst.type === 'manga-page' && layerId && MP) {
                        await MP.removeLayer(inst, mode.panelId, layerId);
                        ME.setSelectedLayer(null);
                    }
                    return;
                }
                const sel = ME.getSelectedLayerId();
                if (sel) {
                    const mode = ME.getMode();
                    const inst = ME.instanceById(mode.instanceId);
                    if (inst && inst.type === 'manga-page') {
                        const step = e.shiftKey ? 10 : 1;
                        let dx = 0, dy = 0;
                        if (e.key === 'ArrowLeft')
                            dx = -step;
                        else if (e.key === 'ArrowRight')
                            dx = step;
                        else if (e.key === 'ArrowUp')
                            dy = -step;
                        else if (e.key === 'ArrowDown')
                            dy = step;
                        if (dx || dy) {
                            e.preventDefault();
                            const layer = getLayer(inst, mode.panelId, sel);
                            if (layer) {
                                const before = await kernel.call('history', 'snapshot');
                                layer.x += dx;
                                layer.y += dy;
                                await kernel.call('history', 'push', before);
                                rend.updateEl(inst);
                                kernel.emit('manga-page:changed', { instanceId: inst.id });
                                kernel.emit('state:changed');
                            }
                            return;
                        }
                    }
                }
                if (ctrl)
                    return;
                return;
            }
            if (e.code === 'Space' && !ctrl) {
                if (!spaceDown) {
                    spaceDown = true;
                    viewport.classList.add('pan-mode');
                }
                e.preventDefault();
                return;
            }
            if (ctrl && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                kernel.emit('history:undo');
                return;
            }
            if (ctrl && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                e.preventDefault();
                kernel.emit('history:redo');
                return;
            }
            if (ctrl && (e.key === 'y' || e.key === 'Y')) {
                e.preventDefault();
                kernel.emit('history:redo');
                return;
            }
            if (ctrl && (e.key === 'c' || e.key === 'C')) {
                e.preventDefault();
                instApi.copySelection();
                return;
            }
            if (ctrl && (e.key === 'v' || e.key === 'V')) {
                e.preventDefault();
                instApi.pasteClipboard();
                return;
            }
            if (ctrl && (e.key === 'd' || e.key === 'D')) {
                e.preventDefault();
                instApi.duplicateSelection();
                return;
            }
            if (ctrl && (e.key === 'a' || e.key === 'A')) {
                e.preventDefault();
                S.data.selection.clear();
                S.currentInstances().forEach(function (i) { S.data.selection.add(i.id); });
                kernel.emit('selection:changed');
                return;
            }
            if (ctrl && e.key === '[') {
                e.preventDefault();
                B.navigateUp();
                return;
            }
            if (ctrl)
                return;
            if (e.key === 'Delete') {
                e.preventDefault();
                instApi.removeSelection();
                return;
            }
            if (e.key === 'Backspace') {
                e.preventDefault();
                if (S.data.selection.size)
                    instApi.removeSelection();
                else if (B.current()?.parentBoardId)
                    B.navigateUp();
                return;
            }
            if (e.key === 'Escape') {
                if (S.data.selection.size) {
                    S.data.selection.clear();
                    kernel.emit('selection:changed');
                    return;
                }
                if (MP)
                    MP.clearFocus();
                const cur = B.current();
                if (cur && cur.parentBoardId) {
                    e.preventDefault();
                    B.navigateUp();
                }
                return;
            }
            if (e.key === 'f' || e.key === 'F') {
                e.preventDefault();
                if (e.shiftKey)
                    cam.fitSelection();
                else
                    cam.fitAll();
                return;
            }
            if (e.key === '0') {
                e.preventDefault();
                cam.reset();
                return;
            }
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                cam.zoomByFactor(1.2);
                return;
            }
            if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                cam.zoomByFactor(1 / 1.2);
                return;
            }
            const step = e.shiftKey ? 10 : 1;
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                instApi.nudge(-step, 0);
                return;
            }
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                instApi.nudge(step, 0);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                instApi.nudge(0, -step);
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                instApi.nudge(0, step);
                return;
            }
        }
        function onKeyUp(e) {
            if (e.code === 'Space') {
                spaceDown = false;
                viewport.classList.remove('pan-mode');
            }
        }
        /* ---------------- Drag & drop ---------------- */
        viewport.addEventListener('dragover', function (e) {
            if (e.dataTransfer && e.dataTransfer.types) {
                const t = Array.from(e.dataTransfer.types);
                if (t.indexOf('application/x-nvb-asset') !== -1 || t.indexOf('Files') !== -1) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    viewport.classList.add('drop-active');
                    if (t.indexOf('application/x-nvb-asset') !== -1 && MP) {
                        const p = vp(e);
                        const w = cam.screenToWorld(p.x, p.y);
                        updateDragTarget(w.x, w.y);
                    }
                }
            }
        });
        viewport.addEventListener('dragleave', function (e) {
            if (e.target === viewport) {
                viewport.classList.remove('drop-active');
                clearDragTarget();
            }
        });
        viewport.addEventListener('drop', async function (e) {
            viewport.classList.remove('drop-active');
            clearDragTarget();
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
                e.preventDefault();
                const A = await kernel.require('assets');
                await A.importFiles(e.dataTransfer.files, A.ensureDefaultPackage());
                return;
            }
            const assetId = e.dataTransfer?.getData('application/x-nvb-asset');
            if (!assetId)
                return;
            e.preventDefault();
            const p = vp(e);
            const w = cam.screenToWorld(p.x, p.y);
            if (MP) {
                try {
                    const handled = await MP.tryDrop(assetId, w.x, w.y);
                    if (handled)
                        return;
                }
                catch (err) {
                    kernel.log.warn('manga tryDrop failed', err);
                }
            }
            instApi.addImage(assetId, w.x, w.y);
        });
        /* ---------------- Wiring ---------------- */
        viewport.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        viewport.addEventListener('wheel', onWheel, { passive: false });
        viewport.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        viewport.addEventListener('dblclick', onDblClick);
        window.addEventListener('keydown', onKey);
        window.addEventListener('keyup', onKeyUp);
        kernel.on('state:changed', () => {
            viewport.classList.toggle('vp1-knife-active', !!MP?.getKnifeMode());
            viewport.classList.toggle('vp1-vertex-active', !!MP?.getVertexMode());
            if (!vertexDrag)
                drawVertexHandles();
            if (!MP?.getKnifeMode()) {
                knifeDrag = null;
                clearKnifePreview();
            }
            if (MP?.getBalloonDrawMode())
                paintBalloonSketch();
            else
                balloonSketch.replaceChildren();
        });
        kernel.on('history:applied', () => { endHorizontalEditor(false); horizontalDrag = null; });
        kernel.on('camera:changed', () => {
            if (knifeDrag)
                paintKnifePreview();
            drawVertexHandles();
            if (mangaStroke)
                paintMangaPreview();
            paintBalloonSketch();
        });
        kernel.on('board:navigated', () => {
            endHorizontalEditor(false);
            horizontalDrag = null;
            knifeDrag = null;
            vertexDrag = null;
            mangaStroke = null;
            fxMove = null;
            clearMangaPreview();
            clearKnifePreview();
            drawVertexHandles();
        });
        window.addEventListener('paste', e => { void onImagePaste(e); });
        kernel.provide('interaction', {});
    }
});
