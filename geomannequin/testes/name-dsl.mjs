/* GeoMannequin — DSL do name: linguagem, geometria do local, biblioteca de locais, ficha (bordas e legenda por OCR),
   páginas, e três histórias + duas plantas descritas em texto de ponta a ponta.
   Uso: node testes/name-dsl.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
import { toPng } from "../mcp/lib/png.mjs";
import { fichaPng } from "../mcp/lib/tools-name.mjs";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url)), OUT = join(HERE, "saida-name"); mkdirSync(OUT, { recursive: true });
let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const M = 1 / 0.114;

/* 1. linguagem */
console.log("1. linguagem");
{
  const w = createWorld();
  const r = w.compilarName(`// comentário
semente 5
define d 2
elenco
  Ana relevante corpo feminino
  Leo relevante corpo masculino cor roxo
  Bia relevante corpo menina
  gente figurante
local Sala unidade m origem (0,0)
  chao retangulo -5,-5 a 5,5   # comentário no fim
  mesa "mesa" em (0,0)
modelo par(a, b)
  a em (-1,0) olha b
  b frente-de a distancia $d
quadro 1 local Sala plano geral
  usar par(Ana, Leo)
  gente 4..8 multidao em area (-4,-4) (4,-2) olham: 50% Ana, resto aleatorio
  repetir 2: gente em (3, 1+i*2)
transicao tempo "Dias depois"
quadro 2 continua plano close alvo Ana lado 3/4
  escolha 100% Ana expressao alegria | nada
`);
  ok(r.ok && r.quadros.length === 2, "compila elenco, local, modelo, repetir, escolha, define ($d), comentários (" + JSON.stringify(r.erros) + ")");
  const cores = Object.fromEntries(r.elenco.map(e => [e.nome, e.cor]));
  ok(cores.Ana === "vermelho" && cores.Leo === "roxo" && cores.Bia !== cores.Ana && cores.gente === "cinza", "cores: relevantes fixas e distintas, figurantes cinza: " + JSON.stringify(cores));
  const q1 = r.quadros[0], fig = q1.estado.list.filter(m => /^gente/.test(m.name));
  ok(fig.length >= 6 && fig.length <= 10 && fig.every(m => m.col && m.col.fill === "#9a9ca3"), "figurantes sorteados (4..8 + 2) com cor única: " + fig.length);
  const ana = q1.estado.list.find(m => m.name === "Ana"), leo = q1.estado.list.find(m => m.name === "Leo");
  ok(Math.abs(Math.hypot(ana.params.wx - leo.params.wx, ana.params.wz - leo.params.wz) - 2 * M) < 1, "modelo + define: Leo a 2 m de Ana");
  ok(/Dias depois/.test(r.quadros[1].legenda) && r.quadros[1].transicao === "tempo", "transição entra na legenda e no quadro");
  const r2 = w.compilarName(`semente 5\nelenco\n  g figurante\nquadro\n  g 30 multidao olham: 60% (0,0), 20% costas, resto aleatorio\n`, { semCache: true }), r3 = w.compilarName(`semente 5\nelenco\n  g figurante\nquadro\n  g 30 multidao olham: 60% (0,0), 20% costas, resto aleatorio\n`, { semCache: true });
  ok(JSON.stringify(r2.quadros[0].estado.list.map(m => [m.params.wx, m.params.wRot])) === JSON.stringify(r3.quadros[0].estado.list.map(m => [m.params.wx, m.params.wRot])), "mesma semente = mesmo resultado");
  const vir = r2.quadros[0].estado.list.filter(m => /^g /.test(m.name)).filter(m => { const a = Math.atan2(-m.params.wx, -m.params.wz) * 180 / Math.PI; return Math.abs(((m.params.wRot - a + 540) % 360) - 180) < 20; }).length;
  ok(vir >= 12 && vir <= 27, "orientação por probabilidade: ~60% virados para (0,0): " + vir + "/30");
  const e = w.compilarName(`elenco\n  Ana relevante\nlocal X\n  arvre em (1,1)\nquadro local X plano medo\n  Ana pose correno\n  Ann em (0,0)\nquadro local X\n  Ana expressao alegria\n`);
  const msgs = e.erros.map(x => x.linha + ":" + x.erro).join(" | ");
  ok(e.erros.length >= 4 && /4:.*arvore/.test(msgs) && /5:.*Plano/.test(msgs) && /6:.*correndo/.test(msgs) && /7:.*Ann/.test(msgs) && e.quadros.length === 2, "erros em português com linha e sugestão, sem parar os outros quadros: " + msgs.slice(0, 260));
}

