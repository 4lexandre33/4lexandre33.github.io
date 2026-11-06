"use strict";
/* Modo Webtoon — operações sobre o documento. A tira é uma página de mangá (`manga-page`) com o modelo `vp1Webtoon`; o conjunto de
 * painéis é regenerado a partir do modelo, e o conteúdo (camadas, balões, textos, efeitos) acompanha o bloco ao qual pertence.
 * Tudo roda em transações do histórico (um Desfazer por operação). A exportação reaproveita o exportador de mangá e apenas fatia. */
definePlugin({
    id: 'webtoon',
    version: '1.0.0',
    needs: ['webtoonCore', 'utils', 'state', 'history', 'panelSets', 'mangaPage', 'mangaExport', 'panelTemplates', 'sceneBlockingRender'],
    provides: ['webtoon'],
    uses: [],
    accepts: { webtoonCore: '^1.0.0', utils: '^1.0.0', state: '^1.0.0', history: '^1.0.0', panelSets: '^1.0.0', mangaPage: '^1.0.0', mangaExport: '^2.0.0', panelTemplates: '^1.0.0', sceneBlockingRender: '^1.0.0' },
    contractVersions: { webtoon: '1.0.0' },
    setup: async function (kernel) {
        const C = await kernel.require('webtoonCore');
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const MP = await kernel.require('mangaPage');
        const EX = await kernel.require('mangaExport');
        const PT = await kernel.require('panelTemplates');
        const R = await kernel.require('sceneBlockingRender');
        const fail = C.fail;
        const WORLD = 5000, VIEW_MAX = 9000;
        const clone = (v) => JSON.parse(JSON.stringify(v));
        const boardOf = (id) => {
            const b = S.boards.find(x => x.id === (id ?? S.currentBoardId)) ?? (id === undefined ? S.boards[0] : undefined);
            if (!b)
                return fail('NOT_FOUND', 'Board inexistente' + (id ? ': ' + id : ''));
            return b;
        };
        const isStrip = (inst) => !!inst && inst.type === 'manga-page' && !!inst.vp1Webtoon;
        function stripOf(id) {
            if (typeof id !== 'string')
                return fail('INVALID_ARGUMENT', 'instanceId deve ser um texto', 'instanceId');
            for (const b of S.boards) {
                const inst = b.instances.find(i => i.id === id);
                if (!inst)
                    continue;
                if (!isStrip(inst))
                    return fail('NOT_A_STRIP', 'A instância ' + id + ' não é uma tira Webtoon');
                const ps = PS.get(inst.panelSetId);
                if (!ps)
                    return fail('NOT_FOUND', 'O conjunto de painéis da tira não existe mais');
                return { inst, board: b, ps };
            }
            return fail('NOT_FOUND', 'Instância inexistente: ' + id);
        }
        const modelOf = (inst) => C.assertModel(inst.vp1Webtoon);
        function info(inst, board) {
            const m = modelOf(inst), l = C.layout(m), plan = C.planSlices(l, m.settings, spansOf(inst, l));
            const ps = PS.get(inst.panelSetId);
            return { instanceId: inst.id, panelSetId: inst.panelSetId, name: ps?.name ?? 'Webtoon', boardId: board.id, settings: m.settings, width: l.width, height: l.height, segments: plan.segments.length,
                blocks: l.blocks.map((b, index) => ({ id: b.id, index, y: b.y, height: b.height, gapAfter: b.gapAfter, slant: b.slant, panelIds: b.panelIds })) };
        }
        function spansOf(inst, _l) {
            const out = [];
            for (const b of inst.vp1Balloons ?? [])
                out.push({ id: b.id, y0: b.y, y1: b.y + b.height });
            for (const t of inst.vp1HorizontalTexts ?? [])
                out.push({ id: t.id, y0: t.y, y1: t.y + t.height });
            for (const e of inst.vp1MangaEffects ?? [])
                if (e.height > 0)
                    out.push({ id: e.id, y0: e.y, y1: e.y + e.height });
            return out;
        }
        const viewScale = (h) => Math.min(1, VIEW_MAX / Math.max(1, h));
        function done(inst, board) {
            kernel.emit('manga-page:changed', { instanceId: inst.id });
            kernel.emit('panelSets:changed');
            kernel.emit('instances:changed');
            kernel.emit('state:changed');
            return info(inst, board ?? boardOf());
        }
        function tx(label, fn) { return kernel.call('history', 'transaction', 'webtoon.' + label, fn); }
        /* ----------------------- movimento de conteúdo por bloco ----------------------- */
        function shiftY(o, dy) {
            if (!dy)
                return;
            o.y += dy;
            if (typeof o.centerY === 'number')
                o.centerY += dy;
            if (Array.isArray(o.points))
                for (const p of o.points)
                    p.y += dy;
        }
        /** Reaplica o modelo: regenera o conjunto de painéis e move o conteúdo conforme o bloco de origem. */
        function apply(inst, ps, next, removed = new Set()) {
            const prevModel = modelOf(inst), prev = C.layout(prevModel), lay = C.layout(next);
            const newY = new Map(lay.blocks.map(b => [b.id, b.y])), oldY = new Map(prev.blocks.map(b => [b.id, b.y]));
            const delta = (blockId) => (newY.has(blockId) && oldY.has(blockId)) ? newY.get(blockId) - oldY.get(blockId) : 0;
            const blockOfPanel = new Map();
            for (const b of prevModel.blocks)
                for (const p of b.panels)
                    blockOfPanel.set(p.id, b.id);
            const ownerDelta = (yc) => { const i = C.ownerBlock(prev, yc); return i < 0 ? 0 : delta(prev.blocks[i].id); };
            for (const p of inst.panels) {
                const d = delta(blockOfPanel.get(p.id) ?? '');
                if (d)
                    for (const l of p.layers)
                        l.y += d;
            }
            for (const e of inst.vp1MangaEffects ?? []) {
                const d = e.panelId && blockOfPanel.has(e.panelId) ? delta(blockOfPanel.get(e.panelId)) : ownerDelta(e.y + e.height / 2);
                shiftY(e, d);
            }
            for (const b of inst.vp1Balloons ?? [])
                shiftY(b, ownerDelta(b.y + b.height / 2));
            for (const t of inst.vp1HorizontalTexts ?? [])
                shiftY(t, ownerDelta(t.y + t.height / 2));
            // painéis: arquivar os removidos (com camadas) e criar os novos
            const keep = new Map(inst.panels.map(p => [p.id, p]));
            const panels = lay.panels.map(p => keep.get(p.id) ?? { id: p.id, layers: [] });
            const archived = inst.panels.filter(p => removed.has(p.id) && p.layers.length);
            if (archived.length)
                inst.unassignedPanels = [...(inst.unassignedPanels ?? []), ...archived.map(p => ({ ...clone(p), id: utils.uid('unassigned'), sourcePanelId: p.id, sourcePanelSetId: ps.id }))];
            inst.panels = panels;
            const oldKeepStyle = new Map(ps.panels.map(p => [p.id, p]));
            ps.panels = lay.panels.map((p) => { const o = oldKeepStyle.get(p.id); return o?.vp1Style ? { id: p.id, points: p.points, vp1Style: o.vp1Style } : { id: p.id, points: p.points }; });
            ps.width = lay.width;
            ps.height = lay.height;
            ps.svgSource = lay.svgSource;
            ps.viewBox = { minX: 0, minY: 0, width: lay.width, height: lay.height };
            ps.updatedAt = Date.now();
            const s = viewScale(lay.height);
            inst.width = lay.width * s;
            inst.height = lay.height * s;
            inst.vp1Webtoon = next;
        }
        const cloneModel = (inst) => clone(modelOf(inst));
        /* --------------------------------- modo --------------------------------- */
        function getMode(boardId) {
            const b = boardOf(boardId);
            return { boardId: b.id, mode: b.vp1Mode === 'webtoon' ? 'webtoon' : 'manga', strips: b.instances.filter(isStrip).length, mangaPages: b.instances.filter(i => i.type === 'manga-page' && !isStrip(i)).length };
        }
        async function setMode(mode, boardId) {
            if (mode !== 'manga' && mode !== 'webtoon')
                return fail('INVALID_ARGUMENT', 'mode deve ser "manga" ou "webtoon"', 'mode');
            const b = boardOf(boardId);
            if ((b.vp1Mode ?? 'manga') !== mode) {
                await tx('setMode', async () => { if (mode === 'manga')
                    delete b.vp1Mode;
                else
                    b.vp1Mode = 'webtoon'; b.updatedAt = Date.now(); });
                kernel.emit('boards:changed');
                kernel.emit('webtoon:mode', { boardId: b.id, mode });
                kernel.emit('state:changed');
            }
            return getMode(b.id);
        }
        /* ------------------------------ criar/consultar ------------------------------ */
        function list(boardId) { const b = boardOf(boardId); return b.instances.filter(isStrip).map(i => info(i, b)); }
        function get(instanceId) { const { inst, board } = stripOf(instanceId); return info(inst, board); }
        function freeSpot(board, w, h) {
            let right = -WORLD + 120;
            for (const i of board.instances)
                right = Math.max(right, i.x + i.width + 80);
            const x = right + w <= WORLD - 60 ? right : -w / 2;
            return { x: Math.round(x), y: Math.round(Math.max(-WORLD + 60, -h / 2)) };
        }
        async function createCore(model, name, board, at) {
            const lay = C.layout(model);
            const ps = PS.create({ width: lay.width, height: lay.height, viewBox: { minX: 0, minY: 0, width: lay.width, height: lay.height }, svgSource: lay.svgSource,
                panels: lay.panels.map(p => ({ id: p.id, points: p.points })) }, name);
            const s = viewScale(lay.height), w = lay.width * s, h = lay.height * s, spot = freeSpot(board, w, h);
            const inst = await MP.addToBoard(ps.id, spot.x + w / 2, spot.y + h / 2);
            if (!inst)
                return fail('OPERATION_REJECTED', 'Não foi possível criar a tira');
            inst.width = w;
            inst.height = h;
            if (at && typeof at.x === 'number' && typeof at.y === 'number' && Number.isFinite(at.x) && Number.isFinite(at.y)) {
                inst.x = at.x;
                inst.y = at.y;
            }
            else {
                inst.x = spot.x;
                inst.y = spot.y;
            }
            inst.vp1Webtoon = model;
            return inst;
        }
        async function create(opts = {}) {
            let model;
            if (opts.blocks !== undefined) {
                if (!Array.isArray(opts.blocks) || opts.blocks.length > C.limits().maxBlocks)
                    return fail('INVALID_ARGUMENT', 'blocks deve ser uma lista de até ' + C.limits().maxBlocks, 'blocks');
                model = C.modelFromTemplate('splash-long', opts.settings);
                model.blocks = [];
                model.nextBlock = 1;
                model.nextPanel = 1;
                for (const b of opts.blocks)
                    model.blocks.push(C.newBlock(model, b));
            }
            else
                model = C.modelFromTemplate(opts.template ?? 'blank-3', opts.settings);
            if (!model.blocks.length)
                return fail('INVALID_ARGUMENT', 'A tira precisa de ao menos um quadro', 'blocks');
            model = C.assertModel(model);
            C.layout(model);
            const name = typeof opts.name === 'string' && opts.name.trim() ? opts.name.trim().slice(0, 120) : 'Webtoon';
            const board = boardOf(), at = {};
            if (opts.x !== undefined)
                at.x = opts.x;
            if (opts.y !== undefined)
                at.y = opts.y;
            return tx('create', async () => done(await createCore(model, name, board, at), board));
        }
        /* ------------------------------ edição de blocos ------------------------------ */
        async function mutate(instanceId, label, fn) {
            const { inst, board, ps } = stripOf(instanceId);
            return tx(label, async () => {
                const next = cloneModel(inst), removed = fn(next, inst) ?? new Set();
                apply(inst, ps, C.assertModel(next), removed);
                return done(inst, board);
            });
        }
        const blockIndex = (m, id) => {
            const i = m.blocks.findIndex(b => b.id === id);
            return i < 0 ? fail('NOT_FOUND', 'Bloco inexistente: ' + String(id), 'blockId') : i;
        };
        function addBlock(instanceId, spec = {}) {
            return mutate(instanceId, 'addBlock', m => {
                if (m.blocks.length >= C.limits().maxBlocks)
                    return fail('LIMIT_EXCEEDED', 'No máximo ' + C.limits().maxBlocks + ' blocos');
                const at = spec.at === undefined ? m.blocks.length : spec.at;
                if (!Number.isInteger(at) || at < 0 || at > m.blocks.length)
                    return fail('INVALID_ARGUMENT', 'at deve estar entre 0 e ' + m.blocks.length, 'at');
                m.blocks.splice(at, 0, C.newBlock(m, spec));
            });
        }
        function setBlock(instanceId, blockId, patch) {
            return mutate(instanceId, 'setBlock', m => {
                const b = m.blocks[blockIndex(m, blockId)];
                const keys = Object.keys(patch ?? {});
                if (!keys.length || keys.some(k => !['height', 'gapAfter', 'slant'].includes(k)))
                    return fail('INVALID_ARGUMENT', 'Informe height, gapAfter e/ou slant');
                if (patch.height !== undefined) {
                    if (b.panels.length > 1 || b.panels[0].shape)
                        return fail('INVALID_ARGUMENT', 'Blocos vindos de página de mangá têm altura fixa', 'height');
                    b.height = patch.height;
                }
                if (patch.gapAfter !== undefined)
                    b.gapAfter = patch.gapAfter;
                if (patch.slant !== undefined)
                    b.slant = patch.slant;
            });
        }
        function moveBlock(instanceId, blockId, toIndex) {
            return mutate(instanceId, 'moveBlock', m => {
                const from = blockIndex(m, blockId);
                if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= m.blocks.length)
                    return fail('INVALID_ARGUMENT', 'toIndex fora do intervalo', 'toIndex');
                const [b] = m.blocks.splice(from, 1);
                m.blocks.splice(toIndex, 0, b);
            });
        }
        function removeBlock(instanceId, blockId, opts = {}) {
            return mutate(instanceId, 'removeBlock', (m, inst) => {
                if (m.blocks.length <= 1)
                    return fail('LAST_BLOCK', 'A tira precisa de ao menos um quadro');
                const i = blockIndex(m, blockId), lay = C.layout(modelOf(inst)), pb = lay.blocks[i];
                const inBlock = (y0, y1) => C.ownerBlock(lay, (y0 + y1) / 2) === i;
                const objects = spansOf(inst).filter(o => inBlock(o.y0, o.y1)).length;
                if (objects && opts.force !== true)
                    return fail('BLOCK_NOT_EMPTY', 'O bloco tem ' + objects + ' balão(ões), texto(s) ou efeito(s); use force para removê-los', 'blockId');
                const gone = new Set(m.blocks[i].panels.map(p => p.id));
                if (objects) {
                    const keep = (a) => (a ?? []).filter(o => !inBlock(o.y, o.y + o.height));
                    inst.vp1Balloons = keep(inst.vp1Balloons);
                    inst.vp1HorizontalTexts = keep(inst.vp1HorizontalTexts);
                    inst.vp1MangaEffects = (inst.vp1MangaEffects ?? []).filter(e => !(e.panelId && gone.has(e.panelId)) && !(e.height > 0 && inBlock(e.y, e.y + e.height)));
                }
                void pb;
                m.blocks.splice(i, 1);
                return gone;
            });
        }
        function setSettings(instanceId, patch) {
            return mutate(instanceId, 'setSettings', m => {
                if (!patch || typeof patch !== 'object' || !Object.keys(patch).length)
                    return fail('INVALID_ARGUMENT', 'Informe ao menos uma configuração');
                const before = m.settings.widthPx;
                m.settings = C.normalizeSettings(patch, m.settings);
                if (m.settings.widthPx !== before && m.blocks.some(b => b.panels.some(p => p.shape)))
                    return fail('INVALID_ARGUMENT', 'Tiras com páginas de mangá convertidas têm largura fixa', 'widthPx');
            });
        }
        /* --------------------------- planejamento e exportação --------------------------- */
        function objectSpans(instanceId) { return spansOf(stripOf(instanceId).inst); }
        function plan(instanceId, patch) {
            const { inst, board } = stripOf(instanceId), m = cloneModel(inst);
            if (patch !== undefined)
                m.settings = C.normalizeSettings(patch, m.settings);
            const l = C.layout(m), p = C.planSlices(l, m.settings, spansOf(inst)), issues = C.preflight(l, m.settings, p);
            return { strip: { ...info(inst, board), settings: m.settings }, plan: p, issues, scale: C.outputScale(m.settings) };
        }
        const canvasBlob = (c, mime, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Falha ao codificar a imagem')), mime, q));
        const baseName = (name) => (name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'webtoon').slice(0, 60);
        async function renderFull(inst, settings, scaleOverride) {
            const quality = scaleOverride ?? C.outputScale(settings);
            return EX.renderPageToCanvas(inst, { quality, maxSide: C.limits().maxExportSide, maxPixels: C.limits().maxExportPixels, silent: true, background: settings.background });
        }
        async function exportSlices(instanceId, opts = {}) {
            const { inst, ps } = stripOf(instanceId), m = modelOf(inst);
            const fmt = opts.format === 'jpeg' ? 'jpeg' : opts.format === undefined || opts.format === 'png' ? 'png' : fail('INVALID_ARGUMENT', 'format deve ser png ou jpeg', 'format');
            const jq = opts.jpegQuality === undefined ? 0.9 : opts.jpegQuality;
            if (typeof jq !== 'number' || !(jq >= 0.5 && jq <= 1))
                return fail('INVALID_ARGUMENT', 'jpegQuality deve estar entre 0,5 e 1', 'jpegQuality');
            const l = C.layout(m), p = C.planSlices(l, m.settings, spansOf(inst)), issues = C.preflight(l, m.settings, p);
            const errors = issues.filter(i => i.severity === 'error');
            if (errors.length)
                return fail('PREFLIGHT_FAILED', errors.map(e => e.message).join(' '));
            const full = await renderFull(inst, m.settings);
            const files = [], k = full.resolution.quality, stem = baseName(ps.name ?? 'webtoon'), ext = fmt === 'jpeg' ? 'jpg' : 'png';
            try {
                if (full.resolution.quality < C.outputScale(m.settings) - 0.0001)
                    issues.push({ code: 'RESOLUTION_LIMIT', severity: 'warning', message: 'A resolução foi reduzida para caber nos limites de memória do navegador.' });
                for (const seg of p.segments) {
                    const sy0 = seg.index === 1 ? 0 : Math.round(seg.y0 * k), sy1 = seg.cut === 'end' ? full.height : Math.min(full.height, Math.round(seg.y1 * k)), h = Math.max(1, sy1 - sy0);
                    const c = document.createElement('canvas');
                    c.width = full.width;
                    c.height = h;
                    const ctx = c.getContext('2d');
                    if (!ctx)
                        return fail('OPERATION_REJECTED', 'O navegador não alocou o canvas do segmento');
                    if (fmt === 'jpeg') {
                        ctx.fillStyle = m.settings.background;
                        ctx.fillRect(0, 0, c.width, h);
                    }
                    ctx.drawImage(full.canvas, 0, sy0, full.width, h, 0, 0, full.width, h);
                    const blob = await canvasBlob(c, 'image/' + fmt, fmt === 'jpeg' ? jq : undefined);
                    c.width = 0;
                    c.height = 0;
                    files.push({ name: stem + '_' + String(seg.index).padStart(3, '0') + '.' + ext, segment: seg.index, y0: seg.y0, y1: seg.y1, width: full.width, height: h, blob });
                }
            }
            finally {
                full.canvas.width = 0;
                full.canvas.height = 0;
            }
            return { files, issues, scale: k };
        }
        async function exportZip(instanceId, opts = {}) {
            const result = await exportSlices(instanceId, opts), stem = baseName(stripOf(instanceId).ps.name ?? 'webtoon');
            const data = await Promise.all(result.files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.blob.arrayBuffer()) })));
            const bytes = R.zip(data);
            return { blob: new Blob([bytes], { type: 'application/zip' }), name: stem + '.zip', result };
        }
        async function previewBlob(instanceId, y0, y1, maxWidth = 360) {
            const { inst } = stripOf(instanceId), m = modelOf(inst), l = C.layout(m);
            if (!Number.isFinite(y0) || !Number.isFinite(y1) || y1 <= y0 || y0 < 0 || y1 > l.height + 0.5)
                return fail('INVALID_ARGUMENT', 'Trecho inválido da tira');
            if (!Number.isInteger(maxWidth) || maxWidth < 120 || maxWidth > 1200)
                return fail('INVALID_ARGUMENT', 'maxWidth deve estar entre 120 e 1200', 'maxWidth');
            const k = Math.min(1, maxWidth / l.width), full = await renderFull(inst, m.settings, k);
            try {
                const sy0 = Math.round(y0 * full.resolution.quality), sy1 = Math.min(full.height, Math.round(y1 * full.resolution.quality)), h = Math.max(1, sy1 - sy0);
                const c = document.createElement('canvas');
                c.width = full.width;
                c.height = h;
                c.getContext('2d').drawImage(full.canvas, 0, sy0, full.width, h, 0, 0, full.width, h);
                const blob = await canvasBlob(c, 'image/png');
                c.width = 0;
                c.height = 0;
                return blob;
            }
            finally {
                full.canvas.width = 0;
                full.canvas.height = 0;
            }
        }
        function moveContent(src, dst, panelMap, mv, take, panelOnly) {
            const remap = new Map();
            const mk = (kind, old, prefix) => { const id = utils.uid(prefix); remap.set(kind + ':' + old, kind + ':' + id); return id; };
            for (const [o, n] of panelMap)
                remap.set('panel:' + o, 'panel:' + n);
            for (const p of src.panels) {
                const target = panelMap.get(p.id);
                if (!target)
                    continue;
                const dp = dst.panels.find(x => x.id === target);
                if (!dp)
                    continue;
                for (const l of p.layers) {
                    const c = clone(l);
                    c.id = mk('image', l.id, 'layer');
                    c.x += mv.dx;
                    c.y += mv.dy;
                    dp.layers.push(c);
                }
            }
            if (!panelOnly)
                for (const l of src.overlays ?? []) {
                    if (!take(l.y + l.height / 2))
                        continue;
                    const c = clone(l);
                    c.id = mk('image', l.id, 'layer');
                    c.x += mv.dx;
                    c.y += mv.dy;
                    (dst.overlays ??= []).push(c);
                }
            const place = (items, kind, prefix, out) => {
                for (const o of items ?? []) {
                    if (!take(o.y + o.height / 2))
                        continue;
                    const c = clone(o);
                    c.id = mk(kind, o.id, prefix);
                    c.x += mv.dx;
                    c.y += mv.dy;
                    out.push(c);
                }
            };
            const bal = [], txt = [], fx = [];
            place(src.vp1Balloons, 'balloon', 'balloon', bal);
            place(src.vp1HorizontalTexts, 'text', 'text', txt);
            for (const e of src.vp1MangaEffects ?? []) {
                const mapped = e.panelId ? panelMap.get(e.panelId) : null;
                if (e.panelId ? !mapped : !take(e.y + e.height / 2))
                    continue;
                const c = clone(e);
                c.id = mk('drawing', e.id, 'fx');
                c.x += mv.dx;
                c.y += mv.dy;
                c.centerX += mv.dx;
                c.centerY += mv.dy;
                for (const p of c.points ?? []) {
                    p.x += mv.dx;
                    p.y += mv.dy;
                }
                c.panelId = mapped ?? null;
                fx.push(c);
            }
            dst.vp1Balloons = [...(dst.vp1Balloons ?? []), ...bal];
            dst.vp1HorizontalTexts = [...(dst.vp1HorizontalTexts ?? []), ...txt];
            dst.vp1MangaEffects = [...(dst.vp1MangaEffects ?? []), ...fx];
            if (src.vp1LayerTreeMeta) {
                const meta = dst.vp1LayerTreeMeta ??= {};
                for (const [k, v] of Object.entries(src.vp1LayerTreeMeta)) {
                    const nk = remap.get(k);
                    if (nk)
                        meta[nk] = clone(v);
                }
            }
        }
        async function fromMangaPages(opts = {}) {
            const board = boardOf(), issues = [];
            let pages;
            if (opts.pageIds !== undefined) {
                if (!Array.isArray(opts.pageIds) || !opts.pageIds.length || opts.pageIds.length > 40)
                    return fail('INVALID_ARGUMENT', 'pageIds deve ter de 1 a 40 páginas', 'pageIds');
                pages = opts.pageIds.map(id => { const i = board.instances.find(x => x.id === id); if (!i || i.type !== 'manga-page' || isStrip(i))
                    return fail('NOT_FOUND', 'Página de mangá inexistente: ' + String(id), 'pageIds'); return i; });
            }
            else
                pages = board.instances.filter(i => i.type === 'manga-page' && !isStrip(i)).sort((a, b) => a.y - b.y || a.x - b.x).slice(0, 40);
            if (!pages.length)
                return fail('NOT_FOUND', 'Não há páginas de mangá neste board');
            if (new Set(pages.map(p => p.id)).size !== pages.length)
                return fail('INVALID_ARGUMENT', 'pageIds repetidos', 'pageIds');
            const gap = opts.gap === undefined ? 120 : opts.gap;
            if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0 || gap > C.limits().maxGap)
                return fail('INVALID_ARGUMENT', 'gap fora do intervalo', 'gap');
            const sets = pages.map(p => PS.get(p.panelSetId) ?? fail('NOT_FOUND', 'Página sem conjunto de painéis: ' + p.id));
            const W = Math.round(Math.max(...sets.map(s => s.width)));
            if (W < C.limits().minWidth || W > C.limits().maxWidth)
                return fail('INVALID_ARGUMENT', 'A largura das páginas (' + W + ' px) está fora de ' + C.limits().minWidth + '–' + C.limits().maxWidth + ' px', 'width');
            const model = C.modelFromTemplate('splash-long', { widthPx: W });
            model.blocks = [];
            model.nextBlock = 1;
            model.nextPanel = 1;
            const maps = [], offsets = [];
            let y = 0;
            pages.forEach((pg, i) => {
                const set = sets[i], dx = (W - set.width) / 2, map = new Map();
                const block = { id: 'blk' + model.nextBlock++, height: Math.max(C.limits().minBlockHeight, Math.round(set.height * 100) / 100), gapAfter: i === pages.length - 1 ? 0 : gap, slant: 0, panels: [] };
                for (const gp of set.panels) {
                    const id = 'w' + model.nextPanel++;
                    map.set(gp.id, id);
                    block.panels.push({ id, shape: gp.points.map(pt => [Math.round((pt.x + dx) * 100) / 100, Math.round(pt.y * 100) / 100]) });
                }
                model.blocks.push(block);
                maps.push(map);
                offsets.push(y);
                y += block.height + block.gapAfter;
                if (pg.unassignedPanels?.length)
                    issues.push({ code: 'UNASSIGNED_DROPPED', severity: 'warning', message: 'A página ' + pg.id + ' tem painéis arquivados; eles não foram levados para a tira.' });
                if (pg.vp1SpreadSlot)
                    issues.push({ code: 'SPREAD_DROPPED', severity: 'info', message: 'A página ' + pg.id + ' estava encaixada numa página dupla; a tira não usa páginas duplas.' });
            });
            const checked = C.assertModel(model);
            C.layout(checked);
            let created = null;
            await tx('fromManga', async () => {
                const inst = await createCore(checked, typeof opts.name === 'string' && opts.name.trim() ? opts.name.trim().slice(0, 120) : 'Webtoon', board), lay = C.layout(checked);
                inst.panels = lay.panels.map(p => ({ id: p.id, layers: [] }));
                pages.forEach((pg, i) => {
                    const set = sets[i], top = lay.blocks[i].y;
                    moveContent(pg, inst, maps[i], { dx: (W - set.width) / 2, dy: top }, () => true, false);
                });
                if (opts.removeOriginals === true) {
                    const ids = new Set(pages.map(p => p.id));
                    board.instances = board.instances.filter(i => !ids.has(i.id));
                }
                created = done(inst, board);
            });
            void offsets;
            return { strip: created, issues };
        }
        async function toMangaPages(instanceId, opts = {}) {
            const { inst, board, ps } = stripOf(instanceId), m = modelOf(inst), l = C.layout(m), W = l.width;
            const pageH = opts.pageHeight === undefined ? Math.round(W * 1.4167) : opts.pageHeight;
            if (!Number.isInteger(pageH) || pageH < 400 || pageH > 4096)
                return fail('INVALID_ARGUMENT', 'pageHeight deve ser um inteiro entre 400 e 4096', 'pageHeight');
            const p = C.planSlices(l, { ...m.settings, maxSegmentPx: pageH, outputWidthPx: m.settings.widthPx }, spansOf(inst));
            const bad = p.segments.filter(s => s.cut === 'panel' || s.cut === 'object');
            if (bad.length)
                return fail('CONVERSION_CUTS_CONTENT', 'Não há vão entre quadros que caiba em páginas de ' + pageH + ' px (cortes problemáticos nos segmentos ' + bad.map(b => b.index).join(', ') + '). Aumente pageHeight ou insira vãos.');
            const pages = [], issues = [];
            await tx('toManga', async () => {
                for (const seg of p.segments) {
                    const inSeg = l.panels.filter(q => q.points.every(pt => pt.y >= seg.y0 - 0.01 && pt.y <= seg.y1 + 0.01));
                    if (!inSeg.length) {
                        issues.push({ code: 'EMPTY_SEGMENT', severity: 'info', message: 'O trecho ' + seg.index + ' não tem quadros e não virou página.', segment: seg.index });
                        continue;
                    }
                    const map = new Map();
                    const geom = inSeg.map((q, i) => { const id = 'p' + (i + 1); map.set(q.id, id); return { id, points: q.points.map(pt => ({ x: pt.x, y: Math.round((pt.y - seg.y0) * 100) / 100 })) }; });
                    const H = Math.max(128, Math.ceil(seg.height));
                    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '">' + geom.map(g => '<path d="M' + g.points.map(q => q.x + ',' + q.y).join(' L') + ' Z"/>').join('') + '</svg>';
                    const set = PS.create({ width: W, height: H, panels: geom, viewBox: { minX: 0, minY: 0, width: W, height: H }, svgSource: svg }, (ps.name ?? 'Webtoon') + ' — ' + seg.index);
                    const pos = await PT.flowPosition(set.id), page = await MP.addToBoard(set.id, pos.x, pos.y);
                    if (!page)
                        return fail('OPERATION_REJECTED', 'Não foi possível criar a página ' + seg.index);
                    moveContent(inst, page, map, { dx: 0, dy: -seg.y0 }, cy => cy >= seg.y0 && cy < seg.y1 + (seg.cut === 'end' ? 1 : 0), false);
                    pages.push(page.id);
                }
                kernel.emit('instances:changed');
                kernel.emit('state:changed');
            });
            void board;
            return { pages, issues };
        }
        kernel.provide('webtoon', { limits: C.limits, templates: C.templates, getMode, setMode, isStrip, list, get, create, addBlock, setBlock, moveBlock, removeBlock, setSettings, objectSpans, plan, exportSlices, exportZip, previewBlob, fromMangaPages, toMangaPages });
    }
});
