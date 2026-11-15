/* GeoMannequin — VEÍCULOS: carruagem, carroça, barco a remo, canoa, veleiro e balsa (objetos compostos com "assentos" e "atrelar").
   embarcar: a pessoa senta no banco certo (posição, para onde olha, altura do assento), com a postura do lugar (remador puxa os remos,
   canoeiro segura o remo de pá, na balsa fica de pé). puxar: o animal fica entre os varais e o veículo vai atrás dele (no filme também). */
import { SCN } from "./modelo.js";
import { COMPOSTOS, capsulas } from "../engine/index.js";
import { pMundo } from "./colisoes.js";
import { amChaoMundo, amAchar } from "./animais.js";

const VC_SENTADO = { hipFlexL: 88, hipFlexR: 88, hipAbdL: 8, hipAbdR: 8, hipRotL: 0, hipRotR: 0, kneeFlexL: 86, kneeFlexR: 86, ankleFlexL: 2, ankleFlexR: 2, spineFlex: 4, bodyPitch: 0, bodyRoll: 0 };
const VC_POSTURA = {
  rema: { armFlexL: 62, armFlexR: 62, armAbdL: 22, armAbdR: 22, elbowL: 38, elbowR: 38, handCurlL: 0.85, handCurlR: 0.85, spineFlex: 18, kneeFlexL: 70, kneeFlexR: 70, hipFlexL: 78, hipFlexR: 78 },
  pa: { armFlexL: 115, armFlexR: 48, armAbdL: 12, armAbdR: 24, elbowL: 70, elbowR: 25, handCurlL: 0.85, handCurlR: 0.85, spineFlex: 10, spineTwist: -14 },
  redeas: { armFlexL: 40, armFlexR: 40, armAbdL: 8, armAbdR: 8, elbowL: 70, elbowR: 70, handCurlL: 0.8, handCurlR: 0.8, spineFlex: 8 },
  passageiro: { armFlexL: 18, armFlexR: 18, armAbdL: 10, armAbdR: 10, elbowL: 60, elbowR: 60, handCurlL: 0.3, handCurlR: 0.3 }
};
const vcTipo = o => o && COMPOSTOS[o.tipo] && COMPOSTOS[o.tipo].veiculo ? COMPOSTOS[o.tipo] : null;
function vcEhVeiculo(o) { return !!vcTipo(o); }
function vcAssentos(o) { const T = vcTipo(o); return T && T.assentos ? T.assentos(o) : {}; }
/* local → mundo (giro do objeto em graus; +z local = frente) */
function vcMundo(o, p, g0) { const g = (o.giro || 0) * Math.PI / 180, c = Math.cos(g), s = Math.sin(g), k = (o.escalaVeiculo || 1);
  return [o.x + (p[0] * c + p[2] * s) * k, g0 + (o.base || 0) + p[1] * k, o.z + (-p[0] * s + p[2] * c) * k]; }
/* senta (ou põe de pé) a pessoa no assento: posição, giro, postura e altura do quadril no banco */
function vcEmbarcar(it, o, nome, manterBracos) {
  const A = vcAssentos(o), chave = nome && A[nome] ? nome : Object.keys(A)[0], S = A[chave]; if (!S) throw new Error(o.nome + " não tem assentos.");
  const g0 = amChaoMundo(), P = vcMundo(o, S.p, g0), tam = it.params.tamanho || 1;
  if (!S.pe) { Object.assign(it.params, VC_SENTADO); const post = S.rema === true ? "rema" : S.rema === "pa" ? "pa" : chave === "cocheiro" || chave === "condutor" ? "redeas" : "passageiro"; if (!manterBracos || post === "rema" || post === "pa") Object.assign(it.params, VC_POSTURA[post]); }
  it.params.wx = P[0]; it.params.wz = P[2]; it.params.wRot = ((o.giro || 0) + (S.olha < 0 ? 180 : 0)) % 360; it.params.ground = 0; it.params.bodyLift = 0;
  try { const cs = capsulas(pMundo(it)), L = cs.caps || cs; if (S.pe) { const pe = Math.min(...L.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0))); it.params.bodyLift = (P[1] - pe) / tam; }
    else { const pel = L.find(c => c.nome === "pelve"), yA = pel ? Math.min(pel.a[1], pel.b[1]) - (pel.r || 0) * 0.7 : null; if (yA !== null) it.params.bodyLift = (P[1] - yA) / tam; } } catch (e) { }
  it.embarcadoEm = { veiculo: o.nome, assento: chave }; (o.passageiros || (o.passageiros = {}))[chave] = it.name; return chave; }
