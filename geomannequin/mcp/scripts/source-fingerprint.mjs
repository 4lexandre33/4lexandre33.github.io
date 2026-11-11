/* Fingerprint do código que entra no bundle MCP: source/dist só são equivalentes
 * quando todos os módulos ativos e dependências locais tiverem o mesmo hash.
 */
import {createHash} from "node:crypto";
import {existsSync,readdirSync,readFileSync,statSync} from "node:fs";
import {join,relative,resolve} from "node:path";
export function sourceFiles(root){
 const dirs=["src/engine","src/scene","mcp/lib","mcp/widget"],extras=["mcp/server.mjs",
   "mcp/package.json","css/temas.css"];
 const out=[];
 function walk(p){
  if(!existsSync(p))return;
  for(const f of readdirSync(p)){const item=join(p,f),st=statSync(item);
   if(st.isDirectory())walk(item);
   else if(/\.(?:js|mjs|json|html|css)$/.test(item))out.push(relative(root,item).replace(/\\/g,"/"));
  }
 }
 for(const dir of dirs)walk(join(root,dir));
 for(const file of extras)if(existsSync(join(root,file)))out.push(file);
 return [...new Set(out)].sort();
}
export function fingerprint(root=resolve(process.cwd(),"..")){
 const files=sourceFiles(root),hash=createHash("sha256");
 for(const p of files){hash.update(p+"\0");hash.update(readFileSync(join(root,p)));hash.update("\0")}
 return {sha256:hash.digest("hex"),files:files.length};
}
