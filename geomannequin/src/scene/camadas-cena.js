/* GeoMannequin — gerador de cenas em camadas (sem depender da página; o MCP usa este mesmo arquivo):
   foto .svg de um manequim, cena inteira em camadas nomeadas (Inkscape, Illustrator, Figma, Affinity),
   arquivos separados para remontar a cena e o resumo das camadas. */
import { L } from "./modos.js";
import { SCN, sceneList } from "./modelo.js";
import { H, W, comporCamadas, fotoManequim, prepararCamadas, renderGrupoLocal } from "../engine/index.js";

const NS = 'xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"';
function cabecalho(titulo) { return '<svg ' + NS + ' viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '">\n<title>' + esc(titulo) + "</title>\n"; }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }
function nomeArquivo(s) { return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "manequim"; }
const Lexp = () => Object.assign({}, L, { grid: false });

/* plano da cena para exportar (cores de exportação; camadas guardadas no canal "export") */
function planoExport() {
  const lst = sceneList(true), plan = prepararCamadas(lst, Lexp(), false, L.floor ? 16 : 0, { canal: "export" });
  plan.grupos.forEach(g => { if (!g.pronto) renderGrupoLocal(plan, g); });
  return plan;
}
/* a cena inteira num SVG só, cada manequim numa camada com o nome dele */
function cenaCamadasSvg(opts) {
  opts = opts || {};
  const plan = planoExport(), r = comporCamadas(plan, { inkscape: true, semUltima: true, prefixo: "gmx" });
  const fundo = opts.transparente ? "" : '<g id="fundo" inkscape:groupmode="layer" inkscape:label="Fundo"><rect width="' + W + '" height="' + H + '" fill="#FFFFFF"/></g>\n';
  return cabecalho("GeoMannequin — cena em camadas") + fundo + r.svg.replace(/(<g id="(?:chao|sombras|guias|manequim-\d+)")/g, "\n$1") + "\n</svg>\n";
}
/* foto de um manequim: fundo transparente, no ângulo e na posição da cena (empilhe as fotos para remontar a cena) */
function fotoSvg(i, opts) {
  opts = opts || {};
  const k = i === undefined ? SCN.active : i;
  if (k < 0 || k >= SCN.list.length) throw new Error("Manequim não encontrado.");
  const it = SCN.list[k], corpo = fotoManequim(sceneList(true), k, Lexp(), { canal: "export", sombra: opts.sombra });
  if (corpo === null) throw new Error("“" + it.name + "” está oculto ou atrás da câmera.");
  return cabecalho("GeoMannequin — " + it.name) + '<g inkscape:groupmode="layer" inkscape:label="' + esc(it.name) + '">' + corpo + "</g>\n</svg>\n";
}
/* resumo: ordem de empilhamento (de trás para a frente), profundidade e estado de cada camada */
function listaCamadas() {
  const lst = sceneList(), plan = prepararCamadas(lst, L, false, 0, { canal: "tela" });
  const prof = {}; plan.grupos.forEach(g => { if (g.res) prof[g.membros[0]] = g.res.info.depth; });
  const vis = plan.grupos.map(g => g.membros[0]);
  const ordem = vis.slice().sort((a, b) => (SCN.list[a].ordem || 0) - (SCN.list[b].ordem || 0) || (prof[a] ?? 0) - (prof[b] ?? 0));
  return SCN.list.map((it, i) => {
    const g = plan.grupos.find(x => x.membros[0] === i);
    return { nome: it.name, posicao: ordem.indexOf(i) + 1 || null, oculto: !!it.oculto, congelado: !!it.congelado, ordem: it.ordem || 0,
      pronta: g ? g.pronto : false, sombraDe: g ? g.lanc.map(j => SCN.list[j].name) : [] };
  });
}
/* arquivos para remontar a cena: a cena em camadas, uma foto por manequim, o chão e a cena em JSON */
function arquivosCamadas(json) {
  const plan = planoExport(), r = comporCamadas(plan, { inkscape: true, semUltima: true, prefixo: "gmx" });
  const fx = [{ nome: "cena-em-camadas.svg", texto: cenaCamadasSvg() }];
  if (r.chao || r.guias) fx.push({ nome: "00-chao.svg", texto: cabecalho("GeoMannequin — chão") + '<g inkscape:groupmode="layer" inkscape:label="Chão">' + (r.chao || "") + (r.guias || "") + "</g>\n</svg>\n" });
  r.camadas.forEach((c, k) => {
    const it = SCN.list[c.indice];
    fx.push({ nome: String(k + 1).padStart(2, "0") + "-" + nomeArquivo(it.name) + ".svg", texto: fotoSvg(c.indice) });
  });
  /* efeitos especiais: fundo da tela, cada efeito de cena num arquivo e a frente da tela (empilhe na ordem) */
  const E = r.efeitos || {}, defs = E.defs ? "<defs>" + E.defs + "</defs>" : "";
  if (E.fundo) fx.push({ nome: "00a-efeitos-fundo.svg", texto: cabecalho("GeoMannequin — efeitos (fundo)") + defs + '<g inkscape:groupmode="layer" inkscape:label="Efeitos (fundo)">' + E.fundo + "</g>\n</svg>\n" });
  (E.cena || []).forEach((q, k) => fx.push({ nome: "efeito-" + String(k + 1).padStart(2, "0") + "-" + nomeArquivo(q.tipo) + ".svg", texto: cabecalho("GeoMannequin — efeito " + q.tipo) + defs + '<g inkscape:groupmode="layer" inkscape:label="' + esc(q.tipo) + '">' + q.svg + "</g>\n</svg>\n" }));
  if (E.frente) fx.push({ nome: "99-efeitos-frente.svg", texto: cabecalho("GeoMannequin — efeitos (frente)") + defs + '<g inkscape:groupmode="layer" inkscape:label="Efeitos (frente)">' + E.frente + "</g>\n</svg>\n" });
  if (json) fx.push({ nome: "cena.json", texto: json });
  fx.push({ nome: "LEIA-ME.txt", texto: "GeoMannequin — cena em camadas\n\n" +
    "cena-em-camadas.svg: a cena pronta, cada manequim numa camada com o nome dele (abre como camadas no Inkscape, Illustrator, Figma e Affinity).\n" +
    "00-chao.svg e 01-…, 02-…: uma \"foto\" por manequim, com fundo transparente, já na posição e na perspectiva da cena.\n" +
    "Empilhe na ordem dos números (o 01 fica atrás) para remontar a cena. Onde um manequim passa na frente de outro de um jeito\n" +
    "que a ordem simples não resolve (um braço à frente do vizinho), use cena-em-camadas.svg, que já vem com o recorte certo.\n" +
    ((E.fundo || (E.cena || []).length || E.frente) ? "00a-efeitos-fundo.svg fica atrás de tudo; efeito-01…, efeito-02… são os efeitos da cena (a posição certa entre os manequins está em cena-em-camadas.svg); 99-efeitos-frente.svg vai por cima de tudo.\n" : "") +
    (json ? "cena.json: a cena para abrir de novo no GeoMannequin (aba JSON → Aplicar JSON).\n" : "") });
  return fx;
}

export { cenaCamadasSvg, fotoSvg, listaCamadas, arquivosCamadas, nomeArquivo };
