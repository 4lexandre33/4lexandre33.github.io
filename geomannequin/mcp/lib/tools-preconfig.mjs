/* GeoMannequin MCP: PRÉ-CONFIGURAÇÕES de cena e câmera (árvore com miniaturas) e ANIMAÇÕES DE ANIMAIS (tira + auditoria). */
import { z } from "zod";
import { toPng } from "./png.mjs";
import { framesParaImagens } from "./tools-anim.mjs";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
const CACHE = new Map();
/* miniatura de uma pré-configuração (PNG 16:9, cache em memória) */
async function miniPreset(w, d, larg = 320) { const k = d.id + "@" + larg; if (CACHE.has(k)) return CACHE.get(k);
  const r = w.compilarName(w.pcDemoTexto(d), { semCache: true, salvar: false }); if (!r.quadros.length) throw new Error(r.erros.map(e => e.erro).join("; "));
  const png = await toPng(w.renderizarQuadro(r.quadros[0], { passes: false }).svg, larg); CACHE.set(k, png); return png; }
/* folha de contato: várias miniaturas com o id embaixo */
async function folha(w, ds, C = 4) { const ims = []; for (const d of ds) { try { ims.push([d.id, (await miniPreset(w, d)).toString("base64")]); } catch (e) { } }
  const H = Math.ceil(ims.length / C) * 206 + 6, esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + C * 324 + '" height="' + H + '"><rect width="100%" height="100%" fill="#fff"/>' + ims.map(([id, b], i) => { const x = (i % C) * 324 + 2, y = Math.floor(i / C) * 206 + 2;
    return '<image x="' + x + '" y="' + y + '" width="320" height="180" href="data:image/png;base64,' + b + '"/><text x="' + (x + 2) + '" y="' + (y + 196) + '" font-size="12" font-family="sans-serif" fill="#222">' + esc(id) + "</text>"; }).join("") + "</svg>";
  return toPng(svg, C * 324); }

