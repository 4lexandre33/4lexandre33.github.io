/* GeoMannequin MCP: FUNÇÕES NARRATIVAS (biblioteca em árvore, receitas → quadros/planos) e GERAÇÃO PROCEDURAL de histórias com variações e nota. */
import { z } from "zod";
import { toPng } from "./png.mjs";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
/* folha de contato de quadros compilados */
async function folhaQuadros(w, quadros, rotulos, C = 4, larg = 320) { const ims = []; for (let i = 0; i < quadros.length; i++) { try { ims.push([rotulos[i] || "", (await toPng(w.renderizarQuadro(quadros[i], { passes: false }).svg, larg)).toString("base64")]); } catch (e) { } }
  const h = Math.round(larg * 9 / 16), H = Math.ceil(ims.length / C) * (h + 26) + 6;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + C * (larg + 4) + '" height="' + H + '"><rect width="100%" height="100%" fill="#fff"/>' + ims.map(([id, b], i) => { const x = (i % C) * (larg + 4) + 2, y = Math.floor(i / C) * (h + 26) + 2;
    return '<image x="' + x + '" y="' + y + '" width="' + larg + '" height="' + h + '" href="data:image/png;base64,' + b + '"/><text x="' + (x + 2) + '" y="' + (y + h + 16) + '" font-size="12" font-family="sans-serif" fill="#222">' + esc(id) + "</text>"; }).join("") + "</svg>";
  return toPng(svg, C * (larg + 4)); }

