/* GeoMannequin — construtor de efeitos por CAMADAS (dados e validação; o desenho está em construtor.js).
   Qualquer efeito visual sai da combinação de:
     caminho  — por onde a forma passa, em 3D a partir da âncora (reta, arco, hélice, espiral, onda, zigue-zague,
                raio fractal, S, laço, círculo, ou pontos livres — a "caneta Bézier")
     forma    — o que se desenha nesse caminho (fita de espessura variável, anéis, partículas, gotas, estrelas,
                espinhos, cúpula, círculo mágico, nuvem, chamas, degraus)
     repetir  — quantas cópias e como (leque, anel, ao longo, paralelo, aleatório, fases)
     traço    — largura e perfil de espessura (grosso→fino, fuso, pincel, agulha, cheio, ou a sua lista de larguras) e ponta
     estilo   — acabamento: linha, contorno, chapado, cel (duas sombras), brilho, nanquim
   O referencial local: u = direção do efeito, v = "para cima" (perpendicular a u), w = lado (u × v). Unidades: R (≈ 11,4 cm). */

const ESTILOS_VFX = { linha: "Só traço (lineart)", contorno: "Contorno de nanquim, miolo claro", chapado: "Cor chapada com contorno", cel: "Cel: base, sombra e luz",
  brilho: "Brilho: miolo branco e halo", nanquim: "Nanquim: preto cheio com luz branca" };
const CAMINHOS_VFX = ["reta", "arco", "helice", "espiral", "onda", "zigue", "raio", "s", "laco", "circulo", "pontos"];
const FORMAS_VFX = ["fita", "aneis", "particulas", "gotas", "estrelas", "bolhas", "espinhos", "cupula", "esfera", "circuloMagico", "nuvem", "chamas", "degraus", "estouro"];
const REPETIR_VFX = ["nenhum", "leque", "anel", "aoLongo", "paralelo", "aleatorio", "fases"];
const PERFIS_VFX = ["pincel", "fuso", "ponta", "agulha", "cheio", "base", "onda", "lista"];