export function registerPreconfigTools(server, W) {
  server.registerTool("preconfiguracoes", {
    title: "Pré-configurações de cena e câmera (catálogo em árvore, com miniaturas)",
    description: "Mais de 500 situações prontas de filme, série, anime e HQ (diálogo a dois/três com plano mestre, sobre o ombro/OTS, contraplano, close sujo/limpo, 50/50; grupo; combate; emoção; estabelecimento; movimento e perseguição; suspense; romance; poder; inserts; POV; montaria; escala; anime; HQ; movimentos de câmera). " +
      "Sem argumentos: o primeiro nível da árvore. prefixo \"dialogo.dois\" desce um nível; busca \"ombro\" procura por nome/técnico. Devolve ids, nomes, papéis, o texto para usar (cena preset ID com Kai, Mira) e uma folha de miniaturas.",
    inputSchema: { prefixo: z.string().max(200).optional(), busca: z.string().max(120).optional(), miniaturas: z.boolean().optional().describe("Folha de miniaturas (padrão: sim, até 16)."), max: z.number().int().min(1).max(200).optional() }, annotations: RO
  }, async a => {
    try { const w = W(), max = a.max || 60; let lista, niveis = null;
      if (a.busca) lista = w.pcBuscar(a.busca, max);
      else { niveis = w.pcProximos(a.prefixo || ""); lista = niveis.filter(n => n.folha).map(n => w.pcAchar(n.id)); if (a.prefixo && w.pcAchar(a.prefixo) && !lista.length) lista = [w.pcAchar(a.prefixo)]; }
      const out = { total: w.PRECONFIG.length, prefixo: a.prefixo || "", niveis: niveis ? niveis.filter(n => !n.folha).map(n => ({ ramo: (a.prefixo ? a.prefixo.replace(/\.$/, "") + "." : "") + n.nome, itens: n.total })) : undefined,
        itens: lista.slice(0, max).map(d => ({ id: d.id, nome: d.nome, tecnico: d.tecnico, grupo: d.grupo, papeis: d.papeis, uso: w.pcExemplo(d), movimento: d.mov || undefined })) };
      const content = [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 60000) }];
      if (a.miniaturas !== false && out.itens.length) content.push({ type: "image", data: (await folha(w, lista.slice(0, Math.min(16, max)))).toString("base64"), mimeType: "image/png" });
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("aplicar_preconfiguracao", {
    title: "Aplicar uma pré-configuração (gera o texto e mostra o quadro)",
    description: "Dá o texto da DSL para uma pré-configuração com os SEUS personagens (na ordem dos papéis A, B, C…; M = animal) e mostra o quadro pronto. Use o texto num quadro ou plano do seu name/filme. " +
      "modo \"cena\" arruma as pessoas e põe a câmera; \"camera\" só a câmera. Se mandar \"name\" (seu texto com o elenco), o quadro é desenhado com ele.",
    inputSchema: { id: z.string().max(200), nomes: z.array(z.string().max(60)).max(6).optional(), modo: z.enum(["cena", "camera"]).optional(), em: z.array(z.number()).length(2).optional(), gira: z.number().optional(), espelhado: z.boolean().optional(), lente: z.number().min(10).max(300).optional(), name: z.string().max(200000).optional() }, annotations: RO
  }, async a => {
    try { const w = W(), d = w.pcAchar(a.id); if (!d) { const s = w.pcBuscar(a.id.split(".").pop(), 5).map(x => x.id); throw new Error("pré-configuração “" + a.id + "” não existe. Parecidas: " + s.join(", ")); }
      const nomes = a.nomes && a.nomes.length ? a.nomes : null, modo = a.modo || "cena";
      const linha = (nm => modo + " preset " + d.id + " com " + nm.join(", ") + (a.em ? " em (" + a.em.join(",") + ")" : "") + (a.gira !== undefined ? " gira " + a.gira : "") + (a.espelhado ? " espelhado" : "") + (a.lente ? " lente " + a.lente : ""));
      let texto, r;
      if (a.name) { texto = a.name.replace(/\s*$/, "") + "\nquadro 99\n  " + linha(nomes || d.papeis) + "\n"; r = w.compilarName(texto, { semCache: true, salvar: false }); }
      else { const demo = w.pcDemoTexto(d), nm = (/cena preset \S+ com (.+)$/m.exec(demo) || [])[1].split(", "); texto = demo.replace(/cena preset .*$/m, linha(nm)); r = w.compilarName(texto, { semCache: true, salvar: false }); }
      const q = r.quadros[r.quadros.length - 1], out = { id: d.id, nome: d.nome, tecnico: d.tecnico, desc: d.desc, papeis: d.papeis, linha: linha(nomes || d.papeis), movimentoSugerido: d.mov || null, erros: r.erros, avisos: r.avisos.slice(0, 10) };
      const content = [{ type: "text", text: JSON.stringify(out, null, 1) }];
      if (q) content.push({ type: "image", data: (await toPng(w.renderizarQuadro(q, { passes: false }).svg, 960)).toString("base64"), mimeType: "image/png" });
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("animacao_animal", {
    title: "Animação de animal: lista, tira de quadros e auditoria dos cascos",
    description: "Sem nome: lista as animações de quadrúpede (andar, marchas, transições, curvas, viradas, pulos, ações). Com nome: mostra a tira de quadros da animação na espécie pedida e mede o escorregamento dos cascos (cm/s) e quanto afunda.",
    inputSchema: { nome: z.string().max(60).optional(), especie: z.string().max(40).optional(), quadros: z.number().int().min(3).max(12).optional() }, annotations: RO
  }, async a => {
    try { const w = W(); if (!a.nome) { const l = w.listaAnimacoesAnimal(); return { content: [{ type: "text", text: JSON.stringify({ total: l.length, animacoes: l, verbos: Object.keys(w.AMA_VERBOS) }, null, 1) }] }; }
      const esp = a.especie || "cavalo", an = w.animacaoAnimal(a.nome, esp); if (!an) throw new Error("animação “" + a.nome + "” não existe (use animacao_animal sem nome para a lista).");
      const aud = w.amaAuditar(a.nome, esp, { fps: 24 }), N = a.quadros || 8, dur = Math.max(0.5, an.duracao || 1);
      const txt = "elenco\n  Trovao animal " + esp + "\nfilme \"t\"\ncena \"c\"\n  plano 1 duracao " + dur.toFixed(2) + "s\n    Trovao em (0,0)\n    camera segue Trovao lado\n    0s Trovao anima " + a.nome + "\n";
      const r = w.compilarName(txt, { semCache: true, salvar: false }); const ims = [];
      if (r.ok) { const v = w.videoDoFilme(r, { fps: 12 }), idx = Array.from({ length: N }, (_, i) => Math.round(i * (v.frames.length - 1) / (N - 1))); const { pngs } = await framesParaImagens(w, idx.map(i => v.frames[i]), { largura: 240 }); pngs.forEach(p => ims.push(p.toString("base64"))); }
      const content = [{ type: "text", text: JSON.stringify({ nome: a.nome, especie: esp, duracao: an.duracao, loop: !!an.loop, auditoria: aud, erros: r.erros }, null, 1) }];
      if (ims.length) { const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + ims.length * 242 + '" height="136"><rect width="100%" height="100%" fill="#fff"/>' + ims.map((b, i) => '<image x="' + i * 242 + '" y="0" width="240" height="135" href="data:image/png;base64,' + b + '"/>').join("") + "</svg>"; content.push({ type: "image", data: (await toPng(svg, ims.length * 242)).toString("base64"), mimeType: "image/png" }); }
      return { content }; } catch (e) { return ERRO(e); }
  });
}
