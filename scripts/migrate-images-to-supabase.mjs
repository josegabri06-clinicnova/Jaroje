import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing Supabase credentials in environment");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MANIFEST = {
  doble: 9,
  '1rec': 11,
  '2rec': 17,
  '3rec': 21,
  casa: 23,
  general: 20
};

async function migrate() {
  console.log("🚀 Starting image optimization and upload to Supabase Storage 'room-photos'...");

  let totalOriginal = 0;
  let totalCompressed = 0;
  let count = 0;
  const errors = [];

  for (const [cat, numFiles] of Object.entries(MANIFEST)) {
    console.log(`\n📁 Processing category: ${cat} (${numFiles} photos)`);
    for (let i = 1; i <= numFiles; i++) {
      const srcPath = path.join('public', 'images', cat, `${i}.jpg`);
      const targetName = `${cat}/${i}.webp`;

      if (!fs.existsSync(srcPath)) {
        console.error(`❌ File not found: ${srcPath}`);
        errors.push(srcPath);
        continue;
      }

      const origSize = fs.statSync(srcPath).size;
      totalOriginal += origSize;

      try {
        const webpBuffer = await sharp(srcPath)
          .resize({ width: 1200, withoutEnlargement: true })
          .webp({ quality: 82, effort: 4 })
          .toBuffer();

        const compSize = webpBuffer.length;
        totalCompressed += compSize;

        const { error } = await supabase.storage
          .from('room-photos')
          .upload(targetName, webpBuffer, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: true
          });

        if (error) {
          console.error(`❌ Upload error for ${targetName}:`, error.message);
          errors.push(targetName);
        } else {
          count++;
          const ratio = ((1 - compSize / origSize) * 100).toFixed(0);
          console.log(`  ✓ [${count}/101] ${targetName} ${(origSize / 1024).toFixed(0)}KB → ${(compSize / 1024).toFixed(0)}KB (-${ratio}%)`);
        }
      } catch (err) {
        console.error(`❌ Error processing ${srcPath}:`, err);
        errors.push(srcPath);
      }
    }
  }

  console.log("\n==========================================");
  console.log(`✅ Upload complete! Successfully uploaded ${count} of 101 images.`);
  console.log(`📦 Original size: ${(totalOriginal / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`⚡ Optimized WebP size: ${(totalCompressed / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`🎉 Total bandwidth saved: ${((1 - totalCompressed / totalOriginal) * 100).toFixed(1)}%`);
  console.log("==========================================");

  if (errors.length > 0) {
    console.error("⚠️ Errors occurred during processing:", errors);
    process.exit(1);
  }
}

migrate();

