"use strict";
/* =====================================================================
 * plugins/09e-spread.ts  (Fase 20)
 * ---------------------------------------------------------------------
 * Página dupla com encaixes, papel em tamanho real e escala proporcional.
 *
 *  - Papel real: presets de papel de mangá (B4, A4, B5, tankōbon…) em milímetros × px/mm do canvas.
 *    Assim um "name" ocupa o mesmo tamanho relativo de um name de papel de verdade.
 *  - Página dupla: dois encaixes (esquerdo/direito) lado a lado, desenhados como guias no canvas.
 *    Imagens soltas podem ser colocadas dentro dos encaixes sem nenhum modelo de página.
 *  - Modelos por cima: um modelo de página dupla (geometria que atravessa a lombada) ou um par de
 *    modelos simples. O mesmo algoritmo determinístico da Fase 19 (composition.planFrame) decide em
 *    qual painel cada imagem entra, a partir de posição relativa, tamanho e camada.
 *  - Reversível: o cru fica guardado; trocar de modelo recalcula a partir do cru; "voltar ao cru"
 *    restaura as imagens exatamente onde estavam.
 *  - Escala proporcional: páginas, imagens e encaixes escalam juntos pelo mesmo fator.
 *
 * Fornece: spread
 * ===================================================================== */
definePlugin({
    id: 'spread',
    version: '1.0.0',
    needs: ['utils', 'state', 'history', 'panelSets', 'panelTemplates', 'mangaPage', 'composition', 'camera'],
    provides: ['spread'],
    uses: ['ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'history': '^1.0.0', 'panelSets': '^1.0.0', 'panelTemplates': '^1.0.0', 'mangaPage': '^1.0.0', 'composition': '^1.1.0', 'camera': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'spread': '1.0.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const stateApi = await kernel.require('state');
        const S = stateApi.data;
        const history = await kernel.require('history');
        const PS = await kernel.require('panelSets');
        const PT = await kernel.require('panelTemplates');
        const MP = await kernel.require('mangaPage');
        const COMP = await kernel.require('composition');
        const cam = await kernel.require('camera');
        const round3 = (n) => Math.round(n * 1000) / 1000;
        const MAX_IMAGES = 60;
        const MIN_PX_PER_MM = 0.25;
        const MAX_PX_PER_MM = 12;
        /* ------------------------------------------------------------------
         * Papéis reais (milímetros)
         * ------------------------------------------------------------------ */
        const PAPERS = [
            { id: 'b4-frame', name: 'B4 · área útil 180×270', widthMm: 180, heightMm: 270, note: 'Moldura interna (kihon-waku) do papel de mangá B4' },
            { id: 'b4-bleed', name: 'B4 · sangria 220×310', widthMm: 220, heightMm: 310, note: 'Linha de corte (tachikiri) do papel B4' },
            { id: 'b4-paper', name: 'B4 · papel 257×364', widthMm: 257, heightMm: 364, note: 'Folha B4 inteira' },
            { id: 'a4', name: 'A4 · 210×297', widthMm: 210, heightMm: 297, note: 'ISO A4' },
            { id: 'b5', name: 'B5 · 182×257', widthMm: 182, heightMm: 257, note: 'JIS B5' },
            { id: 'a5', name: 'A5 · 148×210', widthMm: 148, heightMm: 210, note: 'ISO A5' },
            { id: 'b6-tankobon', name: 'Tankōbon B6 · 127×188', widthMm: 127, heightMm: 188, note: 'Volume encadernado japonês (B6)' },
            { id: 'us-comic', name: 'Comic EUA · 168×258', widthMm: 168, heightMm: 258, note: 'Página de revista em quadrinhos americana' }
        ];
        function resolvePaper(input) {
            if (input === undefined || input === null)
                return resolvePaper('b4-frame');
            if (typeof input === 'string') {
                const hit = PAPERS.find(p => p.id === input);
                if (!hit)
                    throw Error('Unknown paper preset: ' + input + ' (use spread.list_papers)');
                return { presetId: hit.id, widthMm: hit.widthMm, heightMm: hit.heightMm };
            }
            if (input.presetId && input.widthMm === undefined)
                return resolvePaper(input.presetId);
            const w = Number(input.widthMm), h = Number(input.heightMm);
            if (!Number.isFinite(w) || !Number.isFinite(h) || w < 20 || h < 20 || w > 1000 || h > 1000)
                throw Error('Paper size must be between 20 and 1000 mm');
            const out = { widthMm: round3(w), heightMm: round3(h) };
            if (input.presetId)
                out.presetId = input.presetId;
            return out;
        }
        function checkPxPerMm(value) {
            if (!Number.isFinite(value) || value < MIN_PX_PER_MM || value > MAX_PX_PER_MM)
                throw Error('pxPerMm must be between ' + MIN_PX_PER_MM + ' and ' + MAX_PX_PER_MM);
            return round3(value);
        }
        /* ------------------------------------------------------------------
         * Geometria pura: recorte de polígonos e modelos de página dupla
         * ------------------------------------------------------------------ */
        function clipHalf(poly, axis, keepGreater) {
            const out = [];
            const inside = (p) => keepGreater ? p[0] >= axis : p[0] <= axis;
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length];
                const ia = inside(a), ib = inside(b);
                if (ia)
                    out.push([a[0], a[1]]);
                if (ia !== ib) {
                    const t = (axis - a[0]) / (b[0] - a[0]);
                    out.push([axis, round3(a[1] + t * (b[1] - a[1]))]);
                }
            }
            return out;
        }
        function polyArea(poly) {
            let s = 0;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
                s += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]);
            return Math.abs(s) / 2;
        }
        function clipX(poly, xmin, xmax) {
            const a = clipHalf(poly, xmin, true);
            return a.length < 3 ? [] : clipHalf(a, xmax, false);
        }
        function stretchTemplate(tpl, w, h) {
            const tw = tpl.width ?? 600, th = tpl.height ?? 850;
            return { ...tpl, width: w, height: h,
                panels: tpl.panels.map(poly => poly.map(p => [round3(p[0] / tw * w), round3(p[1] / th * h)])) };
        }
        function rectsBuilder(rects) {
            return (W, H) => {
                const m = Math.min(W / 2, H) * 0.04, g = Math.min(W / 2, H) * 0.022;
                return rects.map(([x0, y0, x1, y1]) => {
                    const l = x0 <= 0 ? m : g / 2, r = x1 >= 1 ? m : g / 2, t = y0 <= 0 ? m : g / 2, b = y1 >= 1 ? m : g / 2;
                    const ax = round3(x0 * W + l), bx = round3(x1 * W - r), ay = round3(y0 * H + t), by = round3(y1 * H - b);
                    return [[ax, ay], [bx, ay], [bx, by], [ax, by]];
                });
            };
        }
        function gridRects(cols, rows) {
            const out = [];
            for (let r = 0; r < rows; r++)
                for (let c = 0; c < cols; c++)
                    out.push([c / cols, r / rows, (c + 1) / cols, (r + 1) / rows]);
            return out;
        }
        const DOUBLE_DEFS = [
            { id: 'dp-splash', name: 'Splash duplo', desc: 'Um único painel ocupa as duas páginas.', build: rectsBuilder([[0, 0, 1, 1]]) },
            { id: 'dp-two-pages', name: 'Um painel por página', desc: 'Dois painéis grandes, um em cada página.', build: rectsBuilder([[0, 0, .5, 1], [.5, 0, 1, 1]]) },
            { id: 'dp-banner-top', name: 'Faixa larga no topo', desc: 'Painel largo atravessa a lombada; dois painéis embaixo.', build: rectsBuilder([[0, 0, 1, .38], [0, .38, .5, 1], [.5, .38, 1, 1]]) },
            { id: 'dp-banner-bottom', name: 'Faixa larga embaixo', desc: 'Dois painéis no topo; painel largo atravessa a lombada embaixo.', build: rectsBuilder([[0, 0, .5, .62], [.5, 0, 1, .62], [0, .62, 1, 1]]) },
            { id: 'dp-center-cross', name: 'Painel central atravessando', desc: 'Painel central cruza a lombada, ladeado por dois painéis e quatro menores.',
                build: rectsBuilder([[0, 0, .5, .3], [.5, 0, 1, .3], [0, .3, .25, .7], [.25, .3, .75, .7], [.75, .3, 1, .7], [0, .7, .5, 1], [.5, .7, 1, 1]]) },
            { id: 'dp-three-rows', name: 'Três faixas', desc: 'Faixa larga no topo, dois painéis no meio e faixa larga embaixo.', build: rectsBuilder([[0, 0, 1, .3], [0, .3, .5, .65], [.5, .3, 1, .65], [0, .65, 1, 1]]) },
            { id: 'dp-four-strips', name: 'Quatro tiras + painel largo', desc: 'Quatro tiras verticais em cima e um painel largo embaixo.', build: rectsBuilder([[0, 0, .25, .5], [.25, 0, .5, .5], [.5, 0, .75, .5], [.75, 0, 1, .5], [0, .5, 1, 1]]) },
            { id: 'dp-grid-4x3', name: 'Grade 4×3', desc: 'Doze painéis iguais (seis por página).', build: rectsBuilder(gridRects(4, 3)) },
            { id: 'dp-hero-left', name: 'Herói à esquerda', desc: 'Painel grande cruza a lombada; dois painéis empilhados à direita.', build: rectsBuilder([[0, 0, .62, 1], [.62, 0, 1, .5], [.62, .5, 1, 1]]) },
            { id: 'dp-hero-right', name: 'Herói à direita', desc: 'Dois painéis empilhados à esquerda; painel grande cruza a lombada.', build: rectsBuilder([[0, 0, .38, .5], [0, .5, .38, 1], [.38, 0, 1, 1]]) },
            { id: 'dp-staggered', name: 'Escalonado', desc: 'Faixas deslocadas que cruzam a lombada em alturas diferentes.', build: rectsBuilder([[0, 0, .6, .4], [.6, 0, 1, .4], [0, .4, .4, .7], [.4, .4, 1, .7], [0, .7, 1, 1]]) },
            { id: 'dp-six-wide', name: 'Seis painéis horizontais', desc: 'Três faixas por página, em duas colunas.', build: rectsBuilder(gridRects(2, 3)) },
            { id: 'dp-diagonal', name: 'Corte diagonal', desc: 'Uma diagonal atravessa as duas páginas e separa dois painéis.',
                build: (W, H) => {
                    const m = Math.min(W / 2, H) * 0.04, g = Math.min(W / 2, H) * 0.022;
                    const top = .56 * W, bottom = .44 * W;
                    return [
                        [[m, m], [round3(top - g / 2), m], [round3(bottom - g / 2), round3(H - m)], [m, round3(H - m)]],
                        [[round3(top + g / 2), m], [round3(W - m), m], [round3(W - m), round3(H - m)], [round3(bottom + g / 2), round3(H - m)]]
                    ];
                } }
        ];
        const doubleTemplates = () => DOUBLE_DEFS.map(d => ({ id: d.id, name: d.name, desc: d.desc, panels: d.build(2, 1).length }));
        /* ------------------------------------------------------------------
         * Estado do board
         * ------------------------------------------------------------------ */
        function currentBoard() {
            const board = S.boards.find(b => b.id === S.currentBoardId);
            if (!board)
                throw Error('No active board');
            return board;
        }
        function spreadsOf(board) {
            if (!Array.isArray(board.vp1Spreads))
                board.vp1Spreads = [];
            return board.vp1Spreads;
        }
        function spreadById(spreadId) {
            const sp = spreadsOf(currentBoard()).find(s => s.id === spreadId);
            if (!sp)
                throw Error('Spread not found on the current board: ' + spreadId);
            return sp;
        }
        const rectOf = (sp) => ({ x: sp.slots.left.x, y: sp.slots.left.y,
            width: round3(sp.slots.left.width + sp.gutter + sp.slots.right.width), height: sp.slots.left.height });
        function layoutSlots(sp, x, y) {
            const pw = round3(sp.paper.widthMm * sp.pxPerMm), ph = round3(sp.paper.heightMm * sp.pxPerMm);
            sp.slots.left.x = round3(x);
            sp.slots.left.y = round3(y);
            sp.slots.left.width = pw;
            sp.slots.left.height = ph;
            sp.slots.right.x = round3(x + pw + sp.gutter);
            sp.slots.right.y = round3(y);
            sp.slots.right.width = pw;
            sp.slots.right.height = ph;
        }
        function notify(spreadId, pageIds = []) {
            pageIds.forEach(id => kernel.emit('manga-page:changed', { instanceId: id }));
            kernel.emit('spread:changed', spreadId ? { spreadId } : {});
            kernel.emit('instances:changed');
            kernel.emit('selection:changed');
            kernel.emit('state:changed');
        }
        function pageOf(id) {
            if (!id)
                return null;
            const p = currentBoard().instances.find(i => i.id === id);
            return p && p.type === 'manga-page' ? p : null;
        }
        const clone = (v) => JSON.parse(JSON.stringify(v));
        const extrasOf = (page) => (page.vp1Balloons || []).length + (page.vp1HorizontalTexts || []).length + (page.vp1MangaEffects || []).length + (page.overlays || []).length;
        const fingerprintOf = (pages) => JSON.stringify(pages.map(page => page ? [
            page.panelSetId, page.x, page.y, page.width, page.height,
            (page.panels || []).map(p => p.layers.map(l => [l.assetId, l.x, l.y, l.width, l.height, l.rotation || 0, l.vp1Crop || null, l.vp1ViewLimits || null])),
            (page.overlays || []).length
        ] : null));
        function describe(sp) {
            const left = pageOf(sp.slots.left.pageId), right = pageOf(sp.slots.right.pageId);
            const comp = sp.composition;
            const edited = !!comp && comp.fingerprint !== fingerprintOf([left, right]);
            const extras = (left ? extrasOf(left) : 0) + (right ? extrasOf(right) : 0);
            return { ...clone(sp), rect: rectOf(sp), contents: contentsOf(sp), applied: !!comp, edited, extras };
        }
        /* ------------------------------------------------------------------
         * Conteúdo dos encaixes
         * ------------------------------------------------------------------ */
        const overlap = (a, b) => {
            const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
            const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
            return w > 0 && h > 0 ? w * h : 0;
        };
        function looseImages(sp) {
            const rect = rectOf(sp);
            return currentBoard().instances.filter((i) => i.type === 'image' && overlap(i, rect) > 0);
        }
        function contentsOf(sp) {
            const out = { left: [], right: [], straddling: [], docked: { left: sp.slots.left.pageId, right: sp.slots.right.pageId } };
            for (const img of looseImages(sp)) {
                const a = overlap(img, sp.slots.left), b = overlap(img, sp.slots.right);
                if (a > 0 && b > 0)
                    out.straddling.push(img.id);
                else if (a > 0)
                    out.left.push(img.id);
                else
                    out.right.push(img.id);
            }
            return out;
        }
        /* ------------------------------------------------------------------
         * Escala proporcional
         * ------------------------------------------------------------------ */
        function scaleInstance(inst, f, px, py) {
            inst.x = round3(px + (inst.x - px) * f);
            inst.y = round3(py + (inst.y - py) * f);
            inst.width = round3(inst.width * f);
            inst.height = round3(inst.height * f);
        }
        function checkFactor(f) {
            if (!Number.isFinite(f) || f < 0.05 || f > 20)
                throw Error('Scale factor must be between 0.05 and 20');
            return f;
        }
        function scalable(ids) {
            const board = currentBoard();
            const wanted = new Set(ids);
            const found = board.instances.filter((i) => (i.type === 'image' || i.type === 'manga-page') && wanted.has(i.id));
            if (found.length !== wanted.size)
                throw Error('Some objects were not found or cannot be scaled (only images and manga pages)');
            if (!found.length)
                throw Error('Nothing to scale');
            return found;
        }
        function applyScale(items, f, pivot) {
            for (const it of items) {
                if (it.locked)
                    throw Error('Locked objects cannot be scaled: ' + it.id);
                if (it.width * f < 8 || it.height * f < 8 || it.width * f > 40000 || it.height * f > 40000)
                    throw Error('The scaled size of ' + it.id + ' is out of range');
            }
            for (const it of items)
                scaleInstance(it, f, pivot.x, pivot.y);
        }
        const boxCenter = (items) => ({
            x: round3((Math.min(...items.map(i => i.x)) + Math.max(...items.map(i => i.x + i.width))) / 2),
            y: round3((Math.min(...items.map(i => i.y)) + Math.max(...items.map(i => i.y + i.height))) / 2)
        });
        async function scaleObjects(objectIds, factor, pivot) {
            checkFactor(factor);
            const items = scalable(objectIds);
            if (items.some(i => i.type === 'manga-page' && i.vp1SpreadSlot))
                throw Error('A page docked in a spread is scaled with its spread: use spread.scale');
            const p = pivot ?? boxCenter(items);
            await history.transaction('scale.objects', async () => {
                applyScale(items, factor, p);
                notify(undefined, items.filter(i => i.type === 'manga-page').map(i => i.id));
            });
            return { scaled: items.map(i => i.id), factor, pivot: p };
        }
        /** Ajusta uma página ao tamanho real de um papel (contido no papel, proporção preservada) e escala junto as imagens indicadas. */
        async function fitPageToPaper(pageId, paperInput, pxPerMm = 2, alsoScaleIds = []) {
            const page = pageOf(pageId);
            if (!page)
                throw Error('Manga page not found on the current board: ' + pageId);
            if (page.vp1SpreadSlot)
                throw Error('This page is docked in a spread; change the spread paper with spread.set_paper');
            const paper = resolvePaper(paperInput);
            const ppm = checkPxPerMm(pxPerMm);
            const targetW = paper.widthMm * ppm, targetH = paper.heightMm * ppm;
            const factor = Math.min(targetW / page.width, targetH / page.height);
            const ids = Array.from(new Set([pageId, ...alsoScaleIds]));
            const result = await scaleObjects(ids, factor, boxCenter([page]));
            const warnings = [];
            const pageAspect = page.width / page.height, paperAspect = paper.widthMm / paper.heightMm;
            if (Math.abs(pageAspect / paperAspect - 1) > 0.015)
                warnings.push('The page layout proportion differs from the paper; it was fitted inside the paper without distortion.');
            return { ...result, widthMm: round3(page.width / ppm), heightMm: round3(page.height / ppm), paper, warnings };
        }
        /* ------------------------------------------------------------------
         * Página dupla: criar, listar, mover, escalar, papel
         * ------------------------------------------------------------------ */
        async function create(opts = {}) {
            const board = currentBoard();
            const list = spreadsOf(board);
            if (list.length >= 24)
                throw Error('Limit of 24 spreads per board');
            const custom = {};
            if (opts.widthMm !== undefined)
                custom.widthMm = opts.widthMm;
            if (opts.heightMm !== undefined)
                custom.heightMm = opts.heightMm;
            const paper = resolvePaper(opts.paper ?? (Object.keys(custom).length ? custom : opts.paperId));
            const pxPerMm = checkPxPerMm(opts.pxPerMm ?? 2);
            const gutter = Math.max(0, Math.min(200, Number(opts.gutter ?? 0)));
            const direction = opts.direction === 'ltr' ? 'ltr' : 'rtl';
            const pw = paper.widthMm * pxPerMm, ph = paper.heightMm * pxPerMm;
            let x = opts.x, y = opts.y;
            if (x === undefined || y === undefined) {
                const center = cam.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
                x = round3(center.x - (2 * pw + gutter) / 2);
                y = round3(center.y - ph / 2);
            }
            const sp = {
                id: utils.uid('spread'), name: opts.name?.trim() || 'Página dupla ' + (list.length + 1), paper, pxPerMm, direction, gutter,
                slots: { left: { id: 'left', x: 0, y: 0, width: 0, height: 0, pageId: null }, right: { id: 'right', x: 0, y: 0, width: 0, height: 0, pageId: null } },
                composition: null
            };
            layoutSlots(sp, x, y);
            await history.transaction('spread.create', async () => { list.push(sp); notify(sp.id); });
            return describe(sp);
        }
        const list = () => spreadsOf(currentBoard()).map(describe);
        const get = (spreadId) => describe(spreadById(spreadId));
        /** Itens que se movem/escalam junto com a página dupla: páginas encaixadas + imagens cujo centro está dentro. */
        function membersOf(sp) {
            const rect = rectOf(sp);
            const out = [];
            for (const slot of [sp.slots.left, sp.slots.right]) {
                const p = pageOf(slot.pageId);
                if (p)
                    out.push(p);
            }
            for (const img of looseImages(sp)) {
                const cx = img.x + img.width / 2, cy = img.y + img.height / 2;
                if (cx >= rect.x && cx <= rect.x + rect.width && cy >= rect.y && cy <= rect.y + rect.height)
                    out.push(img);
            }
            return out;
        }
        async function move(spreadId, dx, dy, withContent = true) {
            if (!Number.isFinite(dx) || !Number.isFinite(dy) || Math.abs(dx) > 1e6 || Math.abs(dy) > 1e6)
                throw Error('Invalid offset');
            const sp = spreadById(spreadId);
            const members = withContent ? membersOf(sp) : [];
            if (members.some(m => m.locked))
                throw Error('Locked objects inside the spread prevent moving it together');
            await history.transaction('spread.move', async () => {
                for (const slot of [sp.slots.left, sp.slots.right]) {
                    slot.x = round3(slot.x + dx);
                    slot.y = round3(slot.y + dy);
                }
                for (const m of members) {
                    m.x = round3(m.x + dx);
                    m.y = round3(m.y + dy);
                }
                notify(sp.id, members.filter(m => m.type === 'manga-page').map(m => m.id));
            });
            return describe(sp);
        }
        /** Escala a página dupla, as páginas encaixadas e as imagens dentro dela pelo mesmo fator (px/mm acompanha). */
        async function scale(spreadId, factor) {
            checkFactor(factor);
            const sp = spreadById(spreadId);
            const rect = rectOf(sp);
            const members = membersOf(sp);
            const nextPpm = checkPxPerMm(sp.pxPerMm * factor);
            await history.transaction('spread.scale', async () => {
                applyScale(members, factor, { x: rect.x, y: rect.y });
                sp.pxPerMm = nextPpm;
                sp.gutter = round3(sp.gutter * factor);
                layoutSlots(sp, rect.x, rect.y);
                notify(sp.id, members.filter(m => m.type === 'manga-page').map(m => m.id));
            });
            return describe(sp);
        }
        function redock(sp) {
            for (const slot of [sp.slots.left, sp.slots.right]) {
                const page = pageOf(slot.pageId);
                if (page)
                    fitPageIntoSlot(page, slot);
            }
        }
        function fitPageIntoSlot(page, slot) {
            const f = Math.min(slot.width / page.width, slot.height / page.height);
            page.width = round3(page.width * f);
            page.height = round3(page.height * f);
            page.x = round3(slot.x + (slot.width - page.width) / 2);
            page.y = round3(slot.y + (slot.height - page.height) / 2);
        }
        /** Muda o papel (mm) e/ou px/mm. Com `withContent`, imagens e páginas escalam proporcionalmente à largura. */
        async function setPaper(spreadId, paperInput, pxPerMm, withContent = true) {
            const sp = spreadById(spreadId);
            if (sp.composition)
                throw Error('The spread has a layout applied; go back to raw (spread.clear) before changing the paper');
            const paper = paperInput === undefined ? sp.paper : resolvePaper(paperInput);
            const ppm = pxPerMm === undefined ? sp.pxPerMm : checkPxPerMm(pxPerMm);
            const rect = rectOf(sp);
            const factor = (paper.widthMm * ppm) / (sp.paper.widthMm * sp.pxPerMm);
            const members = withContent ? membersOf(sp) : [];
            await history.transaction('spread.set_paper', async () => {
                if (withContent && Math.abs(factor - 1) > 1e-9)
                    applyScale(members, checkFactor(factor), { x: rect.x, y: rect.y });
                sp.paper = paper;
                sp.pxPerMm = ppm;
                sp.gutter = round3(sp.gutter * (withContent ? factor : 1));
                layoutSlots(sp, rect.x, rect.y);
                redock(sp);
                notify(sp.id, members.filter(m => m.type === 'manga-page').map(m => m.id));
            });
            return describe(sp);
        }
        async function rename(spreadId, name) {
            const sp = spreadById(spreadId);
            const clean = String(name ?? '').trim();
            if (!clean || clean.length > 80)
                throw Error('The name must have 1 to 80 characters');
            await history.transaction('spread.rename', async () => { sp.name = clean; notify(sp.id); });
            return describe(sp);
        }
        async function remove(spreadId) {
            const sp = spreadById(spreadId);
            const released = [sp.slots.left.pageId, sp.slots.right.pageId].filter((x) => !!x);
            await history.transaction('spread.remove', async () => {
                for (const id of released) {
                    const p = pageOf(id);
                    if (p)
                        delete p.vp1SpreadSlot;
                }
                const board = currentBoard();
                board.vp1Spreads = spreadsOf(board).filter(s => s.id !== spreadId);
                notify(spreadId, released);
            });
            return { removed: spreadId, releasedPages: released };
        }
        /* ------------------------------------------------------------------
         * Encaixar páginas existentes
         * ------------------------------------------------------------------ */
        async function dock(spreadId, slotId, pageId) {
            const sp = spreadById(spreadId);
            if (slotId !== 'left' && slotId !== 'right')
                throw Error('slot must be left or right');
            const slot = sp.slots[slotId];
            if (sp.composition)
                throw Error('The spread has a layout applied; go back to raw (spread.clear) before docking pages');
            if (slot.pageId)
                throw Error('The ' + slotId + ' slot already has a page; undock it first');
            const page = pageOf(pageId);
            if (!page)
                throw Error('Manga page not found on the current board: ' + pageId);
            if (page.locked)
                throw Error('Locked page cannot be docked');
            if (page.vp1SpreadSlot)
                throw Error('This page is already docked in a spread');
            await history.transaction('spread.dock', async () => {
                fitPageIntoSlot(page, slot);
                slot.pageId = page.id;
                page.vp1SpreadSlot = { spreadId: sp.id, slot: slotId };
                notify(sp.id, [page.id]);
            });
            return describe(sp);
        }
        async function undock(spreadId, slotId) {
            const sp = spreadById(spreadId);
            if (slotId !== 'left' && slotId !== 'right')
                throw Error('slot must be left or right');
            if (sp.composition)
                throw Error('The pages belong to the applied layout; use spread.clear to go back to raw');
            const slot = sp.slots[slotId];
            if (!slot.pageId)
                throw Error('The ' + slotId + ' slot is empty');
            await history.transaction('spread.undock', async () => {
                const page = pageOf(slot.pageId);
                if (page)
                    delete page.vp1SpreadSlot;
                const id = slot.pageId;
                slot.pageId = null;
                notify(sp.id, [id]);
            });
            return describe(sp);
        }
        function templateById(id) {
            const tpl = PT.list().find(t => t.id === id);
            if (!tpl)
                throw Error('Layout template not found: ' + id);
            return tpl;
        }
        function buildLayout(sp, layout) {
            const rect = rectOf(sp);
            const pw = sp.slots.left.width, ph = sp.slots.left.height;
            const off = { left: round3(sp.slots.left.x - rect.x), right: round3(sp.slots.right.x - rect.x) };
            const pieces = [];
            let panels = [];
            let name = '';
            if (layout.doubleTemplateId) {
                const def = DOUBLE_DEFS.find(d => d.id === layout.doubleTemplateId);
                if (!def)
                    throw Error('Double-page template not found: ' + layout.doubleTemplateId + ' (use spread.list_templates)');
                panels = def.build(rect.width, rect.height);
                name = def.name;
                for (const poly of panels) {
                    const row = [];
                    for (const side of ['left', 'right']) {
                        const clipped = clipX(poly, off[side], off[side] + pw);
                        if (clipped.length >= 3 && polyArea(clipped) > 1e-4 * pw * ph)
                            row.push({ slot: side, poly: clipped.map(p => [round3(p[0] - off[side]), p[1]]) });
                    }
                    pieces.push(row);
                }
            }
            else {
                const l = layout.leftTemplateId ?? layout.templateId, r = layout.rightTemplateId ?? layout.templateId;
                if (!l || !r)
                    throw Error('Provide doubleTemplateId, or templateId, or both leftTemplateId and rightTemplateId');
                const lt = stretchTemplate(templateById(l), pw, ph), rt = stretchTemplate(templateById(r), pw, ph);
                name = lt.name === rt.name ? lt.name + ' ×2' : lt.name + ' + ' + rt.name;
                for (const [tpl, side] of [[lt, 'left'], [rt, 'right']]) {
                    for (const poly of tpl.panels) {
                        panels.push(poly.map(p => [round3(p[0] + off[side]), p[1]]));
                        pieces.push([{ slot: side, poly: poly.map(p => [p[0], p[1]]) }]);
                    }
                }
            }
            if (!panels.length)
                throw Error('The layout has no panels');
            for (const side of ['left', 'right'])
                if (!pieces.some(row => row.some(p => p.slot === side)))
                    throw Error('The layout leaves the ' + side + ' page without panels');
            return { tpl: { id: 'spread:' + sp.id, name, desc: '', panels, width: rect.width, height: rect.height }, pieces, name };
        }
        const toRaw = (images) => images.map(i => ({ id: i.id, assetId: i.assetId, x: i.x, y: i.y, width: i.width, height: i.height, rotation: i.rotation || 0, z: i.zIndex || 0 }));
        function computePlan(sp, layout, raw, options) {
            if (!raw.length)
                throw Error('There are no images inside this spread. Place images over the left or right slot first');
            if (raw.length > MAX_IMAGES)
                throw Error('Too many images: the limit is ' + MAX_IMAGES + ' per spread');
            const rect = rectOf(sp);
            const built = buildLayout(sp, layout);
            const base = COMP.planFrame(raw, built.tpl, options, rect);
            const pages = { left: { panels: [] }, right: { panels: [] } };
            const counters = { left: 0, right: 0 };
            const firstPiece = new Map();
            const off = { left: round3(sp.slots.left.x - rect.x), right: round3(sp.slots.right.x - rect.x) };
            built.pieces.forEach((row, vi) => {
                for (const piece of row) {
                    const k = ++counters[piece.slot];
                    const xs = piece.poly.map(p => p[0]), ys = piece.poly.map(p => p[1]);
                    const bb = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
                    const layers = base.panels[vi].layers.map(l => ({ ...l, x: round3(l.x - off[piece.slot]) })).filter(l => overlap(l, bb) > 0);
                    pages[piece.slot].panels.push({ panelId: 'p' + k, polygon: piece.poly, layers });
                    if (!firstPiece.has(vi))
                        firstPiece.set(vi, piece.slot + ':p' + k);
                }
            });
            const assignments = base.assignments.map(a => {
                const vi = Number(a.panelId.slice(1)) - 1;
                const refs = (a.panels.map(id => firstPiece.get(Number(id.slice(1)) - 1)).filter((x) => !!x));
                return { ...a, panelId: firstPiece.get(vi) ?? a.panelId, panels: refs };
            });
            const plan = { spreadId: sp.id, layout: clone(layout), options: base.options, rect, pages, assignments, warnings: base.warnings.slice() };
            const outside = raw.filter(r => overlap({ x: r.x, y: r.y, width: r.width, height: r.height }, rect) <= 0);
            if (outside.length)
                plan.warnings.push(outside.length + ' image(s) are outside the spread.');
            return { plan, built };
        }
        function readImages(sp, objectIds) {
            const board = currentBoard();
            let images;
            if (objectIds && objectIds.length) {
                const wanted = new Set(objectIds);
                images = board.instances.filter((i) => i.type === 'image' && wanted.has(i.id));
                if (images.length !== wanted.size)
                    throw Error('Some image objects were not found on the current board');
            }
            else
                images = looseImages(sp);
            if (!images.length)
                throw Error('There are no images inside this spread. Place images over the left or right slot first');
            if (images.length > MAX_IMAGES)
                throw Error('Too many images: the limit is ' + MAX_IMAGES + ' per spread');
            return images;
        }
        function dropOwnedSet(setId, exceptPageId) {
            if (!setId)
                return;
            const set = PS.get(setId);
            if (!set || !set['vp1CompositionOwned'])
                return;
            const used = S.boards.some(b => b.instances.some(i => i.type === 'manga-page' && i.panelSetId === setId && i.id !== exceptPageId));
            if (!used)
                PS.remove(setId);
        }
        function parsedFor(sp, pagePlan) {
            const width = sp.slots.left.width, height = sp.slots.left.height;
            const panels = pagePlan.panels.map(p => ({ id: p.panelId, points: p.polygon.map(q => ({ x: round3(q[0]), y: round3(q[1]) })) }));
            return { width, height, panels, viewBox: { minX: 0, minY: 0, width, height },
                svgSource: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '">' +
                    panels.map(p => '<path d="M' + p.points.map(q => q.x + ',' + q.y).join(' L') + ' Z"/>').join('') + '</svg>' };
        }
        function fillSlotPage(page, slot, pagePlan) {
            page.x = slot.x;
            page.y = slot.y;
            page.width = slot.width;
            page.height = slot.height;
            page.panels = pagePlan.panels.map(p => ({ id: p.panelId,
                layers: p.layers.map((l, index) => ({ id: utils.uid('layer'), assetId: l.assetId, x: l.x, y: l.y, width: l.width, height: l.height,
                    rotation: l.rotation, opacity: 1, zIndex: index + 1 })) }));
            page.overlays = [];
            page.unassignedPanels = [];
            page.vp1Balloons = [];
            page.vp1HorizontalTexts = [];
            page.vp1MangaEffects = [];
            page.vp1LayerTreeMeta = {};
        }
        function normalizeLayout(input) {
            const layout = input ?? {};
            if (layout.doubleTemplateId)
                return { doubleTemplateId: layout.doubleTemplateId };
            const out = {};
            if (layout.templateId) {
                out.leftTemplateId = layout.templateId;
                out.rightTemplateId = layout.templateId;
            }
            if (layout.leftTemplateId)
                out.leftTemplateId = layout.leftTemplateId;
            if (layout.rightTemplateId)
                out.rightTemplateId = layout.rightTemplateId;
            return out;
        }
        function plan(spreadId, layout, options, objectIds) {
            const sp = spreadById(spreadId);
            const raw = sp.composition && !(objectIds && objectIds.length)
                ? sp.composition.raw.map(i => toRaw([i])[0]) : toRaw(readImages(sp, objectIds));
            return computePlan(sp, normalizeLayout(layout), raw, options).plan;
        }
        async function apply(spreadId, layout, options, objectIds) {
            const sp = spreadById(spreadId);
            if (sp.composition)
                throw Error('A layout is already applied to this spread; use spread.change_layout or spread.clear');
            if (sp.slots.left.pageId || sp.slots.right.pageId)
                throw Error('A slot already has a docked page; undock it first');
            const images = readImages(sp, objectIds);
            if (images.some(i => i.locked))
                throw Error('Locked images cannot be placed in a layout: unlock them first');
            const norm = normalizeLayout(layout);
            return history.transaction('spread.apply', async () => {
                const raw = toRaw(images);
                const { plan: computed, built } = computePlan(sp, norm, raw, options);
                const pageIds = { left: '', right: '' };
                for (const side of ['left', 'right']) {
                    const slot = sp.slots[side];
                    const ps = PS.create(parsedFor(sp, computed.pages[side]), (sp.name || 'Página dupla') + ' · ' + (side === 'left' ? 'esquerda' : 'direita'));
                    ps['vp1CompositionOwned'] = true;
                    const page = await MP.addToBoard(ps.id, slot.x, slot.y);
                    if (!page)
                        throw Error('Could not create the ' + side + ' page');
                    fillSlotPage(page, slot, computed.pages[side]);
                    page.zIndex = Math.max(...images.map(i => i.zIndex || 0), page.zIndex || 0);
                    page.vp1SpreadSlot = { spreadId: sp.id, slot: side };
                    slot.pageId = page.id;
                    pageIds[side] = page.id;
                }
                const board = currentBoard();
                const gone = new Set(images.map(i => i.id));
                const records = images.map(i => clone(i));
                board.instances = board.instances.filter(i => !gone.has(i.id));
                sp.composition = { version: 1, layout: norm, options: computed.options, raw: records, pageIds, fingerprint: '' };
                sp.composition.fingerprint = fingerprintOf([pageOf(pageIds.left), pageOf(pageIds.right)]);
                S.selection.clear();
                S.selection.add(pageIds.right);
                S.selection.add(pageIds.left);
                void built;
                notify(sp.id, [pageIds.left, pageIds.right]);
                return { spreadId: sp.id, pageIds, plan: computed };
            });
        }
        function compState(sp) {
            if (!sp.composition)
                throw Error('No layout is applied to this spread');
            return sp.composition;
        }
        async function change(spreadId, layout, options, force = false) {
            const sp = spreadById(spreadId);
            const comp = compState(sp);
            const info = describe(sp);
            if ((info.edited || info.extras) && !force)
                throw Error('The pages have manual edits or extra objects (balloons, text, effects); changing the layout discards them. Repeat with force=true to confirm');
            const norm = normalizeLayout(layout);
            return history.transaction('spread.change_layout', async () => {
                const merged = { ...comp.options, ...(options || {}) };
                const raw = comp.raw.map(i => toRaw([i])[0]);
                const { plan: computed } = computePlan(sp, norm, raw, merged);
                for (const side of ['left', 'right']) {
                    const page = pageOf(comp.pageIds[side]);
                    if (!page)
                        throw Error('The ' + side + ' page of the spread no longer exists; use spread.clear');
                    const oldSet = page.panelSetId;
                    const ps = PS.create(parsedFor(sp, computed.pages[side]), (sp.name || 'Página dupla') + ' · ' + (side === 'left' ? 'esquerda' : 'direita'));
                    ps['vp1CompositionOwned'] = true;
                    page.panelSetId = ps.id;
                    fillSlotPage(page, sp.slots[side], computed.pages[side]);
                    dropOwnedSet(oldSet, page.id);
                }
                comp.layout = norm;
                comp.options = computed.options;
                comp.fingerprint = fingerprintOf([pageOf(comp.pageIds.left), pageOf(comp.pageIds.right)]);
                notify(sp.id, [comp.pageIds.left, comp.pageIds.right]);
                return { spreadId: sp.id, pageIds: { ...comp.pageIds }, plan: computed };
            });
        }
        async function clear(spreadId, force = false) {
            const sp = spreadById(spreadId);
            const comp = compState(sp);
            const info = describe(sp);
            if ((info.edited || info.extras) && !force)
                throw Error('The pages have manual edits or extra objects (balloons, text, effects) that would be lost. Repeat with force=true to confirm');
            return history.transaction('spread.clear', async () => {
                const board = currentBoard();
                const records = comp.raw.map(r => clone(r));
                const pageIds = new Set([comp.pageIds.left, comp.pageIds.right]);
                const sets = [pageOf(comp.pageIds.left)?.panelSetId, pageOf(comp.pageIds.right)?.panelSetId];
                board.instances = board.instances.filter(i => !pageIds.has(i.id)).concat(records);
                sets.forEach(id => dropOwnedSet(id));
                sp.slots.left.pageId = null;
                sp.slots.right.pageId = null;
                sp.composition = null;
                MP.clearFocus();
                S.selection.clear();
                records.forEach(r => S.selection.add(r.id));
                notify(sp.id);
                return { restored: records.map(r => r.id) };
            });
        }
        /* ------------------------------------------------------------------
         * Guias no canvas: dois encaixes por página dupla (não interferem no mouse)
         * ------------------------------------------------------------------ */
        const world = document.getElementById('world');
        let guides = null;
        function drawGuides() {
            if (!world)
                return;
            if (!guides || !guides.isConnected) {
                guides = document.createElement('div');
                guides.id = 'vb-spread-guides';
                guides.setAttribute('aria-hidden', 'true');
                world.insertBefore(guides, world.firstChild);
            }
            guides.replaceChildren();
            const board = S.boards.find(b => b.id === S.currentBoardId);
            if (!board || !Array.isArray(board.vp1Spreads))
                return;
            for (const sp of board.vp1Spreads) {
                const rect = rectOf(sp);
                const frame = document.createElement('div');
                frame.className = 'vb-spread-frame';
                frame.dataset.spreadId = sp.id;
                frame.style.left = rect.x + 'px';
                frame.style.top = rect.y + 'px';
                frame.style.width = rect.width + 'px';
                frame.style.height = rect.height + 'px';
                const label = document.createElement('div');
                label.className = 'vb-spread-label';
                label.textContent = sp.name + ' · ' + sp.paper.widthMm + '×' + sp.paper.heightMm + ' mm · ' + (sp.direction === 'rtl' ? 'leitura ←' : 'leitura →');
                frame.appendChild(label);
                for (const side of ['left', 'right']) {
                    const slot = sp.slots[side];
                    const el = document.createElement('div');
                    el.className = 'vb-spread-slot' + (slot.pageId ? ' filled' : '');
                    el.dataset.slot = side;
                    el.style.left = (slot.x - rect.x) + 'px';
                    el.style.top = '0px';
                    el.style.width = slot.width + 'px';
                    el.style.height = slot.height + 'px';
                    const tag = document.createElement('span');
                    tag.className = 'vb-spread-tag';
                    const first = (sp.direction === 'rtl') === (side === 'right');
                    tag.textContent = (side === 'left' ? 'Encaixe esquerdo' : 'Encaixe direito') + (first ? ' · 1ª página' : ' · 2ª página');
                    el.appendChild(tag);
                    frame.appendChild(el);
                }
                guides.appendChild(frame);
            }
        }
        for (const evt of ['state:changed', 'board:navigated', 'boards:changed', 'spread:changed'])
            kernel.on(evt, drawGuides);
        drawGuides();
        /* ------------------------------------------------------------------
         * Popup: criar/gerenciar páginas duplas, escala e modelos
         * ------------------------------------------------------------------ */
        const PALETTE = ['#e07a5f', '#3d9970', '#4da3ff', '#f2c14e', '#b07cc6', '#5ec4b6', '#e58ab5', '#9aa5b1'];
        const prefs = { manage: false, mode: 'double', fit: 'auto', spread: true, query: '', leftTpl: '', rightTpl: '', factor: 110 };
        let popup = null;
        let popupSpread = null;
        let popupSeq = 0;
        const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
        const svgElement = (markup) => document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true);
        const toast = (message, kind = 'error') => { kernel.emit('toast', { message, kind }); };
        const currentLayout = () => {
            const sp = popupSpread ? spreadsOf(currentBoard()).find(s => s.id === popupSpread) : null;
            return sp?.composition ? sp.composition.layout : null;
        };
        function thumbSvg(sp, layout) {
            const rect = rectOf(sp);
            const W = rect.width, H = rect.height, pad = Math.max(W, H) * 0.03;
            let raw;
            try {
                raw = sp.composition ? sp.composition.raw.map(i => toRaw([i])[0]) : toRaw(readImages(sp));
            }
            catch {
                raw = [];
            }
            const view = round3(-pad) + ' ' + round3(-pad) + ' ' + round3(W + 2 * pad) + ' ' + round3(H + 2 * pad);
            const bg = '<rect x="' + round3(-pad) + '" y="' + round3(-pad) + '" width="' + round3(W + 2 * pad) + '" height="' + round3(H + 2 * pad) + '" fill="#1a1d24"/>' +
                '<rect width="' + sp.slots.left.width + '" height="' + H + '" fill="#f4efe3"/><rect x="' + round3(sp.slots.right.x - rect.x) + '" width="' + sp.slots.right.width + '" height="' + H + '" fill="#f4efe3"/>';
            const order = new Map(raw.map((r, i) => [r.id, i]));
            if (!layout || !raw.length) {
                const boxes = raw.map((r, i) => '<rect x="' + round3(r.x - rect.x) + '" y="' + round3(r.y - rect.y) + '" width="' + round3(r.width) + '" height="' + round3(r.height) +
                    '" fill="' + PALETTE[i % PALETTE.length] + '" fill-opacity=".6" stroke="#14171d" stroke-width="' + round3(Math.max(W, H) * 0.004) + '"/>').join('');
                return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + view + '" preserveAspectRatio="xMidYMid meet">' + bg + boxes + '</svg>';
            }
            let body = '';
            try {
                const { plan: computed } = computePlan(sp, layout, raw, { fit: prefs.fit, spread: prefs.spread });
                const uid = 's' + (popupSeq++);
                let defs = '';
                for (const side of ['left', 'right']) {
                    const ox = round3(sp.slots[side].x - rect.x);
                    computed.pages[side].panels.forEach((p, k) => {
                        const path = 'M' + p.polygon.map(q => round3(q[0] + ox) + ',' + q[1]).join(' L') + ' Z';
                        defs += '<clipPath id="' + uid + side[0] + k + '"><path d="' + esc(path) + '"/></clipPath>';
                        const layers = p.layers.map(l => '<rect x="' + round3(l.x + ox) + '" y="' + l.y + '" width="' + l.width + '" height="' + l.height +
                            '" fill="' + PALETTE[(order.get(l.objectId) ?? 0) % PALETTE.length] + '" fill-opacity=".8" stroke="#14171d" stroke-opacity=".5" stroke-width="' + round3(Math.max(W, H) * 0.003) + '"/>').join('');
                        body += '<path d="' + esc(path) + '" fill="#dfe5f2"/><g clip-path="url(#' + uid + side[0] + k + ')">' + layers + '</g>' +
                            '<path d="' + esc(path) + '" fill="none" stroke="#14171d" stroke-width="' + round3(Math.max(W, H) * 0.004) + '"/>';
                    });
                }
                body = '<defs>' + defs + '</defs>' + body;
            }
            catch { /* sem pré-visualização para este modelo */ }
            const spine = '<line x1="' + round3(sp.slots.left.width + sp.gutter / 2) + '" x2="' + round3(sp.slots.left.width + sp.gutter / 2) + '" y1="0" y2="' + H + '" stroke="#e07a5f" stroke-dasharray="' + round3(H * 0.02) + ' ' + round3(H * 0.015) + '" stroke-width="' + round3(H * 0.004) + '" opacity=".7"/>';
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + view + '" preserveAspectRatio="xMidYMid meet">' + bg + body + spine + '</svg>';
        }
        function el(tag, cls, text) {
            const e = document.createElement(tag);
            if (cls)
                e.className = cls;
            if (text !== undefined)
                e.textContent = text;
            return e;
        }
        function button(text, onClick, cls = 'btn') {
            const b = el('button', cls, text);
            b.type = 'button';
            b.addEventListener('click', onClick);
            return b;
        }
        async function guarded(fn) {
            try {
                await fn();
            }
            catch (error) {
                toast(error.message);
            }
            render();
        }
        async function confirmDiscard() {
            const sp = popupSpread ? spreadsOf(currentBoard()).find(s => s.id === popupSpread) : null;
            if (!sp || !sp.composition)
                return true;
            const info = describe(sp);
            if (!info.edited && !info.extras)
                return true;
            if (!kernel.has('ui.dialogs'))
                return true;
            const D = await kernel.require('ui.dialogs');
            return !!(await D.confirm({ title: 'Descartar ajustes das páginas?',
                message: 'As páginas têm ajustes manuais ou objetos extras (balões, textos, efeitos). Trocar o modelo refaz tudo a partir da disposição crua e descarta esses ajustes. Você pode desfazer com Ctrl+Z.',
                confirmText: 'Trocar modelo', danger: true }));
        }
        async function choose(layout) {
            if (!popupSpread)
                return;
            const id = popupSpread;
            await guarded(async () => {
                const sp = spreadById(id);
                const opts = { fit: prefs.fit, spread: prefs.spread };
                if (layout === null) {
                    if (!sp.composition)
                        return;
                    if (!(await confirmDiscard()))
                        return;
                    await clear(id, true);
                }
                else if (sp.composition) {
                    if (!(await confirmDiscard()))
                        return;
                    await change(id, layout, opts, true);
                }
                else
                    await apply(id, layout, opts);
            });
        }
        function paperSelect(value) {
            const sel = el('select');
            sel.setAttribute('aria-label', 'Papel');
            for (const p of PAPERS) {
                const o = el('option', undefined, p.name);
                o.value = p.id;
                sel.appendChild(o);
            }
            sel.value = PAPERS.some(p => p.id === value) ? value : 'b4-frame';
            return sel;
        }
        function numberInput(label, value, min, max, step) {
            const wrap = el('label', 'vb-composer-check');
            wrap.appendChild(document.createTextNode(label + ' '));
            const input = el('input');
            input.type = 'number';
            input.min = String(min);
            input.max = String(max);
            input.step = String(step);
            input.value = String(value);
            input.setAttribute('aria-label', label);
            wrap.appendChild(input);
            return { wrap, input };
        }
        function selectedIds() {
            const board = currentBoard();
            return board.instances.filter(i => (i.type === 'image' || i.type === 'manga-page') && S.selection.has(i.id)).map(i => i.id);
        }
        function render() {
            if (!popup)
                return;
            popup.replaceChildren();
            const board = currentBoard();
            const spreads = spreadsOf(board);
            if (popupSpread && !spreads.some(s => s.id === popupSpread))
                popupSpread = null;
            if (!popupSpread && spreads.length)
                popupSpread = spreads[0].id;
            const sp = popupSpread ? spreads.find(s => s.id === popupSpread) ?? null : null;
            const head = el('div', 'vb-composer-head');
            head.appendChild(el('h2', undefined, 'Página dupla e escala real'));
            const x = button('×', close, 'btn ghost');
            x.setAttribute('aria-label', 'Fechar');
            x.title = 'Fechar (Esc)';
            head.appendChild(x);
            popup.appendChild(head);
            head.style.cursor = 'move';
            head.title = 'Arraste para mover o painel';
            head.addEventListener('pointerdown', (ev) => {
                if (ev.target.closest('button') || !popup)
                    return;
                const box = popup.getBoundingClientRect(), dx = ev.clientX - box.left, dy = ev.clientY - box.top;
                const move = (e) => {
                    if (!popup)
                        return;
                    popup.style.left = Math.max(0, Math.min(window.innerWidth - 80, e.clientX - dx)) + 'px';
                    popup.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - dy)) + 'px';
                    popup.style.right = 'auto';
                };
                const up = () => window.removeEventListener('pointermove', move);
                window.addEventListener('pointermove', move);
                window.addEventListener('pointerup', up, { once: true });
            });
            /* --- escolher/criar página dupla (recolhível) --- */
            const manage = el('details', 'vb-spread-manage');
            manage.open = prefs.manage || !sp;
            const manageTitle = el('summary', undefined, sp ? 'Papel, escala e encaixes' : 'Nova página dupla');
            manage.appendChild(manageTitle);
            manage.addEventListener('toggle', () => { if (sp)
                prefs.manage = manage.open; });
            popup.appendChild(manage);
            const bar = el('div', 'vb-composer-tools');
            const pick = el('select');
            pick.setAttribute('aria-label', 'Página dupla');
            for (const s of spreads) {
                const o = el('option', undefined, s.name);
                o.value = s.id;
                pick.appendChild(o);
            }
            if (!spreads.length) {
                const o = el('option', undefined, '(nenhuma página dupla)');
                o.value = '';
                pick.appendChild(o);
            }
            pick.value = popupSpread ?? '';
            pick.addEventListener('change', () => { popupSpread = pick.value || null; render(); });
            bar.appendChild(pick);
            const paper = paperSelect(sp?.paper.presetId ?? 'b4-frame');
            bar.appendChild(paper);
            const ppm = numberInput('px/mm', sp?.pxPerMm ?? 2, MIN_PX_PER_MM, MAX_PX_PER_MM, 0.25);
            bar.appendChild(ppm.wrap);
            const dir = el('select');
            dir.setAttribute('aria-label', 'Direção de leitura');
            for (const [v, t] of [['rtl', 'Leitura ← (mangá)'], ['ltr', 'Leitura → (ocidental)']]) {
                const o = el('option', undefined, t);
                o.value = v;
                dir.appendChild(o);
            }
            dir.value = sp?.direction ?? 'rtl';
            bar.appendChild(dir);
            manage.appendChild(bar);
            const actions = el('div', 'vb-composer-foot');
            actions.appendChild(button('Nova página dupla', () => guarded(async () => {
                const created = await create({ paper: paper.value, pxPerMm: Number(ppm.input.value), direction: dir.value === 'ltr' ? 'ltr' : 'rtl' });
                popupSpread = created.id;
            })));
            if (sp) {
                actions.appendChild(button('Aplicar papel/px por mm', () => guarded(async () => { await setPaper(sp.id, paper.value, Number(ppm.input.value), true); })));
                actions.appendChild(button('Remover guia', () => guarded(async () => { await remove(sp.id); popupSpread = null; })));
            }
            manage.appendChild(actions);
            if (!sp) {
                popup.appendChild(el('p', 'vb-composer-note', 'Crie uma página dupla: dois encaixes lado a lado em tamanho real de papel de mangá. Depois coloque imagens dentro dos encaixes e escolha um modelo.'));
                return;
            }
            const info = describe(sp);
            const c = info.contents;
            popup.appendChild(el('p', 'vb-composer-note', sp.paper.widthMm + '×' + sp.paper.heightMm + ' mm por página · ' + sp.pxPerMm + ' px/mm · ' +
                c.left.length + ' imagem(ns) à esquerda, ' + c.right.length + ' à direita, ' + c.straddling.length + ' atravessando a lombada' +
                (info.applied ? ' · modelo aplicado' : ' · sem modelo (cru)') + (info.edited ? ' · páginas editadas' : '') + '.'));
            /* --- escala proporcional --- */
            const scaleRow = el('div', 'vb-composer-tools');
            const factor = numberInput('Escala %', prefs.factor, 5, 2000, 5);
            factor.input.addEventListener('change', () => { prefs.factor = Number(factor.input.value) || 100; });
            scaleRow.appendChild(factor.wrap);
            scaleRow.appendChild(button('Escalar página dupla e conteúdo', () => guarded(async () => { await scale(sp.id, Number(factor.input.value) / 100); })));
            scaleRow.appendChild(button('Escalar seleção junta', () => guarded(async () => {
                const ids = selectedIds();
                if (!ids.length)
                    throw Error('Selecione imagens ou páginas no canvas.');
                await scaleObjects(ids, Number(factor.input.value) / 100);
            })));
            manage.appendChild(scaleRow);
            /* --- encaixar página selecionada --- */
            if (!info.applied) {
                const dockRow = el('div', 'vb-composer-foot');
                for (const side of ['right', 'left']) {
                    const slot = sp.slots[side];
                    if (slot.pageId)
                        dockRow.appendChild(button('Soltar página ' + (side === 'left' ? 'esquerda' : 'direita'), () => guarded(async () => { await undock(sp.id, side); })));
                    else
                        dockRow.appendChild(button('Encaixar página selecionada → ' + (side === 'left' ? 'esquerda' : 'direita'), () => guarded(async () => {
                            const page = selectedIds().map(id => pageOf(id)).find((p) => !!p);
                            if (!page)
                                throw Error('Selecione uma página de mangá no canvas.');
                            await dock(sp.id, side, page.id);
                        })));
                }
                manage.appendChild(dockRow);
            }
            /* --- modelos --- */
            const modeRow = el('div', 'vb-composer-tools');
            for (const [m, t] of [['double', 'Modelos de página dupla'], ['pair', 'Par de modelos simples']]) {
                const b = button(t, () => { prefs.mode = m; render(); }, 'btn' + (prefs.mode === m ? ' primary' : ''));
                b.setAttribute('aria-pressed', String(prefs.mode === m));
                modeRow.appendChild(b);
            }
            popup.appendChild(modeRow);
            const tools = el('div', 'vb-composer-tools');
            const search = el('input');
            search.type = 'search';
            search.placeholder = 'Buscar modelo';
            search.value = prefs.query;
            search.setAttribute('aria-label', 'Buscar modelo');
            const fit = el('select');
            fit.setAttribute('aria-label', 'Ajuste da imagem no painel');
            for (const [v, t] of [['auto', 'Ajuste: automático'], ['cover', 'Ajuste: preencher painel'], ['contain', 'Ajuste: caber no painel'], ['keep', 'Ajuste: manter posição']]) {
                const o = el('option', undefined, t);
                o.value = v;
                fit.appendChild(o);
            }
            fit.value = prefs.fit;
            const sLabel = el('label', 'vb-composer-check');
            const sBox = el('input');
            sBox.type = 'checkbox';
            sBox.checked = prefs.spread;
            sLabel.appendChild(sBox);
            sLabel.appendChild(document.createTextNode(' Fundos grandes atravessam os painéis'));
            tools.appendChild(search);
            tools.appendChild(fit);
            tools.appendChild(sLabel);
            popup.appendChild(tools);
            const grid = el('div', 'vb-composer-grid');
            const layoutNow = sp.composition ? sp.composition.layout : null;
            const rawTile = el('button', 'vb-composer-tile' + (!sp.composition ? ' selected' : ''));
            rawTile.type = 'button';
            rawTile.setAttribute('aria-pressed', String(!sp.composition));
            const rt = el('div', 'vb-composer-thumb wide');
            rt.appendChild(svgElement(thumbSvg(sp, null)));
            rawTile.appendChild(rt);
            rawTile.appendChild(el('div', 'vb-composer-name', 'Sem modelo (cru)'));
            rawTile.addEventListener('click', () => { void choose(null); });
            grid.appendChild(rawTile);
            const q = prefs.query.trim().toLowerCase();
            const tile = (id, name, desc, layout, selected, count) => {
                if (q && !(name + ' ' + desc).toLowerCase().includes(q))
                    return;
                const t = el('button', 'vb-composer-tile' + (selected ? ' selected' : ''));
                t.type = 'button';
                t.setAttribute('aria-pressed', String(selected));
                t.setAttribute('aria-label', name + ', ' + count + ' painéis');
                t.dataset.templateId = id;
                t.title = desc;
                const th = el('div', 'vb-composer-thumb wide');
                th.appendChild(svgElement(thumbSvg(sp, layout)));
                t.appendChild(th);
                t.appendChild(el('div', 'vb-composer-name', name + ' · ' + count));
                t.addEventListener('click', () => { void choose(layout); });
                grid.appendChild(t);
            };
            if (prefs.mode === 'double') {
                for (const d of doubleTemplates())
                    tile(d.id, d.name, d.desc, { doubleTemplateId: d.id }, !!layoutNow && layoutNow.doubleTemplateId === d.id, d.panels);
            }
            else {
                for (const t of PT.list())
                    tile(t.id, t.name, t.desc, { templateId: t.id }, !!layoutNow && !layoutNow.doubleTemplateId && layoutNow.leftTemplateId === t.id && layoutNow.rightTemplateId === t.id, t.panels.length);
            }
            popup.appendChild(grid);
            if (prefs.mode === 'pair') {
                const pairRow = el('div', 'vb-composer-tools');
                const mk = (label, value, set) => {
                    const s = el('select');
                    s.setAttribute('aria-label', label);
                    const none = el('option', undefined, label + ': escolher…');
                    none.value = '';
                    s.appendChild(none);
                    for (const t of PT.list()) {
                        const o = el('option', undefined, label + ': ' + t.name);
                        o.value = t.id;
                        s.appendChild(o);
                    }
                    s.value = value;
                    s.addEventListener('change', () => { set(s.value); });
                    return s;
                };
                const l = mk('Esquerda', layoutNow?.leftTemplateId ?? prefs.leftTpl, v => { prefs.leftTpl = v; });
                const r = mk('Direita', layoutNow?.rightTemplateId ?? prefs.rightTpl, v => { prefs.rightTpl = v; });
                pairRow.appendChild(l);
                pairRow.appendChild(r);
                pairRow.appendChild(button('Aplicar par', () => {
                    const L = l.value || prefs.leftTpl, R = r.value || prefs.rightTpl;
                    if (!L || !R) {
                        toast('Escolha um modelo para cada página.', 'info');
                        return;
                    }
                    void choose({ leftTemplateId: L, rightTemplateId: R });
                }, 'btn primary'));
                popup.appendChild(pairRow);
            }
            const foot = el('div', 'vb-composer-foot');
            const back = button('Voltar ao modo cru', () => { void choose(null); });
            back.disabled = !sp.composition;
            foot.appendChild(back);
            foot.appendChild(button('Concluir', close, 'btn primary'));
            popup.appendChild(foot);
            fit.addEventListener('change', () => { prefs.fit = fit.value; void reapply(); });
            sBox.addEventListener('change', () => { prefs.spread = sBox.checked; void reapply(); });
            search.addEventListener('input', () => { prefs.query = search.value; render(); const again = popup?.querySelector('input[type=search]'); again?.focus(); again?.setSelectionRange(again.value.length, again.value.length); });
        }
        async function reapply() {
            const layout = currentLayout();
            if (layout && popupSpread) {
                await choose(layout);
                return;
            }
            render();
        }
        function close() { if (popup) {
            popup.remove();
            popup = null;
        } }
        function open(spreadId) {
            close();
            popupSpread = spreadId ?? null;
            popup = el('div', 'vb-composer vb-spread-popup');
            popup.setAttribute('role', 'dialog');
            popup.setAttribute('aria-label', 'Página dupla e escala real');
            document.body.appendChild(popup);
            render();
            return true;
        }
        kernel.listen(window, 'keydown', event => {
            if (event.key === 'Escape' && popup && popup.contains(document.activeElement))
                close();
        });
        for (const evt of ['spread:changed', 'selection:changed'])
            kernel.on(evt, () => { if (popup && !popup.contains(document.activeElement))
                render(); });
        kernel.on('contextmenu:extend', function (payload) {
            const target = payload;
            const board = S.boards.find(b => b.id === S.currentBoardId);
            if (!board)
                return;
            const page = target.pageId ? board.instances.find(i => i.id === target.pageId) : undefined;
            const slotInfo = page && page.type === 'manga-page' ? page.vp1SpreadSlot : undefined;
            if (slotInfo) {
                const sp = (board.vp1Spreads || []).find(s => s.id === slotInfo.spreadId);
                if (sp) {
                    target.items.push({ icon: '📖', label: 'Página dupla: trocar modelo…', action: () => { open(sp.id); } });
                    if (sp.composition)
                        target.items.push({ icon: '↩', label: 'Página dupla: voltar ao cru', action: () => {
                                void (async () => {
                                    try {
                                        popupSpread = sp.id;
                                        if (!(await confirmDiscard()))
                                            return;
                                        await clear(sp.id, true);
                                    }
                                    catch (error) {
                                        toast(error.message);
                                    }
                                })();
                            } });
                    target.items.push({ sep: true });
                }
                return;
            }
            const images = board.instances.filter((i) => i.type === 'image' && S.selection.has(i.id));
            const spreads = board.vp1Spreads || [];
            const hit = images.length ? spreads.find(s => !s.composition && images.some(i => overlap(i, rectOf(s)) > 0)) : undefined;
            if (hit)
                target.items.push({ icon: '📖', label: 'Aplicar modelo na página dupla… (' + hit.name + ')', action: () => { open(hit.id); } });
            if (!target.pageId)
                target.items.push({ icon: '📖', label: 'Página dupla e escala real…', action: () => { open(); } });
            if (hit || !target.pageId)
                target.items.push({ sep: true });
        });
        kernel.provide('spread', {
            listPapers: () => PAPERS.map(p => ({ ...p })),
            listTemplates: doubleTemplates,
            create, list, get, move, scale, setPaper, rename, remove,
            dock, undock, plan, apply, change, clear,
            scaleObjects, fitPageToPaper,
            open, close
        });
    }
});
