/* GeoMannequin — restaura a última sessão salva no navegador */
import { applyState } from "../scene/estado.js";
import { applyStyle } from "./estilo.js";
import { styleName } from "../scene/paletas.js";



/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarPersistencia(){
  try{
    const s=JSON.parse(localStorage.getItem("geomannequin.v8")||localStorage.getItem("geomannequin.v7")||"null");
    if(s)applyState(s);
  }catch(e){}
  applyStyle(styleName);
}

export {  };
