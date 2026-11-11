/* AutoGrip V1 — planejador de preensão geométrica com busca de região, pose
 * do braço/punho, cinco dedos e avaliação de contatos. NÃO simula forças.
 *
 * Somente planejarAutoGrip() é puro: usa clones de params e nunca move o objeto.
 * A captura do vínculo Grip V3 fica a cargo de cena.autoEncaixarObjeto().
 */
import {armDims,aplicarGesto,restGround} from "../engine/index.js";
import {juntasDedos} from "../engine/maos.js";
import {colisaoEntreObjetos} from "../engine/objetos.js";
import {colliderObject,colliderRig,pointSolid,capsuleSolidContact,capsuleBox,overlaps,manifoldCaps} from "../engine/contact-v2.js";
import {gripSites,gripSiteWorld} from "../engine/grip-sites.js";
import {rigidDirection,objectRigidPose,rigidPoint,rigidInverse} from "../engine/rigid-transform.js";
import {handFrameV3,alinharPalmaV3} from "./grip-v3.js";

// Isolamento lexical: o headless concatena os arquivos de cena num único escopo.
const {planejarAutoGrip,planejarAutoGripComAjuste,resumirAutoGrip,medirMao,validarOpcoes,validarContatoAutoGrip,validarCenaAutoGrip,registrarRegiaoAutoGrip,verificarMicroDeslocamentoAutoGrip,validarAproximacaoAutoGrip}=(()=>{
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i]));
const dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
const norm=v=>{const d=Math.hypot(...v);if(!(d>1e-9))throw Error("Normal de superfície inválida");return v.map(x=>x/d)};
const add=(a,b,s=1)=>a.map((x,i)=>x+s*b[i]);
const SIDE={direita:-1,esquerda:1};
const CODES=["Th","In","Me","An","Mi"];
const NAMES=["polegar","indicador","médio","anelar","mínimo"];
const VALID_STYLES=["auto","pinca","potencia","gancho","tripode","lateral","apoio"];
const VALID_HANDS=["auto","direita","esquerda","ambas"];
const hard=reason=>({ok:false,motivo:reason});
const scalar=(v,name,lo,hi,def)=>{
 if(v===undefined)return def;
 if(typeof v!=="number"||!Number.isFinite(v)||v<lo||v>hi)throw Error(name+" deve estar entre "+lo+" e "+hi+".");
 return v;
};
function validarOpcoes(opts={}){
 if(!opts||typeof opts!=="object"||Array.isArray(opts))throw Error("Opções AutoGrip inválidas.");
 const mao=opts.mao??"auto",pegada=opts.pegada??"auto";
 if(!VALID_HANDS.includes(mao))throw Error("Mão: auto, direita, esquerda ou ambas.");
 if(!VALID_STYLES.includes(pegada))throw Error("Pegada: "+VALID_STYLES.join(", "));
 const ponto=opts.ponto??"auto";if(typeof ponto!=="string"||ponto.length>60)throw Error("GripSite inválido.");
 if(opts.animar)
   throw Error("A animação de aproximação ainda não está implementada: use encaixe instantâneo validado.");
 if(opts.segunda===true&&mao!=="ambas")
   throw Error("Para autoencaixe de duas mãos, use mao:'ambas'.");
 const permitirMoverObjeto=opts.permitirMoverObjeto===true;
 if(permitirMoverObjeto&&opts.preservarObjeto!==false)
   throw Error("Para permitir microajuste do objeto, selecione também preservarObjeto:false.");
 if(!permitirMoverObjeto&&opts.preservarObjeto===false)
   throw Error("preservarObjeto:false requer permitirMoverObjeto:true.");
 return {mao,pegada,ponto,permitirMoverObjeto,
   preservarObjeto:!permitirMoverObjeto,
   maxDeslocamento:scalar(opts.maxDeslocamento,"maxDeslocamento",0.05,0.6,0.24),
   reach:scalar(opts.reach,"reach",0.1,100,12),
   tolerancia:scalar(opts.tolerancia,"tolerancia",0.005,0.25,.055),
   limitePenetracao:scalar(opts.limitePenetracao,"limitePenetracao",0.005,0.14,.06),
   exigirContato:opts.exigirContato!==false,maxSites:Math.trunc(scalar(opts.maxSites,"maxSites",1,12,5)),
   maxIteracoes:Math.trunc(scalar(opts.maxIteracoes,"maxIteracoes",1,8,4)),
   maxTempoMs:Math.trunc(scalar(opts.maxTempoMs,"maxTempoMs",200,10000,3000)),
   verificarTrajetoria:opts.verificarTrajetoria===true,
   passosTrajetoria:Math.trunc(scalar(opts.passosTrajetoria,"passosTrajetoria",3,8,5)),
   segunda:opts.segunda===true,animar:opts.animar===true,solucionador:"geometrico-v1"};
}
function medirMao(p,side){
 const A=armDims(p),k=A.k*.95*p.armLen;
 const fingerRadius={polegar:.09,indicador:.075,"médio":.078,anelar:.073,"mínimo":.064};
 const digits=juntasDedos(p,side).map(d=>({nome:d.nome,
   comprimento:d.pts.slice(1).reduce((total,pt,j)=>total+dist(pt,d.pts[j]),0),
   raio:fingerRadius[d.nome]*k}));

 // Medida empírica do vão polegar/indicador com a própria FK do manequim.
 const opened={...p},pinched={...p};
 aplicarGesto(opened,side,"aberta");aplicarGesto(pinched,side,"pinca");
 const span=q=>{const f=juntasDedos(q,side);
   return dist(f[0].pts[3],f[1].pts[3])};
 return {comprimentoPalma:.96*k,larguraPalma:.74*k,espessuraPalma:.26*k,
   alcanceBraco:A.L1+A.L2,aberturaEstimada:.74*k,escala:k,
   aberturaPincaAberta:span(opened),aberturaPincaFechada:span(pinched),
   dedos:digits};
}
function guessStyle(o,site,metrics,preferred){
 if(preferred!=="auto")return preferred;
 if(o.tipo==="cadeira")return /^encosto/.test(site.id)?"gancho":"apoio";
 if(["copo","cilindro"].includes(o.tipo))return o.raio<metrics.larguraPalma*.5?"pinca":"potencia";
 if(/topo|assento/.test(site.id))return "apoio";
 if((o.larg||0)>metrics.larguraPalma*3)return "apoio";
 return "potencia";
}
function siteCandidates(o,ground,requested,side,cur,maxSites){
 const s=requested!=="auto"?[gripSiteWorld(o,requested,ground)]:
   gripSites(o).map(v=>gripSiteWorld(o,v.id,ground));
 return s.map(site=>({...site,proximidade:dist(site.mundo,cur.T),
    pontuacao:dist(site.mundo,cur.T)-.014*(site.prioridade||0)}))
    .sort((a,b)=>a.pontuacao-b.pontuacao||a.id.localeCompare(b.id))
    .slice(0,maxSites);
}
function surfaceSamples(site,o,ground,metrics){
 const n=norm(site.normal||[0,0,1]),seed=Math.abs(n[1])<.8?[0,1,0]:[1,0,0];
 const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
 const tangent=norm(cross(seed,n)),size=Math.min(.28,metrics.larguraPalma*.27);
 const frame=objectRigidPose(o,ground),direction=rigidDirection(frame,tangent);
 return [-1,1].map(sign=>({...site,
   mundo:add(site.mundo,direction,sign*size),
   amostra:{eixo:tangent,deslocamento:sign*size}}));
}
function wristAndArmFit(p,it,side,target,normal,ground,iteracoes){
 const clone={...it,params:p};
 const base=alinharPalmaV3(clone,side,target,ground);
 const L=side>0?"L":"R";
 const keys=["pron"+L,"wrist"+L,"wristDev"+L,"armRot"+L,
   "armAbd"+L,"armFlex"+L,"elbow"+L];
 const bounds={["pron"+L]:[-80,90],["wrist"+L]:[-70,80],
   ["wristDev"+L]:[-30,20],["armRot"+L]:[-70,90],
   ["armAbd"+L]:[-45,160],["armFlex"+L]:[-50,160],["elbow"+L]:[0,145]};
 const objective=()=>{
   const H=handFrameV3(clone,side,ground);
   const curlDirection=[H.M[0],H.M[3],H.M[6]].map(x=>x*side);
   // Curvatura: esquerda dobra no -X, direita dobra no +X.
   // Portanto o eixo lateral da palma precisa apontar para fora, normal do objeto.
   const normalError=1-clamp(dot(curlDirection,normal),-1,1);
   const pError=dist(H.T,target);
   return pError*4.5+normalError*.24;
 };
 let err=objective();
 for(const step of [24,15,8,4,2,1,.5,.25].slice(0,iteracoes)){
   for(let pass=0;pass<2;pass++){
     let improved=false;
     for(const k of keys){
       const original=p[k]??0;let best=original,bestErr=err;
       for(const d of [-step,step]){
         p[k]=clamp(original+d,bounds[k][0],bounds[k][1]);
         const score=objective();
         if(score<bestErr-1e-6){bestErr=score;best=p[k]}
       }
       p[k]=best;if(best!==original){err=bestErr;improved=true}
     }
     if(!improved)break;
   }
 }
 const H=handFrameV3(clone,side,ground);
 return {residual:dist(H.T,target),cost:err,baseResidual:base,frame:H};
}
function pointContacts(p,side,H,solids,metric){
 const scale=armDims(p).k*.95*p.armLen;
 const fingerRadii=[.09,.075,.078,.073,.064];
 const joints=juntasDedos(p,side);
 return joints.map((finger,i)=>{
   let best={distancia:Infinity,normal:[0,0,1],ponto:null,segmento:0};
   let worstPen=0;
   for(let j=1;j<finger.pts.length;j++){
     const v0=finger.pts[j-1],v1=finger.pts[j];
     // Aproximação rápida por SDF: polpas/pontas e centros de falange.
     for(const t of [.35,.75,1]){
       const local=v0.map((x,k)=>x+(v1[k]-x)*t);
       const world=rigidPoint(H,[local[0],local[1]+A.LH*.5,local[2]]);
       for(const solid of solids){
         const hit=pointSolid(world,solid.shape);
         const ds=hit.d-fingerRadii[i]*scale*(1-.10*(j-1));
         if(ds<best.distancia)best={distancia:ds,normal:hit.n,ponto:world,segmento:j};
         worstPen=Math.max(worstPen,-ds);
       }
     }
   }
   return {nome:NAMES[i],code:CODES[i],...best,penetracao:worstPen,
     contato:best.distancia<=metric.tolerancia&&best.distancia>=-metric.limitePenetracao};
 });
}
function fitFingers(p,side,H,solids,style,opt){
 const L=side>0?"L":"R";
 aplicarGesto(p,side,({pinca:"pinca",tripode:"pinca",gancho:"gancho",potencia:"segurar",
   lateral:"pinca",apoio:"aberta"})[style]||"segurar");
 const metrics={tolerancia:opt.tolerancia,limitePenetracao:opt.limitePenetracao};
 const keys=(code)=>["f"+code+L,"f"+code+"Mcp"+L,"f"+code+"Ip"+L];
 const target=(finger)=>style==="pinca"||style==="lateral"?["polegar","indicador"].includes(finger.nome):
   style==="tripode"?["polegar","indicador","médio"].includes(finger.nome):
   style==="gancho"?finger.nome!=="polegar":style==="apoio"?false:true;
 // Coordinate descent por dedo usa FK real mas SDF rápido; não precisa
 // gerar colliderRig completo em cada iteração.
 for(let i=0;i<5;i++){
   if(!target({nome:NAMES[i]}))continue;
   const vars=keys(CODES[i]);
   if(i===0)vars.push("thumbOpp"+L);
   for(const step of [.45,.3,.18,.1,.06,.035,.018,.009].slice(0,opt.maxIteracoes)){
     for(const k of vars){
       let best=p[k]??0,err=Infinity;
       const original=p[k]??0;
       for(const delta of [-step,0,step]){
         const lo=k.startsWith("thumbOpp")?0:-1,hi=1;
         p[k]=clamp(original+delta,lo,hi);
         const info=pointContacts(p,side,H,solids,metrics)[i];
         const distanceError=Math.abs(info.distancia-.02);
         const depth=Math.max(0,info.penetracao-opt.limitePenetracao);
         const value=distanceError+depth*12+Math.abs(p[k])*0.008;
         if(value<err){err=value;best=p[k]}
       }
       p[k]=best;
     }
   }
 }
 return pointContacts(p,side,H,solids,metrics);
}
function geometryCheck(p,side,o,ground,solids,opt,environment={}){
 const baseline=environment.selfBaseline||new Map();
 const geom=colliderRig({...p,wy:ground-restGround(p)},{level:"fine"});
 const letter=side>0?"E":"D";
 const ours=geom.caps.filter(c=>(c.kind==="finger"||c.kind==="palm")&&c.side===letter);
 const body=geom.caps.filter(c=>c.kind==="body");
 let maxHandPen=0,maxBodyPen=0,contactCount=0;
 const details=[];
 for(const c of ours){
   let best={distancia:Infinity,prof:0,kindA:c.kind,pa:c.nome};
   for(const solid of solids){
     if(!overlaps(capsuleBox(c),solid.box,opt.limitePenetracao))continue;
     const hit=capsuleSolidContact(c,solid.shape,solid.id);
     if(hit.distancia<best.distancia)best=hit;
   }
   maxHandPen=Math.max(maxHandPen,best.prof);
   if(best.distancia<=opt.tolerancia&&best.distancia>=-opt.limitePenetracao)contactCount++;
   details.push({parte:c.nome,segmento:c.segment??null,distancia:best.distancia,penetracao:best.prof});
 }
 // Corpo/antebraço NUNCA herdam a permissão de toque dos dedos.
 for(const c of body){
   for(const solid of solids){
     if(!overlaps(capsuleBox(c),solid.box,opt.limitePenetracao))continue;
     const hit=capsuleSolidContact(c,solid.shape,solid.id);
     maxBodyPen=Math.max(maxBodyPen,hit.prof);
   }
 }
 let maxObstaclePen=0,maxSelfNewPen=0,maxThirdPen=0;
 // Verifica o braço e a mão também contra móveis diferentes do objeto-alvo.
 const limb=geom.caps.filter(c=>c.kind==="finger"&&c.side===letter||
   c.kind==="palm"&&c.side===letter||
   c.kind==="body"&&(/^(?:braco|antebraco|cotovelo)/.test(c.nome))&&c.nome.endsWith(letter));
 for(const collider of environment.obstacles||[]){
   for(const c of limb){
     const box=capsuleBox(c);
     for(const solid of collider){
       if(!overlaps(box,solid.box,opt.limitePenetracao))continue;
       const hit=capsuleSolidContact(c,solid.shape,solid.id);
       maxObstaclePen=Math.max(maxObstaclePen,hit.prof);
     }
   }
 }
 // Outros manequins são obstáculos físicos, não pontos de apoio da pegada.
 for(const other of environment.actors||[]){
   const pairs=manifoldCaps(geom,other,{tol:0,max:160});
   for(const hit of pairs){
     const touching=limb.some(c=>c.id===hit.idA);
     if(touching)maxThirdPen=Math.max(maxThirdPen,hit.prof);
   }
 }
 const self=manifoldCaps(geom,geom,{tol:0,self:true,max:250});
 for(const hit of self){
   const key=[hit.pa,hit.pb].sort().join("|");
   const previous=baseline.get(key)||0;
   if(hit.prof>previous+.04)maxSelfNewPen=Math.max(maxSelfNewPen,hit.prof-previous);
 }
 return {maxHandPen,maxBodyPen,maxObstaclePen,maxThirdPen,maxSelfNewPen,contactCount,details};
}
function evaluate(it,o,side,site,ground,solids,opt,environment){
 const src=it.params,p={...src},clone={...it,params:p},s=side>0?"L":"R",A=armDims(p);
 const metrics=medirMao(p,side),style=guessStyle(o,site,metrics,opt.pegada);
 const objFrame=objectRigidPose(o,ground);
 const normal=norm(rigidDirection(objFrame,site.normal||[0,0,1]));
 // A mão é posicionada na superfície externa da região e não no interior
 // de uma caixa geométrica como a espessura do encosto da cadeira.
 const clearance=.27*A.k*p.armLen+(o.tipo==="cadeira"&&/^encosto/.test(site.id)?.18:0);
 const target=add(site.mundo,normal,clearance);
 const old=handFrameV3(it,side,ground);
 const distance=dist(old.T,site.mundo);
 if(distance>opt.reach)return hard("GripSite fora do alcance permitido: "+distance.toFixed(2)+" R.");
 if(dist(target,[p.wx??0,ground+8,p.wz??0])>metrics.alcanceBraco+9)
   return hard("Ponto fora do envelope aproximado de alcance do braço.");
 const fit=wristAndArmFit(p,it,side,target,normal,ground,opt.maxIteracoes);
 const contacts=fitFingers(p,side,fit.frame,solids,style,opt);
 const geometric=geometryCheck(p,side,o,ground,solids,opt,environment);
 const fingerCount=contacts.filter(c=>c.contato).length;
 const required=({pinca:2,tripode:3,gancho:2,potencia:2,lateral:2,apoio:0})[style];
 const thumbIndex=style==="pinca"||style==="lateral"||style==="tripode";
 const polegarIndicadorOpostos=!thumbIndex||(
   contacts[0].contato&&contacts[1].contato&&
   dot(contacts[0].normal,contacts[1].normal)<-.15);
 const support=style!=="apoio"||geometric.contactCount>0;
 const validFingers=!opt.exigirContato?true:
   (style==="apoio"?support:
     fingerCount>=required&&(!thumbIndex||polegarIndicadorOpostos));
 const maxPen=Math.max(geometric.maxHandPen,geometric.maxBodyPen,geometric.maxObstaclePen,geometric.maxThirdPen,geometric.maxSelfNewPen);
 const valid=maxPen<=opt.limitePenetracao&&fit.residual<=.38&&validFingers;
 const score=fit.cost+(style==="apoio"?.4:0)+Math.max(0,maxPen-opt.limitePenetracao)*15+
    (validFingers?0:2)+(distance*.015)+Math.max(0,fingerCount-3)*(-.02);
 const reasons=[];
 if(fit.residual>.38)reasons.push("Palma não alcança o alvo: "+fit.residual.toFixed(3)+" R");
 if(maxPen>opt.limitePenetracao)reasons.push("Interpenetração "+maxPen.toFixed(3)+" R acima de "+opt.limitePenetracao+" R");
 if(!validFingers)reasons.push("Contatos incompatíveis com "+style+": "+
   fingerCount+"/"+required+(thumbIndex&&!polegarIndicadorOpostos?
    " (polegar e indicador sem oposição de superfícies)":"")+
    (style==="apoio"?" (palma sem apoio válido)":""));
 return {ok:valid,objeto:o.nome||o.tipo,manequim:it.name,mao:side>0?"esquerda":"direita",
   lado:side,ponto:site.id,pegada:style,contatos:contacts,medidas:metrics,
   posicaoAlvo:target,posicaoRegiao:site.mundo,normal,normalLocal:site.normal||[0,0,1],
   amostra:site.amostra??null,distanciaInicial:distance,desvioPalma:fit.residual,
   penetracao:maxPen,contatosAtivos:fingerCount,geometria:geometric,score,
   ajustes:Object.fromEntries(Object.entries(p).filter(([k,v])=>
     (/^(?:arm|elbow|wrist|pron|handCurl|thumbOpp|fSpread|f(?:Th|In|Me|An|Mi))/.test(k))&&
     typeof v==="number"&&Math.abs(v-(src[k]??0))>1e-4)
     .map(([k,v])=>[k,{antes:src[k]??0,depois:v}])),
   avisos:reasons,params:p};
}
/* GripSite real, persistente, para o ponto escolhido numa amostra tangencial.
 * O ponto usado pelo vínculo e pela IK secundária passa a ser o ponto
 * otimizado, em vez de voltar silenciosamente ao centro do site original.
 * Modifica somente o objeto em contexto de commit transacional do editor.
 */
