/* GeoMannequin — órbita focal: alvo, região, azimute, elevação
 * e proximidade independentes. Os controles não alteram a pose. */
import { $ } from "../scene/ambiente.js";
import { P, SCN } from "../scene/modelo.js";
import { orbitarCamera, passoOrbita, pivoCamera, resolverAlvo, vistaAtual, nomeVista, verOrientadaCamera, seguirOrientacaoCamera, pararSeguimentoCamera, estadoSeguimentoCamera } from "../scene/orbita.js";
import { regioesDisponiveisOrbita } from "../scene/regioes-orbita.js";
import { render } from "./palco.js";
import { syncControls } from "./controles.js";

const escO=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
/* seleção por ID estável para objetos; manequins mantêm nomes da API. */
function pivoDoValor(v){
 if(!v)return null;
 if(v==="cena")return "cena";
 if(v.startsWith("m:"))return v.slice(2);
 if(v.startsWith("o:")){
  const o=SCN.objetos.find(x=>String(x.id)===v.slice(2));
  return o?{id:o.id}:null;
 }
 return null;
}
function valorDoPivo(){
 const p=SCN.pivo;if(p===undefined||p===null)return "";
 if(p==="cena"||p==="todos")return "cena";
 if(typeof p==="number")return SCN.list[p]?"m:"+SCN.list[p].name:"";
 if(typeof p==="string"){
  if(SCN.list.some(x=>x.name===p))return "m:"+p;
  const o=SCN.objetos.find(x=>x.nome===p||x.tipo===p);
  return o?"o:"+o.id:"";
 }
 if(typeof p==="object"&&p.id!==undefined)return "o:"+p.id;
 return "";
}
function encherPivos(){
 const sel=$("orbPivo");if(!sel)return;
 const v=valorDoPivo();
 sel.innerHTML='<option value="">alvo livre da câmera</option><option value="cena">a cena inteira</option>'+
   (SCN.list.length?'<optgroup label="Manequins">'+SCN.list.map(it=>'<option value="m:'+escO(it.name)+'">'+escO(it.name)+'</option>').join("")+'</optgroup>':"")+
   (SCN.objetos.length?'<optgroup label="Objetos">'+SCN.objetos.map(o=>'<option value="o:'+o.id+'">'+escO(o.nome||o.tipo)+'</option>').join("")+'</optgroup>':"");
 sel.value=v;
}
function encherAreas(){
 const target=$("orbPivo"),areas=$("orbArea");if(!target||!areas)return;
 const tipo=target.value.startsWith("o:")?"objeto":target.value==="cena"?"cena":"manequim";
 const lista=tipo==="cena"?[["","Cena inteira"]]:regioesDisponiveisOrbita(tipo);
 const atual=SCN.orbitaArea||"";
 areas.innerHTML="";
 for(const [value,label]of lista){const opt=document.createElement("option");opt.value=value;opt.textContent=label;areas.add(opt);}
 areas.value=lista.some(([v])=>v===atual)?atual:"";
 areas.disabled=tipo==="cena";
}
function informacaoOrbita(){
 const out=$("orbInfo");if(!out)return;
 let A=null;try{if(SCN.pivo!==undefined&&SCN.pivo!==null)A=resolverAlvo(SCN.pivo,{area:SCN.orbitaArea});}catch(e){A=null;}
 const v=SCN.ultimaVistaOrientada||vistaAtual(A),area=A&&A.area?(" · região "+A.area.replace(/_/g," ")):"";
 out.textContent=A?"Pivô: "+A.nome+area+" · vista "+nomeVista(v.azimute)+" · "+Math.round(v.elevacao)+"° de elevação"+(v.referencia?" · eixo "+v.referencia:"")+(estadoSeguimentoCamera().ativo?" · acompanhando rotação":"")+(v.limitado?" · ⚠ limite vertical do renderizador":""):
  "Sem pivô: a câmera gira em volta do próprio alvo.";
 const campo=$("orbElev");if(campo&&document.activeElement!==campo)campo.value=Math.round(v.elevacao);
 document.querySelectorAll("#orbPainel [data-vista]").forEach(b=>b.classList.toggle("on",!!A&&Math.abs(((+b.dataset.vista-v.azimute+540)%360)-180)<1));
}
function logOrbita(t){const out=$("orbInfo");if(out)out.textContent=t;}
function feitoOrbita(){syncControls();render();informacaoOrbita();}
function folgaOrbita(){const f=Number($("orbFolga")?.value);return Number.isFinite(f)&&f>0?f:1.08;}
function elevOrbita(){const v=Number($("orbElev")?.value);if(!Number.isFinite(v)||v< -70||v>70)throw Error("Elevação: valor entre -70° e 70°.");return v;}
function alvoOrbita(){return pivoDoValor($("orbPivo")?.value)||"ativo";}
function opcoesAnatomicas(lado){return {
 lado,referencia:$("orbReferencia")?.value||"tronco",vertical:$("orbVertical")?.value||"anatomico",
 area:$("orbArea").value||null,elevacao:elevOrbita(),folga:folgaOrbita(),enquadrar:$("orbEnq").checked,
 exigirFrente:true};}
