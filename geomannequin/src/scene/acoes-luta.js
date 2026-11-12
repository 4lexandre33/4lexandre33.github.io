/* GeoMannequin — poses de AÇÃO (luta, corrida, queda, salto, magia) com rosto e efeitos de movimento, e as
   ETIQUETAS de função narrativa de todas as poses (categorias e subcategorias: "Combate/Ataque/Soco").

   m.acao("socoCarregado") → pose + expressão (determinação, grito de guerra…) + efeitos atrás (rastro, arco do golpe,
   linhas de impulso). As poses vêm com o corpo inclinado na direção do movimento, braços e pernas bem angulados
   e o pescoço/queixo projetado. */
import { SCN } from "./modelo.js";
import { POSES_CORPO, POSE_GRUPOS, guardaBase, pesEm, aplicarMolejo } from "./poses.js";
import { aplicarGesto } from "../engine/index.js";

const alL = (s, k) => k + (s > 0 ? "L" : "R"), alO = (s, k) => k + (s > 0 ? "R" : "L");
const alPunhos = Q => { aplicarGesto(Q, 1, "punho"); aplicarGesto(Q, -1, "punho"); };
/* ---------- poses novas (corpo inteiro; s = 1 o lado esquerdo faz o movimento principal) ---------- */
const POSES_ACAO = {
  corridaSuperRapida: (Q, s) => { Object.assign(Q, { bodyPitch: 34, spineFlex: 8, neckFlex: -14, headPitch: -26, [alL(s, "hipFlex")]: 98, [alL(s, "kneeFlex")]: 112, [alL(s, "ankleFlex")]: 18,
    [alO(s, "hipFlex")]: -34, [alO(s, "kneeFlex")]: 28, [alO(s, "ankleFlex")]: 38, [alO(s, "toes")]: -50,
    [alL(s, "armFlex")]: -62, [alL(s, "armAbd")]: 16, [alL(s, "elbow")]: 98, [alO(s, "armFlex")]: 92, [alO(s, "armAbd")]: 10, [alO(s, "elbow")]: 104, spineTwist: s * -16, pelvisTwist: s * 12 });
    pesEm(Q, { [alO(s, "")]: [0.08, -0.62] }, 0.06); alPunhos(Q); },
  corridaNinja: (Q, s) => { Object.assign(Q, { bodyPitch: 42, spineFlex: 10, neckFlex: -18, headPitch: -30, [alL(s, "hipFlex")]: 92, [alL(s, "kneeFlex")]: 118, [alL(s, "ankleFlex")]: 20,
    [alO(s, "hipFlex")]: -36, [alO(s, "kneeFlex")]: 30, [alO(s, "ankleFlex")]: 40, [alO(s, "toes")]: -50,
    armFlexL: -72, armFlexR: -72, armAbdL: 12, armAbdR: 12, elbowL: 4, elbowR: 4, pronL: -70, pronR: -70, wristL: 30, wristR: 30 });
    pesEm(Q, { [alO(s, "")]: [0.08, -0.66] }, 0.08); aplicarGesto(Q, 1, "espalmada"); aplicarGesto(Q, -1, "espalmada"); },
  arrancada: (Q, s) => { Object.assign(Q, { bodyPitch: 52, spineFlex: 14, neckFlex: -16, headPitch: -36, [alL(s, "hipFlex")]: 120, [alL(s, "kneeFlex")]: 120, [alL(s, "ankleFlex")]: 6,
    [alO(s, "hipFlex")]: -20, [alO(s, "kneeFlex")]: 36, [alO(s, "ankleFlex")]: 30, [alO(s, "toes")]: -55,
    [alL(s, "armFlex")]: -40, [alL(s, "elbow")]: 80, [alO(s, "armFlex")]: 110, [alO(s, "elbow")]: 50, [alO(s, "armAbd")]: 8 });
    pesEm(Q, { [alL(s, "")]: [0.12, 0.2], [alO(s, "")]: [0.12, -0.7] }, 0.3); alPunhos(Q); },
  puloAlto: (Q, s) => { Object.assign(Q, { bodyLift: 6, bodyPitch: -6, spineFlex: 14, headPitch: -18, hipFlexL: 104, hipFlexR: 92, kneeFlexL: 128, kneeFlexR: 116, ankleFlexL: 30, ankleFlexR: 34,
    armAbdL: 150, armAbdR: 140, armFlexL: 40, armFlexR: 30, elbowL: 36, elbowR: 26 }); alPunhos(Q); },
  saltoAtaque: (Q, s) => { Object.assign(Q, { bodyLift: 5, bodyPitch: 16, spineFlex: -12, neckFlex: -10, headPitch: -20, [alL(s, "hipFlex")]: 70, [alL(s, "kneeFlex")]: 110, [alO(s, "hipFlex")]: -20, [alO(s, "kneeFlex")]: 70, ankleFlexL: 35, ankleFlexR: 35,
    [alO(s, "armFlex")]: 170, [alO(s, "armAbd")]: 10, [alO(s, "elbow")]: 40, [alL(s, "armFlex")]: -30, [alL(s, "armAbd")]: 50, [alL(s, "elbow")]: 60, spineTwist: s * 20 }); alPunhos(Q); },
  socoCarregado: (Q, s) => { guardaBase(Q, s, 0.7); Object.assign(Q, { bodyPitch: 8, spineTwist: s * -42, pelvisTwist: s * -20, spineFlex: 6, neckFlex: -10, headPitch: -18, headYaw: s * 32,
    [alO(s, "armFlex")]: -40, [alO(s, "armAbd")]: 40, [alO(s, "elbow")]: 135, [alO(s, "armRot")]: -20, [alL(s, "armFlex")]: 70, [alL(s, "armAbd")]: 10, [alL(s, "elbow")]: 40, [alL(s, "pron")]: -60 });
    alPunhos(Q); aplicarGesto(Q, s, "espalmada"); },
  socoDescendente: (Q, s) => { Object.assign(Q, { bodyLift: 4, bodyPitch: 26, spineFlex: 22, headPitch: -30, neckFlex: -10, hipFlexL: 80, hipFlexR: 60, kneeFlexL: 110, kneeFlexR: 90, ankleFlexL: 30, ankleFlexR: 30,
    [alO(s, "armFlex")]: 120, [alO(s, "elbow")]: 10, [alO(s, "armAbd")]: -10, [alL(s, "armFlex")]: -20, [alL(s, "armAbd")]: 60, [alL(s, "elbow")]: 70 }); alPunhos(Q); },
  investidaDeOmbro: (Q, s) => { Object.assign(Q, { bodyPitch: 30, spineTwist: s * 38, pelvisTwist: s * 14, spineFlex: 10, headPitch: -24, headYaw: s * -24, neckFlex: -10,
    [alL(s, "armFlex")]: 30, [alL(s, "armAbd")]: -20, [alL(s, "elbow")]: 120, [alO(s, "armFlex")]: -50, [alO(s, "armAbd")]: 30, [alO(s, "elbow")]: 60 });
    pesEm(Q, { [alL(s, "")]: [0.16, 0.42], [alO(s, "")]: [0.16, -0.62] }, 0.18); alPunhos(Q); },
  chuteMachado: (Q, s) => { Object.assign(Q, { bodyPitch: -14, spineFlex: -6, headPitch: 6, [alL(s, "hipFlex")]: 150, [alL(s, "kneeFlex")]: 4, [alL(s, "ankleFlex")]: 20, flex: 1,
    [alL(s, "armFlex")]: 40, [alL(s, "armAbd")]: 40, [alL(s, "elbow")]: 110, [alO(s, "armFlex")]: -10, [alO(s, "armAbd")]: 50, [alO(s, "elbow")]: 60 });
    pesEm(Q, { [alO(s, "")]: [0.1, -0.02] }, 0.04); alPunhos(Q); },
  bloqueioAlto: (Q, s) => { guardaBase(Q, s, 0.4); Object.assign(Q, { spineFlex: 14, neckFlex: 6, headPitch: 6, [alL(s, "armFlex")]: 120, [alL(s, "armAbd")]: 30, [alL(s, "elbow")]: 100, [alL(s, "armRot")]: 40, [alL(s, "pron")]: -70,
    [alO(s, "armFlex")]: 60, [alO(s, "elbow")]: 120 }); alPunhos(Q); },
  defesaComBracos: (Q, s) => { Object.assign(Q, { armFlexL: 84, armFlexR: 84, armAbdL: -30, armAbdR: -28, elbowL: 118, elbowR: 112, pronL: 20, pronR: 20, spineFlex: 30, neckFlex: 12, headPitch: 24, shElevL: 0.5, shElevR: 0.5, shProtL: 0.6, shProtR: 0.6 });
    pesEm(Q, { L: [0.3, 0.2], R: [0.3, -0.24] }, 0.3); alPunhos(Q); },
  esquivaBaixa: (Q, s) => { Object.assign(Q, { bodyPitch: 22, spineFlex: 36, spineSide: s * 14, neckFlex: -18, headPitch: -26, [alL(s, "armFlex")]: 70, [alL(s, "elbow")]: 130, [alO(s, "armFlex")]: 50, [alO(s, "elbow")]: 120, [alO(s, "armAbd")]: 20 });
    pesEm(Q, { [alL(s, "")]: [0.36, 0.22], [alO(s, "")]: [0.3, -0.3] }, 0.42); alPunhos(Q); },
  esquivaParaTras: (Q, s) => { Object.assign(Q, { bodyPitch: -30, spineFlex: -28, neckFlex: 14, headPitch: 18, armAbdL: 70, armAbdR: 74, armFlexL: 20, armFlexR: 10, elbowL: 40, elbowR: 30, [alL(s, "ankleFlex")]: -10 });
    pesEm(Q, { [alL(s, "")]: [0.2, 0.3], [alO(s, "")]: [0.2, -0.16] }, 0.24); aplicarGesto(Q, 1, "aberta"); aplicarGesto(Q, -1, "aberta"); },
  quedaDeCostas: (Q, s) => { Object.assign(Q, { bodyLift: 3, bodyPitch: -48, spineFlex: 24, neckFlex: 20, headPitch: 26, hipFlexL: 60, hipFlexR: 40, kneeFlexL: 70, kneeFlexR: 30, ankleFlexL: 20, ankleFlexR: 30,
    armAbdL: 100, armAbdR: 120, armFlexL: 40, armFlexR: 20, elbowL: 50, elbowR: 30 }); aplicarGesto(Q, 1, "aberta"); aplicarGesto(Q, -1, "aberta"); },
  quedaDeFrente: (Q, s) => { Object.assign(Q, { bodyLift: 2, bodyPitch: 58, spineFlex: -10, headPitch: -30, hipFlexL: -10, hipFlexR: 20, kneeFlexL: 20, kneeFlexR: 60, armFlexL: 120, armFlexR: 100, elbowL: 20, elbowR: 30, armAbdL: 20, armAbdR: 30 });
    aplicarGesto(Q, 1, "espalmada"); aplicarGesto(Q, -1, "espalmada"); },
  lancandoMagia: (Q, s) => { guardaBase(Q, s, 0.5); Object.assign(Q, { bodyPitch: 10, spineTwist: s * 18, neckFlex: -10, headPitch: -16, [alO(s, "armFlex")]: 92, [alO(s, "armAbd")]: -4, [alO(s, "elbow")]: 2, [alO(s, "pron")]: -80, [alO(s, "wrist")]: -40,
    [alL(s, "armFlex")]: 70, [alL(s, "armAbd")]: -30, [alL(s, "elbow")]: 80 }); aplicarGesto(Q, -s, "espalmada"); aplicarGesto(Q, s, "garra"); },
  disparoDuasMaos: (Q, s) => { guardaBase(Q, s, 0.6); Object.assign(Q, { bodyPitch: 12, spineTwist: 0, pelvisTwist: s * -10, neckFlex: -10, headPitch: -16, armFlexL: 90, armFlexR: 90, armAbdL: -14, armAbdR: -14, elbowL: 4, elbowR: 4, pronL: -80, pronR: -80, wristL: -50, wristR: -50 });
    aplicarGesto(Q, 1, "espalmada"); aplicarGesto(Q, -1, "espalmada"); }
};
Object.assign(POSES_CORPO, POSES_ACAO);
POSE_GRUPOS["Ação: luta, corrida, queda e magia"] = Object.keys(POSES_ACAO);

