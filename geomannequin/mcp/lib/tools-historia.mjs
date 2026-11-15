/* GeoMannequin MCP: HISTÓRIA → TEXTO (análise com lacunas), LOCAIS PRONTOS e CATÁLOGO (criaturas, armas, veículos, subfunções). */
import { z } from "zod";
import { toPng } from "./png.mjs";

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const ERRO = e => ({ isError: true, content: [{ type: "text", text: "Erro: " + (e && e.message || e) }] });
const esc = t => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
async function folha(w, quadros, rotulos, C = 4, larg = 300) { const ims = []; for (let i = 0; i < quadros.length; i++) { try { ims.push([rotulos[i] || "", (await toPng(w.renderizarQuadro(quadros[i], { passes: false }).svg, larg)).toString("base64")]); } catch (e) { } }
  const h = Math.round(larg * 9 / 16), H = Math.ceil(ims.length / C) * (h + 26) + 6;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + C * (larg + 4) + '" height="' + H + '"><rect width="100%" height="100%" fill="#fff"/>' + ims.map(([id, b], i) => { const x = (i % C) * (larg + 4) + 2, y = Math.floor(i / C) * (h + 26) + 2;
    return '<image x="' + x + '" y="' + y + '" width="' + larg + '" height="' + h + '" href="data:image/png;base64,' + b + '"/><text x="' + (x + 2) + '" y="' + (y + h + 16) + '" font-size="11" font-family="sans-serif" fill="#222">' + esc(id).slice(0, 60) + "</text>"; }).join("") + "</svg>";
  return toPng(svg, C * (larg + 4)); }

