# Benchmark Methodology

## Tracks

This benchmark uses **two separate tracks**. Results are always reported per track and are never merged into a single winner table.

| Track | Tools | Fixture |
|-------|-------|---------|
| **A — React SPA** | webpack, vite, rspack | `benchmarks/spa/` |
| **B — Next.js** | next-turbopack, next-webpack | `benchmarks/next/app/` |

**Why two tracks?**

Vite's dev model depends on native ESM and on-demand per-request transforms. Its "server ready" event fires before any module is transformed, which is a fundamentally different contract from Webpack or Rspack's "compiled successfully" signal. Comparing those numbers directly without labelling the difference is misleading.

Turbopack is Next.js-native. Its numbers include Next.js framework startup overhead and the `.next` routing layer — overhead that is absent from the SPA track. Merging Track A and Track B into one table would conflate framework cost with bundler cost.

---

## Cache Semantics

### Cold run

All cache directories for the target tool are deleted before the run starts. The tool must recompute everything from source files.

### Warm run

Cache directories are preserved from the previous run. The tool reuses its persisted artifacts. The warm run immediately follows the cold run without restarting the process between them.

---

## Per-Tool Cache Directories

| Tool | Cache path (relative to package root) | Notes |
|------|--------------------------------------|-------|
| **Webpack 5** | `node_modules/.cache/webpack` | Configured via `cache.type: 'filesystem'` and `cache.cacheDirectory`. Webpack 5 writes a content-addressed on-disk cache. Deleting the directory forces a full cold compile. The path is pinned in the Webpack config so runners always clear the right location. |
| **Vite** | `node_modules/.vite` | Vite pre-bundles bare imports (React, etc.) with esbuild on the first dev-server start. The result lives in `node_modules/.vite/deps`. The broader `node_modules/.vite` is the full cache scope. Clearing it forces a full pre-bundle pass on next startup. |
| **Rspack** | `node_modules/.cache/rspack` | Rspack 1.2+ supports a persistent filesystem cache via `experiments.cache.type: 'persistent'` with `storage.directory` pointing to `node_modules/.cache/rspack`. Deleting this directory forces a cold build. The path is pinned in the Rspack config and matches the value here. |
| **Turbopack** (Next.js 16+) | `.next` | Turbopack is the default bundler in Next.js 16. Filesystem caching is enabled via `experimental.turbopackFileSystemCacheForDev: true` in `next.config.ts`. Clearing `.next/` forces a cold run. |
| **Next.js Webpack** | `.next` | Invoked with `next dev --no-turbopack` / `next build --no-turbopack`. Both Turbopack and Webpack modes share the same `.next/` root. Clearing `.next/` is the correct cold-run action for both. |

---

## Vite: Server Ready vs. First-Page Interactive

Vite's dev server becomes ready before all modules are transformed. The first browser request triggers the transform pipeline. This benchmark records two separate Vite-specific metrics:

1. **Server ready** — time from `vite dev` process spawn to the `ready in` log line.
2. **First page interactive** — time from browser navigation start to `load` event, measured by the Playwright runner.

These are reported as **two separate numbers** and are never summed into a single "startup" figure. They are also not compared directly against Webpack/Rspack compile-and-serve times.

---

## Turbopack vs. Next.js Webpack

Both modes use the same Next.js fixture and the same `.next` cache root. The only runtime difference is the bundler flag:

```sh
# Turbopack (default in Next.js 16)
next dev
next build

# Webpack mode
next dev --no-turbopack
next build --no-turbopack
```

Clearing `.next/` before a run is the correct cold-run action for both modes.

---

## HMR vs. Full Reload Classification

File edits during the HMR scenario may trigger either an HMR update or a full page reload depending on the bundler's module graph analysis. The runner classifies each result:

- **HMR** — the DOM is patched in place; the marker `hmrApplied` is detected without a full navigation.
- **Full reload** — the page navigates; detected via Playwright's `page.on('load', ...)`.

These are reported as separate metric types and are never averaged together.

---

## Iteration Count

| Mode | Iterations | Purpose |
|------|-----------|---------|
| Smoke | 1 | Readiness check and fast CI pass |
| Full | 5 | Repeated runs to measure variance |

Variance is reported as standard deviation and coefficient of variation (CV = σ / μ) alongside the median. A CV above **15 %** for any metric is flagged in the summary report.

---

## Metrics

| Metric | How measured |
|--------|-------------|
| Cold dev startup | Time from process spawn to `devReady` stdout marker |
| Warm dev startup | Same, with cache preserved |
| HMR latency | Time from file write to `hmrApplied` marker detected in browser |
| Full reload latency | Measured separately when HMR falls back to a full navigation |
| Cold production build | Time from process spawn to process exit (code 0), cache cleared |
| Warm production build | Same, with cache preserved |
| Output bundle size | Raw bytes + gzip + Brotli totals for all emitted JS and CSS |
| Peak RSS | Process RSS sampled every 200 ms during startup and build |
| CPU time | `process.cpuUsage()` delta (user + system) at process exit |

---

## Fairness Rules

1. Each tool uses only the minimum loaders and plugins required for TypeScript + CSS + dynamic imports. No additional optimisation plugins.
2. Source graphs are identical across tools within each track. Only the bundler glue (config file + `package.json` scripts) differs.
3. Cache clearing and preservation are part of the benchmark contract — cold and warm runs are fully reproducible.
4. HMR and full-reload results are classified and reported separately; they are never averaged together.
5. Node.js and pnpm versions are pinned identically for local and CI runs (see `.nvmrc` and `package.json#packageManager`).
6. Non-comparable metrics are explicitly labelled in every report.

---

## Non-Comparable Metrics

| Comparison | Why it is non-comparable |
|-----------|-------------------------|
| Vite server-ready vs. Webpack compiled-successfully | Vite is ready before transforms complete; Webpack is ready after. |
| Turbopack time vs. SPA bundler time | Turbopack numbers include Next.js framework startup overhead. |
| Track A vs. Track B | Different fixtures, different frameworks, different module graphs. |
| Vite server-ready vs. Vite first-interactive | These measure different pipeline stages and must not be summed. |

---

## Environment

- **OS**: Windows (local and CI)
- **Node.js**: 22.14.0 (pinned in `.nvmrc` and CI matrix)
- **Package manager**: pnpm 9.15.0 (pinned via `packageManager` field and CI action)
- **Installs**: Always `pnpm install --frozen-lockfile` to prevent lockfile drift

---

## Out of Scope for v1

- SSR or framework shootout
- Plugin ecosystem stress tests
- Monorepo benchmarks
- Linux or macOS CI matrix
- Library-mode builds
- Subjective developer-experience scoring
