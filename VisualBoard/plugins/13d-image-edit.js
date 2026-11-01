"use strict";
/* Fase 23 — operações do editor de imagens sobre ativos: corte por grade, remoção de fundo, corte por cor de contorno e recorte.
 * A origem nunca é alterada: cada operação gera ativos derivados, todos numa única transação (um Desfazer). */
definePlugin({
    id: 'image-edit',
    version: '1.0.0',
    needs: ['imageEditCore', 'assets', 'state', 'backend', 'utils', 'history'],
    provides: ['imageEdit'],
    uses: ['app'],
    accepts: { imageEditCore: '^1.0.0', assets: '^1.0.0', state: '^1.0.0', backend: '^1.0.0', utils: '^1.0.0', history: '^1.0.0', app: '^1.0.0' },
    contractVersions: { imageEdit: '1.2.0' },
    setup: async function (kernel) {
        const core = await kernel.require('imageEditCore');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const backend = await kernel.require('backend');
        const utils = await kernel.require('utils');
        const H = await kernel.require('history');
        const LIMITS = { maxPixels: 16_000_000, maxCells: 400, maxBytes: 32 * 1024 * 1024, maxObjects: 100, maxBatch: 80 };
        const SUPPORTED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']);
        /* ------------------------------ erros e parâmetros ------------------------------ */
        function fail(code, message) { const e = new Error(message); e.code = code; throw e; }
        const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        function num(v, d, min, max, name, int = false) {
            if (v === undefined || v === null)
                return d;
            if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
                fail('INVALID_ARGUMENT', name + ' deve ser um número de ' + min + ' a ' + max);
            return int ? Math.round(v) : v;
        }
        function rgb(v, name) {
            if (!Array.isArray(v) || v.length !== 3 || v.some(c => typeof c !== 'number' || !Number.isFinite(c) || c < 0 || c > 255))
                fail('INVALID_ARGUMENT', name + ' deve ser [r, g, b] com valores de 0 a 255');
            return [Math.round(v[0]), Math.round(v[1]), Math.round(v[2])];
        }
        function known(p, keys, what) {
            for (const k of Object.keys(p))
                if (!keys.includes(k))
                    fail('INVALID_ARGUMENT', 'Parâmetro desconhecido em ' + what + ': ' + k);
        }
        const GRID_KEYS = ['rows', 'cols', 'gap', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'direction', 'trim'];
        const BG_KEYS = ['mode', 'color', 'tolerance', 'gradientStep', 'edgeSoft', 'trim', 'lineFloor'];
        const CONTOUR_KEYS = ['color', 'tolerance', 'close', 'others', 'mode', 'seeds', 'minArea', 'grow', 'feather', 'padding'];
        const CROP_KEYS = ['x', 'y', 'width', 'height'];
        const RECOLOR_KEYS = ['mode', 'pairs', 'color', 'outlineTo', 'fillTo', 'tolerance', 'keepShading'];
        const COMPOSE_KEYS = ['width', 'height', 'background', 'arrange', 'gap', 'margin', 'columns', 'layers'];
        const LAYER_KEYS = ['assetId', 'x', 'y', 'scale', 'width', 'height', 'rotation', 'flipH', 'flipV', 'opacity'];
        const MAX_LAYERS = 40;
        function oneOf(v, list, d, name) {
            if (v === undefined || v === null)
                return d;
            if (!list.includes(v))
                fail('INVALID_ARGUMENT', name + ' deve ser um de: ' + list.join(', '));
            return v;
        }
        function gridParams(raw, w, h) {
            const p = raw === undefined ? {} : raw;
            if (!isObj(p))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto');
            known(p, GRID_KEYS, 'grid');
            const out = {
                rows: num(p['rows'], 2, 1, 50, 'rows', true), cols: num(p['cols'], 2, 1, 50, 'cols', true), gap: num(p['gap'], 0, 0, 4000, 'gap', true),
                marginTop: num(p['marginTop'], 0, 0, 4000, 'marginTop', true), marginRight: num(p['marginRight'], 0, 0, 4000, 'marginRight', true),
                marginBottom: num(p['marginBottom'], 0, 0, 4000, 'marginBottom', true), marginLeft: num(p['marginLeft'], 0, 0, 4000, 'marginLeft', true),
                direction: oneOf(p['direction'], ['ltr', 'rtl'], 'ltr', 'direction'), trim: p['trim'] === true
            };
            if (out.rows * out.cols > LIMITS.maxCells)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxCells + ' células por grade');
            void w;
            void h;
            return out;
        }
        function backgroundParams(raw) {
            const p = raw === undefined ? {} : raw;
            if (!isObj(p))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto');
            known(p, BG_KEYS, 'removeBackground');
            return {
                mode: oneOf(p['mode'], ['edge', 'global', 'lineart'], 'edge', 'mode'),
                color: p['color'] === undefined || p['color'] === null ? null : rgb(p['color'], 'color'),
                tolerance: num(p['tolerance'], 12, 0, 100, 'tolerance'), gradientStep: num(p['gradientStep'], 0, 0, 30, 'gradientStep'),
                edgeSoft: num(p['edgeSoft'], 1, 0, 3, 'edgeSoft', true), trim: p['trim'] === true, lineFloor: num(p['lineFloor'], 0.08, 0, 0.5, 'lineFloor')
            };
        }
        function contourParams(raw, w, h) {
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto com a cor do contorno');
            known(raw, CONTOUR_KEYS, 'cutByContour');
            if (raw['color'] === undefined)
                fail('INVALID_ARGUMENT', 'color (cor do contorno) é obrigatória');
            const othersRaw = raw['others'] === undefined ? [] : raw['others'];
            if (!Array.isArray(othersRaw) || othersRaw.length > 8)
                fail('INVALID_ARGUMENT', 'others deve ser uma lista de até 8 cores');
            const seedsRaw = raw['seeds'] === undefined ? [] : raw['seeds'];
            if (!Array.isArray(seedsRaw) || seedsRaw.length > 50)
                fail('INVALID_ARGUMENT', 'seeds deve ser uma lista de até 50 pontos');
            const seeds = seedsRaw.map((s, i) => {
                if (!isObj(s))
                    fail('INVALID_ARGUMENT', 'seeds[' + i + '] deve ser {x, y}');
                return { x: num(s['x'], 0, 0, w - 1, 'seeds[' + i + '].x', true), y: num(s['y'], 0, 0, h - 1, 'seeds[' + i + '].y', true) };
            });
            return {
                color: rgb(raw['color'], 'color'), tolerance: num(raw['tolerance'], 25, 1, 80, 'tolerance'), close: num(raw['close'], 1, 0, 12, 'close', true),
                others: othersRaw.map((c, i) => rgb(c, 'others[' + i + ']')), mode: oneOf(raw['mode'], ['auto', 'single', 'behind'], 'auto', 'mode'),
                seeds, minArea: num(raw['minArea'], 64, 1, 1_000_000, 'minArea', true), grow: num(raw['grow'], 0, -50, 50, 'grow', true),
                feather: num(raw['feather'], 0, 0, 10, 'feather', true), padding: num(raw['padding'], 2, 0, 200, 'padding', true)
            };
        }
        function cropParams(raw, w, h) {
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'params deve ser {x, y, width, height}');
            known(raw, CROP_KEYS, 'crop');
            const x = num(raw['x'], 0, 0, w - 1, 'x', true), y = num(raw['y'], 0, 0, h - 1, 'y', true);
            const width = num(raw['width'], w - x, 1, w, 'width', true), height = num(raw['height'], h - y, 1, h, 'height', true);
            if (x + width > w || y + height > h)
                fail('INVALID_ARGUMENT', 'O recorte sai da imagem (' + w + '×' + h + ')');
            return { x, y, width, height };
        }
        function recolorParams(raw) {
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto');
            known(raw, RECOLOR_KEYS, 'recolor');
            const mode = oneOf(raw['mode'], ['replace', 'roles', 'uniform'], 'replace', 'mode');
            const pairsRaw = raw['pairs'] === undefined ? [] : raw['pairs'];
            if (!Array.isArray(pairsRaw) || pairsRaw.length > 16)
                fail('INVALID_ARGUMENT', 'pairs deve ser uma lista de até 16 pares {from, to}');
            const pairs = pairsRaw.map((q, i) => {
                if (!isObj(q))
                    fail('INVALID_ARGUMENT', 'pairs[' + i + '] deve ser {from, to}');
                return { from: rgb(q['from'], 'pairs[' + i + '].from'), to: rgb(q['to'], 'pairs[' + i + '].to') };
            });
            const opt = (v, name) => v === undefined || v === null ? null : rgb(v, name);
            const out = { mode, pairs, color: opt(raw['color'], 'color'), outlineTo: opt(raw['outlineTo'], 'outlineTo'), fillTo: opt(raw['fillTo'], 'fillTo'),
                tolerance: num(raw['tolerance'], 22, 1, 80, 'tolerance'), keepShading: raw['keepShading'] !== false };
            if (mode === 'replace' && !pairs.length)
                fail('INVALID_ARGUMENT', 'Informe ao menos um par {from, to} em pairs');
            if (mode === 'uniform' && !out.color)
                fail('INVALID_ARGUMENT', 'color (a cor única) é obrigatória em mode "uniform"');
            if (mode === 'roles' && !out.outlineTo && !out.fillTo)
                fail('INVALID_ARGUMENT', 'Informe outlineTo e/ou fillTo em mode "roles"');
            return out;
        }
        function composeParams(raw) {
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto com layers');
            known(raw, COMPOSE_KEYS, 'compose');
            const layersRaw = raw['layers'];
            if (!Array.isArray(layersRaw) || !layersRaw.length)
                fail('INVALID_ARGUMENT', 'layers deve ser uma lista com ao menos uma imagem');
            if (layersRaw.length > MAX_LAYERS)
                fail('INVALID_ARGUMENT', 'No máximo ' + MAX_LAYERS + ' imagens por montagem');
            const layers = layersRaw.map((l, i) => {
                if (!isObj(l))
                    fail('INVALID_ARGUMENT', 'layers[' + i + '] deve ser um objeto');
                known(l, LAYER_KEYS, 'layers[' + i + ']');
                assetOf(l['assetId']);
                const o = { assetId: l['assetId'] };
                if (l['x'] !== undefined)
                    o.x = num(l['x'], 0, -100000, 100000, 'layers[' + i + '].x');
                if (l['y'] !== undefined)
                    o.y = num(l['y'], 0, -100000, 100000, 'layers[' + i + '].y');
                if (l['scale'] !== undefined)
                    o.scale = num(l['scale'], 1, 0.01, 50, 'layers[' + i + '].scale');
                if (l['width'] !== undefined)
                    o.width = num(l['width'], 1, 1, 16000, 'layers[' + i + '].width');
                if (l['height'] !== undefined)
                    o.height = num(l['height'], 1, 1, 16000, 'layers[' + i + '].height');
                if (l['rotation'] !== undefined)
                    o.rotation = num(l['rotation'], 0, -360, 360, 'layers[' + i + '].rotation');
                if (l['flipH'] !== undefined)
                    o.flipH = l['flipH'] === true;
                if (l['flipV'] !== undefined)
                    o.flipV = l['flipV'] === true;
                if (l['opacity'] !== undefined)
                    o.opacity = num(l['opacity'], 1, 0, 1, 'layers[' + i + '].opacity');
                return o;
            });
            return { width: num(raw['width'], 0, 0, 16000, 'width', true), height: num(raw['height'], 0, 0, 16000, 'height', true),
                background: raw['background'] === undefined || raw['background'] === null ? null : rgb(raw['background'], 'background'),
                arrange: oneOf(raw['arrange'], ['none', 'row', 'column', 'grid'], 'none', 'arrange'),
                gap: num(raw['gap'], 0, 0, 2000, 'gap', true), margin: num(raw['margin'], 0, 0, 2000, 'margin', true), columns: num(raw['columns'], 0, 0, 40, 'columns', true), layers };
        }
        function defaults(op) {
            if (op === 'grid')
                return { rows: 3, cols: 3, gap: 0, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, direction: 'ltr', trim: false };
            if (op === 'removeBackground')
                return { mode: 'edge', color: null, tolerance: 12, gradientStep: 0, edgeSoft: 1, trim: false, lineFloor: 0.08 };
            if (op === 'cutByContour')
                return { color: [0, 0, 0], tolerance: 25, close: 1, others: [], mode: 'auto', seeds: [], minArea: 64, grow: 0, feather: 0, padding: 2 };
            if (op === 'recolor')
                return { mode: 'replace', pairs: [], color: null, outlineTo: null, fillTo: null, tolerance: 22, keepShading: true };
            if (op === 'compose')
                return { width: 0, height: 0, background: null, arrange: 'row', gap: 0, margin: 0, columns: 0, layers: [] };
            return { x: 0, y: 0, width: 1, height: 1 };
        }
        /* ------------------------------ ativos ------------------------------ */
        function assetOf(id) {
            if (typeof id !== 'string' || !id)
                fail('INVALID_ARGUMENT', 'assetId é obrigatório');
            const a = S.assets.find(x => x.id === id);
            if (!a)
                fail('ASSET_NOT_FOUND', 'Imagem não encontrada: ' + id);
            if (!SUPPORTED.has(a.mimeType || ''))
                fail('UNSUPPORTED_IMAGE', 'Tipo de imagem não suportado: ' + (a.mimeType || '?'));
            return a;
        }
        async function loadCanvas(asset) {
            let blob = A.blobs.get(asset.id);
            if (!(blob instanceof Blob))
                blob = await backend.get('blobs', asset.id);
            if (!(blob instanceof Blob) || !blob.size)
                fail('ASSET_NOT_FOUND', 'Arquivo da imagem indisponível: ' + asset.id);
            if (blob.size > LIMITS.maxBytes)
                fail('IMAGE_TOO_LARGE', 'A imagem passa de 32 MB');
            let bitmap;
            try {
                bitmap = await createImageBitmap(blob);
            }
            catch {
                return fail('UNSUPPORTED_IMAGE', 'Não foi possível decodificar a imagem');
            }
            if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > LIMITS.maxPixels) {
                bitmap.close();
                fail('IMAGE_TOO_LARGE', 'A imagem passa de 16 megapixels');
            }
            const canvas = document.createElement('canvas');
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                bitmap.close();
                fail('UNAVAILABLE', 'Canvas 2D indisponível');
            }
            ctx.drawImage(bitmap, 0, 0);
            bitmap.close();
            return canvas;
        }
        const newCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        const baseName = (a) => a.name.replace(/\.[^.]+$/, '');
        function cropOf(src, x, y, w, h) {
            const c = newCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.drawImage(src, x, y, w, h, 0, 0, w, h);
            return c;
        }
        /** Caixa do que não é transparente; null se a imagem for toda transparente. */
        function opaqueBox(rgba, w, h) {
            let x0 = w, y0 = h, x1 = -1, y1 = -1;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++)
                    if (rgba[(y * w + x) * 4 + 3] > 0) {
                        if (x < x0)
                            x0 = x;
                        if (x > x1)
                            x1 = x;
                        if (y < y0)
                            y0 = y;
                        if (y > y1)
                            y1 = y;
                    }
            return x1 < 0 ? null : { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
        }
        function imageOf(canvas) { return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height); }
        function canvasOf(rgba, w, h) {
            const c = newCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
            ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
            return c;
        }
        /* ------------------------------ operações ------------------------------ */
        function runGrid(src, asset, p, res) {
            const w = src.width, h = src.height;
            let xs, ys;
            try {
                xs = core.gridEdges(w, p.cols, p.marginLeft, p.marginRight, p.gap);
                ys = core.gridEdges(h, p.rows, p.marginTop, p.marginBottom, p.gap);
            }
            catch (e) {
                return fail('INVALID_ARGUMENT', e.message);
            }
            const base = baseName(asset), rtl = p.direction === 'rtl';
            for (let r = 0; r < p.rows; r++)
                for (let k = 0; k < p.cols; k++) {
                    const vc = rtl ? p.cols - 1 - k : k, [x0, x1] = xs[vc], [y0, y1] = ys[r];
                    let cx = x0, cy = y0, cw = x1 - x0, ch = y1 - y0;
                    let piece = cropOf(src, cx, cy, cw, ch);
                    if (p.trim) {
                        const img = imageOf(piece), box = opaqueBox(img.data, cw, ch);
                        if (!box) {
                            res.warnings.push('Célula r' + (r + 1) + 'c' + (k + 1) + ' está vazia e foi ignorada');
                            continue;
                        }
                        piece = cropOf(piece, box.x, box.y, box.width, box.height);
                        cx += box.x;
                        cy += box.y;
                        cw = box.width;
                        ch = box.height;
                    }
                    res.pieces.push({ name: base + '_r' + (r + 1) + 'c' + (k + 1), x: cx, y: cy, width: cw, height: ch, canvas: piece, info: { row: r + 1, col: k + 1 } });
                }
            res.diagnostics.cells = res.pieces.length;
        }
        function runBackground(src, asset, p, res) {
            const w = src.width, h = src.height, img = imageOf(src);
            const r = core.removeBackground(img.data, w, h, p);
            res.diagnostics.backgroundColor = r.color;
            res.diagnostics.backgroundCoverage = r.coverage;
            res.diagnostics.removedShare = Math.round(r.removedShare * 1000) / 1000;
            if (p.mode !== 'lineart' && !p.color && r.coverage < 0.6)
                res.warnings.push('O fundo não parece uniforme (' + Math.round(r.coverage * 100) + '% da borda tem a cor detectada); escolha a cor do fundo ou aumente a tolerância');
            if (r.removedShare < 0.001)
                res.warnings.push('Quase nada foi removido; aumente a tolerância ou escolha a cor do fundo');
            if (r.removedShare > 0.98)
                res.warnings.push('Quase tudo foi removido; reduza a tolerância');
            let out = canvasOf(r.out, w, h), x = 0, y = 0;
            if (p.trim) {
                const box = opaqueBox(r.out, w, h);
                if (box) {
                    out = cropOf(out, box.x, box.y, box.width, box.height);
                    x = box.x;
                    y = box.y;
                }
                else
                    res.warnings.push('A imagem ficou toda transparente');
            }
            res.pieces.push({ name: baseName(asset) + '_sem-fundo', x, y, width: out.width, height: out.height, canvas: out, info: { mode: p.mode } });
        }
        function runContour(src, asset, p, res) {
            const w = src.width, h = src.height, img = imageOf(src), data = img.data;
            const r = core.cutByContour(data, w, h, p);
            res.diagnostics.leak = r.leak;
            res.diagnostics.suggestBehind = r.suggestBehind;
            res.diagnostics.modeUsed = r.modeUsed;
            res.diagnostics.contourPixels = r.contourPixels;
            res.diagnostics.interiorRatio = r.interiorRatio;
            res.diagnostics.objects = r.objects.length;
            if (!r.contourPixels)
                res.warnings.push('Nenhum pixel com a cor do contorno; confira a cor ou aumente a tolerância');
            else if (r.leak)
                res.warnings.push('O contorno parece aberto (o preenchimento escapou). Aumente "fechar falhas" ou marque a cor de outros contornos que o cobrem');
            if (r.suggestBehind)
                res.warnings.push('Há outros contornos marcados e o modo "outro objeto cobre este" daria um recorte maior que contém este. Se algum objeto está na frente, use esse modo');
            if (r.objects.length > LIMITS.maxObjects) {
                res.warnings.push('Há mais de ' + LIMITS.maxObjects + ' objetos; mostrando os maiores');
                r.objects.length = LIMITS.maxObjects;
            }
            if (!r.objects.length && r.contourPixels && !r.leak)
                res.warnings.push('Nenhum objeto com área mínima encontrado');
            const base = baseName(asset);
            r.objects.forEach((o, idx) => {
                const alpha = core.boxAlpha(o.mask, o.bw, o.bh, p.feather);
                let x0 = o.bw, y0 = o.bh, x1 = -1, y1 = -1;
                for (let y = 0; y < o.bh; y++)
                    for (let x = 0; x < o.bw; x++)
                        if (alpha[y * o.bw + x]) {
                            if (x < x0)
                                x0 = x;
                            if (x > x1)
                                x1 = x;
                            if (y < y0)
                                y0 = y;
                            if (y > y1)
                                y1 = y;
                        }
                if (x1 < 0)
                    return;
                const pad = p.padding;
                const gx0 = Math.max(0, o.ox + x0 - pad), gy0 = Math.max(0, o.oy + y0 - pad), gx1 = Math.min(w - 1, o.ox + x1 + pad), gy1 = Math.min(h - 1, o.oy + y1 + pad);
                const cw = gx1 - gx0 + 1, ch = gy1 - gy0 + 1, out = new Uint8ClampedArray(cw * ch * 4);
                for (let y = 0; y < ch; y++)
                    for (let x = 0; x < cw; x++) {
                        const sx = gx0 + x, sy = gy0 + y, mx = sx - o.ox, my = sy - o.oy;
                        if (mx < 0 || my < 0 || mx >= o.bw || my >= o.bh)
                            continue;
                        const a = alpha[my * o.bw + mx];
                        if (!a)
                            continue;
                        const si = (sy * w + sx) * 4, di = (y * cw + x) * 4;
                        out[di] = data[si];
                        out[di + 1] = data[si + 1];
                        out[di + 2] = data[si + 2];
                        out[di + 3] = Math.round(data[si + 3] * a / 255);
                    }
                res.pieces.push({ name: base + '_objeto-' + (idx + 1), x: gx0, y: gy0, width: cw, height: ch, canvas: canvasOf(out, cw, ch), info: { object: idx + 1, area: o.area } });
            });
            /* Máscara colorida para mostrar na tela: traço, interior descartado e objeto escolhido. */
            const ov = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < w * h; i++) {
                const v = r.overlay[i];
                if (!v)
                    continue;
                const o = i * 4;
                if (v === 1) {
                    ov[o] = 255;
                    ov[o + 1] = 0;
                    ov[o + 2] = 200;
                    ov[o + 3] = 210;
                }
                else if (v === 2) {
                    ov[o] = 255;
                    ov[o + 1] = 200;
                    ov[o + 2] = 0;
                    ov[o + 3] = 70;
                }
                else {
                    ov[o] = 0;
                    ov[o + 1] = 220;
                    ov[o + 2] = 90;
                    ov[o + 3] = 120;
                }
            }
            res.overlay = canvasOf(ov, w, h);
        }
        function runCrop(src, asset, p, res) {
            res.pieces.push({ name: baseName(asset) + '_recorte', x: p.x, y: p.y, width: p.width, height: p.height, canvas: cropOf(src, p.x, p.y, p.width, p.height), info: {} });
        }
        function runRecolor(src, asset, p, res) {
            const w = src.width, h = src.height, img = imageOf(src);
            const r = core.recolor(img.data, w, h, p);
            res.diagnostics.changedShare = Math.round(r.changedShare * 1000) / 1000;
            if (r.roles) {
                res.diagnostics.outlineFrom = r.roles.outline;
                res.diagnostics.fillFrom = r.roles.fill;
                res.diagnostics.hasAlpha = r.roles.hasAlpha;
            }
            if (p.mode === 'roles' && r.roles) {
                if (p.outlineTo && !r.roles.outline)
                    res.warnings.push('Não foi possível identificar a cor do contorno; use o modo de pares e escolha a cor com o conta-gotas');
                if (p.fillTo && !r.roles.fill)
                    res.warnings.push('Não foi possível identificar a cor do preenchimento; use o modo de pares e escolha a cor com o conta-gotas');
                if (!r.roles.hasAlpha)
                    res.warnings.push('A imagem não tem transparência: o fundo ligado à borda foi preservado e o contorno foi estimado pela cor escura dominante. Remova o fundo antes para um resultado mais preciso');
            }
            if (p.mode === 'uniform') {
                /* o fundo ligado à borda de imagens sem transparência é preservado; sem aviso */
            }
            else if (r.changedShare < 0.0005)
                res.warnings.push('Quase nada foi alterado; aumente a tolerância ou escolha a cor com o conta-gotas');
            res.pieces.push({ name: baseName(asset) + '_cor', x: 0, y: 0, width: w, height: h, canvas: canvasOf(r.out, w, h), info: { mode: p.mode } });
        }
        async function runCompose(p, res) {
            const cache = new Map();
            try {
                for (const l of p.layers)
                    if (!cache.has(l.assetId))
                        cache.set(l.assetId, await loadCanvas(assetOf(l.assetId)));
                const boxes = p.layers.map(l => {
                    const c = cache.get(l.assetId);
                    let w = c.width, h = c.height;
                    if (l.width && l.height) {
                        w = l.width;
                        h = l.height;
                    }
                    else if (l.width) {
                        h = Math.max(1, Math.round(c.height * l.width / c.width));
                        w = l.width;
                    }
                    else if (l.height) {
                        w = Math.max(1, Math.round(c.width * l.height / c.height));
                        h = l.height;
                    }
                    else if (l.scale) {
                        w = Math.max(1, Math.round(c.width * l.scale));
                        h = Math.max(1, Math.round(c.height * l.scale));
                    }
                    return { c, l, w, h, x: l.x ?? 0, y: l.y ?? 0 };
                });
                if (p.arrange === 'row') {
                    let x = 0;
                    for (const b of boxes) {
                        b.x += x;
                        x += b.w + p.gap;
                    }
                }
                else if (p.arrange === 'column') {
                    let y = 0;
                    for (const b of boxes) {
                        b.y += y;
                        y += b.h + p.gap;
                    }
                }
                else if (p.arrange === 'grid') {
                    const cols = p.columns || Math.ceil(Math.sqrt(boxes.length)), rows = Math.ceil(boxes.length / cols);
                    const cw = Array(cols).fill(0), rh = Array(rows).fill(0);
                    boxes.forEach((b, i) => { const c = i % cols, r = Math.floor(i / cols); cw[c] = Math.max(cw[c], b.w); rh[r] = Math.max(rh[r], b.h); });
                    boxes.forEach((b, i) => {
                        const c = i % cols, r = Math.floor(i / cols);
                        const ox = cw.slice(0, c).reduce((s, v) => s + v + p.gap, 0), oy = rh.slice(0, r).reduce((s, v) => s + v + p.gap, 0);
                        b.x += ox + (cw[c] - b.w) / 2;
                        b.y += oy + (rh[r] - b.h) / 2;
                    });
                }
                /* caixa que envolve todas as imagens (com rotação) */
                let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
                for (const b of boxes) {
                    const a = (b.l.rotation || 0) * Math.PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a));
                    const bw = b.w * cs + b.h * sn, bh = b.w * sn + b.h * cs, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
                    x0 = Math.min(x0, cx - bw / 2);
                    y0 = Math.min(y0, cy - bh / 2);
                    x1 = Math.max(x1, cx + bw / 2);
                    y1 = Math.max(y1, cy + bh / 2);
                }
                const fitW = Math.ceil(x1 - x0) + 2 * p.margin, fitH = Math.ceil(y1 - y0) + 2 * p.margin;
                const W = p.width || fitW, H = p.height || fitH;
                if (W * H > LIMITS.maxPixels)
                    fail('IMAGE_TOO_LARGE', 'A montagem passa de 16 megapixels (' + W + '×' + H + ')');
                const offX = p.width ? 0 : p.margin - x0, offY = p.height ? 0 : p.margin - y0;
                const canvas = newCanvas(W, H), ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (p.background) {
                    ctx.fillStyle = 'rgb(' + p.background.join(',') + ')';
                    ctx.fillRect(0, 0, W, H);
                }
                ctx.imageSmoothingQuality = 'high';
                for (const b of boxes) {
                    ctx.save();
                    ctx.globalAlpha = b.l.opacity ?? 1;
                    ctx.translate(b.x + b.w / 2 + offX, b.y + b.h / 2 + offY);
                    ctx.rotate((b.l.rotation || 0) * Math.PI / 180);
                    ctx.scale(b.l.flipH ? -1 : 1, b.l.flipV ? -1 : 1);
                    ctx.drawImage(b.c, -b.w / 2, -b.h / 2, b.w, b.h);
                    ctx.restore();
                }
                res.diagnostics.cells = boxes.length;
                res.diagnostics.layout = boxes.map(b => ({ x: Math.round(b.x + offX), y: Math.round(b.y + offY), width: b.w, height: b.h }));
                res.width = W;
                res.height = H;
                const first = assetOf(p.layers[0].assetId);
                res.pieces.push({ name: baseName(first) + '_montagem', x: 0, y: 0, width: W, height: H, canvas, info: { images: boxes.length, arrange: p.arrange } });
            }
            finally {
                for (const c of cache.values()) {
                    c.width = 0;
                    c.height = 0;
                }
            }
        }
        /** Valida os parâmetros sem tocar nos pixels (usa só as dimensões do ativo). */
        function plan(assetId, op, params) {
            const asset = assetOf(assetId), w = asset.originalWidth || 0, h = asset.originalHeight || 0;
            if (!w || !h)
                fail('UNSUPPORTED_IMAGE', 'Dimensões da imagem desconhecidas');
            if (w * h > LIMITS.maxPixels)
                fail('IMAGE_TOO_LARGE', 'A imagem passa de 16 megapixels');
            return { op, width: w, height: h, params: normalize(op, params, w, h) };
        }
        function normalize(op, params, w, h) {
            if (op === 'grid')
                return gridParams(params, w, h);
            if (op === 'removeBackground')
                return backgroundParams(params);
            if (op === 'cutByContour')
                return contourParams(params, w, h);
            if (op === 'crop')
                return cropParams(params, w, h);
            if (op === 'recolor')
                return recolorParams(params);
            if (op === 'compose')
                return composeParams(params);
            return fail('INVALID_ARGUMENT', 'Operação desconhecida: ' + String(op));
        }
        /** Calcula o resultado sem gravar nada (prévia). As telas dos resultados pertencem a quem chamou. */
        async function preview(assetId, op, params) {
            const asset = assetOf(assetId);
            if (op === 'compose') {
                const p = composeParams(params);
                const res = { op, sourceAssetId: p.layers[0].assetId, width: 0, height: 0, pieces: [], diagnostics: {}, warnings: [], overlay: null };
                await runCompose(p, res);
                res.params = { ...p, layers: p.layers };
                return res;
            }
            const src = await loadCanvas(asset);
            try {
                const w = src.width, h = src.height, p = normalize(op, params, w, h);
                const res = { op, sourceAssetId: asset.id, width: w, height: h, pieces: [], diagnostics: {}, warnings: [], overlay: null };
                if (op === 'grid')
                    runGrid(src, asset, p, res);
                else if (op === 'removeBackground')
                    runBackground(src, asset, p, res);
                else if (op === 'cutByContour')
                    runContour(src, asset, p, res);
                else if (op === 'recolor')
                    runRecolor(src, asset, p, res);
                else
                    runCrop(src, asset, p, res);
                res.params = p;
                return res;
            }
            finally {
                src.width = 0;
                src.height = 0;
            }
        }
        function release(res) {
            for (const p of res.pieces) {
                p.canvas.width = 0;
                p.canvas.height = 0;
            }
            if (res.overlay) {
                res.overlay.width = 0;
                res.overlay.height = 0;
            }
        }
        const toBlob = (c) => new Promise((resolve, reject) => {
            try {
                c.toBlob(b => b ? resolve(b) : reject(Error('Falha ao codificar PNG')), 'image/png');
            }
            catch (e) {
                reject(e);
            }
        });
        /** Grava as peças escolhidas como ativos derivados, numa única transação (um Desfazer). */
        async function commit(result, indices, opts) {
            const original = assetOf(result.sourceAssetId);
            const pick = indices ?? result.pieces.map((_, i) => i);
            if (pick.some(i => !Number.isInteger(i) || i < 0 || i >= result.pieces.length))
                fail('INVALID_ARGUMENT', 'Índice de peça inválido');
            const pieces = [...new Set(pick)].map(i => result.pieces[i]);
            if (!pieces.length)
                fail('NO_RESULT', 'Nada para salvar: a operação não produziu imagens');
            const blobs = [];
            let total = 0;
            for (const p of pieces) {
                const b = await toBlob(p.canvas);
                if (!b.size)
                    fail('NO_RESULT', 'Imagem gerada vazia');
                total += b.size;
                blobs.push(b);
            }
            if (total > LIMITS.maxBytes * 4)
                fail('IMAGE_TOO_LARGE', 'O lote passa do limite de tamanho');
            const params = result.params;
            const metas = [];
            const taken = (n) => S.assets.some(a => a.name.toLowerCase() === n.toLowerCase()) || metas.some(a => a.name.toLowerCase() === n.toLowerCase());
            pieces.forEach((p, i) => {
                let name = p.name + '.png', n = 2;
                while (taken(name))
                    name = p.name + ' (' + (n++) + ').png';
                metas.push({ id: utils.uid('asset'), name, packageId: original.packageId, mimeType: 'image/png', originalWidth: p.width, originalHeight: p.height, size: blobs[i].size,
                    createdAt: Date.now(), updatedAt: Date.now(), derivedFrom: original.id,
                    operations: [{ processor: 'imageEdit', operation: result.op, params: { ...(isObj(params) ? params : {}), ...p.info, x: p.x, y: p.y } }] });
            });
            const persisted = [], urls = [];
            try {
                await H.transaction('imageEdit.' + result.op, async () => {
                    for (let i = 0; i < metas.length; i++) {
                        const m = metas[i], b = blobs[i];
                        if (backend.isAvailable()) {
                            await backend.put('blobs', m.id, b);
                            persisted.push(m.id);
                        }
                        const url = URL.createObjectURL(b);
                        urls.push(url);
                        A.blobs.set(m.id, b);
                        A.urls.set(m.id, url);
                        A.missing.delete(m.id);
                        S.assets.push(m);
                    }
                    kernel.emit('assets:changed');
                    kernel.emit('state:changed');
                });
            }
            catch (error) {
                for (const u of urls)
                    URL.revokeObjectURL(u);
                for (const m of metas) {
                    A.urls.delete(m.id);
                    A.blobs.delete(m.id);
                }
                S.assets = S.assets.filter(a => !metas.some(m => m.id === a.id));
                for (const id of persisted) {
                    try {
                        await backend.del('blobs', id);
                    }
                    catch (rollback) {
                        kernel.log.error('imageEdit rollback failed', rollback);
                    }
                }
                return fail('COMMIT_FAILED', error.message);
            }
            let saved = false;
            const warnings = result.warnings.slice();
            if (opts?.quiet)
                return { op: result.op, sourceAssetId: result.sourceAssetId, diagnostics: result.diagnostics, warnings, saved,
                    assets: metas.map((m, i) => ({ id: m.id, name: m.name, width: pieces[i].width, height: pieces[i].height, x: pieces[i].x, y: pieces[i].y })) };
            if (kernel.has('app')) {
                try {
                    saved = !!(await kernel.call('app', 'saveNow'));
                }
                catch (e) {
                    warnings.push('Falha ao salvar o projeto: ' + e.message);
                }
            }
            kernel.emit('toast', { message: metas.length === 1 ? 'Imagem criada: ' + metas[0].name : metas.length + ' imagens criadas', kind: 'ok' });
            return { op: result.op, sourceAssetId: result.sourceAssetId, diagnostics: result.diagnostics, warnings, saved,
                assets: metas.map((m, i) => ({ id: m.id, name: m.name, width: pieces[i].width, height: pieces[i].height, x: pieces[i].x, y: pieces[i].y })) };
        }
        /** Prévia + gravação (todas as peças ou só as escolhidas). */
        async function apply(assetId, op, params, indices) {
            const res = await preview(assetId, op, params);
            try {
                return await commit(res, indices);
            }
            finally {
                release(res);
            }
        }
        /**
         * Aplica a MESMA operação a várias imagens (ex.: trocar a cor ou tirar o fundo de todas as peças de uma grade),
         * num único passo de Desfazer. Uma imagem com problema não impede as demais: o erro dela volta em `results`.
         */
        async function applyBatch(assetIds, op, params, opts) {
            if (op === 'compose')
                fail('INVALID_ARGUMENT', 'A montagem usa várias imagens de uma vez; não existe em lote');
            const ids = [...new Set(assetIds)];
            if (!ids.length)
                fail('INVALID_ARGUMENT', 'Escolha pelo menos uma imagem');
            if (ids.length > LIMITS.maxBatch)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxBatch + ' imagens por lote');
            for (const id of ids)
                assetOf(id);
            const results = [];
            await H.transaction('imageEdit.batch.' + op, async () => {
                for (let i = 0; i < ids.length; i++) {
                    if (opts?.signal?.aborted)
                        break;
                    const id = ids[i];
                    try {
                        const res = await preview(id, op, params);
                        try {
                            const a = await commit(res, undefined, { quiet: true });
                            results.push({ sourceAssetId: id, ok: true, assets: a.assets, warnings: a.warnings });
                        }
                        finally {
                            release(res);
                        }
                    }
                    catch (e) {
                        results.push({ sourceAssetId: id, ok: false, error: e.message });
                    }
                    opts?.onProgress?.(i + 1, ids.length);
                }
            });
            const created = results.reduce((n, r) => n + (r.assets?.length ?? 0), 0), failed = results.filter(r => !r.ok).length;
            let saved = false;
            if (created && kernel.has('app')) {
                try {
                    saved = !!(await kernel.call('app', 'saveNow'));
                }
                catch (e) {
                    kernel.log.error('imageEdit batch save failed', e);
                }
            }
            if (created)
                kernel.emit('toast', { message: created + (created === 1 ? ' imagem criada' : ' imagens criadas') + (failed ? ' · ' + failed + ' com erro' : ''), kind: failed ? 'error' : 'ok' });
            return { op, total: ids.length, created, failed, saved, cancelled: !!opts?.signal?.aborted, results };
        }
        /** Cores dominantes da imagem (ajuda a escolher a cor do contorno e a do fundo). */
        async function analyze(assetId, max = 12) {
            const asset = assetOf(assetId), src = await loadCanvas(asset);
            try {
                const img = imageOf(src), n = num(max, 12, 1, 48, 'max', true);
                return { width: src.width, height: src.height, colors: core.dominantColors(img.data, src.width, src.height, n), background: core.estimateBackground(img.data, src.width, src.height, 12) };
            }
            finally {
                src.width = 0;
                src.height = 0;
            }
        }
        /** Cor de um pixel (conta-gotas). */
        async function colorAt(assetId, x, y) {
            const asset = assetOf(assetId), src = await loadCanvas(asset);
            try {
                const px = Math.round(x), py = Math.round(y);
                if (px < 0 || py < 0 || px >= src.width || py >= src.height)
                    return null;
                const d = src.getContext('2d', { willReadFrequently: true }).getImageData(px, py, 1, 1).data;
                return d[3] < 128 ? null : [d[0], d[1], d[2]];
            }
            finally {
                src.width = 0;
                src.height = 0;
            }
        }
        kernel.provide('imageEdit', { limits: () => ({ ...LIMITS }), defaults, plan, preview, commit, apply, applyBatch, release, analyze, colorAt });
    }
});
