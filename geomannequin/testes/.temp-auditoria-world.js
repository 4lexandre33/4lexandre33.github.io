/* Temporary headless world factory and RFC1321 MD5 for snapshot regeneration. */
function criarMundos(sources,sceneFiles,createEngine) {
  const motor=createEngine(sources),E={};
  for(const m of sources["engine/index.js"].matchAll(/export\s+\*\s+from\s+"([^"]+)"/g)){
    const n="engine/"+m[1].slice(2),ex=motor.load(n);
    for(const key of Object.keys(ex))if(!(key in E))E[key]=ex[key];
  }
  const ordem=JSON.parse(sceneFiles["scene/ordem.json"]);
  const css=sceneFiles["css/temas.css"];
  function cssTokens(css) {
    const light={},dark={};
    const rootM=/:root\s*\{([^}]*)\}/.exec(css);
    const darkM=/:root\[data-theme="dark"\]\s*\{([^}]*)\}/.exec(css);
    const eat=(txt,o)=>{for(const m of(txt||"").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))o[m[1]]=m[2].trim()};
    eat(rootM&&rootM[1],light);eat(darkM&&darkM[1],dark);
    return {light,dark:Object.assign({},light,dark)};
  }
  const TOK=cssTokens(css);
  const unmodule=s=>s.replace(/^import\s[^\n]*\n/gm,"")
    .replace(/^export\s*\{[^}]*\};?\s*$/gm,"")
    .replace(/^export\s+(function|const|let|async function)\b/gm,"$1");
  const sceneSrc=ordem.modulos.map(f=>"/* ---- "+f+" ---- */\n"+unmodule(sceneFiles["scene/"+f])).join("\n");
  const names=Object.keys(E).filter(n=>/^[A-Za-z_$][\w$]*$/.test(n));
  const code=`"use strict";
const {${names.join(",")}}=E;
const TOK=T;
const STUB=new Proxy({},{get:(t,k)=>k in t?t[k]:(k==="value"?"":undefined),set:(t,k,v)=>{t[k]=v;return true}});
const document={documentElement:{dataset:{}},getElementById:()=>STUB};const window={};
const getComputedStyle=()=>({getPropertyValue:k=>((document.documentElement.dataset.theme==="dark")?TOK.dark:TOK.light)[k]||""});
${sceneSrc}
${ordem.iniciar.map(f=>f+"();").join("\n")}
return {
  get P(){return P},SCN,cena,camera,tema,LOG,
  get L(){return L},setPreset:n=>{if(!PRESETS[n])throw new Error("Modo desconhecido");setPreset(n)},
  get mode(){return mode},get style(){return styleName},
  get theme(){return THEMES[themeIdx][0]},
  autoFit,sceneState,loadScene,applyState,renderScene,sceneList,executarRoteiro,lerRoteiro,
  W,H,PRESETS,STYLES,BODIES,BPOSES,POSTURES,FACES,ALIAS,SL,LAY,
  instColors,isDark,DEF,POSEKEYS
};`;
  const make=new Function("E","T",code);
  return {createWorld:()=>make(E,TOK),motor,ordem};
}
function md5js(str){
  const u=[];for(let i=0;i<str.length;i++){
    let c=str.codePointAt(i);if(c>65535)i++;
    if(c<128)u.push(c);else if(c<2048)u.push(192|(c>>6),128|(c&63));
    else if(c<65536)u.push(224|(c>>12),128|((c>>6)&63),128|(c&63));
    else u.push(240|(c>>18),128|((c>>12)&63),128|((c>>6)&63),128|(c&63));
  }
  const len=u.length;u.push(128);while(u.length%64!==56)u.push(0);
  const bits=BigInt(len)*8n;for(let i=0;i<8;i++)u.push(Number(bits>>BigInt(8*i)&255n));
  let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;
  const shifts=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
    5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
    4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
    6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*4294967296)>>>0);
  for(let off=0;off<u.length;off+=64){
    const words=Array.from({length:16},(_,i)=>(u[off+i*4]|(u[off+i*4+1]<<8)|(u[off+i*4+2]<<16)|(u[off+i*4+3]<<24))>>>0);
    let a=a0,b=b0,c=c0,d=d0;
    for(let i=0;i<64;i++){
      let f,g;if(i<16){f=(b&c)|(~b&d);g=i}
      else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)%16}
      else if(i<48){f=b^c^d;g=(3*i+5)%16}
      else{f=c^(b|~d);g=(7*i)%16}
      const z=(a+f+K[i]+words[g])>>>0,r=((z<<shifts[i])|(z>>>(32-shifts[i])))>>>0;
      a=d;d=c;c=b;b=(b+r)>>>0;
    }
    a0=(a0+a)>>>0;b0=(b0+b)>>>0;c0=(c0+c)>>>0;d0=(d0+d)>>>0;
  }
  return [a0,b0,c0,d0].map(v=>[0,8,16,24].map(b=>((v>>>b)&255).toString(16).padStart(2,"0")).join("")).join("");
}
