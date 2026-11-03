"use strict";
/** TS-016: strictly typed UI adapter, preserves classic-script behavior and ABI. */
definePlugin({
    id: 'ui.library',
    version: '1.0.0',
    needs: ['state', 'assets', 'packages', 'ui.dialogs'],
    provides: ['ui.library'],
    uses: [],
    accepts: { 'state': '^1.0.0', 'assets': '^1.0.0', 'packages': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'ui.library': '1.0.0' },
    setup: async function (kernel) {
        const S = await kernel.require('state');
        const A = await kernel.require('assets');
        const P = await kernel.require('packages');
        const D = await kernel.require('ui.dialogs');
        const grid = document.getElementById('asset-grid');
        const filter = document.getElementById('package-filter');
        const search = document.getElementById('search');
        const sort = document.getElementById('sort');
        const count = document.getElementById('asset-count');
        const empty = document.getElementById('library-empty');
        /* Seleção múltipla (Ctrl/Cmd+clique alterna, Shift+clique seleciona o intervalo) e exclusão simples. */
        const selected = new Set();
        let lastIndex = -1, visible = [];
        const selbar = document.createElement('div');
        selbar.className = 'asset-selbar';
        selbar.setAttribute('data-lib', 'selbar');
        selbar.hidden = true;
        grid.parentElement?.insertBefore(selbar, grid);
        function renderSelbar() {
            selbar.textContent = '';
            selbar.hidden = selected.size === 0;
            if (!selected.size)
                return;
            const n = document.createElement('span');
            n.textContent = selected.size + (selected.size === 1 ? ' selecionada' : ' selecionadas');
            n.setAttribute('role', 'status');
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'btn danger';
            del.setAttribute('data-lib', 'delete-selected');
            del.textContent = 'Excluir ' + selected.size;
            del.addEventListener('click', () => { void removeMany([...selected]); });
            const all = document.createElement('button');
            all.type = 'button';
            all.className = 'btn ghost';
            all.setAttribute('data-lib', 'select-all');
            all.textContent = 'Selecionar tudo (' + visible.length + ')';
            all.addEventListener('click', () => { visible.forEach(id => selected.add(id)); renderGrid(); });
            const none = document.createElement('button');
            none.type = 'button';
            none.className = 'btn ghost';
            none.setAttribute('data-lib', 'select-none');
            none.textContent = 'Limpar';
            none.addEventListener('click', () => { selected.clear(); renderGrid(); });
            const mix = document.createElement('button');
            mix.type = 'button';
            mix.className = 'btn';
            mix.setAttribute('data-lib', 'compose-selected');
            mix.textContent = '🧩 Montar ' + selected.size;
            mix.title = 'Junta as imagens selecionadas numa só no editor de imagens';
            mix.addEventListener('click', () => { kernel.emit('image-editor:compose', { ids: [...selected] }); });
            const many = document.createElement('button');
            many.type = 'button';
            many.className = 'btn';
            many.setAttribute('data-lib', 'batch-selected');
            many.textContent = '⚙ Editar em lote';
            many.title = 'Abre as imagens selecionadas no editor para trocar cor, tirar fundo etc. em todas de uma vez';
            many.addEventListener('click', () => { kernel.emit('image-editor:batch', { ids: [...selected] }); });
            const big = document.createElement('button');
            big.type = 'button';
            big.className = 'btn';
            big.setAttribute('data-lib', 'enlarge-selected');
            big.textContent = '🔍 Ampliar / converter';
            big.title = 'Amplia as imagens selecionadas sem perder qualidade (vetor para traço, ampliação exata) e converte para SVG quando fiel';
            big.addEventListener('click', () => { kernel.emit('image-editor:enlarge', { ids: [...selected] }); });
            const exp = document.createElement('button');
            exp.type = 'button';
            exp.className = 'btn';
            exp.setAttribute('data-lib', 'export-selected');
            exp.textContent = '⬇ Exportar ZIP';
            exp.title = 'Baixa as imagens selecionadas num arquivo ZIP';
            exp.addEventListener('click', () => { kernel.emit('image-editor:export', { ids: [...selected] }); });
            selbar.append(n, many, mix, big, exp, del, all, none);
        }
        /** Exclui sem diálogo quando nada está em uso; sempre oferece Desfazer (um único passo restaura todas). */
        async function removeMany(ids) {
            const r = await A.deleteAssets(ids, { ask: 'auto', notify: true }); // o aviso com "Desfazer" vem do plugin de assets
            if (r.cancelled || !r.deleted)
                return;
            ids.forEach(id => selected.delete(id));
        }
        search.addEventListener('input', e => { S.data.ui.search = e.target.value; renderGrid(); });
        filter.addEventListener('change', e => { S.data.ui.filterPackage = e.target.value; renderGrid(); });
        sort.addEventListener('change', e => { S.data.ui.sort = e.target.value; renderGrid(); });
        /** Filtro por origem: todas, só editadas (derivadas no editor de imagens) ou só originais. */
        let kindFilter = 'all';
        const kindSel = document.createElement('select');
        kindSel.setAttribute('data-lib', 'kind-filter');
        kindSel.setAttribute('aria-label', 'Filtrar por origem');
        for (const [v, t] of [['all', 'Todas as imagens'], ['edited', '✎ Só editadas'], ['originals', 'Só originais']]) {
            const o = document.createElement('option');
            o.value = v;
            o.textContent = t;
            kindSel.appendChild(o);
        }
        kindSel.addEventListener('change', () => { kindFilter = kindSel.value; renderGrid(); });
        kindSel.className = 'lib-kind';
        (count.parentElement ?? grid.parentElement)?.insertAdjacentElement('afterend', kindSel);
        const derivedOf = (a) => a.derivedFrom;
        const hasOriginal = (a) => { const d = derivedOf(a); return !!d && S.data.assets.some(x => x.id === d); };
        /** Rola até a imagem original e a destaca por um instante. */
        function revealAsset(id) {
            if (!S.data.assets.some(a => a.id === id))
                return;
            kindFilter = 'all';
            kindSel.value = 'all';
            S.data.ui.search = '';
            search.value = '';
            S.data.ui.filterPackage = 'all';
            renderFilter();
            renderGrid();
            const c = grid.querySelector('[data-asset-id="' + id + '"]');
            if (c) {
                c.scrollIntoView({ block: 'nearest' });
                c.classList.add('is-flash');
                c.focus({ preventScroll: true });
                setTimeout(() => c.classList.remove('is-flash'), 1800);
            }
        }
        /** "Incluir subpacotes" (padrão ligado): filtrar por um pacote mostra também as imagens dos subpacotes. */
        let includeSub = true;
        const subLabel = document.createElement('label');
        subLabel.className = 'lib-sub';
        subLabel.setAttribute('data-lib', 'include-sub');
        const subCb = document.createElement('input');
        subCb.type = 'checkbox';
        subCb.checked = true;
        subCb.addEventListener('change', () => { includeSub = subCb.checked; renderFilter(); renderGrid(); });
        subLabel.append(subCb, ' incluir subpacotes');
        filter.insertAdjacentElement('afterend', subLabel);
        function renderFilter() {
            const cur = S.data.ui.filterPackage;
            filter.innerHTML = '';
            const all = document.createElement('option');
            all.value = 'all';
            all.textContent = 'Todos os pacotes (' + S.data.assets.length + ')';
            filter.appendChild(all);
            const walk = (parent, depth) => {
                for (const p of P.childrenOf(parent)) {
                    const o = document.createElement('option');
                    o.value = p.id;
                    o.textContent = '\u00A0\u00A0'.repeat(depth) + (depth ? '└ ' : '') + p.name + ' (' + P.assetsOf(p.id, includeSub).length + ')';
                    o.title = P.pathOf(p.id).map(x => x.name).join(' / ');
                    filter.appendChild(o);
                    walk(p.id, depth + 1);
                }
            };
            walk(null, 0);
            const exists = Array.prototype.some.call(filter.options, (o) => o.value === cur);
            filter.value = exists ? cur : 'all';
            S.data.ui.filterPackage = filter.value;
            subLabel.hidden = !S.data.packages.some(p => p.parentId);
        }
        function renderGrid() {
            const q = S.data.ui.search.trim().toLowerCase();
            const pf = S.data.ui.filterPackage;
            const scope = pf === 'all' ? null : new Set(includeSub ? [pf, ...P.descendantsOf(pf).map(d => d.id)] : [pf]);
            let list = S.data.assets.filter(a => {
                if (scope && !(a.packageId && scope.has(a.packageId)))
                    return false;
                if (q && a.name.toLowerCase().indexOf(q) === -1)
                    return false;
                if (kindFilter === 'edited' && !derivedOf(a))
                    return false;
                if (kindFilter === 'originals' && derivedOf(a))
                    return false;
                return true;
            });
            if (S.data.ui.sort === 'name')
                list.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
            else if (S.data.ui.sort === 'newest')
                list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
            else
                list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
            grid.innerHTML = '';
            const frag = document.createDocumentFragment();
            visible = list.map(a => a.id);
            for (const id of [...selected])
                if (!S.data.assets.some(a => a.id === id))
                    selected.delete(id);
            for (const a of list)
                frag.appendChild(card(a));
            grid.appendChild(frag);
            count.textContent = list.length + (list.length === 1 ? ' image' : ' images');
            empty.hidden = S.data.assets.length > 0;
            renderSelbar();
        }
        function card(asset) {
            const el = document.createElement('div');
            el.className = 'asset-card';
            el.draggable = true;
            el.tabIndex = 0;
            el.dataset.assetId = asset.id;
            if (selected.has(asset.id)) {
                el.classList.add('is-selected');
                el.setAttribute('aria-selected', 'true');
            }
            el.title = asset.name + '\nDrag to canvas · Click to preview';
            const img = document.createElement('img');
            img.draggable = false;
            img.loading = 'lazy';
            img.alt = asset.name;
            const url = A.urls.get(asset.id);
            if (url)
                img.src = url;
            el.appendChild(img);
            const label = document.createElement('div');
            label.className = 'asset-label';
            label.textContent = asset.name;
            el.appendChild(label);
            const dId = derivedOf(asset);
            if (dId) {
                const orig = S.data.assets.find(x => x.id === dId);
                const badge = document.createElement('span');
                badge.className = 'asset-edited';
                badge.setAttribute('data-lib', 'edited-badge');
                badge.textContent = '✎ Editada';
                const ops = (asset.operations ?? []).map(o => o.operation).filter(Boolean).join(', ');
                badge.title = 'Editada a partir de ' + (orig ? '"' + orig.name + '"' : 'uma imagem que não está mais na biblioteca') + (ops ? ' · ' + ops : '');
                el.appendChild(badge);
                if (orig) {
                    const back = document.createElement('button');
                    back.type = 'button';
                    back.className = 'asset-orig-btn';
                    back.setAttribute('data-lib', 'original');
                    back.draggable = false;
                    back.textContent = '↩ Original';
                    back.title = 'Ir para o original "' + orig.name + '"';
                    back.setAttribute('aria-label', 'Ir para o original de ' + asset.name);
                    back.addEventListener('click', ev => { ev.stopPropagation(); revealAsset(A.lineageOf(asset.id).original ?? orig.id); });
                    el.appendChild(back);
                    {
                        const swap = document.createElement('button');
                        swap.type = 'button';
                        swap.className = 'asset-orig-btn asset-orig-swap';
                        swap.setAttribute('data-lib', 'restore-original');
                        swap.draggable = false;
                        swap.textContent = '⟲ Quadros';
                        swap.title = 'Troca esta imagem pelo original em todos os quadros (um Desfazer)';
                        swap.addEventListener('click', ev => { ev.stopPropagation(); void A.restoreOriginal(asset.id, { notify: true }); });
                        el.appendChild(swap);
                    }
                }
            }
            else {
                const n = S.data.assets.filter(x => derivedOf(x) === asset.id).length;
                if (n) {
                    const chip = document.createElement('span');
                    chip.className = 'asset-edits';
                    chip.setAttribute('data-lib', 'edits-chip');
                    chip.textContent = n + (n === 1 ? ' edição' : ' edições');
                    chip.title = 'Há ' + n + ' versão(ões) editada(s) desta imagem';
                    el.appendChild(chip);
                }
            }
            const processButton = document.createElement('button');
            processButton.type = 'button';
            processButton.className = 'asset-process-btn';
            processButton.dataset.processAssetId = asset.id;
            processButton.textContent = 'Edit image';
            processButton.title = 'Create a processed copy of ' + asset.name;
            processButton.setAttribute('aria-label', 'Edit image ' + asset.name);
            processButton.draggable = false;
            processButton.addEventListener('click', event => {
                event.stopPropagation();
                kernel.emit('ui:image-process', { assetId: asset.id, trigger: processButton });
            });
            el.appendChild(processButton);
            const del = document.createElement('button');
            del.type = 'button';
            del.className = 'asset-del';
            del.setAttribute('data-lib', 'delete');
            del.draggable = false;
            del.textContent = '✕';
            del.title = 'Excluir ' + asset.name;
            del.setAttribute('aria-label', 'Excluir imagem ' + asset.name);
            del.addEventListener('click', ev => { ev.stopPropagation(); void removeMany([asset.id]); });
            el.appendChild(del);
            el.addEventListener('dragstart', e => {
                e.dataTransfer.setData('application/x-nvb-asset', asset.id);
                e.dataTransfer.setData('text/plain', asset.id);
                e.dataTransfer.effectAllowed = 'copyMove';
            });
            el.addEventListener('click', ev => {
                const idx = visible.indexOf(asset.id);
                if (ev.shiftKey && lastIndex >= 0) {
                    for (let i = Math.min(lastIndex, idx); i <= Math.max(lastIndex, idx); i++)
                        selected.add(visible[i]);
                    renderGrid();
                    return;
                }
                if (ev.ctrlKey || ev.metaKey) {
                    if (selected.has(asset.id))
                        selected.delete(asset.id);
                    else
                        selected.add(asset.id);
                    lastIndex = idx;
                    renderGrid();
                    return;
                }
                D.openPreview(asset);
            });
            el.addEventListener('keydown', ev => {
                if (ev.key === 'Delete' || ev.key === 'Backspace') {
                    ev.preventDefault();
                    ev.stopPropagation(); // não apaga objetos selecionados do canvas
                    void removeMany(selected.has(asset.id) ? [...selected] : [asset.id]);
                }
                else if (ev.key === ' ') {
                    ev.preventDefault();
                    if (selected.has(asset.id))
                        selected.delete(asset.id);
                    else
                        selected.add(asset.id);
                    lastIndex = visible.indexOf(asset.id);
                    renderGrid();
                    grid.querySelector('[data-asset-id="' + asset.id + '"]')?.focus();
                }
                else if (ev.key === 'Enter') {
                    ev.preventDefault();
                    D.openPreview(asset);
                }
            });
            return el;
        }
        kernel.provide('ui.library', { renderFilter, renderGrid });
        kernel.on('assets:changed', () => { renderFilter(); renderGrid(); });
        kernel.on('packages:changed', renderFilter);
        renderFilter();
        renderGrid();
    }
});
