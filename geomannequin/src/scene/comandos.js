/* GeoMannequin — API de comandos em português: cena, camera, tema e cada manequim */
import { CAMK, WORLDK, P, SCN, UIH, addInst, delInst, dupInst, instColors, mixHex, nextHue, setColor, setP, corObjeto, atualizarApoios } from "./modelo.js";
import { aplicarBiotipo, transitarSexo, NOMES_BIOTIPOS } from "./biotipos.js";
import { applyParams, num, POSEKEYS, ALIAS, SLK } from "./parametros.js";
import { adicionarObjeto, duplicarObjeto, acharObjeto, apontarPara, deitar, editarObjeto, encostarEm, maoEm, olharPara, orientar, peEm, removerObjeto, sentar, subirEm } from "./cenario.js";
import { descreverCena, montarCena } from "./descrever.js";
import {lerRoteiro,executarRoteiro,renderizarQuadro,paginaQuadros,folhaDeContato} from "./quadros.js";
import { loadScene, sceneState, applyState } from "./estado.js";
import { leituraBlocking, moverCamera, abrirCone, zoomLente, zoomFator } from "./blocking.js";
import { EXPRESSOES, BODIES, BPOSES, doBodyPose, guardArms, limitesAcoplados, nomePose, todasPoses } from "./poses.js";
import { autoFit, setZoomEff } from "./enquadrar.js";
import { VISTAS_8, azimutesGiro, orbitarCamera, passoOrbita, pivoCamera, resolverAlvo, vistaAtual, verOrientadaCamera, seguirOrientacaoCamera, pararSeguimentoCamera, estadoSeguimentoCamera } from "./orbita.js";
import {orientacaoAlvo,encontrarAlvoOrientacao} from "./orientacao-frames.js";
import {regioesDisponiveisOrbita} from "./regioes-orbita.js";
import { L, setMode, setPreset } from "./modos.js";
import {STYLES,styleName,setStyleName,setPAL_EXPORT} from "./paletas.js";
import {LAY,SL} from "./parametros.js";
import { updateModeButtons } from "./ambiente.js";
import { THEMES, applyTheme } from "./tema.js";
import { cenaCamadasSvg, fotoSvg, listaCamadas, arquivosCamadas } from "./camadas-cena.js";
import {setContatoV2,consultarContatosV2,limitarPropostaV2,CONTATO_V2} from "./contato-v2.js";
import {beginGrip,releaseGrip,getHandAnchor} from "./preensao-v2.js";
import {beginRigidGrip,releaseRigidGrip,inspectRigidGrip,handFrameV3,pousarObjetoRigido,alinharPalmaV3} from "./grip-v3.js";
import {gripSites,gripSiteWorld} from "../engine/grip-sites.js";
import {objectRigidPose,setRigidObjectPose} from "../engine/rigid-transform.js";
import {rotM} from "../engine/matematica.js";
import {tocarV2} from "./toque-v2.js";
import { COL, pMundo, colisoesDaCena, desfazerColisao, listaColisoes, permitirContato, resolverPar, resolverTodas, setModoColisao, setPreferir, composicaoDaCena, ajustarComposicao, setComposicao } from "./colisoes.js";
import { D, DEF, PRESETS, TIPOS_OBJETO, ehCilindro, faixaLente, ossosDoCorpo, paraMundo, effScale, H, W, CX, CY, apoiarContatos, autoColisoes, cameraNoMundo, aplicarGesto, clamp, distToZoom, restGround, zoomToDist, criarZip, shape, watertightMeshV3,meshTopologyV3,exportObjV3,watertightMeshV4,meshTopologyV4,exportObjV4,buildHeadStudySvg } from "../engine/index.js";

