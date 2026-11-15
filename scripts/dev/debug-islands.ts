import sharp from 'sharp';
import { runPipeline } from '../../src/core/pipeline';
import { DEFAULT_SETTINGS, DETAIL_PRESETS, deriveFromDetail } from '../../src/core/types';
import { labelComponents, rootLabels } from '../../src/core/components';

async function main(){
  const img = await sharp('samples/portrait.jpg').rotate().resize({width:1500}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const preset = DETAIL_PRESETS.find(p=>p.patch.levels===3)!;
  const settings = {...DEFAULT_SETTINGS, ...preset.patch, ...deriveFromDetail(preset.patch.detail!), widthMm:210, bridges:false};
  const res = runPipeline({rgba:new Uint8ClampedArray(img.data), width:img.info.width, height:img.info.height, settings});
  const L = res.layers[1];
  const material = new Uint8Array(L.holes.length);
  for (let i=0;i<material.length;i++) material[i] = L.holes[i]?0:1;
  const comps = labelComponents(material, res.width, res.height, 8);
  const root = rootLabels(comps);
  const isl:number[] = [];
  for (let i=1;i<=comps.count;i++) if(!root[i]) isl.push(i);
  console.log('Komponenten:', comps.count, 'Inseln:', isl.length, 'root:', Array.from(root).filter(Boolean).length-1);
  isl.sort((a,b)=>comps.areas[b]-comps.areas[a]).slice(0,15).forEach(i=>{
    console.log(`  id=${i} area=${comps.areas[i]} bbox=${comps.minX[i]},${comps.minY[i]} ${comps.maxX[i]-comps.minX[i]}x${comps.maxY[i]-comps.minY[i]}`);
  });
  const out = Buffer.alloc(material.length*4);
  for (let i=0;i<material.length;i++){ const lab = comps.labels[i]; const isI = lab && !root[lab];
    out[i*4]= isI?255:(material[i]?255:0); out[i*4+1]=isI?0:(material[i]?255:0); out[i*4+2]=0; out[i*4+3]=255; }
  await sharp(out,{raw:{width:res.width,height:res.height,channels:4}}).png().toFile('tmp/verify/islands2.png');
}
main();
