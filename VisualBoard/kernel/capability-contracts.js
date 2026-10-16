"use strict";
/* Contract registry: stable public capability ABI, independent from plugin versions.
 * Empty methods are legitimate marker capabilities. Descriptors are metadata;
 * the kernel validates callable surfaces and compatible semantic versions.
 */
(function (global) {
    'use strict';
    const api = {
        "utils": "uid clamp debounce deepClone escapeHtml baseName getImageSize blobToDataURL dataURLToBlob downloadText isSupportedImageFile",
        "storage": "open put get del clear keys isAvailable",
        "projectFormat": "normalize prepare envelope",
        "storage-fs": "isAvailable hasHandle getHandleName pickNew pickExisting loadFromHandle put get del clear keys flushNow scheduleFlush detach",
        "backend": "setBackend isAvailable mode raw put get del clear keys",
        "storage-fs-dir": "isAvailable hasHandle getFolderName pickDirectory loadFromDirectory put get del clear keys flushNow scheduleFlush saveAll detach writeSvgFile deleteSvgFile readSvgFile listSvgFiles",
        "storage-ls": "isAvailable loadFromStorage detach usageBytes saveAll put get del clear keys flushNow scheduleFlush",
        "state": "getCurrentBoard getBoard getAsset getInstance getPackage currentInstances nextZIndex uniqueAssetName uniquePackageName uniqueBoardName sortedPackages",
        "documentSnapshot": "serialize capture restore equal",
        "history": "snapshot push transaction undo redo clear canUndo canRedo isRestoring",
        "camera": "apply panTo zoomAt zoomByFactor setCentered reset screenToWorld worldToScreen offset clampCamera fitAll fitSelection fitBounds bounds",
        "assets": "getUrl hasUrl importFiles createFromFile deleteAsset ensureDefaultPackage restoreFromStorage restoreHistoryBlobs",
        "svgGeometry": "parseSvg parsePathToPoints flattenPath transform elementMatrix contains serializeVector",
        "panelSets": "parseSvg parsePathToPoints getOriginalSvg downloadSvg thumbSvg create get list rename remove promptImport promptPick syncAll",
        "panelTemplates": "list createFromTemplate flowPosition focusPage promptPick pickAndCreate",
        "packages": "create rename remove move assetsOf",
        "boards": "create getBoard current navigate navigateUp rename remove pathOf depthOf list duplicate move update",
        "instances": "addImage addBoard removeSelection duplicateSelection reorder rotateSelection restoreAspect nudge copySelection pasteClipboard selectByIds clearSelection updateById removeById duplicateById reorderById align distribute",
        "panelMigration": "plan migrate recover validatePage",
        "mangaPage": "addToBoard duplicate changePanelSet planPanelSetChange recoverUnassignedPanel getUnassignedPanels validatePage promptChangePanelSet getPanelSet getPanel addLayer insertLayerAt addOverlayLayer removeLayer updateLayer reorderLayer reorderLayerTo getFocus setFocus clearFocus getActivePanelId hitTestMangaPage hitTestPanel tryDrop",
        "mangaEdit": "isActive isEditingPanel getMode getSelectedLayerId enter exit setSelectedLayer hitTestLayer getPanelBounds instanceById",
        "renderer": "render updateEl updateSelection updateHud updateEmptyState",
        "minimap": "draw",
        "rendererManga": "createEl updateEl",
        "interaction": "",
        "exportImport": "exportProject importProjectFile newProject updateProjectMeta",
        "mangaExportPreflight": "validate",
        "mangaExport": "validateExport renderPageToBlob renderPageToCanvas exportPng exportChapterPdf exportSelectionAsPdf exportWholeBoardAsPdf collectMangaPagesOnCurrentBoard",
        "imageProcessors": "register list resolve plan",
        "imageCanvasProcessor": "",
        "imageCommands": "plan execute apply process",
        "ui.dialogs": "toast confirm prompt openPreview closePreview",
        "ui.shell": "renderNav renderTopCrumb renderProjectName updateHistoryButtons getLayout setPanel setWorkspaceMode",
        "ui.library": "renderFilter renderGrid",
        "ui.pageFormats": "render",
        "ui.packages": "render",
        "ui.canvas": "",
        "contextMenu": "show close",
        "panelInspector": "render",
        "ui.storage": "render",
        "ui.accessibility": "announce sync",
        "ui.imageOperations": "open close",
        "debug": "render",
        "automationContract": "describe listTools getTool",
        "automation": "getStatus isEnabled enable disable setGrants setConfirmHandler validate execute readResource getAuditLog pollEvents subscribe cancel isLocked bridgeState bridgeConnect bridgeAuthorize bridgeRefuse bridgeRevoke bridgeDisconnect openPanel closePanel",
        "app": "saveNow backupNow scheduleSave boot switchBackend isPersistent recoveryInfo restoreRecovery"
    };
    const properties = {
        "state": {
            "data": "object"
        },
        "camera": {
            "data": "object",
            "WORLD_MIN": "number",
            "WORLD_MAX": "number",
            "WORLD_SIZE": "number",
            "MIN_ZOOM": "number",
            "MAX_ZOOM": "number"
        },
        "history": {
            "depth": "number"
        },
        "assets": {
            "urls": "map",
            "blobs": "map",
            "missing": "set"
        },
        "renderer": {
            "els": "map"
        },
        "app": {
            "mode": "string",
            "folderName": "nullable",
            "fileName": "nullable"
        }
    };
    const detail = {
        "history.snapshot": {
            "params": [],
            "returns": "object"
        },
        "history.undo": {
            "params": [],
            "returns": "promise<boolean>"
        },
        "history.redo": {
            "params": [],
            "returns": "promise<boolean>"
        },
        "history.transaction": {
            "params": [
                "label:string",
                "action:function"
            ],
            "returns": "promise<any>"
        },
        "history.push": {
            "params": [
                "snapshot:object"
            ],
            "returns": "boolean"
        },
        "panelSets.parseSvg": {
            "params": [
                "svg:string"
            ],
            "returns": "object"
        },
        "panelSets.parsePathToPoints": {
            "params": [
                "path:string"
            ],
            "returns": "array|null"
        },
        "panelSets.create": {
            "params": [
                "data:object",
                "name?:string"
            ],
            "returns": "object"
        },
        "mangaPage.addLayer": {
            "params": [
                "page:object",
                "panelId:string",
                "assetId:string",
                "options?:object"
            ],
            "returns": "promise<object|null>"
        },
        "mangaPage.removeLayer": {
            "params": [
                "page:object",
                "panelId:string",
                "layerId:string"
            ],
            "returns": "promise<void>"
        },
        "assets.importFiles": {
            "params": [
                "files:object",
                "packageId?:string"
            ],
            "returns": "promise<number>"
        },
        "assets.deleteAsset": {
            "params": [
                "id:string"
            ],
            "returns": "promise<void>"
        },
        "boards.create": {
            "params": [
                "name:string",
                "parentId?:string"
            ],
            "returns": "string"
        },
        "camera.screenToWorld": {
            "params": [
                "x:number",
                "y:number"
            ],
            "returns": "object"
        },
        "camera.worldToScreen": {
            "params": [
                "x:number",
                "y:number"
            ],
            "returns": "object"
        },
        "backend.put": {
            "params": [
                "store:string",
                "key:string",
                "value:any"
            ],
            "returns": "promise<void>"
        },
        "backend.get": {
            "params": [
                "store:string",
                "key:string"
            ],
            "returns": "promise<any>"
        },
        "mangaExport.renderPageToCanvas": {
            "params": [
                "page:object",
                "options?:object"
            ],
            "returns": "promise<object>"
        }
    };
    Object.assign(detail, {
        "utils.uid": {
            "params": [
                "prefix:string"
            ],
            "returns": "string"
        },
        "utils.clamp": {
            "params": [
                "value:number",
                "min:number",
                "max:number"
            ],
            "returns": "number"
        },
        "utils.baseName": {
            "params": [
                "filename:string"
            ],
            "returns": "string"
        },
        "utils.escapeHtml": {
            "params": [
                "content:string"
            ],
            "returns": "string"
        },
        "utils.isSupportedImageFile": {
            "params": [
                "file:object"
            ],
            "returns": "boolean"
        },
        "state.getCurrentBoard": {
            "params": [],
            "returns": "object|null"
        },
        "state.getBoard": {
            "params": [
                "boardId:string"
            ],
            "returns": "object|null"
        },
        "state.getAsset": {
            "params": [
                "assetId:string"
            ],
            "returns": "object|null"
        },
        "state.getPackage": {
            "params": [
                "packageId:string"
            ],
            "returns": "object|null"
        },
        "state.currentInstances": {
            "params": [],
            "returns": "array"
        },
        "state.sortedPackages": {
            "params": [],
            "returns": "array"
        },
        "camera.zoomAt": {
            "params": [
                "x:number",
                "y:number",
                "zoom:number"
            ],
            "returns": "void"
        },
        "camera.zoomByFactor": {
            "params": [
                "factor:number"
            ],
            "returns": "void"
        },
        "camera.setCentered": {
            "params": [
                "zoom:number"
            ],
            "returns": "void"
        },
        "camera.reset": {
            "params": [],
            "returns": "void"
        },
        "camera.fitAll": {
            "params": [],
            "returns": "void"
        },
        "camera.fitSelection": {
            "params": [],
            "returns": "void"
        },
        "history.clear": {
            "params": [],
            "returns": "void"
        },
        "history.canUndo": {
            "params": [],
            "returns": "boolean"
        },
        "history.canRedo": {
            "params": [],
            "returns": "boolean"
        },
        "history.isRestoring": {
            "params": [],
            "returns": "boolean"
        },
        "history.transaction": {
            "params": [
                "label:string|function",
                "action?:function"
            ],
            "returns": "promise<any>"
        },
        "assets.hasUrl": {
            "params": [
                "assetId:string"
            ],
            "returns": "boolean"
        },
        "assets.getUrl": {
            "params": [
                "assetId:string"
            ],
            "returns": "any"
        },
        "assets.createFromFile": {
            "params": [
                "file:object",
                "packageId?:string"
            ],
            "returns": "promise<object>"
        },
        "assets.restoreHistoryBlobs": {
            "params": [
                "blobs:map",
                "beforeAssets:array",
                "afterAssets:array"
            ],
            "returns": "promise<void>"
        },
        "panelSets.get": {
            "params": [
                "panelSetId:string"
            ],
            "returns": "object|null"
        },
        "panelSets.list": {
            "params": [],
            "returns": "array"
        },
        "panelSets.rename": {
            "params": [
                "panelSetId:string",
                "name:string"
            ],
            "returns": "void"
        },
        "panelSets.remove": {
            "params": [
                "panelSetId:string"
            ],
            "returns": "void"
        },
        "boards.getBoard": {
            "params": [
                "boardId:string"
            ],
            "returns": "object|null"
        },
        "boards.pathOf": {
            "params": [
                "boardId:string"
            ],
            "returns": "array"
        },
        "boards.depthOf": {
            "params": [
                "boardId:string"
            ],
            "returns": "number"
        },
        "boards.navigate": {
            "params": [
                "boardId:string"
            ],
            "returns": "void"
        },
        "boards.navigateUp": {
            "params": [],
            "returns": "void"
        },
        "boards.rename": {
            "params": [
                "boardId:string",
                "name:string"
            ],
            "returns": "void"
        },
        "boards.remove": {
            "params": [
                "boardId:string"
            ],
            "returns": "promise<void>"
        },
        "boards.create": {
            "params": [
                "name?:string",
                "parentId?:string"
            ],
            "returns": "string"
        },
        "instances.addImage": {
            "params": [
                "assetId:string",
                "worldX:number",
                "worldY:number"
            ],
            "returns": "promise<object|null>"
        },
        "instances.addBoard": {
            "params": [
                "boardId:string",
                "worldX:number",
                "worldY:number"
            ],
            "returns": "promise<object|null>"
        },
        "instances.nudge": {
            "params": [
                "dx:number",
                "dy:number"
            ],
            "returns": "promise<void>"
        },
        "instances.copySelection": {
            "params": [],
            "returns": "void"
        },
        "instances.pasteClipboard": {
            "params": [],
            "returns": "promise<void>"
        },
        "mangaPage.addToBoard": {
            "params": [
                "panelSetId:string",
                "worldX:number",
                "worldY:number"
            ],
            "returns": "promise<object|null>"
        },
        "mangaPage.changePanelSet": {
            "params": [
                "page:object",
                "panelSetId:string"
            ],
            "returns": "promise<boolean>"
        },
        "mangaPage.updateLayer": {
            "params": [
                "page:object",
                "panelId:string",
                "layerId:string",
                "patch:object"
            ],
            "returns": "promise<void>"
        },
        "mangaPage.reorderLayer": {
            "params": [
                "page:object",
                "panelId:string",
                "layerId:string",
                "mode:string"
            ],
            "returns": "promise<void>"
        },
        "mangaPage.reorderLayerTo": {
            "params": [
                "page:object",
                "panelId:string",
                "layerId:string",
                "targetId:string",
                "position:string"
            ],
            "returns": "promise<boolean>"
        },
        "mangaPage.getFocus": {
            "params": [],
            "returns": "object"
        },
        "mangaPage.hitTestPanel": {
            "params": [
                "page:object",
                "x:number",
                "y:number"
            ],
            "returns": "any"
        },
        "mangaExport.exportPng": {
            "params": [
                "page:object",
                "options?:object"
            ],
            "returns": "promise<object>"
        },
        "ui.dialogs.toast": {
            "params": [
                "message:string",
                "kind?:string"
            ],
            "returns": "void"
        },
        "ui.dialogs.confirm": {
            "params": [
                "options:object"
            ],
            "returns": "promise<boolean>"
        },
        "ui.dialogs.prompt": {
            "params": [
                "options:object"
            ],
            "returns": "promise<any>"
        },
        "ui.dialogs.openPreview": {
            "params": [
                "asset:object"
            ],
            "returns": "promise<void>"
        },
        "ui.dialogs.closePreview": {
            "params": [],
            "returns": "void"
        },
        "contextMenu.close": {
            "params": [],
            "returns": "void"
        },
        "app.isPersistent": {
            "params": [],
            "returns": "boolean"
        },
        "app.saveNow": {
            "params": [],
            "returns": "promise<void>"
        },
        "app.switchBackend": {
            "params": [
                "target:string"
            ],
            "returns": "promise<any>"
        }
    });
    Object.assign(detail, {
        'panelMigration.plan': {
            params: ['page:object', 'oldSet:object', 'newSet:object', 'options?:object'],
            returns: 'object'
        },
        'panelMigration.migrate': {
            params: ['page:object', 'oldSet:object', 'newSet:object', 'options?:object', 'assets?:array'],
            returns: 'object'
        },
        'panelMigration.recover': {
            params: ['page:object', 'set:object', 'archiveId:string', 'panelId:string', 'assets?:array'],
            returns: 'object|null'
        },
        'panelMigration.validatePage': {
            params: ['page:object', 'set:object', 'assets?:array'],
            returns: 'object'
        },
        'mangaPage.planPanelSetChange': {
            params: ['page:object', 'panelSetId:string', 'options?:object'], returns: 'object'
        },
        'mangaPage.changePanelSet': {
            params: ['page:object', 'panelSetId:string', 'options?:object'], returns: 'promise<boolean>'
        },
        'mangaPage.recoverUnassignedPanel': {
            params: ['page:object', 'archiveId:string', 'panelId:string'], returns: 'promise<boolean>'
        },
        'mangaPage.getUnassignedPanels': {
            params: ['page:object'], returns: 'array'
        },
        'mangaPage.validatePage': {
            params: ['page:object'], returns: 'object'
        }
    });
    Object.assign(detail, {
        'svgGeometry.parseSvg': { params: ['svg:string', 'options?:object'], returns: 'object' },
        'svgGeometry.parsePathToPoints': { params: ['path:string', 'options?:object'], returns: 'array|null' },
        'svgGeometry.flattenPath': { params: ['path:string', 'matrix?:array', 'options?:object'], returns: 'array' },
        'svgGeometry.transform': { params: ['expression:string'], returns: 'array' },
        'svgGeometry.elementMatrix': { params: ['element:object', 'root:object', 'minX:number', 'minY:number'], returns: 'array' },
        'svgGeometry.contains': { params: ['panel:object', 'x:number', 'y:number'], returns: 'boolean' },
        'svgGeometry.serializeVector': { params: ['panel:object'], returns: 'object' },
        'panelSets.parseSvg': { params: ['svg:string', 'options?:object'], returns: 'object' },
        'panelSets.getOriginalSvg': { params: ['id:string'], returns: 'string|null' },
        'panelSets.downloadSvg': { params: ['id:string'], returns: 'boolean' }
    });
    Object.assign(detail, {
        'mangaExportPreflight.validate': { params: ['pages:array'], returns: 'object' },
        'mangaExport.validateExport': { params: ['pages:array', 'options?:object'], returns: 'promise<object>' },
        'mangaExport.exportChapterPdf': { params: ['pages:array', 'options?:object'], returns: 'promise<object>' },
        'mangaExport.exportSelectionAsPdf': { params: [], returns: 'promise<object>' },
        'mangaExport.exportWholeBoardAsPdf': { params: [], returns: 'promise<object>' }
    });
    Object.assign(detail, {
        'projectFormat.normalize': { params: ['document:object'], returns: 'object' },
        'projectFormat.prepare': { params: ['payload:object'], returns: 'object' },
        'projectFormat.envelope': { params: ['document:object', 'assets:array'], returns: 'object' },
        'app.backupNow': { params: [], returns: 'promise<object>' },
        'panelTemplates.flowPosition': { params: ['panelSetId:string'], returns: 'promise<object>' },
        'panelTemplates.focusPage': { params: ['page:object'], returns: 'void' },
        'exportImport.exportProject': { params: ['options?:object'], returns: 'promise<object>' },
        'exportImport.importProjectFile': { params: ['file:object'], returns: 'promise<object>' },
        'exportImport.newProject': { params: ['name?:string'], returns: 'promise<object>' },
        'exportImport.updateProjectMeta': { params: ['patch:object'], returns: 'promise<boolean>' },
        'automation.pollEvents': { params: ['options?:object'], returns: 'object' },
        'automation.subscribe': { params: ['listener:function'], returns: 'function' },
        'automation.cancel': { params: ['requestId:string'], returns: 'object' },
        'automation.isLocked': { params: [], returns: 'boolean' },
        'app.recoveryInfo': { params: [], returns: 'object' },
        'app.restoreRecovery': { params: ['options?:object'], returns: 'promise<boolean>' },
        'ui.shell.getLayout': { params: [], returns: 'object' },
        'ui.shell.setPanel': { params: ['side:string', 'open:boolean'], returns: 'object' },
        'ui.shell.setWorkspaceMode': { params: ['mode:string'], returns: 'object' },
        'automation.bridgeState': { params: [], returns: 'object' },
        'automation.bridgeConnect': { params: ['options:object'], returns: 'void' },
        'automation.bridgeAuthorize': { params: ['scopes:array'], returns: 'void' },
        'automation.bridgeRefuse': { params: [], returns: 'void' },
        'automation.bridgeRevoke': { params: [], returns: 'void' },
        'automation.bridgeDisconnect': { params: [], returns: 'void' },
        'automation.openPanel': { params: [], returns: 'void' },
        'automation.closePanel': { params: [], returns: 'void' },
        'camera.panTo': { params: ['x:number', 'y:number'], returns: 'void' },
        'boards.list': { params: [], returns: 'array' },
        'boards.duplicate': { params: ['boardId:string'], returns: 'promise<string|null>' },
        'boards.move': { params: ['boardId:string', 'delta:number'], returns: 'promise<boolean>' },
        'boards.update': { params: ['boardId:string', 'patch:object'], returns: 'promise<boolean>' },
        'instances.selectByIds': { params: ['ids:array'], returns: 'array' },
        'instances.clearSelection': { params: [], returns: 'void' },
        'instances.updateById': { params: ['id:string', 'patch:object'], returns: 'promise<boolean>' },
        'instances.removeById': { params: ['id:string'], returns: 'promise<boolean>' },
        'instances.duplicateById': { params: ['id:string'], returns: 'promise<string|null>' },
        'instances.reorderById': { params: ['id:string', 'mode:string'], returns: 'promise<boolean>' },
        'instances.align': { params: ['ids:array', 'mode:string'], returns: 'promise<number>' },
        'instances.distribute': { params: ['ids:array', 'axis:string'], returns: 'promise<number>' },
        'mangaExport.renderPageToBlob': { params: ['page:object', 'options?:object'], returns: 'promise<object>' },
        'app.saveNow': { params: [], returns: 'promise<any>' }
    });
    Object.assign(detail, {
        'ui.accessibility.announce': { params: ['message:string', 'urgent?:boolean'], returns: 'void' },
        'ui.accessibility.sync': { params: [], returns: 'void' }
    });
    Object.assign(detail, {
        'imageProcessors.register': { params: ['adapter:object'], returns: 'string' },
        'imageProcessors.list': { params: [], returns: 'array' },
        'imageProcessors.resolve': { params: ['operation:string', 'preferred?:string'], returns: 'object' },
        'imageProcessors.plan': { params: ['steps:array'], returns: 'array' },
        'imageCommands.plan': { params: ['command:object'], returns: 'object' },
        'imageCommands.execute': { params: ['command:object'], returns: 'promise<object>' },
        'imageCommands.apply': { params: ['command:object'], returns: 'promise<object>' },
        'imageCommands.process': { params: ['command:object'], returns: 'promise<object>' },
        'ui.imageOperations.open': { params: ['assetId:string', 'trigger?:object'], returns: 'void' },
        'ui.imageOperations.close': { params: [], returns: 'void' }
    });
    // Registry surface and compatibility metadata remain ABI-identical to JS.
    // The detailed signature strings are intentionally not reinterpreted here:
    // TS-008 migrates the implementation, not the published schema.
    const types = {};
    Object.keys(api).forEach(function (name) {
        const methods = {};
        const methodNames = api[name].split(' ').filter(Boolean);
        for (const method of methodNames) {
            const descriptor = detail[name + '.' + method] || {
                params: ['...args:any'], returns: 'any'
            };
            methods[method] = {
                params: descriptor.params, returns: descriptor.returns,
                errors: ['CapabilityError', 'OperationError']
            };
        }
        // Additive minor bumps (Fase 2): same major, so every existing `^1.0.0` / `^2.0.0` consumer still resolves.
        const MINOR_BUMPS = {
            camera: '1.1.0', boards: '1.1.0', instances: '1.1.0', exportImport: '1.1.0', mangaExport: '2.1.0', automation: '1.3.0', app: '1.1.0', 'ui.shell': '1.1.0', panelTemplates: '1.1.0'
        };
        const version = MINOR_BUMPS[name] || '1.0.0';
        types[name] = {
            version: version,
            methods: methods,
            properties: properties[name] || {},
            errorTypes: ['CapabilityError', 'OperationError']
        };
    });
    Object.keys(types).forEach(name => {
        const specification = types[name];
        if (!specification)
            return;
        Object.freeze(specification.methods);
        Object.freeze(specification.properties);
        Object.freeze(specification);
    });
    global.NVB_CAPABILITY_CONTRACTS = Object.freeze(types);
})(window);
