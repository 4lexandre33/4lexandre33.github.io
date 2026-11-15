/* GeoMannequin — HISTÓRIA → TEXTO DA CENA (DSL), com registro de LACUNAS.
   Lê uma história em português (parágrafos/frases) e devolve: personagens, animais/criaturas, objetos/armas, veículos,
   lugares (com o local pronto mais perto), as cenas com as ações traduzidas para linhas da linguagem, a função narrativa
   sugerida para cada cena, o TEXTO pronto (elenco, locais, quadros) e as LACUNAS: o que a história pede e o sistema ainda
   não tem (verbo sem pose/animação, lugar sem local pronto, criatura, objeto ou veículo que não existe). As lacunas ficam
   registradas (contagem e exemplos) para virar mecânica nova; o que já existe vira texto direto. */
import { QD_ESPECIES, COMPOSTOS, SINONIMOS_COMPOSTOS, OBJ_MAO } from "../engine/index.js";
import { CR_SINONIMOS } from "../engine/index.js";
import { lpAchar, localPronto } from "./locais-prontos.js";
import { nrBuscar } from "./narrativa.js";

const HA_N = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/* verbos → linha(s). Q = quem, A = alvo (outra pessoa citada na frase), O = objeto citado, V = veículo, N = animal */
const HA_VERBOS = [
  [/\b(corr(e|eu|ia|endo|iam|eram)|dispar(ou|a) correndo)\b/, "correr", (c) => [c.Q + " pose correndo" + (c.A ? " olha " + c.A : "")], "perseguicao"],
  [/\b(fug(iu|ir|indo|ia)|foge|escap(a|ou|ando))\b/, "fugir", (c) => [c.Q + " pose fugaDesesperada expressao medo"], "fuga"],
  [/\b(persegu(e|iu|ia|indo)|cac(a|ou|ava))\b/, "perseguir", (c) => [c.Q + " pose correndo expressao raiva" + (c.A ? " olha " + c.A : "")], "perseguicao"],
  [/\b(and(a|ou|ava|ando)|caminh(a|ou|ava|ando)|chega(ra|va|ou)?|entr(a|ou))\b/, "andar", (c) => [c.Q + " pose caminhando"], null],
  [/\b(pul(a|ou|ava)|salt(a|ou|ava))\b/, "pular", (c) => [c.Q + " pose puloAlto"], null],
  [/\b(socou|soco|esmurr(a|ou))\b/, "socar", (c) => c.A ? [c.Q + " interacao diretoNoRosto com " + c.A] : [c.Q + " pose direto"], "conflito"],
  [/\b(chut(a|ou|ava|e))\b/, "chutar", (c) => [c.Q + " pose chuteFrontal" + (c.A ? " olha " + c.A : "")], "conflito"],
  [/\b(lut(a|ou|am|aram|ando)|briga(m|ram)?|combat(e|eu))\b/, "lutar", (c) => c.A ? [c.Q + " interacao guardaContraGuarda com " + c.A] : [c.Q + " pose guardaBoxe"], "conflito"],
  [/\b(atir(a|ou|ava|aram)|dispar(a|ou)(?! correndo))\b/, "atirar", (c) => c.A ? [c.Q + " atira em " + c.A + (c.O && OBJ_MAO[c.O] && OBJ_MAO[c.O].grupo === "arma-fogo" ? " com " + c.O : " com " + (c.O && OBJ_MAO[c.O] ? c.O : "pistola"))] : [c.Q + " segura " + (c.O || "pistola")], "conflito"],
  [/\b(feiti[cç]o|conjur(a|ou)|encant(a|ou)|magia)\b/, "feitiço", (c) => [c.Q + " feitico " + haFeitico(c.frase) + (c.A ? " em " + c.A : "")], "poder"],
  [/\b(escond(e|eu|ia|ido|ida)|ocult(a|ou))\b/, "esconder", (c) => [c.Q + " pose escondidoAgachado expressao medo"], "esconderijo"],
  [/\b(abra[cç](a|ou|aram|o))\b/, "abraçar", (c) => c.A ? [c.Q + " interacao abracoFrente com " + c.A] : [c.Q + " pose abracoAberto"], "relacao"],
  [/\b(chor(a|ou|ava|ando))\b/, "chorar", (c) => [c.Q + " pose ajoelhadoChorando expressao tristeza"], "relacao"],
  [/\b(grit(a|ou|ava|ando)|berr(a|ou))\b/, "gritar", (c) => [c.Q + " pose baseGritando expressao raiva"], null],
  [/\b(ri(u|a|ndo)?|sorri(u|a|ndo)?|gargalh(a|ou))\b/, "rir", (c) => [c.Q + " expressao alegria"], "comedia"],
  [/\b(olh(a|ou|ava)|encar(a|ou)|observ(a|ou)|v(e|iu))\b/, "olhar", (c) => [c.Q + (c.A ? " olha " + c.A : " expressao surpresa")], null],
  [/\b(sent(a|ou|ado|ada)|senta-se)\b/, "sentar", (c) => [c.Q + " pose sentado"], null],
  [/\b(deit(a|ou|ado|ada))\b/, "deitar", (c) => [c.Q + " pose deitadoCostas"], null],
  [/\b(ajoelh(a|ou|ado|ada))\b/, "ajoelhar", (c) => [c.Q + " pose ajoelhado"], null],
  [/\b(ca(i|iu|ido|ida)|tropec(a|ou))\b/, "cair", (c) => [c.Q + " pose caidoDeCostas expressao dor"], "provacao"],
  [/\b(esquiv(a|ou)|desvi(a|ou))\b/, "esquivar", (c) => [c.Q + " pose esquivaLateral"], "conflito"],
  [/\b(defend(e|eu)|protege(u)?|bloque(ia|ou))\b/, "defender", (c) => [c.Q + " pose defesaComBracos"], "conflito"],
  [/\b(venc(e|eu)|ganh(a|ou))\b/, "vencer", (c) => [c.Q + " pose vitoriaPunhoErguido expressao alegria"], "desfecho"],
  [/\b(acen(a|ou)|despede|despediu)\b/, "acenar", (c) => [c.Q + " pose acenando"], "relacao"],
  [/\b(aponta|apontou)\b/, "apontar", (c) => [c.Q + " pose apontando" + (c.A ? " olha " + c.A : "")], null],
  [/\b(pens(a|ou|ava))\b/, "pensar", (c) => [c.Q + " pose pensando"], null],
  [/\b(segur(a|ou)|peg(a|ou)|empunh(a|ou)|sac(a|ou))\b/, "segurar", (c) => c.O ? [c.Q + " segura " + c.O] : [], null],
  [/\b(mont(a|ou)|cavalg(a|ou))\b/, "montar", (c) => c.N ? [c.Q + " monta " + c.N] : [], "perseguicao"],
  [/\b(embarc(a|ou)|rem(a|ou|ava)|naveg(a|ou))\b/, "embarcar", (c) => c.V ? [c.Q + (/rem/.test(c.frase) ? " rema " : " embarca ") + c.V] : [], "transicao"],
  [/\b(fal(a|ou)|diss(e)|pergunt(a|ou)|respond(e|eu)|sussurr(a|ou))\b/, "falar", (c) => [c.Q + ' fala "' + (haCitacao(c.fraseOrig) || "…") + '"' + (c.A ? " olha " + c.A : "")], null],
  [/\b(beij(a|ou))\b/, "beijar", null, "relacao"], [/\b(dan[cç](a|ou))\b/, "dançar", (c) => [c.Q + " pose dancandoAlegre"], "comedia"],
  [/\b(nad(a|ou|ava))\b/, "nadar", (c) => [c.Q + " anima nadarCrawl"], null], [/\b(escal(a|ou)|escalando)\b/, "escalar", null, null],
  [/\b(dirig(e|iu)|pilot(a|ou))\b/, "dirigir", null, "transicao"], [/\b(cozinh(a|ou))\b/, "cozinhar", null, null], [/\b(escrev(e|eu))\b/, "escrever", null, null],
  [/\b(dorm(e|iu|indo))\b/, "dormir", (c) => [c.Q + " pose deitadoLado expressao cansaco"], null], [/\b(voa|voou|voando)\b/, "voar", (c) => [c.Q + " pose vooSuperHeroi"], "poder"],
  [/\b(transform(a|ou))\b/, "transformar", (c) => [c.Q + " efeito aura_explosiva colorido"], "poder"]
];
const HA_FEITICOS = [["desarm", "desarmar"], ["atordo", "atordoar"], ["fogo|chama", "fogo"], ["gelo|congel", "gelo"], ["raio|relamp", "raio"], ["explo", "explosao"], ["escudo|proteg", "escudo"], ["luz|ilumin", "luz"], ["levit|flutu", "levitar"], ["cur", "cura"], ["maldi", "maldicao"], ["invoc", "invocar"]];
function haFeitico(f) { const t = HA_N(f); for (const [re, k] of HA_FEITICOS) if (new RegExp(re).test(t)) return k; return "atordoar"; }
function haCitacao(f) { const m = /["“«]([^"”»]{1,120})["”»]/.exec(f) || /—\s*([^—.!?]{1,120}[.!?]?)/.exec(f); return m ? m[1].trim().replace(/"/g, "'") : null; }
const HA_EMO = [[/\b(medo|apavorad|assustad|terror)/, "medo"], [/\b(raiva|furios|irritad|odio)/, "raiva"], [/\b(trist|lagrim|luto|chorando)/, "tristeza"], [/\b(feliz|alegr|contente|sorri)/, "alegria"], [/\b(surpres|espant|chocad)/, "surpresa"], [/\b(determinad|decidid|coragem)/, "determinacao"]];
/* lugares: palavra → local pronto (ou lacuna) */
const HA_LUGARES = { sala: "sala", "sala de estar": "sala", quarto: "quarto", escada: "escadaria", escadaria: "escadaria", rua: "calcada", calcada: "calcada", avenida: "calcada", estrada: "estrada-terra", "estrada de terra": "estrada-terra", "estrada de pedra": "estrada-pedra", rio: "rio-ponte", ponte: "rio-ponte", castelo: "castelo", fortaleza: "castelo", taverna: "taverna", bar: "taverna", estalagem: "taverna", floresta: "floresta", bosque: "floresta", mata: "floresta", lago: "lago", lagoa: "lago" };
const HA_LUGARES_FALTAM = ["praia", "deserto", "montanha", "caverna", "cidade", "vila", "aldeia", "mercado", "feira", "igreja", "templo", "escola", "hospital", "nave", "navio", "porto", "cozinha", "banheiro", "telhado", "jardim", "campo", "fazenda", "palacio", "masmorra", "prisao", "biblioteca", "laboratorio", "estacao", "trem", "aeroporto", "ruina", "cemiterio", "ilha", "mar", "oceano", "neve"];
const HA_CRIATURAS_FALTAM = { fenix: "ave (falcão/águia) com efeito de fogo", sereia: "pessoa + peixe (sem mistura ainda)", centauro: "pessoa montada em cavalo", minotauro: "pessoa gigante (sem cabeça de touro)", hidra: "serpente gigante (sem várias cabeças)", golem: "pessoa gigante com corpo de pedra (cor)", zumbi: "pessoa com pose arrastada", elfo: "pessoa (sem orelhas pontudas)", orc: "pessoa musculosa", goblin: "pessoa anã", troll: "pessoa gigante", lobisomem: "pessoa + lobo", vampiro: "pessoa (capa: objeto)", fantasma: "pessoa com efeito de transparência", robo: "pessoa (sem corpo mecânico)", alien: "pessoa (sem corpo próprio)", unicornio: null, pegaso: null, grifo: null };
const HA_OBJ_FALTAM = ["granada", "canhao", "catapulta", "besta de repeticao", "laco", "rede", "corrente", "tocha", "lampiao", "mapa", "bau", "coroa", "anel", "colar", "mascara", "capa", "chapeu", "bolsa", "relogio", "camera", "computador", "notebook", "carro", "moto", "bicicleta", "aviao", "helicoptero", "trem", "onibus", "caminhao", "nave", "foguete", "skate"];
const HA_PAPEIS = ["estranho", "homem", "mulher", "guarda", "soldado", "vilao", "mago", "maga", "bruxo", "bruxa", "rei", "rainha", "principe", "princesa", "velho", "velha", "menino", "menina", "crianca", "cavaleiro", "ladrao", "pirata", "ninja", "samurai", "mestre", "monge", "cacador", "policial", "detetive", "capitao", "general", "mercador", "taverneiro", "garcom", "medico", "viajante", "mendigo", "assassino", "mercenario", "feiticeiro", "feiticeira", "inimigo", "lider", "chefe", "aluno", "professor"];
const HA_PARADA = new Set(["Ele", "Ela", "Eles", "Elas", "O", "A", "Os", "As", "Um", "Uma", "Então", "Depois", "Mas", "E", "Quando", "Enquanto", "No", "Na", "Nos", "Nas", "De", "Do", "Da", "Em", "Com", "Por", "Para", "Seu", "Sua", "Era", "Foi", "Naquele", "Naquela", "Ali", "Lá", "Aqui", "Logo", "De repente", "Sem", "Se", "Isso", "Aquilo", "Este", "Esta", "Esse", "Essa", "Todos", "Ninguém", "Alguém", "Fim", "Capítulo", "Mais", "Agora", "Ao", "À", "Às", "Aos", "Que", "Quem", "Como", "Onde", "Porque", "Sim", "Não", "Oi", "Olá", "Socorro", "Pare", "Corra", "Vamos", "Cuidado", "Nunca", "Sempre", "Talvez", "Ainda", "Já", "Só", "Até", "Desde", "Durante", "Sob", "Sobre", "Entre", "Contra"]);
/* ---- registro de lacunas ---- */
const HA_LACUNAS = new Map();
function haLacuna(tipo, termo, frase, sugestao) { const k = tipo + ":" + HA_N(termo); const L = HA_LACUNAS.get(k) || { tipo, termo: HA_N(termo), vezes: 0, exemplos: [], sugestao: sugestao || null }; L.vezes++; if (frase && L.exemplos.length < 3 && !L.exemplos.includes(frase)) L.exemplos.push(String(frase).slice(0, 160)); if (sugestao) L.sugestao = sugestao; HA_LACUNAS.set(k, L); return L; }
function listaLacunas() { return [...HA_LACUNAS.values()].sort((a, b) => b.vezes - a.vezes); }
function limparLacunas() { HA_LACUNAS.clear(); }
function importarLacunas(arr) { for (const L of arr || []) { const k = L.tipo + ":" + L.termo, a = HA_LACUNAS.get(k); if (a) { a.vezes += L.vezes || 1; } else HA_LACUNAS.set(k, Object.assign({ exemplos: [] }, L)); } }
/* ---- dicionários do que existe ---- */
function haEspecies() { const m = new Map(); for (const k of Object.keys(QD_ESPECIES)) m.set(HA_N(k), k); for (const [s, k] of Object.entries(CR_SINONIMOS || {})) m.set(HA_N(s), k);
  for (const [s, k] of [["cavalo", "cavalo"], ["egua", "cavalo"], ["cachorro", "cachorro"], ["cao", "cachorro"], ["gato", "gato"], ["lobo", "lobo"], ["dragao", "dragao"], ["passaro", "pardal"], ["corvo", "corvo"], ["aguia", "aguia"], ["falcao", "falcao"], ["coruja", "coruja"], ["cobra", "cobra"], ["serpente", "cobra"], ["tubarao", "tubarao"], ["polvo", "polvo"], ["aranha", "aranha"], ["lagarto", "lagarto"], ["crocodilo", "crocodilo"], ["macaco", "macaco"], ["gorila", "gorila"], ["sapo", "sapo"], ["baleia", "baleia"], ["golfinho", "golfinho"], ["peixe", "peixe"], ["unicornio", "unicornio"], ["pegaso", "pegaso"], ["grifo", "grifo"], ["burro", "burro"], ["boi", "boi"], ["vaca", "vaca"], ["urso", "urso"], ["leao", "leao"], ["tigre", "tigre"], ["elefante", "elefante"], ["camelo", "camelo"], ["dinossauro", "tiranossauro"], ["kraken", "kraken"], ["escorpiao", "escorpiao"], ["caranguejo", "caranguejo"], ["tartaruga", "tartaruga"]]) if (QD_ESPECIES[k]) m.set(s, k);
  return m; }
