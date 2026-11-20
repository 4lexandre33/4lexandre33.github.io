/* GeoMannequin — EFEITOS PARA TODAS AS POSES: cada pose (pelo nome, categoria, descrição e emoção) ganha uma lista de efeitos
   sugeridos, do mais sutil ao mais forte. "Kai pose socoDireto efeitos" põe os efeitos (intensidade 2); "efeitos 1" = só o
   principal, "efeitos 3" = todos, com linhas de tela. Também em veículos ("Kai embarca Moto efeitos": velocidade), situações
   ("situacao … efeitos"), Catálogo e MCP (efeitos_sugeridos). Os nomes são os do catálogo de efeitos (efeitos/modelo.js). */
import { cxItem } from "./catalogo-poses.js";

/* regras: [teste no texto da pose, efeitos em ordem de força] — efeito = "tipo [opções do Name]" */
const EP_REGRAS = [
  [/(velocidade|veiculo|moto|bicicl|pedal|skate|patinet|carro|kart|corrida de|jet ?ski|cavalga|galop)/, ["velocidade_corpo", "rastro_de_velocidade", "poeira_de_corrida", "velocidade"]],
  [/(corr|sprint|disparad|fuga|fugindo|persegu|dash|investida)/, ["rastro_de_velocidade", "poeira_de_corrida", "velocidade_corpo", "velocidade"]],
  [/(soco|jab|direto|cruzado|uppercut|gancho|punch)/, ["arco_movimento", "impacto_contato em mao-direita", "linhas_de_impulso", "sombra_dramatica"]],
  [/(chute|voadora|kick|pisao|joelhada|rasteira)/, ["arco_movimento", "rastro_membro", "impacto_contato", "linhas_de_impulso"]],
  [/(espada|katana|corte|lamina|sabre|golpe de arma|machad|lanca|bastao)/, ["rastro_de_espada", "arco_de_golpe", "corte_ar", "sombra_dramatica"]],
  [/(tiro|atira|pistola|rifle|mira|dispara|arma de fogo)/, ["clarao_cano em mao-direita", "cartuchos", "linhas_de_impulso", "concentracao"]],
  [/(magia|feitico|poder|energia|kame|hadou|carga|invoca|ritual|levita|flutua|aura|super-?heroi|transforma)/, ["energia_mao em mao-direita", "aura", "pedras_levitando", "aura_explosiva"]],
  [/(queda|caindo|cai |tombo|derrub|atingid|nocaute|dano|apanha)/, ["impacto_contato", "estrelas_tontura", "poeira", "linhas_de_susto"]],
  [/(pulo|salto|pula|aterriss|mergulh|acrobac|mortal|parkour)/, ["linhas_de_impulso", "borrao_movimento", "poeira_pes", "onda_choque"]],
  [/(danc|ballet|bale|samba|tango|valsa|hip ?hop|break|giro)/, ["arco_movimento", "pos_imagem", "brilho_nos_olhos", "concentracao"]],
  [/(musica|canta|toca|violao|guitarra|piano|bateria|microfone|instrumento|show)/, ["ondas_sonoras", "brilho_nos_olhos", "concentracao", "raios_de_luz_divina"]],
  [/(amor|romance|beijo|apaixon|coracao|carinho|abraco|encontro)/, ["coracoes_flutuando", "petalas_sakura", "brilho_nos_olhos", "concentracao"]],
  [/(raiva|furia|furioso|bravo|grita|briga|discussao|odio)/, ["vapor_de_raiva", "emote", "sombra_dramatica", "concentracao"]],
  [/(medo|susto|panico|terror|assust|grito de medo|fobia|vitima)/, ["linhas_de_susto", "gotas_voando", "sombra_dramatica", "concentracao"]],
  [/(vergonha|constrang|timid|nervos|ansios|desespero|cansa|exaust|calor)/, ["gotas_voando", "emote", "linhas_de_susto", "concentracao"]],
  [/(triste|luto|chor|saudade|solid|derrota|depress)/, ["chuva", "nevoa", "sombra_dramatica", "folhas_ao_vento"]],
  [/(alegr|vitoria|conquista|comemora|festa|celebra|feliz|triunfo|gol)/, ["brilho_nos_olhos", "chuva_de_estrelas", "emote", "concentracao"]],
  [/(tontur|bebad|zonzo|confus)/, ["estrelas_tontura", "espirais_tontura", "gotas_voando", "emote"]],
  [/(medita|reza|prece|fe |oracao|zen|lotus)/, ["raios_de_luz_divina", "vagalumes", "aura", "pilar_de_luz_nanquim"]],
  [/(decid|determin|foco|concentra|desafio|encara|confronto|vilao|ameaca)/, ["brilho_nos_olhos", "concentracao", "sombra_dramatica", "aura_sombria"]],
  [/(luta|guarda|combate|artes marciais|kung|karate|boxe|muay|capoeira|anime)/, ["aura_vento", "linhas_de_impulso", "concentracao", "aura_explosiva"]],
  [/(chuva|guarda-chuva|frio|neve|tremendo)/, ["chuva", "neve", "nevoa", "gotas_voando"]],
  [/(esporte|futebol|basquete|volei|tenis|natac|atletismo|treino|ginast)/, ["linhas_de_impulso", "poeira_pes", "rastro_de_velocidade", "concentracao"]],
  [/(dorm|sono|cochil|deitado|descans|relax)/, ["emote", "vagalumes", "nevoa", "bolhas"]]
];
const EP_PADRAO = ["concentracao", "brilho_nos_olhos", "petalas_sakura", "raios_de_luz_divina"];
const epNorm = t => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
/* efeitos sugeridos para um texto de pose (nome + categoria + descrição + emoção), na ordem de força */
function efeitosSugeridos(texto, intensidade = 2) { const t = " " + epNorm(texto).replace(/([a-z])([A-Z])/g, "$1 $2") + " ", out = [];
  for (const [re, efs] of EP_REGRAS) if (re.test(t)) for (const e of efs) if (!out.includes(e)) out.push(e);
  for (const e of EP_PADRAO) if (out.length < 4 && !out.includes(e)) out.push(e);
  const n = intensidade <= 1 ? 1 : intensidade >= 3 ? 4 : 2; return out.slice(0, n); }
/* texto descritivo de uma pose (nome separado em palavras + categoria) */
function epTextoDaPose(nome, extra) { const sep = String(nome || "").replace(/([a-z])([A-Z])/g, "$1 $2"); let tag = ""; try { const i = cxItem("pose:" + nome); if (i) tag = [i.tag, i.desc, i.en, (i.apelidos || []).join(" "), i.emocao].join(" "); } catch (e) { }
  return sep + " " + tag + " " + (extra || ""); }
function efeitosDaPose(nome, intensidade = 2, extra) { return efeitosSugeridos(epTextoDaPose(nome, extra), intensidade); }
export { EP_REGRAS, efeitosSugeridos, efeitosDaPose, epTextoDaPose };
