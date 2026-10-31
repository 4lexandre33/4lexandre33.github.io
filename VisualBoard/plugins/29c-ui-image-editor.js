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
    contractVersions: { 'ui.imageEditor': '1.0.0' },
    setup: async function (kernel) {
        const E = await kernel.require('imageEdit');
        const C = await kernel.require('imageCommands');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const TABS = [['grid', '▦ Grade'], ['bg', '◌ Fundo'], ['contour', '✂ Contorno'], ['crop', '⛶ Recorte'], ['adjust', '🎚 Ajustes']];
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
        const P = {
            grid: { rows: 3, cols: 3, gap: 0, margin: 0, direction: 'ltr', trim: false },
            bg: { mode: 'edge', color: null, tolerance: 12, gradientStep: 0, edgeSoft: 1, trim: false },
            contour: { color: null, tolerance: 25, close: 1, others: [], mode: 'auto',
                seeds: [], grow: 0, feather: 0, padding: 2 },
            crop: { x: 0, y: 0, width: 1, height: 1 }
        };
        function paramsOf(t) {
            if (t === 'grid') {
                const g = P.grid;
                return { rows: g.rows, cols: g.cols, gap: g.gap, marginTop: g.margin, marginRight: g.margin, marginBottom: g.margin, marginLeft: g.margin, direction: g.direction, trim: g.trim };
            }
            if (t === 'bg') {
                const b = P.bg;
                return { mode: b.mode, ...(b.color ? { color: b.color } : {}), tolerance: b.tolerance, gradientStep: b.gradientStep, edgeSoft: b.edgeSoft, trim: b.trim };
            }
            if (t === 'contour') {
                const c = P.contour;
                return { color: c.color ?? [0, 0, 0], tolerance: c.tolerance, close: c.close, others: c.others, mode: c.mode, seeds: c.seeds, grow: c.grow, feather: c.feather, padding: c.padding };
            }
            return { ...P.crop };
        }
        const opOf = (t) => t === 'grid' ? 'grid' : t === 'bg' ? 'removeBackground' : t === 'contour' ? 'cutByContour' : 'crop';
        /* ---------------- carregar imagem ---------------- */
        const usable = () => S.assets.filter(a => A.blobs.has(a.id));
        async function loadSource(id) {
            assetId = id;
            src = null;
            srcPixels = null;
            palette = [];
            clearResult();
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
            timer = window.setTimeout(() => { timer = null; void run(); }, delay);
        }
        async function run() {
            if (!root || !assetId || !src)
                return;
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
            const mine = ++token;
            busy = true;
            message = '';
            renderResults();
            let res = null;
            try {
                res = await E.preview(assetId, opOf(tab), paramsOf(tab));
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
            if (res && tab === 'bg' && !P.bg.color && res.diagnostics.backgroundColor) { /* cor detectada exibida na lateral */ }
            renderSide();
            renderResults();
            drawStage();
        }
        /* ---------------- palco ---------------- */
        function scale() {
            if (!src)
                return 1;
            if (zoom > 0)
                return zoom;
            const box = stageBox;
            const aw = Math.max(80, (box?.clientWidth ?? 700) - 24), ah = Math.max(80, (box?.clientHeight ?? 500) - 24);
            return Math.min(8, aw / src.width, ah / src.height);
        }
        function drawStage() {
            if (!canvas || !src)
                return;
            const w = src.width, h = src.height;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            const s = scale();
            canvas.style.width = Math.round(w * s) + 'px';
            canvas.style.height = Math.round(h * s) + 'px';
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, w, h);
            const lw = Math.max(1, 1.5 / s);
            if (tab === 'bg' && result && result.pieces[0] && !showBefore) {
                const p = result.pieces[0];
                ctx.drawImage(p.canvas, p.x, p.y);
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
            if (!result)
                return;
            if (tab === 'contour' && result.overlay) {
                ctx.globalAlpha = 0.55;
                ctx.drawImage(result.overlay, 0, 0);
                ctx.globalAlpha = 1;
            }
            result.pieces.forEach((p, i) => {
                if (tab !== 'bg')
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
            const r = canvas.getBoundingClientRect();
            return { x: Math.floor((e.clientX - r.left) * canvas.width / r.width), y: Math.floor((e.clientY - r.top) * canvas.height / r.height) };
        }
        function onPointerDown(e) {
            if (!src)
                return;
            const pt = toImage(e);
            if (pick) {
                const c = pixelAt(pt.x, pt.y);
                if (!c)
                    return;
                const kind = pick;
                pick = null;
                canvas.style.cursor = '';
                if (kind === 'bg')
                    P.bg.color = c;
                else if (kind === 'contour')
                    P.contour.color = c;
                else if (kind === 'other') {
                    if (P.contour.others.length < 8)
                        P.contour.others.push(c);
                }
                else if (kind === 'seed')
                    P.contour.seeds.push({ x: pt.x, y: pt.y });
                renderSide();
                schedule(0);
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
            if (!cropDrag || !src)
                return;
            const pt = toImage(e), x0 = Math.max(0, Math.min(cropDrag.x, pt.x)), y0 = Math.max(0, Math.min(cropDrag.y, pt.y));
            const x1 = Math.min(src.width, Math.max(cropDrag.x, pt.x) + 1), y1 = Math.min(src.height, Math.max(cropDrag.y, pt.y) + 1);
            P.crop = { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
            drawStage();
        }
        function onPointerUp() { if (cropDrag) {
            cropDrag = null;
            renderSide();
            schedule(0);
        } }
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
            box.appendChild(field('Linhas', number(g.rows, 1, 50, 1, v => { g.rows = Math.round(v); })));
            box.appendChild(field('Colunas', number(g.cols, 1, 50, 1, v => { g.cols = Math.round(v); })));
            const presets = el('div', 'vbie-presets');
            for (const [r, c] of [[2, 2], [3, 3], [3, 4], [4, 4], [1, 2], [2, 1]]) {
                const b = el('button', 'btn', r + '×' + c);
                b.type = 'button';
                b.addEventListener('click', () => { g.rows = r; g.cols = c; renderSide(); schedule(0); });
                presets.appendChild(b);
            }
            box.appendChild(presets);
            box.appendChild(slider('Calha (px)', g.gap, 0, 200, 1, v => { g.gap = v; }, 'Espaço descartado entre as células'));
            box.appendChild(slider('Margem (px)', g.margin, 0, 200, 1, v => { g.margin = v; }, 'Borda externa descartada'));
            box.appendChild(choice('Ordem', [['ltr', 'Esquerda → direita'], ['rtl', 'Direita → esquerda (mangá)']], g.direction, v => { g.direction = v; }, 'Define onde fica a coluna 1 e como as peças são numeradas'));
            box.appendChild(check('Aparar bordas transparentes', g.trim, v => { g.trim = v; }, 'Remove da peça o que for transparente e ignora células vazias'));
            box.appendChild(el('p', 'vbie-note', 'Todas as células cobrem a imagem inteira e diferem no máximo 1 px entre si.'));
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
        async function applyAdjust(operation, parameters) {
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
                    return; tab = t; pick = null; if (canvas)
                    canvas.style.cursor = ''; clearResult(); renderSide(); renderResults(); drawStage(); schedule(0); });
                tabs.appendChild(b);
            }
            side.appendChild(tabs);
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
            else
                adjustControls(box);
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
        function renderResults() {
            if (!resultsBox)
                return;
            resultsBox.textContent = '';
            const head = el('div', 'vbie-reshead');
            head.appendChild(el('strong', undefined, 'Resultado'));
            if (busy)
                head.appendChild(el('span', 'vbie-busy', 'calculando…'));
            resultsBox.appendChild(head);
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
                const bar = el('div', 'vbie-actions');
                const all = el('button', 'btn', 'Marcar todas');
                all.type = 'button';
                all.addEventListener('click', () => { checked = new Set(checked.size === result.pieces.length ? [] : result.pieces.map((_, i) => i)); renderResults(); drawStage(); });
                const save = el('button', 'btn primary', 'Salvar ' + checked.size + (checked.size === 1 ? ' imagem' : ' imagens'));
                save.type = 'button';
                save.disabled = !checked.size || busy;
                save.addEventListener('click', () => { void saveChecked(false); });
                const cloud = el('button', 'btn', '☁ Salvar e enviar ao catálogo');
                cloud.type = 'button';
                cloud.disabled = !checked.size || busy;
                cloud.title = 'Salva no projeto e também envia as imagens ao catálogo (Asset Hub), sem apagar nada';
                cloud.addEventListener('click', () => { void saveChecked(true); });
                bar.append(all, save, cloud);
                resultsBox.appendChild(bar);
                resultsBox.appendChild(el('p', 'vbie-note', 'A imagem original não é alterada. As novas ficam na biblioteca e um único Desfazer remove todas.'));
            }
        }
        async function sendToCatalog(list) {
            try {
                const hub = await kernel.require('assetHub');
                const origin = S.assets.find(a => a.id === assetId)?.name ?? 'imagem';
                let sent = 0;
                for (const a of list) {
                    const blob = A.blobs.get(a.id);
                    if (!blob)
                        continue;
                    await hub.upload(new File([blob], a.name, { type: blob.type || 'image/png' }), { tags: ['origem:editor-de-imagens', 'derivada-de:' + origin.replace(/[^\p{L}\p{N} _.\-]/gu, ' ').trim().slice(0, 60)] });
                    sent++;
                }
                toast(sent + (sent === 1 ? ' imagem enviada' : ' imagens enviadas') + ' ao catálogo.', 'ok');
            }
            catch (e) {
                message = 'Salvo no projeto, mas o catálogo não recebeu: ' + e.message;
            }
        }
        async function saveChecked(toCatalog) {
            if (!result || !checked.size || busy)
                return;
            busy = true;
            renderResults();
            try {
                const done = await E.commit(result, [...checked].sort((a, b) => a - b));
                message = '';
                toast(done.assets.length + (done.assets.length === 1 ? ' imagem salva' : ' imagens salvas') + ' na biblioteca.', 'ok');
                kernel.emit('assets:changed');
                if (toCatalog)
                    await sendToCatalog(done.assets);
            }
            catch (e) {
                message = e.message;
            }
            busy = false;
            renderResults();
            renderHeader();
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
        kernel.on('contextmenu:extend', payload => {
            const target = payload;
            target.items.push({ icon: '🖼', label: 'Editor de imagens…', action: () => { void open(); } });
        });
        kernel.provide('ui.imageEditor', { open, close: closeEditor, isOpen: () => !!root });
    }
});
