/* GeoMannequin — painel da cena: lista de manequins, botões e cores */
import { $ } from "../scene/ambiente.js";
import { SCN, addInst, delInst, dupInst, instColors, nextHue, setActive, setColor } from "../scene/modelo.js";
import { fr } from "../scene/parametros.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";
import { autoFit } from "../scene/enquadrar.js";
import { arquivosCamadas, cenaCamadasSvg, fotoSvg, nomeArquivo } from "../scene/camadas-cena.js";
import { exportJson } from "./exportar.js";
import { criarZip } from "./zip.js";
import { ocupados, quantosTrabalhadores } from "./trabalhadores.js";

function sceneMsg(t,err){const m=$("sceneMsg");m.textContent=t||"";m.className="msg"+(t?(err?" err":" ok"):"")}
function refreshScene(){
  const box=$("sceneList");box.innerHTML="";
  SCN.list.forEach((it,i)=>{
    const c=instColors(it),b=document.createElement("button");
    b.type="button";b.className="scene-item";b.setAttribute("role","option");b.setAttribute("aria-selected",String(i===SCN.active));
    const tags=(it.congelado?'<span class="tag" title="Foto fixa">congelado</span>':'')+(it.oculto?'<span class="tag">oculto</span>':'')+(it.ordem?'<span class="tag" title="Ordem manual na pilha">'+(it.ordem>0?'frente':'trás')+'</span>':'');
    b.innerHTML='<span class="sw2" style="background:'+c.fill+';border-color:'+c.ink+'"></span><span></span>'+(tags?'<span class="tags">'+tags+'</span>':'')+'<small>x '+fr(it.params.wx,1)+' · z '+fr(it.params.wz,1)+' · '+Math.round(it.params.wRot)+'°</small>';
    b.children[1].textContent=it.name;b.dataset.oculto=String(!!it.oculto);
    b.addEventListener("click",()=>setActive(i));
    box.appendChild(b);
  });
  const it=SCN.list[SCN.active],c=instColors(it);
  $("mName").value=it.name;$("mFill").value=c.fill;$("mInk").value=c.ink;
  $("mDel").disabled=SCN.list.length<2;
  /* camada do manequim ativo */
  $("cOcultar").setAttribute("aria-pressed",String(!!it.oculto));$("cOcultar").textContent=it.oculto?"Mostrar":"Ocultar";
  $("cOcultar").disabled=!it.oculto&&SCN.list.filter(o=>!o.oculto).length<2;
  $("cCongelar").setAttribute("aria-pressed",String(!!it.congelado));$("cCongelar").textContent=it.congelado?"Descongelar":"Congelar";
  $("cExato").checked=!!SCN.exato;
  statusCamadas();
}
/* linha de estado: quantas camadas, quantos núcleos desenhando em paralelo */
function statusCamadas(){
  const el=$("cStatus");if(!el)return;
  const n=SCN.list.length,vis=SCN.list.filter(o=>!o.oculto).length,cg=SCN.list.filter(o=>o.congelado).length;
  if(SCN.exato){el.textContent="Modo exato: todos os manequins redesenhados juntos a cada mudança.";return}
  if(vis<2){el.textContent=n>1?"1 manequim visível: desenho direto.":"Com 2 ou mais manequins, cada um vira uma camada.";return}
  const nt=quantosTrabalhadores(),oc=ocupados();
  el.textContent=vis+" camadas"+(cg?" · "+cg+" congelada"+(cg>1?"s":""):"")+(nt?" · "+nt+" núcleo"+(nt>1?"s":"")+" em paralelo"+(oc?" · desenhando "+oc:""):" · desenho na página");
}
/* baixar um arquivo: no visualizador de artefatos do Claude pela permissão "downloads" (o visitante confirma);
   no navegador comum, por link. Devolve "ok", "recusado" ou "indisponivel". */
