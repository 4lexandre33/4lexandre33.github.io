"use strict";
/* =====================================================================
 * plugins/10c-renderer-manga.js
 * ---------------------------------------------------------------------
 * Renderiza instâncias do tipo manga-page.
 *
 * Estrutura DOM (ordem importa):
 *   .manga-page-inner
 *     ├ .manga-panels        (conteúdo clipado dos painéis)
 *     ├ .manga-borders-slot  (SVG com as bordas)
 *     └ .manga-overlay       (ÚLTIMO — garante prioridade de pintura)
 *
 * FIX v1.4.0:
 *   - Overlay movido para ser o ÚLTIMO filho de .manga-page-inner.
 *     Antes era o segundo (panels → overlay → borders), e o SVG das
 *     bordas, por ser promovido a compositing layer própria pelo
 *     browser (efeito colateral do transform: scale no parent),
 *     pintava por cima do overlay.
 *   - CSS reforçado com isolation + will-change.
 * ===================================================================== */
definePlugin({
    id: 'renderer-manga',
    version: '1.4.0',
    needs: ['utils', 'state', 'assets', 'panelSets', 'mangaPage', 'svgGeometry'],
    provides: ['rendererManga'],
    uses: ['mangaEdit'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'assets': '^1.0.0', 'panelSets': '^1.0.0', 'mangaPage': '^1.0.0', 'svgGeometry': '^1.0.0', 'mangaEdit': '^1.0.0' },
    contractVersions: { 'rendererManga': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const A = await kernel.require('assets');
        const PS = await kernel.require('panelSets');
        const MP = await kernel.require('mangaPage');
        const geometry = await kernel.require('svgGeometry');
        /* ---------------- Cache de mangaEdit ---------------- */
        let ME = null;
        function tryLoadEdit() {
            if (!kernel.has('mangaEdit'))
                return;
            kernel.require('mangaEdit').then(function (m) { ME = m; });
        }
        tryLoadEdit();
        /* ---------------- Helpers ---------------- */
        const xmlAttr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const clipId = (inst, p) => 'nvb-clip-' + String(inst.id + '-' + p.id).replace(/[^a-zA-Z0-9_-]/g, '_');
        function buildBordersSvg(ps, inst) {
            if (!Number.isFinite(ps.width) || !Number.isFinite(ps.height) ||
                ps.width <= 0 || ps.height <= 0)
                return '';
            const defs = [], outlines = [];
            for (const p of ps.panels) {
                const vector = geometry.serializeVector(p);
                const d = xmlAttr(vector.d);
                const t = vector.transform ? ' transform="' + xmlAttr(vector.transform) + '"' : '';
                const rule = xmlAttr(vector.fillRule);
                const clip = clipId(inst, p);
                defs.push('<clipPath id="' + clip + '" clipPathUnits="userSpaceOnUse">' +
                    '<path d="' + d + '"' + t + ' clip-rule="' + rule + '" fill-rule="' + rule + '"/>' +
                    '</clipPath>');
                outlines.push('<path d="' + d + '"' + t + ' fill="none" fill-rule="' + rule +
                    '" stroke="#1a1a1a" stroke-width="5" stroke-linejoin="miter"/>');
            }
            return '<svg class="manga-borders" xmlns="http://www.w3.org/2000/svg" ' +
                'viewBox="0 0 ' + ps.width + ' ' + ps.height + '" preserveAspectRatio="none">' +
                '<defs>' + defs.join('') + '</defs>' + outlines.join('') + '</svg>';
        }
        function pointsToClipPath(points) {
            return 'polygon(' + points.map(function (pt) {
                return pt.x + 'px ' + pt.y + 'px';
            }).join(', ') + ')';
        }
        /* ---------------- Layer element ---------------- */
        function buildLayerEl(layer) {
            const div = document.createElement('div');
            div.className = 'manga-layer';
            div.dataset.layerId = layer.id;
            const img = document.createElement('img');
            img.draggable = false;
            img.alt = '';
            div.appendChild(img);
            const corners = ['nw', 'ne', 'se', 'sw'];
            for (let i = 0; i < corners.length; i++) {
                const h = document.createElement('div');
                h.className = 'manga-layer-handle manga-layer-handle-' + corners[i];
                h.dataset.mlayerHandle = corners[i];
                div.appendChild(h);
            }
            applyLayerStyle(div, layer);
            return div;
        }
        function applyLayerStyle(div, layer) {
            div.style.left = layer.x + 'px';
            div.style.top = layer.y + 'px';
            div.style.width = layer.width + 'px';
            div.style.height = layer.height + 'px';
            div.style.zIndex = String(layer.zIndex || 1);
            div.style.opacity = String(layer.opacity == null ? 1 : layer.opacity);
            div.style.transform = layer.rotation ? 'rotate(' + layer.rotation + 'deg)' : '';
        }
        function applyLayerImgSrc(img, assetId) {
            const url = A.urls.get(assetId);
            if (url) {
                if (img.src !== url)
                    img.src = url;
                img.classList.remove('manga-layer-missing');
            }
            else {
                img.classList.add('manga-layer-missing');
            }
        }
        /* ---------------- Create ----------------
         * IMPORTANTE: ordem dos filhos.
         *   1) panels  → conteúdo clipado (camada mais baixa)
         *   2) borders → SVG das bordas (camada do meio)
         *   3) overlay → efeitos transversais (camada mais alta)
         * O overlay é o ÚLTIMO para que, mesmo se z-index falhar em algum
         * browser, o overlay ainda pinte por cima das bordas (ordem do DOM).
         * ------------------------------------------ */
        function createEl(inst) {
            const el = document.createElement('div');
            el.className = 'instance manga-page';
            el.dataset.id = inst.id;
            el.dataset.type = 'manga-page';
            el.title = 'Manga page — double-click a panel to edit its layers';
            const hint = document.createElement('div');
            hint.className = 'manga-page-hint';
            hint.textContent = 'Double-click a panel to edit its layers';
            el.appendChild(hint);
            const inner = document.createElement('div');
            inner.className = 'manga-page-inner';
            el.appendChild(inner);
            // 1) Panels (embaixo)
            const panels = document.createElement('div');
            panels.className = 'manga-panels';
            inner.appendChild(panels);
            // 2) Borders (meio)
            const borders = document.createElement('div');
            borders.className = 'manga-borders-slot';
            inner.appendChild(borders);
            // 3) Overlay (topo) — último filho
            const overlay = document.createElement('div');
            overlay.className = 'manga-overlay';
            inner.appendChild(overlay);
            const corners = ['nw', 'ne', 'se', 'sw'];
            for (let i = 0; i < corners.length; i++) {
                const h = document.createElement('div');
                h.className = 'handle handle-' + corners[i];
                h.dataset.handle = corners[i];
                el.appendChild(h);
            }
            return el;
        }
        /* ---------------- Update ---------------- */
        function updateEl(el, inst) {
            const ps = PS.get(inst.panelSetId);
            if (!ps) {
                el.classList.add('manga-missing');
                const inner = el.querySelector('.manga-page-inner');
                if (inner)
                    inner.innerHTML = '<div class="manga-missing-label">Missing panel set</div>';
                return;
            }
            el.classList.remove('manga-missing');
            const focus = MP.getFocus();
            const focusedThis = focus && focus.instanceId === inst.id;
            const editMode = ME && ME.getMode();
            const editingThis = editMode && editMode.instanceId === inst.id;
            const editingOverlay = editingThis && editMode.panelId === '__overlay__';
            const activeEditingPanelId = editingThis && !editingOverlay ? editMode.panelId : null;
            el.classList.toggle('is-focused', !!focusedThis && !editingThis);
            el.classList.toggle('is-editing', !!editingThis);
            const scale = inst.width / ps.width;
            const inner = el.querySelector('.manga-page-inner');
            if (!inner)
                return;
            inner.style.width = ps.width + 'px';
            inner.style.height = ps.height + 'px';
            inner.style.transform = 'scale(' + scale + ')';
            inner.style.transformOrigin = '0 0';
            /* ---------- Panels ---------- */
            const panelsBox = inner.querySelector('.manga-panels');
            ps.panels.forEach(function (psPanel) {
                let panelEl = panelsBox.querySelector('[data-panel-id="' + psPanel.id + '"]');
                if (!panelEl) {
                    panelEl = document.createElement('div');
                    panelEl.className = 'manga-panel';
                    panelEl.dataset.panelId = psPanel.id;
                    panelsBox.appendChild(panelEl);
                }
                const isEditing = psPanel.id === activeEditingPanelId;
                panelEl.classList.toggle('is-editing', isEditing);
                panelEl.classList.toggle('is-active', psPanel.id === MP.getActivePanelId(inst));
                panelEl.style.position = 'absolute';
                panelEl.style.left = '0';
                panelEl.style.top = '0';
                panelEl.style.width = ps.width + 'px';
                panelEl.style.height = ps.height + 'px';
                const cp = psPanel.vector || (psPanel.contours && psPanel.contours.length > 1)
                    ? 'url("#' + clipId(inst, psPanel) + '")'
                    : pointsToClipPath(psPanel.points);
                panelEl.style.clipPath = cp;
                panelEl.style.setProperty('-webkit-clip-path', cp);
                const instPanel = (inst.panels || []).find(function (p) { return p.id === psPanel.id; });
                const layers = instPanel ? instPanel.layers : [];
                const selectedId = isEditing ? ME.getSelectedLayerId() : null;
                const existing = Array.from(panelEl.querySelectorAll('.manga-layer'));
                const seen = new Set();
                layers.forEach(function (layer) {
                    seen.add(layer.id);
                    let layerEl = panelEl.querySelector('[data-layer-id="' + layer.id + '"]');
                    if (!layerEl) {
                        layerEl = buildLayerEl(layer);
                        panelEl.appendChild(layerEl);
                    }
                    applyLayerStyle(layerEl, layer);
                    const img = layerEl.querySelector('img');
                    if (img)
                        applyLayerImgSrc(img, layer.assetId);
                    layerEl.classList.toggle('is-selected', layer.id === selectedId);
                });
                existing.forEach(function (old) {
                    if (!seen.has(old.dataset.layerId))
                        old.remove();
                });
            });
            Array.from(panelsBox.querySelectorAll('.manga-panel')).forEach(function (p) {
                const exists = ps.panels.some(function (x) { return x.id === p.dataset.panelId; });
                if (!exists)
                    p.remove();
            });
            /* ---------- Overlay ---------- */
            const overlayBox = inner.querySelector('.manga-overlay');
            overlayBox.classList.toggle('is-editing', !!editingOverlay);
            const ovLayers = inst.overlays || [];
            const selectedOverlayId = editingOverlay ? ME.getSelectedLayerId() : null;
            const seenOv = new Set();
            ovLayers.forEach(function (layer) {
                seenOv.add(layer.id);
                let layerEl = overlayBox.querySelector('[data-layer-id="' + layer.id + '"]');
                if (!layerEl) {
                    layerEl = buildLayerEl(layer);
                    overlayBox.appendChild(layerEl);
                }
                applyLayerStyle(layerEl, layer);
                const img = layerEl.querySelector('img');
                if (img)
                    applyLayerImgSrc(img, layer.assetId);
                layerEl.classList.toggle('is-selected', layer.id === selectedOverlayId);
            });
            Array.from(overlayBox.querySelectorAll('.manga-layer')).forEach(function (old) {
                if (!seenOv.has(old.dataset.layerId))
                    old.remove();
            });
            /* ---------- Borders SVG ---------- */
            const bordersSlot = inner.querySelector('.manga-borders-slot');
            if (bordersSlot.dataset.key !== ps.id) {
                bordersSlot.dataset.key = ps.id;
                bordersSlot.innerHTML = buildBordersSvg(ps, inst);
            }
        }
        kernel.provide('rendererManga', { createEl: createEl, updateEl: updateEl });
    }
});