/* roda uma ação com o manequim como ativo (as funções de pose usam P) */
function guardarContatoV2(it,antes){
  if(CONTATO_V2.enabled&&(COL.modo==="bloquear"||COL.modo==="corrigir"))limitarPropostaV2(it,antes);
}
function withInst(it,fn){const prevP=P;setP(it.params);try{return fn()}finally{setP(prevP)}}
const LOG=[];
const HIST_COMANDOS={undo:[],redo:[],max:30};
function apiFor(it){
  const chk=()=>{if(!SCN.list.includes(it))throw new Error("Este manequim foi removido da cena.");return it};
  const m={
    get nome(){return it.name},
    renomear(n){chk();it.name=String(n).slice(0,24);return m},
    orientacao(referencia="tronco"){chk();return orientacaoAlvo({tipo:"manequim",id:it.id},referencia)},
    parametro(chave,valor){
      chk();const k=ALIAS[chave]||chave,d=SLK[k];
      if(!d||CAMK.includes(k)||WORLDK.includes(k))throw Error("Parâmetro do manequim desconhecido: "+chave);
      if(valor===undefined)return it.params[k];
      const before={...it.params};applyParams(it,{[k]:valor},POSEKEYS.has(k));
      if(POSEKEYS.has(k))withInst(it,guardArms);
      guardarContatoV2(it,before);return m;
    },
    parametros(){chk();return Object.fromEntries(SL.filter(q=>!CAMK.includes(q.k)&&!WORLDK.includes(q.k)).map(q=>[q.k,it.params[q.k]]))},
    exportarOBJ(opts={}){chk();return cena.exportarOBJ({...opts,alvo:it.name})},
    cabeca(modelo){chk();const v=String(modelo||"").toLowerCase();if(!["v1","v2","v3","v3_microgeometry","v4","v4_anatomical"].includes(v))throw new Error("Modelo da cabeça: use v1, v2, v3 ou v4.");it.params.headModel=v==="v3"?"v3_microgeometry":v==="v4"?"v4_anatomical":v;return m},
    posicao(x,z){chk();const antes={...it.params};it.params.wx=clamp(num(x,"x"),-30,30);if(z!==undefined)it.params.wz=clamp(num(z,"z"),-30,30);guardarContatoV2(it,antes);return m},
    mover(dx,dz){chk();return m.posicao(it.params.wx+num(dx,"dx"),it.params.wz+num(dz||0,"dz"))},
    girar(g){chk();const antes={...it.params};let a=num(g,"graus");a=((a+180)%360+360)%360-180;it.params.wRot=a;guardarContatoV2(it,antes);return m},
    pose(o,opts){chk();if(typeof o==="string")return m.poseRapida(o,opts);const antes={...it.params};applyParams(it,o,true).forEach(t=>LOG.push(["aviso",t]));limitesAcoplados(it.params).forEach(t=>LOG.push(["aviso",t]));withInst(it,guardArms);guardarContatoV2(it,antes);return m},
    poseRapida(nome,opts){chk();const antes={...it.params},k=nomePose(nome);const ok=todasPoses();
      if(!ok.includes(k))throw new Error("Pose rápida desconhecida: “"+nome+"”. Opções: "+ok.join(", ")+".");withInst(it,()=>doBodyPose(k,opts));guardarContatoV2(it,antes);return m},
    corpo(o){chk();if(typeof o==="string"){
        const k=o.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
        const part=k.match(/^(masculino|feminino)[\s_-]+(magro|medio|atletico|musculoso|cheio)$/);
        const tipo=part?part[2]:k,sexo=part?(part[1]==="feminino"?1:0):it.params.fem;
        if(!NOMES_BIOTIPOS.includes(tipo))throw new Error("Tipo corporal desconhecido: “"+o+"”. Opções: "+NOMES_BIOTIPOS.join(", ")+", ou 'feminino medio'.");
        aplicarBiotipo(it.params,tipo,sexo);return m
      }
      /* Troca de sexo recalibra o mesmo perfil, preservando correções manuais. */
      if(o&&typeof o==="object"&&(o.feminino!==undefined||o.fem!==undefined)){
        const sexo=o.feminino!==undefined?o.feminino:o.fem;
        if(typeof sexo!=="number"||!Number.isFinite(sexo))throw new Error("feminino/fem deve ser numérico (0 a 1).");
        transitarSexo(it.params,sexo);
        const resto={...o};delete resto.feminino;delete resto.fem;
        if(Object.keys(resto).length)applyParams(it,resto,false).forEach(t=>LOG.push(["aviso",t]));
      }else applyParams(it,o,false).forEach(t=>LOG.push(["aviso",t]));
      return m},
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
    foto(opts){chk();return fotoSvg(SCN.list.indexOf(it),opts)},
    /* ===== corpo inteiro no espaço ===== */
    orientar(alvo){chk();orientar(it,alvo);return m},
    deitar(tipo,eixo){chk();deitar(it,tipo,eixo);return m},
    saltar(alt){chk();withInst(it,()=>doBodyPose("saltando"));if(alt!==undefined)it.params.bodyLift=clamp(num(alt,"altura"),0,30);return m},
    altura(y){chk();it.params.bodyLift=clamp(num(y,"altura"),-2,30);return m},
    inclinar(graus,rolar){chk();it.params.bodyPitch=clamp(num(graus,"graus"),-180,180);if(rolar!==undefined)it.params.bodyRoll=clamp(num(rolar,"rolar"),-180,180);return m},
    /* perfil de flexibilidade: "normal" (clínico), "atleta", "ginasta" (ponte, espacate), "contorcionista" */
    flexibilidade(n){chk();applyParams(it,{flex:n},false).forEach(t=>LOG.push(["aviso",t]));limitesAcoplados(it.params).forEach(t=>LOG.push(["aviso",t]));return m},
    /* apoio em vários pontos: m.apoiar("maos pes") — ponte, parada de mão, prancha, quatro apoios */
    apoiar(q,opts){chk();apoiarContatos(it.params,q===undefined?"maos pes":q,opts).forEach(t=>LOG.push(["aviso",t]));return m},
    apoio(on){chk();it.params.ground=on===false||on===0?0:1;return m},
    sentar(obj){chk();const q=sentar(it,obj);return m},
    subir(obj){chk();subirEm(it,obj);return m},
    encostar(obj){chk();encostarEm(it,obj);return m},
    olhar(alvo){chk();olharPara(it,alvo);return m},
    olharPara(alvo){chk();olharPara(it,alvo);return m},
    maoEm(lado,ponto){chk();const antes={...it.params};const e=maoEm(it,ladoNum(lado),pontoMundo(ponto));if(e>0.4)LOG.push(["aviso","a mão não alcança o ponto (faltam "+Math.round(e*11.4)+" cm)"]);guardarContatoV2(it,antes);return m},
    maoEmSite(ref,ponto,{mao="direita"}={}){
      chk();const o=acharObjeto(ref);if(!o)throw Error("Objeto não encontrado.");
      atualizarApoios();const ground=restGround(SCN.list[0].params);
      const site=gripSiteWorld(o,ponto,ground),before={...it.params};
      const residual=alinharPalmaV3(it,ladoNum(mao),site.mundo,ground);
      guardarContatoV2(it,before);
      return {objeto:o.nome||o.tipo,ponto:site.id,distanciaResidual:residual,
        alcançou:residual<=.3,mao};
    },
    peEm(lado,ponto){chk();peEm(it,ladoNum(lado),pontoMundo(ponto));return m},
    apontar(alvo,lado){chk();apontarPara(it,alvo,lado===undefined?-1:ladoNum(lado));return m},
    /* ===== mãos ===== */
    gesto(lado,nome){chk();const antes={...it.params};if(nome===undefined){nome=lado;lado="ambas"}ladosDe(lado).forEach(t=>aplicarGesto(it.params,t,String(nome).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")));guardarContatoV2(it,antes);return m},
    dedos(lado,o){chk();const antes={...it.params};const D_={polegar:"Th",indicador:"In",medio:"Me","médio":"Me",anelar:"An",minimo:"Mi","mínimo":"Mi"};
      ladosDe(lado).forEach(t=>{const L_=t>0?"L":"R";for(const [k,v] of Object.entries(o||{})){const kk=k.toLowerCase();
        if(D_[kk])it.params["f"+D_[kk]+L_]=clamp(num(v,k),-1,1);else if(kk==="mao"||kk==="mão"||kk==="fechar")it.params["handCurl"+L_]=clamp(num(v,k),0,1);
        else if(kk==="afastar"||kk==="abrir")it.params["fSpread"+L_]=clamp(num(v,k),0,1);else if(kk==="opor"||kk==="oposicao"||kk==="oposição")it.params["thumbOpp"+L_]=clamp(num(v,k),0,1);
        else throw new Error("Dedo desconhecido: “"+k+"”. Use polegar, indicador, medio, anelar, minimo, mao, afastar, opor.")}});guardarContatoV2(it,antes);return m},
    /* ===== Contato anatômico V2 ===== */
    contatosDetalhados(opts){chk();return consultarContatosV2(opts).filter(c=>c.a===it.id||c.b===it.id)},
    tocar(alvo,opts={}){chk();const r=tocarV2(it,alvo,opts);if(r.distanciaResidual>.3)LOG.push(["aviso","A mão não alcança precisamente o alvo."]);return r},
    segurar(ref,opts={}){chk();const o=acharObjeto(ref);if(!o)throw Error("Objeto não encontrado: "+ref);
      cena.segurarObjeto(o.id,{...opts,manequim:SCN.list.indexOf(it)});return m},
    soltar(ref,opts={}){chk();const targets=ref===undefined?SCN.objetos.filter(o=>o.grip?.mannequinId===it.id||o.gripV3?.mannequinId===it.id):[acharObjeto(ref)];
      let ok=false;const ground=restGround(SCN.list[0].params);
      atualizarApoios();
      for(const o of targets){if(o?.gripV3?.mannequinId===it.id){releaseRigidGrip(it,o,ground,opts);ok=true}
        else if(o?.grip?.mannequinId===it.id){releaseGrip(o);ok=true}}
      if(!ok)throw Error("Nenhum objeto encontrado segurado por este manequim.");
      atualizarApoios();return m},
    objetosSegurados(){chk();return SCN.objetos.filter(o=>o.grip?.mannequinId===it.id||o.gripV3?.mannequinId===it.id).map(o=>o.nome||o.tipo)},
    /* ===== articulações pelo nome: m.articulacao("cotovelo esquerdo", {dobrar: 90}) ===== */
    /* confere a pose: partes do corpo atravessando umas às outras (não vizinhas, mais de 0,5 R) e limites acoplados que corrigiriam algo */
    validarPose(opts){chk();const tol=opts&&opts.tolerancia!==undefined?num(opts.tolerancia,"tolerância"):0.5,a=autoColisoes(pMundo(it),tol),l=limitesAcoplados(Object.assign({},it.params));
      return {ok:!a.length&&!l.length,atravessa:a.map(x=>({partes:[x.a,x.b],profundidade:x.prof})),limites:l}},
    articulacao(nome,valores){chk();const antes={...it.params},r=articParams(nome,valores);applyParams(it,r,true).forEach(t=>LOG.push(["aviso",t]));limitesAcoplados(it.params).forEach(t=>LOG.push(["aviso",t]));withInst(it,guardArms);guardarContatoV2(it,antes);return m},
    espelhar(){chk();espelharPose(it.params);return m},
    /* rosto: m.expressao("alegria" | "surpresa" | "raiva" | "tristeza" | "medo" | "grito" | "sono" | "desconfianca" | "piscando" | "neutra") */
    expressao(nome){chk();const k=String(nome||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");const e=EXPRESSOES[k];if(!e)throw new Error("Expressão: use "+Object.keys(EXPRESSOES).join(", ")+".");Object.assign(it.params,e);if(k==="piscando")it.params.eyeLid=0;return m},
    /* olhos para um lado sem mexer a cabeça: m.olhos(x, y) de −1 a 1 (x + = esquerda do manequim, y + = cima) */
    olhos(x,y){chk();it.params.eyeYaw=clamp(num(x,"x"),-1,1);if(y!==undefined)it.params.eyePitch=clamp(num(y,"y"),-1,1);return m},
    /* boca: m.boca(abrir 0–1, sorriso −1 a 1) */
    boca(abrir,sorriso){chk();it.params.jawOpen=clamp(num(abrir,"abrir"),0,1);if(sorriso!==undefined)it.params.smile=clamp(num(sorriso,"sorriso"),-1,1);return m},
    copiarPose(outro){chk();const o=typeof outro==="object"&&outro?SCN.list.find(x=>x.name===outro.nome):SCN.list.find(x=>x.name===outro);if(!o)throw new Error("Manequim “"+outro+"” não existe.");
      POSEKEYS.forEach(k=>{if(o.params[k]!==undefined)it.params[k]=o.params[k]});return m},
    /* colisão: deixa encostar neste outro manequim sem contar como erro (abraço, aperto de mão) */
    permitirContato(outro,on){chk();const o=typeof outro==="object"&&outro?SCN.list.find(x=>x.name===outro.nome):typeof outro==="number"?SCN.list[outro]:SCN.list.find(x=>x.name===outro);
      if(!o)throw new Error("Manequim “"+outro+"” não existe.");permitirContato(SCN.list.indexOf(it),SCN.list.indexOf(o),on);return m},
    /* corrige as colisões deste manequim com os outros (só ele muda): "auto" | "distancia" | "giro" | "pose" */
    resolverColisoes(metodo){chk();const r=[];SCN.list.forEach((o,j)=>{if(o===it)return;const a=SCN.list.indexOf(it);
      if(colisoesDaCena().some(c=>(c.a===a&&c.b===j)||(c.a===j&&c.b===a)))r.push(...resolverPar(Math.min(a,j),Math.max(a,j),metodo,a<j?"a":"b"))});r.forEach(t=>LOG.push(["aviso",t]));return m}
  };
  return m;
}
/* lado: "esq"/"esquerda"/1 ou "dir"/"direita"/−1; "ambas" para as duas mãos */
function ladoNum(l){const t=String(l===undefined?"dir":l).toLowerCase();if(l===1||/^esq|^l$|left/.test(t))return 1;if(l===-1||/^dir|^r$|right/.test(t))return -1;throw new Error("Lado: use \"esquerda\" ou \"direita\".")}
function ladosDe(l){const t=String(l===undefined?"ambas":l).toLowerCase();return /amba|dois|duas|both/.test(t)?[1,-1]:[ladoNum(l)]}
/* ponto do mundo: [x, y, z], {x, y, z}, ou o nome de um manequim/objeto (vai até o centro dele) */
function pontoMundo(q){if(Array.isArray(q))return q.map((v,i)=>num(v,"xyz"[i]));if(q&&typeof q==="object"&&"x" in q)return [num(q.x,"x"),num(q.y??6,"y"),num(q.z??0,"z")];
  const o=SCN.list.find(x=>x.name===q);if(o)return [o.params.wx,restGround(SCN.list[0].params)+4.5,o.params.wz];const b=acharObjeto(q);if(b)return [b.x,restGround(SCN.list[0].params)+b.alt,b.z];
  throw new Error("Ponto: use [x, y, z] ou o nome de um manequim/objeto.")}
/* articulações por nome em português e o que cada movimento muda */
const ARTIC={cotovelo:{dobrar:"elbow",girar:"pron",virar:"pron"},ombro:{frente:"armFlex",abrir:"armAbd",girar:"armRot",subir:"shElev",avancar:"shProt"},braco:{frente:"armFlex",abrir:"armAbd",girar:"armRot"},
  punho:{dobrar:"wrist",desvio:"wristDev",girar:"pron"},mao:{fechar:"handCurl"},quadril:{frente:"hipFlex",abrir:"hipAbd",girar:"hipRot"},coxa:{frente:"hipFlex",abrir:"hipAbd",girar:"hipRot"},
  joelho:{dobrar:"kneeFlex"},tornozelo:{apontar:"ankleFlex",dobrar:"ankleFlex",virar:"ankleTilt",dedos:"toes"},pe:{apontar:"ankleFlex",virar:"ankleTilt",dedos:"toes"},
  coluna:{frente:"spineFlex",lado:"spineSide",girar:"spineTwist"},lombar:{frente:"lumFlex",lado:"lumSide",girar:"lumTwist"},toracica:{frente:"thoFlex",lado:"thoSide",girar:"thoTwist"},
  pescoco:{frente:"neckFlex",lado:"neckSide",girar:"neckTwist"},cabeca:{baixar:"headPitch",frente:"headPitch",girar:"headYaw",inclinar:"headRoll",lado:"headRoll"},
  pelve:{inclinar:"pelvisTilt",frente:"pelvisTilt",lado:"pelvisSide",girar:"pelvisTwist"},corpo:{inclinar:"bodyPitch",rolar:"bodyRoll",altura:"bodyLift"},
  /* dedos da mão: fechar = o dedo inteiro; base = MCF; ponta = IFP + IFD (polegar: IF); afastar = abdução daquele dedo */
  polegar:{fechar:"fTh",base:"fThMcp",mcf:"fThMcp",ponta:"fThIp",if:"fThIp",afastar:"fThAbd",abrir:"fThAbd",opor:"thumbOpp"},
  indicador:{fechar:"fIn",base:"fInMcp",mcf:"fInMcp",ponta:"fInIp",ifp:"fInIp",afastar:"fInAbd"},medio:{fechar:"fMe",base:"fMeMcp",mcf:"fMeMcp",ponta:"fMeIp",ifp:"fMeIp",afastar:"fMeAbd"},
  anelar:{fechar:"fAn",base:"fAnMcp",mcf:"fAnMcp",ponta:"fAnIp",ifp:"fAnIp",afastar:"fAnAbd"},minimo:{fechar:"fMi",base:"fMiMcp",mcf:"fMiMcp",ponta:"fMiIp",ifp:"fMiIp",afastar:"fMiAbd"},
  dedos:{afastar:"fSpread",fechar:"handCurl"},dedao:{dobrar:"hallux",levantar:"hallux"},canela:{girar:"tibiaRot"},
  escapula:{subir:"shElev",avancar:"shProt",girar:"scapRot",tensao:"shTens"},
  mandibula:{abrir:"jawOpen",lado:"jawSide"},boca:{abrir:"jawOpen",sorrir:"smile",lado:"jawSide"},olhos:{lado:"eyeYaw",girar:"eyeYaw",cima:"eyePitch",subir:"eyePitch",fechar:"eyeLid"},
  sobrancelhas:{subir:"browUp",levantar:"browUp",franzir:"browIn"}};
ARTIC.pe.aduzir="footAdd";ARTIC.pe.girar="footAdd";ARTIC.pe.dedao="hallux";ARTIC.tornozelo.dedao="hallux";ARTIC.joelho.girar="tibiaRot";
const LADO_ART=new Set(["cotovelo","ombro","braco","punho","mao","quadril","coxa","joelho","tornozelo","pe","polegar","indicador","medio","anelar","minimo","dedos","dedao","canela","escapula"]);
function articParams(nome,valores){
  const t=String(nome||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/([a-z])(esq|dir)\b/,"$1 $2").trim();
  const base=Object.keys(ARTIC).sort((a,b)=>b.length-a.length).find(k=>t===k||t.startsWith(k+" "));if(!base)throw new Error("Articulação desconhecida: “"+nome+"”. Opções: "+Object.keys(ARTIC).join(", ")+".");
  let suf="";if(LADO_ART.has(base)){if(/esq/.test(t))suf="L";else if(/dir/.test(t))suf="R";else throw new Error("Diga o lado: “"+base+" esquerdo” ou “"+base+" direito”.")}
  const r={};for(const [k,v] of Object.entries(valores||{})){const kk=k.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");const q=ARTIC[base][kk];
    if(!q)throw new Error("“"+k+"” não move "+base+". Use: "+Object.keys(ARTIC[base]).join(", ")+".");r[q+suf]=v}
  return r;
}
/* espelha a pose (esquerda ↔ direita) */
function espelharPose(Q){
  const par={};Object.keys(Q).forEach(k=>{const m=/^(.*)([LR])$/.exec(k);if(m&&POSEKEYS.has(k))par[k]=m[1]+(m[2]==="L"?"R":"L")});
  const c=Object.assign({},Q);Object.entries(par).forEach(([a,b])=>{Q[a]=c[b]});
  ["spineSide","spineTwist","headYaw","headRoll","pelvisSide","pelvisTwist","neckSide","neckTwist","lumSide","lumTwist","thoSide","thoTwist","bodyRoll","jawSide","eyeYaw"].forEach(k=>{if(typeof Q[k]==="number")Q[k]=-Q[k]});
}
/* objeto da cena: caixas (banco, cadeira, caixa, cubo, degrau, mesa, cama, parede) e cilindros (cilindro, copo, coluna, barril, mesa redonda) */
function apiObjeto(q){
  const chk=()=>{if(!SCN.objetos.includes(q))throw new Error("Este objeto foi removido da cena.")};
  const o={get nome(){return q.nome||TIPOS_OBJETO[q.tipo].nome},get tipo(){return q.tipo},get id(){return q.id},
    posicao(x,z){chk();editarObjeto(q,{x:num(x,"x"),z:z===undefined?q.z:num(z,"z")});return o},
    mover(dx,dz){chk();return o.posicao(q.x+num(dx,"dx"),q.z+num(dz||0,"dz"))},
    girar(g){chk();editarObjeto(q,{giro:((num(g,"graus")%360)+540)%360-180});return o},
    posicao3D(x,y,z){
      chk();if(q.gripV3)throw Error("Objeto segurado: mova a mão para transportá-lo.");
      const ground=restGround(SCN.list[0].params),frame=objectRigidPose(q,ground);
      if(![x,y,z].every(Number.isFinite))throw Error("A posição 3D exige três números finitos.");
      if(q.sobre)delete q.sobre;delete q.sobreRel;
      setRigidObjectPose(q,{M:frame.M,T:[x,y,z]},ground);q.emAr=true;return o;
    },
    rotacao3D(yaw,pitch=0,roll=0){
      chk();if(q.gripV3)throw Error("Objeto segurado: gire a mão, não a cadeira.");
      const a=[yaw,pitch,roll].map((v,i)=>num(v,["yaw","pitch","roll"][i]));
      const ground=restGround(SCN.list[0].params),frame=objectRigidPose(q,ground);
      if(q.sobre)delete q.sobre;delete q.sobreRel;
      setRigidObjectPose(q,{M:rotM(...a.map(v=>v*Math.PI/180)),T:frame.T},ground);
      q.emAr=true;return o;
    },
    pose3D(){chk();atualizarApoios();const v=objectRigidPose(q,restGround(SCN.list[0].params));
      return {posicao:v.T,matriz:v.M,giro:q.giro,emAr:!!q.emAr};
    },
    criarPontoAgarre(id,local,normal=[0,0,1]){
      chk();if(typeof id!=="string"||!id.trim()||id.length>40||
        !Array.isArray(local)||local.length!==3||!local.every(Number.isFinite)||
        !Array.isArray(normal)||normal.length!==3||!normal.every(Number.isFinite)||Math.hypot(...normal)<1e-6)
        throw Error("Ponto: nome, [x,y,z] e normal com três números válidos.");
      if(gripSites(q).some(s=>s.id===id))throw Error("Ponto de agarre duplicado: "+id);
      if(!Array.isArray(q.sitesExtras))q.sitesExtras=[];
      q.sitesExtras.push({id,nome:id,local:local.slice(),normal:normal.slice()});return o;
    },
    parametro(chave,valor){
      chk();if(valor===undefined)return q[chave];
      const permitidos=new Set(["x","z","giro","larg","prof","alt","raio","encosto","cabeceira"]);
      if(!permitidos.has(chave))throw Error("Parâmetro de objeto desconhecido ou somente leitura: "+chave);
      editarObjeto(q,{[chave]:num(valor,chave)});return o;
    },
    orientacao(config){
      chk();if(config===undefined)return orientacaoAlvo({tipo:"objeto",id:q.id},"objeto");
      if(!config||typeof config!=="object")throw Error("Orientação: objeto {frenteLocal:[x,y,z],cimaLocal:[x,y,z]}.");
      const f=config.frenteLocal??config.frente,up=config.cimaLocal??config.cima??[0,1,0];
      if(!Array.isArray(f)||!Array.isArray(up)||f.length!==3||up.length!==3||
        !f.every(Number.isFinite)||!up.every(Number.isFinite)||Math.hypot(...f)<1e-6)
        throw Error("Os eixos do objeto devem conter três números finitos (frente não nula).");
      const length=Math.hypot(...f),uLength=Math.hypot(...up);
      if(uLength<1e-6||!Number.isFinite(uLength))throw Error("O eixo cimaLocal deve ser não nulo.");
      const dot=f.reduce((s,x,i)=>s+x*up[i],0)/(length*uLength);
      if(Math.abs(dot)>.99999)throw Error("frenteLocal e cimaLocal precisam ser independentes.");
      const prevF=q.frenteLocal,prevU=q.cimaLocal;
      try{q.frenteLocal=f.slice();q.cimaLocal=up.slice();orientacaoAlvo({tipo:"objeto",id:q.id},"objeto")}
      catch(e){if(prevF===undefined)delete q.frenteLocal;else q.frenteLocal=prevF;
        if(prevU===undefined)delete q.cimaLocal;else q.cimaLocal=prevU;throw e}
      return o;
    },
    pontosDeAgarre(){chk();atualizarApoios();return gripSites(q).map(s=>gripSiteWorld(q,s.id,restGround(SCN.list[0].params)))},
    pontoDeAgarre(id){chk();atualizarApoios();return gripSiteWorld(q,id,restGround(SCN.list[0].params))},
    emPosseDe(){chk();atualizarApoios();const g=q.gripV3||q.grip;if(!g)return null;
      const owner=SCN.list.find(m=>m.id===g.mannequinId);
      return {manequim:owner?.name||null,mao:g.side===1?"esquerda":"direita",
        versao:q.gripV3?3:1,ponto:q.gripV3?.siteId||null,
        segundaMao:q.gripV3?.secundaria?(q.gripV3.secundaria.side===1?"esquerda":"direita"):null}},
    segurarPor(manequim,opts={}){chk();cena.segurarObjeto(q.id,{manequim:typeof manequim==="object"?manequim.nome:manequim,...opts});return o},
    soltar(opts={}){chk();cena.soltarObjeto(q.id,opts);return o},
    pousar({endireitar=false}={}){chk();if(q.gripV3||q.grip)
        throw Error("Solte o objeto antes de pousá-lo diretamente.");
      atualizarApoios();
      pousarObjetoRigido(q,restGround(SCN.list[0].params),{endireitar});
      atualizarApoios();return o},
    medidas(m){chk();editarObjeto(q,m||{});return o},
    /* cor exclusiva: "#RRGGBB" (não pode repetir a de outro objeto ou manequim) ou "auto" */
    cor(c,contorno){chk();editarObjeto(q,{cor:c===undefined?"auto":c,contorno});return o},
    /* em cima de outro objeto (nome, tipo ou objeto); null = no chão; "auto" = o tampo embaixo dele */
    sobre(ref){chk();const r=ref&&typeof ref==="object"&&ref.id?ref.id:ref;editarObjeto(q,{sobre:r===undefined?null:r});
      if(q.sobre&&ref!=="auto"){const s=SCN.objetos.find(x=>x.id===q.sobre);editarObjeto(q,{x:s.x,z:s.z})}return o},
    renomear(n){chk();q.nome=String(n).slice(0,24);return o},
    duplicar(){chk();return apiObjeto(duplicarObjeto(q))},
    selecionar(){chk();SCN.objSel=q.id;return o},
    remover(){chk();removerObjeto(q);if(SCN.objSel===q.id)SCN.objSel=null;return null},
    info(){chk();atualizarApoios();const s=q.sobre?SCN.objetos.find(x=>x.id===q.sobre):null,c=corObjeto(q,true);
      return Object.assign({tipo:q.tipo,nome:q.nome||TIPOS_OBJETO[q.tipo].nome,forma:ehCilindro(q)?"cilindro":"caixa",x:q.x,z:q.z,giro:q.giro||0},ehCilindro(q)?{raio:q.raio}:{largura:q.larg,profundidade:q.prof},
        {altura:q.alt,base:q.base||0,topo:(q.base||0)+q.alt,sobre:s?(s.nome||TIPOS_OBJETO[s.tipo].nome):null,cor:q.col?q.col.fill:c.fill,corAutomatica:!q.col})}};
  return o;
}
/* blocking por código: cena.blocking() lê a composição (em metros); os métodos mexem no painel da página */
function painelQd(acao,arg){const h=UIH.quadros;if(!h)return {aviso:"Sem página: o roteiro de quadros só existe no app (no MCP use a ferramenta roteiro_quadros)."};return h[acao](arg)}
function painelBlk(acao,arg){const h=UIH.blocking;if(!h)return {aviso:"Sem página: o painel de blocking só existe no app."};return h[acao](arg)}
function blockingApi(){const d=leituraBlocking(),m=v=>Math.round(v*0.114*100)/100,C=d.camera;
  return {camera:{posicao:C.pos.map((v,i)=>m(i===1?v-d.chao:v)),alvo:C.alvo.map((v,i)=>m(i===1?v-d.chao:v)),lente:Math.round(C.lente),campoGraus:Math.round(C.fovH),perspectiva:C.persp},
    camera_faixa:C.persp?faixaLente(C.lente):"sem perspectiva",manequins:d.manequins.map(q=>({nome:q.nome,x:m(q.x),z:m(q.z),giro:q.giro,profundidade:m(q.foto.prof),naFoto:Math.round(q.foto.frac*100),dentro:q.foto.dentro,inteiro:q.foto.inteiro,cor:q.cor.fill})),
    objetos:d.objetos.map(o=>Object.assign({nome:o.nome,tipo:o.tipo,forma:o.forma,x:m(o.x),z:m(o.z),giro:o.giro,altura:m(o.alt),base:m(o.base),cor:o.cor.fill,sobre:o.sobre?(d.objetos.find(q=>q.id===o.sobre)||{}).nome||null:null},o.forma==="cilindro"?{raio:m(o.raio)}:{largura:m(o.larg),profundidade:m(o.prof)})),
    colisoes:listaColisoes().map(c=>c.descricao)}}
Object.assign(blockingApi,{abrir:()=>painelBlk("abrir"),fechar:()=>painelBlk("fechar"),destacar:q=>painelBlk("destacar",q),flutuar:()=>painelBlk("flutuar"),devolver:q=>painelBlk("devolver",q),
  recolher:on=>painelBlk("recolher",on),lateral:mo=>painelBlk("lateral",mo),inserir:t=>painelBlk("inserir",t),estado:()=>painelBlk("estado")});
const cena={
  adicionar(o){const it=addInst(null,o&&o.nome,true);const m=apiFor(it);if(o){if(o.x!==undefined||o.z!==undefined)m.posicao(o.x??it.params.wx,o.z??0);if(o.giro!==undefined)m.girar(o.giro);if(o.corpo)m.corpo(o.corpo);if(o.pose)m.pose(o.pose);if(o.cor)m.cor(o.cor,o.contorno)}return m},
  copiar(m){const it=m?SCN.list.find(x=>x.name===m.nome):SCN.list[SCN.active];if(!it)throw new Error("Manequim não encontrado.");return apiFor(dupInst(it,true))},
  remover(m){const it=typeof m==="string"?SCN.list.find(x=>x.name===m):SCN.list.find(x=>x.name===(m&&m.nome));if(!it)throw new Error("Manequim não encontrado.");delInst(it)},
  limpar(){const cam={};CAMK.forEach(k=>cam[k]=P[k]);SCN.list.splice(1);SCN.active=0;setP(SCN.list[0].params);Object.assign(P,cam);return apiFor(SCN.list[0])},
  lista(){return SCN.list.map(apiFor)},
  obter(q){const it=typeof q==="number"?SCN.list[q]:SCN.list.find(x=>x.name===q);if(!it)throw new Error("Manequim “"+q+"” não existe.");return apiFor(it)},
  get ativo(){return apiFor(SCN.list[SCN.active])},
  /* roteiro de quadros (na página): cena.quadros.abrir(), .texto("#quadro 1 …"), .renderizar(), .fila(), .baixar() */
  quadros:{
    abrir:()=>painelQd("abrir"),fechar:()=>painelQd("fechar"),texto:t=>painelQd("texto",t),
    renderizar:()=>painelQd("renderizar"),fila:()=>painelQd("fila"),baixar:()=>painelQd("baixar"),
    duplicar:i=>painelQd("duplicar",i),remover:i=>painelQd("remover",i),
    mover:(de,para)=>painelQd("mover",{de,para}),comparar:(i,j)=>painelQd("comparar",{i,j}),
    renderizarUm:i=>painelQd("renderizarUm",i),cancelar:()=>painelQd("cancelar"),
    pagina:()=>painelQd("pagina")
  },
  /* Roteiro/gerador também funciona sem navegador: mantém o motor unificado. */
  lerRoteiro(texto){return lerRoteiro(String(texto))},
  executarRoteiro(texto,opts){return executarRoteiro(String(texto),opts)},
  renderizarQuadros(texto,opts={}){return executarRoteiro(String(texto)).quadros.map(q=>renderizarQuadro(q,opts))},
  paginasDeRoteiro(texto,opts={}){
    const fs=executarRoteiro(String(texto)).quadros.map(q=>{const f=renderizarQuadro(q,{passes:false});return {...f,falas:q.falas}});
    return paginaQuadros(fs,opts);
  },
  folhaDeContato(texto,opts={}){
    const fs=executarRoteiro(String(texto)).quadros.map(q=>({...renderizarQuadro(q,{passes:false}),titulo:q.titulo}));
    return folhaDeContato(fs,opts.colunas||4);
  },
  /* estado completo da cena (posições, poses, objetos, câmera) e voltar a ele — o roteiro de quadros usa para "gravar" um ajuste feito no palco */
  estado(){return JSON.parse(JSON.stringify(sceneState()))},
  restaurar(e){if(!e||!e.list)throw new Error("restaurar: passe o objeto devolvido por cena.estado().");loadScene(JSON.parse(JSON.stringify(e)));return apiFor(SCN.list[SCN.active])},
  get total(){return SCN.list.length},
  enquadrar(){autoFit()},
  horizonte(on){L.horizon=on!==false&&on!==0;setMode(null);updateModeButtons()},
  /* guias das arestas dos objetos até os pontos de fuga deles (aparecem com o horizonte ligado) */
  pontosDeFugaObjetos(on){L.pfObjetos=on!==false&&on!==0;if(L.pfObjetos)L.horizon=true;setMode(null);updateModeButtons()},
  sombras(on){L.shadow=on!==false&&on!==0;setMode(null);updateModeButtons()},
  atmosfera(x){P.atmo=clamp(num(x===undefined?0.4:x,"atmosfera"),0,1)},
  /* modo de desenho: "manequim", "construcao" ou "ecorche" (anatomia limpa, como pranchas de Bridgman/Loomis) */
  modo(nome){const n=String(nome||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace("construção","construcao");
    if(!PRESETS[n])throw new Error("Modo desconhecido: use \"manequim\", \"construcao\" ou \"ecorche\".");setPreset(n)},
  /* linhas atrás do corpo: 0 = escondidas, 1 = tracejado forte (padrão do modo construção: 0,16) */
  linhasOcultas(x){const v=clamp(num(x===undefined?0.16:x,"opacidade"),0,1);L.ocultas=v;L.hidden=v>0.01?1:0;setMode(null);updateModeButtons()},
  /* rosto: "completo", "minimo" (só a cruz de construção, estilo Loomis) ou "liso" */
  rosto(modo){const t=String(modo||"completo").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if(/^comp/.test(t))Object.assign(L,{feat:1,eyes:1,merid:1});else if(/^min/.test(t))Object.assign(L,{feat:0,eyes:0,merid:1,rings:1});else if(/^lis/.test(t))Object.assign(L,{feat:0,eyes:0,merid:0});
    else throw new Error("Rosto: use \"completo\", \"minimo\" ou \"liso\".");setMode(null);updateModeButtons()},
  fibras(on){L.fibras=on!==false&&on!==0;setMode(null);updateModeButtons()},
  /* cena em camadas (padrão) ou exata (todos num z-buffer comum, mais lento) */
  exato(on){SCN.exato=on!==false&&on!==0},
  /* Controle programático de cada camada da interface, sem acoplar ao DOM. */
  camadaVisual(nome,valor){
    const k=String(nome||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    const item=LAY.find(q=>q.k.toLowerCase()===k||q.label.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()===k);
    if(!item)throw Error("Camada visual desconhecida: "+nome+". Consulte cena.camadasVisuais().");
    if(valor===undefined)return !!L[item.k];
    L[item.k]=valor!==false&&valor!==0;setMode(null);return !!L[item.k];
  },
  camadasVisuais(){return LAY.map(x=>({chave:x.k,nome:x.label,ativo:!!L[x.k]}))},
  estilos(){return Object.keys(STYLES)},
  estiloAtual(){return styleName},
  estilo(nome){
    if(nome===undefined)return styleName;
    const k=String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
    if(!STYLES[k])throw Error("Estilo desconhecido: "+nome+". Escolha: "+Object.keys(STYLES).join(", "));
    setStyleName(k);setPAL_EXPORT(STYLES[k]);
    if(typeof document!=="undefined"&&typeof document.querySelectorAll==="function"){
      const e=document.getElementById("svg");
      if(e&&e.style){
        const vars={cobalt:"--g-blue",coral:"--g-red",ink:"--m-ink",fill:"--fill",shade1:"--shade1",shade2:"--shade2",shade3:"--shade3"};
        for(const [c,v]of Object.entries(vars)){
          if(k==="creme")e.style.removeProperty(v);else e.style.setProperty(v,STYLES[k][c]);
        }
      }
      document.querySelectorAll("[data-style]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.style===k)));
    }
    return k;
  },
  /* Dados de exportação disponíveis tanto no editor quanto no MCP headless. */
  exportarSVG(opts={}){return cenaCamadasSvg(opts)},
  exportarOBJ({alvo,modelo}={}){
    const it=alvo===undefined?SCN.list[SCN.active]:typeof alvo==="number"?SCN.list[alvo]:SCN.list.find(x=>x.name===alvo||x.id===alvo);
    if(!it)throw Error("Manequim não encontrado para OBJ.");
    const m=String(modelo||it.params.headModel).toLowerCase(),v3=/^v3/.test(m),v4=/^v4/.test(m);
    if(!v3&&!v4)throw Error("Exportação OBJ disponível para cabeça V3 e V4.");
    const mesh=v3?watertightMeshV3(it.params,shape(it.params)):watertightMeshV4(it.params,shape(it.params));
    const topo=v3?meshTopologyV3(mesh):meshTopologyV4(mesh);
    if(topo.invalid||topo.boundary||topo.nonmanifold||topo.degenerate)throw Error("Malha de cabeça inválida: "+JSON.stringify(topo));
    return v3?exportObjV3(mesh):exportObjV4(mesh);
  },
  exportarJSON(){return JSON.stringify({app:"GeoMannequin",version:9,scene:sceneState(),layers:{...L},style:styleName})},
  importarJSON(dados){const v=typeof dados==="string"?JSON.parse(dados):dados;if(v?.scene)applyState(v);else loadScene(v);return cena.estado()},
  estadoCompleto(){return {scene:sceneState(),layers:{...L},style:styleName}},
  restaurarCompleto(valor){if(!valor?.scene)throw Error("Estado completo inválido.");
    applyState(JSON.parse(JSON.stringify(valor)));
    if(valor.style&&STYLES[valor.style])cena.estilo(valor.style);
    return cena.estadoCompleto();
  },
  marcarEstado(snapshot){const valor=snapshot===undefined?cena.estadoCompleto():snapshot;
    if(!valor?.scene)throw Error("Snapshot de histórico inválido.");
    HIST_COMANDOS.undo.push(JSON.parse(JSON.stringify(valor)));
    if(HIST_COMANDOS.undo.length>HIST_COMANDOS.max)HIST_COMANDOS.undo.shift();
    HIST_COMANDOS.redo.length=0;return HIST_COMANDOS.undo.length},
  desfazer(){const last=HIST_COMANDOS.undo.pop();if(!last)return false;
    HIST_COMANDOS.redo.push(cena.estadoCompleto());cena.restaurarCompleto(last);return true},
  refazer(){const next=HIST_COMANDOS.redo.pop();if(!next)return false;
    HIST_COMANDOS.undo.push(cena.estadoCompleto());cena.restaurarCompleto(next);return true},
  historico(){return {desfazer:HIST_COMANDOS.undo.length,refazer:HIST_COMANDOS.redo.length,max:HIST_COMANDOS.max}},
  /* Descoberta da API a partir dos métodos realmente expostos nesta versão. */
  comandos(){
    const meth=o=>Object.keys(o).filter(k=>typeof Object.getOwnPropertyDescriptor(o,k)?.value==="function").sort();
    return {cena:meth(cena),camera:meth(camera),manequim:meth(apiFor(SCN.list[SCN.active])),
      objeto:SCN.objetos.length?meth(apiObjeto(SCN.objetos[0])):[],estilos:Object.keys(STYLES),
      camadas:LAY.map(l=>l.k)};
  },
  parametros(){return SL.map(x=>({chave:x.k,nome:x.label,min:x.min,max:x.max,passo:x.step}))},
  capacidades(){return [
    {id:"camera3d",estado:"implementado",api:["camera.ver","camera.costas","camera.frente","camera.seguir","camera.pararSeguir","camera.orientacaoDoAlvo","camera.capturar","camera.capturarVistas"],limite:"nova orientação anatômica até ±90°, enquadramento antigo mantém seus limites"},
    {id:"camadas",estado:"implementado",api:["cena.camadaVisual","cena.camadasVisuais"]},
    {id:"estilos",estado:"implementado",api:["cena.estilo","cena.estilos"]},
    {id:"exportacao",estado:"parcial",api:["cena.exportarSVG","cena.exportarOBJ","cena.exportarJSON","cena.exportarPNG","cena.baixar"]},
    {id:"headstudy",estado:"implementado",api:["cena.estudoAnatomico.svg","cena.estudoAnatomico.abrir","cena.estudoAnatomico.fechar"]},
    {id:"quadros",estado:"parcial",api:["cena.quadros.abrir","cena.quadros.texto","cena.quadros.renderizar","cena.quadros.fila","cena.quadros.baixar"]},
    {id:"blocking",estado:"parcial",api:["cena.blocking","cena.blocking.abrir","cena.blocking.estado"]},
    {id:"colisao",estado:"experimental",api:["cena.contatoV2","cena.contatosFisicos","m.tocar"]},
    {id:"preensaoV3",estado:"experimental",api:["m.segurar","m.soltar","m.maoEmSite",
       "cena.segurarObjeto","cena.soltarObjeto","cena.vinculos","cena.inspecionarPreensao",
       "obj.pontosDeAgarre","obj.pontoDeAgarre","obj.emPosseDe"],
      limite:"Attachment 6DOF com mão primária; segunda mão sem solver simultâneo, quedas sem física."},
    {id:"editor",estado:"parcial",api:["cena.marcarEstado","cena.desfazer","cena.refazer","cena.historico"],limite:"histórico explícito/de execução; mudanças externas não são interceptadas automaticamente"},
    {id:"importacao",estado:"implementado",api:["cena.importarJSON","cena.restaurarCompleto"]}
  ]},
  arquivosCamadas(){return arquivosCamadas(cena.exportarJSON())},
  exportarZIP(){return criarZip(cena.arquivosCamadas())},
  async baixar(nome,dados,mime="text/plain;charset=utf-8"){
    if(!UIH.baixar)throw Error("Download exige navegador. Use exportarSVG/exportarOBJ para obter os dados em execução headless.");
    return await UIH.baixar(String(nome),dados,mime);
  },
  async link(){if(!UIH.link)throw Error("Link compartilhável exige ambiente do navegador.");return await UIH.link();},
  async exportarPNG({escala=2,transparente=false}={}){
    if(typeof Image==="undefined"||typeof Blob==="undefined"||typeof URL==="undefined"||typeof document==="undefined"||!document.createElement)
      throw Error("PNG depende de Canvas/Imagem e não está disponível no headless. Use exportarSVG().");
    const factor=Number(escala);
    if(!Number.isFinite(factor)||factor<.25||factor>6)throw Error("Escala PNG deve ficar entre 0.25 e 6.");
    const svg=cena.exportarSVG({transparente}),url=URL.createObjectURL(new Blob([svg],{type:"image/svg+xml;charset=utf-8"}));
    try{
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error("SVG não pode ser convertido em PNG."));img.src=url});
      const cv=document.createElement("canvas");cv.width=Math.round(W*factor);cv.height=Math.round(H*factor);
      cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
      const blob=await new Promise((resolve,reject)=>cv.toBlob(b=>b?resolve(b):reject(Error("PNG não gerado.")),"image/png"));
      return blob;
    }finally{URL.revokeObjectURL(url)}
  },
  estudoAnatomico:{
    svg(opts={}){const it=opts.alvo===undefined?SCN.list[SCN.active]:typeof opts.alvo==="number"?SCN.list[opts.alvo]:SCN.list.find(x=>x.name===opts.alvo);
      if(!it)throw Error("Manequim para estudo não encontrado.");
      return buildHeadStudySvg({...it.params,headModel:"v4_anatomical"},opts);
    },
    abrir(){if(!UIH.headStudy)return {disponivel:false,motivo:"Interface não está disponível neste ambiente."};UIH.headStudy.open();return {disponivel:true}},
    fechar(){if(!UIH.headStudy)return {disponivel:false};UIH.headStudy.close();return {disponivel:true}},
    atualizar(){if(!UIH.headStudy)return {disponivel:false};UIH.headStudy.refresh();return {disponivel:true}}
  },
  camadas(){return listaCamadas()},
  exportarCamadas(opts){return cenaCamadasSvg(opts)},
  /* colisões entre manequins */
  colisoes(){return listaColisoes()},
  contatoV2(opts){return setContatoV2(opts)},
  contatosFisicos(opts){return consultarContatosV2(opts)},
  segurarObjeto(objeto,{manequim,mao="direita",...opts}={}){
    // modo: 'aproximarMao' usa IK antes da captura. Sem deslocar a cadeira.

    const it=manequim===undefined?SCN.list[SCN.active]:typeof manequim==="number"?SCN.list[manequim]:SCN.list.find(q=>q.name===manequim);
    const o=acharObjeto(objeto);if(!it||!o)throw Error("Manequim/objeto não encontrado.");
    atualizarApoios();const ground=restGround(SCN.list[0].params);
    const previous={...it.params};
    if(opts.modo==="aproximarMao"||opts.modo==="encaixar"){
      const H=handFrameV3(it,ladoNum(mao),ground);
      const sites=o&&gripSites(o).map(s=>gripSiteWorld(o,s.id,ground));
      const site=opts.ponto&&opts.ponto!=="auto"?gripSiteWorld(o,opts.ponto,ground):
        sites.sort((a,b)=>Math.hypot(...a.mundo.map((v,i)=>v-H.T[i]))-
                        Math.hypot(...b.mundo.map((v,i)=>v-H.T[i])))[0];
      try{
        const residual=alinharPalmaV3(it,ladoNum(mao),site.mundo,ground);
        guardarContatoV2(it,previous);
        const actual=handFrameV3(it,ladoNum(mao),ground);
        const finalError=Math.hypot(...actual.T.map((v,i)=>v-site.mundo[i]));
        if(residual>.35||finalError>.35)
          throw Error("A mão não conseguiu alcançar "+site.nome+
            ". Desvio residual "+Math.max(residual,finalError).toFixed(2)+" R.");
        return beginRigidGrip(it,o,ladoNum(mao),ground,{...opts,modo:opts.modo==="encaixar"?"encaixar":"preservar",ponto:site.id,objetos:SCN.objetos});
      }catch(e){Object.assign(it.params,previous);throw e}
    }
    return opts.motor==="v2"?beginGrip(it,o,ladoNum(mao),ground,opts):
      beginRigidGrip(it,o,ladoNum(mao),ground,{...opts,objetos:SCN.objetos});
  },
  soltarObjeto(objeto,opts={}){const o=acharObjeto(objeto);
    if(!o)throw Error("Objeto não encontrado.");atualizarApoios();
    if(o.gripV3){const it=SCN.list.find(x=>x.id===o.gripV3.mannequinId);
      if(!it)throw Error("Proprietário não encontrado.");const r=releaseRigidGrip(it,o,restGround(SCN.list[0].params),opts);
      atualizarApoios();return r.solto;}
    if(!releaseGrip(o))throw Error("O objeto não está segurado.");
    atualizarApoios();return true;
  },
  vinculos(){atualizarApoios();return SCN.objetos.map(o=>({o,g:o.gripV3||o.grip})).filter(x=>x.g).map(({o,g})=>
    ({objeto:o.nome||o.tipo,versao:o.gripV3?3:1,manequim:SCN.list.find(x=>x.id===g.mannequinId)?.name||null,
     mao:g.side===1?"esquerda":"direita",ponto:g.siteId||null,segundaMao:g.secundaria?.side===1?"esquerda":g.secundaria?.side===-1?"direita":null}))},
  inspecionarPreensao(){atualizarApoios();const ground=restGround(SCN.list[0].params);
    return SCN.objetos.filter(o=>o.gripV3).map(o=>{const it=SCN.list.find(x=>x.id===o.gripV3.mannequinId);
      return it?inspectRigidGrip(it,o,ground):{ativo:false,objeto:o.nome||o.tipo}})},

  colisao(modo,preferir){if(modo!==undefined)setModoColisao(String(modo).toLowerCase());if(preferir!==undefined)setPreferir(String(preferir).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""));return {modo:COL.modo,preferir:COL.preferir}},
  resolverColisoes(o){const met=o&&o.preferir?String(o.preferir).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""):undefined;if(met)setPreferir(met);const r=resolverTodas(met);r.forEach(t=>LOG.push(["aviso",t]));return r},
  desfazerColisao(){return desfazerColisao()},
  /* objetos: cena.objeto("mesa", {x: 3, z: 0, giro: 90, altura: 6.5, cor: "#7FB3D5"}) · cena.objeto("copo", {sobre: "mesa"})
     cilindros: cena.objeto("cilindro", {raio: 2, altura: 4}) */
  objeto(tipo,o){return apiObjeto(adicionarObjeto(tipo,o||{}))},
  objetos(){return SCN.objetos.map(apiObjeto)},
  obterObjeto(ref){const q=acharObjeto(ref);if(!q)throw new Error("Objeto “"+ref+"” não existe.");return apiObjeto(q)},
  removerObjeto(ref){const q=acharObjeto(ref);if(!q)throw new Error("Objeto não encontrado.");removerObjeto(q);if(SCN.objSel===q.id)SCN.objSel=null},
  tiposDeObjeto(){return Object.entries(TIPOS_OBJETO).map(([k,t])=>({tipo:k,nome:t.nome,forma:t.forma||"caixa"}))},
  /* seleciona um manequim (nome/índice) ou um objeto (nome/tipo) — o mesmo que clicar no painel de blocking */
  selecionar(ref){const i=typeof ref==="number"?ref:SCN.list.findIndex(x=>x.name===ref);if(i>=0&&SCN.list[i]){SCN.objSel=null;const cam={};CAMK.forEach(k=>cam[k]=P[k]);SCN.active=i;setP(SCN.list[i].params);Object.assign(P,cam);return apiFor(SCN.list[i])}
    const q=acharObjeto(ref);if(!q)throw new Error("Nada com o nome “"+ref+"” na cena.");SCN.objSel=q.id;return apiObjeto(q)},
  /* monta a cena de uma vez a partir de uma lista (veja a Referência) */
  montar(lista,opts){return montarCena(lista,opts,API)},
  /* composição lida do estado (a mesma que o painel de blocking mostra), em metros; cena.blocking.abrir(), .destacar("lateral"), .devolver() … */
  blocking:blockingApi,
  /* cena descrita em português: "manequim 1 sentado, manequim 2 deitado ao longo do eixo x, câmera no eixo z, elevação alta" */
  descrever(texto){const r=descreverCena(String(texto||""),API);r.avisos.forEach(t=>LOG.push(["aviso",t]));return r.feito},
  /* composição 2D (opcional): tangências e cabeças escondidas atrás de outro manequim */
  composicao(on){if(on!==undefined)setComposicao(on);return composicaoDaCena().map(c=>c.texto)},
  ajustarComposicao(i){const r=ajustarComposicao(i||0);r.forEach(t=>LOG.push(["aviso",t]));return r}
};
function camSet(k,v,min,max,nome){P[k]=clamp(num(v,nome),min,max)}
const camera={
  /* posição da câmera em relação ao alvo: define direção, distância e zoom */
  posicao(x,y,z){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;num(x,"x");num(y,"y");num(z,"z");
    const dx=x-P.tx,dy=y-P.ty,dz=z-P.tz,d=Math.hypot(dx,dy,dz);if(d<0.5)throw new Error("A câmera está colada no alvo; afaste-a.");
    P.yaw=Math.round(-Math.atan2(dx,dz)/D*10)/10;P.pitch=clamp(Math.round(-Math.atan2(dy,Math.hypot(dx,dz))/D*10)/10,-70,70);P.roll=0;
    P.camDist=clamp(d,4,200);P.zoom=clamp(6.2/d,0.05,3);P.panX=0;P.panY=0;return camera},
  mirar(x,y,z){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;SCN.pivo=null;camSet("tx",x,-30,30,"x");camSet("ty",y,-20,20,"y");camSet("tz",z,-30,30,"z");P.panX=0;P.panY=0;return camera},
  girar(yaw,pitch,roll){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;camSet("yaw",yaw,-180,180,"yaw");if(pitch!==undefined)camSet("pitch",pitch,-70,70,"pitch");if(roll!==undefined)camSet("roll",roll,-45,45,"roll");return camera},
  zoom(z){setZoomEff(num(z,"zoom"));return camera},
  perspectiva(on,dist){P.persp=on===false||on===0?0:1;if(dist!==undefined)camSet("camDist",dist,4,200,"distância");return camera},
  distancia(d){camSet("camDist",d,4,200,"distância");return camera},
  /* lente em mm: 18–35 grande-angular (perspectiva forte), 50 normal, 85–200 tele (achata). Mantém o tamanho do alvo na tela. */
  lente(mm,manterTamanho){const z=distToZoom(P);camSet("lens",mm,18,200,"lente");if(manterTamanho!==false)P.camDist=clamp(zoomToDist(P,z),4,200);return camera},
  /* zoom óptico (a câmera fica parada; só a lente muda): camera.zoomLente(85) em mm, ou camera.zoomLente("2x") / ("0.5x") */
  zoomLente(v){const t=String(v).trim().replace(",",".");if(/x$/i.test(t)){const k=parseFloat(t);if(!(k>0))throw new Error("Zoom: use mm (18–200) ou um fator como \"2x\".");zoomFator(k)}else zoomLente(num(+t,"lente"));return camera},
  /* campo de visão horizontal em graus (abre ou fecha o "cone" sem mover a câmera) */
  campo(graus){abrirCone(num(graus,"graus"));return camera},
  /* estado da lente: mm, graus, faixa (grande-angular, normal, tele) */
  lenteInfo(){const C=cameraNoMundo(P);return {lente:Math.round(C.lente),campoGraus:Math.round(C.fovH),faixa:C.persp?faixaLente(C.lente):"sem perspectiva",perspectiva:C.persp}},
  /* altura dos olhos (da câmera) acima do chão, em R; mantém distância e alvo */
  /* olhos da câmera a h R do chão. Sem inclinação (padrão) o horizonte fica exatamente na altura h em todos os manequins. */
  alturaOlhos(h,inclinacao){num(h,"altura");const g0=restGround(SCN.list[0].params),pt=inclinacao===undefined?0:clamp(num(inclinacao,"inclinação"),-70,70);
    P.pitch=pt;P.ty=clamp(g0+h+Math.sin(pt*D)*Math.max(3,P.camDist),-20,20);return camera},
  luz(az,el){camSet("lightAz",az,-180,180,"azimute");if(el!==undefined)camSet("lightEl",el,10,80,"elevação");return camera},
  enquadrar(){autoFit();return camera},
  /* posição da câmera no mundo (em R), calculada do alvo, da direção e da distância */
  posicaoMundo(){return cameraNoMundo(P).pos.map(v=>Math.round(v*100)/100)},
  /* põe a câmera num ponto do mundo mantendo o alvo (como arrastar a câmera na vista de cima) */
  colocar(x,y,z){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;moverCamera(num(x,"x"),num(y,"y"),num(z,"z"));return camera},
  /* câmera num eixo ("x", "-x", "z", "-z", "y" = de cima), mantendo distância e alvo */
  eixo(a,opts){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;const t=String(a).toLowerCase().replace(/^eixo\s*/,"").replace("câmera","");const v={"x":[1,0,0],"+x":[1,0,0],"-x":[-1,0,0],"z":[0,0,1],"+z":[0,0,1],"-z":[0,0,-1],"y":[0,1,0],"+y":[0,1,0],"cima":[0,1,0],"-y":[0,-1,0]}[t];
    if(!v)throw new Error("Eixo da câmera: use x, -x, z, -z ou y (de cima).");
    const d=opts&&opts.distancia?clamp(num(opts.distancia,"distância"),4,200):Math.max(4,P.camDist||30);
    if(v[1]>0){P.yaw=0;P.pitch=-70;P.roll=0;return camera}
    if(v[1]<0){P.yaw=0;P.pitch=45;P.roll=0;return camera}
    P.yaw=Math.round(Math.atan2(v[0],v[2])/D);P.roll=0;return camera},
  /* elevação: "alta" (de cima, plongée), "média", "olhos" (nível dos olhos), "baixa" (de baixo, contra-plongée), ou graus acima do horizonte */
  elevacao(e){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;const t=typeof e==="number"?e:{"muito alta":70,"de cima":70,"alta":45,"media":20,"média":20,"olhos":0,"nivel dos olhos":0,"nível dos olhos":0,"baixa":-18,"muito baixa":-35,"chao":-35,"chão":-35}[String(e).toLowerCase()];
    if(t===undefined)throw new Error("Elevação: use \"alta\", \"média\", \"olhos\", \"baixa\" ou graus.");P.pitch=clamp(-t,-70,70);return camera},
  /* tamanho do plano (quadrinhos/cinema), em volta de um manequim (nome, índice ou o ativo) ou de vários (lista ou "todos"):
     "detalhe" (rosto), "close", "primeiro plano" (até o peito), "medio" (cintura), "americano" (coxa), "inteiro", "geral" (todos com folga).
     Mantém o ângulo da câmera; muda alvo, distância (e, se preciso, a lente) e zera o deslocamento. */
  enquadramento(tipo,quem,opts){
    pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;SCN.pivo=null;
    const t=String(tipo||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[-_]/g," ").trim();
    const FR={detalhe:0.15,rosto:0.15,"close up":0.22,close:0.22,"primeiro plano":0.32,"plano proximo":0.32,"meio corpo":0.5,medio:0.5,"plano medio":0.5,americano:0.72,"plano americano":0.72,inteiro:1,"corpo inteiro":1,"plano inteiro":1,geral:-1,"plano geral":-1,conjunto:-1,"grande plano geral":-2};
    const f=FR[t];if(f===undefined)throw new Error("Enquadramento: use detalhe, close, primeiro plano, medio, americano, inteiro ou geral.");
    let alvos;if(quem===undefined)alvos=f<0?SCN.list.filter(x=>!x.oculto):[SCN.list[SCN.active]];
    else if(quem==="todos")alvos=SCN.list.filter(x=>!x.oculto);
    else alvos=[].concat(quem).map(q=>{const it=typeof q==="number"?SCN.list[q]:typeof q==="object"&&q?SCN.list.find(x=>x.name===q.nome):SCN.list.find(x=>x.name===q);if(!it)throw new Error("Enquadramento: manequim “"+(q&&q.nome||q)+"” não existe.");return it});
    if(f<0||alvos.length>1||f>=1){
      /* plano geral/inteiro: o enquadramento automático só com esses manequins, com folga no geral */
      const ocultos=SCN.list.map(x=>x.oculto);SCN.list.forEach(x=>{x.oculto=!alvos.includes(x)});
      try{autoFit()}finally{SCN.list.forEach((x,i)=>{x.oculto=ocultos[i]})}
      if(f<0){const k=f===-2?0.45:0.7;if(P.persp)P.camDist=+clamp(P.camDist/k,4,200).toFixed(2);else P.zoom=+clamp(P.zoom*k,0.05,3).toFixed(3);P.panX*=k;P.panY*=k}
      return camera}
    const it=alvos[0],po=pMundo(it),os=ossosDoCorpo(po),M=paraMundo(po),cr=os.ossos.find(x=>x.nome==="crânio"),cab=M(cr.a),pel=M(os.juntas.find(x=>x.nome==="pelve").P);
    const Hs=1.0-restGround(SCN.list[0].params),hreg=f*Hs,topo=cab[1]+cr.r*1.05,b=Math.min(1,Math.max(0,(f-0.3)/0.7));
    /* centro: perto da cabeça nos planos fechados; no meio do corpo nos abertos */
    const c=[cab[0]+(pel[0]-cab[0])*b,topo-hreg/2,cab[2]+(pel[2]-cab[2])*b];
    P.tx=clamp(c[0],-30,30);P.ty=clamp(c[1],-20,20);P.tz=clamp(c[2],-30,30);
    const S=(SCN.recorte?SCN.recorte.h:H)*0.86/(hreg*1.08);
    if(P.persp){let d=(W/2)*(P.lens||50)/(18*S);if(d<6){d=6;P.lens=Math.round(clamp(18*S*d/(W/2),18,200))}P.camDist=+clamp(d,4,200).toFixed(2)}
    else P.zoom=+clamp(S/effScale(Object.assign({},P,{persp:0,zoom:1})),0.05,3).toFixed(3);
    /* o alvo fica no centro da foto (o centro de projeção do palco fica acima do meio) */
    const Sx=effScale(P);P.panX=(W/2-CX)/Sx;P.panY=(CY-H/2)/Sx;
    /* regra dos terços: opts.tercos = "esquerda" | "direita" põe o personagem numa das linhas verticais */
    if(opts&&opts.tercos){const sg=/dir/.test(String(opts.tercos))?1:-1;P.panX+=sg*((SCN.recorte?SCN.recorte.w:W)/6)/Sx}
    return camera},
  /* ângulo de câmera dos quadrinhos: "normal", "plongée" (de cima), "contra-plongée" (de baixo), "zenital", "holandês" (inclinado), "nadir";
     graus opcionais (inclinação do holandês ou elevação) */
  angulo(nome,graus){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;const t=String(nome||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if(/holand|dutch|inclinad/.test(t)){P.roll=clamp(graus===undefined?18:num(graus,"graus"),-45,45);return camera}
    P.roll=0;
    if(/normal|olho|nivel|frontal/.test(t))P.pitch=graus===undefined?0:-num(graus,"graus");
    else if(/contra|baixo/.test(t))P.pitch=graus===undefined?22:Math.abs(num(graus,"graus"));
    else if(/zenit|aereo|cima de tudo|vista de cima/.test(t))P.pitch=-70;
    else if(/nadir|minhoca/.test(t))P.pitch=55;
    else if(/plongee|alto|de cima/.test(t))P.pitch=graus===undefined?-38:-Math.abs(num(graus,"graus"));
    else throw new Error("Ângulo: use normal, plongée, contra-plongée, zenital, nadir ou holandês.");
    P.pitch=clamp(P.pitch,-70,70);return camera},
  /* órbita: a câmera gira em volta de um pivô — manequim ("Ana", índice, "ativo"), grupo (["Ana","Leo"]), objeto ("mesa"),
     ponto [x, y, z] ou "cena". azimute a partir da FRENTE do pivô: "frente", "3/4 esquerda", "esquerda", "costas", "3/4 direita"… ou graus
     (positivo = para o lado esquerdo dele); elevacao em graus acima do horizonte ou "olhos", "alta", "baixa"; distancia em R (sem ela, enquadra o pivô).
     Ex.: camera.orbitar("Ana", {area: "cabeca", azimute: "3/4 esquerda", elevacao: 15}) */
  orbitar(alvo,opts){if(typeof opts==="string"||typeof opts==="number")opts={azimute:opts};pararSeguimentoCamera();orbitarCamera(alvo,opts||{});return camera},
  /* Novas vistas anatômicas: frente/costas de tronco, crânio ou extremidade.
   * Retorno encadeável; consultar .orientacaoDoAlvo() ou .vistaExata() para diagnóstico. */
  ver(alvo,opts={}){verOrientadaCamera(alvo,opts);return camera},
  costas(alvo,opts={}){return camera.ver(alvo,{...opts,lado:"costas"})},
  frente(alvo,opts={}){return camera.ver(alvo,{...opts,lado:"frente"})},
  perfilEsquerdo(alvo,opts={}){return camera.ver(alvo,{...opts,lado:"esquerda"})},
  perfilDireito(alvo,opts={}){return camera.ver(alvo,{...opts,lado:"direita"})},
  seguir(alvo,opts={}){seguirOrientacaoCamera(alvo,opts);return camera},
  pararSeguir(){pararSeguimentoCamera();return camera},
  seguimento(){return estadoSeguimentoCamera()},
  orientacaoDoAlvo(alvo,parte="tronco"){return orientacaoAlvo(alvo,parte)},
  alvos(){return [...SCN.list.map(x=>({tipo:"manequim",nome:x.name})),...SCN.objetos.map(x=>({tipo:"objeto",nome:x.nome||x.tipo,id:x.id}))]},
  areas(alvo){const p=alvo===undefined?"ativo":alvo;const it=encontrarAlvoOrientacao(p);return regioesDisponiveisOrbita(it.tipo).map(([id,nome])=>({id,nome}))},
  vistaExata(alvo,opts={}){return verOrientadaCamera(alvo,opts)},
  /* Captura a vista indicada SEM sobrescrever a câmera/pose do editor.
   * Restauro local: não usar loadScene(), pois remapearia IDs de objetos.
   */
  capturar(alvo,opts={}){
    const before={...P},backup={pivo:SCN.pivo,area:SCN.orbitaArea,
      seguir:SCN.seguirCamera,vista:SCN.ultimaVistaOrientada};
    try{
      verOrientadaCamera(alvo,{lado:"frente",...opts});
      return cenaCamadasSvg({transparente:opts.transparente!==false});
    }finally{
      Object.assign(P,before);SCN.pivo=backup.pivo;SCN.orbitaArea=backup.area;
      SCN.seguirCamera=backup.seguir;SCN.ultimaVistaOrientada=backup.vista;
    }
  },
  capturarVistas(alvo,opts={}){
    const angles=opts.angulos??VISTAS_8.map(x=>x[1]);
    if(!Array.isArray(angles)||angles.length>16||angles.some(x=>!Number.isFinite(x)))
      throw Error("Forneça de 0 a 16 ângulos numéricos.");
    return angles.map(a=>({azimute:a,svg:camera.capturar(alvo,{...opts,angulos:undefined,lado:a})}));
  },
  /* pivô da órbita (o alvo da câmera vai para o centro dele; a câmera mantém direção e distância). A arrastada na tela gira em volta dele. */
  pivo(alvo,opts){pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;pivoCamera(alvo,opts);return camera},
  /* Define uma região do pivô ATUAL sem mudar azimute/elevacao:
     camera.area("cabeca"), camera.area("mao esquerda"), camera.area("superior"). */
  area(regiao,opts){
    opts=opts||{};const alvo=SCN.pivo===undefined||SCN.pivo===null?"ativo":SCN.pivo,
      A=resolverAlvo(alvo),az=vistaAtual(A).azimute;
    orbitarCamera(alvo,Object.assign({azimute:az,elevacao:-(P.pitch||0),enquadrar:true},opts,{area:regiao}));
    return camera;
  },
  /* Comando direto para plano próximo de qualquer alvo/região.
     camera.focar("Ana","cabeca",{azimute:45,elevacao:25});
     camera.focar("Mesa","superior",{azimute:-30,elevacao:60}); */
  focar(alvo,area,opts){
    if(area&&typeof area==="object"){opts=area;area=opts.area??opts.regiao;}
    opts=opts||{};const A=resolverAlvo(alvo),az=vistaAtual(A).azimute;
    const arg=Object.assign({azimute:az,elevacao:-(P.pitch||0),enquadrar:true},opts);
    arg.area=area===undefined?arg.area:area;
    orbitarCamera(alvo,arg);return camera;
  },
  /* gira em volta do pivô atual: graus no chão (positivo = para a esquerda do pivô) e na elevação */
  girarEmVolta(graus,elev){passoOrbita(num(graus,"graus"),elev===undefined?0:num(elev,"elevação"));return camera},
  /* vista atual em relação ao pivô: {pivo, azimute, elevacao} */
  parametro(chave,valor){
    const d=SLK[chave];
    if(!d||!CAMK.includes(chave))throw Error("Parâmetro de câmera desconhecido: "+chave);
    if(valor===undefined)return P[chave];
    pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;
    const n=num(valor,chave);P[chave]=clamp(n,d.min,d.max);return camera;
  },
  parametros(){return Object.fromEntries(CAMK.map(k=>[k,P[k]]))},
  vista(){const A=SCN.pivo!==undefined&&SCN.pivo!==null?(()=>{try{return resolverAlvo(SCN.pivo,{area:SCN.orbitaArea})}catch(e){return null}})():null;return Object.assign({pivo:A?A.nome:"alvo da câmera",area:A?A.area:null},SCN.ultimaVistaOrientada||vistaAtual(A))},
  /* azimutes de um giro de n vistas (para laços): camera.giro(8) → [0, 45, 90, …] */
  giro(n,opts){return azimutesGiro(n,opts)},
  vistas(){return VISTAS_8.map(v=>v[0])},
  /* planos clássicos */
  plano(n){const t=String(n).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if(/contra/.test(t))return camera.elevacao("baixa");if(/plongee|alto/.test(t))return camera.elevacao("alta");if(/cima|zenital|aereo/.test(t))return camera.elevacao("de cima");
    if(/olho|nivel|normal/.test(t))return camera.elevacao("olhos");if(/baixo|chao|minhoca/.test(t))return camera.elevacao("muito baixa");
    throw new Error("Plano: use plongée, contra-plongée, de cima, nível dos olhos ou de baixo.")}
};
/* o que descrever/montar usam (sem dependência circular) */
const API={get cena(){return cena},get camera(){return camera},manequim(i){const it=SCN.list[i-1];if(!it)throw new Error("Manequim "+i+" não existe.");return apiFor(it)}};

function tema(n){const i=THEMES.findIndex(t=>t[0]===String(n).toLowerCase());if(i<0)throw new Error("Tema desconhecido: use 'claro', 'escuro' ou 'sistema'.");applyTheme(i)}

export { espelharPose as espelharPoseP, withInst, LOG, apiFor, cena, camSet, camera, tema };
