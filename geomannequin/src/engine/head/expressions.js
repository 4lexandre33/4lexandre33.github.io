import {clamp} from "./constants.js";
/* Camada de controle de expressão; compartilha os mesmos parâmetros da v1. */
export const EXPRESSION_V2=Object.freeze({
 neutra:{jawOpen:0,smile:0,eyeLid:0,browUp:0,browIn:0},
 sorriso:{jawOpen:.05,smile:.9,eyeLid:.15,browUp:.10,browIn:0},
 sorriso_aberto:{jawOpen:.58,smile:.9,eyeLid:.12,browUp:.10,browIn:0},
 surpresa:{jawOpen:.75,smile:0,eyeLid:0,browUp:.9,browIn:-.3},
 franzir:{jawOpen:0,smile:-.08,eyeLid:.32,browUp:-.4,browIn:.8}
});
export function expressionParamsV2(p,name,weight=1){
 const preset=EXPRESSION_V2[name];if(!preset)throw Error("Expressão desconhecida: "+name);
 const w=clamp(weight,0,1),q={...p};
 for(const [k,v]of Object.entries(preset))q[k]=(p[k]||0)*(1-w)+v*w;
 return q;
}
