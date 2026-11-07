/* Núcleo headless do GeoMannequin.
   Lê o app (um único HTML) e reaproveita, sem duplicar, o motor de desenho (bloco ENGINE)
   e a camada de cena/comandos em português (cena, camera, poses, cores exclusivas).
   Cada "mundo" é uma cena independente, com seu próprio estado. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
/* o app é a fonte única do motor: no repositório fica em ../index.html; um pacote avulso pode trazer app/geomannequin.html */
export const APP_HTML_PATH = process.env.GM_APP_HTML || [join(HERE, "..", "..", "index.html"), join(HERE, "..", "..", "..", "index.html"), join(HERE, "app", "geomannequin.html"), join(HERE, "..", "app", "geomannequin.html")].find(p => existsSync(p) && /ENGINE-START/.test(readFileSync(p, "utf8"))) || join(HERE, "..", "app", "geomannequin.html");

/* declarações da interface que não dependem da página (ordem importa) */
const UI_NAMES = [
  "PAL_SCREEN", "STYLES", "styleName", "PAL_EXPORT", "fr", "SL", "LAY", "CAMK", "WORLDK",
  "newInst", "isDark", "hsl2hex", "hex2rgb", "mixHex", "colDist", "hueColors", "nextHue",
  "instColors", "palOf", "cssHex", "sceneList", "sceneBB", "setActive", "MAXM", "addInst",
  "dupInst", "delInst", "setColor", "THEMES", "themeIdx", "applyTheme", "L", "mode",
  "setPreset", "applyState", "getZoomEff", "setZoomEff", "autoFit", "eyeHeight", "GUARD", "guardArms",
  "FACES", "POSTURES", "BODIES", "POSE0", "BPOSES", "doBodyPose", "ALIAS", "SLK", "POSEKEYS",
  "num", "applyParams", "withInst", "LOG", "apiFor", "cena", "camSet", "camera", "tema",
  "EXAMPLES", "REF", "sceneState", "loadScene"
];

/* pega uma declaração de topo pelo nome: da linha "function X(" / "const X=" / "let X="
   até a próxima linha sem recuo (ignorando linhas dentro de template strings e fechamentos "}" "]") */
function grab(lines, name) {
  const re = new RegExp("^(?:function " + name + "\\(|const " + name + "\\s*=|let " + name + "\\s*=)");
  const i0 = lines.findIndex(l => re.test(l));
  if (i0 < 0) throw new Error("GeoMannequin: declaração não encontrada no app: " + name);
  const out = [lines[i0]];
  let tick = (lines[i0].match(/(?<!\\)`/g) || []).length % 2;
  for (let i = i0 + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!tick && /^[A-Za-z_$\/(]/.test(l)) break;
    out.push(l);
    tick = (tick + (l.match(/(?<!\\)`/g) || []).length) % 2;
  }
  return out.join("\n");
}

/* tokens de cor do CSS (claro e escuro) para resolver var(--x) sem navegador */
function cssTokens(html) {
  const light = {}, dark = {};
  const rootM = /:root\s*\{([^}]*)\}/.exec(html);
  const darkM = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(html);
  const eat = (txt, o) => { for (const m of (txt || "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim(); };
  eat(rootM && rootM[1], light); eat(darkM && darkM[1], dark);
  return { light, dark: Object.assign({}, light, dark) };
}

let FACTORY = null, META = null;
export function loadApp(path = APP_HTML_PATH) {
  const html = readFileSync(path, "utf8");
  const eng = /\/\*ENGINE-START\*\/([\s\S]*?)\/\*ENGINE-END\*\//.exec(html);
  if (!eng) throw new Error("GeoMannequin: bloco ENGINE não encontrado em " + path);
  const ui0 = html.indexOf("(function(){", eng.index);
  const lines = html.slice(ui0).split("\n");
  const ui = UI_NAMES.map(n => grab(lines, n)).join("\n");
  const tok = cssTokens(html);
  /* motor compartilhado por todos os mundos (buffers de desenho alocados uma vez só) */
  const cand = new Set();
  for (const m of eng[1].matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) cand.add(m[1]);
  for (const m of eng[1].matchAll(/^(?:const|let)\s+(.*)$/gm)) for (const k of m[1].matchAll(/(?:^|[,;{\s])([A-Za-z_$][\w$]*)\s*=(?![=>])/g)) cand.add(k[1]);
  const probe = [...cand].map(n => "try{o." + n + "=" + n + "}catch(e){}").join("\n");
  const ENGINE = new Function('"use strict";\n' + eng[1] + "\nconst o={};\n" + probe + "\nreturn o;")();
  const names = Object.keys(ENGINE).filter(n => /^[A-Za-z_$][\w$]*$/.test(n));
  const src = `
"use strict";
const {${names.join(",")}}=E;
const TOK=${JSON.stringify(tok)};
const document={documentElement:{dataset:{}}};const window={};
const STUB=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==="value"?"":undefined),set:(t,k,v)=>{t[k]=v;return true}});
const $=()=>STUB;
const getComputedStyle=()=>({getPropertyValue:k=>((document.documentElement.dataset.theme==="dark")?TOK.dark:TOK.light)[k]||""});
const refreshScene=()=>{},syncControls=()=>{},render=()=>{},updateModeButtons=()=>{},sceneMsg=()=>{};
let P=Object.assign({},DEF);let UID=0;const SCN={list:[],active:0};
${ui}
SCN.list.push(newInst(P,"Manequim 1"));P=SCN.list[0].params;
setPreset("manequim");
return {
  get P(){return P}, SCN, cena, camera, tema, LOG,
  get L(){return L}, setLayer:(k,v)=>{L[k]=!!v;mode=null},
  setPreset:n=>{if(!PRESETS[n])throw new Error("Modo desconhecido: use 'manequim' ou 'construcao'.");setPreset(n)},
  get mode(){return mode},
  get style(){return styleName}, setStyle:n=>{if(!STYLES[n])throw new Error("Estilo desconhecido. Opções: "+Object.keys(STYLES).join(", ")+".");styleName=n;PAL_EXPORT=STYLES[n]},
  get theme(){return THEMES[themeIdx][0]},
  autoFit, sceneState, loadScene, applyState, apiFor, eyeHeight,
  renderScene, sceneList, W, H, PRESETS, STYLES, BODIES, BPOSES, POSTURES, FACES, ALIAS, SL, LAY, EXAMPLES, REF, MAXM,
  instColors, isDark, DEF, POSEKEYS
};`;
  const make = new Function("E", src);
  FACTORY = () => make(ENGINE);
  META = { path, bytes: html.length };
  return META;
}

/* um mundo = uma cena independente */
export function createWorld() {
  if (!FACTORY) loadApp();
  return FACTORY();
}
export function appMeta() { if (!FACTORY) loadApp(); return META; }
