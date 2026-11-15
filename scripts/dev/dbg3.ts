import sharp from 'sharp';
import { backgroundMask, blurRGBA } from '../../src/core/filters';

async function main(){
  const r = await sharp('samples/portrait.jpg').rotate().resize({width:1500}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const rgba = new Uint8ClampedArray(r.data); const w=r.info.width,h=r.info.height;
  for (const tol of [18,22,26,32,40]) {
    const m = backgroundMask(rgba,w,h,tol);
    let c=0; for (const v of m) c+=v;
    console.log(`tol=${tol}: ${(c/(w*h)*100).toFixed(1)}% Hintergrund`);
  }
  // Ohne Cleanup
  const soft = blurRGBA(rgba,w,h,Math.round(Math.min(w,h)/150));
  console.log('weichgezeichnet');
  const out = Buffer.alloc(w*h*4);
  const m = backgroundMask(rgba,w,h,26);
  for (let i=0;i<w*h;i++){ const fg = m[i]?0:255; out[i*4]=fg; out[i*4+1]=fg; out[i*4+2]=fg; out[i*4+3]=255; }
  await sharp(out,{raw:{width:w,height:h,channels:4}}).resize({width:700}).png().toFile('tmp/verify/bg-pipeline.png');
}
main();
