"use strict";
/* Modo Webtoon — interface: seletor de modo do board, criação e edição da tira, prévia em moldura de celular, plano de fatiamento,
 * exportação e conversões. Só interface: o modelo e as regras estão em webtoonCore e as operações em webtoon. O diálogo só existe
 * enquanto está aberto; não ocupa espaço no canvas. */
definePlugin({
    id: 'ui-webtoon',
    version: '1.0.0',
    needs: ['webtoon', 'webtoonCore', 'history', 'state', 'camera'],
    provides: ['ui.webtoon'],
    uses: [],
    accepts: { webtoon: '^1.0.0', webtoonCore: '^1.0.0', history: '^1.0.0', state: '^1.0.0', camera: '^1.0.0' },
    contractVersions: { 'ui.webtoon': '1.0.0' },
    setup: async function (kernel) {
        const W = await kernel.require('webtoon');
        const C = await kernel.require('webtoonCore');
        const HIST = await kernel.require('history');
        const S = (await kernel.require('state')).data;
        const cam = await kernel.require('camera');
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
        let modal = null, selected = null, busy = '', note = '', phoneUrl = null, phoneFor = '';
        const errText = (e) => e?.message ?? String(e);
        async function run(label, fn) {
            if (busy)
                return;
            busy = label;
            render();
            try {
                await fn();
                note = '';
            }
            catch (e) {
                note = errText(e);
                toast(note);
            }
            busy = '';
            render();
        }
        function download(name, blob) {
            const url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 8000);
        }
        function phoneRelease() { if (phoneUrl) {
            const u = phoneUrl;
            setTimeout(() => URL.revokeObjectURL(u), 8000);
            phoneUrl = null;
            phoneFor = '';
        } }
        const currentStrips = () => W.list();
        function current() {
            const all = currentStrips();
            if (selected && all.some(s => s.instanceId === selected))
                return all.find(s => s.instanceId === selected);
            selected = all[0]?.instanceId ?? null;
            return all[0] ?? null;
        }
        function numField(label, value, min, max, onChange, step = 1, narrow = false) {
            const l = el('label', 'vbwt-field'), i = el('input');
            i.type = 'number';
            i.value = String(value);
            i.min = String(min);
            i.max = String(max);
            i.step = String(step);
            i.setAttribute('aria-label', label);
            if (narrow)
                i.className = 'vbwt-narrow';
            i.addEventListener('change', () => { const v = Number(i.value); if (!Number.isFinite(v)) {
                i.value = String(value);
                return;
            } onChange(v); });
            if (label)
                l.append(label + ' ');
            l.appendChild(i);
            return l;
        }
        function section(title) { const s = el('section', 'vbwt-section'); s.appendChild(el('h4', undefined, title)); return s; }
        function modeSection() {
            const s = section('Modo do board'), m = W.getMode();
            const row = el('div', 'vbwt-row');
            for (const [mode, label] of [['manga', 'Mangá'], ['webtoon', 'Webtoon']]) {
                const b = btn(label, mode === 'manga' ? 'Páginas de papel, leitura da direita para a esquerda' : 'Tira vertical contínua, leitura de cima para baixo (ideal para celular)', () => { void run('modo', async () => { await W.setMode(mode); }); }, 'btn' + (m.mode === mode ? ' primary' : ''));
                b.setAttribute('role', 'radio');
                b.setAttribute('aria-checked', String(m.mode === mode));
                b.setAttribute('data-vbwt', 'mode-' + mode);
                row.appendChild(b);
            }
            s.appendChild(row);
            s.appendChild(el('p', 'vbwt-hint', m.mode === 'webtoon'
                ? 'Neste board: tiras verticais lidas de cima para baixo. As ferramentas de balão, texto, efeito e imagem funcionam como no mangá.'
                : 'Neste board: páginas de mangá. Mude para Webtoon para criar tiras verticais; o conteúdo existente não é alterado.'));
            s.appendChild(el('p', 'vbwt-hint', m.strips + ' tira(s) e ' + m.mangaPages + ' página(s) de mangá neste board.'));
            return s;
        }
        function createSection() {
            const s = section('Nova tira'), row = el('div', 'vbwt-row');
            const name = el('input');
            name.type = 'text';
            name.placeholder = 'Nome (opcional)';
            name.setAttribute('aria-label', 'Nome da tira');
            name.maxLength = 120;
            const tpl = el('select');
            tpl.setAttribute('aria-label', 'Modelo da tira');
            for (const t of W.templates()) {
                const o = el('option', undefined, t.name + ' — ' + t.desc);
                o.value = t.id;
                tpl.appendChild(o);
            }
            let width = C.limits().defaultWidth;
            row.append(name, tpl, numField('Largura', width, C.limits().minWidth, C.limits().maxWidth, v => { width = v; }, 10, true), btn('＋ Criar tira', 'Cria a tira no board atual (um Desfazer remove)', () => { void run('criar', async () => { const r = await W.create({ name: name.value, template: tpl.value, settings: { widthPx: width } }); selected = r.instanceId; if (W.getMode().mode !== 'webtoon')
                await W.setMode('webtoon'); }); }, 'btn primary'));
            s.appendChild(row);
            return s;
        }
        function settingsSection(st) {
            const s = section('Formato e exportação'), row = el('div', 'vbwt-row'), id = st.instanceId, cfg = st.settings;
            const set = (patch) => { void run('config', async () => { await W.setSettings(id, patch); }); };
            const fixed = !!st.blocks.length && st.blocks.some(b => b.panelIds.length > 1);
            const wf = numField('Largura de trabalho', cfg.widthPx, C.limits().minWidth, C.limits().maxWidth, v => set({ widthPx: v }), 10, true);
            if (fixed)
                wf.querySelector('input').disabled = true;
            const bg = el('input');
            bg.type = 'color';
            bg.value = cfg.background;
            bg.setAttribute('aria-label', 'Cor de fundo na exportação');
            bg.addEventListener('change', () => set({ background: bg.value }));
            const sc = el('select');
            sc.setAttribute('aria-label', 'Escala de exportação');
            for (const v of [1, 2]) {
                const o = el('option', undefined, v + '×');
                o.value = String(v);
                o.selected = cfg.exportScale === v;
                sc.appendChild(o);
            }
            sc.addEventListener('change', () => set({ exportScale: Number(sc.value) }));
            row.append(wf, numField('Largura de saída', cfg.outputWidthPx, C.limits().minWidth, C.limits().maxWidth, v => set({ outputWidthPx: v }), 10, true), numField('Segmento máx.', cfg.maxSegmentPx, C.limits().minSegment, C.limits().maxSegment, v => set({ maxSegmentPx: v }), 10, true), numField('Margem lateral', cfg.sideMargin, 0, Math.floor(cfg.widthPx / 4), v => set({ sideMargin: v }), 1, true), bg, sc);
            s.appendChild(row);
            s.appendChild(el('p', 'vbwt-hint', 'Padrão WEBTOON Canvas: 800 px de largura e segmentos de até 1280 px. O fundo vale na exportação.'));
            return s;
        }
        function blocksSection(st) {
            const s = section('Quadros (de cima para baixo)'), id = st.instanceId;
            const tbl = el('div', 'vbwt-blocks');
            st.blocks.forEach((b, i) => {
                const row = el('div', 'vbwt-block');
                row.setAttribute('data-vbwt', 'block');
                row.dataset['blockId'] = b.id;
                const multi = b.panelIds.length > 1;
                const h = numField('', b.height, C.limits().minBlockHeight, C.limits().maxBlockHeight, v => { void run('quadro', async () => { await W.setBlock(id, b.id, { height: v }); }); }, 10, true);
                if (multi)
                    h.querySelector('input').disabled = true;
                row.append(el('span', 'vbwt-idx', String(i + 1) + (multi ? ' (' + b.panelIds.length + ' painéis)' : '')), el('span', 'vbwt-lbl', 'alt.'), h, el('span', 'vbwt-lbl', 'vão'), numField('', b.gapAfter, 0, C.limits().maxGap, v => { void run('quadro', async () => { await W.setBlock(id, b.id, { gapAfter: v }); }); }, 10, true));
                if (!multi)
                    row.append(el('span', 'vbwt-lbl', 'corte'), numField('', b.slant, -C.limits().maxSlant, C.limits().maxSlant, v => { void run('quadro', async () => { await W.setBlock(id, b.id, { slant: v, ...(Math.abs(v) >= b.gapAfter ? { gapAfter: Math.abs(v) + 20 } : {}) }); }); }, 10, true));
                const up = btn('↑', 'Subir', () => { void run('mover', async () => { await W.moveBlock(id, b.id, i - 1); }); }, 'btn ghost');
                up.disabled = i === 0;
                const dn = btn('↓', 'Descer', () => { void run('mover', async () => { await W.moveBlock(id, b.id, i + 1); }); }, 'btn ghost');
                dn.disabled = i === st.blocks.length - 1;
                const rm = btn('✕', 'Remover o quadro (balões e textos dentro dele pedem confirmação)', () => {
                    void run('remover', async () => {
                        try {
                            await W.removeBlock(id, b.id);
                        }
                        catch (e) {
                            if (e.code === 'BLOCK_NOT_EMPTY' && confirm(errText(e) + '\n\nRemover mesmo assim?'))
                                await W.removeBlock(id, b.id, { force: true });
                            else
                                throw e;
                        }
                    });
                }, 'btn ghost');
                rm.disabled = st.blocks.length <= 1;
                row.append(up, dn, rm);
                tbl.appendChild(row);
            });
            s.appendChild(tbl);
            s.appendChild(btn('＋ Quadro no fim', 'Acrescenta um quadro vazio', () => { void run('quadro', async () => { await W.addBlock(id, {}); }); }));
            return s;
        }
        function planSection(st) {
            const s = section('Fatiamento e verificação'), p = W.plan(st.instanceId);
            s.appendChild(el('p', undefined, st.width + '×' + st.height + ' px de trabalho · ' + p.plan.segments.length + ' segmento(s) · escala de saída ' + (Math.round(p.scale * 1000) / 1000) + '×'));
            const list = el('ol', 'vbwt-segs');
            for (const g of p.plan.segments)
                list.appendChild(el('li', undefined, 'Segmento ' + g.index + ': ' + Math.round(g.y0) + '–' + Math.round(g.y1) + ' (' + Math.round(g.height) + ' px, corte ' + { gap: 'no vão', panel: 'dentro do quadro', object: 'atravessa objeto', end: 'fim' }[g.cut] + ')'));
            s.appendChild(list);
            if (!p.issues.length)
                s.appendChild(el('p', 'vbwt-ok', '✔ Nenhum problema encontrado.'));
            for (const i of p.issues) {
                const li = el('p', 'vbwt-issue vbwt-' + i.severity, ({ error: '✖ ', warning: '⚠ ', info: 'ℹ ' })[i.severity] + i.message);
                li.setAttribute('data-vbwt', 'issue');
                s.appendChild(li);
            }
            return s;
        }
        function phoneSection(st) {
            const s = section('Prévia no celular'), id = st.instanceId;
            const key = id + ':' + JSON.stringify(st.blocks.map(b => [b.id, b.height, b.gapAfter, b.slant])) + st.settings.background;
            const row = el('div', 'vbwt-row');
            const frame = el('div', 'vbwt-phone');
            frame.setAttribute('data-vbwt', 'phone');
            const screen = el('div', 'vbwt-screen');
            frame.appendChild(screen);
            const show = () => {
                screen.replaceChildren();
                if (!phoneUrl || phoneFor !== key) {
                    screen.appendChild(el('p', 'vbwt-hint', 'Toque em "Atualizar prévia" para ver a tira como o leitor verá.'));
                    return;
                }
                const img = el('img');
                img.alt = 'Prévia da tira em largura de celular';
                img.src = phoneUrl;
                img.className = 'vbwt-phone-img';
                screen.appendChild(img);
                const k = 360 / st.width;
                for (const g of W.plan(id).plan.segments.slice(1)) {
                    const line = el('div', 'vbwt-cut');
                    line.style.top = Math.round(g.y0 * k) + 'px';
                    line.title = 'Início do segmento ' + g.index;
                    screen.appendChild(line);
                }
            };
            show();
            row.append(btn('Atualizar prévia', 'Renderiza a tira em 360 px de largura (somente leitura)', () => {
                void run('prévia', async () => {
                    const blob = await W.previewBlob(id, 0, st.height, 360);
                    phoneRelease();
                    phoneUrl = URL.createObjectURL(blob);
                    phoneFor = key;
                });
            }), btn('Ver no canvas', 'Centraliza o início da tira no canvas', () => {
                const inst = S.boards.flatMap(b => b.instances).find(i => i.id === id);
                if (!inst)
                    return;
                cam.fitBounds({ minX: inst.x, minY: inst.y, maxX: inst.x + inst.width, maxY: inst.y + Math.min(inst.height, inst.width * 1.8) }, 120);
                S.selection.clear();
                S.selection.add(id);
                kernel.emit('selection:changed');
            }));
            s.append(row, frame);
            return s;
        }
        function exportSection(st) {
            const s = section('Exportar'), row = el('div', 'vbwt-row'), id = st.instanceId;
            const go = (fmt) => { void run('exportar', async () => { const r = await W.exportZip(id, { format: fmt }); download(r.name.replace(/\.zip$/, '_' + fmt + '.zip'), r.blob); note = r.result.files.length + ' arquivo(s) exportado(s).'; }); };
            const single = () => { void run('exportar', async () => { const r = await W.exportSlices(id, { format: 'png' }); for (const f of r.files)
                download(f.name, f.blob); }); };
            row.append(btn('⬇ ZIP PNG', 'Segmentos numerados em PNG', () => go('png'), 'btn primary'), btn('⬇ ZIP JPEG', 'Segmentos numerados em JPEG', () => go('jpeg')), btn('⬇ Arquivos PNG', 'Baixa cada segmento separadamente', single));
            s.appendChild(row);
            return s;
        }
        function convertSection(st) {
            const s = section('Converter entre modos'), row = el('div', 'vbwt-row');
            row.append(btn('Páginas de mangá → tira', 'Empilha as páginas de mangá do board numa tira nova; as páginas originais são mantidas', () => {
                void run('converter', async () => {
                    const r = await W.fromMangaPages({});
                    selected = r.strip.instanceId;
                    note = r.issues.map(i => i.message).join(' ') || 'Tira criada; as páginas originais foram mantidas.';
                });
            }));
            const back = btn('Tira → páginas de mangá', 'Corta a tira nos vãos entre quadros e cria páginas; a tira é mantida', () => {
                void run('converter', async () => {
                    const r = await W.toMangaPages(st.instanceId);
                    note = r.pages.length + ' página(s) criada(s). ' + r.issues.map(i => i.message).join(' ');
                });
            });
            back.disabled = !st;
            row.appendChild(back);
            s.appendChild(row);
            s.appendChild(el('p', 'vbwt-hint', 'Nada é apagado na conversão; um Desfazer remove o resultado.'));
            return s;
        }
        function render() {
            if (!modal)
                return;
            const dlg = modal.querySelector('.vbwt-dialog'), keepScroll = dlg.querySelector('.vbwt-body')?.scrollTop ?? 0;
            dlg.replaceChildren();
            const head = el('div', 'vbwt-head');
            head.append(el('h3', undefined, 'Modo Webtoon'), btn('✕', 'Fechar', close, 'btn ghost'));
            dlg.appendChild(head);
            const body = el('div', 'vbwt-body');
            body.appendChild(modeSection());
            const st = current();
            const all = currentStrips();
            if (all.length > 1) {
                const pick = el('select');
                pick.setAttribute('aria-label', 'Tira selecionada');
                for (const x of all) {
                    const o = el('option', undefined, x.name + ' (' + x.height + ' px)');
                    o.value = x.instanceId;
                    o.selected = x.instanceId === st.instanceId;
                    pick.appendChild(o);
                }
                pick.addEventListener('change', () => { selected = pick.value; render(); });
                body.appendChild(pick);
            }
            body.appendChild(createSection());
            if (st)
                body.append(settingsSection(st), blocksSection(st), planSection(st), phoneSection(st), exportSection(st));
            else
                body.appendChild(el('p', 'vbwt-hint', 'Este board ainda não tem tiras. Crie uma acima ou converta páginas de mangá.'));
            body.appendChild(convertSection(st));
            dlg.appendChild(body);
            const foot = el('div', 'vbwt-foot');
            foot.append(btn('↶ Desfazer', 'Desfaz a última alteração do projeto', () => { void HIST.undo().then(render); }), btn('↷ Refazer', 'Refaz a alteração desfeita', () => { void HIST.redo().then(render); }), el('span', 'vbwt-note', busy ? 'Trabalhando: ' + busy + '…' : note));
            foot.lastElementChild.setAttribute('role', 'status');
            dlg.appendChild(foot);
            body.scrollTop = keepScroll;
        }
        function open() {
            if (modal)
                return;
            modal = el('div', 'modal vbwt-modal');
            const back = el('div', 'modal-backdrop');
            back.addEventListener('click', close);
            const dlg = el('div', 'dialog vbwt-dialog');
            dlg.setAttribute('role', 'dialog');
            dlg.setAttribute('aria-label', 'Modo Webtoon');
            dlg.setAttribute('aria-modal', 'true');
            modal.append(back, dlg);
            document.body.appendChild(modal);
            render();
        }
        function close() { if (!modal)
            return; modal.remove(); modal = null; phoneRelease(); busy = ''; note = ''; }
        const onClick = (ev) => { if (ev.target?.closest?.('[data-cmd="open-webtoon"]')) {
            ev.preventDefault();
            open();
        } };
        const onKey = (ev) => { if (ev.key === 'Escape' && modal)
            close(); };
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey);
        kernel.on('state:changed', () => { if (modal && !busy)
            render(); });
        kernel.provide('ui.webtoon', { open, close, isOpen: () => !!modal });
    }
});
