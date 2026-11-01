"use strict";
/* Fase 23 — núcleo de pixels do editor de imagens: funções puras (sem DOM) sobre RGBA e máscaras Uint8Array.
 * Usado pela interface, pelo MCP e pelos testes. Nada aqui lê ou grava ativos. */
definePlugin({
    id: 'image-edit-core',
    version: '1.0.0',
    needs: [],
    provides: ['imageEditCore'],
    uses: [],
    accepts: {},
    contractVersions: { imageEditCore: '1.2.0' },
    setup: function (kernel) {
        /* ------------------------------ cor (Lab) ------------------------------ */
        const LIN = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const c = i / 255;
            LIN[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        }
        const fLab = (t) => t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
        /** Converte sRGB 0–255 em Lab (D65). Resultado em `out`. */
        function lab(r, g, b, out) {
            const lr = LIN[r], lg = LIN[g], lb = LIN[b];
            const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / 0.95047;
            const y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
            const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / 1.08883;
            const fx = fLab(x), fy = fLab(y), fz = fLab(z);
            out[0] = 116 * fy - 16;
            out[1] = 500 * (fx - fy);
            out[2] = 200 * (fy - fz);
        }
        const clampByte = (v) => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
        const tmpA = new Float64Array(3), tmpB = new Float64Array(3);
        function deltaE(a, b) {
            lab(a[0], a[1], a[2], tmpA);
            lab(b[0], b[1], b[2], tmpB);
            return Math.hypot(tmpA[0] - tmpB[0], tmpA[1] - tmpB[1], tmpA[2] - tmpB[2]);
        }
        /** ΔE do pixel `i` (índice de pixel) à cor-alvo já em Lab. */
        function pixelDelta(d, i, t, tmp) {
            const o = i * 4;
            lab(d[o], d[o + 1], d[o + 2], tmp);
            return Math.hypot(tmp[0] - t[0], tmp[1] - t[1], tmp[2] - t[2]);
        }
        function colorMask(rgba, w, h, color, tolerance) {
            const out = new Uint8Array(w * h), t = new Float64Array(3), tmp = new Float64Array(3);
            lab(color[0], color[1], color[2], t);
            for (let i = 0; i < w * h; i++) {
                if (rgba[i * 4 + 3] < 128)
                    continue;
                if (pixelDelta(rgba, i, t, tmp) <= tolerance)
                    out[i] = 1;
            }
            return out;
        }
        /* ------------------------------ morfologia ------------------------------ */
        /** Dilatação por janela quadrada (raio r): um pixel liga se houver algum ligado na janela. O(n), separável. */
        function dilate(m, w, h, r) {
            if (r <= 0)
                return m.slice();
            const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
            for (let y = 0; y < h; y++) {
                const base = y * w;
                let c = 0;
                for (let x = 0; x <= Math.min(r, w - 1); x++)
                    c += m[base + x];
                for (let x = 0; x < w; x++) {
                    tmp[base + x] = c > 0 ? 1 : 0;
                    const add = x + r + 1, rem = x - r;
                    if (add < w)
                        c += m[base + add];
                    if (rem >= 0)
                        c -= m[base + rem];
                }
            }
            const cnt = new Int32Array(w);
            for (let y = 0; y <= Math.min(r, h - 1); y++)
                for (let x = 0; x < w; x++)
                    cnt[x] = cnt[x] + tmp[y * w + x];
            for (let y = 0; y < h; y++) {
                const base = y * w;
                for (let x = 0; x < w; x++)
                    out[base + x] = cnt[x] > 0 ? 1 : 0;
                const add = y + r + 1, rem = y - r;
                if (add < h)
                    for (let x = 0; x < w; x++)
                        cnt[x] = cnt[x] + tmp[add * w + x];
                if (rem >= 0)
                    for (let x = 0; x < w; x++)
                        cnt[x] = cnt[x] - tmp[rem * w + x];
            }
            return out;
        }
        const invert = (m) => { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++)
            o[i] = m[i] ? 0 : 1; return o; };
        /** Erosão: o fora da imagem conta como ligado (não "come" a borda). */
        function erode(m, w, h, r) {
            if (r <= 0)
                return m.slice();
            return invert(dilate(invert(m), w, h, r));
        }
        const closeMask = (m, w, h, r) => r <= 0 ? m.slice() : erode(dilate(m, w, h, r), w, h, r);
        /* ------------------------------ preenchimento ------------------------------ */
        /** Preenchimento por linhas (4 vizinhos) a partir de sementes: devolve o que é alcançável sem cruzar `blocked`. */
        function flood(w, h, blocked, seeds) {
            const vis = new Uint8Array(w * h);
            let stack = new Int32Array(4096), sp = 0;
            const push = (v) => { if (sp === stack.length) {
                const n = new Int32Array(stack.length * 2);
                n.set(stack);
                stack = n;
            } stack[sp++] = v; };
            for (let s = 0; s < seeds.length; s++) {
                const seed = seeds[s];
                if (blocked[seed] || vis[seed])
                    continue;
                push(seed);
                while (sp > 0) {
                    const i = stack[--sp];
                    if (vis[i] || blocked[i])
                        continue;
                    const y = (i / w) | 0, base = y * w, x = i - base;
                    let l = x, r = x;
                    while (l > 0 && !blocked[base + l - 1] && !vis[base + l - 1])
                        l--;
                    while (r < w - 1 && !blocked[base + r + 1] && !vis[base + r + 1])
                        r++;
                    for (let k = l; k <= r; k++)
                        vis[base + k] = 1;
                    for (let dy = -1; dy <= 1; dy += 2) {
                        const ny = y + dy;
                        if (ny < 0 || ny >= h)
                            continue;
                        const nb = ny * w;
                        let run = false;
                        for (let k = l; k <= r; k++) {
                            const free = !blocked[nb + k] && !vis[nb + k];
                            if (free && !run) {
                                push(nb + k);
                                run = true;
                            }
                            else if (!free)
                                run = false;
                        }
                    }
                }
            }
            return vis;
        }
        function borderSeeds(w, h) {
            const s = [];
            for (let x = 0; x < w; x++) {
                s.push(x);
                if (h > 1)
                    s.push((h - 1) * w + x);
            }
            for (let y = 1; y < h - 1; y++) {
                s.push(y * w);
                if (w > 1)
                    s.push(y * w + w - 1);
            }
            return s;
        }
        /** O que é alcançável a partir da borda da imagem sem atravessar `barrier` (4 vizinhos: contornos de 1 px na diagonal vedam). */
        const outsideOf = (barrier, w, h) => flood(w, h, barrier, borderSeeds(w, h));
        /** Crescimento por região a partir de sementes, com regra própria de aceitação (vizinhança de 4). */
        function grow(w, h, seeds, accept) {
            const vis = new Uint8Array(w * h), queue = new Int32Array(w * h);
            let head = 0, tail = 0;
            for (const s of seeds)
                if (!vis[s]) {
                    vis[s] = 1;
                    queue[tail++] = s;
                }
            while (head < tail) {
                const i = queue[head++], y = (i / w) | 0, x = i - y * w;
                if (x > 0 && !vis[i - 1] && accept(i, i - 1)) {
                    vis[i - 1] = 1;
                    queue[tail++] = i - 1;
                }
                if (x < w - 1 && !vis[i + 1] && accept(i, i + 1)) {
                    vis[i + 1] = 1;
                    queue[tail++] = i + 1;
                }
                if (y > 0 && !vis[i - w] && accept(i, i - w)) {
                    vis[i - w] = 1;
                    queue[tail++] = i - w;
                }
                if (y < h - 1 && !vis[i + w] && accept(i, i + w)) {
                    vis[i + w] = 1;
                    queue[tail++] = i + w;
                }
            }
            return vis;
        }
        /** Componentes conexos (4 vizinhos) de uma máscara. */
        function label(mask, w, h) {
            const labels = new Int32Array(w * h), queue = new Int32Array(w * h);
            const objects = [];
            let next = 0;
            for (let s = 0; s < w * h; s++) {
                if (!mask[s] || labels[s])
                    continue;
                const id = ++next;
                let head = 0, tail = 0, area = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
                labels[s] = id;
                queue[tail++] = s;
                while (head < tail) {
                    const i = queue[head++], y = (i / w) | 0, x = i - y * w;
                    area++;
                    if (x < x0)
                        x0 = x;
                    if (x > x1)
                        x1 = x;
                    if (y < y0)
                        y0 = y;
                    if (y > y1)
                        y1 = y;
                    if (x > 0 && mask[i - 1] && !labels[i - 1]) {
                        labels[i - 1] = id;
                        queue[tail++] = i - 1;
                    }
                    if (x < w - 1 && mask[i + 1] && !labels[i + 1]) {
                        labels[i + 1] = id;
                        queue[tail++] = i + 1;
                    }
                    if (y > 0 && mask[i - w] && !labels[i - w]) {
                        labels[i - w] = id;
                        queue[tail++] = i - w;
                    }
                    if (y < h - 1 && mask[i + w] && !labels[i + w]) {
                        labels[i + w] = id;
                        queue[tail++] = i + w;
                    }
                }
                objects.push({ id, area, x0, y0, x1, y1 });
            }
            return { labels, objects };
        }
        /** Borrão de caixa (raio r) de uma máscara 0/1 → alfa 0–255. */
        function boxAlpha(m, w, h, r) {
            const out = new Uint8Array(w * h);
            if (r <= 0) {
                for (let i = 0; i < m.length; i++)
                    out[i] = m[i] ? 255 : 0;
                return out;
            }
            const tmp = new Float32Array(w * h), win = 2 * r + 1;
            for (let y = 0; y < h; y++) {
                const base = y * w;
                let s = 0;
                for (let x = -r; x <= r; x++)
                    s += x >= 0 && x < w ? m[base + x] : 0;
                for (let x = 0; x < w; x++) {
                    tmp[base + x] = s / win;
                    const add = x + r + 1, rem = x - r;
                    if (add < w)
                        s += m[base + add];
                    if (rem >= 0)
                        s -= m[base + rem];
                }
            }
            const col = new Float32Array(w);
            for (let y = -r; y <= r; y++)
                if (y >= 0 && y < h)
                    for (let x = 0; x < w; x++)
                        col[x] = col[x] + tmp[y * w + x];
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++)
                    out[y * w + x] = Math.round((col[x] / win) * 255);
                const add = y + r + 1, rem = y - r;
                if (add < h)
                    for (let x = 0; x < w; x++)
                        col[x] = col[x] + tmp[add * w + x];
                if (rem >= 0)
                    for (let x = 0; x < w; x++)
                        col[x] = col[x] - tmp[rem * w + x];
            }
            return out;
        }
        const countOf = (m) => { let c = 0; for (let i = 0; i < m.length; i++)
            if (m[i])
                c++; return c; };
        /* ------------------------------ grade ------------------------------ */
        /** Bordas inteiras de `n` células em `length` px, com margens e calha. As células cobrem tudo e diferem em no máximo 1 px. */
        function gridEdges(length, n, before, after, gap) {
            const span = length - before - after - gap * (n - 1);
            if (!(span >= n))
                throw Error('A grade não cabe na imagem (' + n + ' células em ' + length + ' px)');
            const cell = span / n, out = [];
            for (let i = 0; i < n; i++)
                out.push([Math.round(before + i * (cell + gap)), Math.round(before + i * (cell + gap) + cell)]);
            return out;
        }
        /* ------------------------------ grade ajustável (cortes) ------------------------------ */
        /** Divide `length` em n partes usando cortes (frações 0–1 da imagem). O corte é o centro da calha. */
        function cutEdges(length, n, before, after, gap, cuts) {
            if (!cuts)
                return gridEdges(length, n, before, after, gap);
            if (cuts.length !== n - 1)
                throw Error('São necessários ' + (n - 1) + ' cortes, recebi ' + cuts.length);
            const hg = gap / 2, out = [];
            let start = before;
            for (let i = 0; i < n; i++) {
                const last = i === n - 1, end = last ? length - after : Math.round(cuts[i] * length - hg);
                if (!(end - start >= 2))
                    throw Error('A célula ' + (i + 1) + ' ficou estreita demais (corte fora de ordem ou perto demais da borda)');
                out.push([start, end]);
                if (!last)
                    start = Math.round(cuts[i] * length + hg);
            }
            if (out[n - 1][1] > length)
                throw Error('Os cortes passam do limite da imagem');
            return out;
        }
        function gridLayout(w, h, s) {
            const ys = cutEdges(h, s.rows, s.marginTop, s.marginBottom, s.gap, s.rowCuts);
            if (s.colCuts && s.colCuts.length !== s.rows)
                throw Error('colCuts precisa ter uma lista por fileira (' + s.rows + ')');
            const xsByRow = [], cells = [];
            for (let r = 0; r < s.rows; r++) {
                const xs = cutEdges(w, s.cols, s.marginLeft, s.marginRight, s.gap, s.colCuts ? s.colCuts[r] : null);
                xsByRow.push(xs);
                for (let c = 0; c < s.cols; c++)
                    cells.push({ r, c, x: xs[c][0], y: ys[r][0], width: xs[c][1] - xs[c][0], height: ys[r][1] - ys[r][0] });
            }
            return { ys, xsByRow, cells };
        }
        const r4 = (v) => Math.round(v * 10000) / 10000;
        /** Cortes da grade uniforme (ponto de partida para ajustar). */
        function defaultGridCuts(w, h, s) {
            const ys = gridEdges(h, s.rows, s.marginTop, s.marginBottom, s.gap), xs = gridEdges(w, s.cols, s.marginLeft, s.marginRight, s.gap);
            const rowCuts = [], colRow = [];
            for (let j = 0; j < s.rows - 1; j++)
                rowCuts.push(r4((ys[j][1] + s.gap / 2) / h));
            for (let i = 0; i < s.cols - 1; i++)
                colRow.push(r4((xs[i][1] + s.gap / 2) / w));
            const colCuts = [];
            for (let r = 0; r < s.rows; r++)
                colCuts.push(colRow.slice());
            return { colCuts, rowCuts };
        }
        /* ------------------------------ tinta que atravessa as linhas ------------------------------ */
        function inkOf(rgba, w, h, tolerance) {
            const est = estimateBackground(rgba, w, h, tolerance), t = new Float64Array(3), tmp = new Float64Array(3);
            lab(est.color[0], est.color[1], est.color[2], t);
            const ink = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++)
                if (rgba[i * 4 + 3] >= 128 && pixelDelta(rgba, i, t, tmp) > tolerance)
                    ink[i] = 1;
            return { ink, reliable: est.coverage >= 0.5 || est.coverage === 0, background: est.color };
        }
        /** Perfil vertical: para cada x, quantos pixels de tinta continuam dos dois lados (conn) e prefixo da tinta por coluna. */
        function profileV(ink, w, y0, y1) {
            const conn = new Int32Array(w + 1), col = new Int32Array(w);
            for (let y = y0; y < y1; y++) {
                const o = y * w;
                for (let x = 0; x < w; x++)
                    if (ink[o + x]) {
                        col[x]++;
                        if (x > 0 && ink[o + x - 1])
                            conn[x]++;
                    }
            }
            const pre = new Float64Array(w + 1);
            for (let x = 0; x < w; x++)
                pre[x + 1] = pre[x] + col[x];
            return { conn, pre };
        }
        function profileH(ink, w, h, x0, x1) {
            const conn = new Int32Array(h + 1), row = new Int32Array(h);
            for (let y = 0; y < h; y++) {
                const o = y * w;
                for (let x = x0; x < x1; x++)
                    if (ink[o + x]) {
                        row[y]++;
                        if (y > 0 && ink[o - w + x])
                            conn[y]++;
                    }
            }
            const pre = new Float64Array(h + 1);
            for (let y = 0; y < h; y++)
                pre[y + 1] = pre[y] + row[y];
            return { conn, pre };
        }
        function scoreAt(pr, p, gap, max) {
            const a = Math.max(0, Math.round(p - gap / 2)), b = Math.min(max, Math.round(p + gap / 2));
            return (p >= 0 && p <= max ? pr.conn[p] : 0) + (b > a ? pr.pre[b] - pr.pre[a] : 0);
        }
        function diagnoseGrid(rgba, w, h, s, opts) {
            const tol = opts?.tolerance ?? 18, minPx = opts?.minPixels ?? 2;
            const inkR = opts?.ink ? { ink: opts.ink, reliable: true, background: [255, 255, 255] } : inkOf(rgba, w, h, tol);
            const L = gridLayout(w, h, s), c0 = defaultGridCuts(w, h, s);
            const rowCuts = s.rowCuts ?? c0.rowCuts, colCuts = s.colCuts ?? c0.colCuts, issues = [];
            const x0 = s.marginLeft, x1 = w - s.marginRight;
            for (let j = 0; j < s.rows - 1; j++) {
                const pos = Math.round(rowCuts[j] * h), pr = profileH(inkR.ink, w, h, x0, x1), ink = scoreAt(pr, pos, s.gap, h);
                if (ink < minPx)
                    continue;
                const cells = new Set(), band0 = Math.max(0, Math.round(pos - s.gap / 2)), band1 = Math.min(h, Math.round(pos + s.gap / 2));
                for (let x = x0; x < x1; x++) {
                    let hit = !!(pos > 0 && pos < h && inkR.ink[(pos - 1) * w + x] && inkR.ink[pos * w + x]);
                    for (let y = band0; !hit && y < band1; y++)
                        if (inkR.ink[y * w + x])
                            hit = true;
                    if (!hit)
                        continue;
                    for (const r of [j, j + 1]) {
                        const xs = L.xsByRow[r];
                        for (let c = 0; c < s.cols; c++)
                            if (x >= xs[c][0] && x < xs[c][1])
                                cells.add(r * s.cols + c);
                    }
                }
                issues.push({ axis: 'h', row: -1, index: j, position: pos, ink, cells: [...cells].sort((a, b) => a - b).map(k => ({ r: Math.floor(k / s.cols), c: k % s.cols })) });
            }
            for (let r = 0; r < s.rows; r++) {
                const pr = profileV(inkR.ink, w, L.ys[r][0], L.ys[r][1]);
                for (let i = 0; i < s.cols - 1; i++) {
                    const pos = Math.round(colCuts[r][i] * w), ink = scoreAt(pr, pos, s.gap, w);
                    if (ink >= minPx)
                        issues.push({ axis: 'v', row: r, index: i, position: pos, ink, cells: [{ r, c: i }, { r, c: i + 1 }] });
                }
            }
            return { reliable: inkR.reliable, background: inkR.background, issues };
        }
        /** Procura, perto de cada divisória, a posição com menos tinta atravessando. Nunca mexe em divisórias já limpas. */
        function suggestGridCuts(rgba, w, h, s, opts) {
            const tol = opts?.tolerance ?? 18, minPx = opts?.minPixels ?? 2, win = Math.max(0.01, Math.min(0.4, opts?.window ?? 0.15));
            const inkR = inkOf(rgba, w, h, tol), start = defaultGridCuts(w, h, s);
            const rowCuts = (s.rowCuts ?? start.rowCuts).slice(), colCuts = (s.colCuts ?? start.colCuts).map(a => a.slice());
            const moved = [];
            const best = (score, cur, lo, hi) => {
                const sc = (p) => { const v = score(p); return v < minPx ? 0 : v; };
                if (sc(cur) === 0)
                    return cur;
                let min = Infinity, at = cur;
                for (let p = lo; p <= hi; p++) {
                    const v = sc(p);
                    if (v < min || (v === min && Math.abs(p - cur) < Math.abs(at - cur))) {
                        min = v;
                        at = p;
                    }
                }
                if (min >= sc(cur))
                    return cur;
                let a = at, b = at;
                while (a - 1 >= lo && sc(a - 1) === min)
                    a--;
                while (b + 1 <= hi && sc(b + 1) === min)
                    b++;
                return Math.round((a + b) / 2);
            };
            const MIN = 4;
            const base = { ...s, rowCuts: null, colCuts: null };
            const x0 = s.marginLeft, x1 = w - s.marginRight, y0 = s.marginTop, y1 = h - s.marginBottom;
            const prH = s.rows > 1 ? profileH(inkR.ink, w, h, x0, x1) : null;
            for (let j = 0; j < s.rows - 1; j++) {
                const cur = Math.round(rowCuts[j] * h), span = (y1 - y0) / s.rows, lim = Math.round(win * span);
                const prev = j === 0 ? y0 : Math.round(rowCuts[j - 1] * h), next = j === s.rows - 2 ? y1 : Math.round(rowCuts[j + 1] * h);
                const lo = Math.max(prev + MIN + Math.ceil(s.gap / 2), cur - lim), hi = Math.min(next - MIN - Math.ceil(s.gap / 2), cur + lim);
                if (lo > hi)
                    continue;
                const to = best(p => scoreAt(prH, p, s.gap, h), cur, lo, hi);
                if (to !== cur) {
                    moved.push({ axis: 'h', row: -1, index: j, from: cur, to });
                    rowCuts[j] = r4(to / h);
                }
            }
            base.rowCuts = rowCuts;
            const ys = cutEdges(h, s.rows, s.marginTop, s.marginBottom, s.gap, rowCuts);
            for (let r = 0; r < s.rows; r++) {
                const pr = profileV(inkR.ink, w, ys[r][0], ys[r][1]), row = colCuts[r], span = (x1 - x0) / s.cols, lim = Math.round(win * span);
                for (let i = 0; i < s.cols - 1; i++) {
                    const cur = Math.round(row[i] * w), prev = i === 0 ? x0 : Math.round(row[i - 1] * w), next = i === s.cols - 2 ? x1 : Math.round(row[i + 1] * w);
                    const lo = Math.max(prev + MIN + Math.ceil(s.gap / 2), cur - lim), hi = Math.min(next - MIN - Math.ceil(s.gap / 2), cur + lim);
                    if (lo > hi)
                        continue;
                    const to = best(p => scoreAt(pr, p, s.gap, w), cur, lo, hi);
                    if (to !== cur) {
                        moved.push({ axis: 'v', row: r, index: i, from: cur, to });
                        row[i] = r4(to / w);
                    }
                }
            }
            base.colCuts = colCuts;
            const before = diagnoseGrid(rgba, w, h, s, { tolerance: tol, minPixels: minPx, ink: inkR.ink }).issues;
            const after = diagnoseGrid(rgba, w, h, base, { tolerance: tol, minPixels: minPx, ink: inkR.ink }).issues;
            return { colCuts, rowCuts, moved, before, after, reliable: inkR.reliable, background: inkR.background };
        }
        /* ------------------------------ cores dominantes ------------------------------ */
        function dominantColors(rgba, w, h, max) {
            const bins = new Map();
            let total = 0, borderTotal = 0;
            for (let y = 0; y < h; y++)
                for (let x = 0; x < w; x++) {
                    const o = (y * w + x) * 4;
                    if (rgba[o + 3] < 128)
                        continue;
                    const isBorder = x === 0 || y === 0 || x === w - 1 || y === h - 1;
                    const k = ((rgba[o] >> 4) << 8) | ((rgba[o + 1] >> 4) << 4) | (rgba[o + 2] >> 4);
                    let e = bins.get(k);
                    if (!e) {
                        e = { n: 0, r: 0, g: 0, b: 0, border: 0 };
                        bins.set(k, e);
                    }
                    e.n++;
                    e.r += rgba[o];
                    e.g += rgba[o + 1];
                    e.b += rgba[o + 2];
                    if (isBorder)
                        e.border++;
                    total++;
                    if (isBorder)
                        borderTotal++;
                }
            const list = [...bins.values()].map(e => ({ n: e.n, border: e.border, rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)] })).sort((a, b) => b.n - a.n);
            const kept = [];
            for (const c of list) {
                const near = kept.find(k => deltaE(k.rgb, c.rgb) < 10);
                if (near) {
                    near.n += c.n;
                    near.border += c.border;
                }
                else
                    kept.push({ ...c });
            }
            kept.sort((a, b) => b.n - a.n);
            const hex = (v) => v.toString(16).padStart(2, '0');
            return kept.slice(0, Math.max(1, max)).map(c => ({ r: c.rgb[0], g: c.rgb[1], b: c.rgb[2], hex: '#' + hex(c.rgb[0]) + hex(c.rgb[1]) + hex(c.rgb[2]),
                share: total ? Math.round((c.n / total) * 10000) / 10000 : 0, borderShare: borderTotal ? Math.round((c.border / borderTotal) * 10000) / 10000 : 0 }));
        }
        /** Cor de fundo = a mais comum na borda da imagem; `coverage` = fração da borda dentro da tolerância dessa cor. */
        function estimateBackground(rgba, w, h, tolerance) {
            const bins = new Map();
            const seeds = borderSeeds(w, h);
            for (const i of seeds) {
                const o = i * 4;
                if (rgba[o + 3] < 128)
                    continue;
                const k = ((rgba[o] >> 3) << 10) | ((rgba[o + 1] >> 3) << 5) | (rgba[o + 2] >> 3);
                let e = bins.get(k);
                if (!e) {
                    e = { n: 0, r: 0, g: 0, b: 0 };
                    bins.set(k, e);
                }
                e.n++;
                e.r += rgba[o];
                e.g += rgba[o + 1];
                e.b += rgba[o + 2];
            }
            let best = null;
            for (const e of bins.values())
                if (!best || e.n > best.n)
                    best = e;
            if (!best)
                return { color: [255, 255, 255], coverage: 0 };
            const color = [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)];
            const t = new Float64Array(3), tmp = new Float64Array(3);
            lab(color[0], color[1], color[2], t);
            let ok = 0;
            for (const i of seeds)
                if (pixelDelta(rgba, i, t, tmp) <= tolerance)
                    ok++;
            return { color, coverage: Math.round((ok / seeds.length) * 1000) / 1000 };
        }
        /* ------------------------------ remover fundo ------------------------------ */
        function removeBackground(rgba, w, h, p) {
            const out = new Uint8ClampedArray(rgba), n = w * h;
            const est = p.color ? { color: p.color, coverage: 1 } : estimateBackground(rgba, w, h, p.tolerance);
            const color = est.color;
            if (p.mode === 'lineart') {
                /* Arte-final: o branco do papel vira transparente e a tinta mantém a cor (alfa pela escuridão). */
                const floor = p.lineFloor;
                for (let i = 0; i < n; i++) {
                    const o = i * 4, m = Math.min(rgba[o], rgba[o + 1], rgba[o + 2]) / 255;
                    const a = Math.max(0, Math.min(1, (1 - m - floor) / (1 - floor)));
                    if (a <= 0) {
                        out[o] = 0;
                        out[o + 1] = 0;
                        out[o + 2] = 0;
                        out[o + 3] = 0;
                        continue;
                    }
                    for (let c = 0; c < 3; c++)
                        out[o + c] = clampByte((rgba[o + c] - (1 - a) * 255) / a);
                    out[o + 3] = Math.round(rgba[o + 3] * a);
                }
                let gone = 0;
                for (let i = 0; i < n; i++)
                    if (out[i * 4 + 3] === 0)
                        gone++;
                return { out, color: [255, 255, 255], coverage: 1, removedShare: gone / n };
            }
            const t = new Float64Array(3), tmp = new Float64Array(3), tmp2 = new Float64Array(3);
            lab(color[0], color[1], color[2], t);
            const isBg = (i) => rgba[i * 4 + 3] < 128 || pixelDelta(rgba, i, t, tmp) <= p.tolerance;
            let bg;
            if (p.mode === 'global') {
                bg = new Uint8Array(n);
                for (let i = 0; i < n; i++)
                    if (isBg(i))
                        bg[i] = 1;
            }
            else {
                const seeds = borderSeeds(w, h).filter(isBg);
                const step = p.gradientStep, limit = Math.max(p.tolerance, 60);
                bg = grow(w, h, seeds, (from, to) => {
                    if (isBg(to))
                        return true;
                    if (step <= 0)
                        return false;
                    if (pixelDelta(rgba, to, t, tmp) > limit)
                        return false;
                    const o = from * 4;
                    lab(rgba[o], rgba[o + 1], rgba[o + 2], tmp2);
                    const q = to * 4;
                    lab(rgba[q], rgba[q + 1], rgba[q + 2], tmp);
                    return Math.hypot(tmp[0] - tmp2[0], tmp[1] - tmp2[1], tmp[2] - tmp2[2]) <= step;
                });
            }
            const fg = invert(bg);
            /* Borda suave: só do lado do objeto (nunca cria halo da cor do fundo), cor tirada dos vizinhos opacos. */
            const soft = Math.max(0, Math.min(3, Math.round(p.edgeSoft)));
            const alpha = soft > 0 ? boxAlpha(fg, w, h, soft) : null;
            for (let i = 0; i < n; i++) {
                const o = i * 4;
                if (!fg[i]) {
                    out[o] = 0;
                    out[o + 1] = 0;
                    out[o + 2] = 0;
                    out[o + 3] = 0;
                    continue;
                }
                if (alpha) {
                    const a = Math.min(255, alpha[i]);
                    if (a < 255) {
                        let sr = 0, sg = 0, sb = 0, c = 0;
                        const y = (i / w) | 0, x = i - y * w;
                        for (let dy = -soft; dy <= soft; dy++)
                            for (let dx = -soft; dx <= soft; dx++) {
                                const nx = x + dx, ny = y + dy;
                                if (nx < 0 || ny < 0 || nx >= w || ny >= h)
                                    continue;
                                const j = ny * w + nx;
                                if (fg[j] && alpha[j] === 255) {
                                    sr += rgba[j * 4];
                                    sg += rgba[j * 4 + 1];
                                    sb += rgba[j * 4 + 2];
                                    c++;
                                }
                            }
                        if (c) {
                            out[o] = Math.round(sr / c);
                            out[o + 1] = Math.round(sg / c);
                            out[o + 2] = Math.round(sb / c);
                        }
                        out[o + 3] = Math.round(rgba[o + 3] * (a / 255));
                    }
                }
            }
            return { out, color, coverage: est.coverage, removedShare: countOf(bg) / n };
        }
        /* ------------------------------ corte por contorno ------------------------------ */
        function cutByContour(rgba, w, h, p) {
            const n = w * h;
            const m1 = colorMask(rgba, w, h, p.color, p.tolerance), contourPixels = countOf(m1);
            const mc = closeMask(m1, w, h, p.close);
            const mcCount = Math.max(1, countOf(mc));
            /* Forma = tudo que o contorno envolve (inclui o traço e as linhas internas). */
            const shapeOf = (barrier) => invert(outsideOf(barrier, w, h));
            const single = () => shapeOf(mc);
            const ratioOf = (s) => (countOf(s) - mcCount) / mcCount;
            const othersRaw = new Uint8Array(n);
            for (const c of p.others) {
                const mo = colorMask(rgba, w, h, c, p.tolerance);
                for (let i = 0; i < n; i++)
                    if (mo[i])
                        othersRaw[i] = 1;
            }
            const others = closeMask(othersRaw, w, h, p.close);
            const hasOthers = countOf(others) > 0;
            const behind = () => {
                /* O fechamento vale para a união: é onde um traço encontra o outro que as falhas aparecem (cores misturadas pelo antialiasing). */
                const raw = new Uint8Array(n);
                for (let i = 0; i < n; i++)
                    raw[i] = m1[i] | othersRaw[i];
                const union = closeMask(raw, w, h, p.close);
                const all = shapeOf(union), own = shapeOf(others), s = new Uint8Array(n);
                for (let i = 0; i < n; i++)
                    s[i] = all[i] && !own[i] ? 1 : 0;
                return s;
            };
            let shape, modeUsed, suggestBehind = false;
            if (p.mode === 'behind' && hasOthers) {
                shape = behind();
                modeUsed = 'behind';
            }
            else {
                shape = single();
                modeUsed = 'single';
                /* Sem adivinhar: com outros contornos marcados, só SUGERE o modo "cobre" quando ele aumenta bastante um resultado que ele contém. */
                if (p.mode === 'auto' && hasOthers) {
                    const b = behind();
                    let both = 0;
                    for (let i = 0; i < n; i++)
                        if (shape[i] && b[i])
                            both++;
                    const sa = Math.max(1, countOf(shape));
                    suggestBehind = both / sa >= 0.9 && countOf(b) >= 1.25 * sa;
                }
            }
            const interiorRatio = Math.round(ratioOf(shape) * 1000) / 1000;
            const leak = interiorRatio < 1;
            const { labels, objects } = label(shape, w, h);
            let keep = objects.filter(o => o.area >= p.minArea);
            if (p.seeds.length) {
                const wanted = new Set();
                for (const s of p.seeds) {
                    const x = Math.round(s.x), y = Math.round(s.y);
                    if (x >= 0 && y >= 0 && x < w && y < h && labels[y * w + x])
                        wanted.add(labels[y * w + x]);
                }
                keep = keep.filter(o => wanted.has(o.id));
            }
            keep.sort((a, b) => b.area - a.area);
            const extra = Math.max(0, p.grow) + Math.max(0, p.feather) + Math.max(0, p.padding) + 1;
            const result = keep.map(o => {
                const ox = Math.max(0, o.x0 - extra), oy = Math.max(0, o.y0 - extra), x1 = Math.min(w - 1, o.x1 + extra), y1 = Math.min(h - 1, o.y1 + extra);
                const bw = x1 - ox + 1, bh = y1 - oy + 1;
                let mask = new Uint8Array(bw * bh);
                for (let y = 0; y < bh; y++)
                    for (let x = 0; x < bw; x++)
                        if (labels[(oy + y) * w + ox + x] === o.id)
                            mask[y * bw + x] = 1;
                if (p.grow > 0)
                    mask = dilate(mask, bw, bh, p.grow);
                else if (p.grow < 0)
                    mask = erode(mask, bw, bh, -p.grow);
                return { id: o.id, area: o.area, x0: o.x0, y0: o.y0, x1: o.x1, y1: o.y1, mask, bw, bh, ox, oy };
            });
            /* Máscara em tamanho real para mostrar na interface: 1 = traço, 2 = interior, 3 = objeto escolhido. */
            const overlay = new Uint8Array(n);
            const chosen = new Set(keep.map(o => o.id));
            for (let i = 0; i < n; i++)
                overlay[i] = labels[i] && chosen.has(labels[i]) ? 3 : shape[i] ? 2 : m1[i] ? 1 : 0;
            return { objects: result, modeUsed, leak, suggestBehind, interiorRatio, contourPixels, overlay };
        }
        /* ------------------------------ trocar cores ------------------------------ */
        /** Cor média do bin mais frequente (4 bits por canal) entre os pixels aceitos por `keep`. */
        function topColor(rgba, n, keep) {
            const bins = new Map();
            for (let i = 0; i < n; i++) {
                if (!keep(i))
                    continue;
                const o = i * 4, k = ((rgba[o] >> 4) << 8) | ((rgba[o + 1] >> 4) << 4) | (rgba[o + 2] >> 4);
                let e = bins.get(k);
                if (!e) {
                    e = { n: 0, r: 0, g: 0, b: 0 };
                    bins.set(k, e);
                }
                e.n++;
                e.r += rgba[o];
                e.g += rgba[o + 1];
                e.b += rgba[o + 2];
            }
            let best = null;
            for (const e of bins.values())
                if (!best || e.n > best.n)
                    best = e;
            return best ? [Math.round(best.r / best.n), Math.round(best.g / best.n), Math.round(best.b / best.n)] : null;
        }
        /** Contorno = cor mais comum na borda da silhueta (ou a cor escura dominante, se não há transparência); preenchimento = cor mais comum do resto. */
        function detectRoles(rgba, w, h) {
            const n = w * h, trans = new Uint8Array(n);
            let tcount = 0;
            for (let i = 0; i < n; i++)
                if (rgba[i * 4 + 3] < 128) {
                    trans[i] = 1;
                    tcount++;
                }
            const hasAlpha = tcount > n * 0.002;
            let outline = null, bgc = null;
            if (hasAlpha) {
                const near = dilate(trans, w, h, 2);
                outline = topColor(rgba, n, i => !trans[i] && !!near[i]);
            }
            else {
                const dom = dominantColors(rgba, w, h, 12);
                const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
                const dark = dom.filter(c => c.share >= 0.01).sort((a, b) => lum(a) - lum(b))[0];
                if (dark && lum(dark) < 120)
                    outline = [dark.r, dark.g, dark.b];
                bgc = estimateBackground(rgba, w, h, 12).color;
            }
            const tOut = new Float64Array(3), tBg = new Float64Array(3), tmp = new Float64Array(3);
            if (outline)
                lab(outline[0], outline[1], outline[2], tOut);
            if (bgc)
                lab(bgc[0], bgc[1], bgc[2], tBg);
            const fill = topColor(rgba, n, i => {
                if (trans[i])
                    return false;
                if (outline && pixelDelta(rgba, i, tOut, tmp) <= 20)
                    return false;
                if (bgc && pixelDelta(rgba, i, tBg, tmp) <= 12)
                    return false;
                return true;
            });
            return { outline, fill, hasAlpha };
        }
        function labToRgb(L, a, b) {
            const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
            const inv = (t) => t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787;
            const x = 0.95047 * inv(fx), y = inv(fy), z = 1.08883 * inv(fz);
            const lin = [3.2406 * x - 1.5372 * y - 0.4986 * z, -0.9689 * x + 1.8758 * y + 0.0415 * z, 0.0557 * x - 0.2040 * y + 1.0570 * z];
            const g = (v) => { const c = Math.max(0, Math.min(1, v)); return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055); };
            return [g(lin[0]), g(lin[1]), g(lin[2])];
        }
        /** Fundo ligado à borda de uma imagem SEM transparência (JPG, por exemplo): fica de fora das trocas de cor. */
        function borderBackground(rgba, w, h) {
            const n = w * h, est = estimateBackground(rgba, w, h, 12), barrier = new Uint8Array(n);
            const t = new Float64Array(3), tmp = new Float64Array(3);
            lab(est.color[0], est.color[1], est.color[2], t);
            for (let i = 0; i < n; i++)
                if (pixelDelta(rgba, i, t, tmp) > 14)
                    barrier[i] = 1;
            return outsideOf(barrier, w, h);
        }
        /** Troca cores sem mexer na transparência. A cor mais próxima (ΔE) de cada pixel decide o par; bordas suavizadas recebem peso parcial. */
        function recolor(rgba, w, h, p) {
            const n = w * h, out = new Uint8ClampedArray(rgba);
            let changed = 0;
            let roles = null;
            if (p.mode === 'uniform') {
                const c = p.color ?? [0, 0, 0];
                let hasT = false;
                for (let i = 0; i < n && !hasT; i++)
                    if (rgba[i * 4 + 3] < 128)
                        hasT = true;
                const bgm = hasT ? null : borderBackground(rgba, w, h);
                for (let i = 0; i < n; i++) {
                    const o = i * 4;
                    if (!rgba[o + 3] || (bgm && bgm[i]))
                        continue;
                    out[o] = c[0];
                    out[o + 1] = c[1];
                    out[o + 2] = c[2];
                    changed++;
                }
                return { out, changedShare: n ? changed / n : 0, roles };
            }
            let pairs = p.pairs;
            if (p.mode === 'roles') {
                roles = detectRoles(rgba, w, h);
                pairs = [];
                if (roles.outline && p.outlineTo)
                    pairs.push({ from: roles.outline, to: p.outlineTo });
                if (roles.fill && p.fillTo)
                    pairs.push({ from: roles.fill, to: p.fillTo });
            }
            if (!pairs.length)
                return { out, changedShare: 0, roles };
            /* Cada par vira uma "família": cores cromáticas casam pelo MATIZ (todo o degradê do azul, do claro ao escuro);
             * cores neutras (preto/branco/cinza) casam pela distância ΔE. O claro/escuro de cada pixel é mantido (keepShading). */
            const fam = pairs.map(pr => {
                const f = new Float64Array(3), t = new Float64Array(3);
                lab(pr.from[0], pr.from[1], pr.from[2], f);
                lab(pr.to[0], pr.to[1], pr.to[2], t);
                const cf = Math.hypot(f[1], f[2]);
                return { f, t, cf, chromatic: cf >= 12, hue: Math.atan2(f[2], f[1]) * 180 / Math.PI, ct: Math.hypot(t[1], t[2]) };
            });
            const tol = Math.max(1, p.tolerance), soft = 1.6, px = new Float64Array(3);
            const bgm = p.mode === 'roles' && roles && !roles.hasAlpha ? borderBackground(rgba, w, h) : null;
            /* Contorno e preenchimento NEUTROS (preto/branco/cinza): mapa de gradiente — escuro → cor do contorno, claro → cor do preenchimento,
             * tons intermediários (suavização das bordas, linhas finas) viram a mistura das duas. */
            if (p.mode === 'roles' && roles && roles.outline && roles.fill && p.outlineTo && p.fillTo && !fam[0].chromatic && !fam[1].chromatic) {
                const Lo = fam[0].f[0], Lf = Math.max(Lo + 1, fam[1].f[0]), O = fam[0].t, F = fam[1].t;
                for (let i = 0; i < n; i++) {
                    const o = i * 4;
                    if (!rgba[o + 3] || (bgm && bgm[i]))
                        continue;
                    lab(rgba[o], rgba[o + 1], rgba[o + 2], px);
                    const t = Math.max(0, Math.min(1, (px[0] - Lo) / (Lf - Lo)));
                    let L = O[0] + (F[0] - O[0]) * t;
                    const a2 = O[1] + (F[1] - O[1]) * t, b2 = O[2] + (F[2] - O[2]) * t;
                    if (p.keepShading)
                        L += px[0] - (Lo + t * (Lf - Lo));
                    const rgbOut = labToRgb(Math.max(0, Math.min(100, L)), a2, b2);
                    out[o] = clampByte(rgbOut[0]);
                    out[o + 1] = clampByte(rgbOut[1]);
                    out[o + 2] = clampByte(rgbOut[2]);
                    changed++;
                }
                return { out, changedShare: n ? changed / n : 0, roles };
            }
            /* 1ª passada: a que família cada pixel pertence (e com que "distância", em centésimos da tolerância). */
            const pick = new Int8Array(n).fill(-1), dist = new Uint8Array(n);
            for (let i = 0; i < n; i++) {
                const o = i * 4;
                if (!rgba[o + 3] || (bgm && bgm[i]))
                    continue;
                lab(rgba[o], rgba[o + 1], rgba[o + 2], px);
                const cp = Math.hypot(px[1], px[2]), hp = Math.atan2(px[2], px[1]) * 180 / Math.PI;
                let best = -1, bestScore = Infinity, bestRatio = Infinity;
                for (let k = 0; k < fam.length; k++) {
                    const m = fam[k];
                    let ratio, score;
                    if (m.chromatic) {
                        if (cp < 3)
                            continue; // cinza/branco/preto puros não pertencem a uma família colorida
                        let dh = Math.abs(hp - m.hue);
                        if (dh > 180)
                            dh = 360 - dh;
                        ratio = dh / tol;
                        score = ratio + Math.abs(px[0] - m.f[0]) / 60;
                    }
                    else {
                        const d = Math.hypot(px[0] - m.f[0], px[1] - m.f[1], px[2] - m.f[2]);
                        ratio = d / tol;
                        score = ratio;
                    }
                    if (ratio < soft && score < bestScore) {
                        best = k;
                        bestScore = score;
                        bestRatio = ratio;
                    }
                }
                if (best >= 0) {
                    pick[i] = best;
                    dist[i] = Math.min(255, Math.round(bestRatio * 100));
                }
            }
            /* Contorno × preenchimento da mesma cor (preenchimento escuro com contorno mais escuro): o contorno é FINO.
             * O que é escuro mas grosso (sobrevive a uma abertura morfológica) é preenchimento. */
            if (p.mode === 'roles' && roles && roles.outline && roles.fill && p.outlineTo && p.fillTo) {
                const oi = 0, fi = 1, r = Math.max(2, Math.round(Math.min(w, h) * 0.012)), loOut = fam[oi].f[0];
                const dark = new Uint8Array(n), fillM = new Uint8Array(n), light = new Float32Array(n);
                for (let i = 0; i < n; i++) {
                    if (pick[i] === oi)
                        dark[i] = 1;
                    else if (pick[i] === fi)
                        fillM[i] = 1;
                    if (pick[i] >= 0) {
                        const o = i * 4;
                        lab(rgba[o], rgba[o + 1], rgba[o + 2], px);
                        light[i] = px[0];
                    }
                }
                const thick = dilate(erode(dark, w, h, r), w, h, r); // partes escuras GROSSAS não são contorno
                const fillClosed = closeMask(fillM, w, h, 2); // fecha pontinhos de ruído (JPG) dentro do preenchimento
                for (let i = 0; i < n; i++)
                    if (pick[i] === oi && light[i] > loOut + 8 && (thick[i] || fillClosed[i]))
                        pick[i] = fi;
            }
            for (let i = 0; i < n; i++) {
                const best = pick[i];
                if (best < 0)
                    continue;
                const o = i * 4;
                lab(rgba[o], rgba[o + 1], rgba[o + 2], px);
                const cp = Math.hypot(px[1], px[2]), ratio = dist[i] / 100;
                const m = fam[best], wgt = ratio <= 1 ? 1 : (soft - ratio) / (soft - 1);
                const L = p.keepShading ? Math.max(0, Math.min(100, px[0] + (m.t[0] - m.f[0]))) : m.t[0];
                let a2 = m.t[1], b2 = m.t[2];
                if (m.ct < 3) {
                    a2 = 0;
                    b2 = 0;
                }
                else if (m.chromatic && p.keepShading) {
                    const c = Math.max(0.35, Math.min(1.5, cp / m.cf));
                    a2 *= c;
                    b2 *= c;
                }
                const rgbOut = labToRgb(L, a2, b2);
                for (let c = 0; c < 3; c++)
                    out[o + c] = clampByte(rgba[o + c] * (1 - wgt) + rgbOut[c] * wgt);
                changed++;
            }
            return { out, changedShare: n ? changed / n : 0, roles };
        }
        kernel.provide('imageEditCore', {
            deltaE, colorMask, dilate, erode, closeMask, outsideOf, label, gridEdges, gridLayout, defaultGridCuts, diagnoseGrid, suggestGridCuts, dominantColors, estimateBackground, cutByContour, removeBackground, detectRoles, recolor,
            /* usado só pela operação de ativos (alfa suave por objeto) */
            boxAlpha
        });
    }
});