/* o veículo vai atrás do animal que puxa. Vários animais ("Trovao puxa coche", "Raio puxa coche"…): o 1º é o guia, os outros vão em
   parelhas na frente do timão (2, 4 ou 6 cavalos) e copiam o passo do guia. */
function vcSlot(o, i, n) { const a = vcTipo(o).atrelar(o); if (n <= 1) return a; const fila = Math.floor(i / 2), lado = i % 2 ? 1 : -1; return [a[0] + lado * 3.7, a[1], a[2] + fila * 24]; }
function vcAtrelar(o, an) { const T = vcTipo(o); if (!T || !T.atrelar) throw new Error(o.nome + " não tem varais/timão para atrelar um animal (só carruagem e carroça).");
  const extras = (o.puxadores || []).filter(n => n !== an.nome && amAchar(n));
  if (!o.puxadoPor || o.puxadoPor === an.nome || !amAchar(o.puxadoPor)) o.puxadoPor = an.nome; else if (!extras.includes(an.nome)) { if (extras.length >= 5) throw new Error(o.nome + ": no máximo 6 animais puxando."); extras.push(an.nome); }
  o.puxadores = extras; const lider = amAchar(o.puxadoPor); if (lider) vcSeguirAnimal(o, lider); }
function vcSeguirAnimal(o, an) { const ex = (o.puxadores || []).map(amAchar).filter(Boolean), n = 1 + ex.length, a = vcSlot(o, 0, n), g = (an.giro || 0) * Math.PI / 180, c = Math.cos(g), s = Math.sin(g), k = o.escalaVeiculo || 1; o.giro = an.giro || 0;
  o.x = an.x - (a[0] * c + a[2] * s) * k; o.z = an.z - (-a[0] * s + a[2] * c) * k;
  ex.forEach((h, i) => { const q = vcSlot(o, i + 1, n); h.x = o.x + (q[0] * c + q[2] * s) * k; h.z = o.z + (-q[0] * s + q[2] * c) * k; h.giro = an.giro || 0; h.base = an.base || 0;
    if (h.animal && an.animal) { h.animal.pose = an.animal.pose; h.animal.marchaAtual = an.animal.marchaAtual; h.animal.animAtual = an.animal.animAtual; } }); }
/* veículo que anda sozinho no filme (barco, navio, balsa, trem): velocidade típica por meio, em m/s */
const VC_VELOC = { terra: 3, agua: 2.2, trilho: 9 };
/* a cada quadro/instante: veículos puxados seguem o animal; passageiros seguem o banco */
function vcAtualizar() { for (const o of SCN.objetos || []) { if (!vcTipo(o)) continue; if (o.puxadoPor) { const an = amAchar(o.puxadoPor); if (an) vcSeguirAnimal(o, an); }
    for (const [ass, nome] of Object.entries(o.passageiros || {})) { const it = SCN.list.find(x => x.name === nome && x.embarcadoEm && x.embarcadoEm.veiculo === o.nome); if (it) vcEmbarcar(it, o, ass, true); else delete o.passageiros[ass]; } } }
function listaVeiculos() { return Object.entries(COMPOSTOS).filter(([, t]) => t.veiculo).map(([tipo, t]) => ({ tipo, nome: t.nome, meio: t.veiculo, assentos: Object.keys(t.assentos ? t.assentos({}) : {}), atrelar: !!t.atrelar, maxAnimais: t.atrelar ? (tipo === "carruagem" ? 6 : 2) : 0, tamanho: [t.larg, t.prof, t.alt].map(v => +(v * 0.114).toFixed(1)) })); }
export { VC_VELOC, vcSlot, vcEhVeiculo, vcAssentos, vcMundo, vcEmbarcar, vcAtrelar, vcAtualizar, listaVeiculos, VC_POSTURA };
