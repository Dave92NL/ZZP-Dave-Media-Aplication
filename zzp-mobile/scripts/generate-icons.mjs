// One-off script: generates all PWA manifest/iOS icons from the desktop
// app's existing 1024x1024 source art. Run manually: node scripts/generate-icons.mjs
import sharp from 'sharp';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = path.resolve(__dirname, '../../zzp-manager/src/assets/icon.png');
const OUT_DIR = path.resolve(__dirname, '../public/icons');

if (!fs.existsSync(SOURCE)) {
  console.error('Nie znaleziono źródłowej ikony:', SOURCE);
  process.exit(1);
}
fs.mkdirSync(OUT_DIR, { recursive: true });

async function main() {
  // Standard manifest icons — direct resize, source is already opaque full-bleed.
  await sharp(SOURCE).resize(192, 192).png().toFile(path.join(OUT_DIR, 'icon-192.png'));
  await sharp(SOURCE).resize(512, 512).png().toFile(path.join(OUT_DIR, 'icon-512.png'));

  // iOS home screen icon — 180x180, no transparency (source already has none).
  await sharp(SOURCE).resize(180, 180).png().toFile(path.join(OUT_DIR, 'apple-touch-icon.png'));

  // Maskable icon — pad the logo inward so it survives Android's circular/
  // squircle mask crop (safe zone ~ center 80% of the 512x512 canvas).
  const logoSize = 410; // ~80% of 512
  const resizedLogo = await sharp(SOURCE).resize(logoSize, logoSize).toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 3, background: '#0D1117' }
  })
    .composite([{ input: resizedLogo, gravity: 'center' }])
    .png()
    .toFile(path.join(OUT_DIR, 'icon-maskable-512.png'));

  console.log('Ikony wygenerowane w', OUT_DIR);
}

main().catch(err => { console.error(err); process.exit(1); });
