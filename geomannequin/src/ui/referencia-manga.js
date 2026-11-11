import {$} from "../scene/ambiente.js";
import {SCN,sceneList} from "../scene/modelo.js";
import {cena} from "../scene/comandos.js";
import {render} from "./palco.js";
import {ossosDoCorpo,paraMundo,doMundo,telaDoMundo,makeXf} from "../engine/index.js";

export function iniciarReferenciaManga(){
  const svg=$("svg"),lista=$("mangaLista"),msg=$("mangaAviso");
  let desenho=null,rodando=false;
  function sincronizar(){
    const refs=cena.referencias(),valor=lista.value;
    lista.replaceChildren();
    refs.forEach((r,i)=>lista.add(new Option((i+1)+". "+r.tipo+(r.ativo?"":" (oculto)"),i)));
    if(valor&&Number(valor)<refs.length)lista.value=valor;
  }
  function acao(fn){
    try{fn();sincronizar();render()}catch(e){msg.textContent=e.message}
  }
  $("mangaControles").addEventListener("toggle",sincronizar);
  lista.addEventListener("focus",sincronizar);
  $("mangaAdicionar").onclick=()=>acao(()=>{
    const tipo=$("mangaTipo").value;
    cena.referencia(tipo,{cor:$("mangaCor").value,inicio:cena.quadroSimulado()});
    lista.value="";msg.textContent="Referência criada.";
  });
  $("mangaVisivel").onclick=()=>acao(()=>{
    const i=Number(lista.value),r=cena.referencias()[i];if(!r)throw Error("Escolha uma referência.");
    cena.referencia(r.tipo,{indice:i,ativo:!r.ativo});
  });
  $("mangaRemover").onclick=()=>acao(()=>cena.removerReferencia(Number(lista.value)));
  $("mangaAplicarVento").onclick=()=>acao(()=>cena.vento({x:Number($("mangaVentoX").value),
    z:Number($("mangaVentoZ").value),rajada:Number($("mangaRajada").value)}));
  $("mangaTempo").onchange=()=>acao(()=>cena.quadroSimulado(Number($("mangaTempo").value)));
  $("mangaPlay").onclick=()=>{
    rodando=!rodando;$("mangaPlay").textContent=rodando?"Pausar":"Simular";
    if(!rodando)return;
    const inicio=performance.now(),base=cena.quadroSimulado();
    function passo(t){
      if(!rodando)return;
      const n=Math.min(100000,base+Math.floor((t-inicio)*24/1000));
      if(n!==cena.quadroSimulado()){cena.quadroSimulado(n);$("mangaTempo").value=n;render()}
      if(n===100000){rodando=false;$("mangaPlay").textContent="Simular";return}
      requestAnimationFrame(passo);
    }
    requestAnimationFrame(passo);
  };
  $("mangaDesenhar").onclick=()=>{
    desenho={id:SCN.list[SCN.active].id,pontos:[]};
    msg.textContent="Clique no corpo para marcar os vértices do painel em ordem.";
  };
  $("mangaCancelar").onclick=()=>{desenho=null;msg.textContent=""};
  svg.addEventListener("pointerdown",e=>{
    if(!desenho)return;
    e.stopImmediatePropagation();e.preventDefault();
    if(desenho.id!==SCN.list[SCN.active].id){desenho=null;msg.textContent="Manequim alterado. Inicie outro painel.";return}
    if(desenho.pontos.length>=40)return;
    const p=sceneList()[SCN.active].p,world=paraMundo(p),local=doMundo(p);
    const click=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const cam=makeXf({...p,wRot:0}),eixos=[[1,0,0],[0,1,0],[0,0,1]].map(cam);
    const juntas=ossosDoCorpo(p).juntas.filter(j=>["pescoço","ombro","cotovelo","punho","quadril","joelho","tornozelo"].includes(j.nome));
    const candidatos=juntas.map(j=>{const w=world(j.P),q=telaDoMundo(p,w);
      return {j,w,q,dist:Math.hypot(q[0]-click.x,q[1]-click.y)}});
    candidatos.sort((a,b)=>a.dist-b.dist);
    const {j,w,q}=candidatos[0],dx=(click.x-q[0])/q[3],dy=(q[1]-click.y)/q[3];
    const pt=local(w.map((v,i)=>v+dx*eixos[i][0]+dy*eixos[i][1]+.7*eixos[i][2]));
    desenho.pontos.push({junta:j.nome,lado:j.s,offset:pt.map((v,i)=>v-j.P[i]),modo:$("mangaPonto").value});
    msg.textContent=desenho.pontos.length+" pontos. Última junta: "+j.nome+".";
  },true);
  $("mangaFechar").onclick=()=>acao(()=>{
    if(!desenho||desenho.id!==SCN.list[SCN.active].id)throw Error("Inicie o desenho no manequim ativo.");
    cena.referencia("painel",{pontos:desenho.pontos,cor:$("mangaCor").value});
    desenho=null;msg.textContent="Painel vestido.";
  });
}
