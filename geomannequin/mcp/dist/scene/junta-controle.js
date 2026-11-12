/* GeoMannequin — mover uma articulação pelo teclado ou arrastando nas vistas de pose.
   Teclado: ←/→ primeiro eixo, ↑/↓ segundo, PgUp/PgDn terceiro (torção); Shift passo grande,
   Alt passo fino. Arrasto: descobre qual eixo da junta gira o membro no plano daquela vista
   (perturba cada eixo e mede o giro na tela) e faz o membro seguir o cursor. */
import { SLK, faixa } from "./parametros.js";
import { limitesAcoplados } from "./poses.js";
import { ARTICULACOES, DEF, ossosDoCorpo, projetorPose, clamp } from "../engine/index.js";

/* [horizontal, vertical, terceiro] de cada junta (o lado entra depois) */
const EIXOS_JUNTA = {
  pelve: ["pelvisSide", "pelvisTilt", "pelvisTwist"], lombar: ["lumSide", "lumFlex", "lumTwist"], toracica: ["thoSide", "thoFlex", "thoTwist"],
  cervical: ["neckTwist", "neckFlex", "neckSide"], cabeca: ["headYaw", "headPitch", "headRoll"], rosto: ["jawSide", "jawOpen", "smile"],
  ombro: ["armAbd", "armFlex", "armRot"], cotovelo: ["pron", "elbow", null], punho: ["wristDev", "wrist", "handCurl"], mao: ["fSpread", "handCurl", "thumbOpp"],
  quadril: ["hipAbd", "hipFlex", "hipRot"], joelho: ["tibiaRot", "kneeFlex", null], tornozelo: ["ankleTilt", "ankleFlex", "footAdd"],
  dedo: ["Abd", "Mcp", "Ip"]
};
const NOME_DEDO = { Th: "polegar", In: "indicador", Me: "médio", An: "anelar", Mi: "mínimo" };
function nomeDaJunta(j) {
  if (!j) return "";
  const base = j.k === "dedo" ? "dedo " + (NOME_DEDO[j.dedo] || j.dedo) : (ARTICULACOES[j.k] ? ARTICULACOES[j.k].nome : j.k);
  return base + (j.s ? (j.s > 0 ? " esquerdo" : " direito") : "");
}
/* chaves reais dos eixos da junta j = {k, s, dedo}; null onde a junta não tem esse eixo */
function eixosDaJunta(j) {
  const e = EIXOS_JUNTA[j && j.k]; if (!e) return [null, null, null];
  const lado = j.k === "dedo" || (ARTICULACOES[j.k] && ARTICULACOES[j.k].lado), suf = j.s > 0 ? "L" : "R";
  return e.map(q => { if (!q) return null; const k = j.k === "dedo" ? "f" + j.dedo + q + suf : lado ? q + suf : q; return SLK[k] ? k : null; });
}
function ehAngular(k) { const d = SLK[k]; return d && d.max - d.min > 3; }
function passoDoParametro(k, mod) { const base = ehAngular(k) ? 2 : 0.02; return base * (mod === "grande" ? 5 : mod === "fino" ? 0.25 : 1); }
function ajustarParametroJunta(params, k, valor) {
  const [a, b] = faixa(k, params.flex), d = SLK[k], st = d && d.step ? d.step : 0.01;
  params[k] = +clamp(Math.round(valor / st) * st, a, b).toFixed(4);
  limitesAcoplados(params);
  return params[k];
}
/* eixo: 0 horizontal, 1 vertical, 2 terceiro; dir: +1/−1. Devolve {k, valor, rotulo} ou null */
function moverJunta(params, j, eixo, dir, mod) {
  const k = eixosDaJunta(j)[eixo]; if (!k) return null;
  const v = ajustarParametroJunta(params, k, (params[k] || 0) + dir * passoDoParametro(k, mod));
  return { k, valor: v, rotulo: SLK[k].label };
}
function zerarJunta(params, j) { eixosDaJunta(j).forEach(k => { if (k) params[k] = DEF[k] ?? 0; }); limitesAcoplados(params); }

/* ---- arrasto no plano da vista ---- */
/* pontos que medem o giro: pontas dos ossos e as juntas (o rosto mostra o giro da cabeça vista de cima) */
const pontosDosOssos = E => { const o = []; E.ossos.forEach(b => { o.push(b.a, b.b); }); E.juntas.forEach(j => o.push(j.P)); return o; };
function juntaNoEsqueleto(E, j) { return E.juntas.find(q => q.k === j.k && q.s === j.s && (j.k !== "dedo" || q.dedo === j.dedo)); }
/* qual eixo gira o membro no plano desta vista, e quanto (radianos de tela por unidade do parâmetro).
   Mede sem o apoio no chão (senão dobrar o joelho afunda o corpo inteiro) e em relação à própria junta. */
function planoDoArrasto(params, j, vista) {
  const pr = projetorPose(vista), base = { ...params, ground: 0 }, E0 = ossosDoCorpo(base), J0 = juntaNoEsqueleto(E0, j); if (!J0) return null;
  const pv = pr(J0.P), P0 = pontosDosOssos(E0);
  let melhor = null;
  eixosDaJunta(j).forEach(k => {
    if (!k) return;
    const d = ehAngular(k) ? 6 : 0.08, [a, b] = faixa(k, params.flex), v0 = params[k] || 0, sgn = v0 + d <= b ? 1 : -1;
    const E1 = ossosDoCorpo({ ...base, [k]: v0 + sgn * d }), J1 = juntaNoEsqueleto(E1, j), P1 = pontosDosOssos(E1);
    const t = J1 ? [J0.P[0] - J1.P[0], J0.P[1] - J1.P[1], J0.P[2] - J1.P[2]] : [0, 0, 0];
    /* giro médio de cada ponto em volta da junta, pesado pela distância (a média das posições cairia sobre o eixo) */
    let soma = 0, pesos = 0, rs = 0, n = 0;
    for (let i = 0; i < P0.length && i < P1.length; i++) {
      const q1 = [P1[i][0] + t[0], P1[i][1] + t[1], P1[i][2] + t[2]];
      if (Math.hypot(q1[0] - P0[i][0], q1[1] - P0[i][1], q1[2] - P0[i][2]) < 1e-4) continue;
      const x0 = pr(P0[i]), x1 = pr(q1), ri = Math.hypot(x0[0] - pv[0], x0[1] - pv[1]); if (ri < 0.05) continue;
      let dai = Math.atan2(x1[1] - pv[1], x1[0] - pv[0]) - Math.atan2(x0[1] - pv[1], x0[0] - pv[0]);
      /* peso = quanto o ponto andou na tela: pontos quase parados (vértebras sob a cabeça) não diluem o giro */
      const mi = Math.hypot(x1[0] - x0[0], x1[1] - x0[1]); if (mi < 1e-4) continue;
      dai = Math.atan2(Math.sin(dai), Math.cos(dai)); soma += dai * mi; pesos += mi; rs += ri * mi; n++;
    }
    if (!n) return;
    const da = soma / pesos, r = rs / pesos;
    const ganho = da / (sgn * d), forca = Math.abs(da) * r;
    if (!melhor || forca > melhor.forca) melhor = { k, ganho, forca, pivo: J0.P, a, b };
  });
  return melhor && Math.abs(melhor.ganho) > 1e-4 ? melhor : null;
}

export { EIXOS_JUNTA, nomeDaJunta, eixosDaJunta, passoDoParametro, moverJunta, zerarJunta, ajustarParametroJunta, planoDoArrasto, juntaNoEsqueleto };
