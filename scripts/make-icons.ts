/**
 * Erzeugt die App-Icons (build/icon.ico, build/icon.png, public/icon.png)
 * direkt aus einer SVG-Vorlage. Kein Designprogramm nötig:
 *
 *   npm run icons
 *
 * Das ICO wird als PNG-Container geschrieben (von Windows Vista bis 11
 * unterstützt), damit kein zusätzliches Kodier-Werkzeug gebraucht wird.
 */
import fs from 'node:fs/promises';
import sharp from 'sharp';

const CREAM = '#f4f1ea';
const INK = '#1b1b1b';
const GRAY = '#8a8a8a';
const RED = '#c8352b';

/**
 * Stencil-„S“: dicke Letterform, von zwei Stegen (Brücken) durchbrochen –
 * das ist genau das Prinzip, das die App erklärt.
 */
function svgArt() {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <rect width="256" height="256" rx="52" fill="${INK}"/>
  <circle cx="128" cy="128" r="86" fill="${CREAM}"/>
  <path d="M 170 82 C 170 60 86 60 86 92 C 86 122 170 118 170 150 C 170 184 86 184 86 160"
        fill="none" stroke="${INK}" stroke-width="40" stroke-linecap="round"/>
  <g fill="${CREAM}">
    <rect x="56" y="96" width="60" height="9"/>
    <rect x="140" y="96" width="60" height="9"/>
    <rect x="56" y="150" width="60" height="9"/>
    <rect x="140" y="150" width="60" height="9"/>
  </g>
  <g fill="${RED}">
    <circle cx="196" cy="64" r="6.5"/>
    <circle cx="212" cy="50" r="4"/>
    <circle cx="208" cy="76" r="3"/>
  </g>
</svg>`;
}

/** ICO-Container mit PNG-Einträgen. */
function buildIco(images: { size: number; png: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserviert
  header.writeUInt16LE(1, 2); // Typ: Icon
  header.writeUInt16LE(images.length, 4);
  const dirSize = 16 * images.length;
  let offset = 6 + dirSize;
  const entries: Buffer[] = [];
  for (const img of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0); // 0 = 256
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    e.writeUInt8(0, 2); // Palette
    e.writeUInt8(0, 3); // reserviert
    e.writeUInt16LE(1, 4); // Pläne
    e.writeUInt16LE(32, 6); // Bit pro Pixel
    e.writeUInt32LE(img.png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

async function main() {
  await fs.mkdir('build', { recursive: true });
  await fs.mkdir('public', { recursive: true });
  const source = Buffer.from(svgArt());
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images: { size: number; png: Buffer }[] = [];
  for (const size of sizes) {
    const png = await sharp(source, { density: Math.max(72, (size / 256) * 1152) })
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    images.push({ size, png });
  }
  await fs.writeFile('build/icon.ico', buildIco(images));
  await fs.writeFile('build/icon.png', images[images.length - 1].png);
  await fs.writeFile('public/icon.png', images[images.length - 1].png);
  await fs.writeFile('build/icon.svg', source);
  console.log('Icons geschrieben: build/icon.ico, build/icon.png, public/icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
