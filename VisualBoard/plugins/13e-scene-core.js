"use strict";
/* Scene Blocking — núcleo do modelo: constantes, paleta, aleatoriedade determinística por subsistema, geometria básica e validação da configuração.
 * Funções puras, sem DOM. O modelo de cena é a fonte de verdade; o SVG é derivado dele. */
definePlugin({
    id: 'scene-blocking-core',
    version: '1.0.0',
    needs: [],
    provides: ['sceneBlockingCore'],
    uses: [],
    accepts: {},
    contractVersions: { sceneBlockingCore: '1.0.0' },
    setup: function (kernel) {
        /** Unidades de célula. Tamanhos de símbolo são fixos: distância e elevação nunca mudam o ícone. */
        const CONST = Object.freeze({
            CELL: 600, SHEET: 1800, EDGE: 6,
            MANNEQUIN_R: 28, SUBJECT_R: 22, MIN_SEPARATION: 62,
            CAMERA_R: 26, CAMERA_GAP: 64, LENS_OFFSET: 20,
            MAX_SHEETS: 200, MAX_MANNEQUINS: 8, SHEET_CELLS: 9
        });
        const PALETTE = Object.freeze([
            { slot: 1, contour: '#0D47A1', fill: '#42A5F5' }, { slot: 2, contour: '#B71C1C', fill: '#EF5350' },
            { slot: 3, contour: '#1B5E20', fill: '#66BB6A' }, { slot: 4, contour: '#E65100', fill: '#FF9800' },
            { slot: 5, contour: '#4A148C', fill: '#AB47BC' }, { slot: 6, contour: '#006064', fill: '#26C6DA' },
            { slot: 7, contour: '#880E4F', fill: '#EC407C' }, { slot: 8, contour: '#7F4F00', fill: '#FFC107' }
        ]);
        const ELEVATION = Object.freeze({
            E1: { color: '#1565C0', height: 0.25 }, E2: { color: '#D97706', height: 1 }, E3: { color: '#7E22CE', height: 3 }
        });
        const RETICLE_COLOR = '#C49A3A';
        function fail(code, message, field) {
            const e = new Error(message);
            e.code = code;
            if (field)
                e.field = field;
            throw e;
        }
        /* ------------------------- aleatoriedade determinística ------------------------- */
        function fnv(text) {
            let h = 0x811c9dc5;
            for (let i = 0; i < text.length; i++) {
                h ^= text.charCodeAt(i);
                h = Math.imul(h, 0x01000193);
            }
            h ^= h >>> 16;
            h = Math.imul(h, 0x85ebca6b);
            h ^= h >>> 13;
            h = Math.imul(h, 0xc2b2ae35);
            h ^= h >>> 16;
            return h >>> 0;
        }
        /** seed = hash(masterSeed, sheetIndex, cellIndex, subsistema[, salt]); folha −1 = nível do lote, célula −1 = nível da folha. */
        function hash(master, sheet, cell, subsystem, salt = 0) {
            return fnv(master + '|' + sheet + '|' + cell + '|' + subsystem + '|' + salt);
        }
        function random(seed) {
            let a = seed >>> 0;
            const next = () => {
                a = (a + 0x6d2b79f5) >>> 0;
                let t = a;
                t = Math.imul(t ^ (t >>> 15), t | 1);
                t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
                return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
            };
            const range = (lo, hi) => lo + (hi - lo) * next();
            const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
            return {
                next, range, int, chance: p => next() < p,
                pick: (list) => list[Math.floor(next() * list.length)],
                shuffle: (list) => { const o = list.slice(); for (let i = o.length - 1; i > 0; i--) {
                    const j = Math.floor(next() * (i + 1));
                    const t = o[i];
                    o[i] = o[j];
                    o[j] = t;
                } return o; }
            };
        }
        /* ------------------------------- geometria ------------------------------- */
        const round2 = (n) => { const r = Math.round(n * 100) / 100; return r === 0 ? 0 : r; };
        const norm360 = (a) => { const r = ((a % 360) + 360) % 360; const q = round2(r); return q >= 360 ? 0 : q; };
        const dir = (angle) => { const r = angle * Math.PI / 180; return { x: Math.sin(r), y: -Math.cos(r) }; };
        const angleTo = (from, to) => norm360(Math.atan2(to.x - from.x, -(to.y - from.y)) * 180 / Math.PI);
        const angleDiff = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; };
        const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
        /** Ponto dentro de polígono convexo (qualquer sentido), com folga eps. */
        function inConvex(p, poly, eps = 0) {
            let sign = 0;
            for (let i = 0; i < poly.length; i++) {
                const a = poly[i], b = poly[(i + 1) % poly.length];
                const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
                const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
                const s = cross / len;
                if (Math.abs(s) <= eps)
                    continue;
                const sg = s > 0 ? 1 : -1;
                if (sign === 0)
                    sign = sg;
                else if (sg !== sign)
                    return false;
            }
            return true;
        }
        /* --------------------------- configuração do lote --------------------------- */
        function defaultConfig() {
            return { quantityOfSpritesheets: 1, theme: 'REUNIÃO', masterSeed: 123456, variation: 0.5, mannequinCountMode: 'automatic',
                minMannequins: 2, maxMannequins: 8, cameraPosition: 'auto', cameraDistance: 'auto', cameraFraming: 'auto', focusTarget: 'auto' };
        }
        const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
        const KNOWN = new Set(['quantityOfSpritesheets', 'theme', 'formation', 'masterSeed', 'variation', 'mannequinCountMode', 'minMannequins', 'maxMannequins', 'cameraPosition', 'cameraDistance', 'cameraFraming', 'focusTarget']);
        function normalizeConfig(input) {
            if (input === undefined || input === null)
                return defaultConfig();
            if (!isObj(input))
                fail('INVALID_ARGUMENT', 'A configuração deve ser um objeto');
            for (const k of Object.keys(input))
                if (!KNOWN.has(k))
                    fail('INVALID_ARGUMENT', 'Campo desconhecido: ' + k, k);
            const base = defaultConfig();
            const out = { ...base };
            const num = (k, lo, hi, int) => {
                const v = input[k];
                if (typeof v !== 'number' || !Number.isFinite(v))
                    fail('INVALID_ARGUMENT', k + ' deve ser um número', k);
                if (int && !Number.isInteger(v))
                    fail('INVALID_ARGUMENT', k + ' deve ser inteiro', k);
                if (v < lo || v > hi)
                    fail('INVALID_ARGUMENT', k + ' deve estar entre ' + lo + ' e ' + hi, k);
                return v;
            };
            const oneOf = (k, list) => {
                const v = input[k];
                if (typeof v !== 'string' || !list.includes(v))
                    fail('INVALID_ARGUMENT', k + ' deve ser um de: ' + list.join(', '), k);
                return v;
            };
            if ('quantityOfSpritesheets' in input)
                out.quantityOfSpritesheets = num('quantityOfSpritesheets', 1, CONST.MAX_SHEETS, true);
            if ('masterSeed' in input)
                out.masterSeed = num('masterSeed', 0, 4294967295, true);
            if ('variation' in input)
                out.variation = num('variation', 0, 1, false);
            if ('minMannequins' in input)
                out.minMannequins = num('minMannequins', 1, 8, true);
            if ('maxMannequins' in input)
                out.maxMannequins = num('maxMannequins', 1, 8, true);
            if (out.minMannequins > out.maxMannequins)
                fail('INVALID_ARGUMENT', 'minMannequins não pode passar de maxMannequins', 'minMannequins');
            if ('mannequinCountMode' in input)
                out.mannequinCountMode = oneOf('mannequinCountMode', ['automatic', 'fixed', 'range']);
            if ('theme' in input) {
                const t = input['theme'];
                if (typeof t !== 'string' || !t.trim() || t.length > 80 || /[\u0000-\u001f]/.test(t))
                    fail('INVALID_ARGUMENT', 'theme deve ser um texto de 1 a 80 caracteres, sem controles', 'theme');
                out.theme = t.trim();
            }
            if ('formation' in input) {
                const f = input['formation'];
                if (typeof f !== 'string' || !/^[a-z0-9-]{1,40}$/.test(f))
                    fail('INVALID_ARGUMENT', 'formation deve ser um id de formação (a-z, 0-9, -)', 'formation');
                out.formation = f;
            }
            if ('cameraPosition' in input) {
                const p = input['cameraPosition'];
                if (p === 'auto')
                    out.cameraPosition = 'auto';
                else if (isObj(p) && typeof p['angle'] === 'number' && Number.isFinite(p['angle']) && Object.keys(p).length === 1)
                    out.cameraPosition = { angle: norm360(p['angle']) };
                else
                    fail('INVALID_ARGUMENT', 'cameraPosition deve ser "auto" ou {angle}', 'cameraPosition');
            }
            if ('cameraDistance' in input)
                out.cameraDistance = input['cameraDistance'] === 'auto' ? 'auto' : oneOf('cameraDistance', ['near', 'medium', 'far']);
            if ('cameraFraming' in input)
                out.cameraFraming = input['cameraFraming'] === 'auto' ? 'auto' : oneOf('cameraFraming', ['wide', 'tight']);
            if ('focusTarget' in input)
                out.focusTarget = input['focusTarget'] === 'auto' ? 'auto' : oneOf('focusTarget', ['character', 'pair', 'group', 'scene']);
            return out;
        }
        /* ----------------- forma do modelo (dado externo é não confiável) ----------------- */
        const fin = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e6;
        const pointOk = (p) => isObj(p) && fin(p['x']) && fin(p['y']);
        const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
        /** Recusa qualquer folha cuja forma não permita validar nem desenhar com segurança. */
        function assertSheetShape(input) {
            const bad = (m) => fail('INVALID_MODEL', 'Modelo de cena inválido: ' + m);
            if (!isObj(input))
                bad('folha ausente');
            const sheet = input;
            if (!Number.isInteger(sheet['index']) || sheet['index'] < 0 || sheet['index'] >= CONST.MAX_SHEETS)
                bad('índice da folha');
            if (!Array.isArray(sheet['cells']) || sheet['cells'].length !== CONST.SHEET_CELLS)
                bad('a folha deve ter 9 células');
            sheet['cells'].forEach((cell, i) => {
                if (!isObj(cell))
                    bad('célula ' + i);
                const c = cell;
                if (c['index'] !== i || typeof c['id'] !== 'string')
                    bad('índice da célula ' + i);
                const chars = c['characters'];
                if (!Array.isArray(chars) || chars.length < 1 || chars.length > 8)
                    bad('manequins da célula ' + i);
                chars.forEach(ch => {
                    if (!isObj(ch) || typeof ch['id'] !== 'string' || !/^char-\d\d$/.test(ch['id']) || !Number.isInteger(ch['slot']) || !fin(ch['x']) || !fin(ch['y']) || !fin(ch['rotation']) || !fin(ch['gazeDirection'])
                        || typeof ch['contourColor'] !== 'string' || !COLOR_RE.test(ch['contourColor']) || typeof ch['fillColor'] !== 'string' || !COLOR_RE.test(ch['fillColor']))
                        bad('manequim da célula ' + i);
                });
                const cam = c['camera'], fr = c['framing'], fo = c['focus'];
                if (!isObj(cam) || !fin(cam['x']) || !fin(cam['y']) || !fin(cam['rotation']) || !['E1', 'E2', 'E3'].includes(String(cam['elevationLevel'])) || !['near', 'medium', 'far'].includes(String(cam['distanceLevel']))
                    || typeof cam['elevationColor'] !== 'string' || !COLOR_RE.test(cam['elevationColor']))
                    bad('câmera da célula ' + i);
                if (!isObj(fr) || !['wide', 'tight'].includes(String(fr['type'])) || !fin(fr['halfAngle']) || !pointOk(fr['lens']) || !Array.isArray(fr['polygon']) || fr['polygon'].length !== 4 || !fr['polygon'].every(pointOk)
                    || !Array.isArray(fr['fovBoundaries']) || fr['fovBoundaries'].length !== 2 || !isObj(fr['opticalAxis']) || !pointOk(fr['opticalAxis']['from']) || !pointOk(fr['opticalAxis']['to']))
                    bad('enquadramento da célula ' + i);
                if (!isObj(fo) || !Array.isArray(fo['targetIds']) || !fo['targetIds'].every(t => typeof t === 'string') || !fin(fo['x']) || !fin(fo['y']) || !['character', 'pair', 'group', 'scene'].includes(String(fo['targetType'])))
                    bad('foco da célula ' + i);
                if (!isObj(c['themeRule']) || typeof c['themeRule']['id'] !== 'string' || !isObj(c['sceneMetadata']) || !isObj(c['lockedParts']) || !isObj(c['salts']))
                    bad('metadados da célula ' + i);
            });
            return input;
        }
        kernel.provide('sceneBlockingCore', {
            assertSheetShape,
            CONST, PALETTE, ELEVATION, RETICLE_COLOR, hash, random, round2, norm360, dir, angleTo, angleDiff, dist, inConvex, normalizeConfig, defaultConfig, fail
        });
    }
});