const cv = (v, a, b, d) => (Number.isFinite(+v) && v !== null && v !== "" ? Math.max(a, Math.min(b, +v)) : d);
const um = (v, lista, d) => (lista.includes(v) ? v : d);
/* uma camada normalizada (erros em português) */
function validarCamada(c, i = 0) {
  if (!c || typeof c !== "object") throw new Error("Camada " + (i + 1) + ": passe um objeto, por exemplo {forma: \"fita\", caminho: {tipo: \"arco\"}}.");
  const k = c.caminho && typeof c.caminho === "object" ? c.caminho : typeof c.caminho === "string" ? { tipo: c.caminho } : {};
  const r = c.repetir && typeof c.repetir === "object" ? c.repetir : typeof c.repetir === "string" ? { modo: c.repetir } : {};
  const t = c.traco && typeof c.traco === "object" ? c.traco : {};
  const forma = c.forma === undefined ? "fita" : c.forma;
  if (!FORMAS_VFX.includes(forma)) throw new Error("Camada " + (i + 1) + ": forma “" + forma + "” não existe. Use: " + FORMAS_VFX.join(", ") + ".");
  const tipo = k.tipo === undefined ? "reta" : k.tipo;
  if (!CAMINHOS_VFX.includes(tipo)) throw new Error("Camada " + (i + 1) + ": caminho “" + tipo + "” não existe. Use: " + CAMINHOS_VFX.join(", ") + ".");
  const out = {
    forma,
    caminho: { tipo, comprimento: cv(k.comprimento, 0, 120, 12), raio: cv(k.raio, 0, 60, 2), raioFim: k.raioFim === undefined ? null : cv(k.raioFim, 0, 60, 2),
      voltas: cv(k.voltas, 0, 30, 3), amplitude: cv(k.amplitude, 0, 40, 1.2), frequencia: cv(k.frequencia, 0, 20, 2), abertura: cv(k.abertura, 1, 720, 160), inicioAng: cv(k.inicioAng, -720, 720, 0),
      ramos: Math.round(cv(k.ramos, 0, 16, 3)), desvio: cv(k.desvio, 0, 1, 0.25), plano: um(k.plano, ["vertical", "horizontal", "frente", "chao"], "vertical"), curva: cv(k.curva, -40, 40, 0),
      torcao: cv(k.torcao, -10, 10, 0), subir: cv(k.subir, -60, 60, 0), local: k.local !== false },
    repetir: { modo: um(r.modo, REPETIR_VFX, "nenhum"), n: Math.round(cv(r.n, 1, 80, 1)), abertura: cv(r.abertura, 0, 360, 40), raio: cv(r.raio, 0, 60, 2), espalhar: cv(r.espalhar, 0, 1, 0.15),
      passo: cv(r.passo, -60, 60, 2), escalaFim: cv(r.escalaFim, 0.05, 5, 1), girar: cv(r.girar, -360, 360, 0) },
    traco: { largura: cv(t.largura, 0, 30, 0.6), perfil: um(t.perfil, PERFIS_VFX, "pincel"), ponta: um(t.ponta, ["nenhuma", "seta", "bola", "gota"], "nenhuma"), variacao: cv(t.variacao, 0, 1, 0.2) },
    estilo: c.estilo === undefined || c.estilo === null || c.estilo === "auto" ? null : um(c.estilo, Object.keys(ESTILOS_VFX), null),
    cor: typeof c.cor === "string" && /^#[0-9a-f]{6}$/i.test(c.cor) ? c.cor.toUpperCase() : cv(c.cor, 0, 1, 0.5),
    opacidade: cv(c.opacidade, 0.05, 1, 1), tamanho: cv(c.tamanho, 0.05, 10, 1), inicio: cv(c.inicio, 0, 1, 0), fim: cv(c.fim, 0, 1, 1), semente: Math.round(cv(c.semente, 0, 1e6, i * 101 + 7)),
    deslocar: Array.isArray(c.deslocar) && c.deslocar.length === 3 ? c.deslocar.map(v => cv(v, -60, 60, 0)) : [0, 0, 0],
    girar: Array.isArray(c.girar) && c.girar.length === 3 ? c.girar.map(v => cv(v, -360, 360, 0)) : [0, 0, 0]
  };
  if (Array.isArray(t.larguras)) { const L = t.larguras.map(v => cv(v, 0, 5, 1)).slice(0, 32); if (L.length >= 2) { out.traco.larguras = L; out.traco.perfil = "lista"; } }
  if (tipo === "pontos") { const P = Array.isArray(k.pontos) ? k.pontos.filter(q => Array.isArray(q) && q.length >= 2).slice(0, 64).map(q => [cv(q[0], -120, 120, 0), cv(q[1], -120, 120, 0), cv(q[2] ?? 0, -120, 120, 0)]) : [];
    if (P.length < 2) throw new Error("Camada " + (i + 1) + ": caminho “pontos” precisa de pelo menos 2 pontos [frente, cima, lado]."); out.caminho.pontos = P; }
  if (typeof c.texto === "string") out.texto = c.texto.replace(/[<>&"]/g, "").slice(0, 40);
  if (c.particula && ["ponto", "gota", "estrela", "bolha", "lasca", "faisca", "seta"].includes(c.particula)) out.particula = c.particula;
  return out;
}
function validarCamadas(L) {
  if (!Array.isArray(L) || !L.length) throw new Error("Efeito montado: passe camadas: [{forma, caminho, repetir, traco, estilo}, …].");
  if (L.length > 24) throw new Error("Efeito montado: no máximo 24 camadas.");
  return L.map(validarCamada);
}

/* ======== os efeitos prontos (das referências de mangá): cada um é uma lista de camadas ========
   grupo: para que serve na história; ancora/elemento padrão; camadas */
const F = (forma, caminho, extra) => Object.assign({ forma, caminho }, extra || {});
const PRESETS_VFX = {
  raio_galhos: { nome: "Raio com galhos", grupo: "ataque", elem: "raio", ancora: "maoDir",
    camadas: [F("fita", { tipo: "raio", comprimento: 22, ramos: 5, desvio: 0.22 }, { traco: { largura: 0.7, perfil: "ponta" }, estilo: "brilho" }),
      F("fita", { tipo: "raio", comprimento: 18, ramos: 3, desvio: 0.3 }, { traco: { largura: 0.3, perfil: "agulha" }, cor: 0.8, semente: 33, girar: [0, 12, 8] })] },
  raio_cartoon: { nome: "Raio em zigue-zague (cartoon)", grupo: "ataque", elem: "raio", ancora: "maoDir",
    camadas: [F("fita", { tipo: "zigue", comprimento: 14, amplitude: 1.6, frequencia: 3 }, { traco: { largura: 1.6, perfil: "base", ponta: "seta" }, estilo: "chapado" })] },
  arvore_de_raios: { nome: "Árvore de raios", grupo: "ataque", elem: "raio", ancora: "maoDir",
    camadas: [F("fita", { tipo: "raio", comprimento: 20, ramos: 4, desvio: 0.28 }, { repetir: { modo: "leque", n: 5, abertura: 70 }, traco: { largura: 0.45, perfil: "ponta" }, estilo: "contorno" })] },
  cone_de_aneis: { nome: "Cone de anéis (vórtice)", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("aneis", { tipo: "reta", comprimento: 16, raio: 0.5, raioFim: 7 }, { repetir: { modo: "nenhum", n: 9 }, traco: { largura: 0.7, perfil: "fuso" }, estilo: "cel" }),
      F("fita", { tipo: "helice", comprimento: 16, raio: 0.6, raioFim: 6, voltas: 3.5 }, { traco: { largura: 0.6, perfil: "fuso" }, cor: 0.7, estilo: "contorno" })] },
  torrente_espiral: { nome: "Torrente em espiral", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "helice", comprimento: 18, raio: 0.6, raioFim: 4.2, voltas: 4 }, { traco: { largura: 1.3, perfil: "fuso" }, estilo: "cel" }),
      F("fita", { tipo: "helice", comprimento: 18, raio: 0.8, raioFim: 5, voltas: 4, inicioAng: 180 }, { traco: { largura: 0.7, perfil: "fuso" }, cor: 0.3, estilo: "contorno" }),
      F("nuvem", { tipo: "reta", comprimento: 18 }, { tamanho: 1.4, inicio: 0.75, cor: 0.5 })] },
  tunel_de_aneis: { nome: "Túnel de anéis (portal em perspectiva)", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("aneis", { tipo: "reta", comprimento: 18, raio: 1.4, raioFim: 6.5 }, { repetir: { n: 7 }, traco: { largura: 0.9, perfil: "cheio" }, estilo: "brilho" }),
      F("particulas", { tipo: "reta", comprimento: 18 }, { repetir: { n: 30, espalhar: 0.6 }, particula: "gota", tamanho: 0.6 })] },
  foice_de_energia: { nome: "Foice de energia (golpe em arco)", grupo: "golpe", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 6, abertura: 230, plano: "horizontal", subir: 3 }, { traco: { largura: 2.2, perfil: "fuso" }, estilo: "cel" }),
      F("gotas", { tipo: "arco", raio: 6.8, abertura: 230, plano: "horizontal", subir: 3 }, { repetir: { n: 40, espalhar: 0.35 }, tamanho: 0.7 })] },
  rajada_de_particulas: { nome: "Rajada de partículas e orbes", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("particulas", { tipo: "reta", comprimento: 20 }, { repetir: { n: 60, espalhar: 0.35 }, particula: "gota", tamanho: 0.7 }),
      F("bolhas", { tipo: "reta", comprimento: 20 }, { repetir: { n: 3, espalhar: 0.25 }, tamanho: 1.6, inicio: 0.4 })] },
  leque_de_flechas: { nome: "Leque de flechas de energia", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "reta", comprimento: 18, curva: 1.5 }, { repetir: { modo: "leque", n: 9, abertura: 46 }, traco: { largura: 0.45, perfil: "base", ponta: "seta" }, estilo: "chapado" })] },
  enxame_de_flechas: { nome: "Enxame de flechas curvas (tentáculos)", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "onda", comprimento: 15, amplitude: 2.2, frequencia: 1.2, curva: 3 }, { repetir: { modo: "leque", n: 12, abertura: 110, espalhar: 0.5 }, traco: { largura: 0.35, perfil: "base", ponta: "seta" }, estilo: "contorno" })] },
  laminas_crescentes: { nome: "Lâminas crescentes", grupo: "golpe", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 4.5, abertura: 120, plano: "vertical", inicioAng: -60 }, { repetir: { modo: "aoLongo", n: 3, passo: 2.6, escalaFim: 1.4 }, traco: { largura: 1.8, perfil: "fuso" }, estilo: "cel" })] },
  crescente_gigante: { nome: "Meia-lua gigante", grupo: "golpe", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 8, abertura: 150, plano: "vertical", inicioAng: -75 }, { traco: { largura: 4, perfil: "fuso" }, estilo: "cel" }),
      F("fita", { tipo: "arco", raio: 7.2, abertura: 120, plano: "vertical", inicioAng: -60 }, { traco: { largura: 0.6, perfil: "fuso" }, cor: 0, estilo: "linha" })] },
  laminas_de_vento: { nome: "Lâminas de vento", grupo: "golpe", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 5, abertura: 100, plano: "horizontal" }, { repetir: { modo: "aleatorio", n: 6, espalhar: 0.45, raio: 2 }, traco: { largura: 0.9, perfil: "fuso" }, estilo: "contorno" })] },
  onda_gigante: { nome: "Onda gigante (tsunami)", grupo: "ataque", elem: "gelo", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 7, abertura: 200, plano: "vertical", inicioAng: -110, subir: 2 }, { traco: { largura: 6, perfil: "base" }, estilo: "cel" }),
      F("fita", { tipo: "arco", raio: 6, abertura: 170, plano: "vertical", inicioAng: -95, subir: 2 }, { repetir: { modo: "paralelo", n: 4, raio: 1.2 }, traco: { largura: 0.4, perfil: "fuso" }, cor: 0.8, estilo: "linha" }),
      F("gotas", { tipo: "arco", raio: 7.5, abertura: 120, plano: "vertical", inicioAng: 0, subir: 2 }, { repetir: { n: 30, espalhar: 0.5 }, tamanho: 0.8 })] },
  espinhos_do_chao: { nome: "Espinhos irrompendo do chão", grupo: "ataque", elem: "cristal", ancora: "pes",
    camadas: [F("espinhos", { tipo: "reta", comprimento: 16, plano: "chao" }, { repetir: { n: 20, espalhar: 0.35 }, tamanho: 1.4, estilo: "cel" })] },
  tentaculos: { nome: "Tentáculos de energia", grupo: "ataque", elem: "sombra", ancora: "maoDir",
    camadas: [F("fita", { tipo: "onda", comprimento: 16, amplitude: 1.5, frequencia: 2, torcao: 1 }, { repetir: { modo: "leque", n: 8, abertura: 70 }, traco: { largura: 0.9, perfil: "base", ponta: "seta" }, estilo: "chapado" })] },
  vinhas_de_espinhos: { nome: "Vinhas com espinhos", grupo: "ataque", elem: "terra", ancora: "maoDir",
    camadas: [F("fita", { tipo: "onda", comprimento: 18, amplitude: 1.8, frequencia: 1.6, torcao: 1.3 }, { repetir: { modo: "leque", n: 4, abertura: 50 }, traco: { largura: 0.9, perfil: "base" }, estilo: "chapado" }),
      F("espinhos", { tipo: "onda", comprimento: 18, amplitude: 1.8, frequencia: 1.6, torcao: 1.3 }, { repetir: { n: 26, espalhar: 0.1 }, tamanho: 0.35, estilo: "chapado" })] },
  atomo: { nome: "Anéis orbitais (átomo)", grupo: "defesa", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "circulo", raio: 2.6, comprimento: 4 }, { repetir: { modo: "fases", n: 3, girar: 60 }, traco: { largura: 0.7, perfil: "cheio" }, estilo: "brilho" }),
      F("bolhas", { tipo: "reta", comprimento: 5 }, { inicio: 0.98, tamanho: 1.4 })] },
  vortice_disco: { nome: "Vórtice (disco em espiral)", grupo: "ataque", elem: "vazio", ancora: "maoDir",
    camadas: [F("fita", { tipo: "espiral", raio: 6, voltas: 3, comprimento: 7 }, { repetir: { modo: "fases", n: 3 }, traco: { largura: 1.1, perfil: "base" }, estilo: "cel" }),
      F("particulas", { tipo: "espiral", raio: 7, voltas: 2, comprimento: 7 }, { repetir: { n: 30, espalhar: 0.3 }, particula: "gota", tamanho: 0.6 })] },
  cupula_de_arcos: { nome: "Cúpula de arcos (escudo)", grupo: "defesa", elem: "sagrado", ancora: "maoDir",
    camadas: [F("cupula", { tipo: "reta", comprimento: 3, raio: 6 }, { repetir: { n: 7 }, traco: { largura: 0.45, perfil: "fuso" }, estilo: "brilho" })] },
  esfera_jaula: { nome: "Esfera-jaula com runas", grupo: "defesa", elem: "tinta", ancora: "corpo",
    camadas: [F("esfera", { tipo: "reta", comprimento: 0, raio: 7 }, { repetir: { n: 8 }, traco: { largura: 0.35, perfil: "cheio" }, estilo: "linha" }),
      F("circuloMagico", { tipo: "reta", comprimento: 0, raio: 7, plano: "chao" }, { estilo: "linha", texto: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ" })] },
  laco_infinito: { nome: "Laço de fita (infinito)", grupo: "magia", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "laco", comprimento: 12, amplitude: 4 }, { traco: { largura: 1.1, perfil: "fuso" }, estilo: "cel" })] },
  fita_em_s: { nome: "Fita em S (serpentina)", grupo: "magia", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "s", comprimento: 14, amplitude: 3 }, { traco: { largura: 1.4, perfil: "fuso" }, estilo: "cel" })] },
  serpente_de_energia: { nome: "Serpente / dragão de energia", grupo: "invocação", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "onda", comprimento: 20, amplitude: 3, frequencia: 1.3, torcao: 1 }, { traco: { largura: 2.6, perfil: "base" }, estilo: "cel" }),
      F("espinhos", { tipo: "onda", comprimento: 20, amplitude: 3, frequencia: 1.3, torcao: 1 }, { repetir: { n: 18, espalhar: 0.05 }, tamanho: 0.5, estilo: "chapado" }),
      F("estouro", { tipo: "reta", comprimento: 20 }, { inicio: 0.97, tamanho: 1.2, estilo: "chapado" })] },
  discos_serra: { nome: "Discos giratórios (serras)", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("estouro", { tipo: "reta", comprimento: 16 }, { repetir: { modo: "aleatorio", n: 6, espalhar: 0.7, raio: 4 }, tamanho: 1.6, estilo: "cel" })] },
  ondas_sonoras: { nome: "Ondas sonoras / de choque", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 2, abertura: 100, plano: "vertical" }, { repetir: { modo: "aoLongo", n: 6, passo: 0, escalaFim: 5.5 }, traco: { largura: 0.5, perfil: "fuso" }, estilo: "contorno" })] },
  explosao_estrelada: { nome: "Explosão estrelada", grupo: "impacto", elem: "sagrado", ancora: "maoDir",
    camadas: [F("estouro", { tipo: "reta", comprimento: 5 }, { inicio: 1, tamanho: 3.2, estilo: "brilho" }),
      F("fita", { tipo: "reta", comprimento: 8 }, { repetir: { modo: "anel", n: 14, raio: 0.2 }, deslocar: [5, 0, 0], traco: { largura: 0.5, perfil: "ponta" }, tamanho: 0.8, estilo: "contorno" }),
      F("particulas", { tipo: "reta", comprimento: 5 }, { repetir: { n: 20, espalhar: 0.9 }, particula: "faisca", inicio: 0.8, tamanho: 1 })] },
  bolhas: { nome: "Bolhas", grupo: "magia", elem: "gelo", ancora: "maoDir",
    camadas: [F("bolhas", { tipo: "onda", comprimento: 16, amplitude: 1.5, frequencia: 1 }, { repetir: { n: 22, espalhar: 0.6 }, tamanho: 2.4, estilo: "contorno" })] },
  circulo_magico_flechas: { nome: "Círculo mágico disparando flechas", grupo: "magia", elem: "gelo", ancora: "maoDir",
    camadas: [F("circuloMagico", { tipo: "reta", comprimento: 3, raio: 3.4, plano: "frente" }, { estilo: "brilho" }),
      F("fita", { tipo: "reta", comprimento: 16 }, { deslocar: [3, 0, 0], repetir: { modo: "paralelo", n: 7, raio: 2.4 }, traco: { largura: 0.35, perfil: "base", ponta: "seta" }, estilo: "chapado" })] },
  circulo_de_runas: { nome: "Círculo de runas no chão com espiral subindo", grupo: "magia", elem: "tinta", ancora: "pes",
    camadas: [F("circuloMagico", { tipo: "reta", comprimento: 0, raio: 8, plano: "chao" }, { estilo: "linha", texto: "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ" }),
      F("fita", { tipo: "helice", comprimento: 20, raio: 4, raioFim: 2.5, voltas: 2.5, plano: "chao" }, { traco: { largura: 0.5, perfil: "fuso" }, estilo: "linha" })] },
  dna: { nome: "Hélice dupla (DNA)", grupo: "magia", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "helice", comprimento: 18, raio: 1.2, voltas: 3 }, { repetir: { modo: "fases", n: 2 }, traco: { largura: 0.5, perfil: "cheio" }, estilo: "cel" }),
      F("degraus", { tipo: "helice", comprimento: 18, raio: 1.2, voltas: 3 }, { repetir: { n: 18 }, traco: { largura: 0.18, perfil: "cheio" }, estilo: "contorno" })] },
  tranca: { nome: "Trança de energia", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "helice", comprimento: 22, raio: 0.9, voltas: 4 }, { repetir: { modo: "fases", n: 3 }, traco: { largura: 0.9, perfil: "cheio" }, estilo: "cel" })] },
  portais_e_feixes: { nome: "Portais com feixes paralelos", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("aneis", { tipo: "reta", comprimento: 0.5, raio: 0.9 }, { repetir: { modo: "paralelo", n: 7, raio: 3 }, traco: { largura: 0.35, perfil: "cheio" }, estilo: "brilho" }),
      F("fita", { tipo: "reta", comprimento: 20 }, { repetir: { modo: "paralelo", n: 7, raio: 3 }, traco: { largura: 0.7, perfil: "base" }, estilo: "brilho" })] },
  feixe_com_aneis: { nome: "Feixe com anéis de disparo", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("fita", { tipo: "reta", comprimento: 22 }, { traco: { largura: 1.4, perfil: "cheio" }, estilo: "brilho" }),
      F("aneis", { tipo: "reta", comprimento: 4, raio: 1.3, raioFim: 1.6 }, { repetir: { n: 3 }, traco: { largura: 0.35, perfil: "cheio" }, estilo: "brilho" })] },
  cone_de_ondas: { nome: "Cone de ondas (som, pressão)", grupo: "ataque", elem: "vento", ancora: "maoDir",
    camadas: [F("aneis", { tipo: "reta", comprimento: 14, raio: 0.8, raioFim: 5 }, { repetir: { n: 6 }, traco: { largura: 0.45, perfil: "cheio" }, estilo: "contorno" }),
      F("fita", { tipo: "reta", comprimento: 14 }, { repetir: { modo: "leque", n: 8, abertura: 34 }, traco: { largura: 0.2, perfil: "agulha" }, estilo: "linha" })] },
  esfera_espiral: { nome: "Esfera com espiral interna", grupo: "carga", elem: "vento", ancora: "maoDir",
    camadas: [F("esfera", { tipo: "reta", comprimento: 0, raio: 4 }, { repetir: { n: 5 }, deslocar: [4.5, 0, 0], traco: { largura: 0.35, perfil: "cheio" }, estilo: "brilho" }),
      F("fita", { tipo: "espiral", raio: 3.6, voltas: 3, comprimento: 0 }, { deslocar: [4.5, 0, 0], traco: { largura: 0.6, perfil: "base" }, estilo: "cel" })] },
  chamas_nanquim: { nome: "Chamas subindo (nanquim)", grupo: "carga", elem: "tinta", ancora: "corpo",
    camadas: [F("chamas", { tipo: "circulo", raio: 3, comprimento: 0, plano: "chao" }, { repetir: { n: 18 }, tamanho: 1.4, estilo: "nanquim" })] },
  respingos_de_nanquim: { nome: "Explosão de nanquim (respingos)", grupo: "impacto", elem: "tinta", ancora: "maoDir",
    camadas: [F("nuvem", { tipo: "reta", comprimento: 6 }, { inicio: 1, tamanho: 2.2, estilo: "nanquim" }),
      F("gotas", { tipo: "reta", comprimento: 6 }, { repetir: { modo: "anel", n: 26, espalhar: 0.6, raio: 5 }, tamanho: 1, estilo: "nanquim", deslocar: [6, 0, 0] })] },
  pilar_de_luz_nanquim: { nome: "Pilar de energia com respingos (nanquim)", grupo: "carga", elem: "tinta", ancora: "maoDir", direcao: { modo: "vetor", x: 0, y: 1, z: 0 },
    camadas: [F("fita", { tipo: "zigue", comprimento: 24, amplitude: 0.5, frequencia: 6 }, { traco: { largura: 2.2, perfil: "base" }, estilo: "nanquim" }),
      F("gotas", { tipo: "reta", comprimento: 24 }, { repetir: { n: 40, espalhar: 0.45 }, tamanho: 0.9, estilo: "nanquim" })] },
  redemoinho_de_fumaca: { nome: "Redemoinho de fumaça", grupo: "ataque", elem: "sombra", ancora: "maoDir",
    camadas: [F("fita", { tipo: "helice", comprimento: 14, raio: 0.4, raioFim: 3, voltas: 2.5 }, { repetir: { modo: "fases", n: 3 }, traco: { largura: 1.2, perfil: "fuso" }, estilo: "nanquim" }),
      F("nuvem", { tipo: "reta", comprimento: 14 }, { inicio: 0.8, tamanho: 1.6, estilo: "contorno" })] },
  linhas_de_impulso: { nome: "Linhas de impulso (convergindo)", grupo: "movimento", elem: "tinta", ancora: "maoDir",
    camadas: [F("fita", { tipo: "reta", comprimento: 18 }, { repetir: { modo: "leque", n: 26, abertura: 40, espalhar: 0.4 }, traco: { largura: 0.3, perfil: "agulha" }, estilo: "nanquim" })] },
  impacto_com_detritos: { nome: "Impacto com detritos", grupo: "impacto", elem: "terra", ancora: "maoDir",
    camadas: [F("estouro", { tipo: "reta", comprimento: 4 }, { inicio: 1, tamanho: 3, estilo: "contorno" }),
      F("particulas", { tipo: "reta", comprimento: 4 }, { repetir: { modo: "anel", n: 24, espalhar: 0.8, raio: 6 }, particula: "lasca", tamanho: 1, deslocar: [4, 0, 0] })] },
  anel_de_impacto_no_chao: { nome: "Anel de impacto no chão", grupo: "impacto", elem: "vento", ancora: "pes",
    camadas: [F("aneis", { tipo: "reta", comprimento: 0.3, raio: 4, raioFim: 9, plano: "chao" }, { repetir: { n: 3 }, traco: { largura: 0.6, perfil: "fuso" }, estilo: "contorno" }),
      F("espinhos", { tipo: "circulo", raio: 6, comprimento: 0, plano: "chao" }, { repetir: { n: 18, espalhar: 0.3 }, tamanho: 0.8, estilo: "contorno" })] },
  chuva_de_estrelas: { nome: "Chuva de estrelas / faíscas", grupo: "magia", elem: "sagrado", ancora: "maoDir",
    camadas: [F("particulas", { tipo: "reta", comprimento: 20 }, { repetir: { modo: "leque", n: 40, abertura: 50, espalhar: 0.8 }, particula: "faisca", tamanho: 1.1 }),
      F("fita", { tipo: "reta", comprimento: 18 }, { repetir: { modo: "leque", n: 6, abertura: 40 }, traco: { largura: 0.2, perfil: "agulha" }, estilo: "linha" })] },
  aura_de_espinhos: { nome: "Aura de espinhos de energia", grupo: "carga", elem: "vento", ancora: "pes",
    camadas: [F("espinhos", { tipo: "circulo", raio: 3.4, comprimento: 0, plano: "chao" }, { repetir: { n: 26, espalhar: 0.4 }, tamanho: 2.2, estilo: "cel" })] },
  tornado_espiral: { nome: "Tornado (espiral subindo)", grupo: "ataque", elem: "vento", ancora: "chao",
    camadas: [F("fita", { tipo: "helice", comprimento: 22, raio: 0.6, raioFim: 6, voltas: 6, plano: "chao" }, { traco: { largura: 1.2, perfil: "fuso" }, estilo: "cel" }),
      F("fita", { tipo: "helice", comprimento: 22, raio: 0.9, raioFim: 7, voltas: 5, plano: "chao", inicioAng: 120 }, { traco: { largura: 0.4, perfil: "fuso" }, estilo: "linha" })] },
  rastro_de_velocidade: { nome: "Rastro de velocidade (corrida super rápida)", grupo: "movimento", elem: "tinta", ancora: "corpo", tras: true,
    camadas: [F("fita", { tipo: "reta", comprimento: 16 }, { deslocar: [1.5, 0, 0], repetir: { modo: "paralelo", n: 14, raio: 5, espalhar: 0.5 }, traco: { largura: 0.45, perfil: "base" }, estilo: "nanquim" }),
      F("particulas", { tipo: "reta", comprimento: 12 }, { repetir: { n: 16, espalhar: 0.6 }, particula: "gota", tamanho: 0.5 })] },
  arco_de_golpe: { nome: "Arco do golpe (soco/chute com força)", grupo: "golpe", elem: "tinta", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 4, abertura: 140, plano: "horizontal" }, { repetir: { modo: "paralelo", n: 5, raio: 1.4 }, traco: { largura: 0.6, perfil: "base" }, estilo: "nanquim" })] },
  /* ---- ambiente e clima ---- */
  petalas_sakura: { nome: "Pétalas de sakura no vento", grupo: "ambiente", elem: "sakura", ancora: "corpo",
    camadas: [F("particulas", { tipo: "onda", comprimento: 30, amplitude: 4, frequencia: 1.5 }, { deslocar: [-15, 6, 0], repetir: { modo: "aleatorio", n: 45, raio: 14, espalhar: 1 }, particula: "gota", tamanho: 0.7, cor: 0.4 })] },
  folhas_ao_vento: { nome: "Folhas voando", grupo: "ambiente", elem: "natureza", ancora: "corpo",
    camadas: [F("particulas", { tipo: "onda", comprimento: 28, amplitude: 3, frequencia: 1.2 }, { deslocar: [-14, 4, 0], repetir: { modo: "aleatorio", n: 30, raio: 12, espalhar: 1 }, particula: "lasca", tamanho: 1, cor: 0.6 })] },
  chuva: { nome: "Chuva", grupo: "ambiente", elem: "oceano", ancora: "corpo",
    camadas: [F("fita", { tipo: "reta", comprimento: 3 }, { girar: [0, 0, -100], deslocar: [0, 20, 0], repetir: { modo: "aleatorio", n: 120, raio: 22, espalhar: 1 }, traco: { largura: 0.08, perfil: "agulha" }, estilo: "linha", cor: 0.7, opacidade: 0.7 })] },
  neve: { nome: "Neve caindo", grupo: "ambiente", elem: "gelo", ancora: "corpo",
    camadas: [F("particulas", { tipo: "reta", comprimento: 1 }, { deslocar: [0, 12, 0], repetir: { modo: "aleatorio", n: 90, raio: 22, espalhar: 1 }, particula: "bolha", tamanho: 0.35, cor: 0 })] },
  nevoa: { nome: "Névoa baixa", grupo: "ambiente", elem: "metal", ancora: "pes",
    camadas: [F("nuvem", { tipo: "circulo", raio: 9, plano: "chao" }, { repetir: { modo: "anel", n: 10, raio: 9, espalhar: 0.5 }, tamanho: 2.2, opacidade: 0.35, cor: 0.15 })] },
  raios_de_luz_divina: { nome: "Raios de luz (do céu)", grupo: "ambiente", elem: "sagrado", ancora: "corpo",
    camadas: [F("fita", { tipo: "reta", comprimento: 40 }, { girar: [0, 0, -75], deslocar: [-8, 30, 0], repetir: { modo: "paralelo", n: 7, raio: 10, espalhar: 0.4 }, traco: { largura: 2.2, perfil: "fuso" }, estilo: "brilho", opacidade: 0.45 })] },
  bolhas_subindo: { nome: "Bolhas subindo (água)", grupo: "ambiente", elem: "oceano", ancora: "pes",
    camadas: [F("particulas", { tipo: "reta", comprimento: 18 }, { girar: [0, 0, 90], repetir: { modo: "aleatorio", n: 30, raio: 4, espalhar: 1 }, particula: "bolha", tamanho: 0.6, cor: 0.3 })] },
  vagalumes: { nome: "Vaga-lumes / partículas de luz", grupo: "ambiente", elem: "ouro", ancora: "corpo",
    camadas: [F("particulas", { tipo: "reta", comprimento: 1 }, { repetir: { modo: "aleatorio", n: 26, raio: 12, espalhar: 1 }, particula: "estrela", tamanho: 0.45, estilo: "brilho", cor: 0.1 })] },
  /* ---- golpes de arma ---- */
  corte_de_espada: { nome: "Corte de espada (meia-lua fina)", grupo: "golpe", elem: "metal", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 7, abertura: 150, plano: "frente" }, { traco: { largura: 1.1, perfil: "fuso" }, estilo: "brilho" }),
      F("fita", { tipo: "arco", raio: 6.4, abertura: 120, plano: "frente" }, { traco: { largura: 0.25, perfil: "agulha" }, estilo: "linha", cor: 0.9 })] },
  rastro_de_espada: { nome: "Rastro da lâmina (vários cortes)", grupo: "golpe", elem: "eletrico", ancora: "maoDir",
    camadas: [F("fita", { tipo: "arco", raio: 6, abertura: 200, plano: "frente" }, { repetir: { modo: "fases", n: 3, girar: 35 }, traco: { largura: 0.7, perfil: "ponta" }, estilo: "brilho" })] },
  x_de_cortes: { nome: "Cortes em X", grupo: "golpe", elem: "metal", ancora: "maoDir",
    camadas: [F("fita", { tipo: "reta", comprimento: 14 }, { girar: [0, 0, 45], deslocar: [3, -5, 0], traco: { largura: 0.8, perfil: "fuso" }, estilo: "brilho" }), F("fita", { tipo: "reta", comprimento: 14 }, { girar: [0, 0, -45], deslocar: [3, 5, 0], traco: { largura: 0.8, perfil: "fuso" }, estilo: "brilho" })] },
  faiscas_de_choque: { nome: "Faíscas (metal batendo)", grupo: "impacto", elem: "ouro", ancora: "maoDir",
    camadas: [F("particulas", { tipo: "reta", comprimento: 7 }, { repetir: { modo: "leque", n: 30, abertura: 300, espalhar: 0.7 }, particula: "faisca", tamanho: 0.8 }), F("estouro", { tipo: "circulo", raio: 1 }, { tamanho: 0.8, estilo: "brilho" })] },
  disparo_de_arma: { nome: "Clarão de disparo", grupo: "ataque", elem: "fogo", ancora: "maoDir",
    camadas: [F("estouro", { tipo: "circulo", raio: 1.2 }, { deslocar: [2, 0, 0], tamanho: 1.1, estilo: "brilho" }), F("fita", { tipo: "reta", comprimento: 40 }, { deslocar: [3, 0, 0], traco: { largura: 0.12, perfil: "agulha" }, estilo: "linha", cor: 0.2 })] },
  flecha_de_luz: { nome: "Flecha de luz", grupo: "ataque", elem: "sagrado", ancora: "maoDir",
    camadas: [F("fita", { tipo: "reta", comprimento: 26 }, { traco: { largura: 0.5, perfil: "ponta", ponta: "seta" }, estilo: "brilho" }), F("particulas", { tipo: "reta", comprimento: 20 }, { repetir: { n: 14, espalhar: 0.4 }, particula: "estrela", tamanho: 0.4 })] },
  /* ---- portal e magia ---- */
  portal: { nome: "Portal (anel giratório)", grupo: "magia", elem: "plasma", ancora: "maoDir",
    camadas: [F("aneis", { tipo: "circulo", raio: 6, plano: "frente" }, { deslocar: [6, 0, 0], repetir: { modo: "paralelo", n: 3, raio: 0.6 }, traco: { largura: 0.6 }, estilo: "brilho" }), F("fita", { tipo: "espiral", raio: 5.5, voltas: 3, plano: "frente" }, { deslocar: [6, 0, 0], traco: { largura: 0.3, perfil: "ponta" }, estilo: "linha", cor: 0.8 })] },
  teletransporte: { nome: "Teletransporte (anéis e partículas subindo)", grupo: "magia", elem: "eletrico", ancora: "pes",
    camadas: [F("aneis", { tipo: "reta", comprimento: 18 }, { girar: [0, 0, 90], repetir: { modo: "aoLongo", n: 5 }, tamanho: 1.4, estilo: "brilho", opacidade: 0.7 }), F("particulas", { tipo: "reta", comprimento: 20 }, { girar: [0, 0, 90], repetir: { modo: "aleatorio", n: 40, raio: 3, espalhar: 1 }, particula: "faisca", tamanho: 0.5 })] },
  aura_sombria: { nome: "Aura sombria (fumaça escura subindo)", grupo: "carga", elem: "trevas", ancora: "pes", tras: true,
    camadas: [F("chamas", { tipo: "circulo", raio: 3.2, plano: "chao" }, { repetir: { modo: "anel", n: 14, raio: 3.2 }, tamanho: 1.6, estilo: "chapado", opacidade: 0.75 }), F("nuvem", { tipo: "reta", comprimento: 16 }, { girar: [0, 0, 90], repetir: { modo: "aoLongo", n: 5, espalhar: 0.6 }, tamanho: 1.4, opacidade: 0.4, cor: 0.8 })] },
  aura_de_gelo: { nome: "Aura de gelo (cristais em volta)", grupo: "carga", elem: "gelo", ancora: "pes",
    camadas: [F("espinhos", { tipo: "circulo", raio: 4, plano: "chao" }, { repetir: { modo: "anel", n: 16, raio: 4, espalhar: 0.3 }, tamanho: 1.3, estilo: "cel" }), F("particulas", { tipo: "reta", comprimento: 14 }, { girar: [0, 0, 90], repetir: { modo: "aleatorio", n: 24, raio: 4, espalhar: 1 }, particula: "estrela", tamanho: 0.4 })] },
  selo_no_ar: { nome: "Selo mágico no ar (diante da mão)", grupo: "magia", elem: "ouro", ancora: "maoDir",
    camadas: [F("circuloMagico", { tipo: "circulo", raio: 4, plano: "frente" }, { deslocar: [3, 0, 0], estilo: "brilho" })] },
  cura: { nome: "Cura (luz verde subindo)", grupo: "magia", elem: "natureza", ancora: "corpo",
    camadas: [F("particulas", { tipo: "reta", comprimento: 16 }, { girar: [0, 0, 90], deslocar: [0, -8, 0], repetir: { modo: "aleatorio", n: 30, raio: 3.5, espalhar: 1 }, particula: "estrela", tamanho: 0.5, estilo: "brilho" }), F("aneis", { tipo: "circulo", raio: 3.5, plano: "chao" }, { deslocar: [0, -8, 0], estilo: "brilho", opacidade: 0.6 })] },
  /* ---- emoção (mangá) ---- */
  estrelas_tontura: { nome: "Estrelinhas de tontura (em volta da cabeça)", grupo: "emocao", elem: "ouro", ancora: "topoCabeca",
    camadas: [F("estrelas", { tipo: "circulo", raio: 2.2, plano: "chao" }, { repetir: { modo: "anel", n: 5, raio: 2.2 }, tamanho: 0.6, estilo: "chapado" })] },
  espirais_tontura: { nome: "Espirais de tontura", grupo: "emocao", elem: "tinta", ancora: "topoCabeca",
    camadas: [F("fita", { tipo: "espiral", raio: 1, voltas: 2, plano: "frente" }, { deslocar: [0, 1.5, 0], repetir: { modo: "paralelo", n: 2, raio: 2 }, traco: { largura: 0.15, perfil: "cheio" }, estilo: "linha" })] },
  linhas_de_susto: { nome: "Tracinhos de susto (em volta da cabeça)", grupo: "emocao", elem: "tinta", ancora: "cabeca",
    camadas: [F("fita", { tipo: "reta", comprimento: 1.4 }, { deslocar: [0, 2.4, 0], repetir: { modo: "leque", n: 7, abertura: 140 }, traco: { largura: 0.18, perfil: "ponta" }, estilo: "linha" })] },
  gotas_voando: { nome: "Gotas de suor voando", grupo: "emocao", elem: "oceano", ancora: "cabeca",
    camadas: [F("particulas", { tipo: "reta", comprimento: 3 }, { repetir: { modo: "leque", n: 5, abertura: 120 }, particula: "gota", tamanho: 0.6 })] },
  vapor_de_raiva: { nome: "Vapor de raiva (saindo da cabeça)", grupo: "emocao", elem: "metal", ancora: "topoCabeca",
    camadas: [F("nuvem", { tipo: "reta", comprimento: 4 }, { girar: [0, 0, 90], repetir: { modo: "leque", n: 2, abertura: 70 }, tamanho: 0.8, opacidade: 0.8, cor: 0.1 })] },
  brilho_nos_olhos: { nome: "Brilho nos olhos (decisão)", grupo: "emocao", elem: "eletrico", ancora: "olhos",
    camadas: [F("estrelas", { tipo: "reta", comprimento: 0.1 }, { tamanho: 0.35, estilo: "brilho" }), F("fita", { tipo: "reta", comprimento: 4 }, { traco: { largura: 0.15, perfil: "agulha" }, estilo: "brilho" })] },
  coracoes_flutuando: { nome: "Bolhas/estrelas de encanto", grupo: "emocao", elem: "sakura", ancora: "cabeca",
    camadas: [F("particulas", { tipo: "reta", comprimento: 5 }, { girar: [0, 0, 70], repetir: { modo: "leque", n: 6, abertura: 60 }, particula: "estrela", tamanho: 0.5, estilo: "brilho" })] },
  poeira_de_corrida: { nome: "Poeira levantada atrás dos pés", grupo: "movimento", elem: "terra", ancora: "pes", tras: true,
    camadas: [F("nuvem", { tipo: "reta", comprimento: 8 }, { girar: [0, 180, 0], repetir: { modo: "aoLongo", n: 5, escalaFim: 1.8 }, tamanho: 0.9, opacidade: 0.6 })] },
  lens_flare: { nome: "Reflexo de lente (flare)", grupo: "ambiente", elem: "ouro", ancora: "corpo",
    camadas: [F("aneis", { tipo: "reta", comprimento: 30 }, { girar: [0, 0, -30], deslocar: [-10, 14, 0], repetir: { modo: "aoLongo", n: 6, escalaFim: 0.3 }, tamanho: 1.2, estilo: "brilho", opacidade: 0.5 })] }
};
export { ESTILOS_VFX, CAMINHOS_VFX, FORMAS_VFX, REPETIR_VFX, PERFIS_VFX, PRESETS_VFX, validarCamada, validarCamadas };
