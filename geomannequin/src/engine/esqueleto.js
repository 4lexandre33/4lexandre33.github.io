/* GeoMannequin — esqueleto: os ossos do manequim, com nome anatômico, calculados da mesma cadeia que move o corpo.
   Cada osso é um segmento (ponto a → ponto b, em coordenadas do corpo) e cada articulação tem um nome e os
   parâmetros que a movem — a interface usa isso para selecionar a articulação e girá-la.
   Hierarquia: pelve → lombar (L5–L1) → torácica (T12–T1) → cervical (C7–C1) → crânio; esterno → clavícula → escápula
   → úmero → rádio/ulna → carpo → metacarpos → falanges; pelve → fêmur → patela/tíbia/fíbula → tálus/calcâneo → metatarsos → falanges. */
import { applyA, clamp, comp, mv } from "./matematica.js";
import { shape, mandibula } from "./cabeca.js";
import { chainSetup, legPose } from "./cadeia.js";
import { armDims, armJoint, armPose } from "./bracos.js";
import { hipJoint, legDims } from "./pernas.js";
import { bustTw } from "./tronco.js";
import { juntasDedos } from "./maos.js";

/* articulações: nome, parâmetros que a movem (por lado: L/R) e o que cada um faz */
const ARTICULACOES = {
  pelve: { nome: "pelve", params: ["pelvisTilt", "pelvisSide", "pelvisTwist"] },
  lombar: { nome: "coluna lombar", params: ["spineFlex", "spineSide", "spineTwist", "lumFlex", "lumSide", "lumTwist"] },
  toracica: { nome: "coluna torácica", params: ["spineFlex", "spineSide", "spineTwist", "thoFlex", "thoSide", "thoTwist"] },
  cervical: { nome: "pescoço (cervical)", params: ["neckFlex", "neckSide", "neckTwist", "headPitch", "headYaw", "headRoll"] },
  cabeca: { nome: "cabeça", params: ["headPitch", "headYaw", "headRoll"] },
  ombro: { nome: "ombro", lado: true, params: ["armFlex", "armAbd", "armRot", "shElev", "shProt", "shTens", "scapRot"] },
  cotovelo: { nome: "cotovelo", lado: true, params: ["elbow", "pron"] },
  punho: { nome: "punho", lado: true, params: ["wrist", "wristDev", "pron", "handCurl"] },
  mao: { nome: "mão e dedos", lado: true, params: ["handCurl", "fTh", "fIn", "fMe", "fAn", "fMi", "fSpread", "thumbOpp", "fThMcp", "fThIp", "fThAbd", "fInMcp", "fInIp", "fInAbd", "fMeMcp", "fMeIp", "fMeAbd", "fAnMcp", "fAnIp", "fAnAbd", "fMiMcp", "fMiIp", "fMiAbd"] },
  quadril: { nome: "quadril", lado: true, params: ["hipFlex", "hipAbd", "hipRot"] },
  joelho: { nome: "joelho", lado: true, params: ["kneeFlex", "tibiaRot"] },
  tornozelo: { nome: "tornozelo", lado: true, params: ["ankleFlex", "ankleTilt", "footAdd", "toes", "hallux"] },
  rosto: { nome: "rosto (mandíbula, olhos e sobrancelhas)", params: ["jawOpen", "jawSide", "smile", "eyeYaw", "eyePitch", "eyeLid", "browUp", "browIn"] }
};
function paramsDaArticulacao(k, s) {
  const a = ARTICULACOES[k]; if (!a) return [];
  return a.params.map(q => a.lado ? q + (s > 0 ? "L" : "R") : q);
}