function registrarRegiaoAutoGrip(o,candidato,side,ground){
 if(!candidato?.amostra)return candidato.ponto;
 if(!Array.isArray(candidato.posicaoRegiao)||candidato.posicaoRegiao.length!==3||
   !candidato.posicaoRegiao.every(Number.isFinite))throw Error("Amostra de pegada inválida.");
 const local=rigidPoint(rigidInverse(objectRigidPose(o,ground)),candidato.posicaoRegiao);
 const normal=norm(candidato.normalLocal||[0,0,1]);
 const id="__autogrip_"+(side>0?"E":"D");
 const extras=(Array.isArray(o.sitesExtras)?o.sitesExtras:[])
   .filter(s=>s?.id!==id);
 if(extras.length>=30)throw Error("Máximo de 30 GripSites por objeto; exclua um ponto adicional.");
 o.sitesExtras=extras.concat({id,nome:"AutoGrip "+(side>0?"esquerda":"direita"),
   local,normal,prioridade:95});
 return id;
}
/* Revalidação geométrica de toda a cena após combinar mãos e criar o
 * attachment. A base de autocolisões é a pose anterior à operação.
 */
function validarCenaAutoGrip(it,o,ground,scene={},beforeParams=it.params,opt={},sides=[-1]){
 const baseline=colliderRig({...beforeParams,wy:ground-restGround(beforeParams)},{level:"fine"});
 const environment={obstacles:[],actors:[],selfBaseline:new Map()};
 for(const c of manifoldCaps(baseline,baseline,{tol:0,self:true,max:250})){
   const key=[c.pa,c.pb].sort().join("|");
   environment.selfBaseline.set(key,Math.max(environment.selfBaseline.get(key)||0,c.prof));
 }
 for(const other of scene.manequins||[]){
   if(other.id===it.id)continue;
   environment.actors.push(colliderRig({...other.params,
     wy:ground-restGround(other.params)},{level:"fine"}));
 }
 for(const object of scene.objetos||[]){
   if(object.id===o.id||object.sobre===o.id)continue;
   environment.obstacles.push(colliderObject(object,ground));
 }
 const solids=colliderObject(o,ground);
 const porMao=sides.map(side=>({mao:side>0?"esquerda":"direita",
   ...geometryCheck(it.params,side,o,ground,solids,opt,environment)}));
 const maxPenetracao=Math.max(0,...porMao.map(m=>Math.max(
   m.maxHandPen,m.maxBodyPen,m.maxObstaclePen,m.maxThirdPen,m.maxSelfNewPen)));
 return {ok:maxPenetracao<=(opt.limitePenetracao??.06),
   maxPenetracao,porMao};
}
/* Verificação DISCRETA de uma aproximação de pose articulada.
 * Interpola parâmetros das articulações, não desloca o objeto nem o rig.
 * NÃO é CCD nem gera uma animação fisicamente plausível.
 */