/* ---------- ações: pose + rosto + efeitos de movimento ---------- */
const ACOES_LUTA = {
  corridaSuperRapida: { expressao: "determinadoLuta", efeitos: [["rastro_de_velocidade", { em: "corpo" }], ["linhas_de_impulso", { em: "pes", direcao: "auto", escala: 0.8 }]] },
  corridaNinja: { expressao: "determinadoLuta", efeitos: [["rastro_de_velocidade", { em: "corpo" }]] },
  arrancada: { expressao: "gritoDeGuerra", efeitos: [["rastro_de_velocidade", { em: "corpo", escala: 0.7 }], ["anel_de_impacto_no_chao", { em: "pes", escala: 0.5 }]] },
  puloAlto: { expressao: "determinadoLuta", efeitos: [["anel_de_impacto_no_chao", { em: "pes", escala: 0.6 }]] },
  saltoAtaque: { expressao: "gritoDeGuerra", efeitos: [["arco_de_golpe", { em: "maoDir" }]] },
  socoCarregado: { expressao: "furia", efeitos: [["aura_de_espinhos", { em: "pes", escala: 0.6 }]] },
  socoDescendente: { expressao: "gritoDeGuerra", efeitos: [["linhas_de_impulso", { em: "maoDir" }], ["impacto_com_detritos", { em: "maoDir", escala: 0.6 }]] },
  investidaDeOmbro: { expressao: "furia", efeitos: [["rastro_de_velocidade", { em: "corpo" }]] },
  chuteMachado: { expressao: "gritoDeGuerra", efeitos: [["arco_de_golpe", { em: "peEsq", escala: 1.2 }]] },
  bloqueioAlto: { expressao: "esforco", efeitos: [["ondas_sonoras", { em: "maoEsq", escala: 0.5 }]] },
  defesaComBracos: { expressao: "esforco", efeitos: [["cupula_de_arcos", { em: "maos", escala: 0.6 }]] },
  esquivaBaixa: { expressao: "determinadoLuta", efeitos: [["laminas_de_vento", { em: "cabeca", escala: 0.6 }]] },
  esquivaParaTras: { expressao: "surpresaTotal", efeitos: [["linhas_de_impulso", { em: "peito", escala: 0.6 }]] },
  quedaDeCostas: { expressao: "dor", efeitos: [["explosao_estrelada", { em: "peito", escala: 0.6 }]] },
  quedaDeFrente: { expressao: "choque", efeitos: [["impacto_com_detritos", { em: "pes", escala: 0.6 }]] },
  lancandoMagia: { expressao: "determinadoLuta", efeitos: [["circulo_magico_flechas", { em: "maoDir" }]] },
  disparoDuasMaos: { expressao: "gritoDeGuerra", efeitos: [["feixe_com_aneis", { em: "maos" }]] },
  /* poses que já existiam, agora com rosto e efeito */
  investida: { expressao: "furia", efeitos: [["rastro_de_velocidade", { em: "corpo" }]] },
  chuteVoador: { expressao: "gritoDeGuerra", efeitos: [["linhas_de_impulso", { em: "peEsq" }]] },
  chuteGiratorio: { expressao: "determinadoLuta", efeitos: [["arco_de_golpe", { em: "peEsq", escala: 1.3 }]] },
  socando: { expressao: "gritoDeGuerra", efeitos: [["linhas_de_impulso", { em: "maoDir" }]] },
  uppercut: { expressao: "furia", efeitos: [["arco_de_golpe", { em: "maoDir" }]] },
  aterrissagemHeroi: { expressao: "determinadoLuta", efeitos: [["anel_de_impacto_no_chao", { em: "pes" }], ["espinhos_do_chao", { em: "pes", escala: 0.5 }]] },
  esquiva: { expressao: "determinadoLuta", efeitos: [["laminas_de_vento", { em: "cabeca", escala: 0.5 }]] },
  cargaDuasMaos: { expressao: "esforco", efeitos: [["esfera_espiral", { em: "maos", escala: 0.6 }]] },
  baseGritando: { expressao: "gritoDeGuerra", efeitos: [["aura_de_espinhos", { em: "pes" }]] }
};
/* m.acao(nome, {lado, efeitos: false, rosto: false, molejo}) */
function aplicarAcao(m, it, nome, o = {}) {
  const k = Object.keys(ACOES_LUTA).find(x => x.toLowerCase() === String(nome || "").toLowerCase());
  if (!k) throw new Error("Ação “" + nome + "” não existe. Use: " + Object.keys(ACOES_LUTA).join(", ") + ".");
  const A = ACOES_LUTA[k];
  m.poseRapida(k, { lado: o.lado, molejo: o.molejo ?? 0.35 });
  if (o.rosto !== false && A.expressao) m.expressao(A.expressao);
  const ids = [];
  /* troca os efeitos da ação anterior deste manequim pelos desta (não acumulam quadro a quadro) */
  const api = SCN.__cenaEfeitos;
  if (api) for (const e of api.lista().filter(e => /^Ação · /.test(e.nome) && e.ancora && e.ancora.alvo === it.name)) { try { api.remover(e.id); } catch (err) { } }
  if (o.efeitos !== false) for (const [tipo, op] of A.efeitos) { try { m.efeito(tipo, { ...op, colorido: o.colorido, nome: "Ação · " + tipo }); ids.push(tipo); } catch (e) { } }
  return { acao: k, expressao: A.expressao, efeitos: A.efeitos.map(x => x[0]) };
}