/* 2. geometria do local */
console.log("2. geometria");
{
  const w = createWorld();
  const r = w.compilarName(`elenco
  Ana relevante
local Casa unidade m origem (0,0)
  chao retangulo 0,0 a 10,8
  sala "Quarto" retangulo 0,0 a 5,4 altura 3 porta lado leste janela lado norte
  parede linha (5,4)-(10,4) altura 3 vao porta (7.5,4) largura 1.2
  nivel "Mezanino" altura 2 retangulo 6,5 a 10,8
  escada de (6,0.5) ate (6,4.5) sobe-para norte altura 2
  cama encostado-em "Quarto" lado oeste
  marca "porta" em (5,2)
  regiao "sala" retangulo 5,0 a 10,4
quadro local Casa plano geral
  Ana nivel "Mezanino" em (8,6.5)
`);
  ok(r.ok, "local com sala, porta, janela, parede com vão, nível, escada, encostado-em (" + JSON.stringify(r.erros) + ")");
  const ob = r.quadros[0].estado.objetos, paredes = ob.filter(o => o.tipo === "parede");
  const leste = paredes.filter(o => Math.abs(o.x - 5 * M) < 1 && o.giro === 0 && !o.emAr);
  ok(leste.length === 2 && leste.every(p => Math.abs(p.z - 2 * M) > 0.5 * M), "porta no lado leste corta a parede em dois pedaços (vão no meio)");
  const verga = paredes.filter(o => o.emAr && o.base > 2 * M);
  ok(verga.length >= 2, "porta e janela deixam verga em cima (" + verga.length + ")");
  const esc = ob.find(o => o.tipo === "rampaDegraus");
  ok(esc && Math.abs(esc.alt - 2 * M) < 0.5 && Math.abs(esc.prof - 4 * M) < 1 && esc.giro === 0, "escada: 4 m de comprimento, sobe para o norte até 2 m");
  const ana = r.quadros[0].estado.list.find(m => m.name === "Ana");
  ok(Math.abs(ana.params.bodyLift - 2 * M) < 0.5 && Math.abs(ana.params.wx - 8 * M) < 1, "personagem em cima do nível (2 m)");
  const cama = ob.find(o => o.tipo === "cama"); ok(cama && cama.x < 1.5 * M && Math.abs(cama.giro) === 90, "cama encostada na parede oeste do quarto");
  const av = w.compilarName(`local Y unidade m\n  predio retangulo 0,0 a 4,4 altura 6\n  arvore em (2,2) raio 1 altura 4\n  nivel "T" altura 3 retangulo 6,0 a 8,2\n  escada de (5,0) ate (5,3) altura 1\nquadro local Y plano geral\n`).avisos.join(" | ");
  ok(/atravessam/.test(av) && /escada/.test(av), "avisa peças atravessadas e escada que não chega ao nível: " + av.slice(0, 200));
  const rel = w.compilarName(`elenco\n  A relevante\n  B relevante\nlocal Z unidade m\n  chao retangulo -5,-5 a 5,5\n  coluna em (0,0) altura 3\nquadro local Z plano medio alvo A\n  A em (-3,0) gira 90\n  B frente-de A distancia 1.5\n  A olha B\n`);
  const A = rel.quadros[0].estado.list.find(m => m.name === "A"), B = rel.quadros[0].estado.list.find(m => m.name === "B");
  ok(Math.abs(B.params.wx - (A.params.wx + 1.5 * M)) < 1 && Math.abs(B.params.wz - A.params.wz) < 1, "frente-de: B 1,5 m à frente de A (que olha para +x)");
  const cam = w.compilarName(`elenco\n  A relevante\nlocal Q unidade m\n  chao retangulo -6,-6 a 6,6\n  parede linha (-6,2)-(6,2) altura 3\nquadro local Q plano inteiro alvo A lado frente\n  A em (0,0) gira 0\n`);
  ok(cam.quadros[0].avisos.some(a => /câmera girada/.test(a)), "câmera foge da parede entre ela e o alvo: " + cam.quadros[0].avisos.join("; "));
}

