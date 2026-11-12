/* Núcleo headless do GeoMannequin.
   Usa os módulos do app sem duplicar código:
   - motor de desenho (src/engine): importado normalmente, compartilhado por todas as cenas;
   - cena e comandos (src/scene): cada "mundo" recebe uma cópia própria desses módulos,
     para que várias conversas tenham cenas independentes no mesmo servidor. */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as ENGINE from "../../src/engine/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const first = (...c) => c.find(p => existsSync(p));
/* no repositório: ../../src/scene e ../../css; no pacote dist/: ./scene e ./temas.css */
export const SCENE_DIR = process.env.GM_SCENE_DIR || first(join(HERE, "scene"), join(HERE, "..", "..", "src", "scene"), join(HERE, "..", "src", "scene"));
const CSS_TEMAS = first(join(HERE, "temas.css"), join(HERE, "..", "..", "css", "temas.css"), join(HERE, "..", "css", "temas.css"));

/* tokens de cor do CSS (claro e escuro) para resolver var(--x) sem navegador */
function cssTokens(css) {
  const light = {}, dark = {};
  const rootM = /:root\s*\{([^}]*)\}/.exec(css);
  const darkM = /:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
  const eat = (txt, o) => { for (const m of (txt || "").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) o[m[1]] = m[2].trim(); };
  eat(rootM && rootM[1], light); eat(darkM && darkM[1], dark);
  return { light, dark: Object.assign({}, light, dark) };
}

/* módulo ES → trecho de função: tira import/export (o gerador escreve cada import em uma linha) */
function unmodule(src) {
  return src
    .replace(/^import\s[^\n]*\n/gm, "")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm, "")
    .replace(/^export\s+(function|const|let|async function)\b/gm, "$1");
}

let FACTORY = null, META = null;
export function loadApp() {
  if (!SCENE_DIR) throw new Error("GeoMannequin: pasta src/scene não encontrada.");
  const ordem = JSON.parse(readFileSync(join(SCENE_DIR, "ordem.json"), "utf8"));
  const sceneSrc = ordem.modulos.map(f => `/* ---- ${f} ---- */\n` + unmodule(readFileSync(join(SCENE_DIR, f), "utf8"))).join("\n");
  const tok = cssTokens(CSS_TEMAS ? readFileSync(CSS_TEMAS, "utf8") : "");
  const names = Object.keys(ENGINE).filter(n => /^[A-Za-z_$][\w$]*$/.test(n));
  const src = `
"use strict";
const {${names.join(",")}}=E;
const TOK=${JSON.stringify(tok)};
const STUB=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==="value"?"":undefined),set:(t,k,v)=>{t[k]=v;return true}});
const document={documentElement:{dataset:{}},getElementById:()=>STUB};const window={};
const getComputedStyle=()=>({getPropertyValue:k=>((document.documentElement.dataset.theme==="dark")?TOK.dark:TOK.light)[k]||""});
${sceneSrc}
${ordem.iniciar.map(f => f + "();").join("\n")}
return {
  get P(){return P}, SCN, cena, camera, tema, LOG,
  get L(){return L}, setLayer:(k,v)=>{L[k]=!!v;mode=null},
  setPreset:n=>{if(!PRESETS[n])throw new Error("Modo desconhecido: use 'manequim', 'construcao' ou 'ecorche'.");setPreset(n)},
  get mode(){return mode},
  get style(){return styleName}, setStyle:n=>{if(!STYLES[n])throw new Error("Estilo desconhecido. Opções: "+Object.keys(STYLES).join(", ")+".");styleName=n;PAL_EXPORT=STYLES[n]},
  get theme(){return THEMES[themeIdx][0]},
  autoFit, sceneState, loadScene, applyState, apiFor, eyeHeight,
  renderScene, sceneList, W, H, PRESETS, STYLES, BODIES, BPOSES, POSTURES, FACES, ALIAS, SL, LAY, EXAMPLES, REF, MAXM,
  instColors, isDark, DEF, POSEKEYS,
  cenaCamadasSvg, fotoSvg, listaCamadas, arquivosCamadas,
  COL, colisoesDaCena, listaColisoes, resolverPar, resolverTodas, desfazerColisao, permitirContato, setModoColisao, setPreferir,
  composicaoDaCena, ajustarComposicao, setComposicao,
  todasPoses, GESTOS, TIPOS_OBJETO, ARTICULACOES,
  leituraBlocking, svgPlanta, svgPerfil, encaixar, eixoPerfil, moverManequim, girarManequim, apontarManequim, alturaManequim, moverCamera, moverAlvo, abrirCone, cameraNoMundo, M_R, comFundo,
  moverObjeto, girarObjeto, medidasObjeto, selecionarObjeto, corObjeto, pegadaNoChao, distEscala, faixaLente,
  lerRoteiro, executarRoteiro, renderizarQuadro, manifestoQuadros, pastaQuadro, paginaQuadros, folhaDeContato, MODELOS_ROTEIRO, recorteQuadro, OP_NOMES, PARTES_SEG, PASSES_QUADRO, openPoseJson,
  eixosDaJunta, moverJunta, zerarJunta, planoDoArrasto, nomeDaJunta, poseCmd, codigoDaPose, lerCodigoDePose, posesSalvas, PARTES_POSE, parteDaChave,
  faixa, limitesAcoplados, ajustarAoPerfil, EXPRESSOES, resolverAlvo, orbitarCamera, pivoCamera, vistaAtual, azimutesGiro, nomeVista, VISTAS_8, elevacaoDe, azimuteDe, AZIMUTES
};`;
  const make = new Function("E", src);
  FACTORY = () => make(ENGINE);
  META = { scene: SCENE_DIR, modulos: ordem.modulos.length };
  return META;
}

/* um mundo = uma cena independente */
export function createWorld() {
  if (!FACTORY) loadApp();
  return FACTORY();
}
export function appMeta() { if (!FACTORY) loadApp(); return META; }
