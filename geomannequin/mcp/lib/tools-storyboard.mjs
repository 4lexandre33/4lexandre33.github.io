/* GeoMannequin — storyboard MCP seguro, operado por dados tipados.
 * Não executa JavaScript, não chama rodarBloco() ou executarRoteiro().
 * Cada quadro é criado em uma cópia transacional da cena.
 */
import {z} from "zod";
import {renderSvg,sceneLink,pick} from "./scene.mjs";
import {toPng} from "./png.mjs";

const N=z.number().finite(),coord=N.optional();
const command=z.object({
  acao:z.enum(["criar_manequim","criar_objeto","mover_manequim",
    "girar_manequim","pose_rapida","parametro","camera_ver","lente",
    "segurar","auto_encaixar","soltar","avancar_fisica","mover_objeto_3d","girar_objeto_3d"]),
  alvo:z.string().max(120).optional(),
  nome:z.string().max(80).optional(),
  tipo:z.string().max(60).optional(),
  pose:z.string().max(80).optional(),
  chave:z.string().max(80).optional(),
  valor:coord,x:coord,y:coord,z:coord,angulo:coord,
  yaw:coord,pitch:coord,roll:coord,segundos:N.min(0).max(.25).optional(),
  mao:z.enum(["direita","esquerda","auto","ambas"]).optional(),
  pegada:z.enum(["auto","pinca","potencia","gancho","tripode","lateral","apoio"]).optional(),
  preservarObjeto:z.boolean().optional(),
  lado:z.enum(["frente","costas","esquerda","direita","3/4 esquerda","3/4 direita"]).optional(),
  area:z.string().max(80).optional(),
  ponto:z.string().max(40).optional(),
  modo:z.enum(["encaixar","preservar","manter","pousar","chao","queda"]).optional(),
  reach:N.min(0).max(200).optional()
}).strict();
const req=(v,k)=>{if(v===undefined||v===null||v==="")throw Error("Falta "+k);return v};
function apply(w,a){
 const m=()=>w.apiFor(pick(w,req(a.alvo,"alvo do manequim")));
 const o=()=>w.cena.obterObjeto(req(a.alvo,"alvo do objeto"));
 switch(a.acao){
 case "criar_manequim":w.cena.adicionar({nome:a.nome,x:a.x??0,z:a.z??0});break;
 case "criar_objeto":w.cena.objeto(req(a.tipo,"tipo"),{nome:a.nome,x:a.x??0,z:a.z??0});break;
 case "mover_manequim":m().posicao(req(a.x,"x"),req(a.z,"z"));break;
 case "girar_manequim":m().girar(req(a.angulo,"angulo"));break;
 case "pose_rapida":m().poseRapida(req(a.pose,"pose"));break;
 case "parametro":m().parametro(req(a.chave,"chave"),req(a.valor,"valor"));break;
 case "camera_ver":w.camera.ver(a.alvo??"ativo",{lado:a.lado??"frente",area:a.area,
     elevacao:a.angulo});break;
 case "lente":w.camera.lente(req(a.valor,"lente"));break;
 case "segurar":w.cena.segurarObjeto(req(a.alvo,"objeto"),{mao:a.mao??"direita",
   ponto:a.ponto??"auto",modo:a.modo??"preservar",reach:a.reach});break;
 case "auto_encaixar":w.cena.autoEncaixarObjeto(req(a.alvo,"objeto"),{
   manequim:a.nome,mao:a.mao??"auto",pegada:a.pegada??"auto",
   ponto:a.ponto??"auto",reach:a.reach??12,preservarObjeto:a.preservarObjeto!==false,
   maxTempoMs:750
  });break;
 case "soltar":w.cena.soltarObjeto(req(a.alvo,"objeto"),{modo:a.modo??"manter"});break;
 case "avancar_fisica":w.cena.avancarFisica(a.segundos??1/60);break;
 case "mover_objeto_3d":o().posicao3D(req(a.x,"x"),req(a.y,"y"),req(a.z,"z"));break;
 case "girar_objeto_3d":o().rotacao3D(req(a.yaw,"yaw"),a.pitch??0,a.roll??0);break;
 default:throw Error("Operação declarativa desconhecida.");
 }
}
export function registerDeclarativeStoryboard(server,W){
 server.registerTool("roteiro_declarativo",{
  title:"Storyboard seguro por operações MCP",
  description:"Gera até oito quadros por comandos tipados (sem JavaScript do cliente). Suporta poses, objetos, câmera anatômica, preensão e física aproximada. Não altera a cena aberta.",
  inputSchema:{
   quadros:z.array(z.object({
     titulo:z.string().max(120).optional(),
     acoes:z.array(command).max(24)
   }).strict()).min(1).max(8),
   validar:z.boolean().optional(),
   largura:z.number().int().min(200).max(900).optional()
  },annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false}
 },async raw=>{
  const w=W(),before=w.cena.estadoCompleto(),results=[];
  let error=null;
  try{
   const args=z.object({
     quadros:z.array(z.object({titulo:z.string().max(120).optional(),
       acoes:z.array(command).max(24)}).strict()).min(1).max(8),
     validar:z.boolean().optional(),largura:z.number().int().min(200).max(900).optional()
   }).strict().parse(raw||{});
   const autoCount=args.quadros.reduce((n,q)=>n+q.acoes.filter(c=>c.acao==="auto_encaixar").length,0);
   if(autoCount>4)throw Error("No máximo 4 autoencaixes por roteiro MCP.");
   const link=sceneLink(w);
   for(let i=0;i<args.quadros.length;i++){
     const q=args.quadros[i];
     for(let j=0;j<q.acoes.length;j++)try{apply(w,q.acoes[j])}
     catch(e){throw Error("Quadro "+(i+1)+", ação "+(j+1)+": "+e.message)}
     const item={numero:i+1,titulo:q.titulo??"Quadro "+(i+1),
       acoes:q.acoes.length};
     if(!args.validar){
       const image=renderSvg(w,{});
       item.svg=image.svg;
     }
     results.push(item);
   }
   // A saída é calculada antes de restaurar; todos os quadros são snapshots.
   // Não repassar mutações para a sessão ativa.
   w.cena.restaurarCompleto(before);
   const frames=results.map(q=>({numero:q.numero,titulo:q.titulo,acoes:q.acoes,
     svgBytes:q.svg?.length??0}));
   const content=[{type:"text",text:JSON.stringify({validado:true,quadros:frames,
     aviso:"O roteiro declarativo não altera a cena aberta.",link})}];
   if(!args.validar){
     for(const item of results){
       const png=await toPng(item.svg,args.largura??600);
       content.push({type:"image",data:png.toString("base64"),mimeType:"image/png"});
     }
   }
   return {content,structuredContent:{validado:true,quadros:frames,link}};
  }catch(e){error=e}
  finally{
   // Mesmo que o render falhe, nunca deixar a sessão em outro quadro.
   try{w.cena.restaurarCompleto(before)}catch(rollback){
     error=Error("Falha crítica no rollback: "+rollback.message+
       (error?"; erro inicial: "+error.message:""));
   }
  }
  return {isError:true,content:[{type:"text",text:"Erro no roteiro declarativo: "+String(error?.message||error)}]};
 });
 server.registerTool("operacoes_lote",{
  title:"Executar lote declarativo de operações da cena",
  description:"Executa até 64 comandos enumerados como transação; prever=true valida sem alterar a sessão. Nunca executa código JavaScript recebido do cliente.",
  inputSchema:{
   acoes:z.array(command).min(1).max(64),
   prever:z.boolean().optional()
  },annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false}
 },async raw=>{
  const w=W(),before=w.cena.estadoCompleto();
  try{
   const a=z.object({acoes:z.array(command).min(1).max(64),prever:z.boolean().optional()}).strict().parse(raw||{});
   if(a.acoes.filter(c=>c.acao==="auto_encaixar").length>4)
     throw Error("No máximo 4 autoencaixes por lote MCP.");
   for(let i=0;i<a.acoes.length;i++)try{apply(w,a.acoes[i])}
    catch(e){throw Error("Ação "+(i+1)+": "+e.message)}
   const summary={previsao:!!a.prever,executadas:a.acoes.length,
    manequins:w.SCN.list.map(it=>({nome:it.name,x:it.params.wx,z:it.params.wz,giro:it.params.wRot})),
    objetos:w.SCN.objetos.map(o=>({nome:o.nome||o.tipo,x:o.x,z:o.z,segurado:!!o.gripV3})),
    camera:w.camera.vista()};
   if(a.prever)w.cena.restaurarCompleto(before);
   else w.cena.marcarEstado(before);
   const link=sceneLink(w);
   return {content:[{type:"text",text:JSON.stringify({resultado:summary,link})}],
    structuredContent:{resultado:summary,link}};
  }catch(e){
   try{w.cena.restaurarCompleto(before)}catch(rb){
    return {isError:true,content:[{type:"text",text:"Erro crítico de rollback: "+rb.message}]};
   }
   return {isError:true,content:[{type:"text",text:"Lote revertido: "+e.message}]};
  }
 });

}
