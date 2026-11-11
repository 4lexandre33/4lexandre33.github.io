/* Contratos MCP v2: ferramentas tipadas, Grip V3, física e segurança HTTP.
 * node test/control.mjs (mcp); GM_SERVER=dist/server.mjs node test/control.mjs
 */
import assert from "node:assert/strict";
import {Client} from "@modelcontextprotocol/sdk/client/index.js";
import {StdioClientTransport} from "@modelcontextprotocol/sdk/client/stdio.js";
import {StreamableHTTPClientTransport} from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {spawn} from "node:child_process";
import {dirname,resolve,join} from "node:path";
import {fileURLToPath} from "node:url";
const here=dirname(fileURLToPath(import.meta.url)),root=join(here,"..");
const server=resolve(root,process.env.GM_SERVER||"server.mjs");
const call=(c,name,a={})=>c.callTool({name,arguments:a});
async function scenario(client,remote){
 const names=new Set((await client.listTools()).tools.map(x=>x.name));
 for(const name of ["capacidades_mcp","rig_parametro","objeto_3d","grip_sites","preensao",
   "fisica","camera_anatomica","historico_mcp","contato_fisico","artefatos_mcp",
   "roteiro_declarativo","operacoes_lote","anatomia_mcp","aparencia_mcp"])assert.ok(names.has(name),"Faltou "+name);
 let r=await call(client,"nova_cena");
 assert.ok(!r.isError);
 r=await call(client,"capacidades_mcp",{categoria:"capacidades"});
 assert.ok(!r.isError&&r.structuredContent.resultado.capacidades.some(x=>x.id==="preensaoV3"));
 r=await call(client,"objetos",{acao:"adicionar",tipo:"cadeira",nome:"Cadeira MCP",x:0,z:0});
 assert.ok(!r.isError);
 r=await call(client,"preensao",{acao:"medidas_mao",mao:"ambas"});
 assert.ok(!r.isError,JSON.stringify(r.content));
 assert.equal(r.structuredContent.resultado.direita.dedos.length,5);
 assert.equal(r.structuredContent.resultado.esquerda.dedos.length,5);
 assert.ok(Number.isFinite(r.structuredContent.resultado.direita.aberturaPincaAberta));
 r=await call(client,"grip_sites",{acao:"listar",objeto:"Cadeira MCP"});
 assert.ok(!r.isError&&r.structuredContent.resultado.some(x=>x.id==="encostoTopo"));
 // AutoGrip MCP: primeiro planejar sem mutar, depois confirmar somente se possível.
 const stateBefore=(await call(client,"preensao",{acao:"listar"})).structuredContent.resultado;
 let plan=await call(client,"preensao",{acao:"planejar",objeto:"Cadeira MCP",mao:"auto",
   pegada:"auto",reach:15,maxSites:1,maxIteracoes:1});
 assert.ok(!plan.isError,JSON.stringify(plan.content));
 const planned=plan.structuredContent.resultado;
 assert.ok(["planejado","inviavel"].includes(planned.status));
 assert.ok(typeof planned.revisao==="string");
 let optIn=await call(client,"preensao",{acao:"planejar",objeto:"Cadeira MCP",
   permitirMoverObjeto:true,preservarObjeto:false,maxDeslocamento:.2,
   mao:"direita",maxSites:1,maxIteracoes:1,maxTempoMs:600});
 assert.ok(!optIn.isError,JSON.stringify(optIn.content));
 assert.ok(["planejado","inviavel"].includes(optIn.structuredContent.resultado.status));
 optIn=await call(client,"preensao",{acao:"planejar",objeto:"Cadeira MCP",
   permitirMoverObjeto:true,preservarObjeto:true,mao:"direita"});
 assert.ok(optIn.isError&&/preservarObjeto:false/.test(optIn.content[0].text),
   "Microajuste exige autorização explícita para mover objeto");

 let stateAfter=(await call(client,"preensao",{acao:"listar"})).structuredContent.resultado;
 assert.deepEqual(stateAfter,stateBefore,"Planejamento AutoGrip não pode criar vínculo");
 if(planned.status==="planejado"){
   const applied=await call(client,"preensao",{acao:"aplicar",objeto:"Cadeira MCP",
     revisao:planned.revisao,mao:"auto",pegada:"auto",reach:15,maxSites:1,maxIteracoes:1});
   assert.ok(!applied.isError,JSON.stringify(applied.content));
   assert.equal(applied.structuredContent.resultado.status,"aplicado");
   await call(client,"preensao",{acao:"soltar",objeto:"Cadeira MCP",modo:"manter"});
 }
 r=await call(client,"preensao",{acao:"segurar",objeto:"Cadeira MCP",
   mao:"direita",ponto:"encostoTopo",reach:100});
 assert.ok(!r.isError,JSON.stringify(r.content));
 assert.equal(r.structuredContent.resultado.versao,3);
 const inspect=await call(client,"preensao",{acao:"verificar",objeto:"Cadeira MCP"});
 assert.ok(!inspect.isError,JSON.stringify(inspect.content));
 assert.equal(inspect.structuredContent.resultado.necessitaAjuste,true,
   "O grip V3 antigo precisa ser identificado como não certificado pelo AutoGrip");
 assert.equal(inspect.structuredContent.resultado.versao,3);
 r=await call(client,"rig_parametro",{acao:"definir",chave:"armFlexR",valor:35});
 assert.ok(!r.isError);
 assert.equal(r.structuredContent.resultado.valor,35);
 r=await call(client,"preensao",{acao:"inspecionar",objeto:"Cadeira MCP"});
 assert.equal(r.structuredContent.resultado.length,1);
 r=await call(client,"preensao",{acao:"soltar",objeto:"Cadeira MCP",modo:"queda",restituicao:0});
 assert.ok(!r.isError);
 r=await call(client,"fisica",{acao:"avancar",segundos:.1});
 assert.ok(!r.isError&&r.structuredContent.resultado.passos>0);
 r=await call(client,"camera_anatomica",{acao:"costas",alvo:"Manequim 1",referencia:"tronco"});
 assert.ok(!r.isError,JSON.stringify(r.content));
 r=await call(client,"objeto_3d",{acao:"inspecionar",objeto:"Cadeira MCP"});
 assert.ok(!r.isError&&Array.isArray(r.structuredContent.resultado.pose.matriz));
 r=await call(client,"artefatos_mcp",{formato:"svg"});
 assert.ok(!r.isError&&r.content.some(x=>x.type==="resource"));
 r=await call(client,"roteiro_declarativo",{validar:true,quadros:[
   {titulo:"Frontal",acoes:[{acao:"camera_ver",alvo:"Manequim 1",lado:"frente"}]},
   {titulo:"Braço",acoes:[{acao:"parametro",alvo:"Manequim 1",chave:"armFlexR",valor:42}]}
 ]});
 assert.ok(!r.isError,JSON.stringify(r.content));
 assert.equal(r.structuredContent.quadros.length,2);
 r=await call(client,"anatomia_mcp",{acao:"orientacao",manequim:"Manequim 1",referencia:"tronco"});
 assert.ok(!r.isError,"Anatomia via MCP: "+JSON.stringify(r.content));
 r=await call(client,"aparencia_mcp",{acao:"listar_camadas"});
 assert.ok(!r.isError&&Array.isArray(r.structuredContent.resultado));
 const before=(await call(client,"rig_parametro",{acao:"consultar",chave:"armFlexR"}))
   .structuredContent.resultado.valor;
 r=await call(client,"operacoes_lote",{prever:true,acoes:[
   {acao:"parametro",alvo:"Manequim 1",chave:"armFlexR",valor:60},
   {acao:"camera_ver",alvo:"Manequim 1",lado:"frente"}]});
 assert.ok(!r.isError&&r.structuredContent.resultado.previsao);
 const after=(await call(client,"rig_parametro",{acao:"consultar",chave:"armFlexR"}))
   .structuredContent.resultado.valor;
 assert.equal(after,before,"Dry-run não modifica cena");
 r=await call(client,"operacoes_lote",{prever:true,
   acoes:Array.from({length:5},()=>({acao:"auto_encaixar",
     alvo:"Cadeira MCP",mao:"auto",pegada:"auto"}))});
 assert.ok(r.isError&&/máximo 4/i.test(r.content?.[0]?.text||""),
   "Lote de AutoGrip deve rejeitar chamadas demais antes de alterar a cena");
 r=await call(client,"roteiro_declarativo",{validar:true,
   quadros:[{titulo:"Bloqueio de limite",acoes:Array.from({length:5},()=>({
     acao:"auto_encaixar",alvo:"Cadeira MCP",mao:"auto"}))}]});
 assert.ok(r.isError&&/máximo 4/i.test(r.content?.[0]?.text||""),
   "Storyboard de AutoGrip deve respeitar o limite de custo");
 if(remote){
   r=await call(client,"roteiro_quadros",{roteiro:"#quadro 1\nprocess.exit(1);"});
   assert.ok(r.isError&&/desativado/.test(r.content[0].text));
   r=await call(client,"executar_codigo",{codigo:"process.exit(1)"});
   assert.ok(r.isError);
 }
 console.log("MCP DOMAIN PASS",remote?"HTTP":"stdio",names.size,"ferramentas");
}
const make=()=>new Client({name:"mcp-domain-regression",version:"1"});
let c=make();
await c.connect(new StdioClientTransport({command:process.execPath,args:[server],stderr:"ignore"}));
try{await scenario(c,false)}finally{await c.close()}
const port=18400+Math.floor(Math.random()*800);
const p=spawn(process.execPath,[server,"--http"],{env:{...process.env,PORT:String(port),GM_TOKEN:"token-teste-local"},
 stdio:["ignore","pipe","pipe"]});
try{
 await Promise.race([new Promise((ok,fail)=>{
   p.stdout.once("data",ok);p.once("error",fail);
   p.once("exit",code=>fail(Error("MCP HTTP saiu antes de iniciar, code="+code)));
 }),new Promise((_,fail)=>setTimeout(()=>fail(Error("Timeout ao iniciar MCP HTTP")),20000))]);
 const u=new URL("http://127.0.0.1:"+port+"/mcp?token=token-teste-local");
 c=make();await c.connect(new StreamableHTTPClientTransport(u));
 try{await scenario(c,true)}finally{await c.close()}
}finally{p.kill()}
