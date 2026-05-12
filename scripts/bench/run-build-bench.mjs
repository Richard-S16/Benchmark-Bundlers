import { parseArgs } from 'node:util';
import {
  clearCaches,
  clearOutput,
  runBuild,
  writeResult,
  buildEnvMeta,
} from './runner.mjs';
import { measureOutputSize } from './measure-output-size.mjs';
import { ITERATIONS, MATRIX } from './config.mjs';

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

for (const tool of tools) {
  console.log(`\n=== ${tool} (track: ${track}) ===`);

  for (let i = 0; i < iterCount; i++) {
    console.log(`  Iteration ${i + 1}/${iterCount}`);

    // --- cold build ---
    console.log('  [cold-build] clearing caches and output...');
    await clearCaches(tool);
    await clearOutput(tool);

    let coldResult;
    try {
      coldResult = await runBuild(tool);
    } catch (err) {
      console.error(`  [cold-build] ERROR: ${err.message}`);
      continue;
    }

    console.log(`  [cold-build] done in ${coldResult.durationMs}ms, peak RSS ${coldResult.peakRssKb}KB`);

    let outputSize;
    try {
      outputSize = await measureOutputSize(tool);
      console.log(
        `  [cold-build] output JS: ${Math.round(outputSize.js.raw / 1024)}KB raw / ${Math.round(outputSize.js.gz / 1024)}KB gz / ${Math.round(outputSize.js.br / 1024)}KB br`,
      );
    } catch (err) {
      console.error(`  [cold-build] size measurement error: ${err.message}`);
      outputSize = null;
    }

    await writeResult({
      tool,
      track,
      scenario: 'cold-build',
      iteration: i,
      durationMs: coldResult.durationMs,
      peakRssKb: coldResult.peakRssKb,
      outputSize,
      env: envMeta,
    });

    // --- warm build ---
    console.log('  [warm-build] building with cache...');

    let warmResult;
    try {
      warmResult = await runBuild(tool);
    } catch (err) {
      console.error(`  [warm-build] ERROR: ${err.message}`);
      continue;
    }

    console.log(`  [warm-build] done in ${warmResult.durationMs}ms, peak RSS ${warmResult.peakRssKb}KB`);

    await writeResult({
      tool,
      track,
      scenario: 'warm-build',
      iteration: i,
      durationMs: warmResult.durationMs,
      peakRssKb: warmResult.peakRssKb,
      outputSize,
      env: envMeta,
    });
  }
}

console.log('\nBuild bench complete.');
