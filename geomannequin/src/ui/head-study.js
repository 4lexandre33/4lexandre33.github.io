/* Interface do modo de folha anatômica V4.2.
 * Somente monta uma folha com os renders reais do mesmo manequim; não altera
 * câmera/cor/pose do editor, e volta exatamente ao editor anterior. */
import {P} from "../scene/modelo.js";
import {syncControls} from "./controles.js";
import {draw} from "./palco.js";
import {buildHeadStudySvg} from "../engine/head-v4/study-sheet.js";

let panel=null,content=null,lastSvg="",busy=false;
const ID="gm42Sheet";
function saveSvg(){
 if(!lastSvg)return;
 const blob=new Blob([lastSvg],{type:"image/svg+xml;charset=utf-8"});
 const url=URL.createObjectURL(blob),link=document.createElement("a");
 link.href=url;link.download="geomannequin-cabeca-v4-2-estudo-anatomico.svg";
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),2500);
}
function closeSheet(){
 if(panel)panel.hidden=true;
 document.body.classList.remove("gm42-open");
 const open=document.getElementById("headStudyOpen");
 if(open)open.focus({preventScroll:true});
}
function updateSheet(){
 if(busy||!content)return;
 busy=true;
 content.innerHTML='<div class="gm42-loading" role="status">Gerando vistas anatômicas vetoriais da Cabeça V4.2…</div>';
 requestAnimationFrame(()=>{
  try{
   /* Se o usuário editar o manequim, reconstruir com os parâmetros atuais.
      As cinco câmeras são independentes do editor e nunca alteram P.yaw. */
   const wire=document.getElementById("gm42Wire").checked;
   lastSvg=buildHeadStudySvg(P,{wire});
   content.innerHTML=lastSvg;
   document.getElementById("gm42Status").textContent=
    "Folha V4.2 pronta • cinco câmeras • geometria real • SVG vetorial";
   document.getElementById("gm42Save").disabled=false;
  }catch(e){
   lastSvg="";
   content.textContent="Não foi possível gerar a folha: "+(e?.message||String(e));
   document.getElementById("gm42Status").textContent="Erro na geração; confira parâmetros e console";
   document.getElementById("gm42Save").disabled=true;
  }finally{busy=false}
 });
}
function openSheet(){
 if(!panel)return;
 P.headModel="v4_anatomical";
 syncControls();
 panel.hidden=false;
 document.body.classList.add("gm42-open");
 document.getElementById("gm42Close").focus({preventScroll:true});
 updateSheet();
}
function buildPanel(){
 panel=document.createElement("section");
 panel.id=ID;
 panel.className="gm42-shell";
 panel.hidden=true;
 panel.setAttribute("role","dialog");
 panel.setAttribute("aria-modal","true");
 panel.setAttribute("aria-labelledby","gm42Header");
 panel.innerHTML=
  '<header class="gm42-bar">'+
    '<div class="gm42-heading"><strong id="gm42Header">GeoMannequin / Estudo Anatômico V4.2</strong>'+
    '<small id="gm42Status">Visualização técnica derivada da malha 3D</small></div>'+
    '<div class="gm42-actions">'+
       '<label><input type="checkbox" id="gm42Wire" checked> Malha construtiva</label>'+
       '<button type="button" id="gm42Refresh">Atualizar folha</button>'+
       '<button type="button" id="gm42Save" disabled>Baixar SVG</button>'+
       '<button type="button" id="gm42Close">Voltar ao editor</button>'+
    '</div>'+
  '</header>'+
  '<div class="gm42-viewport"><div id="gm42Svg" class="gm42-sheet" role="region" aria-label="Folha anatômica com perfil, três quartos, frontal, detalhes e notas"></div></div>';
 document.body.appendChild(panel);
 content=panel.querySelector("#gm42Svg");
 panel.querySelector("#gm42Save").addEventListener("click",saveSvg);
 panel.querySelector("#gm42Close").addEventListener("click",closeSheet);
 panel.querySelector("#gm42Refresh").addEventListener("click",updateSheet);
 panel.querySelector("#gm42Wire").addEventListener("change",updateSheet);
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&panel&&!panel.hidden){e.preventDefault();closeSheet();}
 });
}
export function iniciarHeadStudy(){
 buildPanel();
 const open=document.getElementById("headStudyOpen");
 if(open)open.addEventListener("click",openSheet);
 const params=new URLSearchParams(location.search);
 if(params.get("study")==="v42"){
  /* O link direto abre a folha como primeira tela sem exibir uma imagem estática. */
  requestAnimationFrame(openSheet);
 }
 if(typeof window!=="undefined")window.gmHeadStudy={
  open:openSheet,close:closeSheet,refresh:updateSheet,
  exportSvg:()=>lastSvg||buildHeadStudySvg(P)
 };
}
