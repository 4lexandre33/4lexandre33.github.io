"use strict";
/* Scene Blocking — interface dentro do editor de imagens: configuração, geração em lote, galeria, ações por folha e por célula, exportação.
 * Só interface: geometria no motor, desenho no renderizador, ativos e histórico em sceneBlocking. */
definePlugin({
    id: 'ui-scene-blocking',
    version: '1.1.0',
    needs: ['sceneBlocking', 'sceneBlockingEngine', 'sceneBlockingCore', 'sceneBlockingRender', 'history', 'assets', 'state'],
    provides: ['ui.sceneBlocking'],
    uses: ['assetHub'],
    accepts: { sceneBlocking: '^1.1.0', sceneBlockingEngine: '^1.1.0', sceneBlockingCore: '^1.0.0', sceneBlockingRender: '^1.0.0', history: '^1.0.0', assets: '^1.0.0', state: '^1.0.0', assetHub: '^1.0.0' },
    contractVersions: { 'ui.sceneBlocking': '1.1.0' },
    setup: async function (kernel) {
        const SB = await kernel.require('sceneBlocking');
        const EN = await kernel.require('sceneBlockingEngine');
        const CORE = await kernel.require('sceneBlockingCore');
        const REN = await kernel.require('sceneBlockingRender');
        const HIST = await kernel.require('history');
        const A = await kernel.require('assets');
        const S = (await kernel.require('state')).data;
        const toast = (message, kind = 'error') => { kernel.emit('toast', { message, kind }); };
        function el(tag, cls, text) {
            const e = document.createElement(tag);
            if (cls)
                e.className = cls;
            if (text !== undefined)
                e.textContent = text;
            return e;
        }
        const btn = (label, title, fn, cls = 'btn') => { const b = el('button', cls, label); b.type = 'button'; b.title = title; b.addEventListener('click', fn); return b; };
        /* ---------------- estado ---------------- */
        let host = null;
        let onBack = null;
        let selected = null;
        let cellSel = null;
        let editing = null;
        let sel = null;
        const hidden = new Set();
        let liveEl = null;
        let busy = '';
        let note = '';
        let side = null, stage = null, right = null;
        const cfg = { quantityOfSpritesheets: 1, theme: 'REUNIÃO', formation: '', masterSeed: 123456, variation: 0.5, mode: 'automatic', min: 2, max: 8,
            posAuto: true, angle: 0, distance: 'auto', framing: 'auto', focus: 'auto' };
        const FOCUS_LABEL = { character: 'Personagem', pair: 'Dupla', group: 'Grupo', scene: 'Cena completa' };
        const DIST_LABEL = { near: 'Próxima', medium: 'Média', far: 'Distante' };
        const ELEV_LABEL = { E1: 'E1 · muito baixa', E2: 'E2 · mesmo nível', E3: 'E3 · muito acima' };
        function field(label, control, hint) {
            const r = el('div', 'vbie-field');
            r.append(el('span', 'vbie-label', label), control);
            if (hint)
                r.appendChild(el('span', 'vbie-note', hint));
            return r;
        }
        function num(value, min, max, step, label, on) {
            const i = el('input');
            i.type = 'number';
            i.min = String(min);
            i.max = String(max);
            i.step = String(step);
            i.value = String(value);
            i.setAttribute('aria-label', label);
            i.addEventListener('change', () => { const v = Number(i.value); if (Number.isFinite(v))
                on(Math.min(max, Math.max(min, step >= 1 ? Math.round(v) : v))); i.value = String(value); renderSide(); });
            return i;
        }
        function select(label, options, value, on) {
            const s = el('select');
            s.setAttribute('aria-label', label);
            for (const [v, t] of options) {
                const o = el('option', undefined, t);
                o.value = v;
                s.appendChild(o);
            }
            s.value = value;
            s.addEventListener('change', () => { on(s.value); renderSide(); });
            return s;
        }
        function themeStatus() {
            if (cfg.formation)
                return { ok: true, message: '' };
            try {
                EN.resolveTheme(cfg.theme);
                return { ok: true, message: '' };
            }
            catch {
                return { ok: false, message: 'Esta temática não tem regra registrada. Escolha uma formação abaixo (a frase não é interpretada).' };
            }
        }
        function config() {
            const c = { quantityOfSpritesheets: cfg.quantityOfSpritesheets, theme: cfg.theme || 'REUNIÃO', masterSeed: cfg.masterSeed, variation: cfg.variation,
                mannequinCountMode: cfg.mode, minMannequins: Math.min(cfg.min, cfg.max), maxMannequins: Math.max(cfg.min, cfg.max),
                cameraPosition: cfg.posAuto ? 'auto' : { angle: cfg.angle }, cameraDistance: cfg.distance, cameraFraming: cfg.framing, focusTarget: cfg.focus };
            if (cfg.formation)
                c['formation'] = cfg.formation;
            return c;
        }
        function renderSide() {
            if (!side)
                return;
            const keep = side.scrollTop;
            side.textContent = '';
            const box = el('div', 'vbie-controls');
            side.appendChild(box);
            box.appendChild(el('h3', 'vbsb-h', 'Geração'));
            box.appendChild(field('Folhas (3×3, 9 cenas cada)', num(cfg.quantityOfSpritesheets, 1, SB.limits().maxSheetsPerBatch, 1, 'Quantidade de folhas', v => { cfg.quantityOfSpritesheets = v; })));
            const theme = el('input');
            theme.type = 'text';
            theme.maxLength = 80;
            theme.value = cfg.theme;
            theme.setAttribute('aria-label', 'Temática');
            theme.setAttribute('list', 'vbsb-themes');
            theme.addEventListener('change', () => { cfg.theme = theme.value.trim(); cfg.formation = ''; renderSide(); });
            const dl = el('datalist');
            dl.id = 'vbsb-themes';
            for (const t of EN.themes()) {
                const o = el('option');
                o.value = t.label;
                dl.appendChild(o);
            }
            const themeBox = el('div', 'vbsb-theme');
            themeBox.append(theme, dl);
            box.appendChild(field('Temática', themeBox));
            const st = themeStatus();
            if (!st.ok) {
                box.appendChild(el('p', 'vbie-warn', st.message));
                const opts = [['', '— escolher formação —'], ...EN.themes().map(t => [t.id, t.label])];
                box.appendChild(field('Formação espacial', select('Formação espacial', opts, cfg.formation, v => { cfg.formation = v; })));
            }
            else if (cfg.formation)
                box.appendChild(el('p', 'vbie-note', 'Formação escolhida: ' + (EN.themes().find(t => t.id === cfg.formation)?.label ?? cfg.formation)));
            const seed = num(cfg.masterSeed, 0, 4294967295, 1, 'Semente', v => { cfg.masterSeed = v; });
            const dice = btn('🎲', 'Nova semente', () => { cfg.masterSeed = Math.floor(Math.random() * 4294967295); renderSide(); });
            const seedRow = el('div', 'vbie-colorrow');
            seedRow.append(seed, dice);
            box.appendChild(field('Semente (mesma semente = mesmo resultado)', seedRow));
            const va = el('input');
            va.type = 'range';
            va.min = '0';
            va.max = '1';
            va.step = '0.05';
            va.value = String(cfg.variation);
            va.setAttribute('aria-label', 'Variação');
            va.addEventListener('input', () => { cfg.variation = Number(va.value); });
            box.appendChild(field('Variação', va, '0 = formações regulares · 1 = muito irregulares'));
            box.appendChild(el('h3', 'vbsb-h', 'Manequins'));
            box.appendChild(field('Quantidade', select('Modo de quantidade', [['automatic', 'Automática'], ['fixed', 'Fixa (usa o mínimo)'], ['range', 'Intervalo']], cfg.mode, v => { cfg.mode = v; })));
            const mm = el('div', 'vbie-colorrow');
            mm.append(num(cfg.min, 1, 8, 1, 'Mínimo de manequins', v => { cfg.min = v; if (cfg.max < v)
                cfg.max = v; }), el('span', undefined, 'a'), num(cfg.max, 1, 8, 1, 'Máximo de manequins', v => { cfg.max = v; if (cfg.min > v)
                cfg.min = v; }));
            box.appendChild(field('Mínimo e máximo (1 a 8)', mm));
            box.appendChild(el('h3', 'vbsb-h', 'Câmera'));
            const pos = el('div', 'vbie-colorrow');
            pos.append(select('Posição', [['auto', 'Automática'], ['manual', 'Ângulo manual']], cfg.posAuto ? 'auto' : 'manual', v => { cfg.posAuto = v === 'auto'; }));
            if (!cfg.posAuto)
                pos.appendChild(num(cfg.angle, 0, 359, 1, 'Ângulo da câmera em graus (0 = norte)', v => { cfg.angle = v; }));
            box.appendChild(field('Posição', pos));
            box.appendChild(field('Distância', select('Distância', [['auto', 'Automática (3 · 3 · 3)'], ['near', 'Próxima'], ['medium', 'Média'], ['far', 'Distante']], cfg.distance, v => { cfg.distance = v; })));
            box.appendChild(field('Enquadramento', select('Enquadramento', [['auto', 'Automático'], ['wide', 'Amplo (tracejado)'], ['tight', 'Fechado (contínuo)']], cfg.framing, v => { cfg.framing = v; })));
            box.appendChild(field('Alvo de foco', select('Alvo de foco', [['auto', 'Automático'], ['character', 'Personagem'], ['pair', 'Dupla'], ['group', 'Grupo'], ['scene', 'Cena completa']], cfg.focus, v => { cfg.focus = v; })));
            box.appendChild(el('p', 'vbie-note', 'A elevação é fixa por coluna (1ª = E1 azul, 2ª = E2 laranja, 3ª = E3 roxa).'));
            const go = btn(busy === 'generate' ? 'Gerando…' : 'Gerar folhas', 'Cria as folhas SVG no projeto (um Desfazer remove o lote)', () => { void generate(); }, 'btn primary');
            go.disabled = !!busy || !st.ok && !cfg.formation;
            box.appendChild(go);
            if (note)
                box.appendChild(el('p', 'vbie-warn', note));
            side.scrollTop = keep;
        }
        async function generate() {
            if (busy)
                return;
            busy = 'generate';
            note = '';
            renderSide();
            await new Promise(r => setTimeout(r, 0));
            try {
                const out = await SB.generate(config());
                selected = out.assets[0]?.id ?? null;
                cellSel = null;
                if (out.warnings.length)
                    note = out.warnings.join(' ');
            }
            catch (e) {
                note = e.message;
                toast(note);
            }
            busy = '';
            renderSide();
            renderStage();
            renderRight();
        }
        /* ---------------- galeria e folha ---------------- */
        const sheets = () => SB.list();
        function renderStage() {
            if (!stage)
                return;
            stage.textContent = '';
            if (editing !== null && selected && sheets().some(x => x.id === selected)) {
                renderBoard(stage);
                return;
            }
            editing = null;
            const all = sheets();
            if (!all.length) {
                stage.appendChild(el('p', 'vbie-empty', 'Nenhuma folha ainda. Ajuste a configuração e use “Gerar folhas”. Elas ficam na biblioteca do projeto como SVG.'));
                return;
            }
            if (!selected || !all.some(s => s.id === selected))
                selected = all[0].id;
            const wrap = el('div', 'vbsb-stage');
            stage.appendChild(wrap);
            const strip = el('div', 'vbsb-strip');
            strip.setAttribute('role', 'listbox');
            strip.setAttribute('aria-label', 'Folhas geradas');
            for (const s of all) {
                const b = el('button', 'vbsb-thumb' + (s.id === selected ? ' on' : ''));
                b.type = 'button';
                b.setAttribute('role', 'option');
                b.setAttribute('aria-selected', String(s.id === selected));
                const img = el('img');
                img.alt = s.name;
                img.src = A.urls.get(s.id) ?? '';
                img.draggable = false;
                b.append(img, el('span', undefined, s.name));
                if (s.violations)
                    b.appendChild(el('span', 'vbsb-badge', '⚠ ' + s.violations));
                b.addEventListener('click', () => { selected = s.id; cellSel = null; renderStage(); renderRight(); });
                strip.appendChild(b);
            }
            wrap.appendChild(strip);
            const view = el('div', 'vbsb-view');
            wrap.appendChild(view);
            const sheet = el('div', 'vbsb-sheet');
            view.appendChild(sheet);
            const big = el('img', 'vbsb-big');
            big.alt = 'Folha ' + (all.find(s => s.id === selected)?.name ?? '');
            big.src = A.urls.get(selected) ?? '';
            big.draggable = false;
            sheet.appendChild(big);
            let detail = null;
            try {
                detail = SB.get(selected);
            }
            catch (e) {
                sheet.appendChild(el('p', 'vbie-warn', e.message));
            }
            const grid = el('div', 'vbsb-cells');
            sheet.appendChild(grid);
            for (let i = 0; i < 9; i++) {
                const c = detail?.sheet.cells[i];
                const b = el('button', 'vbsb-cell' + (cellSel === i ? ' on' : '') + (c && c.sceneMetadata.violations.length ? ' bad' : ''));
                b.type = 'button';
                b.setAttribute('aria-pressed', String(cellSel === i));
                b.setAttribute('aria-label', 'Célula ' + (i + 1) + (c ? ': ' + c.characters.length + ' manequins, câmera ' + c.camera.elevationLevel + ', enquadramento ' + (c.framing.type === 'wide' ? 'amplo' : 'fechado') + (c.locked ? ', bloqueada' : '') : ''));
                if (c?.locked)
                    b.appendChild(el('span', 'vbsb-lock', '🔒'));
                b.addEventListener('click', () => { cellSel = cellSel === i ? null : i; renderStage(); renderRight(); });
                grid.appendChild(b);
            }
        }
        /* ---------------- ações ---------------- */
        function download(name, data, mime) {
            const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        async function run(label, fn) {
            if (busy)
                return;
            busy = label;
            note = '';
            renderRight();
            try {
                await fn();
            }
            catch (e) {
                note = e.message;
                toast(note);
            }
            busy = '';
            renderStage();
            renderRight();
            renderSide();
        }
        const baseName = (id) => (S.assets.find(a => a.id === id)?.name ?? 'folha').replace(/\.svg$/i, '');
        /** `annotate`: junta ao arquivo as anotações semânticas derivadas do modelo da célula (nunca a pose). Sem escopo de escrita, o envio segue sem anotação. */
        async function toCatalog(ids, cell, annotate = false) {
            const hub = await kernel.require('assetHub');
            let sent = 0, annotated = 0;
            for (const id of ids) {
                const name = S.assets.find(a => a.id === id)?.name ?? 'folha.svg';
                const text = cell === undefined ? await SB.exportSvg(id) : await SB.exportCellSvg(id, cell);
                const semantic = annotate && cell !== undefined ? SB.cellSemantics(id, cell)[0]?.semantic : undefined;
                const res = await hub.upload(new File([text], cell === undefined ? name : name.replace(/\.svg$/i, '') + '_CELL_' + String(cell + 1).padStart(2, '0') + '.svg', { type: 'image/svg+xml' }), { tags: ['origem:scene-blocking', 'tipo:storyboard'], ...(semantic ? { semantic } : {}) });
                sent++;
                if (res && res.semanticApplied)
                    annotated++;
            }
            toast(sent + (sent === 1 ? ' arquivo enviado' : ' arquivos enviados') + ' ao catálogo' + (annotate ? ' (' + annotated + ' com anotações semânticas)' : '') + '.', 'ok');
        }
        function renderRight() {
            if (!right)
                return;
            const keep = right.scrollTop;
            right.textContent = '';
            const all = sheets();
            if (editing !== null && selected && all.some(x => x.id === selected)) {
                renderPanel(right);
                right.scrollTop = keep;
                return;
            }
            const box = el('div', 'vbie-controls');
            right.appendChild(box);
            if (!all.length || !selected) {
                box.appendChild(el('h3', 'vbsb-h', 'Folhas'));
                box.appendChild(el('p', 'vbie-note', 'Cada folha tem 9 cenas vistas de cima. O modelo fica guardado dentro do SVG: o arquivo reabre sozinho.'));
                importBlock(box);
                return;
            }
            const sum = all.find(s => s.id === selected);
            let detail;
            try {
                detail = SB.get(selected);
            }
            catch (e) {
                box.appendChild(el('p', 'vbie-warn', e.message));
                return;
            }
            box.appendChild(el('h3', 'vbsb-h', sum.name));
            box.appendChild(el('p', 'vbie-note', 'Tema “' + detail.config.theme + '” · semente ' + detail.config.masterSeed + ' · motor ' + detail.engineVersion + (sum.violations ? ' · ' + sum.violations + ' aviso(s) geométrico(s)' : ' · geometria válida')));
            const row1 = el('div', 'vbie-actions');
            const dis = !!busy;
            const rg = btn('↻ Regenerar folha', 'Refaz todas as células não bloqueadas (um Desfazer)', () => { void run('regenerar', async () => { const r = await SB.regenerate(selected, {}); note = r.skippedLocked ? r.skippedLocked + ' célula(s) bloqueada(s) foram preservadas.' : ''; }); });
            const dp = btn('⧉ Duplicar', 'Cria uma cópia editável; a original é preservada', () => { void run('duplicar', async () => { const c = await SB.duplicate(selected); selected = c.id; cellSel = null; }); });
            rg.disabled = dp.disabled = dis;
            row1.append(rg, dp);
            box.appendChild(row1);
            const row2 = el('div', 'vbie-actions');
            const sv = btn('⬇ SVG', 'Baixa a folha em SVG (vetorial, com o modelo embutido)', () => { void run('svg', async () => { download(baseName(selected) + '.svg', await SB.exportSvg(selected), 'image/svg+xml'); }); });
            const p1 = btn('⬇ PNG', 'PNG 1800×1800', () => { void run('png', async () => { download(baseName(selected) + '.png', await SB.exportPng(selected, { scale: 1 }), 'image/png'); }); });
            const p2 = btn('⬇ PNG 2×', 'PNG 3600×3600', () => { void run('png', async () => { download(baseName(selected) + '@2x.png', await SB.exportPng(selected, { scale: 2 }), 'image/png'); }); });
            sv.disabled = p1.disabled = p2.disabled = dis;
            row2.append(sv, p1, p2);
            box.appendChild(row2);
            const row3 = el('div', 'vbie-actions');
            const zipAll = btn('⬇ ZIP de todas as folhas', 'Um ZIP com um SVG por folha (SPRITESHEET_nn.svg)', () => { void run('zip', async () => { download('scene-blocking.zip', await SB.exportZip(all.map(s => s.id), { format: 'svg' }), 'application/zip'); }); });
            const zipCells = btn('⬇ ZIP das 9 células', 'Um SVG por célula desta folha', () => { void run('zip', async () => { download(baseName(selected) + '_celulas.zip', await SB.exportZip([selected], { format: 'svg', cells: true }), 'application/zip'); }); });
            const cloud = btn('☁ Enviar ao catálogo', 'Envia o SVG da folha ao Asset Hub, sem apagar nada', () => { void run('catálogo', async () => { await toCatalog([selected]); }); });
            const cloudCells = btn('☁ Catalogar as 9 células com anotações', 'Envia cada célula como SVG ao catálogo com assunto, nº de manequins, elevação, distância e enquadramento já preenchidos (a pose fica em branco: o gerador não a define)', () => { void run('catálogo', async () => { for (let k = 0; k < 9; k++)
                await toCatalog([selected], k, true); }); });
            zipAll.disabled = zipCells.disabled = cloud.disabled = cloudCells.disabled = dis;
            row3.append(zipAll, zipCells, cloud, cloudCells);
            box.appendChild(row3);
            if (cellSel === null)
                box.appendChild(el('p', 'vbie-note', 'Clique numa célula da folha para ver os detalhes, regenerar partes e bloquear.'));
            else
                cellBlock(box, detail, cellSel, dis);
            importBlock(box);
            if (note)
                box.appendChild(el('p', 'vbie-warn', note));
            right.scrollTop = keep;
        }
        function cellBlock(box, d, i, dis) {
            const c = d.sheet.cells[i];
            box.appendChild(el('h3', 'vbsb-h', 'Célula ' + (i + 1)));
            const info = el('ul', 'vbsb-info');
            for (const t of [
                c.characters.length + ' manequim' + (c.characters.length === 1 ? '' : 's') + ' · formação ' + c.themeRule.id + ' (' + c.themeRule.variant + ')',
                'Câmera ' + ELEV_LABEL[c.camera.elevationLevel] + ' · distância ' + DIST_LABEL[c.camera.distanceLevel].toLowerCase(),
                'Enquadramento ' + (c.framing.type === 'wide' ? 'amplo (tracejado)' : 'fechado (contínuo)') + ' · campo ' + c.framing.halfAngle + '°',
                'Foco: ' + FOCUS_LABEL[c.focus.targetType] + ' (' + c.focus.targetIds.length + ')'
            ])
                info.appendChild(el('li', undefined, t));
            box.appendChild(info);
            for (const v of c.sceneMetadata.violations)
                box.appendChild(el('p', 'vbie-warn', '⚠ ' + v.message));
            for (const n of c.sceneMetadata.notes)
                box.appendChild(el('p', 'vbie-note', n));
            const parts = [['all', '↻ Tudo', 'Refaz manequins, câmera e enquadramento'], ['characters', '↻ Manequins', 'Refaz posições e orientações (e o que depende delas)'],
                ['camera', '↻ Câmera', 'Muda só a posição da câmera; os manequins não se mexem'], ['framing', '↻ Enquadramento', 'Escolhe outro alvo de foco e recalcula a área']];
            const row = el('div', 'vbie-actions');
            for (const [p, label, title] of parts) {
                const b = btn(label, title, () => { void run('regenerar', async () => { await SB.regenerate(selected, { cell: i, part: p }); }); });
                b.disabled = dis || c.locked;
                row.appendChild(b);
            }
            box.appendChild(row);
            const locks = el('div', 'vbsb-locks');
            const lock = (label, on, fn) => {
                const l = el('label', 'vbsb-lockrow');
                const cb = el('input');
                cb.type = 'checkbox';
                cb.checked = on;
                cb.disabled = dis;
                cb.addEventListener('change', () => { void run('trava', async () => { await SB.setLock(selected, i, fn(cb.checked)); }); });
                l.append(cb, el('span', undefined, label));
                locks.appendChild(l);
            };
            lock('🔒 Bloquear a célula inteira', c.locked, v => ({ cell: v }));
            lock('Bloquear manequins', c.lockedParts.characters, v => ({ parts: { characters: v } }));
            lock('Bloquear câmera', c.lockedParts.camera, v => ({ parts: { camera: v } }));
            lock('Bloquear enquadramento', c.lockedParts.framing, v => ({ parts: { framing: v } }));
            box.appendChild(locks);
            const ex = el('div', 'vbie-actions');
            const s = btn('⬇ Célula SVG', 'SVG 600×600 desta célula', () => { void run('svg', async () => { download(baseName(selected) + '_CELL_' + String(i + 1).padStart(2, '0') + '.svg', await SB.exportCellSvg(selected, i), 'image/svg+xml'); }); });
            const p = btn('⬇ Célula PNG', 'PNG 600×600 desta célula', () => { void run('png', async () => { download(baseName(selected) + '_CELL_' + String(i + 1).padStart(2, '0') + '.png', await SB.exportPng(selected, { cell: i, scale: 1 }), 'image/png'); }); });
            const cc = btn('☁ Catalogar célula com anotações', 'Envia esta célula ao catálogo já anotada (elevação, distância, enquadramento, manequins; direção do corpo se houver um só). A pose não é preenchida.', () => { void run('catálogo', async () => { await toCatalog([selected], i, true); }); });
            s.disabled = p.disabled = cc.disabled = dis;
            ex.append(s, p, cc);
            box.appendChild(ex);
            const ed = btn('✎ Editar célula', 'Abre o editor: arrastar manequins e câmera, inspetor numérico e camadas', () => { editing = i; sel = null; hidden.clear(); renderStage(); renderRight(); }, 'btn primary');
            ed.disabled = dis || c.locked;
            box.insertBefore(ed, info);
        }
        /* ---------------- editor de célula (B17) e camadas (B18) ---------------- */
        const KIND_LABEL = { character: 'Manequim', camera: 'Câmera', 'focus-reticle': 'Retículo de foco', 'capture-footprint': 'Área enquadrada', 'field-of-view': 'Campo de visão', 'optical-axis': 'Eixo óptico', characters: 'Manequins' };
        const announce = (m) => { if (liveEl)
            liveEl.textContent = m; };
        const cellOf = () => SB.get(selected).sheet.cells[editing];
        const selKey = (kind, id) => kind === 'character' ? 'character:' + id : kind;
        async function commit(edit, okMsg) {
            if (busy || !selected || editing === null)
                return;
            busy = 'editar';
            try {
                await SB.editCell(selected, editing, edit);
                note = '';
                announce(okMsg);
            }
            catch (e) {
                note = e.message;
                announce('Edição recusada: ' + note);
            }
            busy = '';
            renderStage();
            renderRight();
        }
        function groupFor(svg, key) {
            if (key.startsWith('character:'))
                return svg.querySelector('[data-vb-kind="character"][data-vb-id="' + key.slice(10) + '"]');
            return svg.querySelector('[data-vb-kind="' + key + '"]');
        }
        const keyOf = (target) => {
            const g = target?.closest('[data-vb-kind]');
            if (!g)
                return null;
            const k = g.getAttribute('data-vb-kind');
            if (k === 'character')
                return 'character:' + g.getAttribute('data-vb-id');
            return ['camera', 'focus-reticle', 'capture-footprint', 'field-of-view', 'optical-axis'].includes(k) ? k : null;
        };
        const hiddenKey = (key) => hidden.has(key) || (key.startsWith('character:') && hidden.has('characters'));
        function renderBoard(host2) {
            const cell = cellOf();
            const wrap = el('div', 'vbsb-editor');
            host2.appendChild(wrap);
            const bar = el('div', 'vbie-actions');
            bar.append(btn('← Voltar à folha', 'Fecha o editor de célula', () => { editing = null; sel = null; note = ''; renderStage(); renderRight(); }), btn('↶ Desfazer', 'Desfaz a última alteração do projeto', () => { void HIST.undo().then(() => { renderStage(); renderRight(); }); }), btn('↷ Refazer', 'Refaz a alteração desfeita', () => { void HIST.redo().then(() => { renderStage(); renderRight(); }); }));
            wrap.appendChild(bar);
            const board = el('div', 'vbsb-board');
            board.tabIndex = 0;
            board.setAttribute('role', 'application');
            board.setAttribute('aria-label', 'Célula ' + (editing + 1) + '. Use as camadas ao lado para escolher um objeto; setas movem, colchetes giram, Esc limpa a seleção.');
            wrap.appendChild(board);
            const doc = new DOMParser().parseFromString(REN.renderCellDocument(cell), 'image/svg+xml');
            const svg = document.importNode(doc.documentElement, true);
            svg.removeAttribute('width');
            svg.removeAttribute('height');
            svg.setAttribute('class', 'vbsb-svg');
            svg.setAttribute('role', 'img');
            svg.setAttribute('aria-label', 'Vista de cima da célula ' + (editing + 1));
            board.appendChild(svg);
            for (const k of hidden) {
                if (k === 'characters')
                    svg.querySelectorAll('[data-vb-kind="characters"]').forEach(g => (g.style.display = 'none'));
                else {
                    const g = groupFor(svg, k);
                    if (g)
                        g.style.display = 'none';
                }
            }
            liveEl = el('div', 'vbsb-sr');
            liveEl.setAttribute('role', 'status');
            liveEl.setAttribute('aria-live', 'polite');
            wrap.appendChild(liveEl);
            if (note) {
                wrap.appendChild(el('p', 'vbie-warn', note));
            }
            const NS = 'http://www.w3.org/2000/svg';
            const mk = (tag, attrs) => { const e2 = document.createElementNS(NS, tag); for (const [a, b] of Object.entries(attrs))
                e2.setAttribute(a, b); return e2; };
            let handle = null;
            function overlay() {
                svg.querySelectorAll('[data-vb-ui]').forEach(n => n.remove());
                handle = null;
                if (!sel || hiddenKey(sel))
                    return;
                const g = groupFor(svg, sel);
                if (!g)
                    return;
                const ui = mk('g', { 'data-vb-ui': '1', 'pointer-events': 'none' });
                if (sel.startsWith('character:') || sel === 'camera') {
                    const x = Number(g.getAttribute('data-vb-x')), y = Number(g.getAttribute('data-vb-y'));
                    ui.appendChild(mk('circle', { cx: String(x), cy: String(y), r: sel === 'camera' ? '30' : '26', fill: 'none', stroke: '#2563eb', 'stroke-width': '2', 'stroke-dasharray': '5 4' }));
                    if (sel !== 'camera') {
                        const a = CORE.dir(Number(g.getAttribute('data-vb-rotation'))), hx = x + a.x * 46, hy = y + a.y * 46;
                        ui.appendChild(mk('line', { x1: String(x), y1: String(y), x2: String(hx), y2: String(hy), stroke: '#2563eb', 'stroke-width': '1.5' }));
                        handle = mk('circle', { 'data-vb-ui': 'handle', cx: String(hx), cy: String(hy), r: '7', fill: '#2563eb', stroke: '#fff', 'stroke-width': '2', 'pointer-events': 'all' });
                        handle.style.cursor = 'grab';
                    }
                }
                else {
                    const bb = g.getBBox(), tm = /translate\(([-\d.]+)[ ,]([-\d.]+)\)/.exec(g.getAttribute('transform') ?? ''), tx = tm ? Number(tm[1]) : 0, ty = tm ? Number(tm[2]) : 0;
                    ui.appendChild(mk('rect', { x: String(bb.x + tx - 4), y: String(bb.y + ty - 4), width: String(bb.width + 8), height: String(bb.height + 8), fill: 'none', stroke: '#2563eb', 'stroke-width': '2', 'stroke-dasharray': '5 4' }));
                }
                svg.appendChild(ui);
                if (handle)
                    svg.appendChild(handle);
            }
            overlay();
            const toSvg = (ev) => { const m = svg.getScreenCTM(); if (!m)
                return { x: 0, y: 0 }; const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse()); return { x: p.x, y: p.y }; };
            const K = CORE.CONST;
            const clampTo = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
            const CHAR_LO = K['MANNEQUIN_R'] + K['EDGE'], CAM_LO = K['CAMERA_R'] + K['EDGE'] + 6, CEL = K['CELL'];
            let drag = null;
            svg.addEventListener('pointerdown', ev => {
                if (busy)
                    return;
                const isHandle = ev.target.getAttribute?.('data-vb-ui') === 'handle';
                if (isHandle && sel) {
                    const g = groupFor(svg, sel);
                    const p = toSvg(ev);
                    drag = { mode: 'rotate', key: sel, ox: Number(g.getAttribute('data-vb-x')), oy: Number(g.getAttribute('data-vb-y')), sx: p.x, sy: p.y, x: 0, y: 0, rot: Number(g.getAttribute('data-vb-rotation')), moved: false };
                    svg.setPointerCapture(ev.pointerId);
                    ev.preventDefault();
                    return;
                }
                const key = keyOf(ev.target);
                if (!key || hiddenKey(key)) {
                    sel = null;
                    overlay();
                    renderRight();
                    return;
                }
                sel = key;
                board.focus();
                overlay();
                renderRight();
                if (key.startsWith('character:') || key === 'camera') {
                    const g = groupFor(svg, key), p = toSvg(ev);
                    drag = { mode: 'move', key, ox: Number(g.getAttribute('data-vb-x')), oy: Number(g.getAttribute('data-vb-y')), sx: p.x, sy: p.y, x: Number(g.getAttribute('data-vb-x')), y: Number(g.getAttribute('data-vb-y')), rot: Number(g.getAttribute('data-vb-rotation')), moved: false };
                    svg.setPointerCapture(ev.pointerId);
                }
            });
            svg.addEventListener('pointermove', ev => {
                if (!drag)
                    return;
                const g = groupFor(svg, drag.key), p = toSvg(ev);
                if (drag.mode === 'move') {
                    const lo = drag.key === 'camera' ? CAM_LO : CHAR_LO;
                    drag.x = round(clampTo(drag.ox + p.x - drag.sx, lo, CEL - lo));
                    drag.y = round(clampTo(drag.oy + p.y - drag.sy, lo, CEL - lo));
                    g.setAttribute('transform', 'translate(' + drag.x + ' ' + drag.y + ') rotate(' + drag.rot + ')');
                }
                else {
                    drag.rot = round(CORE.norm360(CORE.angleTo({ x: drag.ox, y: drag.oy }, p)));
                    g.setAttribute('transform', 'translate(' + drag.ox + ' ' + drag.oy + ') rotate(' + drag.rot + ')');
                }
                drag.moved = true;
            });
            const finish = (ev) => {
                const d = drag;
                drag = null;
                if (!d)
                    return;
                try {
                    svg.releasePointerCapture(ev.pointerId);
                }
                catch { /* já liberado */ }
                if (!d.moved)
                    return;
                if (d.mode === 'rotate')
                    void commit({ op: 'rotate_character', id: d.key.slice(10), rotation: d.rot }, 'Manequim girado para ' + d.rot + ' graus');
                else if (d.key === 'camera')
                    void commit({ op: 'move_camera', x: d.x, y: d.y }, 'Câmera movida para ' + d.x + ', ' + d.y);
                else
                    void commit({ op: 'move_character', id: d.key.slice(10), x: d.x, y: d.y }, 'Manequim movido para ' + d.x + ', ' + d.y);
            };
            svg.addEventListener('pointerup', finish);
            svg.addEventListener('pointercancel', () => { drag = null; renderStage(); });
            board.addEventListener('keydown', ev => {
                if (busy)
                    return;
                if (ev.key === 'Escape') {
                    sel = null;
                    overlay();
                    renderRight();
                    return;
                }
                if (!sel)
                    return;
                const g = groupFor(svg, sel);
                if (!g)
                    return;
                const step = ev.shiftKey ? 10 : 2, x = Number(g.getAttribute('data-vb-x')), y = Number(g.getAttribute('data-vb-y'));
                const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
                const d = mv[ev.key];
                if (d && (sel === 'camera' || sel.startsWith('character:'))) {
                    ev.preventDefault();
                    if (sel === 'camera')
                        void commit({ op: 'move_camera', x: round(x + d[0]), y: round(y + d[1]) }, 'Câmera movida');
                    else
                        void commit({ op: 'move_character', id: sel.slice(10), x: round(x + d[0]), y: round(y + d[1]) }, 'Manequim movido');
                }
                else if ((ev.key === '[' || ev.key === ']') && sel.startsWith('character:')) {
                    ev.preventDefault();
                    const r = Number(g.getAttribute('data-vb-rotation')) + (ev.key === ']' ? 1 : -1) * (ev.shiftKey ? 45 : 5);
                    void commit({ op: 'rotate_character', id: sel.slice(10), rotation: round(CORE.norm360(r)) }, 'Manequim girado');
                }
            });
            announce('Editor da célula ' + (editing + 1) + ' aberto.');
        }
        const round = (v) => Math.round(v * 100) / 100;
        function renderPanel(host2) {
            const cell = cellOf();
            const box = el('div', 'vbie-controls');
            host2.appendChild(box);
            box.appendChild(el('h3', 'vbsb-h', 'Camadas · célula ' + (editing + 1)));
            const cellLocked = cell.locked;
            const lockRow = (label, on, lock, indent = false) => {
                const l = el('label', 'vbsb-lockrow' + (indent ? ' ind' : ''));
                const cb = el('input');
                cb.type = 'checkbox';
                cb.checked = on;
                cb.setAttribute('aria-label', label);
                cb.addEventListener('change', () => { void run('trava', async () => { await SB.setLock(selected, editing, cb.checked ? lock : invert(lock)); }); });
                l.append(cb, el('span', undefined, '🔒 ' + label));
                return l;
            };
            const invert = (l) => {
                const o = {};
                if (l.cell !== undefined)
                    o.cell = false;
                if (l.parts) {
                    o.parts = {};
                    for (const k of Object.keys(l.parts))
                        o.parts[k] = false;
                }
                return o;
            };
            const layer = (key, label, indent) => {
                const row = el('div', 'vbsb-layer' + (sel === key ? ' on' : ''));
                row.style.paddingLeft = String(indent * 14) + 'px';
                const eye = el('button', 'vbsb-eye', hidden.has(key) ? '🚫' : '👁');
                eye.type = 'button';
                eye.setAttribute('aria-pressed', String(!hidden.has(key)));
                eye.setAttribute('aria-label', (hidden.has(key) ? 'Mostrar ' : 'Ocultar ') + label);
                eye.title = 'Visibilidade (só no editor; não altera o arquivo)';
                eye.addEventListener('click', () => { if (hidden.has(key))
                    hidden.delete(key);
                else {
                    hidden.add(key);
                    if (sel === key)
                        sel = null;
                } renderStage(); renderRight(); });
                const pick = el('button', 'vbsb-pick', label);
                pick.type = 'button';
                pick.setAttribute('aria-pressed', String(sel === key));
                pick.addEventListener('click', () => { if (hidden.has(key))
                    return; sel = sel === key ? null : key; renderStage(); renderRight(); });
                row.append(eye, pick);
                return row;
            };
            const tree = el('div', 'vbsb-tree');
            tree.setAttribute('role', 'group');
            tree.setAttribute('aria-label', 'Hierarquia da célula');
            tree.appendChild(lockRow('Bloquear a célula inteira', cellLocked, { cell: true }));
            tree.appendChild(el('div', 'vbsb-group', 'Manequins (' + cell.characters.length + ')'));
            tree.appendChild(lockRow('Bloquear manequins', cell.lockedParts.characters, { parts: { characters: true } }, true));
            for (const c of cell.characters)
                tree.appendChild(layer('character:' + c.id, 'Manequim ' + c.slot + ' · ' + c.id, 1));
            tree.appendChild(el('div', 'vbsb-group', 'Câmera'));
            tree.appendChild(lockRow('Bloquear câmera', cell.lockedParts.camera, { parts: { camera: true } }, true));
            tree.appendChild(layer('camera', 'Câmera ' + cell.camera.elevationLevel, 1));
            tree.appendChild(el('div', 'vbsb-group', 'Enquadramento e foco'));
            tree.appendChild(lockRow('Bloquear enquadramento', cell.lockedParts.framing, { parts: { framing: true } }, true));
            for (const k of ['capture-footprint', 'field-of-view', 'optical-axis', 'focus-reticle'])
                tree.appendChild(layer(k, KIND_LABEL[k], 1));
            box.appendChild(tree);
            /* inspetor */
            box.appendChild(el('h3', 'vbsb-h', 'Inspetor'));
            if (note)
                box.appendChild(el('p', 'vbie-warn', note));
            const ni = (label, v, min, max, on, readonly = false) => {
                const i = el('input');
                i.type = 'number';
                i.min = String(min);
                i.max = String(max);
                i.step = '0.5';
                i.value = String(round(v));
                i.setAttribute('aria-label', label);
                i.disabled = !!busy || cell.locked || readonly;
                i.addEventListener('change', () => { const n = Number(i.value); if (Number.isFinite(n))
                    on(n);
                else {
                    i.value = String(round(v));
                } });
                return field(label, i);
            };
            const lim = CORE.CONST;
            if (!sel)
                box.appendChild(el('p', 'vbie-note', 'Selecione um objeto na célula ou nas camadas. Arraste manequins e câmera; use a alça azul para girar. A câmera sempre aponta ao retículo.'));
            else if (sel.startsWith('character:')) {
                const c = cell.characters.find(x => x.id === sel.slice(10));
                if (!c) {
                    sel = null;
                    return;
                }
                box.appendChild(el('p', 'vbie-note', c.id + ' · cor do slot ' + c.slot));
                box.append(ni('X', c.x, 0, lim['CELL'], n => { void commit({ op: 'move_character', id: c.id, x: n, y: c.y }, 'Posição alterada'); }), ni('Y', c.y, 0, lim['CELL'], n => { void commit({ op: 'move_character', id: c.id, x: c.x, y: n }, 'Posição alterada'); }), ni('Rotação (0° = norte, sentido horário)', c.rotation, 0, 359.99, n => { void commit({ op: 'rotate_character', id: c.id, rotation: n }, 'Rotação alterada'); }));
            }
            else if (sel === 'camera') {
                const c = cell.camera;
                box.append(ni('X', c.x, 0, lim['CELL'], n => { void commit({ op: 'move_camera', x: n, y: c.y }, 'Câmera movida'); }), ni('Y', c.y, 0, lim['CELL'], n => { void commit({ op: 'move_camera', x: c.x, y: n }, 'Câmera movida'); }), ni('Rotação (calculada: aponta ao retículo)', c.rotation, 0, 359.99, () => undefined, true));
                box.appendChild(el('p', 'vbie-note', 'Elevação ' + ELEV_LABEL[c.elevationLevel] + ' (fixa pela coluna) · distância ' + DIST_LABEL[c.distanceLevel].toLowerCase() + ' (recalculada).'));
            }
            else if (sel === 'focus-reticle') {
                box.appendChild(el('p', 'vbie-note', 'O retículo fica no centro do alvo. Escolha os manequins do alvo:'));
                const checks = el('div', 'vbsb-locks');
                for (const c of cell.characters) {
                    const l = el('label', 'vbsb-lockrow');
                    const cb = el('input');
                    cb.type = 'checkbox';
                    cb.checked = cell.focus.targetIds.includes(c.id);
                    cb.disabled = !!busy || cell.locked;
                    cb.addEventListener('change', () => {
                        const ids = new Set(cell.focus.targetIds);
                        if (cb.checked)
                            ids.add(c.id);
                        else
                            ids.delete(c.id);
                        if (!ids.size) {
                            cb.checked = true;
                            note = 'O alvo precisa ter ao menos um manequim.';
                            renderRight();
                            return;
                        }
                        void commit({ op: 'set_focus', targetIds: Array.from(ids) }, 'Alvo de foco alterado');
                    });
                    l.append(cb, el('span', undefined, 'Manequim ' + c.slot + ' · ' + c.id));
                    checks.appendChild(l);
                }
                box.appendChild(checks);
                box.appendChild(el('p', 'vbie-note', 'Tipo do alvo: ' + FOCUS_LABEL[cell.focus.targetType]));
            }
            else {
                const f = cell.framing;
                const sT = el('select');
                sT.setAttribute('aria-label', 'Tipo de enquadramento');
                sT.disabled = !!busy || cell.locked;
                for (const [v, t] of [['wide', 'Amplo (tracejado)'], ['tight', 'Fechado (contínuo)']]) {
                    const o = el('option', undefined, t);
                    o.value = v;
                    sT.appendChild(o);
                }
                sT.value = f.type;
                sT.addEventListener('change', () => { void commit({ op: 'set_framing_type', type: sT.value }, 'Enquadramento alterado'); });
                box.append(field('Tipo', sT), ni('Campo de visão (meio ângulo, °)', f.halfAngle, 5, 70, n => { void commit({ op: 'set_framing_area', halfAngle: n }, 'Área alterada'); }), ni('Profundidade próxima', f.depthNear, 6, 400, n => { void commit({ op: 'set_framing_area', depthNear: n }, 'Área alterada'); }), ni('Profundidade distante', f.depthFar, 14, 600, n => { void commit({ op: 'set_framing_area', depthFar: n }, 'Área alterada'); }));
                box.appendChild(el('p', 'vbie-note', 'A área deve conter todo o alvo e caber na célula; senão a edição é recusada.'));
            }
            const v = SB.get(selected).violations;
            box.appendChild(el('p', v.length ? 'vbie-warn' : 'vbie-note', v.length ? v.length + ' aviso(s) geométrico(s) na folha.' : 'Geometria válida' + (cell.manualEdits ? ' · ' + cell.manualEdits + ' edição(ões) manual(is)' : '') + '.'));
        }
        function importBlock(box) {
            const svgs = S.assets.filter(a => a.mimeType === 'image/svg+xml' && !SB.isSceneAsset(a.id));
            if (!svgs.length)
                return;
            box.appendChild(el('h3', 'vbsb-h', 'SVG da biblioteca'));
            box.appendChild(el('p', 'vbie-note', 'Um SVG exportado daqui traz o modelo dentro dele e volta a ser editável.'));
            const s = el('select');
            s.setAttribute('aria-label', 'SVG da biblioteca');
            const none = el('option', undefined, '— escolher —');
            none.value = '';
            s.appendChild(none);
            for (const a of svgs) {
                const o = el('option', undefined, a.name);
                o.value = a.id;
                s.appendChild(o);
            }
            const go = btn('Abrir como folha', 'Lê o modelo embutido e valida antes de aceitar', () => { if (!s.value)
                return; void run('abrir', async () => { const r = await SB.adopt(s.value); selected = r.id; cellSel = null; }); });
            const row = el('div', 'vbie-colorrow');
            row.append(s, go);
            box.appendChild(row);
        }
        function mount(h, opts) {
            unmount();
            host = h;
            onBack = opts?.onBack ?? null;
            h.textContent = '';
            side = el('div', 'vbie-side');
            stage = el('div', 'vbie-stage');
            right = el('div', 'vbie-results');
            h.append(side, stage, right);
            renderSide();
            renderStage();
            renderRight();
        }
        function unmount() { if (host)
            host.textContent = ''; host = null; editing = null; sel = null; liveEl = null; side = stage = right = null; onBack = null; }
        kernel.on('assets:changed', () => { if (host) {
            renderStage();
            renderRight();
        } });
        kernel.on('state:changed', () => { if (host && !busy) {
            renderStage();
            renderRight();
        } });
        void onBack;
        kernel.provide('ui.sceneBlocking', { mount, unmount, isMounted: () => !!host });
    }
});
