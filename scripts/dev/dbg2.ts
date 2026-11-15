import sharp from 'sharp';
import { runPipeline } from '../../src/core/pipeline';
import { DEFAULT_SETTINGS, DETAIL_PRESETS, deriveFromDetail } from '../../src/core/types';

async function main(){
  const img = await sharp('samples/portrait.jpg').rotate().resize({width:1500}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const preset = DETAIL_PRESETS.find(p=>p.patch.levels===3)!;
  const settings = {...DEFAULT_SETTINGS, ...preset.patch, ...deriveFromDetail(preset.patch.detail!), widthMm:210, bridges:false};
  const res = runPipeline({rgba:new Uint8ClampedArray(img.data), width:img.info.width, height:img.info.height, settings});
  const w = res.width;
  console.log('größe', res.width, res.height, 'töne', res.stats.tones);
  console.log('Ecke level:', res.toneMap[0], res.toneMap[5*w+5], res.toneMap[20*w+20]);
  const hist = new Map<number,number>();
  for (const v of res.toneMap) hist.set(v, (hist.get(v)||0)+1);
  console.log('level-Histogramm:', [...hist.entries()].sort((a,b)=>a[0]-b[0]));
  for (const L of res.layers) {
    console.log(L.name, 'Farbe', L.color, 'Farbe%', (L.stats.paintPct*100).toFixed(1), 'Material@0', L.holes[0]===0, 'Pfade', L.stats.paths);
  }
  console.log('composite[0..4]', Array.from(res.composite.slice(0,4)));
}
main();