export function registerNarrativaTools(server, W) {
  server.registerTool("narrativas", {
    title: "Funções narrativas (biblioteca em árvore: família → função → versão → tom)",
    description: "Biblioteca de receitas de cena para mangá, webtoon e animação: apresentação, gatilho, direcionamento (mentor, plano, decisão), oposição, conflito/luta, cerco, perseguição, fuga, esconderijo, revelação, relação/emoção, provação, poder, clímax, desfecho, comédia, suspense/terror, transição e escala (Propp, Polti, Jornada do Herói, Save the Cat, kishōtenketsu). " +
      "Cada função × 5 versões (direta, suspense, impacto, pov, lenta) × 8 tons (epico, sombrio, comico, romantico, tenso, melancolico, leve, misterioso) = milhares de variantes, em 3 formatos. Sem argumentos: as famílias. prefixo \"perseguicao\" desce; busca \"fuga\" procura. Mostra miniaturas do momento forte.",
    inputSchema: { prefixo: z.string().max(120).optional(), busca: z.string().max(80).optional(), miniaturas: z.boolean().optional() }, annotations: RO
  }, async a => {
    try { const w = W(); let itens;
      if (a.busca) itens = w.nrBuscar(a.busca, 40).map(d => ({ id: d.id, nome: d.nome, fonte: d.fonte, papeis: d.papeis, intensidade: d.intensidade }));
      else itens = w.nrProximos(a.prefixo || "").map(n => ({ caminho: (a.prefixo ? a.prefixo.replace(/\.$/, "") + "." : "") + n.nome, desc: n.desc, folha: n.folha }));
      const out = { funcoes: w.NR.size, variantes: w.nrTotalVariantes(), versoes: w.NR_VERSOES, tons: Object.fromEntries(Object.entries(w.NR_TONS).map(([k, t]) => [k, t.nome])), formatos: w.NR_FORMATOS, estruturas: Object.fromEntries(Object.entries(w.NR_ESTRUTURAS).map(([k, e]) => [k, e.nome + " — " + e.fonte])), itens,
        uso: "narrativa FAMILIA.FUNCAO[.VERSAO[.TOM]] com Kai, Mira [formato manga|webtoon|animacao] [tom X] [semente N]  ·  historia ESTRUTURA com Kai, Mira [formato …] [quadros 24] [variacoes 4]" };
      const content = [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 60000) }];
      const ids = (a.busca ? itens.map(i => i.id) : itens.map(i => i.caminho)).filter(id => w.NR.has(id)).slice(0, 12);
      if (a.miniaturas !== false && ids.length) { const qs = [], rot = []; for (const id of ids) { const r = w.compilarName(w.nrDemoTexto(id), { semCache: true, salvar: false }); if (r.quadros[0]) { qs.push(r.quadros[0]); rot.push(id); } }
        if (qs.length) content.push({ type: "image", data: (await folhaQuadros(w, qs, rot)).toString("base64"), mimeType: "image/png" }); }
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("aplicar_narrativa", {
    title: "Aplicar uma função narrativa (receita → quadros prontos)",
    description: "Transforma uma função narrativa em quadros de mangá/webtoon ou planos de animação com os SEUS personagens (papéis A, B, C na ordem dos nomes), no tom e na versão pedidos. Devolve o texto do name (pronto para editar), a verificação narrativa→visual (correções automáticas de eixo e enquadramento) e as imagens.",
    inputSchema: { id: z.string().max(120).describe("ex.: perseguicao.telhados ou perseguicao.telhados.suspense.tenso"), nomes: z.array(z.string().max(40)).max(5).optional(), tom: z.string().max(20).optional(), versao: z.string().max(20).optional(),
      formato: z.enum(["manga", "webtoon", "animacao"]).optional(), semente: z.number().int().optional(), verificar: z.boolean().optional(), imagens: z.boolean().optional() }, annotations: RO
  }, async a => {
    try { const w = W(), rc = w.nrReceita(a.id, { nomes: a.nomes, tom: a.tom, versao: a.versao, formato: a.formato || "manga", semente: a.semente });
      let texto = w.nrMontarTexto([rc], {}), ver = null; if (a.verificar !== false) { ver = w.nrVerificar(texto, (t, o) => w.compilarName(t, o)); texto = ver.texto; }
      const r = w.compilarName(texto, { semCache: true, salvar: false });
      const out = { id: rc.def.id, nome: rc.def.nome, fonte: rc.def.fonte, versao: rc.versao, tom: rc.tom, formato: rc.formato, quadros: r.quadros.length, texto, correcoes: ver ? ver.correcoes : [], avisos: r.avisos.slice(0, 12), erros: r.erros };
      const content = [{ type: "text", text: JSON.stringify(out, null, 1) }];
      if (a.imagens !== false && r.quadros.length && rc.formato !== "animacao") content.push({ type: "image", data: (await folhaQuadros(w, r.quadros.slice(0, 12), r.quadros.slice(0, 12).map((q, i) => "quadro " + (i + 1)), 3, 360)).toString("base64"), mimeType: "image/png" });
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("gerar_historia", {
    title: "Gerar história procedural (várias variações com nota, para escolher a melhor)",
    description: "Monta uma história inteira a partir de uma ESTRUTURA (tres-atos, jornada, kishotenketsu, save-the-cat, propp, acao, romance, terror, comedia, misterio): sorteia funções narrativas, versões e tons pela semente, gera K variações e dá nota (tensão perto da curva ideal, variedade de planos, tamanho pedido). " +
      "Devolve as variações (da melhor para a pior), o texto da melhor (verificado e corrigido) e a folha de quadros. funcoes = sua própria sequência (ex.: [\"gatilho.chamado\",\"cerco.encurralado\",\"desfecho.vitoria\"]).",
    inputSchema: { estrutura: z.string().max(40).optional(), nomes: z.array(z.string().max(40)).max(5).optional(), formato: z.enum(["manga", "webtoon", "animacao"]).optional(), tom: z.string().max(20).optional(),
      quadros: z.number().int().min(4).max(120).optional(), variacoes: z.number().int().min(1).max(12).optional(), semente: z.number().int().optional(), funcoes: z.array(z.string().max(80)).max(40).optional(), escolher: z.number().int().min(1).max(12).optional(), imagens: z.boolean().optional() }, annotations: RO
  }, async a => {
    try { const w = W(), hs = w.nrHistoria({ estrutura: a.estrutura || "tres-atos", nomes: a.nomes || ["Kai", "Mira"], formato: a.formato || "manga", tom: a.tom, quadros: a.quadros, variacoes: a.variacoes || 3, semente: a.semente || 1, funcoes: a.funcoes });
      const esc0 = Math.min(hs.length, a.escolher || 1) - 1, h = hs[esc0]; let texto = w.nrMontarTexto(h.receitas, { titulo: w.NR_ESTRUTURAS[h.estrutura] ? w.NR_ESTRUTURAS[h.estrutura].nome : "história" });
      const ver = w.nrVerificar(texto, (t, o) => w.compilarName(t, o)); texto = ver.texto; const r = w.compilarName(texto, { semCache: true, salvar: false });
      const out = { estrutura: h.estrutura, variacoes: hs.map(x => ({ variacao: x.variacao, nota: x.nota, funcoes: x.funcoes })), escolhida: h.variacao, texto, quadros: r.quadros.length, correcoes: ver.correcoes, avisos: r.avisos.slice(0, 12), erros: r.erros };
      const content = [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 90000) }];
      if (a.imagens !== false && r.quadros.length && (a.formato || "manga") !== "animacao") content.push({ type: "image", data: (await folhaQuadros(w, r.quadros.slice(0, 24), r.quadros.slice(0, 24).map((q, i) => (i + 1) + ""), 6, 240)).toString("base64"), mimeType: "image/png" });
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
}
