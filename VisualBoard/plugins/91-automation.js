"use strict";
/* =====================================================================
 * Fase 1 — Adaptador de automação (INERTE por padrão).
 *
 * Recebe pedidos { tool, args } no formato do contrato v1, valida o schema,
 * aplica escopos/confirmação, serializa a execução (fila FIFO), despacha
 * para capabilities públicas existentes e devolve resultados/erros tipados.
 *
 *  - Desligado ao iniciar: execute() devolve AUTOMATION_DISABLED até que o
 *    usuário (UI da Fase 4) chame enable(). Nada aqui abre rede, usa eval ou
 *    executa código recebido: o modelo só escolhe ferramentas do catálogo.
 *  - Não há motor de edição aqui: cada ferramenta é um binding declarativo
 *    do contrato ou uma composição somente-leitura/segura (handlers abaixo).
 * ===================================================================== */
definePlugin({
    id: 'automation',
    version: '1.4.0',
    needs: ['automationContract', 'state', 'history', 'camera', 'assets', 'packages', 'boards', 'instances',
        'panelSets', 'panelTemplates', 'mangaPage', 'mangaEdit', 'exportImport', 'mangaExport',
        'mangaExportPreflight', 'imageCommands', 'imageProcessors'],
    provides: ['automation'],
    uses: ['app', 'ui.dialogs', 'ui.shell', 'assetHub'],
    accepts: {
        'automationContract': '^1.0.0', 'state': '^1.0.0', 'history': '^1.0.0', 'camera': '^1.0.0',
        'assets': '^1.0.0', 'packages': '^1.0.0', 'boards': '^1.0.0', 'instances': '^1.0.0',
        'panelSets': '^1.0.0', 'panelTemplates': '^1.0.0', 'mangaPage': '^1.0.0', 'mangaEdit': '^1.0.0',
        'exportImport': '^1.0.0', 'mangaExport': '^2.0.0', 'mangaExportPreflight': '^1.0.0',
        'imageCommands': '^1.0.0', 'imageProcessors': '^1.0.0', 'app': '^1.0.0', 'ui.dialogs': '^1.0.0', 'ui.shell': '^1.0.0', 'assetHub': '^1.0.0'
    },
    contractVersions: { 'automation': '1.4.0' },
    setup: async function (kernel) {
        const contractApi = await kernel.require('automationContract');
        const contract = contractApi.describe();
        const L = contract.limits;
        const limit = (name) => L[name] ?? 0;
        const state = await kernel.require('state');
        const history = await kernel.require('history');
        const camera = await kernel.require('camera');
        const assets = await kernel.require('assets');
        const boards = await kernel.require('boards');
        const panelSets = await kernel.require('panelSets');
        const panelTemplates = await kernel.require('panelTemplates');
        const mangaPage = await kernel.require('mangaPage');
        const mangaEdit = await kernel.require('mangaEdit');
        const exportImport = await kernel.require('exportImport');
        const mangaExport = await kernel.require('mangaExport');
        const preflight = await kernel.require('mangaExportPreflight');
        const imageProcessors = await kernel.require('imageProcessors');
        const S = state.data;
        const dynamicRequire = kernel.require;
        class AutomationError extends Error {
            code;
            issues;
            details;
            constructor(code, message, issues, details) {
                super(message);
                this.code = code;
                this.issues = issues;
                this.details = details;
            }
        }
        const fail = (code, message, details) => {
            throw new AutomationError(code, message, undefined, details);
        };
        /* ---------- runtime state (never persisted, never in the document) ---------- */
        let enabled = false;
        let client = null;
        let grants = new Set();
        let confirmHandler = null;
        let sequence = 0;
        let executed = 0;
        let pending = 0;
        let chain = Promise.resolve();
        const audit = [];
        const toolsByName = new Map();
        for (const tool of contract.tools)
            toolsByName.set(tool.name, tool);
        const gapsByTool = new Map();
        for (const gap of contract.gaps)
            gapsByTool.set(gap.tool, gap);
        /* ---------- Fase 3: shared editing between the user and the AI ---------- */
        let requestCounter = 0;
        /** Requests waiting in the single-writer queue (can still be cancelled). */
        const queued = new Map();
        /** The request currently holding the writer slot. */
        let currentRun = null;
        let executingDepth = 0;
        let userGesture = false;
        let locked = false;
        let eventSeq = 0;
        function status() {
            return {
                contract: contract.version, enabled, client,
                grants: ['read', 'write', 'export', 'destructive'].filter(s => grants.has(s)),
                pending, executed, locked, userGestureActive: userGesture, lastEventSeq: eventSeq
            };
        }
        /* The user's own pointer gestures are tracked so an AI write never lands in the middle of a drag. */
        const gestureStart = (event) => { if (event.isTrusted)
            userGesture = true; };
        const gestureEnd = () => { userGesture = false; };
        window.addEventListener('pointerdown', gestureStart, true);
        for (const name of ['pointerup', 'pointercancel', 'dragend', 'blur'])
            window.addEventListener(name, gestureEnd, true);
        async function waitForQuiet() {
            const deadline = Date.now() + limit('gestureWaitMs');
            while (userGesture || history.depth > 0 || history.isRestoring()) {
                if (Date.now() > deadline)
                    fail('BUSY', userGesture
                        ? 'The user is editing right now; try again in a moment.'
                        : 'Another edit is in progress in the editor; try again in a moment.');
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        }
        /** While a batch runs, a full-window overlay absorbs pointer/wheel input and keys are swallowed. */
        const blockKey = (event) => { event.stopImmediatePropagation(); event.preventDefault(); };
        /** Short, stable digest (two 32-bit FNV-style hashes) so fingerprints stay small in tool results. */
        function digest(text) {
            let h1 = 0x811c9dc5, h2 = 0x01000193;
            for (let i = 0; i < text.length; i++) {
                const c = text.charCodeAt(i);
                h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
                h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
            }
            return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + ':' + text.length;
        }
        function setLock(on) {
            locked = on;
            let overlay = document.getElementById('automation-lock');
            if (on) {
                if (!overlay) {
                    overlay = document.createElement('div');
                    overlay.id = 'automation-lock';
                    overlay.className = 'nvb-automation-lock';
                    overlay.setAttribute('role', 'status');
                    overlay.setAttribute('aria-live', 'polite');
                    const label = document.createElement('div');
                    label.className = 'nvb-automation-lock-label';
                    label.textContent = 'AI is editing the document — your input is paused';
                    overlay.appendChild(label);
                    document.body.appendChild(overlay);
                }
                overlay.hidden = false;
                for (const name of ['keydown', 'keyup', 'keypress'])
                    window.addEventListener(name, blockKey, true);
            }
            else {
                if (overlay)
                    overlay.hidden = true;
                for (const name of ['keydown', 'keyup', 'keypress'])
                    window.removeEventListener(name, blockKey, true);
            }
        }
        /* ---------- Fase 3: editor events (ids only, never document content) ---------- */
        const EVENT_NAMES = ['state:changed', 'selection:changed', 'history:changed', 'history:applied', 'boards:changed',
            'board:navigated', 'instances:changed', 'manga-page:changed', 'manga-page:focus', 'assets:changed',
            'packages:changed', 'panelSets:changed', 'storage:saved', 'storage:failed'];
        const eventBuffer = [];
        const eventListeners = new Set();
        let evictedSeq = 0;
        function compactPayload(payload) {
            if (!payload || typeof payload !== 'object')
                return undefined;
            const out = {};
            for (const key of ['instanceId', 'boardId', 'parentBoardId', 'panelId', 'mode']) {
                const value = payload[key];
                if (typeof value === 'string')
                    out[key] = value.slice(0, 128);
                else if (value === null)
                    out[key] = null;
            }
            return Object.keys(out).length ? out : undefined;
        }
        function recordEvent(name, payload) {
            if (!enabled)
                return;
            const source = executingDepth > 0 ? 'automation' : 'user';
            const compact = compactPayload(payload);
            const now = Date.now();
            const last = eventBuffer[eventBuffer.length - 1];
            let entry;
            if (last && last.name === name && last.source === source && JSON.stringify(last.payload) === JSON.stringify(compact)
                && now - Date.parse(last.time) < 100) {
                // Bursts of the same event are folded: the entry gets a new sequence number and a count.
                eventBuffer.pop();
                entry = { ...last, seq: ++eventSeq, time: new Date(now).toISOString(), count: last.count + 1 };
            }
            else {
                entry = { seq: ++eventSeq, time: new Date(now).toISOString(), name, source, count: 1, ...(compact ? { payload: compact } : {}) };
            }
            eventBuffer.push(entry);
            while (eventBuffer.length > limit('maxEvents'))
                evictedSeq = eventBuffer.shift().seq;
            for (const listener of Array.from(eventListeners)) {
                try {
                    listener(entry);
                }
                catch (error) {
                    kernel.log.warn('automation event listener failed', error);
                }
            }
        }
        const onEvent = kernel.on;
        for (const name of EVENT_NAMES)
            onEvent(name, payload => recordEvent(name, payload));
        function pollEvents(options) {
            const since = options?.sinceSeq ?? 0;
            const max = Math.min(options?.limit ?? 100, limit('maxEventsPerPoll'));
            const names = options?.names && options.names.length ? new Set(options.names) : null;
            const events = eventBuffer.filter(e => e.seq > since && (!options?.source || e.source === options.source) && (!names || names.has(e.name)))
                .slice(0, max).map(e => ({ ...e, ...(e.payload ? { payload: { ...e.payload } } : {}) }));
            return { events, lastSeq: eventSeq, dropped: since < evictedSeq };
        }
        /* ---------- schema validation ---------- */
        const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
        function typeOf(value) {
            if (value === null)
                return 'null';
            if (Array.isArray(value))
                return 'array';
            if (typeof value === 'number')
                return Number.isInteger(value) ? 'integer' : 'number';
            return typeof value;
        }
        function validateSchema(schema, value, path, issues, depth) {
            if (issues.length >= 20)
                return;
            const bad = (message) => { issues.push({ path: path || '$', message }); };
            if (depth > limit('maxResultDepth')) {
                bad('nesting too deep');
                return;
            }
            if (schema.type !== undefined) {
                const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
                const actual = typeOf(value);
                const matches = allowed.includes(actual) || (actual === 'integer' && allowed.includes('number'));
                if (!matches) {
                    bad('expected ' + allowed.join(' | ') + ', got ' + actual);
                    return;
                }
            }
            if (schema.enum && !schema.enum.includes(value)) {
                bad('must be one of: ' + schema.enum.join(', '));
                return;
            }
            if (typeof value === 'string') {
                if (schema.minLength !== undefined && value.length < schema.minLength)
                    bad('shorter than ' + schema.minLength);
                if (value.length > (schema.maxLength ?? limit('maxStringLength')))
                    bad('longer than ' + (schema.maxLength ?? limit('maxStringLength')));
                if (schema.pattern && !new RegExp(schema.pattern).test(value))
                    bad('does not match pattern');
            }
            else if (typeof value === 'number') {
                if (!Number.isFinite(value))
                    bad('must be finite');
                if (schema.minimum !== undefined && value < schema.minimum)
                    bad('must be >= ' + schema.minimum);
                if (schema.maximum !== undefined && value > schema.maximum)
                    bad('must be <= ' + schema.maximum);
            }
            else if (Array.isArray(value)) {
                const max = schema.maxItems ?? limit('maxArrayItems');
                if (value.length > max) {
                    bad('more than ' + max + ' items');
                    return;
                }
                if (schema.minItems !== undefined && value.length < schema.minItems)
                    bad('fewer than ' + schema.minItems + ' items');
                if (schema.items)
                    value.forEach((item, index) => validateSchema(schema.items, item, path + '[' + index + ']', issues, depth + 1));
            }
            else if (value !== null && typeof value === 'object') {
                const proto = Object.getPrototypeOf(value);
                if (proto !== Object.prototype && proto !== null) {
                    bad('must be a plain object');
                    return;
                }
                const record = value;
                const keys = Object.keys(record);
                if (keys.length > limit('maxObjectKeys')) {
                    bad('too many properties');
                    return;
                }
                for (const key of keys)
                    if (FORBIDDEN_KEYS.has(key)) {
                        bad('forbidden property name: ' + key);
                        return;
                    }
                const props = schema.properties || {};
                for (const name of schema.required || [])
                    if (record[name] === undefined)
                        bad('missing required property: ' + name);
                for (const key of keys) {
                    const sub = props[key];
                    const child = path ? path + '.' + key : key;
                    if (sub)
                        validateSchema(sub, record[key], child, issues, depth + 1);
                    else if (schema.additionalProperties === true)
                        continue;
                    else if (typeof schema.additionalProperties === 'object')
                        validateSchema(schema.additionalProperties, record[key], child, issues, depth + 1);
                    else if (schema.properties)
                        bad('unknown property: ' + key);
                }
            }
        }
        function validateInput(tool, args) {
            const issues = [];
            validateSchema(tool.input, args === undefined ? {} : args, '', issues, 0);
            return issues;
        }
        /* ---------- JSON-safe serialization ---------- */
        function toJson(value, depth = 0) {
            if (value === null || value === undefined)
                return null;
            switch (typeof value) {
                case 'number': return Number.isFinite(value) ? value : null;
                case 'string': return value.length > limit('maxStringLength') ? value.slice(0, limit('maxStringLength')) : value;
                case 'boolean': return value;
                case 'function':
                case 'symbol': return null;
                case 'bigint': return Number(value);
                default: break;
            }
            if (depth >= limit('maxResultDepth'))
                return null;
            if (value instanceof Blob)
                return { blob: true, size: value.size, type: value.type };
            if (typeof Node !== 'undefined' && value instanceof Node)
                return null;
            if (value instanceof Set)
                return Array.from(value).slice(0, limit('maxArrayItems')).map(v => toJson(v, depth + 1));
            if (value instanceof Map) {
                const out = {};
                for (const [k, v] of Array.from(value.entries()).slice(0, limit('maxObjectKeys')))
                    out[String(k)] = toJson(v, depth + 1);
                return out;
            }
            if (Array.isArray(value))
                return value.slice(0, limit('maxArrayItems')).map(v => toJson(v, depth + 1));
            const out = {};
            for (const key of Object.keys(value).slice(0, limit('maxObjectKeys'))) {
                if (FORBIDDEN_KEYS.has(key))
                    continue;
                const item = value[key];
                if (typeof item === 'function')
                    continue;
                out[key] = toJson(item, depth + 1);
            }
            return out;
        }
        /* ---------- domain lookups ---------- */
        function pageOf(instanceId) {
            const inst = typeof instanceId === 'string' ? state.getInstance(instanceId) : null;
            if (!inst)
                return fail('NOT_FOUND', 'Instance not found on the current board: ' + String(instanceId));
            if (inst.type !== 'manga-page')
                return fail('NOT_FOUND', 'Instance is not a manga page: ' + String(instanceId));
            return inst;
        }
        /** Encodes a rendered Blob as base64 inside the response size limit. */
        async function blobPayload(out, label) {
            if (!out.success || !out.blob)
                return fail('OPERATION_REJECTED', label + ' could not be rendered', toJson(out.errors));
            const bytes = new Uint8Array(await out.blob.arrayBuffer());
            const encodedSize = Math.ceil(bytes.length / 3) * 4;
            if (encodedSize > limit('maxResultBytes') - 4096)
                return fail('LIMIT_EXCEEDED', label + ' is ' + bytes.length + ' bytes (' + encodedSize + ' base64), above the response limit of ' + limit('maxResultBytes') + '. Lower dpi/quality or use export.png.');
            let binary = '';
            for (let i = 0; i < bytes.length; i += 0x8000)
                binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
            return { mimeType: out.mimeType, width: out.width, height: out.height, dpiEffective: out.dpiEffective ?? null,
                bytes: bytes.length, dataBase64: btoa(binary), warnings: toJson(out.warnings) };
        }
        /* ---------- transferências em partes (export.prepare_transfer + bridge xreq) ---------- */
        const TRANSFER_TTL_MS = 120000;
        const TRANSFER_MAX_BYTES = 80 * 1024 * 1024;
        const TRANSFER_MAX_CHUNK = 384 * 1024;
        const TRANSFER_MAX_ACTIVE = 2;
        const transfers = new Map();
        function dropTransfer(id) {
            const t = transfers.get(id);
            if (t) {
                clearTimeout(t.timer);
                transfers.delete(id);
            }
        }
        function dropAllTransfers() { for (const id of Array.from(transfers.keys()))
            dropTransfer(id); }
        async function sha256Hex(bytes) {
            const subtle = window.crypto?.subtle;
            if (!subtle)
                throw new Error('Secure context required (crypto.subtle is unavailable in this page)');
            const copy = new Uint8Array(bytes.length);
            copy.set(bytes);
            return Array.from(new Uint8Array(await subtle.digest('SHA-256', copy.buffer)), b => b.toString(16).padStart(2, '0')).join('');
        }
        function summarize(inst) {
            const base = {
                id: inst.id, type: inst.type, x: inst.x, y: inst.y, width: inst.width, height: inst.height,
                rotation: inst.rotation ?? 0, zIndex: inst.zIndex ?? 0, locked: !!inst.locked, visible: inst.visible !== false
            };
            if (inst.type === 'image')
                base['assetId'] = inst.assetId;
            else if (inst.type === 'board')
                base['boardId'] = inst.boardId;
            else {
                base['panelSetId'] = inst.panelSetId;
                base['panelCount'] = inst.panels.length;
                base['balloonCount'] = (inst.vp1Balloons || []).length;
                base['textCount'] = (inst.vp1HorizontalTexts || []).length;
                base['effectCount'] = (inst.vp1MangaEffects || []).length;
            }
            return base;
        }
        function templateOf(templateId) {
            const tpl = panelTemplates.list().find(t => t.id === templateId);
            if (!tpl)
                return fail('NOT_FOUND', 'Layout template not found: ' + String(templateId));
            return tpl;
        }
        function decodeBase64(text, maxBytes) {
            if (!/^[A-Za-z0-9+/=\s]*$/.test(text))
                fail('INVALID_ARGUMENT', 'Not valid base64');
            let binary;
            try {
                binary = atob(text.replace(/\s+/g, ''));
            }
            catch {
                return fail('INVALID_ARGUMENT', 'Not valid base64');
            }
            if (binary.length > maxBytes)
                fail('LIMIT_EXCEEDED', 'Decoded payload exceeds ' + maxBytes + ' bytes');
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++)
                bytes[i] = binary.charCodeAt(i);
            return bytes;
        }
        function sniffImage(bytes) {
            const at = (i) => bytes[i] ?? -1;
            if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47)
                return 'image/png';
            if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff)
                return 'image/jpeg';
            if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x38)
                return 'image/gif';
            if (at(0) === 0x52 && at(1) === 0x49 && at(2) === 0x46 && at(3) === 0x46 && at(8) === 0x57 && at(9) === 0x45)
                return 'image/webp';
            return null;
        }
        const exportOptions = (input) => {
            const out = { silent: true };
            if (typeof input['dpi'] === 'number')
                out.dpi = input['dpi'];
            if (typeof input['quality'] === 'number')
                out.quality = input['quality'];
            if (typeof input['maxPixels'] === 'number')
                out.maxPixels = input['maxPixels'];
            if (typeof input['maxSide'] === 'number')
                out.maxSide = input['maxSide'];
            return out;
        };
        function pagesFor(input) {
            const ids = input['instanceIds'];
            if (Array.isArray(ids) && ids.length)
                return ids.map(pageOf);
            return mangaExport.collectMangaPagesOnCurrentBoard();
        }
        function toolState() {
            return {
                mode: toJson(mangaEdit.getMode()),
                knife: toJson(mangaPage.getKnifeMode()), vertex: toJson(mangaPage.getVertexMode()),
                crop: toJson(mangaPage.getCropMode()), mangaTool: toJson(mangaPage.getMangaToolMode()),
                balloonDraw: toJson(mangaPage.getBalloonDrawMode()), focus: toJson(mangaPage.getFocus())
            };
        }
        function requireFields(input, names, mode) {
            const issues = names.filter(n => input[n] === undefined)
                .map(n => ({ path: n, message: 'required when mode is "' + mode + '"' }));
            if (issues.length)
                throw new AutomationError('INVALID_ARGUMENT', 'Missing fields for mode ' + mode, issues);
        }
        async function addEffect(input, kind) {
            const inst = pageOf(input['instanceId']);
            const draft = {};
            for (const key of Object.keys(input))
                if (key !== 'instanceId')
                    draft[key] = input[key];
            draft['kind'] = kind;
            const effect = await mangaPage.addMangaEffect(inst, draft);
            return { effect: toJson(effect) };
        }
        const handlers = {
            'app.status': async () => {
                const app = kernel.has('app') ? await kernel.require('app') : null;
                const global = window;
                return {
                    contract: contract.version,
                    application: { name: global.NVB_MANIFEST?.name ?? null, version: global.NVB_MANIFEST?.version ?? null,
                        kernel: kernel.context.version, bootStatus: global.NVB_KERNEL.getBootStatus() },
                    persistence: app ? { mode: app.mode, folderName: app.folderName, fileName: app.fileName, persistent: app.isPersistent() } : null,
                    dirty: app ? app.isDirty() : history.isDirty(),
                    history: { canUndo: history.canUndo(), canRedo: history.canRedo() },
                    automation: status()
                };
            },
            'app.capabilities': () => {
                const global = window;
                const registry = global.NVB_CAPABILITY_CONTRACTS || {};
                return {
                    capabilities: Object.keys(registry).sort().map(name => ({
                        name, version: registry[name]?.version ?? null, available: global.NVB_KERNEL.has(name),
                        methods: Object.keys(registry[name]?.methods || {})
                    })),
                    plugins: global.NVB_KERNEL.listPlugins().map(p => ({ id: p.id, version: p.version, status: p.status }))
                };
            },
            'app.context': () => {
                const board = state.getCurrentBoard();
                return {
                    boardId: board ? board.id : null, boardName: board ? board.name ?? null : null,
                    selection: Array.from(S.selection),
                    tool: toolState(), camera: toJson(camera.data)
                };
            },
            'events.poll': (input) => {
                const opts = {
                    sinceSeq: typeof input['sinceSeq'] === 'number' ? input['sinceSeq'] : 0
                };
                if (typeof input['limit'] === 'number')
                    opts.limit = input['limit'];
                if (input['source'] === 'user' || input['source'] === 'automation')
                    opts.source = input['source'];
                if (Array.isArray(input['names']))
                    opts.names = input['names'];
                return toJson(pollEvents(opts));
            },
            'history.cancel': (input) => toJson(cancelRequest(String(input['requestId']))),
            'batch.validate': (input) => {
                const operations = input['operations'];
                const steps = planBatch(operations);
                return { valid: steps.every(s => s.issues.length === 0), operations: operations.length, steps,
                    fingerprint: digest(history.snapshot().fingerprint),
                    note: 'Pass fingerprint as expectedFingerprint to batch.execute. Failures that depend on live document state (locked objects, missing targets) are only detected when the batch runs and cause a full rollback.' };
            },
            'batch.execute': async (input) => await runBatch(input),
            'app.audit_log': (input) => ({ entries: audit.slice(-(typeof input['limit'] === 'number' ? input['limit'] : 100)) }),
            'resource.layers': () => {
                const focus = mangaPage.getFocus();
                if (!focus.instanceId)
                    return { instanceId: null, layers: [] };
                return { instanceId: focus.instanceId, layers: toJson(mangaPage.listLayerTree(pageOf(focus.instanceId))) };
            },
            'docs.operations': () => [
                '# VisualBoard automation — operational guide', '',
                '- Contract: visualboard.automation ' + contract.version + '. Tool names: visualboard.<domain>.<action>.',
                '- Page coordinates are PanelSet units (not screen pixels); balloon vertices are normalized 0–1.',
                '- Instances are addressed by id and must be on the current board; use visualboard.board.select first.',
                '- Writes create normal Undo/Redo steps. Destructive tools always ask the user.',
                '- export.png/pdf trigger a browser download. To get a PNG on disk use the MCP-server tool visualboard_export_save_png (export folder) and verify it with visualboard_export_verify_file; images are imported from the import folder with visualboard_asset_import_from_path.',
                '- Operations are serialized; at most ' + limit('maxPendingRequests') + ' requests may be pending.'
            ].join('\n'),
            'project.get': () => {
                const app = kernel.has('app') ? true : false;
                const board = state.getCurrentBoard();
                return {
                    meta: toJson(S.meta), currentBoardId: board ? board.id : null, rootBoardId: S.rootBoardId,
                    counts: { boards: S.boards.length, assets: S.assets.length, packages: S.packages.length, panelSets: (S.panelSets || []).length },
                    dirty: history.isDirty(), hasAppCapability: app
                };
            },
            'project.export': async (input) => {
                const result = await exportImport.exportProject({ download: false });
                if (!result.success)
                    return fail('OPERATION_REJECTED', 'Project export failed', toJson(result));
                const json = result.json;
                const inline = input['inline'] === true && json.length <= limit('maxResultBytes');
                return { success: true, assets: result.assets, bytes: json.length, ...(inline ? { json } : {}),
                    note: inline ? null : 'Payload not inlined (inline not requested or larger than the response limit).' };
            },
            'project.import': async (input) => {
                const bytes = decodeBase64(String(input['contentBase64']), limit('maxRequestBytes'));
                const result = await exportImport.importProjectFile(new Blob([bytes], { type: 'application/json' }));
                if (!result.success)
                    return fail('OPERATION_REJECTED', result.cancelled ? 'Import cancelled' : 'Project import failed', toJson(result));
                return toJson(result);
            },
            'project.validate': async () => {
                const pages = [];
                const perPage = [];
                for (const board of S.boards)
                    for (const inst of board.instances) {
                        if (inst.type !== 'manga-page')
                            continue;
                        pages.push(inst);
                        perPage.push({ boardId: board.id, instanceId: inst.id, ...toJson(mangaPage.validatePage(inst)) });
                    }
                const pre = pages.length ? toJson(preflight.validate(pages)) : null;
                return { valid: perPage.every(p => p['valid'] !== false), pages: perPage, exportPreflight: pre };
            },
            'board.list': () => ({
                currentBoardId: S.currentBoardId,
                boards: boards.list().map(b => ({ id: b.id, name: b.name ?? null, parentBoardId: b.parentBoardId,
                    instanceCount: b.instanceCount, current: b.isCurrent, root: b.isRoot, depth: b.depth,
                    path: boards.pathOf(b.id).map(p => p.id) }))
            }),
            'board.get': (input) => {
                const board = boards.getBoard(String(input['boardId']));
                if (!board)
                    return fail('NOT_FOUND', 'Board not found: ' + String(input['boardId']));
                return { id: board.id, name: board.name ?? null, parentBoardId: board.parentBoardId ?? null,
                    camera: toJson(board.camera), instances: board.instances.map(summarize) };
            },
            'page.list': () => ({ pages: mangaExport.collectMangaPagesOnCurrentBoard().map(summarize) }),
            'page.get': (input) => {
                const inst = pageOf(input['instanceId']);
                const set = mangaPage.getPanelSet(inst);
                return {
                    instance: summarize(inst),
                    panelSet: set ? { id: set.id, name: set.name ?? null, width: set.width, height: set.height, panelCount: set.panels.length } : null,
                    panels: (set ? set.panels : []).map(geo => {
                        const panel = mangaPage.getPanel(inst, geo.id);
                        return { id: geo.id, layers: (panel ? panel.layers : []).map(l => ({ id: l.id, assetId: l.assetId, x: l.x, y: l.y,
                                width: l.width, height: l.height, rotation: l.rotation ?? 0, opacity: l.opacity ?? 1 })) };
                    }),
                    overlays: toJson((inst.overlays || []).map(l => ({ id: l.id, assetId: l.assetId }))),
                    unassignedPanels: toJson(mangaPage.getUnassignedPanels(inst))
                };
            },
            'page.list_templates': () => ({ templates: panelTemplates.list().map(t => ({
                    id: t.id, name: t.name, description: t.desc, panelCount: t.panels.length,
                    width: t.width ?? null, height: t.height ?? null, orientation: t.orientation ?? null, category: t.category ?? null
                })) }),
            'page.list_panel_sets': () => ({ panelSets: panelSets.list().map(p => ({ id: p.id, name: p.name ?? null,
                    width: p.width, height: p.height, panelCount: p.panels.length })) }),
            'page.get_panel_set': (input) => {
                const set = panelSets.get(String(input['panelSetId']));
                if (!set)
                    return fail('NOT_FOUND', 'Panel set not found: ' + String(input['panelSetId']));
                return { id: set.id, name: set.name ?? null, width: set.width, height: set.height,
                    panels: set.panels.map(p => ({ id: p.id, points: toJson(p.points) })) };
            },
            'page.create_panel_set_from_svg': (input) => {
                let parsed;
                try {
                    parsed = panelSets.parseSvg(String(input['svg']));
                }
                catch (error) {
                    return fail('INVALID_ARGUMENT', 'SVG layout could not be parsed: ' + error.message);
                }
                if (!parsed.panels.length)
                    return fail('INVALID_ARGUMENT', 'SVG layout contains no panels');
                const created = panelSets.create(parsed, typeof input['name'] === 'string' ? input['name'] : undefined);
                return { panelSet: { id: created.id, name: created.name ?? null, width: created.width, height: created.height,
                        panelCount: created.panels.length }, warnings: toJson(parsed.warnings || []) };
            },
            'panel.list': (input) => {
                const inst = pageOf(input['instanceId']);
                const set = mangaPage.getPanelSet(inst);
                return { panelSetId: set ? set.id : null, panels: (set ? set.panels : []).map(geo => {
                        const xs = geo.points.map(p => p.x), ys = geo.points.map(p => p.y);
                        const panel = mangaPage.getPanel(inst, geo.id);
                        return { id: geo.id, pointCount: geo.points.length, points: toJson(geo.points),
                            bounds: xs.length ? { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) } : null,
                            style: toJson(mangaPage.getPanelStyle(inst, geo.id)), layerCount: panel ? panel.layers.length : 0 };
                    }) };
            },
            'asset.list': (input) => {
                const offset = typeof input['offset'] === 'number' ? input['offset'] : 0;
                const size = typeof input['limit'] === 'number' ? input['limit'] : 100;
                const packageId = typeof input['packageId'] === 'string' ? input['packageId'] : null;
                if (packageId && !state.getPackage(packageId))
                    return fail('NOT_FOUND', 'Package not found: ' + packageId);
                const all = S.assets.filter(a => !packageId || a.packageId === packageId);
                return { total: all.length, offset, limit: size,
                    packages: S.packages.map(p => ({ id: p.id, name: p.name ?? null })),
                    assets: all.slice(offset, offset + size).map(a => ({ id: a.id, name: a.name ?? null, packageId: a.packageId ?? null,
                        mimeType: a.mimeType ?? null, width: a.originalWidth ?? null, height: a.originalHeight ?? null,
                        size: a.size ?? null, derivedFrom: a.derivedFrom ?? null })) };
            },
            'asset.get': (input) => {
                const asset = state.getAsset(String(input['assetId']));
                if (!asset)
                    return fail('NOT_FOUND', 'Asset not found: ' + String(input['assetId']));
                return { asset: toJson(asset) };
            },
            'asset.import': async (input) => {
                const bytes = decodeBase64(String(input['dataBase64']), 20 * 1024 * 1024);
                const sniffed = sniffImage(bytes);
                if (!sniffed)
                    return fail('INVALID_ARGUMENT', 'Content is not a PNG, JPEG, GIF or WebP image');
                if (sniffed !== input['mimeType'])
                    return fail('INVALID_ARGUMENT', 'mimeType does not match the image content (' + sniffed + ')');
                const packageId = typeof input['packageId'] === 'string' ? input['packageId'] : undefined;
                if (packageId && !state.getPackage(packageId))
                    return fail('NOT_FOUND', 'Package not found: ' + packageId);
                const before = new Set(S.assets.map(a => a.id));
                const file = new File([bytes], String(input['name']), { type: sniffed });
                const count = await assets.importFiles([file], packageId);
                const created = S.assets.filter(a => !before.has(a.id));
                if (!count || !created.length)
                    return fail('OPERATION_REJECTED', 'The image could not be imported');
                return { imported: count, assets: created.map(a => ({ id: a.id, name: a.name ?? null, width: a.originalWidth ?? null,
                        height: a.originalHeight ?? null })) };
            },
            'image.list_processors': () => ({ processors: toJson(imageProcessors.list()) }),
            'effect.add_ink': (input) => addEffect(input, 'ink'),
            'effect.add_halftone': (input) => addEffect(input, 'halftone'),
            'effect.add_speed_lines': (input) => addEffect(input, 'speedLines'),
            'effect.add_focus_lines': (input) => addEffect(input, 'focusLines'),
            'tool.get_state': () => toolState(),
            'tool.set_mode': (input) => {
                const mode = String(input['mode']);
                const instanceId = input['instanceId'];
                const panelId = input['panelId'];
                if (mode === 'none') {
                    mangaPage.setKnifeMode(null);
                    mangaPage.setVertexMode(null);
                    mangaPage.setCropMode(null);
                    mangaPage.setMangaToolMode(null);
                    mangaPage.setBalloonDrawMode(null);
                    return { mode: 'none' };
                }
                requireFields(input, mode === 'crop' ? ['instanceId', 'panelId', 'layerId'] : ['instanceId', 'panelId'], mode);
                pageOf(instanceId);
                let accepted;
                if (mode === 'knife')
                    accepted = mangaPage.setKnifeMode(instanceId, panelId);
                else if (mode === 'vertex')
                    accepted = mangaPage.setVertexMode(instanceId, panelId);
                else if (mode === 'crop')
                    accepted = mangaPage.setCropMode(instanceId, panelId, input['layerId']);
                else {
                    const settings = {};
                    if (typeof input['color'] === 'string')
                        settings.color = input['color'];
                    if (typeof input['size'] === 'number')
                        settings.size = input['size'];
                    if (typeof input['opacity'] === 'number')
                        settings.opacity = input['opacity'];
                    if (typeof input['tip'] === 'number')
                        settings.tip = input['tip'];
                    accepted = mangaPage.setMangaToolMode(instanceId, panelId, mode === 'ink' ? 'ink' : 'eraser', settings);
                }
                if (!accepted)
                    return fail('OPERATION_REJECTED', 'The editor refused to activate mode ' + mode);
                return { mode };
            },
            'project.create': async (input) => {
                const result = await exportImport.newProject(typeof input['name'] === 'string' ? input['name'] : undefined);
                if (!result.success)
                    return fail('OPERATION_REJECTED', result.cancelled ? 'New project cancelled' : 'New project failed', toJson(result));
                return toJson(result);
            },
            'instance.list': () => {
                const board = state.getCurrentBoard();
                if (!board)
                    return fail('NOT_FOUND', 'No active board');
                const items = board.instances.slice(0, limit('maxArrayItems'));
                return { boardId: board.id, total: board.instances.length, instances: items.map(summarize),
                    selected: Array.from(S.selection) };
            },
            'export.png_bytes': async (input) => {
                const page = pageOf(input['instanceId']);
                const out = await mangaExport.renderPageToBlob(page, exportOptions(input));
                return await blobPayload(out, 'PNG');
            },
            'export.prepare_transfer': async (input) => {
                if (transfers.size >= TRANSFER_MAX_ACTIVE)
                    return fail('LIMIT_EXCEEDED', 'Too many transfers waiting (' + TRANSFER_MAX_ACTIVE + '). Finish or wait for them to expire (2 minutes).');
                const page = pageOf(input['instanceId']);
                const out = await mangaExport.renderPageToBlob(page, exportOptions(input));
                if (!out.success || !out.blob)
                    return fail('OPERATION_REJECTED', 'PNG could not be rendered', toJson(out.errors));
                if (out.blob.size > TRANSFER_MAX_BYTES)
                    return fail('LIMIT_EXCEEDED', 'PNG is ' + out.blob.size + ' bytes, above the transfer limit of ' + TRANSFER_MAX_BYTES + '. Lower dpi/quality.');
                const bytes = new Uint8Array(await out.blob.arrayBuffer());
                const transferId = 'xfer-' + hex(window.crypto.getRandomValues(new Uint8Array(8)));
                const sha256 = await sha256Hex(bytes);
                const timer = setTimeout(() => transfers.delete(transferId), TRANSFER_TTL_MS);
                transfers.set(transferId, { bytes, sha256, expires: Date.now() + TRANSFER_TTL_MS, timer });
                return { transferId, bytes: bytes.length, sha256, mimeType: out.mimeType, width: out.width, height: out.height,
                    dpiEffective: out.dpiEffective ?? null, chunkSize: TRANSFER_MAX_CHUNK, expiresInSeconds: TRANSFER_TTL_MS / 1000,
                    warnings: toJson(out.warnings) };
            },
            'export.preview': async (input) => {
                const page = pageOf(input['instanceId']);
                const set = mangaPage.getPanelSet(page);
                if (!set)
                    return fail('NOT_FOUND', 'Page layout not found');
                const side = typeof input['maxSide'] === 'number' ? input['maxSide'] : 512;
                const quality = Math.min(1, side / Math.max(set.width, set.height));
                const out = await mangaExport.renderPageToBlob(page, { quality, format: 'jpeg', jpegQuality: 0.75, silent: true });
                return await blobPayload(out, 'preview');
            },
            'viewport.get': () => ({ camera: toJson(camera.data), offset: toJson(camera.offset()),
                minZoom: camera.MIN_ZOOM, maxZoom: camera.MAX_ZOOM, worldMin: camera.WORLD_MIN, worldMax: camera.WORLD_MAX }),
            'selection.get': () => {
                const ids = Array.from(S.selection);
                return { ids, instances: ids.map(i => state.getInstance(i)).filter((i) => !!i).map(summarize),
                    text: toJson(mangaPage.getSelectedHorizontalText()), balloon: toJson(mangaPage.getSelectedBalloon()),
                    effect: toJson(mangaPage.getSelectedMangaEffect()), layerId: mangaEdit.getSelectedLayerId() };
            },
            'history.get_state': () => ({ canUndo: history.canUndo(), canRedo: history.canRedo(), dirty: history.isDirty() }),
            'export.validate': async (input) => {
                const pages = pagesFor(input);
                if (!pages.length)
                    return { valid: true, errors: [], warnings: [], pages: [] };
                return toJson(await mangaExport.validateExport(pages, exportOptions(input)));
            },
            'export.inspect_output': async (input) => {
                const rendered = await mangaExport.renderPageToCanvas(pageOf(input['instanceId']), exportOptions(input));
                const info = { width: rendered.width, height: rendered.height, resolution: toJson(rendered.resolution),
                    warnings: toJson(rendered.warnings) };
                rendered.canvas.width = 0;
                rendered.canvas.height = 0; // release the bitmap
                return info;
            },
            'export.pdf_pages': async (input) => {
                const pages = pagesFor(input);
                if (!pages.length)
                    return fail('NOT_FOUND', 'No manga pages to export on the current board');
                return { result: toJson(await mangaExport.exportChapterPdf(pages, exportOptions(input))) };
            }
        };
        /* ---------- Fase 15: catalog.* → Asset Hub (mesmas ferramentas do Hub; nenhuma lógica aqui) ---------- */
        const HUB_CODES = {
            NOT_CONNECTED: 'HUB_UNAVAILABLE', HUB_UNREACHABLE: 'HUB_UNAVAILABLE', NOT_AUTHORIZED: 'PERMISSION_DENIED', PERMISSION_DENIED: 'PERMISSION_DENIED', RATE_LIMITED: 'BUSY',
            INVALID_ARGUMENT: 'INVALID_ARGUMENT', NOT_FOUND: 'NOT_FOUND', LIMIT_EXCEEDED: 'LIMIT_EXCEEDED', TOO_LARGE: 'LIMIT_EXCEEDED'
        };
        async function hubCall(verb, input) {
            const hub = await kernel.require('assetHub');
            try {
                return await hub.call(verb, input);
            }
            catch (err) {
                const hubCode = String(err.code ?? 'HUB_ERROR');
                return fail(HUB_CODES[hubCode] ?? 'OPERATION_REJECTED', err instanceof Error ? err.message : String(err), { hubCode });
            }
        }
        const hubHandler = (verb) => async (input) => toJson(await hubCall(verb, input));
        handlers['catalog.status'] = hubHandler('status');
        handlers['catalog.search'] = hubHandler('search');
        handlers['catalog.get'] = hubHandler('get');
        handlers['catalog.add'] = hubHandler('add');
        handlers['catalog.update'] = hubHandler('update');
        handlers['catalog.move'] = hubHandler('move');
        handlers['catalog.remove'] = hubHandler('remove');
        handlers['catalog.tag_list'] = hubHandler('tag_list');
        handlers['catalog.tag_add'] = hubHandler('tag_add');
        handlers['catalog.tag_remove'] = hubHandler('tag_remove');
        handlers['catalog.tag_merge'] = hubHandler('tag_merge');
        handlers['catalog.tag_delete'] = hubHandler('tag_delete');
        handlers['catalog.folder_list'] = hubHandler('folder_list');
        handlers['catalog.folder_create'] = hubHandler('folder_create');
        handlers['catalog.folder_update'] = hubHandler('folder_update');
        handlers['catalog.folder_delete'] = hubHandler('folder_delete');
        handlers['catalog.usage'] = hubHandler('usage');
        handlers['catalog.reference_add'] = hubHandler('reference_add');
        handlers['catalog.reference_remove'] = hubHandler('reference_remove');
        handlers['catalog.verify'] = hubHandler('verify');
        handlers['catalog.gc_orphans'] = hubHandler('gc_orphans');
        handlers['catalog.import_library'] = async (input) => {
            const hub = await kernel.require('assetHub');
            const packageId = typeof input['packageId'] === 'string' ? input['packageId'] : undefined;
            if (packageId && !state.getPackage(packageId))
                return fail('NOT_FOUND', 'Package not found: ' + packageId);
            try {
                return toJson(await hub.importLibrary(packageId));
            }
            catch (err) {
                const hubCode = String(err.code ?? 'HUB_ERROR');
                return fail(HUB_CODES[hubCode] ?? 'OPERATION_REJECTED', err instanceof Error ? err.message : String(err), { hubCode });
            }
        };
        handlers['catalog.place'] = async (input) => {
            const hub = await kernel.require('assetHub');
            const packageId = typeof input['packageId'] === 'string' ? input['packageId'] : undefined;
            if (packageId && !state.getPackage(packageId))
                return fail('NOT_FOUND', 'Package not found: ' + packageId);
            try {
                return toJson(await hub.place(String(input['id']), packageId));
            }
            catch (err) {
                const hubCode = String(err.code ?? 'HUB_ERROR');
                return fail(HUB_CODES[hubCode] ?? 'OPERATION_REJECTED', err instanceof Error ? err.message : String(err), { hubCode });
            }
        };
        /* ---------- argument resolution for declarative bindings ---------- */
        function resolveArg(token, input) {
            if (typeof token === 'string') {
                if (token === '@page')
                    return pageOf(input['instanceId']);
                if (token === '@template')
                    return templateOf(input['templateId']);
                return input[token];
            }
            const out = {};
            for (const key of Object.keys(token)) {
                const value = token[key];
                if (typeof value === 'string' && value.startsWith('$')) {
                    const resolved = input[value.slice(1)];
                    if (resolved !== undefined)
                        out[key] = resolved;
                }
                else
                    out[key] = value;
            }
            return Object.keys(out).length ? out : undefined;
        }
        function mapResult(mode, value) {
            switch (mode) {
                case 'done': return { done: true };
                case 'boolean':
                    if (value === false)
                        return fail('OPERATION_REJECTED', 'The editor refused the change (invalid input, locked object or unchanged state)');
                    return { done: true };
                case 'nonnull':
                    if (value === null || value === undefined)
                        return fail('NOT_FOUND', 'The requested object does not exist');
                    return { result: toJson(value) };
                case 'created':
                    if (value === null || value === undefined)
                        return fail('OPERATION_REJECTED', 'The editor refused to create the object (missing asset, locked target or invalid input)');
                    return { result: toJson(value) };
                case 'instance':
                    if (!value)
                        return fail('OPERATION_REJECTED', 'The editor refused to create the object');
                    return { instance: summarize(value) };
                default: {
                    if (value && typeof value === 'object' && value['success'] === false)
                        return fail('OPERATION_REJECTED', 'The operation reported failure', toJson(value));
                    return { result: toJson(value) };
                }
            }
        }
        /** Domain methods accept dangling references (e.g. a layer pointing to a missing asset),
         * so every identifier coming from outside is resolved here before it reaches a plugin. */
        function checkReferences(input) {
            for (const key of ['assetId', 'newAssetId']) {
                const value = input[key];
                if (typeof value === 'string' && !state.getAsset(value))
                    fail('NOT_FOUND', 'Asset not found: ' + value);
            }
            if (typeof input['packageId'] === 'string' && !state.getPackage(input['packageId']))
                fail('NOT_FOUND', 'Package not found: ' + input['packageId']);
            for (const key of ['objectId', 'objectIds']) {
                const value = input[key];
                const list = typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
                for (const item of list)
                    if (typeof item === 'string' && !state.getInstance(item))
                        fail('NOT_FOUND', 'Object not found on the current board: ' + item);
            }
            if (typeof input['boardId'] === 'string' && !boards.getBoard(input['boardId']))
                fail('NOT_FOUND', 'Board not found: ' + input['boardId']);
            if (typeof input['panelSetId'] === 'string' && !panelSets.get(input['panelSetId']))
                fail('NOT_FOUND', 'Panel set not found: ' + input['panelSetId']);
            if (typeof input['panelId'] === 'string' && input['instanceId'] !== undefined) {
                const set = mangaPage.getPanelSet(pageOf(input['instanceId']));
                if (!set || !set.panels.some(p => p.id === input['panelId']))
                    fail('NOT_FOUND', 'Panel not found on this page: ' + input['panelId']);
            }
        }
        async function dispatch(tool, input) {
            const binding = tool.binding;
            if (input['instanceId'] !== undefined && tool.input.properties?.['instanceId'])
                pageOf(input['instanceId']);
            checkReferences(input);
            if (binding.kind === 'composite') {
                const handler = handlers[binding.handler];
                if (!handler)
                    return fail('NOT_IMPLEMENTED', 'No handler for ' + binding.handler);
                return await handler(input);
            }
            const impl = await dynamicRequire(binding.capability);
            const method = impl[binding.method];
            if (typeof method !== 'function')
                return fail('CAPABILITY_UNAVAILABLE', binding.capability + '.' + binding.method + ' is not available');
            const args = binding.args.map(token => resolveArg(token, input));
            while (args.length && args[args.length - 1] === undefined)
                args.pop();
            return mapResult(binding.result, await Reflect.apply(method, impl, args));
        }
        /** Tools that must never run inside a batch: they cannot be rolled back or would break the transaction. */
        const BATCH_DENIED = new Set(['visualboard.history.undo', 'visualboard.history.redo', 'visualboard.history.cancel',
            'visualboard.project.save', 'visualboard.project.import', 'visualboard.project.create',
            'visualboard.batch.execute', 'visualboard.batch.validate']);
        const REF_PATH = /^([a-z][a-z0-9_]{0,31})((?:\.[A-Za-z_][A-Za-z0-9_]*|\[\d{1,4}\])*)$/;
        const isRef = (value) => {
            if (!value || typeof value !== 'object' || Array.isArray(value))
                return false;
            const keys = Object.keys(value);
            return keys.length === 1 && keys[0] === '$ref';
        };
        function lookup(root, path) {
            let cursor = root;
            for (const match of path.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+)\]/g)) {
                const key = match[1] ?? match[2];
                if (FORBIDDEN_KEYS.has(key) || cursor === null || typeof cursor !== 'object')
                    return { found: false };
                if (!Object.prototype.hasOwnProperty.call(cursor, key))
                    return { found: false };
                cursor = cursor[key];
            }
            return { found: cursor !== undefined, value: cursor };
        }
        /** Replaces {"$ref"} nodes. `onRef` returns the replacement, or REMOVE to drop an object property. */
        const REMOVE = Symbol('remove');
        function mapRefs(value, onRef, path = '', depth = 0) {
            if (depth > limit('maxResultDepth'))
                fail('INVALID_ARGUMENT', 'Batch arguments are nested too deeply');
            if (isRef(value))
                return onRef(String(value.$ref), path);
            if (Array.isArray(value))
                return value.map((item, index) => mapRefs(item, onRef, path + '[' + index + ']', depth + 1));
            if (value && typeof value === 'object') {
                const out = {};
                for (const key of Object.keys(value)) {
                    if (FORBIDDEN_KEYS.has(key))
                        fail('INVALID_ARGUMENT', 'Forbidden property name: ' + key);
                    const mapped = mapRefs(value[key], onRef, path ? path + '.' + key : key, depth + 1);
                    if (mapped !== REMOVE)
                        out[key] = mapped;
                }
                return out;
            }
            return value;
        }
        function stepProblem(name) {
            const tool = toolsByName.get(name);
            if (!tool) {
                const gap = gapsByTool.get(name);
                return gap ? 'not implemented yet (' + gap.id + ')' : 'unknown tool';
            }
            if (tool.scope === 'destructive' || tool.scope === 'export')
                return 'tools with scope "' + tool.scope + '" cannot run inside a batch; call them on their own';
            if (BATCH_DENIED.has(name))
                return 'not allowed inside a batch';
            if (!grants.has(tool.scope))
                return 'scope "' + tool.scope + '" is not granted for this session';
            const unavailable = tool.requires.filter(cap => !window.NVB_KERNEL.has(cap));
            return unavailable.length ? 'required capabilities are not available: ' + unavailable.join(', ') : null;
        }
        function planBatch(operations) {
            if (operations.length > limit('maxBatchOperations'))
                fail('LIMIT_EXCEEDED', 'A batch has at most ' + limit('maxBatchOperations') + ' steps');
            const defined = new Set();
            let refCount = 0;
            return operations.map((op, index) => {
                const issues = [];
                const at = 'operations[' + index + ']';
                const problem = stepProblem(op.tool);
                if (problem)
                    issues.push({ path: at + '.tool', message: op.tool + ': ' + problem });
                if (op.as !== undefined && defined.has(op.as))
                    issues.push({ path: at + '.as', message: 'duplicate step name: ' + op.as });
                const removed = [];
                let stripped = op.args ?? {};
                try {
                    stripped = mapRefs(op.args ?? {}, (ref, path) => {
                        refCount++;
                        const match = REF_PATH.exec(ref);
                        if (!match)
                            issues.push({ path: at + '.args.' + path, message: 'invalid $ref "' + ref + '"' });
                        else if (!defined.has(match[1]))
                            issues.push({ path: at + '.args.' + path, message: '$ref "' + ref + '" points to a step that is not defined earlier' });
                        if (/\]$/.test(path))
                            return '$ref';
                        const dot = path.lastIndexOf('.');
                        removed.push({ parent: dot < 0 ? '' : path.slice(0, dot), key: dot < 0 ? path : path.slice(dot + 1) });
                        return REMOVE;
                    });
                }
                catch (error) {
                    issues.push({ path: at + '.args', message: error instanceof Error ? error.message : String(error) });
                }
                if (refCount > limit('maxBatchRefs'))
                    fail('LIMIT_EXCEEDED', 'A batch has at most ' + limit('maxBatchRefs') + ' references');
                const tool = toolsByName.get(op.tool);
                if (tool && !problem) {
                    for (const issue of validateInput(tool, stripped)) {
                        const ignorable = removed.some(r => issue.path === (r.parent || '$') && issue.message === 'missing required property: ' + r.key);
                        if (!ignorable)
                            issues.push({ path: at + '.args' + (issue.path === '$' ? '' : '.' + issue.path), message: issue.message });
                    }
                }
                if (op.as !== undefined)
                    defined.add(op.as);
                return { index, tool: op.tool, as: op.as ?? null, issues };
            });
        }
        function resolveStepArgs(args, results, index) {
            return mapRefs(args ?? {}, (ref, path) => {
                const match = REF_PATH.exec(ref);
                const hit = match && Object.prototype.hasOwnProperty.call(results, match[1])
                    ? lookup(results[match[1]], match[2] ?? '') : { found: false };
                if (!hit.found)
                    throw new AutomationError('INVALID_ARGUMENT', 'Step ' + index + ': $ref "' + ref + '" did not resolve to a value', [{ path: 'operations[' + index + '].args.' + path, message: 'unresolved $ref' }], { failedIndex: index });
                return hit.value;
            });
        }
        async function runBatch(input) {
            const operations = input['operations'];
            const plan = planBatch(operations);
            const invalid = plan.filter(step => step.issues.length);
            if (invalid.length)
                throw new AutomationError('INVALID_ARGUMENT', 'The batch failed validation; nothing was changed.', invalid.flatMap(step => step.issues), { rolledBack: false, completedSteps: 0 });
            const before = history.snapshot();
            if (typeof input['expectedFingerprint'] === 'string' && input['expectedFingerprint'] !== digest(before.fingerprint))
                fail('STALE_STATE', 'The document changed after the batch was validated (for example by the user); re-read the state, validate again and retry.');
            const run = currentRun;
            const requestId = run ? run.requestId : 'batch';
            const deadline = Date.now() + limit('batchTimeoutMs') - 5000;
            const results = {};
            const summaries = [];
            setLock(true);
            try {
                await history.transaction('AI batch', async () => {
                    for (let index = 0; index < operations.length; index++) {
                        const op = operations[index];
                        if (run?.cancelled)
                            fail('CANCELLED', 'The batch was cancelled; no changes were kept.');
                        if (Date.now() > deadline)
                            fail('TIMEOUT', 'The batch ran out of time; no changes were kept.');
                        if (!enabled && !run?.local)
                            fail('AUTOMATION_DISABLED', 'Access was revoked during the batch; no changes were kept.');
                        const tool = toolsByName.get(op.tool);
                        if (!run?.local && !grants.has(tool.scope))
                            fail('PERMISSION_DENIED', 'Scope "' + tool.scope + '" was revoked during the batch; no changes were kept.');
                        const started = Date.now();
                        const stepFail = (error) => {
                            record({ requestId: requestId + '#' + index, tool: tool.name, scope: tool.scope, outcome: 'error', code: error.code, elapsedMs: Date.now() - started });
                            throw new AutomationError(error.code, 'Step ' + index + ' (' + tool.name + '): ' + error.message, error.issues, { failedIndex: index, tool: tool.name });
                        };
                        let args;
                        try {
                            args = resolveStepArgs(op.args, results, index);
                        }
                        catch (error) {
                            return stepFail(wrapError(error));
                        }
                        const issues = validateInput(tool, args);
                        if (issues.length)
                            return stepFail({ code: 'INVALID_ARGUMENT', message: 'invalid arguments', issues });
                        let data;
                        try {
                            data = await dispatch(tool, args);
                        }
                        catch (error) {
                            return stepFail(wrapError(error));
                        }
                        const json = JSON.parse(JSON.stringify(data ?? null));
                        if (op.as)
                            results[op.as] = json;
                        const text = JSON.stringify(json);
                        summaries.push({ index, tool: tool.name, as: op.as ?? null, ok: true,
                            ...(text.length <= 4096 ? { data: json } : { truncated: true, bytes: text.length }) });
                        record({ requestId: requestId + '#' + index, tool: tool.name, scope: tool.scope, outcome: 'ok', code: null, elapsedMs: Date.now() - started });
                    }
                });
            }
            catch (error) {
                if (error instanceof AutomationError) {
                    const base = (error.details && typeof error.details === 'object' ? error.details : {});
                    error.details = { ...base, rolledBack: true, completedSteps: summaries.length };
                }
                throw error;
            }
            finally {
                setLock(false);
            }
            const after = history.snapshot();
            return { applied: operations.length, undoSteps: after.fingerprint === before.fingerprint ? 0 : 1,
                results: summaries, fingerprint: digest(after.fingerprint) };
        }
        /** Cancels a queued request, or flags a running batch to stop and roll back. */
        function cancelRequest(requestId) {
            const waiting = queued.get(requestId);
            if (waiting) {
                waiting.cancelled = true;
                return { cancelled: true, state: 'queued' };
            }
            if (currentRun && currentRun.requestId === requestId) {
                if (currentRun.kind === 'batch') {
                    currentRun.cancelled = true;
                    return { cancelled: true, state: 'running' };
                }
                return { cancelled: false, state: 'running', reason: 'A single running operation cannot be interrupted; only queued requests and batches can be cancelled.' };
            }
            return { cancelled: false, state: 'unknown', reason: 'No pending or running request has this id.' };
        }
        /* ---------- confirmation ---------- */
        async function confirmAction(tool, input, local = false) {
            const ask = async () => {
                if (confirmHandler && !local)
                    return await confirmHandler(tool, input);
                if (!kernel.has('ui.dialogs'))
                    return false;
                const dialogs = await kernel.require('ui.dialogs');
                const target = Object.keys(input).filter(k => /Id$/.test(k)).map(k => k + '=' + String(input[k])).join(', ');
                return (await dialogs.confirm({
                    title: local ? 'Run command?' : 'Allow AI action?',
                    message: (local ? 'The command console will run' : (client || 'An AI client') + ' wants to run') + ' "' + tool.title + '"' + (target ? ' (' + target + ')' : '') +
                        '. ' + tool.description,
                    danger: true, confirmText: local ? 'Run' : 'Allow'
                })) === true;
            };
            let timer;
            const expired = new Promise(resolve => { timer = setTimeout(() => resolve(false), limit('confirmTimeoutMs')); });
            try {
                return await Promise.race([ask(), expired]);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
            }
        }
        /* ---------- execution pipeline ---------- */
        function record(entry, who) {
            audit.push({ seq: ++sequence, time: new Date().toISOString(), client: who ?? client, ...entry });
            while (audit.length > limit('auditLogEntries'))
                audit.shift();
        }
        const wrapError = (error) => {
            if (error instanceof AutomationError) {
                const out = { code: error.code, message: error.message };
                if (error.issues)
                    out.issues = error.issues;
                if (error.details !== undefined)
                    out.details = error.details;
                return out;
            }
            const message = error instanceof Error ? error.message : String(error);
            kernel.log.warn('automation: operation failed', message);
            return { code: /not found|does not exist/i.test(message) ? 'NOT_FOUND' : 'OPERATION_REJECTED', message };
        };
        function enqueue(job) {
            pending++;
            const run = chain.then(job, job);
            chain = run.then(() => undefined, () => undefined);
            return run.finally(() => { pending--; });
        }
        /** `local` = comando digitado pelo próprio usuário no console: não depende do estado/escopos da ponte; destrutivos pedem confirmação. */
        async function execute(request, local = false) {
            const started = Date.now();
            const toolName = typeof request?.tool === 'string' ? request.tool : '';
            const requestId = typeof request?.requestId === 'string' && /^[\w.:-]{1,64}$/.test(request.requestId)
                ? request.requestId : 'r' + (++requestCounter);
            const finish = (outcome, scope, code) => record({ requestId, tool: toolName || '(invalid)', scope, outcome, code, elapsedMs: Date.now() - started }, local ? 'console' : undefined);
            const failure = (scope, error, outcome = 'error') => {
                finish(outcome, scope, error.code);
                return { ok: false, tool: toolName, requestId, contract: contract.version, error };
            };
            try {
                if (!enabled && !local)
                    return failure(null, { code: 'AUTOMATION_DISABLED', message: 'AI automation is turned off in VisualBoard.' }, 'denied');
                const tool = toolsByName.get(toolName);
                if (!tool) {
                    const gap = gapsByTool.get(toolName);
                    if (gap)
                        return failure(null, { code: 'NOT_IMPLEMENTED', message: gap.summary,
                            details: { gap: gap.id, proposal: gap.proposal, phase: gap.phase } });
                    return failure(null, { code: 'UNKNOWN_TOOL', message: 'Unknown tool: ' + toolName });
                }
                if (!local && !grants.has(tool.scope))
                    return failure(tool.scope, { code: 'PERMISSION_DENIED',
                        message: 'Scope "' + tool.scope + '" is not granted for this session.' }, 'denied');
                let size = 0;
                try {
                    size = JSON.stringify(request.args ?? {}).length;
                }
                catch {
                    size = Infinity;
                }
                if (size > limit('maxRequestBytes'))
                    return failure(tool.scope, { code: 'LIMIT_EXCEEDED', message: 'Request is too large.' });
                const issues = validateInput(tool, request.args);
                if (issues.length)
                    return failure(tool.scope, { code: 'INVALID_ARGUMENT',
                        message: 'Invalid arguments for ' + tool.name, issues });
                const unavailable = tool.requires.filter(cap => !window.NVB_KERNEL.has(cap));
                if (unavailable.length)
                    return failure(tool.scope, { code: 'CAPABILITY_UNAVAILABLE',
                        message: 'Required capabilities are not available: ' + unavailable.join(', ') });
                const input = (request.args === undefined ? {} : request.args);
                if (request.dryRun) {
                    finish('dry-run', tool.scope, null);
                    return { ok: true, tool: tool.name, requestId, contract: contract.version,
                        data: { valid: true, scope: tool.scope, requiresConfirmation: tool.scope === 'destructive' } };
                }
                if (queued.has(requestId) || currentRun?.requestId === requestId)
                    return failure(tool.scope, { code: 'INVALID_ARGUMENT', message: 'requestId is already in use by a pending request.' });
                if (tool.name === 'visualboard.history.cancel') {
                    // Control plane: must not wait behind the request it wants to cancel.
                    try {
                        const data = toJson(cancelRequest(String(input['requestId'])));
                        executed++;
                        finish('ok', tool.scope, null);
                        return { ok: true, tool: tool.name, requestId, contract: contract.version, data };
                    }
                    catch (error) {
                        return failure(tool.scope, wrapError(error));
                    }
                }
                if (pending >= limit('maxPendingRequests'))
                    return failure(tool.scope, { code: 'BUSY', message: 'Too many pending requests.' });
                const ticket = { cancelled: false };
                queued.set(requestId, ticket);
                const outcome = await enqueue(async () => {
                    queued.delete(requestId);
                    if (ticket.cancelled && (enabled || local))
                        return failure(tool.scope, { code: 'CANCELLED', message: 'The request was cancelled before it started.' });
                    if (!local && (!enabled || !grants.has(tool.scope)))
                        return failure(tool.scope, { code: enabled ? 'PERMISSION_DENIED' : 'AUTOMATION_DISABLED', message: 'Access was revoked.' }, 'denied');
                    if (tool.scope === 'destructive' && !(await confirmAction(tool, input, local)))
                        return failure(tool.scope, { code: 'CONFIRMATION_DENIED', message: 'The user did not confirm this action.' }, 'denied');
                    let timer;
                    const isBatch = tool.name === 'visualboard.batch.execute';
                    const timeout = new Promise((_, reject) => {
                        // Destructive domain operations also show the editor's own confirmation, which waits for the user.
                        timer = setTimeout(() => reject(new AutomationError('TIMEOUT', 'The operation timed out.')), isBatch ? limit('batchTimeoutMs') : tool.scope === 'destructive' ? limit('confirmTimeoutMs') : limit('requestTimeoutMs'));
                    });
                    currentRun = { requestId, kind: isBatch ? 'batch' : 'single', cancelled: false, ...(local ? { local: true } : {}) };
                    executingDepth++;
                    try {
                        if (tool.scope !== 'read')
                            await waitForQuiet();
                        const data = await Promise.race([dispatch(tool, input), timeout]);
                        const json = JSON.stringify(data ?? null);
                        if (json.length > limit('maxResultBytes'))
                            return failure(tool.scope, { code: 'LIMIT_EXCEEDED', message: 'Result is larger than ' + limit('maxResultBytes') + ' bytes; request a narrower view.' });
                        executed++;
                        finish('ok', tool.scope, null);
                        return { ok: true, tool: tool.name, requestId, contract: contract.version, data: JSON.parse(json) };
                    }
                    catch (error) {
                        return failure(tool.scope, wrapError(error));
                    }
                    finally {
                        if (timer)
                            clearTimeout(timer);
                        executingDepth = Math.max(0, executingDepth - 1);
                        currentRun = null;
                    }
                });
                return outcome;
            }
            catch (error) {
                return failure(null, wrapError(error));
            }
        }
        async function readResource(uri) {
            if (!enabled)
                throw new AutomationError('AUTOMATION_DISABLED', 'AI automation is turned off in VisualBoard.');
            if (!grants.has('read'))
                throw new AutomationError('PERMISSION_DENIED', 'Scope "read" is not granted for this session.');
            const spec = contract.resources.find(r => r.uri === uri);
            if (!spec)
                throw new AutomationError('NOT_FOUND', 'Unknown resource: ' + uri);
            const handler = handlers[spec.handler];
            if (!handler)
                throw new AutomationError('NOT_IMPLEMENTED', 'No handler for ' + spec.handler);
            const value = await enqueue(async () => handler({}));
            return { uri, mimeType: spec.mimeType, text: typeof value === 'string' ? value : JSON.stringify(value) };
        }
        const BRIDGE_PROTOCOL = 1;
        const BRIDGE_ALPHABET = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
        const ALL_SCOPES = ['read', 'write', 'export', 'destructive'];
        let bridgeStatus = 'off';
        let bridgeSocket = null;
        let bridgeCode = null;
        let bridgePort = 0;
        let bridgeServer = null;
        let bridgeClient = null;
        let bridgeError = null;
        let bridgeGrantedScopes = [];
        /** Grants the user gave; kept across an accidental connection loss so the same server can resume, cleared by any user action. */
        let bridgeResumeGrants = [];
        let bridgeWantReconnect = false;
        let bridgeAttempt = 0;
        let bridgeReconnectTimer = null;
        const bridgeLog = [];
        const bridgeListeners = new Set();
        const bridgeAvailable = () => {
            const loc = window.location;
            return loc.protocol === 'file:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1' || loc.hostname === '[::1]';
        };
        function logBridge(text) {
            bridgeLog.push({ time: new Date().toISOString(), text: text.slice(0, 200) });
            if (bridgeLog.length > 100)
                bridgeLog.shift();
        }
        function notifyBridge() {
            for (const listener of bridgeListeners) {
                try {
                    listener();
                }
                catch { /* UI listeners must not break the bridge */ }
            }
        }
        function setBridgeStatus(next, error) {
            bridgeStatus = next;
            if (error !== undefined)
                bridgeError = error;
            notifyBridge();
        }
        const hex = (bytes) => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
        async function hmacHex(code, message) {
            const subtle = window.crypto?.subtle;
            if (!subtle)
                throw new Error('Secure context required (crypto.subtle is unavailable in this page)');
            const enc = new TextEncoder();
            const key = await subtle.importKey('raw', enc.encode(code), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
            return hex(new Uint8Array(await subtle.sign('HMAC', key, enc.encode(message))));
        }
        const normalizeCode = (text) => String(text).toUpperCase().replace(/[^A-Z0-9]/g, '');
        const bridgeState = () => ({
            available: bridgeAvailable(), status: bridgeStatus, port: bridgePort || null,
            server: bridgeServer, client: bridgeClient, error: bridgeError, grants: [...bridgeGrantedScopes],
            reconnecting: bridgeReconnectTimer !== null, log: bridgeLog.slice(-50)
        });
        function sendBridge(message) {
            if (bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN)
                bridgeSocket.send(JSON.stringify(message));
        }
        function dropAccess() {
            if (enabled) {
                enabled = false;
                client = null;
                grants = new Set();
                eventBuffer.length = 0;
                if (currentRun)
                    currentRun.cancelled = true;
                for (const ticket of queued.values())
                    ticket.cancelled = true;
            }
            bridgeGrantedScopes = [];
            dropAllTransfers();
        }
        function scheduleReconnect() {
            if (!bridgeWantReconnect || !bridgeCode || bridgeAttempt >= 8) {
                bridgeWantReconnect = false;
                return;
            }
            const delay = Math.min(15000, 1000 * 2 ** bridgeAttempt);
            bridgeAttempt++;
            logBridge('reconnecting in ' + Math.round(delay / 1000) + ' s (attempt ' + bridgeAttempt + ')');
            bridgeReconnectTimer = setTimeout(() => { bridgeReconnectTimer = null; openBridgeSocket(true); }, delay);
            notifyBridge();
        }
        function openBridgeSocket(isReconnect) {
            const code = bridgeCode;
            const previousGrants = isReconnect ? [...bridgeResumeGrants] : [];
            const previousClient = isReconnect ? (bridgeClient?.name ?? 'MCP') : '';
            setBridgeStatus('connecting', null);
            let socket;
            try {
                socket = new WebSocket('ws://127.0.0.1:' + bridgePort);
            }
            catch (error) {
                setBridgeStatus('error', 'Could not open the connection: ' + error.message);
                return;
            }
            bridgeSocket = socket;
            const pageNonce = hex(window.crypto.getRandomValues(new Uint8Array(16)));
            let serverNonce = '';
            let authenticated = false;
            let finished = false;
            socket.onopen = () => {
                sendBridge({ t: 'hello', protocol: BRIDGE_PROTOCOL, nonce: pageNonce, contract: contract.version,
                    app: { name: window.NVB_MANIFEST?.name ?? null, version: window.NVB_MANIFEST?.version ?? null } });
            };
            socket.onmessage = (event) => {
                if (typeof event.data !== 'string')
                    return;
                let message;
                try {
                    message = JSON.parse(event.data);
                }
                catch {
                    return;
                }
                void onBridgeMessage(message);
            };
            async function onBridgeMessage(message) {
                switch (message['t']) {
                    case 'challenge': {
                        serverNonce = String(message['nonce']);
                        bridgeServer = message['server'] && typeof message['server'] === 'object'
                            ? { name: String(message['server'].name ?? ''), version: String(message['server'].version ?? '') } : null;
                        sendBridge({ t: 'auth', proof: await hmacHex(code, 'page|' + pageNonce + '|' + serverNonce) });
                        return;
                    }
                    case 'welcome': {
                        const expected = await hmacHex(code, 'server|' + pageNonce + '|' + serverNonce);
                        if (typeof message['proof'] !== 'string' || message['proof'] !== expected) {
                            finished = true;
                            bridgeWantReconnect = false;
                            logBridge('the server did not prove it knows the pairing code; connection closed');
                            socket.close(1008, 'server-auth-failed');
                            setBridgeStatus('error', 'The server failed authentication (wrong program on this port?).');
                            return;
                        }
                        authenticated = true;
                        bridgeAttempt = 0;
                        bridgeClient = message['client'] ?? null;
                        logBridge('connected to ' + (bridgeServer?.name ?? 'server') + (bridgeClient ? ' for ' + bridgeClient.name : ''));
                        if (previousGrants.length) {
                            authorizeBridge(previousGrants, previousClient);
                            logBridge('access restored after reconnect');
                        }
                        else
                            setBridgeStatus('pending', null);
                        return;
                    }
                    case 'client':
                        bridgeClient = message['client'] ?? null;
                        notifyBridge();
                        return;
                    case 'ping':
                        sendBridge({ t: 'pong' });
                        return;
                    case 'req':
                        await onBridgeRequest(message);
                        return;
                    case 'rreq':
                        await onBridgeResource(message);
                        return;
                    case 'xreq':
                        onBridgeTransfer(message);
                        return;
                    case 'cancel':
                        if (typeof message['requestId'] === 'string')
                            cancelRequest(message['requestId']);
                        return;
                    case 'denied': {
                        finished = true;
                        bridgeWantReconnect = false;
                        const reason = String(message['reason'] ?? 'denied');
                        logBridge('server refused the connection: ' + reason);
                        setBridgeStatus('error', reason === 'bad-code' ? 'Wrong pairing code.' : 'Connection refused: ' + reason);
                        return;
                    }
                    case 'bye':
                        logBridge('server closed the session: ' + String(message['reason'] ?? ''));
                        if (message['reason'] === 'disconnected-by-server') {
                            bridgeWantReconnect = false;
                            bridgeResumeGrants = [];
                        }
                        return;
                    default: return;
                }
            }
            socket.onerror = () => { };
            socket.onclose = () => {
                if (bridgeSocket === socket)
                    bridgeSocket = null;
                dropAccess();
                if (bridgeStatus === 'error' && finished) {
                    notifyBridge();
                    return;
                }
                if (!authenticated && !isReconnect) {
                    bridgeWantReconnect = false;
                    if (!finished) {
                        logBridge('could not connect to 127.0.0.1:' + bridgePort);
                        setBridgeStatus('error', 'Could not reach the MCP server on port ' + bridgePort + '. Is Claude Code running with the VisualBoard server?');
                    }
                    return;
                }
                if (bridgeWantReconnect) {
                    logBridge('connection lost');
                    setBridgeStatus('connecting', 'Connection lost; trying to reconnect.');
                    scheduleReconnect();
                }
                else if (bridgeStatus !== 'error') {
                    logBridge('disconnected');
                    setBridgeStatus('off', null);
                }
            };
        }
        async function onBridgeRequest(message) {
            const id = String(message['id']);
            const request = { tool: String(message['tool'] ?? ''), args: message['args'] };
            if (typeof message['requestId'] === 'string')
                request.requestId = message['requestId'];
            if (message['dryRun'] === true)
                request.dryRun = true;
            let result;
            try {
                result = await execute(request);
            }
            catch (error) {
                result = { ok: false, tool: request.tool, requestId: request.requestId ?? '', contract: contract.version,
                    error: { code: 'INTERNAL', message: error.message } };
            }
            logBridge((result.ok ? 'ok ' : 'error ' + result.error.code + ' ') + request.tool);
            sendBridge({ t: 'res', id, result });
            notifyBridge();
        }
        function onBridgeTransfer(message) {
            const id = String(message['id']);
            const reply = (body) => sendBridge({ t: 'xres', id, ...body });
            if (bridgeStatus !== 'authorized' || !enabled || !grants.has('export'))
                return reply({ ok: false, error: { code: 'PERMISSION_DENIED', message: 'Scope "export" is not granted for this session.' } });
            const key = String(message['transferId'] ?? '');
            const t = transfers.get(key);
            if (!t || t.expires < Date.now()) {
                dropTransfer(key);
                return reply({ ok: false, error: { code: 'NOT_FOUND', message: 'Transfer not found or expired.' } });
            }
            if (message['release'] === true) {
                dropTransfer(key);
                return reply({ ok: true, released: true });
            }
            const offset = Number(message['offset']), length = Number(message['length']);
            if (!Number.isInteger(offset) || !Number.isInteger(length) || offset < 0 || length < 1 || length > TRANSFER_MAX_CHUNK || offset >= t.bytes.length)
                return reply({ ok: false, error: { code: 'INVALID_ARGUMENT', message: 'Invalid offset/length.' } });
            const slice = t.bytes.subarray(offset, Math.min(t.bytes.length, offset + length));
            let binary = '';
            for (let i = 0; i < slice.length; i += 0x8000)
                binary += String.fromCharCode(...slice.subarray(i, i + 0x8000));
            reply({ ok: true, offset, length: slice.length, total: t.bytes.length, dataBase64: btoa(binary) });
        }
        async function onBridgeResource(message) {
            const id = String(message['id']);
            try {
                const resource = await readResource(String(message['uri']));
                sendBridge({ t: 'rres', id, ok: true, resource });
            }
            catch (error) {
                const e = error;
                sendBridge({ t: 'rres', id, ok: false, error: { code: e.code ?? 'INTERNAL', message: e.message } });
            }
        }
        function connectBridge(options) {
            if (!bridgeAvailable())
                throw new AutomationError('NOT_IMPLEMENTED', 'The AI bridge only works when VisualBoard is opened from a local file or localhost.');
            const code = normalizeCode(options.code);
            if (!BRIDGE_ALPHABET.test(code))
                throw new AutomationError('INVALID_ARGUMENT', 'The pairing code has 8 letters/digits.');
            const port = options.port === undefined ? 47821 : options.port;
            if (!Number.isInteger(port) || port < 1024 || port > 65535)
                throw new AutomationError('INVALID_ARGUMENT', 'Port must be between 1024 and 65535.');
            if (bridgeSocket || bridgeReconnectTimer)
                disconnectBridge();
            bridgeCode = code;
            bridgePort = port;
            bridgeWantReconnect = true;
            bridgeAttempt = 0;
            bridgeServer = null;
            bridgeClient = null;
            logBridge('connecting to 127.0.0.1:' + port);
            openBridgeSocket(false);
        }
        function authorizeBridge(scopes, label) {
            if (bridgeStatus !== 'pending' && bridgeStatus !== 'connecting')
                throw new AutomationError('OPERATION_REJECTED', 'There is no connection waiting for authorization.');
            const chosen = ALL_SCOPES.filter(s => scopes.includes(s));
            if (!chosen.length)
                throw new AutomationError('INVALID_ARGUMENT', 'Choose at least one permission.');
            enabled = true;
            client = (label || bridgeClient?.name || 'MCP').slice(0, 80);
            grants = new Set(chosen);
            bridgeGrantedScopes = chosen;
            bridgeResumeGrants = chosen;
            sendBridge({ t: 'authorize', grants: chosen, client });
            logBridge('user authorized: ' + chosen.join(', '));
            setBridgeStatus('authorized', null);
        }
        function revokeBridge() {
            bridgeResumeGrants = [];
            dropAccess();
            sendBridge({ t: 'revoke' });
            logBridge('user revoked access');
            if (bridgeSocket)
                setBridgeStatus('pending', null);
            else
                setBridgeStatus('off', null);
        }
        function refuseBridge() {
            bridgeWantReconnect = false;
            bridgeResumeGrants = [];
            sendBridge({ t: 'refuse' });
            dropAccess();
            logBridge('user refused access');
            closeBridgeSocket();
            setBridgeStatus('off', null);
        }
        function closeBridgeSocket() {
            if (bridgeReconnectTimer) {
                clearTimeout(bridgeReconnectTimer);
                bridgeReconnectTimer = null;
            }
            const socket = bridgeSocket;
            bridgeSocket = null;
            if (socket) {
                try {
                    socket.close(1000, 'user');
                }
                catch { /* already closed */ }
            }
        }
        function disconnectBridge() {
            bridgeWantReconnect = false;
            bridgeResumeGrants = [];
            dropAccess();
            closeBridgeSocket();
            bridgeCode = null;
            bridgeClient = null;
            bridgeServer = null;
            logBridge('user disconnected');
            setBridgeStatus('off', null);
        }
        /* ---------- painel "Integração com IA / MCP" (criado só ao abrir; sem espaço fixo no canvas) ---------- */
        let panel = null;
        let panelOpener = null;
        function el(tag, props = {}, children = []) {
            const node = document.createElement(tag);
            for (const [k, v] of Object.entries(props)) {
                if (k === 'class')
                    node.className = v;
                else if (k === 'text')
                    node.textContent = v;
                else
                    node.setAttribute(k, v);
            }
            for (const child of children)
                node.append(child);
            return node;
        }
        const STATUS_TEXT = {
            off: 'Desconectado', connecting: 'Conectando…', pending: 'Conectado — aguardando sua autorização',
            authorized: 'Autorizado', error: 'Erro de conexão'
        };
        const SCOPE_TEXT = {
            read: 'Ler o documento (sempre seguro)', write: 'Editar o documento (com Undo)',
            export: 'Exportar arquivos', destructive: 'Ações destrutivas (cada uma pede confirmação)'
        };
        function renderPanel() {
            if (!panel)
                return;
            const body = panel.querySelector('.nvb-ai-body');
            const keepCode = panel.querySelector('#nvb-ai-code')?.value ?? '';
            const keepPort = panel.querySelector('#nvb-ai-port')?.value ?? String(bridgePort || 47821);
            const keepScopes = new Set(Array.from(panel.querySelectorAll('input[data-scope]:checked')).map(i => i.dataset['scope']));
            const hadScopes = panel.querySelector('input[data-scope]') !== null;
            body.replaceChildren();
            const badge = el('div', { class: 'nvb-ai-status nvb-ai-' + bridgeStatus, role: 'status', 'aria-live': 'polite' }, [
                el('strong', { text: STATUS_TEXT[bridgeStatus] }),
                el('span', { text: bridgeClient ? ' — cliente: ' + bridgeClient.name + ' ' + bridgeClient.version : '' })
            ]);
            body.append(badge);
            if (bridgeError)
                body.append(el('p', { class: 'nvb-ai-errtext', role: 'alert', text: bridgeError }));
            if (bridgeStatus === 'off' || bridgeStatus === 'error') {
                body.append(el('p', { class: 'nvb-ai-help', text: 'No Claude Code, peça o status da ponte (visualboard_bridge_status) para obter o código de 8 caracteres e a porta.' }));
                const code = el('input', { id: 'nvb-ai-code', type: 'text', autocomplete: 'off', spellcheck: 'false', maxlength: '12', 'aria-label': 'Código de pareamento', placeholder: 'Código (8 caracteres)' });
                code.value = keepCode;
                const port = el('input', { id: 'nvb-ai-port', type: 'number', min: '1024', max: '65535', 'aria-label': 'Porta', value: keepPort });
                const connect = el('button', { type: 'button', class: 'btn primary', 'data-ai': 'connect', text: 'Conectar' });
                connect.addEventListener('click', () => {
                    try {
                        connectBridge({ code: code.value, port: Number(port.value) });
                        code.value = '';
                    }
                    catch (error) {
                        setBridgeStatus('error', error.message);
                    }
                });
                code.addEventListener('keydown', e => { if (e.key === 'Enter')
                    connect.click(); });
                body.append(el('div', { class: 'nvb-ai-row' }, [code, port, connect]));
            }
            else if (bridgeStatus === 'connecting') {
                body.append(el('button', { type: 'button', class: 'btn', 'data-ai': 'cancel', text: 'Cancelar' }));
                body.lastChild.addEventListener('click', disconnectBridge);
            }
            else if (bridgeStatus === 'pending') {
                body.append(el('p', { text: (bridgeClient ? bridgeClient.name : 'Um cliente de IA') + ' quer controlar este documento. Escolha o que ele pode fazer:' }));
                const list = el('div', { class: 'nvb-ai-scopes' });
                const defaults = new Set(['read', 'write', 'export']);
                for (const scope of ALL_SCOPES) {
                    const box = el('input', { type: 'checkbox', 'data-scope': scope });
                    box.checked = hadScopes ? keepScopes.has(scope) : defaults.has(scope);
                    list.append(el('label', { class: 'nvb-ai-scope' }, [box, ' ' + SCOPE_TEXT[scope]]));
                }
                body.append(list);
                const ok = el('button', { type: 'button', class: 'btn primary', 'data-ai': 'authorize', text: 'Autorizar' });
                ok.addEventListener('click', () => {
                    const chosen = Array.from(list.querySelectorAll('input:checked')).map(i => i.dataset['scope']);
                    try {
                        authorizeBridge(chosen);
                    }
                    catch (error) {
                        setBridgeStatus('pending', error.message);
                    }
                });
                const no = el('button', { type: 'button', class: 'btn', 'data-ai': 'refuse', text: 'Recusar' });
                no.addEventListener('click', refuseBridge);
                body.append(el('div', { class: 'nvb-ai-row' }, [ok, no]));
            }
            else if (bridgeStatus === 'authorized') {
                body.append(el('p', { text: 'Permissões: ' + bridgeGrantedScopes.map(s => SCOPE_TEXT[s]).join(' · ') }));
                body.append(el('p', { class: 'nvb-ai-help', text: 'Tudo que a IA faz entra no histórico (Ctrl+Z desfaz). Durante lotes a interface fica pausada.' }));
                const revoke = el('button', { type: 'button', class: 'btn', 'data-ai': 'revoke', text: 'Revogar acesso' });
                revoke.addEventListener('click', revokeBridge);
                const off = el('button', { type: 'button', class: 'btn danger', 'data-ai': 'disconnect', text: 'Desconectar' });
                off.addEventListener('click', disconnectBridge);
                body.append(el('div', { class: 'nvb-ai-row' }, [revoke, off]));
            }
            const recent = audit.slice(-12).reverse();
            body.append(el('h4', { text: 'Ações recentes' }));
            const actions = el('ul', { class: 'nvb-ai-actions', 'aria-label': 'Ações recentes da IA' });
            if (!recent.length)
                actions.append(el('li', { class: 'nvb-ai-empty', text: 'Nenhuma ação ainda.' }));
            for (const entry of recent)
                actions.append(el('li', { text: entry.time.slice(11, 19) + ' · ' + entry.tool.replace('visualboard.', '') + ' · ' + entry.outcome + (entry.code ? ' (' + entry.code + ')' : '') }));
            body.append(actions);
            const lines = bridgeLog.slice(-6);
            if (lines.length) {
                body.append(el('h4', { text: 'Diagnóstico da conexão' }));
                body.append(el('ul', { class: 'nvb-ai-log' }, lines.map(l => el('li', { text: l.time.slice(11, 19) + ' · ' + l.text }))));
            }
        }
        function openPanel() {
            if (typeof document === 'undefined' || !document.body)
                return;
            if (panel) {
                panel.querySelector('button, input')?.focus();
                return;
            }
            panelOpener = document.activeElement;
            const close = el('button', { type: 'button', class: 'btn ghost', 'aria-label': 'Fechar painel', text: '✕' });
            close.addEventListener('click', closePanel);
            panel = el('div', { id: 'automation-panel', class: 'nvb-ai-panel', role: 'dialog', 'aria-labelledby': 'nvb-ai-title' }, [
                el('div', { class: 'nvb-ai-head' }, [el('h3', { id: 'nvb-ai-title', text: 'Integração com IA / MCP' }), close]),
                el('div', { class: 'nvb-ai-body' })
            ]);
            panel.addEventListener('keydown', e => { if (e.key === 'Escape')
                closePanel(); });
            document.body.appendChild(panel);
            bridgeListeners.add(renderPanel);
            renderPanel();
            panel.querySelector('input, button')?.focus();
        }
        function closePanel() {
            if (!panel)
                return;
            bridgeListeners.delete(renderPanel);
            panel.remove();
            panel = null;
            if (panelOpener instanceof HTMLElement)
                panelOpener.focus();
        }
        /** Entrada de menu discreta; só existe quando a ponte pode funcionar (arquivo local/localhost). */
        function installPanelEntry() {
            if (typeof document === 'undefined' || !bridgeAvailable())
                return;
            const host = document.querySelector('.workspace-more-content');
            if (!host || host.querySelector('[data-ai-panel]'))
                return;
            const button = el('button', { type: 'button', class: 'btn', 'data-ai-panel': 'open', text: 'Integração com IA / MCP' });
            button.addEventListener('click', () => {
                const more = document.getElementById('workspace-more');
                if (more)
                    more.open = false;
                openPanel();
            });
            host.appendChild(button);
            bridgeListeners.add(() => { button.classList.toggle('nvb-ai-live', bridgeStatus === 'authorized'); });
        }
        installPanelEntry();
        kernel.provide('automation', {
            getStatus: status,
            isEnabled: () => enabled,
            enable: (options) => {
                enabled = true;
                client = options?.client ? String(options.client).slice(0, 80) : null;
                grants = new Set(options?.grants && options.grants.length ? options.grants : ['read']);
                return status();
            },
            disable: () => {
                enabled = false;
                client = null;
                grants = new Set();
                eventBuffer.length = 0;
                if (currentRun)
                    currentRun.cancelled = true;
                for (const ticket of queued.values())
                    ticket.cancelled = true;
                return status();
            },
            setGrants: (next) => { grants = new Set(next); return status(); },
            setConfirmHandler: (handler) => { confirmHandler = handler; },
            validate: (toolName, args) => {
                const tool = toolsByName.get(toolName);
                if (!tool)
                    return { valid: false, issues: [{ path: '$', message: 'Unknown tool: ' + toolName }] };
                const issues = validateInput(tool, args);
                return { valid: issues.length === 0, issues };
            },
            execute: (request) => execute(request),
            executeLocal: (request) => execute(request, true),
            readResource,
            getAuditLog: (count) => audit.slice(-(count ?? 100)),
            pollEvents,
            subscribe: (listener) => { eventListeners.add(listener); return () => { eventListeners.delete(listener); }; },
            cancel: cancelRequest,
            isLocked: () => locked,
            bridgeState,
            bridgeConnect: connectBridge,
            bridgeAuthorize: (scopes) => authorizeBridge(scopes),
            bridgeRefuse: refuseBridge,
            bridgeRevoke: revokeBridge,
            bridgeDisconnect: disconnectBridge,
            openPanel,
            closePanel
        });
    }
});
