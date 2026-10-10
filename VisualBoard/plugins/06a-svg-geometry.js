"use strict";
/* Browser SVG geometry adapter. All output is normalized to viewBox origin (0,0). */
definePlugin({
    id: 'svg-geometry',
    version: '1.0.0',
    needs: [],
    provides: ['svgGeometry'],
    uses: [],
    accepts: {},
    contractVersions: { svgGeometry: '1.0.0' },
    setup: async function (kernel) {
        const NS = 'http://www.w3.org/2000/svg';
        const I = [1, 0, 0, 1, 0, 0];
        const EPS = 1e-7;
        function mul(l, r) {
            return [
                l[0] * r[0] + l[2] * r[1], l[1] * r[0] + l[3] * r[1],
                l[0] * r[2] + l[2] * r[3], l[1] * r[2] + l[3] * r[3],
                l[0] * r[4] + l[2] * r[5] + l[4], l[1] * r[4] + l[3] * r[5] + l[5]
            ];
        }
        function point(m, p) {
            return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
        }
        function parseNumbers(value) {
            const input = String(value || '').trim();
            if (!input)
                return [];
            const rx = /[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g;
            const nums = [];
            let last = 0, m;
            while ((m = rx.exec(input))) {
                if (input.slice(last, m.index).replace(/[\s,]/g, ''))
                    throw Error('Invalid numeric SVG data: ' + input);
                nums.push(Number(m[0]));
                last = rx.lastIndex;
            }
            if (input.slice(last).replace(/[\s,]/g, ''))
                throw Error('Invalid numeric SVG data: ' + input);
            if (nums.some(n => !Number.isFinite(n)))
                throw Error('Non-finite SVG number');
            return nums;
        }
        function transform(src) {
            if (!src || !String(src).trim())
                return I.slice();
            const text = String(src);
            const rx = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
            let cursor = 0, matrix = I.slice(), m;
            while ((m = rx.exec(text))) {
                if (text.slice(cursor, m.index).trim().replace(/,/g, ''))
                    throw Error('Invalid SVG transform');
                cursor = rx.lastIndex;
                const a = parseNumbers(m[2]);
                let t;
                const n = m[1];
                switch (n) {
                    case 'matrix':
                        if (a.length !== 6)
                            throw Error('matrix requires six numbers');
                        t = a;
                        break;
                    case 'translate':
                        if (a.length < 1 || a.length > 2)
                            throw Error('translate requires 1–2 numbers');
                        t = [1, 0, 0, 1, a[0], a[1] || 0];
                        break;
                    case 'scale':
                        if (a.length < 1 || a.length > 2)
                            throw Error('scale requires 1–2 numbers');
                        t = [a[0], 0, 0, a.length === 2 ? a[1] : a[0], 0, 0];
                        break;
                    case 'rotate': {
                        if (a.length !== 1 && a.length !== 3)
                            throw Error('rotate requires 1 or 3 numbers');
                        const angle = a[0] * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
                        t = [c, s, -s, c, 0, 0];
                        if (a.length === 3)
                            t = mul(mul([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
                        break;
                    }
                    case 'skewX':
                    case 'skewY': {
                        if (a.length !== 1)
                            throw Error(n + ' requires one number');
                        const v = Math.tan(a[0] * Math.PI / 180);
                        t = n === 'skewX' ? [1, 0, v, 1, 0, 0] : [1, v, 0, 1, 0, 0];
                        break;
                    }
                    default: throw Error('Unsupported SVG transform: ' + n);
                }
                // SVG transform list is applied in text order via matrix composition.
                matrix = mul(matrix, t);
            }
            if (text.slice(cursor).trim().replace(/,/g, ''))
                throw Error('Invalid SVG transform suffix');
            return matrix;
        }
        function elementMatrix(el, root, minX, minY) {
            let chain = [], node = el;
            while (node && node.nodeType === 1) {
                chain.unshift(node);
                if (node === root)
                    break;
                node = node.parentNode;
            }
            if (chain[0] !== root)
                throw Error('SVG shape is outside the root');
            let result = [1, 0, 0, 1, -minX, -minY];
            for (const e of chain)
                if (e.hasAttribute('transform'))
                    result = mul(result, transform(e.getAttribute('transform')));
            return result;
        }
        function isExcluded(el, root) {
            let node = el;
            const excluded = new Set(['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'linearGradient', 'radialGradient', 'filter']);
            while (node && node.nodeType === 1) {
                if (excluded.has(node.localName))
                    return true;
                const style = node.getAttribute('style') || '';
                if (node.getAttribute('display') === 'none' || /display\s*:\s*none/i.test(style))
                    return true;
                if (node === root)
                    break;
                node = node.parentNode;
            }
            return false;
        }
        function shapePath(el) {
            const name = el.localName;
            if (name === 'path')
                return el.getAttribute('d') || '';
            if (name === 'polygon') {
                const a = parseNumbers(el.getAttribute('points'));
                if (a.length < 6 || a.length % 2)
                    throw Error('Polygon requires 3 points');
                let d = 'M' + a[0] + ' ' + a[1];
                for (let i = 2; i < a.length; i += 2)
                    d += ' L' + a[i] + ' ' + a[i + 1];
                return d + ' Z';
            }
            if (name === 'rect') {
                function num(key, fallback) {
                    const raw = el.getAttribute(key);
                    if (raw === null)
                        return fallback;
                    const a = parseNumbers(raw);
                    if (a.length !== 1)
                        throw Error('Invalid ' + key + ' in rectangle');
                    return a[0];
                }
                const x = num('x', 0), y = num('y', 0), w = num('width', 0), h = num('height', 0);
                if (w <= 0 || h <= 0)
                    return '';
                const attrRx = el.hasAttribute('rx'), attrRy = el.hasAttribute('ry');
                const rx = Math.max(0, Math.min(w / 2, num('rx', attrRy ? num('ry', 0) : 0)));
                const ry = Math.max(0, Math.min(h / 2, num('ry', attrRx ? num('rx', 0) : 0)));
                if (!rx || !ry)
                    return 'M' + x + ' ' + y + ' H' + (x + w) + ' V' + (y + h) + ' H' + x + ' Z';
                return 'M' + (x + rx) + ' ' + y + ' H' + (x + w - rx) +
                    ' A' + rx + ' ' + ry + ' 0 0 1 ' + (x + w) + ' ' + (y + ry) +
                    ' V' + (y + h - ry) + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (x + w - rx) + ' ' + (y + h) +
                    ' H' + (x + rx) + ' A' + rx + ' ' + ry + ' 0 0 1 ' + x + ' ' + (y + h - ry) +
                    ' V' + (y + ry) + ' A' + rx + ' ' + ry + ' 0 0 1 ' + (x + rx) + ' ' + y + ' Z';
            }
            return '';
        }
        function splitClosedContours(d) {
            if (typeof d !== 'string' || !d.trim())
                return null;
            const lexical = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g;
            const tokens = [];
            let match, last = 0;
            while ((match = lexical.exec(d))) {
                if (d.slice(last, match.index).replace(/[\s,]/g, ''))
                    return null;
                tokens.push(match[0]);
                last = lexical.lastIndex;
            }
            if (d.slice(last).replace(/[\s,]/g, ''))
                return null;
            if (!tokens.length || !/[Mm]/.test(tokens[0]))
                return null;
            let chunks = [], parts = [], current = '', closed = false;
            for (const token of tokens) {
                if (/^[Mm]$/.test(token)) {
                    if (current) {
                        if (!closed)
                            return null;
                        chunks.push(current);
                    }
                    current = token;
                    closed = false;
                }
                else {
                    if (!current || closed)
                        return null;
                    current += ' ' + token;
                    if (/^[Zz]$/.test(token))
                        closed = true;
                }
            }
            if (!closed)
                return null;
            chunks.push(current);
            return chunks;
        }
        function area(points) {
            let twice = 0;
            for (let i = 0; i < points.length; i++) {
                const a = points[i], b = points[(i + 1) % points.length];
                twice += a.x * b.y - b.x * a.y;
            }
            return twice / 2;
        }
        function chordDistance(p, a, b) {
            const dx = b.x - a.x, dy = b.y - a.y;
            const l = Math.hypot(dx, dy);
            return l < EPS ? Math.hypot(p.x - a.x, p.y - a.y) :
                Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / l;
        }
        function flattenContour(d, matrix, opts) {
            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', d);
            let len;
            try {
                len = path.getTotalLength();
            }
            catch (e) {
                throw Error('Invalid SVG path: ' + e.message);
            }
            if (!Number.isFinite(len) || len <= EPS)
                throw Error('Degenerate SVG path');
            const tolerance = Math.max(.05, Math.min(3, (opts && opts.tolerance) || .5));
            const limit = Math.max(128, Math.min(16384, (opts && opts.maxPoints) || 8192));
            const transformed = (t) => {
                const p = path.getPointAtLength(Math.max(0, Math.min(len, t)));
                return point(matrix, { x: p.x, y: p.y });
            };
            const pts = [], segs = 8;
            function append(p) {
                if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
                    throw Error('Non-finite SVG path');
                const prev = pts[pts.length - 1];
                if (!prev || Math.hypot(p.x - prev.x, p.y - prev.y) > EPS)
                    pts.push(p);
                if (pts.length > limit)
                    throw Error('SVG path exceeds sampling safety limit');
            }
            function step(t0, p0, t1, p1, depth) {
                const quarter = transformed(t0 + (t1 - t0) * .25);
                const mid = transformed((t0 + t1) / 2);
                const threeQuarter = transformed(t0 + (t1 - t0) * .75);
                const error = Math.max(chordDistance(quarter, p0, p1), chordDistance(mid, p0, p1), chordDistance(threeQuarter, p0, p1));
                if (error > tolerance) {
                    if (depth >= 16 || pts.length >= limit - 5) {
                        throw Error('SVG curve exceeds sampling precision/safety limits');
                    }
                    step(t0, p0, (t0 + t1) / 2, mid, depth + 1);
                    step((t0 + t1) / 2, mid, t1, p1, depth + 1);
                }
                else
                    append(p1);
            }
            append(transformed(0));
            for (let i = 0; i < segs; i++) {
                const a = len * i / segs, b = len * (i + 1) / segs;
                step(a, transformed(a), b, transformed(b), 0);
            }
            if (pts.length > 1 && Math.hypot(pts[0].x - pts.at(-1).x, pts[0].y - pts.at(-1).y) < EPS)
                pts.pop();
            if (pts.length < 3 || Math.abs(area(pts)) < EPS)
                throw Error('Degenerate SVG contour');
            return pts;
        }
        function flattenPath(d, matrix, options) {
            const contours = splitClosedContours(d);
            if (!contours || !contours.length)
                throw Error('All SVG contours must be closed');
            return contours.map(path => flattenContour(path, matrix || I, options));
        }
        function winding(pt, points) {
            let total = 0;
            for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
                const a = points[j], b = points[i], cross = (b.x - a.x) * (pt.y - a.y) - (pt.x - a.x) * (b.y - a.y);
                if (Math.abs(cross) < EPS &&
                    pt.x >= Math.min(a.x, b.x) - EPS && pt.x <= Math.max(a.x, b.x) + EPS &&
                    pt.y >= Math.min(a.y, b.y) - EPS && pt.y <= Math.max(a.y, b.y) + EPS)
                    return Infinity;
                if (a.y <= pt.y && b.y > pt.y && cross > 0)
                    total++;
                if (a.y > pt.y && b.y <= pt.y && cross < 0)
                    total--;
            }
            return total;
        }
        function contains(panel, x, y) {
            const loops = panel.contours || [panel.points];
            let sum = 0, parity = 0;
            for (const points of loops) {
                const w = winding({ x, y }, points);
                if (w === Infinity)
                    return true;
                sum += w;
                parity += Math.abs(w) % 2;
            }
            return panel.fillRule === 'evenodd' ? parity % 2 === 1 : sum !== 0;
        }
        function serializeVector(panel) {
            if (panel.vector && typeof panel.vector.d === 'string') {
                const m = panel.vector.matrix || I;
                if (!Array.isArray(m) || m.length !== 6 || m.some(v => !Number.isFinite(v)))
                    throw Error('Invalid SVG vector matrix');
                return {
                    d: panel.vector.d,
                    transform: 'matrix(' + m.map(n => Number(n).toPrecision(12)).join(' ') + ')',
                    fillRule: panel.vector.fillRule || panel.fillRule || 'nonzero'
                };
            }
            const loops = panel.contours || [panel.points];
            return { d: loops.map(points => 'M' + points.map(p => p.x + ' ' + p.y).join(' L') + ' Z').join(' '),
                transform: '', fillRule: panel.fillRule || 'nonzero' };
        }
        function parseSvg(svgText, options) {
            if (typeof svgText !== 'string' || !svgText.trim())
                throw Error('Empty SVG text');
            if (svgText.length > 4 * 1024 * 1024)
                throw Error('SVG exceeds 4 MB safety limit');
            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, 'image/svg+xml');
            const error = doc.querySelector('parsererror');
            if (error)
                throw Error('Invalid SVG: ' + (error.textContent || '').slice(0, 150));
            const root = doc.documentElement;
            if (!root || root.localName !== 'svg')
                throw Error('SVG root required');
            const vb = root.getAttribute('viewBox');
            let minX = 0, minY = 0, width = 0, height = 0;
            if (vb) {
                const a = parseNumbers(vb);
                if (a.length !== 4 || a[2] <= 0 || a[3] <= 0)
                    throw Error('Invalid SVG viewBox');
                [minX, minY, width, height] = a;
            }
            else {
                const num = (key) => {
                    const raw = root.getAttribute(key);
                    if (!raw || !/^[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?(?:px)?$/.test(raw.trim()))
                        return NaN;
                    return parseFloat(raw);
                };
                width = num('width');
                height = num('height');
            }
            if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
                throw Error('SVG needs a positive viewBox or pixel width/height');
            const panels = [];
            let index = 0;
            const warnings = [];
            const shapes = root.querySelectorAll('rect,polygon,path');
            if (shapes.length > 2000)
                throw Error('SVG contains too many shapes');
            shapes.forEach(el => {
                if (isExcluded(el, root))
                    return;
                const d = shapePath(el);
                if (!d)
                    return;
                const matrix = elementMatrix(el, root, minX, minY);
                if (Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]) < EPS)
                    throw Error('SVG transformation collapses a panel');
                let fillRule = 'nonzero', node = el;
                while (node && node.nodeType === 1) {
                    const own = node.getAttribute('fill-rule') || ((node.getAttribute('style') || '').match(/(?:^|;)\s*fill-rule\s*:\s*(evenodd|nonzero)/i) || [])[1];
                    if (own) {
                        fillRule = String(own).trim().toLowerCase();
                        break;
                    }
                    if (node === root)
                        break;
                    node = node.parentNode;
                }
                if (!['nonzero', 'evenodd'].includes(fillRule))
                    throw Error('Invalid SVG fill-rule');
                const contours = flattenPath(d, matrix, options);
                let largest = 0;
                for (let i = 1; i < contours.length; i++)
                    if (Math.abs(area(contours[i])) > Math.abs(area(contours[largest])))
                        largest = i;
                index++;
                panels.push({ id: 'p' + index, points: contours[largest],
                    contours, fillRule,
                    vector: { d, matrix, fillRule, sourceElement: el.localName } });
            });
            if (!panels.length)
                throw Error('No closed <rect>, <polygon> or <path> panels in SVG');
            return { width, height, panels, svgSource: svgText,
                viewBox: { minX, minY, width, height }, warnings };
        }
        function parsePathToPoints(d, options) {
            try {
                const loops = flattenPath(d, I, options);
                return loops.reduce((max, c) => Math.abs(area(c)) > Math.abs(area(max)) ? c : max, loops[0]);
            }
            catch (err) {
                return null;
            }
        }
        kernel.provide('svgGeometry', {
            parseSvg, parsePathToPoints, flattenPath, transform, elementMatrix, contains, serializeVector
        });
    }
});
