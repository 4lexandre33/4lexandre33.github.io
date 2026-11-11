/* Ferramentas MCP de domínio do GeoMannequin. Nenhum código recebido do
 * cliente é interpretado por eval, Function ou vm. */
import {z} from "zod";
import {sceneLink,pick,renderSvg} from "./scene.mjs";
import {toPng} from "./png.mjs";
const RO={readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false};
const RW={readOnlyHint:false,destructiveHint:false,idempotentHint:false,openWorldHint:false};
const N=z.number().finite(),V=z.array(N).length(3);
const side=z.enum(["esquerda","direita","auto","ambas"]),ref=z.string().min(1).max(120);
const req=(x,k)=>{if(x===undefined||x===null||x==="")throw Error("Falta "+k);return x};
const opts=(a,keys)=>Object.fromEntries(keys.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
const dynKeys=["gravidade","restituicao","atrito","velocidade","angular"];
const gripKeys=["mao","ponto","motor","modo","reach","segunda","exigirContato",...dynKeys];
const safe=(w,fn)=>{
 const before=w.cena.estadoCompleto();
 try{return fn()}catch(e){w.cena.restaurarCompleto(before);throw e}
};
const obj=(w,r)=>w.cena.obterObjeto(req(r,"objeto"));
function register(s,W,name,title,description,inputSchema,handler,readonly=false){
 s.registerTool(name,{title,description,inputSchema,annotations:readonly?RO:RW},
  async raw=>{try{
   const a=z.object(inputSchema).strict().parse(raw||{}),w=W();
   const result=await handler(w,a);
   if(result&&result.__response)return result.__response;
   const data=result===undefined?null:JSON.parse(JSON.stringify(result)),link=sceneLink(w);
   return {content:[{type:"text",text:JSON.stringify({operacao:name,resultado:data,link})}],
     structuredContent:{operacao:name,resultado:data,link}};
  }catch(e){return {isError:true,content:[{type:"text",text:"Erro: "+String(e.message||e)}]}}});
}
export function registerControlTools(s,W){
 register(s,W,"capacidades_mcp","Capacidades e métodos do motor",
  "Descobre métodos de cena, câmera, manequim e objeto e limites reais do motor.",{
   categoria:z.enum(["tudo","metodos","capacidades","parametros","objetos"]).optional()
  },(w,a)=>{
   const r={versao:2,modeloFisico:"aproximado; não é dinâmica rígida exata"};
   if(!a.categoria||a.categoria==="tudo"||a.categoria==="metodos")r.metodos=w.cena.comandos();
   if(!a.categoria||a.categoria==="tudo"||a.categoria==="capacidades")r.capacidades=w.cena.capacidades();
   if(a.categoria==="parametros")r.parametros=w.cena.parametros();
   if(a.categoria==="objetos"||a.categoria==="tudo")r.tiposObjetos=Object.keys(w.TIPOS_OBJETO);
   return r;
  },true);

 register(s,W,"rig_parametro","Parâmetros do rig",
  "Consulta, define e valida parâmetros anatômicos reais dos manequins.",{
   acao:z.enum(["todos","consultar","definir","validar"]),manequim:z.string().optional(),
   chave:z.string().max(80).optional(),valor:N.optional()
  },(w,a)=>{
   const m=w.apiFor(pick(w,a.manequim));
   if(a.acao==="todos")return m.parametros();
   if(a.acao==="validar")return m.validarPose();
   if(a.acao==="consultar")return {chave:a.chave,valor:m.parametro(req(a.chave,"chave"))};
   return safe(w,()=>{m.parametro(req(a.chave,"chave"),req(a.valor,"valor"));
     return {chave:a.chave,valor:m.parametro(a.chave)}});
  });

 register(s,W,"objeto_3d","Objeto 3D e orientação",
  "Posição, rotação tridimensional e eixos locais frente/cima, sem mover objetos segurados.",{
   acao:z.enum(["listar","inspecionar","posicionar","rotacionar","orientar"]),
   objeto:ref.optional(),x:N.optional(),y:N.optional(),z:N.optional(),
   yaw:N.optional(),pitch:N.optional(),roll:N.optional(),
   frenteLocal:V.optional(),cimaLocal:V.optional()
  },(w,a)=>{
   if(a.acao==="listar")return w.cena.objetos().map(o=>({id:o.id,info:o.info(),pose:o.pose3D()}));
   const o=obj(w,a.objeto);
   if(a.acao==="inspecionar")return {id:o.id,info:o.info(),pose:o.pose3D(),orientacao:o.orientacao(),posse:o.emPosseDe()};
   return safe(w,()=>{
    if(a.acao==="posicionar")o.posicao3D(req(a.x,"x"),req(a.y,"y"),req(a.z,"z"));
    if(a.acao==="rotacionar")o.rotacao3D(req(a.yaw,"yaw"),a.pitch??0,a.roll??0);
    if(a.acao==="orientar")o.orientacao({frenteLocal:req(a.frenteLocal,"frenteLocal"),cimaLocal:a.cimaLocal??[0,1,0]});
    return {id:o.id,pose:o.pose3D(),orientacao:o.orientacao()};
   });
  });

 register(s,W,"grip_sites","Pontos de agarrar",
  "Lista, consulta ou cria GripSites de objetos.",{
   acao:z.enum(["listar","consultar","criar"]),objeto:ref,ponto:z.string().max(40).optional(),
   local:V.optional(),normal:V.optional()
  },(w,a)=>{
   const o=obj(w,a.objeto);
   if(a.acao==="listar")return o.pontosDeAgarre();
   if(a.acao==="consultar")return o.pontoDeAgarre(req(a.ponto,"ponto"));
   return safe(w,()=>{o.criarPontoAgarre(req(a.ponto,"ponto"),req(a.local,"local"),a.normal??[0,0,1]);
     return o.pontoDeAgarre(a.ponto)});
  });

 register(s,W,"preensao","Preensão V2/V3 em objetos",
  "Segurar com uma ou duas mãos, transferir controle, soltar e diagnosticar vínculo rígido 6DOF.",{
   acao:z.enum(["segurar","soltar","transferir","listar","inspecionar","verificar","planejar","auto_encaixar","reencaixar","aplicar"]),
   objeto:ref.optional(),manequim:z.string().max(80).optional(),
   mao:side.optional(),ponto:z.string().max(40).optional(),
   motor:z.enum(["v2","v3"]).optional(),
   modo:z.enum(["preservar","encaixar","aproximarMao","manter","chao","pousar","queda"]).optional(),
   reach:N.min(0).max(200).optional(),segunda:z.boolean().optional(),exigirContato:z.boolean().optional(),
   gravidade:N.min(.001).max(1000).optional(),restituicao:N.min(0).max(1).optional(),
   atrito:N.min(0).max(1).optional(),velocidade:V.optional(),angular:V.optional(),
   pegada:z.enum(["auto","pinca","potencia","gancho","tripode","lateral","apoio"]).optional(),
   preservarObjeto:z.boolean().optional(),permitirMoverObjeto:z.boolean().optional(),
   tolerancia:N.min(.005).max(.25).optional(),
   limitePenetracao:N.min(.005).max(.14).optional(),
   maxSites:z.number().int().min(1).max(12).optional(),
   maxIteracoes:z.number().int().min(1).max(8).optional(),
   maxTempoMs:z.number().int().min(200).max(10000).optional(),
   revisao:z.string().max(50).optional()
  },(w,a)=>{
   if(a.acao==="listar")return w.cena.vinculos();
   if(a.acao==="inspecionar")return w.cena.inspecionarPreensao().filter(v=>!a.objeto||v.objeto===a.objeto);
   if(a.acao==="verificar")return w.cena.inspecionarAutoGrip(req(a.objeto,"objeto"));
   const autoOpts={manequim:a.manequim,mao:a.mao??"auto",
     pegada:a.pegada??"auto",ponto:a.ponto??"auto",
     reach:a.reach,preservarObjeto:a.preservarObjeto,
     permitirMoverObjeto:a.permitirMoverObjeto,tolerancia:a.tolerancia,
     limitePenetracao:a.limitePenetracao,maxSites:a.maxSites,maxIteracoes:a.maxIteracoes,
     maxTempoMs:a.maxTempoMs};
   if(a.acao==="planejar")return w.cena.planejarEncaixe(req(a.objeto,"objeto"),autoOpts);
   if(a.acao==="aplicar"){
     const preview=w.cena.planejarEncaixe(req(a.objeto,"objeto"),autoOpts);
     if(!a.revisao||a.revisao!==preview.revisao)
       throw Error("A prévia expirou ou a revisão não confere. Replaneje.");
     return safe(w,()=>w.cena.aplicarEncaixe(preview));
   }
   if(a.acao==="reencaixar")return safe(w,()=>w.cena.reajustarEncaixe(req(a.objeto,"objeto"),autoOpts));
   if(a.acao==="auto_encaixar")return safe(w,()=>
     w.cena.autoEncaixarObjeto(req(a.objeto,"objeto"),autoOpts));
   return safe(w,()=>{
    const target=req(a.objeto,"objeto");
    if(a.acao==="segurar")return w.cena.segurarObjeto(target,{manequim:a.manequim,...opts(a,gripKeys)});
    if(a.acao==="transferir")return w.cena.transferirMaoPrincipal(target,{mao:a.mao??"esquerda"});
    return {solto:w.cena.soltarObjeto(target,opts(a,gripKeys)),vinculos:w.cena.vinculos()};
   });
  });

 register(s,W,"fisica","Física aproximada de objetos",
  "Inicia/avança/simula queda, consulta movimento, pousa ou para objetos por MCP.",{
   acao:z.enum(["consultar","iniciar","avancar","simular","parar","pousar"]),
   objeto:ref.optional(),segundos:N.min(0).max(3).optional(),
   duracao:N.min(0).max(8).optional(),passo:N.min(1/240).max(.25).optional(),
   trajetoria:z.boolean().optional(),endireitar:z.boolean().optional(),
   gravidade:N.min(.001).max(1000).optional(),restituicao:N.min(0).max(1).optional(),
   atrito:N.min(0).max(1).optional(),velocidade:V.optional(),angular:V.optional()
  },(w,a)=>{
   if(a.acao==="consultar")return a.objeto?{objeto:a.objeto,estado:obj(w,a.objeto).fisica()}:
     w.cena.objetos().map(o=>({objeto:o.nome,estado:o.fisica()}));
   return safe(w,()=>{
    if(a.acao==="avancar")return w.cena.avancarFisica(a.segundos??1/60);
    if(a.acao==="simular")return w.cena.simularQueda({duracao:a.duracao??3,passo:a.passo??1/60,
      trajetoria:!!a.trajetoria});
    const o=obj(w,a.objeto);
    if(a.acao==="iniciar")o.cair(opts(a,dynKeys));
    else if(a.acao==="parar")o.pararQueda();
    else if(a.acao==="pousar")o.pousar({endireitar:!!a.endireitar});
    return {objeto:o.nome,pose:o.pose3D(),fisica:o.fisica()};
   });
  });

 register(s,W,"camera_anatomica","Câmera anatômica e foco por região",
  "Frente/costas exatas, perfis, orientação cabeça/tronco, acompanhamento e captura de vistas.",{
   acao:z.enum(["ver","frente","costas","perfil_esquerdo","perfil_direito",
    "seguir","parar_seguir","orientacao","estado","areas","focar","capturar_vistas"]),
   alvo:z.string().max(120).optional(),referencia:z.enum(["tronco","cabeca","objeto"]).optional(),
   lado:z.string().max(50).optional(),area:z.string().max(80).optional(),
   elevacao:N.optional(),azimute:N.optional(),distancia:N.optional(),
   enquadrar:z.boolean().optional(),angulos:z.array(N.min(-360).max(360)).max(8).optional(),
   incluir_svg:z.boolean().optional()
  },(w,a)=>{
   const c=w.camera,target=a.alvo??"ativo";
   if(a.acao==="estado")return {vista:c.vista(),seguimento:c.seguimento()};
   if(a.acao==="orientacao")return c.orientacaoDoAlvo(target,a.referencia??"tronco");
   if(a.acao==="areas")return c.areas(target);
   if(a.acao==="capturar_vistas"){
    const views=c.capturarVistas(target,{area:a.area,referencia:a.referencia,elevacao:a.elevacao,
      angulos:a.angulos??[0,45,90,135,180,-135,-90,-45]});
    return views.map(v=>({azimute:v.azimute,bytes:v.svg.length,svg:a.incluir_svg?v.svg:undefined}));
   }
   return safe(w,()=>{
    const config=opts(a,["referencia","lado","area","elevacao","azimute","distancia","enquadrar"]);
    if(a.acao==="ver")c.ver(target,config);
    else if(a.acao==="frente")c.frente(target,config);
    else if(a.acao==="costas")c.costas(target,config);
    else if(a.acao==="perfil_esquerdo")c.perfilEsquerdo(target,config);
    else if(a.acao==="perfil_direito")c.perfilDireito(target,config);
    else if(a.acao==="seguir")c.seguir(target,config);
    else if(a.acao==="parar_seguir")c.pararSeguir();
    else if(a.acao==="focar")c.focar(target,a.area,config);
    return {vista:c.vista(),seguimento:c.seguimento()};
   });
  });

 register(s,W,"historico_mcp","Histórico do editor",
  "Consultar, marcar, desfazer, refazer e obter snapshot completo.",{
   acao:z.enum(["consultar","marcar","desfazer","refazer","snapshot"])
  },(w,a)=>{
   if(a.acao==="consultar")return w.cena.historico();
   if(a.acao==="snapshot")return w.cena.estadoCompleto();
   if(a.acao==="marcar")return {indice:w.cena.marcarEstado()};
   if(a.acao==="desfazer")return {feito:w.cena.desfazer(),estado:w.cena.historico()};
   return {feito:w.cena.refazer(),estado:w.cena.historico()};
  });

 register(s,W,"contato_fisico","Contato anatômico e colisões",
  "Lista contatos V2, configura checagem e resolve colisões por proxies.",{
   acao:z.enum(["listar","configurar","resolver","desfazer","modo"]),
   enabled:z.boolean().optional(),level:z.enum(["coarse","fine"]).optional(),
   tol:N.min(0).max(10).optional(),max:z.number().int().min(1).max(200).optional(),
   modo:z.string().max(30).optional(),preferir:z.string().max(30).optional()
  },(w,a)=>{
   if(a.acao==="listar")return w.cena.contatosFisicos({max:a.max??40});
   return safe(w,()=>{
    if(a.acao==="configurar")return w.cena.contatoV2(opts(a,["enabled","level","tol"]));
    if(a.acao==="modo")return w.cena.colisao(a.modo,a.preferir);
    if(a.acao==="resolver")return w.cena.resolverColisoes({preferir:a.preferir});
    return {desfeito:w.cena.desfazerColisao()};
   });
  });

 register(s,W,"artefatos_mcp","Exportar arquivos da aplicação",
  "Entrega imagem PNG, SVG, malha OBJ da cabeça V3/V4, JSON ou ZIP usando recursos MCP.",{
   formato:z.enum(["png","svg","obj","json","zip"]),alvo:z.string().optional(),
   modelo:z.string().optional(),largura:z.number().int().min(200).max(1600).optional()
  },async(w,a)=>{
   const link=sceneLink(w);
   if(a.formato==="png"){
    const png=await toPng(renderSvg(w).svg,a.largura??900);
    return {__response:{content:[{type:"image",data:png.toString("base64"),mimeType:"image/png"}],
      structuredContent:{formato:"png",bytes:png.length,link}}};
   }
   let resource,bytes;
   if(a.formato==="zip"){
    const data=Buffer.from(w.cena.exportarZIP());bytes=data.length;
    resource={uri:"geomannequin://arquivo/cena.zip",mimeType:"application/zip",blob:data.toString("base64")};
   }else{
    const data=a.formato==="svg"?w.cena.exportarSVG():
      a.formato==="obj"?w.cena.exportarOBJ({alvo:a.alvo,modelo:a.modelo}):w.cena.exportarJSON();
    bytes=Buffer.byteLength(data,"utf8");
    resource={uri:"geomannequin://arquivo/"+(a.formato==="obj"?"cabeca":"cena")+"."+a.formato,
      mimeType:({svg:"image/svg+xml",obj:"text/plain",json:"application/json"})[a.formato],text:data};
   }
   if(bytes>8*1024*1024)throw Error("Arquivo maior que 8 MiB.");
   return {__response:{content:[{type:"resource",resource},{type:"text",text:"Arquivo "+a.formato+" ("+bytes+" bytes). Link: "+link}],
     structuredContent:{formato:a.formato,bytes,link}}};
  },true);
}
