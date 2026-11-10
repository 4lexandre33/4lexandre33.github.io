/* GeoMannequin — 10 biotipos adultos independentes, com interpolação contínua de morfologia.
   Um único lugar define ombros, pescoço, cintura, bacia, glúteos, coxas e braços por sexo/perfil. */
const BIOTIPOS = Object.freeze({
  masculino: Object.freeze({
    magro:     {muscle:0.15,fat:0.04,waist:0.87,hips:1.06,shW:1.68,shDrop:0.70,armThick:0.90,thighThick:0.90,gluteVol:0.85,neck:0.53,chestF:0},
    medio:     {muscle:0.40,fat:0.20,waist:0.93,hips:1.10,shW:1.78,shDrop:0.72,armThick:1.00,thighThick:1.00,gluteVol:1.00,neck:0.56,chestF:0},
    atletico:  {muscle:0.75,fat:0.12,waist:0.93,hips:1.10,shW:1.84,shDrop:0.66,armThick:1.08,thighThick:1.07,gluteVol:1.12,neck:0.59,chestF:0},
    musculoso: {muscle:1.00,fat:0.08,waist:0.98,hips:1.15,shW:1.93,shDrop:0.61,armThick:1.17,thighThick:1.14,gluteVol:1.25,neck:0.64,chestF:0},
    cheio:     {muscle:0.32,fat:0.80,waist:1.10,hips:1.14,shW:1.79,shDrop:0.75,armThick:1.13,thighThick:1.17,gluteVol:1.28,neck:0.61,chestF:0}
  }),
  feminino: Object.freeze({
    magro:     {muscle:0.15,fat:0.08,waist:0.95,hips:0.98,shW:1.58,shDrop:0.72,armThick:0.83,thighThick:0.90,gluteVol:0.95,neck:0.46,chestF:0.38},
    medio:     {muscle:0.35,fat:0.24,waist:0.99,hips:1.02,shW:1.62,shDrop:0.72,armThick:0.95,thighThick:1.00,gluteVol:1.14,neck:0.47,chestF:0.55},
    atletico:  {muscle:0.69,fat:0.16,waist:1.00,hips:1.04,shW:1.72,shDrop:0.67,armThick:1.04,thighThick:1.07,gluteVol:1.20,neck:0.50,chestF:0.48},
    musculoso: {muscle:0.95,fat:0.12,waist:1.04,hips:1.10,shW:1.84,shDrop:0.63,armThick:1.15,thighThick:1.16,gluteVol:1.28,neck:0.54,chestF:0.47},
    cheio:     {muscle:0.30,fat:0.80,waist:1.14,hips:1.07,shW:1.67,shDrop:0.76,armThick:1.10,thighThick:1.17,gluteVol:1.38,neck:0.52,chestF:0.67}
  })
});
const NOMES_BIOTIPOS=Object.freeze(["magro","medio","atletico","musculoso","cheio"]);
const CHAVES_BIOTIPO=Object.freeze(Object.keys(BIOTIPOS.masculino.medio));
const LIMITES_BIOTIPO={
  muscle:[0,1],fat:[0,1],waist:[0.7,1.2],hips:[0.85,1.4],shW:[1.3,2.3],
  shDrop:[0.2,0.9],armThick:[0.7,1.5],thighThick:[0.75,1.3],gluteVol:[0,2],neck:[0.3,0.75],chestF:[0,1]
};
const limitar=(x,a,b)=>Math.max(a,Math.min(b,x));
function perfilBiotipo(tipo="medio",fem=0){
  if(!NOMES_BIOTIPOS.includes(tipo))throw new Error("Biotipo desconhecido: "+tipo);
  const t=limitar(Number.isFinite(fem)?fem:0,0,1),a=BIOTIPOS.masculino[tipo],b=BIOTIPOS.feminino[tipo],out={};
  for(const k of CHAVES_BIOTIPO)out[k]=a[k]+(b[k]-a[k])*t;
  return out;
}
/* Seleção explícita restaura as proporções-padrão daquele biotipo. Os parâmetros
   de câmera, pose, rosto e cena permanecem intactos. */
function aplicarBiotipo(p,tipo="medio",fem=p.fem){
  const sexo=limitar(Number.isFinite(fem)?fem:0,0,1);
  Object.assign(p,perfilBiotipo(tipo,sexo));
  p.fem=sexo;p._biotipo=tipo;
  return p;
}
/* Trocar sexo ou mover o slider preserva deltas manuais (e.g. +0,05 de quadril),
   em vez de resetar o corpo ou deixá-lo com valores do sexo anterior. */
function transitarSexo(p,fem){
  const sexo=limitar(Number.isFinite(fem)?fem:0,0,1),tipo=NOMES_BIOTIPOS.includes(p._biotipo)?p._biotipo:"medio";
  const antes=perfilBiotipo(tipo,p.fem),depois=perfilBiotipo(tipo,sexo);
  for(const k of CHAVES_BIOTIPO){
    const valor=Number.isFinite(p[k])?p[k]:antes[k],c=LIMITES_BIOTIPO[k];
    p[k]=limitar(depois[k]+valor-antes[k],c[0],c[1]);
  }
  p.fem=sexo;p._biotipo=tipo;
  return p;
}
/* Exportação legada para referências de lista; usar aplicarBiotipo nos seletores. */
const BODIES=BIOTIPOS.masculino;
export { BIOTIPOS, BODIES, NOMES_BIOTIPOS, CHAVES_BIOTIPO, perfilBiotipo, aplicarBiotipo, transitarSexo };