/* 3. biblioteca de locais */
console.log("3. biblioteca");
{
  const w = createWorld(), B = w.bibliotecaLocais();
  B.salvar("Rua", 'local "Rua" unidade m\n  chao retangulo -10,-3 a 10,3 classe pedra\n  predio retangulo -10,3 a -2,8 altura 9\n  marca "esquina" em (-2,3)');
  B.salvar("Rua", 'local "Rua" unidade m\n  chao retangulo -10,-3 a 10,3 classe pedra\n  predio retangulo -10,3 a -2,8 altura 9\n  predio retangulo 2,3 a 10,8 altura 12\n  marca "esquina" em (-2,3)');
  ok(B.listar().length === 1 && B.obter("Rua").versao === 2 && B.obter("Rua", 1).codigo.split("\n").length === 4, "versões: v1 e v2 guardadas");
  const r = w.compilarName('elenco\n  Ana relevante\nlocal "Rua à noite" herda "Rua"\n  poste em (0,2.5)\n  caixa "lixo" em (3,2.5)\nquadro local "Rua" plano geral\n  Ana em marca "esquina"\nquadro local "Rua à noite" plano geral\n  Ana em (0,0)\n');
  ok(r.erros.length === 1 && /poste/.test(r.erros[0].erro) && r.locais.find(l => l.nome === "Rua").daBiblioteca === 2 && r.locais.find(l => l.nome === "Rua à noite").pecas === 4, "local salvo usado pelo nome; herda + peças novas (erro só na peça inexistente)");
  const json = B.exportar(), w2 = createWorld(); ok(w2.bibliotecaLocais().importar(json) === 1 && w2.bibliotecaLocais().obter("Rua", 1), "exportar → importar (com versões)");
  const ab = w.abrirLocalNoPalco("Rua"); ok(ab.pecas === 3 && w.sceneList(true).length >= 1 && w.leituraBlocking().objetos.length === 3, "abrir no palco: troca os objetos e mantém os manequins");
  const cod = w.localDoPalco("Rua copiada"); const r2 = w.compilarName(cod + '\nquadro local "Rua copiada" plano geral\n');
  ok(r2.ok && r2.locais[0].pecas === 3, "palco → código DSL → local de novo (ida e volta)");
}

