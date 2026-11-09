/* GeoMannequin — API de comandos em português: cena, camera, tema e cada manequim */
import { CAMK, P, SCN, UIH, addInst, delInst, dupInst, instColors, mixHex, nextHue, setColor, setP, corObjeto, atualizarApoios } from "./modelo.js";
import { applyParams, num, POSEKEYS } from "./parametros.js";
import { adicionarObjeto, duplicarObjeto, acharObjeto, apontarPara, deitar, editarObjeto, encostarEm, maoEm, olharPara, orientar, peEm, removerObjeto, sentar, subirEm } from "./cenario.js";
import { descreverCena, montarCena } from "./descrever.js";
import { loadScene, sceneState } from "./estado.js";
import { leituraBlocking, moverCamera, abrirCone, zoomLente, zoomFator } from "./blocking.js";
import { EXPRESSOES, BODIES, BPOSES, doBodyPose, guardArms, limitesAcoplados, nomePose, todasPoses } from "./poses.js";
import { autoFit, setZoomEff } from "./enquadrar.js";
import { VISTAS_8, azimutesGiro, orbitarCamera, passoOrbita, pivoCamera, resolverAlvo, vistaAtual } from "./orbita.js";
import { L, setMode, setPreset } from "./modos.js";
import { updateModeButtons } from "./ambiente.js";
import { THEMES, applyTheme } from "./tema.js";
import { cenaCamadasSvg, fotoSvg, listaCamadas } from "./camadas-cena.js";
import { COL, pMundo, colisoesDaCena, desfazerColisao, listaColisoes, permitirContato, resolverPar, resolverTodas, setModoColisao, setPreferir, composicaoDaCena, ajustarComposicao, setComposicao } from "./colisoes.js";
import { D, DEF, PRESETS, TIPOS_OBJETO, ehCilindro, faixaLente, ossosDoCorpo, paraMundo, effScale, H, W, CX, CY, apoiarContatos, autoColisoes, cameraNoMundo, aplicarGesto, clamp, distToZoom, restGround, zoomToDist } from "../engine/index.js";

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
    pose(o,opts){chk();if(typeof o==="string")return m.poseRapida(o,opts);applyParams(it,o,true).forEach(t=>LOG.push(["aviso",t]));limitesAcoplados(it.params).forEach(t=>LOG.push(["aviso",t]));withInst(it,guardArms);return m},
    poseRapida(nome,opts){chk();const k=nomePose(nome);const ok=todasPoses();
      if(!ok.includes(k))throw new Error("Pose rápida desconhecida: “"+nome+"”. Opções: "+ok.join(", ")+".");withInst(it,()=>doBodyPose(k,opts));return m},
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
    maoEm(lado,ponto){chk();const e=maoEm(it,ladoNum(lado),pontoMundo(ponto));if(e>0.4)LOG.push(["aviso","a mão não alcança o ponto (faltam "+Math.round(e*11.4)+" cm)"]);return m},
    peEm(lado,ponto){chk();peEm(it,ladoNum(lado),pontoMundo(ponto));return m},
    apontar(alvo,lado){chk();apontarPara(it,alvo,lado===undefined?-1:ladoNum(lado));return m},
    /* ===== mãos ===== */
    gesto(lado,nome){chk();if(nome===undefined){nome=lado;lado="ambas"}ladosDe(lado).forEach(t=>aplicarGesto(it.params,t,String(nome).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"")));return m},
    dedos(lado,o){chk();const D_={polegar:"Th",indicador:"In",medio:"Me","médio":"Me",anelar:"An",minimo:"Mi","mínimo":"Mi"};
      ladosDe(lado).forEach(t=>{const L_=t>0?"L":"R";for(const [k,v] of Object.entries(o||{})){const kk=k.toLowerCase();
        if(D_[kk])it.params["f"+D_[kk]+L_]=clamp(num(v,k),-1,1);else if(kk==="mao"||kk==="mão"||kk==="fechar")it.params["handCurl"+L_]=clamp(num(v,k),0,1);
        else if(kk==="afastar"||kk==="abrir")it.params["fSpread"+L_]=clamp(num(v,k),0,1);else if(kk==="opor"||kk==="oposicao"||kk==="oposição")it.params["thumbOpp"+L_]=clamp(num(v,k),0,1);
        else throw new Error("Dedo desconhecido: “"+k+"”. Use polegar, indicador, medio, anelar, minimo, mao, afastar, opor.")}});return m},
    /* ===== articulações pelo nome: m.articulacao("cotovelo esquerdo", {dobrar: 90}) ===== */
    /* confere a pose: partes do corpo atravessando umas às outras (não vizinhas, mais de 0,5 R) e limites acoplados que corrigiriam algo */
    validarPose(opts){chk();const tol=opts&&opts.tolerancia!==undefined?num(opts.tolerancia,"tolerância"):0.5,a=autoColisoes(pMundo(it),tol),l=limitesAcoplados(Object.assign({},it.params));
      return {ok:!a.length&&!l.length,atravessa:a.map(x=>({partes:[x.a,x.b],profundidade:x.prof})),limites:l}},
    articulacao(nome,valores){chk();const r=articParams(nome,valores);applyParams(it,r,true).forEach(t=>LOG.push(["aviso",t]));limitesAcoplados(it.params).forEach(t=>LOG.push(["aviso",t]));withInst(it,guardArms);return m},
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
  quadros:{abrir:()=>painelQd("abrir"),fechar:()=>painelQd("fechar"),texto:t=>painelQd("texto",t),renderizar:()=>painelQd("renderizar"),fila:()=>painelQd("fila"),baixar:()=>painelQd("baixar")},
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
  camadas(){return listaCamadas()},
  exportarCamadas(opts){return cenaCamadasSvg(opts)},
  /* colisões entre manequins */
  colisoes(){return listaColisoes()},
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
  posicao(x,y,z){num(x,"x");num(y,"y");num(z,"z");
    const dx=x-P.tx,dy=y-P.ty,dz=z-P.tz,d=Math.hypot(dx,dy,dz);if(d<0.5)throw new Error("A câmera está colada no alvo; afaste-a.");
    P.yaw=Math.round(-Math.atan2(dx,dz)/D*10)/10;P.pitch=clamp(Math.round(-Math.atan2(dy,Math.hypot(dx,dz))/D*10)/10,-70,70);P.roll=0;
    P.camDist=clamp(d,4,200);P.zoom=clamp(6.2/d,0.05,3);P.panX=0;P.panY=0;return camera},
  mirar(x,y,z){SCN.pivo=null;camSet("tx",x,-30,30,"x");camSet("ty",y,-20,20,"y");camSet("tz",z,-30,30,"z");P.panX=0;P.panY=0;return camera},
  girar(yaw,pitch,roll){camSet("yaw",yaw,-180,180,"yaw");if(pitch!==undefined)camSet("pitch",pitch,-70,70,"pitch");if(roll!==undefined)camSet("roll",roll,-45,45,"roll");return camera},
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
  colocar(x,y,z){moverCamera(num(x,"x"),num(y,"y"),num(z,"z"));return camera},
  /* câmera num eixo ("x", "-x", "z", "-z", "y" = de cima), mantendo distância e alvo */
  eixo(a,opts){const t=String(a).toLowerCase().replace(/^eixo\s*/,"").replace("câmera","");const v={"x":[1,0,0],"+x":[1,0,0],"-x":[-1,0,0],"z":[0,0,1],"+z":[0,0,1],"-z":[0,0,-1],"y":[0,1,0],"+y":[0,1,0],"cima":[0,1,0],"-y":[0,-1,0]}[t];
    if(!v)throw new Error("Eixo da câmera: use x, -x, z, -z ou y (de cima).");
    const d=opts&&opts.distancia?clamp(num(opts.distancia,"distância"),4,200):Math.max(4,P.camDist||30);
    if(v[1]>0){P.yaw=0;P.pitch=-70;P.roll=0;return camera}
    if(v[1]<0){P.yaw=0;P.pitch=45;P.roll=0;return camera}
    P.yaw=Math.round(Math.atan2(v[0],v[2])/D);P.roll=0;return camera},
  /* elevação: "alta" (de cima, plongée), "média", "olhos" (nível dos olhos), "baixa" (de baixo, contra-plongée), ou graus acima do horizonte */
  elevacao(e){const t=typeof e==="number"?e:{"muito alta":70,"de cima":70,"alta":45,"media":20,"média":20,"olhos":0,"nivel dos olhos":0,"nível dos olhos":0,"baixa":-18,"muito baixa":-35,"chao":-35,"chão":-35}[String(e).toLowerCase()];
    if(t===undefined)throw new Error("Elevação: use \"alta\", \"média\", \"olhos\", \"baixa\" ou graus.");P.pitch=clamp(-t,-70,70);return camera},
  /* tamanho do plano (quadrinhos/cinema), em volta de um manequim (nome, índice ou o ativo) ou de vários (lista ou "todos"):
     "detalhe" (rosto), "close", "primeiro plano" (até o peito), "medio" (cintura), "americano" (coxa), "inteiro", "geral" (todos com folga).
     Mantém o ângulo da câmera; muda alvo, distância (e, se preciso, a lente) e zera o deslocamento. */
  enquadramento(tipo,quem,opts){
    SCN.pivo=null;
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
  angulo(nome,graus){const t=String(nome||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
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
     Ex.: camera.orbitar("Ana", {azimute: "3/4 esquerda", elevacao: 15}) */
  orbitar(alvo,opts){if(typeof opts==="string"||typeof opts==="number")opts={azimute:opts};orbitarCamera(alvo,opts||{});return camera},
  /* pivô da órbita (o alvo da câmera vai para o centro dele; a câmera mantém direção e distância). A arrastada na tela gira em volta dele. */
  pivo(alvo,opts){pivoCamera(alvo,opts);return camera},
  /* gira em volta do pivô atual: graus no chão (positivo = para a esquerda do pivô) e na elevação */
  girarEmVolta(graus,elev){passoOrbita(num(graus,"graus"),elev===undefined?0:num(elev,"elevação"));return camera},
  /* vista atual em relação ao pivô: {pivo, azimute, elevacao} */
  vista(){const A=SCN.pivo!==undefined&&SCN.pivo!==null?(()=>{try{return resolverAlvo(SCN.pivo)}catch(e){return null}})():null;return Object.assign({pivo:A?A.nome:"alvo da câmera"},vistaAtual(A))},
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
