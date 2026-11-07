/* GeoMannequin — ponte com a página: atalho $ e ganchos que a interface registra (fora do navegador não fazem nada) */

const $=id=>document.getElementById(id);

/* ganchos: a cena chama a tela sem depender dela (no navegador, a interface registra as funções; fora dele, nada acontece) */
const ganchos={};
export function definirGanchos(o){Object.assign(ganchos,o)}
function refreshScene(...a){if(ganchos.refreshScene)return ganchos.refreshScene(...a)}
function syncControls(...a){if(ganchos.syncControls)return ganchos.syncControls(...a)}
function render(...a){if(ganchos.render)return ganchos.render(...a)}
function updateModeButtons(...a){if(ganchos.updateModeButtons)return ganchos.updateModeButtons(...a)}

export { $, refreshScene, syncControls, render, updateModeButtons };
