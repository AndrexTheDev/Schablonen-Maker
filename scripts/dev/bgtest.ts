import sharp from 'sharp';
import { backgroundMask } from '../../src/core/filters';

async function main(){
  const base = sharp('samples/portrait.jpg').rotate().resize({width:900}).ensureAlpha();
  const raw = await base.raw().toBuffer({resolveWithObject:true});
  const w = raw.info.width, h = raw.info.height;
  const variants: {blur:number; tol:number}[] = [];
  for (const tol of [18, 26, 38]) for (const blur of [0, 6]) variants.push({blur, tol});
  const tiles: Buffer[] = [];
  for (const v of variants){
    let buf = raw.data;
    let src = sharp(buf, {raw:{width:w,height:h,channels:4}});
    if (v.blur>0) buf = await src.blur(v.blur).raw().toBuffer();
    const mask = backgroundMask(new Uint8ClampedArray(buf), w, h, v.tol);
    const out = Buffer.alloc(w*h*4);
    for (let i=0;i<w*h;i++){ const fg = mask[i]?0:255; out[i*4]=fg; out[i*4+1]=fg; out[i*4+2]=fg; out[i*4+3]=255; }
    console.log(`blur=${v.blur} tol=${v.tol}: Hintergrund ${(mask.reduce((a,b)=>a+b,0)/(w*h)*100).toFixed(1)}%`);
    tiles.push(await sharp(out,{raw:{width:w,height:h,channels:4}}).resize({width:450}).png().toBuffer());
  }
  const H = Math.round(h/w*450);
  await sharp({create:{width:450*3+16, height:H*3+16, channels:3, background:'#222'}})
    .composite(tiles.map((t,i)=>({input:t, left:(i%3)*(450+4)+4, top:Math.floor(i/3)*(H+4)+4})))
    .png().toFile('tmp/verify/bgtest.png');
  console.log('-> tmp/verify/bgtest.png (Reihen: tol 18/26/38, Spalten: blur 0 / 6)');
}
main();
