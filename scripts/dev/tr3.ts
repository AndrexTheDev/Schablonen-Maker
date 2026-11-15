import sharp from 'sharp';
import { runPipeline } from '../../src/core/pipeline';
import { DEFAULT_SETTINGS, DETAIL_PRESETS, deriveFromDetail } from '../../src/core/types';
import { traceContours, signedArea } from '../../src/core/trace';
import { invert } from '../../src/core/morphology';

(async () => {
  const file = process.argv[2] ?? 'image-search/portrait-photo-person-hoodie-against-con-3.jpg';
  const { data, info } = await sharp(file).rotate().resize({ width: 600 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const preset = DETAIL_PRESETS[2];
  const settings = { ...DEFAULT_SETTINGS, ...preset.patch, ...deriveFromDetail(preset.patch.detail ?? 76), widthMm: 210 };
  const res = runPipeline({ rgba: new Uint8ClampedArray(data), width: info.width, height: info.height, settings });
  const layer = res.layers[0];
  const material = invert(layer.holes);
  // direkt nochmal tracen (gleiche Parameter wie Pipeline)
  const cs = traceContours(material, res.width, res.height, { tolerance: 0.65, smooth: 1, minArea: 1 });
  const big = cs.slice().sort((a, b) => Math.abs(b.area) - Math.abs(a.area))[0];
  console.log('mask', res.width, res.height, 'konturen', cs.length, 'groesste area', big.area);
  console.log('punkte', big.pts.length / 2, 'erste 20', big.pts.slice(0, 20).map((v) => Math.round(v)).join(','));
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (let i = 0; i < big.pts.length; i += 2) {
    minX = Math.min(minX, big.pts[i]); maxX = Math.max(maxX, big.pts[i]);
    minY = Math.min(minY, big.pts[i + 1]); maxY = Math.max(maxY, big.pts[i + 1]);
  }
  console.log('bbox', minX, minY, maxX, maxY);
  // Maske als PNG
  const m = new Uint8Array(material.length);
  for (let i = 0; i < m.length; i++) m[i] = material[i] ? 255 : 0;
  await sharp(Buffer.from(m), { raw: { width: res.width, height: res.height, channels: 1 } }).png().toFile('tmp/verify/mat1.png');
  // Ecken prüfen
  for (const [x, y] of [[0, 0], [5, 5], [100, 0], [0, 100], [620, 0], [0, 920]]) console.log('px', x, y, material[y * res.width + x]);
  // Randpixel prüfen
  let edgeOnes = 0;
  for (let x = 0; x < res.width; x++) { edgeOnes += material[x]; edgeOnes += material[(res.height - 1) * res.width + x]; }
  console.log('material am oberen/unteren Rand', edgeOnes, 'von', res.width * 2);
})();
