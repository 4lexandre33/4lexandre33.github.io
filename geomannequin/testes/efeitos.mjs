/* GeoMannequin — efeitos especiais: catálogo inteiro sem NaN, âncoras seguindo a pose, direção para um alvo,
   ordem atrás/na frente do dono, camadas de tela, salvar/carregar, desfazer, escala pelo tamanho do manequim,
   reverso, semente determinística, SVG limpo, código desligado no servidor e conversão dos efeitos antigos.
   Uso: node testes/efeitos.mjs */
import { createWorld } from "../mcp/lib/core.mjs";
import { CATALOGO, validarEfeito, limparSvg, desenharEfeitos, contextoCena, resolverAncora, registrarEfeito } from "../src/engine/index.js";

let falhou = false;
const ok = (c, t) => { if (!c) falhou = true; console.log((c ? "  ok  " : "  FALHOU  ") + t); };
const desenhar = w => w.renderScene(w.sceneList(true), Object.assign({}, w.L, { grid: false }), false, 16).svg;

/* 1. todos os tipos, no mundo (com manequim, de frente e em 3/4) e presos à tela */
{ let ruins = [], vazios = [];
  for (const tipo of Object.keys(CATALOGO)) for (const az of [0, 40]) {
    const w = createWorld(); w.cena.ativo.poseRapida("socando"); if (tipo === "parede_quebrada") w.cena.objeto("parede", { x: 6, z: -3 });
    w.camera.girar(az, 0);
    w.cena.efeito(tipo, tipo === "personalizado" ? { svg: '<circle r="10" fill="#f00"/>' } : {});
    const s = desenhar(w); if (/NaN|Infinity/.test(s)) ruins.push(tipo + "@" + az); if (!new RegExp('data-vfx="' + tipo + '"').test(s)) vazios.push(tipo + "@" + az);
    const w2 = createWorld(); w2.cena.efeito(tipo, { ancora: { modo: "tela", x: 0.4, y: 0.4 }, ...(tipo === "personalizado" ? { svg: "<circle r='5'/>" } : {}) }); if (/NaN|Infinity/.test(desenhar(w2))) ruins.push(tipo + "@tela");
  }
  ok(!ruins.length, Object.keys(CATALOGO).length + " tipos sem NaN no mundo (2 vistas) e na tela" + (ruins.length ? ": " + ruins.join(", ") : ""));
  ok(!vazios.length, "todos aparecem no desenho" + (vazios.length ? " (faltou: " + vazios.join(", ") + ")" : ""));
}
/* 2. a âncora segue a pose (a mão sobe, o efeito sobe) e escala com o tamanho do manequim */
{ const w = createWorld(), m = w.cena.ativo; m.efeito("energia_mao", { em: "maoDir" });
  const tela = () => { const l = w.sceneList(true), K = contextoCena(l); return resolverAncora(K, w.SCN.efeitos[0].ancora, {}).tela; };
  const a = tela(); m.pose({ bracoDirAbrir: 160 }); const b = tela();
  ok(b[1] < a[1] - 40, "esfera na mão acompanha o braço que sobe (" + a[1].toFixed(0) + " → " + b[1].toFixed(0) + " px)");
  const raio = w2 => { const l = w2.sceneList(true); const R = desenharEfeitos(l, l.efeitos, 0, {}); const s = R.itens[0].svg, n = (s.match(/a(\d+\.?\d*) /) || [])[1]; return +n; };
  const g = createWorld(); g.cena.ativo.efeito("energia_mao", { em: "maoDir" }); const r1 = raio(g); g.cena.ativo.corpo({ comprimentoPernas: 1.3 }); const r2 = raio(g);
  ok(r2 > r1 * 1.02, "efeito no manequim cresce com o tamanho dele (" + r1 + " → " + r2 + ")");
}
/* 3. direção para outro manequim e direção automática pelo antebraço */
{ const w = createWorld(); const a = w.cena.ativo; w.cena.adicionar({ nome: "Leo", x: 10, z: 0 }); a.efeito("feixe", { em: "maoDir", para: "Leo" });
  const l = w.sceneList(true), R = desenharEfeitos(l, l.efeitos, 0, {});
  const xs = [...R.itens[0].svg.matchAll(/ d="([^"]+)"/g)].flatMap(m => { const n = (m[1].match(/-?\d+\.?\d*/g) || []).map(Number); return n.filter((_, i) => i % 2 === 0); }), K = contextoCena(l), alvo = resolverAncora(K, { modo: "manequim", alvo: "Leo", parte: "peito" }, {});
  ok(Math.max(...xs) > alvo.tela[0] - 20, "feixe vai da mão até o outro manequim");
}
/* 4. aura atrás do dono, esfera na frente; linhas de concentração no fundo de tudo, onomatopeia na frente */
{ const w = createWorld(), m = w.cena.ativo; m.efeito("aura"); m.efeito("energia_mao", { em: "maoDir" }); w.cena.efeito("concentracao"); w.cena.efeito("onomatopeia", { texto: "DON" });
  const s = desenhar(w), iA = s.indexOf('data-vfx="aura"'), iM = s.indexOf('id="manequim-1"'), iE = s.indexOf('data-vfx="energia_mao"'), iF = s.indexOf('id="efeitos-fundo"'), iC = s.indexOf('id="chao"'), iT = s.indexOf('id="efeitos-frente"');
  ok(iA >= 0 && iA < iM && iE > iM, "aura atrás do corpo, esfera na frente da mão");
  ok(iF >= 0 && iF < iC && iT > iE && /DON/.test(s.slice(iT)), "efeito de tela no fundo (antes do chão) e onomatopeia na frente de tudo");
}
/* 5. salvar/carregar (âncora por índice), desfazer e modelos */
{ const w = createWorld(); w.cena.adicionar({ nome: "Leo", x: 8 }); w.cena.obter("Leo").efeito("aura", { elemento: "vazio" }); const id = w.cena.efeito("cratera", { em: { modo: "chao", x: 3, z: 1 } });
  const j = JSON.parse(w.cena.exportarJSON()), w2 = createWorld(); w2.cena.importarJSON(j);
  const L2 = w2.cena.efeitos.lista(); ok(L2.length === 2 && L2[0].ancora.alvo === "Leo" && L2[0].elemento === "vazio" && L2[1].ancora.x === 3, "salvar e abrir a cena mantém os efeitos e o dono");
  w.cena.efeitos.remover(id); ok(w.cena.efeitos.lista().length === 1, "remover"); w.cena.desfazer(); ok(w.cena.efeitos.lista().length === 2, "desfazer devolve o efeito");
  const n = w.cena.efeitos.salvarModelo(w.cena.efeitos.lista()[0].id, "Aura roxa"); const novo = w.cena.efeitos.usarModelo(n, { ancora: "maoDir" });
  ok(w.cena.efeitos.obter(novo).elemento === "vazio" && w.cena.efeitos.obter(novo).ancora.parte === "maoDir", "Meus efeitos: salvar e usar em outra parte");
}
/* 6. semente determinística, reverso, progresso e intensidade */
{ const base = { tipo: "explosao", ancora: { modo: "tela", x: 0.5, y: 0.5 }, semente: 7 };
  const s = o => desenharEfeitos([], [validarEfeito({ ...base, ...o })], 0, {}).itens[0].svg.replace(/data-efeito="fx\d+"/, "");
  ok(s({}) === s({}) && s({}) !== s({ semente: 8 }), "mesma semente = mesmo desenho; outra semente = outro");
  ok(s({ reverso: true }) !== s({}) && s({ progresso: 0.2 }) !== s({}), "reverso (implosão) e estágio mudam o desenho");
}
/* 7. SVG de usuário limpo; código desligado no servidor; erros em português */
{ const t = limparSvg('<circle r="5" onclick="x()"/><script>alert(1)</script><a href="https://x.com"><rect/></a><foreignObject><div/></foreignObject>');
  ok(!/script|onclick|https|foreignObject/i.test(t) && /<circle/.test(t), "SVG personalizado sem script, eventos, links ou foreignObject");
  let e1 = ""; try { registrarEfeito("x", () => ""); } catch (e) { e1 = e.message; } ok(/só funcionam no app/.test(e1), "efeito por código desligado fora do app");
  let e2 = ""; try { validarEfeito({ tipo: "xyz" }); } catch (e) { e2 = e.message; } ok(/não existe/.test(e2), "tipo desconhecido → erro em português");
  const w = createWorld(); w.cena.efeito("personalizado", { codigo: "return '<circle r=\"9\"/>'" }); ok(/codigo-desligado/.test(desenhar(w)), "código num efeito vira só um aviso quando não é permitido");
}
/* 8. efeitos antigos (PR #20) viram efeitos novos; ControlNet sem efeitos por padrão */
{ const w = createWorld(); w.cena.referencia("explosao"); w.cena.referencia("impacto"); w.cena.referencia("paleto");
  const n = w.cena.efeitos.converterAntigos(); ok(n === 2 && w.cena.referencias().length === 1 && w.cena.efeitos.lista().map(e => e.tipo).join() === "explosao,concentracao", "converter: explosão e linhas radiais viram efeitos; o paletó fica");
  const r = w.executarRoteiro('#quadro 1\nefeito("aura");'), q = w.renderizarQuadro(r.quadros[0], { passes: { contorno: true } });
  ok(/data-vfx="aura"/.test(q.svg) && !/data-vfx/.test(q.contorno), "quadro com efeito; contorno (ControlNet) sem efeito");
}
/* 9. arquivos em camadas: fundo, cada efeito de cena e frente */
{ const w = createWorld(); w.cena.efeito("concentracao"); w.cena.ativo.efeito("aura"); w.cena.efeito("onomatopeia");
  const f = w.arquivosCamadas().map(x => x.nome); ok(f.includes("00a-efeitos-fundo.svg") && f.some(n => /^efeito-01-aura/.test(n)) && f.includes("99-efeitos-frente.svg"), "exportação em camadas separa os efeitos");
}
/* 10. preto e branco por padrão; cor opcional; colorir a cena toda */
{ const w = createWorld(), m = w.cena.ativo; m.efeito("aura"); const pb = desenhar(w);
  const cores = s => (s.match(/fill="#([0-9A-F]{6})"/gi) || []).map(c => c.slice(7, 13).toUpperCase()).filter(h => { const n = parseInt(h, 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; return Math.max(r, g, b) - Math.min(r, g, b) > 30; });
  const fxPb = pb.slice(pb.indexOf('data-vfx="aura"'), pb.indexOf("</g>", pb.indexOf('data-vfx="aura"')) + 400);
  ok(!cores(fxPb).length, "efeito sai em preto e branco por padrão");
  w.cena.efeitos.colorir(true); const cor = desenhar(w), fxC = cor.slice(cor.indexOf('data-vfx="aura"'));
  ok(cores(fxC).length > 0 && w.cena.efeitos.lista()[0].colorido, "colorir(true) liga a cor");
  const w2 = createWorld(); w2.cena.ativo.efeito("explosao", { cores: ["#FFEE00", "#FF0000"] }); ok(w2.cena.efeitos.lista()[0].colorido, "passar cores próprias liga a cor");
}
/* 11. efeitos do chão abaixo do manequim; tornado passa atrás e na frente de quem está dentro */
{ const w = createWorld(), m = w.cena.ativo; m.efeito("cratera"); m.efeito("circulo_magico"); w.cena.efeito("tornado", { em: { modo: "chao", x: 0, z: 0 } });
  const s = desenhar(w), iC = s.indexOf('id="efeitos-chao"'), iM = s.indexOf('id="manequim-1"');
  ok(iC > 0 && iC < iM && /data-vfx="cratera"/.test(s.slice(iC, iM)) && /data-vfx="circulo_magico"/.test(s.slice(iC, iM)), "cratera e círculo mágico ficam no chão, abaixo do manequim");
  const tA = s.indexOf('data-vfx="tornado" data-parte="atras"'), tF = s.indexOf('data-vfx="tornado" data-parte="frente"');
  ok(tA > 0 && tA < iM && tF > iM, "tornado: metade de trás atrás do corpo, metade da frente na frente");
  const w2 = createWorld(); w2.cena.ativo.efeito("aneis_orbitais"); const s2 = desenhar(w2), m2 = s2.indexOf('id="manequim-1"');
  ok(s2.indexOf('data-vfx="aneis_orbitais" data-parte="atras"') < m2 && s2.indexOf('data-vfx="aneis_orbitais" data-parte="frente"') > m2, "anéis em volta do corpo passam atrás e na frente");
}
/* 12. nível de poder e tamanho em alturas do corpo; onomatopeia em katakana */
{ const w = createWorld(), m = w.cena.ativo; const a = m.efeito("explosao", { nivel: 1 }), b = m.efeito("explosao", { nivel: 5 });
  const L = w.cena.efeitos.lista(), t1 = w.cena.efeitos.tamanho(L[0].id), t5 = w.cena.efeitos.tamanho(L[1].id);
  ok(t5.corpos > t1.corpos * 2, "nível 5 bem maior que o nível 1 (" + t1.corpos + " → " + t5.corpos + " alturas do corpo)");
  const w2 = createWorld(); w2.cena.efeito("onomatopeia", { texto: "ドッ" }); const s = desenhar(w2), seg = s.slice(s.indexOf('data-vfx="onomatopeia"'));
  ok(w2.cena.efeitos.lista()[0].estiloTexto === "katakana" && !/<text/.test(seg.slice(0, seg.indexOf("</g></g>"))) && /<path/.test(seg), "katakana desenhado em pinceladas (sem depender de fonte)");
}
console.log(falhou ? "FALHOU." : "Tudo certo.");
process.exit(falhou ? 1 : 0);