/* ---------- etiquetas de função narrativa (categoria/subcategoria/…) ---------- */
const TAGS_POSES = {
  /* combate */
  guardaLuta: "Combate/Preparação/Guarda", provocando: "Combate/Preparação/Provocação", baseGritando: "Combate/Preparação/Grito de guerra", agachadoCerrando: "Combate/Preparação/Concentração",
  jab: "Combate/Ataque/Soco", direto: "Combate/Ataque/Soco", gancho: "Combate/Ataque/Soco", uppercut: "Combate/Ataque/Soco", socoParaCima: "Combate/Ataque/Soco", socando: "Combate/Ataque/Soco", socoCarregado: "Combate/Ataque/Soco", socoDescendente: "Combate/Ataque/Soco aéreo",
  cotovelada: "Combate/Ataque/Golpe curto", joelhada: "Combate/Ataque/Golpe curto", palma: "Combate/Ataque/Palma", palmaDupla: "Combate/Ataque/Palma",
  chuteLateral: "Combate/Ataque/Chute", chuteAlto: "Combate/Ataque/Chute", chuteGiratorio: "Combate/Ataque/Chute", chutando: "Combate/Ataque/Chute", chuteMachado: "Combate/Ataque/Chute", chuteVoador: "Combate/Ataque/Chute aéreo", rasteira: "Combate/Ataque/Rasteira",
  investida: "Combate/Ataque/Investida", investidaDeOmbro: "Combate/Ataque/Investida", saltoAtaque: "Combate/Ataque/Salto de ataque",
  defesaCruzada: "Combate/Defesa/Bloqueio", bloqueioAlto: "Combate/Defesa/Bloqueio", defesaComBracos: "Combate/Defesa/Bloqueio",
  esquiva: "Combate/Defesa/Esquiva", esquivaBaixa: "Combate/Defesa/Esquiva", esquivaParaTras: "Combate/Defesa/Esquiva", desviando: "Combate/Defesa/Esquiva", recuando: "Combate/Defesa/Recuo",
  golpeRosto: "Combate/Dano/Atingido", golpeEstomago: "Combate/Dano/Atingido", atordoado: "Combate/Dano/Atordoado", ajoelhadoFerido: "Combate/Dano/Ferido",
  arremessadoCostas: "Combate/Queda/Arremessado", caindoDeCostas: "Combate/Queda/Caindo", quedaDeCostas: "Combate/Queda/Caindo", quedaDeFrente: "Combate/Queda/Caindo", caindo: "Combate/Queda/Caindo", estatelado: "Combate/Queda/No chão",
  girandoNoAr: "Combate/Queda/Girando", deCabecaParaBaixo: "Combate/Queda/Girando", rolando: "Combate/Queda/Rolamento", atravessandoParede: "Combate/Queda/Arremessado", levantandoDeQuatro: "Combate/Recuperação/Levantando",
  aterrissagemHeroi: "Combate/Movimento/Aterrissagem heroica",
  /* movimento */
  correndo: "Movimento/Corrida", corridaSuperRapida: "Movimento/Corrida/Super rápida", corridaNinja: "Movimento/Corrida/Super rápida", arrancada: "Movimento/Corrida/Arrancada",
  caminhando: "Movimento/Caminhada", impulso: "Movimento/Salto/Impulso", saltando: "Movimento/Salto", puloAlto: "Movimento/Salto", saltoLongo: "Movimento/Salto", saltoSobreCaixa: "Movimento/Salto/Obstáculo",
  aterrissando: "Movimento/Salto/Aterrissagem", subindoDegrau: "Movimento/Subir", escalando: "Movimento/Escalada", deslizandoSentado: "Movimento/Deslizar", engatinhando: "Movimento/Engatinhar",
  /* poder e magia */
  lancandoMagia: "Poder e magia/Disparo", disparoDuasMaos: "Poder e magia/Disparo", cargaDuasMaos: "Poder e magia/Carga", concentrando: "Poder e magia/Carga", esferaDeLado: "Poder e magia/Carga",
  bracosAbertosLevitando: "Poder e magia/Levitação", lotusFlutuando: "Poder e magia/Levitação", bracoAosCeus: "Poder e magia/Invocação", maosEmPrece: "Poder e magia/Ritual", joelhoMaoNoChao: "Poder e magia/Invocação",
  /* social */
  acenando: "Social/Saudação", apontando: "Social/Indicar", bracosCruzadosPeito: "Social/Atitude/Fechado", cintura: "Social/Atitude/Confiante", cruzar: "Social/Atitude/Fechado", ombro: "Social/Atitude/Descontraído",
  encostado: "Social/Atitude/Descontraído", contrapposto: "Social/Atitude/Relaxado", empe: "Social/Atitude/Neutro",
  /* emoção */
  vitoria: "Emoção/Triunfo", pensando: "Emoção/Pensamento", ajoelhado: "Emoção/Súplica",
  /* trabalho e esforço */
  carregando: "Trabalho/Carregar", empurrando: "Trabalho/Empurrar",
  /* descanso */
  sentado: "Descanso/Sentado", sentadoChao: "Descanso/Sentado", pernasEsticadas: "Descanso/Sentado", abracandoJoelhos: "Descanso/Sentado/Recolhido", sentadoCalcanhares: "Descanso/Sentado",
  deitadoCostas: "Descanso/Deitado", deitadoLado: "Descanso/Deitado", deBrucos: "Descanso/Deitado", apoiadoCotovelos: "Descanso/Deitado", meditando: "Descanso/Meditação", cocoras: "Descanso/De cócoras", umJoelho: "Descanso/Ajoelhado",
  agachar: "Trabalho/Agachar", agachamentoProfundo: "Esporte/Treino", prancha: "Esporte/Treino", quatroApoios: "Esporte/Treino", alongando: "Esporte/Alongamento",
  /* acrobacia */
  paradaDeMao: "Esporte/Acrobacia", ponte: "Esporte/Acrobacia", ponteUmaPerna: "Esporte/Acrobacia", paradaAbertura: "Esporte/Acrobacia", escorpiao: "Esporte/Acrobacia", arabesque: "Esporte/Dança", espacateSaltado: "Esporte/Acrobacia", camelo: "Esporte/Acrobacia",
  /* estudo (sem função narrativa: movimentos isolados) */
  frente: "Estudo/Movimento isolado", torcao: "Estudo/Movimento isolado", passo: "Estudo/Movimento isolado", joelho: "Estudo/Movimento isolado", ponta: "Estudo/Movimento isolado",
  erguido: "Estudo/Movimento isolado", alcancar: "Estudo/Movimento isolado", lateral: "Estudo/Movimento isolado"
};
/* as pegadas e interações também têm função narrativa */
const TAGS_PEGADAS = { carregar: "Trabalho/Carregar", levantar: "Trabalho/Levantar", sustentar: "Trabalho/Sustentar", puxar: "Trabalho/Puxar", empurrar: "Trabalho/Empurrar", arrastar: "Trabalho/Arrastar", arremessar: "Trabalho/Arremessar",
  "alcançar": "Trabalho/Alcançar", empunhar: "Combate/Armas", "usar ferramenta": "Trabalho/Ferramentas" };
