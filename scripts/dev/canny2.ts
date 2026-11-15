import sharp from 'sharp';
import { canny, gradeTone, bilateral } from '../../src/core/filters';
import { count } from '../../src/core/morphology';
import { perceptualTone } from '../../src/core/color';
(async () => {
  const { data, info } = await sharp('image-search/portrait-photo-person-hoodie-against-con-3.jpg').rotate().resize({ width: 600 }).raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) luma[i] = perceptualTone(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
  const smooth = bilateral(luma, info.width, info.height, 3, 30);
  const graded = gradeTone(smooth, { contrast: 58, brightness: 0, invert: false, autoLevels: true });
  for (const s of [0, 20, 40, 55, 70, 85, 100]) {
    const e = canny(graded, info.width, info.height, s);
    console.log('strength', s, 'kanten', count(e), ((count(e) / n) * 100).toFixed(2) + '%');
  }
})();
