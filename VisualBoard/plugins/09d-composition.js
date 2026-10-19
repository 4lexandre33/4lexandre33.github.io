"use strict";
/* =====================================================================
 * plugins/09d-composition.ts  (Fase 19)
 * ---------------------------------------------------------------------
 * Composição "crua" → modelo de página de mangá.
 *
 * O usuário espalha imagens no canvas (camadas = z-index), seleciona-as e escolhe
 * um modelo. O algoritmo abaixo decide, de forma determinística, em qual painel cada
 * imagem entra a partir da posição relativa, do tamanho e da camada. A composição crua
 * fica guardada na própria página (`vp1Composition.raw`): trocar de modelo sempre recalcula
 * a partir do cru e "Voltar ao modo cru" restaura as imagens exatamente onde estavam.
 *
 * Regras (docs/automation/composition-task-graph.md):
 *   1. imagens ordenadas por zIndex; B = união das caixas; posição normalizada em B e projetada na página;
 *   2. painel-alvo = maior cobertura da imagem (amostra 12×12), depois centro contido, depois centroide mais próximo;
 *   3. imagem ampla (cobre ≥ 50% de 2+ painéis) atravessa os painéis (fundo contínuo);
 *   4. grupo do painel mantém a posição relativa e é encaixado (cover/contain) ou mantido (keep).
 *
 * Fornece: composition
 * ===================================================================== */
