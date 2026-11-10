/* Cabeça V2: sistema destro, x=lateral, y=vertical, z=anterior. Unidades do motor. */
export const PI2=Math.PI*2;
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export const mix=(a,b,t)=>a+(b-a)*t;
export const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
export const smoother=t=>{t=clamp(t,0,1);return t*t*t*(t*(t*6-15)+10)};
export const gauss=(x,c,s)=>Math.exp(-0.5*Math.pow((x-c)/Math.max(1e-5,s),2));
export const bump=(v,c,s)=>gauss(v,c,s);
export const vadd=(a,b)=>a.map((v,i)=>v+b[i]);
export const vmul=(a,k)=>a.map(v=>v*k);
export const lerp3=(a,b,t)=>a.map((v,i)=>mix(v,b[i],t));
export const norm=(v)=>{const l=Math.hypot(...v)||1;return v.map(x=>x/l)};
export const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export const range=(lo,hi,n)=>Array.from({length:n},(_,i)=>mix(lo,hi,n===1?0:i/(n-1)));
export const HEAD_VERSION="v2-0.1";
