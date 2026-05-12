import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATRIX, SUMMARY_DIR, RAW_DIR, CV_WARNING_THRESHOLD } from './config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stddev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((acc, v) => acc + (v - m) ** 2, 0) / arr.length);
}

function stats(arr) {
  if (!arr.length) return null;
  const m = mean(arr);
  const sd = stddev(arr);
  return {
    n: arr.length,
    mean: Math.round(m * 10) / 10,
    median: Math.round(median(arr) * 10) / 10,
    stddev: Math.round(sd * 10) / 10,
    cv: m > 0 ? Math.round((sd / m) * 1000) / 1000 : 0,
    min: Math.min(...arr),
    max: Math.max(...arr),
  };
}

function inferTrack(tool) {
  return tool === 'next-turbopack' || tool === 'next-webpack' ? 'next' : 'spa';
}

async function loadRawResults() {
  const rawDir = path.join(ROOT, RAW_DIR);
  if (!existsSync(rawDir)) return [];
  const files = (await readdir(rawDir)).filter((f) => f.endsWith('.json'));
  const records = [];
  for (const file of files) {
    try {
      const content = await readFile(path.join(rawDir, file), 'utf8');
      records.push(JSON.parse(content));
    } catch {
      // skip malformed files
    }
  }
  return records;
}

function groupRecords(records) {
  const grouped = {};
  for (const record of records) {
    const track = record.track ?? inferTrack(record.tool);
    const { tool, scenario } = record;
    grouped[track] ??= {};
    grouped[track][scenario] ??= {};
    grouped[track][scenario][tool] ??= [];
    grouped[track][scenario][tool].push(record);
  }
  return grouped;
}

function summarizeOutputSize(toolRecords) {
  const withSize = toolRecords.filter((r) => r.outputSize != null);
  if (!withSize.length) return null;
  const last = withSize[withSize.length - 1].outputSize;
  return {
    js: { rawBytes: last.js.raw, gzipBytes: last.js.gz, brotliBytes: last.js.br },
    css: { rawBytes: last.css.raw, gzipBytes: last.css.gz, brotliBytes: last.css.br },
    fileCount: last.fileCount,
  };
}

function computeTrackSummary(trackData, trackTools) {
  const scenarios = {};
  const highVarianceFlags = [];

  for (const [scenario, toolMap] of Object.entries(trackData)) {
    scenarios[scenario] = {};
    for (const tool of trackTools) {
      const records = toolMap[tool];
      if (!records?.length) continue;
      const entry = {};

      const durations = records.map((r) => r.durationMs).filter((v) => v != null && !isNaN(v));
      if (durations.length) {
        entry.durationMs = stats(durations);
        if (entry.durationMs.cv > CV_WARNING_THRESHOLD) {
          highVarianceFlags.push({ tool, scenario, metric: 'durationMs', cv: entry.durationMs.cv });
        }
      }

      const rssList = records.map((r) => r.peakRssKb).filter((v) => v != null && !isNaN(v));
      if (rssList.length) {
        entry.peakRssKb = stats(rssList);
      }

      const outputSize = summarizeOutputSize(records);
      if (outputSize) entry.outputSize = outputSize;

      const ttfbs = records.map((r) => r.ttfb).filter((v) => v != null);
      if (ttfbs.length) entry.ttfbMs = stats(ttfbs);

      const dcls = records.map((r) => r.domContentLoaded).filter((v) => v != null);
      if (dcls.length) entry.domContentLoadedMs = stats(dcls);

      const lcls = records.map((r) => r.loadComplete).filter((v) => v != null);
      if (lcls.length) entry.loadCompleteMs = stats(lcls);

      const classifications = records.map((r) => r.classification).filter(Boolean);
      if (classifications.length) {
        const counts = {};
        for (const c of classifications) counts[c] = (counts[c] ?? 0) + 1;
        entry.hmrClassification = counts;
      }

      scenarios[scenario][tool] = entry;
    }
  }

  return { scenarios, highVarianceFlags };
}

function kb(bytes) {
  return `${Math.round(bytes / 1024)}KB`;
}

function fmtCv(cv) {
  const pct = Math.round(cv * 1000) / 10;
  return cv > CV_WARNING_THRESHOLD ? `**${pct}% ⚠**` : `${pct}%`;
}

function durationTable(scenarioLabel, scenarioData, tools) {
  const rows = tools.map((tool) => {
    const d = scenarioData[tool];
    if (!d?.durationMs) return `| ${tool} | — | — | — | — | — |`;
    const s = d.durationMs;
    return `| ${tool} | ${Math.round(s.mean)} | ${Math.round(s.median)} | ${s.min} | ${s.max} | ${fmtCv(s.cv)} (n=${s.n}) |`;
  });
  return [
    `### ${scenarioLabel}`,
    '',
    '| Tool | Mean (ms) | Median (ms) | Min | Max | CV |',
    '|------|-----------|-------------|-----|-----|----|',
    ...rows,
    '',
  ].join('\n');
}

