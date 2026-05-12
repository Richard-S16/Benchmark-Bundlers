# Benchmark-Bundlers

Reproducible benchmark harness for **Webpack**, **Vite**, **Rspack**, and **Turbopack** on a local Windows development machine, built to be CI-reproducible from day one.

---

## Tracks

Results are always reported per track and are never merged into one winner table.

| Track | Tools | Fixture |
|-------|-------|---------|
| **A — React SPA** | webpack · vite · rspack | `benchmarks/spa/` |
| **B — Next.js** | next-turbopack · next-webpack | `benchmarks/next/app/` |

**Why two tracks?** Vite's dev server fires `ready` before any module is transformed; Webpack/Rspack fire `compiled successfully` after a full compile. Turbopack carries Next.js framework overhead that the SPA tools do not. Merging them into one table conflates fundamentally different startup contracts.

---

## Fixture

Both tracks share the same logical source graph:

- TypeScript + React 19
- Two routes — `Home` (eager) and `About` (lazy dynamic import)
- CSS modules per component
- One hot-edit leaf component (`HotLeaf.tsx`) used for HMR probing
- Static asset set under `public/assets/`

The SPA bundlers (Webpack, Vite, Rspack) all point at `benchmarks/spa/shared-src/` so only the bundler glue differs. The Next.js fixture in `benchmarks/next/app/` mirrors the same page and component shape.

---

## Metrics

| Metric | How measured |
|--------|-------------|
| Cold dev startup | Process spawn → `devReady` stdout marker, after clearing all caches |
| Warm dev startup | Same, with caches preserved from the cold run |
| HMR latency | `triggerHmrEdit` write → `hmrApplied` stdout marker |
| Cold production build | Process spawn → exit, after clearing all caches |
| Warm production build | Same, with caches preserved |
| Output bundle size | Emitted asset bytes, plus gzip and Brotli totals |

For Vite specifically, **server ready** and **first-page interactive** are recorded as two separate numbers and are never summed or compared directly against Webpack/Rspack compile-and-serve times.

---

## Results

> **Status — partial data.** Only Vite (Track A) has been run so far. Webpack, Rspack, and Next.js results are pending.

### Environment

| Property | Value |
|----------|-------|
| OS | Windows (win32 x64) |
| Node | v22.19.0 |
| CPUs | 14 |
| Date | 2026-05-12 |

### Track A — React SPA · Dev Startup (ms)

| Tool | Scenario | Run 1 | Run 2 | Notes |
|------|----------|------:|------:|-------|
| **Vite** | Cold dev | 4,916 | 63,167 | High variance — see below |
| **Vite** | Warm dev | 6,860 | 95,348 | High variance — see below |
| Webpack | Cold dev | — | — | Pending |
| Webpack | Warm dev | — | — | Pending |
| Rspack | Cold dev | — | — | Pending |
| Rspack | Warm dev | — | — | Pending |

> **Variance note.** The two Vite cold-dev samples (4.9 s vs 63.2 s) show a CV well above the 15 % warning threshold. On Windows, Windows Defender real-time scanning of `node_modules` is a known contributor to outlier startup times. Results should not be ranked until at least 5 full iterations are collected with AV exclusions confirmed and a stable CV.

### Track A — React SPA · HMR Latency

| Tool | Median (ms) | Notes |
|------|------------:|-------|
| Vite | — | Playwright probe returned `null` — HMR timing not yet captured |
| Webpack | — | Pending |
| Rspack | — | Pending |

### Track B — Next.js · Dev Startup

| Tool | Cold dev (ms) | Warm dev (ms) |
|------|-------------:|-------------:|
| next-turbopack | — | — |
| next-webpack | — | — |

_Full 5-iteration runs with summary statistics (median, σ, CV) will appear here once the complete benchmark pass is finished._

---

## Project Layout

```
.
├── package.json                  # Root workspace, pinned Node 22 + pnpm 9.15
├── pnpm-workspace.yaml
├── playwright.config.ts          # Browser HMR probe config
├── benchmarks/
│   ├── spa/
│   │   ├── shared-src/           # Single source graph shared by all SPA tools
│   │   ├── webpack/              # webpack.config.js + package.json
│   │   ├── vite/                 # vite.config.ts + package.json
│   │   └── rspack/               # rspack.config.ts + package.json
│   └── next/
│       └── app/                  # Shared Next.js fixture (Turbopack + Webpack toggle)
├── scripts/
│   └── bench/
│       ├── config.mjs            # Ports, cache dirs, iteration counts, tool matrix
│       ├── runner.mjs            # clearCaches · startDevServer · waitForReady · writeResult
│       ├── run-dev-bench.mjs     # Cold/warm dev + HMR orchestration
│       ├── run-build-bench.mjs   # Cold/warm production build orchestration
│       ├── browser-probes.spec.ts # Playwright: page timing + HMR classification
│       ├── measure-output-size.mjs # Bundle size (raw + gzip + Brotli)
│       └── generate-report.mjs  # Aggregates raw JSON → summary with CV flags
├── results/
│   ├── raw/                      # One JSON file per tool · scenario · iteration
│   └── summary/                  # Generated aggregate reports
└── docs/
    └── methodology.md            # Fairness rules, cache semantics, caveats per tool
```

---

## Getting Started

### Prerequisites

- Node 22.x
- pnpm ≥ 9.15.0

```sh
pnpm install
```

### Run a smoke check (1 iteration, fast)

```sh
# Both tracks
pnpm bench:smoke

# SPA track only
pnpm bench:smoke:spa

# Next.js track only
pnpm bench:smoke:next
```

### Run the full benchmark (5 iterations)

```sh
# Dev startup + HMR for all SPA tools
pnpm bench:dev:spa

# Production builds for all SPA tools
pnpm bench:build:spa

# Next.js track (Turbopack vs Webpack)
pnpm bench:dev:next
pnpm bench:build:next

# Everything in sequence
pnpm bench:all
```

### Generate a summary report

```sh
pnpm bench:report
```

Raw JSON files land in `results/raw/`. The report is written to `results/summary/`.

---

## Cache Behavior

| Tool | Cache path | Cold-run action |
|------|-----------|----------------|
| Webpack 5 | `node_modules/.cache/webpack` | Directory deleted |
| Vite | `node_modules/.vite` | Directory deleted |
| Rspack | `node_modules/.cache/rspack` | Directory deleted |
| Turbopack | `.next/` | Directory deleted |
| Next.js Webpack | `.next/` | Directory deleted |

---

## Key Rules

- Never publish one winner table across Track A and Track B.
- Keep loaders and plugins minimal so the benchmark measures bundler behavior, not plugin overhead.
- Classify hot edits as **HMR** or **full reload** — do not average them together.
- Flag any metric with CV > 15 % in the summary report.
- Pin Node and pnpm versions so local and CI runs are comparable.