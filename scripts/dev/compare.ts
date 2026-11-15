import sharp from 'sharp';
import { runPipeline } from '../../src/core/pipeline';
import { DEFAULT_SETTINGS, DETAIL_PRESETS, deriveFromDetail, type Settings } from '../../src/core/types';

type Variant = { name: string; patch: Partial<Settings> };

async function main() {
  const file = process.argv[2] ?? 'samples/portrait.jpg';
  const img = await sharp(file).rotate().resize({ width: 1500 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const preset = DETAIL_PRESETS.find((p) => p.id === 'banksy')!;
  const base: Settings = { ...DEFAULT_SETTINGS, ...preset.patch, ...deriveFromDetail(preset.patch.detail!), widthMm: 210 };

  const variants: Variant[] = [
    { name: 'A getrennt', patch: {} },
    { name: 'B getrennt+bg', patch: { removeBackground: true, bgTolerance: 26 } },
    { name: 'C kumulativ', patch: { model: 'cumulative' } },
    { name: 'D kumulativ+bg', patch: { model: 'cumulative', removeBackground: true, bgTolerance: 26 } },
  ];

  const tiles: Buffer[] = [];
  for (const v of variants) {
    const settings = { ...base, ...v.patch };
    const t = Date.now();
    const res = runPipeline({ rgba: new Uint8ClampedArray(img.data), width: img.info.width, height: img.info.height, settings });
    console.log(`${v.name}: ${Date.now() - t} ms · ` +
      res.layers.map((l) => `${l.name}::${(l.stats.paintPct * 100).toFixed(0)}%/${l.stats.paths}p/${l.stats.islands}i/${l.stats.bridges}s`).join('  '));
    const png = await sharp(Buffer.from(res.composite), { raw: { width: res.width, height: res.height, channels: 4 } })
      .resize({ width: 700 }).png().toBuffer();
    tiles.push(png);
  }
  // 2x2 Montage
  const W = 700, H = Math.round((img.info.height / img.info.width) * 700);
  const canvas = sharp({ create: { width: W * 2 + 12, height: H * 2 + 12, channels: 3, background: '#222' } });
  const comps = tiles.map((t, i) => ({ input: t, left: (i % 2) * (W + 4) + 4, top: Math.floor(i / 2) * (H + 4) + 4 }));
  await canvas.composite(comps).png().toFile('tmp/verify/compare.png');
  console.log('-> tmp/verify/compare.png');
}
main();
