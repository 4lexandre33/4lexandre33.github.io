/* GeoMannequin — botão de tema e preferência salva */
import { $ } from "../scene/ambiente.js";
import { THEMES, applyTheme, themeIdx } from "../scene/tema.js";
import { refreshScene } from "./painel-cena.js";
import { render } from "./palco.js";



/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarTema(){
  $("themeBtn").addEventListener("click",()=>{applyTheme((themeIdx+1)%3);refreshScene();render()});
  try{const t=localStorage.getItem("geomannequin.theme");const i=THEMES.findIndex(x=>x[0]===t);if(i>0)applyTheme(i)}catch(e){}
  if(window.matchMedia)try{matchMedia("(prefers-color-scheme: dark)").addEventListener("change",()=>{refreshScene();render()})}catch(e){}
}

export {  };