definePlugin({
    id: 'composition',
    version: '1.1.0',
    needs: ['utils', 'state', 'history', 'panelSets', 'panelTemplates', 'mangaPage'],
    provides: ['composition'],
    uses: ['ui.dialogs'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'history': '^1.0.0', 'panelSets': '^1.0.0', 'panelTemplates': '^1.0.0', 'mangaPage': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'composition': '1.1.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const stateApi = await kernel.require('state');
        const S = stateApi.data;
        const history = await kernel.require('history');
        const PS = await kernel.require('panelSets');
        const PT = await kernel.require('panelTemplates');
        const MP = await kernel.require('mangaPage');
        const SAMPLES = 12;
        const MIN_PAGE_WIDTH = 200;
        const SPREAD_COVERAGE = 0.5;
        const round3 = (n) => Math.round(n * 1000) / 1000;
        function polygonInfo(id, poly) {
            const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
            const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
            return { id, poly, bb: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
                centroid: [xs.reduce((a, b) => a + b, 0) / xs.length, ys.reduce((a, b) => a + b, 0) / ys.length] };
        }
        function inPolygon(px, py, poly) {
            let inside = false;
            for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
                if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi)
                    inside = !inside;
            }
            return inside;
        }
        const inBox = (px, py, b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h;
        function normalizeOptions(options) {
            const fit = options?.fit;
            return {
                fit: fit === 'cover' || fit === 'contain' || fit === 'keep' ? fit : 'auto',
                spread: options?.spread !== false
            };
        }
        /** `frame` (Fase 20): quando informado, a área de referência é o quadro (ex.: página dupla) e não a união das imagens. */
        function planComposition(raw, tpl, optionsIn, frame) {
            const options = normalizeOptions(optionsIn);
            const pw = tpl.width ?? 600, ph = tpl.height ?? 850;
            const minX = Math.min(...raw.map(r => r.x)), minY = Math.min(...raw.map(r => r.y));
            const maxX = Math.max(...raw.map(r => r.x + r.width)), maxY = Math.max(...raw.map(r => r.y + r.height));
            const bounds = frame ? { x: frame.x, y: frame.y, w: Math.max(1, frame.w), h: Math.max(1, frame.h) }
                : { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
            const items = raw.map(r => {
                const stretched = { x: (r.x - bounds.x) / bounds.w * pw, y: (r.y - bounds.y) / bounds.h * ph,
                    w: r.width / bounds.w * pw, h: r.height / bounds.h * ph };
                const k = Math.sqrt((stretched.w * stretched.h) / Math.max(1, r.width * r.height));
                const aw = r.width * k, ah = r.height * k;
                const cx = stretched.x + stretched.w / 2, cy = stretched.y + stretched.h / 2;
                return { r, stretched, mapped: { x: cx - aw / 2, y: cy - ah / 2, w: aw, h: ah }, cx, cy,
                    best: 0, spread: false, panels: [] };
            });
            const panels = tpl.panels.map((poly, i) => polygonInfo('p' + (i + 1), poly));
            for (const item of items) {
                const ov = [], cov = [];
                panels.forEach(panel => {
                    let hits = 0;
                    for (let a = 0; a < SAMPLES; a++)
                        for (let b = 0; b < SAMPLES; b++) {
                            const px = item.stretched.x + (a + 0.5) / SAMPLES * item.stretched.w;
                            const py = item.stretched.y + (b + 0.5) / SAMPLES * item.stretched.h;
                            if (inPolygon(px, py, panel.poly))
                                hits++;
                        }
                    ov.push(hits / (SAMPLES * SAMPLES));
                    let inPanel = 0, both = 0;
                    for (let a = 0; a < SAMPLES; a++)
                        for (let b = 0; b < SAMPLES; b++) {
                            const px = panel.bb.x + (a + 0.5) / SAMPLES * panel.bb.w;
                            const py = panel.bb.y + (b + 0.5) / SAMPLES * panel.bb.h;
                            if (!inPolygon(px, py, panel.poly))
                                continue;
                            inPanel++;
                            if (inBox(px, py, item.stretched))
                                both++;
                        }
                    cov.push(inPanel ? both / inPanel : 0);
                });
                let best = 0;
                let bestKey = null;
                panels.forEach((panel, i) => {
                    const dist = Math.hypot(item.cx - panel.centroid[0], item.cy - panel.centroid[1]);
                    const key = [ov[i], inPolygon(item.cx, item.cy, panel.poly) ? 1 : 0, -dist];
                    const better = !bestKey || key[0] > bestKey[0] + 1e-9 ||
                        (Math.abs(key[0] - bestKey[0]) <= 1e-9 && (key[1] > bestKey[1] ||
                            (key[1] === bestKey[1] && key[2] > bestKey[2] + 1e-9)));
                    if (better) {
                        best = i;
                        bestKey = key;
                    }
                });
                item.best = best;
                const wide = panels.map((_, i) => i).filter(i => cov[i] >= SPREAD_COVERAGE);
                item.spread = options.spread && wide.length >= 2;
                item.panels = item.spread ? Array.from(new Set(wide.concat([best]))).sort((a, b) => a - b) : [best];
            }
            const planPanels = panels.map((panel, pi) => {
                const members = items.filter(it => it.panels.includes(pi));
                const hasSpread = members.some(m => m.spread);
                const mode = options.fit === 'auto' ? (hasSpread ? 'keep' : 'cover') : options.fit;
                const grouped = members.filter(m => !m.spread);
                let ux = 0, uy = 0, f = 1, pcx = 0, pcy = 0;
                if (mode !== 'keep' && grouped.length) {
                    const gx0 = Math.min(...grouped.map(m => m.mapped.x)), gy0 = Math.min(...grouped.map(m => m.mapped.y));
                    const gx1 = Math.max(...grouped.map(m => m.mapped.x + m.mapped.w)), gy1 = Math.max(...grouped.map(m => m.mapped.y + m.mapped.h));
                    const gw = Math.max(1, gx1 - gx0), gh = Math.max(1, gy1 - gy0);
                    ux = gx0 + gw / 2;
                    uy = gy0 + gh / 2;
                    f = mode === 'cover' ? Math.max(panel.bb.w / gw, panel.bb.h / gh) : Math.min(panel.bb.w / gw, panel.bb.h / gh);
                    pcx = panel.bb.x + panel.bb.w / 2;
                    pcy = panel.bb.y + panel.bb.h / 2;
                }
                return {
                    panelId: panel.id,
                    mode,
                    layers: members.map(m => {
                        const keep = m.spread || mode === 'keep';
                        const w = keep ? m.mapped.w : m.mapped.w * f, h = keep ? m.mapped.h : m.mapped.h * f;
                        const cx = keep ? m.mapped.x + m.mapped.w / 2 : pcx + (m.mapped.x + m.mapped.w / 2 - ux) * f;
                        const cy = keep ? m.mapped.y + m.mapped.h / 2 : pcy + (m.mapped.y + m.mapped.h / 2 - uy) * f;
                        return { objectId: m.r.id, assetId: m.r.assetId, x: round3(cx - w / 2), y: round3(cy - h / 2),
                            width: round3(w), height: round3(h), rotation: m.r.rotation, spread: m.spread };
                    })
                };
            });
            let pageW = pw * Math.sqrt((bounds.w * bounds.h) / (pw * ph)), pageH = ph * pageW / pw;
            if (!frame && pageW < MIN_PAGE_WIDTH) {
                const k = MIN_PAGE_WIDTH / pageW;
                pageW *= k;
                pageH *= k;
            }
            const page = frame ? { x: round3(frame.x), y: round3(frame.y), width: round3(frame.w), height: round3(frame.h) }
                : { x: Math.round(bounds.x + bounds.w / 2 - pageW / 2), y: Math.round(bounds.y + bounds.h / 2 - pageH / 2),
                    width: Math.round(pageW), height: Math.round(pageH) };
            const assignments = items.map(it => ({ objectId: it.r.id, assetId: it.r.assetId, panelId: panels[it.best].id,
                panels: it.panels.map(i => panels[i].id), spread: it.spread }));
            const warnings = [];
            if (raw.length > panels.length * 4)
                warnings.push('Many images for few panels: several layers will share a panel.');
            return { templateId: tpl.id, templateName: tpl.name, width: pw, height: ph, page, options,
                panels: planPanels, assignments, warnings };
        }
        /* ------------------------------------------------------------------
         * Estado: ler imagens, aplicar, trocar, remover
         * ------------------------------------------------------------------ */
        function currentBoard() {
            const board = S.boards.find(b => b.id === S.currentBoardId);
            if (!board)
                throw Error('No active board');
            return board;
        }
        function selectedImageIds() {
            const board = S.boards.find(b => b.id === S.currentBoardId);
            if (!board)
                return [];
            return board.instances.filter(i => i.type === 'image' && S.selection.has(i.id)).map(i => i.id);
        }
        function templateById(id) {
            const tpl = PT.list().find(t => t.id === id);
            if (!tpl)
                throw Error('Layout template not found: ' + id);
            return tpl;
        }
        function readRawImages(ids) {
            const board = currentBoard();
            const wanted = new Set(ids);
            const found = board.instances.filter((i) => i.type === 'image' && wanted.has(i.id));
            if (!found.length)
                throw Error('No image objects found for this composition (select images on the current board)');
            if (found.length > 60)
                throw Error('Too many images: the limit is 60 per composition');
            return found;
        }
        function toRaw(instances, boardOrder) {
            return instances.map(i => ({ id: i.id, assetId: i.assetId, x: i.x, y: i.y, width: i.width, height: i.height,
                rotation: i.rotation || 0, z: i.zIndex || 0, order: boardOrder.indexOf(i) }))
                .sort((a, b) => a.z - b.z || a.order - b.order);
        }
        function rawOfPage(page) {
            const comp = page.vp1Composition;
            if (!comp)
                throw Error('Page is not a composition: ' + page.id);
            return comp.raw.map((i, order) => ({ id: i.id, assetId: i.assetId, x: i.x, y: i.y, width: i.width, height: i.height,
                rotation: i.rotation || 0, z: i.zIndex || 0, order })).sort((a, b) => a.z - b.z || a.order - b.order);
        }
        const fingerprintOf = (page) => JSON.stringify([
            page.panelSetId,
            (page.panels || []).map(p => p.layers.map(l => [l.assetId, l.x, l.y, l.width, l.height, l.rotation || 0, l.vp1Crop || null, l.vp1ViewLimits || null])),
            (page.overlays || []).length
        ]);
        const extrasOf = (page) => (page.vp1Balloons || []).length + (page.vp1HorizontalTexts || []).length + (page.vp1MangaEffects || []).length + (page.overlays || []).length;
        function parsedFromTemplate(tpl) {
            const width = tpl.width ?? 600, height = tpl.height ?? 850;
            const panels = tpl.panels.map((pts, i) => ({ id: 'p' + (i + 1), points: pts.map(p => ({ x: round3(p[0]), y: round3(p[1]) })) }));
            return { width, height, panels, viewBox: { minX: 0, minY: 0, width, height },
                svgSource: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '">' +
                    panels.map(p => '<path d="M' + p.points.map(q => q.x + ',' + q.y).join(' L') + ' Z"/>').join('') + '</svg>' };
        }
        function fillPage(page, plan) {
            page.x = plan.page.x;
            page.y = plan.page.y;
            page.width = plan.page.width;
            page.height = plan.page.height;
            page.panels = plan.panels.map(p => ({
                id: p.panelId,
                layers: p.layers.map((l, index) => ({ id: utils.uid('layer'), assetId: l.assetId, x: l.x, y: l.y, width: l.width, height: l.height,
                    rotation: l.rotation, opacity: 1, zIndex: index + 1 }))
            }));
            page.overlays = [];
            page.unassignedPanels = [];
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
        function notify(pageId) {
            if (pageId)
                kernel.emit('manga-page:changed', { instanceId: pageId });
            kernel.emit('instances:changed');
            kernel.emit('selection:changed');
            kernel.emit('state:changed');
        }
        function pageById(pageId) {
            const page = currentBoard().instances.find(i => i.id === pageId);
            if (!page || page.type !== 'manga-page')
                throw Error('Manga page not found on the current board: ' + pageId);
            if (!page.vp1Composition)
                throw Error('Page was not created by a composition: ' + pageId);
            return page;
        }
        function infoOf(page) {
            const comp = page.vp1Composition;
            return { pageId: page.id, templateId: comp.templateId, options: normalizeOptions(comp.options), rawCount: comp.raw.length,
                edited: comp.fingerprint !== fingerprintOf(page), extras: extrasOf(page), objectIds: comp.raw.map(r => r.id) };
        }
        function plan(objectIds, templateId, options) {
            const board = currentBoard();
            return planComposition(toRaw(readRawImages(objectIds), board.instances), templateById(templateId), options);
        }
        async function apply(objectIds, templateId, options) {
            const tpl = templateById(templateId);
            const images = readRawImages(objectIds);
            if (images.some(i => i.locked))
                throw Error('Locked images cannot be placed in a layout: unlock them first');
            const board = currentBoard();
            const rawImages = toRaw(images, board.instances);
            const result = await history.transaction('composition.apply', async function () {
                const computed = planComposition(rawImages, tpl, options);
                const ps = PS.create(parsedFromTemplate(tpl), tpl.name);
                ps['vp1CompositionOwned'] = true;
                const page = await MP.addToBoard(ps.id, computed.page.x, computed.page.y);
                if (!page)
                    throw Error('Could not create the composition page');
                fillPage(page, computed);
                page.zIndex = Math.max(...rawImages.map(r => r.z), page.zIndex || 0);
                const records = images.map(i => JSON.parse(JSON.stringify(i)));
                page.vp1Composition = { version: 1, templateId: tpl.id, options: computed.options, raw: records, fingerprint: '' };
                const gone = new Set(images.map(i => i.id));
                board.instances = board.instances.filter(i => !gone.has(i.id));
                page.vp1Composition.fingerprint = fingerprintOf(page);
                S.selection.clear();
                S.selection.add(page.id);
                notify(page.id);
                return { pageId: page.id, plan: computed };
            });
            return result;
        }
        async function change(pageId, templateId, options, force = false) {
            const tpl = templateById(templateId);
            const page = pageById(pageId);
            const current = infoOf(page);
            if ((current.edited || current.extras) && !force)
                throw Error('The page has manual edits or extra objects (balloons, text, effects); changing the layout discards them. Repeat with force=true to confirm');
            const merged = { ...page.vp1Composition.options, ...(options || {}) };
            return history.transaction('composition.change', async function () {
                const computed = planComposition(rawOfPage(page), tpl, merged);
                const oldSetId = page.panelSetId;
                const ps = PS.create(parsedFromTemplate(tpl), tpl.name);
                ps['vp1CompositionOwned'] = true;
                page.panelSetId = ps.id;
                fillPage(page, computed);
                page.vp1Balloons = [];
                page.vp1HorizontalTexts = [];
                page.vp1MangaEffects = [];
                page.vp1LayerTreeMeta = {};
                page.vp1Composition.templateId = tpl.id;
                page.vp1Composition.options = computed.options;
                page.vp1Composition.fingerprint = fingerprintOf(page);
                dropOwnedSet(oldSetId, page.id);
                MP.setFocus(page.id, computed.panels[0]?.panelId ?? null);
                notify(page.id);
                return { pageId: page.id, plan: computed };
            });
        }
        async function remove(pageId, force = false) {
            const page = pageById(pageId);
            const current = infoOf(page);
            if ((current.edited || current.extras) && !force)
                throw Error('The page has manual edits or extra objects (balloons, text, effects) that would be lost. Repeat with force=true to confirm');
            return history.transaction('composition.remove', async function () {
                const board = currentBoard();
                const records = page.vp1Composition.raw.map(r => JSON.parse(JSON.stringify(r)));
                const setId = page.panelSetId;
                board.instances = board.instances.filter(i => i.id !== page.id).concat(records);
                dropOwnedSet(setId, page.id);
                MP.clearFocus();
                S.selection.clear();
                records.forEach(r => S.selection.add(r.id));
                notify();
                return { restored: records.map(r => r.id) };
            });
        }
        function get(pageId) {
            const page = currentBoard().instances.find(i => i.id === pageId);
            return page && page.type === 'manga-page' && page.vp1Composition ? infoOf(page) : null;
        }
        function list() {
            return currentBoard().instances.filter((i) => i.type === 'manga-page' && !!i.vp1Composition).map(infoOf);
        }
        /* ------------------------------------------------------------------
         * Popup flutuante (não modal): miniaturas mostram onde cada imagem cai
         * ------------------------------------------------------------------ */
        const PALETTE = ['#e07a5f', '#3d9970', '#4da3ff', '#f2c14e', '#b07cc6', '#5ec4b6', '#e58ab5', '#9aa5b1'];
        let popup = null;
        let popupPage = null;
        let popupIds = [];
        let popupTemplate = null;
        let popupSeq = 0;
        const prefs = { fit: 'auto', spread: true, orientation: 'all', query: '' };
        function popupRaw() {
            try {
                if (popupPage) {
                    const page = pageById(popupPage);
                    return rawOfPage(page);
                }
                const board = currentBoard();
                return toRaw(readRawImages(popupIds), board.instances);
            }
            catch {
                return null;
            }
        }
        function thumbSvg(raw, tpl) {
            const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
            if (!tpl) {
                const x0 = Math.min(...raw.map(r => r.x)), y0 = Math.min(...raw.map(r => r.y));
                const x1 = Math.max(...raw.map(r => r.x + r.width)), y1 = Math.max(...raw.map(r => r.y + r.height));
                const W = Math.max(1, x1 - x0), H = Math.max(1, y1 - y0), pad = Math.max(W, H) * 0.04;
                const boxes = raw.map((r, i) => '<rect x="' + round3(r.x - x0) + '" y="' + round3(r.y - y0) + '" width="' + round3(r.width) + '" height="' + round3(r.height) +
                    '" fill="' + PALETTE[i % PALETTE.length] + '" fill-opacity=".55" stroke="#14171d" stroke-width="' + round3(Math.max(W, H) * 0.008) + '"/>').join('');
                return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + round3(-pad) + ' ' + round3(-pad) + ' ' + round3(W + 2 * pad) + ' ' + round3(H + 2 * pad) +
                    '" preserveAspectRatio="xMidYMid meet"><rect x="' + round3(-pad) + '" y="' + round3(-pad) + '" width="' + round3(W + 2 * pad) + '" height="' + round3(H + 2 * pad) + '" fill="#f4efe3"/>' + boxes + '</svg>';
            }
            const computed = planComposition(raw, tpl, { fit: prefs.fit, spread: prefs.spread });
            const uid = 'c' + (popupSeq++);
            const pathOf = (poly) => 'M' + poly.map(p => p[0] + ',' + p[1]).join(' L') + ' Z';
            const defs = tpl.panels.map((poly, i) => '<clipPath id="' + uid + 'p' + i + '"><path d="' + esc(pathOf(poly)) + '"/></clipPath>').join('');
            const order = new Map(raw.map((r, i) => [r.id, i]));
            const body = tpl.panels.map((poly, i) => {
                const layers = computed.panels[i].layers.map(l => '<rect x="' + l.x + '" y="' + l.y + '" width="' + l.width + '" height="' + l.height +
                    '" fill="' + PALETTE[(order.get(l.objectId) ?? 0) % PALETTE.length] + '" fill-opacity=".78" stroke="#14171d" stroke-opacity=".55" stroke-width="' +
                    round3(Math.max(tpl.width ?? 600, tpl.height ?? 850) * 0.004) + '"/>').join('');
                return '<path d="' + esc(pathOf(poly)) + '" fill="#dfe5f2"/><g clip-path="url(#' + uid + 'p' + i + ')">' + layers + '</g>' +
                    '<path d="' + esc(pathOf(poly)) + '" fill="none" stroke="#14171d" stroke-width="' + round3(Math.max(tpl.width ?? 600, tpl.height ?? 850) * 0.005) + '"/>';
            }).join('');
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + tpl.width + ' ' + tpl.height + '"><defs>' + defs + '</defs>' +
                '<rect width="' + tpl.width + '" height="' + tpl.height + '" fill="#f4efe3"/>' + body + '</svg>';
        }
        /** SVG gerado localmente (valores numéricos e ids próprios) → elemento DOM, sem innerHTML. */
        function svgElement(markup) {
            return document.importNode(new DOMParser().parseFromString(markup, 'image/svg+xml').documentElement, true);
        }
        async function confirmDiscard() {
            if (!popupPage)
                return true;
            const info = get(popupPage);
            if (!info || (!info.edited && !info.extras))
                return true;
            if (!kernel.has('ui.dialogs'))
                return true;
            const D = await kernel.require('ui.dialogs');
            return !!(await D.confirm({ title: 'Descartar ajustes da página?',
                message: 'A página tem ajustes manuais ou objetos extras (balões, textos, efeitos). Trocar o modelo refaz a composição a partir da disposição crua e descarta esses ajustes. Você pode desfazer com Ctrl+Z.',
                confirmText: 'Trocar modelo', danger: true }));
        }
        async function choose(templateId) {
            try {
                if (templateId === null) {
                    if (!popupPage)
                        return;
                    if (!(await confirmDiscard()))
                        return;
                    const out = await remove(popupPage, true);
                    popupIds = out.restored;
                    popupPage = null;
                    popupTemplate = null;
                }
                else if (popupPage) {
                    if (templateId === popupTemplate)
                        return;
                    if (!(await confirmDiscard()))
                        return;
                    await change(popupPage, templateId, { fit: prefs.fit, spread: prefs.spread }, true);
                    popupTemplate = templateId;
                }
                else {
                    const out = await apply(popupIds, templateId, { fit: prefs.fit, spread: prefs.spread });
                    popupPage = out.pageId;
                    popupTemplate = templateId;
                }
            }
            catch (error) {
                kernel.emit('toast', { message: error.message, kind: 'error' });
            }
            render();
        }
        async function reapplyOptions() {
            if (popupPage && popupTemplate) {
                if (!(await confirmDiscard())) {
                    render();
                    return;
                }
                try {
                    await change(popupPage, popupTemplate, { fit: prefs.fit, spread: prefs.spread }, true);
                }
                catch (error) {
                    kernel.emit('toast', { message: error.message, kind: 'error' });
                }
            }
            render();
        }
        function close() {
            if (popup) {
                popup.remove();
                popup = null;
            }
            popupPage = null;
            popupTemplate = null;
            popupIds = [];
        }
        function render() {
            if (!popup)
                return;
            const raw = popupRaw();
            popup.replaceChildren();
            const head = document.createElement('div');
            head.className = 'vb-composer-head';
            const title = document.createElement('h2');
            title.textContent = 'Aplicar modelo de página';
            const x = document.createElement('button');
            x.type = 'button';
            x.className = 'btn ghost';
            x.textContent = '×';
            x.setAttribute('aria-label', 'Fechar');
            x.title = 'Fechar (Esc)';
            x.addEventListener('click', close);
            head.appendChild(title);
            head.appendChild(x);
            popup.appendChild(head);
            if (!raw) {
                const p = document.createElement('p');
                p.className = 'vb-composer-note';
                p.textContent = 'As imagens desta composição não estão mais disponíveis.';
                popup.appendChild(p);
                return;
            }
            const note = document.createElement('p');
            note.className = 'vb-composer-note';
            const tplName = popupTemplate ? (PT.list().find(t => t.id === popupTemplate)?.name ?? popupTemplate) : null;
            note.textContent = raw.length + (raw.length === 1 ? ' imagem' : ' imagens') + (tplName ? ' · modelo atual: ' + tplName : ' · modo cru') +
                '. Cada cor é uma imagem; as camadas seguem o z-index. Clique em um modelo para aplicar ao vivo.';
            popup.appendChild(note);
            const tools = document.createElement('div');
            tools.className = 'vb-composer-tools';
            const orientation = document.createElement('select');
            orientation.setAttribute('aria-label', 'Orientação');
            for (const [value, label] of [['all', 'Todos'], ['vertical', 'Vertical'], ['horizontal', 'Horizontal']]) {
                const o = document.createElement('option');
                o.value = value;
                o.textContent = label;
                orientation.appendChild(o);
            }
            orientation.value = prefs.orientation;
            const search = document.createElement('input');
            search.type = 'search';
            search.placeholder = 'Buscar modelo';
            search.value = prefs.query;
            search.setAttribute('aria-label', 'Buscar modelo');
            const fit = document.createElement('select');
            fit.setAttribute('aria-label', 'Ajuste da imagem no painel');
            for (const [value, label] of [['auto', 'Ajuste: automático'], ['cover', 'Ajuste: preencher painel'], ['contain', 'Ajuste: caber no painel'], ['keep', 'Ajuste: manter posição']]) {
                const o = document.createElement('option');
                o.value = value;
                o.textContent = label;
                fit.appendChild(o);
            }
            fit.value = prefs.fit;
            const spreadLabel = document.createElement('label');
            spreadLabel.className = 'vb-composer-check';
            const spread = document.createElement('input');
            spread.type = 'checkbox';
            spread.checked = prefs.spread;
            spreadLabel.appendChild(spread);
            spreadLabel.appendChild(document.createTextNode(' Fundos grandes atravessam os painéis'));
            tools.appendChild(orientation);
            tools.appendChild(search);
            tools.appendChild(fit);
            tools.appendChild(spreadLabel);
            popup.appendChild(tools);
            const grid = document.createElement('div');
            grid.className = 'vb-composer-grid';
            const rawTile = document.createElement('button');
            rawTile.type = 'button';
            rawTile.className = 'vb-composer-tile' + (!popupPage ? ' selected' : '');
            rawTile.setAttribute('aria-pressed', String(!popupPage));
            const rawThumb = document.createElement('div');
            rawThumb.className = 'vb-composer-thumb';
            rawThumb.appendChild(svgElement(thumbSvg(raw, null)));
            const rawName = document.createElement('div');
            rawName.className = 'vb-composer-name';
            rawName.textContent = 'Sem modelo (cru)';
            rawTile.appendChild(rawThumb);
            rawTile.appendChild(rawName);
            rawTile.addEventListener('click', () => { void choose(null); });
            grid.appendChild(rawTile);
            const q = prefs.query.trim().toLowerCase();
            for (const tpl of PT.list()) {
                if (prefs.orientation !== 'all' && tpl.orientation !== prefs.orientation)
                    continue;
                if (q && !(tpl.name + ' ' + tpl.desc).toLowerCase().includes(q))
                    continue;
                const tile = document.createElement('button');
                tile.type = 'button';
                const selected = tpl.id === popupTemplate;
                tile.className = 'vb-composer-tile' + (selected ? ' selected' : '');
                tile.setAttribute('aria-pressed', String(selected));
                tile.setAttribute('aria-label', tpl.name + ', ' + tpl.panels.length + ' painéis');
                tile.dataset.templateId = tpl.id;
                const thumb = document.createElement('div');
                thumb.className = 'vb-composer-thumb';
                thumb.appendChild(svgElement(thumbSvg(raw, tpl)));
                const name = document.createElement('div');
                name.className = 'vb-composer-name';
                name.textContent = tpl.name + ' · ' + tpl.panels.length;
                tile.appendChild(thumb);
                tile.appendChild(name);
                tile.addEventListener('click', () => { void choose(tpl.id); });
                grid.appendChild(tile);
            }
            popup.appendChild(grid);
            const foot = document.createElement('div');
            foot.className = 'vb-composer-foot';
            const raw2 = document.createElement('button');
            raw2.type = 'button';
            raw2.className = 'btn';
            raw2.textContent = 'Voltar ao modo cru';
            raw2.disabled = !popupPage;
            raw2.addEventListener('click', () => { void choose(null); });
            const done = document.createElement('button');
            done.type = 'button';
            done.className = 'btn primary';
            done.textContent = 'Concluir';
            done.addEventListener('click', close);
            foot.appendChild(raw2);
            foot.appendChild(done);
            popup.appendChild(foot);
            orientation.addEventListener('change', () => { prefs.orientation = orientation.value; render(); });
            search.addEventListener('input', () => { prefs.query = search.value; render(); const again = popup?.querySelector('input[type=search]'); again?.focus(); again?.setSelectionRange(again.value.length, again.value.length); });
            fit.addEventListener('change', () => { prefs.fit = fit.value; void reapplyOptions(); });
            spread.addEventListener('change', () => { prefs.spread = spread.checked; void reapplyOptions(); });
        }
        function open(objectIds) {
            let ids = objectIds ? Array.from(objectIds) : selectedImageIds();
            let pageId = null;
            if (!objectIds) {
                const board = S.boards.find(b => b.id === S.currentBoardId);
                const selectedPage = board?.instances.find((i) => i.type === 'manga-page' && S.selection.has(i.id) && !!i.vp1Composition);
                if (selectedPage) {
                    pageId = selectedPage.id;
                    ids = [];
                }
            }
            if (!pageId && !ids.length) {
                kernel.emit('toast', { message: 'Selecione uma ou mais imagens no canvas para aplicar um modelo.', kind: 'info' });
                return false;
            }
            close();
            popupPage = pageId;
            popupIds = ids;
            popupTemplate = pageId ? pageById(pageId).vp1Composition.templateId : null;
            if (pageId) {
                const o = pageById(pageId).vp1Composition.options;
                prefs.fit = normalizeOptions(o).fit;
                prefs.spread = normalizeOptions(o).spread;
            }
            popup = document.createElement('div');
            popup.className = 'vb-composer';
            popup.setAttribute('role', 'dialog');
            popup.setAttribute('aria-label', 'Aplicar modelo de página');
            document.body.appendChild(popup);
            render();
            popup.querySelector('.vb-composer-tile')?.focus();
            return true;
        }
        kernel.listen(window, 'keydown', event => {
            if (event.key === 'Escape' && popup && popup.contains(document.activeElement))
                close();
        });
        kernel.on('contextmenu:extend', function (payload) {
            const target = payload;
            const info = target.pageId ? get(target.pageId) : null;
            if (info) {
                target.items.push({ icon: '📐', label: 'Trocar modelo de página…', action: function () { open(); } }, { icon: '↩', label: 'Voltar ao modo cru (sem modelo)', action: async function () {
                        try {
                            if (info.edited || info.extras > 0) {
                                if (!kernel.has('ui.dialogs'))
                                    return;
                                const D = await kernel.require('ui.dialogs');
                                const ok = await D.confirm({ title: 'Voltar ao modo cru?',
                                    message: 'A página tem ajustes manuais ou objetos extras (balões, textos, efeitos) que serão descartados. Você pode desfazer com Ctrl+Z.',
                                    confirmText: 'Voltar ao cru', danger: true });
                                if (!ok)
                                    return;
                            }
                            await remove(info.pageId, true);
                        }
                        catch (error) {
                            kernel.emit('toast', { message: error.message, kind: 'error' });
                        }
                    } }, { sep: true });
                return;
            }
            const ids = selectedImageIds();
            if (!ids.length)
                return;
            target.items.push({ icon: '📐', label: 'Aplicar modelo de página… (' + ids.length + (ids.length === 1 ? ' imagem)' : ' imagens)'), action: function () { open(ids); } }, { sep: true });
        });
        kernel.provide('composition', {
            plan, apply, change, remove, get, list, open, close,
            selectedImageIds,
            /** Fase 20: algoritmo puro sobre imagens informadas e um quadro de referência (usado pela página dupla). */
            planFrame: function (raw, tpl, options, frame) {
                if (!raw.length)
                    throw Error('planFrame needs at least one image');
                const ordered = raw.map((r, order) => ({ ...r, order })).sort((a, b) => a.z - b.z || a.order - b.order);
                return planComposition(ordered, tpl, options, { x: frame.x, y: frame.y, w: frame.width, h: frame.height });
            }
        });
    }
});
