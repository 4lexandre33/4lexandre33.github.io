"use strict";
/**
 * TS-004 — Browser bootstrap. Keep this file a classic script (module: none).
 * The microkernel owns plugin loading, dependency order and diagnostics.
 */
window.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.NVB_KERNEL.boot(window.NVB_MANIFEST);
    }
    catch (err) {
        console.error('[nvb] boot failed', err);
    }
});
