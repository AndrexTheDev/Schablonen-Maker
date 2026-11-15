import { canny } from '../../src/core/filters';
import { count } from '../../src/core/morphology';
const W=120,H=90;
const luma=new Float32Array(W*H).fill(236);
for(let y=20;y<70;y++)for(let x=20;x<60;x++)luma[y*W+x]=40;
for(let y=30;y<55;y++)for(let x=65;x<100;x++)luma[y*W+x]=128;
for (const s of [0,30,55,80,100]) {
  const e=canny(luma,W,H,s);
  console.log('strength',s,'kanten',count(e));
}
