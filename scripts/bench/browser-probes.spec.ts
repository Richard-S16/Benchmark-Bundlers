import { test } from '@playwright/test';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const TOOL = process.env.BENCH_TOOL ?? 'webpack';
const PORT = parseInt(process.env.BENCH_PORT ?? '3001', 10);
const ITERATION = parseInt(process.env.BENCH_ITERATION ?? '0', 10);
const BASE_URL = `http://localhost:${PORT}`;

function getHmrProbeFile(): string {
  if (TOOL === 'next-turbopack' || TOOL === 'next-webpack') {
    return path.join(ROOT, 'benchmarks/next/app/app/components/HotLeaf.tsx');
  }
  return path.join(ROOT, 'benchmarks/spa/shared-src/src/components/HotLeaf.tsx');
}

function buildEnvMeta() {
  return {
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    timestamp: new Date().toISOString(),
  };
}

async function writeResult(record: Record<string, unknown>) {
  const rawDir = path.join(ROOT, 'results/raw');
  await mkdir(rawDir, { recursive: true });
  const filename = `${record.tool}-${record.scenario}-iter${String(record.iteration).padStart(2, '0')}-browser-${Date.now()}.json`;
  await writeFile(path.join(rawDir, filename), JSON.stringify(record, null, 2));
}

test('page-load timing', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'load' });

  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    return {
      ttfb: Math.round(nav.responseStart - nav.fetchStart),
      domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.fetchStart),
      loadComplete: Math.round(nav.loadEventEnd - nav.fetchStart),
    };
  });

  await writeResult({
    tool: TOOL,
    scenario: 'page-load',
    iteration: ITERATION,
    ...navTiming,
    env: buildEnvMeta(),
  });
});

test('HMR detection', async ({ page }) => {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  const countBtn = page.getByTestId('hot-leaf').locator('button');
  await countBtn.click();
  await page.waitForFunction(() => {
    const btn = document.querySelector('[data-testid="hot-leaf"] button');
    return btn?.textContent?.includes('count: 1');
  }, { timeout: 5000 });

  const probeFile = getHmrProbeFile();
  const original = await readFile(probeFile, 'utf8');
  const marker = `HotLeaf-probe-${Date.now()}`;
  const edited = original.replace(
    '>HotLeaf</span>',
    `>${marker}</span>`,
  );

  const hmrStart = performance.now();
  await writeFile(probeFile, edited, 'utf8');

  let durationMs: number | null = null;
  let classification: string = 'timeout';

  try {
    await page.waitForFunction(
      (m: string) => document.body.textContent?.includes(m),
      marker,
      { timeout: 15_000, polling: 100 },
    );
    durationMs = Math.round(performance.now() - hmrStart);

    const countText = await page.getByTestId('hot-leaf').locator('button').textContent();
    classification = countText?.includes('count: 1') ? 'hmr' : 'full-reload';
  } finally {
    await writeFile(probeFile, original, 'utf8');
  }

  await writeResult({
    tool: TOOL,
    scenario: 'hmr-browser',
    iteration: ITERATION,
    durationMs,
    classification,
    env: buildEnvMeta(),
  });
});
