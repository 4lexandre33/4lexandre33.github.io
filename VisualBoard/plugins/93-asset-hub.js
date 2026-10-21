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
    version: '1.1.0',
    needs: ['state', 'assets'],
    provides: ['assetHub'],
    uses: ['ui.dialogs'],
    accepts: { 'state': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'assetHub': '1.1.0' },
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
        /** Único ponto de saída de rede do editor para o Hub. */
        const net = (url, init) => fetch(url, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
        /** Se o editor foi aberto pelo próprio Hub (mesmo endereço), já sugere essa URL no formulário. */
        if (/^https?:$/.test(window.location.protocol)) {
            const origin = window.location.origin;
            net(origin + '/v1/health', {})
                .then(r => r.ok ? r.json() : null).then(j => { if (j && j['ok'] === true && typeof j['version'] === 'string') {
                lastUrl = origin;
                if (!conn)
                    render();
            } })
                .catch(() => undefined);
        }
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
                res = await net(c.url + path, { ...init, headers });
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
            const res = await http('/v1/tools/' + (verb.includes('.') ? verb : 'catalog.' + verb), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
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
        /* ------------------ sincronização (Google Drive / espelho Git) ------------------ */
        const syncUi = { open: false, status: null, msg: '', run: null, timer: 0 };
        const poll = async (runId) => {
            for (let n = 0; n < 6000; n++) {
                const r = await call('sync.run_status', { runId, waitMs: 1500 });
                syncUi.run = r['run'];
                const st = String(syncUi.run['state']);
                renderSync();
                if (st !== 'running')
                    break;
            }
            await loadSync();
        };
        async function loadSync() {
            try {
                syncUi.status = await call('sync.status');
                syncUi.msg = '';
            }
            catch (e) {
                syncUi.msg = e instanceof Error ? e.message : String(e);
            }
            renderSync();
        }
        const runBtn = (label, fn, cls = 'btn') => {
            const b = h('button', { type: 'button', class: cls, text: label });
            b.addEventListener('click', () => { fn().catch(e => { syncUi.msg = e instanceof Error ? e.message : String(e); renderSync(); }); });
            return b;
        };
        const field = (label, el) => h('label', { class: 'muted hub-field' }, label + ' ', el);
        function runSummary() {
            const r = syncUi.run;
            if (!r)
                return null;
            const names = { pulled: 'baixados', pushed: 'enviados', duplicate: 'já existiam', 'skipped-unsupported': 'não suportados', 'skipped-tombstoned': 'removidos antes', 'skipped-remote-deleted': 'apagados no Drive', linked: 'vinculados', moved: 'movidos', conflict: 'conflitos' };
            const states = { running: 'em andamento', done: 'concluído', failed: 'falhou', cancelled: 'cancelado', interrupted: 'interrompido' };
            const m = r['mirror'];
            const counts = m ? '' : Object.entries(r['counts'] || {}).filter(([k]) => names[k]).map(([k, v]) => names[k] + ': ' + v).join(' · ');
            const extra = m ? 'copiados ' + m['copied'] + ', movidos ' + m['moved'] + ', grandes pulados ' + m['skippedLarge'] + (m['pushed'] ? ', enviado ao GitHub' : '') : '';
            return h('div', { class: 'hub-msg is-info', role: 'status', 'data-run': String(r['kind']) + ':' + String(r['state']) + (r['mode'] === 'dry-run' ? ':sim' : ''),
                text: (m ? 'Espelho' : 'Sincronização') + (r['mode'] === 'dry-run' ? ' (simulação)' : '') + ' ' + (states[String(r['state'])] || String(r['state'])) +
                    (r['state'] === 'running' ? ' — ' + String(r['done']) + '/' + String(r['total']) : '') + (counts ? ' · ' + counts : '') + (extra ? ' · ' + extra : '') + (r['error'] ? ' · erro: ' + String(r['error']) : '') });
        }
        function renderSync() {
            const box = document.getElementById('hub-sync-body');
            if (!box)
                return;
            box.replaceChildren();
            if (syncUi.msg)
                box.append(h('div', { class: 'hub-msg', role: 'alert', text: syncUi.msg }));
            const st = syncUi.status;
            if (!st) {
                box.append(h('p', { class: 'muted', text: 'Carregando…' }));
                return;
            }
            const drive = st['drive'], conns = st['connections'] || [], mirror = st['mirror'];
            box.append(h('p', { class: 'muted', text: 'O mesmo arquivo (mesmo conteúdo) nunca é copiado duas vezes. Remover uma imagem aqui nunca apaga no Drive nem no GitHub.' }));
            /* Google Drive */
            box.append(h('h4', { text: 'Google Drive' }));
            if (!drive['configured']) {
                const id = h('input', { type: 'text', placeholder: 'ID do cliente OAuth', autocomplete: 'off', 'aria-label': 'ID do cliente' });
                const sec = h('input', { type: 'password', placeholder: 'Segredo do cliente', autocomplete: 'off', 'aria-label': 'Segredo do cliente' });
                const mode = h('select', { 'aria-label': 'Acesso' }, h('option', { value: 'app', text: 'Só arquivos criados pelo VisualBoard (mais seguro)' }), h('option', { value: 'read', text: 'Ler pastas já existentes (somente leitura)' }), h('option', { value: 'full', text: 'Ler e gravar em pastas existentes' }));
                box.append(field('Cliente', id), field('Segredo', sec), field('Acesso', mode), runBtn('Salvar credenciais', async () => { await call('sync.drive_configure', { clientId: id.value, clientSecret: sec.value, mode: mode.value }); sec.value = ''; await loadSync(); }), h('p', { class: 'muted', text: 'Veja docs/media-sync.md para criar as credenciais (tipo “App para computador”). Elas ficam só no seu Hub, nunca no navegador.' }));
            }
            else if (!drive['connected']) {
                box.append(runBtn('Conectar ao Google', async () => {
                    const r = await call('sync.drive_auth_start');
                    window.open(String(r['authUrl']), '_blank', 'noopener');
                    for (let n = 0; n < 150; n++) {
                        await new Promise(res => setTimeout(res, 2000));
                        const s = await call('sync.drive_auth_status');
                        if (s['connected'] || s['error'])
                            break;
                    }
                    await loadSync();
                }), h('span', { class: 'muted', text: ' A janela do Google abre; depois de autorizar, volte aqui.' }));
            }
            else {
                box.append(h('p', { text: 'Conectado' + (drive['email'] ? ' como ' + String(drive['email']) : '') + ' · acesso: ' + String(drive['mode']) }), runBtn('Desconectar do Google', async () => { await call('sync.drive_revoke'); await loadSync(); }, 'btn ghost'));
                for (const c of conns) {
                    const cid = String(c['id']);
                    box.append(h('div', { class: 'hub-conn' }, h('strong', { text: String(c['rootRemoteName'] || c['label']) }), h('span', { class: 'muted', text: ' · ' + String(c['direction']) }), h('div', { class: 'nav-actions' }, runBtn('Simular', async () => { const r = await call('sync.run', { connectionId: cid, simulate: true }); syncUi.run = r['run']; renderSync(); }), runBtn('Sincronizar', async () => { const r = await call('sync.run', { connectionId: cid }); syncUi.run = r['run']; renderSync(); await poll(String(r['run']['id'])); await refresh(); }), runBtn('Cancelar', async () => { if (syncUi.run)
                        await call('sync.cancel', { runId: String(syncUi.run['id']) }); }, 'btn ghost'), runBtn('Desvincular', async () => { await call('sync.disconnect', { connectionId: cid }); await loadSync(); }, 'btn ghost'))));
                }
                const link = h('input', { type: 'text', placeholder: 'Link ou ID da pasta do Drive (vazio = criar “VisualBoard”)', 'aria-label': 'Pasta do Drive' });
                const dir = h('select', { 'aria-label': 'Direção' }, h('option', { value: 'both', text: 'Nos dois sentidos' }), h('option', { value: 'pull', text: 'Só baixar do Drive' }), h('option', { value: 'push', text: 'Só enviar ao Drive' }));
                box.append(h('h5', { text: 'Vincular pasta' }), field('Pasta', link), field('Direção', dir), runBtn('Vincular', async () => {
                    const q = { provider: 'drive', direction: dir.value };
                    if (link.value.trim())
                        q['rootRemote'] = link.value.trim();
                    else
                        q['createRoot'] = 'VisualBoard';
                    await call('sync.connect', q);
                    await loadSync();
                }));
            }
            /* Espelho Git */
            box.append(h('h4', { text: 'Espelho no GitHub (repositório privado)' }));
            const mc = mirror['connection'];
            const repo = h('input', { type: 'text', placeholder: 'Pasta local do clone do repositório', value: String(((mc && mc['options'])?.['repoDir']) || ''), 'aria-label': 'Pasta do repositório' });
            const push = h('input', { type: 'checkbox', 'aria-label': 'Enviar (push) após o commit' });
            box.append(field('Repositório', repo), h('label', { class: 'muted' }, push, ' enviar (push) ao GitHub depois de cada cópia'), runBtn('Salvar espelho', async () => { await call('sync.mirror_configure', { repoDir: repo.value.trim(), push: push.checked }); await loadSync(); }));
            if (mirror['configured']) {
                box.append(h('p', { class: 'muted', text: 'Já copiados: ' + String(mirror['copied']) + ' · grandes pulados: ' + String(mirror['skippedLarge']) }), h('div', { class: 'nav-actions' }, runBtn('Simular', async () => { const r = await call('sync.mirror_run', { simulate: true }); syncUi.run = r['run']; renderSync(); }), runBtn('Copiar novos arquivos', async () => { const r = await call('sync.mirror_run', {}); syncUi.run = r['run']; renderSync(); await poll(String(r['run']['id'])); })));
            }
            const sum = runSummary();
            if (sum)
                box.append(sum);
        }
        function syncSection() {
            const d = h('details', { class: 'hub-sync', 'data-hub': 'sync' }, h('summary', { text: 'Sincronização (Google Drive e GitHub)' }), h('div', { id: 'hub-sync-body' }));
            if (syncUi.open)
                d.setAttribute('open', '');
            d.addEventListener('toggle', () => { syncUi.open = d.open; if (d.open)
                loadSync(); });
            if (syncUi.open)
                queueMicrotask(renderSync);
            return d;
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
            const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml,audio/*,.ttf,.otf,.woff,.woff2', multiple: '', hidden: '', 'aria-label': 'Enviar imagens' });
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
            body.append(h('div', { class: 'hub-bar' }, search, tagSel, folderSel), h('div', { class: 'hub-count muted', text: (ui.busy ? 'Carregando… ' : '') + ui.total + ' imagem(ns) · ' + (conn.client || 'cliente') + ' @ ' + conn.url }), h('div', { class: 'nav-actions' }, scan, up), h('div', { class: 'nav-actions' }, lib, out), pendingLabel, file, grid, ...(sel ? [detail(sel)] : []), syncSection());
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
            connect, disconnect, isConnected: () => !!conn, getStatus: status, request: (path, init = {}) => http(path, init), call, blob, objectUrl, upload, place, importLibrary, pairFromLocation,
            onChange: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }
        });
    }
});
