/* GeoMannequin — API de comandos em português: cena, camera, tema e cada manequim */
import { CAMK, P, SCN, addInst, delInst, dupInst, instColors, mixHex, nextHue, setColor, setP } from "./modelo.js";
import { applyParams, num } from "./parametros.js";
import { BODIES, BPOSES, doBodyPose, guardArms } from "./poses.js";
import { autoFit, setZoomEff } from "./enquadrar.js";
import { L, setMode, setPreset } from "./modos.js";
import { updateModeButtons } from "./ambiente.js";
import { THEMES, applyTheme } from "./tema.js";
import { cenaCamadasSvg, fotoSvg, listaCamadas } from "./camadas-cena.js";
import { D, DEF, PRESETS, clamp, distToZoom, restGround, zoomToDist } from "../engine/index.js";

/* roda uma ação com o manequim como ativo (as funções de pose usam P) */
function withInst(it,fn){const prevP=P;setP(it.params);try{return fn()}finally{setP(prevP)}}
const LOG=[];
function apiFor(it){
  const chk=()=>{if(!SCN.list.includes(it))throw new Error("Este manequim foi removido da cena.");return it};
  const m={
    get nome(){return it.name},
    renomear(n){chk();it.name=String(n).slice(0,24);return m},
    posicao(x,z){chk();it.params.wx=clamp(num(x,"x"),-30,30);if(z!==undefined)it.params.wz=clamp(num(z,"z"),-30,30);return m},
    mover(dx,dz){chk();return m.posicao(it.params.wx+num(dx,"dx"),it.params.wz+num(dz||0,"dz"))},
    girar(g){chk();let a=num(g,"graus");a=((a+180)%360+360)%360-180;it.params.wRot=a;return m},
    pose(o){chk();if(typeof o==="string")return m.poseRapida(o);applyParams(it,o,true).forEach(t=>LOG.push(["aviso",t]));withInst(it,guardArms);return m},
    poseRapida(nome){chk();const k=String(nome).toLowerCase();const ok=Object.keys(BPOSES).concat(["cintura","cruzar","ombro"]);
      if(!ok.includes(k))throw new Error("Pose rápida desconhecida: “"+nome+"”. Opções: "+ok.join(", ")+".");withInst(it,()=>doBodyPose(k));return m},
    corpo(o){chk();if(typeof o==="string"){const k=o.toLowerCase();if(!BODIES[k])throw new Error("Tipo corporal desconhecido: “"+o+"”. Opções: "+Object.keys(BODIES).join(", ")+".");
        ["shW","neck"].forEach(q=>it.params[q]=DEF[q]);Object.assign(it.params,BODIES[k]);return m}
      applyParams(it,o,false).forEach(t=>LOG.push(["aviso",t]));return m},
    cor(fill,ink){chk();if(fill===undefined){it.col=null;it.hue=it===SCN.list[0]?null:nextHue(it);return m}setColor(it,fill,ink===undefined?mixHex(fill,"#000000",0.7):ink);return m},
    copiar(){chk();return apiFor(dupInst(it,true))},
    remover(){chk();delInst(it);return null},
    ativar(){chk();SCN.active=SCN.list.indexOf(it);setP(it.params);return m},
    info(){chk();const c=instColors(it);return {nome:it.name,x:it.params.wx,z:it.params.wz,giro:it.params.wRot,preenchimento:c.fill,contorno:c.ink,congelado:!!it.congelado,oculto:!!it.oculto,ordem:it.ordem||0}},
    /* camadas: congelado vira foto fixa (não é refeito, nem quando a câmera muda); oculto sai da cena; ordem manual na pilha */
    congelar(on){chk();it.congelado=on!==false&&on!==0;return m},
    descongelar(){chk();it.congelado=false;return m},
    ocultar(on){chk();const v=on!==false&&on!==0;if(v&&SCN.list.filter(o=>!o.oculto&&o!==it).length===0)throw new Error("Pelo menos um manequim precisa ficar visível.");it.oculto=v;return m},
    mostrar(){chk();it.oculto=false;return m},
    frente(){chk();it.ordem=Math.min(99,Math.max(0,...SCN.list.filter(o=>o!==it).map(o=>o.ordem||0))+1);return m},
    tras(){chk();it.ordem=Math.max(-99,Math.min(0,...SCN.list.filter(o=>o!==it).map(o=>o.ordem||0))-1);return m},
    ordemAuto(){chk();it.ordem=0;return m},
    foto(opts){chk();return fotoSvg(SCN.list.indexOf(it),opts)}
  };
  return m;
}
const cena={
  adicionar(o){const it=addInst(null,o&&o.nome,true);const m=apiFor(it);if(o){if(o.x!==undefined||o.z!==undefined)m.posicao(o.x??it.params.wx,o.z??0);if(o.giro!==undefined)m.girar(o.giro);if(o.corpo)m.corpo(o.corpo);if(o.pose)m.pose(o.pose);if(o.cor)m.cor(o.cor,o.contorno)}return m},
  copiar(m){const it=m?SCN.list.find(x=>x.name===m.nome):SCN.list[SCN.active];if(!it)throw new Error("Manequim não encontrado.");return apiFor(dupInst(it,true))},
  remover(m){const it=typeof m==="string"?SCN.list.find(x=>x.name===m):SCN.list.find(x=>x.name===(m&&m.nome));if(!it)throw new Error("Manequim não encontrado.");delInst(it)},
  limpar(){const cam={};CAMK.forEach(k=>cam[k]=P[k]);SCN.list.splice(1);SCN.active=0;setP(SCN.list[0].params);Object.assign(P,cam);return apiFor(SCN.list[0])},
  lista(){return SCN.list.map(apiFor)},
  obter(q){const it=typeof q==="number"?SCN.list[q]:SCN.list.find(x=>x.name===q);if(!it)throw new Error("Manequim “"+q+"” não existe.");return apiFor(it)},
  get ativo(){return apiFor(SCN.list[SCN.active])},
  get total(){return SCN.list.length},
  enquadrar(){autoFit()},
  horizonte(on){L.horizon=on!==false&&on!==0;setMode(null);updateModeButtons()},
  sombras(on){L.shadow=on!==false&&on!==0;setMode(null);updateModeButtons()},
  atmosfera(x){P.atmo=clamp(num(x===undefined?0.4:x,"atmosfera"),0,1)},
  /* modo de desenho: "manequim", "construcao" ou "ecorche" (anatomia limpa, como pranchas de Bridgman/Loomis) */
  modo(nome){const n=String(nome||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace("construção","construcao");
    if(!PRESETS[n])throw new Error("Modo desconhecido: use \"manequim\", \"construcao\" ou \"ecorche\".");setPreset(n)},
  fibras(on){L.fibras=on!==false&&on!==0;setMode(null);updateModeButtons()},
  /* cena em camadas (padrão) ou exata (todos num z-buffer comum, mais lento) */
  exato(on){SCN.exato=on!==false&&on!==0},
  camadas(){return listaCamadas()},
  exportarCamadas(opts){return cenaCamadasSvg(opts)}
};
function camSet(k,v,min,max,nome){P[k]=clamp(num(v,nome),min,max)}
const camera={
  /* posição da câmera em relação ao alvo: define direção, distância e zoom */
  posicao(x,y,z){num(x,"x");num(y,"y");num(z,"z");
    const dx=x-P.tx,dy=y-P.ty,dz=z-P.tz,d=Math.hypot(dx,dy,dz);if(d<0.5)throw new Error("A câmera está colada no alvo; afaste-a.");
    P.yaw=Math.round(-Math.atan2(dx,dz)/D*10)/10;P.pitch=clamp(Math.round(-Math.atan2(dy,Math.hypot(dx,dz))/D*10)/10,-70,70);P.roll=0;
    P.camDist=clamp(d,4,200);P.zoom=clamp(6.2/d,0.05,3);P.panX=0;P.panY=0;return camera},
  mirar(x,y,z){camSet("tx",x,-30,30,"x");camSet("ty",y,-20,20,"y");camSet("tz",z,-30,30,"z");P.panX=0;P.panY=0;return camera},
  girar(yaw,pitch,roll){camSet("yaw",yaw,-180,180,"yaw");if(pitch!==undefined)camSet("pitch",pitch,-70,70,"pitch");if(roll!==undefined)camSet("roll",roll,-45,45,"roll");return camera},
  zoom(z){setZoomEff(num(z,"zoom"));return camera},
  perspectiva(on,dist){P.persp=on===false||on===0?0:1;if(dist!==undefined)camSet("camDist",dist,4,200,"distância");return camera},
  distancia(d){camSet("camDist",d,4,200,"distância");return camera},
  /* lente em mm: 18–35 grande-angular (perspectiva forte), 50 normal, 85–200 tele (achata). Mantém o tamanho do alvo na tela. */
  lente(mm,manterTamanho){const z=distToZoom(P);camSet("lens",mm,18,200,"lente");if(manterTamanho!==false)P.camDist=clamp(zoomToDist(P,z),4,200);return camera},
  /* altura dos olhos (da câmera) acima do chão, em R; mantém distância e alvo */
  /* olhos da câmera a h R do chão. Sem inclinação (padrão) o horizonte fica exatamente na altura h em todos os manequins. */
  alturaOlhos(h,inclinacao){num(h,"altura");const g0=restGround(SCN.list[0].params),pt=inclinacao===undefined?0:clamp(num(inclinacao,"inclinação"),-70,70);
    P.pitch=pt;P.ty=clamp(g0+h+Math.sin(pt*D)*Math.max(3,P.camDist),-20,20);return camera},
  luz(az,el){camSet("lightAz",az,-180,180,"azimute");if(el!==undefined)camSet("lightEl",el,10,80,"elevação");return camera},
  enquadrar(){autoFit();return camera}
};
function tema(n){const i=THEMES.findIndex(t=>t[0]===String(n).toLowerCase());if(i<0)throw new Error("Tema desconhecido: use 'claro', 'escuro' ou 'sistema'.");applyTheme(i)}

export { withInst, LOG, apiFor, cena, camSet, camera, tema };
