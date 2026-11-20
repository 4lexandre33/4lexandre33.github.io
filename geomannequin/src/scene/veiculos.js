/* GeoMannequin — VEÍCULOS: carruagem, carroça, barco a remo, canoa, veleiro e balsa (objetos compostos com "assentos" e "atrelar").
   embarcar: a pessoa senta no banco certo (posição, para onde olha, altura do assento), com a postura do lugar (remador puxa os remos,
   canoeiro segura o remo de pá, na balsa fica de pé). puxar: o animal fica entre os varais e o veículo vai atrás dele (no filme também). */
import { SCN } from "./modelo.js";
import { COMPOSTOS, capsulas, vcTrilhoAmostras, vcTrilhoEm, VC_TREM_CENTROS, shape, doMundo, ikArm, ikLeg } from "../engine/index.js";
import { pMundo } from "./colisoes.js";
import { amChaoMundo, amAchar } from "./animais.js";

const VC_SENTADO = { hipFlexL: 88, hipFlexR: 88, hipAbdL: 8, hipAbdR: 8, hipRotL: 0, hipRotR: 0, kneeFlexL: 86, kneeFlexR: 86, ankleFlexL: 2, ankleFlexR: 2, spineFlex: 4, bodyPitch: 0, bodyRoll: 0 };
const VC_POSTURA = {
  rema: { armFlexL: 62, armFlexR: 62, armAbdL: 22, armAbdR: 22, elbowL: 38, elbowR: 38, handCurlL: 0.85, handCurlR: 0.85, spineFlex: 18, kneeFlexL: 70, kneeFlexR: 70, hipFlexL: 78, hipFlexR: 78 },
  pa: { armFlexL: 115, armFlexR: 48, armAbdL: 12, armAbdR: 24, elbowL: 70, elbowR: 25, handCurlL: 0.85, handCurlR: 0.85, spineFlex: 10, spineTwist: -14 },
  redeas: { armFlexL: 40, armFlexR: 40, armAbdL: 8, armAbdR: 8, elbowL: 70, elbowR: 70, handCurlL: 0.8, handCurlR: 0.8, spineFlex: 8 },
  passageiro: { armFlexL: 18, armFlexR: 18, armAbdL: 10, armAbdR: 10, elbowL: 60, elbowR: 60, handCurlL: 0.3, handCurlR: 0.3 }
};
/* montado (bicicleta, moto, jet ski, quadriciclo): pernas abertas no selim, tronco inclinado para o guidão */
const VC_MONTADO = { hipFlexL: 62, hipFlexR: 62, hipAbdL: 14, hipAbdR: 14, hipRotL: 0, hipRotR: 0, kneeFlexL: 75, kneeFlexR: 75, ankleFlexL: 8, ankleFlexR: 8, spineFlex: 6, bodyPitch: 0, bodyRoll: 0, armFlexL: 45, armFlexR: 45, armAbdL: 14, armAbdR: 14, elbowL: 30, elbowR: 30 };
/* em pé sobre a prancha (skate, patinete): joelhos um pouco dobrados */
const VC_PRANCHA = { hipFlexL: 14, hipFlexR: 14, hipAbdL: 6, hipAbdR: 6, kneeFlexL: 22, kneeFlexR: 22, spineFlex: 8, armAbdL: 30, armAbdR: 30, armFlexL: 10, armFlexR: 10, elbowL: 25, elbowR: 25 };
const vcTipo = o => o && COMPOSTOS[o.tipo] && COMPOSTOS[o.tipo].veiculo ? COMPOSTOS[o.tipo] : null;
function vcEhVeiculo(o) { return !!vcTipo(o); }
function vcAssentos(o) { const T = vcTipo(o); if (!T || !T.assentos) return {}; const A = T.assentos(o);
  if (o && o.tipo === "trem" && o._carros) { /* trem dobrado na curva: cada banco vai com o seu carro */
    for (const [k, S] of Object.entries(A)) { const m = /^vagao(\d+)-/.exec(k), car = /^(maquinista|foguista)$/.test(k) ? 0 : m ? +m[1] : 1, C = o._carros[car]; if (!C) continue;
      const zc = VC_TREM_CENTROS(car), g = C.a * Math.PI / 180, c = Math.cos(g), sn = Math.sin(g), lx = S.p[0], lz = S.p[2] - zc;
      A[k] = Object.assign({}, S, { p: [lx * c + lz * sn + C.x, S.p[1], -lx * sn + lz * c + C.z], giroExtra: C.a }); } }
  return A; }
