"use strict";
/* Fase 23 — janela do editor de imagens: grade, remover fundo, corte por cor de contorno e recorte.
 * Toda a lógica de imagem está em imageEdit/imageEditCore; aqui só há interface (controles, prévia e lista de resultados). */
definePlugin({
    id: 'ui-image-editor',
    version: '1.0.0',
    needs: ['imageEdit', 'imageCommands', 'assets', 'state'],
    provides: ['ui.imageEditor'],
    uses: ['assetHub', 'ui.sceneBlocking'],
    accepts: { imageEdit: '^1.0.0', imageCommands: '^1.0.0', assets: '^1.0.0', state: '^1.0.0', assetHub: '^1.0.0', 'ui.sceneBlocking': '^1.0.0' },
    contractVersions: { 'ui.imageEditor': '1.2.0' },
    setup: async function (kernel) {
        const E = await kernel.require('imageEdit');
        const C = await kernel.require('imageCommands');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const TABS = [['grid', '▦ Grade'], ['bg', '◌ Fundo'], ['contour', '✂ Contorno'], ['crop', '⛶ Recorte'], ['color', '🎨 Cor'], ['compose', '🧩 Montar'], ['adjust', '🎚 Ajustes']];
        const toast = (message, kind = 'error') => { kernel.emit('toast', { message, kind }); };
        function el(tag, cls, text) {
            const e = document.createElement(tag);
            if (cls)
                e.className = cls;
            if (text !== undefined)
                e.textContent = text;
            return e;
        }
        const hex = (c) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
        const parseHex = (s) => {
            const m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
            if (!m)
                return null;
            const n = parseInt(m[1], 16);
            return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        };
        /* ---------------- estado ---------------- */
        let root = null;
        let assetId = null;
        let tab = 'grid';
        let src = null;
        let srcPixels = null;
        let palette = [];
        let result = null;
        let checked = new Set();
        let pick = null;
        let zoom = 0;
        let showBefore = false;
        let busy = false;
        let message = '';
        let token = 0;
        let timer = null;
        let canvas = null;
        let side = null;
        let resultsBox = null;
        let stageBox = null;
        let cropDrag = null;
        let gridSel = null;
        let gridDrag = null;
        let gridHist = [];
        let gridIssues = [];
        let gridNote = '';
        let liveL = null;
        let stageK = 1;
        let cdrag = null;
        let guides = { x: [], y: [] };
        let chist = [], cfut = [], lastC = 0;
        let sel = new Set();
        const bmpCache = new Map();
        let drawQueued = false;
        let recent = []; // últimas imagens salvas (para continuar editando)
        const rememberRecent = (ids) => { recent = [...ids.slice().reverse(), ...recent.filter(r => !ids.includes(r))].slice(0, 8); };
        const P = {
            grid: { rows: 3, cols: 3, gap: 0, margin: 0, direction: 'ltr', trim: false, colCuts: null, rowCuts: null, auto: false, segment: false },
            bg: { mode: 'edge', color: null, tolerance: 12, gradientStep: 0, edgeSoft: 1, trim: false,
                holes: { seeds: [], auto: 'off', maxArea: 2, tol: 12, show: false } },
            contour: { color: null, tolerance: 25, close: 1, others: [], mode: 'auto',
                seeds: [], grow: 0, feather: 0, padding: 2 },
            crop: { x: 0, y: 0, width: 1, height: 1 },
            color: { mode: 'roles', outlineTo: null, fillTo: null, pairs: [],
                color: [220, 30, 30], tolerance: 22, keepShading: true, pickIndex: 0 },
            compose: { layers: [], lock: true, center: false, fixed: false, arrange: 'none', gap: 0, margin: 0, columns: 0, width: 0, height: 0,
                bg: 'transparent', bgColor: [255, 255, 255], selected: 0 }
        };
        function paramsOf(t) {
            if (t === 'grid') {
                const g = P.grid;
                return { rows: g.rows, cols: g.cols, gap: g.gap, marginTop: g.margin, marginRight: g.margin, marginBottom: g.margin, marginLeft: g.margin, direction: g.direction, trim: g.trim,
                    ...(g.colCuts ? { colCuts: g.colCuts } : {}), ...(g.rowCuts ? { rowCuts: g.rowCuts } : {}), autoAdjust: g.auto };
            }
            if (t === 'bg') {
                const b = P.bg;
                return { mode: b.mode, ...(b.color ? { color: b.color } : {}), tolerance: b.tolerance, gradientStep: b.gradientStep, edgeSoft: b.edgeSoft, trim: b.trim,
                    ...(b.mode === 'edge' && (b.holes.seeds.length || b.holes.auto !== 'off' || b.holes.show) ? { holes: { seeds: b.holes.seeds, auto: b.holes.auto, maxArea: b.holes.maxArea, tolerance: b.holes.tol, suggest: b.holes.show } } : {}) };
            }
            if (t === 'contour') {
                const c = P.contour;
                return { color: c.color ?? [0, 0, 0], tolerance: c.tolerance, close: c.close, others: c.others, mode: c.mode, seeds: c.seeds, grow: c.grow, feather: c.feather, padding: c.padding };
            }
            if (t === 'color') {
                const c = P.color;
                if (c.mode === 'uniform')
                    return { mode: 'uniform', color: c.color };
                if (c.mode === 'pairs')
                    return { mode: 'replace', pairs: c.pairs.filter(q => q.from).map(q => ({ from: q.from, to: q.to })), tolerance: c.tolerance, keepShading: c.keepShading };
                return { mode: 'roles', ...(c.outlineTo ? { outlineTo: c.outlineTo } : {}), ...(c.fillTo ? { fillTo: c.fillTo } : {}), tolerance: c.tolerance, keepShading: c.keepShading };
            }
            if (t === 'compose') {
                const c = P.compose;
                return { width: c.width, height: c.height, background: c.bg === 'transparent' ? null : c.bg === 'white' ? [255, 255, 255] : c.bgColor, arrange: c.arrange, gap: c.gap, margin: c.margin, columns: c.columns, layers: c.layers.filter(l => !l.hidden).map(l => { const o = { ...l }; delete o.hidden; delete o.locked; return o; }) };
            }
            return { ...P.crop };
        }
        const opOf = (t) => t === 'grid' ? 'grid' : t === 'bg' ? 'removeBackground' : t === 'contour' ? 'cutByContour' : t === 'color' ? 'recolor' : t === 'compose' ? 'compose' : 'crop';
        /* ---------------- carregar imagem ---------------- */
        const usable = () => S.assets.filter(a => A.blobs.has(a.id));
        async function loadSource(id, opts) {
            assetId = id;
            src = null;
            srcPixels = null;
            palette = [];
            clearResult();
            resetGridCuts();
            P.bg.holes.seeds = [];
            const blob = A.blobs.get(id);
            if (!blob) {
                message = 'Imagem sem dados.';
                render();
                return;
            }
            try {
                const bmp = await createImageBitmap(blob);
                const c = document.createElement('canvas');
                c.width = bmp.width;
                c.height = bmp.height;
                c.getContext('2d').drawImage(bmp, 0, 0);
                bmp.close();
                src = c;
                P.crop = { x: 0, y: 0, width: c.width, height: c.height };
                P.contour.seeds = [];
                zoom = 0;
            }
            catch (e) {
                message = 'Não foi possível abrir a imagem: ' + e.message;
            }
            render();
            if (src) {
                void E.analyze(id, 10).then(a => { if (assetId === id) {
                    palette = a.colors;
                    if (!P.bg.color) { /* mantém detecção automática */ }
                    renderSide();
                } }, () => { });
                if (opts?.preview !== false)
                    schedule(0);
            }
        }
        function pixelAt(x, y) {
            if (!src || x < 0 || y < 0 || x >= src.width || y >= src.height)
                return null;
            if (!srcPixels)
                srcPixels = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, src.width, src.height);
            const i = (y * src.width + x) * 4, d = srcPixels.data;
            return [d[i], d[i + 1], d[i + 2]];
        }
        /* ---------------- prévia ---------------- */
        function clearResult() {
            token++;
            if (result) {
                E.release(result);
                result = null;
            }
            checked = new Set();
        }
        function schedule(delay = 220) {
            if (timer)
                clearTimeout(timer);
            const d = tab === 'compose' ? Math.max(delay, 500) : delay; // a montagem final (resolução cheia) só roda quando você para de mexer
            timer = window.setTimeout(() => { timer = null; void run(); }, d);
        }
        async function run() {
            if (!root || !assetId || !src)
                return;
            if (inAll())
                scheduleAllPreview(0);
            else if (allPrev.size)
                clearAllPrev();
            if (tab === 'adjust') {
                clearResult();
                message = '';
                renderResults();
                drawStage();
                return;
            }
            if (tab === 'contour' && !P.contour.color) {
                clearResult();
                message = 'Escolha a cor do contorno (conta-gotas ou uma cor da paleta).';
                renderResults();
                drawStage();
                return;
            }
            if (tab === 'color') {
                const c = P.color;
                if (c.mode === 'roles' && !c.outlineTo && !c.fillTo) {
                    clearResult();
                    message = 'Escolha a nova cor do contorno e/ou do preenchimento.';
                    renderResults();
                    drawStage();
                    return;
                }
                if (c.mode === 'pairs' && !c.pairs.some(q => q.from)) {
                    clearResult();
                    message = 'Adicione uma cor para trocar e escolha a cor original com o conta-gotas ou a paleta.';
                    renderResults();
                    drawStage();
                    return;
                }
            }
            if (tab === 'compose' && cdrag)
                return;
            if (tab === 'compose' && !P.compose.layers.some(l => !l.hidden)) {
                clearResult();
                message = 'Adicione imagens da biblioteca para montar.';
                renderResults();
                drawStage();
                return;
            }
            const mine = ++token;
            busy = true;
            message = '';
            renderResults();
            let res = null;
            try {
                res = await E.preview(tab === 'compose' ? P.compose.layers.find(l => !l.hidden).assetId : assetId, opOf(tab), paramsOf(tab));
            }
            catch (e) {
                if (mine === token) {
                    message = e.message;
                }
            }
            busy = false;
            if (mine !== token) {
                if (res)
                    E.release(res);
                return;
            }
            if (result)
                E.release(result);
            result = res;
            checked = new Set(res ? res.pieces.map((_, i) => i) : []);
            if (tab === 'grid')
                gridIssues = res?.diagnostics.gridIssueList ?? [];
            if (res && tab === 'bg' && !P.bg.color && res.diagnostics.backgroundColor) { /* cor detectada exibida na lateral */ }
            if (tab === 'compose') {
                renderResults();
                drawStage();
            }
            else {
                renderSide();
                renderResults();
                drawStage();
            }
        }
        /* ---------------- palco ---------------- */
        /** A montagem tem tela própria; nas outras abas o palco mostra a imagem aberta. */
        function stageDims() {
            if (tab === 'compose') {
                const L = composeLive();
                if (L)
                    return { w: L.width, h: L.height };
            }
            return { w: src?.width ?? 1, h: src?.height ?? 1 };
        }
        function scale() {
            if (!src)
                return 1;
            if (zoom > 0)
                return zoom;
            const d = stageDims(), box = stageBox;
            const aw = Math.max(80, (box?.clientWidth ?? 700) - 24), ah = Math.max(80, (box?.clientHeight ?? 500) - 24);
            return Math.min(8, aw / d.w, ah / d.h);
        }
        function drawStage() {
            if (!canvas || !src)
                return;
            const dims = stageDims(), w = dims.w, h = dims.h;
            stageK = tab === 'compose' ? Math.min(1, 2600 / Math.max(w, h)) : 1; // a montagem desenha na escala do palco, nunca na resolução cheia
            const bw = Math.max(1, Math.round(w * stageK)), bh = Math.max(1, Math.round(h * stageK));
            if (canvas.width !== bw || canvas.height !== bh) {
                canvas.width = bw;
                canvas.height = bh;
            }
            const s = scale();
            canvas.style.width = Math.round(w * s) + 'px';
            canvas.style.height = Math.round(h * s) + 'px';
            const ctx = canvas.getContext('2d');
            ctx.setTransform(stageK, 0, 0, stageK, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const lw = Math.max(1, 1.5 / s);
            if (tab === 'compose') {
                drawCompose(ctx, s, lw);
                return;
            }
            if ((tab === 'bg' || tab === 'color') && result && result.pieces[0] && !showBefore) {
                const p = result.pieces[0];
                ctx.drawImage(p.canvas, p.x, p.y);
                if (tab === 'bg')
                    drawHoleMarks(ctx, s, lw);
                return;
            }
            if (tab === 'crop') {
                ctx.globalAlpha = 0.35;
                ctx.drawImage(src, 0, 0);
                ctx.globalAlpha = 1;
                const c = P.crop;
                ctx.save();
                ctx.beginPath();
                ctx.rect(c.x, c.y, c.width, c.height);
                ctx.clip();
                ctx.drawImage(src, 0, 0);
                ctx.restore();
                ctx.strokeStyle = '#4da3ff';
                ctx.lineWidth = lw;
                ctx.strokeRect(c.x + lw / 2, c.y + lw / 2, c.width - lw, c.height - lw);
                return;
            }
            ctx.globalAlpha = tab === 'grid' || tab === 'contour' ? 0.4 : 1;
            ctx.drawImage(src, 0, 0);
            ctx.globalAlpha = 1;
            if (!result) {
                if (tab === 'grid')
                    drawGridHandles(ctx, s, lw);
                return;
            }
            if (tab === 'contour' && result.overlay) {
                ctx.globalAlpha = 0.55;
                ctx.drawImage(result.overlay, 0, 0);
                ctx.globalAlpha = 1;
            }
            result.pieces.forEach((p, i) => {
                if (tab !== 'bg' && tab !== 'color')
                    ctx.drawImage(p.canvas, p.x, p.y);
                ctx.strokeStyle = checked.has(i) ? '#4da3ff' : '#8a8f98';
                ctx.lineWidth = lw;
                ctx.setLineDash(checked.has(i) ? [] : [6 / s, 4 / s]);
                ctx.strokeRect(p.x + lw / 2, p.y + lw / 2, p.width - lw, p.height - lw);
                ctx.setLineDash([]);
                if (tab === 'grid' || tab === 'contour') {
                    ctx.fillStyle = '#4da3ff';
                    ctx.font = Math.max(10, 12 / s) + 'px sans-serif';
                    ctx.fillText(String(i + 1), p.x + 4 / s, p.y + 14 / s);
                }
            });
            if (tab === 'grid')
                drawGridHandles(ctx, s, lw);
            if (tab === 'contour') {
                ctx.fillStyle = '#ffd24d';
                ctx.strokeStyle = '#000';
                for (const sd of P.contour.seeds) {
                    ctx.beginPath();
                    ctx.arc(sd.x, sd.y, 5 / s, 0, 7);
                    ctx.fill();
                    ctx.lineWidth = 1 / s;
                    ctx.stroke();
                }
            }
        }
        function toImage(e) {
            const r = canvas.getBoundingClientRect(), d = stageDims();
            return { x: Math.floor((e.clientX - r.left) * d.w / r.width), y: Math.floor((e.clientY - r.top) * d.h / r.height) };
        }
        function onPointerDown(e) {
            if (!src)
                return;
            const pt = toImage(e);
            if (tab === 'grid' && !pick) {
                const hit = hitDivider(pt);
                if (!hit) {
                    if (gridSel) {
                        gridSel = null;
                        renderSide();
                        drawStage();
                    }
                    return;
                }
                gridSel = hit;
                canvas.focus({ preventScroll: true });
                const base = cloneCuts(effectiveCuts());
                pushGridHist();
                P.grid.auto = false;
                setCuts(base);
                gridDrag = { sel: hit, base, startPx: dividerPx(base, hit), segment: P.grid.segment !== e.shiftKey };
                canvas.setPointerCapture(e.pointerId);
                renderSide();
                drawStage();
                return;
            }
            if (pick) {
                const c = pixelAt(pt.x, pt.y);
                if (!c)
                    return;
                const kind = pick;
                pick = null;
                canvas.style.cursor = '';
                if (kind === 'hole') {
                    if (P.bg.holes.seeds.length < 50)
                        P.bg.holes.seeds.push({ x: pt.x, y: pt.y });
                    pick = 'hole';
                    canvas.style.cursor = 'crosshair';
                }
                else if (kind === 'bg')
                    P.bg.color = c;
                else if (kind === 'contour')
                    P.contour.color = c;
                else if (kind === 'other') {
                    if (P.contour.others.length < 8)
                        P.contour.others.push(c);
                }
                else if (kind === 'seed')
                    P.contour.seeds.push({ x: pt.x, y: pt.y });
                else if (kind === 'from') {
                    const q = P.color.pairs[P.color.pickIndex];
                    if (q)
                        q.from = c;
                }
                renderSide();
                schedule(0);
                return;
            }
            if (tab === 'compose') {
                composeDown(e);
                return;
            }
            if (tab === 'crop') {
                cropDrag = pt;
                canvas.setPointerCapture(e.pointerId);
                P.crop = { x: pt.x, y: pt.y, width: 1, height: 1 };
                drawStage();
            }
        }
        function onPointerMove(e) {
            if (gridDrag && src) {
                const pt = toImage(e), d = gridDrag, raw = d.sel.axis === 'h' ? pt.y : pt.x;
                const px = e.altKey ? raw : snapPx(d.sel, raw, Math.max(3, 7 / scale()), d.base, d.segment);
                moveDivider(d.sel, px, d.segment, d.base);
                drawStage();
                schedule(180);
                return;
            }
            if (tab === 'grid' && !pick && canvas && !cropDrag) {
                const h = hitDivider(toImage(e));
                canvas.style.cursor = h ? (h.axis === 'h' ? 'ns-resize' : 'ew-resize') : '';
            }
            if (tab === 'compose') {
                composeMove(e);
                return;
            }
            if (!cropDrag || !src)
                return;
            const pt = toImage(e), x0 = Math.max(0, Math.min(cropDrag.x, pt.x)), y0 = Math.max(0, Math.min(cropDrag.y, pt.y));
            const x1 = Math.min(src.width, Math.max(cropDrag.x, pt.x) + 1), y1 = Math.min(src.height, Math.max(cropDrag.y, pt.y) + 1);
            P.crop = { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
            drawStage();
        }
        function onPointerUp() { if (gridDrag) {
            gridDrag = null;
            renderSide();
            drawStage();
            schedule(0);
            return;
        } if (cdrag) {
            composeUp();
            return;
        } if (cropDrag) {
            cropDrag = null;
            renderSide();
            schedule(0);
        } }
        /* ---------------- áreas internas do fundo ---------------- */
        const holeList = () => P.bg.holes.show ? (result?.diagnostics.holeCandidates ?? []) : [];
        function drawHoleMarks(ctx, s, lw) {
            const H = P.bg.holes;
            for (const c of holeList()) {
                const likely = c.outer >= 0.7;
                ctx.save();
                ctx.strokeStyle = likely ? '#ff4da6' : '#4dd2ff';
                ctx.lineWidth = lw * 1.5;
                ctx.setLineDash([6 / s, 4 / s]);
                ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0 + 1, c.y1 - c.y0 + 1);
                ctx.restore();
                ctx.fillStyle = likely ? '#ff4da6' : '#4dd2ff';
                ctx.font = 'bold ' + Math.max(11, 13 / s) + 'px sans-serif';
                ctx.fillText(String(c.id), c.x0 + 3 / s, c.y0 + 13 / s);
            }
            for (const sd of H.seeds) {
                ctx.beginPath();
                ctx.arc(sd.x, sd.y, 5 / s, 0, 7);
                ctx.fillStyle = '#ffd24d';
                ctx.fill();
                ctx.lineWidth = 1 / s;
                ctx.strokeStyle = '#000';
                ctx.stroke();
            }
        }
        function holesPanel(box) {
            const H = P.bg.holes, panel = el('div', 'vbie-holes');
            panel.setAttribute('data-vbie', 'holes');
            panel.appendChild(el('p', 'vbie-note', 'Áreas fechadas dentro da figura (ex.: o vão do cotovelo) ficam como estão: o app não sabe se são "ar" ou "corpo". Clique nelas para apagar.'));
            const row = el('div', 'vbie-presets');
            const pk = el('button', 'btn' + (pick === 'hole' ? ' primary' : ''), (pick === 'hole' ? '● Clique nas áreas… (clique aqui para parar)' : '💧 Apagar área interna'));
            pk.type = 'button';
            pk.setAttribute('data-vbie', 'hole-pick');
            pk.title = 'Depois de ligar, cada clique na imagem apaga a área fechada que contém o ponto';
            pk.addEventListener('click', () => { pick = pick === 'hole' ? null : 'hole'; if (canvas)
                canvas.style.cursor = pick ? 'crosshair' : ''; renderSide(); });
            row.appendChild(pk);
            if (H.seeds.length) {
                const clr = el('button', 'btn', 'Limpar (' + H.seeds.length + ')');
                clr.type = 'button';
                clr.setAttribute('data-vbie', 'hole-clear');
                clr.addEventListener('click', () => { H.seeds = []; renderSide(); schedule(0); });
                const und = el('button', 'btn', '↶ Último');
                und.type = 'button';
                und.setAttribute('data-vbie', 'hole-undo');
                und.addEventListener('click', () => { H.seeds.pop(); renderSide(); schedule(0); });
                row.append(und, clr);
            }
            panel.appendChild(row);
            panel.appendChild(check('Mostrar áreas internas candidatas', H.show, v => { H.show = v; renderSide(); }, 'Numera as áreas fechadas da cor do fundo; rosa = provável vão (contorno só do traço externo)'));
            if (H.show) {
                const list = holeList();
                const box2 = el('div', 'vbie-holelist');
                box2.setAttribute('data-vbie', 'hole-list');
                if (!list.length)
                    box2.appendChild(el('p', 'vbie-note', result ? 'Nenhuma área interna da cor do fundo.' : 'Calculando…'));
                for (const c of list.slice(0, 12)) {
                    const r = el('div', 'vbie-holeitem');
                    r.appendChild(el('span', undefined, c.id + ' · ' + (c.share * 100).toFixed(1) + '%' + (c.outer >= 0.7 ? ' · provável vão' : '')));
                    const b = el('button', 'btn', 'Apagar');
                    b.type = 'button';
                    b.setAttribute('data-vbie', 'hole-erase');
                    b.title = 'Apaga esta área';
                    b.addEventListener('click', () => { if (H.seeds.length < 50)
                        H.seeds.push({ x: c.seed.x, y: c.seed.y }); renderSide(); schedule(0); });
                    r.appendChild(b);
                    box2.appendChild(r);
                }
                if (list.length > 12)
                    box2.appendChild(el('p', 'vbie-note', '+ ' + (list.length - 12) + ' menores (use "Apagar áreas pequenas").'));
                panel.appendChild(box2);
            }
            panel.appendChild(choice('Apagar automaticamente', [['off', 'Não'], ['small', 'Áreas internas pequenas']], H.auto, v => { H.auto = v; renderSide(); }, 'Apaga sozinho as áreas fechadas da cor do fundo de até o tamanho escolhido (vale também para todas as imagens do lote)'));
            if (H.auto === 'small')
                panel.appendChild(slider('Até (% da imagem)', H.maxArea, 0.1, 30, 0.1, v => { H.maxArea = v; }, 'Áreas internas maiores que isto são mantidas (provavelmente são o corpo)'));
            panel.appendChild(slider('Tolerância da área', H.tol, 0, 60, 1, v => { H.tol = v; }, 'Quanto uma cor pode diferir para contar como a mesma área'));
            box.appendChild(panel);
        }
        /* ---------------- grade ajustável ---------------- */
        const GRID_MIN = 4;
        const r4 = (v) => Math.round(v * 10000) / 10000;
        const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
        const cloneCuts = (c) => ({ col: c.col.map(r => r.slice()), row: c.row.slice() });
        function uniformCuts() {
            const g = P.grid, w = src.width, h = src.height;
            const cut = (len, n) => { const cell = (len - 2 * g.margin - g.gap * (n - 1)) / n; return Array.from({ length: n - 1 }, (_, i) => r4((g.margin + (i + 1) * cell + i * g.gap + g.gap / 2) / len)); };
            const col = cut(w, g.cols);
            return { col: Array.from({ length: g.rows }, () => col.slice()), row: cut(h, g.rows) };
        }
        /** Cortes em uso: os do usuário; com ajuste automático ligado, os que a prévia calculou; senão, a grade uniforme. */
        function effectiveCuts() {
            const g = P.grid;
            if (g.colCuts && g.rowCuts)
                return { col: g.colCuts, row: g.rowCuts };
            const d = result?.diagnostics.gridCuts;
            if (g.auto && d && d.rowCuts.length === g.rows - 1 && d.colCuts.length === g.rows && d.colCuts.every(r => r.length === g.cols - 1))
                return { col: d.colCuts, row: d.rowCuts };
            const u = uniformCuts();
            return { col: g.colCuts ?? u.col, row: g.rowCuts ?? u.row };
        }
        function setCuts(c) { P.grid.colCuts = c ? c.col : null; P.grid.rowCuts = c ? c.row : null; }
        function resetGridCuts() { setCuts(null); gridSel = null; gridHist = []; gridIssues = []; gridNote = ''; }
        function pushGridHist() { gridHist.push({ col: P.grid.colCuts ? P.grid.colCuts.map(r => r.slice()) : null, row: P.grid.rowCuts ? P.grid.rowCuts.slice() : null, auto: P.grid.auto }); if (gridHist.length > 50)
            gridHist.shift(); }
        function undoGrid() {
            const h = gridHist.pop();
            if (!h)
                return;
            P.grid.colCuts = h.col;
            P.grid.rowCuts = h.row;
            P.grid.auto = h.auto;
            gridNote = 'Ajuste desfeito.';
            renderSide();
            drawStage();
            schedule(0);
        }
        function dividerPx(c, sel) { return sel.axis === 'h' ? c.row[sel.index] * src.height : c.col[sel.row][sel.index] * src.width; }
        /** Faixa permitida (px) para a divisória: a célula vizinha nunca fica menor que GRID_MIN. */
        function gridBounds(c, sel) {
            const g = P.grid, half = g.gap / 2, m = g.margin;
            const L = sel.axis === 'h' ? src.height : src.width, n = sel.axis === 'h' ? g.rows : g.cols;
            const list = sel.axis === 'h' ? c.row : c.col[sel.row];
            const a = sel.index === 0 ? m - half : list[sel.index - 1] * L, b = sel.index === n - 2 ? L - m + half : list[sel.index + 1] * L;
            return [a + g.gap + GRID_MIN, b - g.gap - GRID_MIN];
        }
        /** Move uma divisória a partir do estado `base`. Vertical: a coluna inteira (todas as fileiras) ou só o trecho. */
        function moveDivider(sel, px, segment, base) {
            const out = cloneCuts(base), W = src.width, H = src.height;
            if (sel.axis === 'h') {
                const [lo, hi] = gridBounds(base, sel);
                out.row[sel.index] = r4(clampN(px, lo, hi) / H);
                setCuts(out);
                return;
            }
            if (segment) {
                const [lo, hi] = gridBounds(base, sel);
                out.col[sel.row][sel.index] = r4(clampN(px, lo, hi) / W);
                setCuts(out);
                return;
            }
            const start = dividerPx(base, sel);
            let dmin = -Infinity, dmax = Infinity;
            for (let r = 0; r < P.grid.rows; r++) {
                const [lo, hi] = gridBounds(base, { axis: 'v', row: r, index: sel.index }), s0 = base.col[r][sel.index] * W;
                dmin = Math.max(dmin, lo - s0);
                dmax = Math.min(dmax, hi - s0);
            }
            const d = dmin > dmax ? 0 : clampN(px - start, dmin, dmax);
            for (let r = 0; r < P.grid.rows; r++)
                out.col[r][sel.index] = r4((base.col[r][sel.index] * W + d) / W);
            setCuts(out);
        }
        function rowRange(c, r) {
            const g = P.grid, H = src.height, half = g.gap / 2;
            return [r === 0 ? g.margin : c.row[r - 1] * H + half, r === g.rows - 1 ? H - g.margin : c.row[r] * H - half];
        }
        function hitDivider(pt) {
            if (!src || P.grid.rows * P.grid.cols < 2)
                return null;
            const c = effectiveCuts(), tol = Math.max(5, 9 / scale()), g = P.grid;
            let best = null, bd = tol;
            for (let j = 0; j < g.rows - 1; j++) {
                const d = Math.abs(pt.y - c.row[j] * src.height);
                if (d <= bd) {
                    bd = d;
                    best = { axis: 'h', row: -1, index: j };
                }
            }
            for (let r = 0; r < g.rows; r++) {
                const [y0, y1] = rowRange(c, r);
                if (pt.y < y0 - tol || pt.y > y1 + tol)
                    continue;
                for (let i = 0; i < g.cols - 1; i++) {
                    const d = Math.abs(pt.x - c.col[r][i] * src.width);
                    if (d <= bd) {
                        bd = d;
                        best = { axis: 'v', row: r, index: i };
                    }
                }
            }
            return best;
        }
        /** Ímã: encaixa na posição uniforme e, ao mover só um trecho, no alinhamento das outras fileiras (usa o estado do início do arrasto). */
        function snapPx(sel, px, tol, base, segment) {
            const g = P.grid, W = src.width, H = src.height, cands = [];
            if (sel.axis === 'v') {
                if (segment)
                    for (let r = 0; r < g.rows; r++)
                        if (r !== sel.row)
                            cands.push(base.col[r][sel.index] * W);
                cands.push(uniformCuts().col[0][sel.index] * W);
            }
            else
                cands.push(uniformCuts().row[sel.index] * H);
            let best = px, bd = tol;
            for (const v of cands) {
                const d = Math.abs(v - px);
                if (d <= bd) {
                    bd = d;
                    best = v;
                }
            }
            return best;
        }
        const issueHas = (axis, row, index) => gridIssues.some(i => i.axis === axis && i.index === index && (axis === 'h' || i.row === row));
        function drawGridHandles(ctx, s, lw) {
            if (!src || P.grid.rows * P.grid.cols < 2)
                return;
            const g = P.grid, c = effectiveCuts(), W = src.width, H = src.height, k = Math.max(4, 6 / s);
            const line = (x0, y0, x1, y1, bad, on) => {
                ctx.save();
                ctx.lineCap = 'round';
                ctx.strokeStyle = 'rgba(0,0,0,.65)';
                ctx.lineWidth = lw * (on ? 4.5 : 3.5);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                ctx.strokeStyle = bad ? '#ff4d4d' : on ? '#ffffff' : '#ffb84d';
                ctx.lineWidth = lw * (on ? 2.5 : 1.8);
                ctx.setLineDash(bad ? [8 / s, 4 / s] : []);
                ctx.beginPath();
                ctx.moveTo(x0, y0);
                ctx.lineTo(x1, y1);
                ctx.stroke();
                ctx.restore();
            };
            const knob = (x, y, bad, on) => {
                ctx.beginPath();
                ctx.arc(x, y, k * (on ? 1.3 : 1), 0, 7);
                ctx.fillStyle = bad ? '#ff4d4d' : '#ffb84d';
                ctx.fill();
                ctx.lineWidth = lw;
                ctx.strokeStyle = '#000';
                ctx.stroke();
            };
            for (let j = 0; j < g.rows - 1; j++) {
                const y = c.row[j] * H, bad = issueHas('h', -1, j), on = !!gridSel && gridSel.axis === 'h' && gridSel.index === j;
                line(g.margin, y, W - g.margin, y, bad, on);
                knob(W / 2, y, bad, on);
            }
            for (let r = 0; r < g.rows; r++) {
                const [y0, y1] = rowRange(c, r);
                for (let i = 0; i < g.cols - 1; i++) {
                    const x = c.col[r][i] * W, bad = issueHas('v', r, i), on = !!gridSel && gridSel.axis === 'v' && gridSel.index === i && (gridSel.row === r || !P.grid.segment);
                    line(x, y0, x, y1, bad, on);
                    knob(x, (y0 + y1) / 2, bad, on);
                }
            }
        }
        /** Ajuste automático: desloca as divisórias para onde menos desenho é atravessado. */
        async function autoAdjustGrid() {
            if (!assetId || !src)
                return;
            const params = { ...paramsOf('grid'), autoAdjust: false };
            gridNote = 'Procurando o melhor lugar para cada divisória…';
            renderSide();
            try {
                const sg = await E.gridSuggest(assetId, params);
                pushGridHist();
                setCuts({ col: sg.colCuts, row: sg.rowCuts });
                P.grid.auto = false;
                gridNote = !sg.reliable ? 'O fundo não é uniforme; o ajuste é só uma estimativa.' : sg.moved.length ? sg.moved.length + (sg.moved.length === 1 ? ' divisória deslocada.' : ' divisórias deslocadas.') + (sg.after.length ? ' Ainda há conteúdo encostado: use "Cortar por objeto" (aba Contorno).' : ' Nada mais é cortado.') : sg.after.length ? 'Não há espaço livre perto: o desenho encosta nas peças vizinhas. Use "Cortar por objeto" (aba Contorno).' : 'Nenhuma divisória precisou ser movida.';
            }
            catch (e) {
                gridNote = e.message;
            }
            renderSide();
            drawStage();
            schedule(0);
        }
        async function detectGrid() {
            if (!assetId || !src)
                return;
            gridNote = 'Verificando…';
            renderSide();
            try {
                const r = await E.gridDiagnose(assetId, paramsOf('grid'));
                gridIssues = r.reliable ? r.issues : [];
                gridNote = !r.reliable ? 'O fundo não é uniforme; não dá para detectar com segurança.' : r.issues.length ? '' : 'Nenhuma divisória corta conteúdo.';
            }
            catch (e) {
                gridNote = e.message;
            }
            renderSide();
            drawStage();
        }
        function gridStatus() {
            if (!gridIssues.length)
                return gridNote || (result ? '✓ Nenhuma divisória corta conteúdo.' : '');
            const g = P.grid, ids = new Set();
            for (const i of gridIssues)
                for (const c of i.cells)
                    ids.add(c.r * g.cols + (g.direction === 'rtl' ? g.cols - 1 - c.c : c.c) + 1);
            return '⚠ ' + gridIssues.length + (gridIssues.length === 1 ? ' divisória corta' : ' divisórias cortam') + ' conteúdo (peças ' + [...ids].sort((a, b) => a - b).slice(0, 10).join(', ') + (ids.size > 10 ? '…' : '') + '). ' + gridNote;
        }
        function gridAdjustPanel(box) {
            const g = P.grid, panel = el('div', 'vbie-gridadj');
            const st = el('p', 'vbie-note vbie-gridstatus' + (gridIssues.length ? ' warn' : ''), gridStatus());
            st.setAttribute('role', 'status');
            st.setAttribute('data-vbie', 'grid-status');
            panel.appendChild(st);
            const row = el('div', 'vbie-presets');
            const mk = (label, title, on, id, disabled = false) => {
                const b = el('button', 'btn', label);
                b.type = 'button';
                b.title = title;
                b.disabled = disabled;
                b.setAttribute('data-vbie', id);
                b.addEventListener('click', on);
                return b;
            };
            row.append(mk('✨ Ajustar automaticamente', 'Desloca as divisórias para onde menos desenho é atravessado', () => { void autoAdjustGrid(); }, 'grid-auto'), mk('🔍 Detectar', 'Mostra quais divisórias cortam conteúdo', () => { void detectGrid(); }, 'grid-detect'), mk('↶ Desfazer ajuste', 'Volta ao ajuste anterior das divisórias', undoGrid, 'grid-undo', !gridHist.length), mk('Redefinir grade', 'Volta a dividir em partes iguais', () => { pushGridHist(); setCuts(null); gridSel = null; gridNote = 'Grade redefinida.'; renderSide(); drawStage(); schedule(0); }, 'grid-reset', !g.colCuts && !g.rowCuts));
            panel.appendChild(row);
            panel.appendChild(choice('Arrastar divisória vertical', [['column', 'Coluna inteira'], ['segment', 'Só o trecho da fileira']], g.segment ? 'segment' : 'column', v => { g.segment = v === 'segment'; }, 'Com a tecla Shift o arrasto faz o contrário'));
            panel.appendChild(check('Ajustar sozinho ao cortar', g.auto, v => { g.auto = v; if (v)
                setCuts(null); renderSide(); }, 'Antes de cortar, desloca as divisórias que atravessam o desenho (e mostra o resultado na prévia)'));
            if (gridSel && src) {
                const c = effectiveCuts(), sel = gridSel, cur = Math.round(dividerPx(c, sel));
                const inp = number(cur, 0, sel.axis === 'h' ? src.height : src.width, 1, () => { });
                inp.setAttribute('data-vbie', 'grid-pos');
                inp.addEventListener('change', () => {
                    const v = Number(inp.value);
                    if (!Number.isFinite(v))
                        return;
                    pushGridHist();
                    const base = cloneCuts(effectiveCuts());
                    P.grid.auto = false;
                    moveDivider(sel, v, g.segment, base);
                    renderSide();
                    drawStage();
                    schedule(0);
                });
                panel.appendChild(field(sel.axis === 'h' ? 'Divisória horizontal ' + (sel.index + 1) + ' (px)' : 'Divisória vertical ' + (sel.index + 1) + (g.segment ? ' · fileira ' + (sel.row + 1) : '') + ' (px)', inp, 'Setas do teclado movem 1 px; Shift+seta, 10 px'));
            }
            else
                panel.appendChild(el('p', 'vbie-note', 'Arraste as linhas laranja na imagem para ajustar o corte. Clique numa linha e use as setas do teclado para ajustar com precisão.'));
            box.appendChild(panel);
        }
        function onWheel(e) {
            if (!e.ctrlKey && !e.metaKey)
                return;
            e.preventDefault();
            zoom = Math.max(0.05, Math.min(16, scale() * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
            drawStage();
        }
        function onCanvasKey(e) { if (tab === 'compose')
            composeKey(e);
        else
            onGridKey(e); }
        function onGridKey(e) {
            if (tab !== 'grid' || !gridSel || !src)
                return;
            const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0, dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
            if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.stopPropagation();
                undoGrid();
                return;
            }
            if (!dx && !dy) {
                if (e.key === 'Escape') {
                    gridSel = null;
                    renderSide();
                    drawStage();
                    e.stopPropagation();
                }
                return;
            }
            if ((gridSel.axis === 'v') !== (dx !== 0))
                return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 10 : 1, c = effectiveCuts();
            pushGridHist();
            P.grid.auto = false;
            moveDivider(gridSel, dividerPx(c, gridSel) + (dx || dy) * step, P.grid.segment, cloneCuts(c));
            renderSide();
            drawStage();
            schedule(150);
        }
        /* ---------------- controles ---------------- */
        function field(label, control, hint) {
            const r = el('div', 'vbie-field');
            r.setAttribute('role', 'group');
            r.setAttribute('aria-label', label);
            r.appendChild(el('span', 'vbie-label', label));
            r.appendChild(control);
            if (hint)
                r.title = hint;
            return r;
        }
        function number(value, min, max, step, on) {
            const i = el('input');
            i.type = 'number';
            i.min = String(min);
            i.max = String(max);
            i.step = String(step);
            i.value = String(value);
            i.addEventListener('input', () => { const v = Number(i.value); if (Number.isFinite(v)) {
                on(Math.min(max, Math.max(min, v)));
                schedule();
            } });
            return i;
        }
        function slider(label, value, min, max, step, on, hint) {
            const wrap = el('div', 'vbie-slider');
            const i = el('input');
            i.type = 'range';
            i.min = String(min);
            i.max = String(max);
            i.step = String(step);
            i.value = String(value);
            const out = el('output', undefined, String(value));
            i.addEventListener('input', () => { const v = Number(i.value); out.textContent = String(v); on(v); schedule(); });
            wrap.append(i, out);
            return field(label, wrap, hint);
        }
        function check(label, value, on, hint) {
            const i = el('input');
            i.type = 'checkbox';
            i.checked = value;
            i.addEventListener('change', () => { on(i.checked); schedule(0); });
            const r = el('label', 'vbie-check');
            r.append(i, el('span', undefined, label));
            if (hint)
                r.title = hint;
            return r;
        }
        function choice(label, options, value, on, hint) {
            const s = el('select');
            for (const [v, t] of options) {
                const o = el('option', undefined, t);
                o.value = v;
                s.appendChild(o);
            }
            s.value = value;
            s.addEventListener('change', () => { on(s.value); schedule(0); });
            return field(label, s, hint);
        }
        function swatch(c, onClick) {
            const b = el('button', 'vbie-swatch');
            b.type = 'button';
            b.style.background = c ? hex(c) : 'transparent';
            b.title = c ? hex(c) : 'automático';
            if (!c)
                b.textContent = 'A';
            if (onClick)
                b.addEventListener('click', onClick);
            return b;
        }
        function pickButton(label, kind) {
            const b = el('button', 'btn' + (pick === kind ? ' primary' : ''), (pick === kind ? '● ' : '💧 ') + label);
            b.type = 'button';
            b.addEventListener('click', () => { pick = pick === kind ? null : kind; if (canvas)
                canvas.style.cursor = pick ? 'crosshair' : ''; renderSide(); });
            return b;
        }
        function colorRow(label, c, on, kind, allowAuto) {
            const wrap = el('div', 'vbie-colorrow');
            wrap.appendChild(swatch(c));
            const t = el('input');
            t.type = 'text';
            t.value = c ? hex(c) : '';
            t.placeholder = allowAuto ? 'automático' : '#rrggbb';
            t.size = 8;
            t.addEventListener('change', () => { const v = parseHex(t.value); if (v) {
                on(v);
                schedule(0);
            }
            else if (allowAuto && !t.value.trim()) {
                on(null);
                schedule(0);
            } });
            wrap.append(t, pickButton('Conta-gotas', kind));
            if (allowAuto && c) {
                const x = el('button', 'btn', 'Auto');
                x.type = 'button';
                x.addEventListener('click', () => { on(null); renderSide(); schedule(0); });
                wrap.appendChild(x);
            }
            return field(label, wrap);
        }
        function paletteRow(on) {
            if (!palette.length)
                return null;
            const w = el('div', 'vbie-palette');
            w.title = 'Cores frequentes da imagem';
            for (const c of palette) {
                const rgb = [c.r, c.g, c.b];
                const b = swatch(rgb, () => { on(rgb); renderSide(); schedule(0); });
                b.title = c.hex + ' · ' + Math.round(c.share * 100) + '%';
                w.appendChild(b);
            }
            return field('Paleta', w);
        }
        function gridControls(box) {
            const g = P.grid;
            box.appendChild(field('Linhas', number(g.rows, 1, 50, 1, v => { g.rows = Math.round(v); resetGridCuts(); })));
            box.appendChild(field('Colunas', number(g.cols, 1, 50, 1, v => { g.cols = Math.round(v); resetGridCuts(); })));
            const presets = el('div', 'vbie-presets');
            for (const [r, c] of [[2, 2], [3, 3], [3, 4], [4, 4], [1, 2], [2, 1]]) {
                const b = el('button', 'btn', r + '×' + c);
                b.type = 'button';
                b.addEventListener('click', () => { g.rows = r; g.cols = c; resetGridCuts(); renderSide(); schedule(0); });
                presets.appendChild(b);
            }
            box.appendChild(presets);
            box.appendChild(slider('Calha (px)', g.gap, 0, 200, 1, v => { g.gap = v; }, 'Espaço descartado entre as células'));
            box.appendChild(slider('Margem (px)', g.margin, 0, 200, 1, v => { g.margin = v; }, 'Borda externa descartada'));
            box.appendChild(choice('Ordem', [['ltr', 'Esquerda → direita'], ['rtl', 'Direita → esquerda (mangá)']], g.direction, v => { g.direction = v; }, 'Define onde fica a coluna 1 e como as peças são numeradas'));
            box.appendChild(check('Aparar bordas transparentes', g.trim, v => { g.trim = v; }, 'Remove da peça o que for transparente e ignora células vazias'));
            gridAdjustPanel(box);
            box.appendChild(el('p', 'vbie-note', 'Sem ajuste, as células cobrem a imagem inteira e diferem no máximo 1 px entre si.'));
        }
        function bgControls(box) {
            const b = P.bg;
            box.appendChild(choice('Modo', [['edge', 'Fundo ligado à borda'], ['global', 'Toda a cor (inclusive dentro)'], ['lineart', 'Arte-final (papel → transparente)']], b.mode, v => { b.mode = v; renderSide(); }, 'Borda: preserva áreas da mesma cor dentro do objeto. Global: apaga a cor em todo lugar. Arte-final: mantém só a tinta.'));
            if (b.mode !== 'lineart') {
                box.appendChild(colorRow('Cor do fundo', b.color, v => { b.color = v; }, 'bg', true));
                const pal = paletteRow(c => { b.color = c; });
                if (pal)
                    box.appendChild(pal);
                box.appendChild(slider('Tolerância', b.tolerance, 0, 60, 1, v => { b.tolerance = v; }, 'Quanto uma cor pode diferir do fundo'));
                box.appendChild(slider('Degradê', b.gradientStep, 0, 12, 1, v => { b.gradientStep = v; }, 'Acompanha fundos com gradiente suave (0 = desligado)'));
            }
            if (b.mode === 'edge')
                holesPanel(box);
            box.appendChild(slider('Suavizar borda', b.edgeSoft, 0, 3, 1, v => { b.edgeSoft = v; }));
            box.appendChild(check('Aparar ao objeto', b.trim, v => { b.trim = v; }));
            const hold = el('button', 'btn', '👁 Segurar para ver o original');
            hold.type = 'button';
            const set = (v) => { showBefore = v; drawStage(); };
            hold.addEventListener('pointerdown', () => set(true));
            hold.addEventListener('pointerup', () => set(false));
            hold.addEventListener('pointerleave', () => set(false));
            box.appendChild(hold);
            if (result?.diagnostics.backgroundColor) {
                const d = result.diagnostics;
                const line = el('p', 'vbie-note');
                line.append('Fundo detectado: ', swatch(d.backgroundColor), ' ' + hex(d.backgroundColor) + ' (' + Math.round((d.backgroundCoverage ?? 0) * 100) + '% da borda)');
                box.appendChild(line);
            }
        }
        function contourControls(box) {
            const c = P.contour;
            box.appendChild(el('p', 'vbie-note', 'Escolha a cor do traço que desenha o objeto. Tudo que está dentro desse contorno é recortado.'));
            box.appendChild(colorRow('Cor do contorno', c.color, v => { c.color = v ?? c.color; }, 'contour', false));
            const pal = paletteRow(col => { c.color = col; });
            if (pal)
                box.appendChild(pal);
            box.appendChild(slider('Tolerância', c.tolerance, 1, 80, 1, v => { c.tolerance = v; }, 'Quanto a cor do traço pode variar (antialiasing, sombra)'));
            box.appendChild(slider('Fechar falhas (px)', c.close, 0, 12, 1, v => { c.close = v; }, 'Une pontas do contorno separadas por uma pequena abertura'));
            const others = el('div', 'vbie-others');
            c.others.forEach((o, i) => { const s = swatch(o, () => { c.others.splice(i, 1); renderSide(); schedule(0); }); s.title = hex(o) + ' — clique para remover'; others.appendChild(s); });
            others.appendChild(pickButton('Contorno de outro objeto', 'other'));
            box.appendChild(field('Outros contornos', others, 'Marque as cores dos contornos de objetos vizinhos: servem de limite onde um cobre o outro'));
            box.appendChild(choice('Sobreposição', [['auto', 'Automático'], ['single', 'Nenhum outro cobre este'], ['behind', 'Outro objeto cobre este']], c.mode, v => { c.mode = v; }, 'Use "Outro objeto cobre este" quando o objeto escolhido está parcialmente atrás de outro'));
            const seeds = el('div', 'vbie-others');
            seeds.appendChild(pickButton('Clicar no objeto', 'seed'));
            if (c.seeds.length) {
                const x = el('button', 'btn', 'Limpar (' + c.seeds.length + ')');
                x.type = 'button';
                x.addEventListener('click', () => { c.seeds = []; renderSide(); schedule(0); });
                seeds.appendChild(x);
            }
            box.appendChild(field('Escolher objeto', seeds, 'Quando vários objetos têm a mesma cor, clique dentro do que você quer'));
            box.appendChild(slider('Expandir / contrair', c.grow, -20, 20, 1, v => { c.grow = v; }));
            box.appendChild(slider('Suavizar borda', c.feather, 0, 6, 1, v => { c.feather = v; }));
            box.appendChild(slider('Margem (px)', c.padding, 0, 60, 1, v => { c.padding = v; }));
            const d = result?.diagnostics;
            if (d?.suggestBehind && c.mode !== 'behind') {
                const b = el('button', 'btn primary', 'Usar “outro objeto cobre este”');
                b.type = 'button';
                b.addEventListener('click', () => { c.mode = 'behind'; renderSide(); schedule(0); });
                box.appendChild(b);
            }
        }
        function cropControls(box) {
            const c = P.crop, w = src?.width ?? 1, h = src?.height ?? 1;
            box.appendChild(el('p', 'vbie-note', 'Arraste sobre a imagem para marcar a área ou digite os valores.'));
            box.appendChild(field('X', number(c.x, 0, w - 1, 1, v => { c.x = Math.round(v); c.width = Math.min(c.width, w - c.x); drawStage(); })));
            box.appendChild(field('Y', number(c.y, 0, h - 1, 1, v => { c.y = Math.round(v); c.height = Math.min(c.height, h - c.y); drawStage(); })));
            box.appendChild(field('Largura', number(c.width, 1, w, 1, v => { c.width = Math.min(Math.round(v), w - c.x); drawStage(); })));
            box.appendChild(field('Altura', number(c.height, 1, h, 1, v => { c.height = Math.min(Math.round(v), h - c.y); drawStage(); })));
            const all = el('button', 'btn', 'Imagem inteira');
            all.type = 'button';
            all.addEventListener('click', () => { P.crop = { x: 0, y: 0, width: w, height: h }; renderSide(); schedule(0); });
            box.appendChild(all);
        }
        /** Mesmo ajuste em todas as imagens do lote (um Desfazer). */
        async function applyAdjustAll(operation, parameters) {
            if (batchBusy)
                return;
            batchBusy = true;
            message = '';
            batchNote = 'Aplicando em ' + batch.length + ' imagens…';
            renderResults();
            renderSide();
            try {
                const done = await C.applyBatch(targets(), { operation, parameters }, { onProgress: (d, n) => { batchNote = 'Aplicando… ' + d + ' de ' + n; renderResults(); } });
                const made = done.results.filter(r => r.ok && r.assetId).map(r => r.assetId);
                const errs = done.results.filter(r => !r.ok).map(r => (S.assets.find(a => a.id === r.sourceAssetId)?.name ?? r.sourceAssetId) + ': ' + r.error);
                batchNote = done.created + (done.created === 1 ? ' imagem criada' : ' imagens criadas') + ' · um Desfazer remove todas.' + (errs.length ? ' Com erro — ' + errs.slice(0, 3).join(' | ') : '');
                if (made.length) {
                    rememberRecent(made);
                    kernel.emit('assets:changed');
                    prevBatch = batch.slice();
                    setBatch(made);
                    await loadSource(made[0], { preview: false });
                    clearResult();
                    renderHeader();
                }
            }
            catch (e) {
                message = e.message;
                batchNote = '';
            }
            batchBusy = false;
            renderResults();
            renderSide();
        }
        async function applyAdjust(operation, parameters) {
            if (inAll()) {
                await applyAdjustAll(operation, parameters);
                return;
            }
            if (!assetId || busy)
                return;
            busy = true;
            message = '';
            renderResults();
            try {
                const r = await C.apply({ source: { assetId }, operation, parameters, output: { kind: 'asset' } });
                if (r.success) {
                    kernel.emit('assets:changed');
                    busy = false;
                    await loadSource(r.assetId);
                    renderHeader();
                    return;
                }
                message = r.errors.map(e => e.message).join('; ') || 'Não foi possível aplicar o ajuste.';
            }
            catch (e) {
                message = e.message;
            }
            busy = false;
            renderResults();
        }
        function adjustControls(box) {
            box.appendChild(el('p', 'vbie-note', 'Cada ajuste cria uma cópia na biblioteca e passa a editá-la; a imagem original é preservada.'));
            const row = (items) => {
                const w = el('div', 'vbie-presets');
                for (const [label, title, op, params] of items) {
                    const b = el('button', 'btn', label);
                    b.type = 'button';
                    b.title = title;
                    b.addEventListener('click', () => { void applyAdjust(op, params); });
                    w.appendChild(b);
                }
                return w;
            };
            box.appendChild(field('Girar / espelhar', row([['⟳ 90°', 'Girar 90° no sentido horário', 'rotate90', {}], ['↔', 'Espelhar na horizontal', 'flipHorizontal', {}], ['↕', 'Espelhar na vertical', 'flipVertical', {}]])));
            box.appendChild(field('Cor', row([['P&B', 'Tons de cinza', 'grayscale', {}], ['Inverter', 'Inverter cores', 'invert', {}], ['Sépia', 'Sépia', 'sepia', {}]])));
            let bright = 0, contrast = 0, level = 128;
            const tone = (label, init, min, max, set, op, key, get) => {
                const wrap = el('div', 'vbie-slider');
                const i = el('input');
                i.type = 'range';
                i.min = String(min);
                i.max = String(max);
                i.step = '1';
                i.value = String(init);
                const out = el('output', undefined, String(init));
                i.addEventListener('input', () => { out.textContent = i.value; set(Number(i.value)); });
                const go = el('button', 'btn', 'Aplicar');
                go.type = 'button';
                go.addEventListener('click', () => { void applyAdjust(op, { [key]: get() }); });
                wrap.append(i, out, go);
                return field(label, wrap);
            };
            box.appendChild(tone('Brilho', 0, -100, 100, v => { bright = v; }, 'brightness', 'amount', () => bright));
            box.appendChild(tone('Contraste', 0, -100, 100, v => { contrast = v; }, 'contrast', 'amount', () => contrast));
            box.appendChild(tone('Limiar (P&B puro)', 128, 0, 255, v => { level = v; }, 'threshold', 'level', () => level));
            const w0 = src?.width ?? 1, h0 = src?.height ?? 1;
            let rw = w0, rh = h0;
            const wi = number(rw, 1, 8192, 1, v => { rw = Math.round(v); rh = Math.max(1, Math.round(rw * h0 / w0)); hi.value = String(rh); });
            const hi = number(rh, 1, 8192, 1, v => { rh = Math.round(v); rw = Math.max(1, Math.round(rh * w0 / h0)); wi.value = String(rw); });
            const dims = el('div', 'vbie-colorrow');
            dims.append(wi, el('span', undefined, '×'), hi);
            const go = el('button', 'btn', 'Redimensionar');
            go.type = 'button';
            go.addEventListener('click', () => { void applyAdjust('resize', { width: rw, height: rh }); });
            box.appendChild(field('Tamanho (px, mantém proporção)', dims));
            box.appendChild(go);
        }
        /* ---------------- aba Cor ---------------- */
        const PRESETS = [['Vermelho', [220, 30, 30]], ['Laranja', [240, 140, 20]], ['Amarelo', [240, 210, 30]], ['Verde', [40, 170, 70]], ['Azul', [40, 90, 220]], ['Roxo', [140, 50, 200]], ['Preto', [0, 0, 0]], ['Branco', [255, 255, 255]]];
        function newColor(label, value, on, optional) {
            const wrap = el('div', 'vbie-newcolor');
            const pick = el('input');
            pick.type = 'color';
            pick.value = value ? hex(value) : '#ff0000';
            pick.setAttribute('aria-label', label);
            pick.addEventListener('input', () => { const v = parseHex(pick.value); if (v) {
                on(v);
                schedule(120);
            } });
            pick.addEventListener('change', () => renderSide());
            wrap.appendChild(pick);
            const row = el('span', 'vbie-presets');
            for (const [name, c] of PRESETS) {
                const b = swatch(c, () => { on(c); renderSide(); schedule(0); });
                b.title = name;
                row.appendChild(b);
            }
            wrap.appendChild(row);
            if (optional) {
                const none = el('button', 'btn' + (value ? '' : ' primary'), value ? 'Não mexer' : '✓ não mexer');
                none.type = 'button';
                none.addEventListener('click', () => { on(null); renderSide(); schedule(0); });
                wrap.appendChild(none);
            }
            return field(label, wrap);
        }
        function colorControls(box) {
            const c = P.color;
            box.appendChild(el('p', 'vbie-note', 'Troca cores sem mexer na transparência nem nas bordas suaves. Sempre cria uma cópia na biblioteca.'));
            box.appendChild(choice('Como trocar', [['roles', 'Contorno e preenchimento (automático)'], ['pairs', 'Cores que eu escolher'], ['uniform', 'Uma cor só em tudo']], c.mode, v => { c.mode = v; renderSide(); }, 'Automático: o editor identifica a cor do contorno e a do preenchimento. Escolhidas: você marca cada cor. Uma cor só: contorno e preenchimento ficam iguais.'));
            const d = result?.diagnostics;
            if (c.mode === 'roles') {
                if (d && 'outlineFrom' in d) {
                    const line = el('p', 'vbie-note');
                    line.append('Detectado — contorno: ', d.outlineFrom ? swatch(d.outlineFrom) : el('span', undefined, '—'), '  preenchimento: ', d.fillFrom ? swatch(d.fillFrom) : el('span', undefined, '—'));
                    box.appendChild(line);
                }
                box.appendChild(newColor('Novo contorno', c.outlineTo, v => { c.outlineTo = v; }, true));
                box.appendChild(newColor('Novo preenchimento', c.fillTo, v => { c.fillTo = v; }, true));
                const same = el('button', 'btn', 'Mesma cor nos dois');
                same.type = 'button';
                same.setAttribute('data-vbie', 'same-color');
                same.title = 'Contorno e preenchimento ficam com a cor do contorno (ou a do preenchimento, se só ela estiver escolhida)';
                same.addEventListener('click', () => { const v = c.outlineTo ?? c.fillTo ?? c.color; c.outlineTo = v; c.fillTo = v; renderSide(); schedule(0); });
                box.appendChild(same);
            }
            else if (c.mode === 'pairs') {
                const pal = paletteRow(col => { const q = c.pairs[c.pickIndex] ?? c.pairs[c.pairs.length - 1]; if (q)
                    q.from = col;
                else
                    c.pairs.push({ from: col, to: [220, 30, 30] }); });
                if (pal)
                    box.appendChild(pal);
                c.pairs.forEach((q, i) => {
                    const row = el('div', 'vbie-pair');
                    row.setAttribute('data-vbie', 'pair');
                    row.appendChild(swatch(q.from, () => { c.pickIndex = i; pick = 'from'; if (canvas)
                        canvas.style.cursor = 'crosshair'; renderSide(); }));
                    const pk = el('button', 'btn' + (pick === 'from' && c.pickIndex === i ? ' primary' : ''), '💧');
                    pk.type = 'button';
                    pk.title = 'Escolher a cor original com o conta-gotas';
                    pk.addEventListener('click', () => { c.pickIndex = i; pick = pick === 'from' && c.pickIndex === i ? null : 'from'; if (canvas)
                        canvas.style.cursor = pick ? 'crosshair' : ''; renderSide(); });
                    row.append(pk, el('span', undefined, '→'));
                    const ci = el('input');
                    ci.type = 'color';
                    ci.value = hex(q.to);
                    ci.setAttribute('aria-label', 'Nova cor ' + (i + 1));
                    ci.addEventListener('input', () => { const v = parseHex(ci.value); if (v) {
                        q.to = v;
                        schedule(120);
                    } });
                    row.appendChild(ci);
                    for (const [name, col] of PRESETS.slice(0, 6)) {
                        const b = swatch(col, () => { q.to = col; renderSide(); schedule(0); });
                        b.title = name;
                        row.appendChild(b);
                    }
                    const rm = el('button', 'btn', '✕');
                    rm.type = 'button';
                    rm.title = 'Remover';
                    rm.addEventListener('click', () => { c.pairs.splice(i, 1); renderSide(); schedule(0); });
                    row.appendChild(rm);
                    box.appendChild(row);
                });
                const add = el('button', 'btn', '＋ Adicionar cor');
                add.type = 'button';
                add.setAttribute('data-vbie', 'add-pair');
                add.addEventListener('click', () => { if (c.pairs.length >= 16)
                    return; c.pairs.push({ from: null, to: [220, 30, 30] }); c.pickIndex = c.pairs.length - 1; pick = 'from'; if (canvas)
                    canvas.style.cursor = 'crosshair'; renderSide(); });
                box.appendChild(add);
            }
            else {
                box.appendChild(newColor('Cor única', c.color, v => { c.color = v ?? c.color; }, false));
                box.appendChild(el('p', 'vbie-note', 'Tudo o que não é transparente vira essa cor (contorno e preenchimento iguais). Se a imagem tem fundo, remova-o antes.'));
            }
            if (c.mode !== 'uniform') {
                box.appendChild(slider('Tolerância', c.tolerance, 1, 80, 1, v => { c.tolerance = v; }, 'Quanto uma cor pode variar e ainda contar como a mesma (sombras, suavização)'));
                box.appendChild(check('Manter o sombreado', c.keepShading, v => { c.keepShading = v; }, 'A variação de claro/escuro de cada pixel é aplicada à nova cor'));
            }
            const hold = el('button', 'btn', '👁 Segurar para ver o original');
            hold.type = 'button';
            const set = (v) => { showBefore = v; drawStage(); };
            hold.addEventListener('pointerdown', () => set(true));
            hold.addEventListener('pointerup', () => set(false));
            hold.addEventListener('pointerleave', () => set(false));
            box.appendChild(hold);
        }
        /* ---------------- aba Montar ---------------- */
        const nameOf = (id) => S.assets.find(a => a.id === id)?.name ?? id;
        const MAXPX = 16_000_000, MAXSIDE = 16000;
        let lDirty = true;
        const touch = () => { lDirty = true; };
        const visIdx = () => { const r = []; P.compose.layers.forEach((l, i) => { if (!l.hidden)
            r.push(i); }); return r; };
        const rawLayer = (l) => { const o = { ...l }; delete o.hidden; delete o.locked; return o; };
        const natOf = (id) => { const a = S.assets.find(x => x.id === id); return { w: a?.originalWidth || 100, h: a?.originalHeight || 100 }; };
        const aabb = (b) => {
            const a = b.rotation * Math.PI / 180, cs = Math.abs(Math.cos(a)), sn = Math.abs(Math.sin(a)), bw = b.w * cs + b.h * sn, bh = b.w * sn + b.h * cs, cx = b.x + b.w / 2, cy = b.y + b.h / 2;
            return { x0: cx - bw / 2, y0: cy - bh / 2, x1: cx + bw / 2, y1: cy + bh / 2 };
        };
        /** Medida da montagem (só dimensões; não decodifica nada). */
        function composeLive() {
            if (!lDirty && liveL)
                return liveL;
            const c = P.compose;
            if (!visIdx().length) {
                liveL = { width: c.width || 1200, height: c.height || 1200, offX: 0, offY: 0, boxes: [] };
                lDirty = false;
                return liveL;
            }
            try {
                const r = E.composeLayout(paramsOf('compose'));
                liveL = { width: r.width, height: r.height, offX: 0, offY: 0, boxes: r.layout };
                lDirty = false;
                if (message && /^(Dimensões|Montagem|Tela)/.test(message))
                    message = '';
            }
            catch (e) {
                message = e.message;
                lDirty = false;
                if (!liveL)
                    liveL = { width: c.width || 1200, height: c.height || 1200, offX: 0, offY: 0, boxes: [] };
            }
            return liveL;
        }
        /* cache de bitmaps reduzidos: cada imagem é decodificada uma única vez */
        function requestDraw() {
            if (drawQueued)
                return;
            drawQueued = true;
            requestAnimationFrame(() => { drawQueued = false; if (root && tab === 'compose')
                drawStage(); });
        }
        function bmpOf(id) {
            const e = bmpCache.get(id);
            if (e)
                return e.bmp;
            const blob = A.blobs.get(id);
            if (!blob)
                return null;
            bmpCache.set(id, { bmp: null, loading: true });
            void (async () => {
                let b = null;
                try {
                    const full = await createImageBitmap(blob), k = Math.min(1, 1024 / Math.max(full.width, full.height));
                    if (k < 1) {
                        b = await createImageBitmap(full, { resizeWidth: Math.max(1, Math.round(full.width * k)), resizeHeight: Math.max(1, Math.round(full.height * k)), resizeQuality: 'medium' });
                        full.close();
                    }
                    else
                        b = full;
                }
                catch {
                    b = null;
                }
                const cur = bmpCache.get(id);
                if (!cur || !root) {
                    b?.close();
                    return;
                }
                cur.bmp = b;
                cur.loading = false;
                requestDraw();
            })();
            return null;
        }
        function releaseBmps(keep) {
            for (const [id, e] of bmpCache) {
                if (keep?.has(id))
                    continue;
                e.bmp?.close();
                bmpCache.delete(id);
            }
        }
        const trimBmps = () => releaseBmps(new Set(P.compose.layers.map(l => l.assetId)));
        /* histórico da montagem */
        const snapC = () => { const c = P.compose; return JSON.stringify({ l: c.layers, w: c.width, h: c.height, a: c.arrange, g: c.gap, m: c.margin, k: c.columns, b: c.bg, bc: c.bgColor, f: c.fixed }); };
        function restoreC(s) {
            const o = JSON.parse(s);
            const c = P.compose;
            c.layers = o.l;
            c.width = o.w;
            c.height = o.h;
            c.arrange = o.a;
            c.gap = o.g;
            c.margin = o.m;
            c.columns = o.k;
            c.bg = o.b;
            c.bgColor = o.bc;
            c.fixed = o.f;
            sel = new Set([...sel].filter(i => i < c.layers.length));
            touch();
            trimBmps();
        }
        function pushC() { const s = snapC(); if (chist[chist.length - 1] === s)
            return; chist.push(s); if (chist.length > 80)
            chist.shift(); cfut = []; }
        function undoC() { const p = chist.pop(); if (p === undefined)
            return; cfut.push(snapC()); restoreC(p); afterC(); }
        function redoC() { const n = cfut.pop(); if (n === undefined)
            return; chist.push(snapC()); restoreC(n); afterC(); }
        function afterC() { touch(); renderSide(); drawStage(); schedule(0); }
        /** Congela posições e tamanho da tela: dali em diante tudo é número explícito, editável com o mouse. */
        function ensureManual() {
            const c = P.compose;
            if (c.arrange === 'none' && c.width > 0 && c.height > 0 && c.layers.every(l => l.width && l.height && !l.scale))
                return;
            if (!c.layers.length) {
                c.arrange = 'none';
                if (!c.width)
                    c.width = 1200;
                if (!c.height)
                    c.height = 1200;
                touch();
                return;
            }
            const L = E.composeLayout({ ...paramsOf('compose'), layers: c.layers.map(rawLayer) });
            c.layers.forEach((l, i) => {
                const b = L.layout[i];
                l.x = Math.round(b.x);
                l.y = Math.round(b.y);
                l.width = Math.max(1, Math.round(b.w));
                l.height = Math.max(1, Math.round(b.h));
                delete l.scale;
                if (b.clip)
                    l.fit = 'cover';
                else
                    delete l.fit;
            });
            c.width = L.width;
            c.height = L.height;
            c.arrange = 'none';
            touch();
        }
        const clampCanvas = (w, h) => {
            w = Math.max(16, Math.min(MAXSIDE, Math.round(w)));
            h = Math.max(16, Math.min(MAXSIDE, Math.round(h)));
            if (w * h > MAXPX) {
                const k = Math.sqrt(MAXPX / (w * h));
                w = Math.floor(w * k);
                h = Math.floor(h * k);
            }
            return { w, h };
        };
        /* ---------------- desenho ---------------- */
        function drawCompose(ctx, s, lw) {
            const L = composeLive();
            if (!L)
                return;
            const c = P.compose, vis = visIdx();
            canvas.style.background = c.bg === 'transparent' ? 'repeating-conic-gradient(#2a2d33 0 25%, #3a3e46 0 50%) 0 0 / 16px 16px' : '';
            if (c.bg !== 'transparent') {
                ctx.fillStyle = c.bg === 'white' ? '#fff' : hex(c.bgColor);
                ctx.fillRect(0, 0, L.width, L.height);
            }
            vis.forEach((li, k) => {
                const b = L.boxes[k], l = c.layers[li];
                if (!b || !l)
                    return;
                ctx.save();
                ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
                if (b.rotation)
                    ctx.rotate(b.rotation * Math.PI / 180);
                if (b.clip) {
                    ctx.beginPath();
                    ctx.rect(-b.w / 2, -b.h / 2, b.w, b.h);
                    ctx.clip();
                }
                ctx.scale(l.flipH ? -1 : 1, l.flipV ? -1 : 1);
                ctx.globalAlpha = l.opacity ?? 1;
                const bmp = bmpOf(l.assetId);
                if (bmp)
                    ctx.drawImage(bmp, -b.dw / 2, -b.dh / 2, b.dw, b.dh);
                else {
                    ctx.fillStyle = 'rgba(120,125,135,.6)';
                    ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
                }
                ctx.restore();
            });
            ctx.strokeStyle = 'rgba(77,163,255,.55)';
            ctx.lineWidth = lw;
            ctx.strokeRect(lw / 2, lw / 2, L.width - lw, L.height - lw);
            const hs = 9 / s;
            vis.forEach((li, k) => {
                if (!sel.has(li))
                    return;
                const b = L.boxes[k];
                const l = c.layers[li];
                ctx.save();
                ctx.translate(b.x + b.w / 2, b.y + b.h / 2);
                ctx.rotate(b.rotation * Math.PI / 180);
                ctx.strokeStyle = l.locked ? '#d9a441' : '#4da3ff';
                ctx.lineWidth = lw;
                ctx.setLineDash(l.locked ? [5 / s, 4 / s] : []);
                ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
                ctx.setLineDash([]);
                if (sel.size === 1 && !l.locked) {
                    ctx.fillStyle = '#fff';
                    ctx.strokeStyle = '#4da3ff';
                    for (const [sx, sy] of HANDLES) {
                        ctx.beginPath();
                        ctx.rect(sx * b.w / 2 - hs / 2, sy * b.h / 2 - hs / 2, hs, hs);
                        ctx.fill();
                        ctx.stroke();
                    }
                    ctx.beginPath();
                    ctx.moveTo(0, -b.h / 2);
                    ctx.lineTo(0, -b.h / 2 - 26 / s);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.arc(0, -b.h / 2 - 26 / s, hs * 0.6, 0, 7);
                    ctx.fill();
                    ctx.stroke();
                }
                ctx.restore();
            });
            ctx.strokeStyle = '#ff4fa0';
            ctx.lineWidth = lw;
            ctx.beginPath();
            for (const x of guides.x) {
                ctx.moveTo(x, 0);
                ctx.lineTo(x, L.height);
            }
            for (const y of guides.y) {
                ctx.moveTo(0, y);
                ctx.lineTo(L.width, y);
            }
            ctx.stroke();
            const t = Math.min(14 / s, L.width / 5, L.height / 5);
            ctx.fillStyle = '#ffb347';
            ctx.fillRect(L.width - t, L.height / 2 - t * 1.5, t, t * 3);
            ctx.fillRect(L.width / 2 - t * 1.5, L.height - t, t * 3, t);
            ctx.fillRect(L.width - t * 1.4, L.height - t * 1.4, t * 1.4, t * 1.4);
        }
        const HANDLES = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
        /* ---------------- interação ---------------- */
        function ptF(e) {
            const r = canvas.getBoundingClientRect(), d = stageDims();
            return { x: (e.clientX - r.left) * d.w / r.width, y: (e.clientY - r.top) * d.h / r.height };
        }
        const toLocal = (b, p) => {
            const a = -b.rotation * Math.PI / 180, dx = p.x - (b.x + b.w / 2), dy = p.y - (b.y + b.h / 2);
            return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) };
        };
        function hitLayer(p) {
            const L = composeLive();
            if (!L)
                return -1;
            const vis = visIdx();
            for (let k = vis.length - 1; k >= 0; k--) {
                const b = L.boxes[k];
                if (!b)
                    continue;
                const q = toLocal(b, p);
                if (Math.abs(q.x) <= b.w / 2 && Math.abs(q.y) <= b.h / 2)
                    return vis[k];
            }
            return -1;
        }
        function hitHandles(p) {
            const L = composeLive();
            if (!L)
                return null;
            const s = scale(), th = 10 / s, c = P.compose, vis = visIdx();
            if (sel.size === 1) {
                const li = [...sel][0], k = vis.indexOf(li), b = L.boxes[k], l = c.layers[li];
                if (b && l && !l.locked) {
                    const q = toLocal(b, p);
                    if (Math.hypot(q.x, q.y + b.h / 2 + 26 / s) <= th * 1.2)
                        return { kind: 'rotate', li };
                    for (const [sx, sy] of HANDLES)
                        if (Math.abs(q.x - sx * b.w / 2) <= th && Math.abs(q.y - sy * b.h / 2) <= th)
                            return { kind: 'resize', sx, sy, li };
                }
            }
            const t = Math.max(th, Math.min(14 / s, L.width / 5, L.height / 5));
            if (p.x >= L.width - t * 1.5 && p.y >= L.height - t * 1.5 && p.x <= L.width + th && p.y <= L.height + th)
                return { kind: 'canvas', sx: 1, sy: 1 };
            if (p.x >= L.width - t && p.x <= L.width + th && Math.abs(p.y - L.height / 2) <= t * 1.5)
                return { kind: 'canvas', sx: 1, sy: 0 };
            if (p.y >= L.height - t && p.y <= L.height + th && Math.abs(p.x - L.width / 2) <= t * 1.5)
                return { kind: 'canvas', sx: 0, sy: 1 };
            return null;
        }
        let zoomWas = 0;
        function composeDown(e) {
            const p = ptF(e), c = P.compose;
            canvas.focus({ preventScroll: true });
            const hh = hitHandles(p);
            if (hh && hh.kind === 'canvas') {
                pushC();
                ensureManual();
                const L = composeLive();
                zoomWas = zoom;
                if (!zoom)
                    zoom = scale();
                cdrag = { kind: 'canvas', start: { x: e.clientX, y: e.clientY }, orig: [], handle: { sx: hh.sx, sy: hh.sy }, primary: -1, cw: L.width, ch: L.height, box: null };
                canvas.setPointerCapture(e.pointerId);
                return;
            }
            if (hh) {
                pushC();
                ensureManual();
                const L = composeLive(), k = visIdx().indexOf(hh.li), box = L.boxes[k];
                const l = c.layers[hh.li];
                cdrag = { kind: hh.kind, start: p, orig: [{ i: hh.li, x: l.x ?? 0, y: l.y ?? 0, w: l.width ?? box.w, h: l.height ?? box.h, rot: l.rotation ?? 0 }], handle: { sx: hh.kind === 'resize' ? hh.sx : 0, sy: hh.kind === 'resize' ? hh.sy : 0 }, primary: hh.li, cw: L.width, ch: L.height, box: { ...box } };
                canvas.setPointerCapture(e.pointerId);
                return;
            }
            const hit = hitLayer(p);
            if (hit < 0) {
                if (!e.shiftKey && sel.size) {
                    sel.clear();
                    renderSide();
                    drawStage();
                }
                return;
            }
            if (e.shiftKey) {
                if (sel.has(hit))
                    sel.delete(hit);
                else
                    sel.add(hit);
            }
            else if (!sel.has(hit))
                sel = new Set([hit]);
            c.selected = hit;
            const movable = [...sel].filter(i => !c.layers[i].locked);
            if (!movable.length) {
                renderSide();
                drawStage();
                return;
            }
            pushC();
            ensureManual();
            const L = composeLive();
            cdrag = { kind: 'move', start: p, orig: movable.map(i => { const l = c.layers[i]; return { i, x: l.x ?? 0, y: l.y ?? 0, w: l.width ?? 0, h: l.height ?? 0, rot: l.rotation ?? 0 }; }), handle: { sx: 0, sy: 0 }, primary: hit, cw: L.width, ch: L.height, box: null };
            canvas.setPointerCapture(e.pointerId);
            renderSide();
            drawStage();
        }
        const CURSORS = { '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize', '0,-1': 'ns-resize', '0,1': 'ns-resize', '1,0': 'ew-resize', '-1,0': 'ew-resize' };
        /** Ímãs: bordas e centro da tela e das outras imagens (Alt desliga). */
        function snapAxis(vals, cands, tol) {
            let best = tol + 1, d = 0, at = null;
            for (const v of vals)
                for (const t of cands) {
                    const dd = t - v;
                    if (Math.abs(dd) < best) {
                        best = Math.abs(dd);
                        d = dd;
                        at = t;
                    }
                }
            return best <= tol ? { d, at } : { d: 0, at: null };
        }
        function composeMove(e) {
            const c = P.compose;
            if (!cdrag) {
                const p = ptF(e), hh = hitHandles(p);
                canvas.style.cursor = hh ? (hh.kind === 'rotate' ? 'grab' : hh.kind === 'canvas' ? (hh.sx && hh.sy ? 'nwse-resize' : hh.sx ? 'ew-resize' : 'ns-resize') : CURSORS[hh.sx + ',' + hh.sy] ?? 'move') : hitLayer(p) >= 0 ? 'move' : 'default';
                return;
            }
            const d = cdrag, s = scale();
            if (d.kind === 'canvas') {
                const z = clampCanvas(d.cw + (d.handle.sx ? (e.clientX - d.start.x) / s : 0), d.ch + (d.handle.sy ? (e.clientY - d.start.y) / s : 0));
                c.width = z.w;
                c.height = z.h;
                c.fixed = true;
                touch();
                requestDraw();
                return;
            }
            const p = ptF(e), L = composeLive();
            if (d.kind === 'move') {
                let dx = p.x - d.start.x, dy = p.y - d.start.y;
                guides = { x: [], y: [] };
                const prim = d.orig.find(o => o.i === d.primary) ?? d.orig[0];
                if (!e.altKey && d.box === null) {
                    const pl = c.layers[prim.i], vis = visIdx(), k = vis.indexOf(prim.i), b0 = L.boxes[k];
                    if (b0) {
                        const moved = { ...b0, x: prim.x + dx, y: prim.y + dy }, a = aabb(moved), tol = 7 / s;
                        const cx = [0, L.width / 2, L.width], cy = [0, L.height / 2, L.height];
                        vis.forEach((li, kk) => { if (sel.has(li))
                            return; const bb = L.boxes[kk]; if (!bb)
                            return; const q = aabb(bb); cx.push(q.x0, (q.x0 + q.x1) / 2, q.x1); cy.push(q.y0, (q.y0 + q.y1) / 2, q.y1); });
                        const sx = snapAxis([a.x0, (a.x0 + a.x1) / 2, a.x1], cx, tol), sy = snapAxis([a.y0, (a.y0 + a.y1) / 2, a.y1], cy, tol);
                        dx += sx.d;
                        dy += sy.d;
                        if (sx.at !== null)
                            guides.x.push(sx.at);
                        if (sy.at !== null)
                            guides.y.push(sy.at);
                        void pl;
                    }
                }
                for (const o of d.orig) {
                    const l = c.layers[o.i];
                    l.x = Math.round(o.x + dx);
                    l.y = Math.round(o.y + dy);
                }
            }
            else if (d.kind === 'rotate' && d.box) {
                const cxy = { x: d.box.x + d.box.w / 2, y: d.box.y + d.box.h / 2 };
                let ang = Math.atan2(p.y - cxy.y, p.x - cxy.x) * 180 / Math.PI + 90;
                if (e.shiftKey)
                    ang = Math.round(ang / 15) * 15;
                else {
                    const r = Math.round(ang / 90) * 90;
                    if (Math.abs(ang - r) < 3)
                        ang = r;
                }
                ang = ((ang + 540) % 360) - 180;
                c.layers[d.primary].rotation = Math.round(ang * 10) / 10;
            }
            else if (d.kind === 'resize' && d.box) {
                const o = d.orig[0], a = o.rot * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
                const dxw = p.x - d.start.x, dyw = p.y - d.start.y, dl = { x: dxw * ca + dyw * sa, y: -dxw * sa + dyw * ca };
                const { sx, sy } = d.handle;
                let w = o.w, h = o.h;
                if (sx)
                    w = Math.max(8, o.w + sx * dl.x);
                if (sy)
                    h = Math.max(8, o.h + sy * dl.y);
                if (c.lock !== e.shiftKey || (sx && sy)) {
                    const k = sx && sy ? Math.max(w / o.w, h / o.h) : sx ? w / o.w : h / o.h;
                    w = Math.max(8, o.w * k);
                    h = Math.max(8, o.h * k);
                }
                if (e.altKey) { /* Alt: cresce pelo centro */ }
                const ow = o.w, oh = o.h, ocx = o.x + ow / 2, ocy = o.y + oh / 2;
                const offx = sx ? sx * (w - ow) / 2 : 0, offy = sy ? sy * (h - oh) / 2 : 0;
                const ncx = ocx + offx * ca - offy * sa, ncy = ocy + offx * sa + offy * ca;
                const l = c.layers[o.i];
                l.width = Math.max(1, Math.round(w));
                l.height = Math.max(1, Math.round(h));
                l.x = Math.round(ncx - l.width / 2);
                l.y = Math.round(ncy - l.height / 2);
                delete l.scale;
            }
            touch();
            requestDraw();
        }
        function composeUp() {
            cdrag = null;
            guides = { x: [], y: [] };
            if (zoomWas === 0 && P.compose.fixed)
                zoom = 0;
            else if (zoomWas === 0)
                zoom = 0;
            zoomWas = 0;
            touch();
            renderSide();
            drawStage();
            schedule(0);
        }
        /* ---------------- operações ---------------- */
        function selList() { return [...sel].filter(i => i < P.compose.layers.length).sort((a, b) => a - b); }
        function mutate(fn) { pushC(); ensureManual(); fn(); touch(); renderSide(); drawStage(); schedule(0); }
        function addLayers(ids) {
            const c = P.compose;
            pushC();
            for (const id of ids) {
                if (c.layers.length >= 40) {
                    message = 'No máximo 40 imagens por montagem.';
                    break;
                }
                if (!A.blobs.has(id))
                    continue;
                const nat = natOf(id), l = { assetId: id, width: nat.w, height: nat.h, x: 0, y: 0 };
                if (c.layers.length)
                    ensureManual();
                if (c.fixed && c.width > 0) {
                    const k = Math.min(1, c.width * 0.8 / nat.w, c.height * 0.8 / nat.h), w = Math.max(1, Math.round(nat.w * k)), h = Math.max(1, Math.round(nat.h * k)), n = c.layers.length % 8 * 24;
                    l.width = w;
                    l.height = h;
                    l.x = Math.round((c.width - w) / 2 + n);
                    l.y = Math.round((c.height - h) / 2 + n);
                }
                else if (c.layers.length) {
                    l.x = Math.max(...c.layers.map(q => (q.x ?? 0) + (q.width ?? 0))) + c.gap;
                    l.y = 0;
                    c.width = 0;
                    c.height = 0;
                    c.arrange = 'none'; // tela automática: cresce junto com o conjunto
                }
                c.layers.push(l);
                sel = new Set([c.layers.length - 1]);
                c.selected = c.layers.length - 1;
            }
            touch();
        }
        function removeSel() { const L = selList(); if (!L.length)
            return; mutate(() => { const c = P.compose; c.layers = c.layers.filter((_, i) => !L.includes(i)); sel.clear(); c.selected = 0; trimBmps(); }); }
        function dupSel() {
            const L = selList();
            if (!L.length || P.compose.layers.length + L.length > 40)
                return;
            mutate(() => { const c = P.compose, out = []; for (const i of L) {
                const o = { ...c.layers[i] };
                o.x = (o.x ?? 0) + 24;
                o.y = (o.y ?? 0) + 24;
                c.layers.push(o);
                out.push(c.layers.length - 1);
            } sel = new Set(out); });
        }
        function reorder(dir) {
            const L = selList();
            if (!L.length)
                return;
            mutate(() => {
                const c = P.compose, ls = c.layers, pick = new Set(L);
                const arr = ls.map((l, i) => ({ l, i, s: pick.has(i) }));
                if (dir > 0)
                    for (let i = arr.length - 2; i >= 0; i--) {
                        if (arr[i].s && !arr[i + 1].s) {
                            const t = arr[i];
                            arr[i] = arr[i + 1];
                            arr[i + 1] = t;
                        }
                    }
                else
                    for (let i = 1; i < arr.length; i++) {
                        if (arr[i].s && !arr[i - 1].s) {
                            const t = arr[i];
                            arr[i] = arr[i - 1];
                            arr[i - 1] = t;
                        }
                    }
                c.layers = arr.map(a => a.l);
                sel = new Set(arr.map((a, i) => a.s ? i : -1).filter(i => i >= 0));
            });
        }
        function nudge(dx, dy) { const L = selList().filter(i => !P.compose.layers[i].locked); if (!L.length)
            return; mutate(() => { for (const i of L) {
            const l = P.compose.layers[i];
            l.x = (l.x ?? 0) + dx;
            l.y = (l.y ?? 0) + dy;
        } }); }
        function fitTo(mode) {
            const L = selList().filter(i => !P.compose.layers[i].locked);
            if (!L.length)
                return;
            mutate(() => {
                const c = P.compose;
                for (const i of L) {
                    const l = c.layers[i], nat = natOf(l.assetId), W = c.width, H = c.height;
                    if (mode === 'center') {
                        l.x = Math.round((W - (l.width ?? nat.w)) / 2);
                        l.y = Math.round((H - (l.height ?? nat.h)) / 2);
                        continue;
                    }
                    l.rotation = 0;
                    if (mode === 'original') {
                        const cx = (l.x ?? 0) + (l.width ?? nat.w) / 2, cy = (l.y ?? 0) + (l.height ?? nat.h) / 2;
                        l.width = nat.w;
                        l.height = nat.h;
                        l.x = Math.round(cx - nat.w / 2);
                        l.y = Math.round(cy - nat.h / 2);
                        delete l.fit;
                        continue;
                    }
                    if (mode === 'contain') {
                        const k = Math.min(W / nat.w, H / nat.h), w = Math.max(1, Math.round(nat.w * k)), h = Math.max(1, Math.round(nat.h * k));
                        l.width = w;
                        l.height = h;
                        l.x = Math.round((W - w) / 2);
                        l.y = Math.round((H - h) / 2);
                        delete l.fit;
                    }
                    else {
                        l.width = W;
                        l.height = H;
                        l.x = 0;
                        l.y = 0;
                        if (mode === 'cover')
                            l.fit = 'cover';
                        else
                            delete l.fit;
                    }
                }
            });
        }
        function alignSel(kind) {
            const L = selList().filter(i => !P.compose.layers[i].locked);
            if (!L.length)
                return;
            mutate(() => {
                const c = P.compose, live = composeLive(), vis = visIdx();
                const bx = L.map(i => ({ i, a: aabb(live.boxes[vis.indexOf(i)]) })).filter(o => vis.includes(o.i));
                if (!bx.length)
                    return;
                const T = bx.length === 1 ? { x0: 0, y0: 0, x1: live.width, y1: live.height } : { x0: Math.min(...bx.map(o => o.a.x0)), y0: Math.min(...bx.map(o => o.a.y0)), x1: Math.max(...bx.map(o => o.a.x1)), y1: Math.max(...bx.map(o => o.a.y1)) };
                for (const o of bx) {
                    const l = c.layers[o.i];
                    let dx = 0, dy = 0;
                    if (kind === 'l')
                        dx = T.x0 - o.a.x0;
                    else if (kind === 'r')
                        dx = T.x1 - o.a.x1;
                    else if (kind === 'cx')
                        dx = (T.x0 + T.x1) / 2 - (o.a.x0 + o.a.x1) / 2;
                    else if (kind === 't')
                        dy = T.y0 - o.a.y0;
                    else if (kind === 'b')
                        dy = T.y1 - o.a.y1;
                    else
                        dy = (T.y0 + T.y1) / 2 - (o.a.y0 + o.a.y1) / 2;
                    l.x = Math.round((l.x ?? 0) + dx);
                    l.y = Math.round((l.y ?? 0) + dy);
                }
            });
        }
        function distribute(axis) {
            const L = selList().filter(i => !P.compose.layers[i].locked);
            if (L.length < 3)
                return;
            mutate(() => {
                const c = P.compose, live = composeLive(), vis = visIdx();
                const it = L.filter(i => vis.includes(i)).map(i => ({ i, a: aabb(live.boxes[vis.indexOf(i)]) })).sort((p, q) => axis === 'h' ? p.a.x0 - q.a.x0 : p.a.y0 - q.a.y0);
                if (it.length < 3)
                    return;
                const lo = axis === 'h' ? it[0].a.x0 : it[0].a.y0, hi = axis === 'h' ? it[it.length - 1].a.x1 : it[it.length - 1].a.y1;
                const total = it.reduce((s, o) => s + (axis === 'h' ? o.a.x1 - o.a.x0 : o.a.y1 - o.a.y0), 0), gap = (hi - lo - total) / (it.length - 1);
                let pos = lo;
                for (const o of it) {
                    const size = axis === 'h' ? o.a.x1 - o.a.x0 : o.a.y1 - o.a.y0, l = c.layers[o.i];
                    if (axis === 'h')
                        l.x = Math.round((l.x ?? 0) + pos - o.a.x0);
                    else
                        l.y = Math.round((l.y ?? 0) + pos - o.a.y0);
                    pos += size + gap;
                }
            });
        }
        /** Organiza uma vez (lado a lado, empilhado, grade) e volta ao modo livre. */
        function arrangeOnce(mode) {
            pushC();
            const c = P.compose;
            if (!c.layers.length)
                return;
            ensureManual();
            const keep = { w: c.width, h: c.height, fixed: c.fixed };
            const lay = c.layers.map(l => { const o = rawLayer(l); o.x = 0; o.y = 0; return o; });
            const r = E.composeLayout({ width: 0, height: 0, background: null, arrange: mode, gap: c.gap, margin: c.margin, columns: c.columns, layers: lay.map(o => ({ ...o, rotation: 0 })) });
            c.layers.forEach((l, i) => { const b = r.layout[i]; l.x = Math.round(b.x); l.y = Math.round(b.y); l.width = Math.max(1, Math.round(b.w)); l.height = Math.max(1, Math.round(b.h)); l.rotation = 0; if (b.clip)
                l.fit = 'cover';
            else
                delete l.fit; });
            if (keep.fixed) {
                c.width = keep.w;
                c.height = keep.h;
            }
            else {
                c.width = r.width;
                c.height = r.height;
            }
            touch();
            renderSide();
            drawStage();
            schedule(0);
        }
        function fitCanvasToContent() {
            mutate(() => {
                const c = P.compose, live = composeLive(), vis = visIdx();
                if (!vis.length)
                    return;
                const a = live.boxes.map(aabb), x0 = Math.min(...a.map(q => q.x0)), y0 = Math.min(...a.map(q => q.y0)), x1 = Math.max(...a.map(q => q.x1)), y1 = Math.max(...a.map(q => q.y1));
                const z = clampCanvas(x1 - x0 + 2 * c.margin, y1 - y0 + 2 * c.margin);
                for (const l of c.layers) {
                    l.x = Math.round((l.x ?? 0) - x0 + c.margin);
                    l.y = Math.round((l.y ?? 0) - y0 + c.margin);
                }
                c.width = z.w;
                c.height = z.h;
                c.fixed = true;
            });
        }
        function setCanvas(w, h, rerender) {
            const c = P.compose, z = clampCanvas(w, h);
            pushC();
            ensureManual();
            c.width = z.w;
            c.height = z.h;
            c.fixed = true;
            if (c.layers.length === 1 && rerender) { /* única imagem: ajusta à nova tela */
                const l = c.layers[0], nat = natOf(l.assetId), k = Math.min(1, z.w * 0.9 / nat.w, z.h * 0.9 / nat.h);
                l.width = Math.max(1, Math.round(nat.w * k));
                l.height = Math.max(1, Math.round(nat.h * k));
                l.x = Math.round((z.w - l.width) / 2);
                l.y = Math.round((z.h - l.height) / 2);
                l.rotation = 0;
                delete l.fit;
            }
            touch();
            if (rerender)
                renderSide();
            drawStage();
            schedule(0);
        }
        function expandCanvas(side, frac) {
            mutate(() => {
                const c = P.compose, horiz = side === 'l' || side === 'r', add = Math.round((horiz ? c.width : c.height) * frac), z = clampCanvas(c.width + (horiz ? add : 0), c.height + (horiz ? 0 : add));
                const gx = z.w - c.width, gy = z.h - c.height;
                if (side === 'l')
                    for (const l of c.layers)
                        l.x = (l.x ?? 0) + gx;
                if (side === 't')
                    for (const l of c.layers)
                        l.y = (l.y ?? 0) + gy;
                c.width = z.w;
                c.height = z.h;
                c.fixed = true;
            });
        }
        function composeKey(e) {
            const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
            let used = true;
            if (mod && k === 'z' && !e.shiftKey)
                undoC();
            else if (mod && (k === 'y' || (k === 'z' && e.shiftKey)))
                redoC();
            else if (mod && k === 'd')
                dupSel();
            else if (mod && k === 'a') {
                sel = new Set(visIdx());
                renderSide();
                drawStage();
            }
            else if (k === 'delete' || k === 'backspace')
                removeSel();
            else if (k === 'escape') {
                sel.clear();
                renderSide();
                drawStage();
            }
            else if (k === 'arrowleft')
                nudge(e.shiftKey ? -10 : -1, 0);
            else if (k === 'arrowright')
                nudge(e.shiftKey ? 10 : 1, 0);
            else if (k === 'arrowup')
                nudge(0, e.shiftKey ? -10 : -1);
            else if (k === 'arrowdown')
                nudge(0, e.shiftKey ? 10 : 1);
            else if (k === ']')
                reorder(1);
            else if (k === '[')
                reorder(-1);
            else
                used = false;
            if (used)
                e.preventDefault();
        }
        /* ---------------- painel ---------------- */
        const SIZES = [
            ['a4p', 'A4 retrato (300 dpi) 2480×3508', 2480, 3508], ['a4l', 'A4 paisagem (300 dpi) 3508×2480', 3508, 2480], ['b4', 'Página de mangá B4 (300 dpi) 3035×4299', 3035, 4299],
            ['hd', 'Full HD 1920×1080', 1920, 1080], ['uhd', '4K UHD 3840×2160', 3840, 2160], ['sq', 'Quadrado 2000×2000', 2000, 2000]
        ];
        const ibtn = (txt, title, fn, cls = 'btn') => { const b = el('button', cls, txt); b.type = 'button'; b.title = title; b.setAttribute('aria-label', title); b.addEventListener('click', fn); return b; };
        function intInput(value, min, max, on, label) {
            const i = el('input');
            i.type = 'number';
            i.min = String(min);
            i.max = String(max);
            i.step = '1';
            i.value = String(Math.round(value));
            i.setAttribute('aria-label', label);
            i.addEventListener('input', () => { const v = Number(i.value); if (Number.isFinite(v) && v >= min)
                on(Math.min(max, Math.round(v))); });
            return i;
        }
        function composeControls(box) {
            const c = P.compose, L = composeLive();
            /* 1. tela */
            const card = el('div', 'vbie-card');
            card.setAttribute('data-vbie', 'canvas-card');
            card.appendChild(el('strong', undefined, 'Tela da montagem'));
            const cw = intInput(L.width, 16, MAXSIDE, () => { }, 'Largura da tela'), ch = intInput(L.height, 16, MAXSIDE, () => { }, 'Altura da tela');
            cw.setAttribute('data-vbie', 'canvas-w');
            ch.setAttribute('data-vbie', 'canvas-h');
            const apply = () => setCanvas(Number(cw.value) || L.width, Number(ch.value) || L.height, false);
            cw.addEventListener('input', apply);
            ch.addEventListener('input', apply);
            cw.addEventListener('change', () => { renderSide(); });
            ch.addEventListener('change', () => { renderSide(); });
            const dims = el('div', 'vbie-colorrow');
            dims.append(cw, el('span', undefined, '×'), ch, el('span', 'vbie-dim', 'px'));
            card.appendChild(field('Tamanho', dims, 'Defina antes de montar; dá para ampliar a qualquer momento'));
            const ps = el('select');
            ps.setAttribute('aria-label', 'Tamanho predefinido');
            ps.setAttribute('data-vbie', 'canvas-preset');
            const o0 = el('option', undefined, 'Tamanho predefinido…');
            o0.value = '';
            ps.appendChild(o0);
            for (const [id, name] of SIZES) {
                const o = el('option', undefined, name);
                o.value = id;
                ps.appendChild(o);
            }
            ps.addEventListener('change', () => { const z = SIZES.find(q => q[0] === ps.value); if (z)
                setCanvas(z[2], z[3], true); });
            card.appendChild(field('Predefinição', ps));
            const ex = el('div', 'vbie-actions');
            ex.setAttribute('data-vbie', 'canvas-expand');
            ex.append(ibtn('◀＋', 'Ampliar a tela 25% à esquerda', () => expandCanvas('l', 0.25)), ibtn('▲＋', 'Ampliar a tela 25% acima', () => expandCanvas('t', 0.25)), ibtn('＋▼', 'Ampliar a tela 25% abaixo', () => expandCanvas('b', 0.25)), ibtn('＋▶', 'Ampliar a tela 25% à direita', () => expandCanvas('r', 0.25)));
            card.append(field('Ampliar 25%', ex), ibtn('⤢ Ajustar a tela ao conjunto', 'Encolhe/expande a tela até cobrir todas as imagens', fitCanvasToContent));
            card.appendChild(choice('Fundo', [['transparent', 'Transparente'], ['white', 'Branco'], ['color', 'Outra cor…']], c.bg, v => { pushC(); c.bg = v; touch(); renderSide(); }));
            if (c.bg === 'color')
                card.appendChild(newColor('Cor do fundo', c.bgColor, v => { c.bgColor = v ?? c.bgColor; touch(); requestDraw(); }, false));
            const px = L.width * L.height;
            card.appendChild(el('p', 'vbie-note' + (px > MAXPX ? ' warn' : ''), px > MAXPX ? 'Passa de 16 megapixels: não poderá ser salva.' : (px / 1e6).toFixed(1) + ' MP · arraste as alças laranja da tela para ampliar.'));
            box.appendChild(card);
            /* 2. camadas */
            const list = el('div', 'vbie-layers');
            list.setAttribute('data-vbie', 'layers');
            for (let i = c.layers.length - 1; i >= 0; i--) {
                const l = c.layers[i], row = el('div', 'vbie-layer' + (sel.has(i) ? ' on' : ''));
                row.setAttribute('data-layer', String(i));
                const eye = ibtn(l.hidden ? '🚫' : '👁', l.hidden ? 'Mostrar' : 'Ocultar', () => { pushC(); l.hidden = !l.hidden; if (l.hidden)
                    sel.delete(i); touch(); renderSide(); drawStage(); schedule(0); });
                const lock = ibtn(l.locked ? '🔒' : '🔓', l.locked ? 'Destravar' : 'Travar posição', () => { pushC(); l.locked = !l.locked; renderSide(); drawStage(); });
                const nm = el('button', 'btn', (i + 1) + '. ' + nameOf(l.assetId));
                nm.type = 'button';
                nm.addEventListener('click', e => { if (e.shiftKey) {
                    if (sel.has(i))
                        sel.delete(i);
                    else
                        sel.add(i);
                }
                else
                    sel = new Set([i]); c.selected = i; renderSide(); drawStage(); });
                row.append(eye, lock, nm);
                list.appendChild(row);
            }
            if (!c.layers.length)
                list.appendChild(el('p', 'vbie-note', 'Nenhuma imagem ainda. Adicione da biblioteca abaixo.'));
            box.appendChild(list);
            const add = el('select');
            add.setAttribute('aria-label', 'Adicionar imagem da biblioteca');
            const a0 = el('option', undefined, '＋ adicionar da biblioteca…');
            a0.value = '';
            add.appendChild(a0);
            for (const a of usable()) {
                const o = el('option', undefined, a.name || a.id);
                o.value = a.id;
                add.appendChild(o);
            }
            add.addEventListener('change', () => { if (add.value) {
                addLayers([add.value]);
                renderSide();
                drawStage();
                schedule(0);
            } });
            box.appendChild(field('Adicionar imagem', add));
            const live = recent.filter(id => A.blobs.has(id) && !c.layers.some(l => l.assetId === id));
            if (live.length)
                box.appendChild(ibtn('＋ Todas as salvas agora (' + live.length + ')', 'Adiciona as imagens salvas agora', () => { addLayers(live.slice().reverse()); arrangeOnce('row'); }));
            /* 3. elemento */
            const SL = selList();
            const one = SL.length === 1 ? c.layers[SL[0]] : null;
            if (SL.length) {
                const ep = el('div', 'vbie-card');
                ep.setAttribute('data-vbie', 'element-panel');
                ep.appendChild(el('strong', undefined, SL.length === 1 ? 'Elemento: ' + nameOf(one.assetId) : SL.length + ' elementos'));
                if (one) {
                    const nat = natOf(one.assetId), ratio = (one.width ?? nat.w) / Math.max(1, one.height ?? nat.h);
                    const live2 = composeLive(), bx = live2.boxes[visIdx().indexOf(SL[0])];
                    const iw = intInput(one.width ?? bx?.w ?? nat.w, 1, MAXSIDE, () => { }, 'Largura do elemento'), ih = intInput(one.height ?? bx?.h ?? nat.h, 1, MAXSIDE, () => { }, 'Altura do elemento');
                    iw.setAttribute('data-vbie', 'el-w');
                    ih.setAttribute('data-vbie', 'el-h');
                    const setWH = (w, h) => { pushC(); ensureManual(); one.width = w; one.height = h; delete one.scale; touch(); requestDraw(); };
                    iw.addEventListener('input', () => { const w = Math.max(1, Math.round(Number(iw.value) || 1)); const h = c.lock ? Math.max(1, Math.round(w / ratio)) : Math.max(1, Math.round(Number(ih.value) || 1)); if (c.lock)
                        ih.value = String(h); setWH(w, h); });
                    ih.addEventListener('input', () => { const h = Math.max(1, Math.round(Number(ih.value) || 1)); const w = c.lock ? Math.max(1, Math.round(h * ratio)) : Math.max(1, Math.round(Number(iw.value) || 1)); if (c.lock)
                        iw.value = String(w); setWH(w, h); });
                    const wh = el('div', 'vbie-colorrow');
                    wh.append(iw, el('span', undefined, '×'), ih, el('span', 'vbie-dim', 'px'));
                    ep.appendChild(field('Tamanho', wh));
                    ep.appendChild(check('Manter proporção', c.lock, v => { c.lock = v; }, 'Shift no arrasto inverte'));
                    const xy = el('div', 'vbie-colorrow');
                    const ix = intInput(one.x ?? 0, -MAXSIDE, MAXSIDE, v => { pushC(); ensureManual(); one.x = v; touch(); requestDraw(); }, 'Posição X'), iy = intInput(one.y ?? 0, -MAXSIDE, MAXSIDE, v => { pushC(); ensureManual(); one.y = v; touch(); requestDraw(); }, 'Posição Y');
                    xy.append(ix, el('span', undefined, ','), iy);
                    ep.appendChild(field('Posição X, Y', xy));
                    const pct = Math.round((one.width ?? nat.w) / nat.w * 100);
                    ep.appendChild(field('Escala (%)', intInput(pct, 1, 1000, v => { const w = Math.max(1, Math.round(nat.w * v / 100)), h = Math.max(1, Math.round(nat.h * v / 100)); setWH(w, h); iw.value = String(w); ih.value = String(h); }, 'Escala em porcentagem')));
                    const rot = slider('Girar (°)', one.rotation ?? 0, -180, 180, 1, v => { pushC(); one.rotation = v; touch(); requestDraw(); });
                    ep.appendChild(rot);
                    ep.appendChild(slider('Opacidade', Math.round((one.opacity ?? 1) * 100), 0, 100, 1, v => { pushC(); one.opacity = v / 100; touch(); requestDraw(); }));
                    const fl = el('div', 'vbie-actions');
                    fl.append(check('Espelhar ↔', !!one.flipH, v => { pushC(); one.flipH = v; touch(); requestDraw(); }), check('Espelhar ↕', !!one.flipV, v => { pushC(); one.flipV = v; touch(); requestDraw(); }));
                    ep.appendChild(fl);
                }
                const fit = el('div', 'vbie-actions');
                fit.setAttribute('data-vbie', 'fit-actions');
                fit.append(ibtn('Caber', 'Cabe inteira na tela, sem cortar', () => fitTo('contain')), ibtn('Cobrir', 'Preenche a tela cortando o excesso', () => fitTo('cover')), ibtn('Esticar', 'Ocupa a tela toda, deformando', () => fitTo('stretch')), ibtn('Original', 'Tamanho original (100%)', () => fitTo('original')), ibtn('Centralizar', 'Centraliza na tela', () => fitTo('center')));
                ep.appendChild(fit);
                const al = el('div', 'vbie-actions');
                al.setAttribute('data-vbie', 'align-actions');
                al.append(ibtn('⇤', 'Alinhar à esquerda', () => alignSel('l')), ibtn('⇹', 'Centralizar na horizontal', () => alignSel('cx')), ibtn('⇥', 'Alinhar à direita', () => alignSel('r')), ibtn('⤒', 'Alinhar ao topo', () => alignSel('t')), ibtn('⇳', 'Centralizar na vertical', () => alignSel('cy')), ibtn('⤓', 'Alinhar à base', () => alignSel('b')));
                if (SL.length >= 3)
                    al.append(ibtn('↔ distribuir', 'Distribuir na horizontal', () => distribute('h')), ibtn('↕ distribuir', 'Distribuir na vertical', () => distribute('v')));
                ep.appendChild(field(SL.length === 1 ? 'Alinhar à tela' : 'Alinhar', al));
                const ord = el('div', 'vbie-actions');
                ord.append(ibtn('▲ Frente', 'Trazer para a frente ( ] )', () => reorder(1)), ibtn('▼ Trás', 'Enviar para trás ( [ )', () => reorder(-1)), ibtn('⧉ Duplicar', 'Duplicar (Ctrl+D)', dupSel), ibtn('✕ Remover', 'Tirar da montagem (Delete)', removeSel));
                ep.appendChild(ord);
                box.appendChild(ep);
            }
            else
                box.appendChild(el('p', 'vbie-note', 'Clique numa imagem no palco para mover, redimensionar (alças brancas) ou girar (círculo). Shift soma à seleção; Alt desliga os ímãs; Ctrl+roda dá zoom.'));
            /* 4. organizar / histórico */
            if (c.layers.length > 1) {
                const ar = el('div', 'vbie-actions');
                ar.setAttribute('data-vbie', 'arrange-actions');
                ar.append(ibtn('Lado a lado', 'Organiza em linha', () => arrangeOnce('row')), ibtn('Empilhar', 'Organiza em coluna', () => arrangeOnce('column')), ibtn('Grade', 'Organiza em grade', () => arrangeOnce('grid')));
                box.appendChild(field('Organizar', ar, 'Posiciona uma vez; depois continua livre'));
                box.appendChild(slider('Espaço entre (px)', c.gap, 0, 200, 1, v => { c.gap = v; }, 'Usado ao organizar'));
                box.appendChild(slider('Margem (px)', c.margin, 0, 200, 1, v => { c.margin = v; }, 'Usada ao organizar e ao ajustar a tela'));
            }
            const hist = el('div', 'vbie-actions');
            hist.setAttribute('data-vbie', 'compose-history');
            const u = ibtn('↶ Desfazer', 'Desfazer (Ctrl+Z)', undoC), r = ibtn('↷ Refazer', 'Refazer (Ctrl+Y)', redoC);
            u.disabled = !chist.length;
            r.disabled = !cfut.length;
            hist.append(u, r);
            box.appendChild(hist);
        }
        /** Chave fixa "Editar: só esta / todas (N)", visível em todas as abas. */
        function scopeBanner() {
            const live = recent.filter(id => S.assets.some(a => a.id === id) && A.blobs.has(id));
            if (batch.length < 2 && live.length < 2)
                return null;
            const box = el('div', 'vbie-scope');
            box.setAttribute('data-vbie', 'scope');
            if (batch.length < 2) {
                const b = el('button', 'btn', '🗂 Editar as ' + live.length + ' salvas agora, juntas');
                b.type = 'button';
                b.setAttribute('data-vbie', 'scope-recent');
                b.title = 'Forma um lote com as imagens recém-salvas: o que você fizer vale para todas';
                b.addEventListener('click', () => { setBatch(live); batchNote = ''; renderSide(); renderResults(); });
                box.appendChild(b);
                return box;
            }
            box.appendChild(el('span', 'vbie-scopelab', 'Editar:'));
            const seg = el('div', 'vbie-seg');
            seg.setAttribute('role', 'group');
            seg.setAttribute('aria-label', 'Editar só esta imagem ou todas do lote');
            const mk = (v, label, key) => {
                const b = el('button', 'vbie-segbtn' + (scope === v ? ' on' : ''), label);
                b.type = 'button';
                b.setAttribute('aria-pressed', String(scope === v));
                b.setAttribute('data-vbie', key);
                b.addEventListener('click', () => { if (scope === v)
                    return; scope = v; clearAllPrev(); renderSide(); renderResults(); if (v === 'all')
                    scheduleAllPreview(0); });
                seg.appendChild(b);
            };
            mk('one', 'Só esta', 'scope-one');
            mk('all', 'Todas (' + batch.length + ')', 'scope-all');
            box.appendChild(seg);
            if (prevBatch.length >= 2) {
                const back = el('button', 'btn ghost', '↩ Lote anterior');
                back.type = 'button';
                back.setAttribute('data-vbie', 'batch-prev');
                back.title = 'Volta a editar as imagens de antes da última aplicação';
                back.addEventListener('click', () => { const keep = batch.slice(); setBatch(prevBatch); prevBatch = keep; batchNote = ''; if (batch[0])
                    void loadSource(batch[0], { preview: false }).then(() => { clearResult(); renderHeader(); renderSide(); renderResults(); }); });
                box.appendChild(back);
            }
            return box;
        }
        /** Botão principal "… em todas (N)" colado no fim dos controles de cada aba. */
        function batchAction() {
            if (!inAll())
                return null;
            const wrap = el('div', 'vbie-allaction');
            wrap.setAttribute('data-vbie', 'all-action');
            if (tab === 'compose') {
                wrap.appendChild(el('p', 'vbie-note', 'Montar junta várias imagens numa só, por isso não existe "em todas". Use as outras abas para editar o lote.'));
                return wrap;
            }
            if (tab === 'adjust') {
                wrap.appendChild(el('p', 'vbie-note', '🗂 Modo "todas" ligado: cada ajuste abaixo vale para as ' + batch.length + ' imagens do lote (um Desfazer).'));
                return wrap;
            }
            const go = el('button', 'btn primary', '⚡ ' + OP_LABEL[tab] + ' em todas (' + targets().length + ')');
            go.type = 'button';
            go.setAttribute('data-vbie', 'all-apply');
            go.disabled = batchBusy || busy || targets().length < 1;
            go.title = 'Aplica as configurações desta aba a todas as imagens do lote';
            go.addEventListener('click', () => { void applyToAll(); });
            wrap.appendChild(go);
            if (tab === 'crop')
                wrap.appendChild(el('p', 'vbie-note', 'Em todas, o recorte vale em % da imagem (serve para tamanhos diferentes).'));
            if (tab === 'contour')
                wrap.appendChild(el('p', 'vbie-note', 'Pontos marcados à mão só valem na imagem aberta; em todas usa-se a cor do contorno.'));
            return wrap;
        }
        function renderSide() {
            if (!side)
                return;
            const keep = side.scrollTop;
            side.textContent = '';
            const tabs = el('div', 'vbie-tabs');
            tabs.setAttribute('role', 'tablist');
            for (const [t, label] of TABS) {
                const b = el('button', 'vbie-tab' + (t === tab ? ' on' : ''), label);
                b.type = 'button';
                b.setAttribute('role', 'tab');
                b.setAttribute('aria-selected', String(t === tab));
                b.addEventListener('click', () => { if (t === tab)
                    return; tab = t; pick = null; if (t === 'compose' && !P.compose.layers.length && assetId)
                    addLayers([assetId]); if (canvas)
                    canvas.style.cursor = ''; clearResult(); renderSide(); renderResults(); drawStage(); schedule(0); });
                tabs.appendChild(b);
            }
            const sb = scopeBanner();
            if (sb)
                side.appendChild(sb);
            side.appendChild(tabs);
            const live = recent.filter(id => S.assets.some(a => a.id === id) && A.blobs.has(id));
            if (live.length) {
                const rc = el('div', 'vbie-recent');
                rc.setAttribute('data-vbie', 'recent');
                rc.appendChild(el('span', 'vbie-note', 'Salvas agora (clique para editar):'));
                for (const id of live) {
                    const a = S.assets.find(x => x.id === id);
                    const b = el('button', 'btn' + (id === assetId ? ' primary' : ''), a.name);
                    b.type = 'button';
                    b.title = 'Editar ' + a.name;
                    b.setAttribute('data-recent', id);
                    b.addEventListener('click', () => { if (id !== assetId)
                        void loadSource(id); });
                    rc.appendChild(b);
                }
                side.appendChild(rc);
            }
            const box = el('div', 'vbie-controls');
            side.appendChild(box);
            if (!src)
                box.appendChild(el('p', 'vbie-note', 'Escolha uma imagem acima.'));
            else if (tab === 'grid')
                gridControls(box);
            else if (tab === 'bg')
                bgControls(box);
            else if (tab === 'contour')
                contourControls(box);
            else if (tab === 'crop')
                cropControls(box);
            else if (tab === 'color')
                colorControls(box);
            else if (tab === 'compose')
                composeControls(box);
            else
                adjustControls(box);
            const ba = batchAction();
            if (ba)
                side.appendChild(ba);
            side.scrollTop = keep;
        }
        function thumb(c) {
            const t = document.createElement('canvas'), k = Math.min(1, 56 / Math.max(c.width, c.height, 1));
            t.width = Math.max(1, Math.round(c.width * k));
            t.height = Math.max(1, Math.round(c.height * k));
            t.className = 'vbie-thumb';
            t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
            return t;
        }
        /** Nome-base do ZIP: a imagem aberta sem extensão. */
        const baseName = () => (S.assets.find(a => a.id === assetId)?.name ?? 'imagens').replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/_(cor|sem-fundo|recorte|r\d+c\d+)$/i, '') + '-editadas';
        async function exportIds(ids, name) {
            try {
                const r = await E.exportZip(ids, name ? { name } : undefined);
                batchNote = '⬇ ' + r.count + (r.count === 1 ? ' imagem exportada' : ' imagens exportadas') + ' em ' + r.filename;
            }
            catch (e) {
                message = e.message;
            }
            renderResults();
        }
        /* ---------------- lote: a mesma operação em várias imagens ---------------- */
        let batch = [], prevBatch = [], batchNote = '', batchBusy = false;
        /** 'all': tudo o que se faz vale para todas as imagens do lote. */
        let scope = 'one';
        const allPrev = new Map();
        const excluded = new Set();
        let allToken = 0, allTimer = null;
        const PREVIEW_MAX = 24;
        const targets = () => batch.filter(id => !excluded.has(id));
        const OP_LABEL = { grid: 'Cortar em grade', bg: 'Tirar fundo', contour: 'Recortar por contorno', crop: 'Recortar', color: 'Trocar cor', compose: 'Montar', adjust: 'Ajustar' };
        const batchable = (t) => t !== 'compose' && t !== 'adjust';
        /** Parâmetros que valem para todas as imagens do lote (pontos marcados numa imagem não servem para as outras). */
        function batchParams(t) {
            const p = { ...paramsOf(t) };
            if (t === 'contour')
                delete p['seeds'];
            if (t === 'bg' && p['holes'] && typeof p['holes'] === 'object')
                p['holes'] = { ...p['holes'], seeds: [] }; // pontos de uma imagem não servem às outras
            if (t === 'crop' && src) {
                const c = P.crop, w = src.width, h = src.height;
                return { unit: 'percent', x: c.x / w * 100, y: c.y / h * 100, width: c.width / w * 100, height: c.height / h * 100 };
            } // pixels de uma imagem não servem às outras
            return p;
        }
        function setBatch(ids) {
            batch = [...new Set(ids)].filter(id => S.assets.some(a => a.id === id)).slice(0, 80);
            excluded.clear();
            clearAllPrev();
            if (batch.length >= 2)
                scope = 'all';
            else {
                scope = 'one';
            }
        }
        const inAll = () => scope === 'all' && batch.length >= 2;
        async function applyToAll() {
            if (batchBusy || !inAll() || !batchable(tab))
                return;
            if (tab === 'contour' && !P.contour.color) {
                message = 'Escolha a cor do contorno antes de aplicar a todas.';
                renderResults();
                return;
            }
            if (tab === 'color') {
                const c = P.color;
                if (c.mode === 'roles' && !c.outlineTo && !c.fillTo) {
                    message = 'Escolha a nova cor do contorno e/ou do preenchimento.';
                    renderResults();
                    return;
                }
                if (c.mode === 'pairs' && !c.pairs.some(q => q.from)) {
                    message = 'Adicione a cor a trocar (conta-gotas) antes de aplicar a todas.';
                    renderResults();
                    return;
                }
            }
            batchBusy = true;
            message = '';
            batchNote = 'Aplicando em ' + batch.length + ' imagens…';
            renderResults();
            try {
                const done = await E.applyBatch(targets(), opOf(tab), batchParams(tab), { onProgress: (d, n) => { batchNote = 'Aplicando… ' + d + ' de ' + n; renderResults(); } });
                const made = done.results.flatMap(r => (r.assets ?? []).map(a => a.id));
                const errs = done.results.filter(r => !r.ok).map(r => (S.assets.find(a => a.id === r.sourceAssetId)?.name ?? r.sourceAssetId) + ': ' + r.error);
                batchNote = done.created + (done.created === 1 ? ' imagem criada' : ' imagens criadas') + ' a partir de ' + (done.total - done.failed) + ' · um Desfazer remove todas.' + (errs.length ? ' Com erro — ' + errs.slice(0, 3).join(' | ') + (errs.length > 3 ? ' …' : '') : '');
                if (made.length) {
                    rememberRecent(made);
                    kernel.emit('assets:changed');
                    prevBatch = batch.slice();
                    setBatch(made); // o lote passa a ser o resultado: dá para encadear (cor → fundo → …)
                    const first = made[0];
                    if (batch.length) {
                        if (tab === 'grid')
                            tab = 'bg';
                        await loadSource(first, { preview: false });
                        clearResult();
                        renderHeader();
                    }
                }
            }
            catch (e) {
                message = e.message;
                batchNote = '';
            }
            batchBusy = false;
            renderResults();
            renderSide();
        }
        function clearAllPrev() { allToken++; allPrev.clear(); }
        /** Calcula, em fila e cancelável, o efeito da aba atual em cada imagem do lote (as 24 primeiras; o resto só ao aplicar). */
        function scheduleAllPreview(delay = 450) {
            if (allTimer)
                clearTimeout(allTimer);
            allTimer = window.setTimeout(() => { allTimer = null; void runAllPreview(); }, delay);
        }
        async function runAllPreview() {
            const mine = ++allToken;
            if (!inAll() || !batchable(tab)) {
                allPrev.clear();
                renderResults();
                return;
            }
            if (tab === 'contour' && !P.contour.color) {
                allPrev.clear();
                renderResults();
                return;
            }
            if (tab === 'color') {
                const c = P.color;
                if ((c.mode === 'roles' && !c.outlineTo && !c.fillTo) || (c.mode === 'pairs' && !c.pairs.some(q => q.from))) {
                    allPrev.clear();
                    renderResults();
                    return;
                }
            }
            const params = batchParams(tab), op = opOf(tab), ids = batch.slice();
            allPrev.clear();
            ids.slice(PREVIEW_MAX).forEach(id => allPrev.set(id, { status: 'skip', note: 'Calculada ao aplicar' }));
            for (const id of ids.slice(0, PREVIEW_MAX)) {
                if (mine !== allToken)
                    return;
                let res = null;
                try {
                    res = await E.preview(id, op, params);
                    const p0 = res.pieces[0];
                    const thumbCanvas = p0 ? thumb(p0.canvas) : undefined;
                    const real = res.warnings.filter(w => !/não tem transparência/i.test(w)); // aviso geral, não é problema desta imagem
                    allPrev.set(id, { status: real.length ? 'warn' : 'ok', ...(thumbCanvas ? { thumb: thumbCanvas } : {}), ...(real.length ? { note: real[0] } : {}), pieces: res.pieces.length });
                }
                catch (e) {
                    allPrev.set(id, { status: 'err', note: e.message });
                }
                finally {
                    if (res)
                        E.release(res);
                }
                if (mine === allToken)
                    renderResults();
            }
        }
        function batchBar() {
            if (!inAll())
                return null;
            const box = el('div', 'vbie-batch');
            box.setAttribute('data-vbie', 'batch');
            const top = el('div', 'vbie-batchtop');
            top.append(el('strong', undefined, '🗂 Lote: ' + batch.length + ' imagens'));
            const clear = el('button', 'btn ghost', 'Sair do lote');
            clear.type = 'button';
            clear.setAttribute('data-vbie', 'batch-clear');
            clear.addEventListener('click', () => { batch = []; scope = 'one'; batchNote = ''; renderResults(); renderSide(); });
            top.appendChild(clear);
            box.appendChild(top);
            const chips = el('div', 'vbie-batchchips');
            for (const id of batch) {
                const a = S.assets.find(x => x.id === id);
                if (!a)
                    continue;
                const pv = allPrev.get(id), off = excluded.has(id);
                const chip = el('div', 'vbie-batchchip' + (id === assetId ? ' on' : '') + (off ? ' off' : '') + (pv ? ' ' + pv.status : ''));
                chip.setAttribute('data-vbie', 'batch-chip');
                chip.tabIndex = 0;
                chip.title = (a.name || id) + (pv?.note ? '\n' + (pv.status === 'err' ? '✕ ' : '⚠ ') + pv.note : '') + '\nClique para abrir esta imagem';
                if (pv?.thumb) {
                    const c = pv.thumb;
                    const cp = el('canvas');
                    cp.width = c.width;
                    cp.height = c.height;
                    cp.getContext('2d').drawImage(c, 0, 0);
                    chip.appendChild(cp);
                }
                else {
                    const url = A.urls.get(id);
                    if (url) {
                        const im = el('img');
                        im.src = url;
                        im.alt = a.name;
                        im.draggable = false;
                        chip.appendChild(im);
                    }
                    else
                        chip.textContent = (a.name || id).slice(0, 6);
                }
                const mark = pv ? (pv.status === 'ok' ? '✓' : pv.status === 'warn' ? '⚠' : pv.status === 'err' ? '✕' : '…') : '';
                if (mark)
                    chip.appendChild(el('span', 'vbie-batchmark', mark));
                const cb = el('input');
                cb.type = 'checkbox';
                cb.checked = !off;
                cb.className = 'vbie-batchcb';
                cb.title = 'Incluir esta imagem ao aplicar';
                cb.setAttribute('aria-label', 'Incluir ' + a.name);
                cb.addEventListener('click', ev => ev.stopPropagation());
                cb.addEventListener('change', () => { if (cb.checked)
                    excluded.delete(id);
                else
                    excluded.add(id); renderResults(); renderSide(); });
                chip.appendChild(cb);
                chip.addEventListener('click', () => { if (id !== assetId)
                    void loadSource(id); });
                const x = el('span', 'vbie-batchx', '✕');
                x.title = 'Tirar do lote';
                x.setAttribute('role', 'button');
                x.addEventListener('click', ev => { ev.stopPropagation(); batch = batch.filter(b => b !== id); excluded.delete(id); allPrev.delete(id); if (batch.length < 2)
                    scope = 'one'; renderResults(); renderSide(); });
                chip.appendChild(x);
                chips.appendChild(chip);
            }
            box.appendChild(chips);
            const go = el('button', 'btn primary', batchable(tab) ? '⚡ ' + OP_LABEL[tab] + ' em todas (' + targets().length + ')' : 'Escolha uma aba de edição');
            go.type = 'button';
            go.setAttribute('data-vbie', 'batch-apply');
            go.disabled = batchBusy || busy || !batchable(tab) || targets().length < 1;
            go.title = 'Aplica as configurações desta aba a todas as imagens do lote, cada resultado vira uma imagem nova na biblioteca';
            go.addEventListener('click', () => { void applyToAll(); });
            box.appendChild(go);
            const exp = el('button', 'btn', '⬇ Exportar o lote (' + targets().length + ') em ZIP');
            exp.type = 'button';
            exp.setAttribute('data-vbie', 'batch-export');
            exp.title = 'Baixa todas as imagens do lote num arquivo ZIP (arquivos originais, sem recomprimir)';
            exp.addEventListener('click', () => { void exportIds(targets(), baseName()); });
            box.appendChild(exp);
            box.appendChild(el('p', 'vbie-note', 'A prévia abaixo mostra só a imagem aberta; ao aplicar, as mesmas configurações valem para todas. Depois, o lote passa a ser as novas imagens para você continuar (ex.: cor → tirar fundo).'));
            if (batchNote)
                box.appendChild(el('p', 'vbie-batchnote', batchNote));
            return box;
        }
        async function startBatch(ids) {
            const valid = ids.filter(id => A.blobs.has(id)).slice(0, 80);
            if (!valid.length) {
                toast('Selecione imagens da biblioteca para editar em lote.');
                return;
            }
            await open(valid[0]);
            setBatch(valid);
            batchNote = '';
            if (tab === 'compose' || tab === 'adjust' || tab === 'grid')
                tab = 'bg';
            renderHeader();
            renderSide();
            renderResults();
            drawStage();
            schedule(0);
        }
        function renderResults() {
            if (!resultsBox)
                return;
            resultsBox.textContent = '';
            const head = el('div', 'vbie-reshead');
            head.appendChild(el('strong', undefined, 'Resultado'));
            if (busy)
                head.appendChild(el('span', 'vbie-busy', 'calculando…'));
            resultsBox.appendChild(head);
            const bb = batchBar();
            if (bb)
                resultsBox.appendChild(bb);
            if (message)
                resultsBox.appendChild(el('p', 'vbie-error', message));
            if (result) {
                for (const w of result.warnings)
                    resultsBox.appendChild(el('p', 'vbie-warn', '⚠ ' + w));
                const list = el('div', 'vbie-list');
                result.pieces.forEach((p, i) => {
                    const row = el('label', 'vbie-item');
                    const cb = el('input');
                    cb.type = 'checkbox';
                    cb.checked = checked.has(i);
                    cb.addEventListener('change', () => { if (cb.checked)
                        checked.add(i);
                    else
                        checked.delete(i); renderResults(); drawStage(); });
                    const info = el('span', 'vbie-iteminfo');
                    info.append(el('b', undefined, p.name), el('small', undefined, p.width + ' × ' + p.height + ' px'));
                    row.append(cb, thumb(p.canvas), info);
                    list.appendChild(row);
                });
                resultsBox.appendChild(list);
                resultsBox.appendChild(semanticCard());
                const bar = el('div', 'vbie-actions');
                const all = el('button', 'btn', 'Marcar todas');
                all.type = 'button';
                all.addEventListener('click', () => { checked = new Set(checked.size === result.pieces.length ? [] : result.pieces.map((_, i) => i)); renderResults(); drawStage(); });
                const save = el('button', 'btn primary', 'Salvar ' + checked.size + (checked.size === 1 ? ' imagem' : ' imagens'));
                save.type = 'button';
                save.disabled = !checked.size || busy;
                save.addEventListener('click', () => { void saveChecked(false); });
                const edit = el('button', 'btn', '✎ Salvar e editar');
                edit.type = 'button';
                edit.disabled = !checked.size || busy;
                edit.setAttribute('data-vbie', 'save-edit');
                edit.title = 'Salva na biblioteca e já abre a primeira imagem marcada aqui para continuar (tirar fundo, trocar cor, montar…)';
                edit.addEventListener('click', () => { void saveChecked(false, true); });
                const cloud = el('button', 'btn', '☁ Salvar e enviar ao catálogo');
                cloud.type = 'button';
                cloud.disabled = !checked.size || busy;
                cloud.title = 'Salva no projeto e também envia as imagens ao catálogo (Asset Hub), sem apagar nada';
                cloud.addEventListener('click', () => { void saveChecked(true); });
                const many = el('button', 'btn', '⚙ Salvar e editar todas');
                many.type = 'button';
                many.setAttribute('data-vbie', 'save-batch');
                many.disabled = checked.size < 2 || busy;
                many.hidden = checked.size < 2;
                many.title = 'Salva as imagens marcadas e abre todas como um lote: trocar cor, tirar fundo etc. em todas de uma vez';
                many.addEventListener('click', () => { void saveChecked(false, true, true); });
                const zipBtn = el('button', 'btn', '⬇ Salvar e exportar ZIP');
                zipBtn.type = 'button';
                zipBtn.setAttribute('data-vbie', 'save-zip');
                zipBtn.disabled = !checked.size || busy;
                zipBtn.title = 'Salva as imagens marcadas na biblioteca e baixa todas num arquivo ZIP';
                zipBtn.addEventListener('click', () => { void saveChecked(false, false, false, true); });
                bar.append(all, save, edit, many, zipBtn, cloud);
                resultsBox.appendChild(bar);
                resultsBox.appendChild(el('p', 'vbie-note', 'A imagem original não é alterada. As novas ficam na biblioteca e um único Desfazer remove todas.'));
            }
        }
        /** Anotações semânticas (opcional) aplicadas às imagens enviadas ao catálogo. O formulário vem do assetHub; sem Hub/escrita fica desabilitado com o motivo. */
        let semDraft = null;
        let semLoading = false, semOpen = false; // o cartão não pode fechar a cada atualização da lista
        /** Anotações herdadas do ORIGINAL (achado no catálogo pelo SHA-256 do arquivo). Só os campos objetivos; "o que representa" não é herdado (descreve a imagem inteira). */
        let semInherit = null, semInheritOn = true, semInheritNote = '';
        async function findOriginalSemantic() {
            semInherit = null;
            semInheritNote = '';
            try {
                const blob = assetId ? A.blobs.get(assetId) : null;
                if (!blob) {
                    semInheritNote = 'Não há arquivo original carregado.';
                    return;
                }
                const sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
                const hub = await kernel.require('assetHub');
                const found = await hub.call('search', { where: [{ field: 'sha256', op: 'eq', value: sha }], limit: 1 });
                if (!found.items.length) {
                    semInheritNote = 'O original não está no catálogo.';
                    return;
                }
                const g = await hub.semanticGet(found.items[0].id);
                if (!g.semantic) {
                    semInheritNote = 'O original está no catálogo, mas sem anotações.';
                    return;
                }
                const { v: _v, updatedAt: _u, origin: _o, represents: _r, ...fields } = g.semantic;
                semInherit = fields;
                semInheritNote = 'Herdando do original: ' + Object.keys(fields).length + ' campo(s).';
            }
            catch (e) {
                semInheritNote = 'Não foi possível consultar o catálogo: ' + e.message;
            }
        }
        function semanticCard() {
            const box = el('details', 'vbie-sem');
            box.setAttribute('data-vbie', 'semantic');
            const sum = el('summary', undefined, 'Anotações semânticas das imagens enviadas (opcional)');
            sum.addEventListener('click', () => { semOpen = !box.open; }); // síncrono: o evento "toggle" é assíncrono e perderia a corrida com um redesenho
            box.appendChild(sum);
            if (semOpen)
                box.setAttribute('open', '');
            box.addEventListener('toggle', () => { semOpen = box.open; });
            if (semDraft) {
                const row = el('div', 'vbie-actions');
                const find = el('button', 'btn', 'Buscar anotações do original no catálogo');
                find.type = 'button';
                find.addEventListener('click', () => { void findOriginalSemantic().then(renderResults); });
                row.appendChild(find);
                if (semInherit) {
                    const lab = el('label', 'vbie-note');
                    const cb = el('input');
                    cb.type = 'checkbox';
                    cb.checked = semInheritOn;
                    cb.addEventListener('change', () => { semInheritOn = cb.checked; });
                    lab.append(cb, ' herdar do original (o que você escolher abaixo prevalece)');
                    row.appendChild(lab);
                }
                box.appendChild(row);
                if (semInheritNote)
                    box.appendChild(el('p', 'vbie-note', semInheritNote));
                box.appendChild(semDraft.el);
                return box;
            }
            box.appendChild(el('p', 'vbie-note', semLoading ? 'Carregando o vocabulário do catálogo…' : 'Conecte-se ao catálogo (Mais ▸ Catálogo de imagens) com um token de escrita para anotar; sem isso as imagens são enviadas sem anotação.'));
            if (!semLoading) {
                semLoading = true;
                kernel.require('assetHub').then(h => h.isConnected() ? h.semanticDraftForm() : null)
                    .then(d => { semLoading = false; if (d) {
                    semDraft = d;
                    renderResults();
                } }).catch(() => { semLoading = false; });
            }
            return box;
        }
        async function sendToCatalog(list) {
            try {
                const hub = await kernel.require('assetHub');
                const origin = S.assets.find(a => a.id === assetId)?.name ?? 'imagem';
                let sent = 0, notAnnotated = 0;
                const semantic = { ...(semInherit && semInheritOn ? semInherit : {}), ...(semDraft ? semDraft.patch() : {}) };
                for (const a of list) {
                    const blob = A.blobs.get(a.id);
                    if (!blob)
                        continue;
                    const res = await hub.upload(new File([blob], a.name, { type: blob.type || 'image/png' }), { tags: ['origem:editor-de-imagens', 'derivada-de:' + origin.replace(/[^\p{L}\p{N} _.\-]/gu, ' ').trim().slice(0, 60)], ...(Object.keys(semantic).length ? { semantic } : {}) });
                    if (Object.keys(semantic).length && res.semanticApplied === false)
                        notAnnotated++;
                    sent++;
                }
                toast(sent + (sent === 1 ? ' imagem enviada' : ' imagens enviadas') + ' ao catálogo.', 'ok');
                if (notAnnotated)
                    message = notAnnotated + ' imagem(ns) foram enviadas, mas a anotação semântica não foi aplicada; ela será tentada de novo ao sincronizar.';
            }
            catch (e) {
                message = 'Salvo no projeto, mas o catálogo não recebeu: ' + e.message;
            }
        }
        async function saveChecked(toCatalog, editAfter = false, asBatch = false, exportAfter = false) {
            if (!result || !checked.size || busy)
                return;
            busy = true;
            renderResults();
            try {
                const done = await E.commit(result, [...checked].sort((a, b) => a - b));
                message = '';
                toast(done.assets.length + (done.assets.length === 1 ? ' imagem salva' : ' imagens salvas') + ' na biblioteca.', 'ok');
                kernel.emit('assets:changed');
                rememberRecent(done.assets.map(a => a.id));
                if (toCatalog)
                    await sendToCatalog(done.assets);
                if (exportAfter)
                    await exportIds(done.assets.map(a => a.id), baseName());
                if (done.assets.length > 1) {
                    prevBatch = [];
                    setBatch(done.assets.map(a => a.id));
                    batchNote = '';
                    editAfter = true;
                } // 2+ peças salvas formam o lote e o editor passa a trabalhar nelas
                if (editAfter && done.assets[0]) {
                    busy = false;
                    if (tab === 'grid' || tab === 'crop' || tab === 'contour')
                        tab = 'bg';
                    if (done.assets.length <= 1) {
                        batch = [];
                        scope = 'one';
                    }
                    await loadSource(done.assets[0].id);
                    renderHeader();
                    renderResults();
                    return;
                }
            }
            catch (e) {
                message = e.message;
            }
            busy = false;
            renderResults();
            renderHeader();
            renderSide();
        }
        /* ---------------- janela ---------------- */
        let headEl = null;
        let mode = 'edit';
        function renderHeader() {
            if (!headEl)
                return;
            headEl.textContent = '';
            if (mode === 'blocking') {
                headEl.appendChild(el('h2', undefined, '🎬 Blocking de cena'));
                headEl.appendChild(el('span', 'vbie-spacer'));
                const back = el('button', 'btn', '← Editor de imagens');
                back.type = 'button';
                back.addEventListener('click', () => { void setMode('edit'); });
                headEl.appendChild(back);
                const c2 = el('button', 'btn', '✕ Fechar');
                c2.type = 'button';
                c2.addEventListener('click', () => closeEditor());
                headEl.appendChild(c2);
                return;
            }
            headEl.appendChild(el('h2', undefined, '🖼 Editor de imagens'));
            const s = el('select');
            s.setAttribute('aria-label', 'Imagem a editar');
            const none = el('option', undefined, '— escolher imagem —');
            none.value = '';
            s.appendChild(none);
            for (const a of usable()) {
                const o = el('option', undefined, a.name || a.id);
                o.value = a.id;
                s.appendChild(o);
            }
            s.value = assetId ?? '';
            s.addEventListener('change', () => { if (s.value)
                void loadSource(s.value); });
            headEl.appendChild(s);
            const cur = assetId ? S.assets.find(a => a.id === assetId) : undefined;
            const orig = cur?.derivedFrom ? S.assets.find(a => a.id === cur.derivedFrom) : undefined;
            if (cur && orig) {
                const tag = el('span', 'vbie-edited', '✎ Editada de "' + orig.name + '"');
                tag.title = 'Esta imagem é uma versão editada; o original continua na biblioteca';
                const back = el('button', 'btn', '↩ Abrir original');
                back.type = 'button';
                back.setAttribute('data-vbie', 'open-original');
                back.addEventListener('click', () => { void loadSource(orig.id).then(() => renderHeader()); });
                headEl.append(tag, back);
                if (A.usageOf(cur.id) > 0) {
                    const sw = el('button', 'btn', '⟲ Voltar nos quadros');
                    sw.type = 'button';
                    sw.setAttribute('data-vbie', 'restore-original');
                    sw.title = 'Troca esta imagem pelo original em todos os quadros (um Desfazer)';
                    sw.addEventListener('click', () => { void A.restoreOriginal(cur.id, { notify: true }).then(() => renderHeader()); });
                    headEl.appendChild(sw);
                }
            }
            const file = el('input');
            file.type = 'file';
            file.accept = 'image/*';
            file.multiple = true;
            file.hidden = true;
            file.addEventListener('change', () => {
                const files = Array.from(file.files ?? []);
                if (!files.length)
                    return;
                const before = new Set(S.assets.map(a => a.id));
                void A.importFiles(files).then(() => { const made = S.assets.find(a => !before.has(a.id)); renderHeader(); if (made)
                    void loadSource(made.id); });
            });
            const open = el('button', 'btn', '📂 Abrir arquivo…');
            open.type = 'button';
            open.addEventListener('click', () => file.click());
            headEl.append(file, open);
            if (selectedLayer && findLayer(selectedLayer)) {
                const lid = selectedLayer;
                const pc = el('button', 'btn', '✂ Recorte do painel');
                pc.type = 'button';
                pc.setAttribute('data-vbie', 'panel-crop');
                pc.title = 'Salva o recorte da imagem selecionada no painel como imagem da biblioteca e abre aqui';
                pc.addEventListener('click', () => { void saveLayerCrop(lid); });
                headEl.appendChild(pc);
            }
            if (kernel.has('ui.sceneBlocking')) {
                const sb = el('button', 'btn', '🎬 Blocking de cena');
                sb.type = 'button';
                sb.title = 'Gera folhas 3×3 de cenas vistas de cima (SVG editável)';
                sb.addEventListener('click', () => { void setMode('blocking'); });
                headEl.appendChild(sb);
            }
            headEl.append(el('span', 'vbie-spacer'));
            if (src) {
                const z = (f) => { zoom = Math.max(0.05, Math.min(16, scale() * f)); drawStage(); };
                const mk = (t, title, fn) => { const b = el('button', 'btn', t); b.type = 'button'; b.title = title; b.addEventListener('click', fn); return b; };
                headEl.append(mk('−', 'Reduzir', () => z(1 / 1.25)), mk('Ajustar', 'Ajustar à janela', () => { zoom = 0; drawStage(); }), mk('100%', 'Tamanho real', () => { zoom = 1; drawStage(); }), mk('+', 'Ampliar', () => z(1.25)));
                headEl.appendChild(el('span', 'vbie-dim', src.width + ' × ' + src.height + ' px'));
            }
            const close = el('button', 'btn', '✕ Fechar');
            close.type = 'button';
            close.addEventListener('click', () => closeEditor());
            headEl.appendChild(close);
        }
        function render() {
            if (!root)
                return;
            root.textContent = '';
            const win = el('div', 'vbie-window');
            root.appendChild(win);
            headEl = el('div', 'vbie-head');
            win.appendChild(headEl);
            const body = el('div', 'vbie-body');
            win.appendChild(body);
            if (mode === 'blocking') {
                stageBox = null;
                side = null;
                resultsBox = null;
                canvas = null;
                renderHeader();
                void kernel.require('ui.sceneBlocking').then(ui => { if (root && mode === 'blocking')
                    ui.mount(body); });
                return;
            }
            side = el('div', 'vbie-side');
            body.appendChild(side);
            stageBox = el('div', 'vbie-stage');
            body.appendChild(stageBox);
            resultsBox = el('div', 'vbie-results');
            body.appendChild(resultsBox);
            canvas = el('canvas', 'vbie-canvas');
            canvas.setAttribute('aria-label', 'Imagem em edição');
            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('pointerup', onPointerUp);
            canvas.tabIndex = 0;
            stageBox.addEventListener('wheel', onWheel, { passive: false });
            canvas.addEventListener('keydown', onCanvasKey);
            if (src)
                stageBox.appendChild(canvas);
            else
                stageBox.appendChild(el('p', 'vbie-empty', usable().length ? 'Escolha uma imagem da biblioteca ou abra um arquivo.' : 'A biblioteca está vazia. Abra um arquivo ou sincronize uma pasta do Drive.'));
            renderHeader();
            renderSide();
            renderResults();
            drawStage();
        }
        async function setMode(m) {
            if (mode === m)
                return;
            if (mode === 'blocking' && kernel.has('ui.sceneBlocking'))
                (await kernel.require('ui.sceneBlocking')).unmount();
            mode = m;
            render();
            if (m === 'edit' && assetId && A.blobs.has(assetId))
                await loadSource(assetId);
        }
        function closeEditor() {
            if (kernel.has('ui.sceneBlocking'))
                void kernel.require('ui.sceneBlocking').then(ui => ui.unmount());
            mode = 'edit';
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            clearResult();
            releaseBmps();
            cdrag = null;
            root?.remove();
            root = null;
            src = null;
            srcPixels = null;
            canvas = null;
            side = null;
            resultsBox = null;
            stageBox = null;
            headEl = null;
            pick = null;
        }
        async function open(id) {
            if (root)
                closeEditor();
            root = el('div', 'vbie-overlay');
            root.setAttribute('role', 'dialog');
            root.setAttribute('aria-modal', 'true');
            root.setAttribute('aria-label', 'Editor de imagens');
            document.body.appendChild(root);
            const first = id && A.blobs.has(id) ? id : (assetId && A.blobs.has(assetId) ? assetId : null);
            if (first) {
                render();
                await loadSource(first);
            }
            else {
                src = null;
                render();
            }
        }
        kernel.listen(window, 'keydown', event => {
            const e = event;
            if (!root)
                return;
            if (e.key === 'Escape') {
                if (pick) {
                    pick = null;
                    if (canvas)
                        canvas.style.cursor = '';
                    renderSide();
                }
                else
                    closeEditor();
            }
        });
        kernel.listen(window, 'resize', () => { if (root && zoom === 0)
            drawStage(); });
        kernel.on('assets:changed', () => { if (root)
            renderHeader(); });
        /* Recorte feito no painel → imagem da biblioteca (e já abre no editor para continuar). */
        let selectedLayer = null;
        kernel.on('manga-edit:selection', payload => { selectedLayer = payload.layerId ?? null; });
        function findLayer(layerId) {
            const board = S.boards.find(b => b.id === S.currentBoardId);
            for (const i of board?.instances ?? []) {
                if (i.type !== 'manga-page')
                    continue;
                const lists = [];
                for (const p of i.panels || [])
                    lists.push(p.layers || []);
                lists.push(i.overlays || []);
                for (const u of i.unassignedPanels || [])
                    lists.push(u.layers || []);
                for (const l of lists.flat())
                    if (l.id === layerId && l.assetId)
                        return { assetId: l.assetId, crop: { left: 0, top: 0, right: 0, bottom: 0, ...(l.vp1Crop || {}) } };
            }
            return null;
        }
        async function saveLayerCrop(layerId) {
            const found = findLayer(layerId);
            const asset = found ? S.assets.find(a => a.id === found.assetId) : null;
            if (!found || !asset) {
                toast('Selecione uma imagem dentro de um painel.');
                return;
            }
            const w = asset.originalWidth || 0, h = asset.originalHeight || 0, c = found.crop;
            if (!c.left && !c.top && !c.right && !c.bottom) {
                toast('Esta imagem não tem recorte no painel. Use o recorte do painel primeiro.');
                return;
            }
            const x = Math.round(c.left * w), y = Math.round(c.top * h);
            const width = Math.max(1, Math.round((1 - c.left - c.right) * w)), height = Math.max(1, Math.round((1 - c.top - c.bottom) * h));
            try {
                const done = await E.apply(asset.id, 'crop', { x, y, width: Math.min(width, w - x), height: Math.min(height, h - y) });
                kernel.emit('assets:changed');
                rememberRecent(done.assets.map(a => a.id));
                toast('Recorte salvo como imagem: ' + done.assets[0].name, 'ok');
                tab = 'bg';
                await open(done.assets[0].id);
            }
            catch (e) {
                toast(e.message);
            }
        }
        kernel.on('contextmenu:extend', payload => {
            const target = payload;
            target.items.push({ icon: '🖼', label: 'Editor de imagens…', action: () => { void open(); } });
            const layer = selectedLayer;
            if (layer && findLayer(layer))
                target.items.push({ icon: '✂', label: 'Salvar recorte como imagem', action: () => { void saveLayerCrop(layer); } });
        });
        /** Abre o editor já na montagem com as imagens indicadas. */
        async function compose(ids) {
            const valid = ids.filter(id => A.blobs.has(id)).slice(0, 40);
            if (!valid.length) {
                toast('Selecione imagens da biblioteca para montar.');
                return;
            }
            await open(valid[0]);
            P.compose.layers = [];
            P.compose.selected = 0;
            P.compose.arrange = 'none';
            P.compose.width = 0;
            P.compose.height = 0;
            P.compose.fixed = false;
            chist = [];
            cfut = [];
            sel.clear();
            addLayers(valid);
            arrangeOnce('row');
            sel.clear();
            tab = 'compose';
            pick = null;
            clearResult();
            renderSide();
            renderResults();
            drawStage();
            schedule(0);
        }
        kernel.on('image-editor:compose', payload => { void compose(payload.ids ?? []); });
        kernel.on('image-editor:export', payload => { void E.exportZip(payload.ids ?? []).catch(e => toast(e.message)); });
        kernel.on('image-editor:open', () => { void open(); });
        /* Botões "Editor de imagens" (topo, trilho, área vazia). Na área vazia o canvas captura o ponteiro e redireciona o clique, por isso também se escuta o pointerdown. */
        let lastPointer = 0, lastPointerEl = null;
        const fromButton = (ev) => {
            const btn = ev.target?.closest?.('[data-cmd="open-image-editor"]') ?? null;
            if (!btn)
                return;
            if (ev.type === 'pointerdown') {
                lastPointer = Date.now();
                lastPointerEl = btn;
            }
            else {
                const dup = lastPointerEl === btn && Date.now() - lastPointer < 800;
                lastPointerEl = null;
                if (dup)
                    return;
            } // o clique que segue o pointerdown já foi tratado
            void open();
        };
        kernel.listen(document, 'pointerdown', fromButton, { capture: true });
        kernel.listen(document, 'click', fromButton, { capture: true });
        kernel.on('image-editor:batch', payload => { void startBatch(payload.ids ?? []); });
        kernel.provide('ui.imageEditor', { open, close: closeEditor, isOpen: () => !!root, compose, batch: startBatch });
    }
});
