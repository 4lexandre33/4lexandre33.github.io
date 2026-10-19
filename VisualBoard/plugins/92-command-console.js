"use strict";
/* =====================================================================
 * plugins/92-command-console.ts — Fase 14: console de comandos.
 *
 * Painel inferior (fechado por padrão) em que o usuário digita comandos
 * e usa as MESMAS ferramentas do contrato `visualboard.automation` que o
 * MCP e o CLI usam. Não há motor de edição aqui: o texto é traduzido em
 * { tool, args }, validado pelo contrato e executado por
 * `automation.executeLocal` (Undo/Redo, auditoria e confirmações normais).
 *
 * Gramática (docs/automation/console.md):
 *   ferramenta chave=valor chave="texto com espaços" {json}   # comentário
 *   vários comandos por linha com ";" ou em linhas separadas
 *   as=nome guarda o resultado · $nome.data.caminho · $last · $sel
 * Nada é avaliado como código: só JSON.parse e ferramentas do catálogo.
 * ===================================================================== */
definePlugin({
    id: 'command-console',
    version: '1.0.0',
    needs: ['automation', 'automationContract', 'state'],
    provides: ['commandConsole'],
    uses: ['ui.dialogs'],
    accepts: { 'automation': '^1.4.0', 'automationContract': '^1.0.0', 'state': '^1.0.0', 'ui.dialogs': '^1.0.0' },
    contractVersions: { 'commandConsole': '1.0.0' },
    setup: async function (kernel) {
        const automation = await kernel.require('automation');
        const contract = (await kernel.require('automationContract')).describe();
        const state = await kernel.require('state');
        const META = ['help', 'tools', 'describe', 'history', 'clear'];
        const PREFIX = 'visualboard.';
        const MAX_ENTRIES = 200;
        const MAX_HISTORY = 100;
        const MAX_TEXT = 20000;
        const REF = /^\$[A-Za-z_]\w*(?:(?:\.[\w-]+)|(?:\[\d+\]))*$/;
        const NAME = /^[A-Za-z_]\w*$/;
        /* ---------- catálogo (fonte única: o contrato vivo) ---------- */
        const byShort = new Map();
        const byAlias = new Map();
        for (const tool of contract.tools) {
            const short = tool.name.startsWith(PREFIX) ? tool.name.slice(PREFIX.length) : tool.name;
            byShort.set(short, tool);
            byAlias.set(short, tool);
            byAlias.set(tool.name, tool);
            byAlias.set(tool.name.replace(/\./g, '_'), tool);
        }
        const shortName = (tool) => tool.name.startsWith(PREFIX) ? tool.name.slice(PREFIX.length) : tool.name;
        const allShort = () => Array.from(byShort.keys()).sort();
        function suggest(name) {
            const lower = name.toLowerCase();
            const parts = lower.split(/[._]/).filter(Boolean);
            return allShort().filter(n => n.includes(lower) || parts.some(p => p.length > 2 && n.includes(p))).slice(0, 5);
        }
        const typesOf = (schema) => {
            const t = schema?.type;
            return t === undefined ? [] : Array.isArray(t) ? [...t] : [t];
        };
        /** Divide em instruções por nova linha e ";" fora de aspas/JSON; remove comentários "#". */
        function splitStatements(text) {
            const out = [];
            let buf = '', line = 1, col = 1, startLine = 1, startCol = 1, inQuote = false, depth = 0, comment = false, esc = false;
            const flush = () => {
                if (buf.trim())
                    out.push({ text: buf, line: startLine, column: startCol });
                buf = '';
                startLine = line;
                startCol = col;
            };
            for (let i = 0; i < text.length; i++) {
                const ch = text[i];
                if (ch === '\n') {
                    comment = false;
                    if (inQuote || depth > 0) {
                        buf += ' ';
                    }
                    else {
                        flush();
                    }
                    line++;
                    col = 1;
                    if (!buf) {
                        startLine = line;
                        startCol = 1;
                    }
                    continue;
                }
                col++;
                if (comment)
                    continue;
                if (inQuote) {
                    buf += ch;
                    if (esc)
                        esc = false;
                    else if (ch === '\\')
                        esc = true;
                    else if (ch === '"')
                        inQuote = false;
                    continue;
                }
                if (ch === '#' && (buf === '' || /\s/.test(buf[buf.length - 1]))) {
                    comment = true;
                    continue;
                }
                if (ch === '"') {
                    inQuote = true;
                    buf += ch;
                    continue;
                }
                if (ch === '{' || ch === '[')
                    depth++;
                if ((ch === '}' || ch === ']') && depth > 0)
                    depth--;
                if (ch === ';' && depth === 0) {
                    flush();
                    startCol = col;
                    continue;
                }
                if (!buf) {
                    startLine = line;
                    startCol = col - 1;
                }
                buf += ch;
            }
            flush();
            return out;
        }
        function tokenize(statement) {
            const tokens = [];
            const s = statement.text;
            let cur = '', start = 0, inQuote = false, depth = 0, esc = false;
            const push = () => { if (cur)
                tokens.push({ text: cur, column: statement.column + start }); cur = ''; };
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (inQuote) {
                    cur += ch;
                    if (esc)
                        esc = false;
                    else if (ch === '\\')
                        esc = true;
                    else if (ch === '"')
                        inQuote = false;
                    continue;
                }
                if (/\s/.test(ch) && depth === 0) {
                    push();
                    continue;
                }
                if (!cur)
                    start = i;
                if (ch === '"')
                    inQuote = true;
                else if (ch === '{' || ch === '[')
                    depth++;
                else if ((ch === '}' || ch === ']') && depth > 0)
                    depth--;
                cur += ch;
            }
            if (inQuote)
                return { tokens, error: { line: statement.line, column: statement.column, message: 'Aspas não fechadas.' } };
            if (depth > 0)
                return { tokens, error: { line: statement.line, column: statement.column, message: 'JSON não fechado: faltam "}" ou "]".' } };
            push();
            return { tokens };
        }
        /** Troca strings "$ref" (em qualquer profundidade) por marcadores resolvidos só na execução. */
        function markRefs(value) {
            if (typeof value === 'string')
                return REF.test(value) ? { $ref: value.slice(1) } : value;
            if (Array.isArray(value))
                return value.map(markRefs);
            if (value && typeof value === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(value))
                    out[k] = markRefs(v);
                return out;
            }
            return value;
        }
        function inferBare(raw) {
            if (raw === 'true')
                return true;
            if (raw === 'false')
                return false;
            if (raw === 'null')
                return null;
            if (raw !== '' && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw))
                return Number(raw);
            return raw;
        }
        function coerce(raw, schema) {
            if (raw.startsWith('"')) {
                try {
                    const v = JSON.parse(raw);
                    if (typeof v !== 'string')
                        throw new Error('x');
                    return { value: markRefs(v) };
                }
                catch {
                    return { error: 'Texto entre aspas inválido (use \\" para aspas e \\\\ para barra).' };
                }
            }
            if (raw.startsWith('{') || raw.startsWith('[')) {
                try {
                    return { value: markRefs(JSON.parse(raw)) };
                }
                catch (e) {
                    return { error: 'JSON inválido: ' + (e instanceof Error ? e.message : String(e)) };
                }
            }
            if (REF.test(raw))
                return { value: { $ref: raw.slice(1) } };
            const types = typesOf(schema);
            if (!types.length)
                return { value: inferBare(raw) };
            if (raw === 'null' && types.includes('null'))
                return { value: null };
            if (types.includes('boolean') && (raw === 'true' || raw === 'false'))
                return { value: raw === 'true' };
            if ((types.includes('number') || types.includes('integer')) && /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(raw))
                return { value: Number(raw) };
            if (types.includes('array')) {
                const itemTypes = typesOf(schema?.items);
                if (!itemTypes.length || itemTypes.includes('string') || itemTypes.includes('number') || itemTypes.includes('integer')) {
                    return { value: raw.split(',').map(part => {
                            const p = part.trim();
                            return itemTypes.includes('string') || !itemTypes.length ? (REF.test(p) ? { $ref: p.slice(1) } : p) : inferBare(p);
                        }) };
                }
                return { error: 'Esta lista precisa de JSON, por exemplo [{"x":1}].' };
            }
            if (types.includes('string'))
                return { value: raw };
            if (types.includes('object'))
                return { error: 'Este valor precisa de JSON, por exemplo {"x":1}.' };
            return { value: inferBare(raw) };
        }
        function parse(text) {
            const commands = [];
            const errors = [];
            if (typeof text !== 'string')
                return { commands, errors: [{ line: 1, column: 1, message: 'O comando deve ser texto.' }] };
            if (text.length > MAX_TEXT)
                return { commands, errors: [{ line: 1, column: 1, message: 'Texto longo demais (máximo ' + MAX_TEXT + ' caracteres).' }] };
            for (const statement of splitStatements(text)) {
                const { tokens, error } = tokenize(statement);
                if (error) {
                    errors.push(error);
                    continue;
                }
                const head = tokens[0];
                if (!head)
                    continue;
                const name = head.text;
                if (META.includes(name.toLowerCase())) {
                    commands.push({ line: statement.line, meta: name.toLowerCase(), rest: tokens.slice(1).map(t => t.text) });
                    continue;
                }
                const tool = byAlias.get(name);
                if (!tool) {
                    const near = suggest(name);
                    errors.push({ line: statement.line, column: head.column, message: 'Ferramenta desconhecida: "' + name + '".' +
                            (near.length ? ' Quis dizer: ' + near.join(', ') + '?' : ' Use "tools" para listar.') });
                    continue;
                }
                const args = {};
                let asName = null;
                let failed = false;
                const props = tool.input.properties || {};
                const issue = (column, message) => { errors.push({ line: statement.line, column, message }); failed = true; };
                let positionalJson = false;
                for (const tok of tokens.slice(1)) {
                    const t = tok.text;
                    if (t.startsWith('{')) {
                        if (positionalJson || Object.keys(args).length) {
                            issue(tok.column, 'Use ou {json} ou chave=valor, não os dois.');
                            continue;
                        }
                        const parsed = coerce(t, undefined);
                        if ('error' in parsed) {
                            issue(tok.column, parsed.error);
                            continue;
                        }
                        if (!parsed.value || typeof parsed.value !== 'object' || Array.isArray(parsed.value)) {
                            issue(tok.column, 'O JSON posicional deve ser um objeto.');
                            continue;
                        }
                        Object.assign(args, parsed.value);
                        positionalJson = true;
                        continue;
                    }
                    const eq = /^([A-Za-z_][\w]*)=([\s\S]*)$/.exec(t);
                    if (!eq) {
                        issue(tok.column, 'Argumento inesperado "' + t + '". Use chave=valor.');
                        continue;
                    }
                    const key = eq[1], rawValue = eq[2];
                    if (positionalJson) {
                        issue(tok.column, 'Use ou {json} ou chave=valor, não os dois.');
                        continue;
                    }
                    if (key === 'as' && !('as' in props)) {
                        if (!NAME.test(rawValue)) {
                            issue(tok.column, 'Nome de variável inválido: "' + rawValue + '".');
                            continue;
                        }
                        asName = rawValue;
                        continue;
                    }
                    if (rawValue === '') {
                        issue(tok.column, 'Falta o valor de "' + key + '".');
                        continue;
                    }
                    if (key in args) {
                        issue(tok.column, 'O argumento "' + key + '" foi repetido.');
                        continue;
                    }
                    const value = coerce(rawValue, props[key]);
                    if ('error' in value) {
                        issue(tok.column, key + ': ' + value.error);
                        continue;
                    }
                    args[key] = value.value;
                }
                if (!failed)
                    commands.push({ line: statement.line, tool: tool.name, args, as: asName });
            }
            return { commands, errors };
        }
        function resolvePath(path, vars) {
            const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
            const head = parts.shift();
            let cur;
            if (head === 'sel')
                cur = Array.from(state.data.selection ?? []);
            else if (head === 'last')
                cur = vars.last;
            else if (vars.named.has(head))
                cur = vars.named.get(head);
            else
                return { error: 'Variável desconhecida: $' + head + '.' };
            for (const part of parts) {
                if (cur === null || cur === undefined || typeof cur !== 'object')
                    return { error: 'Caminho não encontrado: $' + path + '.' };
                cur = cur[part];
                if (cur === undefined)
                    return { error: 'Caminho não encontrado: $' + path + '.' };
            }
            return { value: cur };
        }
        function resolveRefs(value, vars) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                const keys = Object.keys(value);
                if (keys.length === 1 && keys[0] === '$ref' && typeof value.$ref === 'string') {
                    return resolvePath(value.$ref, vars);
                }
                const out = {};
                for (const [k, v] of Object.entries(value)) {
                    const r = resolveRefs(v, vars);
                    if ('error' in r)
                        return r;
                    out[k] = r.value;
                }
                return { value: out };
            }
            if (Array.isArray(value)) {
                const out = [];
                for (const v of value) {
                    const r = resolveRefs(v, vars);
                    if ('error' in r)
                        return r;
                    out.push(r.value);
                }
                return { value: out };
            }
            return { value };
        }
        const history = [];
        try {
            const stored = JSON.parse(localStorage.getItem('nvb.ui.console.history') || '[]');
            if (Array.isArray(stored))
                for (const h of stored)
                    if (typeof h === 'string')
                        history.push(h.slice(0, MAX_TEXT));
        }
        catch { /* histórico é só conveniência local */ }
        const pushHistory = (text) => {
            const t = text.trim();
            if (!t || history[history.length - 1] === t)
                return;
            history.push(t);
            while (history.length > MAX_HISTORY)
                history.shift();
            try {
                localStorage.setItem('nvb.ui.console.history', JSON.stringify(history));
            }
            catch { /* ignore */ }
        };
        const vars = { named: new Map(), last: null };
        const clip = (v) => {
            if (typeof v === 'string' && v.length > 200 && /^[A-Za-z0-9+/=\s]+$/.test(v))
                return '<' + v.length + ' caracteres base64>';
            if (Array.isArray(v))
                return v.map(clip);
            if (v && typeof v === 'object')
                return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clip(x)]));
            return v;
        };
        function toolHelp(tool) {
            const props = tool.input.properties || {};
            const required = new Set(tool.input.required || []);
            const lines = [shortName(tool) + ' — ' + tool.title + ' [' + tool.scope + (tool.undoable ? ', desfazível' : '') + ']', tool.description];
            const keys = Object.keys(props);
            if (!keys.length)
                lines.push('Sem argumentos.');
            for (const key of keys) {
                const p = props[key];
                const t = typesOf(p).join('|') + (p.enum ? ' ∈ {' + p.enum.join(', ') + '}' : '');
                lines.push('  ' + key + (required.has(key) ? '*' : '') + ' : ' + t + (p.description ? ' — ' + p.description : ''));
            }
            return lines.join('\n');
        }
        const HELP = [
            'Console de comandos — usa as mesmas ferramentas do contrato que a IA usa.',
            '  ferramenta chave=valor chave="texto com espaços" {json}',
            '  Vários comandos: separe por ";" ou nova linha. "#" inicia comentário.',
            '  as=nome guarda o resultado; $nome.data.caminho, $last e $sel (seleção) reutilizam valores.',
            '  Meta: help · tools [filtro] · describe <ferramenta> · history · clear',
            '  Enter executa · Shift+Enter nova linha · Tab completa · ↑/↓ histórico · Esc fecha',
            '  Exemplo: page.list_templates   |   page.create_from_template templateId=splash as=p',
            '  Operações destrutivas pedem confirmação; tudo pode ser desfeito com history.undo.'
        ].join('\n');
        function runMeta(cmd, onClear) {
            if (cmd.meta === 'help')
                return HELP;
            if (cmd.meta === 'clear') {
                onClear();
                return '';
            }
            if (cmd.meta === 'history')
                return history.length ? history.map((h, i) => (i + 1) + '  ' + h.replace(/\n/g, ' ⏎ ')).join('\n') : 'Histórico vazio.';
            if (cmd.meta === 'tools') {
                const filter = (cmd.rest[0] || '').toLowerCase();
                const list = allShort().filter(n => !filter || n.includes(filter));
                return list.length ? list.length + ' ferramentas:\n' + list.join('\n') : 'Nenhuma ferramenta contém "' + filter + '".';
            }
            const name = cmd.rest[0];
            if (!name)
                return 'Uso: describe <ferramenta>';
            const tool = byAlias.get(name);
            return tool ? toolHelp(tool) : 'Ferramenta desconhecida: "' + name + '". ' + (suggest(name).join(', ') || 'Use "tools".');
        }
        let running = false;
        async function run(text, hooks) {
            const parsed = parse(text);
            const entries = [];
            if (parsed.errors.length)
                return { ok: false, entries, errors: parsed.errors };
            running = true;
            let ok = true;
            try {
                for (const cmd of parsed.commands) {
                    const started = Date.now();
                    if ('meta' in cmd) {
                        entries.push({ line: cmd.line, input: cmd.meta, ok: true, tool: cmd.meta, ms: 0, text: runMeta(cmd, hooks?.onClear ?? (() => undefined)) });
                        continue;
                    }
                    const resolved = resolveRefs(cmd.args, vars);
                    if ('error' in resolved) {
                        entries.push({ line: cmd.line, input: cmd.tool, ok: false, tool: cmd.tool, ms: 0, error: { code: 'REF_NOT_FOUND', message: resolved.error } });
                        ok = false;
                        break;
                    }
                    const result = await automation.executeLocal({ tool: cmd.tool, args: resolved.value });
                    vars.last = result;
                    if (result.ok) {
                        if (cmd.as)
                            vars.named.set(cmd.as, result);
                        entries.push({ line: cmd.line, input: cmd.tool, ok: true, tool: cmd.tool, ms: Date.now() - started, data: result.data });
                    }
                    else {
                        entries.push({ line: cmd.line, input: cmd.tool, ok: false, tool: cmd.tool, ms: Date.now() - started, error: result.error });
                        ok = false;
                        break;
                    }
                }
            }
            finally {
                running = false;
            }
            return { ok, entries, errors: [] };
        }
        /* ---------- interface ---------- */
        const stage = document.getElementById('stage');
        const el = (tag, attrs = {}, text) => {
            const node = document.createElement(tag);
            for (const [k, v] of Object.entries(attrs))
                node.setAttribute(k, v);
            if (text !== undefined)
                node.textContent = text;
            return node;
        };
        if (!stage) {
            kernel.provide('commandConsole', { parse: parse, run: run, open: () => undefined, close: () => undefined, toggle: () => undefined, isOpen: () => false });
            return;
        }
        const panel = el('section', { id: 'command-console', class: 'vb-console', role: 'region', 'aria-label': 'Console de comandos' });
        panel.hidden = true;
        const grip = el('div', { class: 'vb-console-grip', role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': 'Redimensionar console', tabindex: '0' });
        const head = el('div', { class: 'vb-console-head' });
        const title = el('h2', {}, 'Console');
        const hint = el('span', { class: 'vb-console-hint' }, 'help · Enter executa · Shift+Enter nova linha · Tab completa');
        const clearBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Limpar saída', 'aria-label': 'Limpar saída' }, '⌫');
        const closeBtn = el('button', { type: 'button', class: 'icon-btn', title: 'Fechar console (Esc)', 'aria-label': 'Fechar console' }, '×');
        head.append(title, hint, clearBtn, closeBtn);
        const log = el('div', { class: 'vb-console-log', role: 'log', 'aria-live': 'polite', tabindex: '-1' });
        const suggestBox = el('ul', { class: 'vb-console-suggest', role: 'listbox', 'aria-label': 'Sugestões' });
        suggestBox.hidden = true;
        const schemaHint = el('div', { class: 'vb-console-schema', 'aria-live': 'polite' });
        const row = el('div', { class: 'vb-console-input' });
        const prompt = el('span', { class: 'vb-console-prompt', 'aria-hidden': 'true' }, '›');
        const input = el('textarea', { rows: '1', 'aria-label': 'Comando', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', placeholder: 'Digite um comando — "help" mostra como' });
        row.append(prompt, input);
        panel.append(grip, head, log, suggestBox, schemaHint, row);
        stage.appendChild(panel);
        let opener = null;
        const isOpen = () => !panel.hidden;
        function open() {
            if (isOpen()) {
                input.focus();
                return;
            }
            opener = document.activeElement;
            panel.hidden = false;
            document.getElementById('app')?.classList.add('console-open');
            if (!log.childElementCount)
                append('info', HELP);
            input.focus();
        }
        function close() {
            if (!isOpen())
                return;
            panel.hidden = true;
            suggestBox.hidden = true;
            document.getElementById('app')?.classList.remove('console-open');
            if (opener instanceof HTMLElement && document.contains(opener))
                opener.focus();
        }
        const toggle = () => { if (isOpen())
            close();
        else
            open(); };
        function trim() { while (log.childElementCount > MAX_ENTRIES)
            log.firstElementChild?.remove(); }
        function append(kind, text, detail, image) {
            const line = el('div', { class: 'vb-console-line vb-console-' + kind });
            line.append(el('pre', { class: 'vb-console-text' }, text));
            if (detail !== undefined) {
                const details = el('details', { class: 'vb-console-detail' });
                details.append(el('summary', {}, 'resultado'));
                let json = JSON.stringify(clip(detail), null, 2) ?? '';
                if (json.length > 6000)
                    json = json.slice(0, 6000) + '\n… (truncado)';
                details.append(el('pre', { class: 'vb-console-json' }, json));
                line.append(details);
            }
            if (image) {
                const img = el('img', { class: 'vb-console-thumb', alt: 'Pré-visualização do resultado', src: image });
                line.append(img);
            }
            log.append(line);
            trim();
            log.scrollTop = log.scrollHeight;
        }
        const imageOf = (data) => {
            const d = data;
            return d && typeof d.base64 === 'string' && typeof d.mimeType === 'string' && /^image\/(png|jpeg|webp)$/.test(d.mimeType)
                ? 'data:' + d.mimeType + ';base64,' + d.base64 : undefined;
        };
        async function submit() {
            const text = input.value;
            if (!text.trim() || running)
                return;
            pushHistory(text);
            historyIndex = -1;
            draft = '';
            input.value = '';
            autosize();
            hideSuggest();
            append('in', text.trim());
            const out = await run(text, { onClear: () => { log.replaceChildren(); } });
            for (const e of out.errors)
                append('err', 'linha ' + e.line + ', col ' + e.column + ': ' + e.message);
            for (const e of out.entries) {
                if (e.text !== undefined) {
                    if (e.text)
                        append('info', e.text);
                    continue;
                }
                if (e.ok)
                    append('ok', '✓ ' + e.tool.replace(PREFIX, '') + ' · ' + e.ms + ' ms', e.data, imageOf(e.data));
                else {
                    const issues = (e.error?.issues || []).map(i => '\n  ' + i.path + ': ' + i.message).join('');
                    append('err', '✗ ' + (e.error?.code || 'ERRO') + ': ' + (e.error?.message || '') + issues);
                }
            }
            input.focus();
        }
        /* entrada: histórico, Tab e dica de schema */
        let historyIndex = -1, draft = '';
        const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; };
        const hideSuggest = () => { suggestBox.hidden = true; suggestBox.replaceChildren(); };
        /** Instrução em edição (a que contém o cursor, separada por ";" ou nova linha). */
        function currentStatement() {
            const upto = input.value.slice(0, input.selectionStart ?? input.value.length);
            const cut = Math.max(upto.lastIndexOf('\n'), upto.lastIndexOf(';'));
            return { before: upto.slice(cut + 1), start: cut + 1 };
        }
        function candidates() {
            const { before, start } = currentStatement();
            const lead = before.length - before.trimStart().length;
            const body = before.slice(lead);
            const words = body.split(/\s+/);
            const last = words[words.length - 1] ?? '';
            const lastStart = start + before.length - last.length;
            if (words.length <= 1) {
                const pool = [...META, ...allShort()];
                return { list: pool.filter(n => n.startsWith(last)), prefix: last, start: lastStart, suffix: ' ' };
            }
            const tool = byAlias.get(words[0]);
            if (!tool || last.includes('='))
                return { list: [], prefix: last, start: lastStart, suffix: '' };
            const used = new Set(words.slice(1, -1).map(w => w.split('=')[0]));
            const keys = [...Object.keys(tool.input.properties || {}), 'as'].filter(k => !used.has(k));
            return { list: keys.filter(k => k.startsWith(last)), prefix: last, start: lastStart, suffix: '=' };
        }
        function commonPrefix(items) {
            if (!items.length)
                return '';
            let p = items[0];
            for (const s of items) {
                while (!s.startsWith(p))
                    p = p.slice(0, -1);
            }
            return p;
        }
        function complete() {
            const c = candidates();
            if (!c.list.length) {
                hideSuggest();
                return;
            }
            const common = commonPrefix(c.list);
            const replacement = c.list.length === 1 ? c.list[0] + c.suffix : common;
            if (replacement.length > c.prefix.length) {
                input.setRangeText(replacement, c.start, c.start + c.prefix.length, 'end');
                autosize();
                updateHint();
            }
            if (c.list.length > 1)
                showSuggest(c.list);
            else
                hideSuggest();
        }
        function showSuggest(list) {
            suggestBox.replaceChildren();
            for (const name of list.slice(0, 8))
                suggestBox.append(el('li', { role: 'option' }, name));
            suggestBox.hidden = false;
        }
        function updateHint() {
            const { before } = currentStatement();
            const first = before.trim().split(/\s+/)[0] || '';
            const tool = byAlias.get(first);
            if (!tool) {
                schemaHint.textContent = '';
                return;
            }
            const required = new Set(tool.input.required || []);
            const keys = Object.keys(tool.input.properties || {});
            schemaHint.textContent = shortName(tool) + ' · ' + tool.scope + (keys.length ? ' · ' : '') +
                keys.map(k => k + (required.has(k) ? '*' : '')).join('  ');
        }
        input.addEventListener('input', () => { autosize(); updateHint(); hideSuggest(); });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                void submit();
                return;
            }
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                complete();
                return;
            }
            if (e.key === 'Escape') {
                e.stopPropagation();
                if (!suggestBox.hidden)
                    hideSuggest();
                else
                    close();
                return;
            }
            const single = !input.value.includes('\n');
            if (e.key === 'ArrowUp' && single && history.length) {
                e.preventDefault();
                if (historyIndex === -1)
                    draft = input.value;
                historyIndex = Math.min(history.length - 1, historyIndex + 1);
                input.value = history[history.length - 1 - historyIndex];
                autosize();
                updateHint();
            }
            else if (e.key === 'ArrowDown' && single && historyIndex >= 0) {
                e.preventDefault();
                historyIndex--;
                input.value = historyIndex === -1 ? draft : history[history.length - 1 - historyIndex];
                autosize();
                updateHint();
            }
        });
        suggestBox.addEventListener('pointerdown', e => e.preventDefault());
        suggestBox.addEventListener('click', e => {
            const item = e.target.closest('li');
            if (!item)
                return;
            const c = candidates();
            input.setRangeText(item.textContent + c.suffix, c.start, c.start + c.prefix.length, 'end');
            hideSuggest();
            autosize();
            updateHint();
            input.focus();
        });
        clearBtn.addEventListener('click', () => { log.replaceChildren(); input.focus(); });
        closeBtn.addEventListener('click', close);
        panel.addEventListener('keydown', e => { if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        } });
        /* altura: arrastar a borda superior ou ↑/↓ com a borda focada */
        const HEIGHT_KEY = 'nvb.ui.console.height';
        const setHeight = (px, persist) => {
            const max = Math.max(140, Math.round(window.innerHeight * 0.7));
            const safe = Math.max(120, Math.min(max, Math.round(px)));
            panel.style.setProperty('--vb-console-h', safe + 'px');
            grip.setAttribute('aria-valuenow', String(safe));
            if (persist) {
                try {
                    localStorage.setItem(HEIGHT_KEY, String(safe));
                }
                catch { /* ignore */ }
            }
        };
        try {
            const saved = Number(localStorage.getItem(HEIGHT_KEY));
            if (saved)
                setHeight(saved, false);
        }
        catch { /* ignore */ }
        grip.addEventListener('pointerdown', e => {
            e.preventDefault();
            const startY = e.clientY, startH = panel.getBoundingClientRect().height;
            const move = (ev) => setHeight(startH + (startY - ev.clientY), false);
            const up = (ev) => {
                window.removeEventListener('pointermove', move);
                window.removeEventListener('pointerup', up);
                setHeight(startH + (startY - ev.clientY), true);
            };
            window.addEventListener('pointermove', move);
            window.addEventListener('pointerup', up);
        });
        grip.addEventListener('keydown', e => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')
                return;
            e.preventDefault();
            setHeight(panel.getBoundingClientRect().height + (e.key === 'ArrowUp' ? 24 : -24), true);
        });
        /* pontos de acesso: atalho, Mais ▸ Console, clique direito ▸ Console… */
        kernel.listen(document, 'keydown', event => {
            const k = event;
            if ((k.ctrlKey || k.metaKey) && !k.altKey && (k.key === '`' || k.code === 'Backquote')) {
                k.preventDefault();
                toggle();
            }
        });
        kernel.listen(document, 'click', event => {
            const trigger = event.target?.closest('[data-cmd="open-console"]');
            if (!trigger)
                return;
            const more = document.getElementById('workspace-more');
            if (more)
                more.open = false;
            toggle();
        });
        kernel.provide('commandConsole', { parse: parse, run: ((t) => run(t, { onClear: () => log.replaceChildren() })), open, close, toggle, isOpen });
    }
});
