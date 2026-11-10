/* GeoMannequin — atlas esquemático dos músculos superficiais do rosto.
   Coordenadas: (x lateral, y da cabeça), com imagem espelhada por lado.
   Não é uma dissecação médica: as inserções são referências de desenho e
   acompanham a superfície parametrizada, as expressões e a rotação da cabeça. */
import { clamp } from "../matematica.js";
const ring=(cx,cy,rx,ry,a0,a1,n=24)=>Array.from({length:n+1},(_,i)=>{
  const a=a0+(a1-a0)*i/n;return [cx+rx*Math.cos(a),cy+ry*Math.sin(a)];
});
function atlasRosto(p,S){
  const t=S.t,my=S.mouthY,ey=S.eyeY,sm=clamp(p.smile||0,-1,1),up=clamp(p.browUp||0,-1,1),close=clamp(p.eyeLid||0,0,1);
  const out=[],put=(nome,tipo,pts,s)=>out.push({nome,tipo,pts:pts.map(([x,y])=>[s*x,y])});
  for(const s of [-1,1]){
    put("frontal_superior","fibra",[[.10,.59],[.16,.44],[.19,.23+up*.03]],s);
    put("frontal_lateral","fibra",[[.35,.61],[.38,.41],[.38,.20+up*.04]],s);
    put("temporal","divisao",[[.56,.50],[.65,.29],[.67,.04],[.62,-.13]],s);
    put("corrugador","divisao",[[.11,.13],[.21,.16],[.32,.12+up*.02]],s);
    put("orbicular_olhos","divisao",ring(.35,ey,.205,.135,0,2*Math.PI),s);
    put("procerus","fibra",[[.07,.10],[.07,-.05],[.045,-.2*t]],s);
    put("nasal","fibra",[[.12,-.63*t],[.16,-.81*t],[.21,-.90*t]],s);
    put("levantador_labio","divisao",[[.24,-.84*t],[.21,-.99*t],[.18,my+.045+sm*.035]],s);
    put("zigomatico_menor","divisao",[[.52,ey-.15],[.39,ey-.30],[.21,my+.08+sm*.04]],s);
    put("zigomatico_maior","divisao",[[.61,ey-.18],[.48,ey-.43],[.22,my+.015+sm*.05]],s);
    put("risorio","fibra",[[.60,my+.1],[.46,my+.07],[.23,my+.02+sm*.03]],s);
    put("bucinador","divisao",[[.60,my-.10],[.48,my-.15],[.25,my-.035]],s);
    put("masseter","divisao",[[.64,-.53*t],[.61,-.87*t],[.53,my-.18],[.43,my-.30]],s);
    put("orbicular_boca","divisao",ring(.0,my,.18,.092,0,Math.PI).filter(q=>q[0]>=0),s);
    put("depressor_angulo","divisao",[[.21,my-.03],[.30,my-.18],[.17,S.chinY+.20]],s);
    put("mentual","fibra",[[.14,my-.23],[.11,S.chinY+.12],[.025,S.chinY+.09]],s);
    if(sm>0.45||close>0.6)put("pregas_orbitais","fibra",[[.57,ey-.05],[.65,ey-.08],[.69,ey-.15]],s);
  }
  return out;
}
export { atlasRosto };