function validarAproximacaoAutoGrip(it,o,ground,initial,goal,scene={},opt={}){
 const passes=opt.passosTrajetoria??5,threshold=opt.limitePenetracao??.06;
 if(!Number.isInteger(passes)||passes<3||passes>8)
   throw Error("passosTrajetoria deve ser inteiro entre 3 e 8.");
 const from={...initial},dest={...goal},baseline=colliderRig(
   {...from,wy:ground-restGround(from)},{level:"fine"});
 const environment={obstacles:[],actors:[],selfBaseline:new Map()};
 for(const hit of manifoldCaps(baseline,baseline,{tol:0,self:true,max:250})){
   const key=[hit.pa,hit.pb].sort().join("|");
   environment.selfBaseline.set(key,Math.max(environment.selfBaseline.get(key)||0,hit.prof));
 }
 for(const other of scene.manequins||[]){
   if(other.id===it.id)continue;
   environment.actors.push(colliderRig({...other.params,
     wy:ground-restGround(other.params)},{level:"fine"}));
 }
 for(const obstacle of scene.objetos||[]){
   if(obstacle.id===o.id||obstacle.sobre===o.id)continue;
   environment.obstacles.push(colliderObject(obstacle,ground));
 }
 const sides=opt.mao==="ambas"?[1,-1]:
   opt.mao==="esquerda"?[1]:opt.mao==="direita"?[-1]:[-1,1];
 const keys=new Set(Object.keys(from).concat(Object.keys(dest)).filter(k=>
   /^(?:arm|elbow|wrist|pron|handCurl|thumbOpp|fSpread|f(?:Th|In|Me|An|Mi))/.test(k)&&
   Number.isFinite(from[k])&&Number.isFinite(dest[k])));
 const solids=colliderObject(o,ground);
 for(let i=1;i<=passes;i++){
   const t=i/passes,p={...from};
   for(const k of keys)p[k]=from[k]+(dest[k]-from[k])*t;
   for(const side of sides){
     const q=geometryCheck(p,side,o,ground,solids,opt,environment);
     const pen=Math.max(q.maxHandPen,q.maxBodyPen,q.maxObstaclePen,
       q.maxThirdPen,q.maxSelfNewPen);
     if(pen>threshold)return {livre:false,passo:i,total:passes,fracao:t,
       mao:side>0?"esquerda":"direita",penetracao:pen,
       motivo:"Colisão no percurso articulado até a pegada."};
   }
 }
 return {livre:true,passos:passes,metodo:"interpolacao_articular_discreta",
   aviso:"Checagem aproximada; não detecta todas as colisões entre amostras."};
}
function planejarAutoGrip(it,o,ground,opts={},scene={}){
 if(!it||!o||!it.params)throw Error("Manequim ou objeto inválido no planejamento.");
 const opt=validarOpcoes(opts);
 if(o.gripV3||o.grip)throw Error("Objeto já está segurado; solte antes de autoencaixar.");
 const environment={obstacles:[],actors:[],selfBaseline:new Map()};
 const baseline=colliderRig({...it.params,wy:ground-restGround(it.params)},{level:"fine"});
 for(const c of manifoldCaps(baseline,baseline,{tol:0,self:true,max:250})){
   const key=[c.pa,c.pb].sort().join("|");
   environment.selfBaseline.set(key,Math.max(environment.selfBaseline.get(key)||0,c.prof));
 }
 for(const other of scene.manequins||[]){
   if(other.id===it.id)continue;
   try{environment.actors.push(colliderRig({...other.params,
     wy:ground-restGround(other.params)},{level:"fine"}))}catch(e){/* rig ausente */}
 }
 for(const obstacle of scene.objetos||[]){
   if(obstacle.id===o.id||obstacle.sobre===o.id)continue;
   try{environment.obstacles.push(colliderObject(obstacle,ground))}catch(e){/* objeto ainda não carregado */}
 }
 const solids=colliderObject(o,ground);
 if(!solids.length)throw Error("Objeto sem geometria sólida para contato.");
 const sides=opt.mao==="ambas"?[1,-1]:
   opt.mao==="auto"?[-1,1]:[SIDE[opt.mao]];
 const raw=[],failures=[],started=Date.now();
 const candidatesBySide=sides.map(side=>{
   const frame=handFrameV3(it,side,ground);
   return {side,sites:siteCandidates(o,ground,opt.ponto,side,frame,opt.maxSites)};
 });
 let limitReached=false;
 const test=(side,site,style=null)=>{
   if(Date.now()-started>=opt.maxTempoMs){limitReached=true;return}
   try{
     const result=evaluate(it,o,side,site,ground,solids,style?{...opt,pegada:style}:opt,environment);
     if(result.ok)raw.push(result);
     else failures.push({mao:side>0?"esquerda":"direita",ponto:site.id,
       score:result.score??null,motivo:result.avisos?.join("; ")||result.motivo});
   }catch(e){failures.push({mao:side>0?"esquerda":"direita",ponto:site.id,motivo:e.message})}
 };
 // Primeiro testar os GripSites nomeados e priorizados.
 for(const {side,sites} of candidatesBySide){
   for(const site of sites){test(side,site);if(limitReached)break}
   if(limitReached)break;
 }
 // Se falhar, procurar amostras na superfície próxima ao GripSite.
 if(!raw.length&&!limitReached){
   for(const {side,sites} of candidatesBySide){
     const metric=medirMao(it.params,side);
     for(const site of sites.slice(0,Math.min(3,opt.maxSites))){
       for(const sample of surfaceSamples(site,o,ground,metric)){
         test(side,sample);if(limitReached)break;
       }
       if(limitReached)break;
     }
     if(limitReached)break;
   }
 }
 // Se o tipo foi AUTO, variar também a estratégia de dedos e palma.
 // Não transformar uma pegada rígida impossível em sucesso só pelo nome.
 if(opt.pegada==="auto"&&!raw.length&&!limitReached){
   const styles=o.tipo==="cadeira"?["gancho","potencia","apoio"]:
     ["pinca","tripode","potencia","gancho","apoio"];
   for(const {side,sites} of candidatesBySide){
     for(const site of sites.slice(0,Math.min(2,opt.maxSites))){
       const defaultStyle=guessStyle(o,site,medirMao(it.params,side),"auto");
       for(const style of styles){
         if(style===defaultStyle)continue;
         test(side,site,style);if(limitReached)break;
       }
       if(limitReached)break;
     }
     if(limitReached)break;
   }
 }
 raw.sort((a,b)=>a.score-b.score||a.ponto.localeCompare(b.ponto));
 let chosen=raw[0];
 if(opt.mao==="ambas"){
   // Não selecionar cegamente a melhor mão de cada lado: as duas podem
   // pedir a mesma região, ou palmas que se interpenetram.
   const left=raw.filter(q=>q.lado===1),right=raw.filter(q=>q.lado===-1);
   let pair=null,bestCost=Infinity;
   for(const a of right)for(const b of left){
     if(a.ponto===b.ponto)continue;
     const gap=dist(a.posicaoAlvo,b.posicaoAlvo);
     const clearance=Math.max(.36,.48*(a.medidas.larguraPalma+b.medidas.larguraPalma));
     if(gap<clearance)continue;
     const cost=a.score+b.score+Math.max(0,1-gap)*.15;
     if(cost<bestCost){bestCost=cost;pair=[a,b]}
   }
   chosen=pair?{...pair[0],secundaria:pair[1],score:bestCost}:null;
   if(!chosen)failures.push({mao:"ambas",ponto:"auto",
     motivo:"Duas regiões distintas e sem sobreposição palmar não foram encontradas."});
 }
 if(chosen&&opt.verificarTrajetoria){
   const proposals=opt.mao==="ambas"?[chosen]:raw.slice(0,3);
   chosen=null;
   for(const candidate of proposals){
     const pose={...candidate.params};
     if(candidate.secundaria){
       const suffix=candidate.secundaria.lado>0?"L":"R";
       for(const [k,v] of Object.entries(candidate.secundaria.params))
         if(k.endsWith(suffix)&&/^(?:arm|elbow|wrist|pron|handCurl|thumbOpp|fSpread|f(?:Th|In|Me|An|Mi))/.test(k))
           pose[k]=v;
     }
     const route=validarAproximacaoAutoGrip(it,o,ground,it.params,pose,scene,
       {...opt,mao:candidate.secundaria?"ambas":candidate.mao});
     if(route.livre){chosen={...candidate,trajetoria:route};break}
     failures.push({mao:route.mao,ponto:candidate.ponto,motivo:route.motivo+
       " Passo "+route.passo+"/"+route.total+
       ", penetração "+route.penetracao.toFixed(3)+" R."});
   }
 }
 return {ok:!!chosen,status:chosen?"planejado":"inviavel",
   melhor:chosen||null,candidatos:raw.map(x=>({mao:x.mao,ponto:x.ponto,pegada:x.pegada,
     score:x.score,contatos:x.contatosAtivos,desvio:x.desvioPalma,penetracao:x.penetracao})),
   rejeitados:failures.slice(0,20),opcoes:opt,avaliados:raw.length+failures.length,
   limiteTempoAtingido:limitReached,
   limitacoes:["Geometria de caixas/cilindros e colisores aproximados.",
     "A validação considera a pose final; trajetória contínua e força de agarre não são resolvidas."]};
}
/* Verifica deslocamento horizontal em pontos intermediários (amostragem
 * conservadora). Função pura: não altera objeto, dono, filhos ou objetos da cena.
 * Retorno detalhado pode ser registrado nos testes e na API de diagnóstico.
 */
