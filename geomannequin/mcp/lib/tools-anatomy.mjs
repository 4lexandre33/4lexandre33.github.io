/* GeoMannequin MCP: anatomia fina e opções de desenho, por operações tipadas. */
import {z} from "zod";
import {pick,sceneLink} from "./scene.mjs";
const N=z.number().finite();
const RO={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const RW={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false};
const required=(v,k)=>{if(v===undefined||v===null||v==="")throw Error("Informe "+k);return v};
function run(server,W,name,title,inputSchema,handler,readOnly=false){
 server.registerTool(name,{title,
  description:"Operações estruturadas da API do editor GeoMannequin, sem executar scripts JavaScript.",
  inputSchema,annotations:readOnly?RO:RW},
  async raw=>{
   try{
    const a=z.object(inputSchema).strict().parse(raw||{}),w=W();
    const result=await handler(w,a);
    if(result&&result.__response)return result.__response;
    const link=sceneLink(w),value=JSON.parse(JSON.stringify(result??null));
    return {content:[{type:"text",text:JSON.stringify({resultado:value,link})}],
      structuredContent:{resultado:value,link}};
   }catch(e){return {isError:true,content:[{type:"text",text:"Erro: "+e.message}]}};
  });
}
const rollback=(w,fn)=>{
 const b=w.cena.estadoCompleto();
 try{return fn()}catch(e){w.cena.restaurarCompleto(b);throw e}
};
export function registerAnatomyTools(server,W){
 run(server,W,"anatomia_mcp","Cabeça, mãos, rosto e articulações",{
  acao:z.enum(["orientacao","modelo_cabeca","expressao","olhos","boca","gesto",
   "articulacao","estudo_cabeca"]),
  manequim:z.string().max(100).optional(),referencia:z.enum(["tronco","cabeca"]).optional(),
  modelo:z.enum(["v1","v2","v3","v4","v5","anime","v3_microgeometry","v4_anatomical","v5_anime"]).optional(),
  nome:z.string().max(100).optional(),lado:z.enum(["direita","esquerda","ambas"]).optional(),
  x:N.optional(),y:N.optional(),abrir:N.optional(),sorriso:N.optional(),
  dobrar:N.optional(),frente:N.optional(),girar:N.optional(),desvio:N.optional(),
  base:N.optional(),ponta:N.optional(),afastar:N.optional(),opor:N.optional(),
  intensidade:N.optional()
 },(w,a)=>{
  const it=pick(w,a.manequim),m=w.apiFor(it);
  if(a.acao==="orientacao")return m.orientacao(a.referencia??"tronco");
  if(a.acao==="estudo_cabeca"){
   const svg=w.cena.estudoAnatomico.svg({alvo:it.name});
   if(svg.length>8*1024*1024)throw Error("Estudo anatômico maior que 8 MiB.");
   return {__response:{content:[{type:"resource",resource:{uri:"geomannequin://arquivo/cabeca-estudo.svg",
     mimeType:"image/svg+xml",text:svg}}],
     structuredContent:{manequim:it.name,formato:"svg",bytes:svg.length,link:sceneLink(w)}}};
  }
  return rollback(w,()=>{
   if(a.acao==="modelo_cabeca")m.cabeca(required(a.modelo,"modelo"));
   else if(a.acao==="expressao")m.expressao(required(a.nome,"expressao"),a.intensidade);
   else if(a.acao==="olhos")m.olhos(required(a.x,"x"),a.y??0);
   else if(a.acao==="boca")m.boca(required(a.abrir,"abrir"),a.sorriso??0);
   else if(a.acao==="gesto")m.gesto(a.lado??"ambas",required(a.nome,"gesto"));
   else if(a.acao==="articulacao"){
    const values={};for(const k of ["dobrar","frente","girar","desvio","abrir","base","ponta","afastar","opor"])
      if(a[k]!==undefined)values[k]=a[k];
    m.articulacao(required(a.nome,"articulacao"),values);
   }
   return {manequim:it.name,acao:a.acao,orientacao:m.orientacao(a.referencia??"tronco"),
     modeloCabeca:it.params.headModel};
  });
 });

 run(server,W,"aparencia_mcp","Paletas, camadas, modos e atmosfera",{
  acao:z.enum(["listar_camadas","definir_camada","listar_estilos","estilo",
    "modo","sombras","horizonte","atmosfera","fibras","exato"]),
  nome:z.string().max(80).optional(),ativar:z.boolean().optional(),
  valor:N.min(0).max(1).optional()
 },(w,a)=>{
  const c=w.cena;
  if(a.acao==="listar_camadas")return c.camadasVisuais();
  if(a.acao==="listar_estilos")return {estilos:c.estilos(),atual:c.estiloAtual()};
  return rollback(w,()=>{
   if(a.acao==="definir_camada")c.camadaVisual(required(a.nome,"camada"),required(a.ativar,"ativar"));
   else if(a.acao==="estilo")c.estilo(required(a.nome,"estilo"));
   else if(a.acao==="modo")c.modo(required(a.nome,"modo"));
   else if(a.acao==="sombras")c.sombras(required(a.ativar,"ativar"));
   else if(a.acao==="horizonte")c.horizonte(required(a.ativar,"ativar"));
   else if(a.acao==="atmosfera")c.atmosfera(required(a.valor,"valor"));
   else if(a.acao==="fibras")c.fibras(required(a.ativar,"ativar"));
   else if(a.acao==="exato")c.exato(required(a.ativar,"ativar"));
   return {camadas:c.camadasVisuais(),estilo:c.estiloAtual()};
  });
 });
}
