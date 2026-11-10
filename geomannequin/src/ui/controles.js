/* GeoMannequin — sliders, camadas e botões de poses, corpos, rostos e enquadramentos */
import { LAY, SL, POSEKEYS, faixa, ajustarAoPerfil } from "../scene/parametros.js";
import { $ } from "../scene/ambiente.js";
import { P, WORLDK } from "../scene/modelo.js";
import { FACES, GUARD, POSTURES, doBodyPose, guardArms , EXPRESSOES } from "../scene/poses.js";
import { aplicarBiotipo, transitarSexo } from "../scene/biotipos.js";
import { fmt } from "./exportar.js";
import { render, setQuick, setSettle, settle } from "./palco.js";
import { L, setMode, setPreset } from "../scene/modos.js";
import { updateModeButtons } from "./modos.js";
import { autoFit, setZoomEff } from "../scene/enquadrar.js";
import { applyStyle } from "./estilo.js";
import { refreshScene } from "./painel-cena.js";
import { CY, DEF, effScale } from "../engine/index.js";

function syncControls(){
  /* a faixa dos sliders de pose acompanha o perfil de flexibilidade */
  SL.forEach(d=>{const el=$("sl_"+d.k);if(POSEKEYS.has(d.k)){const [a,b]=faixa(d.k,P.flex);if(+el.min!==a)el.min=a;if(+el.max!==b)el.max=b}el.value=P[d.k];$("ov_"+d.k).textContent=fmt(d,P[d.k])});
  LAY.forEach(l=>{$("ly_"+l.k).checked=!!L[l.k]});
  {const q=$("headModelSelect");if(q)q.value=P.headModel==="v2"?"v2":"v1"}
  {const o=$("ocultas");if(o){const v=Math.round(100*(L.ocultas===undefined?0.5:L.ocultas));o.value=v;$("ov_ocultas").textContent=v+"%"}}
}

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarControles(){
  /* Seletor reversível, independente dos sliders numéricos. */
  {const wrap=document.createElement("div");wrap.className="slider";wrap.innerHTML='<label for="headModelSelect">Geometria da cabeça</label><select id="headModelSelect"><option value="v1">Cabeça V1 — estável</option><option value="v2">Cabeça V2 — experimental</option></select>';const panel=$("slProp");if(panel){panel.appendChild(wrap);wrap.querySelector("select").addEventListener("change",e=>{P.headModel=e.target.value==="v2"?"v2":"v1";render()})}}

  SL.forEach(d=>{
    const wrap=document.createElement("div");wrap.className="slider";
    wrap.innerHTML='<label for="sl_'+d.k+'">'+d.label+'</label><output id="ov_'+d.k+'" for="sl_'+d.k+'"></output>'+
      '<input type="range" id="sl_'+d.k+'" min="'+d.min+'" max="'+d.max+'" step="'+d.step+'">';
    $(d.g).appendChild(wrap);
    const inp=wrap.querySelector("input");
    inp.addEventListener("input",()=>{const v=parseFloat(inp.value);if(d.k==="fem"){transitarSexo(P,v);syncControls()}else P[d.k]=v;if(d.k==="flex"){ajustarAoPerfil(P);syncControls()}if(GUARD.test(d.k)&&guardArms())syncControls();$("ov_"+d.k).textContent=fmt(d,P[d.k]);setQuick(true);clearTimeout(settle);setSettle(setTimeout(()=>{setQuick(false);render()},260));render()});
  });
  LAY.forEach(l=>{
    const lab=document.createElement("label");lab.className="layer";
    lab.innerHTML='<input type="checkbox" id="ly_'+l.k+'"><span class="sw '+l.sw+'"></span><span>'+l.label+'</span>';
    $("layerList").appendChild(lab);
    lab.querySelector("input").addEventListener("change",e=>{L[l.k]=e.target.checked;setMode(null);updateModeButtons();render()});
  });
  {const o=$("ocultas");if(o)o.addEventListener("input",()=>{L.ocultas=+o.value/100;$("ov_ocultas").textContent=o.value+"%";if(L.ocultas>0.01&&!L.hidden)L.hidden=1;setMode(null);updateModeButtons();syncControls();render()})}
  document.querySelectorAll("[data-head]").forEach(b=>{
    b.addEventListener("click",()=>{
      const v=b.dataset.head.split(",").map(Number);
      P.headYaw=v[0];P.headPitch=v[1];P.headRoll=v[2];syncControls();render();
    });
  });
  document.querySelectorAll("[data-posture]").forEach(b=>{
    b.addEventListener("click",()=>{Object.assign(P,{headPitch:P.headPitch,headRoll:P.headRoll},POSTURES[b.dataset.posture]);syncControls();render()});
  });
  document.querySelectorAll("[data-body]").forEach(b=>{
    b.addEventListener("click",()=>{aplicarBiotipo(P,b.dataset.body,P.fem);syncControls();render()});
  });
  document.querySelectorAll("[data-bpose]").forEach(b=>{
    b.addEventListener("click",()=>{doBodyPose(b.dataset.bpose);syncControls();render()});
  });
  document.querySelectorAll("[data-expr]").forEach(b=>{
    b.addEventListener("click",()=>{Object.assign(P,EXPRESSOES[b.dataset.expr]);syncControls();render()});
  });
  document.querySelectorAll("[data-hand]").forEach(b=>{
    b.addEventListener("click",()=>{P.handCurlL=P.handCurlR=parseFloat(b.dataset.hand);syncControls();render()});
  });
  document.querySelectorAll("[data-frame]").forEach(b=>{
    b.addEventListener("click",()=>{
      const f=b.dataset.frame;
      if(f==="corpo"){autoFit();syncControls();render();return}
      const z=f==="retrato"?1.75:1,focus=f==="retrato"?-0.35:-1.5;
      setZoomEff(z);const Sx=effScale(P);P.panY=f==="busto"?0:+((CY-350)/Sx-focus).toFixed(2);P.panX=0;
      syncControls();render();
    });
  });
  document.querySelectorAll("[data-arms]").forEach(b=>{
    b.addEventListener("click",()=>{
      const v=b.dataset.arms.split(",").map(Number);
      P.armAbdL=P.armAbdR=v[0];P.armFlexL=P.armFlexR=v[1];P.armRotL=P.armRotR=v[2];P.elbowL=P.elbowR=v[3];
      syncControls();render();
    });
  });
  document.querySelectorAll("[data-style]").forEach(b=>{
    b.addEventListener("click",()=>{applyStyle(b.dataset.style);render()});
  });
  document.querySelectorAll("[data-face]").forEach(b=>{
    b.addEventListener("click",()=>{
      const face=b.dataset.face;
      if(face==="masculino"||face==="feminino")transitarSexo(P,face==="feminino"?1:0);
      /* Restaurar só os traços faciais, sem apagar o biotipo nem os ajustes de cintura/quadril. */
      ["skull","jaw","chin","face","chinProj","brow","nose","lips","eyeSize","browW","earSize","adam"].forEach(k=>P[k]=DEF[k]);
      Object.assign(P,FACES[face]);syncControls();render();
    });
  });
  document.querySelectorAll("[data-pose]").forEach(b=>{
    b.addEventListener("click",()=>{
      const v=b.dataset.pose.split(",").map(Number);
      P.yaw=v[0];P.pitch=v[1];P.roll=v[2];syncControls();render();
    });
  });
  document.querySelectorAll("[data-mode]").forEach(b=>{
    b.addEventListener("click",()=>{setPreset(b.dataset.mode);syncControls();render()});
  });
  $("reset").addEventListener("click",()=>{const keep={};WORLDK.forEach(k=>keep[k]=P[k]);Object.assign(P,DEF,keep);setPreset("manequim");autoFit();syncControls();refreshScene();render()});
}

export { syncControls };