const TAGS_INTERACOES = { abracoFrente: "Social/Afeto/Abraço", abracoLado: "Social/Afeto/Abraço", abracoPorTras: "Social/Afeto/Abraço", ombroAOmbro: "Social/Camaradagem", maoNoOmbro: "Social/Apoio",
  apoiandoFerido: "Social/Apoio/Resgate", apertoDeMao: "Social/Saudação/Aperto de mão", toqueDePunho: "Social/Saudação", highFive: "Social/Celebração", ajudarALevantar: "Social/Apoio/Ajuda" };
function normTag(t) { return String(t || "").split("/").map(x => x.trim()).filter(Boolean).join("/").slice(0, 120); }
/* árvore: {Combate: {_poses: [...], Ataque: {_poses: [...], Soco: {...}}}} */
function arvorePoses(o = {}) {
  const raiz = {}, por = (caminho, nome) => { let n = raiz; for (const parte of normTag(caminho).split("/")) n = n[parte] || (n[parte] = {}); (n._itens || (n._itens = [])).push(nome); };
  for (const [k, t] of Object.entries(TAGS_POSES)) if (o.estudo || !t.startsWith("Estudo")) por(t, "pose:" + k);
  for (const [k, t] of Object.entries(TAGS_INTERACOES)) por(t, "interacao:" + k);
  for (const p of (SCN.minhasPoses || [])) for (const t of p.tags || []) por(t, "minha:" + p.nome);
  return raiz;
}
function posesPorTag(caminho, o = {}) {
  const c = normTag(caminho).toLowerCase(), ok = t => t.toLowerCase() === c || t.toLowerCase().startsWith(c + "/");
  return [...Object.entries(TAGS_POSES).filter(([, t]) => ok(t) && (o.estudo || !t.startsWith("Estudo"))).map(([k]) => "pose:" + k),
    ...Object.entries(TAGS_INTERACOES).filter(([, t]) => ok(t)).map(([k]) => "interacao:" + k),
    ...(o.minhas || SCN.minhasPoses || []).filter(p => (p.tags || []).some(ok)).map(p => "minha:" + p.nome)];
}
export { POSES_ACAO, ACOES_LUTA, TAGS_POSES, TAGS_PEGADAS, TAGS_INTERACOES, aplicarAcao, arvorePoses, posesPorTag, normTag };
void aplicarMolejo;