/* 4. ficha, páginas e cores */
console.log("4. ficha");
{
  const w = createWorld(), r = w.compilarName(w.EXEMPLO_NAME);
  ok(r.ok && r.quadros.length === 4, "exemplo do manual compila (" + r.avisos.length + " avisos)");
  const f = w.fichaDoQuadro(r.quadros[1]);
  ok(/stroke="#00b140"/.test(f.svg) && /stroke="#1060ff"/.test(f.svg) && /stroke="#ffd400"/.test(f.svg) && /fill="#e00000"/.test(f.svg) && /fill="#ffffff">/.test(f.svg), "bordas verde, azul e amarela; retângulo vermelho com texto branco");
  const s = w.fichaDoQuadro(r.quadros[1], { semLaterais: true, semLegenda: true }); ok(!/#1060ff|#ffd400|#e00000/.test(s.svg) && s.largura < f.largura, "opções sem laterais e sem legenda");
  const qv = w.compilarName(w.EXEMPLO_NAME.replace("quadro 4 continua plano close alvo Tomo lado frente tamanho grande", "quadro 4 continua plano close alvo Tomo lado frente formato 3:4")).quadros[3], fv = w.fichaDoQuadro(qv);
  ok(fv.altura > f.altura, "o painel principal segue o formato do quadro (3:4 é mais alto)");
  const fp = await fichaPng(w, r.quadros[0]); writeFileSync(join(OUT, "ficha-1.png"), fp.png);
  /* cores dos pixels nas bordas */
  ok(fp.png.length > 50000, "ficha em PNG (" + (fp.png.length / 1024 | 0) + " KB)");
  let ocr = "";
  /* recorte do retângulo vermelho (como a IA de imagem lê) */
  const cx = fp.caixaLegenda, svgLeg = fp.svg.replace(/viewBox="[^"]+" width="[^"]+" height="[^"]+"/, 'viewBox="' + cx.x + " " + cx.y + " " + cx.w + " " + cx.h + '" width="' + cx.w + '" height="' + cx.h + '"');
  writeFileSync(join(OUT, "legenda-1.png"), await toPng(svgLeg, cx.w));
  try { ocr = execFileSync("tesseract", [join(OUT, "legenda-1.png"), "-", "-l", "por", "--psm", "6"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { ocr = ""; }
  const alvo = r.quadros[0].legenda.split(/\s+/).filter(x => x.length > 4).map(x => x.replace(/[.,()]/g, "").toLowerCase()), achou = alvo.filter(x => ocr.toLowerCase().includes(x)).length;
  ok(!ocr || achou / alvo.length > 0.6, "OCR lê a legenda branca no vermelho: " + (ocr ? achou + "/" + alvo.length + " palavras" : "tesseract ausente (pulado)"));
  const fotos = r.quadros.map(q => w.renderizarQuadro(q, { passes: false })), pgs = w.paginasDoName(r, fotos);
  ok(pgs.length === 1 && pgs[0].quadros.length === 4 && /<image /.test(pgs[0].svg), "página do name com os 4 quadros (sem texto)");
  const c = w.legendaDeCores(r); ok(c.lista.length === 4 && /vermelho = Kai/.test(c.svg) && c.lista.find(x => x.nome === "Tomo").quadros.join() === "3,4", "legenda de cores: quem é quem e em que quadros");
  const man = w.manifestoName(r, w.EXEMPLO_NAME); ok(man.quadros.length === 4 && man.quadros[2].transicao === "tempo" && man.bordas.verde && man.dsl.length > 100, "manifesto com quadros, transições, bordas e o texto");
}

/* 5. três histórias e duas plantas descritas em texto (de ponta a ponta) */
console.log("5. histórias");
{
  const w = createWorld();
  const historias = {
    "luta no telhado": `semente 9
elenco
  Ryu relevante corpo masculino musculoso
  Sora relevante corpo feminino atletico
local "Telhado" unidade m origem (0,0)
  chao retangulo -8,-6 a 8,6 classe pedra
  muro linha (-8,-6)-(8,-6)-(8,6)-(-8,6)-(-8,-6) altura 1
  caixa "caixa d'água" em (5,3) tamanho 2x2x2.5
  marca "beirada" em (0,-5)
quadro 1 local "Telhado" plano geral funcao "estabelecimento" angulo plongee
  Ryu em (-2,0) pose guardaLuta olha Sora
  Sora em (2,0) pose guardaLuta olha Ryu
quadro 2 continua plano americano alvo Ryu, Sora lado perfil
  Ryu, Sora interacao clinch
quadro 3 continua plano close alvo Sora angulo contra-plongee tamanho grande funcao "clímax"
  Sora expressao gritoDeGuerra
quadro 4 continua plano inteiro alvo Ryu
  Ryu em marca "beirada" pose caindo expressao medo`,
    "mercado lotado": `semente 2
elenco
  Nami relevante corpo menina
  Avo relevante corpo masculino cheio
  povo figurante
local "Mercado" unidade m
  chao retangulo -12,-8 a 12,8 classe terra
  fileira 5 banca de (-10,-4) ate (10,-4) tamanho 2x1x1 classe madeira
  fileira 5 banca de (-10,4) ate (10,4) tamanho 2x1x1 classe madeira
  regiao "corredor" retangulo -11,-3 a 11,3
quadro 1 local "Mercado" plano geral funcao "estabelecimento"
  povo 35..45 multidao em regiao "corredor" olham: 30% Nami, resto aleatorio poses: caminhando:3 | empe:2
  Nami em (0,0) expressao admiracao
  Avo atras-de Nami distancia 1.5 olha Nami
quadro 2 continua plano medio alvo Nami lado frente
  Nami segura caixa como aFrente expressao alegria
pagina leitura ocidental
quadro 3 continua plano close alvo Avo lado 3/4
  Avo expressao pensativo`,
    "flashback na sala": `elenco
  Tia relevante corpo feminino
  Gui relevante corpo menino
local "Sala" unidade m
  chao retangulo 0,0 a 6,5 classe madeira
  sala "Sala" retangulo 0,0 a 6,5 porta lado sul janela lado norte
  mesa centro-de "Sala"
  banco "sofá" encostado-em "Sala" lado oeste tamanho 2x0.9x0.8
quadro 1 local "Sala" plano conjunto
  Tia em (2,2) sentado olha Gui
  Gui em (4,2) expressao tristeza olha Tia
transicao flashback
quadro 2 novo plano inteiro alvo Gui
  Gui em (3,3) correndo expressao riso
transicao corte
quadro 3 local "Sala" plano close alvo Tia
  Tia em (2,2) expressao alivio`
  };
  for (const [nome, t] of Object.entries(historias)) { const r = w.compilarName(t);
    ok(r.ok && r.quadros.length >= 3 && r.quadros.every(q => q.legenda.length > 10), "história “" + nome + "”: " + r.quadros.length + " quadros" + (r.erros.length ? " ERROS " + JSON.stringify(r.erros) : "") + (r.avisos.length ? " · avisos: " + r.avisos.slice(0, 3).join("; ") : ""));
    const f = await fichaPng(w, r.quadros[1]); writeFileSync(join(OUT, nome.replace(/\s/g, "-") + "-q2.png"), f.png); }
  const plantas = {
    /* planta do usuário 1: quintal com prédio em L, escada até um terraço, árvores e poço (vista de cima → texto) */
    "quintal em L": `local "Quintal" unidade m origem (0,0)
  chao retangulo -8,-7 a 8,7 classe areia
  casa "Casa" retangulo -8,-7 a -3,0 altura 4
  casa "Anexo" retangulo -8,0 a -5,5 altura 4
  nivel "Terraço" altura 3 retangulo 3,3 a 8,7
  escada de (5,-1) ate (5,3) sobe-para norte altura 3
  arvore em (-1,5) raio 1.2 altura 5
  arvore em (2,-5) raio 1.5 altura 6
  poco em (0,0)
  marca "vermelho" em (-2,1)
  marca "azul" em (1,-2)
  marca "roxo" em (5,5)`,
    /* planta do usuário 2: rua com prédios dos dois lados e uma praça redonda no fim */
    "rua e praça": `local "Rua da praça" unidade m origem (0,0)
  chao retangulo -6,-20 a 6,20 classe pedra
  repetir 4: predio retangulo -12,-20+i*8 a -6,-13+i*8 altura 9
  repetir 4: predio retangulo 6,-20+i*8 a 12,-13+i*8 altura 12
  chao circulo em (0,16) raio 6 classe grama
  circulo-de 6 arvore em (0,16) raio 5 altura 4
  regiao "calçada" retangulo -6,-20 a -4,12`
  };
  for (const [nome, t] of Object.entries(plantas)) { const r = w.compilarName("elenco\n  Ana relevante\n  Bo relevante\n  Cris relevante\n" + t + '\nquadro local ' + /local ("[^"]+")/.exec(t)[1] + " plano geral\n" + (/vermelho/.test(t) ? '  Ana em marca "vermelho"\n  Bo em marca "azul"\n  Cris nivel "Terraço" em marca "roxo"\n' : "  Ana em (0,0)\n"));
    ok(r.ok && r.locais[0].pecas >= 8, "planta “" + nome + "”: " + r.locais[0].pecas + " peças" + (r.erros.length ? " ERROS " + JSON.stringify(r.erros) : "") + (r.avisos.length ? " · " + r.avisos.slice(0, 2).join("; ") : ""));
    const f = await fichaPng(w, r.quadros[0]); writeFileSync(join(OUT, "planta-" + nome.replace(/\s/g, "-") + ".png"), f.png); }
}
if (falhou) { console.log("\nFALHOU"); process.exit(1); } else console.log("\nname-dsl: tudo ok");
