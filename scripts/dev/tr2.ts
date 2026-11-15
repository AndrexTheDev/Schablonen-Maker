import { traceContours } from '../../src/core/trace';
const W=20,H=12;
const mask=new Uint8Array(W*H);
for(let y=3;y<9;y++)for(let x=4;x<14;x++)mask[y*W+x]=1;
const c=traceContours(mask,W,H,{tolerance:0,smooth:0,minArea:0.01});
for (const k of c) {
  console.log('area', k.area, 'hole', k.hole, 'start', k.pts[0], k.pts[1], 'first 12:', k.pts.slice(0,12).join(','));
}