/* ossos em coordenadas do corpo (já com a pose) */
function ossosDoCorpo(p) {
  const S = shape(p), ch = chainSetup(p, S), F = ch.F, B = F.B, ossos = [], juntas = [];
  const T = (x, y, z) => { const A = ch.tab[Math.round(clamp(bustTw(x, y, F), 0, 3) * 64)]; return applyA(A, [x, y, z]); };
  /* cada osso leva o lado (1 esquerdo, −1 direito, 0 centro) e a região, para o foco das vistas de pose */
  let lado = 0;
  const osso = (nome, a, b, r, tipo) => ossos.push({ nome, a, b, r, tipo: tipo || "longo", s: lado, regiao: regiaoDoOsso(nome) });
  const junta = (nome, P, k, s) => juntas.push({ nome, P, k, s });
  /* coluna: 5 lombares, 12 torácicas, 7 cervicais */
  const vert = [];
  for (let i = 0; i < 5; i++) { const y = F.yHip + 0.5 + (F.yJ - 3.0 - (F.yHip + 0.5)) * i / 4; vert.push(["L" + (5 - i), T(0, y, -0.78), "lombar"]); }
  for (let i = 0; i < 12; i++) { const y = F.yJ - 3.0 + 0.32 + (F.yJ + 0.2 - (F.yJ - 2.68)) * i / 11; vert.push(["T" + (12 - i), T(0, y, -0.86 + 0.12 * i / 11), "toracica"]); }
  const A3 = ch.A3;
  for (let i = 0; i < 7; i++) { const t = i / 6, base = T(0, F.yJ + 0.35, -0.62), top = applyA(A3, [0, -0.55, -0.3]); vert.push(["C" + (7 - i), [0, 1, 2].map(k => base[k] + (top[k] - base[k]) * t), "cervical"]); }
  for (let i = 0; i + 1 < vert.length; i++) osso("vértebra " + vert[i][0], vert[i][1], vert[i + 1][1], 0.13, "coluna");
  vert.forEach(v => juntas.push({ nome: "vértebra " + v[0], P: v[1], k: v[2], s: 0, menor: true }));
  /* crânio e mandíbula */
  const cr = applyA(A3, [0, 0.15, 0.05]);
  ossos.push({ nome: "crânio", a: cr, b: cr, r: 0.95 * (p.skull || 0.82) / 0.82, tipo: "cranio", s: 0, regiao: "cabeca" });
  /* Mandíbula e dentes usam a mesma ATM da malha facial. O ramo proximal
     permanece junto à orelha; o mento acompanha a abertura inferior. */
  [-1,1].forEach(s=>{
    const condilo=mandibula([s*0.62,-0.35,0.10],p,S);
    const mento=mandibula([0,-0.95,0.85],p,S);
    osso("mandíbula",applyA(A3,condilo),applyA(A3,mento),0.1,"fino");
  });
  junta("cabeça (atlas)", applyA(A3, [0, -0.55, -0.3]), "cabeca", 0);
  junta("rosto", applyA(A3, [0, -0.62, 0.85]), "rosto", 0);
  junta("pescoço", T(0, F.yJ + 0.35, -0.62), "cervical", 0);
  junta("coluna torácica", vert[11][1], "toracica", 0);
  junta("coluna lombar", vert[2][1], "lombar", 0);
  /* pelve: ilíacos, sacro, articulações do quadril */
  const sac = applyA(ch.Pel, [0, F.yHip + 0.35, -1.0]), cox = applyA(ch.Pel, [0, F.yHip - 0.45, -1.05]);
  osso("sacro", sac, cox, 0.18, "plano");
  [-1, 1].forEach(s => {
    const H = applyA(ch.Pel, hipJoint(F, s)), cr2 = applyA(ch.Pel, [s * B.hip * 0.72, F.yHip + 0.85, -0.55]), asis = applyA(ch.Pel, [s * B.hip * 0.6, F.yHip + 0.45, 0.25]), pub = applyA(ch.Pel, [s * 0.18, F.yHip - 0.75, 0.15]);
    osso("ílio", sac, cr2, 0.14, "plano"); osso("ílio", cr2, asis, 0.12, "plano"); osso("púbis", asis, pub, 0.1, "plano"); osso("ísquio", pub, H, 0.1, "plano");
    junta("quadril", H, "quadril", s);
  });
  junta("pelve", sac, "pelve", 0);
  /* tórax: esterno, clavículas, escápulas e algumas costelas */
  const est = T(0, F.yJ + 0.05, 0.42), xif = T(0, F.yJ - 1.9, 0.5);
  osso("esterno", est, xif, 0.12, "plano");
  for (let i = 0; i < 6; i++) { const y = F.yJ - 0.4 - i * 0.42, w = B.chest * (0.85 + 0.1 * Math.sin(Math.PI * i / 5)); [-1, 1].forEach(s => { const a = T(0, y + 0.25, -0.85), b = T(s * w * 0.95, y - 0.05, -0.45), c = T(s * w * 0.55, y - 0.35, 0.42); osso("costela", a, b, 0.05, "costela"); osso("costela", b, c, 0.05, "costela"); }); }
  [-1, 1].forEach(s => {
    lado = s;
    const G = applyA(ch.A2, armJoint(p, F, s)), cl0 = T(s * 0.18, F.yJ + 0.08, 0.38);
    osso("clavícula", cl0, applyA(ch.A2, [s * (F.W - 0.2), F.yAc - 0.15, F.zT + 0.25]), 0.09);
    const e1 = applyA(ch.A2, [s * (F.W - 0.35), F.yAc - 0.2, F.zT - 0.55]), e2 = applyA(ch.A2, [s * 0.45, F.yJ - 0.35, -1.05]), e3 = applyA(ch.A2, [s * 0.55, F.yJ - 2.05, -1.0]);
    osso("escápula", e1, e2, 0.08, "plano"); osso("escápula", e2, e3, 0.08, "plano"); osso("escápula", e3, G, 0.08, "plano");
    junta("ombro", G, "ombro", s);
    /* braço */
    const ap = armPose(p, F, s), Af = comp(ch.A2, ap.fore), Ah = comp(ch.A2, ap.hand), Ad = armDims(p);
    osso("úmero", G, Af.T, 0.16);
    const w = Ah.T, lat = mv(Af.M, [0, 0, 0.12 * Ad.k]);
    osso("ulna", Af.T, [w[0] - lat[0], w[1] - lat[1], w[2] - lat[2]], 0.09); osso("rádio", applyA(Af, [0, -0.3, 0.1 * Ad.k]), [w[0] + lat[0], w[1] + lat[1], w[2] + lat[2]], 0.09);
    junta("cotovelo", Af.T, "cotovelo", s); junta("punho", w, "punho", s);
    juntasDedos(p, s).forEach(d => {
      const pts = d.pts.map(q => applyA(Ah, q)), b = applyA(Ah, d.base);
      juntas.push({ nome: "dedo " + d.nome, P: pts[0], k: "dedo", s, dedo: CODIGO_DEDO[d.nome], menor: true });
      osso("metacarpo (" + d.nome + ")", b, pts[0], 0.045);
      for (let i = 0; i + 1 < pts.length; i++) osso("falange (" + d.nome + ")", pts[i], pts[i + 1], 0.04, "dedo");
    });
    junta("mão", applyA(Ah, [0, -0.86 * Ad.k, 0]), "mao", s);
    /* perna */
    const lp = legPose(p, F, ch, s), Th = comp(ch.Pel, lp.thigh), Cf = comp(ch.Pel, lp.calf), Ft = comp(ch.Pel, lp.foot), A = legDims(p), f = A.f;
    const H = applyA(ch.Pel, hipJoint(F, s));
    osso("fêmur", H, Cf.T, 0.2);
    osso("patela", applyA(Cf, [0, 0.15, 0.38 * A.k]), applyA(Cf, [0, -0.2, 0.38 * A.k]), 0.12, "curto");
    osso("tíbia", Cf.T, Ft.T, 0.16); osso("fíbula", applyA(Cf, [s * 0.25 * A.k, -0.3, -0.05]), applyA(Ft, [s * 0.22, 0.1, -0.05]), 0.07);
    const calc = applyA(Ft, [0, -A.hA + 0.15, -0.45 * f]), met = [-0.35, -0.15, 0.05, 0.22, 0.38].map(x => [applyA(Ft, [-s * x * f * 0.6, -A.hA * 0.55, 0.35 * f]), applyA(Ft, [-s * x * f * 0.75, -A.hA + 0.12, 1.15 * f])]);
    osso("calcâneo", Ft.T, calc, 0.13, "curto");
    met.forEach(([a, b]) => { osso("metatarso", a, b, 0.05); osso("falange do pé", b, [b[0], b[1] - 0.05, b[2] + 0.3 * f], 0.04, "dedo"); });
    osso("tálus", Ft.T, met[2][0], 0.1, "curto");
    junta("joelho", Cf.T, "joelho", s); junta("tornozelo", Ft.T, "tornozelo", s);
  });
  return { ossos, juntas };
}
const CODIGO_DEDO = { polegar: "Th", indicador: "In", "médio": "Me", anelar: "An", "mínimo": "Mi" };
function regiaoDoOsso(nome) {
  if (/crânio|cranio|mandíbula|dente/.test(nome)) return "cabeca";
  if (/clavícula|escápula|úmero|ulna|rádio/.test(nome)) return "braco";
  if (/metacarpo|falange \(/.test(nome)) return "mao";
  if (/fêmur|patela|tíbia|fíbula/.test(nome)) return "perna";
  if (/calcâneo|metatarso|falange do pé|tálus/.test(nome)) return "pe";
  return "tronco";
}

export { ARTICULACOES, paramsDaArticulacao, ossosDoCorpo };
