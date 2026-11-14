/* GeoMannequin — salvar e carregar a cena (JSON) */
import { LAY, SL, SLK, POSEKEYS } from "./parametros.js";
import { NOMES_BIOTIPOS } from "./biotipos.js";
import { STYLES, setStyleName } from "./paletas.js";
import { $ } from "./ambiente.js";
import { L, setMode } from "./modos.js";
import { CAMK, MAXM, P, SCN, hex2rgb, newInst, nextHue, novoIdObjeto, setP, atualizarApoios } from "./modelo.js";
import {normalizarPerfil} from "../engine/objetos.js";
import { validarReferencia, ventoManga, DEF, TIPOS_OBJETO, clamp, objetoPadrao, zoomToDist, normalizarModeloCabeca } from "../engine/index.js";
import { COL, setModoColisao, setPreferir } from "./colisoes.js";
import {CONTATO_V2,setContatoV2} from "./contato-v2.js";
import { efeitosParaSalvar, efeitosDoArquivo, importarModelosEfeito } from "./efeitos-cena.js";

function modeloCabecaEstadoOrb(v){return normalizarModeloCabeca(v,"v1");}
function salvarPivoOrbita(){
 const p=SCN.pivo;
 if(p===undefined||p===null)return null;
 let alvo=p;
 if(p&&typeof p==="object"&&!Array.isArray(p)&&p.id!==undefined){
  const index=SCN.objetos.findIndex(o=>o.id===p.id);
  if(index<0)return null;
  alvo={tipo:"objeto",indice:index};
 }
 return {alvo,area:SCN.orbitaArea||null};
}
function applyState(s){
  if(s&&s.scene){loadScene(s.scene);if(s.style&&STYLES[s.style])setStyleName(s.style);
    if(s.layers&&typeof s.layers==="object"){LAY.forEach(l=>{const v=s.layers[l.k];if(typeof v==="boolean")L[l.k]=v;else if(typeof v==="number")L[l.k]=!!v});setMode(null)}
    if(typeof s.code==="string"&&$("code")){$("code").value=s.code}
    return}
  const pr=s&&s.params?s.params:s;
  if(!pr||typeof pr!=="object")throw new Error("JSON sem o campo params.");
  SL.forEach(d=>{if(typeof pr[d.k]==="number"&&isFinite(pr[d.k]))P[d.k]=clamp(pr[d.k],d.min,d.max)});
  if(NOMES_BIOTIPOS.includes(pr._biotipo))P._biotipo=pr._biotipo;
  P.headModel=modeloCabecaEstadoOrb(pr.headModel);
  if(typeof pr.shrug==="number"&&typeof pr.shElevL!=="number"){P.shElevL=P.shElevR=clamp(pr.shrug/0.3,-1,1)}
  if(s.style&&STYLES[s.style])setStyleName(s.style);
  if(s.layers&&typeof s.layers==="object"){
    LAY.forEach(l=>{const v=s.layers[l.k];if(typeof v==="boolean")L[l.k]=v;else if(typeof v==="number")L[l.k]=!!v});
    setMode(null);
  }
}
/* estado da cena (salvar / carregar / JSON) */
function sceneState(){
  atualizarApoios();
  let seguir=null;
  if(SCN.seguirCamera){
    const q=SCN.seguirCamera,items=q.tipo==="objeto"?SCN.objetos:SCN.list;
    const ix=items.findIndex(x=>x.id===q.uid);
    if(ix>=0)seguir={tipo:q.tipo,indice:ix,opts:{...q.opts}};
  }
  const cam={};CAMK.forEach(k=>cam[k]=P[k]);
  const fxs=efeitosParaSalvar();
  return {...(fxs?{efeitos:fxs}:{}),...(SCN.meusEfeitos?.length?{meusEfeitos:JSON.parse(JSON.stringify(SCN.meusEfeitos))}:{}),...(SCN.minhasExpressoes?.length?{minhasExpressoes:JSON.parse(JSON.stringify(SCN.minhasExpressoes))}:{}),...(SCN.minhasPoses?.length?{minhasPoses:SCN.minhasPoses.map(p=>({nome:p.nome,valores:{...p.valores},criada:p.criada}))}:{}),...(SCN.chavesVento?.length?{chavesVento:structuredClone(SCN.chavesVento)}:{}),...(SCN.frameManga?{frameManga:SCN.frameManga}:{}),...(SCN.vento?{vento:{...SCN.vento}}:{}),active:SCN.active,camera:cam,orbita:salvarPivoOrbita(),seguirCamera:seguir,vistaOrientada:SCN.ultimaVistaOrientada?{...SCN.ultimaVistaOrientada}:null,exato:!!SCN.exato,list:SCN.list.map(it=>{const pr={};SL.forEach(d=>pr[d.k]=it.params[d.k]);if(NOMES_BIOTIPOS.includes(it.params._biotipo))pr._biotipo=it.params._biotipo;pr.headModel=modeloCabecaEstadoOrb(it.params.headModel);const o={name:it.name,params:pr,hue:it.hue,col:it.col};if(it.exprNome)o.exprNome=String(it.exprNome).slice(0,120);if(it.montadoEm)o.montadoEm=String(it.montadoEm).slice(0,24);if(it.modelosGuardados)o.modelosGuardados=structuredClone(it.modelosGuardados);if(it.referencias?.length)o.referencias=structuredClone(it.referencias);if(it.congelado)o.congelado=true;if(it.oculto)o.oculto=true;if(it.ordem)o.ordem=it.ordem;if(it.grupo)o.grupo=it.grupo;if(it.papel)o.papel=it.papel;if(it.apoioEm){const j=SCN.objetos.findIndex(x=>x.id===it.apoioEm);if(j>=0)o.apoioEm=j}if(it.contato&&it.contato.length){const ix=it.contato.map(id=>SCN.list.findIndex(x=>x.id===id)).filter(i=>i>=0);if(ix.length)o.contato=ix}return o}),colisao:{modo:COL.modo,preferir:COL.preferir,composicao:!!COL.composicao,detalhada:!!CONTATO_V2.enabled,nivelV2:CONTATO_V2.level,tolV2:CONTATO_V2.tol},objetos:SCN.objetos.map(o=>{const q=Object.assign({},o);delete q.id;if(!o.emAr&&!o.gripV3)delete q.base;
    if(o.gripV3){
      const j=SCN.list.findIndex(m=>m.id===o.gripV3.mannequinId);
      q.gripV3=j<0?undefined:{...o.gripV3,mannequinIndex:j};
      if(q.gripV3)delete q.gripV3.mannequinId;
    }
    if(o.grip){const j=SCN.list.findIndex(m=>m.id===o.grip.mannequinId);
      q.grip=j<0?undefined:{...o.grip,mannequinIndex:j};if(q.grip)delete q.grip.mannequinId;}if(o.corda){const mi=SCN.list.findIndex(x=>x.id===o.corda.manequim),oi=SCN.objetos.findIndex(x=>x.id===o.corda.objeto);q.corda={...o.corda,manequim:undefined,objeto:undefined,manequimIndex:mi,objetoIndex:oi}}if(o.toques)q.toques=o.toques.map(t=>({side:t.side,mannequinIndex:SCN.list.findIndex(x=>x.id===t.mannequinId)})).filter(t=>t.mannequinIndex>=0);if(o.sobre){const j=SCN.objetos.findIndex(x=>x.id===o.sobre);if(j>=0)q.sobre=j;else delete q.sobre}else delete q.sobre;return q})};
}
function loadScene(sc){
  if(!sc||!Array.isArray(sc.list)||!sc.list.length)throw new Error("JSON da cena sem manequins.");
  const vento=sc.vento?ventoManga(sc.vento):null;
  /* poses salvas que vieram com a cena: juntam-se às que já existem (as de mesmo nome são substituídas) */
  if(Array.isArray(sc.minhasPoses)){
    const lista=SCN.minhasPoses||(SCN.minhasPoses=[]);
    sc.minhasPoses.slice(0,500).forEach(p=>{
      if(!p||typeof p.nome!=="string"||!p.valores||typeof p.valores!=="object")return;
      const v={};Object.entries(p.valores).forEach(([k,x])=>{if(POSEKEYS.has(k)&&typeof x==="number"&&isFinite(x))v[k]=x});
      if(!Object.keys(v).length)return;
      const i=lista.findIndex(q=>q.nome===p.nome),reg={nome:p.nome.slice(0,60),valores:v,criada:p.criada};
      if(i>=0)lista[i]=reg;else lista.push(reg);
    });
  }
  /* expressões guardadas que vieram com a cena (rosto completo, só controles do rosto) */
  if(Array.isArray(sc.minhasExpressoes)){
    const L=SCN.minhasExpressoes||(SCN.minhasExpressoes=[]);
    sc.minhasExpressoes.slice(0,300).forEach(e=>{if(!e||typeof e.nome!=="string"||!e.valores||typeof e.valores!=="object")return;
      const v={};Object.entries(e.valores).forEach(([k,x])=>{if(POSEKEYS.has(k)&&typeof x==="number"&&isFinite(x))v[k]=x});
      const reg={nome:e.nome.slice(0,40),valores:v,criada:e.criada};if(e.formato&&typeof e.formato==="object")reg.formato=Object.fromEntries(Object.entries(e.formato).filter(([,x])=>typeof x==="number"&&isFinite(x)));if(typeof e.cabeca==="string")reg.cabeca=e.cabeca.slice(0,30);
      const i=L.findIndex(q=>q.nome===reg.nome);if(i>=0)L[i]=reg;else L.push(reg)});
  }
  const refs=sc.list.slice(0,MAXM).map(o=>(o.referencias||[]).slice(0,32).map(validarReferencia));
  const chaves=(sc.chavesVento||[]).slice(0,256).map(v=>{
    if(!Number.isInteger(v.quadro)||v.quadro<0||v.quadro>100000)throw Error("Chave de vento inválida.");
    return {quadro:v.quadro,...ventoManga(v)};
  });
  SCN.chavesVento=chaves.sort((a,b)=>a.quadro-b.quadro);
  SCN.vento=vento;SCN.frameManga=Number.isInteger(sc.frameManga)?clamp(sc.frameManga,0,100000):0;
  SCN.list.length=0;SCN.seguirCamera=null;SCN.ultimaVistaOrientada=null;
  sc.list.slice(0,MAXM).forEach(o=>{const it=newInst(null,o.name);SL.forEach(d=>{const v=o.params&&o.params[d.k];if(typeof v==="number"&&isFinite(v))it.params[d.k]=clamp(v,d.min,d.max)});
    if(o.params&&NOMES_BIOTIPOS.includes(o.params._biotipo))it.params._biotipo=o.params._biotipo;it.params.headModel=modeloCabecaEstadoOrb(o.params&&o.params.headModel);
    it.hue=typeof o.hue==="number"?o.hue:null;it.col=o.col&&hex2rgb(o.col.fill)&&hex2rgb(o.col.ink)?o.col:null;
    if(o.modelosGuardados){
      const validos=["cadeira","mesa","bastao","cajado","espada","retangular","circular","eliptica","plana","personalizada"];
      it.modelosGuardados={};
      for(const lado of ["direita","esquerda"]){
        const v=o.modelosGuardados[lado];
        if(v&&validos.includes(v.modelo))it.modelosGuardados[lado]={modelo:v.modelo,
          nome:String(v.nome||v.modelo).slice(0,24),cor:/^#[0-9a-f]{6}$/i.test(v.cor)?v.cor:undefined,
          perfil:v.perfil};
      }
    }
    if(refs[SCN.list.length].length)it.referencias=refs[SCN.list.length];
    if(typeof o.exprNome==="string")it.exprNome=o.exprNome.slice(0,120);if(typeof o.montadoEm==="string")it.montadoEm=o.montadoEm.slice(0,24);it.congelado=!!o.congelado;it.oculto=!!o.oculto;if(typeof o.grupo==="string")it.grupo=o.grupo.slice(0,60);if(typeof o.papel==="string")it.papel=o.papel.slice(0,20);it.ordem=typeof o.ordem==="number"&&isFinite(o.ordem)?clamp(Math.round(o.ordem),-99,99):0;SCN.list.push(it)});
  SCN.exato=!!sc.exato;
  /* objetos da cena */
  SCN.objetos.length=0;SCN.objSel=null;
  if(Array.isArray(sc.objetos))sc.objetos.slice(0,300).forEach(o=>{try{if(o&&TIPOS_OBJETO[o.tipo]){const q=objetoPadrao(o.tipo),LIM={x:[-6000,6000],z:[-6000,6000],giro:[-180,180],larg:[0.05,6000],prof:[0.05,6000],alt:[0.05,3000],encosto:[0.5,12],cabeceira:[0.5,12],raio:[0.02,1000]};Object.keys(LIM).forEach(k=>{if(typeof o[k]==="number"&&isFinite(o[k]))q[k]=clamp(o[k],LIM[k][0],LIM[k][1])});
    if(o.perfilPega)q.perfilPega=normalizarPerfil(o.perfilPega);
    if(typeof o.modeloMao==="string"&&o.modeloMao.length<=16)q.modeloMao=o.modeloMao;
    if(o.gestoAnterior)q.gestoAnterior=Object.fromEntries(Object.entries(o.gestoAnterior).filter(([k,v])=>
      SLK[k]&&/^(handCurl|thumbOpp|fSpread|fTh|fIn|fMe|fAn|fMi)/.test(k)&&Number.isFinite(v)));
    if(Array.isArray(o.ajusteBase)&&o.ajusteBase.length===5&&o.ajusteBase.every(a=>
      a&&typeof a.dedo==="string"&&[a.folgaAntes,a.folga,a.penetracao].every(Number.isFinite))){
      q.ajusteBase=o.ajusteBase.map(({dedo,folgaAntes,folga,penetracao})=>({dedo:dedo.slice(0,16),folgaAntes,folga,penetracao}));
    }
    if(o.vistaPega==="guia")q.vistaPega="guia";
    if(Number.isFinite(o.comprimentoPega)&&o.comprimentoPega>0)q.comprimentoPega=Math.min(o.comprimentoPega,8);
    if(Number.isFinite(o.secaoPega)&&o.secaoPega>0)q.secaoPega=Math.min(o.secaoPega,4);
    if(q.raio!==undefined)q.larg=q.prof=2*q.raio;if(typeof o.nome==="string")q.nome=o.nome.slice(0,24);if(typeof o.grupo==="string")q.grupo=o.grupo.slice(0,60);if(o.chao)q.chao=true;q.id=novoIdObjeto();
    if(Array.isArray(o.rot3)&&o.rot3.length===9&&o.rot3.every(Number.isFinite))q.rot3=o.rot3.slice();
    if(o.animal&&typeof o.animal==="object"){try{const t=JSON.stringify(o.animal);if(t.length<20000)q.animal=JSON.parse(t);}catch(e){}}if(o.emAr)q.emAr=true;
    // Dinâmica V3 é persistida apenas com valores finitos (sem reexecutar a queda na carga).
    if(o.dinamica&&o.dinamica.versao===1&&
       ["gravidade","restituicao","atrito","tempo"].every(k=>Number.isFinite(o.dinamica[k]))&&
       o.dinamica.gravidade>0&&o.dinamica.gravidade<=1000&&
       o.dinamica.restituicao>=0&&o.dinamica.restituicao<=1&&
       o.dinamica.atrito>=0&&o.dinamica.atrito<=1&&
       [o.dinamica.velocidade,o.dinamica.angular].every(v=>
         Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))){
      q.dinamica={versao:1,ativo:!!o.dinamica.ativo,
        gravidade:o.dinamica.gravidade,restituicao:o.dinamica.restituicao,
        atrito:o.dinamica.atrito,tempo:Math.max(0,o.dinamica.tempo),
        velocidade:o.dinamica.velocidade.slice(),angular:o.dinamica.angular.slice(),
        ignorarDono:typeof o.dinamica.ignorarDono==="string"?o.dinamica.ignorarDono.slice(0,100):null,
        contato:o.dinamica.contato&&typeof o.dinamica.contato==="object"?
          {tipo:String(o.dinamica.contato.tipo||""),nome:String(o.dinamica.contato.nome||"").slice(0,60)}:null,
        impactos:Number.isInteger(o.dinamica.impactos)?Math.max(0,o.dinamica.impactos):0};
      q.emAr=true;
      if(Number.isFinite(o.base))q.base=o.base;
    }
    if(Array.isArray(o.sitesExtras))q.sitesExtras=o.sitesExtras.slice(0,30).filter(s=>s&&
      typeof s.id==="string"&&s.id.length<=40&&Array.isArray(s.local)&&s.local.length===3&&
      s.local.every(Number.isFinite)&&Array.isArray(s.normal)&&s.normal.length===3&&s.normal.every(Number.isFinite))
      .map(s=>({id:s.id,nome:String(s.nome||s.id),local:s.local.slice(),normal:s.normal.slice()}));
    if(o.emAr===true&&Number.isFinite(o.base)){q.emAr=true;q.base=o.base}
    if(o.sobreRel&&Array.isArray(o.sobreRel.M)&&o.sobreRel.M.length===9&&o.sobreRel.M.every(Number.isFinite)&&
      Array.isArray(o.sobreRel.T)&&o.sobreRel.T.length===3&&o.sobreRel.T.every(Number.isFinite))
      q.sobreRel={M:o.sobreRel.M.slice(),T:o.sobreRel.T.slice()};
    q.hue=typeof o.hue==="number"&&isFinite(o.hue)?o.hue:null;
    if(Array.isArray(o.frenteLocal)&&o.frenteLocal.length===3&&o.frenteLocal.every(Number.isFinite))q.frenteLocal=o.frenteLocal.slice();
    if(Array.isArray(o.cimaLocal)&&o.cimaLocal.length===3&&o.cimaLocal.every(Number.isFinite))q.cimaLocal=o.cimaLocal.slice();if(o.col&&hex2rgb(o.col.fill)&&hex2rgb(o.col.ink))q.col={fill:o.col.fill,ink:o.col.ink};if(Number.isInteger(o.sobre))q._sobre=o.sobre;
    if(o.tipo==="corda"&&Array.isArray(o.pontosCorda)){q.pontosCorda=o.pontosCorda.slice(0,80).filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)).map(p=>p.slice());q.raioCorda=clamp(+o.raioCorda||0.09,0.02,0.4);q.corrente=!!o.corrente;q.emAr=true;q.base=0;if(o.corda)q._corda={...o.corda}}
    if(Number.isFinite(o.semente))q.semente=o.semente;if(Number.isFinite(o.topo))q.topo=o.topo;
    if(Array.isArray(o.toques))q._toques=o.toques.slice(0,4);
    if(o.grip&&Number.isInteger(o.grip.mannequinIndex))q._grip={...o.grip};
    if(o.gripV3&&Number.isInteger(o.gripV3.mannequinIndex))q._gripV3={...o.gripV3};
    if(Array.isArray(o.frenteLocal)&&o.frenteLocal.length===3&&o.frenteLocal.every(Number.isFinite))q.frenteLocal=o.frenteLocal.slice();
    if(Array.isArray(o.cimaLocal)&&o.cimaLocal.length===3&&o.cimaLocal.every(Number.isFinite))q.cimaLocal=o.cimaLocal.slice();

    SCN.objetos.push(q)}else SCN.objetos.push(null)}catch(e){SCN.objetos.push(null)}});
  /* apoio de objeto em objeto (guardado pelo índice) e cores que faltarem */
  {const arr=SCN.objetos.slice();SCN.objetos.length=0;arr.forEach(q=>{if(q)SCN.objetos.push(q)});
   arr.forEach(q=>{if(q&&q._corda){const c=q._corda,m=SCN.list[c.manequimIndex],ob=arr[c.objetoIndex];if(m&&ob)q.corda={manequim:m.id,maos:Array.isArray(c.maos)?c.maos.filter(v=>v===1||v===-1):[-1],objeto:ob.id,local:Array.isArray(c.local)&&c.local.length===3?c.local.slice():[0,0,0],sobra:+c.sobra||3};delete q._corda}
     if(q&&q._toques){q.toques=q._toques.map(t=>({side:t.side===1?1:-1,mannequinId:SCN.list[t.mannequinIndex]?.id})).filter(t=>t.mannequinId!==undefined);delete q._toques}});
   SCN.objetos.forEach(q=>{if(q._sobre!==undefined){const s=arr[q._sobre];q.sobre=s&&s!==q?s.id:null;delete q._sobre}if(q.hue===null&&!q.col)q.hue=nextHue(q)});atualizarApoios();}
  /* Restaurar vínculo cinemático com o NOVO ID do manequim. */
  SCN.objetos.forEach(o=>{if(o._grip){
    const g=o._grip,m=SCN.list[g.mannequinIndex];
    if(m&&(g.side===1||g.side===-1)&&Array.isArray(g.offset)&&g.offset.length===3&&g.offset.every(Number.isFinite))
      o.grip={version:1,mannequinId:m.id,side:g.side,offset:g.offset.slice(),yawOffset:Number.isFinite(g.yawOffset)?g.yawOffset:0};
    delete o._grip;
  }});
  /* Grip V3: restaurar somente matrizes finitas e o novo ID do proprietário. */
  const validRigid=t=>t&&Array.isArray(t.M)&&t.M.length===9&&t.M.every(Number.isFinite)&&
    Array.isArray(t.T)&&t.T.length===3&&t.T.every(Number.isFinite);
  SCN.objetos.forEach(o=>{const g=o._gripV3;
    if(g){
      const owner=SCN.list[g.mannequinIndex];
      if(owner&&(g.side===1||g.side===-1)&&validRigid(g.relative))
        o.gripV3={version:3,mannequinId:owner.id,side:g.side,siteId:String(g.siteId||"auto"),
          relative:{M:g.relative.M.slice(),T:g.relative.T.slice()},
          ...(g.autoGrip&&typeof g.autoGrip==="object"&&g.autoGrip.version===1?
            {autoGrip:JSON.parse(JSON.stringify(g.autoGrip))}:{ }),
          ...(g.secundaria&&(g.secundaria.side===1||g.secundaria.side===-1)&&validRigid(g.secundaria.relative)?
            {secundaria:{side:g.secundaria.side,siteId:String(g.secundaria.siteId||"auto"),
               relative:{M:g.secundaria.relative.M.slice(),T:g.secundaria.relative.T.slice()},
               ...(Array.isArray(g.secundaria.palmLocal)&&g.secundaria.palmLocal.length===3&&
                 g.secundaria.palmLocal.every(Number.isFinite)?
                 {palmLocal:g.secundaria.palmLocal.slice()}:{} )}}:{})};
      delete o._gripV3;
    }
  });
  /* efeitos especiais: depois dos manequins e objetos (a âncora guarda o índice deles) */
  efeitosDoArquivo(sc.efeitos);
  SCN.meusEfeitos=[];if(Array.isArray(sc.meusEfeitos))importarModelosEfeito(sc.meusEfeitos);
  /* apoio (sentado em um objeto) guardado pelo índice do objeto */
  sc.list.slice(0,MAXM).forEach((o,i)=>{if(Number.isInteger(o.apoioEm)&&SCN.objetos[o.apoioEm])SCN.list[i].apoioEm=SCN.objetos[o.apoioEm].id});
  /* contatos permitidos (abraço, aperto de mão): guardados como índices na lista */
  sc.list.slice(0,MAXM).forEach((o,i)=>{if(Array.isArray(o.contato))SCN.list[i].contato=o.contato.filter(j=>Number.isInteger(j)&&SCN.list[j]&&j!==i).map(j=>SCN.list[j].id)});
  if(sc.colisao&&typeof sc.colisao==="object"){try{if(sc.colisao.modo)setModoColisao(sc.colisao.modo)}catch(e){}try{if(sc.colisao.preferir)setPreferir(sc.colisao.preferir)}catch(e){}COL.composicao=!!sc.colisao.composicao;
    try{setContatoV2({enabled:!!sc.colisao.detalhada,level:sc.colisao.nivelV2||"fine",tol:sc.colisao.tolV2??.07})}catch(e){setContatoV2(false)}
  }else setContatoV2(false)
  if(SCN.list.length>1&&SCN.list[0].hue===null&&false)SCN.list[0].hue=nextHue();
  SCN.active=clamp(sc.active|0,0,SCN.list.length-1);setP(SCN.list[SCN.active].params);
  if(sc.camera)CAMK.forEach(k=>{const d=SLK[k];if(typeof sc.camera[k]==="number"&&d)P[k]=clamp(sc.camera[k],d.min,d.max)});
  if(sc.camera&&typeof sc.camera.lens!=="number"){P.persp=1;P.lens=DEF.lens;P.atmo=DEF.atmo;P.camDist=clamp(zoomToDist(P,P.zoom||1),0.3,30000)}
  /* Restaura o alvo e a região de foco. IDs de objetos mudam no JSON,
     então persistimos seu índice e recuperamos o novo ID aqui. */
  SCN.pivo=null;SCN.orbitaArea=null;
  if(sc.vistaOrientada&&typeof sc.vistaOrientada==="object"){
    const v=sc.vistaOrientada;
    if(Number.isFinite(v.azimute)&&Number.isFinite(v.elevacao)&&typeof v.referencia==="string"&&
      ["anatomico","mundo"].includes(v.vertical))
      SCN.ultimaVistaOrientada={azimute:v.azimute,elevacao:v.elevacao,referencia:v.referencia,vertical:v.vertical,limitado:!!v.limitado};
  }
  if(sc.seguirCamera&&typeof sc.seguirCamera==="object"){
    const q=sc.seguirCamera,items=q.tipo==="objeto"?SCN.objetos:q.tipo==="manequim"?SCN.list:[];
    const it=Number.isInteger(q.indice)?items[q.indice]:null;
    if(it&&q.opts&&typeof q.opts==="object")SCN.seguirCamera={uid:it.id,tipo:q.tipo,opts:{...q.opts}};
  }
  if(sc.orbita&&typeof sc.orbita==="object"){
    let alvo=sc.orbita.alvo;
    if(alvo&&typeof alvo==="object"&&!Array.isArray(alvo)&&alvo.tipo==="objeto"){
      const o=SCN.objetos[alvo.indice];alvo=o?{id:o.id}:null;
    }
    if(alvo!==null&&alvo!==undefined){
      SCN.pivo=alvo;
      if(typeof sc.orbita.area==="string")SCN.orbitaArea=sc.orbita.area;
    }
  }
}

export { applyState, sceneState, loadScene };
