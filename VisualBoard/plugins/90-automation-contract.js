"use strict";
/* =====================================================================
 * Fase 1 — VisualBoard Automation Contract v1 (dados puros, sem efeitos).
 *
 * Define o catálogo de ferramentas de automação por domínio, escopos de
 * permissão, erros tipados, limites, lacunas, exclusões, resources e
 * prompts. Cada ferramenta se liga a uma capability pública existente
 * (binding `call`) ou a uma composição somente-leitura (`composite`).
 * Nenhuma lógica gráfica vive aqui nem no adaptador (plugin 91).
 * O servidor MCP (Fase 4) consome `describe()` sem importar este código.
 * ===================================================================== */
definePlugin({
    id: 'automation-contract',
    version: '1.8.0',
    needs: [],
    provides: ['automationContract'],
    uses: [],
    accepts: {},
    contractVersions: { 'automationContract': '1.0.0' },
    setup: function (kernel) {
        const CONTRACT_VERSION = '1.8.0';
        /* ---------- schema helpers ---------- */
        const str = (o = {}) => ({ type: 'string', maxLength: 500, ...o });
        const id = (what = 'identifier') => ({ type: 'string', minLength: 1, maxLength: 128, description: what });
        const num = (min = -1e6, max = 1e6, d) => ({ type: 'number', minimum: min, maximum: max, ...(d ? { description: d } : {}) });
        const int = (min = 0, max = 1e6, d) => ({ type: 'integer', minimum: min, maximum: max, ...(d ? { description: d } : {}) });
        const bool = (d) => ({ type: 'boolean', ...(d ? { description: d } : {}) });
        const en = (values, d) => ({ type: 'string', enum: values, ...(d ? { description: d } : {}) });
        const color = () => ({ type: 'string', minLength: 1, maxLength: 32, description: 'CSS color, e.g. #112233' });
        const obj = (properties, required = [], d) => ({ type: 'object', properties, required, additionalProperties: false, ...(d ? { description: d } : {}) });
        const arr = (items, max = 1000) => ({ type: 'array', items, maxItems: max });
        const point = () => obj({ x: num(), y: num() }, ['x', 'y']);
        const none = () => obj({});
        const free = (d) => ({ type: 'object', additionalProperties: true, description: d });
        const withId = (extra, required = []) => obj({ instanceId: id('manga-page instance id'), ...extra }, ['instanceId', ...required]);
        const panelRef = (extra = {}, required = []) => withId({ panelId: id('panel id'), ...extra }, ['panelId', ...required]);
        const layerRef = (extra = {}, required = []) => panelRef({ layerId: id('image layer id'), ...extra }, ['layerId', ...required]);
        const nullableId = () => ({ type: ['string', 'null'], maxLength: 128 });
        const crop = () => obj({ left: num(0, 1), top: num(0, 1), right: num(0, 1), bottom: num(0, 1) }, ['left', 'top', 'right', 'bottom'], 'fraction (0–1) of the source image removed from each side; each axis must keep at least 1%');
        const limits = () => obj({ left: num(), top: num(), right: num(), bottom: num() }, ['left', 'top', 'right', 'bottom']);
        const layerPatch = () => obj({
            x: num(), y: num(), width: num(1e-3, 1e6), height: num(1e-3, 1e6),
            rotation: num(-3600, 3600), opacity: num(0, 1)
        });
        const framingPatch = () => obj({
            x: num(), y: num(), width: num(1e-3, 1e6), height: num(1e-3, 1e6),
            rotation: num(-3600, 3600), opacity: num(0, 1), crop: crop(), viewLimits: limits()
        });
        const stylePatch = () => obj({
            fill: color(), stroke: color(), strokeWidth: num(0, 200),
            fillOpacity: num(0, 1), strokeOpacity: num(0, 1)
        });
        const textFields = () => ({
            text: str({ maxLength: 5000 }), x: num(), y: num(), width: num(1, 1e6), height: num(1, 1e6),
            rotation: num(-3600, 3600),
            fontFamily: en(['Arial', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New']),
            fontSize: num(1, 1000), bold: bool(), align: en(['left', 'center', 'right']),
            color: color(), outlineColor: color(), outlineWidth: num(0, 100), opacity: num(0, 1),
            visible: bool(), locked: bool()
        });
        const balloonFields = () => ({
            presetId: nullableId(),
            shape: en(['oval', 'round', 'cloud', 'thought', 'shout', 'burst', 'box', 'caption']),
            tail: en(['none', 'bottom-left', 'bottom', 'bottom-right', 'left', 'right']),
            vertices: { type: ['array', 'null'], items: point(), maxItems: 200 },
            x: num(), y: num(), width: num(1, 1e6), height: num(1, 1e6), rotation: num(-3600, 3600),
            fill: color(), fillOpacity: num(0, 1), stroke: color(), strokeWidth: num(0, 200),
            text: str({ maxLength: 5000 }), textColor: color(), textSize: num(1, 1000),
            visible: bool(), locked: bool()
        });
        const effectCommon = () => ({
            panelId: nullableId(), x: num(), y: num(), width: num(0, 1e6), height: num(0, 1e6),
            rotation: num(-3600, 3600), color: color(), opacity: num(0, 1), size: num(0, 1000)
        });
        const effectScope = () => en(['panel', 'page']);
        const layerKind = () => en(['panel', 'image', 'drawing', 'balloon', 'text']);
        const exportOpts = () => ({
            dpi: num(36, 1200, 'physical PNG resolution; page units are 96 CSS px/inch'),
            quality: num(0.1, 1), maxPixels: int(1, 4e8), maxSide: int(1, 65536)
        });
        /* ---------- catalog assembly ---------- */
        const tools = [];
        const call = (capability, method, args, result = 'raw') => ({ kind: 'call', capability, method, args, result });
        const comp = (handler, uses = []) => ({ kind: 'composite', handler, uses });
        const capsOf = (b) => {
            const names = b.kind === 'call' ? [b.capability] : b.uses.map(u => u.slice(0, u.lastIndexOf('.')));
            return Array.from(new Set(names.filter(Boolean)));
        };
        function T(domain, action, scope, title, description, input, binding, undoable = false) {
            tools.push({
                name: 'visualboard.' + domain + '.' + action, title, description, domain, scope, input,
                binding, requires: capsOf(binding), undoable
            });
        }
        const R = 'read', W = 'write', X = 'export', D = 'destructive';
        /* ===== app ===== */
        T('app', 'get_status', R, 'Application status', 'Versions, boot state, persistence mode, unsaved-changes flag and automation connection state.', none(), comp('app.status', ['app.isDirty', 'app.isPersistent', 'history.canUndo', 'history.canRedo']));
        T('app', 'list_capabilities', R, 'List capabilities', 'Capabilities registered in the running microkernel with contract versions and plugin status.', none(), comp('app.capabilities'));
        T('app', 'get_context', R, 'Editing context', 'Active board, selection, focused panel, active tool modes and camera.', none(), comp('app.context', ['state.getCurrentBoard', 'mangaPage.getFocus', 'mangaPage.getKnifeMode',
            'mangaPage.getVertexMode', 'mangaPage.getCropMode', 'mangaPage.getMangaToolMode',
            'mangaPage.getBalloonDrawMode']));
        T('app', 'get_audit_log', R, 'Automation audit log', 'Most recent automation requests (tool, outcome, timing). Does not contain document data.', obj({ limit: int(1, 500) }), comp('app.audit_log'));
        /* ===== project ===== */
        T('project', 'get', R, 'Project summary', 'Project metadata, counts of boards, assets, packages and panel sets, dirty state.', none(), comp('project.get', ['state.getCurrentBoard', 'history.isDirty']));
        T('project', 'save', W, 'Save project', 'Persists the project to the active storage backend (not a download).', none(), call('app', 'saveNow', [], 'raw'));
        T('project', 'export', X, 'Export project file', 'Builds the complete .nvb.json project (without a browser download) and returns size and a bounded inline payload.', obj({ inline: bool('include the JSON text when it fits the response limit') }), comp('project.export', ['exportImport.exportProject']));
        T('project', 'import', D, 'Import project file', 'Replaces the open project with a .nvb.json payload (base64). Always asks the user for confirmation.', obj({ contentBase64: str({ maxLength: 28000000, description: 'base64 of the .nvb.json file' }) }, ['contentBase64']), comp('project.import', ['exportImport.importProjectFile', 'ui.dialogs.confirm']), true);
        T('project', 'create', D, 'New empty project', 'Replaces the open project with an empty one (one root board). The previous project is backed up first and the user must confirm.', obj({ name: str({ minLength: 1, maxLength: 120 }) }), comp('project.create', ['exportImport.newProject', 'ui.dialogs.confirm']), false);
        T('project', 'set_properties', W, 'Set project properties', 'Renames the project.', obj({ name: str({ minLength: 1, maxLength: 120 }) }, ['name']), call('exportImport', 'updateProjectMeta', [{ name: '$name' }], 'boolean'), true);
        T('project', 'get_recovery', R, 'Get crash checkpoint', 'Describes the automatic crash-recovery checkpoint (existence, time, whether it differs from the saved project, missing images). Never returns document content.', none(), call('app', 'recoveryInfo', []));
        T('project', 'recover', D, 'Recover unsaved work', 'Restores the crash-recovery checkpoint over the current document. Clears Undo/Redo, so it always asks the user to confirm.', none(), call('app', 'restoreRecovery', [{ confirm: false }], 'boolean'));
        T('project', 'validate', R, 'Validate project', 'Runs manga page validation and the export preflight for every manga page on every board.', none(), comp('project.validate', ['mangaPage.validatePage', 'mangaExportPreflight.validate']));
        /* ===== board ===== */
        T('board', 'list', R, 'List boards', 'All boards with parent, instance count and current marker.', none(), comp('board.list', ['boards.list', 'state.getBoard', 'boards.pathOf']));
        T('board', 'get', R, 'Get board', 'One board with a summary of its instances.', obj({ boardId: id('board id') }, ['boardId']), comp('board.get', ['state.getBoard', 'boards.getBoard']));
        T('board', 'create', W, 'Create board', 'Creates a board (optionally nested under a parent).', obj({ name: str({ maxLength: 120 }), parentId: id('parent board id') }), call('boards', 'create', ['name', 'parentId']), true);
        T('board', 'select', W, 'Select board', 'Makes a board the current one.', obj({ boardId: id('board id') }, ['boardId']), call('boards', 'navigate', ['boardId'], 'done'));
        T('board', 'navigate_up', W, 'Go to parent board', 'Navigates to the parent of the current board.', none(), call('boards', 'navigateUp', [], 'done'));
        T('board', 'rename', W, 'Rename board', 'Renames a board.', obj({ boardId: id('board id'), name: str({ minLength: 1, maxLength: 120 }) }, ['boardId', 'name']), call('boards', 'rename', ['boardId', 'name'], 'done'), true);
        T('board', 'duplicate', W, 'Duplicate board', 'Copies a board with all nested boards (not the root board). Returns the new board id.', obj({ boardId: id('board id') }, ['boardId']), call('boards', 'duplicate', ['boardId'], 'created'), true);
        T('board', 'reorder', W, 'Reorder board', 'Moves a board among its siblings by a number of positions (negative = earlier).', obj({ boardId: id('board id'), delta: int(-1000, 1000) }, ['boardId', 'delta']), call('boards', 'move', ['boardId', 'delta'], 'boolean'), true);
        T('board', 'set_settings', W, 'Set board settings', 'Updates the name and/or the saved camera (x, y, zoom) of a board.', obj({ boardId: id('board id'), name: str({ minLength: 1, maxLength: 120 }),
            camera: obj({ x: num(-1e7, 1e7), y: num(-1e7, 1e7), zoom: num(0.01, 100) }) }, ['boardId']), call('boards', 'update', ['boardId', { name: '$name', camera: '$camera' }], 'boolean'), true);
        T('board', 'delete', D, 'Delete board', 'Deletes a board and its content. Requires confirmation.', obj({ boardId: id('board id') }, ['boardId']), call('boards', 'remove', ['boardId'], 'done'), true);
        T('board', 'get_path', R, 'Board path', 'Ancestors of a board, root first.', obj({ boardId: id('board id') }, ['boardId']), call('boards', 'pathOf', ['boardId']));
        /* ===== instances (any object on the board, addressed by id) ===== */
        T('instance', 'list', R, 'List board objects', 'Every object on the current board (images, manga pages, board links) with geometry and z-order.', none(), comp('instance.list', ['state.getCurrentBoard']));
        T('instance', 'update', W, 'Move or resize object', 'Changes position, size, rotation, visibility or lock of one object. Locked objects reject geometry changes.', obj({ objectId: id('instance id'), x: num(-1e7, 1e7), y: num(-1e7, 1e7), width: num(8, 1e6), height: num(8, 1e6),
            rotation: num(-3600, 3600), visible: bool(), locked: bool() }, ['objectId']), call('instances', 'updateById', ['objectId', { x: '$x', y: '$y', width: '$width', height: '$height', rotation: '$rotation', visible: '$visible', locked: '$locked' }], 'boolean'), true);
        T('instance', 'remove', W, 'Remove object', 'Removes one object (undoable). A board link is removed without deleting the target board.', obj({ objectId: id('instance id') }, ['objectId']), call('instances', 'removeById', ['objectId'], 'boolean'), true);
        T('instance', 'duplicate', W, 'Duplicate object', 'Copies one object, offset by 24 units. Returns the new instance id.', obj({ objectId: id('instance id') }, ['objectId']), call('instances', 'duplicateById', ['objectId'], 'created'), true);
        T('instance', 'reorder', W, 'Reorder object', 'Changes z-order of one object.', obj({ objectId: id('instance id'), mode: en(['front', 'back', 'forward', 'backward']) }, ['objectId', 'mode']), call('instances', 'reorderById', ['objectId', 'mode'], 'boolean'), true);
        /* ===== manga page ===== */
        T('page', 'list', R, 'List manga pages', 'Manga pages on the current board.', none(), comp('page.list', ['mangaExport.collectMangaPagesOnCurrentBoard']));
        T('page', 'get', R, 'Get manga page', 'Page geometry, panels with their image layers, and counts of balloons, texts and effects.', withId({}), comp('page.get', ['mangaPage.getPanelSet', 'mangaPage.getPanel', 'mangaPage.getUnassignedPanels']));
        T('page', 'list_templates', R, 'List page layouts', 'Built-in manga page layout templates.', none(), comp('page.list_templates', ['panelTemplates.list']));
        T('page', 'create_from_template', W, 'Create page from layout', 'Creates a panel set and a manga page instance from a built-in layout template.', obj({ templateId: id('template id'), width: num(100, 20000), height: num(100, 20000) }, ['templateId']), call('panelTemplates', 'createFromTemplate', ['@template', { width: '$width', height: '$height' }], 'raw'), true);
        T('page', 'list_panel_sets', R, 'List panel sets', 'Panel sets (page layouts) stored in the project.', none(), comp('page.list_panel_sets', ['panelSets.list']));
        T('page', 'get_panel_set', R, 'Get panel set', 'Geometry (panel polygons in page units) of one stored panel set.', obj({ panelSetId: id('panel set id') }, ['panelSetId']), comp('page.get_panel_set', ['panelSets.get']));
        T('page', 'create_panel_set_from_svg', W, 'Import layout from SVG', 'Parses an SVG layout with the application parser and stores it as a panel set.', obj({ svg: str({ maxLength: 2000000 }), name: str({ maxLength: 120 }) }, ['svg']), comp('page.create_panel_set_from_svg', ['panelSets.parseSvg', 'panelSets.create']), true);
        T('page', 'add_to_board', W, 'Place page on board', 'Places a manga page for a panel set on the current board.', obj({ panelSetId: id('panel set id'), x: num(), y: num() }, ['panelSetId', 'x', 'y']), call('mangaPage', 'addToBoard', ['panelSetId', 'x', 'y'], 'instance'), true);
        T('page', 'duplicate', W, 'Duplicate page', 'Duplicates a manga page.', withId({}), call('mangaPage', 'duplicate', ['@page'], 'instance'), true);
        T('page', 'plan_panel_set_change', R, 'Plan layout change', 'Dry-run of a layout change: shows panel mapping and what would become unassigned.', withId({ panelSetId: id('target panel set id') }, ['panelSetId']), call('mangaPage', 'planPanelSetChange', ['@page', 'panelSetId']));
        T('page', 'change_panel_set', W, 'Change page layout', 'Applies another panel set to a page, preserving content where mapped.', withId({ panelSetId: id('target panel set id') }, ['panelSetId']), call('mangaPage', 'changePanelSet', ['@page', 'panelSetId'], 'boolean'), true);
        T('page', 'validate', R, 'Validate page', 'Structural validation of one manga page.', withId({}), call('mangaPage', 'validatePage', ['@page']));
        /* ===== composition: raw images -> page layout (Fase 19) ===== */
        const compOptions = () => ({
            fit: en(['auto', 'cover', 'contain', 'keep'], 'auto = keep when the panel has a large background, otherwise cover'),
            spread: bool('Images covering 50% or more of two or more panels cross the panels (continuous background). Default true.')
        });
        const compIds = () => ({ type: 'array', items: id('image instance id'), minItems: 1, maxItems: 60,
            description: 'Image objects on the current board, as returned by instance.list' });
        T('composition', 'plan', R, 'Plan composition', 'Dry-run: which panel each loose image would enter for a layout (deterministic, from relative position, size and z-order). Changes nothing.', obj({ objectIds: compIds(), templateId: id('template id from page.list_templates'), ...compOptions() }, ['objectIds', 'templateId']), call('composition', 'plan', ['objectIds', 'templateId', { fit: '$fit', spread: '$spread' }]));
        T('composition', 'apply', W, 'Apply layout to loose images', 'Replaces loose images by a manga page built from a layout; each image becomes a layer of the panel chosen by the placement algorithm. The raw arrangement is kept so it can be restored.', obj({ objectIds: compIds(), templateId: id('template id from page.list_templates'), ...compOptions() }, ['objectIds', 'templateId']), call('composition', 'apply', ['objectIds', 'templateId', { fit: '$fit', spread: '$spread' }]), true);
        T('composition', 'change', W, 'Change composition layout', 'Recomputes a composition page from its raw arrangement for another layout. Refused when the page has manual edits or extra objects unless force=true.', withId({ templateId: id('template id'), ...compOptions(), force: bool('Discard manual edits and extra objects') }, ['templateId']), call('composition', 'change', ['instanceId', 'templateId', { fit: '$fit', spread: '$spread' }, 'force']), true);
        T('composition', 'remove', W, 'Back to raw (remove layout)', 'Removes the layout page and restores the original loose images exactly where they were. Refused when the page has manual edits or extra objects unless force=true. Undoable.', withId({ force: bool('Discard manual edits and extra objects') }), call('composition', 'remove', ['instanceId', 'force']), true);
        T('composition', 'get', R, 'Get composition info', 'Layout, options, raw image ids and whether the page was edited, for a page created by a composition.', withId({}), call('composition', 'get', ['instanceId'], 'nonnull'));
        T('composition', 'list', R, 'List compositions', 'Pages on the current board that were created by a composition.', none(), call('composition', 'list', []));
        /* ===== spread: double page with slots, real paper and proportional scale (Fase 20) ===== */
        const spreadId = () => id('spread id from spread.list');
        const paperFields = () => ({
            paper: id('paper preset id from spread.list_papers (e.g. b4-frame, a4, b6-tankobon)'),
            widthMm: num(20, 1000, 'custom paper width in millimetres (use with heightMm)'),
            heightMm: num(20, 1000, 'custom paper height in millimetres (use with widthMm)')
        });
        const paperTok = () => ({ presetId: '$paper', widthMm: '$widthMm', heightMm: '$heightMm' });
        const layoutFields = () => ({
            doubleTemplateId: id('double-page template id from spread.list_templates (geometry crosses the binding)'),
            templateId: id('single-page template id applied to BOTH slots (from page.list_templates)'),
            leftTemplateId: id('single-page template id for the left slot'),
            rightTemplateId: id('single-page template id for the right slot')
        });
        const layoutTok = () => ({ doubleTemplateId: '$doubleTemplateId', templateId: '$templateId', leftTemplateId: '$leftTemplateId', rightTemplateId: '$rightTemplateId' });
        const spreadIds = () => ({ type: 'array', items: id('image instance id'), minItems: 1, maxItems: 60,
            description: 'Optional: images to use. Default: every loose image overlapping the spread.' });
        T('spread', 'list_papers', R, 'List paper sizes', 'Real manga/comic paper presets in millimetres (B4 frame/bleed/paper, A4, B5, A5, tankobon, US comic).', none(), call('spread', 'listPapers', []));
        T('spread', 'list_templates', R, 'List double-page templates', 'Templates whose panels cross the binding between the two pages.', none(), call('spread', 'listTemplates', []));
        T('spread', 'create', W, 'Create double page', 'Creates two side-by-side slots at real paper size (millimetres x px/mm), shown as guides on the canvas. Images can be placed inside without any layout.', obj({ name: str(), ...paperFields(), pxPerMm: num(0.25, 12, 'canvas pixels per millimetre of paper (default 2)'), x: num(), y: num(),
            direction: en(['rtl', 'ltr'], 'rtl = right-to-left manga reading (first page on the right)'), gutter: num(0, 200) }), call('spread', 'create', [{ name: '$name', paperId: '$paper', widthMm: '$widthMm', heightMm: '$heightMm', pxPerMm: '$pxPerMm', x: '$x', y: '$y', direction: '$direction', gutter: '$gutter' }]), true);
        T('spread', 'list', R, 'List double pages', 'Double pages of the current board with slots, contents and layout state.', none(), call('spread', 'list', []));
        T('spread', 'get', R, 'Get double page', 'Slots, paper, loose images per slot (left, right, straddling the binding), docked pages and layout state.', obj({ spreadId: spreadId() }, ['spreadId']), call('spread', 'get', ['spreadId']));
        T('spread', 'move', W, 'Move double page', 'Moves the slots together with docked pages and the images inside (withContent, default true).', obj({ spreadId: spreadId(), dx: num(-1e6, 1e6), dy: num(-1e6, 1e6), withContent: bool() }, ['spreadId', 'dx', 'dy']), call('spread', 'move', ['spreadId', 'dx', 'dy', 'withContent']), true);
        T('spread', 'scale', W, 'Scale double page proportionally', 'Scales slots, docked pages and the images inside by the same factor (0.05 to 20) about the top-left corner; px/mm follows, so the paper size in mm is kept consistent.', obj({ spreadId: spreadId(), factor: num(0.05, 20) }, ['spreadId', 'factor']), call('spread', 'scale', ['spreadId', 'factor']), true);
        T('spread', 'set_paper', W, 'Change paper size or px/mm', 'Changes the real paper size and/or px per mm. With withContent (default true) images and pages scale proportionally to the width change. Refused while a layout is applied.', obj({ spreadId: spreadId(), ...paperFields(), pxPerMm: num(0.25, 12), withContent: bool() }, ['spreadId']), call('spread', 'setPaper', ['spreadId', paperTok(), 'pxPerMm', 'withContent']), true);
        T('spread', 'rename', W, 'Rename double page', 'Renames a double page.', obj({ spreadId: spreadId(), name: str({ minLength: 1, maxLength: 80 }) }, ['spreadId', 'name']), call('spread', 'rename', ['spreadId', 'name']), true);
        T('spread', 'remove', W, 'Remove double page guides', 'Removes the slot guides. Docked pages stay on the canvas as ordinary pages.', obj({ spreadId: spreadId() }, ['spreadId']), call('spread', 'remove', ['spreadId']), true);
        T('spread', 'dock', W, 'Dock page into slot', 'Fits an existing manga page into the left or right slot (uniform scale, centered).', obj({ spreadId: spreadId(), slot: en(['left', 'right']), instanceId: id('manga-page instance id') }, ['spreadId', 'slot', 'instanceId']), call('spread', 'dock', ['spreadId', 'slot', 'instanceId']), true);
        T('spread', 'undock', W, 'Release page from slot', 'Releases the page of a slot (the page stays where it is).', obj({ spreadId: spreadId(), slot: en(['left', 'right']) }, ['spreadId', 'slot']), call('spread', 'undock', ['spreadId', 'slot']), true);
        const spreadOptions = () => ({
            fit: en(['auto', 'cover', 'contain', 'keep'], 'auto = keep when the panel has a large background, otherwise cover'),
            spread: bool('Images covering 50% or more of two or more panels cross the panels (continuous background). Default true.')
        });
        T('spread', 'plan', R, 'Plan layout over the double page', 'Dry-run: which panel of which page each image would enter (deterministic: relative position, size, z-order). Changes nothing.', obj({ spreadId: spreadId(), ...layoutFields(), ...spreadOptions(), objectIds: spreadIds() }, ['spreadId']), call('spread', 'plan', ['spreadId', layoutTok(), { fit: '$fit', spread: '$spread' }, 'objectIds']));
        T('spread', 'apply', W, 'Apply layout to the double page', 'Creates the two manga pages inside the slots from a double-page template or a pair of single-page templates, and distributes the loose images. The raw arrangement is kept for restoring.', obj({ spreadId: spreadId(), ...layoutFields(), ...spreadOptions(), objectIds: spreadIds() }, ['spreadId']), call('spread', 'apply', ['spreadId', layoutTok(), { fit: '$fit', spread: '$spread' }, 'objectIds']), true);
        T('spread', 'change_layout', W, 'Change double-page layout', 'Recomputes both pages from the raw arrangement for another layout. Refused when the pages have manual edits or extra objects unless force=true.', obj({ spreadId: spreadId(), ...layoutFields(), ...spreadOptions(), force: bool('Discard manual edits and extra objects') }, ['spreadId']), call('spread', 'change', ['spreadId', layoutTok(), { fit: '$fit', spread: '$spread' }, 'force']), true);
        T('spread', 'clear', W, 'Back to raw (remove double-page layout)', 'Removes both layout pages and restores the loose images exactly where they were; the slots stay. Refused when the pages were edited unless force=true. Undoable.', obj({ spreadId: spreadId(), force: bool('Discard manual edits and extra objects') }, ['spreadId']), call('spread', 'clear', ['spreadId', 'force']), true);
        T('scale', 'objects', W, 'Scale objects proportionally together', 'Scales images and manga pages by the same factor (0.05 to 20) about a pivot (default: centre of their union) so sizes stay proportional. Pages docked in a double page must use spread.scale.', obj({ objectIds: { type: 'array', items: id('image or manga-page instance id'), minItems: 1, maxItems: 200 }, factor: num(0.05, 20), pivot: point() }, ['objectIds', 'factor']), call('spread', 'scaleObjects', ['objectIds', 'factor', 'pivot']), true);
        T('scale', 'fit_page', W, 'Fit a page to real paper size', 'Scales a manga page to the real size of a paper (contained, no distortion) at px/mm, optionally scaling other images by the same factor.', withId({ ...paperFields(), pxPerMm: num(0.25, 12), alsoScaleIds: { type: 'array', items: id('image or manga-page instance id'), maxItems: 200 } }), call('spread', 'fitPageToPaper', ['instanceId', paperTok(), 'pxPerMm', 'alsoScaleIds']), true);
        /* ===== video (voice comic) ===== */
        const videoId = () => id('video project id from video.list');
        const MOVES = ['static', 'push-in', 'pull-out', 'pan-left', 'pan-right', 'pan-up', 'pan-down', 'ken-burns', 'roll-cw', 'roll-ccw', 'heartbeat'];
        const FX_KINDS = ['shake', 'rumble', 'zoom-punch', 'rotate-punch', 'flash', 'blur-in', 'blur-out', 'whip', 'vignette', 'glitch', 'chromatic', 'grayscale', 'sepia',
            'invert-flash', 'contrast-pop', 'tint', 'grain', 'strobe', 'letterbox', 'speed-zoom', 'fade-in', 'fade-out', 'parallax'];
        const REVEALS = ['cut', 'fade', 'pop', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe', 'typewriter'];
        const TRANSITIONS = ['cut', 'camera-move', 'crossfade', 'dip-black', 'dip-white', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'push-left', 'push-right',
            'wipe-left', 'wipe-right', 'wipe-up', 'wipe-down', 'wipe-diagonal', 'iris', 'zoom-through', 'flash', 'glitch', 'blinds', 'dissolve', 'page-turn'];
        const EASES = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'back'];
        const nullableNum = (min, max, d) => ({ type: ['number', 'null'], minimum: min, maximum: max, ...(d ? { description: d } : {}) });
        const videoSettings = () => obj({
            width: int(160, 3840), height: int(120, 2160), fps: int(8, 60), background: color(), sync: en(['auto', 'manual'], 'auto: each line lasts as long as its bound audio (default); manual: cue.at / cue.duration decide'),
            subtitles: obj({ enabled: bool('optional subtitles burned into the video'), position: en(['bottom', 'top']), size: num(0.02, 0.15), color: color(), outline: color() }),
            margin: num(0, 0.6), panelIntro: num(0, 10), linePad: num(0, 10), lineMin: num(0.1, 30), secPerChar: num(0.01, 1, 'seconds per letter when a line has no audio'), shotTail: num(0, 30),
            direction: en(['rtl', 'ltr']), unrevealed: en(['hidden', 'dim']),
            transitions: obj({ samePage: en(TRANSITIONS), newPage: en(TRANSITIONS), duration: num(0, 5) }), overviewShots: bool()
        });
        const videoFocus = () => obj({ kind: en(['page', 'panel', 'rect']), panelId: id('panel id (kind=panel)'), x: num(), y: num(), width: num(1, 1e6), height: num(1, 1e6) }, ['kind']);
        const videoCamera = () => obj({ move: en(MOVES), amount: num(0, 1), ease: en(EASES) });
        const videoTransition = () => obj({ kind: en(TRANSITIONS), duration: num(0, 5), ease: en(EASES) });
        const videoFxFields = () => ({ kind: en(FX_KINDS), at: num(0, 3600, 'seconds from the start of the shot'), duration: num(0.02, 3600), intensity: num(0, 1), color: color() });
        const videoCueFields = () => ({
            at: nullableNum(0, 3600, 'seconds from the start of the shot; null = automatic'), duration: nullableNum(0, 600, 'null = audio length (balloons) or estimated from the text'),
            anim: en(REVEALS), animDuration: num(0, 5), clipId: { type: ['string', 'null'], maxLength: 128, description: 'audio clip id from video.get (voice, sfx)' },
            hold: en(['shot', 'line'], 'shot: stays until the shot ends; line: disappears shortly after its audio'), subtitle: { type: ['string', 'null'], maxLength: 500, description: 'overrides the subtitle text' }
        });
        const videoShotFields = () => ({ label: str({ maxLength: 80 }), focus: videoFocus(), camera: videoCamera(), transition: videoTransition(),
            duration: nullableNum(0.1, 3600, 'null = automatic (last line + tail)') });
        T('video', 'catalog', R, 'Video effect catalog', 'Camera moves, image effects, reveal animations, transitions and easings available to shots.', none(), call('video', 'catalog', []));
        T('video', 'list', R, 'List videos', 'Voice-comic video projects of the current board (shots, clips and settings).', none(), call('video', 'list', []));
        T('video', 'get', R, 'Get video', 'One video project: settings, audio clips, shots with their cues and effects, free audio events.', obj({ videoId: videoId() }, ['videoId']), call('video', 'get', ['videoId']));
        T('video', 'page_info', R, 'Page elements for video', 'Panels (id, box, polygon), balloons, texts, effects and overlays of a manga page: the ids that cues refer to.', withId({}), call('video', 'pageInfo', ['instanceId']));
        T('video', 'plan', R, 'Compile video timeline', 'Deterministic timeline: shot start/end, camera, items with in/out times, audio placement and subtitles, plus warnings. Changes nothing.', obj({ videoId: videoId() }, ['videoId']), call('video', 'compile', ['videoId']));
        T('video', 'estimate', R, 'Estimate video', 'Duration, frames, shots and how many dialogue lines have audio bound.', obj({ videoId: videoId() }, ['videoId']), call('video', 'estimate', ['videoId']));
        T('video', 'export_capabilities', R, 'Video encoders in this browser', 'WebCodecs availability and the H.264/VP9/AV1 and AAC/Opus encoders this browser can use for in-browser export.', none(), call('videoExport', 'supportedCodecs', []));
        T('video', 'hub_status', R, 'Video render status of the Hub', 'Whether the connected Asset Hub can render video with ffmpeg (H.264/AAC).', none(), call('videoExport', 'hubStatus', []));
        T('video', 'create', W, 'Create video', 'Creates an empty video project (default 1920x1080, 30 fps, automatic sync). Up to 8 per board.', obj({ name: str({ maxLength: 80 }), settings: videoSettings() }), call('video', 'create', [{ name: '$name', settings: '$settings' }]), true);
        T('video', 'rename', W, 'Rename video', 'Renames a video project.', obj({ videoId: videoId(), name: str({ minLength: 1, maxLength: 80 }) }, ['videoId', 'name']), call('video', 'rename', ['videoId', 'name']), true);
        T('video', 'update_settings', W, 'Change video settings', 'Size, fps, background, sync mode (auto/manual), optional subtitles, pacing, reading direction and default transitions.', obj({ videoId: videoId(), settings: videoSettings() }, ['videoId', 'settings']), call('video', 'updateSettings', ['videoId', 'settings']), true);
        T('video', 'remove', D, 'Delete video', 'Deletes a video project and its imported audio clips. Requires confirmation; undoable.', obj({ videoId: videoId() }, ['videoId']), call('video', 'remove', ['videoId']), true);
        T('video', 'auto_build', W, 'Build shots automatically', 'One shot per panel in reading order (manga right-to-left by default), with the panel, effects, overlays, texts and balloons of each panel as cues, camera moves and transitions. Replaces the current shots unless replace=false.', obj({ videoId: videoId(), pageIds: arr(id('manga-page instance id'), 200), replace: bool(), overview: bool('start each page with an overview shot') }, ['videoId']), call('video', 'autoBuild', ['videoId', { pageIds: '$pageIds', replace: '$replace', overview: '$overview' }]), true);
        T('video', 'add_shot', W, 'Add shot', 'Adds a shot on a manga page (default: whole page, static camera). Cues and effects can be passed directly.', obj({ videoId: videoId(), pageId: id('manga-page instance id'), ...videoShotFields(),
            cues: arr(obj({ kind: en(['panel', 'balloon', 'text', 'effect', 'overlay', 'sfx']), targetId: { type: ['string', 'null'], maxLength: 128 }, ...videoCueFields() }, ['kind']), 200),
            fx: arr(obj(videoFxFields(), ['kind']), 60), index: int(0, 2000) }, ['videoId', 'pageId']), call('video', 'addShot', ['videoId', { pageId: '$pageId', label: '$label', focus: '$focus', camera: '$camera', transition: '$transition', duration: '$duration', cues: '$cues', fx: '$fx' }, 'index']), true);
        T('video', 'update_shot', W, 'Change shot', 'Changes the label, page, focus, camera move, entry transition or duration of a shot.', obj({ videoId: videoId(), shotId: id('shot id'), pageId: id('manga-page instance id'), ...videoShotFields() }, ['videoId', 'shotId']), call('video', 'updateShot', ['videoId', 'shotId', { pageId: '$pageId', label: '$label', focus: '$focus', camera: '$camera', transition: '$transition', duration: '$duration' }]), true);
        T('video', 'move_shot', W, 'Reorder shot', 'Moves a shot to another position (0 = first).', obj({ videoId: videoId(), shotId: id('shot id'), toIndex: int(0, 2000) }, ['videoId', 'shotId', 'toIndex']), call('video', 'moveShot', ['videoId', 'shotId', 'toIndex']), true);
        T('video', 'remove_shot', D, 'Remove shot', 'Removes a shot and the audio events anchored to it. Requires confirmation; undoable.', obj({ videoId: videoId(), shotId: id('shot id') }, ['videoId', 'shotId']), call('video', 'removeShot', ['videoId', 'shotId']), true);
        T('video', 'add_cue', W, 'Add reveal or line', 'Makes a panel, balloon, text, effect or overlay appear in a shot (ids from video.page_info), or an audio-only sound effect (kind=sfx, no target). A voice clip bound to a balloon decides its duration in auto sync.', obj({ videoId: videoId(), shotId: id('shot id'), kind: en(['panel', 'balloon', 'text', 'effect', 'overlay', 'sfx']), targetId: { type: ['string', 'null'], maxLength: 128 }, ...videoCueFields(), index: int(0, 200) }, ['videoId', 'shotId', 'kind']), call('video', 'addCue', ['videoId', 'shotId', { kind: '$kind', targetId: '$targetId', at: '$at', duration: '$duration', anim: '$anim', animDuration: '$animDuration', clipId: '$clipId', hold: '$hold', subtitle: '$subtitle' }, 'index']), true);
        T('video', 'update_cue', W, 'Change reveal or line', 'Changes timing, animation, bound audio, hold mode or subtitle of a cue.', obj({ videoId: videoId(), cueId: id('cue id'), ...videoCueFields() }, ['videoId', 'cueId']), call('video', 'updateCue', ['videoId', 'cueId', { at: '$at', duration: '$duration', anim: '$anim', animDuration: '$animDuration', clipId: '$clipId', hold: '$hold', subtitle: '$subtitle' }]), true);
        T('video', 'remove_cue', W, 'Remove reveal or line', 'Removes a cue from its shot.', obj({ videoId: videoId(), cueId: id('cue id') }, ['videoId', 'cueId']), call('video', 'removeCue', ['videoId', 'cueId']), true);
        T('video', 'bind_clip', W, 'Bind audio to a line', 'Binds (or unbinds with null) an audio clip to a cue.', obj({ videoId: videoId(), cueId: id('cue id'), clipId: { type: ['string', 'null'], maxLength: 128 } }, ['videoId', 'cueId', 'clipId']), call('video', 'bindClip', ['videoId', 'cueId', 'clipId']), true);
        T('video', 'bind_in_order', W, 'Bind voices to lines in order', 'Binds the unbound voice clips, in import order, to the dialogue balloons in video order.', obj({ videoId: videoId() }, ['videoId']), call('video', 'bindInOrder', ['videoId']), true);
        T('video', 'import_clip', W, 'Import audio clip', 'Imports an audio file given as base64 (WAV, MP3, OGG, FLAC, M4A, WebM) as a voice, sound effect or music clip. Paths on disk are never read here (use visualboard_video_import_clip_from_path).', obj({ videoId: videoId(), name: str({ minLength: 1, maxLength: 200 }), kind: en(['voice', 'sfx', 'music']), dataBase64: str({ maxLength: 28000000 }), label: str({ maxLength: 80 }) }, ['videoId', 'name', 'dataBase64']), comp('video.import_clip', ['video.importClip']), true);
        T('video', 'update_clip', W, 'Change audio clip', 'Renames a clip, changes its kind or gain (0 to 4).', obj({ videoId: videoId(), clipId: id('clip id'), label: str({ maxLength: 80 }), kind: en(['voice', 'sfx', 'music']), gain: num(0, 4) }, ['videoId', 'clipId']), call('video', 'updateClip', ['videoId', 'clipId', { label: '$label', kind: '$kind', gain: '$gain' }]), true);
        T('video', 'remove_clip', D, 'Remove audio clip', 'Removes a clip (unbinding it from cues and events) and its audio asset. Requires confirmation; undoable.', obj({ videoId: videoId(), clipId: id('clip id') }, ['videoId', 'clipId']), call('video', 'removeClip', ['videoId', 'clipId']), true);
        T('video', 'add_fx', W, 'Add camera/image effect', 'Adds a timed effect to a shot: shake, rumble, zoom/rotate punch, flash, blur, whip, vignette, glitch, chromatic, grayscale, sepia, invert, contrast, tint, grain, strobe, letterbox, speed-zoom, fades, parallax.', obj({ videoId: videoId(), shotId: id('shot id'), ...videoFxFields() }, ['videoId', 'shotId', 'kind']), call('video', 'addFx', ['videoId', 'shotId', { kind: '$kind', at: '$at', duration: '$duration', intensity: '$intensity', color: '$color' }]), true);
        T('video', 'update_fx', W, 'Change effect', 'Changes kind, timing, intensity or color of an effect.', obj({ videoId: videoId(), fxId: id('effect id'), ...videoFxFields() }, ['videoId', 'fxId']), call('video', 'updateFx', ['videoId', 'fxId', { kind: '$kind', at: '$at', duration: '$duration', intensity: '$intensity', color: '$color' }]), true);
        T('video', 'remove_fx', W, 'Remove effect', 'Removes an effect from its shot.', obj({ videoId: videoId(), fxId: id('effect id') }, ['videoId', 'fxId']), call('video', 'removeFx', ['videoId', 'fxId']), true);
        const audioEventFields = () => ({ at: num(0, 36000), gain: num(0, 4), fadeIn: num(0, 60), fadeOut: num(0, 60), loop: bool() });
        T('video', 'add_audio_event', W, 'Place sound on the timeline', 'Places a sound effect or music clip on the timeline (absolute seconds, or relative to a shot). Music can loop with fades.', obj({ videoId: videoId(), clipId: id('clip id'), shotId: { type: ['string', 'null'], maxLength: 128 }, ...audioEventFields() }, ['videoId', 'clipId']), call('video', 'addAudioEvent', ['videoId', { clipId: '$clipId', shotId: '$shotId', at: '$at', gain: '$gain', fadeIn: '$fadeIn', fadeOut: '$fadeOut', loop: '$loop' }]), true);
        T('video', 'update_audio_event', W, 'Change timeline sound', 'Changes position, gain, fades, loop or anchor shot of a timeline sound.', obj({ videoId: videoId(), eventId: id('audio event id'), shotId: { type: ['string', 'null'], maxLength: 128 }, ...audioEventFields() }, ['videoId', 'eventId']), call('video', 'updateAudioEvent', ['videoId', 'eventId', { shotId: '$shotId', at: '$at', gain: '$gain', fadeIn: '$fadeIn', fadeOut: '$fadeOut', loop: '$loop' }]), true);
        T('video', 'remove_audio_event', W, 'Remove timeline sound', 'Removes a timeline sound.', obj({ videoId: videoId(), eventId: id('audio event id') }, ['videoId', 'eventId']), call('video', 'removeAudioEvent', ['videoId', 'eventId']), true);
        T('video', 'export_start', X, 'Start MP4 export', 'Starts rendering the video in the background (mode "browser": WebCodecs in the page; mode "hub": ffmpeg in the connected local Hub, H.264/AAC) and returns a jobId. Poll video.export_status; save with visualboard_video_save_mp4.', obj({ videoId: videoId(), mode: en(['browser', 'hub']), codec: en(['auto', 'h264', 'avc', 'vp9', 'av1']), scale: num(0.1, 1, 'output size factor (0.5 = draft)'),
            videoBitrate: int(300000, 80000000), crf: int(0, 51, 'hub only: x264 quality, lower is better (default 18)') }, ['videoId']), comp('video.export_start', ['videoExport.exportMp4', 'videoExport.exportViaHub']));
        T('video', 'export_status', R, 'MP4 export status', 'State (running, done, failed, cancelled), phase and progress of an export job; waitMs (max 25000) waits for a change. When done it reports size, codecs, warnings and the sha256.', obj({ jobId: id('export job id'), waitMs: int(0, 25000) }, ['jobId']), comp('video.export_status'));
        T('video', 'export_cancel', X, 'Cancel MP4 export', 'Cancels a running export job.', obj({ jobId: id('export job id') }, ['jobId']), comp('video.export_cancel'));
        /* ===== panels & geometry ===== */
        T('panel', 'list', R, 'List panels', 'Panels of a page with geometry, style and layer counts.', withId({}), comp('panel.list', ['mangaPage.getPanelSet', 'mangaPage.getPanelStyle', 'mangaPage.getPanel']));
        T('panel', 'get_style', R, 'Get panel style', 'Fill and stroke of a panel.', panelRef(), call('mangaPage', 'getPanelStyle', ['@page', 'panelId'], 'nonnull'));
        T('panel', 'update_style', W, 'Update panel style', 'Changes fill/stroke of a panel.', panelRef({ patch: stylePatch() }, ['patch']), call('mangaPage', 'updatePanelStyle', ['@page', 'panelId', 'patch'], 'boolean'), true);
        T('panel', 'preview_knife', R, 'Preview knife cut', 'Validates a cut line (page coordinates) and returns the two resulting polygons without changing the document.', panelRef({ line: obj({ x1: num(), y1: num(), x2: num(), y2: num() }, ['x1', 'y1', 'x2', 'y2']), gutter: num(0, 500) }, ['line']), call('mangaPage', 'previewKnife', ['@page', 'panelId', 'line', 'gutter']));
        T('panel', 'apply_knife', W, 'Apply knife cut', 'Splits a panel along a line, with optional gutter.', panelRef({ line: obj({ x1: num(), y1: num(), x2: num(), y2: num() }, ['x1', 'y1', 'x2', 'y2']), gutter: num(0, 500) }, ['line']), call('mangaPage', 'splitPanel', ['@page', 'panelId', 'line', 'gutter']), true);
        T('panel', 'set_gutter', W, 'Set gutter', 'Sets the gutter applied between knife-cut panels of a page.', withId({ gutter: num(0, 500) }, ['gutter']), call('mangaPage', 'setPanelGutter', ['@page', 'gutter'], 'boolean'), true);
        T('panel', 'preview_vertex', R, 'Preview vertex move', 'Validates moving a panel vertex without changing the document.', panelRef({ index: int(0, 10000), point: point() }, ['index', 'point']), call('mangaPage', 'previewVertex', ['@page', 'panelId', 'index', 'point']));
        T('panel', 'move_vertex', W, 'Move vertex', 'Moves one vertex of a panel polygon (page coordinates).', panelRef({ index: int(0, 10000), point: point() }, ['index', 'point']), call('mangaPage', 'moveVertex', ['@page', 'panelId', 'index', 'point'], 'boolean'), true);
        T('panel', 'set_focus', W, 'Focus panel', 'Sets the focused page and panel (UI focus, no document change).', panelRef(), call('mangaPage', 'setFocus', ['instanceId', 'panelId'], 'done'));
        T('panel', 'clear_focus', W, 'Clear focus', 'Clears panel focus.', none(), call('mangaPage', 'clearFocus', [], 'done'));
        T('panel', 'list_unassigned', R, 'List unassigned panels', 'Panels archived by a layout change that can be recovered.', withId({}), call('mangaPage', 'getUnassignedPanels', ['@page']));
        T('panel', 'recover_unassigned', W, 'Recover archived panel', 'Restores an archived panel into a target panel.', withId({ archiveId: id('archived panel id'), targetPanelId: id('target panel id') }, ['archiveId', 'targetPanelId']), call('mangaPage', 'recoverUnassignedPanel', ['@page', 'archiveId', 'targetPanelId'], 'boolean'), true);
        /* ===== assets, packages, images ===== */
        T('asset', 'list', R, 'List assets', 'Assets (library) with dimensions and package, paginated.', obj({ packageId: id('package id'), offset: int(0, 1e6), limit: int(1, 500) }), comp('asset.list', ['state.getPackage']));
        T('asset', 'get', R, 'Get asset', 'Metadata of one asset (dimensions, type, size, derivation).', obj({ assetId: id('asset id') }, ['assetId']), comp('asset.get', ['state.getAsset']));
        T('asset', 'import', W, 'Import image', 'Imports an image given as base64 into the asset library. Paths on disk are never read here.', obj({ name: str({ minLength: 1, maxLength: 200 }), mimeType: en(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
            dataBase64: str({ maxLength: 28000000 }), packageId: id('package id') }, ['name', 'mimeType', 'dataBase64']), comp('asset.import', ['assets.importFiles']), true);
        T('asset', 'delete', D, 'Delete asset', 'Removes an asset from the library. Requires confirmation.', obj({ assetId: id('asset id') }, ['assetId']), call('assets', 'deleteAsset', ['assetId'], 'done'), true);
        /* ===== catalog (Asset Hub) ===== */
        const hubId = (what = 'catalog asset id') => ({ type: 'string', minLength: 1, maxLength: 64, description: what });
        const tagList = () => arr(str({ minLength: 1, maxLength: 70 }), 50);
        const idList = () => arr(hubId(), 200);
        const catSearch = () => ({
            text: str({ maxLength: 200, description: 'free text over title, file name, description and tags' }),
            tags: obj({ all: tagList(), any: tagList(), none: tagList() }),
            folder: obj({ id: hubId('folder id'), recursive: bool() }, ['id']),
            where: arr(obj({ field: en(['width', 'height', 'bytes', 'mime', 'filename', 'title', 'hasAlpha', 'created', 'updated']),
                op: en(['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'like']), value: { description: 'string, number, boolean or array (op=in)' } }, ['field', 'op', 'value']), 20),
            usage: { type: ['string', 'object'], maxLength: 20, additionalProperties: true, description: "'used', 'unused' or {project: string}" },
            similarTo: obj({ entityId: hubId(), maxDistance: int(0, 64) }, ['entityId']),
            sort: obj({ by: en(['created', 'updated', 'name', 'size', 'width', 'height']), dir: en(['asc', 'desc']) }, ['by']),
            limit: int(1, 200), cursor: str({ maxLength: 400 })
        });
        const catMeta = () => ({
            title: str({ maxLength: 200 }), description: str({ maxLength: 2000 }), source: str({ maxLength: 500 }),
            license: str({ maxLength: 200 }), notes: str({ maxLength: 2000 })
        });
        const hubTool = (verb, scope, title, description, input, undoable = false) => T('catalog', verb, scope, title, description, input, comp('catalog.' + verb, ['assetHub.call']), undoable);
        hubTool('status', R, 'Catalog status', 'Connection to the Asset Hub, database dialect, counts, limits and server version.', none());
        hubTool('search', R, 'Search catalog', 'Relational search of catalogued images: text, tags (all/any/none), folder, numeric/text filters, usage, similarity, sort, pagination.', obj(catSearch()));
        hubTool('get', R, 'Get catalog image', 'All properties of one catalogued image (components, tags, folder, references).', obj({ id: hubId() }, ['id']));
        hubTool('add', W, 'Add image to catalog', 'Uploads an image given as base64 into the Hub (de-duplicated by SHA-256) with folder, tags and metadata.', obj({ filename: str({ minLength: 1, maxLength: 200 }), dataBase64: str({ maxLength: 28000000 }), folderId: hubId('folder id'), tags: tagList(), ...catMeta() }, ['filename', 'dataBase64']));
        hubTool('update', W, 'Update catalog image', 'Changes title, description, source, license, notes, file name or folder of an image (optional optimistic version check).', obj({ id: hubId(), filename: str({ maxLength: 200 }), folderId: hubId('folder id'), expectedVersion: int(1, 1e9), ...catMeta() }, ['id']));
        hubTool('move', W, 'Move images', 'Moves images to a folder.', obj({ ids: idList(), folderId: hubId('folder id') }, ['ids', 'folderId']));
        hubTool('remove', D, 'Remove catalog images', 'Deletes images from the Hub and the images folder. Refused while referenced unless force=true. Requires confirmation.', obj({ ids: idList(), force: bool() }, ['ids']));
        hubTool('tag_list', R, 'List tags', 'Tags with usage counts, optionally by prefix.', obj({ prefix: str({ maxLength: 70 }) }));
        hubTool('tag_add', W, 'Add tags', 'Adds tags (letters, numbers, space, _ . -; optional namespace:name) to images.', obj({ ids: idList(), tags: tagList() }, ['ids', 'tags']));
        hubTool('tag_remove', W, 'Remove tags', 'Removes tags from images.', obj({ ids: idList(), tags: tagList() }, ['ids', 'tags']));
        hubTool('tag_merge', W, 'Merge tags', 'Replaces several tags by one on every image.', obj({ from: tagList(), to: str({ minLength: 1, maxLength: 70 }) }, ['from', 'to']));
        hubTool('tag_delete', D, 'Delete tag', 'Removes a tag from every image. Requires confirmation.', obj({ tag: str({ minLength: 1, maxLength: 70 }) }, ['tag']));
        hubTool('folder_list', R, 'List folders', 'Folder tree with image counts.', none());
        hubTool('folder_create', W, 'Create folder', 'Creates a folder inside the images tree.', obj({ name: str({ minLength: 1, maxLength: 120 }), parentId: hubId('parent folder id') }, ['name']));
        hubTool('folder_update', W, 'Update folder', 'Renames or moves a folder.', obj({ id: hubId('folder id'), name: str({ maxLength: 120 }), parentId: hubId('parent folder id') }, ['id']));
        hubTool('folder_delete', D, 'Delete folder', 'Deletes an empty folder (or moves its content to the parent). Requires confirmation.', obj({ id: hubId('folder id'), mode: en(['refuse', 'move_to_parent']) }, ['id']));
        hubTool('usage', R, 'Image usage', 'Projects/instances that reference an image.', obj({ id: hubId() }, ['id']));
        hubTool('reference_add', W, 'Add reference', 'Records that a project instance uses an image.', obj({ id: hubId(), project: str({ minLength: 1, maxLength: 200 }), instance: str({ minLength: 1, maxLength: 200 }) }, ['id', 'project', 'instance']));
        hubTool('reference_remove', W, 'Remove reference', 'Removes one (or all) references of a project to an image.', obj({ id: hubId(), project: str({ minLength: 1, maxLength: 200 }), instance: str({ maxLength: 200 }) }, ['id', 'project']));
        hubTool('scan', W, 'Scan the images folder', 'Scans the Hub\'s own images folder (images/<type>/<subfolders>/file), imports new images into the catalog (originals untouched), mirrors the folders and adds tags tipo:<folder>, pasta:<subfolder>, origem:biblioteca. preview=true only reports. Never reads outside that folder.', obj({ preview: bool('only report what would be imported; writes nothing') }));
        hubTool('classify', W, 'Classify images', 'Records the result of LOOKING at images (use visualboard_catalog_view first): adds tags, optional title/description/notes and marks status:classificado. Up to 50 images per call.', obj({ items: { type: 'array', minItems: 1, maxItems: 50, items: obj({ id: hubId(), tags: tagList(), removeTags: tagList(),
                    title: str({ maxLength: 200 }), description: str({ maxLength: 2000 }), notes: str({ maxLength: 2000 }) }, ['id']) } }, ['items']));
        hubTool('verify', R, 'Verify catalog integrity', 'Checks that every catalogued file exists and matches its hash; lists orphan files.', none());
        hubTool('gc_orphans', D, 'Remove orphan files', 'Deletes files in the images folder that no catalog entry owns. Requires confirmation.', none());
        T('catalog', 'place', W, 'Place catalog image', 'Downloads a catalogued image from the Hub, imports it as an asset of the open project and records the usage reference.', obj({ id: hubId(), packageId: id('package id') }, ['id']), comp('catalog.place', ['assetHub.call', 'assets.importFiles']), true);
        T('catalog', 'import_library', W, 'Send project library to catalog', 'Uploads the images of the open project (optionally one package) to the Asset Hub with tags origem:projeto and pacote:<name>; duplicates are recognised by SHA-256.', obj({ packageId: id('package id') }), comp('catalog.import_library', ['assetHub.importLibrary']));
        T('package', 'create', W, 'Create package', 'Creates an asset package.', obj({ name: str({ maxLength: 120 }) }), call('packages', 'create', ['name']), true);
        T('package', 'rename', W, 'Rename package', 'Renames an asset package.', obj({ packageId: id('package id'), name: str({ minLength: 1, maxLength: 120 }) }, ['packageId', 'name']), call('packages', 'rename', ['packageId', 'name'], 'done'), true);
        T('package', 'delete', D, 'Delete package', 'Deletes a package and its assets. Requires confirmation.', obj({ packageId: id('package id') }, ['packageId']), call('packages', 'remove', ['packageId'], 'done'), true);
        T('package', 'move', W, 'Reorder package', 'Moves a package up (-1) or down (+1) in the library.', obj({ packageId: id('package id'), delta: int(-100, 100) }, ['packageId', 'delta']), call('packages', 'move', ['packageId', 'delta'], 'done'), true);
        T('image', 'add_to_board', W, 'Place image on board', 'Places an asset as a free image on the current board.', obj({ assetId: id('asset id'), x: num(), y: num() }, ['assetId', 'x', 'y']), call('instances', 'addImage', ['assetId', 'x', 'y'], 'instance'), true);
        T('image', 'plan_command', R, 'Plan image operation', 'Validates an image processing command (crop, resize, adjust…) without running it.', obj({ command: free('ImageCommand: {source:{assetId}, operation|steps, parameters}') }, ['command']), call('imageCommands', 'plan', ['command']));
        T('image', 'apply_command', W, 'Apply image operation', 'Runs an image command and stores the result as a new derived asset.', obj({ command: free('ImageCommand: {source:{assetId}, operation|steps, parameters, output}') }, ['command']), call('imageCommands', 'apply', ['command']), true);
        T('image', 'list_processors', R, 'List image operations', 'Registered image processors and the operations they support.', none(), comp('image.list_processors', ['imageProcessors.list']));
        /* ===== image layers inside panels (crop / clipping / framing) ===== */
        T('image_layer', 'add', W, 'Insert image into panel', 'Adds an asset as an image layer inside a panel (clipped to it).', panelRef({ assetId: id('asset id'), options: layerPatch() }, ['assetId']), call('mangaPage', 'addLayer', ['@page', 'panelId', 'assetId', 'options'], 'created'), true);
        T('image_layer', 'add_overlay', W, 'Insert page overlay image', 'Adds an asset as a page-level overlay layer.', withId({ assetId: id('asset id'), options: layerPatch() }, ['assetId']), call('mangaPage', 'addOverlayLayer', ['@page', 'assetId', 'options'], 'created'), true);
        T('image_layer', 'insert_at', W, 'Insert image at index', 'Adds an image layer at a z-order index in a panel.', panelRef({ assetId: id('asset id'), index: int(0, 10000) }, ['assetId', 'index']), call('mangaPage', 'insertLayerAt', ['@page', 'panelId', 'assetId', 'index'], 'created'), true);
        T('image_layer', 'update', W, 'Update image layer', 'Changes position, size, rotation or opacity of an image layer.', layerRef({ patch: layerPatch() }, ['patch']), call('mangaPage', 'updateLayer', ['@page', 'panelId', 'layerId', 'patch'], 'done'), true);
        T('image_layer', 'remove', W, 'Remove image layer', 'Removes an image layer from a panel (undoable).', layerRef(), call('mangaPage', 'removeLayer', ['@page', 'panelId', 'layerId'], 'done'), true);
        T('image_layer', 'reorder', W, 'Reorder image layer', 'Moves an image layer in z-order.', layerRef({ mode: en(['front', 'back', 'forward', 'backward']) }, ['mode']), call('mangaPage', 'reorderLayer', ['@page', 'panelId', 'layerId', 'mode'], 'done'), true);
        T('image_layer', 'reorder_to', W, 'Reorder image layer relative to another', 'Places a layer before/after a target layer.', panelRef({ draggedId: id('layer id'), targetId: id('target layer id'), position: en(['before', 'after']) }, ['draggedId', 'targetId', 'position']), call('mangaPage', 'reorderLayerTo', ['@page', 'panelId', 'draggedId', 'targetId', 'position'], 'boolean'), true);
        T('image_layer', 'get_framing', R, 'Get image framing', 'Position, size, rotation, opacity, crop and view limits of a layer.', layerRef(), call('mangaPage', 'getLayerFraming', ['@page', 'panelId', 'layerId'], 'nonnull'));
        T('image_layer', 'update_framing', W, 'Crop / frame image', 'Non-destructive crop, view limits and transform of an image layer.', layerRef({ patch: framingPatch() }, ['patch']), call('mangaPage', 'updateLayerFraming', ['@page', 'panelId', 'layerId', 'patch'], 'boolean'), true);
        T('image_layer', 'auto_fit', W, 'Auto-fit image', 'Fits the image to its panel (cover or contain).', layerRef({ mode: en(['cover', 'contain']) }), call('mangaPage', 'autoFitLayer', ['@page', 'panelId', 'layerId', 'mode'], 'boolean'), true);
        T('image_layer', 'zoom', W, 'Zoom image in panel', 'Scales an image layer by a factor.', layerRef({ factor: num(0.01, 100) }, ['factor']), call('mangaPage', 'zoomLayer', ['@page', 'panelId', 'layerId', 'factor'], 'boolean'), true);
        T('image_layer', 'replace_asset', W, 'Replace image asset', 'Swaps the asset of a layer, optionally preserving framing.', layerRef({ newAssetId: id('new asset id'), preserve: bool() }, ['newAssetId']), call('mangaPage', 'replaceLayerAsset', ['@page', 'panelId', 'layerId', 'newAssetId', 'preserve'], 'boolean'), true);
        T('image_layer', 'reset_framing', W, 'Reset framing', 'Restores default framing of an image layer.', layerRef(), call('mangaPage', 'resetLayerFraming', ['@page', 'panelId', 'layerId'], 'boolean'), true);
        /* ===== layer tree ===== */
        T('panel', 'preview_create', R, 'Preview new panel', 'Validates a polygon for panel.create (inside the page, simple, minimum area, no overlap after gutter) without changing the document.', withId({ points: { type: 'array', items: point(), minItems: 3, maxItems: 256 } }, ['points']), call('mangaPage', 'previewAddPanel', ['@page', 'points']));
        T('panel', 'create', W, 'Create panel', 'Adds a standalone panel from a polygon (page coordinates, 3-256 points, inside the page, not overlapping other panels). The page gets its own editable layout; undoable.', withId({ points: { type: 'array', items: point(), minItems: 3, maxItems: 256 } }, ['points']), call('mangaPage', 'addPanel', ['@page', 'points']), true);
        T('panel', 'delete', D, 'Delete panel', 'Removes a panel. Its images are archived (recoverable with panel.recover_unassigned) or, with mergeInto, moved into another panel; panel drawings are deleted unless merged. The last panel of a page cannot be removed.', panelRef({ mergeInto: id('panel that receives the content') }), call('mangaPage', 'removePanel', ['@page', 'panelId', { mergeInto: '$mergeInto' }]), true);
        T('layer', 'list', R, 'List layers', 'Hierarchical layer tree of a page (panels, images, drawings, balloons, texts).', withId({}), call('mangaPage', 'listLayerTree', ['@page']));
        T('layer', 'get_state', R, 'Get layer state', 'Name, visibility and lock (own and effective) of a layer node.', withId({ kind: layerKind(), nodeId: id('layer node id') }, ['kind', 'nodeId']), call('mangaPage', 'getLayerNodeState', ['@page', 'kind', 'nodeId'], 'nonnull'));
        T('layer', 'rename', W, 'Rename layer', 'Renames a layer node.', withId({ kind: layerKind(), nodeId: id('layer node id'), name: str({ minLength: 1, maxLength: 120 }) }, ['kind', 'nodeId', 'name']), call('mangaPage', 'updateLayerTreeNode', ['@page', 'kind', 'nodeId', { name: '$name' }], 'boolean'), true);
        T('layer', 'set_visibility', W, 'Show / hide layer', 'Sets visibility of a layer node.', withId({ kind: layerKind(), nodeId: id('layer node id'), visible: bool() }, ['kind', 'nodeId', 'visible']), call('mangaPage', 'updateLayerTreeNode', ['@page', 'kind', 'nodeId', { ownVisible: '$visible' }], 'boolean'), true);
        T('layer', 'set_locked', W, 'Lock / unlock layer', 'Sets the lock of a layer node.', withId({ kind: layerKind(), nodeId: id('layer node id'), locked: bool() }, ['kind', 'nodeId', 'locked']), call('mangaPage', 'updateLayerTreeNode', ['@page', 'kind', 'nodeId', { ownLocked: '$locked' }], 'boolean'), true);
        T('layer', 'move_object', W, 'Move object between panels', 'Moves an image or a drawing to another panel or to the page overlay (targetPanelId "__overlay__"). Balloons and texts always belong to the page overlay. fit: keep the geometry (default) or auto-fit (cover/contain) into the new panel.', withId({ kind: en(['image', 'drawing']), nodeId: id('layer node id'), targetPanelId: id('destination panel id or __overlay__'), fit: en(['keep', 'cover', 'contain']) }, ['kind', 'nodeId', 'targetPanelId']), call('mangaPage', 'moveLayerNode', ['@page', 'kind', 'nodeId', 'targetPanelId', { fit: '$fit' }], 'boolean'), true);
        T('layer', 'reorder', W, 'Reorder layer node', 'Moves a layer node one step forward or backward.', withId({ kind: layerKind(), nodeId: id('layer node id'), direction: en(['forward', 'backward']) }, ['kind', 'nodeId', 'direction']), call('mangaPage', 'reorderLayerTreeNode', ['@page', 'kind', 'nodeId', 'direction'], 'boolean'), true);
        /* ===== text ===== */
        T('text', 'list_fonts', R, 'List fonts', 'Fonts available to text objects.', none(), call('mangaPage', 'listHorizontalFonts', []));
        T('text', 'list', R, 'List texts', 'Standalone text objects of a page.', withId({}), call('mangaPage', 'listHorizontalTexts', ['@page']));
        T('text', 'create', W, 'Create text', 'Adds a text object to a page.', withId({ patch: obj(textFields()) }), call('mangaPage', 'addHorizontalText', ['@page', 'patch']), true);
        T('text', 'update', W, 'Update text', 'Changes content, position, transform or typography of a text object.', withId({ textId: id('text id'), patch: obj(textFields()) }, ['textId', 'patch']), call('mangaPage', 'updateHorizontalText', ['@page', 'textId', 'patch'], 'boolean'), true);
        T('text', 'delete', W, 'Delete text', 'Removes a text object (undoable).', withId({ textId: id('text id') }, ['textId']), call('mangaPage', 'removeHorizontalText', ['@page', 'textId'], 'boolean'), true);
        T('text', 'select', W, 'Select text', 'Selects a text object in the UI.', withId({ textId: id('text id') }, ['textId']), call('mangaPage', 'selectHorizontalText', ['instanceId', 'textId'], 'boolean'));
        /* ===== balloons ===== */
        T('balloon', 'list_presets', R, 'List balloon presets', 'The 48 built-in balloon styles.', none(), call('mangaPage', 'listBalloonPresets', []));
        T('balloon', 'list', R, 'List balloons', 'Balloons of a page.', withId({}), call('mangaPage', 'listBalloons', ['@page']));
        T('balloon', 'create', W, 'Create balloon', 'Adds a dialogue balloon (preset or custom outline) with attached text.', withId({ patch: obj(balloonFields()) }), call('mangaPage', 'addBalloon', ['@page', 'patch']), true);
        T('balloon', 'update', W, 'Update balloon', 'Changes style, tail, body, text or transform of a balloon.', withId({ balloonId: id('balloon id'), patch: obj(balloonFields()) }, ['balloonId', 'patch']), call('mangaPage', 'updateBalloon', ['@page', 'balloonId', 'patch'], 'boolean'), true);
        T('balloon', 'delete', W, 'Delete balloon', 'Removes a balloon (undoable).', withId({ balloonId: id('balloon id') }, ['balloonId']), call('mangaPage', 'removeBalloon', ['@page', 'balloonId'], 'boolean'), true);
        T('balloon', 'reorder', W, 'Reorder balloon', 'Moves a balloon one step forward or backward.', withId({ balloonId: id('balloon id'), direction: en(['forward', 'backward']) }, ['balloonId', 'direction']), call('mangaPage', 'reorderBalloon', ['@page', 'balloonId', 'direction'], 'boolean'), true);
        T('balloon', 'select', W, 'Select balloon', 'Selects a balloon in the UI.', withId({ balloonId: id('balloon id') }, ['balloonId']), call('mangaPage', 'selectBalloon', ['instanceId', 'balloonId'], 'boolean'));
        T('balloon', 'set_vertex', W, 'Move balloon vertex', 'Moves one vertex of a custom balloon outline (normalized 0–1).', withId({ balloonId: id('balloon id'), index: int(0, 10000), point: point() }, ['balloonId', 'index', 'point']), call('mangaPage', 'setBalloonVertex', ['@page', 'balloonId', 'index', 'point'], 'boolean'), true);
        T('balloon', 'begin_draw', W, 'Begin custom balloon', 'Starts drawing a custom balloon outline on a page.', withId({}), call('mangaPage', 'setBalloonDrawMode', ['instanceId'], 'boolean'));
        T('balloon', 'append_point', W, 'Add outline point', 'Adds a point to the custom balloon being drawn.', obj({ point: point() }, ['point']), call('mangaPage', 'appendBalloonPoint', ['point'], 'boolean'));
        T('balloon', 'complete_draw', W, 'Complete custom balloon', 'Closes the outline and creates the balloon.', none(), call('mangaPage', 'completeBalloonDraw', [], 'created'), true);
        /* ===== effects / ink ===== */
        T('effect', 'list', R, 'List effects', 'Manga effects (ink, halftone, speed lines, focus lines), optionally for one panel.', withId({ panelId: id('panel id') }), call('mangaPage', 'listMangaEffects', ['@page', 'panelId']));
        T('effect', 'add_ink', W, 'Add ink stroke', 'Creates an ink stroke from pressure-sensitive points.', withId({ scope: effectScope(), panelId: nullableId(), points: { type: 'array', maxItems: 5000,
                items: obj({ x: num(), y: num(), pressure: num(0, 1) }, ['x', 'y', 'pressure']) },
            color: color(), size: num(0.1, 1000), opacity: num(0, 1), tip: num(0, 1) }, ['scope', 'points']), comp('effect.add_ink', ['mangaPage.addMangaEffect']), true);
        T('effect', 'add_halftone', W, 'Add halftone', 'Creates a halftone pattern effect.', withId({ scope: effectScope(), ...effectCommon(), shape: en(['circle', 'square', 'triangle', 'star', 'cross', 'heart']),
            density: num(0, 100), diameter: num(0, 1000), spacing: num(0, 1000), gradient: num(-1, 1), angle: num(-360, 360) }, ['scope']), comp('effect.add_halftone', ['mangaPage.addMangaEffect']), true);
        T('effect', 'add_speed_lines', W, 'Add speed lines', 'Creates speed lines (straight, tapered or wavy).', withId({ scope: effectScope(), ...effectCommon(), count: int(1, 2000), lineType: en(['straight', 'tapered', 'wavy']),
            length: num(0, 1e5), spread: num(0, 1000), angle: num(-360, 360), variation: num(0, 1) }, ['scope']), comp('effect.add_speed_lines', ['mangaPage.addMangaEffect']), true);
        T('effect', 'add_focus_lines', W, 'Add focus lines', 'Creates radial focus lines around a center.', withId({ scope: effectScope(), ...effectCommon(), count: int(1, 2000), centerX: num(), centerY: num(),
            minRadius: num(0, 1e5), maxRadius: num(0, 1e5), variation: num(0, 1) }, ['scope']), comp('effect.add_focus_lines', ['mangaPage.addMangaEffect']), true);
        T('effect', 'update', W, 'Update effect', 'Changes parameters of an existing effect.', withId({ effectId: id('effect id'), patch: obj({ ...effectCommon(), tip: num(0, 1), shape: str({ maxLength: 20 }),
                density: num(0, 100), diameter: num(0, 1000), spacing: num(0, 1000), gradient: num(-1, 1), angle: num(-360, 360),
                count: int(1, 2000), lineType: en(['straight', 'tapered', 'wavy']), length: num(0, 1e5), spread: num(0, 1000),
                centerX: num(), centerY: num(), minRadius: num(0, 1e5), maxRadius: num(0, 1e5), variation: num(0, 1) }) }, ['effectId', 'patch']), call('mangaPage', 'updateMangaEffect', ['@page', 'effectId', 'patch'], 'boolean'), true);
        T('effect', 'remove', W, 'Remove effect', 'Removes an effect (undoable).', withId({ effectId: id('effect id') }, ['effectId']), call('mangaPage', 'removeMangaEffect', ['@page', 'effectId'], 'boolean'), true);
        T('effect', 'select', W, 'Select effect', 'Selects an effect in the UI.', withId({ effectId: id('effect id') }, ['effectId']), call('mangaPage', 'selectMangaEffect', ['instanceId', 'effectId'], 'boolean'));
        T('effect', 'erase_ink_at', W, 'Erase ink at point', 'Erases ink within a radius of a point; returns affected strokes.', panelRef({ point: point(), radius: num(0.1, 1000) }, ['point', 'radius']), call('mangaPage', 'eraseMangaInkAt', ['@page', 'panelId', 'point', 'radius']), true);
        T('effect', 'erase_ink_path', W, 'Erase ink along path', 'Erases ink along a path.', panelRef({ points: arr(point(), 5000), radius: num(0.1, 1000) }, ['points', 'radius']), call('mangaPage', 'eraseMangaInkPath', ['@page', 'panelId', 'points', 'radius']), true);
        T('effect', 'preview_ink', R, 'Preview ink stroke', 'Vector primitives for an ink stroke without creating it.', withId({ points: arr(obj({ x: num(), y: num(), pressure: num(0, 1) }, ['x', 'y', 'pressure']), 5000),
            color: color(), size: num(0.1, 1000), opacity: num(0, 1), tip: num(0, 1) }, ['points', 'color', 'size', 'opacity', 'tip']), call('mangaPage', 'previewMangaInk', ['@page', 'points', { color: '$color', size: '$size', opacity: '$opacity', tip: '$tip' }]));
        /* ===== tools / modes ===== */
        T('tool', 'get_state', R, 'Active tool state', 'Active interaction mode (knife, vertex, crop, ink, eraser, balloon drawing) and panel focus.', none(), comp('tool.get_state', ['mangaPage.getKnifeMode', 'mangaPage.getVertexMode', 'mangaPage.getCropMode',
            'mangaPage.getMangaToolMode', 'mangaPage.getBalloonDrawMode', 'mangaPage.getFocus', 'mangaEdit.getMode']));
        T('tool', 'set_mode', W, 'Select tool', 'Activates an interaction mode for a page/panel, or "none" to leave all modes.', obj({ mode: en(['none', 'knife', 'vertex', 'crop', 'ink', 'eraser']), instanceId: id('manga-page instance id'),
            panelId: id('panel id'), layerId: id('image layer id'), color: color(), size: num(0.1, 1000),
            opacity: num(0, 1), tip: num(0, 1) }, ['mode']), comp('tool.set_mode', ['mangaPage.setKnifeMode', 'mangaPage.setVertexMode', 'mangaPage.setCropMode', 'mangaPage.setMangaToolMode']));
        /* ===== viewport ===== */
        T('viewport', 'get_ui', R, 'Get interface layout', 'Workspace mode and which side panels are open.', none(), call('ui.shell', 'getLayout', []));
        T('viewport', 'set_panel', W, 'Show / hide side panel', 'Opens or collapses the library (left) or properties (right) panel. Interface only, no document change.', obj({ panel: en(['left', 'right']), open: bool() }, ['panel', 'open']), call('ui.shell', 'setPanel', ['panel', 'open']));
        T('viewport', 'set_workspace_mode', W, 'Set workspace mode', 'Switches between studio, focus, library and manga workspace layouts. Interface only.', obj({ mode: en(['studio', 'focus', 'library', 'manga']) }, ['mode']), call('ui.shell', 'setWorkspaceMode', ['mode']));
        T('viewport', 'get', R, 'Get viewport', 'Camera position, zoom and zoom limits.', none(), comp('viewport.get', ['camera.offset']));
        T('viewport', 'set_zoom', W, 'Set zoom', 'Sets zoom centered on the viewport.', obj({ zoom: num(0.01, 100) }, ['zoom']), call('camera', 'setCentered', ['zoom'], 'done'));
        T('viewport', 'zoom_by', W, 'Zoom by factor', 'Multiplies the zoom by a factor.', obj({ factor: num(0.05, 20) }, ['factor']), call('camera', 'zoomByFactor', ['factor'], 'done'));
        T('viewport', 'fit_all', W, 'Fit all', 'Frames all content of the board.', none(), call('camera', 'fitAll', [], 'done'));
        T('viewport', 'fit_selection', W, 'Fit selection', 'Frames the current selection.', none(), call('camera', 'fitSelection', [], 'done'));
        T('viewport', 'reset', W, 'Reset viewport', 'Resets camera to the default view.', none(), call('camera', 'reset', [], 'done'));
        T('viewport', 'pan', W, 'Pan viewport', 'Centers the viewport on a world point without changing zoom.', obj({ x: num(-1e7, 1e7), y: num(-1e7, 1e7) }, ['x', 'y']), call('camera', 'panTo', ['x', 'y'], 'done'));
        /* ===== selection ===== */
        T('selection', 'set', W, 'Set selection', 'Replaces the selection with the given object ids (ids not on the current board are rejected).', obj({ objectIds: arr(id('instance id'), 200) }, ['objectIds']), call('instances', 'selectByIds', ['objectIds']));
        T('selection', 'clear', W, 'Clear selection', 'Deselects everything.', none(), call('instances', 'clearSelection', [], 'done'));
        T('selection', 'align', W, 'Align objects', 'Aligns 2+ objects to their common bounds. Returns how many moved.', obj({ objectIds: arr(id('instance id'), 200), mode: en(['left', 'center', 'right', 'top', 'middle', 'bottom']) }, ['objectIds', 'mode']), call('instances', 'align', ['objectIds', 'mode']), true);
        T('selection', 'distribute', W, 'Distribute objects', 'Spaces 3+ objects evenly along an axis. Returns how many moved.', obj({ objectIds: arr(id('instance id'), 200), axis: en(['horizontal', 'vertical']) }, ['objectIds', 'axis']), call('instances', 'distribute', ['objectIds', 'axis']), true);
        /* ===== selection (read) ===== */
        T('selection', 'get', R, 'Get selection', 'Selected instances plus selected text, balloon and effect.', none(), comp('selection.get', ['state.getInstance', 'mangaPage.getSelectedHorizontalText', 'mangaPage.getSelectedBalloon',
            'mangaPage.getSelectedMangaEffect', 'mangaEdit.getSelectedLayerId']));
        /* ===== batch (atomic, one undo step) ===== */
        const batchOps = () => ({
            type: 'array', minItems: 1, maxItems: 50,
            items: obj({
                tool: str({ pattern: '^visualboard\\.[a-z_]+\\.[a-z_]+$', maxLength: 64 }),
                args: free('arguments of the tool; a value may be {"$ref":"<as>.<path>"} to use a field of an earlier step result'),
                as: str({ pattern: '^[a-z][a-z0-9_]{0,31}$', maxLength: 32, description: 'name used by later steps to reference this result' })
            }, ['tool'])
        });
        T('batch', 'validate', R, 'Validate a batch', 'Checks a batch without changing anything: tool names, scopes, schemas of reference-free arguments, reference order and limits. Returns per-step issues and a fingerprint of the current document to pass as expectedFingerprint to batch.execute. Semantic failures (locked object, missing target) can only appear when the batch runs and trigger a full rollback.', obj({ operations: batchOps() }, ['operations']), comp('batch.validate', ['history.snapshot']));
        T('batch', 'execute', W, 'Run a batch atomically', 'Runs up to 50 write steps as ONE undo step: either every step succeeds or the document is restored exactly. The editor is locked for the user while it runs. Destructive, export, history and save tools are not allowed inside a batch. Fails with STALE_STATE if expectedFingerprint no longer matches the document.', obj({ operations: batchOps(), expectedFingerprint: str({ maxLength: 400, description: 'fingerprint returned by batch.validate' }) }, ['operations']), comp('batch.execute', ['history.transaction', 'history.snapshot']), true);
        /* ===== events ===== */
        T('events', 'poll', R, 'Poll editor events', 'Recent editor events (state, selection, history, boards, camera, page changes) after a sequence number, tagged source user or automation. Carries ids only, never document content.', obj({ sinceSeq: int(0, 1e9), limit: int(1, 200), source: en(['user', 'automation']), names: arr(str({ maxLength: 40 }), 20) }), comp('events.poll'));
        /* ===== history ===== */
        T('history', 'cancel', W, 'Cancel a request', 'Cancels a queued request, or a running batch (which is rolled back completely). A single running operation cannot be interrupted. Runs outside the queue.', obj({ requestId: str({ minLength: 1, maxLength: 64, pattern: '^[\\w.:-]{1,64}$' }) }, ['requestId']), comp('history.cancel'));
        T('history', 'get_state', R, 'History state', 'Undo/redo availability and unsaved-changes flag.', none(), comp('history.get_state', ['history.canUndo', 'history.canRedo', 'history.isDirty']));
        T('history', 'undo', W, 'Undo', 'Undoes the last document change (same stack as the user).', none(), call('history', 'undo', [], 'boolean'));
        T('history', 'redo', W, 'Redo', 'Redoes the last undone change.', none(), call('history', 'redo', [], 'boolean'));
        /* ===== export ===== */
        T('export', 'validate', R, 'Validate export', 'Preflight for exporting the given pages (defaults to all pages on the board).', obj({ instanceIds: arr(id(), 200), ...exportOpts() }), comp('export.validate', ['mangaExport.validateExport', 'mangaExport.collectMangaPagesOnCurrentBoard']));
        T('export', 'inspect_output', R, 'Inspect export output', 'Output pixel size, DPI and warnings for a page without exporting.', withId(exportOpts()), comp('export.inspect_output', ['mangaExport.renderPageToCanvas']));
        T('export', 'png', X, 'Export page as PNG', 'Renders a page to PNG. The browser download is triggered; the report lists file name, size and dimensions.', withId(exportOpts()), call('mangaExport', 'exportPng', ['@page', { dpi: '$dpi', quality: '$quality', maxPixels: '$maxPixels', maxSide: '$maxSide' }]));
        T('export', 'png_bytes', X, 'Render page to PNG bytes', 'Renders a page and returns the PNG as base64 without a browser download. Fails with LIMIT_EXCEEDED when the image does not fit the response limit; lower dpi/quality or use export.png.', withId(exportOpts()), comp('export.png_bytes', ['mangaExport.renderPageToBlob']));
        T('export', 'prepare_transfer', X, 'Render page for file transfer', 'Renders a page to PNG and keeps it in memory for two minutes so the MCP server can copy it to disk in chunks (no 1 MB response limit). Returns transferId, size, sha256, dimensions and warnings. Used by visualboard_export_save_png.', withId(exportOpts()), comp('export.prepare_transfer', ['mangaExport.renderPageToBlob']));
        T('export', 'preview', R, 'Page preview', 'Small JPEG thumbnail of a page (longest side up to maxSide, default 512).', withId({ maxSide: int(64, 1024) }), comp('export.preview', ['mangaExport.renderPageToBlob', 'mangaPage.getPanelSet']));
        T('export', 'cropped_layer', X, 'Export cropped image', 'Exports one cropped image layer as PNG.', layerRef(exportOpts()), call('mangaExport', 'exportCroppedLayer', ['@page', 'panelId', 'layerId',
            { dpi: '$dpi', quality: '$quality', maxPixels: '$maxPixels', maxSide: '$maxSide' }]));
        T('export', 'pdf_pages', X, 'Export pages as PDF', 'Exports the given pages (default: all on the board) as one PDF.', obj({ instanceIds: arr(id(), 200), ...exportOpts() }), comp('export.pdf_pages', ['mangaExport.exportChapterPdf', 'mangaExport.collectMangaPagesOnCurrentBoard']));
        T('export', 'pdf_selection', X, 'Export selection as PDF', 'Exports the selected pages as a PDF.', none(), call('mangaExport', 'exportSelectionAsPdf', []));
        T('export', 'pdf_board', X, 'Export board as PDF', 'Exports every page on the current board as a PDF.', none(), call('mangaExport', 'exportWholeBoardAsPdf', []));
        /* ---------- gaps (documentados, nada inventado) ---------- */
        const gap = (idv, tool, domain, summary, proposal, phase = 2) => ({ id: idv, tool: 'visualboard.' + tool, domain, summary, proposal, phase });
        const gaps = [
            gap('GAP-LAYER-GROUP', 'layer.group', 'layer', 'DECIDIDO NA FASE 5 — NÃO IMPLEMENTAR AINDA. Agrupar/desagrupar exige um conceito novo de grupo (nível extra na árvore, herança de visibilidade/trava no renderizador, persistência no formato v3 e interface da árvore). Não foi inventado comportamento; precisa de decisão de produto e de uma versão do formato de projeto.', 'mangaPage: groupLayers/ungroupLayers + campo de grupos no formato do projeto', 5),
            gap('GAP-LAYER-CREATE', 'layer.create', 'layer', 'DECIDIDO NA FASE 5 — NÃO IMPLEMENTAR AINDA. Camada vazia (contêiner) depende do mesmo conceito de grupo/pasta de layer.group; hoje os contêineres são os painéis do layout e a sobreposição da página. Para ter uma camada de imagem use asset.import + image_layer.add.', 'mangaPage: addLayerContainer junto com o conceito de grupo', 5),
            gap('GAP-EXPORT-SVG', 'export.svg', 'export', 'DECIDIDO NA FASE 5 — NÃO IMPLEMENTAR. O renderizador de página é raster (canvas); um SVG fiel exigiria um segundo renderizador, vedado pelo projeto, e um SVG que apenas embute o PNG seria enganoso. A geometria dos painéis já é SVG (panelSets.downloadSvg / project.export). Reabrir só se o produto decidir ter exportação vetorial própria.', 'decidir se o editor passa a ter exportação vetorial própria antes de expor', 5)
        ];
        const serverTools = [
            { name: 'visualboard.catalog.view', title: 'View catalog images', domain: 'catalog', scope: 'read',
                description: 'MCP-server tool. Fetches up to 8 images from the Asset Hub (thumbnail or full size) and returns them as images you can SEE, with their metadata, so you can classify them with catalog.classify. Needs the Hub configured in the MCP server.',
                input: obj({ ids: arr(hubId(), 8), size: en(['thumb', 'full'], 'thumb (default, ~320px) or the original file') }, ['ids']),
                uses: ['visualboard.catalog.get'] },
            { name: 'visualboard.asset.import_from_path', title: 'Import image from disk', domain: 'asset', scope: 'write',
                description: 'MCP-server tool. Reads an image file from the configured import folders (never anywhere else; symlinks are resolved and must stay inside), checks size and signature, and imports it with asset.import.',
                input: obj({ path: str({ minLength: 1, maxLength: 1024, description: 'file name or path inside an allowed import folder' }), name: str({ maxLength: 200 }), packageId: id('package id') }, ['path']),
                uses: ['visualboard.asset.import'] },
            { name: 'visualboard.export.save_png', title: 'Export page PNG to disk', domain: 'export', scope: 'export',
                description: 'MCP-server tool. Renders the page (export.prepare_transfer), copies the PNG in chunks into the export folder (never overwrites unless overwrite=true), verifies the signature, size and sha256, and returns the path and the verification report.',
                input: withId({ ...exportOpts(), fileName: str({ minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', description: 'file name without folders; .png is added when missing' }), overwrite: bool() }, ['fileName']),
                uses: ['visualboard.export.prepare_transfer'] },
            { name: 'visualboard.video.import_clip_from_path', title: 'Import audio from disk', domain: 'video', scope: 'write',
                description: 'MCP-server tool. Reads a voice/sound-effect/music file (WAV, MP3, OGG, FLAC, M4A, WebM) from the configured import folders (never elsewhere), checks size and signature, and imports it with video.import_clip.',
                input: obj({ videoId: videoId(), path: str({ minLength: 1, maxLength: 1024, description: 'file name or path inside an allowed import folder' }), kind: en(['voice', 'sfx', 'music']), label: str({ maxLength: 80 }) }, ['videoId', 'path']),
                uses: ['visualboard.video.import_clip'] },
            { name: 'visualboard.video.save_mp4', title: 'Save exported video to disk', domain: 'video', scope: 'export',
                description: 'MCP-server tool. Waits (up to waitSeconds, default 50) for an export job from video.export_start, then copies the MP4 in chunks into the export folder (never overwrites unless overwrite=true) and verifies size and sha256. While the job is still running it returns its progress: call it again with the same jobId.',
                input: obj({ jobId: id('export job id'), fileName: str({ minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9][A-Za-z0-9._-]*$', description: 'file name without folders; .mp4 is added when missing' }), overwrite: bool(), waitSeconds: int(0, 300) }, ['jobId', 'fileName']),
                uses: ['visualboard.video.export_status'] },
            { name: 'visualboard.catalog.add_from_path', title: 'Add image from disk to catalog', domain: 'catalog', scope: 'write',
                description: 'MCP-server tool. Reads an image from the configured import folders (never elsewhere) and uploads it to the Asset Hub with catalog.add.',
                input: obj({ path: str({ minLength: 1, maxLength: 1024 }), folderId: hubId('folder id'), tags: tagList(), ...catMeta() }, ['path']),
                uses: ['visualboard.catalog.add'] },
            { name: 'visualboard.export.verify_file', title: 'Verify exported file', domain: 'export', scope: 'read',
                description: 'MCP-server tool. Checks a PNG/JPEG/PDF file inside the export or import folders: signature, size, pixel dimensions, DPI (PNG pHYs) and sha256. Reads only the header and a hash; does not return file content.',
                input: obj({ path: str({ minLength: 1, maxLength: 1024 }) }, ['path']),
                uses: [] }
        ];
        const excl = (target, reason) => ({ target, reason });
        const exclusions = [
            excl('utils', 'Utilitários internos sem semântica de documento.'),
            excl('storage', 'Backend de persistência interno; exposto apenas por project.save/export.'),
            excl('storage-fs', 'Persistência em arquivo: depende de permissões/diálogos do navegador, fora do escopo de automação.'),
            excl('storage-fs-dir', 'Persistência em pasta: depende de permissões/diálogos do navegador.'),
            excl('storage-ls', 'Persistência no armazenamento local do navegador: detalhe interno.'),
            excl('backend', 'Fachada de persistência interna.'),
            excl('projectFormat', 'Codec do formato de projeto; coberto por project.export/import/validate.'),
            excl('documentSnapshot', 'Mecanismo interno de snapshot do Undo/Redo; somente leitura via composites.'),
            excl('svgGeometry', 'Biblioteca geométrica interna usada por panelSets e mangaPage.'),
            excl('panelMigration', 'Planejamento interno de migração; exposto via page.plan_panel_set_change/change_panel_set.'),
            excl('renderer', 'Renderização do canvas, sem estado de documento.'),
            excl('minimap', 'Renderização de UI.'),
            excl('rendererManga', 'Renderização de UI.'),
            excl('interaction', 'Entrada por ponteiro/teclado do usuário; a automação usa os métodos de domínio equivalentes.'),
            excl('imageProcessors', 'Registro interno de processadores; consulta via image.list_processors.'),
            excl('imageCanvasProcessor', 'Implementação interna do processador por canvas.'),
            excl('mangaExportPreflight', 'Usado por project.validate; sem ferramenta própria.'),
            excl('ui.dialogs', 'Diálogos do usuário; usados apenas pelo adaptador para confirmações.'),
            excl('ui.shell', 'Renderização da casca de UI; controle de painéis via viewport.set_panel.'),
            excl('ui.library', 'Renderização de UI.'),
            excl('ui.pageFormats', 'Renderização de UI.'),
            excl('ui.packages', 'Renderização de UI.'),
            excl('ui.canvas', 'Marcador de UI sem métodos.'),
            excl('contextMenu', 'Menu de contexto do usuário.'),
            excl('assetHub', 'Cliente do Asset Hub: exposto pelas ferramentas catalog.* (que o chamam), não por ferramentas próprias.'),
            excl('commandConsole', 'Console de comandos: é o próprio cliente local do contrato, não uma capacidade a automatizar.'),
            excl('panelInspector', 'Renderização de UI.'),
            excl('ui.storage', 'Renderização de UI.'),
            excl('ui.accessibility', 'Anúncios de acessibilidade internos.'),
            excl('ui.imageOperations', 'Diálogo de operações de imagem; automação usa image.apply_command.'),
            excl('debug', 'Painel de depuração.'),
            excl('state', 'Acessores internos; cobertos pelos composites de leitura (ver uses).'),
            excl('app.boot', 'Inicialização única do aplicativo.'),
            excl('app.scheduleSave', 'Detalhe interno do autosave.'),
            excl('app.backupNow', 'Backup baixa um arquivo no navegador; equivalente a project.export.'),
            excl('app.switchBackend', 'Troca de backend exige diálogo de permissão do navegador.'),
            excl('assets.ensureDefaultPackage', 'Chamado internamente por importFiles; o pacote padrão não precisa de ferramenta.'),
            excl('assets.getUrl', 'URLs blob: são válidas só na página; metadados via asset.get.'),
            excl('assets.hasUrl', 'Detalhe interno.'),
            excl('assets.createFromFile', 'Coberto por assets.importFiles (asset.import).'),
            excl('assets.restoreFromStorage', 'Inicialização interna.'),
            excl('assets.restoreHistoryBlobs', 'Mecanismo interno do Undo/Redo.'),
            excl('history.push', 'Mecanismo interno; a automação usa operações que já criam passos de Undo.'),
            excl('history.clear', 'Destrutivo e sem caso de uso de automação.'),
            excl('history.markSaved', 'Mecanismo interno do autosave.'),
            excl('history.cancelGesture', 'Cancela gesto de UI do usuário.'),
            excl('history.isRestoring', 'Detalhe interno.'),
            excl('boards.current', 'Equivalente a app.get_context.'),
            excl('boards.depthOf', 'Derivável do caminho retornado por board.list/board.get_path.'),
            excl('packages.assetsOf', 'Coberto por asset.list com packageId.'),
            excl('imageCommands.execute', 'Devolve um Blob intermediário não serializável; image.apply_command grava o resultado como asset.'),
            excl('imageCommands.process', 'Despacha para execute ou apply conforme o destino; a automação usa image.apply_command.'),
            excl('automation', 'Camada de automação em si (adaptador): não é uma operação do editor.'),
            excl('automationContract', 'Catálogo do contrato de automação: não é uma operação do editor.'),
            excl('camera.apply', 'Detalhe de renderização.'),
            excl('camera.zoomAt', 'Depende de coordenadas de tela.'),
            excl('camera.screenToWorld', 'Depende de coordenadas de tela.'),
            excl('camera.worldToScreen', 'Depende de coordenadas de tela.'),
            excl('camera.clampCamera', 'Detalhe interno.'),
            excl('camera.fitBounds', 'Coberto por fit_all/fit_selection.'),
            excl('camera.bounds', 'Detalhe interno.'),
            excl('panelSets.parsePathToPoints', 'Auxiliar de parsing interno.'),
            excl('panelSets.getOriginalSvg', 'Possível payload grande; fora da v1.'),
            excl('panelSets.downloadSvg', 'Dispara download no navegador.'),
            excl('panelSets.thumbSvg', 'Miniatura de UI.'),
            excl('panelSets.rename', 'Pendente de decisão de produto; ver panel_set em backlog.'),
            excl('panelSets.remove', 'Pendente de decisão de produto (impacto em páginas existentes).'),
            excl('panelSets.promptImport', 'Abre diálogo de arquivo.'),
            excl('panelSets.promptPick', 'Abre diálogo de seleção.'),
            excl('panelSets.syncAll', 'Sincronização interna com a pasta do projeto.'),
            excl('composition.open', 'Abre o popup de interface (seleção do usuário).'),
            excl('composition.close', 'Fecha o popup de interface.'),
            excl('composition.selectedImageIds', 'Seleção da interface; a automação informa objectIds.'),
            excl('composition.planFrame', 'Algoritmo puro interno; a automação usa composition.plan e spread.plan.'),
            excl('spread.open', 'Abre o popup de interface.'),
            excl('spread.close', 'Fecha o popup de interface.'),
            excl('ui.video.open', 'Abre o editor de vídeo da interface.'),
            excl('ui.video.close', 'Fecha o editor de vídeo da interface.'),
            excl('ui.video.isOpen', 'Estado da interface.'),
            excl('video.compileWith', 'Compilação pura interna; a automação usa video.plan (video.compile).'),
            excl('video.defaultSettings', 'Valores padrão já expostos por video.catalog.'),
            excl('videoRender.prepare', 'Retorna sessão com canvases/sprites; a automação exporta via video.export_start.'),
            excl('videoRender.prepareProject', 'Retorna sessão com canvases/sprites; a automação exporta via video.export_start.'),
            excl('videoExport.mixAudio', 'Mixagem interna do export; resultado só existe dentro do job.'),
            excl('videoExport.download', 'Dispara download no navegador; a automação usa video.export_start e save_mp4.'),
            excl('panelTemplates.flowPosition', 'Auxiliar de interface: page.create_from_template já posiciona a página na fila.'),
            excl('panelTemplates.focusPage', 'Auxiliar de interface: move a câmera; use viewport.fit_selection.'),
            excl('panelTemplates.promptPick', 'Abre diálogo de seleção.'),
            excl('panelTemplates.pickAndCreate', 'Abre diálogo de seleção.'),
            excl('instances.addBoard', 'Inserir link de board no canvas: decisão de produto pendente (a árvore de boards já é manipulada por board.*); não exposto na Fase 2.'),
            excl('instances.removeSelection', 'Opera sobre a seleção da UI; a automação usa instance.remove (instances.removeById).'),
            excl('instances.duplicateSelection', 'Opera sobre a seleção da UI; a automação usa instance.duplicate (instances.duplicateById).'),
            excl('instances.reorder', 'Opera sobre a seleção da UI; a automação usa instance.reorder (instances.reorderById).'),
            excl('instances.rotateSelection', 'Opera sobre a seleção da UI; a automação usa instance.update com rotation.'),
            excl('instances.restoreAspect', 'Opera sobre a seleção da UI; equivalente por id não é necessário (instance.update aceita width e height).'),
            excl('instances.nudge', 'Opera sobre a seleção da UI; a automação usa instance.update com x e y.'),
            excl('instances.copySelection', 'Usa a área de transferência do usuário.'),
            excl('instances.pasteClipboard', 'Usa a área de transferência do usuário.'),
            excl('mangaPage.promptChangePanelSet', 'Abre diálogo; use page.change_panel_set.'),
            excl('mangaPage.hitTestMangaPage', 'Detecção por ponteiro.'),
            excl('mangaPage.hitTestPanel', 'Detecção por ponteiro.'),
            excl('mangaPage.tryDrop', 'Arrastar-e-soltar do usuário; use image_layer.add.'),
            excl('mangaPage.getActivePanelId', 'Incluído em app.get_context via getFocus.'),
            excl('mangaPage.horizontalTextLayout', 'Derivado de renderização; o objeto texto já contém os dados.'),
            excl('mangaPage.balloonTextLayout', 'Derivado de renderização.'),
            excl('mangaPage.balloonPaths', 'Derivado de renderização.'),
            excl('mangaPage.mangaEffectPrimitives', 'Derivado de renderização.'),
            excl('mangaEdit.isActive', 'Estado de edição de UI; ver tool.get_state.'),
            excl('mangaEdit.isEditingPanel', 'Estado de edição de UI.'),
            excl('mangaEdit.enter', 'Entra no modo de edição de UI; usar tool.set_mode.'),
            excl('mangaEdit.exit', 'Sai do modo de edição de UI; usar tool.set_mode none.'),
            excl('mangaEdit.setSelectedLayer', 'Seleção de camada na UI; sem efeito no documento. Seleção de objetos é selection.set.'),
            excl('mangaEdit.hitTestLayer', 'Detecção por ponteiro.'),
            excl('mangaEdit.getPanelBounds', 'Coberto por panel.list (geometria).'),
            excl('mangaEdit.instanceById', 'Acessor interno.')
        ];
        const resources = [
            { uri: 'visualboard://app/status', title: 'Application status', description: 'Versions, boot state and connection.',
                mimeType: 'application/json', handler: 'app.status', uses: ['app.isDirty'] },
            { uri: 'visualboard://capabilities', title: 'Capability catalog', description: 'Registered capabilities and contract versions.',
                mimeType: 'application/json', handler: 'app.capabilities', uses: [] },
            { uri: 'visualboard://project', title: 'Project structure', description: 'Boards, assets, packages and counts.',
                mimeType: 'application/json', handler: 'project.get', uses: ['state.getCurrentBoard'] },
            { uri: 'visualboard://selection', title: 'Selection and edit context', description: 'Current selection and active tool.',
                mimeType: 'application/json', handler: 'selection.get', uses: ['state.getInstance'] },
            { uri: 'visualboard://layers', title: 'Layer tree of the focused page', description: 'Hierarchy of the page in focus.',
                mimeType: 'application/json', handler: 'resource.layers', uses: ['mangaPage.listLayerTree', 'mangaPage.getFocus'] },
            { uri: 'visualboard://history', title: 'History state', description: 'Undo/redo availability and unsaved-changes flag.',
                mimeType: 'application/json', handler: 'history.get_state', uses: ['history.canUndo', 'history.canRedo', 'history.isDirty'] },
            { uri: 'visualboard://video', title: 'Voice-comic videos', description: 'Video projects of the current board with shots, clips and settings.',
                mimeType: 'application/json', handler: 'resource.video', uses: ['video.list'] },
            { uri: 'visualboard://docs/operations', title: 'Operational guide', description: 'Coordinate systems, units, ordering, limits.',
                mimeType: 'text/markdown', handler: 'docs.operations', uses: [] }
        ];
        const prompts = [
            { name: 'create_manga_page', title: 'Create a manga page',
                description: 'Builds a manga page with N panels, images, balloons and an effect, then exports PNG.',
                arguments: [{ name: 'panels', description: 'Number of panels', required: true },
                    { name: 'description', description: 'What the page shows', required: false }],
                template: 'Prefer one atomic visualboard.batch.execute (validate it first with batch.validate; reference earlier results with {"$ref":"step.result.instance.id"}). Use visualboard.app.get_status, then page.list_templates to choose a layout with {{panels}} panels, page.create_from_template, panel.list, image_layer.add, balloon.create (attach text), effect.add_speed_lines, project.validate and finally visualboard_export_save_png (writes the PNG to the export folder and verifies it; use export.png only for a browser download). Page content: {{description}}. Report each tool result.' },
            { name: 'review_document', title: 'Review document', description: 'Inspects the project and reports problems.',
                arguments: [], template: 'Call project.get, project.validate and layer.list for each page; summarize problems without modifying the document.' },
            { name: 'prepare_export', title: 'Prepare export', description: 'Validates pages and checks export output size/DPI.',
                arguments: [{ name: 'dpi', description: 'Target DPI', required: false }],
                template: 'Call export.validate, then export.inspect_output with dpi {{dpi}} for each page; fix warnings, then call visualboard_export_save_png and check the returned verification report (valid, width, height, dpi, sha256).' },
            { name: 'organize_composition', title: 'Organize composition', description: 'Reviews and tidies panels and layers of a page.',
                arguments: [{ name: 'instanceId', description: 'Page instance', required: true }],
                template: 'For page {{instanceId}} call panel.list and layer.list. Fix overlaps or empty panels with panel.create/panel.delete (use mergeInto to keep layers), move content with layer.move_object, reorder with layer.reorder, then project.validate. Prefer one atomic batch and tell the user what changed; everything is undoable.' },
            { name: 'apply_layout', title: 'Apply layout', description: 'Changes a page layout preserving content.',
                arguments: [{ name: 'instanceId', description: 'Page instance', required: true }, { name: 'templateId', description: 'Template', required: true }],
                template: 'Use page.plan_panel_set_change for {{instanceId}} with the panel set of {{templateId}}; review unassigned panels, then page.change_panel_set.' },
            { name: 'create_voice_comic', title: 'Create a voice-comic video', description: 'Turns the manga pages into a narrated video and exports an MP4.',
                arguments: [{ name: 'audioFolder', description: 'Import-folder file names of the voices, in reading order', required: false }],
                template: 'Call video.create, video.auto_build (one shot per panel in reading order), then for each voice file call visualboard_video_import_clip_from_path (kind voice) and video.bind_in_order. Add sound effects/music with video.import_clip kind sfx/music + video.add_audio_event, camera/image effects with video.add_fx, and subtitles with video.update_settings if wanted. Review with video.plan and video.estimate (fix warnings), then video.export_start (mode hub for H.264, otherwise browser) and visualboard_video_save_mp4 with the jobId; check the returned verification. Audio files: {{audioFolder}}.' },
            { name: 'check_integrity', title: 'Check project integrity', description: 'Validates structure and export readiness.',
                arguments: [], template: 'Call project.validate and history.get_state; list any page with errors.' }
        ];
        const document = {
            contract: 'visualboard.automation',
            version: CONTRACT_VERSION,
            toolNamePattern: '^visualboard\\.[a-z_]+\\.[a-z_]+$',
            scopes: {
                read: 'Reads document or application state; never changes it.',
                write: 'Changes the open document through undoable domain operations.',
                export: 'Produces files (browser downloads) or project payloads.',
                destructive: 'High-impact change; always asks the user for confirmation per call (the editor may add its own dialog).'
            },
            limits: { maxRequestBytes: 30000000, maxStringLength: 100000, maxArrayItems: 5000, maxObjectKeys: 200,
                maxResultBytes: 1000000, maxResultDepth: 12, maxPendingRequests: 32, auditLogEntries: 500,
                requestTimeoutMs: 60000, confirmTimeoutMs: 120000,
                maxBatchOperations: 50, batchTimeoutMs: 120000, gestureWaitMs: 2000, maxEvents: 500, maxEventsPerPoll: 200, maxBatchRefs: 200 },
            errors: [
                { code: 'AUTOMATION_DISABLED', description: 'Automation is off (default) or the session was revoked.', retryable: false },
                { code: 'PERMISSION_DENIED', description: 'The tool scope is not granted by the user.', retryable: false },
                { code: 'CONFIRMATION_DENIED', description: 'The user declined or did not answer the confirmation.', retryable: false },
                { code: 'UNKNOWN_TOOL', description: 'No such tool in contract v1.', retryable: false },
                { code: 'NOT_IMPLEMENTED', description: 'The operation is a documented gap.', retryable: false },
                { code: 'INVALID_ARGUMENT', description: 'Input failed schema validation; issues[] lists the paths.', retryable: false },
                { code: 'CAPABILITY_UNAVAILABLE', description: 'A required capability is not ready in this build.', retryable: false },
                { code: 'NOT_FOUND', description: 'Referenced object does not exist (deleted or wrong id).', retryable: false },
                { code: 'OPERATION_REJECTED', description: 'The domain operation refused the change (invalid geometry, locked, etc.).', retryable: false },
                { code: 'LIMIT_EXCEEDED', description: 'Request or result exceeds a contract limit.', retryable: false },
                { code: 'STALE_STATE', description: 'The document changed since the state the caller validated against (expectedFingerprint); re-read and retry.', retryable: false },
                { code: 'CANCELLED', description: 'The request was cancelled (history.cancel) before it finished; a cancelled batch is fully rolled back.', retryable: true },
                { code: 'BUSY', description: 'Too many pending requests, or the user is in the middle of an edit gesture.', retryable: true },
                { code: 'TIMEOUT', description: 'The operation exceeded its time limit.', retryable: true },
                { code: 'HUB_UNAVAILABLE', description: 'The Asset Hub is not connected or cannot be reached (catalog.* tools).', retryable: true },
                { code: 'INTERNAL', description: 'Unexpected failure inside the application.', retryable: false }
            ],
            tools, gaps, serverTools, exclusions, resources, prompts
        };
        const deepFreeze = (value) => {
            if (value && typeof value === 'object' && !Object.isFrozen(value)) {
                Object.freeze(value);
                for (const key of Object.keys(value))
                    deepFreeze(value[key]);
            }
            return value;
        };
        deepFreeze(document);
        kernel.provide('automationContract', {
            describe: () => document,
            listTools: () => document.tools,
            getTool: (name) => document.tools.find(tool => tool.name === name) || null
        });
    }
});
