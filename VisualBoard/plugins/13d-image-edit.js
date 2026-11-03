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
    contractVersions: { imageEdit: '1.7.0' },
    setup: async function (kernel) {
        const core = await kernel.require('imageEditCore');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const backend = await kernel.require('backend');
        const utils = await kernel.require('utils');
        const H = await kernel.require('history');
        const LIMITS = { maxPixels: 16_000_000, maxCells: 400, maxBytes: 32 * 1024 * 1024, maxObjects: 100, maxBatch: 80, maxZipFiles: 200, maxZipBytes: 200 * 1024 * 1024 };
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
        const GRID_KEYS = ['rows', 'cols', 'gap', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'direction', 'trim', 'colCuts', 'rowCuts', 'autoAdjust'];
        const BG_KEYS = ['mode', 'color', 'tolerance', 'gradientStep', 'edgeSoft', 'trim', 'lineFloor', 'holes'];
        const HOLE_KEYS = ['seeds', 'auto', 'maxArea', 'tolerance', 'suggest'];
        const CONTOUR_KEYS = ['color', 'tolerance', 'close', 'others', 'mode', 'seeds', 'minArea', 'grow', 'feather', 'padding'];
        const CROP_KEYS = ['x', 'y', 'width', 'height', 'unit'];
        const RECOLOR_KEYS = ['mode', 'pairs', 'color', 'outlineTo', 'fillTo', 'tolerance', 'keepShading'];
        const COMPOSE_KEYS = ['width', 'height', 'background', 'arrange', 'gap', 'margin', 'columns', 'layers'];
        const LAYER_KEYS = ['assetId', 'x', 'y', 'scale', 'width', 'height', 'fit', 'rotation', 'flipH', 'flipV', 'opacity'];
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
                direction: oneOf(p['direction'], ['ltr', 'rtl'], 'ltr', 'direction'), trim: p['trim'] === true,
                colCuts: null, rowCuts: null, autoAdjust: p['autoAdjust'] === true
            };
            if (out.rows * out.cols > LIMITS.maxCells)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxCells + ' células por grade');
            out.rowCuts = cutList(p['rowCuts'], out.rows - 1, 'rowCuts');
            const cc = p['colCuts'];
            if (cc === undefined || cc === null)
                out.colCuts = null;
            else if (Array.isArray(cc) && cc.every(v => typeof v === 'number')) {
                const one = cutList(cc, out.cols - 1, 'colCuts');
                out.colCuts = Array.from({ length: out.rows }, () => one.slice());
            }
            else if (Array.isArray(cc) && cc.length === out.rows)
                out.colCuts = cc.map((row, i) => cutList(row, out.cols - 1, 'colCuts[' + (i + 1) + ']'));
            else
                fail('INVALID_ARGUMENT', 'colCuts deve ser uma lista de ' + (out.cols - 1) + ' números (vale para todas as fileiras) ou uma lista por fileira (' + out.rows + ')');
            if (out.rowCuts || out.colCuts) {
                try {
                    core.gridLayout(w, h, out);
                }
                catch (e) {
                    fail('INVALID_ARGUMENT', e.message);
                }
            }
            return out;
        }
        /** Lista de cortes (frações 0–1, estritamente crescentes); null/undefined = uniforme. */
        function cutList(v, n, name) {
            if (v === undefined || v === null)
                return null;
            if (!Array.isArray(v) || v.length !== n)
                fail('INVALID_ARGUMENT', name + ' deve ter ' + n + ' números entre 0 e 1');
            let prev = 0;
            for (const x of v) {
                if (typeof x !== 'number' || !Number.isFinite(x) || x <= 0 || x >= 1)
                    fail('INVALID_ARGUMENT', name + ' aceita só números entre 0 e 1 (fração da imagem)');
                if (x <= prev)
                    fail('INVALID_ARGUMENT', name + ' deve estar em ordem crescente');
                prev = x;
            }
            return v.map(x => Math.round(x * 10000) / 10000);
        }
        function holeParams(raw, w, h) {
            if (raw === undefined || raw === null)
                return { seeds: [], auto: 'off', maxArea: 2, tolerance: 12, suggest: false };
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'holes deve ser um objeto');
            known(raw, HOLE_KEYS, 'holes');
            const sr = raw['seeds'] === undefined ? [] : raw['seeds'];
            if (!Array.isArray(sr) || sr.length > 50)
                fail('INVALID_ARGUMENT', 'holes.seeds deve ser uma lista de até 50 pontos');
            const seeds = sr.map((q, i) => {
                if (!isObj(q))
                    fail('INVALID_ARGUMENT', 'holes.seeds[' + i + '] deve ser {x, y}');
                const x = num(q['x'], NaN, 0, w - 1, 'holes.seeds[' + i + '].x', true), y = num(q['y'], NaN, 0, h - 1, 'holes.seeds[' + i + '].y', true);
                if (Number.isNaN(x) || Number.isNaN(y))
                    fail('INVALID_ARGUMENT', 'holes.seeds[' + i + '] precisa de x e y');
                return { x, y };
            });
            return { seeds, auto: oneOf(raw['auto'], ['off', 'small'], 'off', 'holes.auto'), maxArea: num(raw['maxArea'], 2, 0, 30, 'holes.maxArea'), tolerance: num(raw['tolerance'], 12, 0, 60, 'holes.tolerance'), suggest: raw['suggest'] === true };
        }
        function backgroundParams(raw, w, h) {
            const p = raw === undefined ? {} : raw;
            if (!isObj(p))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto');
            known(p, BG_KEYS, 'removeBackground');
            return {
                mode: oneOf(p['mode'], ['edge', 'global', 'lineart'], 'edge', 'mode'),
                color: p['color'] === undefined || p['color'] === null ? null : rgb(p['color'], 'color'),
                tolerance: num(p['tolerance'], 12, 0, 100, 'tolerance'), gradientStep: num(p['gradientStep'], 0, 0, 30, 'gradientStep'),
                edgeSoft: num(p['edgeSoft'], 1, 0, 3, 'edgeSoft', true), trim: p['trim'] === true, lineFloor: num(p['lineFloor'], 0.08, 0, 0.5, 'lineFloor'), holes: holeParams(p['holes'], w, h)
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
            if (oneOf(raw['unit'], ['px', 'percent'], 'px', 'unit') === 'percent') {
                /* Em %: vale para imagens de tamanhos diferentes (x/width em % da largura; y/height em % da altura). */
                const px = num(raw['x'], 0, 0, 99.99, 'x', false), py = num(raw['y'], 0, 0, 99.99, 'y', false);
                const pw = num(raw['width'], 100 - px, 0.01, 100, 'width', false), ph = num(raw['height'], 100 - py, 0.01, 100, 'height', false);
                if (px + pw > 100.0001 || py + ph > 100.0001)
                    fail('INVALID_ARGUMENT', 'O recorte em % sai da imagem');
                const x = Math.min(w - 1, Math.round(px / 100 * w)), y = Math.min(h - 1, Math.round(py / 100 * h));
                return { x, y, width: Math.max(1, Math.min(w - x, Math.round(pw / 100 * w))), height: Math.max(1, Math.min(h - y, Math.round(ph / 100 * h))) };
            }
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
                if (l['fit'] !== undefined)
                    o.fit = oneOf(l['fit'], ['stretch', 'contain', 'cover'], 'stretch', 'layers[' + i + '].fit');
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
                return { rows: 3, cols: 3, gap: 0, marginTop: 0, marginRight: 0, marginBottom: 0, marginLeft: 0, direction: 'ltr', trim: false, colCuts: null, rowCuts: null, autoAdjust: false };
            if (op === 'removeBackground')
                return { mode: 'edge', color: null, tolerance: 12, gradientStep: 0, edgeSoft: 1, trim: false, lineFloor: 0.08, holes: { seeds: [], auto: 'off', maxArea: 2, tolerance: 12, suggest: false } };
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
        function runGrid(src, asset, p0, res) {
            const w = src.width, h = src.height;
            let p = p0, L;
            const rgba = imageOf(src).data;
            if (p.autoAdjust) {
                const sg = core.suggestGridCuts(rgba, w, h, p);
                p = { ...p, colCuts: sg.colCuts, rowCuts: sg.rowCuts };
                res.diagnostics.gridMoved = sg.moved.length;
                if (sg.moved.length)
                    res.warnings.push('Ajuste automático: ' + sg.moved.length + (sg.moved.length === 1 ? ' divisória foi deslocada' : ' divisórias foram deslocadas') + ' para não cortar o desenho');
                if (!sg.reliable)
                    res.warnings.push('O fundo não é uniforme; o ajuste automático é uma estimativa');
                if (sg.after.length)
                    res.warnings.push(gridIssueText(sg.after, p));
                res.diagnostics.gridIssueList = sg.reliable ? sg.after : [];
            }
            else if (p.colCuts || p.rowCuts || p.rows * p.cols > 1) {
                const dg = core.diagnoseGrid(rgba, w, h, p);
                if (dg.issues.length && dg.reliable)
                    res.warnings.push(gridIssueText(dg.issues, p));
                res.diagnostics.gridIssues = dg.issues.length;
                res.diagnostics.gridIssueList = dg.reliable ? dg.issues : [];
            }
            try {
                L = core.gridLayout(w, h, p);
            }
            catch (e) {
                return fail('INVALID_ARGUMENT', e.message);
            }
            res.diagnostics.gridCuts = { colCuts: p.colCuts ?? core.defaultGridCuts(w, h, p).colCuts, rowCuts: p.rowCuts ?? core.defaultGridCuts(w, h, p).rowCuts };
            const base = baseName(asset), rtl = p.direction === 'rtl';
            for (let r = 0; r < p.rows; r++)
                for (let k = 0; k < p.cols; k++) {
                    const vc = rtl ? p.cols - 1 - k : k, cell = L.cells[r * p.cols + vc];
                    let cx = cell.x, cy = cell.y, cw = cell.width, ch = cell.height;
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
        /** Texto do aviso: qual divisória corta conteúdo e quais peças são afetadas. */
        function gridIssueText(issues, p) {
            const cells = new Set();
            for (const i of issues)
                for (const c of i.cells)
                    cells.add('r' + (c.r + 1) + 'c' + (p.direction === 'rtl' ? p.cols - c.c : c.c + 1));
            return 'Há conteúdo atravessando ' + issues.length + (issues.length === 1 ? ' divisória' : ' divisórias') + ' da grade (peças ' + [...cells].slice(0, 8).join(', ') + (cells.size > 8 ? '…' : '') + '); mova a divisória ou use o ajuste automático';
        }
        /** Mede onde a grade corta conteúdo, sem gravar nada. */
        async function gridDiagnose(assetId, params) {
            const asset = assetOf(assetId), src = await loadCanvas(asset);
            try {
                const w = src.width, h = src.height, p = gridParams(params, w, h), dg = core.diagnoseGrid(imageOf(src).data, w, h, p), def = core.defaultGridCuts(w, h, p);
                return { width: w, height: h, params: p, colCuts: p.colCuts ?? def.colCuts, rowCuts: p.rowCuts ?? def.rowCuts, reliable: dg.reliable, issues: dg.issues };
            }
            finally {
                src.width = 0;
                src.height = 0;
            }
        }
        /** Lista as áreas internas (fechadas, da cor do fundo) candidatas a serem apagadas; não grava nada. */
        async function backgroundHoles(assetId, params) {
            const asset = assetOf(assetId), src = await loadCanvas(asset);
            try {
                const w = src.width, h = src.height, p0 = backgroundParams(params, w, h), p = { ...p0, mode: 'edge', holes: { ...p0.holes, seeds: [], auto: 'off', suggest: true } };
                const r = core.removeBackground(imageOf(src).data, w, h, p);
                return { width: w, height: h, backgroundColor: r.color, candidates: r.holes.candidates };
            }
            finally {
                src.width = 0;
                src.height = 0;
            }
        }
        /** Sugere divisórias que cortam menos conteúdo; não altera nada (use o resultado em params.colCuts/rowCuts). */
        async function gridSuggest(assetId, params, opts) {
            const asset = assetOf(assetId), src = await loadCanvas(asset);
            try {
                const w = src.width, h = src.height, p = gridParams(params, w, h), win = num(opts?.window, 0.15, 0.01, 0.4, 'window');
                return { ...core.suggestGridCuts(imageOf(src).data, w, h, p, { window: win }), width: w, height: h };
            }
            finally {
                src.width = 0;
                src.height = 0;
            }
        }
        function runBackground(src, asset, p, res) {
            const w = src.width, h = src.height, img = imageOf(src);
            const r = core.removeBackground(img.data, w, h, p);
            res.diagnostics.backgroundColor = r.color;
            res.diagnostics.backgroundCoverage = r.coverage;
            res.diagnostics.removedShare = Math.round(r.removedShare * 1000) / 1000;
            if (p.mode !== 'lineart' && !p.color && r.coverage < 0.6)
                res.warnings.push('O fundo não parece uniforme (' + Math.round(r.coverage * 100) + '% da borda tem a cor detectada); escolha a cor do fundo ou aumente a tolerância');
            res.diagnostics.holeCandidates = r.holes.candidates;
            res.diagnostics.holesRemoved = r.holes.removed;
            for (const m of r.holes.warnings)
                res.warnings.push(m);
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
                const L = core.composeLayout(p.layers.map(l => { const c = cache.get(l.assetId); return { w: c.width, h: c.height }; }), p.layers, p);
                const W = L.width, H = L.height;
                if (W * H > LIMITS.maxPixels)
                    fail('IMAGE_TOO_LARGE', 'A montagem passa de 16 megapixels (' + W + '×' + H + ')');
                const canvas = newCanvas(W, H), ctx = canvas.getContext('2d');
                if (p.background) {
                    ctx.fillStyle = 'rgb(' + p.background.join(',') + ')';
                    ctx.fillRect(0, 0, W, H);
                }
                ctx.imageSmoothingQuality = 'high';
                p.layers.forEach((l, i) => {
                    const b = L.boxes[i], img = cache.get(l.assetId);
                    ctx.save();
                    ctx.globalAlpha = l.opacity ?? 1;
                    ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
                    ctx.rotate((b.rotation || 0) * Math.PI / 180);
                    if (b.clip) {
                        ctx.beginPath();
                        ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h);
                        ctx.clip();
                    }
                    ctx.scale(l.flipH ? -1 : 1, l.flipV ? -1 : 1);
                    ctx.drawImage(img, -b.dw / 2, -b.dh / 2, b.dw, b.dh);
                    ctx.restore();
                });
                res.diagnostics.cells = L.boxes.length;
                res.diagnostics.layout = L.boxes.map(b => ({ x: Math.round(b.x), y: Math.round(b.y), width: b.w, height: b.h }));
                res.width = W;
                res.height = H;
                const first = assetOf(p.layers[0].assetId);
                res.pieces.push({ name: baseName(first) + '_montagem', x: 0, y: 0, width: W, height: H, canvas, info: { images: L.boxes.length, arrange: p.arrange } });
            }
            finally {
                for (const c of cache.values()) {
                    c.width = 0;
                    c.height = 0;
                }
            }
        }
        /** Mede a montagem sem decodificar nem desenhar: usa só as dimensões dos ativos. */
        function composeLayout(params) {
            const p = composeParams(params), warnings = [];
            const sizes = p.layers.map(l => { const a = assetOf(l.assetId); if (!a.originalWidth || !a.originalHeight)
                fail('UNSUPPORTED_IMAGE', 'Dimensões da imagem desconhecidas: ' + l.assetId); return { w: a.originalWidth, h: a.originalHeight }; });
            const L = core.composeLayout(sizes, p.layers, p);
            if (L.width * L.height > LIMITS.maxPixels)
                warnings.push('A montagem passa de 16 megapixels (' + L.width + '×' + L.height + ') e não poderá ser salva');
            p.layers.forEach((l, i) => { const b = L.boxes[i]; if (b.x + b.w < 0 || b.y + b.h < 0 || b.x > L.width || b.y > L.height)
                warnings.push('A camada ' + (i + 1) + ' está fora da tela'); void l; });
            return { width: L.width, height: L.height, layout: L.boxes, warnings };
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
                return backgroundParams(params, w, h);
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
        /* ------------------------------ ampliar sem perda ------------------------------ */
        const SVG_MIME = 'image/svg+xml';
        function enlargeParams(raw) {
            const p = raw === undefined ? {} : raw;
            if (!isObj(p))
                fail('INVALID_ARGUMENT', 'params deve ser um objeto');
            const num = (k, min, max) => {
                const v = p[k];
                if (v === undefined)
                    return undefined;
                if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
                    fail('INVALID_ARGUMENT', k + ' deve ser um número entre ' + min + ' e ' + max);
                return v;
            };
            const t = {};
            const scale = num('scale', 1, 64), width = num('width', 1, 64000), height = num('height', 1, 64000), longSide = num('longSide', 1, 64000), cm = num('cm', 0.1, 1000), dpi = num('dpi', 30, 2400), fw = num('fitWidth', 1, 64000), fh = num('fitHeight', 1, 64000);
            const given = [scale, width, height, longSide, cm, (fw !== undefined && fh !== undefined) ? 1 : undefined].filter(v => v !== undefined).length;
            if (given !== 1)
                fail('INVALID_ARGUMENT', 'Informe exatamente um destino: scale, width, height, longSide, cm (com dpi) ou fitWidth+fitHeight');
            if (scale !== undefined)
                t.scale = scale;
            if (width !== undefined)
                t.width = width;
            if (height !== undefined)
                t.height = height;
            if (longSide !== undefined)
                t.longSide = longSide;
            if (cm !== undefined) {
                t.cm = cm;
                t.dpi = dpi ?? 300;
                const d = p['dimension'];
                if (d !== undefined && d !== 'width' && d !== 'height')
                    fail('INVALID_ARGUMENT', 'dimension deve ser width ou height');
                t.dimension = d === 'height' ? 'height' : 'width';
            }
            if (fw !== undefined && fh !== undefined) {
                t.fitWidth = fw;
                t.fitHeight = fh;
            }
            const format = p['format'] ?? 'png', method = p['method'] ?? 'auto', allowLossy = p['allowLossy'] ?? true;
            if (format !== 'png' && format !== 'svg')
                fail('INVALID_ARGUMENT', 'format deve ser png ou svg');
            if (method !== 'auto' && method !== 'vector' && method !== 'nearest' && method !== 'quality')
                fail('INVALID_ARGUMENT', 'method deve ser auto, vector, nearest ou quality');
            if (typeof allowLossy !== 'boolean')
                fail('INVALID_ARGUMENT', 'allowLossy deve ser verdadeiro ou falso');
            return { ...t, format, method, allowLossy };
        }
        /** Cede o controle ao navegador de tempos em tempos para a tela não congelar. */
        function slicer(signal) {
            let last = performance.now();
            return async () => { if (signal?.aborted)
                fail('CANCELLED', 'Cancelado'); if (performance.now() - last > 30) {
                await new Promise(r => setTimeout(r, 0));
                last = performance.now();
            } };
        }
        async function rasterizeSvg(svg, w, h) {
            const url = URL.createObjectURL(new Blob([svg], { type: SVG_MIME }));
            try {
                const img = new Image();
                img.src = url;
                try {
                    await img.decode();
                }
                catch {
                    fail('UNSUPPORTED_IMAGE', 'Não foi possível desenhar o SVG');
                }
                const c = newCanvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.drawImage(img, 0, 0, w, h);
                return c;
            }
            finally {
                URL.revokeObjectURL(url);
            }
        }
        function resampleCanvas(src, W, H) {
            let cur = src, owned = false;
            while (cur.width < W || cur.height < H) {
                const nw = Math.min(W, Math.max(cur.width, Math.round(cur.width * 2))), nh = Math.min(H, Math.max(cur.height, Math.round(cur.height * 2)));
                const c = newCanvas(nw, nh), ctx = c.getContext('2d', { willReadFrequently: true });
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(cur, 0, 0, nw, nh);
                if (owned) {
                    cur.width = 0;
                    cur.height = 0;
                }
                cur = c;
                owned = true;
            }
            return cur;
        }
        /** Núcleo da ampliação de UMA tela: escolhe o método, produz o arquivo e mede a fidelidade. */
        async function enlargeCanvas(src, p, tick) {
            const w = src.width, h = src.height, sz = core.enlargeSize(w, h, p, LIMITS.maxPixels);
            if (sz.error)
                fail('INVALID_ARGUMENT', sz.error);
            const wantSvgEarly = p.format === 'svg', rgba = imageOf(src).data, cls = core.classifyForEnlarge(rgba, w, h), warnings = [];
            const order = wantSvgEarly ? ['vector'] : p.method === 'auto' ? cls.recommend.slice() : [p.method === 'quality' ? 'resample' : p.method];
            const wantSvg = wantSvgEarly;
            if (wantSvg && p.method !== 'auto' && p.method !== 'vector')
                fail('INVALID_ARGUMENT', 'Para gerar SVG o método deve ser "vector" (ou automático)');
            let lastReason = '';
            for (const m of order) {
                if (wantSvg && m !== 'vector')
                    continue;
                if (m === 'vector') {
                    const v = await core.vectorize(rgba, w, h, { outWidth: sz.width, outHeight: sz.height, tick });
                    if (!v.ok) {
                        lastReason = v.reason ?? 'não vetorizável';
                        if (p.method === 'vector' || wantSvg)
                            fail('NOT_VECTORIZABLE', 'Não dá para vetorizar com fidelidade: ' + lastReason);
                        continue;
                    }
                    const back = await rasterizeSvg(v.svg, w, h), fid = core.fidelity(rgba, imageOf(back).data, w, h);
                    back.width = 0;
                    back.height = 0;
                    const limit = cls.kind === 'traco' ? 0.012 : 0.03;
                    if (fid.badShare > limit) {
                        lastReason = 'a cópia vetorial difere em ' + (fid.badShare * 100).toFixed(1) + '% dos pixels';
                        if (p.method === 'vector' || wantSvg)
                            fail('NOT_VECTORIZABLE', 'Fidelidade insuficiente: ' + lastReason);
                        continue;
                    }
                    if (wantSvg)
                        return { blob: new Blob([v.svg], { type: SVG_MIME }), mime: SVG_MIME, width: sz.width, height: sz.height, method: 'vector', loss: 'vetorial', fidelity: fid, paths: v.paths, warnings, ext: 'svg' };
                    const big = await rasterizeSvg(v.svg, sz.width, sz.height);
                    const blob = await toBlob(big);
                    big.width = 0;
                    big.height = 0;
                    return { blob, mime: 'image/png', width: sz.width, height: sz.height, method: 'vector', loss: 'vetorial', fidelity: fid, paths: v.paths, warnings, ext: 'png' };
                }
                if (m === 'nearest') {
                    if (!sz.integer) {
                        lastReason = 'o fator ' + sz.factor.toFixed(2) + ' não é inteiro';
                        if (p.method === 'nearest')
                            fail('INVALID_ARGUMENT', 'Ampliação exata exige fator inteiro (2×, 3×, 4×…); o pedido dá ' + sz.factor.toFixed(2) + '×');
                        continue;
                    }
                    const out = canvasOf(core.nearestInteger(rgba, w, h, sz.factor), sz.width, sz.height);
                    const blob = await toBlob(out);
                    out.width = 0;
                    out.height = 0;
                    if (cls.kind === 'foto')
                        warnings.push('Ampliação exata de uma foto: sem perda, mas fica quadriculada');
                    return { blob, mime: 'image/png', width: sz.width, height: sz.height, method: 'nearest', loss: 'nenhuma', warnings, ext: 'png' };
                }
                if (!p.allowLossy && p.method === 'auto')
                    fail('NO_LOSSLESS_METHOD', 'Nenhum método sem perda serve' + (lastReason ? ' (' + lastReason + ')' : '') + '. Use um fator inteiro ou permita a suavização.');
                const big = resampleCanvas(src, sz.width, sz.height);
                const blob = await toBlob(big);
                big.width = 0;
                big.height = 0;
                warnings.push('Ampliação suavizada: o detalhe novo é interpolado, não recuperado' + (lastReason ? ' (' + lastReason + ')' : ''));
                return { blob, mime: 'image/png', width: sz.width, height: sz.height, method: 'resample', loss: 'suavizada', warnings, ext: 'png' };
            }
            return fail('NO_LOSSLESS_METHOD', 'Nenhum método sem perda serve' + (lastReason ? ' (' + lastReason + ')' : '') + '. Use um fator inteiro ou permita a suavização.');
        }
        async function svgSourceCanvas(asset, p) {
            if (p.format === 'svg')
                fail('INVALID_ARGUMENT', 'A imagem já é SVG; escolha PNG para rasterizar em outro tamanho');
            let blob = A.blobs.get(asset.id);
            if (!(blob instanceof Blob))
                blob = await backend.get('blobs', asset.id);
            if (!(blob instanceof Blob) || !blob.size)
                fail('ASSET_NOT_FOUND', 'Arquivo da imagem indisponível: ' + asset.id);
            const w = asset.originalWidth || 0, h = asset.originalHeight || 0;
            if (!w || !h)
                fail('UNSUPPORTED_IMAGE', 'Dimensões do SVG desconhecidas');
            const sz = core.enlargeSize(w, h, p, LIMITS.maxPixels);
            if (sz.error)
                fail('INVALID_ARGUMENT', sz.error);
            const c = await rasterizeSvg(await blob.text(), sz.width, sz.height), out = await toBlob(c);
            c.width = 0;
            c.height = 0;
            return { blob: out, mime: 'image/png', width: sz.width, height: sz.height, method: 'vector', loss: 'vetorial', warnings: [], ext: 'png' };
        }
        async function enlargePlan(assetIds, raw) {
            const p = enlargeParams(raw), ids = [...new Set(assetIds)];
            if (!ids.length)
                fail('INVALID_ARGUMENT', 'Escolha pelo menos uma imagem');
            if (ids.length > LIMITS.maxBatch)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxBatch + ' imagens por lote');
            const items = [], warnings = [];
            for (const id of ids) {
                const a = S.assets.find(x => x.id === id);
                if (!a) {
                    items.push({ assetId: id, name: id, width: 0, height: 0, targetWidth: 0, targetHeight: 0, factor: 0, integer: false, kind: 'vazia', recommend: [], method: null, loss: null, notes: [], error: 'Imagem não encontrada' });
                    continue;
                }
                const base = { assetId: id, name: a.name, width: a.originalWidth || 0, height: a.originalHeight || 0, targetWidth: 0, targetHeight: 0, factor: 0, integer: false, kind: 'foto', recommend: [], method: null, loss: null, notes: [] };
                try {
                    if (a.mimeType === SVG_MIME) {
                        const sz = core.enlargeSize(base.width, base.height, p, LIMITS.maxPixels);
                        items.push({ ...base, kind: 'svg', targetWidth: sz.width, targetHeight: sz.height, factor: sz.factor, integer: sz.integer, method: 'vector', loss: 'vetorial', recommend: ['vector'], notes: ['SVG: desenhado direto no tamanho pedido, nítido', ...(sz.error ? [] : [])], ...(sz.error ? { error: sz.error } : {}) });
                        continue;
                    }
                    const canvas = await loadCanvas(assetOf(id));
                    try {
                        const sz = core.enlargeSize(canvas.width, canvas.height, p, LIMITS.maxPixels), cls = core.classifyForEnlarge(imageOf(canvas).data, canvas.width, canvas.height);
                        const notes = [];
                        let method = null, loss = null;
                        const pick = p.method === 'auto' ? cls.recommend : [p.method === 'quality' ? 'resample' : p.method];
                        for (const m of pick) {
                            if (p.format === 'svg' && m !== 'vector')
                                continue;
                            if (m === 'vector') {
                                method = 'vector';
                                loss = 'vetorial';
                                break;
                            }
                            if (m === 'nearest' && sz.integer) {
                                method = 'nearest';
                                loss = 'nenhuma';
                                break;
                            }
                            if (m === 'resample' && (p.allowLossy || p.method !== 'auto')) {
                                method = 'resample';
                                loss = 'suavizada';
                                break;
                            }
                        }
                        if (cls.kind === 'traco' || cls.kind === 'chapado')
                            notes.push('Arte de linha/cores chapadas: SVG recomendado (fidelidade é conferida ao gerar)');
                        if (cls.kind === 'reticula')
                            notes.push('Retícula (pontilhado): não vetorizar; use fator inteiro para ampliar sem perda');
                        if (cls.kind === 'foto')
                            notes.push('Foto/degradê: não existe ampliação sem perda além do fator inteiro (quadriculado); a suavização interpola');
                        if (cls.kind === 'pixelart')
                            notes.push('Pixel art: fator inteiro mantém cada pixel nítido');
                        if (!method && !sz.error)
                            notes.push('Sem método sem perda para este pedido; permita a suavização ou use um fator inteiro');
                        items.push({ ...base, width: canvas.width, height: canvas.height, targetWidth: sz.width, targetHeight: sz.height, factor: sz.factor, integer: sz.integer, kind: cls.kind, recommend: cls.recommend, method, loss, notes, ...(sz.error ? { error: sz.error } : {}) });
                    }
                    finally {
                        canvas.width = 0;
                        canvas.height = 0;
                    }
                }
                catch (e) {
                    items.push({ ...base, error: e.message });
                }
            }
            const total = items.reduce((n, i) => n + i.targetWidth * i.targetHeight, 0);
            if (total > 64_000_000)
                warnings.push('O lote soma ' + (total / 1e6).toFixed(0) + ' MP de saída; pode demorar e usar muita memória');
            return { items, warnings };
        }
        /** Grava os arquivos ampliados como ativos derivados, numa única transação (um Desfazer). */
        async function commitEnlarged(jobs, p, opts) {
            const tick = slicer(opts?.signal), results = [], made = [];
            const taken = (n) => S.assets.some(a => a.name.toLowerCase() === n.toLowerCase()) || made.some(m => m.meta.name.toLowerCase() === n.toLowerCase());
            let bytes = 0;
            for (let i = 0; i < jobs.length; i++) {
                if (opts?.signal?.aborted)
                    break;
                const job = jobs[i], src = assetOf2(job.sourceId);
                try {
                    const r = await job.produce(tick);
                    bytes += r.blob.size;
                    if (bytes > LIMITS.maxBytes * 4)
                        fail('IMAGE_TOO_LARGE', 'O lote passa do limite de tamanho');
                    const tag = r.method === 'vector' && r.ext === 'svg' ? '_vetor' : '_x' + (Number.isInteger(r.width / (job.srcW || 1)) ? String(r.width / (job.srcW || 1)) : r.width + 'px');
                    let name = job.name + tag + '.' + r.ext, n = 2;
                    while (taken(name))
                        name = job.name + tag + ' (' + (n++) + ').' + r.ext;
                    const meta = { id: utils.uid('asset'), name, packageId: src.packageId, mimeType: r.mime, originalWidth: r.width, originalHeight: r.height, size: r.blob.size, createdAt: Date.now(), updatedAt: Date.now(), derivedFrom: src.id,
                        operations: [{ processor: 'imageEdit', operation: 'enlarge', params: { method: r.method, loss: r.loss, format: r.ext, width: r.width, height: r.height } }] };
                    made.push({ meta, blob: r.blob, resultIndex: results.length });
                    results.push({ sourceAssetId: job.sourceId, ok: true, assetId: meta.id, name, width: r.width, height: r.height, method: r.method, format: r.ext === 'svg' ? 'svg' : 'png', loss: r.loss, ...(r.fidelity ? { fidelity: r.fidelity } : {}), ...(r.paths !== undefined ? { paths: r.paths } : {}), bytes: r.blob.size, warnings: r.warnings });
                }
                catch (e) {
                    if (e.code === 'CANCELLED')
                        break;
                    results.push({ sourceAssetId: job.sourceId, ok: false, error: e.message, warnings: [] });
                }
                opts?.onProgress?.(i + 1, jobs.length);
            }
            const persisted = [], urls = [];
            if (made.length) {
                try {
                    await H.transaction('imageEdit.enlarge', async () => {
                        for (const m of made) {
                            if (backend.isAvailable()) {
                                await backend.put('blobs', m.meta.id, m.blob);
                                persisted.push(m.meta.id);
                            }
                            const url = URL.createObjectURL(m.blob);
                            urls.push(url);
                            A.blobs.set(m.meta.id, m.blob);
                            A.urls.set(m.meta.id, url);
                            A.missing.delete(m.meta.id);
                            S.assets.push(m.meta);
                        }
                        kernel.emit('assets:changed');
                        kernel.emit('state:changed');
                    });
                }
                catch (error) {
                    for (const u of urls)
                        URL.revokeObjectURL(u);
                    for (const m of made) {
                        A.urls.delete(m.meta.id);
                        A.blobs.delete(m.meta.id);
                    }
                    S.assets = S.assets.filter(a => !made.some(m => m.meta.id === a.id));
                    for (const id of persisted) {
                        try {
                            await backend.del('blobs', id);
                        }
                        catch (rollback) {
                            kernel.log.error('enlarge rollback failed', rollback);
                        }
                    }
                    return fail('COMMIT_FAILED', error.message);
                }
            }
            let saved = false;
            if (made.length && kernel.has('app')) {
                try {
                    saved = !!(await kernel.call('app', 'saveNow'));
                }
                catch (e) {
                    kernel.log.error('enlarge save failed', e);
                }
            }
            const failed = results.filter(r => !r.ok).length;
            if (made.length)
                kernel.emit('toast', { message: made.length + (made.length === 1 ? ' imagem ampliada' : ' imagens ampliadas') + (failed ? ' · ' + failed + ' com erro' : ''), kind: failed ? 'error' : 'ok' });
            void p;
            return { total: jobs.length, created: made.length, failed, saved, cancelled: !!opts?.signal?.aborted, results };
        }
        /** Como assetOf, mas aceita SVG (origem de ampliação). */
        function assetOf2(id) {
            const a = S.assets.find(x => x.id === id);
            if (!a)
                fail('ASSET_NOT_FOUND', 'Imagem não encontrada: ' + id);
            return a;
        }
        async function enlarge(assetIds, raw, opts) {
            const p = enlargeParams(raw), ids = [...new Set(assetIds)];
            if (!ids.length)
                fail('INVALID_ARGUMENT', 'Escolha pelo menos uma imagem');
            if (ids.length > LIMITS.maxBatch)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxBatch + ' imagens por lote');
            for (const id of ids)
                assetOf2(id);
            const jobs = ids.map(id => {
                const a = assetOf2(id);
                return { sourceId: id, srcW: a.originalWidth || 1, name: baseName(a), produce: async (tick) => {
                        if (a.mimeType === SVG_MIME)
                            return svgSourceCanvas(a, p);
                        const c = await loadCanvas(assetOf(id));
                        try {
                            return await enlargeCanvas(c, p, tick);
                        }
                        finally {
                            c.width = 0;
                            c.height = 0;
                        }
                    } };
            });
            return commitEnlarged(jobs, p, opts);
        }
        /** Amplia peças ainda não salvas (resultado de qualquer aba) e grava só as ampliadas. */
        async function enlargeResult(result, indices, raw, opts) {
            const p = enlargeParams(raw);
            assetOf(result.sourceAssetId);
            const pick = indices ?? result.pieces.map((_, i) => i);
            if (!pick.length)
                fail('NO_RESULT', 'Nada para ampliar: a operação não produziu imagens');
            if (pick.some(i => !Number.isInteger(i) || i < 0 || i >= result.pieces.length))
                fail('INVALID_ARGUMENT', 'Índice de peça inválido');
            const jobs = [...new Set(pick)].map(i => { const piece = result.pieces[i]; return { sourceId: result.sourceAssetId, srcW: piece.width, name: piece.name, produce: (tick) => enlargeCanvas(piece.canvas, p, tick) }; });
            return commitEnlarged(jobs, p, opts);
        }
        /* ------------------------------ exportar em ZIP ------------------------------ */
        let crcTable = null;
        function crc32(data) {
            if (!crcTable) {
                crcTable = new Uint32Array(256);
                for (let i = 0; i < 256; i++) {
                    let c = i;
                    for (let k = 0; k < 8; k++)
                        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                    crcTable[i] = c >>> 0;
                }
            }
            let c = 0xffffffff;
            for (let i = 0; i < data.length; i++)
                c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
            return (c ^ 0xffffffff) >>> 0;
        }
        /** ZIP sem compressão (as imagens já são comprimidas), nomes em UTF-8. */
        function zipStore(files) {
            const enc = new TextEncoder(), parts = [], central = [];
            let offset = 0;
            for (const f of files) {
                const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
                const lh = new DataView(new ArrayBuffer(30));
                lh.setUint32(0, 0x04034b50, true);
                lh.setUint16(4, 20, true);
                lh.setUint16(6, 0x0800, true);
                lh.setUint16(12, 0x21, true);
                lh.setUint32(14, crc, true);
                lh.setUint32(18, size, true);
                lh.setUint32(22, size, true);
                lh.setUint16(26, name.length, true);
                parts.push(new Uint8Array(lh.buffer), name, f.data);
                const ch = new DataView(new ArrayBuffer(46));
                ch.setUint32(0, 0x02014b50, true);
                ch.setUint16(4, 20, true);
                ch.setUint16(6, 20, true);
                ch.setUint16(8, 0x0800, true);
                ch.setUint16(14, 0x21, true);
                ch.setUint32(16, crc, true);
                ch.setUint32(20, size, true);
                ch.setUint32(24, size, true);
                ch.setUint16(28, name.length, true);
                ch.setUint32(42, offset, true);
                central.push(new Uint8Array(ch.buffer), name);
                offset += 30 + name.length + size;
            }
            const cdSize = central.reduce((n, p) => n + p.length, 0), end = new DataView(new ArrayBuffer(22));
            end.setUint32(0, 0x06054b50, true);
            end.setUint16(8, files.length, true);
            end.setUint16(10, files.length, true);
            end.setUint32(12, cdSize, true);
            end.setUint32(16, offset, true);
            const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
            let at = 0;
            for (const p of all) {
                out.set(p, at);
                at += p.length;
            }
            return out;
        }
        const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp', 'image/avif': 'avif' };
        /** Reúne as imagens num ZIP (arquivos originais, sem recomprimir). Nomes seguros e únicos; nada é alterado no projeto. */
        async function buildZip(assetIds, opts) {
            const ids = [...new Set(assetIds)];
            if (!ids.length)
                fail('INVALID_ARGUMENT', 'Escolha pelo menos uma imagem para exportar');
            if (ids.length > LIMITS.maxZipFiles)
                fail('INVALID_ARGUMENT', 'No máximo ' + LIMITS.maxZipFiles + ' imagens por ZIP');
            const used = new Set(), files = [], info = [];
            let total = 0;
            for (const id of ids) {
                const a = assetOf(id), blob = A.blobs.get(id);
                if (!blob)
                    fail('ASSET_NOT_FOUND', 'A imagem "' + a.name + '" não tem dados carregados');
                total += blob.size;
                if (total > LIMITS.maxZipBytes)
                    fail('IMAGE_TOO_LARGE', 'O ZIP passaria de ' + Math.round(LIMITS.maxZipBytes / 1048576) + ' MB; exporte em partes');
                const ext = EXT[a.mimeType || ''] ?? 'png';
                let base = (a.name || id).replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim().slice(0, 100) || 'imagem';
                let name = base + '.' + ext, n = 2;
                while (used.has(name.toLowerCase()))
                    name = base + ' (' + (n++) + ').' + ext;
                used.add(name.toLowerCase());
                files.push({ name, data: new Uint8Array(await blob.arrayBuffer()) });
                info.push({ assetId: id, name, size: blob.size, width: a.originalWidth ?? 0, height: a.originalHeight ?? 0 });
            }
            const bytes = zipStore(files), copy = new Uint8Array(bytes.length);
            copy.set(bytes);
            const stem = (opts?.name ?? 'imagens-editadas').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\.zip$/i, '').trim().slice(0, 80) || 'imagens-editadas';
            return { blob: new Blob([copy.buffer], { type: 'application/zip' }), filename: stem + '.zip', count: files.length, files: info };
        }
        /** Gera o ZIP e dispara o download no navegador. */
        async function exportZip(assetIds, opts) {
            const z = await buildZip(assetIds, opts);
            const url = URL.createObjectURL(z.blob), a = document.createElement('a');
            a.href = url;
            a.download = z.filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 30000);
            kernel.emit('toast', { message: z.count + (z.count === 1 ? ' imagem exportada' : ' imagens exportadas') + ' em ' + z.filename, kind: 'ok' });
            return { filename: z.filename, size: z.blob.size, count: z.count, files: z.files };
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
        kernel.provide('imageEdit', { limits: () => ({ ...LIMITS }), defaults, plan, preview, commit, apply, applyBatch, buildZip, exportZip, release, analyze, colorAt, gridDiagnose, gridSuggest, backgroundHoles, composeLayout, enlargePlan, enlarge, enlargeResult });
    }
});