/* trem sobre um trilho (reto ou curvo): o.noTrilho = nome do trilho, o.trilhoS = posição da frente ao longo do trilho (R) */
function vcTremNoTrilho(o) { const tr = SCN.objetos.find(x => x.nome === o.noTrilho && x.tipo === "trilho"); if (!tr) return false;
  const A = vcTrilhoAmostras(tr), Ltot = A[A.length - 1].s, n = o.tipo === "trem" ? Math.max(0, Math.min(6, Math.round(o.vagoes ?? 2))) : 0, g0 = (tr.giro || 0) * Math.PI / 180, c0 = Math.cos(g0), s0 = Math.sin(g0);
  const W = q => ({ x: tr.x + q.x * c0 + q.z * s0, z: tr.z - q.x * s0 + q.z * c0, a: q.a + (tr.giro || 0) + (o.trilhoRe ? 180 : 0) });
  const sF = Math.max(48, Math.min(Ltot, o.trilhoS ?? Ltot / 2)), P = [];
  for (let k = 0; k <= n; k++) { const sc = Math.max(0, sF - 48 + VC_TREM_CENTROS(k)), q = vcTrilhoEm(A, o.trilhoRe ? Ltot - sc : sc); P.push(W(q)); }
  const L0 = P[0], g = L0.a * Math.PI / 180, c = Math.cos(g), sn = Math.sin(g); o.x = L0.x; o.z = L0.z; o.giro = ((L0.a + 540) % 360) - 180; o.base = tr.base || 0;
  if (o.tipo === "trem") o._carros = P.map(q => { const dx = q.x - L0.x, dz = q.z - L0.z; return { x: dx * c - dz * sn, z: dx * sn + dz * c, a: q.a - L0.a }; }); return true; }

/* local → mundo (giro do objeto em graus; +z local = frente) */
function vcMundo(o, p, g0) { const g = (o.giro || 0) * Math.PI / 180, c = Math.cos(g), s = Math.sin(g), k = (o.escalaVeiculo || 1);
  return [o.x + (p[0] * c + p[2] * s) * k, g0 + (o.base || 0) + p[1] * k, o.z + (-p[0] * s + p[2] * c) * k]; }
/* senta (ou põe de pé) a pessoa no assento: posição, giro, postura e altura do quadril no banco.
   Assentos com "chao" põem os pés no piso (pernas por IK), com "teto" reclinam o tronco até a cabeça caber, com "volante" põem as mãos no aro. */
