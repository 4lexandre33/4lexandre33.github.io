"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
definePlugin({
    id: 'ui.packages',
    version: '1.0.0',
    needs: ['state', 'packages', 'assets', 'ui.dialogs'],
    provides: ['ui.packages'],
    uses: ['history'],
    accepts: { 'state': '^1.0.0', 'packages': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0', 'history': '^1.0.0' },
    contractVersions: { 'ui.packages': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const P = await kernel.require('packages');
        const A = await kernel.require('assets');
        const D = await kernel.require('ui.dialogs');
        const host = document.getElementById('package-list');
        /** Executa uma alteração de pacotes como UM passo de histórico (Desfazer/Refazer). */
        async function undoable(op) {
            const before = await kernel.call('history', 'snapshot');
            const result = await op();
            await kernel.call('history', 'push', before);
            return result;
        }
        const fail = (e) => D.toast(e instanceof Error ? e.message : String(e), 'error');
        document.querySelectorAll('[data-cmd="new-package"]').forEach(b => {
            b.addEventListener('click', async () => {
                const name = await D.prompt({ title: 'Novo pacote', input: 'Novo pacote', confirmText: 'Criar' });
                if (!name)
                    return;
                try {
                    await undoable(() => P.create(name));
                }
                catch (e) {
                    fail(e);
                }
            });
        });
        const MB = (n) => (n / 1048576).toFixed(n > 10485760 ? 0 : 1) + ' MB';
        let importing = false;
        /** Lê uma pasta arrastada (DataTransferItem) de forma recursiva e paginada. Limites evitam travar em árvores gigantes. */
        async function readEntry(entry, dirs, out, budget) {
            if (budget.left <= 0 || dirs.length > 20)
                return;
            if (entry.isFile) {
                budget.left--;
                const file = await new Promise(res => entry.file(f => res(f), () => res(null)));
                if (file)
                    out.push({ file, dirs });
                return;
            }
            if (!entry.isDirectory)
                return;
            const reader = entry.createReader();
            const next = dirs.concat(entry.name);
            for (;;) {
                const batch = await new Promise(res => reader.readEntries(b => res(b), () => res([])));
                if (!batch.length)
                    break;
                for (const child of batch)
                    await readEntry(child, next, out, budget);
                if (budget.left <= 0)
                    break;
            }
        }
        const hasFolder = (dt) => !!dt && Array.from(dt.items || []).some(it => it.kind === 'file' && it.webkitGetAsEntry?.()?.isDirectory);
        function progressUi() {
            const box = document.createElement('div');
            box.className = 'import-progress';
            box.setAttribute('role', 'status');
            box.setAttribute('data-ui', 'import-progress');
            const text = document.createElement('span');
            text.textContent = 'Preparando…';
            const bar = document.createElement('progress');
            bar.max = 100;
            bar.value = 0;
            const cancel = document.createElement('button');
            cancel.type = 'button';
            cancel.className = 'btn';
            cancel.textContent = 'Cancelar';
            cancel.setAttribute('data-ui', 'import-cancel');
            const ac = new AbortController();
            cancel.addEventListener('click', () => { ac.abort(); text.textContent = 'Cancelando…'; });
            box.append(text, bar, cancel);
            document.body.appendChild(box);
            return { signal: ac.signal, update: (done, total) => { text.textContent = 'Importando ' + done + ' de ' + total + '…'; bar.max = total || 1; bar.value = done; }, close: () => box.remove() };
        }
        /** Fluxo completo: prévia → confirmação (+ conflito) → importação com progresso/Cancelar → UM passo de Desfazer → relatório. */
        async function importFolder(entries, parentId) {
            if (importing) {
                D.toast('Já há uma importação em andamento.', 'error');
                return;
            }
            if (!entries.length) {
                D.toast('Nenhum arquivo encontrado na pasta.', 'error');
                return;
            }
            const plan = P.planTree(entries, { parentId });
            if (plan.overLimit) {
                D.toast(plan.overLimit, 'error');
                return;
            }
            if (!plan.images) {
                D.toast('Nenhuma imagem encontrada (' + plan.ignored + ' arquivo(s) ignorado(s)).', 'error');
                return;
            }
            const dest = parentId ? '"' + P.pathOf(parentId).map(p => p.name).join(' / ') + '"' : 'a raiz da biblioteca';
            const ok = await D.confirm({
                title: 'Importar pasta',
                message: plan.names.join(', ') + ': ' + plan.images + ' imagem(ns) em ' + plan.folders + ' pasta(s) · ' + MB(plan.bytes) +
                    (plan.ignored ? ' · ' + plan.ignored + ' arquivo(s) ignorado(s)' : '') + (plan.flattened ? ' · ' + plan.flattened + ' em nível acima do limite (8) serão agrupadas no último nível' : '') +
                    '\nDestino: ' + dest + '. Cada subpasta vira um subpacote.',
                confirmText: 'Importar'
            });
            if (!ok)
                return;
            let onConflict = 'merge';
            if (plan.conflicts.length) {
                const merge = await D.confirm({
                    title: 'Pacote com o mesmo nome',
                    message: '"' + plan.conflicts.slice(0, 3).join('", "') + '" já existe aqui. Mesclar com o existente ou criar uma cópia nova?',
                    confirmText: 'Mesclar', cancelText: 'Criar cópia'
                });
                onConflict = merge ? 'merge' : 'duplicate';
            }
            importing = true;
            const ui = progressUi();
            let report = null;
            try {
                report = await undoable(() => P.importTree(entries, { parentId, onConflict, signal: ui.signal, onProgress: ui.update }));
            }
            catch (e) {
                fail(e);
            }
            finally {
                ui.close();
                importing = false;
            }
            if (!report)
                return;
            if (parentId)
                S.data.ui.expanded.add(parentId);
            const lines = [report.imported + ' imagem(ns) em ' + report.packages + ' pacote(s) novo(s).'];
            if (report.cancelled)
                lines.push('Importação cancelada: o que já entrou foi mantido (Desfazer remove tudo).');
            if (report.skipped.length)
                lines.push(report.skipped.length + ' arquivo(s) ignorado(s) (não são imagens ou estão vazios).');
            if (report.failed.length)
                lines.push(report.failed.length + ' falharam: ' + report.failed.slice(0, 5).map(f => f.path).join(', ') + (report.failed.length > 5 ? '…' : ''));
            if (report.failed.length) {
                await D.confirm({ title: 'Importação concluída com avisos', message: lines.join('\n'), confirmText: 'OK', cancelText: null });
            }
            else {
                D.toast(lines.join(' '), 'ok', { label: 'Desfazer', run: async () => { await kernel.call('history', 'undo'); } });
            }
        }
        const folderInput = document.getElementById('file-input-folder');
        document.querySelectorAll('[data-cmd="import-folder"]').forEach(b => b.addEventListener('click', () => {
            if (!folderInput) {
                D.toast('Seu navegador não permite escolher pastas.', 'error');
                return;
            }
            folderInput.value = '';
            folderInput.click();
        }));
        folderInput?.addEventListener('change', () => {
            const files = Array.from(folderInput.files || []);
            const entries = files.map(f => { const parts = (f.webkitRelativePath || f.name).split('/'); return { file: f, dirs: parts.slice(0, -1) }; });
            folderInput.value = '';
            void importFolder(entries, null);
        });
        // Arrastar pasta(s) do sistema: sobre um pacote importa dentro dele; em outro lugar, na raiz. (Arquivos soltos continuam no fluxo antigo.)
        document.addEventListener('dragover', e => {
            if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files') && e.target?.closest?.('#package-list,#popup-packages')) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
            }
        }, true);
        document.addEventListener('drop', e => {
            const dt = e.dataTransfer;
            if (!hasFolder(dt))
                return;
            e.preventDefault();
            e.stopImmediatePropagation();
            const parentId = e.target?.closest?.('.pkg')?.getAttribute('data-package-id') ?? null;
            const items = Array.from(dt.items).filter(it => it.kind === 'file').map(it => it.webkitGetAsEntry()).filter((x) => !!x); // síncrono: o DataTransfer expira
            const out = [], budget = { left: 5000 };
            void (async () => {
                for (const en of items)
                    await readEntry(en, [], out, budget);
                if (budget.left <= 0)
                    D.toast('A pasta tem arquivos demais (mais de 5000); importe em partes.', 'error');
                else
                    await importFolder(out, parentId);
            })();
        }, true);
        /** Menu "Mover para…": lista a árvore inteira; destinos inválidos (o próprio pacote e seus descendentes) ficam desabilitados. */
        function openMoveMenu(pkg, anchor) {
            document.querySelectorAll('.pkg-move-menu').forEach(m => m.remove());
            const menu = document.createElement('div');
            menu.className = 'pkg-move-menu';
            menu.setAttribute('role', 'menu');
            menu.setAttribute('aria-label', 'Mover "' + pkg.name + '" para');
            const banned = new Set([pkg.id, ...P.descendantsOf(pkg.id).map(d => d.id)]);
            const item = (label, target, depth) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.setAttribute('role', 'menuitem');
                b.dataset.moveTarget = target ?? '';
                b.style.paddingLeft = (8 + depth * 14) + 'px';
                b.textContent = label;
                const invalid = target !== null && (banned.has(target) || P.depthOf(target) + heightOf(pkg.id) > 8);
                if (invalid)
                    b.disabled = true;
                if ((pkg.parentId || null) === target) {
                    b.disabled = true;
                    b.title = 'Já está aqui';
                }
                b.addEventListener('click', async () => { menu.remove(); try {
                    await undoable(() => P.reparent(pkg.id, target));
                }
                catch (e) {
                    fail(e);
                } });
                menu.appendChild(b);
            };
            item('(raiz)', null, 0);
            const walk = (parent, depth) => { for (const c of P.childrenOf(parent)) {
                item(c.name, c.id, depth + 1);
                walk(c.id, depth + 1);
            } };
            walk(null, 0);
            const r = anchor.getBoundingClientRect();
            menu.style.left = Math.max(4, Math.min(r.left, window.innerWidth - 240)) + 'px';
            menu.style.top = Math.min(r.bottom + 2, window.innerHeight - 260) + 'px';
            (host.closest('.vb-popup') || document.body).appendChild(menu); // dentro da janela: clicar no menu não conta como clique fora
            menu.querySelector('button:not([disabled])')?.focus();
            const close = () => { menu.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', esc, true); anchor.focus(); };
            const outside = (e) => { if (!menu.contains(e.target))
                close(); };
            const esc = (e) => {
                if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    close();
                }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const btns = [...menu.querySelectorAll('button:not([disabled])')];
                    const i = btns.indexOf(document.activeElement);
                    btns[(i + (e.key === 'ArrowDown' ? 1 : -1) + btns.length) % btns.length]?.focus();
                }
            };
            document.addEventListener('mousedown', outside, true);
            document.addEventListener('keydown', esc, true);
        }
        function heightOf(id) { let h = 1; for (const c of P.childrenOf(id))
            h = Math.max(h, 1 + heightOf(c.id)); return h; }
        function render() {
            host.innerHTML = '';
            host.setAttribute('role', 'tree');
            host.setAttribute('aria-label', 'Pacotes e subpacotes');
            const roots = P.childrenOf(null);
            if (!roots.length) {
                const e = document.createElement('div');
                e.className = 'empty-hint';
                e.textContent = 'Nenhum pacote ainda. Crie um para organizar a biblioteca.';
                host.appendChild(e);
                return;
            }
            roots.forEach((pkg, i) => host.appendChild(node(pkg, 1, i, roots.length)));
            // Soltar um pacote na área vazia da lista o move para a raiz.
            host.ondragover = e => { if (hasType(e, 'application/x-nvb-package') && e.target === host) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            } };
            host.ondrop = async (e) => {
                const id = e.dataTransfer?.getData('application/x-nvb-package');
                if (!id || e.target !== host)
                    return;
                e.preventDefault();
                try {
                    await undoable(() => P.reparent(id, null));
                }
                catch (err) {
                    fail(err);
                }
            };
        }
        const hasType = (e, t) => Array.from(e.dataTransfer?.types || []).indexOf(t) !== -1;
        /** Um pacote e (se expandido) seus subpacotes e imagens. */
        function node(pkg, level, index, total) {
            const wrap = document.createElement('div');
            wrap.className = 'pkg';
            wrap.dataset.packageId = pkg.id;
            wrap.setAttribute('role', 'treeitem');
            wrap.setAttribute('aria-level', String(level));
            const kids = P.childrenOf(pkg.id);
            const own = P.assetsOf(pkg.id);
            const expanded = S.data.ui.expanded.has(pkg.id);
            wrap.setAttribute('aria-expanded', String(expanded));
            const head = document.createElement('div');
            head.className = 'pkg-head';
            head.tabIndex = 0;
            head.draggable = true;
            head.dataset.depth = String(level);
            const toggle = document.createElement('button');
            toggle.type = 'button';
            toggle.tabIndex = -1;
            toggle.className = 'pkg-toggle' + (expanded ? ' open' : '');
            toggle.textContent = '▶';
            toggle.setAttribute('aria-hidden', 'true');
            head.appendChild(toggle);
            const name = document.createElement('div');
            name.className = 'pkg-name';
            name.textContent = pkg.name;
            name.title = P.pathOf(pkg.id).map(p => p.name).join(' / ');
            head.appendChild(name);
            const cnt = document.createElement('span');
            cnt.className = 'pkg-count';
            const all = P.assetsOf(pkg.id, true).length;
            cnt.textContent = String(all);
            cnt.title = all + ' imagem(ns) no total' + (kids.length ? ' (' + own.length + ' neste pacote, ' + (all - own.length) + ' em subpacotes)' : '');
            head.appendChild(cnt);
            const actions = document.createElement('div');
            actions.className = 'pkg-actions';
            const mk = (lbl, title, act, danger) => {
                const b = document.createElement('button');
                b.type = 'button';
                b.textContent = lbl;
                b.title = title;
                b.setAttribute('aria-label', title + ': ' + pkg.name);
                b.dataset.act = act;
                if (danger)
                    b.className = 'danger';
                return b;
            };
            const up = mk('↑', 'Subir', 'up');
            const dn = mk('↓', 'Descer', 'down');
            const sub = mk('＋', 'Novo subpacote', 'sub');
            const mv = mk('⇄', 'Mover para…', 'moveto');
            const rn = mk('✎', 'Renomear', 'rename');
            const lift = mk('⤴', 'Dissolver pacote (conteúdo sobe para o pai)', 'lift');
            const dl = mk('🗑', 'Excluir pacote e conteúdo', 'delete', true);
            up.disabled = index === 0;
            dn.disabled = index === total - 1;
            [up, dn, sub, mv, rn, lift, dl].forEach(b => actions.appendChild(b));
            head.appendChild(actions);
            wrap.appendChild(head);
            const body = document.createElement('div');
            body.className = 'pkg-body-tree';
            body.setAttribute('role', 'group');
            body.hidden = !expanded;
            for (const [i, c] of kids.entries())
                body.appendChild(node(c, level + 1, i, kids.length));
            const box = document.createElement('div');
            box.className = 'pkg-assets';
            if (!own.length && !kids.length) {
                const e = document.createElement('div');
                e.className = 'pkg-empty';
                e.textContent = 'Pacote vazio';
                box.appendChild(e);
            }
            else {
                for (const a of own) {
                    const im = document.createElement('img');
                    im.title = a.name || '';
                    im.alt = a.name || '';
                    const u = A.urls.get(a.id);
                    if (u)
                        im.src = u;
                    im.draggable = true;
                    im.addEventListener('dragstart', e => {
                        e.stopPropagation();
                        e.dataTransfer.setData('application/x-nvb-asset', a.id);
                        e.dataTransfer.effectAllowed = 'copyMove';
                    });
                    im.addEventListener('click', ev => { ev.stopPropagation(); D.openPreview(a); });
                    box.appendChild(im);
                }
            }
            body.appendChild(box);
            wrap.appendChild(body);
            const setOpen = (open) => {
                if (open)
                    S.data.ui.expanded.add(pkg.id);
                else
                    S.data.ui.expanded.delete(pkg.id);
                body.hidden = !open;
                toggle.classList.toggle('open', open);
                wrap.setAttribute('aria-expanded', String(open));
            };
            head.addEventListener('click', async (e) => {
                const target = e.target?.closest('[data-act]');
                const act = target ? target.dataset.act : null;
                if (!act) {
                    setOpen(!S.data.ui.expanded.has(pkg.id));
                    return;
                }
                e.stopPropagation();
                try {
                    if (act === 'up')
                        await undoable(() => P.move(pkg.id, -1));
                    else if (act === 'down')
                        await undoable(() => P.move(pkg.id, 1));
                    else if (act === 'moveto')
                        openMoveMenu(pkg, target);
                    else if (act === 'sub') {
                        const n = await D.prompt({ title: 'Novo subpacote em "' + pkg.name + '"', input: 'Novo subpacote', confirmText: 'Criar' });
                        if (n) {
                            await undoable(() => P.create(n, pkg.id));
                            S.data.ui.expanded.add(pkg.id);
                            render();
                        }
                    }
                    else if (act === 'rename') {
                        const n = await D.prompt({ title: 'Renomear pacote', input: pkg.name, confirmText: 'Renomear' });
                        if (n)
                            await undoable(() => P.rename(pkg.id, n));
                    }
                    else if (act === 'lift')
                        await undoable(() => P.remove(pkg.id, 'lift'));
                    else if (act === 'delete')
                        await undoable(() => P.remove(pkg.id));
                }
                catch (err) {
                    fail(err);
                }
            });
            head.addEventListener('keydown', e => {
                if (e.target !== head)
                    return;
                const open = S.data.ui.expanded.has(pkg.id);
                const heads = () => [...host.querySelectorAll('.pkg-head')].filter(h => !h.closest('[hidden]'));
                if (e.key === 'ArrowRight') {
                    e.preventDefault();
                    if (!open && (kids.length || own.length))
                        setOpen(true);
                    else
                        body.querySelector('.pkg-head')?.focus();
                }
                else if (e.key === 'ArrowLeft') {
                    e.preventDefault();
                    if (open)
                        setOpen(false);
                    else
                        wrap.parentElement?.closest('.pkg')?.querySelector('.pkg-head')?.focus();
                }
                else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    const hs = heads();
                    const i = hs.indexOf(head);
                    hs[i + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
                }
                else if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(!open);
                }
                else if (e.key === 'F2') {
                    e.preventDefault();
                    actions.querySelector('[data-act="rename"]').click();
                }
                else if (e.key === 'Delete') {
                    e.preventDefault();
                    actions.querySelector('[data-act="delete"]').click();
                }
            });
            // Arrastar o pacote: sobre outro pacote vira filho dele.
            head.addEventListener('dragstart', e => {
                e.stopPropagation();
                e.dataTransfer.setData('application/x-nvb-package', pkg.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            head.addEventListener('dragover', e => {
                const isPkg = hasType(e, 'application/x-nvb-package'), isAsset = hasType(e, 'application/x-nvb-asset');
                if (!isPkg && !isAsset)
                    return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                head.classList.add('drop-target');
            });
            head.addEventListener('dragleave', () => head.classList.remove('drop-target'));
            head.addEventListener('drop', async (e) => {
                head.classList.remove('drop-target');
                const pid = e.dataTransfer?.getData('application/x-nvb-package');
                const aid = e.dataTransfer?.getData('application/x-nvb-asset');
                if (pid) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (pid === pkg.id)
                        return;
                    try {
                        await undoable(() => P.reparent(pid, pkg.id));
                        S.data.ui.expanded.add(pkg.id);
                        render();
                    }
                    catch (err) {
                        fail(err);
                    }
                    return;
                }
                if (!aid)
                    return;
                e.preventDefault();
                e.stopPropagation();
                const asset = S.data.assets.find(a => a.id === aid);
                if (asset && asset.packageId !== pkg.id) {
                    const before = await kernel.call('history', 'snapshot');
                    asset.packageId = pkg.id;
                    asset.updatedAt = Date.now();
                    await kernel.call('history', 'push', before);
                    kernel.emit('assets:changed');
                }
            });
            return wrap;
        }
        kernel.provide('ui.packages', { render });
        kernel.on('packages:changed', render);
        kernel.on('assets:changed', render);
        render();
    }
});
