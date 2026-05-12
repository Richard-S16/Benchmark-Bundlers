import { spawn, exec } from 'node:child_process';
import { promisify } from 'node:util';
import { rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  CACHE_DIRS,
  OUTPUT_PATHS,
  RAW_DIR,
  READY_MARKERS,
  TIMEOUTS,
} from './config.mjs';

const execAsync = promisify(exec);
const IS_WINDOWS = os.platform() === 'win32';

const ANSI_RE = /\x1B\[[0-9;?]*[A-Za-z]/g;
function stripAnsi(str) {
  return str.replace(ANSI_RE, '');
}

export const ROOT = path.resolve(import.meta.dirname, '../..');

const TOOL_CWD = {
  webpack: path.join(ROOT, 'benchmarks/spa/webpack'),
  vite: path.join(ROOT, 'benchmarks/spa/vite'),
  rspack: path.join(ROOT, 'benchmarks/spa/rspack'),
  'next-turbopack': path.join(ROOT, 'benchmarks/next/app'),
  'next-webpack': path.join(ROOT, 'benchmarks/next/app'),
};

const DEV_SCRIPT = {
  webpack: 'dev',
  vite: 'dev',
  rspack: 'dev',
  'next-turbopack': 'dev',
  'next-webpack': 'dev:webpack',
};

const BUILD_SCRIPT = {
  webpack: 'build',
  vite: 'build',
  rspack: 'build',
  'next-turbopack': 'build',
  'next-webpack': 'build:webpack',
};

export function getHmrProbeFile(tool) {
  if (tool === 'next-turbopack' || tool === 'next-webpack') {
    return path.join(ROOT, 'benchmarks/next/app/app/components/HotLeaf.tsx');
  }
  return path.join(ROOT, 'benchmarks/spa/shared-src/src/components/HotLeaf.tsx');
}

function spawnPnpm(script, cwd) {
  const [cmd, args] = IS_WINDOWS
    ? ['cmd', ['/c', 'pnpm', 'run', script]]
    : ['pnpm', ['run', script]];
  return spawn(cmd, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    windowsHide: true,
    detached: !IS_WINDOWS,
  });
}

export function startDevServer(tool) {
  const proc = spawnPnpm(DEV_SCRIPT[tool], TOOL_CWD[tool]);
  proc.__benchStartedAt = performance.now();
  proc.on('error', (err) => console.error(`[${tool}] spawn error: ${err.message}`));
  return proc;
}

export async function killProc(proc) {
  if (!proc || proc.exitCode !== null) return;
  try {
    if (IS_WINDOWS) {
      await execAsync(`taskkill /F /T /PID ${proc.pid}`);
    } else {
      process.kill(-proc.pid, 'SIGTERM');
    }
  } catch { }
  await new Promise((resolve) => {
    proc.once('exit', resolve);
    setTimeout(resolve, 5000);
  });
}

export function waitForReady(proc, marker, timeout = TIMEOUTS.devStartup) {
  const startedAt = proc.__benchStartedAt ?? performance.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out (${timeout}ms) waiting for: "${marker}"`));
      }
    }, timeout);

    function onData(chunk) {
      if (settled) return;
      if (stripAnsi(chunk.toString()).toLowerCase().includes(marker.toLowerCase())) {
        settled = true;
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        proc.stderr.off('data', onData);
        resolve(Math.round(performance.now() - startedAt));
      }
    }

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Process exited (code ${code}) before ready: "${marker}"`));
      }
    });
  });
}

export function waitForMarker(proc, marker, timeout = TIMEOUTS.hmr, startedAt = performance.now()) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Timed out (${timeout}ms) waiting for HMR marker: "${marker}"`));
      }
    }, timeout);

    function onData(chunk) {
      if (settled) return;
      if (stripAnsi(chunk.toString()).toLowerCase().includes(marker.toLowerCase())) {
        settled = true;
        clearTimeout(timer);
        proc.stdout.off('data', onData);
        proc.stderr.off('data', onData);
        resolve(Math.round(performance.now() - startedAt));
      }
    }

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.once('exit', (code) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Process exited (code ${code}) before HMR marker: "${marker}"`));
      }
    });
  });
}

export function collectStats(pid, intervalMs = 500) {
  let peakRssKb = 0;

  const poll = IS_WINDOWS
    ? async () => {
        try {
          const { stdout } = await execAsync(
            `powershell -NoProfile -NonInteractive -Command "try{(Get-Process -Id ${pid} -ErrorAction Stop).WorkingSet64}catch{0}"`,
            { timeout: 3000 },
          );
          const bytes = parseInt(stdout.trim(), 10);
          if (!isNaN(bytes) && bytes / 1024 > peakRssKb) peakRssKb = Math.round(bytes / 1024);
        } catch { }
      }
    : async () => {
        try {
          const { stdout } = await execAsync(`ps -o rss= -p ${pid}`, { timeout: 3000 });
          const kb = parseInt(stdout.trim(), 10);
          if (!isNaN(kb) && kb > peakRssKb) peakRssKb = kb;
        } catch { }
      };

  const handle = setInterval(poll, intervalMs);
  return {
    stop() {
      clearInterval(handle);
      return { peakRssKb };
    },
  };
}

export async function clearCaches(tool) {
  const cacheDir = path.join(TOOL_CWD[tool], CACHE_DIRS[tool]);
  if (existsSync(cacheDir)) {
    await rm(cacheDir, { recursive: true, force: true });
  }
}

export async function clearOutput(tool) {
  const outputDir = path.join(ROOT, OUTPUT_PATHS[tool]);
  if (existsSync(outputDir)) {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export async function runBuild(tool) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const proc = spawnPnpm(BUILD_SCRIPT[tool], TOOL_CWD[tool]);
    const stats = collectStats(proc.pid);
    let stderr = '';

    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('error', (err) => {
      stats.stop();
      reject(err);
    });
    proc.once('exit', (code) => {
      const { peakRssKb } = stats.stop();
      const durationMs = Math.round(performance.now() - start);
      if (code === 0) {
        resolve({ durationMs, peakRssKb });
      } else {
        reject(new Error(`Build [${tool}] failed (exit ${code}): ${stderr.slice(-1000)}`));
      }
    });
  });
}

export async function triggerHmrEdit(tool) {
  const file = getHmrProbeFile(tool);
  const original = await readFile(file, 'utf8');
  const edited = original.replace('>HotLeaf</span>', '>HotLeaf [BENCH]</span>');
  await writeFile(file, edited, 'utf8');
  return original;
}

export async function restoreHmrFile(tool, originalContent) {
  await writeFile(getHmrProbeFile(tool), originalContent, 'utf8');
}

export async function writeResult(record) {
  const rawDir = path.join(ROOT, RAW_DIR);
  await mkdir(rawDir, { recursive: true });
  const { tool, scenario, iteration } = record;
  const filename = `${tool}-${scenario}-iter${String(iteration).padStart(2, '0')}-${Date.now()}.json`;
  await writeFile(path.join(rawDir, filename), JSON.stringify(record, null, 2));
}

export function buildEnvMeta() {
  return {
    nodeVersion: process.version,
    platform: os.platform(),
    arch: os.arch(),
    cpus: os.cpus().length,
    timestamp: new Date().toISOString(),
  };
}

export { READY_MARKERS, TIMEOUTS };
