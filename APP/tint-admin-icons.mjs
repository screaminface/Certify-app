import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const ADMIN_RES = path.resolve('../APP-ADMIN/android/app/src/main/res');

// Orange color to distinguish ADMIN app from main app
const ORANGE = { r: 220, g: 100, b: 10 };

const mipmapDirs = [
  'mipmap-mdpi',
  'mipmap-hdpi',
  'mipmap-xhdpi',
  'mipmap-xxhdpi',
  'mipmap-xxxhdpi',
];

const iconFiles = ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'];

async function tintAdminIcons() {
  for (const dir of mipmapDirs) {
    for (const file of iconFiles) {
      const filePath = path.join(ADMIN_RES, dir, file);
      if (fs.existsSync(filePath)) {
        const buf = await sharp(filePath).tint(ORANGE).toBuffer();
        fs.writeFileSync(filePath, buf);
        console.log(`✓ ${dir}/${file}`);
      }
    }
  }
  console.log('\n✅ Admin icons tinted to orange!');
}

tintAdminIcons().catch(console.error);
