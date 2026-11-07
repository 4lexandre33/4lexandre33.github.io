/* GeoMannequin — palco: desenha a cena na tela, grade e leitura da câmera */
import { $ } from "../scene/ambiente.js";
import { P, SCN, sceneList } from "../scene/modelo.js";
import { L } from "../scene/modos.js";
import { drag } from "./arrastar.js";
import { refreshOut, wrapStyle } from "./exportar.js";
import { fr } from "../scene/parametros.js";
import { eyeHeight } from "../scene/enquadrar.js";
import { sceneState } from "../scene/estado.js";
import { styleName } from "../scene/paletas.js";
import { CX, CY, H, W, comporCamadas, effScale, f1, guardarCamada, prepararCamadas, renderGrupoLocal, renderScene } from "../engine/index.js";
import { paraleloAtivo, pedirCamada } from "./trabalhadores.js";
import { COL, colisoesDaCena, composicaoDaCena } from "../scene/colisoes.js";
import { telaDoMundo } from "../engine/index.js";

/* grade da tela */
function gridSvg(){
  let g="";
  for(let x=0;x<=W;x+=25){const major=x%100===0;g+='<path d="M'+x+' 0V'+H+'" style="stroke:var(--'+(major?'grid-major':'grid')+');stroke-width:1;fill:none"/>'}
  for(let y=0;y<=H;y+=25){const major=y%100===0;g+='<path d="M0 '+y+'H'+W+'" style="stroke:var(--'+(major?'grid-major':'grid')+');stroke-width:1;fill:none"/>'}
  g+='<path d="M'+CX+' 0V'+H+'M0 '+CY+'H'+W+'" style="stroke:var(--grid-major);stroke-width:1.6;fill:none"/>';
  return g;
}
let GRID;
let svgEl;
let pending=false,outTimer=null,quick=false,settle=null;
function render(){
  if(pending)return;
  pending=true;
  requestAnimationFrame(()=>{pending=false;draw()});
}
/* cena em camadas: cada manequim é uma "foto" guardada; só as que mudaram são refeitas.
   Durante um arraste, a camada do manequim ativo é refeita aqui mesmo (resposta imediata); as outras vão para os
   Web Workers (vários núcleos) e entram na tela quando ficam prontas — até lá aparece a foto anterior. */
