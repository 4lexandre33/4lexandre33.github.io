"use strict";
/* =====================================================================
 * plugins/12b-manga-export.js
 * ---------------------------------------------------------------------
 * Exportação de páginas de mangá:
 *   - PNG de uma página (canvas → blob)
 *   - PDF de múltiplas páginas (PDF 1.4 com JPEG embutido, sem libs)
 *
 * Fornece: mangaExport
 * ===================================================================== */
definePlugin({
    id: 'manga-export',
    version: '1.2.0',
    needs: ['utils', 'state', 'mangaPage', 'panelSets', 'assets', 'ui.dialogs', 'mangaExportPreflight'],
    provides: ['mangaExport'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0', 'mangaExportPreflight': '^1.0.0' },
    contractVersions: { 'mangaExport': '2.1.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        const MP = await kernel.require('mangaPage');
        const PS = await kernel.require('panelSets');
        const A = await kernel.require('assets');
        const D = await kernel.require('ui.dialogs');
        const preflight = await kernel.require('mangaExportPreflight');
        /* ============================================================
         * Helpers
         * ============================================================ */
        async function loadImage(url) {
            return new Promise(function (resolve, reject) {
                const img = new Image();
                img.onload = function () {
                    if (img.naturalWidth > 0 && img.naturalHeight > 0)
                        resolve(img);
                    else
                        reject(new Error('Image has invalid dimensions'));
                };
                img.onerror = function () { reject(new Error('Image could not be decoded')); };
                img.src = url;
            });
        }
        function outputSize(ps, opts, defaultQuality) {
            opts = opts || {};
            if (opts.dpi !== undefined && opts.quality !== undefined)
                throw Error('Specify PNG DPI or quality, not both');
            const dpi = opts.dpi === undefined ? null : Number(opts.dpi);
            if (dpi !== null && (!Number.isFinite(dpi) || dpi < 36 || dpi > 600))
                throw Error('PNG DPI must be between 36 and 600');
            const requested = dpi !== null ? dpi / 96 :
                opts.quality == null ? defaultQuality : Number(opts.quality);
            const maxPixels = opts.maxPixels == null ? 16000000 : Number(opts.maxPixels);
            const maxSide = opts.maxSide == null ? 8192 : Number(opts.maxSide);
            if (!Number.isFinite(requested) || requested <= 0 || requested > (dpi !== null ? 6.25 : 4) ||
                !Number.isFinite(maxPixels) || maxPixels < 1000000 || maxPixels > 32000000 ||
                !Number.isFinite(maxSide) || maxSide < 512 || maxSide > 16384) {
                throw new Error('Invalid export quality or canvas limit');
            }
            const quality = Math.min(requested, maxSide / ps.width, maxSide / ps.height, Math.sqrt(maxPixels / (ps.width * ps.height)));
            if (!Number.isFinite(quality) || quality <= 0)
                throw new Error('Export dimensions are invalid');
            const width = Math.max(1, Math.floor(ps.width * quality));
            const height = Math.max(1, Math.floor(ps.height * quality));
            const warnings = [];
            if (quality < requested - 0.0001)
                warnings.push({
                    code: 'RESOLUTION_LIMIT',
                    message: 'Resolution reduced from ' + requested.toFixed(2) + 'x to ' + quality.toFixed(2) +
                        'x to respect canvas memory limits' + (dpi !== null ?
                        ' (effective ' + Math.round(quality * 96) + ' DPI instead of ' + dpi + ' DPI)' : '')
                });
            return { width, height, quality, qualityRequested: requested,
                pixels: width * height, maxPixels, maxSide,
                dpiRequested: dpi, dpiEffective: dpi === null ? null : quality * 96, warnings };
        }
        const asIssue = (code, message, pageId, assetId) => ({
            code, message, pageId: pageId || null, assetId: assetId || null
        });
        function report(success, format, started, details, errors, warnings, files) {
            return { success, format, files: files || [], warnings: warnings || [], errors: errors || [],
                details: Object.assign({ elapsedMs: Math.round(performance.now() - started) }, details || {}) };
        }
        async function showFailure(errors, opts) {
            const details = errors.map(e => e.message + (e.assetId ? ' [ID: ' + e.assetId + ']' : '')).join('\n');
            kernel.emit('toast', { message: 'Export blocked: ' + (errors[0]?.message || 'Unknown error'), kind: 'error' });
            if (!opts?.silent && D && typeof D.confirm === 'function') {
                try {
                    await D.confirm({ title: 'Exportação bloqueada — verifique os arquivos',
                        message: details.slice(0, 10000), confirmText: 'Fechar', cancelText: 'Fechar' });
                }
                catch (error) {
                    kernel.log.warn('Cannot show export report', error);
                }
            }
            kernel.emit('manga-export:failed', { errors });
        }
        async function validateExport(pages, opts) {
            const result = preflight.validate(pages);
            const warnings = result.warnings.slice();
            const errors = result.errors.slice();
            if (errors.length)
                return { valid: false, errors, warnings, pages: result.pages };
            // Validate ALL referenced binaries before rendering/downloading ANY page.
            // Sequential decode bounds peak preflight memory even for long chapters.
            const decodedDimensions = new Map();
            for (const ref of result.assets) {
                try {
                    const img = await loadImage(ref.url);
                    const pixels = img.naturalWidth * img.naturalHeight;
                    if (!Number.isFinite(pixels) || pixels > 40000000)
                        throw new Error('Image exceeds the 40-megapixel source limit');
                    decodedDimensions.set(ref.id, pixels);
                    img.src = '';
                }
                catch (e) {
                    errors.push(asIssue('IMAGE_DECODE_FAILED', 'Cannot read image ' + ref.name + ' [' + ref.id + ']: ' + e.message, null, ref.id));
                }
            }
            for (const page of pages) {
                const unique = new Set();
                for (const p of page.panels || [])
                    for (const layer of p.layers || [])
                        unique.add(layer.assetId);
                for (const layer of page.overlays || [])
                    unique.add(layer.assetId);
                let sourcePixels = 0;
                for (const id of unique)
                    sourcePixels += decodedDimensions.get(id) || 0;
                if (sourcePixels > 64000000) {
                    errors.push(asIssue('SOURCE_MEMORY_LIMIT', 'Images on page ' + page.id + ' exceed the safe 64-megapixel memory budget', page.id));
                }
                const ps = PS.get(page.panelSetId);
                try {
                    warnings.push(...outputSize(ps, opts, 2).warnings.map(w => ({ ...w, pageId: page.id })));
                }
                catch (e) {
                    errors.push(asIssue('INVALID_RESOLUTION', e.message, page.id));
                }
            }
            return { valid: errors.length === 0, errors, warnings, pages: result.pages };
        }
        function canvasToBlob(canvas, mime, quality) {
            return new Promise(function (resolve, reject) {
                canvas.toBlob(function (blob) {
                    if (blob)
                        resolve(blob);
                    else
                        reject(new Error('canvas.toBlob returned null'));
                }, mime, quality);
            });
        }
        /* VP1-083: write a valid PNG pHYs chunk, so other programs see the actual
         * effective DPI rather than the browser's default 96 DPI metadata. */
        async function embedPngDpi(input, dpi) {
            const bytes = new Uint8Array(await input.arrayBuffer());
            const signature = [137, 80, 78, 71, 13, 10, 26, 10];
            if (bytes.length < 33 || signature.some((n, i) => bytes[i] !== n))
                throw Error('Invalid PNG byte signature');
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            if (view.getUint32(8) !== 13 || String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR')
                throw Error('PNG missing IHDR');
            const crc32 = (data) => {
                let crc = 0xffffffff;
                for (const b of data) {
                    crc ^= b;
                    for (let j = 0; j < 8; j++)
                        crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
                }
                return (crc ^ 0xffffffff) >>> 0;
            };
            const pxPerMeter = Math.round(dpi * 1000 / 25.4);
            const phy = new Uint8Array(21), v = new DataView(phy.buffer);
            v.setUint32(0, 9);
            phy.set([112, 72, 89, 115], 4);
            v.setUint32(8, pxPerMeter);
            v.setUint32(12, pxPerMeter);
            phy[16] = 1;
            v.setUint32(17, crc32(phy.subarray(4, 17)));
            const chunks = [bytes.subarray(0, 33), phy];
            let offset = 33, seenEnd = false, removed = 0;
            while (offset < bytes.length) {
                if (offset + 12 > bytes.length)
                    throw Error('Truncated PNG chunk');
                const size = view.getUint32(offset);
                if (size > bytes.length - offset - 12)
                    throw Error('Invalid PNG chunk length');
                const end = offset + size + 12;
                const name = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
                if (name !== 'pHYs')
                    chunks.push(bytes.subarray(offset, end));
                else
                    removed += end - offset;
                offset = end;
                if (name === 'IEND') {
                    seenEnd = true;
                    break;
                }
            }
            if (!seenEnd)
                throw Error('PNG missing IEND');
            const output = new Uint8Array(bytes.length + 21 - removed);
            let written = 0;
            for (const chunk of chunks) {
                output.set(chunk, written);
                written += chunk.length;
            }
            return new Blob([output], { type: 'image/png' });
        }
        function downloadBlob(filename, blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 6000);
        }
        function safeFileName(s) {
            return String(s || 'untitled')
                .replace(/[^\w\-]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 60) || 'untitled';
        }
        function getBoardName() {
            for (let i = 0; i < S.boards.length; i++) {
                if (S.boards[i].id === S.currentBoardId)
                    return S.boards[i].name || 'Board';
            }
            return 'Board';
        }
        function getProjectName() {
            return (S.meta && S.meta.name) || 'Project';
        }
        /* ============================================================
         * Canvas rendering of a single manga page
         * ============================================================ */
        async function renderPageToCanvas(inst, opts) {
            opts = opts || {};
            const checked = preflight.validate([inst]);
            if (!checked.valid)
                throw new Error('Page cannot be rendered: ' +
                    checked.errors.map(e => e.message).join('; '));
            const ps = PS.get(inst.panelSetId);
            const resolution = outputSize(ps, opts, 2);
            const quality = resolution.quality;
            const W = resolution.width, H = resolution.height;
            const only = opts.only || null;
            const images = opts.imageCache || new Map();
            let decodedPixels = 0;
            // Decode before creating a large canvas. Keep only current-page images.
            for (const ref of checked.assets) {
                if (images.has(ref.id))
                    continue;
                const img = await loadImage(ref.url);
                decodedPixels += img.naturalWidth * img.naturalHeight;
                if (img.naturalWidth * img.naturalHeight > 40000000 || decodedPixels > 64000000)
                    throw new Error('Images on page ' + inst.id + ' exceed the safe 64-megapixel memory budget');
                images.set(ref.id, img);
            }
            const canvas = document.createElement('canvas');
            canvas.width = W;
            canvas.height = H;
            const ctx = canvas.getContext('2d');
            if (!ctx)
                throw new Error('Browser could not allocate export canvas');
            if (!only) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, W, H);
            }
            // 3) Helper: draw a single layer
            function drawLayer(layer) {
                if (MP.getLayerNodeState(inst, 'image', layer.id)?.visible === false)
                    return;
                const img = images.get(layer.assetId);
                if (!img)
                    return;
                ctx.save();
                ctx.globalAlpha = (layer.opacity == null) ? 1 : layer.opacity;
                const lx = layer.x * quality;
                const ly = layer.y * quality;
                const lw = layer.width * quality;
                const lh = layer.height * quality;
                const limits = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1ViewLimits || {}) };
                // Keep View Limits fixed in page coordinates even when the image rotates.
                ctx.beginPath();
                ctx.rect(ps.width * limits.left * quality, ps.height * limits.top * quality, ps.width * (1 - limits.left - limits.right) * quality, ps.height * (1 - limits.top - limits.bottom) * quality);
                ctx.clip();
                if (layer.rotation) {
                    const cx = lx + lw / 2;
                    const cy = ly + lh / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate((layer.rotation || 0) * Math.PI / 180);
                    ctx.translate(-cx, -cy);
                }
                const crop = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1Crop || {}) };
                ctx.beginPath();
                ctx.rect(lx + lw * crop.left, ly + lh * crop.top, lw * (1 - crop.left - crop.right), lh * (1 - crop.top - crop.bottom));
                ctx.clip();
                ctx.drawImage(img, lx, ly, lw, lh);
                ctx.restore();
            }
            // 4–5) Use exact SVG paths when Path2D is available. Fallback to all
            // normalized contours (not just outer polygon), preserving fill rules.
            function tracePanel(panel) {
                const v = panel.vector;
                if (v && typeof Path2D === 'function') {
                    const path = new Path2D(v.d);
                    const m = v.matrix || [1, 0, 0, 1, 0, 0];
                    ctx.scale(quality, quality);
                    ctx.transform(...m);
                    return { path, fillRule: v.fillRule || panel.fillRule || 'nonzero', exact: true };
                }
                ctx.beginPath();
                for (const points of panel.contours || [panel.points]) {
                    points.forEach(function (pt, i) {
                        const x = pt.x * quality, y = pt.y * quality;
                        if (i === 0)
                            ctx.moveTo(x, y);
                        else
                            ctx.lineTo(x, y);
                    });
                    ctx.closePath();
                }
                return { path: null, fillRule: panel.fillRule || 'nonzero', exact: false };
            }
            /* VP1-043–051: one vector recipe for SVG preview and PNG/PDF output.
             * Path2D receives the same absolute page-space path as the renderer. */
            function drawMangaEffects(scope, panelId) {
                const effects = MP.listMangaEffects(inst).filter(e => e.scope === scope &&
                    (scope === 'page' || e.panelId === panelId) &&
                    (!only || (scope === 'page' && only.kind === 'effect' && only.id === e.id) || (scope === 'panel' && only.kind === 'panel')) &&
                    MP.getLayerNodeState(inst, 'drawing', e.id)?.visible !== false);
                if (!effects.length)
                    return;
                ctx.save();
                ctx.setTransform(quality, 0, 0, quality, 0, 0);
                for (const fx of effects) {
                    for (const item of MP.mangaEffectPrimitives(fx)) {
                        const path = new Path2D(item.d);
                        ctx.save();
                        ctx.globalAlpha = item.opacity;
                        if (item.fill !== 'none') {
                            ctx.fillStyle = item.fill;
                            ctx.fill(path);
                        }
                        if (item.stroke !== 'none' && item.strokeWidth > 0) {
                            ctx.strokeStyle = item.stroke;
                            ctx.lineWidth = item.strokeWidth;
                            ctx.lineJoin = 'round';
                            ctx.lineCap = 'round';
                            ctx.stroke(path);
                        }
                        ctx.restore();
                    }
                }
                ctx.restore();
            }
            ps.panels.forEach(function (panel) {
                if (only && !(only.kind === 'panel' && only.id === panel.id))
                    return;
                if (MP.getLayerNodeState(inst, 'panel', panel.id)?.visible === false)
                    return;
                ctx.save();
                const shape = tracePanel(panel);
                if (shape.path) {
                    ctx.clip(shape.path, shape.fillRule);
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                }
                else
                    ctx.clip(shape.fillRule);
                const panelStyle = { fill: 'none', stroke: '#1a1a1a', strokeWidth: 5,
                    fillOpacity: 1, strokeOpacity: 1, ...(panel.vp1Style || {}) };
                if (panelStyle.fill !== 'none' && panelStyle.fillOpacity > 0) {
                    ctx.save();
                    ctx.fillStyle = panelStyle.fill;
                    ctx.globalAlpha = panelStyle.fillOpacity;
                    ctx.fillRect(0, 0, W, H);
                    ctx.restore();
                }
                const instPanel = (inst.panels || []).find(p => p.id === panel.id);
                if (instPanel) {
                    const sorted = (instPanel.layers || []).slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                    for (const layer of sorted)
                        drawLayer(layer);
                }
                drawMangaEffects('panel', panel.id);
                ctx.restore();
            });
            ctx.save();
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'butt';
            for (const panel of ps.panels) {
                if (only && !(only.kind === 'panel' && only.id === panel.id))
                    continue;
                if (MP.getLayerNodeState(inst, 'panel', panel.id)?.visible === false)
                    continue;
                ctx.save();
                const st = { fill: 'none', stroke: '#1a1a1a', strokeWidth: 5,
                    fillOpacity: 1, strokeOpacity: 1, ...(panel.vp1Style || {}) };
                if (st.stroke === 'none' || st.strokeWidth === 0 || st.strokeOpacity === 0) {
                    ctx.restore();
                    continue;
                }
                const shape = tracePanel(panel);
                ctx.strokeStyle = st.stroke;
                ctx.globalAlpha = st.strokeOpacity;
                ctx.lineWidth = shape.exact ? st.strokeWidth : st.strokeWidth * quality;
                if (shape.path)
                    ctx.stroke(shape.path);
                else
                    ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
            // Page-wide manga effects are below overlay image layers and above panel borders.
            const showOverlay = MP.getLayerNodeState(inst, 'panel', '__overlay__')?.visible !== false;
            if (showOverlay && (!only || only.kind === 'effect'))
                drawMangaEffects('page');
            // 6) Draw overlay layers (no clip, on top of everything)
            const overlays = (inst.overlays || []).slice().sort(function (a, b) {
                return (a.zIndex || 0) - (b.zIndex || 0);
            });
            if (showOverlay)
                for (let i = 0; i < overlays.length; i++) {
                    if (only && !(only.kind === 'overlay' && only.id === overlays[i].id))
                        continue;
                    drawLayer(overlays[i]);
                }
            /* VP1-061: same vector paths and text layout for PNG and PDF;
             * balloons are above overlay images and clipped to the page canvas. */
            ctx.save();
            ctx.setTransform(quality, 0, 0, quality, 0, 0);
            for (const b of MP.listBalloons(inst)) {
                if (only && !(only.kind === 'balloon' && only.id === b.id))
                    continue;
                if (!showOverlay || MP.getLayerNodeState(inst, 'balloon', b.id)?.visible === false)
                    continue;
                ctx.save();
                if (b.rotation) {
                    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate(b.rotation * Math.PI / 180);
                    ctx.translate(-cx, -cy);
                }
                for (const primitive of MP.balloonPaths(b)) {
                    const p = new Path2D(primitive.d);
                    ctx.save();
                    ctx.globalAlpha = primitive.opacity;
                    if (primitive.fill !== 'none') {
                        ctx.fillStyle = primitive.fill;
                        ctx.fill(p);
                    }
                    if (primitive.stroke !== 'none' && primitive.strokeWidth > 0) {
                        ctx.strokeStyle = primitive.stroke;
                        ctx.lineWidth = primitive.strokeWidth;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.stroke(p);
                    }
                    ctx.restore();
                }
                if (b.text && !(only && only.noText)) {
                    const layout = MP.balloonTextLayout(b);
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = b.textColor;
                    ctx.font = layout.fontSize + 'px sans-serif';
                    for (let i = 0; i < layout.lines.length; i++)
                        ctx.fillText(layout.lines[i], layout.x, layout.y + i * layout.lineHeight, b.width * .8);
                }
                ctx.restore();
            }
            ctx.restore();
            /* VP1-068: same horizontalTextLayout() as SVG, painted above dialogue
             * balloons and overlays; PDF reuses this exact page Canvas output. */
            ctx.save();
            ctx.setTransform(quality, 0, 0, quality, 0, 0);
            for (const item of MP.listHorizontalTexts(inst)) {
                if (only && !(only.kind === 'text' && only.id === item.id))
                    continue;
                if (!showOverlay || MP.getLayerNodeState(inst, 'text', item.id)?.visible === false)
                    continue;
                ctx.save();
                if (item.rotation) {
                    const cx = item.x + item.width / 2, cy = item.y + item.height / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate(item.rotation * Math.PI / 180);
                    ctx.translate(-cx, -cy);
                }
                const layout = MP.horizontalTextLayout(item);
                ctx.textAlign = item.align;
                ctx.textBaseline = 'middle';
                ctx.font = (item.bold ? 'bold ' : '') + item.fontSize + 'px "' +
                    item.fontFamily + '"';
                ctx.globalAlpha = item.opacity;
                ctx.lineJoin = 'round';
                ctx.fillStyle = item.color;
                ctx.strokeStyle = item.outlineColor;
                ctx.lineWidth = item.outlineWidth;
                for (let i = 0; i < layout.lines.length; i++) {
                    const text = layout.lines[i];
                    const y = layout.y + i * layout.lineHeight;
                    if (item.outlineWidth > 0)
                        ctx.strokeText(text, layout.x, y, layout.maxWidth);
                    ctx.fillText(text, layout.x, y, layout.maxWidth);
                }
                ctx.restore();
            }
            ctx.restore();
            return { canvas: canvas, width: W, height: H, resolution: resolution, warnings: resolution.warnings };
        }
        /* VP1-038/040/042 — isolated transparent crop export.
         * The mask is SVG-exact (even-odd holes), intersected with page limits
         * and the non-destructive image source crop before rotation.
         * No other panels, layers, overlays or assets are rasterized.
         */
        async function exportCroppedLayer(inst, panelId, layerId, opts) {
            const started = performance.now();
            try {
                const ps = PS.get(inst.panelSetId);
                if (!ps)
                    throw Error('Missing panel set');
                const panel = ps.panels.find(p => p.id === panelId);
                const layer = inst.panels.find(p => p.id === panelId)?.layers.find(l => l.id === layerId);
                if (!panel || !layer)
                    throw Error('Layer or panel not found');
                const url = A.urls.get(layer.assetId);
                if (!url)
                    throw Error('Image data is not available');
                const image = await loadImage(url);
                if (image.naturalWidth * image.naturalHeight > 40000000)
                    throw Error('Image exceeds source safety budget');
                const points = panel.points;
                if (!points.length)
                    throw Error('Empty panel');
                const minX = Math.max(0, Math.floor(Math.min(...points.map(p => p.x)))), minY = Math.max(0, Math.floor(Math.min(...points.map(p => p.y)))), maxX = Math.min(ps.width, Math.ceil(Math.max(...points.map(p => p.x)))), maxY = Math.min(ps.height, Math.ceil(Math.max(...points.map(p => p.y))));
                const quality = opts?.quality ?? 1;
                if (!Number.isFinite(quality) || quality <= 0 || quality > 4)
                    throw Error('Unsupported crop export quality');
                const width = Math.max(1, Math.ceil((maxX - minX) * quality)), height = Math.max(1, Math.ceil((maxY - minY) * quality));
                if (width * height > 16000000 || width > 8192 || height > 8192)
                    throw Error('Crop export exceeds safe canvas limits');
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx)
                    throw Error('Cannot allocate canvas');
                ctx.setTransform(quality, 0, 0, quality, -minX * quality, -minY * quality);
                const vector = panel.vector;
                const rule = (vector?.fillRule || panel.fillRule || 'nonzero');
                if (vector && typeof Path2D === 'function') {
                    const path = new Path2D(vector.d);
                    const m = vector.matrix || [1, 0, 0, 1, 0, 0];
                    ctx.save();
                    ctx.transform(...m);
                    ctx.clip(path, rule);
                    ctx.restore();
                    // Restore above also removes clip. Apply clip with transformed Path2D.
                    const transformed = new Path2D();
                    transformed.addPath(path, new DOMMatrix(m));
                    ctx.clip(transformed, rule);
                }
                else {
                    ctx.beginPath();
                    for (const contour of panel.contours || [panel.points]) {
                        contour.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
                        ctx.closePath();
                    }
                    ctx.clip(rule);
                }
                const limits = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1ViewLimits || {}) };
                ctx.beginPath();
                ctx.rect(ps.width * limits.left, ps.height * limits.top, ps.width * (1 - limits.left - limits.right), ps.height * (1 - limits.top - limits.bottom));
                ctx.clip();
                const crop = { left: 0, top: 0, right: 0, bottom: 0, ...(layer.vp1Crop || {}) };
                ctx.save();
                const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
                ctx.translate(cx, cy);
                ctx.rotate((layer.rotation || 0) * Math.PI / 180);
                ctx.translate(-cx, -cy);
                ctx.beginPath();
                ctx.rect(layer.x + layer.width * crop.left, layer.y + layer.height * crop.top, layer.width * (1 - crop.left - crop.right), layer.height * (1 - crop.top - crop.bottom));
                ctx.clip();
                ctx.globalAlpha = layer.opacity ?? 1;
                ctx.drawImage(image, layer.x, layer.y, layer.width, layer.height);
                ctx.restore();
                const blob = await canvasToBlob(canvas, 'image/png', 1);
                canvas.width = 0;
                canvas.height = 0;
                const name = safeFileName(getProjectName()) + '-panel-' +
                    safeFileName(panelId) + '-crop.png';
                downloadBlob(name, blob);
                kernel.emit('toast', { message: 'Visible crop exported as transparent PNG', kind: 'ok' });
                return report(true, 'png', started, { width, height, bytes: blob.size, panelId, layerId }, [], [], [{ name, mimeType: 'image/png', size: blob.size, width, height, pages: 1 }]);
            }
            catch (error) {
                const errors = [asIssue('CROPPED_EXPORT_FAILED', error.message, inst?.id)];
                await showFailure(errors, opts);
                return report(false, 'png', started, { panelId, layerId }, errors, []);
            }
        }
        /* ============================================================
         * PNG export
         * ============================================================ */
        async function exportPng(inst, opts) {
            opts = opts || {};
            const started = performance.now();
            const quality = opts.quality == null ? 3 : opts.quality;
            const settings = opts.dpi === undefined ?
                { ...opts, quality } : { ...opts };
            const meta = { pagesRequested: 1, pagesExported: 0,
                qualityRequested: opts.dpi === undefined ? quality : opts.dpi / 96,
                dpiRequested: opts.dpi ?? null };
            let warnings = [];
            try {
                const inspection = await validateExport([inst], settings);
                warnings = inspection.warnings;
                if (!inspection.valid) {
                    await showFailure(inspection.errors, opts);
                    return report(false, 'png', started, meta, inspection.errors, warnings);
                }
                kernel.emit('manga-export:progress', { stage: 'render', current: 1, total: 1 });
                const result = await renderPageToCanvas(inst, settings);
                let blob;
                try {
                    blob = await canvasToBlob(result.canvas, 'image/png', 1);
                }
                finally {
                    result.canvas.width = 0;
                    result.canvas.height = 0;
                }
                if (opts.dpi !== undefined)
                    blob = await embedPngDpi(blob, result.resolution.dpiEffective);
                const boardPages = collectMangaPagesOnCurrentBoard();
                const index = boardPages.findIndex(page => page.id === inst.id);
                const name = safeFileName(getProjectName()) + ' - ' +
                    safeFileName(getBoardName()) + ' - page-' + (index >= 0 ? index + 1 : 1) + '.png';
                downloadBlob(name, blob);
                kernel.emit('toast', { message: 'Exported PNG (' + Math.round(blob.size / 1024) + ' KB)', kind: 'ok' });
                kernel.emit('manga-export:progress', { stage: 'complete', current: 1, total: 1 });
                return report(true, 'png', started, Object.assign(meta, {
                    pagesExported: 1, qualityEffective: result.resolution.quality,
                    dpiEffective: result.resolution.dpiEffective,
                    width: result.width, height: result.height, bytes: blob.size
                }), [], warnings, [{ name, mimeType: 'image/png', size: blob.size,
                        width: result.width, height: result.height, pages: 1 }]);
            }
            catch (err) {
                const errors = [asIssue('EXPORT_FAILED', err.message, inst && inst.id)];
                await showFailure(errors, opts);
                kernel.log.error('exportPng failed', err);
                return report(false, 'png', started, meta, errors, warnings);
            }
        }
        /* ============================================================
         * PDF writer (minimal PDF 1.4 with JPEG DCTDecode)
         * ============================================================ */
        function buildPdf(pageImages) {
            // pageImages: [{ jpegBlob, pw, ph, mediaW, mediaH }]
            const parts = [];
            let byteLen = 0;
            const offsets = {};
            const enc = new TextEncoder();
            function pushStr(s) {
                const b = enc.encode(s);
                parts.push(b);
                byteLen += b.byteLength;
            }
            function pushBlob(b) {
                parts.push(b);
                byteLen += b.size;
            }
            function startObj(num) { offsets[num] = byteLen; }
            // Header (5 binary comment bytes after "%PDF-1.4\n")
            const header = '%PDF-1.4\n';
            pushStr(header);
            pushStr('%\xFF\xFF\xFF\xFF\n');
            const N = pageImages.length;
            if (!N)
                throw new Error('No pages to export');
            // 1) Catalog
            startObj(1);
            pushStr('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
            // 2) Pages tree
            const kids = [];
            for (let i = 0; i < N; i++)
                kids.push(String(3 + i * 3) + ' 0 R');
            startObj(2);
            pushStr('2 0 obj\n<< /Type /Pages /Kids [' + kids.join(' ') +
                '] /Count ' + N + ' >>\nendobj\n');
            // 3) Per-page objects
            for (let i = 0; i < N; i++) {
                const pg = pageImages[i];
                const pageNum = 3 + i * 3;
                const contentNum = pageNum + 1;
                const imageNum = pageNum + 2;
                // Page dictionary
                startObj(pageNum);
                pushStr(pageNum + ' 0 obj\n' +
                    '<< /Type /Page /Parent 2 0 R ' +
                    '/MediaBox [0 0 ' + pg.mediaW + ' ' + pg.mediaH + '] ' +
                    '/Resources << /XObject << /Im0 ' + imageNum + ' 0 R >> >> ' +
                    '/Contents ' + contentNum + ' 0 R >>\nendobj\n');
                // Content stream: draw Im0 filling the page.
                // PDF origin is bottom-left; we flip vertically with [w 0 0 -h 0 h]
                const content = 'q\n' + pg.mediaW + ' 0 0 ' + (-pg.mediaH) + ' 0 ' +
                    pg.mediaH + ' cm\n/Im0 Do\nQ\n';
                const contentBytes = enc.encode(content);
                startObj(contentNum);
                pushStr(contentNum + ' 0 obj\n<< /Length ' + contentBytes.byteLength +
                    ' >>\nstream\n');
                parts.push(contentBytes);
                byteLen += contentBytes.byteLength;
                pushStr('\nendstream\nendobj\n');
                // Image XObject (JPEG)
                startObj(imageNum);
                pushStr(imageNum + ' 0 obj\n' +
                    '<< /Type /XObject /Subtype /Image ' +
                    '/Width ' + pg.pw + ' /Height ' + pg.ph + ' ' +
                    '/ColorSpace /DeviceRGB /BitsPerComponent 8 ' +
                    '/Filter /DCTDecode /Length ' + pg.jpegBlob.size + ' >>\nstream\n');
                pushBlob(pg.jpegBlob);
                pushStr('\nendstream\nendobj\n');
            }
            // xref
            const xrefStart = byteLen;
            const size = 3 + N * 3; // highest obj num + 1
            let xref = 'xref\n0 ' + size + '\n';
            xref += '0000000000 65535 f \n';
            for (let i = 1; i < size; i++) {
                const off = offsets[i] || 0;
                xref += String(off).padStart(10, '0') + ' 00000 n \n';
            }
            pushStr(xref);
            // trailer
            pushStr('trailer\n<< /Size ' + size + ' /Root 1 0 R >>\n' +
                'startxref\n' + xrefStart + '\n%%EOF\n');
            return new Blob(parts, { type: 'application/pdf' });
        }
        /* ============================================================
         * Chapter PDF export
         * ============================================================ */
        async function exportChapterPdf(pages, opts) {
            opts = opts || {};
            const started = performance.now();
            const requested = Array.isArray(pages) ? pages : [];
            const quality = opts.quality == null ? 2 : opts.quality;
            const settings = Object.assign({}, opts, { quality });
            const meta = { pagesRequested: requested.length, pagesExported: 0,
                qualityRequested: quality };
            let warnings = [];
            try {
                const jpegQuality = opts.jpegQuality == null ? .9 : Number(opts.jpegQuality);
                if (!Number.isFinite(jpegQuality) || jpegQuality < .5 || jpegQuality > 1)
                    throw new Error('JPEG quality must be between 0.5 and 1');
                const inspection = await validateExport(requested, settings);
                warnings = inspection.warnings;
                if (!inspection.valid) {
                    await showFailure(inspection.errors, opts);
                    return report(false, 'pdf', started, meta, inspection.errors, warnings);
                }
                const pageImages = [];
                let totalBytes = 0;
                // Sequential rasterization: only one uncompressed canvas is retained.
                for (let i = 0; i < requested.length; i++) {
                    const inst = requested[i];
                    kernel.emit('manga-export:progress', {
                        stage: 'render', current: i + 1, total: requested.length, pageId: inst.id
                    });
                    const rendered = await renderPageToCanvas(inst, settings);
                    let jpegBlob;
                    try {
                        jpegBlob = await canvasToBlob(rendered.canvas, 'image/jpeg', jpegQuality);
                    }
                    finally {
                        rendered.canvas.width = 0;
                        rendered.canvas.height = 0;
                    }
                    const ps = PS.get(inst.panelSetId);
                    totalBytes += jpegBlob.size;
                    // Guard against an unexpectedly huge single output file.
                    if (totalBytes > 128 * 1024 * 1024)
                        throw new Error('PDF exceeds the 128 MB compressed-image limit');
                    pageImages.push({ jpegBlob, pw: rendered.width, ph: rendered.height,
                        mediaW: ps.width, mediaH: ps.height });
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                kernel.emit('manga-export:progress', {
                    stage: 'pdf', current: requested.length, total: requested.length
                });
                const pdfBlob = buildPdf(pageImages);
                const name = safeFileName(getProjectName()) + ' - ' + safeFileName(getBoardName()) + '.pdf';
                downloadBlob(name, pdfBlob);
                kernel.emit('toast', {
                    message: 'Exported PDF (' + requested.length + ' pages, ' +
                        (pdfBlob.size / (1024 * 1024)).toFixed(1) + ' MB)', kind: 'ok'
                });
                kernel.emit('manga-export:progress', {
                    stage: 'complete', current: requested.length, total: requested.length
                });
                return report(true, 'pdf', started, Object.assign(meta, {
                    pagesExported: requested.length, bytes: pdfBlob.size,
                    qualityEffectiveByPage: pageImages.map(p => p.pw / p.mediaW)
                }), [], warnings, [{ name, mimeType: 'application/pdf', size: pdfBlob.size,
                        pages: requested.length }]);
            }
            catch (err) {
                const errors = [asIssue('EXPORT_FAILED', err.message)];
                await showFailure(errors, opts);
                kernel.log.error('exportChapterPdf failed', err);
                return report(false, 'pdf', started, meta, errors, warnings);
            }
        }
        /* ============================================================
         * Page collection helpers
         * ============================================================ */
        function collectMangaPagesOnCurrentBoard() {
            const b = (function () {
                for (let i = 0; i < S.boards.length; i++) {
                    if (S.boards[i].id === S.currentBoardId)
                        return S.boards[i];
                }
                return null;
            })();
            if (!b)
                return [];
            const pages = b.instances.filter(function (i) {
                return i.type === 'manga-page' && i.visible !== false;
            });
            // Reading order: top-to-bottom, then left-to-right.
            // Tolerance on Y: pages within ~30 px of each other are treated as the same row.
            pages.sort(function (a, b) {
                const dy = a.y - b.y;
                if (Math.abs(dy) > 30)
                    return dy;
                return a.x - b.x;
            });
            return pages;
        }
        /* ============================================================
         * UI flows
         * ============================================================ */
        async function exportSelectionAsPdf() {
            const selected = [];
            S.selection.forEach(function (id) {
                for (const board of S.boards || []) {
                    const page = (board.instances || []).find((i) => i.id === id && i.type === 'manga-page');
                    if (page && page.visible !== false)
                        selected.push(page);
                }
            });
            if (!selected.length)
                return exportWholeBoardAsPdf();
            selected.sort(function (a, b) {
                const dy = a.y - b.y;
                return Math.abs(dy) > 30 ? dy : a.x - b.x;
            });
            const ok = await D.confirm({
                title: 'Export ' + selected.length + ' page(s) as PDF?',
                message: 'Pages will be exported in reading order (top to bottom, left to right).',
                confirmText: 'Export PDF'
            });
            if (!ok)
                return report(false, 'pdf', performance.now(), {
                    pagesRequested: selected.length, pagesExported: 0, cancelled: true
                }, [], []);
            return await exportChapterPdf(selected, { quality: 2 });
        }
        async function exportWholeBoardAsPdf() {
            const pages = collectMangaPagesOnCurrentBoard();
            if (!pages.length) {
                const errors = [asIssue('NO_PAGES', 'No manga pages on this board')];
                await showFailure(errors, {});
                return report(false, 'pdf', performance.now(), {
                    pagesRequested: 0, pagesExported: 0
                }, errors, []);
            }
            const ok = await D.confirm({
                title: 'Export all pages on this board as PDF?',
                message: pages.length + ' page(s) will be exported in reading order.',
                confirmText: 'Export PDF'
            });
            if (!ok)
                return report(false, 'pdf', performance.now(), {
                    pagesRequested: pages.length, pagesExported: 0, cancelled: true
                }, [], []);
            return await exportChapterPdf(pages, { quality: 2 });
        }
        /**
         * Renders one page to an image Blob WITHOUT downloading (additive, v2.1). Runs the same preflight
         * and renderer as exportPng; never opens a dialog. `format:'jpeg'` is meant for previews.
         */
        async function renderPageToBlob(inst, opts) {
            const options = opts || {};
            const format = options.format === 'jpeg' ? 'jpeg' : 'png';
            const settings = options.dpi === undefined ?
                { ...options, quality: options.quality == null ? 3 : options.quality } : { ...options };
            delete settings.format;
            let warnings = [];
            try {
                const inspection = await validateExport([inst], settings);
                warnings = inspection.warnings;
                if (!inspection.valid)
                    return { success: false, errors: inspection.errors, warnings };
                const result = await renderPageToCanvas(inst, settings);
                let blob;
                try {
                    blob = format === 'jpeg'
                        ? await canvasToBlob(result.canvas, 'image/jpeg', options.jpegQuality == null ? 0.8 : options.jpegQuality)
                        : await canvasToBlob(result.canvas, 'image/png', 1);
                }
                finally {
                    result.canvas.width = 0;
                    result.canvas.height = 0;
                }
                if (format === 'png' && options.dpi !== undefined)
                    blob = await embedPngDpi(blob, result.resolution.dpiEffective);
                return { success: true, blob, mimeType: blob.type || ('image/' + format), width: result.width, height: result.height,
                    dpiEffective: result.resolution.dpiEffective, warnings, errors: [] };
            }
            catch (err) {
                return { success: false, errors: [asIssue('EXPORT_FAILED', err.message, inst && inst.id)], warnings };
            }
        }
        kernel.provide('mangaExport', {
            renderPageToBlob: renderPageToBlob,
            validateExport: validateExport,
            renderPageToCanvas: renderPageToCanvas,
            exportPng: exportPng,
            exportCroppedLayer: exportCroppedLayer,
            exportChapterPdf: exportChapterPdf,
            exportSelectionAsPdf: exportSelectionAsPdf,
            exportWholeBoardAsPdf: exportWholeBoardAsPdf,
            collectMangaPagesOnCurrentBoard: collectMangaPagesOnCurrentBoard
        });
    }
});
