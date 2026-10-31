"use strict";
/* Scene Blocking — renderizador SVG determinístico. Só primitivas permitidas (g, rect, circle, line, polygon, path, metadata);
 * sem texto, script, imagem, filtro, estilo embutido nem recurso externo. O modelo vai dentro do SVG para o arquivo reabrir sozinho. */
definePlugin({
    id: 'scene-blocking-render',
    version: '1.0.0',
    needs: ['sceneBlockingCore'],
    provides: ['sceneBlockingRender'],
    uses: [],
    accepts: { sceneBlockingCore: '^1.0.0' },
    contractVersions: { sceneBlockingRender: '1.0.0' },
    setup: async function (kernel) {
        const core = await kernel.require('sceneBlockingCore');
        const { CONST: K, round2, fail } = core;
        const CELL = K['CELL'], SHEET = K['SHEET'];
        const n = (v) => String(round2(v));
        const pt = (p) => n(p.x) + ',' + n(p.y);
        const pad2 = (i) => String(i).padStart(2, '0');
        const INK = '#111827', LINE = '#374151', DIVIDER = '#000000';
        const DASH = '12 8';
        /* ------------------------------ símbolos ------------------------------ */
        /* Todos os manequins têm a mesma geometria; só mudam posição, rotação e cores. Frente = −y. */
        function mannequin(cid, ch) {
            return '<g id="' + cid + '-character-' + ch.id.slice(5) + '" data-vb-kind="character" data-vb-id="' + ch.id + '" data-vb-slot="' + ch.slot + '" data-vb-x="' + n(ch.x) + '" data-vb-y="' + n(ch.y) +
                '" data-vb-rotation="' + n(ch.rotation) + '" transform="translate(' + n(ch.x) + ' ' + n(ch.y) + ') rotate(' + n(ch.rotation) + ')">' +
                '<path d="M-13 -1H13A7 7 0 0 1 13 13H-13A7 7 0 0 1 -13 -1Z" fill="' + ch.fillColor + '" stroke="' + ch.contourColor + '" stroke-width="2" stroke-linejoin="round"/>' +
                '<circle cx="0" cy="0" r="11" fill="' + ch.fillColor + '" stroke="' + ch.contourColor + '" stroke-width="2"/>' +
                '<path d="M0 -28L-6 -17H6Z" fill="' + ch.contourColor + '" stroke="' + ch.contourColor + '" stroke-width="1" stroke-linejoin="round"/></g>';
        }
        /* Câmera: corpo, lente (frente), visor (traseira). Tamanho, forma e contorno nunca mudam; só o preenchimento (elevação). */
        function camera(cid, c) {
            return '<g id="' + cid + '-camera" data-vb-kind="camera" data-vb-elevation="' + c.elevationLevel + '" data-vb-distance="' + c.distanceLevel + '" data-vb-x="' + n(c.x) + '" data-vb-y="' + n(c.y) +
                '" data-vb-rotation="' + n(c.rotation) + '" transform="translate(' + n(c.x) + ' ' + n(c.y) + ') rotate(' + n(c.rotation) + ')">' +
                '<rect x="-18" y="-12" width="36" height="24" rx="3" fill="' + c.elevationColor + '" stroke="' + INK + '" stroke-width="2"/>' +
                '<path d="M-7 -12L-9 -20H9L7 -12Z" fill="#1F2937" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round"/>' +
                '<rect x="-8" y="12" width="16" height="4" rx="1" fill="' + INK + '"/></g>';
        }
        function reticle(cid, f) {
            return '<g id="' + cid + '-focus-reticle" data-vb-kind="focus-reticle" data-vb-target="' + f.targetType + '" data-vb-targets="' + f.targetIds.join(' ') + '" transform="translate(' + n(f.x) + ' ' + n(f.y) + ')" fill="none" stroke="' + f.reticleColor + '" stroke-width="1.5">' +
                '<circle r="14"/><circle r="6"/><circle r="1.5" fill="' + f.reticleColor + '"/><path d="M-24 0H-9M9 0H24M0 -24V-9M0 9V24" stroke-linecap="round"/></g>';
        }
        function cellGroup(cell) {
            const cid = 'cell-' + pad2(cell.index + 1), ox = (cell.index % 3) * CELL, oy = Math.floor(cell.index / 3) * CELL;
            const fr = cell.framing, dash = fr.lineStyle === 'dashed' ? ' stroke-dasharray="' + DASH + '"' : '';
            const stroke = ' fill="none" stroke="' + LINE + '" stroke-width="2"' + dash + ' stroke-linejoin="round"';
            return '<g id="' + cid + '" data-vb-kind="cell" data-vb-index="' + cell.index + '" data-vb-theme="' + cell.themeRule.id + '" data-vb-locked="' + (cell.locked ? 'true' : 'false') + '" transform="translate(' + ox + ' ' + oy + ')">' +
                '<g id="' + cid + '-capture-footprint" data-vb-kind="capture-footprint" data-vb-framing="' + fr.type + '"><polygon points="' + fr.polygon.map(pt).join(' ') + '" fill="none" stroke="none" pointer-events="all"/>' +
                /* só as bordas próxima e distante: os lados já são as linhas do campo de visão e, desenhados duas vezes com tracejados defasados, pareceriam contínuos */
                '<path d="M' + pt(fr.polygon[0]) + 'L' + pt(fr.polygon[1]) + 'M' + pt(fr.polygon[2]) + 'L' + pt(fr.polygon[3]) + '"' + stroke + ' stroke-linecap="round"/></g>' +
                '<g id="' + cid + '-field-of-view" data-vb-kind="field-of-view" data-vb-framing="' + fr.type + '">' +
                fr.fovBoundaries.map(l => '<line x1="' + n(l.from.x) + '" y1="' + n(l.from.y) + '" x2="' + n(l.to.x) + '" y2="' + n(l.to.y) + '"' + stroke + ' stroke-linecap="round"/>').join('') + '</g>' +
                '<g id="' + cid + '-optical-axis" data-vb-kind="optical-axis"><line x1="' + n(fr.opticalAxis.from.x) + '" y1="' + n(fr.opticalAxis.from.y) + '" x2="' + n(fr.opticalAxis.to.x) + '" y2="' + n(fr.opticalAxis.to.y) + '" stroke="#9CA3AF" stroke-width="1"/></g>' +
                '<g id="' + cid + '-characters" data-vb-kind="characters" data-vb-count="' + cell.characters.length + '">' + cell.characters.map(c => mannequin(cid, c)).join('') + '</g>' +
                camera(cid, cell.camera) + reticle(cid, cell.focus) + '</g>';
        }
        /* ------------------------------ cache incremental ------------------------------ */
        const createCache = () => ({ map: new Map(), hits: 0, misses: 0 });
        const cellKey = (cell) => {
            /* identidade do desenho: nada que não apareça no SVG (metadados, sal) entra na chave */
            return JSON.stringify([cell.index, cell.themeRule.id, cell.locked, cell.characters, cell.camera, cell.framing, cell.focus]);
        };
        function renderCell(cell, cache) {
            if (!cache)
                return cellGroup(cell);
            const key = cellKey(cell), hit = cache.map.get(key);
            if (hit !== undefined) {
                cache.hits++;
                return hit;
            }
            cache.misses++;
            const out = cellGroup(cell);
            cache.map.set(key, out);
            if (cache.map.size > 4000)
                cache.map.delete(cache.map.keys().next().value);
            return out;
        }
        /* --------------------------- documento e metadados --------------------------- */
        const safeJson = (v) => JSON.stringify(v).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
        function frame() {
            const lines = [CELL, CELL * 2].map(p => '<line x1="' + p + '" y1="0" x2="' + p + '" y2="' + SHEET + '"/><line x1="0" y1="' + p + '" x2="' + SHEET + '" y2="' + p + '"/>').join('');
            return '<g id="dividers" data-vb-kind="dividers" stroke="' + DIVIDER + '" stroke-width="3" fill="none">' + lines + '<rect x="0" y="0" width="' + SHEET + '" height="' + SHEET + '"/></g>';
        }
        function renderSheet(doc, cache) {
            const sheet = core.assertSheetShape(doc.sheet);
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + SHEET + ' ' + SHEET + '" width="' + SHEET + '" height="' + SHEET + '" data-vb-format="visualboard-scene-blocking" data-vb-engine="' + doc.engineVersion + '">' +
                '<metadata id="vb-scene-model">' + safeJson({ format: 'visualboard-scene-blocking-sheet', formatVersion: 1, engineVersion: doc.engineVersion, config: doc.config, sheet }) + '</metadata>' +
                '<g id="spritesheet" data-vb-kind="spritesheet" data-vb-sheet="' + sheet.index + '"><rect id="background" width="' + SHEET + '" height="' + SHEET + '" fill="#FFFFFF"/>' +
                sheet.cells.map(c => renderCell(c, cache)).join('') + frame() + '</g></svg>';
        }
        /** Célula avulsa: 600×600, com o desenho da própria célula e o modelo dela. A célula mantém o `translate` do SVG da folha zerado. */
        function renderCellDocument(cell) {
            const body = cellGroup(cell).replace(/ transform="translate\(\d+ \d+\)"/, ' transform="translate(0 0)"');
            return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + CELL + ' ' + CELL + '" width="' + CELL + '" height="' + CELL + '" data-vb-format="visualboard-scene-blocking-cell">' +
                '<metadata id="vb-scene-model">' + safeJson({ format: 'visualboard-scene-blocking-cell', formatVersion: 1, cell }) + '</metadata>' +
                '<rect width="' + CELL + '" height="' + CELL + '" fill="#FFFFFF"/>' + body + '<rect width="' + CELL + '" height="' + CELL + '" fill="none" stroke="' + DIVIDER + '" stroke-width="3"/></svg>';
        }
        function parseDocument(svg) {
            if (typeof svg !== 'string' || svg.length > 8 * 1024 * 1024)
                fail('INVALID_MODEL', 'SVG ausente ou grande demais');
            const m = /<metadata id="vb-scene-model">([\s\S]*?)<\/metadata>/.exec(svg);
            if (!m)
                fail('INVALID_MODEL', 'O SVG não traz um modelo do Scene Blocking');
            let data;
            try {
                data = JSON.parse(m[1]);
            }
            catch {
                return fail('INVALID_MODEL', 'Modelo embutido ilegível');
            }
            const d = data;
            if (!d || d['format'] !== 'visualboard-scene-blocking-sheet' || d['formatVersion'] !== 1)
                fail('INVALID_MODEL', 'Formato de modelo não reconhecido (esperado folha, versão 1)');
            const config = core.normalizeConfig(d['config']);
            return { format: 'visualboard-scene-blocking-sheet', formatVersion: 1, engineVersion: String(d['engineVersion']), config, sheet: core.assertSheetShape(d['sheet']) };
        }
        /* ---------------------------------- ZIP ---------------------------------- */
        let crcTable = null;
        function crc32(data) {
            if (!crcTable) {
                crcTable = new Uint32Array(256);
                for (let i = 0; i < 256; i++) {
                    let c = i;
                    for (let k = 0; k < 8; k++)
                        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
                    crcTable[i] = c >>> 0;
                }
            }
            let c = 0xffffffff;
            for (let i = 0; i < data.length; i++)
                c = crcTable[(c ^ data[i]) & 0xff] ^ (c >>> 8);
            return (c ^ 0xffffffff) >>> 0;
        }
        /** ZIP sem compressão (método 0), data fixa 1980-01-01: a mesma entrada dá sempre os mesmos bytes. */
        function zip(files) {
            const enc = new TextEncoder(), parts = [], central = [];
            let offset = 0;
            const seen = new Set();
            for (const f of files) {
                if (!/^[A-Za-z0-9_.\- ()]{1,120}$/.test(f.name) || f.name.startsWith('.') || seen.has(f.name))
                    fail('INVALID_ARGUMENT', 'Nome de arquivo inválido no ZIP: ' + f.name);
                seen.add(f.name);
                const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
                const lh = new DataView(new ArrayBuffer(30));
                lh.setUint32(0, 0x04034b50, true);
                lh.setUint16(4, 20, true);
                lh.setUint16(6, 0x0800, true);
                lh.setUint16(8, 0, true);
                lh.setUint16(10, 0, true);
                lh.setUint16(12, 0x21, true);
                lh.setUint32(14, crc, true);
                lh.setUint32(18, size, true);
                lh.setUint32(22, size, true);
                lh.setUint16(26, name.length, true);
                lh.setUint16(28, 0, true);
                parts.push(new Uint8Array(lh.buffer), name, f.data);
                const ch = new DataView(new ArrayBuffer(46));
                ch.setUint32(0, 0x02014b50, true);
                ch.setUint16(4, 20, true);
                ch.setUint16(6, 20, true);
                ch.setUint16(8, 0x0800, true);
                ch.setUint16(10, 0, true);
                ch.setUint16(12, 0, true);
                ch.setUint16(14, 0x21, true);
                ch.setUint32(16, crc, true);
                ch.setUint32(20, size, true);
                ch.setUint32(24, size, true);
                ch.setUint16(28, name.length, true);
                ch.setUint32(42, offset, true);
                central.push(new Uint8Array(ch.buffer), name);
                offset += 30 + name.length + size;
            }
            const cdSize = central.reduce((s, p) => s + p.length, 0);
            const end = new DataView(new ArrayBuffer(22));
            end.setUint32(0, 0x06054b50, true);
            end.setUint16(8, files.length, true);
            end.setUint16(10, files.length, true);
            end.setUint32(12, cdSize, true);
            end.setUint32(16, offset, true);
            const all = [...parts, ...central, new Uint8Array(end.buffer)], out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
            let at = 0;
            for (const p of all) {
                out.set(p, at);
                at += p.length;
            }
            return out;
        }
        kernel.provide('sceneBlockingRender', { createCache, cellKey, renderCell, renderSheet, renderCellDocument, parseDocument, zip, crc32 });
    }
});
