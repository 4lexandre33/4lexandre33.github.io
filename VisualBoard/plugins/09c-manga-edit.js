"use strict";
/* =====================================================================
 * plugins/09c-manga-edit.js
 * ---------------------------------------------------------------------
 * Estado e lógica do "Panel Edit Mode".
 *
 * FASE E4 (Overlay edit):
 *   - `enter(id, '__overlay__')` é aceito.
 *   - Overlay usa o bounding box da página inteira.
 *   - `hitTestLayer` e `updateBanner` reconhecem o overlay.
 * ===================================================================== */
definePlugin({
    id: 'manga-edit',
    version: '1.1.0',
    needs: ['utils', 'state', 'camera', 'mangaPage', 'panelSets'],
    provides: ['mangaEdit'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'camera': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0' },
    contractVersions: { 'mangaEdit': '1.0.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const cam = await kernel.require('camera');
        const MP = await kernel.require('mangaPage');
        /* ---------------- Estado ---------------- */
        let mode = null;
        /* ---------------- Banner ---------------- */
        let banner = null;
        function ensureBanner() {
            if (banner)
                return banner;
            const center = document.getElementById('center');
            if (!center)
                return null;
            banner = document.createElement('div');
            banner.id = 'edit-mode-banner';
            banner.hidden = true;
            banner.innerHTML =
                '<span class="edit-badge">✎ Panel edit</span>' +
                    '<span class="edit-panel-name">—</span>' +
                    '<span class="edit-hint">Drag layers · Shift+resize keeps aspect · Esc to exit</span>' +
                    '<button class="edit-exit" type="button" title="Exit (Esc)">Exit</button>';
            center.appendChild(banner);
            banner.querySelector('.edit-exit').addEventListener('click', function () {
                exit();
            });
            return banner;
        }
        function updateBanner() {
            if (!banner)
                return;
            if (!mode) {
                banner.hidden = true;
                return;
            }
            const inst = instanceById(mode.instanceId);
            const ps = inst && inst.type === 'manga-page' ? MP.getPanelSet(inst) : null;
            let panelLabel = mode.panelId;
            if (mode.panelId === '__overlay__') {
                panelLabel = 'Overlay';
            }
            else if (ps) {
                const idx = ps.panels.findIndex(function (p) { return p.id === mode.panelId; });
                if (idx >= 0)
                    panelLabel = 'Panel ' + (idx + 1);
            }
            banner.querySelector('.edit-panel-name').textContent =
                (ps ? ps.name + ' · ' : '') + panelLabel;
            banner.hidden = false;
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
        function getPanelBounds(inst, panelOrId) {
            const ps = MP.getPanelSet(inst);
            if (!ps)
                return null;
            // Overlay = bounding box da página inteira
            if (panelOrId === '__overlay__') {
                return {
                    minX: inst.x,
                    minY: inst.y,
                    maxX: inst.x + inst.width,
                    maxY: inst.y + inst.height
                };
            }
            const panel = panelOrId;
            if (!panel || !panel.points)
                return null;
            const scale = inst.width / ps.width;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (let i = 0; i < panel.points.length; i++) {
                const pt = panel.points[i];
                const wx = inst.x + pt.x * scale;
                const wy = inst.y + pt.y * scale;
                if (wx < minX)
                    minX = wx;
                if (wy < minY)
                    minY = wy;
                if (wx > maxX)
                    maxX = wx;
                if (wy > maxY)
                    maxY = wy;
            }
            if (!isFinite(minX))
                return null;
            return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
        }
        function hitTestLayer(inst, panelId, localX, localY) {
            if (!inst)
                return null;
            let layers;
            if (panelId === '__overlay__') {
                layers = inst.overlays || [];
            }
            else {
                if (!inst.panels)
                    return null;
                const instPanel = inst.panels.find(function (p) { return p.id === panelId; });
                layers = instPanel ? (instPanel.layers || []) : [];
            }
            if (!layers.length)
                return null;
            const sorted = layers.slice().sort(function (a, b) {
                return (b.zIndex || 0) - (a.zIndex || 0);
            });
            for (let i = 0; i < sorted.length; i++) {
                const layer = sorted[i];
                const x0 = Math.min(layer.x, layer.x + layer.width);
                const y0 = Math.min(layer.y, layer.y + layer.height);
                const x1 = Math.max(layer.x, layer.x + layer.width);
                const y1 = Math.max(layer.y, layer.y + layer.height);
                const ps = MP.getPanelSet(inst);
                if (!ps)
                    continue;
                const limits = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1ViewLimits || {}) };
                if (localX < ps.width * limits.left || localX > ps.width * (1 - limits.right) ||
                    localY < ps.height * limits.top || localY > ps.height * (1 - limits.bottom))
                    continue;
                const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
                const a = -(layer.rotation || 0) * Math.PI / 180, dx = localX - cx, dy = localY - cy;
                const lx = cx + dx * Math.cos(a) - dy * Math.sin(a), ly = cy + dx * Math.sin(a) + dy * Math.cos(a);
                const crop = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1Crop || {}) };
                if (lx >= x0 + layer.width * crop.left && lx <= x1 - layer.width * crop.right &&
                    ly >= y0 + layer.height * crop.top && ly <= y1 - layer.height * crop.bottom)
                    return layer;
            }
            return null;
        }
        /* ---------------- Enter / Exit ---------------- */
        function isActive() { return !!mode; }
        function isEditingPanel(instId, panelId) {
            return !!mode && mode.instanceId === instId && mode.panelId === panelId;
        }
        function getMode() {
            if (!mode)
                return null;
            return {
                instanceId: mode.instanceId,
                panelId: mode.panelId,
                selectedLayerId: mode.selectedLayerId
            };
        }
        function getSelectedLayerId() {
            return mode ? mode.selectedLayerId : null;
        }
        function enter(instanceId, panelId) {
            const inst = instanceById(instanceId);
            if (!inst || inst.type !== 'manga-page')
                return false;
            const ps = MP.getPanelSet(inst);
            if (!ps)
                return false;
            const isOverlay = panelId === '__overlay__';
            if (!isOverlay) {
                const exists = ps.panels.some(function (p) { return p.id === panelId; });
                if (!exists)
                    return false;
            }
            if (mode)
                exit(true);
            mode = {
                instanceId: instanceId,
                panelId: panelId,
                selectedLayerId: null,
                savedCamera: { x: cam.data.x, y: cam.data.y, zoom: cam.data.zoom }
            };
            // Foca a câmera no alvo
            let bbox = null;
            if (isOverlay) {
                bbox = getPanelBounds(inst, '__overlay__');
            }
            else {
                const panel = ps.panels.find(function (p) { return p.id === panelId; });
                if (panel)
                    bbox = getPanelBounds(inst, panel);
            }
            if (bbox)
                cam.fitBounds(bbox, 90);
            MP.setFocus(instanceId, panelId);
            document.body.classList.add('manga-edit-active');
            ensureBanner();
            updateBanner();
            kernel.emit('manga-edit:enter', { instanceId: instanceId, panelId: panelId });
            kernel.emit('state:changed');
            return true;
        }
        function exit(silent) {
            if (!mode)
                return;
            const saved = mode.savedCamera;
            const instanceId = mode.instanceId;
            mode = null;
            if (saved && !silent) {
                cam.data.x = saved.x;
                cam.data.y = saved.y;
                cam.data.zoom = saved.zoom;
                cam.apply();
            }
            document.body.classList.remove('manga-edit-active');
            if (banner)
                banner.hidden = true;
            kernel.emit('manga-edit:exit', { instanceId: instanceId });
            kernel.emit('state:changed');
        }
        function setSelectedLayer(layerId) {
            if (!mode)
                return;
            mode.selectedLayerId = layerId || null;
            kernel.emit('manga-edit:selection', { layerId: mode.selectedLayerId });
            kernel.emit('state:changed');
        }
        /* ---------------- Wiring ---------------- */
        kernel.provide('mangaEdit', {
            isActive: isActive,
            isEditingPanel: isEditingPanel,
            getMode: getMode,
            getSelectedLayerId: getSelectedLayerId,
            enter: enter,
            exit: exit,
            setSelectedLayer: setSelectedLayer,
            hitTestLayer: hitTestLayer,
            getPanelBounds: getPanelBounds,
            instanceById: instanceById
        });
        kernel.on('instances:changed', function () {
            if (!mode)
                return;
            if (!instanceById(mode.instanceId))
                exit(true);
        });
        kernel.on('board:navigated', function () {
            if (mode)
                exit(true);
        });
    }
});
