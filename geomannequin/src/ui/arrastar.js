/* GeoMannequin — interação no palco: girar, mover no chão, alças de cinemática inversa, roda do mouse */
import { $ } from "../scene/ambiente.js";
import { lastInfo, render, svgEl } from "./palco.js";
import { P, SCN, sceneList, setActive } from "../scene/modelo.js";
import { moveMode, refreshScene } from "./painel-cena.js";
import { syncControls } from "./controles.js";
import { guardArms } from "../scene/poses.js";
import { D, H, W, bodyProxies, clamp, effScale, ikArm, ikLeg, makeMat, pickAt, ptW, pushOut, shape } from "../engine/index.js";

/* arrastar para girar */
let drag=null;
let stage;
function svgPt(e){
  const r=svgEl.getBoundingClientRect();
  return [(e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H];
}
const endDrag=()=>{if(drag){drag=null;render()}};

/* execução inicial deste módulo (na mesma ordem do app original) */
export function iniciarArrastar(){
  stage=$("stage");
  stage.addEventListener("pointerdown",e=>{
    const q=svgPt(e);let best=null,bd=18;
    if(lastInfo&&lastInfo.handles)lastInfo.handles.forEach(h=>{if(h.k==="elbow"||h.k==="knee")return;const d=Math.hypot(h.x-q[0],h.y-q[1]);if(d<bd){bd=d;best=h}});
    const wP=v=>{try{const w=ptW(Object.assign({},P,{wy:sceneList()[SCN.active].p.wy}),v);return isFinite(w)&&w>0?w:1}catch(err){return 1}};
    if(best)drag={mode:best.k,s:best.s,P0:best.P.slice(),q0:q,hy:P.headYaw,hp:P.headPitch,w:wP(best.P)};
    else{
      const id=SCN.list.length>1?pickAt(q[0],q[1]):-1;
      if(id>=0&&id!==SCN.active&&!e.shiftKey){setActive(id);return}
      if(moveMode&&(id===SCN.active||SCN.list.length===1))drag={mode:"move",q0:q,wx:P.wx,wz:P.wz,w:wP([0,-8,0])};
      else if(e.shiftKey||e.button===1)drag={mode:"pan",q0:q,px:P.panX,py:P.panY};
      else drag={mode:"view",x:e.clientX,y:e.clientY,yaw:P.yaw,pitch:P.pitch};
    }
    try{stage.setPointerCapture(e.pointerId)}catch(err){}
  });
  stage.addEventListener("pointermove",e=>{
    if(!drag)return;
    if(drag.mode==="view"){
      let yaw=drag.yaw+(e.clientX-drag.x)*0.6;
      yaw=((yaw+180)%360+360)%360-180;
      P.yaw=Math.round(yaw);
      P.pitch=Math.round(clamp(drag.pitch-(e.clientY-drag.y)*0.4,-70,70));
    }else if(drag.mode==="pan"){
      const q=svgPt(e),Sx=effScale(P);P.panX=drag.px+(q[0]-drag.q0[0])/Sx;P.panY=drag.py-(q[1]-drag.q0[1])/Sx;
    }else if(drag.mode==="move"){
      const q=svgPt(e),Sx=effScale(P)*drag.w,x1=(q[0]-drag.q0[0])/Sx,z1=(q[1]-drag.q0[1])/Sx/Math.max(0.35,Math.abs(Math.sin(P.pitch*D))||0.35);
      const yw=P.yaw*D;P.wx=clamp(drag.wx+x1*Math.cos(yw)-z1*Math.sin(yw),-30,30);P.wz=clamp(drag.wz+x1*Math.sin(yw)+z1*Math.cos(yw),-30,30);
      refreshScene();
    }else{
      const q=svgPt(e),Sx=effScale(P)*(drag.w||1),dv=[(q[0]-drag.q0[0])/Sx,-(q[1]-drag.q0[1])/Sx,0];
      if(drag.mode==="head"){
        P.headYaw=Math.round(clamp(drag.hy+dv[0]*60,-80,80));
        P.headPitch=Math.round(clamp(drag.hp-dv[1]*60,-60,50));
      }else{
        const M3=makeMat(P),dw=[M3[0][0]*dv[0]+M3[0][1]*dv[1],M3[1][0]*dv[0]+M3[1][1]*dv[1],M3[2][0]*dv[0]+M3[2][1]*dv[1]];
        const tg=[drag.P0[0]+dw[0],drag.P0[1]+dw[1],drag.P0[2]+dw[2]];
        if(drag.mode==="ankle"){
          const r=ikLeg(P,shape(P),drag.s,tg),L_=drag.s>0?"L":"R";
          P["hipFlex"+L_]=Math.round(r.hipFlex);P["hipAbd"+L_]=Math.round(r.hipAbd);P["hipRot"+L_]=Math.round(r.hipRot);P["kneeFlex"+L_]=Math.round(r.knee);P["ankleFlex"+L_]=r.ankle;
          guardArms();syncControls();render();return;
        }
        const sh=shape(P),r=ikArm(P,sh,drag.s,pushOut(tg,bodyProxies(P,sh),0.3)),L_=drag.s>0?"L":"R";
        P["armAbd"+L_]=r.abd;P["armFlex"+L_]=r.flex;P["armRot"+L_]=r.rot;P["elbow"+L_]=r.elbow;guardArms();
      }
    }
    syncControls();render();
  });
  stage.addEventListener("wheel",e=>{e.preventDefault();
    if(P.persp)P.camDist=+clamp(P.camDist*Math.exp(e.deltaY*0.0012),4,200).toFixed(2);else P.zoom=clamp(P.zoom*Math.exp(-e.deltaY*0.0012),0.05,3);
    syncControls();render()},{passive:false});
  stage.addEventListener("pointerup",endDrag);
  stage.addEventListener("pointercancel",endDrag);
}

export { drag, stage, svgPt, endDrag };
