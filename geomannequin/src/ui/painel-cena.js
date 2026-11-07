/* GeoMannequin — painel da cena: lista de manequins, botões e cores */
import { $ } from "../scene/ambiente.js";
import { SCN, addInst, delInst, dupInst, instColors, nextHue, setActive, setColor } from "../scene/modelo.js";
import { fr } from "../scene/parametros.js";
import { syncControls } from "./controles.js";
import { render } from "./palco.js";
import { autoFit } from "../scene/enquadrar.js";

function sceneMsg(t,err){const m=$("sceneMsg");m.textContent=t||"";m.className="msg"+(t?(err?" err":" ok"):"")}
function refreshScene(){
  const box=$("sceneList");box.innerHTML="";
  SCN.list.forEach((it,i)=>{
    const c=instColors(it),b=document.createElement("button");
    b.type="button";b.className="scene-item";b.setAttribute("role","option");b.setAttribute("aria-selected",String(i===SCN.active));
    b.innerHTML='<span class="sw2" style="background:'+c.fill+';border-color:'+c.ink+'"></span><span></span><small>x '+fr(it.params.wx,1)+' · z '+fr(it.params.wz,1)+' · '+Math.round(it.params.wRot)+'°</small>';
    b.children[1].textContent=it.name;
    b.addEventListener("click",()=>setActive(i));
    box.appendChild(b);
  });
  const it=SCN.list[SCN.active],c=instColors(it);
  $("mName").value=it.name;$("mFill").value=c.fill;$("mInk").value=c.ink;
  $("mDel").disabled=SCN.list.length<2;
}
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
  $("mAuto").addEventListener("click",()=>{const it=SCN.list[SCN.active];it.col=null;it.hue=it===SCN.list[0]?null:nextHue(it);refreshScene();render()});
}

export { sceneMsg, refreshScene, moveMode, onColor };