let DL;
async function baixar(nome,dados,tipo){
  try{
    if(typeof window!=="undefined"&&window.claude&&typeof window.claude.use==="function"){
      if(DL===undefined)DL=await window.claude.use("downloads");
      if(DL){try{await DL.save({filename:nome,data:new Blob([dados],{type:tipo})});return "ok"}catch(e){return e&&e.code==="declined"?"recusado":"indisponivel"}}
      return "indisponivel";
    }
    const url=URL.createObjectURL(new Blob([dados],{type:tipo}));const a=document.createElement("a");a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);return "ok";
  }catch(e){return "indisponivel"}
}
function mostrarNaExportacao(txt){const ta=$("out");if(ta){ta.value=txt;ta.readOnly=true}}
function acaoCamada(fn,msg){try{fn(SCN.list[SCN.active]);sceneMsg(msg||"");refreshScene();syncControls();render()}catch(e){sceneMsg(e.message,true)}}
let moveMode=false;
const onColor=()=>{try{setColor(SCN.list[SCN.active],$("mFill").value,$("mInk").value);sceneMsg("Cor aplicada.");refreshScene();render()}catch(e){sceneMsg(e.message,true);refreshScene()}};

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarPainelCena(){
  $("mAdd").addEventListener("click",()=>{try{addInst();sceneMsg("Manequim adicionado.")}catch(e){sceneMsg(e.message,true)}});
  $("mDup").addEventListener("click",()=>{try{dupInst(SCN.list[SCN.active]);sceneMsg("Cópia criada ao lado.")}catch(e){sceneMsg(e.message,true)}});
  $("mDel").addEventListener("click",()=>{try{delInst(SCN.list[SCN.active]);refreshScene();syncControls();render();sceneMsg("Manequim removido.")}catch(e){sceneMsg(e.message,true)}});
  $("mFitAll").addEventListener("click",()=>{autoFit();syncControls();render()});
  $("mFitOne").addEventListener("click",()=>{autoFit(SCN.active);syncControls();render()});
  $("mMove").addEventListener("click",()=>{moveMode=!moveMode;$("mMove").setAttribute("aria-pressed",String(moveMode));sceneMsg(moveMode?"Arraste o manequim ativo para movê-lo no chão.":"")});
  $("mName").addEventListener("change",()=>{const v=$("mName").value.trim();if(v){SCN.list[SCN.active].name=v;refreshScene()}});
  $("mFill").addEventListener("change",onColor);
  $("mInk").addEventListener("change",onColor);
  $("cOcultar").addEventListener("click",()=>acaoCamada(it=>{
    if(!it.oculto&&SCN.list.filter(o=>!o.oculto).length<2)throw new Error("Pelo menos um manequim precisa ficar visível.");
    it.oculto=!it.oculto},SCN.list[SCN.active].oculto?"Manequim visível de novo.":"Manequim oculto (não é desenhado nem exportado)."));
  $("cCongelar").addEventListener("click",()=>acaoCamada(it=>{it.congelado=!it.congelado},SCN.list[SCN.active].congelado?"Descongelado: volta a acompanhar a câmera.":"Congelado: a foto deste manequim fica fixa."));
  $("cFrente").addEventListener("click",()=>acaoCamada(it=>{it.ordem=Math.min(99,Math.max(0,...SCN.list.filter(o=>o!==it).map(o=>o.ordem||0))+1)},"Desenhado por cima dos outros."));
  $("cTras").addEventListener("click",()=>acaoCamada(it=>{it.ordem=Math.max(-99,Math.min(0,...SCN.list.filter(o=>o!==it).map(o=>o.ordem||0))-1)},"Desenhado por baixo dos outros."));
  $("cAuto").addEventListener("click",()=>acaoCamada(it=>{it.ordem=0},"Ordem pela distância da câmera."));
  $("cExato").addEventListener("change",()=>{SCN.exato=$("cExato").checked;refreshScene();render()});
  const fimBaixar=(r,ok,naCaixa)=>sceneMsg(r==="ok"?ok:r==="recusado"?"Download cancelado."+(naCaixa?" O SVG está na caixa abaixo.":""):naCaixa?"Pronto na caixa SVG abaixo: copie e salve como .svg.":"Este visualizador não permite baixar arquivos; use “Cena em camadas (.svg)” e copie da caixa abaixo.");
  $("cFoto").addEventListener("click",async()=>{try{const it=SCN.list[SCN.active],svg=fotoSvg(SCN.active);mostrarNaExportacao(svg);
    fimBaixar(await baixar(nomeArquivo(it.name)+".svg",svg,"image/svg+xml"),"Foto de “"+it.name+"” baixada (também está na caixa SVG abaixo).",true)}catch(e){sceneMsg(e.message,true)}});
  $("cExportar").addEventListener("click",async()=>{try{const svg=cenaCamadasSvg();mostrarNaExportacao(svg);
    fimBaixar(await baixar("geomannequin-camadas.svg",svg,"image/svg+xml"),"Cena em camadas baixada (também está na caixa SVG abaixo).",true)}catch(e){sceneMsg(e.message,true)}});
  $("cZip").addEventListener("click",async()=>{try{const fx=arquivosCamadas(exportJson()),z=criarZip(fx);
    fimBaixar(await baixar("geomannequin-camadas.zip",z,"application/zip"),fx.length+" arquivos baixados em geomannequin-camadas.zip.",false)}catch(e){sceneMsg(e.message,true)}});
  if(typeof window!=="undefined")window.addEventListener("gm:desenhou",statusCamadas);
  setInterval(()=>{if(ocupados())statusCamadas()},400);
  $("mAuto").addEventListener("click",()=>{const it=SCN.list[SCN.active];it.col=null;it.hue=it===SCN.list[0]?null:nextHue(it);refreshScene();render()});
}

export { sceneMsg, refreshScene, moveMode, onColor, statusCamadas, baixar };