function memoryTable(scenarioLabel, scenarioData, tools) {
  const hasData = tools.some((t) => scenarioData[t]?.peakRssKb);
  if (!hasData) return '';
  const rows = tools.map((tool) => {
    const d = scenarioData[tool];
    if (!d?.peakRssKb) return `| ${tool} | — |`;
    const s = d.peakRssKb;
    return `| ${tool} | ${Math.round(s.mean)} (±${Math.round(s.stddev)}) |`;
  });
  return [
    `#### Peak RSS — ${scenarioLabel}`,
    '',
    '| Tool | Peak RSS KB (mean ± stddev) |',
    '|------|----------------------------|',
    ...rows,
    '',
  ].join('\n');
}

function pageLoadTable(scenarioData, tools) {
  const hasData = tools.some((t) => scenarioData[t]?.ttfbMs);
  if (!hasData) return '';
  const rows = tools.map((tool) => {
    const d = scenarioData[tool];
    if (!d?.ttfbMs) return `| ${tool} | — | — | — |`;
    return `| ${tool} | ${Math.round(d.ttfbMs.mean)} | ${Math.round(d.domContentLoadedMs?.mean ?? 0)} | ${Math.round(d.loadCompleteMs?.mean ?? 0)} |`;
  });
  return [
    '### Page Load Timing (Browser)',
    '',
    '| Tool | TTFB (ms) | DOMContentLoaded (ms) | Load Complete (ms) |',
    '|------|-----------|-----------------------|--------------------|',
    ...rows,
    '',
  ].join('\n');
}

function outputSizeTable(scenarios, tools) {
  const base = scenarios['cold-build'] ?? scenarios['warm-build'];
  if (!base) return '';
  const hasSize = tools.some((t) => base[t]?.outputSize);
  if (!hasSize) return '';
  const rows = tools.map((tool) => {
    const d = base[tool];
    if (!d?.outputSize) return `| ${tool} | — | — | — | — | — | — |`;
    const { js, css } = d.outputSize;
    return `| ${tool} | ${kb(js.rawBytes)} | ${kb(js.gzipBytes)} | ${kb(js.brotliBytes)} | ${kb(css.rawBytes)} | ${kb(css.gzipBytes)} | ${kb(css.brotliBytes)} |`;
  });
  return [
    '### Production Output Size',
    '',
    '| Tool | JS Raw | JS Gzip | JS Brotli | CSS Raw | CSS Gzip | CSS Brotli |',
    '|------|--------|---------|-----------|---------|----------|------------|',
    ...rows,
    '',
  ].join('\n');
}

function varianceSection(allFlags) {
  if (!allFlags.length) {
    return ['## Variance Analysis', '', 'No metrics exceeded the 15% CV threshold.', ''].join('\n');
  }
  const rows = allFlags.map((f) => {
    const pct = Math.round(f.cv * 1000) / 10;
    return `| ${f.tool} | ${f.scenario} | ${f.metric} | ${pct}% |`;
  });
  return [
    '## Variance Analysis',
    '',
    `Metrics with CV > ${CV_WARNING_THRESHOLD * 100}% indicate high run-to-run variability. Treat these results with caution before drawing conclusions.`,
    '',
    '| Tool | Scenario | Metric | CV |',
    '|------|----------|--------|----|',
    ...rows,
    '',
  ].join('\n');
}

const NON_COMPARABLE_NOTES = {
  spa: [
    '**Vite cold-dev vs Webpack/Rspack cold-dev**: Vite\'s `ready` signal fires before modules are transformed. Webpack and Rspack signal readiness only after compilation completes. These numbers measure different pipeline stages and must not be ranked directly.',
    '**Vite first-page-interactive**: Browser `page-load` timings provide the complementary picture for Vite dev startup.',
    '**HMR vs full-reload**: Results classified as `full-reload` are not averaged with `hmr` results.',
  ],
  next: [
    '**Turbopack vs SPA bundlers**: Turbopack numbers include Next.js framework startup and routing overhead absent from Track A. Never compare Track B timings against Track A timings.',
    '**Track B vs Track A**: Different fixtures, different frameworks, different module graphs. Results are reported separately and never merged.',
    '**Shared .next cache**: Both Turbopack and Webpack modes share the `.next` directory. Clear it completely between cross-mode runs to avoid cache bleed.',
  ],
};

