import { readdir } from 'node:fs/promises';
import { gzip, brotliCompress } from 'node:zlib';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ROOT } from './runner.mjs';
import { OUTPUT_PATHS } from './config.mjs';

const gzipAsync = promisify(gzip);
const brotliAsync = promisify(brotliCompress);

async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDir(full)));
    } else {
      files.push(full);
    }
  }
  return files;
}

async function compressedSizes(filePath) {
  const content = await readFile(filePath);
  const [gz, br] = await Promise.all([
    gzipAsync(content, { level: 9 }),
    brotliAsync(content),
  ]);
  return { raw: content.length, gz: gz.length, br: br.length };
}

function isShippedJs(filePath, tool) {
  if (!filePath.endsWith('.js') || filePath.endsWith('.map')) return false;
  if (tool === 'next-turbopack' || tool === 'next-webpack') {
    return filePath.includes(`${path.sep}static${path.sep}`);
  }
  return true;
}

function isShippedCss(filePath) {
  return filePath.endsWith('.css') && !filePath.endsWith('.map');
}

export async function measureOutputSize(tool) {
  const distDir = path.join(ROOT, OUTPUT_PATHS[tool]);
  const allFiles = await walkDir(distDir);

  const jsFiles = allFiles.filter((f) => isShippedJs(f, tool));
  const cssFiles = allFiles.filter((f) => isShippedCss(f));

  async function accumulate(files) {
    const totals = { raw: 0, gz: 0, br: 0 };
    for (const f of files) {
      const sizes = await compressedSizes(f);
      totals.raw += sizes.raw;
      totals.gz += sizes.gz;
      totals.br += sizes.br;
    }
    return totals;
  }

  const [jsTotals, cssTotals] = await Promise.all([
    accumulate(jsFiles),
    accumulate(cssFiles),
  ]);

  return {
    js: jsTotals,
    css: cssTotals,
    fileCount: { js: jsFiles.length, css: cssFiles.length },
  };
}
