import { traceContours, signedArea, polylineLength } from '../../src/core/trace';
const W=60,H=40;
const mask=new Uint8Array(W*H);
for(let y=10;y<30;y++)for(let x=10;x<40;x++)mask[y*W+x]=1;
for (const opts of [{tolerance:0.3,smooth:0,minArea:1},{tolerance:0,smooth:0,minArea:1},{tolerance:0.3,smooth:0,minArea:0.01}]) {
  const c=traceContours(mask,W,H,opts);
  console.log(JSON.stringify(opts), c.length, c.map(k=>`pts=${k.pts.length} area=${signedArea(k.pts).toFixed(1)} len=${polylineLength(k.pts).toFixed(1)}`));
}
