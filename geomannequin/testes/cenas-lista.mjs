/* GeoMannequin — cenas de referência usadas para garantir que mudanças de organização não alteram o desenho */
export const POSES=['empe','contrapposto','caminhando','frente','torcao','passo','joelho','ponta','erguido','alcancar','lateral','agachar','cintura','cruzar','ombro'];
export function cenas(){
  const c=[];
  POSES.forEach((p,i)=>c.push({nome:'pose_'+p,f:w=>{w.cena.ativo.poseRapida(p);w.camera.girar(i*24-160,-10);w.autoFit()}}));
  ['magro','medio','atletico','musculoso','cheio'].forEach((b,i)=>c.push({nome:'corpo_'+b,f:w=>{w.cena.ativo.corpo(b).corpo({feminino:i/4});w.camera.girar(30+i*40,5);w.autoFit()}}));
  c.push({nome:'construcao',f:w=>{w.setPreset('construcao');w.cena.ativo.poseRapida('torcao');w.autoFit()}});
  c.push({nome:'orto',f:w=>{w.camera.perspectiva(false);w.cena.ativo.poseRapida('alcancar');w.autoFit()}});
  c.push({nome:'multi',f:w=>{w.cena.adicionar({x:4,z:-8,giro:-40}).poseRapida('caminhando');w.cena.adicionar({x:-5,z:-18,corpo:'musculoso'}).poseRapida('agachar');w.cena.horizonte(true);w.cena.atmosfera(0.6);w.camera.lente(28).girar(25,0);w.camera.alturaOlhos(14.5);w.autoFit()}});
  c.push({nome:'noite',f:w=>{w.tema('escuro');w.cena.adicionar({x:5,z:-6}).poseRapida('joelho');w.camera.girar(-120,-20);w.autoFit()}});
  c.push({nome:'cima',f:w=>{w.cena.adicionar({x:3,z:3}).poseRapida('lateral');w.camera.alturaOlhos(32,-35);w.camera.lente(85);w.autoFit()}});
  c.push({nome:'cores',f:w=>{const m=w.cena.adicionar({x:4});m.cor('#ffcc88','#552200');w.cena.ativo.pose({joelhoEsq:80,coxaEsqFrente:70,cotoveloDir:120});w.autoFit()}});
  return c;
}
