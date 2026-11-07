/* GeoMannequin — valores padrão de todos os parâmetros (DEF), modos de camadas (PRESETS) e estilos de traço */

const DEF={yaw:0,pitch:0,roll:0,zoom:1,skull:0.82,jaw:0.60,chin:0.27,face:38,chinProj:0.80,neck:0.56,brow:0.06,nose:0.24,lips:0.045,
  eyeSize:1.25,eyeGap:22,eyeOpen:1.1,browW:0.045,earSize:1,earFlare:1,eyeStyle:1,shW:1.78,shDrop:0.72,lightAz:-44,lightEl:52,headYaw:0,headPitch:0,headRoll:0,neckLen:0.76,chestF:0,adam:0,shElevL:0,shElevR:0,shProtL:0,shProtR:0,shTension:0.3,armAbdL:12,armAbdR:12,armFlexL:0,armFlexR:0,armRotL:0,armRotR:0,elbowL:0,elbowR:0,armLen:1,armThick:1,muscle:0.6,fat:0.15,fem:0.2,gluteVol:1,waist:0.93,hips:1.08,thighThick:1,legLen:1,pronL:0,pronR:0,wristL:0,wristR:0,handCurlL:0.3,handCurlR:0.3,spineFlex:0,spineSide:0,spineTwist:0,pelvisTilt:0,pelvisSide:0,pelvisTwist:0,hipFlexL:0,hipFlexR:0,hipAbdL:3,hipAbdR:3,hipRotL:0,hipRotR:0,kneeFlexL:0,kneeFlexR:0,ankleFlexL:0,ankleFlexR:0,ankleTiltL:0,ankleTiltR:0,toesL:0,toesR:0,ground:1,panX:0,panY:0,wx:0,wy:0,wz:0,wRot:0,tx:0,ty:0,tz:0,persp:1,camDist:30,lens:50,atmo:0.4};
const PRESETS={
  manequim:{sil:1,fill:1,shade:1,sphere:0,planes:0,rings:1,merid:1,jaw:0,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:1,arms:1,hands:1,legs:1,hidden:0,grid:1,prop:1,floor:1,shadow:1,horizon:0,fibras:0,cel:0},
  construcao:{sil:1,fill:1,shade:0,sphere:1,planes:1,rings:1,merid:1,jaw:1,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:1,arms:1,hands:1,legs:1,hidden:1,grid:1,prop:1,floor:1,shadow:1,horizon:1,fibras:0,cel:0},
  /* écorché: anatomia limpa (linhas de músculo com hierarquia, tons planos), sem guias */
  ecorche:{sil:1,fill:1,shade:1,sphere:0,planes:0,rings:0,merid:0,jaw:0,feat:1,eyes:1,ears:1,neck:1,torso:1,anat:1,girdle:0,arms:1,hands:1,legs:1,hidden:0,grid:1,prop:0,floor:1,shadow:1,horizon:0,fibras:0,cel:1}
};
const ST={
  eyeU:{c:"ink",w:2.0},pupil:{c:"ink",w:1},brow:{c:"ink",w:0.7},
  jaw:{c:"ink",w:1.2},anat:{c:"ink",w:1.5},mus:{c:"ink",w:1.05},
  /* hierarquia de traço anatômico: sobreposição firme, divisão interna média, fibras finas */
  dobra:{c:"ink",w:1.95},divisao:{c:"ink",w:1.0},fibra:{c:"ink",w:0.5},gdash:{c:"ink",w:0.9},ext:{c:"cobalt",w:1.0},
  sil:{c:"ink",w:2.3},silN:{c:"ink",w:2.3},silH:{c:"ink",w:1.5},ring:{c:"coral",w:1.1},axis:{c:"coral",w:1.3},jaxis:{c:"coral",w:1.0},
  sphere:{c:"cobalt",w:1.1},plane:{c:"cobalt",w:1.1},feat:{c:"ink",w:1.3},ear:{c:"ink",w:1.4}
};

export { DEF, PRESETS, ST };
