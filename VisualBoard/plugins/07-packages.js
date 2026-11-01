"use strict";
definePlugin({
    id: 'packages',
    version: '1.0.0',
    needs: ['utils', 'state'],
    provides: ['packages'],
    uses: ['ui.dialogs', 'assets'],
    accepts: { 'utils': '^1.0.0', 'state': '^1.0.0', 'ui.dialogs': '^1.0.0', 'assets': '^1.0.0' },
    contractVersions: { 'packages': '1.1.0' },
    setup: async function (kernel) {
        const utils = await kernel.require('utils');
        const S = (await kernel.require('state')).data;
        /** Profundidade máxima da árvore (raiz = 1). */
        const MAX_DEPTH = 8;
        const parentOf = (p) => p.parentId || null;
        const find = (id) => id ? S.packages.find(p => p.id === id) : undefined;
        /** Nome único entre IRMÃOS (mesmo pai); pacotes em pais diferentes podem ter o mesmo nome. */
        function uniqueName(name, excludeId, parentId) {
            const base = name || 'Package';
            let c = base, n = 2;
            const parent = parentId || null;
            const taken = new Set(S.packages.filter(p => p.id !== excludeId && parentOf(p) === parent).map(p => p.name.toLowerCase()));
            while (taken.has(c.toLowerCase())) {
                c = base + ' (' + n + ')';
                n++;
            }
            return c;
        }
        function siblings(parentId) {
            return S.packages.filter(p => parentOf(p) === parentId).sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        function childrenOf(parentId) { return siblings(parentId || null); }
        function descendantsOf(id) {
            const out = [];
            const walk = (pid) => { for (const c of siblings(pid)) {
                out.push(c);
                walk(c.id);
            } };
            walk(id);
            return out;
        }
        /** Caminho da raiz até o pacote (inclusive). */
        function pathOf(id) {
            const out = [];
            const seen = new Set();
            for (let cur = find(id); cur && !seen.has(cur.id); cur = find(parentOf(cur))) {
                seen.add(cur.id);
                out.unshift(cur);
            }
            return out;
        }
        function depthOf(id) { return pathOf(id).length; }
        /** Altura da subárvore (o próprio pacote conta 1). */
        function heightOf(id) {
            let h = 1;
            for (const c of siblings(id))
                h = Math.max(h, 1 + heightOf(c.id));
            return h;
        }
        function create(name, parentId) {
            const parent = parentId || null;
            if (parent) {
                if (!find(parent))
                    throw new Error('Pacote-pai não existe.');
                if (depthOf(parent) >= MAX_DEPTH)
                    throw new Error('Profundidade máxima de ' + MAX_DEPTH + ' níveis atingida.');
            }
            const sib = siblings(parent);
            const p = {
                id: utils.uid('pkg'),
                name: uniqueName(name, undefined, parent),
                order: sib.length ? Math.max.apply(null, sib.map(x => x.order || 0)) + 1 : 0,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            if (parent)
                p.parentId = parent;
            S.packages.push(p);
            kernel.emit('packages:changed');
            return p.id;
        }
        function rename(id, name) {
            const p = S.packages.find(x => x.id === id);
            if (!p)
                return;
            p.name = uniqueName(name, id, parentOf(p));
            p.updatedAt = Date.now();
            kernel.emit('packages:changed');
        }
        /**
         * Move o pacote (com a subárvore) para outro pai e posição entre os irmãos.
         * Recusa ciclos (para si ou para um descendente) e profundidade acima do limite.
         */
        function reparent(id, parentId, index) {
            const p = find(id);
            if (!p)
                throw new Error('Pacote não existe.');
            const target = parentId || null;
            if (target) {
                if (!find(target))
                    throw new Error('Pacote de destino não existe.');
                if (target === id || descendantsOf(id).some(d => d.id === target))
                    throw new Error('Um pacote não pode ser movido para dentro de si mesmo ou de um subpacote seu.');
                if (depthOf(target) + heightOf(id) > MAX_DEPTH)
                    throw new Error('Profundidade máxima de ' + MAX_DEPTH + ' níveis excedida.');
            }
            const oldParent = parentOf(p);
            const list = siblings(target).filter(x => x.id !== id);
            p.name = uniqueName(p.name, id, target);
            if (target)
                p.parentId = target;
            else
                delete p.parentId;
            const at = index === undefined ? list.length : Math.max(0, Math.min(list.length, Math.floor(index)));
            list.splice(at, 0, p);
            list.forEach((x, k) => { x.order = k; });
            if (oldParent !== target)
                siblings(oldParent).forEach((x, k) => { x.order = k; });
            p.updatedAt = Date.now();
            kernel.emit('packages:changed');
        }
        /**
         * Exclui o pacote. mode 'cascade' (padrão): apaga subpacotes e imagens, com confirmação que diz o que será perdido.
         * mode 'lift': dissolve só o pacote — subpacotes e imagens sobem para o pai (nada é apagado).
         */
        async function remove(id, mode) {
            const p = S.packages.find(x => x.id === id);
            if (!p)
                return;
            const subtree = [p, ...descendantsOf(id)];
            const ids = new Set(subtree.map(x => x.id));
            const assets = S.assets.filter(a => a.packageId && ids.has(a.packageId));
            if (mode === 'lift') {
                const parent = parentOf(p);
                const moved = siblings(id);
                const own = S.assets.filter(a => a.packageId === id);
                const rest = siblings(parent).filter(x => x.id !== id);
                S.packages = S.packages.filter(x => x.id !== id);
                const A = await kernel.require('assets');
                const dest = parent || A.ensureDefaultPackage(); // na raiz, as imagens vão para o pacote padrão
                for (const a of own) {
                    a.packageId = dest;
                    a.updatedAt = Date.now();
                }
                for (const c of moved) {
                    if (parent)
                        c.parentId = parent;
                    else
                        delete c.parentId;
                    c.name = uniqueName(c.name, c.id, parent);
                }
                [...rest, ...moved].forEach((x, k) => { x.order = k; });
                kernel.emit('packages:changed');
                kernel.emit('assets:changed');
                kernel.emit('state:changed');
                return;
            }
            const subs = subtree.length - 1;
            const ok = await kernel.call('ui.dialogs', 'confirm', {
                title: 'Delete package',
                message: 'Delete "' + p.name + '"' + (subs ? ', ' + subs + ' subpackage(s)' : '') + (assets.length ? (subs ? ' and ' : ' and its ') + assets.length + ' image(s)?' : '?'),
                danger: true
            });
            if (!ok)
                return;
            const doomed = new Set(assets.map(a => a.id));
            for (const b of S.boards)
                b.instances = b.instances.filter(i => !doomed.has(i.assetId));
            S.assets = S.assets.filter(a => !doomed.has(a.id));
            S.packages = S.packages.filter(x => !ids.has(x.id));
            siblings(parentOf(p)).forEach((x, k) => { x.order = k; });
            const A = await kernel.require('assets');
            for (const aid of doomed) {
                const u = A.urls.get(aid);
                if (u) {
                    URL.revokeObjectURL(u);
                    A.urls.delete(aid);
                }
                A.blobs.delete(aid);
            }
            kernel.emit('packages:changed');
            kernel.emit('assets:changed');
            kernel.emit('state:changed');
        }
        /** Sobe/desce entre IRMÃOS (mesmo pai). */
        function move(id, delta) {
            const p = find(id);
            if (!p)
                return;
            const sorted = siblings(parentOf(p));
            const i = sorted.findIndex(x => x.id === id);
            const j = i + delta;
            if (i < 0 || j < 0 || j >= sorted.length)
                return;
            const tmp = sorted[i];
            sorted[i] = sorted[j];
            sorted[j] = tmp;
            sorted.forEach((x, k) => x.order = k);
            kernel.emit('packages:changed');
        }
        /** Imagens do pacote; com recursive=true inclui as dos subpacotes. */
        function assetsOf(packageId, recursive) {
            if (!recursive)
                return S.assets.filter(a => a.packageId === packageId);
            const ids = new Set([packageId, ...descendantsOf(packageId).map(d => d.id)]);
            return S.assets.filter(a => a.packageId && ids.has(a.packageId));
        }
        /* ---------------- Importação de pastas (árvore de pacotes) ---------------- */
        const MAX_TREE_FILES = 2000, MAX_TREE_BYTES = 500 * 1024 * 1024, MAX_NAME = 120;
        const JUNK = /^(thumbs\.db|desktop\.ini|\.ds_store)$/i;
        /** Nome de pasta seguro: sem controles, sem barras, sem "." / "..", com limite. Retorna '' se nada sobrar. */
        function cleanSegment(raw) {
            // eslint-disable-next-line no-control-regex
            const t = String(raw ?? '').normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, '').replace(/[\\/]/g, ' ').trim();
            if (!t || t === '.' || t === '..')
                return '';
            return t.slice(0, MAX_NAME);
        }
        const classify = (e) => {
            const n = e.file?.name || '';
            if (!n || n.startsWith('.'))
                return 'hidden';
            if (JUNK.test(n))
                return 'junk';
            if (!utils.isSupportedImageFile(e.file))
                return 'type';
            if (!e.file.size)
                return 'empty';
            return 'ok';
        };
        function dirsOf(e, parentId) {
            const all = e.dirs.map(cleanSegment).filter(Boolean);
            const room = Math.max(0, MAX_DEPTH - (parentId ? depthOf(parentId) : 0));
            return { dirs: all.slice(0, room), cut: all.length > room };
        }
        /** Pré-visualização (sem alterar nada): quantas pastas/imagens, o que será ignorado, conflitos de nome e limites. */
        function planTree(entries, opts) {
            const parent = opts?.parentId || null;
            const folders = new Set(), tops = new Set();
            let images = 0, ignored = 0, bytes = 0, flattened = 0;
            for (const e of entries) {
                if (classify(e) !== 'ok') {
                    ignored++;
                    continue;
                }
                images++;
                bytes += e.file.size;
                const d = dirsOf(e, parent);
                if (d.cut)
                    flattened++;
                d.dirs.forEach((_, i) => folders.add(d.dirs.slice(0, i + 1).join('\u0000')));
                if (d.dirs[0])
                    tops.add(d.dirs[0]);
            }
            const existing = new Set(siblings(parent).map(p => p.name.toLowerCase()));
            const conflicts = [...tops].filter(n => existing.has(n.toLowerCase()));
            const overLimit = images > MAX_TREE_FILES ? 'Mais de ' + MAX_TREE_FILES + ' imagens (' + images + '). Importe em partes.'
                : bytes > MAX_TREE_BYTES ? 'Mais de ' + Math.round(MAX_TREE_BYTES / 1048576) + ' MB (' + Math.round(bytes / 1048576) + ' MB). Importe em partes.' : null;
            return { folders: folders.size, images, ignored, bytes, flattened, conflicts, overLimit, names: [...tops] };
        }
        /**
         * Importa arquivos recriando a árvore de pastas como pacotes/subpacotes sob parentId (raiz por padrão).
         * Não grava histórico (quem chama envolve em um passo de Desfazer). onConflict: 'merge' reaproveita pacote irmão de mesmo nome.
         */
        async function importTree(entries, opts) {
            const parent = opts?.parentId || null;
            if (parent && !find(parent))
                throw new Error('Pacote de destino não existe.');
            const plan = planTree(entries, { parentId: parent });
            if (plan.overLimit)
                throw new Error(plan.overLimit);
            const A = await kernel.require('assets');
            const merge = (opts?.onConflict ?? 'merge') === 'merge';
            const report = { packages: 0, imported: 0, flattened: plan.flattened, cancelled: false,
                skipped: [], failed: [] };
            const cache = new Map();
            const ensure = (dirs) => {
                let pid = parent;
                for (let i = 0; i < dirs.length; i++) {
                    const key = dirs.slice(0, i + 1).join('\u0000');
                    let id = cache.get(key);
                    if (!id) {
                        const hit = merge ? siblings(pid).find(x => x.name.toLowerCase() === dirs[i].toLowerCase()) : undefined;
                        if (hit)
                            id = hit.id;
                        else {
                            const p = { id: utils.uid('pkg'), name: uniqueName(dirs[i], undefined, pid),
                                order: siblings(pid).length, createdAt: Date.now(), updatedAt: Date.now() };
                            if (pid)
                                p.parentId = pid;
                            S.packages.push(p);
                            report.packages++;
                            id = p.id;
                        }
                        cache.set(key, id);
                    }
                    pid = id;
                }
                return pid;
            };
            const reason = { hidden: 'arquivo oculto', junk: 'arquivo de sistema', type: 'não é imagem', empty: 'arquivo vazio' };
            const todo = [];
            for (const e of entries) {
                const c = classify(e);
                if (c !== 'ok') {
                    if (c !== 'hidden' && c !== 'junk')
                        report.skipped.push({ path: [...e.dirs, e.file?.name].join('/'), reason: reason[c] });
                    continue;
                }
                todo.push({ e, dirs: dirsOf(e, parent).dirs });
            }
            let done = 0;
            for (const t of todo) {
                if (opts?.signal?.aborted) {
                    report.cancelled = true;
                    break;
                }
                const pid = ensure(t.dirs) || A.ensureDefaultPackage();
                try {
                    await A.createFromFile(t.e.file, pid);
                    report.imported++;
                }
                catch (err) {
                    report.failed.push({ path: [...t.e.dirs, t.e.file.name].join('/'), error: err instanceof Error ? err.message : String(err) });
                }
                done++;
                if (opts?.onProgress && (done % 5 === 0 || done === todo.length)) {
                    opts.onProgress(done, todo.length);
                    await new Promise(r => setTimeout(r, 0));
                }
            }
            siblings(parent).forEach((x, k) => { x.order = k; });
            kernel.emit('packages:changed');
            kernel.emit('assets:changed');
            kernel.emit('state:changed');
            return report;
        }
        kernel.provide('packages', { create, rename, remove, move, assetsOf, reparent, childrenOf, descendantsOf, pathOf, depthOf, planTree, importTree });
    }
});
