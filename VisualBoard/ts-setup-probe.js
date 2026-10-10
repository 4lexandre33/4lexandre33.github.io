"use strict";
/**
 * TS-002 compiler proof only. This file is not referenced by index.html or
 * kernel/nvb.manifest.js. Future TS migration tasks will replace the probe.
 * A namespace deliberately emits a browser-compatible classic script.
 */
var VisualBoardTypeScriptSetup;
(function (VisualBoardTypeScriptSetup) {
    function add(left, right) {
        return left + right;
    }
    VisualBoardTypeScriptSetup.add = add;
    function describe(value) {
        return typeof value === "string" ? value : "unknown";
    }
    VisualBoardTypeScriptSetup.describe = describe;
})(VisualBoardTypeScriptSetup || (VisualBoardTypeScriptSetup = {}));
