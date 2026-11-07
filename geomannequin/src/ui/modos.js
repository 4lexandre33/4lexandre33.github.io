/* GeoMannequin — botões de modo (manequim, construção) */
import { $ } from "../scene/ambiente.js";
import { mode } from "../scene/modos.js";

function updateModeButtons(){
  $("modeMan").setAttribute("aria-pressed",String(mode==="manequim"));
  $("modeCon").setAttribute("aria-pressed",String(mode==="construcao"));
}

export { updateModeButtons };
