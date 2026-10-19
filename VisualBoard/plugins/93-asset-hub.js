"use strict";
/* =====================================================================
 * plugins/93-asset-hub.ts — Fase 15: cliente do Asset Hub (catálogo de
 * imagens em banco de dados real).
 *
 * O editor continua 100% funcional offline: este plugin só fala com um Hub
 * quando o usuário informa URL + token. A conexão fica SOMENTE na memória
 * (nenhum localStorage/IndexedDB guarda imagens, URL ou token). Imagens e
 * miniaturas vêm do Hub com `Authorization: Bearer` e viram blob: URLs
 * temporárias. Nenhuma lógica de catálogo vive aqui: tudo é chamada às
 * ferramentas `catalog.*` do Hub (as mesmas do MCP, CLI e console).
 * ===================================================================== */
definePlugin({
    id: 'asset-hub',
    version: '1.0.0',
    needs: ['state', 'assets'],
    provides: ['assetHub'],
    uses: ['ui.dialogs'],
    accepts: { 'state': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'assetHub': '1.0.0' },
    setup: async function (kernel) {
        const state = await kernel.require('state');
        const assets = await kernel.require('assets');
        const S = state.data;
        let conn = null;
        let lastError = null;
        let lastUrl = '';
        const listeners = new Set();
        const blobUrls = new Map();
        class HubError extends Error {
            code;
            constructor(code, message) { super(message); this.code = code; }
        }
        const normalizeUrl = (raw) => {
            let u;
            try {
                u = new URL(raw.trim());
            }
            catch {
                throw new HubError('INVALID_ARGUMENT', 'URL do Hub inválida');
            }
            if (u.protocol !== 'http:' && u.protocol !== 'https:')
                throw new HubError('INVALID_ARGUMENT', 'Use http(s)://');
            return u.origin + u.pathname.replace(/\/+$/, '');
        };
        function status() {
            return { connected: !!conn, url: conn ? conn.url : null, client: conn ? conn.client : null,
                scopes: conn ? conn.scopes.slice() : [], version: conn ? conn.version : null, error: lastError };
        }
        const emit = () => { const s = status(); listeners.forEach(fn => { try {
            fn(s);
        }
        catch { /* listener isolado */ } }); };
        async function http(path, init = {}, c = conn) {
            if (!c)
                throw new HubError('NOT_CONNECTED', 'Catálogo não conectado. Abra Mais ▸ Catálogo de imagens e informe a URL e o token do Hub.');
            const headers = new Headers(init.headers);
            headers.set('Authorization', 'Bearer ' + c.token);
            let res;
            try {
                res = await fetch(c.url + path, { ...init, headers, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
            }
            catch (err) {
                lastError = 'Sem resposta do Hub (' + (err instanceof Error ? err.message : 'rede') + ')';
                emit();
                throw new HubError('HUB_UNREACHABLE', lastError);
            }
            return res;
        }
        async function connect(url, token) {
            if (typeof token !== 'string' || token.length < 12)
                throw new HubError('INVALID_ARGUMENT', 'Token inválido');
            const candidate = { url: normalizeUrl(url), token: token.trim(), client: null, scopes: [], version: null };
            const res = await http('/v1/whoami', {}, candidate);
            if (res.status === 401 || res.status === 403)
                throw new HubError('NOT_AUTHORIZED', 'Token recusado pelo Hub');
            if (!res.ok)
                throw new HubError('HUB_ERROR', 'Hub respondeu HTTP ' + res.status);
            const info = await res.json();
            candidate.client = typeof info['client'] === 'string' ? info['client'] : null;
            candidate.scopes = Array.isArray(info['scopes']) ? info['scopes'].map(String) : [];
            candidate.version = typeof info['version'] === 'string' ? info['version'] : null;
            disconnect(false);
            conn = candidate;
            lastError = null;
            emit();
            return status();
        }
        function disconnect(notify = true) {
            blobUrls.forEach(u => URL.revokeObjectURL(u));
            blobUrls.clear();
            conn = null;
            if (notify)
                emit();
        }
        async function call(verb, input = {}) {
            const res = await http('/v1/tools/catalog.' + verb, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
            let body = null;
            try {
                body = await res.json();
            }
            catch {
                body = null;
            }
            if (!res.ok || !body || body['ok'] !== true) {
                const err = (body && typeof body['error'] === 'object' && body['error']);
                throw new HubError(String(err?.['code'] ?? (res.status === 401 ? 'NOT_AUTHORIZED' : 'HUB_ERROR')), String(err?.['message'] ?? 'Hub respondeu HTTP ' + res.status));
            }
            return body['data'];
        }
        async function blob(id, kind = 'original') {
            const res = await http('/v1/assets/' + encodeURIComponent(id) + (kind === 'thumb' ? '/thumb' : '/blob'));
            if (!res.ok)
                throw new HubError(res.status === 404 ? 'NOT_FOUND' : 'HUB_ERROR', 'Imagem indisponível (HTTP ' + res.status + ')');
            return res.blob();
        }
        async function objectUrl(id, kind = 'thumb') {
            const key = kind + ':' + id;
            const cached = blobUrls.get(key);
            if (cached)
                return cached;
            const url = URL.createObjectURL(await blob(id, kind));
            blobUrls.set(key, url);
            return url;
        }
        function toBase64(bytes) {
            let out = '';
            for (let i = 0; i < bytes.length; i += 0x8000)
                out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return btoa(out);
        }
        async function upload(file, opts = {}) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            return call('add', { filename: file.name, dataBase64: toBase64(bytes), ...(opts.folderId ? { folderId: opts.folderId } : {}),
                ...(opts.tags && opts.tags.length ? { tags: opts.tags } : {}) });
        }
        /** Baixa do Hub, importa como asset do projeto e registra a referência de uso. */
        async function place(id, packageId) {
            const meta = await call('get', { id });
            const asset = meta && meta.asset;
            if (!asset)
                throw new HubError('NOT_FOUND', 'Imagem não encontrada no Hub');
            const data = await blob(id);
            const file = new File([data], String(asset.filename || id), { type: String(asset.mime || data.type) });
            const before = new Set(S.assets.map(a => a.id));
            const count = await assets.importFiles([file], packageId);
            const created = S.assets.filter(a => !before.has(a.id));
            if (!count || !created.length)
                throw new HubError('OPERATION_REJECTED', 'A imagem não pôde ser importada');
            const projectId = String((S.meta && S.meta.id) || 'local');
            for (const a of created)
                await call('reference_add', { id, project: projectId, instance: a.id });
            return { catalogId: id, imported: count, assets: created.map(a => ({ id: a.id, name: a.name ?? null })) };
        }
        /** Envia a biblioteca do projeto aberto ao catálogo (migração): tags `pacote:<nome>` e `origem:projeto`; duplicatas são reconhecidas por SHA-256. */
        async function importLibrary(packageId) {
            const out = { uploaded: 0, duplicates: 0, skipped: 0, failed: 0 };
            const names = new Map((S.packages || []).map(p => [p.id, p.name || 'sem nome']));
            for (const a of S.assets) {
                if (packageId && a.packageId !== packageId)
                    continue;
                const data = assets.blobs.get(a.id);
                if (!data || !/^image\/(png|jpeg|webp|gif)$/.test(data.type || String(a.mimeType))) {
                    out.skipped++;
                    continue;
                }
                const tags = ['origem:projeto'];
                const pkg = a.packageId ? names.get(a.packageId) : null;
                if (pkg)
                    tags.push('pacote:' + pkg.replace(/[^\p{L}\p{N} _.\-]/gu, ' ').trim().slice(0, 60));
                try {
                    const file = new File([data], String(a.name || a.id), { type: data.type || String(a.mimeType) });
                    const res = await upload(file, { tags });
                    if (res && res.created === false)
                        out.duplicates++;
                    else
                        out.uploaded++;
                }
                catch (err) {
                    if (err instanceof HubError && (err.code === 'NOT_CONNECTED' || err.code === 'HUB_UNREACHABLE' || err.code === 'NOT_AUTHORIZED'))
                        throw err;
                    out.failed++;
                }
            }
            return out;
        }
        /** Pareamento: `#hub-url=…&hub-token=…` no endereço (fica fora do servidor/histórico e é apagado). */
        async function pairFromLocation() {
            const hash = window.location.hash.replace(/^#/, '');
            if (!hash.includes('hub-token='))
                return false;
            const params = new URLSearchParams(hash);
            const token = params.get('hub-token'), url = params.get('hub-url') || window.location.origin;
            try {
                history.replaceState(null, '', window.location.pathname + window.location.search);
            }
            catch { /* file:// */ }
            if (!token)
                return false;
            try {
                await connect(url, token);
                return true;
            }
            catch (err) {
                lastError = err instanceof Error ? err.message : String(err);
                emit();
                return false;
            }
        }
        /* ---------------------------- interface ---------------------------- */
        const popup = document.getElementById('popup-catalog');
        const body = document.getElementById('catalog-body');
        const dialogs = kernel.has('ui.dialogs') ? await kernel.require('ui.dialogs') : null;
        function h(tag, props = {}, ...kids) {
            const el = document.createElement(tag);
            for (const [k, v] of Object.entries(props)) {
                if (k === 'text')
                    el.textContent = v;
                else
                    el.setAttribute(k, v);
            }
            for (const kid of kids)
                el.append(kid);
            return el;
        }
        const ui = { tags: [], folders: [],
            text: '', tag: '', folder: '', pending: false, selected: null, items: [], total: 0,
            busy: false, message: '' };
        function say(message) { ui.message = message; render(); }
        async function refresh() {
            if (!conn) {
                render();
                return;
            }
            ui.busy = true;
            render();
            try {
                const q = { limit: 60, sort: { by: 'created', dir: 'desc' } };
                if (ui.text)
                    q['text'] = ui.text;
                const tagQ = {};
                if (ui.tag)
                    tagQ['all'] = [ui.tag];
                if (ui.pending)
                    tagQ['none'] = ['status:classificado'];
                if (Object.keys(tagQ).length)
                    q['tags'] = tagQ;
                if (ui.folder)
                    q['folder'] = { id: ui.folder, recursive: true };
                const [found, tags, folders] = await Promise.all([call('search', q), call('tag_list', {}), call('folder_list', {})]);
                ui.items = found.items;
                ui.total = found.total;
                ui.tags = tags.tags;
                ui.folders = folders.folders;
                if (ui.selected && !ui.items.some(i => i['id'] === ui.selected))
                    ui.selected = null;
                ui.message = '';
            }
            catch (err) {
                ui.message = err instanceof Error ? err.message : String(err);
            }
            ui.busy = false;
            render();
        }
        function connectionForm() {
            const url = h('input', { type: 'url', placeholder: 'https://hub.exemplo.com ou http://127.0.0.1:7420', 'aria-label': 'URL do Hub', autocomplete: 'off', value: lastUrl });
            const token = h('input', { type: 'password', placeholder: 'Token vbh_…', 'aria-label': 'Token do Hub', autocomplete: 'off' });
            const go = h('button', { type: 'button', class: 'btn wide', 'data-hub': 'connect', text: 'Conectar' });
            go.addEventListener('click', () => {
                lastUrl = url.value.trim();
                connect(url.value, token.value).then(() => { token.value = ''; return refresh(); })
                    .catch(err => say(err instanceof Error ? err.message : String(err)));
            });
            return h('div', { class: 'hub-connect' }, h('p', { class: 'muted', text: 'O catálogo guarda imagens em um banco de dados real (Asset Hub). A URL e o token ficam só na memória desta aba; o editor funciona normalmente sem o Hub.' }), url, token, go);
        }
        function card(item) {
            const id = String(item['id']);
            const img = h('img', { alt: String(item['title'] || item['filename'] || id), loading: 'lazy', width: '96', height: '96' });
            objectUrl(id, 'thumb').then(u => { img.src = u; }).catch(() => { img.alt = 'miniatura indisponível'; });
            const b = h('button', { type: 'button', class: 'hub-card' + (ui.selected === id ? ' is-selected' : ''), 'data-hub-id': id,
                title: String(item['title'] || item['filename'] || id), 'aria-pressed': String(ui.selected === id) }, img, h('span', { class: 'hub-card-name', text: String(item['title'] || item['filename'] || id) }));
            b.addEventListener('click', () => { ui.selected = ui.selected === id ? null : id; render(); });
            return b;
        }
        function detail(item) {
            const id = String(item['id']);
            const tags = item['tags'] || [];
            const chips = h('div', { class: 'hub-chips' });
            for (const t of tags) {
                const x = h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Remover tag ' + t, text: t + ' ×' });
                x.addEventListener('click', () => { call('tag_remove', { ids: [id], tags: [t] }).then(refresh).catch(e => say(String(e.message))); });
                chips.append(x);
            }
            const tagIn = h('input', { type: 'text', placeholder: 'nova tag (ex.: personagem:hero)', 'aria-label': 'Nova tag', maxlength: '70' });
            const addTag = () => {
                const v = tagIn.value.trim();
                if (!v)
                    return;
                call('tag_add', { ids: [id], tags: [v] }).then(() => { tagIn.value = ''; return refresh(); }).catch(e => say(String(e.message)));
            };
            tagIn.addEventListener('keydown', e => { if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
            } });
            const use = h('button', { type: 'button', class: 'btn', 'data-hub': 'place', text: 'Inserir no projeto' });
            use.addEventListener('click', () => {
                place(id).then(() => { dialogs?.toast('Imagem adicionada à biblioteca do projeto', 'ok'); return refresh(); })
                    .catch(e => say(String(e.message)));
            });
            const del = h('button', { type: 'button', class: 'btn danger', 'data-hub': 'remove', text: 'Excluir do catálogo' });
            del.addEventListener('click', async () => {
                const ok = dialogs ? await dialogs.confirm({ title: 'Excluir do catálogo', message: 'Remove a imagem do banco e da pasta de imagens do Hub. Projetos que a usam deixarão de achá-la.', confirmText: 'Excluir' }) : false;
                if (!ok)
                    return;
                call('remove', { ids: [id], force: true }).then(() => { ui.selected = null; return refresh(); }).catch(e => say(String(e.message)));
            });
            const dims = item['width'] ? item['width'] + '×' + item['height'] + ' · ' : '';
            return h('div', { class: 'hub-detail' }, h('strong', { text: String(item['title'] || item['filename']) }), h('span', { class: 'muted', text: dims + String(item['mime']) + ' · ' + Math.round(Number(item['bytes']) / 1024) + ' KB · ' + String(item['folderPath']) }), chips, tagIn, h('div', { class: 'nav-actions' }, use, del));
        }
        function render() {
            if (!body)
                return;
            body.replaceChildren();
            if (ui.message)
                body.append(h('div', { class: 'hub-msg', role: 'status', text: ui.message }));
            if (!conn) {
                body.append(connectionForm());
                return;
            }
            const search = h('input', { type: 'search', value: ui.text, placeholder: 'Buscar por nome, título ou tag', 'aria-label': 'Buscar no catálogo' });
            search.addEventListener('keydown', e => { if (e.key === 'Enter') {
                ui.text = search.value.trim();
                refresh();
            } });
            const tagSel = h('select', { 'aria-label': 'Filtrar por tag' }, h('option', { value: '', text: 'Todas as tags' }));
            for (const t of ui.tags)
                tagSel.append(h('option', { value: t.tag, text: t.tag + ' (' + t.assets + ')' }));
            tagSel.value = ui.tag;
            tagSel.addEventListener('change', () => { ui.tag = tagSel.value; refresh(); });
            const folderSel = h('select', { 'aria-label': 'Filtrar por pasta' }, h('option', { value: '', text: 'Todas as pastas' }));
            for (const f of ui.folders)
                folderSel.append(h('option', { value: f.id, text: f.path }));
            folderSel.value = ui.folder;
            folderSel.addEventListener('change', () => { ui.folder = folderSel.value; refresh(); });
            const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml', multiple: '', hidden: '', 'aria-label': 'Enviar imagens' });
            file.addEventListener('change', () => {
                const files = Array.from(file.files || []);
                file.value = '';
                (async () => {
                    for (const f of files)
                        await upload(f, ui.folder ? { folderId: ui.folder } : {});
                    await refresh();
                })().catch(e => say(String(e.message)));
            });
            const up = h('button', { type: 'button', class: 'btn', 'data-hub': 'upload', text: 'Enviar imagens…' });
            up.addEventListener('click', () => file.click());
            const scan = h('button', { type: 'button', class: 'btn', 'data-hub': 'scan', text: 'Varrer pasta de imagens' });
            scan.addEventListener('click', () => {
                call('scan', {}).then(r => {
                    const rep = r;
                    dialogs?.toast(rep.imported + ' importada(s), ' + rep.duplicates + ' repetida(s), ' + rep.errors.length + ' erro(s); ' + rep.unclassified + ' sem classificar', 'ok');
                    return refresh();
                }).catch(e => say(String(e.message)));
            });
            const pendingBox = h('input', { type: 'checkbox', 'data-hub': 'pending', 'aria-label': 'Só imagens ainda não classificadas' });
            pendingBox.checked = ui.pending;
            pendingBox.addEventListener('change', () => { ui.pending = pendingBox.checked; refresh(); });
            const pendingLabel = h('label', { class: 'hub-pending muted' }, pendingBox, ' só não classificadas (a IA ainda não viu)');
            const lib = h('button', { type: 'button', class: 'btn', 'data-hub': 'import-library', text: 'Enviar biblioteca do projeto' });
            lib.addEventListener('click', () => {
                importLibrary().then(r => { dialogs?.toast(r.uploaded + ' enviada(s), ' + r.duplicates + ' já existiam, ' + r.skipped + ' ignorada(s)', 'ok'); return refresh(); })
                    .catch(e => say(String(e.message)));
            });
            const out = h('button', { type: 'button', class: 'btn ghost', 'data-hub': 'disconnect', text: 'Desconectar' });
            out.addEventListener('click', () => { disconnect(); ui.items = []; ui.selected = null; render(); });
            const grid = h('div', { class: 'hub-grid', role: 'list' });
            ui.items.forEach(i => grid.append(card(i)));
            if (!ui.items.length && !ui.busy)
                grid.append(h('p', { class: 'muted', text: 'Nenhuma imagem encontrada.' }));
            const sel = ui.items.find(i => i['id'] === ui.selected);
            body.append(h('div', { class: 'hub-bar' }, search, tagSel, folderSel), h('div', { class: 'hub-count muted', text: (ui.busy ? 'Carregando… ' : '') + ui.total + ' imagem(ns) · ' + (conn.client || 'cliente') + ' @ ' + conn.url }), h('div', { class: 'nav-actions' }, scan, up), h('div', { class: 'nav-actions' }, lib, out), pendingLabel, file, grid, ...(sel ? [detail(sel)] : []));
        }
        if (popup) {
            new MutationObserver(() => { if (!popup.hidden) {
                if (conn)
                    refresh();
                else
                    render();
            } })
                .observe(popup, { attributes: true, attributeFilter: ['hidden'] });
        }
        kernel.trackCleanup(() => disconnect(false));
        render();
        pairFromLocation();
        kernel.provide('assetHub', {
            connect, disconnect, isConnected: () => !!conn, getStatus: status, call, blob, objectUrl, upload, place, importLibrary, pairFromLocation,
            onChange: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }
        });
    }
});
