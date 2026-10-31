"use strict";
/* Scene Blocking — motor procedural determinístico: registro de temáticas, formações, câmera, enquadramento, foco, validação e lote.
 * Ordem causal: quantidade → formação → orientações → alvo de foco → câmera → enquadramento. A câmera nunca altera os manequins. */
definePlugin({
    id: 'scene-blocking-engine',
    version: '1.0.0',
    needs: ['sceneBlockingCore'],
    provides: ['sceneBlockingEngine'],
    uses: [],
    accepts: { sceneBlockingCore: '^1.0.0' },
    contractVersions: { sceneBlockingEngine: '1.1.0' },
    setup: async function (kernel) {
        const core = await kernel.require('sceneBlockingCore');
        const { CONST: K, PALETTE, ELEVATION, RETICLE_COLOR, hash, random, round2, norm360, dir, angleTo, angleDiff, dist, inConvex, fail } = core;
        const ENGINE_VERSION = '1.0.0';
        const CELL = K['CELL'], EDGE = K['EDGE'], SEP = K['MIN_SEPARATION'], GAP = K['CAMERA_GAP'];
        const CHAR_LO = K['MANNEQUIN_R'] + EDGE, CHAR_HI = CELL - CHAR_LO;
        const CAM_LO = K['CAMERA_R'] + EDGE + 6, CAM_HI = CELL - CAM_LO;
        const SPREAD_CAP = 110;
        const LEVEL_RANGE = { near: [55, 105], medium: [125, 185], far: [205, 285] };
        const TIGHT = { margin: 12, minAngle: 5, maxAngle: 45 }, WIDE = { margin: 36, minAngle: 30, maxAngle: 70 };
        /* se o enquadramento amplo não cabe com a margem padrão, tenta margens menores antes de desistir */
        const WIDE_MARGINS = [36, 26, 16];
        const LENS = { bodyWidth: 36, bodyHeight: 24, lensWidth: 14, lensLength: 8, lensOffset: K['LENS_OFFSET'] };
        const S = 66;
        const rad = (d) => d * Math.PI / 180;
        const deg = (r) => r * 180 / Math.PI;
        const pt = (x, y) => ({ x: round2(x), y: round2(y) });
        const norm = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
        const polar = (r, a) => { const d = dir(a); return { x: d.x * r, y: d.y * r }; };
        const jit = (c, base = 5, spread = 25) => c.orientation.range(-1, 1) * (base + c.variation * spread);
        const centroid = (ps) => ({ x: ps.reduce((s, p) => s + p.x, 0) / ps.length, y: ps.reduce((s, p) => s + p.y, 0) / ps.length });
        function poisson(n, radius, c) {
            const out = [];
            let R = radius, tries = 0;
            while (out.length < n) {
                const a = c.position.range(0, Math.PI * 2), r = R * Math.sqrt(c.position.next());
                const p = { x: Math.cos(a) * r, y: Math.sin(a) * r };
                if (out.every(q => Math.hypot(q.x - p.x, q.y - p.y) >= S))
                    out.push(p);
                else if (++tries > 40) {
                    tries = 0;
                    R *= 1.12;
                }
            }
            return out;
        }
        function faceCentroid(ps, c, towardOther = 0.25) {
            const m = centroid(ps);
            return ps.map((p, i) => {
                let target = m;
                if (ps.length > 1 && c.orientation.chance(towardOther * c.variation)) {
                    const o = ps[(i + 1 + c.orientation.int(0, ps.length - 2)) % ps.length];
                    target = o;
                }
                return { x: p.x, y: p.y, facing: angleTo(p, target) + jit(c) };
            });
        }
        function arc(m, span, full, minR, c) {
            const steps = full ? m : Math.max(m - 1, 1);
            const r0 = full ? S * m / (2 * Math.PI) * 1.05 : S * Math.max(m - 1, 1) / rad(span) * 1.1;
            const r = Math.max(r0, minR) * (1 + c.position.range(0, 0.3) * c.variation);
            const start = c.formation.range(0, 360);
            return Array.from({ length: m }, (_, i) => {
                const a = m === 1 ? start : full ? start + i * 360 / steps : start + i * span / steps;
                return { ...polar(r, a), angle: a };
            });
        }
        function twoSides(n, c, gapLo, gapHi, loose) {
            const a = Math.ceil(n / 2), b = n - a;
            const gap = c.formation.range(gapLo, gapHi) * (0.85 + 0.3 * c.variation);
            const side = (count, sign) => Array.from({ length: count }, (_, k) => {
                const row = Math.floor(k / 3), inRow = Math.min(3, count - row * 3), col = k - row * 3;
                const lj = loose ? c.position.range(-1, 1) * c.variation * 18 : 0, dj = loose ? c.position.range(-1, 1) * c.variation * 10 : 0;
                return { x: (col - (inRow - 1) / 2) * S * 1.1 + lj, y: sign * (gap / 2 + row * S * 0.95) + dj };
            });
            const A = side(a, -1), B = side(b, 1), ca = centroid(A), cb = centroid(B);
            const pts = [
                ...A.map(p => ({ x: p.x, y: p.y, facing: angleTo(p, cb) + jit(c, 2, loose ? 22 : 6) })),
                ...B.map(p => ({ x: p.x, y: p.y, facing: angleTo(p, ca) + jit(c, 2, loose ? 22 : 6) }))
            ];
            return { points: pts, variant: a + 'x' + b };
        }
        const RULES = new Map();
        const ALIASES = new Map();
        function registerTheme(rule) {
            if (!rule || typeof rule.layout !== 'function' || !/^[a-z0-9-]{1,40}$/.test(rule.id))
                fail('INVALID_ARGUMENT', 'Regra de temática inválida');
            if (!Number.isInteger(rule.minCount) || rule.minCount < 1 || rule.minCount > 8)
                fail('INVALID_ARGUMENT', 'minCount deve ser de 1 a 8', 'minCount');
            RULES.set(rule.id, rule);
            for (const al of [rule.label, ...rule.aliases])
                ALIASES.set(norm(al), rule.id);
        }
        registerTheme({ id: 'meeting', label: 'Reunião', aliases: ['reuniao'], minCount: 2, layout(n, c) {
                if (n === 1)
                    return { points: [{ x: 0, y: 0, facing: c.orientation.range(0, 360) }], variant: 'single' };
                const variant = c.formation.pick(n < 3 ? ['cluster'] : ['circle', 'semicircle', 'cluster']);
                if (variant === 'cluster')
                    return { points: faceCentroid(poisson(n, S * Math.sqrt(n) * 0.9, c), c, 0.35), variant };
                const ring = arc(n, 180, variant === 'circle', 56, c);
                return { points: ring.map(p => ({ x: p.x, y: p.y, facing: angleTo(p, { x: 0, y: 0 }) + jit(c) })), variant };
            } });
        registerTheme({ id: 'confrontation', label: 'Ataque / Confronto', aliases: ['ataque', 'confronto', 'ataque confronto'], minCount: 2,
            layout: (n, c) => twoSides(n, c, 120, 260, true) });
        registerTheme({ id: 'siege', label: 'Cerco', aliases: ['cerco'], minCount: 2, layout(n, c) {
                const m = n - 1, variant = c.formation.pick(['circle', 'arc-220', 'arc-140']);
                const span = variant === 'circle' ? 360 : variant === 'arc-220' ? 220 : 140;
                const ring = arc(m, span, variant === 'circle', 85, c);
                const mid = ring.reduce((s, p) => s + p.angle, 0) / ring.length;
                const others = ring.map(p => ({ x: p.x, y: p.y, facing: angleTo(p, { x: 0, y: 0 }) + jit(c, 2, 10) }));
                const target = { x: 0, y: 0, facing: variant === 'circle' ? c.orientation.range(0, 360) : norm360(mid) };
                return { points: [target, ...others], variant };
            } });
        registerTheme({ id: 'negotiation', label: 'Negociação', aliases: ['negociacao'], minCount: 2,
            layout: (n, c) => twoSides(n, c, 90, 140, false) });
        registerTheme({ id: 'debate', label: 'Debate', aliases: ['debate'], minCount: 2, layout(n, c) {
                const m = n - 1, span = c.formation.pick([180, 150]);
                const ring = arc(m, span, false, 90, c);
                const mid = ring.reduce((s, p) => s + p.angle, 0) / ring.length;
                const others = ring.map(p => ({ x: p.x, y: p.y, facing: angleTo(p, { x: 0, y: 0 }) + jit(c, 2, 12) }));
                return { points: [{ x: 0, y: 0, facing: norm360(mid) + jit(c, 0, 10) }, ...others], variant: 'semicircle-' + span };
            } });
        registerTheme({ id: 'free', label: 'Formação livre', aliases: ['formacao livre', 'livre'], minCount: 1, layout(n, c) {
                const ps = poisson(n, S * Math.sqrt(n) * 0.8 + 20, c);
                return { points: ps.map((p, i) => ({ x: p.x, y: p.y, facing: n > 1 && c.orientation.chance(0.3) ? angleTo(p, ps[(i + 1) % n]) : c.orientation.range(0, 360) })), variant: 'poisson' };
            } });
        const themes = () => [...RULES.values()].map(r => ({ id: r.id, label: r.label, aliases: r.aliases.slice(), minCount: r.minCount }));
        function resolveTheme(text, formation) {
            if (formation !== undefined) {
                if (!RULES.has(formation))
                    fail('UNKNOWN_FORMATION', 'Formação não registrada: ' + formation, 'formation');
                return formation;
            }
            const id = ALIASES.get(norm(text));
            if (!id)
                return fail('THEME_UNMAPPED', 'A temática "' + text + '" não tem regra registrada. Escolha uma formação: ' + [...RULES.keys()].join(', '), 'theme');
            return id;
        }
        /* ---------------------------- manequins ---------------------------- */
        function countFor(cfg, rule, rc) {
            const notes = [];
            let req;
            if (cfg.mannequinCountMode === 'fixed')
                req = cfg.minMannequins;
            else if (cfg.mannequinCountMode === 'range')
                req = rc.int(cfg.minMannequins, cfg.maxMannequins);
            else {
                const lo = Math.max(cfg.minMannequins, rule.minCount), hi = Math.max(cfg.maxMannequins, lo);
                req = Math.round(lo + (hi - lo) * (rc.next() + rc.next()) / 2);
            }
            let eff = Math.min(8, Math.max(1, req));
            if (eff < rule.minCount) {
                if (cfg.maxMannequins >= rule.minCount) {
                    eff = rule.minCount;
                    notes.push('Quantidade ajustada de ' + req + ' para ' + eff + ' (mínimo da temática)');
                }
                else
                    notes.push('A temática pede ao menos ' + rule.minCount + ' manequins; com o máximo ' + cfg.maxMannequins + ' a formação foi simplificada');
            }
            return { requested: req, effective: eff, notes };
        }
        function genCharacters(cfg, rule, n, sheet, cell, salt) {
            const seed = (s) => random(hash(cfg.masterSeed, sheet, cell, s, salt));
            const rf = seed('formation'), rp = seed('position'), ro = seed('orientation');
            const useRule = n < rule.minCount ? RULES.get('free') : rule;
            const lay = useRule.layout(n, { formation: rf, position: rp, orientation: ro, variation: cfg.variation });
            let pts = lay.points.map(p => ({ ...p }));
            /* permuta quem ocupa cada posição (o alvo do cerco, por exemplo, não é sempre o slot 1) */
            pts = rf.shuffle(pts);
            const alpha = rf.range(0, 360), ca = Math.cos(rad(alpha)), sa = Math.sin(rad(alpha));
            pts = pts.map(p => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca, facing: p.facing + alpha }));
            const m = centroid(pts);
            const maxR = Math.max(...pts.map(p => Math.hypot(p.x - m.x, p.y - m.y)));
            const sc = maxR > SPREAD_CAP ? SPREAD_CAP / maxR : 1;
            const v = cfg.variation;
            const cx = CELL / 2 + rp.range(-1, 1) * v * 50, cy = CELL / 2 + rp.range(-1, 1) * v * 50;
            pts = pts.map(p => ({ x: cx + (p.x - m.x) * sc, y: cy + (p.y - m.y) * sc, facing: p.facing }));
            relax(pts);
            return { variant: lay.variant, characters: pts.map((p, i) => ({
                    id: 'char-' + String(i + 1).padStart(2, '0'), slot: i + 1, x: round2(p.x), y: round2(p.y), rotation: norm360(p.facing), gazeDirection: norm360(p.facing),
                    contourColor: PALETTE[i].contour, fillColor: PALETTE[i].fill
                })) };
        }
        function relax(pts) {
            for (let it = 0; it < 120; it++) {
                let moved = false;
                for (let i = 0; i < pts.length; i++)
                    for (let j = i + 1; j < pts.length; j++) {
                        const a = pts[i], b = pts[j];
                        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
                        if (d >= SEP + 0.6)
                            continue;
                        if (d < 1e-6) {
                            dx = 1;
                            dy = 0;
                            d = 1;
                        }
                        const push = (SEP + 0.8 - d) / 2;
                        dx /= d;
                        dy /= d;
                        a.x -= dx * push;
                        a.y -= dy * push;
                        b.x += dx * push;
                        b.y += dy * push;
                        moved = true;
                    }
                for (const p of pts) {
                    p.x = Math.min(CHAR_HI, Math.max(CHAR_LO, p.x));
                    p.y = Math.min(CHAR_HI, Math.max(CHAR_LO, p.y));
                }
                if (!moved)
                    break;
            }
        }
        /* ------------------------------ foco ------------------------------ */
        function focusPoint(chars, ids) {
            const t = chars.filter(c => ids.includes(c.id));
            if (!t.length)
                fail('INVALID_ARGUMENT', 'Alvo de foco sem personagens');
            return pt(t.reduce((s, c) => s + c.x, 0) / t.length, t.reduce((s, c) => s + c.y, 0) / t.length);
        }
        function pickFocus(chars, want, rs) {
            const n = chars.length;
            let kind = want;
            if (kind === 'group' && n < 3)
                kind = n >= 2 ? 'pair' : 'character';
            if (kind === 'pair' && n < 2)
                kind = 'character';
            let ids;
            const a = rs.pick(chars);
            const byDist = chars.filter(c => c.id !== a.id).sort((p, q) => dist(p, a) - dist(q, a) || (p.id < q.id ? -1 : 1));
            if (kind === 'character')
                ids = [a.id];
            else if (kind === 'pair')
                ids = [a.id, byDist[0].id];
            else if (kind === 'group') {
                const k = rs.int(3, Math.max(3, n - 1));
                ids = [a.id, ...byDist.slice(0, k - 1).map(c => c.id)];
            }
            else
                ids = chars.map(c => c.id);
            ids.sort();
            const p = focusPoint(chars, ids);
            return { targetIds: ids, targetType: kind, x: p.x, y: p.y, reticleColor: RETICLE_COLOR };
        }
        const targets = (chars, f) => chars.filter(c => f.targetIds.includes(c.id));
        /* ------------------------- enquadramento ------------------------- */
        function frameCalc(chars, focus, cam, type, relaxed, wideMargin = WIDE.margin) {
            const lim = type === 'tight' ? TIGHT : { ...WIDE, margin: wideMargin };
            const lensP = { x: cam.x + dir(cam.rotation).x * LENS.lensOffset, y: cam.y + dir(cam.rotation).y * LENS.lensOffset };
            const fp = { x: focus.x, y: focus.y };
            const ang = angleTo(lensP, fp);
            const u = dir(ang), v = dir(ang + 90);
            let theta = 0, dn = Infinity, df = -Infinity;
            for (const c of targets(chars, focus)) {
                const rel = { x: c.x - lensP.x, y: c.y - lensP.y }, z = rel.x * u.x + rel.y * u.y, l = rel.x * v.x + rel.y * v.y;
                const rho = Math.hypot(z, l), rr = K['SUBJECT_R'] + lim.margin;
                if (rho <= rr + 1 || z <= rr * 0.2) {
                    if (!relaxed)
                        return null;
                    continue;
                }
                theta = Math.max(theta, Math.abs(Math.atan2(l, z)) + Math.asin(Math.min(1, rr / rho)));
                dn = Math.min(dn, z - rr);
                df = Math.max(df, z + rr);
            }
            if (!isFinite(dn)) {
                if (!relaxed)
                    return null;
                dn = 6;
                df = 60;
                theta = rad(lim.minAngle);
            }
            let th = deg(theta);
            if (!relaxed && th > lim.maxAngle)
                return null;
            th = Math.max(th, lim.minAngle);
            if (type === 'wide')
                th = Math.max(th, WIDE.minAngle);
            th = Math.min(th, 85);
            dn = Math.max(dn, 6);
            df = Math.max(df, dn + 8);
            const tn = Math.tan(rad(th));
            const P = (d, side) => pt(lensP.x + u.x * d + v.x * d * tn * side, lensP.y + u.y * d + v.y * d * tn * side);
            const poly = [P(dn, -1), P(dn, 1), P(df, 1), P(df, -1)];
            const lens = pt(lensP.x, lensP.y);
            return {
                type, lineStyle: type === 'wide' ? 'dashed' : 'solid', halfAngle: round2(th), lens,
                fovBoundaries: [{ from: lens, to: poly[3] }, { from: lens, to: poly[2] }],
                polygon: poly, opticalAxis: { from: lens, to: pt(fp.x, fp.y) }, depthNear: round2(dn), depthFar: round2(df)
            };
        }
        const computeFraming = (chars, focus, cam, type) => frameCalc(chars, focus, cam, type, false);
        const inCell = (p, lo, hi) => p.x >= lo - 0.011 && p.x <= hi + 0.011 && p.y >= lo - 0.011 && p.y <= hi + 0.011;
        function framingFits(chars, focus, fr) {
            if (![fr.lens, ...fr.polygon].every(p => inCell(p, EDGE, CELL - EDGE)))
                return 'FRAMING_OUT_OF_CELL';
            if (!inConvex({ x: focus.x, y: focus.y }, fr.polygon, 0.011))
                return 'RETICLE_OUTSIDE_FRAMING';
            if (focus.targetType === 'character' && fr.type === 'tight') {
                const tid = focus.targetIds[0];
                if (chars.some(c => c.id !== tid && inConvex(c, fr.polygon)))
                    return 'FRAMING_INCLUDES_OTHERS';
            }
            return null;
        }
        /* ----------------------------- câmera ----------------------------- */
        function makeCamera(x, y, focus, level, elev) {
            const cx = round2(x), cy = round2(y), fp = { x: focus.x, y: focus.y };
            return { x: cx, y: cy, rotation: angleTo({ x: cx, y: cy }, fp), distanceLevel: level, elevationLevel: elev, elevationColor: ELEVATION[elev].color,
                referenceHeight: ELEVATION[elev].height, positionAngle: angleTo(fp, { x: cx, y: cy }), lensGeometry: { ...LENS } };
        }
        const subjectRadius = (chars, focus) => Math.max(...targets(chars, focus).map(c => Math.hypot(c.x - focus.x, c.y - focus.y))) + K['SUBJECT_R'];
        function tryCamera(chars, focus, level, elev, type, x, y) {
            if (x < CAM_LO || x > CAM_HI || y < CAM_LO || y > CAM_HI)
                return null;
            if (chars.some(c => Math.hypot(c.x - x, c.y - y) < GAP))
                return null;
            const camera = makeCamera(x, y, focus, level, elev);
            for (const m of type === 'wide' ? WIDE_MARGINS : [TIGHT.margin]) {
                const framing = frameCalc(chars, focus, camera, type, false, m);
                if (framing && !framingFits(chars, focus, framing))
                    return { camera, framing };
            }
            return null;
        }
        function placeCamera(chars, focus, level, elev, type, rs, octant, fixedAngle) {
            const [lo, hi] = LEVEL_RANGE[level], d0 = rs.range(lo, hi), jitter = rs.range(-22, 22);
            const base = fixedAngle !== null ? fixedAngle : (octant === null ? rs.range(0, 360) : octant * 45 + jitter);
            const R = subjectRadius(chars, focus), fp = { x: focus.x, y: focus.y };
            const offsets = [0];
            for (let k = 1; k <= 24; k++)
                offsets.push(k * 7.5, -k * 7.5);
            offsets.push(180);
            for (const off of offsets) {
                for (const de of [d0, (d0 + lo) / 2, lo, (d0 + hi) / 2, hi]) {
                    const D = de + R, a = base + off, p = { x: fp.x + dir(a).x * D, y: fp.y + dir(a).y * D };
                    const r = tryCamera(chars, focus, level, elev, type, p.x, p.y);
                    if (r)
                        return { ...r, offset: off };
                }
            }
            return null;
        }
        /* nível mais próximo de uma distância medida (as faixas têm folgas entre si) */
        function classifyLevel(meas) {
            let best = 'near', bd = Infinity;
            for (const k of ['near', 'medium', 'far']) {
                const [a, b] = LEVEL_RANGE[k], d = meas < a ? a - meas : meas > b ? meas - b : 0;
                if (d < bd - 1e-9) {
                    bd = d;
                    best = k;
                }
            }
            return best;
        }
        /* ------------------------------ validação ------------------------------ */
        function validateCell(cell) {
            const out = [];
            const bad = (code, message) => { out.push({ code, message }); };
            const chars = cell.characters;
            if (chars.length < 1 || chars.length > 8)
                bad('CHARACTER_COUNT', 'A célula deve ter de 1 a 8 manequins');
            const slots = new Set(), ids = new Set();
            for (const c of chars) {
                const pal = PALETTE[c.slot - 1];
                if (!pal || pal.contour !== c.contourColor || pal.fill !== c.fillColor)
                    bad('PALETTE', c.id + ' não usa as cores do slot ' + c.slot);
                if (slots.has(c.slot))
                    bad('PALETTE_DUPLICATE', 'Slot repetido: ' + c.slot);
                slots.add(c.slot);
                if (ids.has(c.id))
                    bad('ID_DUPLICATE', 'Id repetido: ' + c.id);
                ids.add(c.id);
                if (c.x < CHAR_LO - 0.011 || c.x > CHAR_HI + 0.011 || c.y < CHAR_LO - 0.011 || c.y > CHAR_HI + 0.011)
                    bad('CHARACTER_OUT_OF_CELL', c.id + ' fora da célula');
                if (c.rotation < 0 || c.rotation >= 360 || c.rotation !== c.gazeDirection)
                    bad('ORIENTATION', c.id + ' com orientação inválida');
                if (!chars.every(o => o === c || o.id === c.id)) { /* sobreposição verificada abaixo */ }
            }
            for (let i = 0; i < chars.length; i++)
                for (let j = i + 1; j < chars.length; j++)
                    if (dist(chars[i], chars[j]) < SEP - 0.6)
                        bad('CHARACTER_OVERLAP', chars[i].id + ' e ' + chars[j].id + ' se sobrepõem');
            const cam = cell.camera, fr = cell.framing, fo = cell.focus;
            const col = cell.index % 3, elev = ['E1', 'E2', 'E3'][col];
            if (cam.elevationLevel !== elev)
                bad('ELEVATION_COLUMN', 'A coluna ' + (col + 1) + ' exige ' + elev);
            if (cam.elevationColor !== ELEVATION[cam.elevationLevel].color)
                bad('ELEVATION_COLOR', 'Cor da câmera não corresponde à elevação');
            if (JSON.stringify(cam.lensGeometry) !== JSON.stringify(LENS))
                bad('CAMERA_GEOMETRY', 'A geometria da câmera deve ser constante');
            if (cam.x < CAM_LO - 0.011 || cam.x > CAM_HI + 0.011 || cam.y < CAM_LO - 0.011 || cam.y > CAM_HI + 0.011)
                bad('CAMERA_OUT_OF_CELL', 'Câmera fora da célula');
            if (chars.some(c => Math.hypot(c.x - cam.x, c.y - cam.y) < GAP - 0.6))
                bad('CAMERA_OVERLAP', 'Câmera sobreposta a um manequim');
            const fids = fo.targetIds;
            if (!fids.length || !fids.every(id => ids.has(id))) {
                bad('FOCUS_TARGET', 'Alvo de foco inexistente');
                return out;
            }
            const expect = focusPoint(chars, fids);
            if (Math.abs(expect.x - fo.x) > 0.05 || Math.abs(expect.y - fo.y) > 0.05)
                bad('FOCUS_POSITION', 'Retículo fora do alvo selecionado');
            const typeOk = fo.targetType === 'character' ? fids.length === 1 : fo.targetType === 'pair' ? fids.length === 2 : fo.targetType === 'group' ? fids.length >= 3 && fids.length <= chars.length : fids.length === chars.length;
            if (!typeOk)
                bad('FOCUS_TYPE', 'Tipo de alvo incompatível com os personagens selecionados');
            if (fo.reticleColor !== RETICLE_COLOR)
                bad('RETICLE_COLOR', 'Cor do retículo deve ser ' + RETICLE_COLOR);
            if (angleDiff(cam.rotation, angleTo(cam, fo)) > 0.1)
                bad('OPTICAL_AXIS', 'Eixo óptico não aponta para o foco');
            if (fr.lineStyle !== (fr.type === 'wide' ? 'dashed' : 'solid'))
                bad('FRAMING_STYLE', 'Estilo de linha incompatível com o enquadramento');
            const fits = framingFits(chars, fo, fr);
            if (fits)
                bad(fits, fits === 'FRAMING_OUT_OF_CELL' ? 'Cone ou área enquadrada fora da célula' : fits === 'RETICLE_OUTSIDE_FRAMING' ? 'Retículo fora da área enquadrada' : 'O enquadramento individual inclui outros manequins');
            const level = cam.distanceLevel, [lo, hi] = LEVEL_RANGE[level];
            const meas = Math.hypot(cam.x - fo.x, cam.y - fo.y) - subjectRadius(chars, fo);
            if (cell.manualEdits) {
                if (classifyLevel(meas) !== level)
                    bad('DISTANCE_LEVEL', 'Distância medida (' + round2(meas) + ') pertence a "' + classifyLevel(meas) + '", não a "' + level + '"');
            }
            else if (meas < lo - 1.5 || meas > hi + 1.5)
                bad('DISTANCE_LEVEL', 'Distância medida (' + round2(meas) + ') fora da faixa de ' + level);
            const lim = fr.type === 'tight' ? TIGHT : WIDE;
            if (fr.halfAngle > lim.maxAngle + 0.01 || fr.halfAngle < lim.minAngle - 0.01)
                bad('FRAMING_ANGLE', 'Campo de visão fora da faixa do enquadramento ' + fr.type);
            if (fr.type === 'tight' && fr.depthFar - fr.depthNear > 2 * (subjectRadius(chars, fo) + TIGHT.margin) + 1)
                bad('FRAMING_TIGHT_TOO_LARGE', 'Enquadramento fechado maior que o alvo');
            return out;
        }
        function sheetCtx(cfg, sheet) {
            const rd = random(hash(cfg.masterSeed, sheet, -1, 'distance')), rf = random(hash(cfg.masterSeed, sheet, -1, 'framing')), rpos = random(hash(cfg.masterSeed, sheet, -1, 'position'));
            const distances = cfg.cameraDistance === 'auto' ? rd.shuffle(['near', 'near', 'near', 'medium', 'medium', 'medium', 'far', 'far', 'far']) : Array(9).fill(cfg.cameraDistance);
            const wideCount = rf.int(3, 6);
            const kinds = rf.shuffle([...Array(wideCount).fill('wide'), ...Array(9 - wideCount).fill('tight')]);
            const octants = rpos.shuffle([0, 1, 2, 3, 4, 5, 6, 7, rpos.int(0, 7)]);
            return { distances, framings: kinds, octants };
        }
        function buildCell(cfg, themeId, sheet, index, ctx, salts, reuse, attempt) {
            const rule = RULES.get(themeId);
            const notes = [];
            let chars, variant, requested, effective;
            if (reuse.chars) {
                chars = reuse.chars;
                variant = reuse.variant ?? '';
                requested = reuse.counts?.requested ?? chars.length;
                effective = chars.length;
                notes.push(...(reuse.notes ?? []));
            }
            else {
                const salt = salts.characters * 16 + attempt;
                const cn = countFor(cfg, rule, random(hash(cfg.masterSeed, sheet, index, 'count', salt)));
                const g = genCharacters(cfg, rule, cn.effective, sheet, index, salt);
                chars = g.characters;
                variant = g.variant;
                requested = cn.requested;
                effective = cn.effective;
                notes.push(...cn.notes);
            }
            const elev = ['E1', 'E2', 'E3'][index % 3];
            const level = ctx.distances[index];
            const rsF = random(hash(cfg.masterSeed, sheet, index, 'focus', salts.framing * 16 + attempt));
            /* tipo de enquadramento e candidatos de alvo, do preferido para os alternativos */
            let type;
            let wants;
            if (cfg.focusTarget !== 'auto') {
                type = cfg.cameraFraming !== 'auto' ? cfg.cameraFraming : (cfg.focusTarget === 'scene' ? 'wide' : 'tight');
                wants = [cfg.focusTarget];
            }
            else {
                type = cfg.cameraFraming !== 'auto' ? cfg.cameraFraming : ctx.framings[index];
                if (type === 'wide')
                    wants = ['scene'];
                else {
                    const r = rsF.next();
                    const first = r < 0.5 ? 'character' : r < 0.75 ? 'pair' : 'group';
                    wants = [first, 'character', 'pair', 'group'];
                }
            }
            if (reuse.type)
                type = reuse.type;
            const rsC = random(hash(cfg.masterSeed, sheet, index, 'position', salts.camera * 16 + attempt));
            const fixedAngle = cfg.cameraPosition === 'auto' ? null : cfg.cameraPosition.angle;
            const octant = ctx.octants[index];
            let focus = null, placed = null;
            const candidates = [];
            if (reuse.focus && reuse.focus.targetIds.every(id => chars.some(c => c.id === id))) {
                const p = focusPoint(chars, reuse.focus.targetIds);
                candidates.push({ ...reuse.focus, x: p.x, y: p.y });
            }
            else
                for (const w of wants)
                    candidates.push(pickFocus(chars, w, w === wants[0] ? rsF : random(hash(cfg.masterSeed, sheet, index, 'focus-alt', salts.framing * 16 + attempt))));
            for (const cand of candidates) {
                let r = null;
                if (reuse.cameraPos) {
                    const t = tryCamera(chars, cand, level, elev, type, reuse.cameraPos.x, reuse.cameraPos.y);
                    if (t)
                        r = t;
                }
                if (!r)
                    r = placeCamera(chars, cand, level, elev, type, rsC, octant, fixedAngle);
                if (r) {
                    focus = cand;
                    placed = r;
                    break;
                }
            }
            if (!focus || !placed) {
                /* sem solução dentro das regras: devolve a melhor tentativa, marcada como inválida (nunca esconde o problema) */
                focus = candidates[0];
                const R = subjectRadius(chars, focus), a = octant * 45, D = LEVEL_RANGE[level][0] + R;
                const cx = Math.min(CAM_HI, Math.max(CAM_LO, focus.x + dir(a).x * D)), cy = Math.min(CAM_HI, Math.max(CAM_LO, focus.y + dir(a).y * D));
                const camera = makeCamera(cx, cy, focus, level, elev);
                const framing = frameCalc(chars, focus, camera, type, true);
                placed = { camera, framing };
            }
            else if (placed.offset && placed.offset !== 0 && fixedAngle !== null)
                notes.push('Posição da câmera ajustada em ' + placed.offset + '° para caber na célula');
            const cell = {
                id: 'cell-' + String(index + 1).padStart(2, '0'), index, themeRule: { id: themeId, variant }, characters: chars, camera: placed.camera, framing: placed.framing, focus,
                sceneMetadata: { requestedCount: requested, effectiveCount: effective, notes, violations: [] }, locked: false, lockedParts: { characters: false, camera: false, framing: false }, salts: { ...salts }
            };
            cell.sceneMetadata.violations = validateCell(cell);
            return cell;
        }
        function generateCell(cfg, themeId, sheet, index, ctx, salts) {
            let best = null;
            for (let attempt = 0; attempt < 6; attempt++) {
                const c = buildCell(cfg, themeId, sheet, index, ctx, salts, {}, attempt);
                if (!c.sceneMetadata.violations.length) {
                    if (attempt)
                        c.sceneMetadata.notes.push('Formação refeita ' + attempt + ' vez(es) para satisfazer a geometria');
                    return c;
                }
                if (!best || c.sceneMetadata.violations.length < best.sceneMetadata.violations.length)
                    best = c;
            }
            return best;
        }
        function generate(input, onProgress) {
            const cfg = core.normalizeConfig(input);
            const themeId = resolveTheme(cfg.theme, cfg.formation);
            const sheets = [];
            const total = cfg.quantityOfSpritesheets * 9;
            for (let s = 0; s < cfg.quantityOfSpritesheets; s++) {
                const ctx = sheetCtx(cfg, s), cells = [];
                for (let i = 0; i < 9; i++) {
                    cells.push(generateCell(cfg, themeId, s, i, ctx, { characters: 0, camera: 0, framing: 0 }));
                    if (onProgress)
                        onProgress(s * 9 + i + 1, total);
                }
                sheets.push({ id: 'sheet-' + String(s + 1).padStart(2, '0'), index: s, seed: hash(cfg.masterSeed, s, -1, 'sheet'), cells });
            }
            return { format: 'visualboard-scene-blocking', formatVersion: 1, engineVersion: ENGINE_VERSION, config: cfg, sheets };
        }
        const clone = (v) => JSON.parse(JSON.stringify(v));
        function locate(batch, sheet, cell) {
            const c = batch.sheets.find(s => s.index === sheet)?.cells[cell];
            if (!c)
                return fail('NOT_FOUND', 'Célula inexistente: folha ' + sheet + ', célula ' + cell);
            return c;
        }
        function regenerate(batch, req) {
            const out = clone(batch), prev = locate(out, req.sheet, req.cell);
            const parts = req.part === 'all' ? ['characters', 'camera', 'framing'] : [req.part];
            if (!['all', 'characters', 'camera', 'framing'].includes(req.part))
                fail('INVALID_ARGUMENT', 'Parte desconhecida: ' + String(req.part), 'part');
            if (prev.locked)
                fail('CELL_LOCKED', 'A célula está bloqueada');
            if (req.part !== 'all' && prev.lockedParts[req.part])
                fail('PART_LOCKED', 'O componente "' + req.part + '" está bloqueado');
            const salts = { ...prev.salts };
            for (const p of parts)
                if (!prev.lockedParts[p])
                    salts[p]++;
            const cfg = out.config, themeId = resolveTheme(cfg.theme, cfg.formation), ctx = sheetCtx(cfg, req.sheet);
            const regenChars = parts.includes('characters') && !prev.lockedParts.characters;
            const regenFraming = (parts.includes('framing') && !prev.lockedParts.framing) || regenChars;
            const regenCamera = (parts.includes('camera') && !prev.lockedParts.camera) || regenChars;
            const reuse = {};
            if (!regenChars) {
                reuse.chars = prev.characters;
                reuse.variant = prev.themeRule.variant;
                reuse.notes = prev.sceneMetadata.notes;
                reuse.counts = { requested: prev.sceneMetadata.requestedCount, effective: prev.sceneMetadata.effectiveCount };
            }
            if (!regenFraming) {
                reuse.focus = prev.focus;
                reuse.type = prev.framing.type;
            }
            if (!regenCamera)
                reuse.cameraPos = { x: prev.camera.x, y: prev.camera.y };
            else if (!regenFraming && !regenChars) { /* só a câmera: mantém alvo e tipo, escolhe outra posição */ }
            const next = buildCell(cfg, themeId, req.sheet, req.cell, ctx, salts, reuse, 0);
            next.lockedParts = { ...prev.lockedParts };
            next.locked = prev.locked;
            out.sheets.find(s => s.index === req.sheet).cells[req.cell] = next;
            return out;
        }
        function setLock(batch, sheet, cell, lock) {
            const out = clone(batch), c = locate(out, sheet, cell);
            if (lock.cell !== undefined)
                c.locked = !!lock.cell;
            for (const k of ['characters', 'camera', 'framing']) {
                const v = lock.parts?.[k];
                if (v !== undefined)
                    c.lockedParts[k] = !!v;
            }
            return out;
        }
        /* ------------------------- edição manual (B17) ------------------------- */
        const num = (v, field) => { if (typeof v !== 'number' || !Number.isFinite(v))
            return fail('INVALID_ARGUMENT', 'Valor numérico inválido: ' + field, field); return v; };
        function editCell(batch, req) {
            const out = clone(batch), cell = locate(out, req.sheet, req.cell), e = req.edit;
            if (!e || typeof e !== 'object')
                fail('INVALID_ARGUMENT', 'Edição ausente', 'edit');
            if (cell.locked)
                fail('CELL_LOCKED', 'A célula está bloqueada');
            const lp = cell.lockedParts, need = (p) => { if (lp[p])
                fail('PART_LOCKED', 'O componente "' + p + '" está bloqueado'); };
            const chars = cell.characters, byId = (id) => chars.find(c => c.id === id) ?? fail('NOT_FOUND', 'Manequim inexistente: ' + String(id), 'id');
            const type0 = cell.framing.type;
            let focus = cell.focus, camera = cell.camera, type = type0, area = null;
            let reframe = true;
            switch (e.op) {
                case 'rotate_character': {
                    need('characters');
                    const c = byId(e['id']), r = norm360(round2(num(e['rotation'], 'rotation')));
                    c.rotation = r;
                    c.gazeDirection = r;
                    reframe = false;
                    break;
                }
                case 'move_character': {
                    need('characters');
                    need('framing');
                    const c = byId(e['id']), x = round2(num(e['x'], 'x')), y = round2(num(e['y'], 'y'));
                    if (x < CHAR_LO || x > CHAR_HI || y < CHAR_LO || y > CHAR_HI)
                        fail('OUT_OF_CELL', 'Manequim fora da área útil da célula (' + CHAR_LO + ' a ' + CHAR_HI + ')');
                    if (chars.some(o => o !== c && Math.hypot(o.x - x, o.y - y) < SEP))
                        fail('CHARACTER_OVERLAP', 'O manequim ficaria sobreposto a outro');
                    if (Math.hypot(camera.x - x, camera.y - y) < GAP)
                        fail('CAMERA_OVERLAP', 'O manequim ficaria sobre a câmera');
                    c.x = x;
                    c.y = y;
                    break;
                }
                case 'move_camera': {
                    need('camera');
                    need('framing');
                    const x = round2(num(e['x'], 'x')), y = round2(num(e['y'], 'y'));
                    if (x < CAM_LO || x > CAM_HI || y < CAM_LO || y > CAM_HI)
                        fail('OUT_OF_CELL', 'Câmera fora da área útil da célula (' + CAM_LO + ' a ' + CAM_HI + ')');
                    if (chars.some(c => Math.hypot(c.x - x, c.y - y) < GAP))
                        fail('CAMERA_OVERLAP', 'A câmera ficaria sobre um manequim');
                    camera = makeCamera(x, y, focus, classifyLevel(Math.hypot(x - focus.x, y - focus.y) - subjectRadius(chars, focus)), camera.elevationLevel);
                    break;
                }
                case 'set_focus': {
                    need('framing');
                    const raw = e['targetIds'];
                    if (!Array.isArray(raw) || !raw.length || !raw.every(t => typeof t === 'string'))
                        fail('INVALID_ARGUMENT', 'targetIds deve listar ao menos um manequim', 'targetIds');
                    const ids = Array.from(new Set(raw)).sort();
                    ids.forEach(byId);
                    const kind = ids.length === 1 ? 'character' : ids.length === 2 ? 'pair' : ids.length === chars.length ? 'scene' : 'group';
                    focus = { ...focus, targetIds: ids, targetType: kind };
                    break;
                }
                case 'set_framing_type': {
                    need('framing');
                    if (e['type'] !== 'wide' && e['type'] !== 'tight')
                        fail('INVALID_ARGUMENT', 'Tipo de enquadramento inválido', 'type');
                    type = e['type'];
                    break;
                }
                case 'set_framing_area': {
                    need('framing');
                    area = {};
                    for (const k of ['halfAngle', 'depthNear', 'depthFar'])
                        if (e[k] !== undefined)
                            area[k] = num(e[k], k);
                    if (!Object.keys(area).length)
                        fail('INVALID_ARGUMENT', 'Informe halfAngle, depthNear ou depthFar');
                    break;
                }
                default: return fail('INVALID_ARGUMENT', 'Operação de edição desconhecida: ' + String(e.op), 'op');
            }
            if (reframe) {
                const p = focusPoint(chars, focus.targetIds);
                focus = { ...focus, x: p.x, y: p.y };
                camera = makeCamera(camera.x, camera.y, focus, classifyLevel(Math.hypot(camera.x - focus.x, camera.y - focus.y) - subjectRadius(chars, focus)), camera.elevationLevel);
                let fr = null;
                if (area) {
                    const base = frameCalc(chars, focus, camera, type, true);
                    if (!base)
                        return fail('FRAMING_DOES_NOT_FIT', 'Não foi possível calcular o enquadramento');
                    const lim = type === 'tight' ? TIGHT : WIDE;
                    const th = area.halfAngle ?? base.halfAngle, dn = area.depthNear ?? base.depthNear, df = area.depthFar ?? base.depthFar;
                    if (th < lim.minAngle || th > lim.maxAngle)
                        fail('FRAMING_ANGLE', 'O campo do enquadramento ' + (type === 'tight' ? 'fechado' : 'amplo') + ' fica entre ' + lim.minAngle + '° e ' + lim.maxAngle + '°', 'halfAngle');
                    if (dn < 6 || df < dn + 8)
                        fail('FRAMING_DEPTH', 'Profundidade inválida: mínimo 6 e diferença de pelo menos 8', 'depthNear');
                    const lensP = base.lens, ang = angleTo(lensP, { x: focus.x, y: focus.y }), u = dir(ang), v = dir(ang + 90), tn = Math.tan(rad(th));
                    const P = (d, side) => pt(lensP.x + u.x * d + v.x * d * tn * side, lensP.y + u.y * d + v.y * d * tn * side);
                    const poly = [P(dn, -1), P(dn, 1), P(df, 1), P(df, -1)];
                    fr = { type, lineStyle: type === 'wide' ? 'dashed' : 'solid', halfAngle: round2(th), lens: lensP, fovBoundaries: [{ from: lensP, to: poly[3] }, { from: lensP, to: poly[2] }],
                        polygon: poly, opticalAxis: { from: lensP, to: pt(focus.x, focus.y) }, depthNear: round2(dn), depthFar: round2(df) };
                    if (!targets(chars, focus).every(c => inConvex(c, fr.polygon)))
                        fail('FRAMING_MISSES_TARGET', 'A área enquadrada deve conter todos os manequins do alvo');
                }
                else {
                    for (const m of type === 'wide' ? WIDE_MARGINS : [TIGHT.margin]) {
                        const cand = frameCalc(chars, focus, camera, type, false, m);
                        if (cand && !framingFits(chars, focus, cand)) {
                            fr = cand;
                            break;
                        }
                    }
                }
                if (!fr)
                    return fail('FRAMING_DOES_NOT_FIT', 'Com esta edição o enquadramento ' + (type === 'tight' ? 'fechado' : 'amplo') + ' não cabe na célula, não inclui o alvo ou inclui outros manequins; a edição foi recusada');
                cell.focus = focus;
                cell.camera = camera;
                cell.framing = fr;
            }
            cell.manualEdits = (cell.manualEdits ?? 0) + 1;
            const bad = validateCell(cell);
            if (bad.length)
                fail('INVALID_EDIT', 'A edição violaria a geometria: ' + bad[0].message);
            cell.sceneMetadata = { ...cell.sceneMetadata, violations: [] };
            return out;
        }
        function validateBatch(batch) {
            const out = [];
            const cfg = batch.config;
            const seenSheets = new Set();
            batch.sheets.forEach(sh => {
                const tag = (m) => sh.id + ': ' + m;
                if (sh.cells.length !== 9)
                    out.push({ code: 'SHEET_CELLS', message: tag('deve ter 9 células') });
                const elev = { E1: 0, E2: 0, E3: 0 }, dist3 = { near: 0, medium: 0, far: 0 }, fr = { wide: 0, tight: 0 };
                sh.cells.forEach(c => {
                    for (const v of validateCell(c))
                        out.push({ code: v.code, message: tag(c.id + ' ' + v.message) });
                    elev[c.camera.elevationLevel]++;
                    dist3[c.camera.distanceLevel]++;
                    fr[c.framing.type]++;
                });
                if (Object.values(elev).some(v => v !== 3))
                    out.push({ code: 'ELEVATION_BALANCE', message: tag('cada elevação deve ter 3 câmeras') });
                if (!sh.cells.some(c => c.manualEdits) && cfg.cameraDistance === 'auto' && Object.values(dist3).some(v => v !== 3))
                    out.push({ code: 'DISTANCE_BALANCE', message: tag('cada distância deve ter 3 câmeras') });
                if (!sh.cells.some(c => c.manualEdits) && cfg.cameraFraming === 'auto' && cfg.focusTarget === 'auto' && (fr.wide < 3 || fr.tight < 3))
                    out.push({ code: 'FRAMING_BALANCE', message: tag('devem existir ao menos 3 enquadramentos amplos e 3 fechados') });
                if (seenSheets.has(sh.index) || sh.id !== 'sheet-' + String(sh.index + 1).padStart(2, '0'))
                    out.push({ code: 'SHEET_INDEX', message: tag('índice repetido ou inconsistente') });
                seenSheets.add(sh.index);
            });
            return out;
        }
        kernel.provide('sceneBlockingEngine', {
            ENGINE_VERSION, themes, registerTheme, resolveTheme, generate, regenerate, setLock, editCell, validateCell, validateBatch, computeFraming, focusPoint
        });
    }
});