function generateMarkdown(summary) {
  const lines = [];

  lines.push('# Bundler Benchmark Report', '');
  lines.push(`Generated: ${summary.generatedAt}`, '');

  if (summary.env) {
    lines.push('## Environment', '');
    lines.push(`- Node.js: ${summary.env.nodeVersion}`);
    lines.push(`- Platform: ${summary.env.platform} / ${summary.env.arch}`);
    lines.push(`- CPUs: ${summary.env.cpus}`, '');
  }

  const allHighVariance = [];

  for (const [track, trackData] of Object.entries(summary.tracks)) {
    const tools = MATRIX[track] ?? trackData.tools;
    const trackLabel = track === 'spa' ? 'Track A — React SPA' : 'Track B — Next.js';
    lines.push(`## ${trackLabel} (${tools.join(' · ')})`, '');

    const devScenarioLabels = {
      'cold-dev': 'Cold Dev Startup',
      'warm-dev': 'Warm Dev Startup',
      'hmr': 'HMR Latency (Server)',
      'hmr-browser': 'HMR Latency (Browser)',
    };

    const buildScenarioLabels = {
      'cold-build': 'Cold Production Build',
      'warm-build': 'Warm Production Build',
    };

    lines.push('### Dev Metrics', '');
    for (const [key, label] of Object.entries(devScenarioLabels)) {
      const data = trackData.scenarios[key];
      if (!data) continue;
      lines.push(durationTable(label, data, tools));
      const mem = memoryTable(label, data, tools);
      if (mem) lines.push(mem);
    }

    const pageLoad = trackData.scenarios['page-load'];
    if (pageLoad) lines.push(pageLoadTable(pageLoad, tools));

    lines.push('### Build Metrics', '');
    for (const [key, label] of Object.entries(buildScenarioLabels)) {
      const data = trackData.scenarios[key];
      if (!data) continue;
      lines.push(durationTable(label, data, tools));
      const mem = memoryTable(label, data, tools);
      if (mem) lines.push(mem);
    }

    const sizeTable = outputSizeTable(trackData.scenarios, tools);
    if (sizeTable) lines.push(sizeTable);

    lines.push('### Non-Comparable Metrics', '');
    for (const note of NON_COMPARABLE_NOTES[track] ?? []) {
      lines.push(`- ${note}`);
    }
    lines.push('');

    allHighVariance.push(...trackData.highVarianceFlags);
  }

  lines.push(varianceSection(allHighVariance));

  lines.push(
    '## Methodology',
    '',
    'See [docs/methodology.md](../../docs/methodology.md) for the full fairness rules, cache semantics, and tool-specific caveats.',
    '',
  );

  return lines.join('\n');
}

async function main() {
  const records = await loadRawResults();
  if (!records.length) {
    console.error('No raw results found in results/raw/. Run benchmarks first.');
    process.exit(1);
  }

  const grouped = groupRecords(records);
  const tracks = {};

  for (const [track, trackData] of Object.entries(grouped)) {
    const tools = MATRIX[track] ?? Object.keys(Object.values(trackData)[0] ?? {});
    const { scenarios, highVarianceFlags } = computeTrackSummary(trackData, tools);
    tracks[track] = { tools, scenarios, highVarianceFlags };
  }

  const latestRecord = [...records].sort((a, b) => {
    const ta = a.env?.timestamp ?? '';
    const tb = b.env?.timestamp ?? '';
    return ta > tb ? -1 : ta < tb ? 1 : 0;
  })[0];

  const summary = {
    schemaVersion: '1',
    generatedAt: new Date().toISOString(),
    env: latestRecord?.env ?? null,
    tracks,
  };

  const summaryDir = path.join(ROOT, SUMMARY_DIR);
  await mkdir(summaryDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const jsonPath = path.join(summaryDir, `summary-${ts}.json`);
  const mdPath = path.join(summaryDir, `report-${ts}.md`);

  await writeFile(jsonPath, JSON.stringify(summary, null, 2));
  await writeFile(mdPath, generateMarkdown(summary));

  console.log(`Summary JSON : ${path.relative(ROOT, jsonPath)}`);
  console.log(`Markdown report: ${path.relative(ROOT, mdPath)}`);

  const allFlags = Object.values(tracks).flatMap((t) => t.highVarianceFlags);
  if (allFlags.length) {
    console.log(`\nHigh variance (CV > ${CV_WARNING_THRESHOLD * 100}%) detected:`);
    for (const f of allFlags) {
      const pct = Math.round(f.cv * 1000) / 10;
      console.log(`  ${f.tool} / ${f.scenario} / ${f.metric}: CV=${pct}%`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