const vcSemAcento = t => String(t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
function vcChaveAssento(A, nome) { if (nome && A[nome]) return nome; const n = vcSemAcento(nome); return nome ? Object.keys(A).find(k => vcSemAcento(k) === n) : Object.keys(A)[0]; }
const vcCaps = it => { const cs = capsulas(pMundo(it)); return cs.caps || cs; };
function vcPorNoBanco(it, S, P, tam) { try { const L = vcCaps(it); if (S.pe) { const pe = Math.min(...L.map(c => Math.min(c.a[1], c.b[1]) - (c.r || 0))); it.params.bodyLift += (P[1] - pe) / tam; }
    else { const pel = L.find(c => c.nome === "pelve"), yA = pel ? Math.min(pel.a[1], pel.b[1]) - (pel.r || 0) * 0.7 : null; if (yA !== null) it.params.bodyLift += (P[1] - yA) / tam; } } catch (e) { } }
function vcMembroEm(it, lado, W, perna) { const Q = it.params, Sh = shape(Q), al = doMundo(pMundo(it))(W), L_ = lado > 0 ? "L" : "R";
  if (perna) { const r = ikLeg(Q, Sh, lado, al); Object.assign(Q, { ["hipFlex" + L_]: r.hipFlex, ["hipAbd" + L_]: r.hipAbd, ["hipRot" + L_]: r.hipRot, ["kneeFlex" + L_]: r.knee }); }
  else { const r = ikArm(Q, Sh, lado, al); Object.assign(Q, { ["armAbd" + L_]: r.abd, ["armFlex" + L_]: r.flex, ["armRot" + L_]: r.rot, ["elbow" + L_]: r.elbow }); } }
function vcEmbarcar(it, o, nome, manterBracos) {
  const A = vcAssentos(o), chave = vcChaveAssento(A, nome), S = A[chave]; if (!S) throw new Error(o.nome + " não tem assentos.");
  const g0 = amChaoMundo(), P = vcMundo(o, S.p, g0), tam = it.params.tamanho || 1, ol = S.olha < 0 ? -1 : 1, lc = (x, y, z) => vcMundo(o, [S.p[0] + x * ol, y, S.p[2] + z * ol], g0);
  if (!S.pe) { Object.assign(it.params, VC_SENTADO); const post = S.rema === true ? "rema" : S.rema === "pa" ? "pa" : chave === "cocheiro" || chave === "condutor" ? "redeas" : "passageiro"; if (!manterBracos || post === "rema" || post === "pa") Object.assign(it.params, VC_POSTURA[post]); if (S.teto !== undefined) it.params.bodyPitch = -(S.reclina ?? 12); }
  const semBracos = v => manterBracos ? Object.fromEntries(Object.entries(v).filter(([k]) => !/^(arm|elbow)/.test(k))) : v;
  if (S.montado) { Object.assign(it.params, semBracos(VC_MONTADO)); const inc = S.inclina || 0; it.params.spineFlex = Math.round(6 + Math.max(0, inc) * 0.55); it.params.bodyPitch = Math.round(inc * 0.45); if (S.empe) Object.assign(it.params, { hipFlexL: 30, hipFlexR: 30, kneeFlexL: 35, kneeFlexR: 35 }); }
  if (S.emPeVeiculo) Object.assign(it.params, semBracos(VC_PRANCHA));
  it.params.wx = P[0]; it.params.wz = P[2]; it.params.wRot = ((o.giro || 0) + (S.giroExtra || 0) + (S.olha < 0 ? 180 : 0) + (S.emPeVeiculo === "lado" ? 90 : 0)) % 360; it.params.ground = 0; it.params.bodyLift = 0;
  vcPorNoBanco(it, S, P, tam);
  /* selim: pés nos pedais/pedaleiras, mãos no guidão; prancha: pés na prancha */
  if (S.pedais || S.pesEm) { const pts = S.pedais || S.pesEm; for (const [i, lado] of [[0, 1], [1, -1]]) { const q = pts[i], W = vcMundo(o, [q[0], q[1] + (S.pesEm ? 0.65 : 0.2), q[2]], g0); try { vcMembroEm(it, S.emPeVeiculo === "lado" ? (i ? 1 : -1) : lado, W, true); } catch (e) { } } }
  if (S.guidao && !manterBracos) { const [cx, cy, cz] = S.guidao.c, r = S.guidao.r || 2; for (const lado of [1, -1]) { try { vcMembroEm(it, lado, vcMundo(o, [cx + lado * r, cy + 0.2, cz - 0.3], g0), false); } catch (e) { } } Object.assign(it.params, { handCurlL: 0.85, handCurlR: 0.85, pronL: 80, pronR: 80 }); }
  if (S.abraca && !manterBracos) { for (const lado of [1, -1]) { try { vcMembroEm(it, lado, lc(lado * 1.3, S.p[1] + 3.6, 3.6), false); } catch (e) { } } Object.assign(it.params, { handCurlL: 0.4, handCurlR: 0.4 }); }
  /* cabe sob o teto? reclina (até 32°) e abaixa a cabeça */
  if (!S.pe && S.teto !== undefined) { const teto = vcMundo(o, [S.p[0], S.teto, S.p[2]], g0)[1];
    for (let k = 0; k < 8; k++) { let topo; try { topo = Math.max(...vcCaps(it).filter(c => /cabe|pesco/.test(c.nome)).map(c => Math.max(c.a[1], c.b[1]) + (c.r || 0))); } catch (e) { break; }
      if (!(topo > teto + 0.15)) break; if ((it.params.bodyPitch || 0) > -28) it.params.bodyPitch = (it.params.bodyPitch || 0) - 3; else it.params.neckFlex = (it.params.neckFlex || 0) + 6; it.params.bodyLift = 0; vcPorNoBanco(it, S, P, tam); } }
  /* pés no piso, um pouco à frente do quadril */
  if (!S.pe && S.chao !== undefined) { const fr = S.pesFrente ?? 4.5, yc = S.chao + 0.8; for (const lado of [1, -1]) { try { vcMembroEm(it, lado, lc(lado * 1.4, yc, fr), true); } catch (e) { } } }
  /* mãos no volante (10 e 2 horas) */
  if (S.volante && !manterBracos) { const [cx, cy, cz] = S.volante.c, r = S.volante.r || 1.6; for (const lado of [1, -1]) { try { vcMembroEm(it, lado, vcMundo(o, [cx + lado * ol * r * 0.85, cy + r * 0.45, cz - ol * 0.6], g0), false); } catch (e) { } }
    Object.assign(it.params, { handCurlL: 0.85, handCurlR: 0.85 }); }
  /* passageiro de cabine fechada: mãos nas coxas (os braços ficam dentro) */
  else if (!S.pe && S.dentro && !manterBracos && !S.rema && !S.guidao) { for (const lado of [1, -1]) { try { vcMembroEm(it, lado, lc(lado * 1.5, S.p[1] + 1.6, 3.2), false); } catch (e) { } } Object.assign(it.params, { handCurlL: 0.35, handCurlR: 0.35 }); }
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
const VC_VELOC = { terra: 6, agua: 3, trilho: 9, ar: 40 };
/* a cada quadro/instante: veículos puxados seguem o animal; passageiros seguem o banco */
function vcAtualizar() { for (const o of SCN.objetos || []) { if (!vcTipo(o)) continue; if (o.noTrilho) vcTremNoTrilho(o); if (o.puxadoPor) { const an = amAchar(o.puxadoPor); if (an) vcSeguirAnimal(o, an); }
    for (const [ass, nome] of Object.entries(o.passageiros || {})) { const it = SCN.list.find(x => x.name === nome && x.embarcadoEm && x.embarcadoEm.veiculo === o.nome); if (it) vcEmbarcar(it, o, ass, true); else delete o.passageiros[ass]; } } }
function listaVeiculos() { return Object.entries(COMPOSTOS).filter(([, t]) => t.veiculo).map(([tipo, t]) => ({ tipo, nome: t.nome, meio: t.veiculo, assentos: Object.keys(t.assentos ? t.assentos({}) : {}), atrelar: !!t.atrelar, maxAnimais: t.atrelar ? (tipo === "carruagem" ? 6 : 2) : 0, tamanho: [t.larg, t.prof, t.alt].map(v => +(v * 0.114).toFixed(1)) })); }
export { vcChaveAssento, vcTremNoTrilho, VC_VELOC, vcSlot, vcEhVeiculo, vcAssentos, vcMundo, vcEmbarcar, vcAtrelar, vcAtualizar, listaVeiculos, VC_POSTURA };
