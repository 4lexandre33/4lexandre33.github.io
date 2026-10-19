"use strict";
/* =====================================================================
 * plugins/06c-panel-templates.js
 * ---------------------------------------------------------------------
 * Templates prontos de páginas de mangá.
 * Cada template define painéis em coordenadas de 600×850.
 * Ao escolher, sintetiza um SVG source (para persistência e .svg/) e
 * cria o PanelSet + MangaPage no centro da câmera.
 *
 * Fornece: panelTemplates
 * ===================================================================== */
definePlugin({
    id: 'panel-templates',
    version: '1.1.0',
    needs: ['utils', 'state', 'panelSets', 'mangaPage', 'camera', 'history'],
    provides: ['panelTemplates'],
    uses: [],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'panelSets': '^1.0.0', 'mangaPage': '^1.0.0', 'camera': '^1.0.0', 'history': '^1.0.0' },
    contractVersions: { 'panelTemplates': '1.1.0' },
    setup: async function (kernel) {
        const S = (await kernel.require('state')).data;
        const PS = await kernel.require('panelSets');
        const MP = await kernel.require('mangaPage');
        const cam = await kernel.require('camera');
        const PAGE_W = 600;
        const PAGE_H = 850;
        /* ---------------- Template definitions ---------------- */
        // Painéis em arrays de [x, y] para economizar espaço.
        const TEMPLATES = [
            {
                id: 'splash',
                name: 'Splash page',
                desc: 'One full-page panel.',
                panels: [[[0, 0], [600, 0], [600, 850], [0, 850]]]
            },
            {
                id: 'two-rows',
                name: 'Two rows',
                desc: 'Two stacked horizontal panels.',
                panels: [
                    [[10, 10], [590, 10], [590, 420], [10, 420]],
                    [[10, 430], [590, 430], [590, 840], [10, 840]]
                ]
            },
            {
                id: 'two-cols',
                name: 'Two columns',
                desc: 'Two side-by-side vertical panels.',
                panels: [
                    [[10, 10], [295, 10], [295, 840], [10, 840]],
                    [[305, 10], [590, 10], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'three-cols',
                name: 'Three columns',
                desc: 'Three vertical panels.',
                panels: [
                    [[10, 10], [196, 10], [196, 840], [10, 840]],
                    [[207, 10], [393, 10], [393, 840], [207, 840]],
                    [[404, 10], [590, 10], [590, 840], [404, 840]]
                ]
            },
            {
                id: 'four-grid',
                name: '2×2 grid',
                desc: 'Four equal panels.',
                panels: [
                    [[10, 10], [295, 10], [295, 420], [10, 420]],
                    [[305, 10], [590, 10], [590, 420], [305, 420]],
                    [[10, 430], [295, 430], [295, 840], [10, 840]],
                    [[305, 430], [590, 430], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'six-grid',
                name: '3×2 grid',
                desc: 'Six equal panels.',
                panels: [
                    [[10, 10], [295, 10], [295, 275], [10, 275]],
                    [[305, 10], [590, 10], [590, 275], [305, 275]],
                    [[10, 285], [295, 285], [295, 560], [10, 560]],
                    [[305, 285], [590, 285], [590, 560], [305, 560]],
                    [[10, 570], [295, 570], [295, 840], [10, 840]],
                    [[305, 570], [590, 570], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'classic-5',
                name: 'Classic 5-panel',
                desc: 'Wide top, four below.',
                panels: [
                    [[15, 15], [585, 15], [585, 395], [15, 395]],
                    [[15, 410], [193, 410], [193, 835], [15, 835]],
                    [[211, 410], [389, 410], [389, 605], [211, 605]],
                    [[211, 620], [389, 620], [389, 835], [211, 835]],
                    [[407, 410], [585, 410], [585, 835], [407, 835]]
                ]
            },
            {
                id: 'splash-top',
                name: 'Splash top + 2',
                desc: 'Wide top panel, two below.',
                panels: [
                    [[10, 10], [590, 10], [590, 395], [10, 395]],
                    [[10, 410], [295, 410], [295, 840], [10, 840]],
                    [[305, 410], [590, 410], [590, 840], [305, 840]]
                ]
            },
            {
                id: 'three-tiers',
                name: 'Three tiers',
                desc: 'Three horizontal bands.',
                panels: [
                    [[10, 10], [590, 10], [590, 270], [10, 270]],
                    [[10, 280], [590, 280], [590, 570], [10, 570]],
                    [[10, 580], [590, 580], [590, 840], [10, 840]]
                ]
            },
            {
                id: 'big-left',
                name: 'Big left',
                desc: 'Large left panel, three on the right.',
                panels: [
                    [[10, 10], [400, 10], [400, 840], [10, 840]],
                    [[410, 10], [590, 10], [590, 275], [410, 275]],
                    [[410, 285], [590, 285], [590, 560], [410, 560]],
                    [[410, 570], [590, 570], [590, 840], [410, 840]]
                ]
            }
        ];
        /* VP1-006–008: 10 historical templates + 31 original portrait layouts
         * + 28 original landscape layouts + 24 hand-authored (Fase 18) = 93. Nothing GPL is bundled.
         * Each generated polygon is a convex partition of the unit rectangle,
         * inset toward its centroid to guarantee visible gutters.
         */
        const LEGACY_TEMPLATE_COUNT = TEMPLATES.length;
        function area(points) {
            let sum = 0;
            for (let i = 0; i < points.length; i++) {
                const a = points[i], b = points[(i + 1) % points.length];
                sum += a[0] * b[1] - b[0] * a[1];
            }
            return Math.abs(sum) / 2;
        }
        function bounds(poly) {
            const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
            return { minX: Math.min(...xs), maxX: Math.max(...xs),
                minY: Math.min(...ys), maxY: Math.max(...ys) };
        }
        function clipped(poly, signed, positive) {
            const out = [];
            for (let j = 0; j < poly.length; j++) {
                const a = poly[j], b = poly[(j + 1) % poly.length];
                const da = signed(a), db = signed(b);
                const insideA = positive ? da >= 0 : da <= 0;
                const insideB = positive ? db >= 0 : db <= 0;
                if (insideA)
                    out.push(a.slice());
                if (insideA !== insideB) {
                    const t = da / (da - db);
                    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
                }
            }
            return out;
        }
        function layoutPolygons(seed, horizontal) {
            let s = seed >>> 0;
            const rand = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
            const count = horizontal && seed === 101 ? 1 : 2 + (seed % 7);
            const parts = [[[0, 0], [1, 0], [1, 1], [0, 1]]];
            for (let step = 1; step < count; step++) {
                const order = parts.map((p, i) => ({ i, size: area(p) })).sort((a, b) => b.size - a.size);
                let didSplit = false;
                for (const candidate of order) {
                    const poly = parts[candidate.i], b = bounds(poly);
                    for (let attempt = 0; attempt < 18; attempt++) {
                        const splitX = attempt >= 12 ? (b.maxX - b.minX >= b.maxY - b.minY) :
                            (step % 3 === 0 ? !horizontal : horizontal);
                        const span = splitX ? b.maxX - b.minX : b.maxY - b.minY;
                        if (span < 0.09)
                            continue;
                        const cut = (splitX ? b.minX : b.minY) + span * (attempt >= 12 ? 0.5 : 0.32 + rand() * 0.36);
                        const slope = attempt >= 12 ? 0 : (rand() - 0.5) * span * 0.45;
                        const signed = (p) => splitX ?
                            p[0] - (cut + slope * (p[1] - 0.5)) :
                            p[1] - (cut + slope * (p[0] - 0.5));
                        const a = clipped(poly, signed, false), z = clipped(poly, signed, true);
                        if (a.length < 3 || z.length < 3)
                            continue;
                        if (Math.min(area(a), area(z)) < Math.max(0.018, candidate.size * 0.23))
                            continue;
                        parts.splice(candidate.i, 1, a, z);
                        didSplit = true;
                        break;
                    }
                    if (didSplit)
                        break;
                }
                if (!didSplit)
                    break;
            }
            return parts.map(poly => {
                const cx = poly.reduce((sum, p) => sum + p[0], 0) / poly.length;
                const cy = poly.reduce((sum, p) => sum + p[1], 0) / poly.length;
                return poly.map(p => [
                    Math.round((cx + (p[0] - cx) * 0.965) * 100000) / 100000,
                    Math.round((cy + (p[1] - cy) * 0.965) * 100000) / 100000
                ]);
            });
        }
        function generatedTemplate(index, orientation) {
            const landscape = orientation === 'horizontal';
            const width = landscape ? 850 : 600, height = landscape ? 600 : 850;
            const polygons = layoutPolygons(index + 1 + (landscape ? 100 : 0), landscape);
            const group = index % 3 === 0 ? 'diagonal' : index % 3 === 1 ? 'cinematic' : 'mosaic';
            return {
                id: 'vp1-' + (landscape ? 'h' : 'v') + '-' + String(index + 1).padStart(2, '0'),
                name: (landscape ? 'Horizontal ' : 'Vertical ') + String(index + 1).padStart(2, '0'),
                desc: 'Original ' + group + ' layout; ' + polygons.length + ' panels.',
                width, height, orientation, category: group,
                panels: polygons.map(poly => poly.map(p => [
                    Math.round(p[0] * width * 1000) / 1000,
                    Math.round(p[1] * height * 1000) / 1000
                ]))
            };
        }
        /* Fase 18: modelos autorais adicionais (24), desenhados à mão com calhas regulares.
         * bandLayout divide a página em faixas (linhas ou colunas); cada faixa é dividida em partes
         * por pesos; `slope` inclina as calhas entre faixas (estilo diagonal de ação). */
        function bandLayout(W, H, bands, slope = 0, dir = 'rows') {
            if (dir === 'cols')
                return bandLayout(H, W, bands, slope, 'rows').map(poly => poly.map(pt => [pt[1], pt[0]]));
            const M = 14, G = 12, n = bands.length, sum = bands.reduce((a, b) => a + b[0], 0);
            const inner = H - 2 * M - G * (n - 1);
            const centers = [];
            let y = M;
            bands.forEach((band, i) => {
                y += inner * band[0] / sum;
                if (i < n - 1) {
                    centers.push(y + G / 2);
                    y += G;
                }
            });
            const yAt = (i, x) => centers[i] + (i % 2 ? -slope : slope) * ((x - W / 2) / (W / 2));
            const out = [];
            bands.forEach((band, i) => {
                const weights = band[1], cn = weights.length, wsum = weights.reduce((a, b) => a + b, 0);
                const avail = W - 2 * M - G * (cn - 1);
                let x = M;
                for (const weight of weights) {
                    const xl = x, xr = x + avail * weight / wsum;
                    x = xr + G;
                    const top = (px) => i === 0 ? M : yAt(i - 1, px) + G / 2;
                    const bottom = (px) => i === n - 1 ? H - M : yAt(i, px) - G / 2;
                    out.push([[xl, top(xl)], [xr, top(xr)], [xr, bottom(xr)], [xl, bottom(xl)]]
                        .map(pt => [Math.round(pt[0] * 1000) / 1000, Math.round(pt[1] * 1000) / 1000]));
                }
            });
            return out;
        }
        function curatedTemplate(spec, landscape) {
            const width = landscape ? 850 : 600, height = landscape ? 600 : 850;
            const panels = bandLayout(width, height, spec.bands, spec.slope ?? 0, spec.dir ?? 'rows');
            return { id: spec.id, name: spec.name,
                desc: spec.desc,
                width, height, orientation: landscape ? 'horizontal' : 'vertical', category: spec.category, panels };
        }
        const CURATED_VERTICAL = [
            { id: 'vb-v-01', name: 'Four-koma', desc: 'Four equal strips, classic gag format.', category: 'classic',
                bands: [[1, [1]], [1, [1]], [1, [1]], [1, [1]]] },
            { id: 'vb-v-02', name: 'Z-flow', desc: 'Reading zigzag with varied widths.', category: 'classic',
                bands: [[1, [1, 2]], [1, [2, 1]], [1, [1, 1]]] },
            { id: 'vb-v-03', name: 'Staggered', desc: 'Alternating wide and narrow panels.', category: 'mosaic',
                bands: [[1, [3, 2]], [1, [2, 3]], [1.1, [1]]] },
            { id: 'vb-v-04', name: 'Hero + strip', desc: 'Large hero panel over three small ones.', category: 'cinematic',
                bands: [[3, [1]], [1, [1, 1, 1]]] },
            { id: 'vb-v-05', name: 'Tall center', desc: 'Tall middle column flanked by stacks.', category: 'mosaic',
                dir: 'cols', bands: [[1, [1, 1]], [1.4, [1]], [1, [1, 1, 1]]] },
            { id: 'vb-v-06', name: 'Letterbox', desc: 'Slim top and bottom, wide middle.', category: 'cinematic',
                bands: [[1, [1]], [3, [1]], [1, [1]]] },
            { id: 'vb-v-07', name: 'Slant 3', desc: 'Three bands with slanted gutters.', category: 'diagonal',
                slope: 55, bands: [[1, [1]], [1, [1]], [1, [1]]] },
            { id: 'vb-v-08', name: 'Slant mixed', desc: 'Slanted rows with a split in the middle.', category: 'diagonal',
                slope: 45, bands: [[1, [1]], [1, [1, 1]], [1, [1]]] },
            { id: 'vb-v-09', name: 'Action diagonal', desc: 'Dynamic slanted five-panel action page.', category: 'diagonal',
                slope: 50, bands: [[1, [1, 1]], [1, [1]], [1, [1, 1]]] },
            { id: 'vb-v-10', name: 'Window 3×3', desc: 'Nine equal panels.', category: 'mosaic',
                bands: [[1, [1, 1, 1]], [1, [1, 1, 1]], [1, [1, 1, 1]]] },
            { id: 'vb-v-11', name: 'Pillars', desc: 'Four tall vertical columns.', category: 'mosaic',
                bands: [[1, [1, 1, 1, 1]]] },
            { id: 'vb-v-12', name: 'Wide bottom', desc: 'Two panels over one wide closing panel.', category: 'cinematic',
                bands: [[1, [1, 1]], [1.3, [1]]] },
            { id: 'vb-v-13', name: 'Manga 7', desc: 'Seven-panel page with a wide centre.', category: 'classic',
                bands: [[1, [1, 1]], [0.8, [1]], [1, [2, 1]], [1, [1, 2]]] },
            { id: 'vb-v-14', name: 'Dynamic 6', desc: 'Slanted six-panel flow.', category: 'diagonal',
                slope: 40, bands: [[1, [1, 1]], [1, [1, 1, 1]], [1, [1]]] },
            { id: 'vb-v-15', name: 'Big right', desc: 'Large right panel, three on the left.', category: 'classic',
                dir: 'cols', bands: [[1, [1, 1, 1]], [2.2, [1]]] },
            { id: 'vb-v-16', name: 'Triptych + hero', desc: 'Three small panels over a tall hero.', category: 'cinematic',
                bands: [[1, [1, 1, 1]], [2, [1]]] }
        ];
        const CURATED_HORIZONTAL = [
            { id: 'vb-h-01', name: 'Banner 3', desc: 'Three wide banners.', category: 'cinematic',
                bands: [[1, [1]], [1, [1]], [1, [1]]] },
            { id: 'vb-h-02', name: 'Four columns', desc: 'Four tall columns across.', category: 'mosaic',
                bands: [[1, [1, 1, 1, 1]]] },
            { id: 'vb-h-03', name: 'Cinema hero + 3', desc: 'Wide hero over three panels.', category: 'cinematic',
                bands: [[2, [1]], [1, [1, 1, 1]]] },
            { id: 'vb-h-04', name: 'Wide 2×3', desc: 'Six equal panels.', category: 'mosaic',
                bands: [[1, [1, 1, 1]], [1, [1, 1, 1]]] },
            { id: 'vb-h-05', name: 'Slant 2 rows', desc: 'Two slanted rows.', category: 'diagonal',
                slope: 40, bands: [[1, [1, 2]], [1, [2, 1]]] },
            { id: 'vb-h-06', name: 'Big left wide', desc: 'Large left panel, stack on the right.', category: 'classic',
                dir: 'cols', bands: [[2, [1]], [1, [1, 1, 1]]] },
            { id: 'vb-h-07', name: 'Spread 5', desc: 'Two over three, spread style.', category: 'classic',
                bands: [[1, [1, 1]], [1, [1, 1, 1]]] },
            { id: 'vb-h-08', name: 'Mosaic 7', desc: 'Seven panels, mixed widths.', category: 'mosaic',
                bands: [[1, [1, 1, 1, 1]], [1, [2, 1, 1]]] }
        ];
        TEMPLATES.forEach(t => {
            t.width = PAGE_W;
            t.height = PAGE_H;
            t.orientation = 'vertical';
            t.category = 'classic';
        });
        for (const spec of CURATED_VERTICAL)
            TEMPLATES.push(curatedTemplate(spec, false));
        for (let i = 0; i < 31; i++)
            TEMPLATES.push(generatedTemplate(i, 'vertical'));
        for (const spec of CURATED_HORIZONTAL)
            TEMPLATES.push(curatedTemplate(spec, true));
        for (let i = 0; i < 28; i++)
            TEMPLATES.push(generatedTemplate(i, 'horizontal'));
        if (LEGACY_TEMPLATE_COUNT !== 10 || TEMPLATES.length !== 93 ||
            TEMPLATES.filter(t => t.orientation === 'vertical').length !== 57 ||
            TEMPLATES.filter(t => t.orientation === 'horizontal').length !== 36 ||
            new Set(TEMPLATES.map(t => t.id)).size !== 93 ||
            TEMPLATES.some(t => t.panels.length > 9))
            throw Error('VP1 layout catalog failed invariants');
        // Stable descriptors: callers cannot modify catalog geometry or historical IDs.
        for (const t of TEMPLATES) {
            for (const polygon of t.panels) {
                for (const point of polygon)
                    Object.freeze(point);
                Object.freeze(polygon);
            }
            Object.freeze(t.panels);
            Object.freeze(t);
        }
        Object.freeze(TEMPLATES);
        /* ---------------- Builders ---------------- */
        function dimensions(tpl, request) {
            const width = request?.width ?? tpl.width ?? PAGE_W;
            const height = request?.height ?? tpl.height ?? PAGE_H;
            if (!Number.isInteger(width) || !Number.isInteger(height) ||
                width < 128 || height < 128 || width > 4096 || height > 4096)
                throw Error('Page dimensions must be integer values from 128 to 4096');
            return { width, height };
        }
        function buildParsed(tpl, request) {
            const { width, height } = dimensions(tpl, request);
            const nativeW = tpl.width ?? PAGE_W, nativeH = tpl.height ?? PAGE_H;
            if (!Number.isFinite(nativeW) || !Number.isFinite(nativeH) ||
                nativeW <= 0 || nativeH <= 0 || !Array.isArray(tpl.panels) || !tpl.panels.length)
                throw Error('Invalid template geometry');
            const panels = tpl.panels.map((pts, i) => {
                if (pts.length < 3 || pts.some(pt => pt.length !== 2 || pt.some(n => !Number.isFinite(n))))
                    throw Error('Template has invalid coordinates');
                return { id: 'p' + (i + 1), points: pts.map(p => ({
                        x: Math.round(p[0] * width / nativeW * 1000) / 1000,
                        y: Math.round(p[1] * height / nativeH * 1000) / 1000
                    })) };
            });
            const paths = panels.map(panel => '<path d="M' + panel.points.map(p => p.x + ',' + p.y).join(' L') + ' Z"/>').join('');
            return {
                width, height, panels,
                viewBox: { minX: 0, minY: 0, width, height },
                svgSource: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
                    width + ' ' + height + '">' + paths + '</svg>'
            };
        }
        function thumbForTemplate(tpl) {
            return PS.thumbSvg(buildParsed(tpl), null, 100, 'layout');
        }
        function catalogSummary() {
            return { total: TEMPLATES.length, legacy: LEGACY_TEMPLATE_COUNT,
                vertical: TEMPLATES.filter(t => t.orientation === 'vertical').length,
                horizontal: TEMPLATES.filter(t => t.orientation === 'horizontal').length };
        }
        /* ---------------- Create ---------------- */
        /** Fase 10: páginas de template ocupam o próximo espaço livre de uma grade invisível:
         *  linhas horizontais da esquerda para a direita; ao chegar na borda do canvas (mundo) desce uma
         *  linha e recomeça. Só vale para páginas de mangá; boards, sub-boards e imagens ficam onde o
         *  usuário os coloca. Devolve o CENTRO da página (mesma convenção de mangaPage.addToBoard). */
        const FLOW_PAGE_WIDTH = 480, FLOW_GAP = 36, FLOW_MARGIN = 120;
        async function flowPosition(panelSetId) {
            const set = PS.get(panelSetId);
            if (!set)
                throw Error('Unknown panel set');
            const w = FLOW_PAGE_WIDTH, h = Math.round(w * set.height / set.width);
            const minX = cam.WORLD_MIN + FLOW_MARGIN, maxX = cam.WORLD_MAX - FLOW_MARGIN;
            const minY = cam.WORLD_MIN + FLOW_MARGIN, maxY = cam.WORLD_MAX - FLOW_MARGIN;
            const current = S.boards.find(b => b.id === S.currentBoardId);
            const items = current ? current.instances : [];
            const half = FLOW_GAP / 2;
            let y = minY;
            for (let row = 0; row < 400 && y + h <= maxY; row++) {
                let x = minX, rowBottom = y + h;
                while (x + w <= maxX) {
                    const hit = items.find(i => x < i.x + i.width + half && x + w > i.x - half && y < i.y + i.height + half && y + h > i.y - half);
                    if (!hit)
                        return { x: x + w / 2, y: y + h / 2 };
                    rowBottom = Math.max(rowBottom, hit.y + hit.height);
                    x = Math.max(x + 1, hit.x + hit.width + FLOW_GAP);
                }
                y = rowBottom + FLOW_GAP;
            }
            return { x: cam.data.x, y: cam.data.y };
        }
        /** Mostra a página recém-criada (a fila pode estar longe da vista atual). */
        function focusPage(inst) {
            cam.fitBounds(cam.bounds([inst]), 140);
        }
        async function createFromTemplate(tpl, options) {
            // IDs are stable; reject edited/foreign descriptors before creating persistent state.
            const original = TEMPLATES.find(t => t.id === tpl?.id);
            if (!original)
                throw Error('Unknown built-in page template');
            const parsed = buildParsed(original, options);
            return kernel.call('history', 'transaction', 'template.create', async function () {
                const ps = PS.create(parsed, original.name);
                const position = await flowPosition(ps.id);
                const inst = await MP.addToBoard(ps.id, position.x, position.y);
                if (!inst)
                    throw Error('Could not create manga page');
                focusPage(inst);
                kernel.emit('toast', { message: 'Page "' + original.name + '" created.', kind: 'ok' });
                return { panelSet: ps, instance: inst };
            });
        }
        /* ---------------- Modal picker ---------------- */
        function promptPick() {
            return new Promise(function (resolve) {
                const modal = document.createElement('div');
                modal.className = 'modal';
                const backdrop = document.createElement('div');
                backdrop.className = 'modal-backdrop';
                modal.appendChild(backdrop);
                const dlg = document.createElement('div');
                dlg.className = 'dialog tpl-dialog';
                dlg.setAttribute('role', 'dialog');
                const h = document.createElement('h3');
                h.textContent = 'New manga page from template';
                dlg.appendChild(h);
                const p = document.createElement('p');
                p.textContent = 'Pick a layout. It is instantiated as a PanelSet ' +
                    'and placed at the center of the canvas.';
                dlg.appendChild(p);
                const filters = document.createElement('div');
                filters.className = 'tpl-filter-controls';
                const orientation = document.createElement('select');
                orientation.setAttribute('aria-label', 'Layout orientation');
                for (const [value, label] of [['all', 'All ' + TEMPLATES.length], ['vertical', 'Vertical ' + TEMPLATES.filter(t => t.orientation === 'vertical').length], ['horizontal', 'Horizontal ' + TEMPLATES.filter(t => t.orientation === 'horizontal').length]]) {
                    const option = document.createElement('option');
                    option.value = value;
                    option.textContent = label;
                    orientation.appendChild(option);
                }
                const search = document.createElement('input');
                search.type = 'search';
                search.placeholder = 'Search layouts';
                search.setAttribute('aria-label', 'Search page layouts');
                filters.appendChild(orientation);
                filters.appendChild(search);
                dlg.appendChild(filters);
                const grid = document.createElement('div');
                grid.className = 'tpl-grid';
                function updateChoices() {
                    grid.replaceChildren();
                    const q = search.value.trim().toLowerCase();
                    TEMPLATES.filter(t => (orientation.value === 'all' || t.orientation === orientation.value) &&
                        (!q || (t.name + ' ' + t.desc).toLowerCase().includes(q))).forEach(function (tpl) {
                        const btn = document.createElement('button');
                        btn.type = 'button';
                        btn.className = 'tpl-item';
                        const thumb = document.createElement('div');
                        thumb.className = 'tpl-thumb';
                        thumb.innerHTML = thumbForTemplate(tpl);
                        btn.appendChild(thumb);
                        const meta = document.createElement('div');
                        meta.className = 'tpl-meta';
                        const nameEl = document.createElement('div');
                        nameEl.className = 'tpl-name';
                        nameEl.textContent = tpl.name;
                        meta.appendChild(nameEl);
                        const descEl = document.createElement('div');
                        descEl.className = 'tpl-desc';
                        descEl.textContent = tpl.desc + ' · ' + tpl.panels.length +
                            ' panel' + (tpl.panels.length === 1 ? '' : 's');
                        meta.appendChild(descEl);
                        btn.appendChild(meta);
                        btn.addEventListener('click', function () {
                            modal.remove();
                            resolve(tpl);
                        });
                        grid.appendChild(btn);
                    });
                    if (!grid.childElementCount) {
                        const empty = document.createElement('p');
                        empty.textContent = 'No layouts found.';
                        grid.appendChild(empty);
                    }
                }
                orientation.addEventListener('change', updateChoices);
                search.addEventListener('input', updateChoices);
                updateChoices();
                dlg.appendChild(grid);
                const actions = document.createElement('div');
                actions.className = 'dialog-actions';
                const cancelBtn = document.createElement('button');
                cancelBtn.className = 'btn';
                cancelBtn.type = 'button';
                cancelBtn.textContent = 'Cancel';
                cancelBtn.addEventListener('click', function () {
                    modal.remove();
                    resolve(null);
                });
                actions.appendChild(cancelBtn);
                dlg.appendChild(actions);
                backdrop.addEventListener('click', function () {
                    modal.remove();
                    resolve(null);
                });
                modal.appendChild(dlg);
                document.body.appendChild(modal);
            });
        }
        /* ---------------- Flow from UI ---------------- */
        async function pickAndCreate() {
            const tpl = await promptPick();
            if (!tpl)
                return null;
            return await createFromTemplate(tpl);
        }
        kernel.provide('panelTemplates', {
            list: function () { return TEMPLATES.slice(); },
            createFromTemplate: createFromTemplate,
            flowPosition: flowPosition,
            focusPage: focusPage,
            promptPick: promptPick,
            pickAndCreate: pickAndCreate
        });
    }
});
