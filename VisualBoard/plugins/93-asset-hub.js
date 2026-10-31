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
    version: '1.3.0',
    needs: ['state', 'assets'],
    provides: ['assetHub'],
    uses: ['ui.dialogs'],
    accepts: { 'state': '^1.0.0', 'assets': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'assetHub': '1.3.0' },
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
            void flushDeposits().catch(() => undefined);
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
        /** Anotações que não puderam ser aplicadas depois do envio (o arquivo já está no Hub): tentadas de novo em `flushDeposits`. */
        const semanticRetry = [];
        async function applySemantic(res, patch) {
            if (!patch || !Object.keys(patch).length)
                return { semanticApplied: false };
            const id = String((res || {})['asset']?.['id'] ?? '');
            if (!id)
                return { semanticApplied: false, semanticError: 'resposta do Hub sem id' };
            try {
                await call('semantic_set', { id, origin: 'manual', ...patch });
                return { semanticApplied: true };
            }
            catch (e) {
                semanticRetry.push({ id, patch });
                return { semanticApplied: false, semanticError: e instanceof Error ? e.message : String(e) };
            }
        }
        async function upload(file, opts = {}) {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const res = await call('add', { filename: file.name, dataBase64: toBase64(bytes), ...(opts.folderId ? { folderId: opts.folderId } : {}),
                ...(opts.tags && opts.tags.length ? { tags: opts.tags } : {}) });
            return opts.semantic ? { ...res, ...(await applySemantic(res, opts.semantic)) } : res;
        }
        /* ---------------- depósito (arquivos feitos aqui vão para o Hub/Drive) ----------------
         * Desligado por padrão. Quando ligado, todo asset derivado (editor de imagem/áudio) é enviado ao Hub com a procedência
         * (`derivedFrom` = SHA-256 do original). Sem Hub conectado, o arquivo fica numa fila em memória (perdida ao recarregar a página) e sai na próxima conexão.
         * O Hub nunca sobrescreve: conteúdo diferente vira nova versão/cópia (ver docs/media-sync.md). */
        const QUEUE_MAX = 100, QUEUE_BYTES = 300 * 1024 * 1024;
        let autoOn = false; // a política do editor é não usar armazenamento do navegador: a opção vale até recarregar
        const autoDeposit = () => autoOn;
        const setAutoDeposit = (on) => { autoOn = !!on; };
        const memoryQueue = [];
        const queueEntries = async () => memoryQueue.map((item, i) => ({ key: i, item }));
        async function enqueue(item) {
            if (memoryQueue.length >= QUEUE_MAX || memoryQueue.reduce((n, e) => n + e.blob.size, item.blob.size) > QUEUE_BYTES)
                return false;
            memoryQueue.push(item);
            return true;
        }
        const dropQueued = async (item) => { const i = memoryQueue.indexOf(item); if (i >= 0)
            memoryQueue.splice(i, 1); };
        const sha256Of = async (blob) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))).map(b => b.toString(16).padStart(2, '0')).join('');
        async function sendPending(item) {
            const bytes = new Uint8Array(await item.blob.arrayBuffer());
            const res = await call('add', { filename: item.filename, dataBase64: toBase64(bytes), tags: ['origem:editor'], ...(item.derivedFrom ? { derivedFrom: item.derivedFrom } : {}), ...(item.operations ? { operations: item.operations } : {}) });
            await applySemantic(res, item.semantic); // falha só da anotação não perde o arquivo: fica em semanticRetry
        }
        /** Deposita um arquivo no Hub (ou na fila, se não houver conexão com escopo de escrita). */
        async function deposit(file, filename, opts = {}) {
            const item = { filename, blob: file, ...(opts.semantic && Object.keys(opts.semantic).length ? { semantic: opts.semantic } : {}), ...(opts.derivedFrom ? { derivedFrom: opts.derivedFrom } : {}), ...(opts.operations ? { operations: opts.operations } : {}) };
            if (conn && conn.scopes.includes('write')) {
                try {
                    await sendPending(item);
                    return { state: 'sent' };
                }
                catch (e) {
                    if (e.code !== 'HUB_UNREACHABLE')
                        throw e;
                }
            }
            return { state: (await enqueue(item)) ? 'queued' : 'rejected' };
        }
        async function flushDeposits() {
            const out = { sent: 0, failed: 0, remaining: 0 };
            if (!conn || !conn.scopes.includes('write')) {
                out.remaining = (await queueEntries()).length;
                return out;
            }
            for (const e of await queueEntries()) {
                try {
                    await sendPending(e.item);
                    await dropQueued(e.item);
                    out.sent++;
                }
                catch {
                    out.failed++;
                }
            }
            for (const r of semanticRetry.splice(0)) {
                try {
                    await call('semantic_set', { id: r.id, origin: 'manual', ...r.patch });
                }
                catch {
                    semanticRetry.push(r);
                    out.failed++;
                }
            }
            out.remaining = (await queueEntries()).length + semanticRetry.length;
            return out;
        }
        const depositPending = async () => (await queueEntries()).length + semanticRetry.length;
        const deposited = new Set();
        async function depositDerived() {
            if (!autoDeposit())
                return;
            for (const a of S.assets) {
                if (!a.derivedFrom || deposited.has(a.id))
                    continue;
                const blob = assets.blobs.get(a.id), src = assets.blobs.get(a.derivedFrom);
                if (!blob)
                    continue;
                deposited.add(a.id);
                try {
                    const ops = (a.operations ?? []).map(o => (o.processor ?? '') + ':' + (o.operation ?? '')).join(', ').slice(0, 300);
                    await deposit(blob, String(a.name || a.id), { ...(src ? { derivedFrom: await sha256Of(src) } : {}), ...(ops ? { operations: ops } : {}) });
                }
                catch {
                    deposited.delete(a.id);
                }
            }
        }
        kernel.on('assets:changed', () => { void depositDerived(); });
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
        /* ---------------- anotações semânticas (componente `semantic` do Hub) ---------------- */
        /** Rótulos em português. Os VALORES vêm sempre do Hub (`semantic_vocabulary`); valor sem rótulo aparece cru. */
        const SEM_LABEL = {
            manequim: 'Manequim', personagem: 'Personagem', grupo: 'Grupo', objeto: 'Objeto', cenario: 'Cenário', textura: 'Textura', efeito: 'Efeito', cena: 'Cena', balao: 'Balão', outro: 'Outro',
            'em-pe': 'Em pé', sentado: 'Sentado', ajoelhado: 'Ajoelhado', agachado: 'Agachado', deitado: 'Deitado', andando: 'Andando', correndo: 'Correndo', saltando: 'Saltando',
            golpeando: 'Golpeando', apontando: 'Apontando', abracando: 'Abraçando',
            frente: 'Frente', 'tres-quartos-frente': '3/4 frente', perfil: 'Perfil', 'tres-quartos-costas': '3/4 costas', costas: 'Costas',
            baixa: 'Baixa (E1 azul)', media: 'Média', alta: 'Alta (E3 roxo)', perto: 'Perto', longe: 'Longe', aberto: 'Aberto (tracejado)', fechado: 'Fechado (sólido)',
            'referencia-pose': 'Referência de pose', 'referencia-enquadramento': 'Referência de enquadramento', blocking: 'Blocking', fundo: 'Fundo', adereco: 'Adereço', quadro: 'Quadro'
        };
        const SEM_GROUPS = [
            { key: 'subject', title: 'Assunto' }, { key: 'roles', title: 'Função', multi: true }, { key: 'pose', title: 'Pose' }, { key: 'facing', title: 'Orientação do corpo' },
            { key: 'cameraElevation', title: 'Elevação da câmera', cls: 'elev' }, { key: 'cameraDistance', title: 'Distância da câmera' }, { key: 'cameraFraming', title: 'Enquadramento' }
        ];
        /** Distância/elevação "media" têm o mesmo valor; o rótulo é por faceta. */
        const semLabel = (facet, value) => facet === 'cameraElevation' && value === 'media' ? 'Média (E2 laranja)' : facet === 'cameraDistance' && value === 'media' ? 'Média' : (SEM_LABEL[value] ?? value);
        let semVocab = null;
        async function semanticVocabulary() {
            if (semVocab && semVocab.conn === conn)
                return semVocab.data;
            const data = await call('semantic_vocabulary');
            if (conn)
                semVocab = { conn, data };
            return data;
        }
        const semanticGet = async (id) => await call('semantic_get', { id });
        const semanticSet = async (id, patch, opts = {}) => await call('semantic_set', { id, ...patch, ...opts });
        const semanticClear = async (id) => await call('semantic_clear', { id });
        const semanticFacets = async () => (await call('semantic_facets'))['facets'] ?? [];
        /** Cartão de anotação para outros plugins (editor de imagem): null sem conexão/escopo de escrita. `patch()` = só o que foi tocado. */
        async function semanticDraftForm() {
            if (!conn || !conn.scopes.includes('write'))
                return null;
            try {
                return draftFields(await semanticVocabulary());
            }
            catch {
                return null;
            }
        }
        /** Selos das miniaturas: assunto, pose e elevação, lidos das tags `sem.*` (sem chamada extra). */
        function semBadges(tags) {
            const pick = (ns, facet) => tags.filter(t => t.startsWith('sem.' + ns + ':')).map(t => semLabel(facet, t.slice(('sem.' + ns + ':').length)).replace(/ \(.*\)$/, ''));
            return [...pick('assunto', 'subject'), ...pick('pose', 'pose'), ...pick('elevacao', 'cameraElevation')].slice(0, 3);
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
            busy: false, message: '',
            /* semântica: filtros, seleção múltipla e vocabulário/contagens carregados do Hub */
            sem: {}, annotated: '', multi: new Set(), selectMode: false, lastIndex: -1,
            facets: [], vocab: null, batchOpen: false, filtersOpen: false };
        function say(message) { ui.message = message; render(); }
        /** Consulta atual do painel (texto, tag, pendentes, pasta e filtros semânticos). */
        function buildQuery() {
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
            const sem = {};
            for (const [k, set] of Object.entries(ui.sem))
                if (set.size)
                    sem[k] = [...set];
            if (Object.keys(sem).length)
                q['semantic'] = sem;
            if (ui.annotated)
                q['annotated'] = ui.annotated === 'yes';
            return q;
        }
        async function refresh() {
            if (!conn) {
                render();
                return;
            }
            ui.busy = true;
            render();
            try {
                const [found, tags, folders, facets, vocab] = await Promise.all([call('search', buildQuery()), call('tag_list', {}), call('folder_list', {}),
                    semanticFacets().catch(() => []), semanticVocabulary().catch(() => null)]);
                ui.items = found.items;
                ui.total = found.total;
                ui.tags = tags.tags;
                ui.folders = folders.folders;
                ui.facets = facets;
                ui.vocab = vocab;
                if (ui.selected && !ui.items.some(i => i['id'] === ui.selected))
                    ui.selected = null;
                for (const id of [...ui.multi])
                    if (!ui.items.some(i => i['id'] === id))
                        ui.multi.delete(id);
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
        /** Ficha semântica de UMA imagem: seletores do vocabulário do Hub, bússola e texto livre. Grava por campo (um `semantic_set` por alteração). */
        function semanticBlock(id, version) {
            const box = h('div', { class: 'hub-sem', 'data-hub': 'semantic' });
            const canWrite = !!conn && conn.scopes.includes('write');
            const live = h('span', { class: 'hub-sem-live muted', role: 'status', 'aria-live': 'polite' });
            let ver = version, cur = {}, vocab = null;
            const set = (text) => { live.textContent = text; };
            const save = async (patch) => {
                set('Salvando…');
                try {
                    const r = await semanticSet(id, cur.origin === 'scene-blocking' ? { ...patch, origin: 'manual' } : patch, ver ? { expectedVersion: ver } : {});
                    ver = r.version;
                    cur = r.semantic ?? {};
                    set('Salvo');
                    sync();
                    refreshQuiet();
                }
                catch (e) {
                    const code = e.code;
                    if (code === 'CONFLICT') {
                        set('A imagem foi alterada em outro lugar; recarregando.');
                        refresh().catch(() => undefined);
                    }
                    else
                        set(e instanceof Error ? e.message : String(e));
                    semanticGet(id).then(g => { cur = g.semantic ?? {}; sync(); }).catch(() => undefined);
                }
            };
            const group = (g) => {
                const def = g.multi ? vocab.multi[g.key] : vocab.single[g.key];
                const wrap = h('div', { class: 'hub-sem-group', role: 'group', 'aria-label': g.title }, h('span', { class: 'hub-sem-title', text: g.title }));
                if (!def)
                    return wrap;
                const row = h('div', { class: 'hub-sem-opts' });
                for (const v of def.values) {
                    const isOn = () => g.multi ? (cur.roles ?? []).includes(v) : cur[g.key] === v;
                    const b = h('button', { type: 'button', class: 'btn ghost hub-sem-opt' + (isOn() ? ' is-on' : ''), 'aria-pressed': String(isOn()), 'data-sem': g.key, 'data-value': v, text: semLabel(g.key, v) });
                    if (!canWrite)
                        b.setAttribute('disabled', '');
                    b.addEventListener('click', () => {
                        const on = isOn();
                        if (g.multi) {
                            const list = new Set(cur.roles ?? []);
                            if (on)
                                list.delete(v);
                            else
                                list.add(v);
                            void save({ roles: list.size ? [...list] : null });
                        }
                        else
                            void save({ [g.key]: on ? null : v });
                    });
                    row.append(b);
                }
                wrap.append(row);
                return wrap;
            };
            let redrawCompass = null;
            const compass = () => {
                const deg = typeof cur.facingDegrees === 'number' ? cur.facingDegrees : null;
                const NS = 'http://www.w3.org/2000/svg';
                const svg = document.createElementNS(NS, 'svg');
                svg.setAttribute('viewBox', '-50 -50 100 100');
                svg.setAttribute('width', '84');
                svg.setAttribute('height', '84');
                svg.setAttribute('class', 'hub-sem-compass');
                svg.setAttribute('role', 'img');
                svg.setAttribute('aria-label', deg === null ? 'Bússola sem direção definida' : 'Bússola apontando para ' + deg + ' graus');
                const ring = document.createElementNS(NS, 'circle');
                ring.setAttribute('r', '44');
                ring.setAttribute('fill', 'none');
                ring.setAttribute('stroke', 'currentColor');
                ring.setAttribute('stroke-width', '2');
                const north = document.createElementNS(NS, 'text');
                north.setAttribute('y', '-33');
                north.setAttribute('text-anchor', 'middle');
                north.setAttribute('font-size', '14');
                north.setAttribute('fill', 'currentColor');
                north.textContent = 'N';
                svg.append(ring, north);
                const needle = document.createElementNS(NS, 'polygon');
                needle.setAttribute('points', '0,-26 7,8 0,3 -7,8');
                needle.setAttribute('fill', 'currentColor');
                needle.setAttribute('class', 'hub-sem-needle');
                svg.append(needle);
                const draw = (d) => {
                    needle.setAttribute('display', d === null ? 'none' : 'inline');
                    if (d !== null)
                        needle.setAttribute('transform', 'rotate(' + d + ')');
                    svg.setAttribute('aria-label', d === null ? 'Bússola sem direção definida' : 'Bússola apontando para ' + d + ' graus');
                };
                draw(deg);
                redrawCompass = draw;
                if (canWrite)
                    svg.addEventListener('click', ev => {
                        const r = svg.getBoundingClientRect();
                        const dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
                        void save({ facingDegrees: Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) });
                    });
                const num = h('input', { type: 'number', min: '0', max: '359', step: '1', 'aria-label': 'Direção do corpo em graus (0 = norte, sentido horário)', 'data-sem': 'facingDegrees', value: deg === null ? '' : String(deg) });
                if (!canWrite)
                    num.setAttribute('disabled', '');
                num.addEventListener('change', () => { void save({ facingDegrees: num.value.trim() === '' ? null : Number(num.value) }); });
                return h('div', { class: 'hub-sem-group hub-sem-dir' }, h('span', { class: 'hub-sem-title', text: 'Direção do corpo (graus)' }), svg, num);
            };
            /** Atualiza estados e valores NO LUGAR (sem recriar controles): o que a pessoa está digitando em outro campo não se perde. */
            function sync() {
                for (const b of Array.from(box.querySelectorAll('button[data-sem]'))) {
                    const key = b.dataset['sem'] ?? '', v = b.dataset['value'] ?? '';
                    const on = key === 'roles' ? (cur.roles ?? []).includes(v) : cur[key] === v;
                    b.classList.toggle('is-on', on);
                    b.setAttribute('aria-pressed', String(on));
                }
                const put = (sel, value) => { const el = box.querySelector(sel); if (el && document.activeElement !== el)
                    el.value = value; };
                put('[data-sem="facingDegrees"]', typeof cur.facingDegrees === 'number' ? String(cur.facingDegrees) : '');
                put('[data-sem="characters"]', typeof cur.characters === 'number' ? String(cur.characters) : '');
                put('[data-sem="represents"]', cur.represents ?? '');
                redrawCompass?.(typeof cur.facingDegrees === 'number' ? cur.facingDegrees : null);
            }
            function build() {
                box.replaceChildren();
                if (!vocab)
                    return;
                box.append(h('strong', { text: 'Semântica' }), live);
                if (!canWrite)
                    box.append(h('p', { class: 'muted', text: 'Este token só lê: peça um token com escopo de escrita para catalogar.' }));
                for (const g of SEM_GROUPS) {
                    box.append(group(g));
                    if (g.key === 'facing')
                        box.append(compass());
                }
                box.append(h('p', { class: 'hub-sem-legend muted' }, h('span', { class: 'hub-sem-dot e1' }), ' baixa E1 ', h('span', { class: 'hub-sem-dot e2' }), ' média E2 ', h('span', { class: 'hub-sem-dot e3' }), ' alta E3 · tracejado = aberto · sólido = fechado'));
                const chars = h('input', { type: 'number', min: '0', max: '8', step: '1', 'aria-label': 'Quantidade de personagens (0 a 8)', 'data-sem': 'characters', value: typeof cur.characters === 'number' ? String(cur.characters) : '' });
                if (!canWrite)
                    chars.setAttribute('disabled', '');
                chars.addEventListener('change', () => { void save({ characters: chars.value.trim() === '' ? null : Number(chars.value) }); });
                box.append(h('label', { class: 'hub-sem-group' }, h('span', { class: 'hub-sem-title', text: 'Personagens' }), chars));
                const rep = h('textarea', { maxlength: '500', rows: '2', 'aria-label': 'O que a imagem representa', 'data-sem': 'represents', placeholder: 'O que esta imagem representa (opcional)' });
                rep.value = cur.represents ?? '';
                if (!canWrite)
                    rep.setAttribute('disabled', '');
                rep.addEventListener('change', () => { void save({ represents: rep.value.trim() === '' ? null : rep.value }); });
                box.append(h('label', { class: 'hub-sem-group' }, h('span', { class: 'hub-sem-title', text: 'O que representa' }), rep));
                if (cur.origin === 'scene-blocking')
                    box.append(h('p', { class: 'muted', text: 'Preenchido a partir do Scene Blocking; editar à mão passa a valer como manual.' }));
            }
            function load() {
                Promise.all([semanticVocabulary(), semanticGet(id)]).then(([v, g]) => { vocab = v; cur = g.semantic ?? {}; build(); })
                    .catch(e => { box.replaceChildren(h('p', { class: 'muted', text: 'Semântica indisponível: ' + (e instanceof Error ? e.message : String(e)) })); });
            }
            load();
            return box;
        }
        /** Atualiza a lista (selos e contagens) sem recriar a ficha aberta nem tirar o foco do usuário. */
        function refreshQuiet() {
            if (!conn)
                return;
            call('search', buildQuery()).then(r => {
                const found = r;
                for (const it of found.items) {
                    const old = ui.items.find(o => o['id'] === it['id']);
                    if (old)
                        old['tags'] = it['tags'];
                    const cardEl = body?.querySelector('[data-hub-id="' + String(it['id']).replace(/"/g, '') + '"] .hub-card-badges');
                    if (cardEl)
                        cardEl.replaceChildren(...semBadgeNodes(it['tags'] || []));
                }
            }).catch(() => undefined);
        }
        function semBadgeNodes(tags) {
            const b = semBadges(tags);
            return b.length ? b.map(t => h('span', { class: 'hub-badge', text: t })) : [h('span', { class: 'hub-badge is-empty', text: 'sem anotação' })];
        }
        /** Filtros por faceta (E entre facetas, OU dentro de uma faceta) com a contagem de imagens de cada valor. */
        function semanticFilters() {
            const active = Object.values(ui.sem).reduce((n, set) => n + set.size, 0) + (ui.annotated ? 1 : 0);
            const det = h('details', { class: 'hub-sem-filter', 'data-hub': 'semantic-filters' }, h('summary', { text: 'Filtrar por semântica' + (active ? ' (' + active + ' ativo' + (active > 1 ? 's' : '') + ')' : '') }));
            if (active || ui.filtersOpen)
                det.setAttribute('open', '');
            det.addEventListener('toggle', () => { ui.filtersOpen = det.open; });
            const vocab = ui.vocab;
            if (!vocab) {
                det.append(h('p', { class: 'muted', text: 'Vocabulário semântico indisponível neste Hub.' }));
                return det;
            }
            const ann = h('select', { 'aria-label': 'Anotação semântica', 'data-sem-filter': 'annotated' }, h('option', { value: '', text: 'Com ou sem anotação' }), h('option', { value: 'no', text: 'Só sem anotação' }), h('option', { value: 'yes', text: 'Só anotadas' }));
            ann.value = ui.annotated;
            ann.addEventListener('change', () => { ui.annotated = ann.value; ui.multi.clear(); refresh(); });
            det.append(ann);
            for (const g of SEM_GROUPS) {
                const def = g.multi ? vocab.multi[g.key] : vocab.single[g.key];
                if (!def)
                    continue;
                const count = (v) => ui.facets.find(f => f.facet === def.tag && f.value === v)?.assets ?? 0;
                const row = h('div', { class: 'hub-sem-opts' });
                for (const v of def.values) {
                    const on = ui.sem[g.key]?.has(v) ?? false;
                    const b = h('button', { type: 'button', class: 'btn ghost hub-sem-opt' + (on ? ' is-on' : ''), 'aria-pressed': String(on), 'data-sem-filter': g.key, 'data-value': v, text: semLabel(g.key, v) + ' (' + count(v) + ')' });
                    b.addEventListener('click', () => {
                        const set = ui.sem[g.key] ?? (ui.sem[g.key] = new Set());
                        if (set.has(v))
                            set.delete(v);
                        else
                            set.add(v);
                        ui.multi.clear();
                        refresh();
                    });
                    row.append(b);
                }
                det.append(h('div', { class: 'hub-sem-group', role: 'group', 'aria-label': 'Filtro: ' + g.title }, h('span', { class: 'hub-sem-title', text: g.title }), row));
            }
            if (active) {
                const clear = h('button', { type: 'button', class: 'btn ghost', 'data-hub': 'semantic-filters-clear', text: 'Limpar filtros semânticos' });
                clear.addEventListener('click', () => { ui.sem = {}; ui.annotated = ''; ui.multi.clear(); refresh(); });
                det.append(clear);
            }
            return det;
        }
        /** Barra de seleção: modo seleção (teclado/toque), selecionar a página, limpar. */
        function selectionBar() {
            const mode = h('input', { type: 'checkbox', 'data-hub': 'select-mode', 'aria-label': 'Modo seleção: clicar marca várias imagens' });
            mode.checked = ui.selectMode;
            mode.addEventListener('change', () => { ui.selectMode = mode.checked; if (ui.selectMode)
                ui.selected = null; render(); });
            const all = h('button', { type: 'button', class: 'btn ghost', 'data-hub': 'select-page', text: 'Selecionar esta página' });
            all.addEventListener('click', () => { ui.selectMode = true; ui.selected = null; for (const i of ui.items)
                ui.multi.add(String(i['id'])); render(); });
            const none = h('button', { type: 'button', class: 'btn ghost', 'data-hub': 'select-none', text: 'Limpar seleção' });
            none.addEventListener('click', () => { ui.multi.clear(); render(); });
            return h('div', { class: 'hub-selbar' }, h('label', { class: 'muted' }, mode, ' modo seleção (Ctrl/Shift+clique também)'), all, none, h('span', { class: 'muted', role: 'status', 'aria-live': 'polite', 'data-hub': 'select-count', text: ui.multi.size ? ui.multi.size + ' selecionada(s)' : '' }));
        }
        /** Campos "não alterar" por padrão (vocabulário do Hub): usado no lote e no cartão do editor de imagem. `patch()` devolve só o que foi tocado. */
        function draftFields(vocab) {
            const container = h('div', { class: 'hub-draft' });
            const fields = [];
            for (const g of SEM_GROUPS) {
                const def = g.multi ? vocab.multi[g.key] : vocab.single[g.key];
                if (!def)
                    continue;
                if (g.multi) {
                    const wrap = h('fieldset', { class: 'hub-sem-group' }, h('legend', { class: 'hub-sem-title', text: g.title + ' (substitui as funções atuais)' }));
                    const boxes = def.values.map(v => { const c = h('input', { type: 'checkbox', value: v, 'data-batch': g.key }); wrap.append(h('label', { class: 'hub-sem-check' }, c, ' ' + semLabel(g.key, v))); return c; });
                    container.append(wrap);
                    fields.push(() => boxes.some(c => c.checked) ? [g.key, boxes.filter(c => c.checked).map(c => c.value)] : null);
                    continue;
                }
                const sel = h('select', { 'aria-label': g.title, 'data-batch': g.key }, h('option', { value: '', text: 'não alterar' }), h('option', { value: '__clear__', text: '(limpar)' }));
                for (const v of def.values)
                    sel.append(h('option', { value: v, text: semLabel(g.key, v) }));
                container.append(h('label', { class: 'hub-sem-group' }, h('span', { class: 'hub-sem-title', text: g.title }), sel));
                fields.push(() => sel.value === '' ? null : [g.key, sel.value === '__clear__' ? null : sel.value]);
            }
            const deg = h('input', { type: 'number', min: '0', max: '359', step: '1', placeholder: 'não alterar', 'aria-label': 'Direção do corpo em graus', 'data-batch': 'facingDegrees' });
            const chars = h('input', { type: 'number', min: '0', max: '8', step: '1', placeholder: 'não alterar', 'aria-label': 'Quantidade de personagens', 'data-batch': 'characters' });
            container.append(h('label', { class: 'hub-sem-group' }, h('span', { class: 'hub-sem-title', text: 'Direção do corpo (graus)' }), deg), h('label', { class: 'hub-sem-group' }, h('span', { class: 'hub-sem-title', text: 'Personagens' }), chars));
            fields.push(() => deg.value.trim() === '' ? null : ['facingDegrees', Number(deg.value)], () => chars.value.trim() === '' ? null : ['characters', Number(chars.value)]);
            return { el: container, patch: () => { const out = {}; for (const f of fields) {
                    const kv = f();
                    if (kv)
                        out[kv[0]] = kv[1];
                } return out; } };
        }
        /** Anotação em lote: só o que a pessoa tocar é enviado (mescla); "(limpar)" remove o campo; tudo-ou-nada no Hub. */
        function batchPanel() {
            const ids = [...ui.multi];
            const box = h('div', { class: 'hub-sem hub-batch', 'data-hub': 'semantic-batch' }, h('strong', { text: 'Anotar ' + ids.length + ' imagem(ns) de uma vez' }));
            const vocab = ui.vocab;
            if (!vocab || !conn || !conn.scopes.includes('write')) {
                box.append(h('p', { class: 'muted', text: !vocab ? 'Vocabulário semântico indisponível.' : 'Este token só lê: peça um token com escopo de escrita.' }));
                return box;
            }
            box.append(h('p', { class: 'muted', text: 'Campos em "não alterar" ficam como estão em cada imagem.' }));
            const draft = draftFields(vocab);
            box.append(draft.el);
            const go = h('button', { type: 'button', class: 'btn', 'data-hub': 'semantic-batch-apply', text: 'Aplicar a ' + ids.length });
            const out = h('span', { class: 'muted', role: 'status', 'aria-live': 'polite', 'data-hub': 'semantic-batch-result' });
            go.addEventListener('click', async () => {
                const patch = draft.patch();
                if (!Object.keys(patch).length) {
                    out.textContent = 'Escolha ao menos um campo para alterar.';
                    return;
                }
                if (ids.length > 5 && dialogs) {
                    const ok = await dialogs.confirm({ title: 'Anotar em lote', message: 'Aplicar ' + Object.keys(patch).length + ' campo(s) a ' + ids.length + ' imagens? Isso não tem Desfazer no Hub.', confirmText: 'Aplicar' });
                    if (!ok)
                        return;
                }
                go.setAttribute('disabled', '');
                out.textContent = 'Aplicando…';
                try {
                    const r = await call('semantic_set_many', { ids, ...patch });
                    dialogs?.toast(r.updated + ' imagem(ns) anotada(s)', 'ok');
                    await refresh();
                }
                catch (e) {
                    out.textContent = 'Nada foi alterado: ' + (e instanceof Error ? e.message : String(e));
                    go.removeAttribute('disabled');
                }
            });
            box.append(h('div', { class: 'nav-actions' }, go), out);
            /* copiar as anotações de uma imagem para as selecionadas (substitui as anteriores) */
            const src = h('select', { 'aria-label': 'Copiar anotações de', 'data-hub': 'semantic-copy-source' }, h('option', { value: '', text: 'Copiar anotações de…' }));
            for (const i of ui.items.filter(x => !ui.multi.has(String(x['id']))))
                src.append(h('option', { value: String(i['id']), text: String(i['title'] || i['filename'] || i['id']) }));
            const copy = h('button', { type: 'button', class: 'btn ghost', 'data-hub': 'semantic-copy', text: 'Copiar para as selecionadas' });
            copy.addEventListener('click', async () => {
                if (!src.value) {
                    out.textContent = 'Escolha a imagem de origem.';
                    return;
                }
                try {
                    const g = await semanticGet(src.value);
                    if (!g.semantic) {
                        out.textContent = 'A imagem de origem não tem anotações.';
                        return;
                    }
                    const { v: _v, updatedAt: _u, ...fields } = g.semantic;
                    if (dialogs && !(await dialogs.confirm({ title: 'Copiar anotações', message: 'Substituir as anotações de ' + ids.length + ' imagem(ns) pelas da imagem escolhida?', confirmText: 'Copiar' })))
                        return;
                    const r = await call('semantic_set_many', { ids, ...fields, origin: 'manual', replace: true });
                    dialogs?.toast(r.updated + ' imagem(ns) atualizada(s)', 'ok');
                    await refresh();
                }
                catch (e) {
                    out.textContent = 'Nada foi alterado: ' + (e instanceof Error ? e.message : String(e));
                }
            });
            box.append(h('div', { class: 'nav-actions' }, src, copy));
            return box;
        }
        function card(item) {
            const id = String(item['id']);
            const img = h('img', { alt: String(item['title'] || item['filename'] || id), loading: 'lazy', width: '96', height: '96' });
            objectUrl(id, 'thumb').then(u => { img.src = u; }).catch(() => { img.alt = 'miniatura indisponível'; });
            const multi = ui.multi.has(id);
            const b = h('button', { type: 'button', class: 'hub-card' + (ui.selected === id ? ' is-selected' : '') + (multi ? ' is-multi' : ''), 'data-hub-id': id,
                title: String(item['title'] || item['filename'] || id), 'aria-pressed': String(ui.selected === id || multi) }, img, h('span', { class: 'hub-card-name', text: String(item['title'] || item['filename'] || id) }), h('span', { class: 'hub-card-badges' }, ...semBadgeNodes(item['tags'] || [])));
            b.addEventListener('click', ev => {
                const idx = ui.items.findIndex(i => i['id'] === id);
                if (ev.shiftKey && ui.lastIndex >= 0) { // intervalo desde o último clique
                    const [lo, hi] = [Math.min(ui.lastIndex, idx), Math.max(ui.lastIndex, idx)];
                    for (let n = lo; n <= hi; n++)
                        ui.multi.add(String(ui.items[n]['id']));
                }
                else if (ev.ctrlKey || ev.metaKey || ui.selectMode) {
                    if (ui.multi.has(id))
                        ui.multi.delete(id);
                    else
                        ui.multi.add(id);
                }
                else {
                    ui.selected = ui.selected === id ? null : id;
                    ui.multi.clear();
                }
                ui.lastIndex = idx;
                render();
            });
            return b;
        }
        function detail(item) {
            const id = String(item['id']);
            const tags = item['tags'] || [];
            const chips = h('div', { class: 'hub-chips' });
            for (const t of tags.filter(x => !x.startsWith('sem.'))) {
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
            return h('div', { class: 'hub-detail' }, h('strong', { text: String(item['title'] || item['filename']) }), h('span', { class: 'muted', text: dims + String(item['mime']) + ' · ' + Math.round(Number(item['bytes']) / 1024) + ' KB · ' + String(item['folderPath']) }), semanticBlock(id, typeof item['version'] === 'number' ? item['version'] : null), chips, tagIn, h('div', { class: 'nav-actions' }, use, del), assetPromptsBlock(id, String(item['filename'])));
        }
        /* ------------------ sincronização (Google Drive / espelho Git) ------------------ */
        const syncUi = { open: false, status: null, msg: '', run: null, timer: 0, conflicts: [], queued: 0 };
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
                try {
                    syncUi.conflicts = (await call('sync.conflicts_list', { status: 'pending', limit: 50 }))['relations'] || [];
                }
                catch {
                    syncUi.conflicts = [];
                }
                syncUi.queued = await depositPending();
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
            const names = { pulled: 'baixados', pushed: 'enviados', duplicate: 'já existiam', 'skipped-unsupported': 'não suportados', 'skipped-tombstoned': 'removidos antes', 'skipped-remote-deleted': 'apagados no Drive', linked: 'vinculados', moved: 'movidos', conflict: 'conflitos', 'pulled-as-copy': 'baixados como cópia', 'pushed-as-copy': 'enviados como cópia', 'local-exported': 'gravados na pasta local', 'local-imported': 'lidos da pasta local', 'local-copies': 'cópias na pasta local' };
            const states = { running: 'em andamento', done: 'concluído', failed: 'falhou', cancelled: 'cancelado', interrupted: 'interrompido' };
            const m = r['mirror'];
            const counts = m ? '' : Object.entries(r['counts'] || {}).filter(([k]) => names[k]).map(([k, v]) => names[k] + ': ' + v).join(' · ');
            const extra = m ? 'copiados ' + m['copied'] + ', movidos ' + m['moved'] + ', grandes pulados ' + m['skippedLarge'] + (m['pushed'] ? ', enviado ao GitHub' : '') : '';
            return h('div', { class: 'hub-msg is-info', role: 'status', 'data-run': String(r['kind']) + ':' + String(r['state']) + (r['mode'] === 'dry-run' ? ':sim' : ''),
                text: (m ? 'Espelho' : 'Sincronização') + (r['mode'] === 'dry-run' ? ' (simulação)' : '') + ' ' + (states[String(r['state'])] || String(r['state'])) +
                    (r['state'] === 'running' ? ' — ' + String(r['done']) + '/' + String(r['total']) : '') + (counts ? ' · ' + counts : '') + (extra ? ' · ' + extra : '') + (r['error'] ? ' · erro: ' + String(r['error']) : '') });
        }
        /** Pasta local da conexão (Drive como HD). Só funciona com o Hub no mesmo computador; nada é apagado nem sobrescrito. */
        function localFolderControls(c) {
            const cid = String(c['id']), cur = c['options']?.['localDir'];
            const input = h('input', { type: 'text', 'aria-label': 'Pasta local no computador do Hub', placeholder: 'Caminho absoluto, ou “padrão” para ~/VisualBoard/drive', value: typeof cur === 'string' ? cur : '' });
            return h('div', { class: 'hub-local', 'data-hub': 'local-folder' }, h('p', { class: 'muted', text: typeof cur === 'string' ? 'Cópia local: ' + cur : 'Sem pasta local: o Drive é só o repositório remoto.' }), field('Pasta local', input), h('div', { class: 'nav-actions' }, runBtn('Salvar pasta local', async () => { const v = input.value.trim(); await call('sync.local_folder_configure', { connectionId: cid, dir: !v ? null : /^(padrão|padrao|default)$/i.test(v) ? 'default' : v }); await loadSync(); }), runBtn('Parar de copiar', async () => { await call('sync.local_folder_configure', { connectionId: cid, dir: null }); await loadSync(); }, 'btn ghost')));
        }
        /** Pares de arquivos diferentes que disputaram o mesmo nome, ou arquivos editados no Drive. Nunca apaga: só registra a decisão. */
        function conflictsBlock() {
            if (!syncUi.conflicts.length)
                return null;
            const kind = { 'content-conflict': 'Mesmo nome, conteúdos diferentes', 'new-version': 'Nova versão' };
            const box = h('div', { class: 'hub-conflicts', 'data-hub': 'conflicts', role: 'region', 'aria-label': 'Arquivos para revisar' }, h('h5', { text: 'Para revisar (' + syncUi.conflicts.length + ')' }), h('p', { class: 'muted', text: 'Os dois arquivos foram mantidos. Escolher aqui só registra a decisão; nada é apagado.' }));
            for (const r of syncUi.conflicts) {
                const rid = String(r['id']), sim = typeof r['similarity'] === 'number' ? ' · semelhança ' + Math.round(Number(r['similarity']) * 100) + '%' : '';
                const decide = (label, resolution) => runBtn(label, async () => { await call('sync.conflict_resolve', { relationId: rid, resolution }); await loadSync(); }, 'btn ghost');
                box.append(h('div', { class: 'hub-conflict' }, h('strong', { text: (kind[String(r['relation'])] || String(r['relation'])) + ': ' + String(r['path']) }), h('span', { class: 'muted', text: ' · ' + String(r['shaOld']).slice(0, 8) + ' → ' + String(r['shaNew']).slice(0, 8) + sim }), h('div', { class: 'nav-actions' }, decide('Manter os dois', 'keep-both'), decide('É uma nova versão', 'new-version'), decide('São diferentes', 'different'))));
            }
            return box;
        }
        /** Depósito de arquivos feitos no editor (desligado por padrão). */
        function depositBlock() {
            const cb = h('input', { type: 'checkbox', 'aria-label': 'Depositar automaticamente o que eu editar' });
            cb.checked = autoDeposit();
            cb.addEventListener('change', () => { setAutoDeposit(cb.checked); renderSync(); });
            return h('div', { class: 'hub-deposit', 'data-hub': 'deposit' }, h('label', { class: 'muted' }, cb, ' Depositar no Hub/Drive o que eu editar aqui (imagens e áudios derivados; o original nunca é trocado)'), h('p', { class: 'muted', text: syncUi.queued ? syncUi.queued + ' arquivo(s) aguardando conexão (a fila some se a página for recarregada).' : 'Nenhum arquivo aguardando.' }), syncUi.queued ? runBtn('Enviar fila agora', async () => { await flushDeposits(); await loadSync(); }) : h('span'));
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
            box.append(depositBlock());
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
                        await call('sync.cancel', { runId: String(syncUi.run['id']) }); }, 'btn ghost'), runBtn('Desvincular', async () => { await call('sync.disconnect', { connectionId: cid }); await loadSync(); }, 'btn ghost')), localFolderControls(c)));
                }
                const cb = conflictsBlock();
                if (cb)
                    box.append(cb);
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
        let refreshAssetPrompts = null;
        const PROMPT_MAX = 256 * 1024;
        const PURPOSE_OPTIONS = [['image', 'Imagem'], ['audio', 'Áudio'], ['video', 'Vídeo'], ['text', 'Texto'], ['other', 'Outro']];
        const ROLE_OPTIONS = [['prompt-of', 'descreve'], ['generated-by', 'gerou'], ['reference', 'referência'], ['script', 'roteiro']];
        const pUi = { open: false, list: [], total: 0, query: '', purpose: '', msg: '', edit: null };
        const bytesOf = (t) => new TextEncoder().encode(t).length;
        /** Diferença por linha (LCS). Acima de 1500 linhas por lado devolve null (a tela mostra só o texto). */
        function lineDiff(a, b) {
            const x = a.split('\n'), y = b.split('\n');
            if (x.length > 1500 || y.length > 1500)
                return null;
            const n = x.length, m = y.length, L = [];
            for (let i = 0; i <= n; i++)
                L.push(new Uint16Array(m + 1));
            for (let i = n - 1; i >= 0; i--)
                for (let j = m - 1; j >= 0; j--)
                    L[i][j] = x[i] === y[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
            const out = [];
            let i = 0, j = 0;
            while (i < n && j < m) {
                if (x[i] === y[j]) {
                    out.push({ t: '=', s: x[i] });
                    i++;
                    j++;
                }
                else if (L[i + 1][j] >= L[i][j + 1])
                    out.push({ t: '-', s: x[i++] });
                else
                    out.push({ t: '+', s: y[j++] });
            }
            while (i < n)
                out.push({ t: '-', s: x[i++] });
            while (j < m)
                out.push({ t: '+', s: y[j++] });
            return out;
        }
        async function loadPrompts() {
            try {
                const r = await call('prompt.list', { limit: 100, ...(pUi.query ? { query: pUi.query } : {}), ...(pUi.purpose ? { purpose: pUi.purpose } : {}) });
                pUi.list = r.prompts;
                pUi.total = r.total;
                pUi.msg = '';
            }
            catch (e) {
                pUi.msg = e instanceof Error ? e.message : String(e);
            }
            renderPrompts();
        }
        async function openPrompt(id) {
            if (pUi.edit?.dirty && dialogs && !(await dialogs.confirm({ title: 'Descartar alterações?', message: 'O prompt aberto tem alterações não salvas.', confirmText: 'Descartar' })))
                return;
            try {
                const [g, v] = await Promise.all([call('prompt.get', { id }), call('prompt.versions', { id })]);
                pUi.edit = { id, title: g.prompt.title, purpose: g.prompt.purpose, model: g.prompt.model, tags: g.prompt.tags.join(', '), text: g.prompt.text ?? '', baseVersion: g.prompt.version, dirty: false,
                    versions: v.versions, links: g.links, compare: null, linkTarget: null, matches: [] };
                pUi.msg = '';
            }
            catch (e) {
                pUi.msg = e instanceof Error ? e.message : String(e);
            }
            renderPrompts();
            refreshAssetPrompts?.();
        }
        function newPrompt(linkTarget = null, text = '', title = '') {
            pUi.edit = { id: null, title, purpose: 'image', model: '', tags: '', text, baseVersion: 0, dirty: !!text, versions: [], links: [], compare: null, linkTarget, matches: [] };
            const was = pUi.open;
            pUi.open = true;
            if (was)
                renderPrompts();
            else
                render(); // abre a seção (e a lista carrega em seguida) quando ela estava recolhida
        }
        async function savePrompt() {
            const e = pUi.edit;
            if (!e)
                return;
            if (!e.title.trim()) {
                pUi.msg = 'Informe um título.';
                renderPrompts();
                return;
            }
            if (!e.text.trim()) {
                pUi.msg = 'O prompt está vazio.';
                renderPrompts();
                return;
            }
            if (bytesOf(e.text) > PROMPT_MAX) {
                pUi.msg = 'O prompt passa de 256 KB.';
                renderPrompts();
                return;
            }
            const tags = e.tags.split(',').map(t => t.trim()).filter(Boolean);
            try {
                if (!e.id) {
                    const r = await call('prompt.create', { title: e.title.trim(), text: e.text, purpose: e.purpose, model: e.model, tags });
                    if (e.linkTarget)
                        await call('prompt.link', { promptId: r.prompt.id, assetId: e.linkTarget.assetId, role: 'prompt-of' });
                    pUi.edit = null;
                    await openPrompt(r.prompt.id);
                }
                else {
                    await call('prompt.update', { id: e.id, text: e.text, title: e.title.trim(), purpose: e.purpose, model: e.model, tags, expectedVersion: e.baseVersion });
                    e.dirty = false;
                    await openPrompt(e.id);
                }
                dialogs?.toast('Prompt salvo (nova versão).', 'ok');
                await loadPrompts();
            }
            catch (err) {
                const c = err.code;
                pUi.msg = c === 'CONFLICT' ? 'Este prompt foi alterado em outro lugar. Reabra-o para ver a versão atual (seu texto continua na caixa até lá).' : err instanceof Error ? err.message : String(err);
                renderPrompts();
            }
        }
        function download(name, text) {
            const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
            const a = h('a', { href: url, download: name });
            document.body.append(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        function promptEditor(e) {
            const wrap = h('div', { class: 'hub-prompt-editor', 'data-hub': 'prompt-editor' });
            const title = h('input', { type: 'text', value: e.title, maxlength: '120', 'aria-label': 'Título do prompt', placeholder: 'Título' });
            title.addEventListener('input', () => { e.title = title.value; e.dirty = true; });
            const purpose = h('select', { 'aria-label': 'Finalidade' });
            for (const [v, l] of PURPOSE_OPTIONS)
                purpose.append(h('option', { value: v, text: l }));
            purpose.value = e.purpose;
            purpose.addEventListener('change', () => { e.purpose = purpose.value; e.dirty = true; });
            const model = h('input', { type: 'text', value: e.model, maxlength: '120', 'aria-label': 'Modelo ou ferramenta', placeholder: 'Modelo/ferramenta (opcional)' });
            model.addEventListener('input', () => { e.model = model.value; e.dirty = true; });
            const tags = h('input', { type: 'text', value: e.tags, 'aria-label': 'Etiquetas do prompt', placeholder: 'etiquetas separadas por vírgula' });
            tags.addEventListener('input', () => { e.tags = tags.value; e.dirty = true; });
            const ta = h('textarea', { rows: '10', 'aria-label': 'Texto do prompt', spellcheck: 'false' });
            ta.value = e.text;
            const count = h('span', { class: 'muted', 'aria-live': 'polite' });
            const upd = () => { const b = bytesOf(ta.value); count.textContent = b.toLocaleString('pt-BR') + ' / ' + PROMPT_MAX.toLocaleString('pt-BR') + ' bytes' + (b > PROMPT_MAX ? ' — grande demais' : ''); };
            ta.addEventListener('input', () => { e.text = ta.value; e.dirty = true; upd(); });
            ta.addEventListener('keydown', ev => { const k = ev; if ((k.ctrlKey || k.metaKey) && k.key.toLowerCase() === 's') {
                k.preventDefault();
                void savePrompt();
            } });
            upd();
            const save = h('button', { type: 'button', class: 'btn primary', 'data-hub': 'prompt-save', text: e.id ? 'Salvar nova versão' : 'Criar prompt' });
            save.addEventListener('click', () => { void savePrompt(); });
            const copy = h('button', { type: 'button', class: 'btn ghost', text: 'Copiar texto' });
            copy.addEventListener('click', () => { navigator.clipboard?.writeText(ta.value).then(() => dialogs?.toast('Copiado.', 'ok')).catch(() => dialogs?.toast('Não foi possível copiar.', 'error')); });
            const exp = h('button', { type: 'button', class: 'btn ghost', text: 'Baixar .md' });
            exp.addEventListener('click', () => download((e.title.trim() || 'prompt').replace(/[\\/:*?"<>|]+/g, '_') + '.md', ta.value));
            const close = h('button', { type: 'button', class: 'btn ghost', text: 'Fechar' });
            close.addEventListener('click', () => { void (async () => { if (e.dirty && dialogs && !(await dialogs.confirm({ title: 'Descartar alterações?', message: 'Há alterações não salvas.', confirmText: 'Descartar' })))
                return; pUi.edit = null; renderPrompts(); })(); });
            const actions = h('div', { class: 'nav-actions' }, save, copy, exp);
            if (e.id) {
                const arch = h('button', { type: 'button', class: 'btn ghost', text: 'Arquivar' });
                arch.addEventListener('click', () => { call('prompt.archive', { id: e.id, archived: true }).then(() => { pUi.edit = null; return loadPrompts(); }).catch(err => { pUi.msg = String(err.message); renderPrompts(); }); });
                actions.append(arch);
            }
            actions.append(close);
            wrap.append(field('Título', title), h('div', { class: 'hub-bar' }, field('Finalidade', purpose), field('Modelo', model)), field('Etiquetas', tags), ta, count, actions);
            if (e.linkTarget)
                wrap.append(h('p', { class: 'muted', text: 'Ao criar, será ligado a: ' + e.linkTarget.filename }));
            if (e.id) {
                wrap.append(h('h5', { text: 'Ligado a' }));
                if (!e.links.length)
                    wrap.append(h('p', { class: 'muted', text: 'Nenhum arquivo ligado.' }));
                for (const l of e.links) {
                    const t = l['target'], un = h('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Desligar', text: 'Desligar' });
                    un.addEventListener('click', () => { call('prompt.unlink', { linkId: String(l['id']) }).then(() => openPrompt(e.id)).catch(err => { pUi.msg = String(err.message); renderPrompts(); }); });
                    wrap.append(h('div', { class: 'hub-link', role: 'listitem' }, h('span', { text: (t ? String(t['filename']) + ' (' + String(t['kind']) + ')' : 'arquivo ausente') + ' · ' + String(l['role']) + (l['pinnedSha'] ? ' · versão fixada' : '') }), un));
                }
                const q = h('input', { type: 'search', placeholder: 'Buscar arquivo para ligar', 'aria-label': 'Buscar arquivo para ligar' });
                const sel = h('select', { 'aria-label': 'Arquivo do catálogo' });
                const role = h('select', { 'aria-label': 'Papel da ligação' });
                for (const [v, l] of ROLE_OPTIONS)
                    role.append(h('option', { value: v, text: l }));
                const find = h('button', { type: 'button', class: 'btn', text: 'Buscar' });
                const run = () => { call('search', { text: q.value.trim(), limit: 20 }).then(r => { e.matches = r.items; sel.replaceChildren(...e.matches.map(m => h('option', { value: String(m['id']), text: String(m['filename']) + ' · ' + String(m['kind'] ?? 'image') }))); }).catch(err => { pUi.msg = String(err.message); renderPrompts(); }); };
                find.addEventListener('click', run);
                q.addEventListener('keydown', ev => { if (ev.key === 'Enter') {
                    ev.preventDefault();
                    run();
                } });
                const pin = h('input', { type: 'checkbox', 'aria-label': 'Fixar esta versão do prompt' });
                const go = h('button', { type: 'button', class: 'btn', 'data-hub': 'prompt-link', text: 'Ligar' });
                go.addEventListener('click', () => { if (!sel.value)
                    return; call('prompt.link', { promptId: e.id, assetId: sel.value, role: role.value, pin: pin.checked }).then(() => openPrompt(e.id)).catch(err => { pUi.msg = String(err.message); renderPrompts(); }); });
                wrap.append(h('div', { class: 'hub-bar' }, q, find), h('div', { class: 'hub-bar' }, sel, role), h('label', { class: 'muted' }, pin, ' fixar esta versão'), go);
                wrap.append(h('h5', { text: 'Versões (' + e.versions.length + ')' }));
                for (const v of [...e.versions].reverse()) {
                    const seq = Number(v['seq']);
                    const view = h('button', { type: 'button', class: 'btn ghost', text: v['current'] ? 'Ver (atual)' : 'Comparar com a atual' });
                    view.addEventListener('click', () => { call('prompt.version_text', { id: e.id, seq }).then(r => { e.compare = { seq, text: String(r['text']) }; renderPrompts(); }).catch(err => { pUi.msg = String(err.message); renderPrompts(); }); });
                    const row = h('div', { class: 'hub-version', role: 'listitem' }, h('span', { text: 'v' + seq + ' · ' + String(v['createdAt']).slice(0, 16).replace('T', ' ') + (v['note'] ? ' · ' + String(v['note']) : '') + (v['current'] ? ' · atual' : '') }), view);
                    if (!v['current']) {
                        const rest = h('button', { type: 'button', class: 'btn ghost', text: 'Restaurar' });
                        rest.addEventListener('click', () => { call('prompt.version_text', { id: e.id, seq }).then(r => call('prompt.update', { id: e.id, text: String(r['text']), note: 'restaurada (v' + seq + ')', expectedVersion: e.baseVersion })).then(() => openPrompt(e.id)).then(() => loadPrompts()).catch(err => { pUi.msg = String(err.message); renderPrompts(); }); });
                        row.append(rest);
                    }
                    wrap.append(row);
                }
                if (e.compare) {
                    const d = lineDiff(e.compare.text, e.text), box = h('div', { class: 'hub-diff', role: 'region', 'aria-label': 'Diferenças entre v' + e.compare.seq + ' e o texto atual' });
                    box.append(h('p', { class: 'muted', text: 'v' + e.compare.seq + ' → texto atual da caixa (− removido, + acrescentado)' }));
                    if (!d)
                        box.append(h('pre', { text: e.compare.text }));
                    else
                        for (const ln of d)
                            box.append(h('div', { class: 'hub-diff-' + (ln.t === '=' ? 'same' : ln.t === '-' ? 'del' : 'add'), text: (ln.t === '=' ? '  ' : ln.t + ' ') + ln.s }));
                    wrap.append(box);
                }
            }
            return wrap;
        }
        function renderPrompts() {
            const box = document.getElementById('hub-prompts-body');
            if (!box)
                return;
            const keep = document.activeElement && box.contains(document.activeElement) ? document.activeElement.getAttribute('aria-label') : null;
            box.replaceChildren();
            if (pUi.msg)
                box.append(h('div', { class: 'hub-msg', role: 'alert', text: pUi.msg }));
            box.append(h('p', { class: 'muted', text: 'Cada salvamento cria uma nova versão; as anteriores ficam guardadas. O texto de um prompt é só texto: nada é executado.' }));
            const q = h('input', { type: 'search', value: pUi.query, placeholder: 'Buscar nos prompts', 'aria-label': 'Buscar nos prompts' });
            q.addEventListener('keydown', ev => { if (ev.key === 'Enter') {
                pUi.query = q.value.trim();
                void loadPrompts();
            } });
            const pf = h('select', { 'aria-label': 'Filtrar por finalidade' }, h('option', { value: '', text: 'Todas as finalidades' }));
            for (const [v, l] of PURPOSE_OPTIONS)
                pf.append(h('option', { value: v, text: l }));
            pf.value = pUi.purpose;
            pf.addEventListener('change', () => { pUi.purpose = pf.value; void loadPrompts(); });
            const nw = h('button', { type: 'button', class: 'btn', 'data-hub': 'prompt-new', text: 'Novo prompt' });
            nw.addEventListener('click', () => { newPrompt(); });
            const imp = h('input', { type: 'file', accept: '.md,.txt,text/plain,text/markdown', hidden: '', 'aria-label': 'Importar arquivo .md ou .txt' });
            imp.addEventListener('change', () => {
                const f = imp.files?.[0];
                imp.value = '';
                if (!f)
                    return;
                if (f.size > PROMPT_MAX) {
                    pUi.msg = 'O arquivo passa de 256 KB.';
                    renderPrompts();
                    return;
                }
                f.text().then(t => { if (t.includes('\u0000'))
                    throw new Error('Isto não parece um arquivo de texto.'); newPrompt(null, t.replace(/\r\n?/g, '\n'), f.name.replace(/\.[^.]+$/, '')); }).catch(err => { pUi.msg = String(err.message); renderPrompts(); });
            });
            const impBtn = h('button', { type: 'button', class: 'btn', text: 'Importar .md/.txt…' });
            impBtn.addEventListener('click', () => imp.click());
            box.append(h('div', { class: 'hub-bar' }, q, pf), h('div', { class: 'nav-actions' }, nw, impBtn), imp);
            const list = h('div', { class: 'hub-prompt-list', role: 'list', 'aria-label': 'Prompts' });
            for (const p of pUi.list) {
                const b = h('button', { type: 'button', class: 'btn ghost', role: 'listitem', 'data-prompt': p.id, text: p.title + ' · ' + p.purpose + ' · v' + p.version + (p.links ? ' · ' + p.links + ' ligado(s)' : '') });
                b.addEventListener('click', () => { void openPrompt(p.id); });
                list.append(b);
            }
            if (!pUi.list.length)
                list.append(h('p', { class: 'muted', text: pUi.query || pUi.purpose ? 'Nenhum prompt encontrado.' : 'Ainda não há prompts.' }));
            box.append(list, h('div', { class: 'muted', text: pUi.total + ' prompt(s)' }));
            if (pUi.edit)
                box.append(promptEditor(pUi.edit));
            if (keep)
                box.querySelector('[aria-label="' + keep + '"]')?.focus();
        }
        function promptsSection() {
            const d = h('details', { class: 'hub-prompts', 'data-hub': 'prompts' }, h('summary', { text: 'Prompts (.md e .txt)' }), h('div', { id: 'hub-prompts-body' }));
            if (pUi.open)
                d.setAttribute('open', '');
            d.addEventListener('toggle', () => { pUi.open = d.open; if (d.open)
                void loadPrompts(); });
            if (pUi.open)
                queueMicrotask(() => { void loadPrompts(); });
            return d;
        }
        /** Bloco "Prompts deste arquivo" no detalhe de um item do catálogo. */
        function assetPromptsBlock(assetId, filename) {
            const box = h('div', { class: 'hub-asset-prompts', 'data-hub': 'asset-prompts' }, h('h5', { text: 'Prompts deste arquivo' }));
            const list = h('div', { role: 'list' });
            box.append(list);
            const load = () => {
                call('prompt.for_asset', { assetId }).then(r => {
                    const links = r.links;
                    list.replaceChildren();
                    if (!links.length)
                        list.append(h('p', { class: 'muted', text: 'Nenhum prompt ligado.' }));
                    for (const l of links) {
                        const b = h('button', { type: 'button', class: 'btn ghost', role: 'listitem', text: String(l['promptTitle']) + ' · ' + String(l['role']) + (l['viaVersion'] ? ' · de uma versão anterior do arquivo' : '') });
                        b.addEventListener('click', () => { pUi.open = true; render(); void openPrompt(String(l['promptId'])); });
                        list.append(b);
                    }
                }).catch(() => { list.replaceChildren(h('p', { class: 'muted', text: 'Prompts indisponíveis neste Hub.' })); });
            };
            refreshAssetPrompts = load;
            load();
            const nw = h('button', { type: 'button', class: 'btn', 'data-hub': 'asset-prompt-new', text: 'Novo prompt para este arquivo' });
            nw.addEventListener('click', () => { newPrompt({ assetId, filename }); });
            box.append(nw);
            return box;
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
            for (const t of ui.tags.filter(x => !x.tag.startsWith('sem.')))
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
            if (!conn || !conn.scopes.includes('write')) {
                up.setAttribute('disabled', '');
                up.setAttribute('title', 'Este token só lê: use um token com escopo de escrita para enviar imagens.');
            }
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
            body.append(h('div', { class: 'hub-bar' }, search, tagSel, folderSel), h('div', { class: 'hub-count muted', text: (ui.busy ? 'Carregando… ' : '') + ui.total + ' imagem(ns) · ' + (conn.client || 'cliente') + ' @ ' + conn.url }), h('div', { class: 'nav-actions' }, scan, up), h('div', { class: 'nav-actions' }, lib, out), pendingLabel, semanticFilters(), selectionBar(), ...(ui.multi.size ? [batchPanel()] : []), file, grid, ...(sel && !ui.multi.size ? [detail(sel)] : []), promptsSection(), syncSection());
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
            deposit, flushDeposits, depositPending, autoDeposit, setAutoDeposit,
            semanticVocabulary, semanticGet, semanticSet, semanticClear, semanticFacets, semanticDraftForm,
            onChange: (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }
        });
    }
});
