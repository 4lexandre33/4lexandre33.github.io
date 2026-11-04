"use strict";
/* Scene Blocking — vistas laterais (elevações). Projeção ortográfica de UMA célula da vista de cima sobre planos verticais.
 * Puro e determinístico: as posições horizontais vêm do modelo da célula e nunca mudam; só o eixo da altura (z) é novo.
 * Alturas, bases e poses ficam nas opções da elevação, fora do modelo da célula (a vista de cima e o seu hash não mudam).
 * Sem texto no SVG (rótulos ficam na interface). Cada peça é um sólido simples projetado e desenhado pelo casco convexo. */
definePlugin({
    id: 'scene-blocking-elevation',
    version: '1.0.0',
    needs: ['sceneBlockingCore', 'sceneBlockingRender'],
    provides: ['sceneElevation'],
    uses: [],
    accepts: { sceneBlockingCore: '^1.0.0', sceneBlockingRender: '^1.0.0' },
    contractVersions: { sceneElevation: '1.0.0' },
    setup: async function (kernel) {
        const core = await kernel.require('sceneBlockingCore');
        const R = await kernel.require('sceneBlockingRender');
        const { CONST: K, round2, fail } = core;
        const CELL = K['CELL'], SHEET = K['SHEET'];
        const ENGINE = '1.0.0';
        /** Altura de um manequim em unidades da célula (≈170 cm; ombros de 40 u ≈ 45 cm). */
        const H = 150;
        const GROUND = 520;
        const LIMITS = { heightScale: [0.3, 1.4], baseZ: [0, 3], cameraHeight: [0.05, 4], frameAspect: [0.5, 3], variation: [0, 1] };
        const POSES = ['standing', 'crouching', 'sitting'];
        const INK = '#111827', LINE = '#374151', GRID = '#9CA3AF';
        const n = (v) => String(round2(v));
        const rad = (d) => d * Math.PI / 180;
        const deg = (r) => r * 180 / Math.PI;
        /** Ordem da folha 3×3: o centro é a vista de cima; cada vista cardeal fica no lado de onde se olha; as da câmera, nos cantos. */
        const VIEWS = Object.freeze([
            { id: 'cam-target', kind: 'camera', slot: 0, title: 'Do alvo para a câmera' },
            { id: 'from-north', kind: 'cardinal', slot: 1, title: 'Vista do Norte', alpha: 180 },
            { id: 'cam-behind', kind: 'camera', slot: 2, title: 'Atrás da câmera' },
            { id: 'from-west', kind: 'cardinal', slot: 3, title: 'Vista do Oeste', alpha: 90 },
            { id: 'from-east', kind: 'cardinal', slot: 5, title: 'Vista do Leste', alpha: 270 },
            { id: 'cam-left', kind: 'camera', slot: 6, title: 'Lateral esquerda da câmera' },
            { id: 'from-south', kind: 'cardinal', slot: 7, title: 'Vista do Sul (frente)', alpha: 0 },
            { id: 'cam-right', kind: 'camera', slot: 8, title: 'Lateral direita da câmera' }
        ]);
        const viewIds = () => VIEWS.map(v => v.id);
        function viewOf(id, cell) {
            const v = VIEWS.find(x => x.id === id);
            if (!v)
                return fail('INVALID_ARGUMENT', 'Vista desconhecida: ' + String(id) + ' (use ' + viewIds().join(', ') + ')', 'view');
            const rot = cell.camera.rotation;
            const alpha = v.alpha !== undefined ? v.alpha : v.id === 'cam-behind' ? rot : v.id === 'cam-target' ? rot + 180 : v.id === 'cam-left' ? rot + 90 : rot - 90;
            return { view: v, alpha: core.norm360(alpha) };
        }
        /* ------------------------------- opções ------------------------------- */
        const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
        function inRange(v, [lo, hi], field) {
            if (!isNum(v) || v < lo || v > hi)
                return fail('INVALID_ARGUMENT', field + ' deve estar entre ' + lo + ' e ' + hi, field);
            return v;
        }
        /** Normaliza e valida as opções vindas de fora (UI, MCP, projeto importado). Devolve só campos conhecidos. */
        function normalizeOptions(input, cell) {
            const o = (input && typeof input === 'object' ? input : {});
            const out = { views: viewIds(), frameAspect: 1.5, variation: 0.5, characters: {} };
            if (o['views'] !== undefined) {
                if (!Array.isArray(o['views']) || !o['views'].length)
                    fail('INVALID_ARGUMENT', 'views deve ser uma lista não vazia', 'views');
                const set = new Set();
                for (const v of o['views']) {
                    if (!viewIds().includes(v))
                        fail('INVALID_ARGUMENT', 'Vista desconhecida: ' + String(v), 'views');
                    set.add(v);
                }
                out.views = viewIds().filter(v => set.has(v));
            }
            if (o['frameAspect'] !== undefined)
                out.frameAspect = inRange(o['frameAspect'], LIMITS.frameAspect, 'frameAspect');
            if (o['variation'] !== undefined)
                out.variation = inRange(o['variation'], LIMITS.variation, 'variation');
            if (o['cameraHeight'] !== undefined)
                out.cameraHeight = inRange(o['cameraHeight'], LIMITS.cameraHeight, 'cameraHeight');
            if (o['characters'] !== undefined) {
                if (!o['characters'] || typeof o['characters'] !== 'object' || Array.isArray(o['characters']))
                    fail('INVALID_ARGUMENT', 'characters deve ser um objeto por id de manequim', 'characters');
                for (const [id, raw] of Object.entries(o['characters'])) {
                    if (!cell.characters.some(c => c.id === id))
                        fail('NOT_FOUND', 'Manequim inexistente na célula: ' + id, 'characters');
                    const r = (raw && typeof raw === 'object' ? raw : {}), e = {};
                    if (r['heightScale'] !== undefined)
                        e.heightScale = inRange(r['heightScale'], LIMITS.heightScale, 'heightScale');
                    if (r['baseZ'] !== undefined)
                        e.baseZ = inRange(r['baseZ'], LIMITS.baseZ, 'baseZ');
                    if (r['pose'] !== undefined) {
                        if (!POSES.includes(r['pose']))
                            fail('INVALID_ARGUMENT', 'pose deve ser ' + POSES.join(', '), 'pose');
                        e.pose = r['pose'];
                    }
                    out.characters[id] = e;
                }
            }
            return out;
        }
        /** Altura/base/pose efetivas: o que o usuário definiu vale; o resto é variação determinística pela identidade da célula e do manequim. */
        function resolve(cell, opts) {
            const chars = {};
            for (const c of cell.characters) {
                const set = opts.characters[c.id] ?? {}, rnd = core.random(core.hash(0, 0, 0, 'elevation:' + cell.id + ':' + c.id));
                const v = opts.variation;
                const auto = 1 + (rnd.next() - 0.5) * 0.3 * v;
                chars[c.id] = { heightScale: round2(set.heightScale ?? auto), baseZ: round2(set.baseZ ?? 0), pose: set.pose ?? 'standing' };
            }
            const cam = opts.cameraHeight ?? cell.camera.referenceHeight;
            return { characters: chars, cameraHeight: round2(cam), frameAspect: opts.frameAspect };
        }
        /** Hash do desenho da vista de cima: muda se qualquer coisa que a elevação usa mudar. */
        function cellHash(cell) { return String(core.hash(0, 0, 0, R.cellKey(cell))); }
        const rd = (alpha) => ({ r: [Math.cos(rad(alpha)), Math.sin(rad(alpha)), 0], d: [Math.sin(rad(alpha)), -Math.cos(rad(alpha)), 0] });
        const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + (a[2] ?? 0) * (b[2] ?? 0);
        /** Coordenada horizontal bruta (u) e profundidade (maior = mais longe) de um ponto do mundo. */
        function anchor(cell, viewId, x, y) {
            const { alpha } = viewOf(viewId, cell), v = rd(alpha);
            return { u: x * v.r[0] + y * v.r[1], depth: x * v.d[0] + y * v.d[1] };
        }
        function makeCtx(cell, alpha, res) {
            const v = rd(alpha);
            return { cell, alpha, r: v.r, d: v.d, res, u0: (CELL / 2) * v.r[0] + (CELL / 2) * v.r[1] };
        }
        /** (x,y,z) do mundo → (x,y) da tela da vista. O centro da célula fica no centro da tela; z=0 é a linha do chão. */
        const scr = (c, p) => [CELL / 2 + (dot(p, c.r) - c.u0), GROUND - p[2]];
        function hull(pts) {
            const a = pts.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1]);
            if (a.length < 3)
                return a;
            const cross = (o, p, q) => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
            const lo = [], up = [];
            for (const p of a) {
                while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0)
                    lo.pop();
                lo.push(p);
            }
            for (let i = a.length - 1; i >= 0; i--) {
                const p = a[i];
                while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0)
                    up.pop();
                up.push(p);
            }
            lo.pop();
            up.pop();
            return lo.concat(up);
        }
        /** Anel elíptico no plano horizontal em z: centro (cx,cy), semi-eixo a no sentido "direita do corpo", b no sentido "frente", rotação θ (bússola). */
        function ring(cx, cy, z, a, b, theta, scale = 1) {
            const f = [Math.sin(rad(theta)), -Math.cos(rad(theta))], s = [Math.cos(rad(theta)), Math.sin(rad(theta))], out = [];
            for (let i = 0; i < 12; i++) {
                const t = (i / 12) * Math.PI * 2, x = Math.cos(t) * a * scale, y = Math.sin(t) * b * scale;
                out.push([cx + x * s[0] + y * f[0], cy + x * s[1] + y * f[1], z]);
            }
            return out;
        }
        const poly = (c, pts) => hull(pts.map(p => scr(c, p))).map(p => n(p[0]) + ',' + n(p[1])).join(' ');
        const mean = (pts) => pts.reduce((s, p) => s + dot(p, c0.d), 0) / pts.length;
        const c0 = { d: [0, 0, 0] };
        function mannequinParts(c, ch) {
            const r = c.res.characters[ch.id], s = r.heightScale, base = r.baseZ * H, th = ch.rotation;
            const f = [Math.sin(rad(th)), -Math.cos(rad(th))], sd = [Math.cos(rad(th)), Math.sin(rad(th))];
            const Z = (frac) => base + frac * H * s;
            const parts = [], fill = ch.fillColor, stroke = ch.contourColor;
            const at = (across, fwd) => [ch.x + across * sd[0] + fwd * f[0], ch.y + across * sd[1] + fwd * f[1]];
            let hip = 0.52, shoulder = 0.84, headBase = 0.865, lean = 0;
            const legs = [];
            const limb = (id, across, from, to, a, b) => {
                const p0 = at(across, from[0]), p1 = at(across, to[0]);
                return { id, pts: ring(p0[0], p0[1], from[1], a, b, th).concat(ring(p1[0], p1[1], to[1], a, b, th)), fill, stroke };
            };
            if (r.pose === 'standing') {
                for (const sg of [-1, 1])
                    legs.push(limb('leg' + sg, sg * 8, [0, base, 0], [0, Z(hip), 0], 7, 8));
            }
            else if (r.pose === 'crouching') {
                hip = 0.33;
                shoulder = 0.6;
                headBase = 0.625;
                lean = 6;
                for (const sg of [-1, 1]) {
                    legs.push(limb('thigh' + sg, sg * 8, [0, Z(hip), 0], [16, Z(0.19), 0], 7, 8));
                    legs.push(limb('shin' + sg, sg * 8, [16, Z(0.19), 0], [2, base, 0], 6, 7));
                }
            }
            else {
                hip = 0.3;
                shoulder = 0.62;
                headBase = 0.645;
                for (const sg of [-1, 1]) {
                    legs.push(limb('thigh' + sg, sg * 8, [0, Z(hip), 0], [24, Z(hip), 0], 7, 8));
                    legs.push(limb('shin' + sg, sg * 8, [24, Z(hip), 0], [24, base, 0], 6, 7));
                }
            }
            parts.push(...legs);
            const t0 = at(0, 0), t1 = at(0, lean);
            parts.push({ id: 'torso', pts: ring(t0[0], t0[1], Z(hip), 17, 11, th).concat(ring(t1[0], t1[1], Z(shoulder), 20, 12, th)), fill, stroke });
            for (const sg of [-1, 1])
                parts.push(limb('arm' + sg, sg * 21, [lean, Z(shoulder - 0.03), 0], [lean, Z(hip - 0.07), 0], 5, 6));
            const nk = at(0, lean);
            parts.push({ id: 'neck', pts: ring(nk[0], nk[1], Z(shoulder), 4, 4, th).concat(ring(nk[0], nk[1], Z(headBase + 0.02), 4, 4, th)), fill, stroke });
            const hd = at(0, lean), hz0 = Z(headBase), hz1 = Z(headBase + 0.135);
            parts.push({ id: 'head', pts: ring(hd[0], hd[1], hz0, 11, 11, th, 0.75).concat(ring(hd[0], hd[1], (hz0 + hz1) / 2, 11, 11, th), ring(hd[0], hd[1], hz1, 11, 11, th, 0.75)), fill, stroke });
            const np = at(0, lean + 11), nz = Z(headBase + 0.07);
            const nose = [[np[0] + sd[0] * 3, np[1] + sd[1] * 3, nz + 3], [np[0] - sd[0] * 3, np[1] - sd[1] * 3, nz + 3], [np[0] + f[0] * 4, np[1] + f[1] * 4, nz - 2]];
            parts.push({ id: 'nose', pts: nose, fill: stroke, stroke, w: 1 });
            if (base > 0)
                parts.push({ id: 'platform', pts: ring(ch.x, ch.y, 0, 28, 28, th).concat(ring(ch.x, ch.y, base, 28, 28, th)), fill: '#E5E7EB', stroke: GRID });
            return parts;
        }
        const topOf = (cell, res, ch) => {
            const r = res.characters[ch.id];
            const f = r.pose === 'standing' ? 1 : r.pose === 'crouching' ? 0.76 : 0.78;
            return r.baseZ * H + f * H * r.heightScale;
        };
        /* ------------------------------- câmera ------------------------------- */
        /** Altura do ponto de foco: peito dos alvos (média) ou meia altura de um manequim para a cena toda. */
        function targetHeight(cell, res) {
            const ids = cell.focus.targetType === 'scene' ? [] : cell.focus.targetIds, list = cell.characters.filter(c => ids.includes(c.id));
            if (!list.length)
                return 0.5 * H;
            return list.reduce((s, c) => { const r = res.characters[c.id]; return s + r.baseZ * H + 0.8 * H * r.heightScale * (r.pose === 'standing' ? 1 : r.pose === 'crouching' ? 0.76 : 0.78); }, 0) / list.length;
        }
        function cameraGeo(cell, res) {
            const cam = cell.camera, zc = res.cameraHeight * H, zt = targetHeight(cell, res);
            const dist = Math.max(1, core.dist(cam, cell.focus)), phi = Math.atan2(zt - zc, dist);
            const f = [Math.sin(rad(cam.rotation)), -Math.cos(rad(cam.rotation))], rr = [Math.cos(rad(cam.rotation)), Math.sin(rad(cam.rotation))];
            const F = [f[0] * Math.cos(phi), f[1] * Math.cos(phi), Math.sin(phi)];
            const Rt = [rr[0], rr[1], 0];
            const U = [-f[0] * Math.sin(phi), -f[1] * Math.sin(phi), Math.cos(phi)];
            const vHalf = Math.atan(Math.tan(rad(cell.framing.halfAngle)) / res.frameAspect);
            const g = cam.lensGeometry, lens = [cam.x + F[0] * (g.bodyHeight / 2 + g.lensLength), cam.y + F[1] * (g.bodyHeight / 2 + g.lensLength), zc + F[2] * (g.bodyHeight / 2 + g.lensLength)];
            return { c: [cam.x, cam.y, zc], F, Rt, U, phi, vHalf, zt, lens };
        }
        function boxPts(g, a0, a1, b, h) {
            const out = [];
            for (const a of [a0, a1])
                for (const bb of [-b, b])
                    for (const cc of [-h, h])
                        out.push([g.c[0] + g.F[0] * a + g.Rt[0] * bb + g.U[0] * cc, g.c[1] + g.F[1] * a + g.Rt[1] * bb + g.U[1] * cc, g.c[2] + g.F[2] * a + g.Rt[2] * bb + g.U[2] * cc]);
            return out;
        }
        function cameraParts(cell, res) {
            const g = cameraGeo(cell, res), L = cell.camera.lensGeometry, fill = cell.camera.elevationColor;
            return [
                { id: 'body', pts: boxPts(g, -L.bodyHeight / 2, L.bodyHeight / 2, L.bodyWidth / 2, 14), fill, stroke: INK },
                { id: 'lens', pts: boxPts(g, L.bodyHeight / 2, L.bodyHeight / 2 + L.lensLength, L.lensWidth / 2, L.lensWidth / 2 - 1), fill: '#1F2937', stroke: INK },
                { id: 'finder', pts: boxPts(g, -L.bodyHeight / 2 - 4, -L.bodyHeight / 2, 8, 3).map(p => [p[0] + g.U[0] * 14, p[1] + g.U[1] * 14, p[2] + g.U[2] * 14]), fill: INK, stroke: INK }
            ];
        }
        /* ------------------------------- avisos ------------------------------- */
        function warnings(cell, res) {
            const out = [], g = cameraGeo(cell, res), cam = cell.camera;
            for (const ch of cell.characters) {
                const r = res.characters[ch.id], top = topOf(cell, res, ch), bot = r.baseZ * H;
                if (core.dist(ch, cam) < K['MANNEQUIN_R'] + 12 && g.c[2] >= bot && g.c[2] <= top)
                    out.push({ code: 'CAMERA_INSIDE_MANNEQUIN', message: 'A câmera está dentro do manequim ' + ch.id });
            }
            const ids = cell.focus.targetType === 'scene' ? [] : cell.focus.targetIds;
            for (const ch of cell.characters.filter(c => ids.includes(c.id))) {
                const t = Math.max(1, core.dist(cam, ch)), axisZ = g.c[2] + Math.tan(g.phi) * t, half = t * Math.tan(g.vHalf), r = res.characters[ch.id];
                const top = topOf(cell, res, ch), bot = r.baseZ * H;
                if (top > axisZ + half + 0.5)
                    out.push({ code: 'SUBJECT_CROPPED_TOP', message: 'A cabeça de ' + ch.id + ' fica acima do campo de visão vertical' });
                if (bot < axisZ - half - 0.5)
                    out.push({ code: 'SUBJECT_CROPPED_BOTTOM', message: 'Os pés de ' + ch.id + ' ficam abaixo do campo de visão vertical (enquadramento fechado em altura)' });
            }
            const frame = cell.framing;
            if (g.zt > 0 && Math.abs(g.phi) > rad(75))
                out.push({ code: 'CAMERA_PITCH_EXTREME', message: 'Inclinação da câmera acima de 75° (' + n(deg(g.phi)) + '°)' });
            if (frame.depthFar <= frame.depthNear)
                out.push({ code: 'FRAMING_DEPTH', message: 'Profundidade de campo inválida' });
            return out;
        }
        /* ------------------------------- desenho ------------------------------- */
        function ruler() {
            let s = '<g data-vb-kind="height-ruler" stroke="' + GRID + '" stroke-width="1">';
            for (let k = 0; k <= 6; k++) {
                const y = GROUND - k * H / 2, len = k % 2 === 0 ? 18 : 9;
                s += '<line x1="0" y1="' + n(y) + '" x2="' + len + '" y2="' + n(y) + '"/>';
            }
            return s + '<line x1="4" y1="' + GROUND + '" x2="4" y2="' + n(GROUND - 3 * H) + '"/></g>';
        }
        function compassKey(alpha) {
            /* Mini-planta (sem texto): círculo com marca do Norte e um ponto onde está o observador. */
            const vw = core.norm360(alpha + 180), px = 560 + 15 * Math.sin(rad(vw)), py = 36 - 15 * Math.cos(rad(vw));
            return '<g data-vb-kind="view-key" fill="none" stroke="' + LINE + '" stroke-width="1.5"><circle cx="560" cy="36" r="15"/><path d="M560 15V21" stroke-width="2.5"/><circle cx="' + n(px) + '" cy="' + n(py) + '" r="4" fill="' + INK + '"/></g>';
        }
        function drawPart(c, p) {
            return '<polygon data-vb-part="' + p.id + '" points="' + poly(c, p.pts) + '" fill="' + p.fill + '" stroke="' + p.stroke + '" stroke-width="' + (p.w ?? 1.6) + '" stroke-linejoin="round"/>';
        }
        function noseVisible(ch, c) { return dot([Math.sin(rad(ch.rotation)), -Math.cos(rad(ch.rotation)), 0], c.d) < 0.05; }
        function viewGroup(cell, viewId, res) {
            const { view, alpha } = viewOf(viewId, cell), c = makeCtx(cell, alpha, res), g = cameraGeo(cell, res), fr = cell.framing;
            c0.d = c.d;
            const items = [];
            for (const ch of cell.characters) {
                const parts = mannequinParts(c, ch).filter(p => p.id !== 'nose' || noseVisible(ch, c)), sorted = parts.map((p, i) => ({ p, d: mean(p.pts) + (p.id === 'nose' ? -9 : 0), i }));
                /* dentro do manequim: de trás para a frente; a plataforma sempre primeiro */
                sorted.sort((a, b) => (a.p.id === 'platform' ? -1 : b.p.id === 'platform' ? 1 : 0) || b.d - a.d || a.i - b.i);
                items.push({ depth: dot([ch.x, ch.y, 0], c.d), svg: '<g data-vb-kind="character" data-vb-id="' + ch.id + '" data-vb-x="' + n(ch.x) + '" data-vb-y="' + n(ch.y) + '" data-vb-rotation="' + n(ch.rotation) + '">' + sorted.map(x => drawPart(c, x.p)).join('') + '</g>' });
            }
            const cp = cameraParts(cell, res), cs = cp.map((p, i) => ({ p, d: mean(p.pts), i })).sort((a, b) => b.d - a.d || a.i - b.i);
            const foot = scr(c, [cell.camera.x, cell.camera.y, 0]), cpos = scr(c, g.c);
            let cams = '<g data-vb-kind="camera" data-vb-elevation="' + cell.camera.elevationLevel + '" data-vb-x="' + n(cell.camera.x) + '" data-vb-y="' + n(cell.camera.y) + '" data-vb-z="' + n(g.c[2]) + '" data-vb-pitch="' + n(deg(g.phi)) + '">' +
                '<line x1="' + n(foot[0]) + '" y1="' + n(foot[1]) + '" x2="' + n(cpos[0]) + '" y2="' + n(cpos[1] + 14) + '" stroke="' + GRID + '" stroke-width="1.5" stroke-dasharray="6 5"/>';
            cams += cs.map(x => drawPart(c, x.p)).join('') + '</g>';
            items.push({ depth: dot([cell.camera.x, cell.camera.y, 0], c.d), svg: cams });
            items.sort((a, b) => b.depth - a.depth);
            /* campo de visão vertical: quadrilátero entre as distâncias próxima/distante, nas duas bordas verticais do cone */
            const ray = (t, sgn) => {
                const ang = g.phi + sgn * g.vHalf, f = [Math.sin(rad(cell.camera.rotation)), -Math.cos(rad(cell.camera.rotation))];
                return [g.lens[0] + f[0] * Math.cos(ang) * t, g.lens[1] + f[1] * Math.cos(ang) * t, g.lens[2] + Math.sin(ang) * t];
            };
            const wedge = [ray(fr.depthNear, 1), ray(fr.depthFar, 1), ray(fr.depthFar, -1), ray(fr.depthNear, -1)].map(p => scr(c, p));
            const dash = fr.lineStyle === 'dashed' ? ' stroke-dasharray="12 8"' : '';
            const lensS = scr(c, g.lens), tgt = scr(c, [cell.focus.x, cell.focus.y, g.zt]);
            const field = '<g data-vb-kind="vertical-field" fill="none" stroke="' + LINE + '" stroke-width="2"' + dash + ' stroke-linejoin="round" stroke-linecap="round">' +
                '<path d="M' + wedge.map(p => n(p[0]) + ' ' + n(p[1])).join('L') + 'Z"/>' +
                '<line x1="' + n(lensS[0]) + '" y1="' + n(lensS[1]) + '" x2="' + n(wedge[0][0]) + '" y2="' + n(wedge[0][1]) + '"/><line x1="' + n(lensS[0]) + '" y1="' + n(lensS[1]) + '" x2="' + n(wedge[3][0]) + '" y2="' + n(wedge[3][1]) + '"/></g>' +
                '<line data-vb-kind="optical-axis" x1="' + n(lensS[0]) + '" y1="' + n(lensS[1]) + '" x2="' + n(tgt[0]) + '" y2="' + n(tgt[1]) + '" stroke="' + GRID + '" stroke-width="1"/>';
            const ret = '<g data-vb-kind="focus-reticle" transform="translate(' + n(tgt[0]) + ' ' + n(tgt[1]) + ')" fill="none" stroke="' + cell.focus.reticleColor + '" stroke-width="1.5"><circle r="9"/><circle r="3.5"/><path d="M-16 0H-6M6 0H16M0 -16V-6M0 6V16" stroke-linecap="round"/></g>';
            return '<g data-vb-kind="elevation-view" data-vb-view="' + view.id + '" data-vb-alpha="' + n(alpha) + '">' +
                '<rect width="' + CELL + '" height="' + CELL + '" fill="#FFFFFF"/><rect y="' + GROUND + '" width="' + CELL + '" height="' + (CELL - GROUND) + '" fill="#F3F4F6"/>' +
                '<line x1="0" y1="' + GROUND + '" x2="' + CELL + '" y2="' + GROUND + '" stroke="' + INK + '" stroke-width="2.5"/>' + ruler() + compassKey(alpha) + field +
                items.map(i => i.svg).join('') + ret + '</g>';
        }
        /* ------------------------------- documento ------------------------------- */
        const safeJson = (v) => JSON.stringify(v).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        function topGroup(cell) { return R.renderCell(cell).replace(/ transform="translate\(\d+ \d+\)"/, ' transform="translate(0 0)"'); }
        function renderSheet(meta) {
            const cell = meta.cell, res = resolve(cell, meta.options), views = meta.options.views;
            let body = '<g data-vb-kind="elevation-cell" data-vb-view="top" transform="translate(' + CELL + ' ' + CELL + ')"><rect width="' + CELL + '" height="' + CELL + '" fill="#FFFFFF"/>' + topGroup(cell) + '</g>';
            for (const id of views) {
                const v = VIEWS.find(x => x.id === id);
                body += '<g transform="translate(' + (v.slot % 3) * CELL + ' ' + Math.floor(v.slot / 3) * CELL + ')">' + viewGroup(cell, id, res) + '</g>';
            }
            const lines = [CELL, CELL * 2].map(p => '<line x1="' + p + '" y1="0" x2="' + p + '" y2="' + SHEET + '"/><line x1="0" y1="' + p + '" x2="' + SHEET + '" y2="' + p + '"/>').join('');
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SHEET + ' ' + SHEET + '" width="' + SHEET + '" height="' + SHEET + '" data-vb-format="visualboard-scene-elevations" data-vb-engine="' + ENGINE + '">' +
                '<metadata id="vb-elevation-model">' + safeJson({ format: 'visualboard-scene-elevations', formatVersion: 1, engineVersion: ENGINE, meta }) + '</metadata>' +
                '<rect width="' + SHEET + '" height="' + SHEET + '" fill="#FFFFFF"/>' + body +
                '<g data-vb-kind="dividers" stroke="#000000" stroke-width="3" fill="none">' + lines + '<rect width="' + SHEET + '" height="' + SHEET + '"/></g></svg>';
        }
        /** Uma vista avulsa (600×600), com o modelo embutido para reabrir. */
        function renderViewDocument(meta, viewId) {
            const res = resolve(meta.cell, meta.options);
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + CELL + ' ' + CELL + '" width="' + CELL + '" height="' + CELL + '" data-vb-format="visualboard-scene-elevation-view">' +
                '<metadata id="vb-elevation-model">' + safeJson({ format: 'visualboard-scene-elevations', formatVersion: 1, engineVersion: ENGINE, meta }) + '</metadata>' + viewGroup(meta.cell, viewId, res) +
                '<rect width="' + CELL + '" height="' + CELL + '" fill="none" stroke="#000000" stroke-width="3"/></svg>';
        }
        function parse(svg) {
            if (typeof svg !== 'string' || svg.length > 8 * 1024 * 1024)
                fail('INVALID_MODEL', 'SVG ausente ou grande demais');
            const m = /<metadata id="vb-elevation-model">([\s\S]*?)<\/metadata>/.exec(svg);
            if (!m)
                fail('INVALID_MODEL', 'O SVG não traz um modelo de elevações');
            let data;
            try {
                data = JSON.parse(m[1]);
            }
            catch {
                return fail('INVALID_MODEL', 'Modelo embutido ilegível');
            }
            if (data['format'] !== 'visualboard-scene-elevations' || data['formatVersion'] !== 1)
                fail('INVALID_MODEL', 'Formato de elevações não reconhecido');
            const meta = data['meta'];
            if (!meta || typeof meta !== 'object' || !meta.cell)
                return fail('INVALID_MODEL', 'Modelo de elevações incompleto');
            const sheet = core.assertSheetShape({ id: 'x', index: 0, seed: 0, cells: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ ...meta.cell, index: i })) });
            const cell = sheet.cells[meta.cell.index], g = cell.camera.lensGeometry;
            const bad = (m) => fail('INVALID_MODEL', 'Modelo de elevações inválido: ' + m);
            if (!/^#[0-9A-Fa-f]{6}$/.test(String(cell.focus.reticleColor)))
                bad('cor do retículo');
            if (!['dashed', 'solid'].includes(String(cell.framing.lineStyle)))
                bad('estilo de linha');
            if (!/^[\w.-]{1,64}$/.test(String(cell.themeRule.id)) || !cell.focus.targetIds.every(t => /^char-\d\d$/.test(t)))
                bad('identificadores');
            if (!g || !['bodyWidth', 'bodyHeight', 'lensWidth', 'lensLength'].every(k => isNum(g[k]) && g[k] > 0 && g[k] < 200))
                bad('geometria da lente');
            if (!isNum(cell.camera.referenceHeight) || !isNum(cell.framing.depthNear) || !isNum(cell.framing.depthFar) || cell.framing.halfAngle <= 0 || cell.framing.halfAngle >= 89)
                bad('câmera/enquadramento');
            if (typeof meta.sourceHash !== 'string' || meta.sourceHash.length > 20)
                bad('hash de origem');
            return { ...meta, cell, options: normalizeOptions(meta.options, cell) };
        }
        kernel.provide('sceneElevation', { H: () => H, ground: () => GROUND, limits: () => ({ ...LIMITS, poses: [...POSES] }), views: () => VIEWS.map(v => ({ ...v })), viewIds, normalizeOptions, resolve, cellHash, anchor, warnings, topOf,
            cameraPitch: (cell, res) => round2(deg(cameraGeo(cell, res).phi)), renderSheet, renderViewDocument, parse });
    }
});
