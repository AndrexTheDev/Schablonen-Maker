import { canny } from '../../src/core/filters';
import { count } from '../../src/core/morphology';
const W=120,H=90;
const luma=new Float32Array(W*H).fill(236);
for(let y=20;y<70;y++)for(let x=20;x<60;x++)luma[y*W+x]=40;
for(let y=30;y<55;y++)for(let x=65;x<100;x++)luma[y*W+x]=128;
const e=canny(luma,W,H,55,1.4);
console.log('kanten',count(e));
// Verteilung der Gradienten über eine Kopie des Originalbildes prüfen