function haObjetos() { const m = new Map(); for (const k of Object.keys(COMPOSTOS)) m.set(HA_N(k), k); for (const [s, k] of Object.entries(SINONIMOS_COMPOSTOS)) if (COMPOSTOS[k] || OBJ_MAO[k]) m.set(HA_N(s), k);
  for (const [s, k] of [["espada", "espadaCurta"], ["faca", "adaga"], ["arma", "pistola"], ["revolver", "revolver"], ["fuzil", "rifle"], ["metralhadora", "metralhadora"], ["escopeta", "escopeta"], ["bazuca", "lancaFoguetes"], ["varinha", "varinha"], ["cajado", "cajadoMagico"], ["arco", "arco"], ["escudo", "escudoCavaleiro"], ["lanca", "lanca"], ["machado", "machado"], ["livro", "livro"], ["carta", "carta"], ["celular", "celular"], ["guarda-chuva", "guardaChuva"], ["violao", "violao"], ["barco", "barcoRemo"], ["canoa", "canoa"], ["carruagem", "carruagem"], ["carroca", "carroca"], ["balsa", "balsa"], ["jangada", "balsa"], ["veleiro", "veleiro"]]) if (COMPOSTOS[k] || OBJ_MAO[k]) m.set(s, k);
  return m; }