function verificarMicroDeslocamentoAutoGrip(o,shift,ground,scene={},owner,{passo=.06,tolerancia=.03}={}){
 if(!owner?.params||!o||![shift?.dx,shift?.dz].every(Number.isFinite))
   throw Error("Microdeslocamento exige objeto, manequim e deslocamento finito.");
 const obstructions=(scene.objetos||[]).filter(q=>q.id!==o.id);
 const otherRigs=(scene.manequins||[]).filter(m=>m.id!==owner.id)
   .map(m=>colliderRig({...m.params,wy:ground-restGround(m.params)},{level:"coarse"}));
 const ownerTorso=colliderRig({...owner.params,wy:ground-restGround(owner.params)},{level:"coarse"});
 const protectedCaps=ownerTorso.caps.filter(c=>!/^(mao|antebraco|braco|cotovelo)/.test(c.nome));
 const bodies=[...otherRigs.map(r=>r.caps),protectedCaps];
 const divisions=Math.max(4,Math.ceil(Math.hypot(shift.dx,shift.dz)/passo));
 for(let step=1;step<=divisions;step++){
   const alpha=step/divisions;
   const intermediate={...o,x:o.x+shift.dx*alpha,z:o.z+shift.dz*alpha};
   const collision=obstructions.find(q=>colisaoEntreObjetos(intermediate,q,ground,tolerancia).length);
   if(collision)return {livre:false,tipo:"objeto",bloqueador:collision.nome||collision.tipo,
     passo:step,total:divisions,motivo:"Trajetória atravessa o objeto "+(collision.nome||collision.tipo)+"."};
   const solids=colliderObject(intermediate,ground);
   for(let i=0;i<bodies.length;i++)for(const c of bodies[i]){
     const box=capsuleBox(c);
     for(const solid of solids){
       if(!overlaps(box,solid.box,tolerancia))continue;
       const hit=capsuleSolidContact(c,solid.shape,solid.id);
       if(hit.prof>tolerancia)
         return {livre:false,tipo:"manequim",bloqueador:i<otherRigs.length?
             (scene.manequins||[]).filter(m=>m.id!==owner.id)[i].name:owner.name,
           passo:step,total:divisions,penetracao:hit.prof,
           motivo:"Trajetória atravessa um manequim."};
     }
   }
 }
 return {livre:true,passos:divisions,distancia:Math.hypot(shift.dx,shift.dz)};
}
/* Microajuste opcional, conservador e somente horizontal. Não movimenta
 * objeto de fato no planejamento; testa cópias deslocadas em X/Z.
 * Rejeita objetos apoiados, segurados, com filhos ou em colisão com móveis.
 * Não equivale a uma solução 6DOF nem a planejador de caminho contínuo.
 */
