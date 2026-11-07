/* GeoMannequin — aplica o estilo de cor do manequim na página */
import { STYLES, setPAL_EXPORT, setStyleName } from "../scene/paletas.js";

const STYLE_VARS={cobalt:"--g-blue",coral:"--g-red",ink:"--m-ink",fill:"--fill",shade1:"--shade1",shade2:"--shade2",shade3:"--shade3"};
function applyStyle(name){
  if(!STYLES[name])name="creme";
  setStyleName(name);setPAL_EXPORT(STYLES[name]);
  const svg=document.getElementById("svg");
  Object.keys(STYLE_VARS).forEach(k=>{if(name==="creme")svg.style.removeProperty(STYLE_VARS[k]);else svg.style.setProperty(STYLE_VARS[k],STYLES[name][k])});
  document.querySelectorAll("[data-style]").forEach(b=>b.setAttribute("aria-pressed",b.dataset.style===name?"true":"false"));
}

export { STYLE_VARS, applyStyle };
