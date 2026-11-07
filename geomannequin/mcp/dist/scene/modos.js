/* GeoMannequin — camadas visíveis e modos (manequim, construção) */
import { LAY } from "./parametros.js";
import { updateModeButtons } from "./ambiente.js";
import { PRESETS } from "../engine/index.js";

let L={};
let mode="manequim";
function setPreset(name){mode=name;LAY.forEach(l=>L[l.k]=!!PRESETS[name][l.k]);updateModeButtons()}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarModos(){
  setPreset("manequim");
}

/* alteração de variáveis deste módulo por outros módulos */
export function setMode(v){return mode=v}

export { L, mode, setPreset };
