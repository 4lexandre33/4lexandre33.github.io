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
    version: '1.1.0',
    needs: ['utils', 'state', 'mangaPage', 'panelSets', 'assets', 'ui.dialogs', 'mangaExportPreflight'],
    provides: ['mangaExport'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'mangaPage': '^1.0.0', 'panelSets': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0', 'mangaExportPreflight': '^1.0.0' },
    contractVersions: { 'mangaExport': '2.0.0' },
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
            const requested = opts.quality == null ? defaultQuality : Number(opts.quality);
            const maxPixels = opts.maxPixels == null ? 16000000 : Number(opts.maxPixels);
            const maxSide = opts.maxSide == null ? 8192 : Number(opts.maxSide);
            if (!Number.isFinite(requested) || requested <= 0 || requested > 4 ||
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
                        'x to respect canvas memory limits'
                });
            return { width, height, quality, qualityRequested: requested,
                pixels: width * height, maxPixels, maxSide, warnings };
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
            const images = new Map();
            let decodedPixels = 0;
            // Decode before creating a large canvas. Keep only current-page images.
            for (const ref of checked.assets) {
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
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, W, H);
            // 3) Helper: draw a single layer
            function drawLayer(layer) {
                const img = images.get(layer.assetId);
                if (!img)
                    return;
                ctx.save();
                ctx.globalAlpha = (layer.opacity == null) ? 1 : layer.opacity;
                const lx = layer.x * quality;
                const ly = layer.y * quality;
                const lw = layer.width * quality;
                const lh = layer.height * quality;
                if (layer.rotation) {
                    const cx = lx + lw / 2;
                    const cy = ly + lh / 2;
                    ctx.translate(cx, cy);
                    ctx.rotate((layer.rotation || 0) * Math.PI / 180);
                    ctx.translate(-cx, -cy);
                }
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
            ps.panels.forEach(function (panel) {
                ctx.save();
                const shape = tracePanel(panel);
                if (shape.path) {
                    ctx.clip(shape.path, shape.fillRule);
                    ctx.setTransform(1, 0, 0, 1, 0, 0);
                }
                else
                    ctx.clip(shape.fillRule);
                const instPanel = (inst.panels || []).find(p => p.id === panel.id);
                if (instPanel) {
                    const sorted = (instPanel.layers || []).slice().sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));
                    for (const layer of sorted)
                        drawLayer(layer);
                }
                ctx.restore();
            });
            ctx.save();
            ctx.strokeStyle = '#1a1a1a';
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'butt';
            for (const panel of ps.panels) {
                ctx.save();
                const shape = tracePanel(panel);
                ctx.lineWidth = shape.exact ? 5 : 5 * quality;
                if (shape.path)
                    ctx.stroke(shape.path);
                else
                    ctx.stroke();
                ctx.restore();
            }
            ctx.restore();
            // 6) Draw overlay layers (no clip, on top of everything)
            const overlays = (inst.overlays || []).slice().sort(function (a, b) {
                return (a.zIndex || 0) - (b.zIndex || 0);
            });
            for (let i = 0; i < overlays.length; i++)
                drawLayer(overlays[i]);
            return { canvas: canvas, width: W, height: H, resolution: resolution, warnings: resolution.warnings };
        }
        /* ============================================================
         * PNG export
         * ============================================================ */
        async function exportPng(inst, opts) {
            opts = opts || {};
            const started = performance.now();
            const quality = opts.quality == null ? 3 : opts.quality;
            const settings = Object.assign({}, opts, { quality });
            const meta = { pagesRequested: 1, pagesExported: 0, qualityRequested: quality };
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
                const blob = await canvasToBlob(result.canvas, 'image/png', 1);
                result.canvas.width = 0;
                result.canvas.height = 0; // release raster buffer
                const boardPages = collectMangaPagesOnCurrentBoard();
                const index = boardPages.findIndex(page => page.id === inst.id);
                const name = safeFileName(getProjectName()) + ' - ' +
                    safeFileName(getBoardName()) + ' - page-' + (index >= 0 ? index + 1 : 1) + '.png';
                downloadBlob(name, blob);
                kernel.emit('toast', { message: 'Exported PNG (' + Math.round(blob.size / 1024) + ' KB)', kind: 'ok' });
                kernel.emit('manga-export:progress', { stage: 'complete', current: 1, total: 1 });
                return report(true, 'png', started, Object.assign(meta, {
                    pagesExported: 1, qualityEffective: result.resolution.quality,
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
        kernel.provide('mangaExport', {
            validateExport: validateExport,
            renderPageToCanvas: renderPageToCanvas,
            exportPng: exportPng,
            exportChapterPdf: exportChapterPdf,
            exportSelectionAsPdf: exportSelectionAsPdf,
            exportWholeBoardAsPdf: exportWholeBoardAsPdf,
            collectMangaPagesOnCurrentBoard: collectMangaPagesOnCurrentBoard
        });
    }
});
