/* GeoMannequin · Head Study V4.2 · compositor vetorial.
 * Renders REAIS de uma única geometria em ângulos diferentes.
 * Sem screenshots, imagens embutidas, canvas raster ou substitutos 2D.
 * Usa coordenadas normalizadas de folha para comparar com o alvo aprovado.
 */
import {renderScene} from "../cena.js";
import {newCache} from "../montagem.js";
import {DEF} from "../padroes.js";
export const STUDY_SIZE={width:1400,height:1050};
export const STUDY_TOKENS=Object.freeze({
 paper:"#fffcfd",grid:"#e9e9ef",gridMajor:"#d9dfe8",
 ink:"#85485f",detail:"#b3778f",fill:"#f7dfe9",
 shade1:"#edc4d4",shade2:"#dca4b8",shade3:"#b77a92",
 red:"#e5a0b3",blue:"#b3c9dd",pale:"#faf0f4"
});
const escapeXml=v=>String(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
 .replace(/"/g,"&quot;").replace(/'/g,"&apos;");
const layers=(wire=true)=>({
 sil:1,fill:1,shade:1,sphere:0,planes:1,rings:wire?1:0,merid:wire?1:0,
 jaw:1,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:0,
 arms:0,hands:0,legs:0,hidden:0,grid:0,prop:0,floor:0,shadow:0,
 horizon:0,fibras:0,cel:0,ossos:0,ocultas:0
});
export const STUDY_VIEWS=[
 {id:"profile",yaw:-90,pitch:0,roll:0,zoom:2.16,panY:-.51},
 {id:"threequarter",yaw:-40,pitch:3,roll:0,zoom:1.65,panY:-.46},
 {id:"front",yaw:0,pitch:0,roll:0,zoom:1.59,panY:-.44},
 {id:"back",yaw:145,pitch:4,roll:0,zoom:1.48,panY:-.49},
 {id:"tilt",yaw:-43,pitch:12,roll:-12,zoom:1.51,panY:-.48}
];
function makePalette(){
 const c=STUDY_TOKENS;
 return {cobalt:c.blue,coral:c.red,ink:c.ink,fill:c.fill,
  shade1:c.shade1,shade2:c.shade2,shade3:c.shade3};
}
function modelForView(model,v){
 const p={...DEF,...model};
 Object.assign(p,{headModel:"v4_anatomical",headDetail:1,persp:0,atmo:0,
  camDist:30,lens:50,yaw:v.yaw,pitch:v.pitch,roll:v.roll,zoom:v.zoom,
  panX:0,panY:v.panY,tx:0,ty:0,tz:0,wx:0,wy:0,wz:0,wRot:0,
  headYaw:0,headPitch:0,headRoll:0,neckTwist:0,neckFlex:0,neckSide:0,
  bodyRoll:0,bodyPitch:0,jawOpen:0,lightAz:-42,lightEl:54,
  bg:"#fffcfd",_cache:newCache(),_oculto:false});
 return p;
}
function viewRender(model,view,renderer,wire){
 const p=modelForView(model,view);
 const r=renderer([{p,pal:makePalette(),gy:0}],layers(wire),false,0,{exato:true});
 if(!r||typeof r.svg!=="string"||!r.svg.length||/NaN|Infinity|undefined/.test(r.svg))
   throw new Error("Falha de desenho na vista "+view.id);
 return r.svg;
}
const line=(x,y,text,size=13,opts="")=>'<text x="'+x+'" y="'+y+'" font-size="'+size+
 '" '+opts+'>'+escapeXml(text)+'</text>';
function renderWindow(raw,x,y,w,h,sourceBox="0 0 600 700",opt={}){
 /* SVG aninhado limita o recorte corretamente: não reescala a malha em 2D. */
 const border=opt.border?'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
  '" rx="12" fill="none" stroke="#d9a5b8" stroke-width="1.4"/>':"";
 return '<svg x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
  '" viewBox="'+sourceBox+'" preserveAspectRatio="xMidYMid meet" overflow="hidden">'+
  raw+'</svg>'+border;
}
function annotationCard(x,y,w,h,view,label,caption,crop){
 return '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+
   '" rx="10" fill="#fef8fa" stroke="#dba9bd" stroke-width="1.4"/>'+
   renderWindow(view,x+3,y+3,w-6,h-6,crop)+
   line(x,y+h+29,label,13,'font-weight="650"')+
   line(x,y+h+46,caption,12);
}
function minicell(raw,x,y,s,sourceBox,opacity=1){
 return '<g opacity="'+opacity+'">'+renderWindow(raw,x,y,s,s,sourceBox)+'</g>';
}
function sheetFrame(){
 const {paper,grid,gridMajor,ink}=STUDY_TOKENS;
 return '<defs>'+
  '<pattern id="gm42Minor" width="25" height="25" patternUnits="userSpaceOnUse">'+
  '<path d="M25 0H0V25" fill="none" stroke="'+grid+'" stroke-width=".75"/></pattern>'+
  '<pattern id="gm42Major" width="125" height="125" patternUnits="userSpaceOnUse">'+
  '<path d="M125 0H0V125" fill="none" stroke="'+gridMajor+'" stroke-width="1.1"/></pattern>'+
  '</defs><rect width="1400" height="1050" fill="'+paper+'"/>'+
  '<rect width="1400" height="1050" fill="url(#gm42Minor)"/>'+
  '<rect width="1400" height="1050" fill="url(#gm42Major)"/>'+
  '<g font-family="Arial, Helvetica, sans-serif" fill="'+ink+'">';
}
function sheetText(){
 let s='<g letter-spacing="1.25">'+
 line(39,41,"ANATOMICAL HEAD STUDY — V4.2 REFINED",26,'font-weight="500"')+
 line(40,66,"ANATOMICAL MANNEQUIN  /  MATHEMATICAL CONSTRUCTION + FORMS",12,'letter-spacing="2.2"')+
 '<rect x="1115" y="20" width="248" height="37" rx="9" fill="#fff9fb" stroke="#ad778e" stroke-width="1.5"/>'+
 line(1130,45,"V4.2 — REFINED STUDY",15,'font-weight="650"')+
 line(299,835,"LEFT PROFILE (UPDATED V4.2)",15,'text-anchor="middle" font-weight="650"')+
 line(299,853,"— PRIMARY VIEW —",13,'text-anchor="middle"')+
 line(877,486,"THREE-QUARTER VIEW",13,'text-anchor="middle" font-weight="650"')+
 line(877,502,"(LEFT FRONT)",12,'text-anchor="middle"')+
 line(1211,486,"FRONT VIEW",13,'text-anchor="middle" font-weight="650"')+
 line(714,547,"KEY REVISIONS (VS. V4.1)",16,'font-weight="650"')+
 '<path d="M714 558H1370" stroke="#bc8ca0" stroke-width="1.4" fill="none"/>'+
 '</g>';
 return s;
}
function measures(){
 return '<g font-family="Arial,sans-serif" fill="#855066">'+
  '<path d="M77 350H230M77 509H216" stroke="#bd889f" stroke-width="1.1" stroke-dasharray="4 5" fill="none"/>'+
  '<path d="M95 360V497M90 372L95 360L100 372M90 485L95 497L100 485" fill="none" stroke="#ac728b" stroke-width="2"/>'+
  line(32,335,"BROW /",13,'font-weight="650"')+
  line(32,351,"EYE LEVEL",13,'font-weight="650"')+
  line(43,429,"EAR",13,'font-weight="650"')+
  line(43,445,"HEIGHT",13,'font-weight="650"')+
  line(32,523,"BASE OF",13,'font-weight="650"')+
  line(32,539,"NOSE",13,'font-weight="650"')+'</g>';
}
function notes(){
 const a=[
 "Compact cranium (reduced occipital length)",
 "Tapered lower face with near-pointed V chin",
 "Ear height: brow/eye level → base of nose",
 "Ear slightly behind jaw hinge",
 "Eye socket recessed + subtle brow ridge",
 "Smooth occipital-to-nape connection"
 ];
 let s='<rect x="31" y="876" width="450" height="162" rx="9" fill="#fff9fb" fill-opacity=".89" stroke="#cda2b4"/>'+
 line(50,898,"PROPORTIONS / NOTES",15,'font-weight="650"')+
 '<path d="M51 906H243" fill="none" stroke="#cda2b4"/>';
 a.forEach((v,i)=>{s+=line(50,926+i*17,"✓",15,'font-weight="700"')+line(74,926+i*17,v,12);});
 return s;
}
function timeline(cache){
 let s='<g opacity=".80">';
 const parts=[cache.profile,cache.back,cache.threequarter,cache.threequarter,cache.profile];
 for(let i=0;i<parts.length;i++){
  const x=500+i*169;
  s+=minicell(parts[i],x,883,128,i===0?"120 20 370 410":"80 20 430 410",.85);
  if(i<parts.length-1) s+=line(x+140,963,"»",32,'font-weight="400"');
 }
 return s+"</g>";
}
/* Uma única API para editor, exportação, testes e futuros presets. */
export function buildHeadStudySvg(model={},opts={}){
 const render=opts.renderer||renderScene;
 const wire=opts.wire!==false;
 const cache={};
 for(const view of STUDY_VIEWS)cache[view.id]=viewRender(model,view,render,wire);
 const svg=[
  '<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="1050" viewBox="0 0 1400 1050" role="img" aria-label="Estudo anatômico vetorial da Cabeça V4.2">',
  '<title>GeoMannequin — Anatomical Head Study V4.2</title>',
  sheetFrame(),sheetText(),
  renderWindow(cache.profile,100,83,590,718),
  renderWindow(cache.threequarter,704,80,344,397),
  renderWindow(cache.front,1064,79,309,398),
  measures(),
  annotationCard(715,582,187,174,cache.profile,"1. ROUNDED","OCCIPITAL–NAPE","315 110 240 280"),
  annotationCard(936,582,187,174,cache.profile,"2. RESTORED EAR","HEIGHT + TILT","230 190 215 300"),
  annotationCard(1156,582,187,174,cache.threequarter,"3. EYE SOCKET","SUBTLE BROW RIDGE","125 185 245 280"),
  notes(),timeline(cache),
  '</g></svg>'
 ].join("");
 if(/NaN|Infinity|undefined/.test(svg))throw Error("Geometria inválida na folha");
 return svg;
}
