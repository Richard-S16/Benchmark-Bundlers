/**
 * scripts/bench/config.mjs
 *
 * Central benchmark configuration.
 * All iteration counts, ports, cache directories, output paths,
 * and the benchmark matrix are defined here and imported by every runner.
 */

// ── Run modes ────────────────────────────────────────────────────────────────

/** Number of repeated benchmark iterations per scenario per tool. */
export const ITERATIONS = {
  /** Smoke check: 1 iteration, fast CI sanity pass. */
  smoke: 1,
  /** Full benchmark: enough repetitions to measure variance. */
  full: 5,
};

// ── Dev-server ports ─────────────────────────────────────────────────────────

/**
 * Fixed dev-server ports for each tool.
 * Ports must not conflict — runners enforce this before starting any server.
 */
export const PORTS = {
  webpack: 3001,
  vite: 3002,
  rspack: 3003,
  /** Both next-turbopack and next-webpack run on the same port (never in parallel). */
  next: 3000,
};

// ── Cache directories ─────────────────────────────────────────────────────────

/**
 * Directories deleted on a cold run and preserved on a warm run.
 * Paths are relative to each workspace package root.
 *
 * Cache semantics per tool
 * ─────────────────────────
 * webpack
 *   Webpack 5 writes an explicit filesystem cache to node_modules/.cache/webpack
 *   (configured via cache.type: 'filesystem' and cache.cacheDirectory).
 *   Deleting this directory guarantees a cold compile.
 *
 * vite
 *   Vite pre-bundles dependencies with esbuild on the first dev-server start.
 *   The pre-bundle result is stored in node_modules/.vite/deps.
 *   The broader node_modules/.vite directory is the full cache scope.
 *   Browser-level transform caches are NOT controlled here — all timings are
 *   measured server-side.
 *
 * rspack
 *   Rspack 1.2+ supports a persistent filesystem cache via
 *   experiments.cache.type: 'persistent' with storage.directory pointing to
 *   node_modules/.cache/rspack.
 *   Deleting this directory forces a full cold build.
 *
 * next (Turbopack and Webpack modes)
 *   Both Turbopack (Next.js 16 default) and Next.js Webpack store their
 *   incremental build state under .next/.
 *   Turbopack filesystem caching is opt-in via:
 *     experimental.turbopackFileSystemCacheForDev: true
 *   Clearing .next/ is the correct cold-run action for both modes.
 *   To switch modes:
 *     cold/warm Turbopack  → next dev / next build  (default in Next.js 16+)
 *     cold/warm Webpack    → next dev --no-turbopack / next build --no-turbopack
 */
export const CACHE_DIRS = {
  webpack: 'node_modules/.cache/webpack',
  vite: 'node_modules/.vite',
  rspack: 'node_modules/.cache/rspack',
  'next-turbopack': '.next',
  'next-webpack': '.next',
};

// ── Production output paths ───────────────────────────────────────────────────

/**
 * Emitted asset directories used for bundle-size measurement after
 * a production build. Paths are relative to the workspace root.
 */
export const OUTPUT_PATHS = {
  webpack: 'benchmarks/spa/webpack/dist',
  vite: 'benchmarks/spa/vite/dist',
  rspack: 'benchmarks/spa/rspack/dist',
  'next-turbopack': 'benchmarks/next/app/.next',
  'next-webpack': 'benchmarks/next/app/.next',
};

// ── Results storage ───────────────────────────────────────────────────────────

export const RESULTS_DIR = 'results';
export const RAW_DIR = `${RESULTS_DIR}/raw`;
export const SUMMARY_DIR = `${RESULTS_DIR}/summary`;

// ── Benchmark matrix ──────────────────────────────────────────────────────────

/**
 * Tracks and the tools within each.
 * Tracks are always reported separately — results are NEVER merged across tracks.
 *
 * Track A — React SPA
 *   webpack, vite, rspack all compile the same source graph in benchmarks/spa/shared-src/.
 *   Only bundler glue (config + package.json) differs between them.
 *
 * Track B — Next.js
 *   next-turbopack uses `next dev` / `next build` (Turbopack default since Next.js 16).
 *   next-webpack   uses `next dev --no-turbopack` / `next build --no-turbopack`.
 *   Both run the same fixture in benchmarks/next/app/.
 */
export const MATRIX = {
  spa: ['webpack', 'vite', 'rspack'],
  next: ['next-turbopack', 'next-webpack'],
};

// ── Scenarios ─────────────────────────────────────────────────────────────────

/**
 * Ordered benchmark scenarios executed for each tool.
 * Runners execute them in this order per tool per iteration.
 */
export const SCENARIOS = [
  'cold-dev',
  'warm-dev',
  'hmr',
  'cold-build',
  'warm-build',
];

// ── HMR probe target ──────────────────────────────────────────────────────────

/**
 * Leaf component edited during HMR/full-reload timing.
 * Must have no transitive side-effects so edits don't cascade.
 * Path is relative to the shared-src root (Track A) or the Next.js
 * app component directory (Track B).
 */
export const HMR_PROBE_FILE = 'src/components/HotLeaf.tsx';

// ── Readiness markers ─────────────────────────────────────────────────────────

/**
 * Substrings searched in stdout/stderr to detect benchmark-visible events.
 * Runners use case-insensitive substring matching.
 */
export const READY_MARKERS = {
  /** Dev server is accepting connections. */
  devReady: {
    webpack: 'compiled successfully',
    vite: 'ready in',
    rspack: 'compiled successfully',
    'next-turbopack': 'ready started server on',
    'next-webpack': 'ready started server on',
  },
  /** HMR update has been applied in the browser. */
  hmrApplied: {
    webpack: '[HMR] App is up to date',
    vite: '[vite] hmr update',
    rspack: '[HMR] App is up to date',
    'next-turbopack': 'Fast Refresh',
    'next-webpack': 'Fast Refresh',
  },
};

// ── Timeouts (milliseconds) ───────────────────────────────────────────────────

export const TIMEOUTS = {
  /** Maximum time to wait for a dev server to become ready. */
  devStartup: 120_000,
  /** Maximum time to wait for an HMR update after a file edit. */
  hmr: 15_000,
  /** Maximum time to wait for a production build to complete. */
  build: 300_000,
};

// ── Variance threshold ────────────────────────────────────────────────────────

/**
 * If the coefficient of variation (stddev / mean) for any metric exceeds this
 * value across full-mode iterations, the summary report flags the result.
 */
export const CV_WARNING_THRESHOLD = 0.15;
