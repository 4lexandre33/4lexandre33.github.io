/* GeoMannequin — primeiro desenho da página */
import { autoFit } from "../scene/enquadrar.js";
import { refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { updateModeButtons } from "./modos.js";
import { setTab } from "./exportar.js";
import { draw } from "./palco.js";
import { decodeScene, loadFromHash, sceneLink } from "./link.js";
import { P, SCN } from "../scene/modelo.js";
import { camera, cena } from "../scene/comandos.js";



/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarInicio(){
  autoFit();
  refreshScene();
  syncControls();
  updateModeButtons();
  setTab("svg");
  draw();
  loadFromHash();
  window.gmScene=()=>({SCN,P,cena,camera,sceneLink,decodeScene});
}

export {  };