function vistaAnatomica(lado){
 const target=alvoOrbita(),opts=opcoesAnatomicas(lado);
 if(target==="cena"){pararSeguimentoCamera();orbitarCamera(target,{...opts,azimute:lado});}
 else if($("orbSeguir")?.checked)seguirOrientacaoCamera(target,opts);
 else verOrientadaCamera(target,opts);
 feitoOrbita();
}
function aplicarAreaOrbita(){
 const sel=$("orbPivo");if(!sel.value)sel.value="m:"+SCN.list[SCN.active].name;
 const t=alvoOrbita(),area=$("orbArea").value||null,A=resolverAlvo(t),
   az=SCN.ultimaVistaOrientada?.azimute??vistaAtual(A).azimute;
 vistaAnatomica(az);
}
export function atualizarOrbita(){encherPivos();encherAreas();informacaoOrbita();if($("orbSeguir"))$("orbSeguir").checked=estadoSeguimentoCamera().ativo;}
export function iniciarOrbita(){
 const sel=$("orbPivo");if(!sel)return;
 encherPivos();encherAreas();informacaoOrbita();
 sel.addEventListener("pointerdown",()=>{encherPivos();encherAreas();});
 sel.addEventListener("focus",()=>{encherPivos();encherAreas();});
 sel.addEventListener("change",()=>{
  const alvo=pivoDoValor(sel.value);
  try{
    pararSeguimentoCamera();SCN.ultimaVistaOrientada=null;if($("orbSeguir"))$("orbSeguir").checked=false;
    if(alvo===null){SCN.pivo=null;SCN.orbitaArea=null;pararSeguimentoCamera();}
    else pivoCamera(alvo,{area:null,enquadrar:$("orbEnq").checked,folga:folgaOrbita()});
    encherAreas();feitoOrbita();
  }catch(e){logOrbita(e.message);}
 });
 $("orbArea").addEventListener("change",()=>{
  try{aplicarAreaOrbita();}catch(e){logOrbita(e.message);}
 });
 $("orbElev").addEventListener("change",()=>{
  try{aplicarAreaOrbita();}catch(e){logOrbita(e.message);}
 });
 $("orbFolga").addEventListener("change",()=>{
  try{aplicarAreaOrbita();}catch(e){logOrbita(e.message);}
 });
 $("orbEnq").addEventListener("change",()=>{
  if(SCN.pivo!==null&&SCN.pivo!==undefined)
   try{aplicarAreaOrbita();}catch(e){logOrbita(e.message);}
 });
 document.querySelectorAll("#orbPainel [data-vista]").forEach(b=>b.addEventListener("click",()=>{
  try{
   if(!sel.value)sel.value="m:"+SCN.list[SCN.active].name;
   vistaAnatomica(+b.dataset.vista);
  }catch(e){logOrbita(e.message);}
 }));
 document.querySelectorAll("#orbPainel [data-orb]").forEach(b=>b.addEventListener("click",()=>{
  const [a,e]=b.dataset.orb.split(",").map(Number);
  pararSeguimentoCamera();if($("orbSeguir"))$("orbSeguir").checked=false;
  passoOrbita(a,e);feitoOrbita();
 }));
 for(const id of ["orbReferencia","orbVertical"]){
   $(id)?.addEventListener("change",()=>{try{
     const A=resolverAlvo(alvoOrbita());
     vistaAnatomica(SCN.ultimaVistaOrientada?.azimute??vistaAtual(A).azimute);
   }catch(e){logOrbita(e.message)}});
 }
 $("orbSeguir")?.addEventListener("change",()=>{try{
   const A=resolverAlvo(alvoOrbita()),az=SCN.ultimaVistaOrientada?.azimute??vistaAtual(A).azimute;
   vistaAnatomica(az);
 }catch(e){$("orbSeguir").checked=false;logOrbita(e.message)}});
 document.addEventListener("pointerup",()=>setTimeout(informacaoOrbita,0));
}