export function registerHistoriaTools(server, W) {
  server.registerTool("analisar_historia", {
    title: "História → texto da cena (com lacunas registradas)",
    description: "Lê uma história em português e devolve: personagens (nomes e papéis como 'o estranho'), animais/criaturas, lugares (com o local pronto mais perto), as cenas com cada ação traduzida para linhas da linguagem (poses, interações, tiros, feitiços, montar, embarcar, falas entre aspas), a função narrativa sugerida por cena, o TEXTO pronto (elenco, locais, quadros com legenda) já compilado, e as LACUNAS: o que a história pede e o sistema ainda não tem (verbo sem pose, lugar sem local pronto, criatura/objeto/veículo inexistente). " +
      "As lacunas ficam registradas nesta conversa (ferramenta lacunas) para virarem mecânica nova. Fluxo: analisar_historia → revisar/editar o texto → compilar_name/filme. Devolve também a folha com os quadros.",
    inputSchema: { historia: z.string().max(40000), nomes: z.array(z.string().max(40)).max(8).optional().describe("nomes a usar primeiro (senão detecta)"), formato: z.enum(["manga", "webtoon"]).optional(), imagens: z.boolean().optional() }, annotations: RO
  }, async a => {
    try { const w = W(), an = w.analisarHistoria(a.historia, { nomes: a.nomes, formato: a.formato }), r = w.compilarName(an.dsl, { semCache: true, salvar: false });
      const out = { personagens: an.personagens, animais: an.animais, lugares: an.lugares, quadros: r.quadros.length, cenas: an.cenas.map(c => ({ frase: c.frase, quem: c.quem, lugar: c.lugar, acoes: c.acoes, funcoes: c.funcoes })), lacunas: an.lacunas, texto: an.dsl, erros: r.erros, avisos: r.avisos.slice(0, 12) };
      const content = [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 90000) }];
      if (a.imagens !== false && r.quadros.length) content.push({ type: "image", data: (await folha(w, r.quadros.slice(0, 16), r.quadros.slice(0, 16).map((q, i) => (i + 1) + ". " + (q.legenda || "")))).toString("base64"), mimeType: "image/png" });
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("lacunas", {
    title: "Lacunas registradas (o que as histórias pediram e o sistema ainda não tem)",
    description: "Lista as lacunas acumuladas nesta conversa pelas análises de história (tipo, termo, quantas vezes, exemplos, sugestão de como contornar hoje). limpar=true zera a lista. importar = lacunas salvas antes (JSON) para juntar.",
    inputSchema: { limpar: z.boolean().optional(), importar: z.string().max(200000).optional() }, annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
  }, async a => {
    try { const w = W(); if (a.importar) w.importarLacunas(JSON.parse(a.importar)); const L = w.listaLacunas(); if (a.limpar) w.limparLacunas();
      const out = { total: L.length, lacunas: L, porTipo: L.reduce((m, x) => (m[x.tipo] = (m[x.tipo] || 0) + 1, m), {}) }; return { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("locais_prontos", {
    title: "Locais prontos parametrizados (sala, quarto, escadaria, rua, estradas, rio com ponte, castelo, taverna, floresta, lago)",
    description: "Sem tipo: lista os locais prontos. Com tipo: gera o código do local (o mesmo de 'local preset TIPO …') com largura/profundidade/altura em metros, semente, padrao (estrada-pedra: xadrez|espinha), densidade (floresta) e nome; devolve o texto e a imagem (vista de cima em perspectiva). Para salvar com nome, use salvar_local com o código devolvido.",
    inputSchema: { tipo: z.string().max(40).optional(), largura: z.number().min(2).max(50).optional(), profundidade: z.number().min(2).max(50).optional(), altura: z.number().min(0).max(20).optional(), semente: z.number().int().optional(), padrao: z.string().max(20).optional(), densidade: z.number().min(0.1).max(4).optional(), nome: z.string().max(80).optional() }, annotations: RO
  }, async a => {
    try { const w = W(); if (!a.tipo) { const L = w.listaLocaisProntos(); return { content: [{ type: "text", text: JSON.stringify(L, null, 1) }], structuredContent: { locais: L } }; }
      const L = w.localPronto(a.tipo, { largura: a.largura, profundidade: a.profundidade, altura: a.altura, semente: a.semente, padrao: a.padrao, densidade: a.densidade, nome: a.nome });
      const r = w.compilarName(L.codigo + "elenco\n  Kai\nquadro 1 local \"" + L.nome + "\" geral angulo plongee\n  Kai em (0,0)\n", { semCache: true, salvar: false });
      const out = { tipo: L.tipo, nome: L.nome, pecas: L.pecas, opcoes: L.opcoes, codigo: L.codigo, avisos: r.avisos.slice(0, 8), erros: r.erros }; const content = [{ type: "text", text: JSON.stringify(out, null, 1) }];
      if (r.quadros[0]) content.push({ type: "image", data: (await toPng(w.renderizarQuadro(r.quadros[0], { passes: false }).svg, 900)).toString("base64"), mimeType: "image/png" });
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
  server.registerTool("catalogo", {
    title: "Catálogo por categoria (criaturas, armas de fogo e varinha, veículos, subfunções narrativas) com miniaturas",
    description: "categoria: criaturas (espécies por plano corporal, poses e verbos), armas (armas de fogo e varinha com os golpes/poses de cada uma, feitiços), veiculos (assentos e quem puxa), subfuncoes (encenações de 4 quadros de uma função narrativa: normalidade → estímulo → reação → consequência; filtre por funcao). miniaturas=false devolve só o texto.",
    inputSchema: { categoria: z.enum(["criaturas", "armas", "veiculos", "subfuncoes"]), funcao: z.string().max(80).optional(), miniaturas: z.boolean().optional() }, annotations: RO
  }, async a => {
    try { const w = W(); let out, demo = [];
      if (a.categoria === "criaturas") { const esp = Object.entries(w.QD_ESPECIES).filter(([, e]) => e.classe === "criatura" || e.asas).map(([k, e]) => ({ especie: k, plano: e.plano || "quadrupede-alado" }));
        out = { especies: esp, poses: Object.keys(w.CR_POSES), verbos: w.CR_VERBOS, animacoes: w.listaAnimacoesCriatura() }; demo = esp.slice(0, 24).map(e => ["elenco\n  A animal " + e.especie + "\nquadro 1 alvo A lado 3/4 angulo plongee\n  A em (0,0) gira 90\n", e.especie]); }
      else if (a.categoria === "armas") { const G = w.listaGolpes().filter(g => /rifle|sniper|metralhadora|escopeta|smg|bazuca|revolver|pistola|magia/.test(g.classe)); out = { golpes: G.map(g => ({ nome: g.nome, classe: g.classe, arma: g.teste, desc: g.desc })), feiticos: "Kai feitico desarmar|atordoar|raio|fogo|gelo|explosao|maldicao|escudo|luz|levitar|cura|invocar|duelo em Mira", tiro: "Kai atira em Mira [com sniper] [rajada 5]" };
        demo = G.filter((g, i) => i % 2 === 0).slice(0, 24).map(g => ["elenco\n  Kai\nquadro 1 inteiro alvo Kai lado 3/4\n  Kai em (0,0) segura " + g.teste + " como " + g.nome + "\n", g.nome]); }
      else if (a.categoria === "veiculos") { out = { veiculos: w.listaVeiculos(), uso: "objeto barcoRemo \"barco\" em (0,3) · Kai rema barco · Mira embarca barco passageiro · Trovao puxa carruagem (o animal fica entre os varais e o veículo vai atrás, também no filme)" };
        demo = out.veiculos.map(v => ["elenco\n  Kai\nquadro 1 geral angulo plongee\n  objeto " + v.tipo + " \"v\" em (0,0)\n  Kai embarca v\n", v.tipo]); }
      else { const S = w.nrListarSub(a.funcao); out = { total: w.NR_SUB_TOTAL, subfuncoes: S.slice(0, 400) }; demo = S.slice(0, 12).map(s => [w.nrDemoTexto(s.id), s.id]); }
      const content = [{ type: "text", text: JSON.stringify(out, null, 1).slice(0, 90000) }];
      if (a.miniaturas !== false && demo.length) { const qs = [], rot = []; for (const [t, id] of demo) { const r = w.compilarName(t, { semCache: true, salvar: false }); if (r.quadros[0]) { qs.push(r.quadros[0]); rot.push(id); } } if (qs.length) content.push({ type: "image", data: (await folha(w, qs, rot, 6, 240)).toString("base64"), mimeType: "image/png" }); }
      return { content, structuredContent: out }; } catch (e) { return ERRO(e); }
  });
}
