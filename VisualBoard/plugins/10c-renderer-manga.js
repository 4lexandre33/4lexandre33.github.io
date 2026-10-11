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
                const st = { fill: 'none', stroke: '#1a1a1a', strokeWidth: 5, fillOpacity: 1,
                    strokeOpacity: 1, ...(p.vp1Style || {}) };
                if (MP.getLayerNodeState(inst, 'panel', p.id)?.visible === false)
                    continue;
                outlines.push('<path d="' + d + '"' + t + ' fill="none" fill-rule="' + rule +
                    '" stroke="' + xmlAttr(st.stroke) + '" stroke-width="' + st.strokeWidth +
                    '" stroke-opacity="' + st.strokeOpacity + '" stroke-linejoin="miter"/>');
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
            const crop = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1Crop || {}) };
            const img = div.querySelector('img');
            if (img) {
                const clipping = 'inset(' + crop.top * 100 + '% ' + crop.right * 100 + '% ' +
                    crop.bottom * 100 + '% ' + crop.left * 100 + '%)';
                img.style.clipPath = clipping;
                img.style.setProperty('-webkit-clip-path', clipping);
            }
            for (const edge of ['left', 'top', 'right', 'bottom']) {
                const handle = div.querySelector('[data-vp1-crop-handle="' + edge + '"]');
                if (!handle)
                    continue;
                if (edge === 'left' || edge === 'right') {
                    handle.style.left = (edge === 'left' ? crop.left : 1 - crop.right) * 100 + '%';
                    handle.style.top = (crop.top + (1 - crop.top - crop.bottom) / 2) * 100 + '%';
                }
                else {
                    handle.style.top = (edge === 'top' ? crop.top : 1 - crop.bottom) * 100 + '%';
                    handle.style.left = (crop.left + (1 - crop.left - crop.right) / 2) * 100 + '%';
                }
            }
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
        /** View limits are anchored to the page rather than to the rotated image.
         * Per-layer full-size wrappers implement intersection:
         *   panel SVG mask ∩ page-local view limits ∩ source-relative crop.
         */
        function layerViewport(parent, layer) {
            const key = layer.id;
            let wrapper = Array.from(parent.children).find(el => el instanceof HTMLElement && el.dataset.vp1LayerViewport === key);
            if (!wrapper) {
                wrapper = document.createElement('div');
                wrapper.className = 'manga-layer-viewport';
                wrapper.dataset.vp1LayerViewport = key;
                parent.appendChild(wrapper);
            }
            const limits = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1ViewLimits || {}) };
            const inset = 'inset(' + limits.top * 100 + '% ' + limits.right * 100 + '% ' +
                limits.bottom * 100 + '% ' + limits.left * 100 + '%)';
            wrapper.style.clipPath = inset;
            wrapper.style.setProperty('-webkit-clip-path', inset);
            wrapper.style.zIndex = String(layer.zIndex || 1);
            return wrapper;
        }
        /* Crop handles belong to a page-local edit overlay ABOVE image View Limits.
         * Clipping the image must never make its handles impossible to pick. */
        function redrawCropHandles(inner, inst) {
            let slot = inner.querySelector('.vp1-crop-page-overlay');
            if (!slot) {
                slot = document.createElement('div');
                slot.className = 'vp1-crop-page-overlay';
                // Keep the historical three direct children (panels, borders, overlay).
                // Crop handles live inside the existing overlay, above View Limits.
                (inner.querySelector('.manga-overlay') || inner).appendChild(slot);
            }
            slot.replaceChildren();
            const mode = MP.getCropMode();
            if (!mode || mode.instanceId !== inst.id)
                return;
            const layer = mode.panelId === '__overlay__' ?
                (inst.overlays || []).find(l => l.id === mode.layerId) :
                inst.panels.find(p => p.id === mode.panelId)?.layers.find(l => l.id === mode.layerId);
            if (!layer)
                return;
            const crop = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1Crop || {}) };
            const point = (edge) => {
                const u = edge === 'left' ? crop.left : edge === 'right' ? 1 - crop.right :
                    crop.left + (1 - crop.left - crop.right) / 2;
                const v = edge === 'top' ? crop.top : edge === 'bottom' ? 1 - crop.bottom :
                    crop.top + (1 - crop.top - crop.bottom) / 2;
                const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
                const dx = layer.x + layer.width * u - cx, dy = layer.y + layer.height * v - cy;
                const angle = (layer.rotation || 0) * Math.PI / 180;
                return { x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
                    y: cy + dx * Math.sin(angle) + dy * Math.cos(angle) };
            };
            for (const edge of ['left', 'right', 'top', 'bottom']) {
                const p = point(edge), node = document.createElement('span');
                node.className = 'vp1-crop-page-handle vp1-crop-handle-' + edge;
                node.setAttribute('data-vp1-crop-handle', edge);
                node.setAttribute('data-vp1-crop-layer-id', layer.id);
                node.setAttribute('aria-label', 'Crop ' + edge);
                node.style.left = p.x + 'px';
                node.style.top = p.y + 'px';
                slot.appendChild(node);
            }
        }
        /* VP1-043–051: vector objects are rendered inside the existing clipped
         * manga panel/overlay DOM slots; no fourth direct child of page-inner. */
        function updateMangaFxSvg(parent, inst, panelId, ps) {
            let svg = Array.from(parent.children).find(el => el instanceof SVGSVGElement && el.classList.contains('vp1-manga-effects'));
            const effects = MP.listMangaEffects(inst).filter(e => (panelId === '__page__' ? e.scope === 'page' :
                e.scope === 'panel' && e.panelId === panelId) &&
                MP.getLayerNodeState(inst, 'drawing', e.id)?.visible !== false);
            if (!effects.length) {
                svg?.remove();
                return;
            }
            if (!svg) {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.classList.add('vp1-manga-effects');
                svg.setAttribute('aria-label', 'Manga Ink and effects');
                parent.appendChild(svg);
            }
            svg.setAttribute('width', String(ps.width));
            svg.setAttribute('height', String(ps.height));
            svg.setAttribute('viewBox', '0 0 ' + ps.width + ' ' + ps.height);
            svg.replaceChildren();
            for (const effect of effects) {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.dataset.vp1EffectId = effect.id;
                group.dataset.vp1EffectKind = effect.kind;
                const fxState = MP.getLayerNodeState(inst, 'drawing', effect.id);
                group.style.pointerEvents = fxState?.locked ? 'none' : 'visiblePainted';
                const selected = MP.getSelectedMangaEffect();
                if (selected?.instanceId === inst.id && selected.id === effect.id)
                    group.dataset.vp1EffectSelected = 'true';
                group.setAttribute('aria-label', effect.kind);
                for (const item of MP.mangaEffectPrimitives(effect)) {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', item.d);
                    path.setAttribute('fill', item.fill);
                    path.setAttribute('stroke', item.stroke);
                    path.setAttribute('stroke-width', String(item.strokeWidth));
                    path.setAttribute('stroke-linecap', 'round');
                    path.setAttribute('stroke-linejoin', 'round');
                    path.setAttribute('opacity', String(item.opacity));
                    group.appendChild(path);
                }
                svg.appendChild(group);
            }
        }
        /* VP1-052–060: vector dialogue shapes, text and selection handles live in
         * the historical overlay slot; no new page-inner sibling or HTML injection. */
        function updateBalloonSvg(overlay, inst, ps) {
            let svg = Array.from(overlay.children).find(el => el instanceof SVGSVGElement && el.classList.contains('vp1-balloons'));
            const balloons = MP.listBalloons(inst).filter(b => MP.getLayerNodeState(inst, 'balloon', b.id)?.visible !== false);
            if (!balloons.length) {
                svg?.remove();
                return;
            }
            if (!svg) {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.classList.add('vp1-balloons');
                svg.setAttribute('aria-label', 'Editable dialogue balloons');
                svg.style.position = 'absolute';
                svg.style.left = '0';
                svg.style.top = '0';
                svg.style.overflow = 'visible';
                svg.style.pointerEvents = 'none';
                svg.style.zIndex = '999';
                overlay.appendChild(svg);
            }
            svg.setAttribute('viewBox', '0 0 ' + ps.width + ' ' + ps.height);
            svg.setAttribute('width', String(ps.width));
            svg.setAttribute('height', String(ps.height));
            svg.replaceChildren();
            const chosen = MP.getSelectedBalloon();
            for (const b of balloons) {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.dataset.vp1BalloonId = b.id;
                group.dataset.vp1BalloonSelected =
                    String(chosen?.instanceId === inst.id && chosen.id === b.id);
                const disabled = !!MP.getLayerNodeState(inst, 'balloon', b.id)?.locked;
                group.style.pointerEvents = disabled ? 'none' : 'auto';
                group.style.cursor = disabled ? 'default' : 'move';
                group.setAttribute('role', 'img');
                group.setAttribute('aria-label', 'Dialogue balloon ' + (b.text || b.presetId || 'custom'));
                if (b.rotation)
                    group.setAttribute('transform', 'rotate(' + b.rotation + ' ' +
                        (b.x + b.width / 2) + ' ' + (b.y + b.height / 2) + ')');
                for (const primitive of MP.balloonPaths(b)) {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                    path.setAttribute('d', primitive.d);
                    path.setAttribute('fill', primitive.fill);
                    path.setAttribute('stroke', primitive.stroke);
                    path.setAttribute('stroke-width', String(primitive.strokeWidth));
                    path.setAttribute('opacity', String(primitive.opacity));
                    path.setAttribute('stroke-linejoin', 'round');
                    group.appendChild(path);
                }
                if (b.text) {
                    const layout = MP.balloonTextLayout(b);
                    const el = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    el.setAttribute('x', String(layout.x));
                    el.setAttribute('y', String(layout.y));
                    el.setAttribute('font-family', 'sans-serif');
                    el.setAttribute('font-size', String(layout.fontSize));
                    el.setAttribute('fill', b.textColor);
                    el.setAttribute('text-anchor', 'middle');
                    el.setAttribute('dominant-baseline', 'middle');
                    el.style.pointerEvents = 'none';
                    layout.lines.forEach((line, i) => {
                        const span = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                        span.setAttribute('x', String(layout.x));
                        span.setAttribute('y', String(layout.y + i * layout.lineHeight));
                        span.textContent = line;
                        el.appendChild(span);
                    });
                    group.appendChild(el);
                }
                if (chosen?.instanceId === inst.id && chosen.id === b.id && !disabled) {
                    const handles = [
                        ['nw', b.x, b.y], ['ne', b.x + b.width, b.y],
                        ['se', b.x + b.width, b.y + b.height], ['sw', b.x, b.y + b.height]
                    ];
                    for (const [corner, x, y] of handles) {
                        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        handle.dataset.vp1BalloonHandle = corner;
                        handle.setAttribute('x', String(x - 5));
                        handle.setAttribute('y', String(y - 5));
                        handle.setAttribute('width', '10');
                        handle.setAttribute('height', '10');
                        handle.setAttribute('fill', '#ffffff');
                        handle.setAttribute('stroke', '#148bdf');
                        handle.style.cursor = 'nwse-resize';
                        handle.style.pointerEvents = 'auto';
                        group.appendChild(handle);
                    }
                    if (b.vertices) {
                        b.vertices.forEach((p, i) => {
                            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                            marker.dataset.vp1BalloonVertexIndex = String(i);
                            marker.setAttribute('cx', String(b.x + p.x * b.width));
                            marker.setAttribute('cy', String(b.y + p.y * b.height));
                            marker.setAttribute('r', '5');
                            marker.setAttribute('fill', '#1a86ff');
                            marker.setAttribute('stroke', '#ffffff');
                            marker.setAttribute('stroke-width', '1.5');
                            marker.style.cursor = 'crosshair';
                            marker.style.pointerEvents = 'auto';
                            group.appendChild(marker);
                        });
                    }
                }
                svg.appendChild(group);
            }
        }
        /* VP1-062–067: standalone SVG text (not balloon content), stable page
         * coordinates, selectable hit boxes and resizing handles. */
        function updateHorizontalTextSvg(overlay, inst, ps) {
            let svg = Array.from(overlay.children).find(el => el instanceof SVGSVGElement && el.classList.contains('vp1-horizontal-texts'));
            const texts = MP.listHorizontalTexts(inst).filter(t => MP.getLayerNodeState(inst, 'text', t.id)?.visible !== false);
            if (!texts.length) {
                svg?.remove();
                return;
            }
            if (!svg) {
                svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                svg.classList.add('vp1-horizontal-texts');
                svg.setAttribute('aria-label', 'Editable horizontal text objects');
                svg.style.position = 'absolute';
                svg.style.top = '0';
                svg.style.left = '0';
                svg.style.zIndex = '1001';
                svg.style.pointerEvents = 'none';
                svg.style.overflow = 'visible';
                overlay.appendChild(svg);
            }
            svg.setAttribute('viewBox', '0 0 ' + ps.width + ' ' + ps.height);
            svg.setAttribute('width', String(ps.width));
            svg.setAttribute('height', String(ps.height));
            svg.replaceChildren();
            const selected = MP.getSelectedHorizontalText();
            for (const item of texts) {
                const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                group.dataset.vp1TextId = item.id;
                group.dataset.vp1TextSelected = String(selected?.instanceId === inst.id &&
                    selected.id === item.id);
                group.setAttribute('role', 'img');
                group.setAttribute('aria-label', 'Horizontal text ' + item.text.slice(0, 120));
                const disabled = !!MP.getLayerNodeState(inst, 'text', item.id)?.locked;
                group.style.cursor = disabled ? 'default' : 'move';
                group.style.pointerEvents = disabled ? 'none' : 'visiblePainted';
                if (item.rotation)
                    group.setAttribute('transform', 'rotate(' + item.rotation + ' ' +
                        (item.x + item.width / 2) + ' ' + (item.y + item.height / 2) + ')');
                const hit = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                hit.setAttribute('x', String(item.x));
                hit.setAttribute('y', String(item.y));
                hit.setAttribute('width', String(item.width));
                hit.setAttribute('height', String(item.height));
                hit.setAttribute('fill', 'transparent');
                hit.style.pointerEvents = disabled ? 'none' : 'all';
                group.appendChild(hit);
                const layout = MP.horizontalTextLayout(item);
                const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                text.setAttribute('font-family', item.fontFamily);
                text.setAttribute('font-size', String(item.fontSize));
                text.setAttribute('font-weight', item.bold ? '700' : '400');
                text.setAttribute('text-anchor', item.align === 'left' ? 'start' :
                    item.align === 'right' ? 'end' : 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('fill', item.color);
                text.setAttribute('stroke', item.outlineWidth > 0 ? item.outlineColor : 'none');
                text.setAttribute('stroke-width', String(item.outlineWidth));
                text.setAttribute('stroke-linejoin', 'round');
                text.setAttribute('paint-order', 'stroke fill');
                text.setAttribute('opacity', String(item.opacity));
                text.style.pointerEvents = 'none';
                layout.lines.forEach((line, i) => {
                    const node = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    node.setAttribute('x', String(layout.x));
                    node.setAttribute('y', String(layout.y + i * layout.lineHeight));
                    node.textContent = line;
                    text.appendChild(node);
                });
                group.appendChild(text);
                if (selected?.instanceId === inst.id && selected.id === item.id && !disabled) {
                    const outline = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                    outline.setAttribute('x', String(item.x));
                    outline.setAttribute('y', String(item.y));
                    outline.setAttribute('width', String(item.width));
                    outline.setAttribute('height', String(item.height));
                    outline.setAttribute('fill', 'none');
                    outline.setAttribute('stroke', '#138aff');
                    outline.setAttribute('stroke-width', '1.5');
                    outline.setAttribute('stroke-dasharray', '5 4');
                    outline.style.pointerEvents = 'none';
                    group.appendChild(outline);
                    const handles = [
                        ['nw', item.x, item.y], ['ne', item.x + item.width, item.y],
                        ['se', item.x + item.width, item.y + item.height],
                        ['sw', item.x, item.y + item.height]
                    ];
                    for (const [corner, x, y] of handles) {
                        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                        handle.dataset.vp1TextHandle = corner;
                        handle.setAttribute('x', String(x - 5));
                        handle.setAttribute('y', String(y - 5));
                        handle.setAttribute('width', '10');
                        handle.setAttribute('height', '10');
                        handle.setAttribute('fill', '#ffffff');
                        handle.setAttribute('stroke', '#148bdf');
                        handle.style.pointerEvents = 'all';
                        handle.style.cursor = 'nwse-resize';
                        group.appendChild(handle);
                    }
                }
                svg.appendChild(group);
            }
        }
        /* VP1-074: direct contextual controls, anchored to the page-space object
         * without intercepting canvas gestures outside the small toolbar. */
        function updateTreeCanvasControls(overlay, page, ps) {
            overlay.querySelector('.vp1-tree-canvas-controls')?.remove();
            let kind = null, id = null;
            const t = MP.getSelectedHorizontalText(), b = MP.getSelectedBalloon(), fx = MP.getSelectedMangaEffect(), mode = ME?.getMode();
            if (t?.instanceId === page.id) {
                kind = 'text';
                id = t.id;
            }
            else if (b?.instanceId === page.id) {
                kind = 'balloon';
                id = b.id;
            }
            else if (fx?.instanceId === page.id) {
                kind = 'drawing';
                id = fx.id;
            }
            else if (mode?.instanceId === page.id && mode.selectedLayerId) {
                kind = 'image';
                id = mode.selectedLayerId;
            }
            if (!kind || !id)
                return;
            const node = MP.listLayerTree(page).find(n => n.kind === kind && n.id === id);
            if (!node)
                return;
            let x = 12, y = 12;
            if (kind === 'text') {
                const item = MP.listHorizontalTexts(page).find(n => n.id === id);
                if (item) {
                    x = item.x;
                    y = item.y - 34;
                }
            }
            else if (kind === 'balloon') {
                const item = MP.listBalloons(page).find(n => n.id === id);
                if (item) {
                    x = item.x;
                    y = item.y - 34;
                }
            }
            else if (kind === 'drawing') {
                const item = MP.listMangaEffects(page).find(n => n.id === id);
                if (item) {
                    x = item.x;
                    y = item.y - 34;
                }
            }
            else {
                const layer = page.panels.flatMap(p => p.layers).concat(page.overlays || [])
                    .find(n => n.id === id);
                if (layer) {
                    x = layer.x;
                    y = layer.y - 34;
                }
            }
            const controls = document.createElement('div');
            controls.className = 'vp1-tree-canvas-controls';
            controls.dataset.vp1TreeKind = kind;
            controls.dataset.vp1TreeId = id;
            controls.setAttribute('role', 'toolbar');
            controls.setAttribute('aria-label', 'Canvas layer controls');
            controls.style.left = Math.max(0, Math.min(ps.width - 190, x)) + 'px';
            controls.style.top = Math.max(0, y) + 'px';
            controls.addEventListener('pointerdown', e => e.stopPropagation());
            controls.addEventListener('dblclick', e => e.stopPropagation());
            const action = (title, label, fn) => {
                const el = document.createElement('button');
                el.type = 'button';
                el.textContent = label;
                el.title = title;
                el.setAttribute('aria-label', title);
                el.disabled = !!page.locked;
                el.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    void fn().catch(error => kernel.log.error('Layer control', error));
                });
                controls.appendChild(el);
            };
            action('Toggle layer visibility', node.ownVisible ? '◉' : '◎', () => MP.updateLayerTreeNode(page, kind, id, { ownVisible: !node.ownVisible }));
            action('Toggle layer lock', node.ownLocked ? '🔒' : '♙', () => MP.updateLayerTreeNode(page, kind, id, { ownLocked: !node.ownLocked }));
            action('Bring layer forward', '↑', () => MP.reorderLayerTreeNode(page, kind, id, 'forward'));
            action('Send layer backward', '↓', () => MP.reorderLayerTreeNode(page, kind, id, 'backward'));
            if (kind === 'text') {
                const edit = document.createElement('button');
                edit.type = 'button';
                edit.textContent = 'Edit';
                edit.title = 'Edit text on canvas';
                edit.addEventListener('click', e => {
                    e.preventDefault();
                    e.stopPropagation();
                    document.getElementById('viewport')?.dispatchEvent(new CustomEvent('nvb-horizontal-text-edit', { detail: { instanceId: page.id, id } }));
                });
                controls.appendChild(edit);
            }
            overlay.appendChild(controls);
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
                panelEl.style.visibility = MP.getLayerNodeState(inst, 'panel', psPanel.id)?.visible === false ? 'hidden' : '';
                panelEl.classList.toggle('vp1-tree-locked', !!MP.getLayerNodeState(inst, 'panel', psPanel.id)?.locked);
                panelEl.style.position = 'absolute';
                panelEl.style.left = '0';
                panelEl.style.top = '0';
                panelEl.style.width = ps.width + 'px';
                panelEl.style.height = ps.height + 'px';
                const st = { fill: 'none', stroke: '#1a1a1a', strokeWidth: 5, fillOpacity: 1,
                    strokeOpacity: 1, ...(psPanel.vp1Style || {}) };
                const rgba = (hex, opacity) => {
                    if (hex === 'none')
                        return 'transparent';
                    const parts = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
                    return 'rgba(' + parts.join(',') + ',' + opacity + ')';
                };
                panelEl.style.backgroundColor = rgba(st.fill, st.fillOpacity);
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
                    if (!layerEl)
                        layerEl = buildLayerEl(layer);
                    const wrapper = layerViewport(panelEl, layer);
                    if (layerEl.parentElement !== wrapper)
                        wrapper.appendChild(layerEl);
                    const nodeState = MP.getLayerNodeState(inst, 'image', layer.id);
                    wrapper.style.display = nodeState?.visible === false ? 'none' : '';
                    layerEl.classList.toggle('vp1-tree-locked', !!nodeState?.locked);
                    applyLayerStyle(layerEl, layer);
                    const cropMode = MP.getCropMode();
                    layerEl.classList.toggle('vp1-crop-editing', !!cropMode &&
                        cropMode.instanceId === inst.id && cropMode.panelId === psPanel.id &&
                        cropMode.layerId === layer.id);
                    const img = layerEl.querySelector('img');
                    if (img)
                        applyLayerImgSrc(img, layer.assetId);
                    layerEl.classList.toggle('is-selected', layer.id === selectedId);
                });
                existing.forEach(function (old) {
                    if (!seen.has(old.dataset.layerId))
                        old.remove();
                });
                Array.from(panelEl.querySelectorAll('[data-vp1-layer-viewport]'))
                    .forEach(v => { if (!seen.has(v.dataset.vp1LayerViewport))
                    v.remove(); });
                updateMangaFxSvg(panelEl, inst, psPanel.id, ps);
            });
            Array.from(panelsBox.querySelectorAll('.manga-panel')).forEach(function (p) {
                const exists = ps.panels.some(function (x) { return x.id === p.dataset.panelId; });
                if (!exists)
                    p.remove();
            });
            /* ---------- Overlay ---------- */
            const overlayBox = inner.querySelector('.manga-overlay');
            overlayBox.classList.toggle('is-editing', !!editingOverlay);
            overlayBox.style.visibility = MP.getLayerNodeState(inst, 'panel', '__overlay__')?.visible === false ? 'hidden' : '';
            const ovLayers = inst.overlays || [];
            const selectedOverlayId = editingOverlay ? ME.getSelectedLayerId() : null;
            const seenOv = new Set();
            ovLayers.forEach(function (layer) {
                seenOv.add(layer.id);
                let layerEl = overlayBox.querySelector('[data-layer-id="' + layer.id + '"]');
                if (!layerEl)
                    layerEl = buildLayerEl(layer);
                const wrapper = layerViewport(overlayBox, layer);
                if (layerEl.parentElement !== wrapper)
                    wrapper.appendChild(layerEl);
                const nodeState = MP.getLayerNodeState(inst, 'image', layer.id);
                wrapper.style.display = nodeState?.visible === false ? 'none' : '';
                layerEl.classList.toggle('vp1-tree-locked', !!nodeState?.locked);
                applyLayerStyle(layerEl, layer);
                const cropMode = MP.getCropMode();
                layerEl.classList.toggle('vp1-crop-editing', !!cropMode &&
                    cropMode.instanceId === inst.id && cropMode.panelId === '__overlay__' &&
                    cropMode.layerId === layer.id);
                const img = layerEl.querySelector('img');
                if (img)
                    applyLayerImgSrc(img, layer.assetId);
                layerEl.classList.toggle('is-selected', layer.id === selectedOverlayId);
            });
            Array.from(overlayBox.querySelectorAll('.manga-layer')).forEach(function (old) {
                if (!seenOv.has(old.dataset.layerId))
                    old.remove();
            });
            Array.from(overlayBox.querySelectorAll('[data-vp1-layer-viewport]'))
                .forEach(v => { if (!seenOv.has(v.dataset.vp1LayerViewport))
                v.remove(); });
            updateMangaFxSvg(overlayBox, inst, '__page__', ps);
            updateBalloonSvg(overlayBox, inst, ps);
            updateHorizontalTextSvg(overlayBox, inst, ps);
            /* ---------- Borders SVG ---------- */
            const bordersSlot = inner.querySelector('.manga-borders-slot');
            const bordersKey = ps.id + ':' + (ps.updatedAt || 0) + ':' +
                ps.panels.map(p => MP.getLayerNodeState(inst, 'panel', p.id)?.visible === false ? '0' : '1').join('');
            if (bordersSlot.dataset.key !== bordersKey) {
                bordersSlot.dataset.key = bordersKey;
                bordersSlot.innerHTML = buildBordersSvg(ps, inst);
            }
            redrawCropHandles(inner, inst);
            updateTreeCanvasControls(overlayBox, inst, ps);
        }
        kernel.provide('rendererManga', { createEl: createEl, updateEl: updateEl });
    }
});
