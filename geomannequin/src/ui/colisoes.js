/* GeoMannequin — painel "Colisões": lista quem atravessa quem e deixa o usuário escolher a correção
   (automática, afastar, girar, ajustar a pose ou permitir o contato), para cada colisão ou para todas */
import { $ } from "../scene/ambiente.js";
import { SCN, setActive } from "../scene/modelo.js";
import {CONTATO_V2,setContatoV2,consultarContatosV2} from "../scene/contato-v2.js";
import {cena} from "../scene/comandos.js";
import {gripSites} from "../engine/grip-sites.js";
import {atualizarApoios} from "../scene/modelo.js";
import {restGround} from "../engine/index.js";
import { COL, resolverObjetos, resolverObjeto, quemMexer, ajustarComposicao, colisoesDaCena, desfazerColisao, permitirContato, resolverPar, resolverTodas, setComposicao, setModoColisao, setPreferir } from "../scene/colisoes.js";
import { render } from "./palco.js";
import { refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";

let assinatura = "";
/** Atalho também funciona em telas estreitas, onde o painel fica abaixo do palco.
 * scrollIntoView desloca o documento e o container #params de modo conjunto. */
function abrirSecaoColisoes({imediato=false}={}){
  const target=$("colSecao");
  if(!target)return false;
  const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  target.scrollIntoView({behavior:imediato||reduced?"instant":"smooth",block:"start"});
  target.focus({preventScroll:true});
  target.classList.remove("col-secao-destaque");
  void target.offsetWidth;
  target.classList.add("col-secao-destaque");
  return true;
}

function msg(t, err) { const m = $("colMsg"); if (m) { m.textContent = t || ""; m.className = "msg" + (err ? " err" : t ? " ok" : ""); } }
function depois(feitos) {
  $("colDesfazer").disabled = !COL.desfazer;
  msg(feitos && feitos.length ? feitos.join(" · ") : "Nada para corrigir.");
  refreshScene(); syncControls(); render();
}
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

/* redesenha a lista só quando as colisões mudam (para não perder o foco dos botões) */
function atualizarColisoes(lista) {
  const el = $("colLista"); if (!el) return;
  if (COL.modo === "desligado") { if (assinatura !== "off") { el.innerHTML = '<p class="col-ok">Verificação desligada.</p>'; assinatura = "off"; } return; }
  const vis = SCN.list.filter(it => !it.oculto).length + SCN.objetos.length;
  const cs = lista || (vis > 1 ? COL.ultima || colisoesDaCena() : []), cp = COL.composicao ? COL.ultimaComp || [] : [];
  const perm = [];
  SCN.list.forEach((a, i) => (a.contato || []).forEach(id => { const j = SCN.list.findIndex(x => x.id === id); if (j >= 0) perm.push([i, j]); }));
  const sig = cs.map(c => c.a + "-" + c.b + "o" + c.objeto + "-" + c.objeto2 + ":" + Math.round(c.prof * 20)).join("|") + "#" + perm.map(x => x.join("-")).join("|") + "#" + cp.map(c => c.tipo + c.a + "-" + c.b).join("|") + "#" + SCN.active + SCN.list.map(i => i.name).join(",");
  if (sig === assinatura) return;
  assinatura = sig;
  let h = "";
  if (!cs.length) h += '<p class="col-ok">' + (vis > 1 ? "Nada atravessa nada: manequins e objetos livres." : "Com 2 ou mais manequins ou objetos, as colisões aparecem aqui.") + "</p>";
  cs.slice(0, 8).forEach((c, k) => {
    if (c.objeto2 !== undefined) { const oa = SCN.objetos[c.objeto], ob = SCN.objetos[c.objeto2];
      h += '<div class="col-item" data-k="' + k + '"><p>' + esc(c.texto) + '</p><div class="linha"><label>Afastar <select data-quem><option value="b" selected>' + esc(oa && ob ? (ob.nome || ob.tipo) : "") + '</option><option value="a">' + esc(oa ? (oa.nome || oa.tipo) : "") + '</option></select></label>' +
        '<button type="button" data-m="objetos" title="Empurra no chão pelo menor caminho">Afastar</button></div></div>'; return; }
    const A = SCN.list[c.a], B = c.objeto !== undefined ? null : SCN.list[c.b], padrao = quemMexer(c);
    if (!B) { h += '<div class="col-item" data-k="' + k + '"><p>' + esc(c.texto) + '</p><div class="linha"><select data-quem hidden><option value="a">a</option></select>' +
      '<button type="button" data-m="auto">Automático</button><button type="button" data-m="distancia">Afastar</button><button type="button" data-m="giro">Girar</button><button type="button" data-m="pose">Ajustar pose</button><button type="button" data-m="ver">Ver</button></div></div>'; return; }
    h += '<div class="col-item" data-k="' + k + '"><p>' + esc(c.texto) + "</p>" +
      '<div class="linha"><label>Mexer em <select data-quem>' +
      '<option value="a"' + (padrao === "a" ? " selected" : "") + ">" + esc(A.name) + "</option>" +
      '<option value="b"' + (padrao === "b" ? " selected" : "") + ">" + esc(B.name) + "</option>" +
      '<option value="ambos">os dois</option></select></label></div>' +
      '<div class="linha">' +
      '<button type="button" data-m="auto" title="Testa afastar, girar e ajustar a pose e fica com a que muda menos">Automático</button>' +
      '<button type="button" data-m="distancia" title="Afasta no chão pelo menor caminho">Afastar</button>' +
      '<button type="button" data-m="giro" title="Menor giro no chão que resolve">Girar</button>' +
      '<button type="button" data-m="pose" title="Corrige só o braço ou a perna que entra no outro">Ajustar pose</button>' +
      '<button type="button" data-m="contato" title="Abraço, aperto de mão: deixa encostar sem avisar">Permitir contato</button>' +
      '<button type="button" data-m="ver" title="Seleciona o manequim">Ver</button></div></div>';
  });
  if (cs.length > 8) h += '<p class="col-ok">e mais ' + (cs.length - 8) + " colisões.</p>";
  cp.slice(0, 6).forEach((c, k) => { h += '<div class="col-item permitido"><p>Composição: ' + esc(c.texto) + '</p><div class="linha"><button type="button" data-comp="' + k + '" title="O menor passo no chão que resolve, sem criar colisão">Ajustar</button></div></div>'; });
  perm.forEach(([i, j]) => { h += '<div class="col-item permitido"><p>Contato permitido: ' + esc(SCN.list[i].name) + " ↔ " + esc(SCN.list[j].name) + '</p><div class="linha"><button type="button" data-tirar="' + i + "-" + j + '">Voltar a avisar</button></div></div>'; });
  el.innerHTML = h;
  el._cs = cs;
}
export function iniciarColisoes() {
  const el = $("colLista"); if (!el) return;
  $("colisoesAtalho")?.addEventListener("click",()=>abrirSecaoColisoes());
  if(new URLSearchParams(window.location.search).get("painel")==="colisoes"){
    // O DOM já existe; aguarda o início do layout para centralizar o painel.
    requestAnimationFrame(()=>requestAnimationFrame(()=>abrirSecaoColisoes({imediato:true})));
  }
  $("colModo").value = COL.modo; $("colPref").value = COL.preferir;
  const v2=$("colV2"),status=$("colV2Status");
  const gripChoice=$("colV3Ponto");
  let previousGripObj=null;
  function refreshGripSites(){
    if(!gripChoice)return;
    const o=SCN.objetos.find(x=>x.id===SCN.objSel),id=o?.id??null;
    if(id===previousGripObj)return;
    previousGripObj=id;gripChoice.replaceChildren();
    gripChoice.add(new Option("Mais próximo da palma","auto"));
    if(o)for(const s of gripSites(o))gripChoice.add(new Option(s.nome,s.id));
  }
  refreshGripSites();
  if(v2){v2.checked=CONTATO_V2.enabled;v2.addEventListener("change",()=>{
    setContatoV2({enabled:v2.checked});status.textContent=v2.checked?
      "Geometria de contato V2 ativa: bloqueio 3D detalhado ao arrastar.":"Motor detalhado desativado.";render();
  })}
  let animacaoFisica=false;
  function animarQueda(){
    if(animacaoFisica)return;
    animacaoFisica=true;
    const botao=$("colV3Animar");
    if(botao)botao.disabled=true;
    let anterior=null,frames=0;
    const tick=(agora)=>{
      try{
        const dt=anterior===null?1/60:Math.min(.05,Math.max(0,(agora-anterior)/1000));
        anterior=agora;
        const r=cena.avancarFisica(dt);
        render();frames++;
        if(r.ativos&&frames<1200){
          requestAnimationFrame(tick);
        }else{
          animacaoFisica=false;
          if(botao)botao.disabled=false;
          status.textContent=r.ativos?"Animação interrompida pelo limite de segurança.":
            "Queda concluída. O objeto parou no contato detectado.";
          refreshScene();
        }
      }catch(e){
        animacaoFisica=false;
        if(botao)botao.disabled=false;
        status.textContent="Falha na animação: "+e.message;
      }
    };
    requestAnimationFrame(tick);
  }
  $("colV3Animar")?.addEventListener("click",()=>{
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    if(!obj){status.textContent="Selecione o objeto antes de animar sua queda.";return}
    try{
      if(obj.gripV3||obj.grip)cena.soltarObjeto(obj.id,{modo:"queda"});
      else if(!obj.dinamica?.ativo)cena.obterObjeto(obj.id).cair();
      animarQueda();
    }catch(e){status.textContent="Não foi possível animar: "+e.message}
  });
  // AutoGrip: os comandos de UI chamam exatamente a API usada pelo editor/MCP.
  function opcoesAutoGrip(){
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    const holder=obj?.gripV3?.mannequinId??obj?.grip?.mannequinId;
    const owner=SCN.list.findIndex(m=>m.id===holder);
    return {manequim:owner<0?SCN.active:owner,mao:$("colAutoMao")?.value||"auto",
      pegada:$("colAutoPegada")?.value||"auto",
      ponto:gripChoice?.value||"auto",reach:Math.max(12,Number($("colV3Reach")?.value||5)),
      preservarObjeto:true,exigirContato:true};
  }
  function resumoAutoGrip(r){
    const q=r.escolha||r.qualidade;
    return q?"Pegada "+q.pegada+" / "+q.mao+" / "+q.ponto+
      "; "+q.contatosAtivos+" contatos; desvio de palma "+q.desvioPalma+
      " R; interpenetração "+q.penetracao+" R.":
      (r.rejeitados||[]).slice(0,3).map(c=>c.motivo).join(" | ")||"Nenhuma pegada validada.";
  }
  let autoOcupado=false;
  function executarAutoGrip(aplicar){
    if(autoOcupado)return;
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    if(!obj){status.textContent="Selecione um objeto da cena para o AutoGrip.";return}
    autoOcupado=true;
    const a=$("colAutoEncaixar"),b=$("colAutoPrever");
    if(a)a.disabled=true;if(b)b.disabled=true;
    status.textContent=aplicar?"AutoGrip: procurando encaixe e contatos…":"AutoGrip: calculando prévia sem mover o objeto…";
    requestAnimationFrame(()=>{
      try{
        const opts=opcoesAutoGrip();
        const r=aplicar?cena.autoEncaixarObjeto(obj.id,opts):cena.planejarEncaixe(obj.id,opts);
        status.textContent=r.status==="inviavel"?
          "Não foi possível encaixar: "+resumoAutoGrip(r):
          (aplicar?"AutoGrip aplicado. ":"Prévia geométrica; nada alterado. ")+resumoAutoGrip(r);
        if(aplicar){refreshScene();syncControls();render()}
      }catch(e){status.textContent="AutoGrip: "+e.message}
      finally{autoOcupado=false;if(a)a.disabled=false;if(b)b.disabled=false}
    });
  }
  $("colAutoVerificar")?.addEventListener("click",()=>{
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    if(!obj){status.textContent="Selecione um objeto para verificar a pegada.";return}
    try{
      const report=cena.inspecionarAutoGrip(obj.id);
      status.textContent=report.status==="livre"?"Objeto ainda não está segurado.":
        report.status==="vinculo_v2"?"Pegada antiga V2: use Autoencaixar para ajustar.":
        (report.necessitaAjuste?"Pegada precisa de correção. ":"Pegada geometricamente válida. ")+
        "Penetração máxima "+report.penetracaoCena.toFixed(3)+
        " R; contatos por mão: "+report.porMao.map(x=>x.mao+" "+x.contatos).join(", ")+".";
    }catch(e){status.textContent="Verificação AutoGrip: "+e.message}
  });
  $("colAutoPrever")?.addEventListener("click",()=>executarAutoGrip(false));
  $("colAutoEncaixar")?.addEventListener("click",()=>executarAutoGrip(true));
  $("colV2Segurar")?.addEventListener("click",()=>{
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    if(!obj){status.textContent="Selecione um objeto antes de segurar.";return}
    try{
      const mao=$("colV2Mao").value,reach=Number($("colV3Reach")?.value??5);
      const r=cena.segurarObjeto(obj.id,{
        manequim:SCN.active,mao,reach,ponto:gripChoice?.value||"auto",
        modo:$("colV3Modo")?.value||"preservar",segunda:!!obj.gripV3
      });
      status.textContent="Grip V3: "+r.objeto+" / "+r.mao+" / "+r.ponto+
        " ("+(r.distancia*11.4).toFixed(1)+" cm)."+
        (r.secundaria?(r.alcancavel?" Segunda mão vinculada por IK.":" Segunda mão registrada, mas sem alcance preciso."): " O objeto acompanha a palma em 3D.");
      refreshScene();syncControls();render();
    }catch(e){status.textContent="Não foi possível segurar: "+e.message}
  });
  $("colV3Transferir")?.addEventListener("click",()=>{
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    if(!obj){status.textContent="Selecione uma cadeira já segurada com as duas mãos.";return}
    try{
      const r=cena.transferirMaoPrincipal(obj.id,{mao:$("colV2Mao").value});
      status.textContent=r.alterado?"Mão principal: "+r.mao+
        ". A outra mão passa a acompanhar o objeto por IK.":
        "Esta mão já é a principal.";
      refreshScene();syncControls();render();
    }catch(e){status.textContent="Não foi possível transferir: "+e.message}
  });
  $("colV2Soltar")?.addEventListener("click",()=>{
    const obj=SCN.objetos.find(o=>o.id===SCN.objSel);
    if(!obj||(!obj.gripV3&&!obj.grip)){status.textContent="Selecione um objeto segurado.";return}
    try{
      const modo=$("colV3Soltar")?.value||"manter";
      const soltou=cena.soltarObjeto(obj.id,{modo});
      status.textContent=soltou?"Objeto liberado ("+modo+"). Queda aproximada: gravidade por etapas; pouso geométrico.":
        "Uma das mãos continua segurando o objeto.";
      atualizarApoios();refreshScene();syncControls();render();
      if(modo==="queda"&&soltou)animarQueda();
    }catch(e){status.textContent="Erro ao soltar: "+e.message}
  });
  $("colV2Consultar")?.addEventListener("click",()=>{
    try{const hits=consultarContatosV2({max:60}),fatal=hits.filter(c=>c.prof>CONTATO_V2.tol);
      status.textContent=hits.length?`${hits.length} contato(s) em 3D; ${fatal.length} acima da tolerância. Mais profundo: ${hits[0].pa} × ${hits[0].pb} (${(hits[0].prof*11.4).toFixed(1)} cm em proxy).`:
      "Sem interpenetração detectada nos colisores 3D nesta cena.";
    }catch(e){status.textContent="Falha na inspeção: "+e.message}
  });
  $("colModo").addEventListener("change", () => { setModoColisao($("colModo").value); assinatura = ""; msg(""); render(); });
  $("colPref").addEventListener("change", () => setPreferir($("colPref").value));
  $("colComp").checked = !!COL.composicao;
  $("colComp").addEventListener("change", () => { setComposicao($("colComp").checked); assinatura = ""; render(); });
  el.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    try {
      if (b.dataset.comp !== undefined) { assinatura = ""; depois(ajustarComposicao(+b.dataset.comp)); return; }
      if (b.dataset.tirar) { const [i, j] = b.dataset.tirar.split("-").map(Number); permitirContato(i, j, false); assinatura = ""; depois(["Contato volta a ser verificado."]); return; }
      const box = b.closest(".col-item"), c = el._cs && el._cs[+box.dataset.k]; if (!c) return;
      const m = b.dataset.m, quem = box.querySelector("[data-quem]").value;
      if (c.objeto2 !== undefined) { depois(resolverObjetos(c.objeto, c.objeto2, quem)); return; }
      if (m === "ver") { setActive(quem === "a" ? c.a : c.b); return; }
      if (c.objeto !== undefined && m !== "ver") { depois(resolverObjeto(c.a, c.objeto, m)); return; }
      if (m === "contato") { permitirContato(c.a, c.b, true); assinatura = ""; depois([SCN.list[c.a].name + " e " + SCN.list[c.b].name + " podem encostar (sem aviso)."]); return; }
      depois(resolverPar(c.a, c.b, m, quem));
    } catch (err) { msg(err.message, true); }
  });
  $("colTodas").addEventListener("click", () => { try { depois(resolverTodas($("colPref").value)); } catch (err) { msg(err.message, true); } });
  $("colDesfazer").addEventListener("click", () => { if (desfazerColisao()) depois(["Correção desfeita."]); $("colDesfazer").disabled = true; });
  if (typeof window !== "undefined") window.addEventListener("gm:desenhou", () => { $("colModo").value = COL.modo; $("colPref").value = COL.preferir; $("colComp").checked = !!COL.composicao; if($("colV2"))$("colV2").checked=CONTATO_V2.enabled; atualizarColisoes();refreshGripSites(); });
}
export { atualizarColisoes };
