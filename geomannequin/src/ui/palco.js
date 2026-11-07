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
import { CX, CY, H, W, f1, renderScene } from "../engine/index.js";

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
function draw(){
  const r=renderScene(sceneList(),L,!!drag||quick,L.floor?16:0);
  svgEl.innerHTML=(L.grid?GRID:"")+wrapStyle(r.svg);
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
  clearTimeout(outTimer);outTimer=setTimeout(refreshOut,220);
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

export { gridSvg, GRID, svgEl, pending, outTimer, quick, settle, render, draw, lastInfo };
