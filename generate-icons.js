import sharp from 'sharp';
import fs from 'fs';

// Read SVG and convert to PNG at different sizes
const svgBuffer = fs.readFileSync('./public/Logo.svg');

async function generateIcons() {
  // Generate 192x192 icon
  await sharp(svgBuffer)
    .resize(192, 192)
    .png()
    .toFile('./public/icon-192.png');
  
  console.log('✓ Generated icon-192.png');

  // Generate 512x512 icon
  await sharp(svgBuffer)
    .resize(512, 512)
    .png()
    .toFile('./public/icon-512.png');
  
  console.log('✓ Generated icon-512.png');

  // Generate maskable icon (with padding for safe area)
  await sharp(svgBuffer)
    .resize(512, 512)
    .extend({
      top: 64,
      bottom: 64,
      left: 64,
      right: 64,
      background: { r: 37, g: 99, b: 235, alpha: 1 }
    })
    .png()
    .toFile('./public/icon-512-maskable.png');
  
  console.log('✓ Generated icon-512-maskable.png');
  console.log('\nAll icons generated successfully! 🎉');
}

generateIcons().catch(console.error);
