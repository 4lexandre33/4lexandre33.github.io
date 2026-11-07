/* GeoMannequin — tema claro/escuro/sistema */
import { $ } from "./ambiente.js";

/* tema: sistema → claro → escuro */
const THEMES=[["sistema",""],["claro","light"],["escuro","dark"]];
let themeIdx=0;
function applyTheme(i){themeIdx=i;const t=THEMES[i][1];if(t)document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme;
  $("themeBtn").textContent="Tema: "+THEMES[i][0];try{localStorage.setItem("geomannequin.theme",THEMES[i][0])}catch(e){}}

export { THEMES, themeIdx, applyTheme };
