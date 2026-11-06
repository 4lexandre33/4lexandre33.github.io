"use strict";
/* Modo Webtoon — núcleo puro (sem DOM): configurações, modelo de blocos empilhados, geometria dos painéis, plano de fatiamento
 * e checagens de exportação. A tira é derivada deste modelo; nada aqui toca o documento. Valores de referência (800 px de largura,
 * segmentos de até 1280 px) vêm do WEBTOON Canvas e são configuráveis, pois as regras da plataforma podem mudar. */
definePlugin({
    id: 'webtoon-core',
    version: '1.0.0',
    needs: [],
    provides: ['webtoonCore'],
    uses: [],
    accepts: {},
    contractVersions: { webtoonCore: '1.0.0' },
    setup: function (kernel) {
        const LIMITS = Object.freeze({
            minWidth: 320, maxWidth: 1600, defaultWidth: 800, defaultOutputWidth: 800, maxHeight: 16000,
            minSegment: 400, maxSegment: 1280, maxBlocks: 80, minBlockHeight: 40, maxBlockHeight: 6000,
            maxGap: 3000, maxSlant: 400, maxExportPixels: 32000000, maxExportSide: 16384
        });
        /** Os limites são lidos como `limits()` (contrato de capability) ou como propriedades (`limits.maxBlocks`). */
        const limits = Object.assign(() => LIMITS, LIMITS);
        function fail(code, message, field) {
            const e = new Error(message);
            e.code = code;
            if (field)
                e.field = field;
            throw e;
        }
        const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
        const round2 = (n) => Math.round(n * 100) / 100;
        function num(v, field, min, max, int = true) {
            if (typeof v !== 'number' || !Number.isFinite(v))
                fail('INVALID_ARGUMENT', field + ' deve ser um número', field);
            if (int && !Number.isInteger(v))
                fail('INVALID_ARGUMENT', field + ' deve ser inteiro', field);
            if (v < min || v > max)
                fail('INVALID_ARGUMENT', field + ' deve estar entre ' + min + ' e ' + max, field);
            return v;
        }
        const KNOWN = new Set(['widthPx', 'outputWidthPx', 'maxSegmentPx', 'background', 'sideMargin', 'edgeMargin', 'exportScale']);
        function defaults() {
            return { widthPx: LIMITS.defaultWidth, outputWidthPx: LIMITS.defaultOutputWidth, maxSegmentPx: LIMITS.maxSegment, background: '#ffffff', sideMargin: 0, edgeMargin: 0, exportScale: 1 };
        }
        function normalizeSettings(raw, base) {
            const out = { ...(base || defaults()) };
            if (raw === undefined || raw === null)
                return out;
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'As configurações devem ser um objeto');
            for (const k of Object.keys(raw))
                if (!KNOWN.has(k))
                    fail('INVALID_ARGUMENT', 'Campo desconhecido: ' + k, k);
            if (raw['widthPx'] !== undefined)
                out.widthPx = num(raw['widthPx'], 'widthPx', LIMITS.minWidth, LIMITS.maxWidth);
            if (raw['outputWidthPx'] !== undefined)
                out.outputWidthPx = num(raw['outputWidthPx'], 'outputWidthPx', LIMITS.minWidth, LIMITS.maxWidth);
            if (raw['maxSegmentPx'] !== undefined)
                out.maxSegmentPx = num(raw['maxSegmentPx'], 'maxSegmentPx', LIMITS.minSegment, LIMITS.maxSegment);
            if (raw['background'] !== undefined) {
                if (typeof raw['background'] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw['background']))
                    fail('INVALID_ARGUMENT', 'background deve ser uma cor #rrggbb', 'background');
                out.background = raw['background'].toLowerCase();
            }
            if (raw['sideMargin'] !== undefined)
                out.sideMargin = num(raw['sideMargin'], 'sideMargin', 0, Math.floor(out.widthPx / 4));
            if (raw['edgeMargin'] !== undefined)
                out.edgeMargin = num(raw['edgeMargin'], 'edgeMargin', 0, 1000);
            if (raw['exportScale'] !== undefined) {
                if (raw['exportScale'] !== 1 && raw['exportScale'] !== 2)
                    fail('INVALID_ARGUMENT', 'exportScale deve ser 1 ou 2', 'exportScale');
                out.exportScale = raw['exportScale'];
            }
            if (out.sideMargin > Math.floor(out.widthPx / 4))
                fail('INVALID_ARGUMENT', 'sideMargin é grande demais para a largura', 'sideMargin');
            return out;
        }
        const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
        function assertModel(raw) {
            if (!isObj(raw))
                fail('INVALID_ARGUMENT', 'O modelo da tira deve ser um objeto');
            if (raw['version'] !== 1)
                fail('INVALID_ARGUMENT', 'Versão do modelo da tira não suportada', 'version');
            const settings = normalizeSettings(raw['settings']);
            if (!Array.isArray(raw['blocks']))
                fail('INVALID_ARGUMENT', 'blocks deve ser uma lista', 'blocks');
            if (raw['blocks'].length > LIMITS.maxBlocks)
                fail('LIMIT_EXCEEDED', 'No máximo ' + LIMITS.maxBlocks + ' blocos', 'blocks');
            const ids = new Set(), panelIds = new Set();
            const blocks = raw['blocks'].map((b, i) => {
                if (!isObj(b))
                    fail('INVALID_ARGUMENT', 'Bloco inválido', 'blocks[' + i + ']');
                const id = b['id'];
                if (typeof id !== 'string' || !ID_RE.test(id) || ids.has(id))
                    fail('INVALID_ARGUMENT', 'id de bloco inválido ou repetido', 'blocks[' + i + '].id');
                ids.add(id);
                const height = num(b['height'], 'height', LIMITS.minBlockHeight, LIMITS.maxBlockHeight, false);
                const gapAfter = num(b['gapAfter'], 'gapAfter', 0, LIMITS.maxGap, false);
                const slant = b['slant'] === undefined ? 0 : num(b['slant'], 'slant', -LIMITS.maxSlant, LIMITS.maxSlant, false);
                if (!Array.isArray(b['panels']) || b['panels'].length < 1 || b['panels'].length > 12)
                    fail('INVALID_ARGUMENT', 'Cada bloco tem de 1 a 12 painéis', 'blocks[' + i + '].panels');
                const panels = b['panels'].map((p, j) => {
                    if (!isObj(p) || typeof p['id'] !== 'string' || !ID_RE.test(p['id']) || panelIds.has(p['id']))
                        fail('INVALID_ARGUMENT', 'id de painel inválido ou repetido', 'blocks[' + i + '].panels[' + j + ']');
                    panelIds.add(p['id']);
                    const out = { id: p['id'] };
                    if (p['shape'] !== undefined) {
                        const s = p['shape'];
                        if (!Array.isArray(s) || s.length < 3 || s.length > 64)
                            fail('INVALID_ARGUMENT', 'shape deve ter de 3 a 64 pontos', 'blocks[' + i + '].panels[' + j + '].shape');
                        out.shape = s.map((pt) => {
                            if (!Array.isArray(pt) || pt.length !== 2 || !pt.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 40000))
                                fail('INVALID_ARGUMENT', 'Ponto de shape inválido', 'blocks[' + i + '].panels[' + j + '].shape');
                            return [pt[0], pt[1]];
                        });
                    }
                    return out;
                });
                const simple = panels.length === 1 && !panels[0].shape;
                if (slant !== 0 && !simple)
                    fail('INVALID_ARGUMENT', 'Só blocos simples aceitam inclinação', 'blocks[' + i + '].slant');
                if (slant !== 0 && gapAfter <= Math.abs(slant))
                    fail('INVALID_ARGUMENT', 'O espaço depois do bloco deve ser maior que a inclinação', 'blocks[' + i + '].gapAfter');
                return { id, height, gapAfter, slant, panels };
            });
            const nextPanel = num(raw['nextPanel'], 'nextPanel', 1, 1000000), nextBlock = num(raw['nextBlock'], 'nextBlock', 1, 1000000);
            return { version: 1, settings, blocks, nextPanel, nextBlock };
        }
        /* ------------------------------- modelos -------------------------------- */
        const TEMPLATES = Object.freeze([
            { id: 'blank-3', name: 'Três cenas', desc: 'Três quadros verticais com respiro.', blocks: [{ height: 900, gapAfter: 80 }, { height: 900, gapAfter: 80 }, { height: 900, gapAfter: 80 }] },
            { id: 'dialogue-6', name: 'Diálogo', desc: 'Seis quadros baixos e próximos, bons para conversa.', blocks: [0, 1, 2, 3, 4, 5].map(() => ({ height: 420, gapAfter: 40 })) },
            { id: 'cinematic', name: 'Cinematográfico', desc: 'Quadros largos separados por espaço vazio.', blocks: [{ height: 520, gapAfter: 260 }, { height: 520, gapAfter: 260 }, { height: 520, gapAfter: 260 }, { height: 520, gapAfter: 260 }] },
            { id: 'diagonal-4', name: 'Cortes diagonais', desc: 'Quatro quadros com cortes inclinados.', blocks: [{ height: 700, gapAfter: 220, slant: 120 }, { height: 700, gapAfter: 220, slant: -120 }, { height: 700, gapAfter: 220, slant: 120 }, { height: 700, gapAfter: 100 }] },
            { id: 'splash-long', name: 'Quadro longo', desc: 'Um único quadro alto para revelações.', blocks: [{ height: 2400, gapAfter: 0 }] }
        ]);
        const freezeTemplates = TEMPLATES.map(t => Object.freeze({ id: t.id, name: t.name, desc: t.desc, blocks: Object.freeze(t.blocks.map(b => Object.freeze({ ...b }))) }));
        function templates() { return freezeTemplates; }
        function emptyModel(settings) { return { version: 1, settings, blocks: [], nextPanel: 1, nextBlock: 1 }; }
        function newBlock(model, spec) {
            const height = num(spec.height ?? 900, 'height', LIMITS.minBlockHeight, LIMITS.maxBlockHeight, false);
            const gapAfter = num(spec.gapAfter ?? 80, 'gapAfter', 0, LIMITS.maxGap, false);
            const slant = num(spec.slant ?? 0, 'slant', -LIMITS.maxSlant, LIMITS.maxSlant, false);
            if (slant !== 0 && gapAfter <= Math.abs(slant))
                fail('INVALID_ARGUMENT', 'O espaço depois do bloco deve ser maior que a inclinação', 'gapAfter');
            const block = { id: 'blk' + model.nextBlock, height: round2(height), gapAfter: round2(gapAfter), slant: round2(slant), panels: [{ id: 'w' + model.nextPanel }] };
            model.nextBlock++;
            model.nextPanel++;
            return block;
        }
        function modelFromTemplate(id, rawSettings) {
            const t = TEMPLATES.find(x => x.id === id);
            if (!t)
                fail('NOT_FOUND', 'Modelo de tira desconhecido: ' + id, 'template');
            const settings = normalizeSettings(rawSettings);
            const k = settings.widthPx / LIMITS.defaultWidth, model = emptyModel(settings);
            for (const b of t.blocks) {
                const sl = ('slant' in b ? b.slant : 0);
                model.blocks.push(newBlock(model, { height: Math.round(b.height * k), gapAfter: Math.round(b.gapAfter * k), slant: Math.round(sl * k) }));
            }
            return assertModel(model);
        }
        /* ------------------------------- geometria ------------------------------- */
        function layout(model) {
            const m = assertModel(model), W = m.settings.widthPx, S = m.settings;
            const placed = [], panels = [];
            let y = m.blocks.length ? S.edgeMargin : 0, prevSlant = 0;
            m.blocks.forEach((b, i) => {
                const x0 = S.sideMargin, x1 = W - S.sideMargin;
                placed.push({ id: b.id, y: round2(y), height: b.height, gapAfter: b.gapAfter, slant: b.slant, panelIds: b.panels.map(p => p.id) });
                for (const p of b.panels) {
                    let pts;
                    if (p.shape)
                        pts = p.shape.map(([px, py]) => ({ x: round2(px), y: round2(y + py) }));
                    else {
                        const top = y, bot = y + b.height;
                        pts = [{ x: x0, y: round2(top - prevSlant / 2) }, { x: x1, y: round2(top + prevSlant / 2) }, { x: x1, y: round2(bot + b.slant / 2) }, { x: x0, y: round2(bot - b.slant / 2) }];
                    }
                    panels.push({ id: p.id, blockId: b.id, points: pts });
                }
                prevSlant = b.slant;
                y += b.height + (i === m.blocks.length - 1 ? 0 : b.gapAfter);
            });
            const H = m.blocks.length ? Math.ceil(y + S.edgeMargin) : 0;
            if (H > LIMITS.maxHeight)
                fail('STRIP_TOO_TALL', 'A tira ficaria com ' + H + ' px; o máximo é ' + LIMITS.maxHeight + '. Divida em mais de uma tira.');
            const total = Math.max(H, 1);
            for (const p of panels)
                for (const pt of p.points)
                    if (pt.y < -0.001 || pt.y > total + 0.001 || pt.x < -0.001 || pt.x > W + 0.001)
                        fail('INVALID_ARGUMENT', 'O painel ' + p.id + ' sai dos limites da tira', 'shape');
            const paths = panels.map(p => '<path id="' + p.id + '" d="M' + p.points.map(q => q.x + ',' + q.y).join(' L') + ' Z"/>').join('');
            const svgSource = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + total + '">' + paths + '</svg>';
            return { width: W, height: total, blocks: placed, panels, svgSource };
        }
        /** Índice do bloco "dono" da coordenada y: o bloco que a contém ou, num vão, o mais próximo. */
        function ownerBlock(l, y) {
            if (!l.blocks.length)
                return -1;
            let best = 0, bestD = Infinity;
            l.blocks.forEach((b, i) => {
                const d = y < b.y ? b.y - y : y > b.y + b.height ? y - (b.y + b.height) : 0;
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            });
            return best;
        }
        /* ------------------------------ fatiamento ------------------------------ */
        function outputScale(s) { return (s.outputWidthPx / s.widthPx) * s.exportScale; }
        function planSlices(l, s, objects = []) {
            const issues = [], segments = [];
            const H = l.height, max = Math.max(1, Math.floor(s.maxSegmentPx * s.widthPx / s.outputWidthPx));
            const gaps = [];
            l.blocks.forEach((b, i) => {
                const nx = l.blocks[i + 1];
                if (!nx)
                    return;
                const lo = b.y + b.height + Math.abs(b.slant) / 2, hi = nx.y - Math.abs(b.slant) / 2;
                if (hi - lo >= 1)
                    gaps.push([lo, hi]);
            });
            const spans = objects.filter(o => Number.isFinite(o.y0) && Number.isFinite(o.y1) && o.y1 > o.y0);
            const inside = (y) => spans.some(o => y > o.y0 + 0.001 && y < o.y1 - 0.001);
            function freeIntervals(base) {
                let cur = base.slice();
                for (const o of spans) {
                    const next = [];
                    for (const [a, b] of cur) {
                        if (o.y1 <= a || o.y0 >= b) {
                            next.push([a, b]);
                            continue;
                        }
                        if (o.y0 > a)
                            next.push([a, o.y0]);
                        if (o.y1 < b)
                            next.push([o.y1, b]);
                    }
                    cur = next;
                }
                return cur.filter(([a, b]) => b - a >= 1);
            }
            const free = freeIntervals(gaps);
            let y0 = 0, index = 0;
            while (H - y0 > max) {
                const limit = y0 + max;
                let cut = -1, kind = 'gap';
                for (const [a, b] of free) {
                    if (b <= y0 + 1 || a > limit)
                        continue;
                    const lo = Math.max(a, y0 + 1), hi = Math.min(b, limit);
                    const c = b <= limit ? Math.round((Math.max(a, y0 + 1) + b) / 2) : Math.floor(hi);
                    if (c > y0 && c >= lo - 0.5 && c <= hi + 0.5 && c > cut)
                        cut = c;
                }
                if (cut < 0) {
                    kind = 'panel';
                    for (let c = Math.floor(limit); c > y0 + Math.floor(max / 2); c--)
                        if (!inside(c)) {
                            cut = c;
                            break;
                        }
                    if (cut < 0) {
                        kind = 'object';
                        cut = Math.floor(limit);
                        issues.push({ code: 'CUT_THROUGH_OBJECT', severity: 'warning', message: 'O corte em ' + cut + ' atravessa um balão, texto ou efeito; não há posição livre na janela do segmento.', segment: index + 1 });
                    }
                    else
                        issues.push({ code: 'CUT_THROUGH_PANEL', severity: 'warning', message: 'O corte em ' + cut + ' atravessa um quadro: não há vão entre quadros dentro de ' + s.maxSegmentPx + ' px.', segment: index + 1 });
                }
                segments.push({ index: index + 1, y0, y1: cut, height: cut - y0, cut: kind });
                y0 = cut;
                index++;
            }
            if (H > 0)
                segments.push({ index: index + 1, y0, y1: H, height: H - y0, cut: 'end' });
            return { segments, issues };
        }
        function preflight(l, s, plan) {
            const out = [];
            if (!l.blocks.length)
                out.push({ code: 'EMPTY_STRIP', severity: 'error', message: 'A tira não tem quadros.' });
            const k = outputScale(s), outH = Math.round(l.height * k), outW = Math.round(l.width * k);
            if (outH > LIMITS.maxExportSide || outW * outH > LIMITS.maxExportPixels)
                out.push({ code: 'EXPORT_TOO_TALL', severity: 'error', message: 'A tira exportaria ' + outW + '×' + outH + ' px, acima do limite seguro do navegador (' + LIMITS.maxExportSide + ' px de lado e ' + (LIMITS.maxExportPixels / 1e6) + ' MP). Reduza a escala ou divida a tira.' });
            if (s.outputWidthPx !== 800 && s.outputWidthPx !== 1600)
                out.push({ code: 'WIDTH_NON_STANDARD', severity: 'warning', message: 'A largura de saída é ' + s.outputWidthPx + ' px; o WEBTOON Canvas recomenda 800 px (1600 px para impressão).' });
            if (k > 1.0001 && s.exportScale === 1)
                out.push({ code: 'SOURCE_UPSCALED', severity: 'warning', message: 'A largura de trabalho (' + s.widthPx + ' px) é menor que a de saída; as imagens serão ampliadas e podem perder nitidez.' });
            if (plan.segments.length > 100)
                out.push({ code: 'MANY_SEGMENTS', severity: 'warning', message: 'A tira gera ' + plan.segments.length + ' segmentos.' });
            for (const seg of plan.segments)
                if (Math.round(seg.height * outputScale({ ...s, exportScale: 1 })) > s.maxSegmentPx)
                    out.push({ code: 'SEGMENT_TOO_TALL', severity: 'error', message: 'O segmento ' + seg.index + ' passa de ' + s.maxSegmentPx + ' px.', segment: seg.index });
            return [...out, ...plan.issues];
        }
        kernel.provide('webtoonCore', { limits, fail, normalizeSettings, assertModel, templates, modelFromTemplate, newBlock, layout, ownerBlock, planSlices, preflight, outputScale });
    }
});