function planejarAutoGripComAjuste(it,o,ground,opts={},scene={}){
 const opt=validarOpcoes(opts),since=Date.now();
 const baseOptions={...opt,permitirMoverObjeto:false,preservarObjeto:true,
   maxTempoMs:opt.permitirMoverObjeto?Math.max(200,Math.round(opt.maxTempoMs*.5)):opt.maxTempoMs};
 const initial=planejarAutoGrip(it,o,ground,baseOptions,scene);
 initial.opcoes=opt;
 if(initial.ok||!opt.permitirMoverObjeto)return initial;
 const real=(scene.objetos||[]).find(q=>q.id===o.id)||o;
 if(real.gripV3||real.grip||o.sobre||scene.objetos?.some(q=>q.sobre===o.id))
   throw Error("Microajuste não pode mover objeto segurado, apoiado ou com filhos.");
 if(o.dinamica?.ativo)throw Error("Interrompa a queda antes de microajustar um objeto.");
 const trials=[
   [1,0],[-1,0],[0,1],[0,-1],
   [.7,.7],[.7,-.7],[-.7,.7],[-.7,-.7]
 ];
 const rejected=[],fallback=[];
 const deadline=since+opt.maxTempoMs;
 for(const [dx,dz] of trials){
   const rem=deadline-Date.now();if(rem<200)break;
   const shift={dx:dx*opt.maxDeslocamento,dz:dz*opt.maxDeslocamento};
   if(Math.abs(o.x+shift.dx)>40||Math.abs(o.z+shift.dz)>40)continue;
   const verificacao=verificarMicroDeslocamentoAutoGrip(o,shift,ground,scene,it);
   if(!verificacao.livre){
     rejected.push({deslocamento:shift,motivo:verificacao.motivo,
       bloqueador:verificacao.bloqueador,passo:verificacao.passo});continue;
   }
   const moved={...o,x:o.x+shift.dx,z:o.z+shift.dz};
   const outcome=planejarAutoGrip(it,moved,ground,{
     ...baseOptions,maxSites:Math.min(baseOptions.maxSites,3),
     maxTempoMs:Math.max(200,Math.min(550,rem))
   },scene);
   if(outcome.ok){
     const p=outcome.melhor;
     const penalty=Math.hypot(shift.dx,shift.dz)*.3;
     fallback.push({...outcome,melhor:{...p,ajusteObjeto:shift,score:p.score+penalty}});
   }else rejected.push({deslocamento:shift,motivo:outcome.rejeitados?.[0]?.motivo||"Sem pegada viável."});
 }
 if(!fallback.length){
   initial.rejeitados.push(...rejected.slice(0,6));
   return initial;
 }
 fallback.sort((a,b)=>a.melhor.score-b.melhor.score);
 const selected=fallback[0];
 selected.opcoes=opt;
 selected.avaliados+=initial.avaliados;
 selected.limitacoes.push("Microajuste X/Z com amostras intermediárias discretas; não é detecção contínua exata (CCD).");
 return selected;
}
function resumirAutoGrip(result){
 if(!result.ok)return {status:"inviavel",avaliados:result.avaliados,
   rejeitados:result.rejeitados,limitacoes:result.limitacoes,
   limiteTempoAtingido:result.limiteTempoAtingido};
 const q=result.melhor;
 const format=v=>({mao:v.mao,ponto:v.ponto,pegada:v.pegada,
   score:+v.score.toFixed(4),desvioPalma:+v.desvioPalma.toFixed(4),
   penetracao:+v.penetracao.toFixed(4),contatosAtivos:v.contatosAtivos,
   ajustes:v.ajustes,ajusteObjeto:v.ajusteObjeto??null,
   trajetoria:v.trajetoria??null,
   dedos:v.contatos.map(f=>({dedo:f.nome,contato:f.contato,
     distancia:Number.isFinite(f.distancia)?+f.distancia.toFixed(4):null}))});
 return {status:"planejado",avaliados:result.avaliados,
   escolha:format(q),segunda:q.secundaria?format(q.secundaria):null,
   alternativas:result.candidatos,limitacoes:result.limitacoes,
   limiteTempoAtingido:result.limiteTempoAtingido};
}
/** Checagem final após o vínculo Grip V3, especialmente após IK secundário.
 * É independente da aproximação SDF usada na busca dos dedos.
 */
