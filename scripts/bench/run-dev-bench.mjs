import { parseArgs } from 'node:util';
import {
  clearCaches,
  startDevServer,
  waitForReady,
  waitForMarker,
  killProc,
  triggerHmrEdit,
  restoreHmrFile,
  collectStats,
  writeResult,
  buildEnvMeta,
} from './runner.mjs';
import { ITERATIONS, MATRIX, READY_MARKERS, TIMEOUTS, HMR_SETTLE_MS } from './config.mjs';

const { values: args } = parseArgs({
  options: {
    track: { type: 'string', default: 'spa' },
    smoke: { type: 'boolean', default: false },
  },
  strict: false,
});

const track = args.track;
const tools = MATRIX[track];
if (!tools) {
  console.error(`Unknown track: "${track}". Valid tracks: ${Object.keys(MATRIX).join(', ')}`);
  process.exit(1);
}

const iterCount = args.smoke ? ITERATIONS.smoke : ITERATIONS.full;
const envMeta = buildEnvMeta();

let activeProc = null;
let activeRestoreTool = null;
let activeRestoreContent = null;

async function cleanup() {
  if (activeProc) await killProc(activeProc).catch(() => {});
  if (activeRestoreTool && activeRestoreContent != null) {
    await restoreHmrFile(activeRestoreTool, activeRestoreContent).catch(() => {});
  }
}

process.on('SIGINT', async () => { await cleanup(); process.exit(1); });
process.on('SIGTERM', async () => { await cleanup(); process.exit(1); });

for (const tool of tools) {
  console.log(`\n=== ${tool} (track: ${track}) ===`);

  for (let i = 0; i < iterCount; i++) {
    console.log(`  Iteration ${i + 1}/${iterCount}`);

    // --- cold dev startup ---
    console.log('  [cold-dev] clearing caches...');
    await clearCaches(tool);

    const coldProc = startDevServer(tool);
    activeProc = coldProc;
    const coldStats = collectStats(coldProc.pid);

    let coldMs;
    try {
      coldMs = await waitForReady(coldProc, READY_MARKERS.devReady[tool], TIMEOUTS.devStartup);
    } catch (err) {
      console.error(`  [cold-dev] ERROR: ${err.message}`);
      await killProc(coldProc);
      activeProc = null;
      continue;
    }

    const { peakRssKb: coldRss } = coldStats.stop();
    console.log(`  [cold-dev] ready in ${coldMs}ms, peak RSS ${coldRss}KB`);

    await writeResult({
      tool,
      track,
      scenario: 'cold-dev',
      iteration: i,
      durationMs: coldMs,
      peakRssKb: coldRss,
      env: envMeta,
    });

    await killProc(coldProc);
    activeProc = null;

    // --- warm dev startup ---
    console.log('  [warm-dev] starting with cache...');
    const warmProc = startDevServer(tool);
    activeProc = warmProc;
    const warmStats = collectStats(warmProc.pid);

    let warmMs;
    try {
      warmMs = await waitForReady(warmProc, READY_MARKERS.devReady[tool], TIMEOUTS.devStartup);
    } catch (err) {
      console.error(`  [warm-dev] ERROR: ${err.message}`);
      await killProc(warmProc);
      activeProc = null;
      continue;
    }

    const { peakRssKb: warmRss } = warmStats.stop();
    console.log(`  [warm-dev] ready in ${warmMs}ms, peak RSS ${warmRss}KB`);

    await writeResult({
      tool,
      track,
      scenario: 'warm-dev',
      iteration: i,
      durationMs: warmMs,
      peakRssKb: warmRss,
      env: envMeta,
    });

    // --- HMR (reuse warm server) ---
    const hmrSettle = HMR_SETTLE_MS[tool] ?? 0;
    if (hmrSettle > 0) await new Promise((r) => setTimeout(r, hmrSettle));
    console.log('  [hmr] triggering edit...');
    const hmrStart = performance.now();
    const originalContent = await triggerHmrEdit(tool);
    activeRestoreTool = tool;
    activeRestoreContent = originalContent;

    let hmrMs;
    try {
      hmrMs = await waitForMarker(warmProc, READY_MARKERS.hmrApplied[tool], TIMEOUTS.hmr, hmrStart);
      console.log(`  [hmr] applied in ${hmrMs}ms`);
    } catch (err) {
      console.error(`  [hmr] ERROR: ${err.message}`);
      hmrMs = null;
    }

    await writeResult({
      tool,
      track,
      scenario: 'hmr',
      iteration: i,
      durationMs: hmrMs,
      env: envMeta,
    });

    await killProc(warmProc);
    activeProc = null;

    await restoreHmrFile(tool, originalContent);
    activeRestoreTool = null;
    activeRestoreContent = null;
  }
}

console.log('\nDev bench complete.');