let camadasInfo=[],ULT={S:0,panX:0,panY:0};
function draw(){
  const lst=sceneList(),rapido=!!drag||quick,floor=L.floor?16:0;
  let r;
  if((!SCN.exato&&lst.filter(o=>!o.p._oculto).length>1)||lst.objetos.length){
    const plan=prepararCamadas(lst,L,rapido,floor,{canal:"tela"}),par=paraleloAtivo();
    plan.grupos.forEach(g=>{
      if(g.pronto)return;
      const ativo=g.membros[0]===SCN.active;
      if(!par||!g.res||(rapido&&ativo)){renderGrupoLocal(plan,g);return}
      const fastG=plan.fast;
      pedirCamada(g.slot,g.chave,g.job,res=>{if(res)guardarCamada(g.dono,g.slot,g.chave,fastG,res);render()});
    });
    r=comporCamadas(plan);camadasInfo=r.camadas;
  }else{r=renderScene(lst,L,rapido,floor,{exato:true});camadasInfo=[]}
  svgEl.innerHTML=(L.grid?GRID:"")+'<g id="gm-cena">'+wrapStyle(r.svg)+marcasColisao(lst)+'</g>';
  ULT={S:effScale(P),panX:P.panX,panY:P.panY};
  lastInfo=r.infos[SCN.active]||r.infos[0];
  const i=lastInfo;
  $("readout").innerHTML=
    "yaw <b>"+Math.round(P.yaw)+"°</b> · pitch <b>"+Math.round(P.pitch)+"°</b> · roll <b>"+Math.round(P.roll)+"°</b> · 1 R = <b>"+f1(i.S)+" px</b>"+(P.persp?" · lente <b>"+Math.round(P.lens)+" mm</b> · olhos a <b>"+fr(eyeHeight(),1)+" R</b> do chão":" · sem perspectiva");
  $("measures").innerHTML=
    "<dt>Altura da cabeça</dt><dd>"+fr(1-i.chinY,2)+" R</dd>"+
    "<dt>Largura do crânio</dt><dd>"+fr(2*P.skull,2)+" R</dd>"+
    "<dt>Terço do rosto</dt><dd>"+fr(i.t,2)+" R</dd>"+
    "<dt>Linha dos olhos</dt><dd>y = "+fr(i.eyeY,2)+" R</dd>"+
    "<dt>Altura / largura</dt><dd>"+fr((1-i.chinY)/(2*P.skull),2)+"</dd>";
  $("eq").textContent=
    "Crânio: elipsoide (sx, 1, 1)·r\n"+
    "  x = cx + r·cos t\n"+
    "  y = cy + r·sin t\n"+
    "  r = "+f1(i.S)+"  sx = "+fr(P.skull,2)+"\n\n"+
    "Linha das sobrancelhas (elipse)\n"+
    "  a = "+f1(i.brow.a)+"  b = "+f1(i.brow.b)+"\n"+
    "  θ = "+f1(i.brow.th)+"°\n\n"+
    "Eixo facial (elipse)\n"+
    "  a = "+f1(i.mer.a)+"  b = "+f1(i.mer.b)+"\n"+
    "  θ = "+f1(i.mer.th)+"°";
  try{localStorage.setItem("geomannequin.v8",JSON.stringify({scene:sceneState(),layers:L,style:styleName}))}catch(e){}
  clearTimeout(outTimer);if(!drag)outTimer=setTimeout(refreshOut,600);
  if(typeof window!=="undefined"&&window.dispatchEvent)try{window.dispatchEvent(new CustomEvent("gm:desenhou"))}catch(e){}
}
/* colisões: círculo nos pontos onde um manequim entra no outro (só na tela; não sai na exportação) */
function marcasColisao(lst){
  if(COL.modo==="desligado"||SCN.list.filter(it=>!it.oculto).length+SCN.objetos.length<2){COL.ultima=[];return ""}
  const cs=colisoesDaCena(),cp=COL.composicao?composicaoDaCena():(COL.ultimaComp=[]);if(!cs.length&&!cp.length)return "";
  const p0=lst[0].p;let g='<g id="gm-colisoes" pointer-events="none">';
  /* composição: círculo tracejado (não é erro, é aviso de desenho) */
  cp.forEach(c=>{if(c.pt&&isFinite(c.pt[0]))g+='<circle cx="'+f1(c.pt[0])+'" cy="'+f1(c.pt[1])+'" r="11" style="fill:none;stroke:var(--cobalt);stroke-width:1.6;stroke-dasharray:4 3"/>'});
  cs.forEach(c=>c.contatos.slice(0,3).forEach((k,i)=>{const q=telaDoMundo(p0,k.ponto);if(!isFinite(q[0])||!isFinite(q[1]))return;
    const r=i?6:9;g+='<circle cx="'+f1(q[0])+'" cy="'+f1(q[1])+'" r="'+r+'" style="fill:var(--coral);fill-opacity:.18;stroke:var(--coral);stroke-width:1.8"/>';
    if(!i)g+='<circle cx="'+f1(q[0])+'" cy="'+f1(q[1])+'" r="2" style="fill:var(--coral)"/>'}));
  return g+"</g>";
}
/* prévia instantânea para arrastar a tela e dar zoom: só transforma o desenho que já está na tela (não redesenha);
   o desenho certo vem quando o gesto termina */
function previa(){
  const g=svgEl&&svgEl.querySelector("#gm-cena");
  if(!g||!ULT.S){render();return}
  const S1=effScale(P),k=S1/ULT.S,dx=CX*(1-k)+S1*(P.panX-ULT.panX),dy=CY*(1-k)-S1*(P.panY-ULT.panY);
  g.setAttribute("transform","matrix("+k.toFixed(5)+" 0 0 "+k.toFixed(5)+" "+dx.toFixed(2)+" "+dy.toFixed(2)+")");
}
let lastInfo=null;

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarPalco(){
  GRID=gridSvg();
  svgEl=$("svg");
}

/* alteração de variáveis deste módulo por outros módulos */
export function setQuick(v){return quick=v}
export function setSettle(v){return settle=v}

export { gridSvg, GRID, svgEl, pending, outTimer, quick, settle, render, draw, lastInfo, previa, camadasInfo };