function validarContatoAutoGrip(it,o,side,ground,{limitePenetracao=.06,tolerancia=.055}={}){
 const geom=colliderRig({...it.params,wy:ground-restGround(it.params)},{level:"fine"});
 const solids=colliderObject(o,ground),label=side>0?"E":"D";
 const caps=geom.caps.filter(c=>(c.kind==="palm"||c.kind==="finger")&&c.side===label);
 let maxPenetracao=0,palmaContato=false,contatos=0;
 const dedos={polegar:false,indicador:false,"médio":false,anelar:false,"mínimo":false};
 const pontosDedo={};
 for(const cap of caps){
   let best=null;
   for(const solid of solids){
     if(!overlaps(capsuleBox(cap),solid.box,tolerancia))continue;
     const hit=capsuleSolidContact(cap,solid.shape,solid.id);
     if(!best||hit.distancia<best.distancia)best=hit;
   }
   if(!best)continue;
   maxPenetracao=Math.max(maxPenetracao,Math.max(0,-best.distancia));
   if(best.distancia<=tolerancia&&best.distancia>=-limitePenetracao){
     contatos++;
     if(cap.kind==="palm")palmaContato=true;
     if(cap.finger&&Object.prototype.hasOwnProperty.call(dedos,cap.finger)){
       dedos[cap.finger]=true;
       const previous=pontosDedo[cap.finger];
       // Guardar o contato melhor (mais próximo da superfície) por dedo.
       if(!previous||Math.abs(best.distancia)<Math.abs(previous.distancia)){
         pontosDedo[cap.finger]={normal:best.n.slice(),
           distancia:best.distancia,segmento:cap.segment??null};
       }
     }
   }
 }
 const th=pontosDedo.polegar,ind=pontosDedo.indicador;
 const oposicaoPinça=!!(th&&ind&&dot(th.normal,ind.normal)<-.15);
 return {ok:maxPenetracao<=limitePenetracao,maxPenetracao,
   palmaContato,contatos,contatosPorDedo:dedos,pontosDedo,oposicaoPinça};
}

return {planejarAutoGrip,planejarAutoGripComAjuste,resumirAutoGrip,medirMao,validarOpcoes,validarContatoAutoGrip,validarCenaAutoGrip,registrarRegiaoAutoGrip,verificarMicroDeslocamentoAutoGrip,validarAproximacaoAutoGrip};
})();
export {planejarAutoGrip,planejarAutoGripComAjuste,resumirAutoGrip,medirMao,validarOpcoes,validarContatoAutoGrip,validarCenaAutoGrip,registrarRegiaoAutoGrip,verificarMicroDeslocamentoAutoGrip,validarAproximacaoAutoGrip};
