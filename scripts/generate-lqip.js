#!/usr/bin/env node
/**
 * scripts/generate-lqip.js
 *
 * Usage:
 *   node ./scripts/generate-lqip.js
 *
 * What it does:
 * - Walks configured input globs (images + .glb)
 * - For raster images, generates a small blurred LQIP JPEG and writes a base64 data URI
 * - For .glb files, attempts to `gltf-transform extract` textures -> picks largest texture as preview -> generates LQIP
 * - Writes outputs to `public/lqip/` and a manifest `public/lqip/lqip-manifest.json`
 *
 * Note: Requires `gltf-transform` CLI to be available for GLB texture extraction.
 */

import fs from 'fs-extra';
import path from 'path';
import glob from 'glob';
import sharp from 'sharp';
import { execa } from 'execa';

const ROOT = path.resolve(process.cwd());
const PUBLIC = path.join(ROOT, 'public');
const LQIP_DIR = path.join(PUBLIC, 'lqip');
await fs.ensureDir(LQIP_DIR);

const config = {
  // globs to search for raster images to create LQIPs for
  imageGlobs: [
    'public/**/*.webp',
    'public/**/*.png',
    'public/**/*.jpg',
    'public/**/*.jpeg'
  ],
  // glob for 3D assets to attempt extract textures from
  glbGlobs: [
    'public/**/*.glb'
  ],
  // LQIP generation params
  lqipWidth: 48,        // px width of generated LQIP
  jpegQuality: 60,      // jpeg quality
  blurSigma: 8,         // applied blur (approx)
  manifestPath: path.join(LQIP_DIR, 'lqip-manifest.json')
};

async function makeLqipFromBuffer(buffer, outPath) {
  // generate small blurred jpeg and save
  // sharp pipeline: resize -> blur -> sharpen slightly -> jpeg
  await sharp(buffer)
    .resize({ width: config.lqipWidth })
    .blur(config.blurSigma)
    .jpeg({ quality: config.jpegQuality, chromaSubsampling: '4:2:0' })
    .toFile(outPath);
  // produce base64 data URI (very small)
  const b = await fs.readFile(outPath);
  const dataUri = `data:image/jpeg;base64,${b.toString('base64')}`;
  return { path: outPath, dataUri };
}

async function processRasterImage(srcPath, manifest) {
  try {
    const rel = path.relative(PUBLIC, srcPath).replace(/\\/g, '/');
    const name = path.basename(srcPath, path.extname(srcPath));
    const outName = `${name}-lqip.jpg`;
    const outPath = path.join(LQIP_DIR, outName);

    // avoid reprocessing if existed and source not newer
    const srcStat = await fs.stat(srcPath);
    let doProcess = true;
    if (await fs.pathExists(outPath)) {
      const outStat = await fs.stat(outPath);
      if (outStat.mtimeMs >= srcStat.mtimeMs) doProcess = false;
    }

    if (doProcess) {
      console.log(`[img] Generating LQIP for ${rel} -> ${path.relative(PUBLIC, outPath)}`);
      const buffer = await fs.readFile(srcPath);
      await makeLqipFromBuffer(buffer, outPath);
    } else {
      console.log(`[img] Up-to-date: ${rel}`);
    }

    const b = await fs.readFile(outPath);
    const dataUri = `data:image/jpeg;base64,${b.toString('base64')}`;

    manifest[rel] = {
      type: 'image',
      source: `/${rel}`,
      lqip: `/${path.relative(PUBLIC, outPath).replace(/\\/g, '/')}`,
      dataUri
    };
  } catch (err) {
    console.error(`[img] Error processing ${srcPath}`, err);
  }
}

