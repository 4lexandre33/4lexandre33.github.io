import {$} from "../scene/ambiente.js";
import {SCN,sceneList} from "../scene/modelo.js";
import {cena} from "../scene/comandos.js";
import {render} from "./palco.js";
import {marcarTecido,marcarRaiz} from "../engine/index.js";

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
  function ajustes(){
    const raizes=$("mangaRaizes").value.trim();
    return {cor:$("mangaCor").value,escala:Number($("mangaEscala").value),previa:$("mangaPrevia").checked,
      exportar:$("mangaSaida").checked,duracao:Number($("mangaDuracao").value),...(raizes?{raizes:JSON.parse(raizes)}:{})};
  }
  lista.onchange=()=>{
    const r=cena.referencias()[Number(lista.value)];if(!r)return;
    $("mangaCor").value=r.cor;$("mangaEscala").value=r.escala;$("mangaDuracao").value=r.duracao;
    $("mangaPrevia").checked=r.previa;$("mangaSaida").checked=r.exportar;$("mangaRaizes").value=r.raizes?JSON.stringify(r.raizes):"";
  };
  $("mangaEditar").onclick=()=>acao(()=>{
    const i=Number(lista.value),r=cena.referencias()[i];if(!r)throw Error("Escolha uma referência.");
    cena.referencia(r.tipo,{...ajustes(),indice:i});
  });
  $("mangaAdicionar").onclick=()=>acao(()=>{
    const tipo=$("mangaTipo").value;
    cena.referencia(tipo,{...ajustes(),inicio:cena.quadroSimulado()});
    lista.value="";msg.textContent="Referência criada.";
  });
  $("mangaVisivel").onclick=()=>acao(()=>{
    const i=Number(lista.value),r=cena.referencias()[i];if(!r)throw Error("Escolha uma referência.");
    cena.referencia(r.tipo,{indice:i,ativo:!r.ativo});
  });
  $("mangaAmostra").onclick=()=>acao(()=>{
    const i=Number(lista.value),novo=cena.amostrarRastro(cena.referencias()[i]?.tipo==="rastro"?i:null,{cor:$("mangaCor").value});
    sincronizar();lista.value=String(novo);msg.textContent="Posição da mão registrada neste quadro.";
  });
  $("mangaRemover").onclick=()=>acao(()=>cena.removerReferencia(Number(lista.value)));
  $("mangaAplicarVento").onclick=()=>acao(()=>cena.vento({x:Number($("mangaVentoX").value),
    z:Number($("mangaVentoZ").value),rajada:Number($("mangaRajada").value)}));
  $("mangaVentoChave").onclick=()=>acao(()=>cena.ventoChave(cena.quadroSimulado(),{
    x:Number($("mangaVentoX").value),z:Number($("mangaVentoZ").value),rajada:Number($("mangaRajada").value)}));
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
  $("mangaMarcarRaiz").onclick=()=>{
    desenho={id:SCN.list[SCN.active].id,cabelo:true,pontos:[]};
    msg.textContent="Clique no couro cabeludo e finalize para aplicar as raízes.";
  };
  $("mangaCancelar").onclick=()=>{desenho=null;msg.textContent=""};
  svg.addEventListener("pointerdown",e=>{
    if(!desenho)return;
    e.stopImmediatePropagation();e.preventDefault();
    if(desenho.id!==SCN.list[SCN.active].id){desenho=null;msg.textContent="Manequim alterado. Inicie outro painel.";return}
    if(desenho.pontos.length>=40)return;
    const p=sceneList()[SCN.active].p;
    const click=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    const ponto=desenho.cabelo?marcarRaiz(p,click.x,click.y,Number($("mangaMecha").value)):
      marcarTecido(p,click.x,click.y,$("mangaPonto").value);
    if(!ponto){msg.textContent=desenho.cabelo?"Clique na região do couro cabeludo.":"Clique sobre o manequim.";return}
    desenho.pontos.push(ponto);
    msg.textContent=desenho.pontos.length+(desenho.cabelo?" raízes marcadas.":" pontos no tecido.");
  },true);
  $("mangaFechar").onclick=()=>acao(()=>{
    if(!desenho||desenho.id!==SCN.list[SCN.active].id)throw Error("Inicie o desenho no manequim ativo.");
    if(desenho.cabelo){
      const tipo=$("mangaTipo").value;
      cena.referencia(["curto","longo","franja","preso"].includes(tipo)?tipo:"longo",{...ajustes(),raizes:desenho.pontos});
      $("mangaRaizes").value=JSON.stringify(desenho.pontos);msg.textContent="Mechas aplicadas.";
    }else{
      cena.referencia("painel",{...ajustes(),pontos:desenho.pontos});msg.textContent="Painel vestido.";
    }
    desenho=null;
  });
}