/* ---- análise ---- */
function analisarHistoria(historia, o = {}) {
  const texto = String(historia || "").replace(/\r/g, "").trim(); if (!texto) throw new Error("Mande a história (texto).");
  const frasesOrig = texto.split(/\n{2,}|(?<=[.!?…])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“—])/).map(f => f.trim()).filter(Boolean);
  /* personagens: nomes com maiúscula (não no começo da frase, ou repetidos) */
  const cont = new Map(); for (const f of frasesOrig) { const ws = f.replace(/["“”«»—]/g, " ").split(/\s+/); ws.forEach((w, i) => { const n = w.replace(/[^\wÀ-ÿ-]/g, ""); if (!/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõçà]+$/.test(n) || HA_PARADA.has(n)) return; const c = cont.get(n) || { n: 0, meio: 0 }; c.n++; if (i > 0) c.meio++; cont.set(n, c); }); }
  const ESP = haEspecies(), OBJ = haObjetos(), animaisNome = new Map();
  let nomes = [...cont.entries()].filter(([n, c]) => (c.meio >= 1 || c.n >= 2) && !ESP.has(HA_N(n)) && !OBJ.has(HA_N(n)) && !HA_LUGARES[HA_N(n)]).sort((a, b) => b[1].n - a[1].n).map(([n]) => n).slice(0, 8);
  if (o.nomes && o.nomes.length) nomes = o.nomes.concat(nomes.filter(n => !o.nomes.includes(n))).slice(0, 8);
  { const papeis = new Map(); for (const fo of frasesOrig) for (const m of HA_N(fo).matchAll(/\b(o|a|um|uma)\s+(\w+)/g)) if (HA_PAPEIS.includes(m[2])) papeis.set(m[2], (papeis.get(m[2]) || 0) + 1);
    for (const [p] of [...papeis].sort((a, b) => b[1] - a[1])) { const nm = p[0].toUpperCase() + p.slice(1); if (!nomes.includes(nm) && nomes.length < 8) nomes.push(nm); } }
  if (!nomes.length) nomes = ["Kai"];
  const menciona = (f, n) => { const k = HA_N(n); return new RegExp("\\b" + k + "\\b").test(f) ? new RegExp("\\b" + k + "\\b").exec(f).index : -1; };
  const lugares = [], cenas = [], lacunasDaHistoria = [];
  const lac = (t, termo, f, s) => { const L = haLacuna(t, termo, f, s); if (!lacunasDaHistoria.includes(L)) lacunasDaHistoria.push(L); };
  let localAtual = null, ultimoQuem = nomes[0], grupoAnt = null;
  for (const fo of frasesOrig) { const f = HA_N(fo), quemNa = nomes.filter(n => new RegExp("\\b" + HA_N(n) + "\\b").test(f));
    const quemFrase = quemNa.slice(); let grupo = quemNa.length > 1 && /\b(os dois|ambos|eles|elas|juntos)\b/.test(f) ? quemNa.slice() : null;
    /* lugar */
    let lugar = null; for (const [p, id] of Object.entries(HA_LUGARES)) if (new RegExp("\\b" + p + "\\b").test(f)) { lugar = id; break; }
    if (!lugar) for (const p of HA_LUGARES_FALTAM) if (new RegExp("\\b(n[oa]s?|para [oa]s?|d[oa]s?|em|ate [oa]|pel[oa]) (\\w+ )?" + p + "\\b").test(f)) { lac("lugar", p, fo, "não há local pronto “" + p + "”: crie um local (chao, parede, objetos) ou um preset novo"); break; }
    if (lugar && !lugares.includes(lugar)) lugares.push(lugar); if (lugar) localAtual = lugar;
    /* animais, objetos, veículos citados */
    let N = null, O = null, V = null; for (const w of f.split(/[^a-z0-9-]+/)) { if (!w) continue; if (ESP.has(w) && !N) N = ESP.get(w); else if (OBJ.has(w)) { const k = OBJ.get(w); if (COMPOSTOS[k] && COMPOSTOS[k].veiculo) V = V || k; else O = O || k; }
      else if (Object.prototype.hasOwnProperty.call(HA_CRIATURAS_FALTAM, w) && HA_CRIATURAS_FALTAM[w]) lac("criatura", w, fo, HA_CRIATURAS_FALTAM[w]); else if (HA_OBJ_FALTAM.includes(w)) lac(/^(carro|moto|bicicleta|aviao|helicoptero|trem|onibus|caminhao|nave|foguete|skate)$/.test(w) ? "veiculo" : "objeto", w, fo, "objeto/veículo “" + w + "” não existe: use caixa/cilindro com nome e tamanho, ou peça um novo"); }
    if (N && !animaisNome.has(N)) animaisNome.set(N, N[0].toUpperCase() + N.slice(1, 8));
    const linhas = [], acoes = [], funcoes = new Set(), temVerbo = t => HA_VERBOS.some(([re]) => re.test(t));
    /* orações: "Mira chorou e Kai a abraçou" → duas, cada uma com o seu sujeito */
    const partes = f.split(/(?:,\s*|\s+)(?:mas|porem|enquanto|entao|depois)\s+|;\s+|,\s+e\s+|\s+e\s+(?=(?:o|a|os|as)\s+\w|\w+\s+(?:a|o|se|lhe)\s+\w)|,\s+(?=\w+\s+\w+(?:ou|eu|iu)\b)/), oracoes = []; for (const p of partes) { if (oracoes.length && !temVerbo(oracoes[oracoes.length - 1])) oracoes[oracoes.length - 1] += " e " + p; else oracoes.push(p); }
    let Q = ultimoQuem; const primeiroQ = quemNa[0] || ultimoQuem;
    for (const or of oracoes) { const vi = (() => { let mi = 1e9; for (const [re] of HA_VERBOS) { const m = re.exec(or); if (m && m.index < mi) mi = m.index; } return mi; })();
      const antes = nomes.map(n => [n, menciona(or, n)]).filter(([, i]) => i >= 0 && i < vi).sort((a, b) => a[1] - b[1]).map(([n]) => n), depois = nomes.map(n => [n, menciona(or, n)]).filter(([, i]) => i > vi).sort((a, b) => a[1] - b[1]).map(([n]) => n);
      const sujeitos = antes.length ? antes : /\b(eles|elas|os dois|ambos)\b/.test(or) && grupoAnt ? grupoAnt : [Q]; Q = sujeitos[sujeitos.length - 1]; if (sujeitos.length > 1) grupoAnt = sujeitos.slice();
      let A = depois[0] || (/\b(a|o|lhe|nela|nele)\b/.test(or.slice(0, vi + 1)) || / (a|o) \w+(ou|eu|iu)\b/.test(or) ? quemFrase.find(n => !sujeitos.includes(n)) : null) || null;
      let O = null, Ov = null; for (const w of or.split(/[^a-z0-9-]+/)) { if (OBJ.has(w)) { const k = OBJ.get(w); if (COMPOSTOS[k] && COMPOSTOS[k].veiculo) Ov = Ov || k; else if (!(O && OBJ_MAO[O] && OBJ_MAO[O].grupo === "arma-fogo")) O = OBJ_MAO[k] && OBJ_MAO[k].grupo === "arma-fogo" ? k : O || k; } }
      if (/\b(feiti|conjur|magia)/.test(or) && /varinha/.test(or)) O = "varinha";
      for (const sq of sujeitos) { const ctx = { Q: sq, A: A === sq ? null : A, O, V: Ov ? HA_N(Ov) : V ? HA_N(V) : null, N: N ? animaisNome.get(N) : null, frase: or, fraseOrig: fo };
        if (/\ba cavalo\b|\bcavalgando\b/.test(or) && ctx.N && sq === sujeitos[0]) { linhas.push(sq + " monta " + ctx.N); acoes.push({ verbo: "montar", ok: true }); }
        for (const [re, nome, fn, fam] of HA_VERBOS) { if (!re.test(or)) continue; if (!fn) { lac("verbo", nome, fo, "sem pose/animação para “" + nome + "”"); acoes.push({ verbo: nome, ok: false }); continue; }
          const ls = fn(ctx); if (!ls.length) { acoes.push({ verbo: nome, ok: false, falta: "objeto/animal/veículo" }); continue; } for (const l of ls) { if (/ pose /.test(l)) { const i = linhas.findIndex(x => x.startsWith(sq + " pose ")); if (i >= 0 && !/ segura /.test(l)) continue; } if (/ interacao /.test(l) && linhas.some(x => x.startsWith(sq + " interacao "))) continue; linhas.push(l); } acoes.push({ verbo: nome, ok: true }); if (fam) funcoes.add(fam); }
        for (const [re, e] of HA_EMO) if (re.test(or) && !linhas.some(l => /expressao/.test(l) && l.startsWith(sq + " "))) { linhas.push(sq + " expressao " + e); break; } } }
    ultimoQuem = Q; const QF = primeiroQ, AF = quemNa.find(n => n !== QF) || null;
    if (V && !linhas.some(l => / (embarca|rema) /.test(l))) linhas.push(QF + " embarca " + HA_N(V));
    const sug = [...funcoes].map(fam => (nrBuscar(fam, 3)[0] || {}).id).filter(Boolean);
    cenas.push({ frase: fo, quem: [...new Set(quemNa.length ? quemNa : [QF])], lugar: localAtual, animal: N ? animaisNome.get(N) : null, objeto: null, veiculo: V, acoes, linhas, funcoes: sug, emocao: (HA_EMO.find(([re]) => re.test(f)) || [])[1] || null }); }
  /* texto da cena */
  const out = [], fmt = o.formato || "manga"; if (fmt === "webtoon") out.push("pagina formato webtoon");
  out.push("elenco"); nomes.forEach((n, i) => out.push("  " + n + " relevante corpo " + (i % 2 ? "feminino" : "masculino"))); for (const [esp, nm] of animaisNome) out.push("  " + nm + " animal " + esp);
  const locNomes = {}; for (const id of lugares) { const L = localPronto(id); locNomes[id] = L.nome; out.push(""); out.push(...L.codigo.trimEnd().split("\n")); }
  const veics = [...new Set(cenas.map(c => c.veiculo).filter(Boolean))];
  let n = 0, localAnt = null, colocados = new Set(); for (const c of cenas) { if (!c.linhas.length && !c.quem.length) continue; n++;
    const plano = c.veiculo || c.animal ? "conjunto" : c.emocao && c.quem.length === 1 ? "close" : c.quem.length > 1 ? "conjunto" : c.acoes.some(a => /correr|fugir|pular|lutar|chutar|socar|atirar|feiti/.test(a.verbo)) ? "inteiro" : "medio";
    const loc = c.lugar && c.lugar !== localAnt ? ' local "' + locNomes[c.lugar] + '"' : c.lugar ? " continua" : "";
    out.push(""); out.push("quadro " + n + loc + " plano " + plano + (c.quem.length ? " alvo " + c.quem.join(", ") : "") + ' legenda "' + c.frase.replace(/"/g, "'").slice(0, 90) + '"');
    if (c.lugar !== localAnt || n === 1) colocados = new Set();
    const envolvidos = [...new Set(c.quem.concat(nomes.filter(nm => c.linhas.some(l => new RegExp("\\b" + nm + "\\b").test(l)))))];
    envolvidos.filter(q => !colocados.has(q)).forEach(q => { const i = colocados.size; out.push("  " + q + " em (" + [0, 2, -2, 4, -4, 1, -1, 3][i % 8] + "," + (i % 2 ? 1.5 : 0) + ")" + (envolvidos.length > 1 ? " olha " + envolvidos.find(x => x !== q) : "")); colocados.add(q); });
    if (c.animal && !colocados.has(c.animal)) { out.push("  " + c.animal + " em (3,2)"); colocados.add(c.animal); }
    for (const v of veics) if (c.veiculo === v && !out.some(l => l.includes('objeto ' + v + ' "' + HA_N(v) + '"'))) out.push("  objeto " + v + ' "' + HA_N(v) + '" em (0,3)');
    c.linhas.forEach(l => out.push("  " + l)); localAnt = c.lugar || localAnt; }
  const dsl = out.join("\n") + "\n";
  return { personagens: nomes, animais: [...animaisNome].map(([e, n]) => ({ nome: n, especie: e })), lugares: lugares.map(id => ({ preset: id, nome: locNomes[id] })), cenas, dsl, lacunas: lacunasDaHistoria.map(L => ({ tipo: L.tipo, termo: L.termo, sugestao: L.sugestao, exemplo: L.exemplos[0] })), quadros: n }; }
export { analisarHistoria, listaLacunas, limparLacunas, importarLacunas, haLacuna, HA_VERBOS };
