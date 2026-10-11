"use strict";
/**
 * VP1-005 — Preparação isolada de comandos editoriais P1.
 * Não é carregado por index.html e não registra novas capabilities.
 * Prevê transformação sobre cópia serializada de HistorySnapshot,
 * confirmação via history.transaction existente e cancelamento sem efeito.
 */
var NVBVP1;
(function (NVBVP1) {
    NVBVP1.version = '0.1.0';
    function invariant(ok, code) {
        if (!ok)
            throw new Error(code);
    }
    /**
     * Esta operação não chama state, backend, history.push nem APIs de arquivos.
     * A transformação recebe um novo documento desserializado do snapshot.
     * Funções injetadas devem ser puras; efeitos externos não são permitidos.
     */
    function preview(captured, transform, validate) {
        invariant(!!captured && typeof captured.document === 'string' &&
            typeof captured.fingerprint === 'string', 'VP1_INVALID_SNAPSHOT');
        invariant(typeof transform === 'function' && typeof validate === 'function', 'VP1_INVALID_PREVIEW_HANDLERS');
        // JSON.parse cria um grafo separado do documento vivo e de suas imagens Blob.
        const draft = JSON.parse(captured.document);
        transform(draft);
        const verdict = validate(draft);
        invariant(!!verdict && typeof verdict.valid === 'boolean' &&
            Array.isArray(verdict.issues), 'VP1_INVALID_VALIDATOR_RESULT');
        return {
            status: verdict.valid ? 'ready' : 'invalid',
            baselineFingerprint: captured.fingerprint,
            draft: verdict.valid ? draft : null,
            issues: verdict.issues.slice()
        };
    }
    NVBVP1.preview = preview;
    /**
     * Confirmar nunca despeja o JSON da prévia por cima do projeto vivo:
     * apply utiliza exclusivamente as APIs existentes (mangaPage, assets etc.).
     * check valida o estado pós-aplicação e lança erro para acionar o rollback
     * que já existe no history.transaction do VisualBoard.
     */
    async function confirm(history, prepared, label, apply, check) {
        invariant(prepared.status === 'ready' && prepared.draft !== null, 'VP1_PREVIEW_NOT_READY');
        invariant(typeof label === 'string' && label.trim().length > 0, 'VP1_INVALID_COMMAND_LABEL');
        invariant(typeof apply === 'function' && typeof check === 'function', 'VP1_INVALID_COMMIT_HANDLERS');
        // Primeiro rejeitar uma prévia obsoleta sem abrir transação. Repetir
        // o teste dentro dela protege contra alterações no intervalo entre as etapas.
        invariant(history.snapshot().fingerprint === prepared.baselineFingerprint, 'VP1_STALE_PREVIEW');
        return history.transaction(label, async () => {
            invariant(history.snapshot().fingerprint === prepared.baselineFingerprint, 'VP1_STALE_PREVIEW');
            const value = await apply();
            await check();
            return { status: 'committed', value };
        });
    }
    NVBVP1.confirm = confirm;
    /** Fechar a prévia não escreve no documento ou no histórico. */
    function cancel(_prepared) {
        return { status: 'cancelled' };
    }
    NVBVP1.cancel = cancel;
})(NVBVP1 || (NVBVP1 = {}));
