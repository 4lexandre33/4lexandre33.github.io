/* GeoMannequin — link da cena (#cena=…): gerar, copiar e abrir */
import { applyState, sceneState } from "../scene/estado.js";
import { L } from "../scene/modos.js";
import { styleName } from "../scene/paletas.js";
import { THEMES, applyTheme, themeIdx } from "../scene/tema.js";
import { $ } from "../scene/ambiente.js";
import { refreshScene, sceneMsg } from "./painel-cena.js";
import { outEl, outLine } from "./editor.js";
import { applyStyle } from "./estilo.js";
import { syncControls } from "./controles.js";
import { updateModeButtons } from "./modos.js";
import { draw } from "./palco.js";

/* link da cena: #cena=z<deflate-raw base64url> ou #cena=j<json base64url> — o mesmo formato que o servidor MCP gera */
function b64u(bytes){let b="";for(let i=0;i<bytes.length;i+=0x8000)b+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));return btoa(b).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"")}
function unb64u(t){const b=atob(t.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((t.length+3)%4));const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}
async function pipeBytes(bytes,stream){return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer())}
function linkPayload(){const o={v:1,scene:sceneState(),layers:L,style:styleName};const t=THEMES[themeIdx][0];if(t!=="sistema")o.tema=t;return o}
async function encodeScene(o){
  const raw=new TextEncoder().encode(JSON.stringify(o));
  if(typeof CompressionStream==="function"){try{return "z"+b64u(await pipeBytes(raw,new CompressionStream("deflate-raw")))}catch(e){}}
  return "j"+b64u(raw);
}
async function decodeScene(t){
  const k=t[0],bytes=unb64u(t.slice(1));
  if(k==="z"){if(typeof DecompressionStream!=="function")throw new Error("Este navegador não abre links compactados.");return JSON.parse(new TextDecoder().decode(await pipeBytes(bytes,new DecompressionStream("deflate-raw"))))}
  if(k==="j")return JSON.parse(new TextDecoder().decode(bytes));
  throw new Error("Link de cena inválido.");
}
async function sceneLink(){return location.href.split("#")[0]+"#cena="+(await encodeScene(linkPayload()))}
async function loadFromHash(){
  const m=/^#cena=([A-Za-z0-9_-]+)$/.exec(location.hash||"");if(!m)return false;
  try{const o=await decodeScene(m[1]);
    applyState({scene:o.scene,layers:o.layers,style:o.style});applyStyle(styleName);
    if(o.tema){const i=THEMES.findIndex(t=>t[0]===o.tema);if(i>=0)applyTheme(i)}
    refreshScene();syncControls();updateModeButtons();draw();sceneMsg("Cena carregada do link.");return true}
  catch(e){sceneMsg("Não foi possível abrir a cena do link: "+e.message,true);return false}
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarLink(){
  $("mLink").addEventListener("click",async()=>{
    try{const url=await sceneLink();let ok=false;
      try{await navigator.clipboard.writeText(url);ok=true}catch(e){}
      sceneMsg(ok?"Link copiado. Quem abrir verá esta mesma cena.":"Copie o link abaixo:");
      if(!ok){outEl.textContent="";outLine(url)}
    }catch(e){sceneMsg(e.message,true)}
  });
  window.addEventListener("hashchange",loadFromHash);
}

export { b64u, unb64u, pipeBytes, linkPayload, encodeScene, decodeScene, sceneLink, loadFromHash };