async function extractTexturesFromGlb(glbPath, tmpDir) {
  // runs: gltf-transform extract <glb> <tmpDir>
  try {
    await fs.ensureDir(tmpDir);
    // using execa to call gltf-transform CLI
    console.log(`[glb] extracting textures from ${path.relative(ROOT, glbPath)} -> ${tmpDir}`);
    await execa('gltf-transform', ['extract', glbPath, tmpDir], { stdio: 'inherit' });
    const files = await fs.readdir(tmpDir);
    // return full paths to common image types
    const imgFiles = files.filter(f => /\.(png|jpe?g|webp|ktx2)$/i.test(f)).map(f => path.join(tmpDir, f));
    return imgFiles;
  } catch (err) {
    console.warn('[glb] gltf-transform extract failed. Is `gltf-transform` CLI installed?');
    return [];
  }
}

async function processGlb(glbPath, manifest) {
  const rel = path.relative(PUBLIC, glbPath).replace(/\\/g, '/');
  const name = path.basename(glbPath, path.extname(glbPath));
  const tmpDir = path.join(LQIP_DIR, `${name}-textures-tmp`);
  await fs.remove(tmpDir);
  const extracted = await extractTexturesFromGlb(glbPath, tmpDir);

  if (!extracted || !extracted.length) {
    console.warn(`[glb] No textures found for GLB ${rel}. You need to create a screenshot preview manually (e.g., Blender or Spline export).`);
    manifest[rel] = {
      type: 'glb',
      source: `/${rel}`,
      lqip: null,
      note: 'no-texture-preview-extracted'
    };
    return;
  }

  // choose the largest file (heuristic)
  let best = null;
  let bestSize = 0;
  for (const f of extracted) {
    const s = (await fs.stat(f)).size;
    if (s > bestSize) { bestSize = s; best = f; }
  }

  if (!best) {
    console.warn(`[glb] extracted textures but none valid for ${rel}`);
    manifest[rel] = { type: 'glb', source: `/${rel}`, lqip: null, note: 'no-texture-valid' };
    return;
  }

  // If the texture is KTX2, we can't feed to sharp: attempt to fallback to other images or warn.
  const ext = path.extname(best).toLowerCase();
  if (ext === '.ktx2') {
    console.warn(`[glb] largest extracted texture is KTX2 (${path.basename(best)}). Sharp does not read KTX2. Look for other extracted raster textures or create a screenshot.`);
    // try to pick any other raster extracted texture
    const raster = extracted.find(p => /\.(png|jpe?g|webp)$/i.test(p));
    if (raster) {
      best = raster;
    } else {
      manifest[rel] = { type: 'glb', source: `/${rel}`, lqip: null, note: 'only-ktx2-textures' };
      return;
    }
  }

  // create lqip
  const outName = `${name}-lqip.jpg`;
  const outPath = path.join(LQIP_DIR, outName);
  console.log(`[glb] making LQIP from extracted texture ${path.basename(best)} -> ${path.relative(PUBLIC, outPath)}`);
  await makeLqipFromBuffer(await fs.readFile(best), outPath);

  const b = await fs.readFile(outPath);
  const dataUri = `data:image/jpeg;base64,${b.toString('base64')}`;

  manifest[rel] = {
    type: 'glb',
    source: `/${rel}`,
    lqip: `/${path.relative(PUBLIC, outPath).replace(/\\/g,'/')}`,
    dataUri
  };

  // cleanup tmp if you want (leave for debug)
  await fs.remove(tmpDir);
}

(async function main() {
  const manifest = {};
  console.log('Searching rasters...');
  // unique set of images
  const imageFiles = new Set();
  for (const g of config.imageGlobs) {
    const matches = glob.sync(g, { nodir: true });
    matches.forEach(m => imageFiles.add(path.resolve(m)));
  }

  for (const f of imageFiles) {
    await processRasterImage(f, manifest);
  }

  // GLB handling
  const glbFiles = new Set();
  for (const g of config.glbGlobs) {
    const matches = glob.sync(g, { nodir: true });
    matches.forEach(m => glbFiles.add(path.resolve(m)));
  }

  for (const glb of glbFiles) {
    await processGlb(glb, manifest);
  }

  // write manifest
  await fs.writeJson(config.manifestPath, manifest, { spaces: 2 });
  console.log('LQIP manifest written to', config.manifestPath);
  console.log('Done.');
})();
