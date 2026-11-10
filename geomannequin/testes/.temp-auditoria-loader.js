/* Temporary V8 loader to execute the original ES modules in an isolated tool runtime.
   Removed from the branch after validation. */
function criarMotorAuditavel(sources) {
  const modules={},loaded=[];
  const norm=(from,to)=>{const a=from.split("/").slice(0,-1);for(const x of to.split("/")){if(x==="..")a.pop();else if(x!==".")a.push(x)}return a.join("/")};
  function load(name){
    if(modules[name]?.ready||modules[name]?.loading)return modules[name].exports;
    if(!sources[name])throw Error("Missing "+name);
    const state={loading:true,ready:false,exports:{}};modules[name]=state;
    const imports=[],env=Object.create(null);
    let src=sources[name].replace(/^import\s+(.+?)\s+from\s+["']([^"']+)["'];?\s*$/gm,(_,syms,url)=>{imports.push({syms,url});return ""})
      .replace(/^import\s+["']([^"']+)["'];?\s*$/gm,(_,url)=>{imports.push({syms:null,url});return ""});
    for(const im of imports){
      const dep=norm(name,im.url);load(dep);if(im.syms===null)continue;
      if(im.syms.trim().startsWith("{"))for(const alias of im.syms.trim().slice(1,-1).split(",")){
        if(!alias.trim())continue;const p=alias.trim().split(/\s+as\s+/);
        Object.defineProperty(env,(p[1]||p[0]).trim(),{enumerable:true,get:()=>modules[dep].exports[p[0].trim()]});
      }else if(im.syms.startsWith("* as ")){
        Object.defineProperty(env,im.syms.slice(5).trim(),{enumerable:true,get:()=>modules[dep].exports});
      }else Object.defineProperty(env,im.syms.trim(),{enumerable:true,get:()=>modules[dep].exports.default});
    }
    const exported=new Map();
    src=src.replace(/\bexport\s+\{([^}]+)\}\s*;?/g,(_,list)=>{for(const p of list.split(",")){let [name,alias]=p.trim().split(/\s+as\s+/);if(name)exported.set(alias||name,name)}return ""});
    for(const q of src.matchAll(/\bexport\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g))exported.set(q[1],q[1]);
    src=src.replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|var|class)\b)/g,"");
    const expr=[...exported].map(([k,v])=>JSON.stringify(k)+":{enumerable:true,get:()=>"+v+"}").join(",");
    state.exports=new Function("__env","with(__env){\n"+src+"\nreturn Object.defineProperties({}, {"+expr+"});}")(env);
    state.loading=false;state.ready=true;loaded.push(name);return state.exports;
  }
  const scene=load("engine/cena.js"),padroes=load("engine/padroes.js");
  for(const [mod,fn]of [["engine/montagem.js","iniciarMontagem"],["engine/zbuffer.js","iniciarZbuffer"],["engine/campos.js","iniciarCampos"],["engine/sombra.js","iniciarSombra"],["engine/contornos.js","iniciarContornos"]])load(mod)[fn]();
  return {scene,padroes,montagem:load("engine/montagem.js"),loaded};
}
