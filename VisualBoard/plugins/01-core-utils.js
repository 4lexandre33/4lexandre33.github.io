"use strict";
/* TS-009: strict utility plugin, classic-script ABI unchanged. */
definePlugin({
    id: 'core-utils',
    version: '1.0.0',
    needs: [],
    provides: ['utils'],
    uses: [],
    accepts: {},
    contractVersions: { 'utils': '1.0.0' },
    setup: function (kernel) {
        function uid(prefix) {
            return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
                Math.random().toString(36).slice(2, 9);
        }
        function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
        function debounce(fn, wait) {
            let t = null;
            function w(...args) {
                const a = args;
                if (t)
                    clearTimeout(t);
                t = setTimeout(() => { t = null; fn.apply(null, a); }, wait);
            }
            w.cancel = () => { if (t) {
                clearTimeout(t);
                t = null;
            } };
            return w;
        }
        function deepClone(v) { return JSON.parse(JSON.stringify(v)); }
        function escapeHtml(s) {
            return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c));
        }
        function baseName(name) {
            const n = String(name || 'image').split(/[\\/]/).pop();
            const dot = n.lastIndexOf('.');
            return dot > 0 ? n.slice(0, dot) : n;
        }
        function getImageSize(url) {
            return new Promise(resolve => {
                const img = new Image();
                img.onload = () => resolve({
                    width: img.naturalWidth || 400,
                    height: img.naturalHeight || 300
                });
                img.onerror = () => resolve({ width: 400, height: 300 });
                img.src = url;
            });
        }
        function blobToDataURL(blob) {
            return new Promise((res, rej) => {
                const fr = new FileReader();
                fr.onload = () => res(fr.result);
                fr.onerror = () => rej(fr.error || new Error('read error'));
                fr.readAsDataURL(blob);
            });
        }
        async function dataURLToBlob(dataUrl) {
            if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:'))
                throw Error('Only local data URLs may be decoded');
            const comma = dataUrl.indexOf(',');
            if (comma < 5)
                throw Error('Malformed data URL');
            const header = dataUrl.slice(5, comma);
            const payload = dataUrl.slice(comma + 1);
            const isBase64 = /;base64$/i.test(header);
            const mediaType = header.replace(/;base64$/i, '') || 'text/plain;charset=US-ASCII';
            const octets = isBase64
                ? atob(payload)
                : payload.replace(/%([0-9a-fA-F]{2})/g, (_match, hex) => String.fromCharCode(parseInt(hex, 16)));
            const bytes = Uint8Array.from(octets, character => character.charCodeAt(0));
            return new Blob([bytes], { type: mediaType });
        }
        function downloadText(filename, text, mime) {
            const blob = new Blob([text], { type: mime || 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 4000);
        }
        const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i;
        function isSupportedImageFile(f) {
            if (!f)
                return false;
            if (f.type && f.type.indexOf('image/') === 0)
                return true;
            return IMAGE_EXT_RE.test(f.name || '');
        }
        kernel.provide('utils', {
            uid, clamp, debounce, deepClone, escapeHtml, baseName,
            getImageSize, blobToDataURL, dataURLToBlob, downloadText,
            isSupportedImageFile
        });
    }
});
