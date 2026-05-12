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

> **Status — Track A complete (SPA tools). Track B (Next.js) pending.**
> Full report: [`results/summary/report-2026-05-12T18-59-55.md`](results/summary/report-2026-05-12T18-59-55.md)

### Environment

| Property | Value |
|----------|-------|
| OS | Windows (win32 x64) |
| Node | v22.19.0 |
| CPUs | 14 |
| Date | 2026-05-12 |

### Track A — React SPA · Cold Dev Startup

| Tool | Mean (ms) | Median (ms) | Min | Max | CV |
|------|----------:|------------:|----:|----:|----|
| webpack | 7,487 | 6,871 | 6,231 | 9,977 | **19.9% ⚠** (n=4) |
| vite | 11,757 | 2,243 | 2,194 | 63,167 | **178.8% ⚠** (n=7) |
| rspack | 2,949 | 2,903 | 2,768 | 3,221 | 6.2% (n=4) |

> **Vite variance note.** Vite's `ready` signal fires before modules are transformed — the outlier values (up to 63 s) reflect Windows Defender scanning `node_modules` on first access. The median (2,243 ms) is the more representative figure, but these results must not be ranked directly against Webpack/Rspack compile-and-serve times.

### Track A — React SPA · Warm Dev Startup

| Tool | Mean (ms) | Median (ms) | Min | Max | CV |
|------|----------:|------------:|----:|----:|----|
| webpack | 6,817 | 6,675 | 6,050 | 7,867 | 10.1% (n=4) |
| vite | 17,020 | 2,247 | 2,194 | 95,348 | **188.4% ⚠** (n=7) |
| rspack | 2,989 | 2,994 | 2,763 | 3,206 | 5.3% (n=4) |

### Track A — React SPA · HMR Latency (server-side)

| Tool | Mean (ms) | Median (ms) | Min | Max | CV |
|------|----------:|------------:|----:|----:|----|
| webpack | 585 | 585 | 496 | 674 | 14.2% (n=4) |
| vite | 55 | 55 | 44 | 66 | **20% ⚠** (n=2) |
| rspack | 60 | 59 | 54 | 67 | 8.1% (n=4) |

### Track A — React SPA · Production Build

| Tool | Scenario | Mean (ms) | n |
|------|----------|----------:|--:|
| webpack | Cold build | 13,427 | 1 |
| webpack | Warm build | 3,309 | 1 |
| vite | Cold build | 2,574 | 1 |
| vite | Warm build | 2,557 | 1 |
| rspack | Cold build | 2,005 | 1 |
| rspack | Warm build | 2,084 | 1 |

> Build timings are single-run only — CV cannot be computed. Re-run with `pnpm bench:build:spa` to add iterations.

### Track A — React SPA · Production Output Size

| Tool | JS Raw | JS Gzip | JS Brotli |
|------|-------:|--------:|----------:|
| webpack | 231 KB | 75 KB | 64 KB |
| vite | — | — | — |
| rspack | 231 KB | 75 KB | 65 KB |

> Vite output-size measurement returned zero — asset path glob likely needs adjustment for Vite's output layout.

### Track B — Next.js · Dev Startup

| Tool | Cold dev (ms) | Warm dev (ms) |
|------|-------------:|-------------:|
| next-turbopack | — | — |
| next-webpack | — | — |

_Track B is pending. Run `pnpm bench:dev:next` to collect data._

### Variance Summary (CV > 15 %)

| Tool | Scenario | CV |
|------|----------|----|
| webpack | cold-dev | **19.9%** |
| vite | cold-dev | **178.8%** |
| vite | hmr | **20%** |
| vite | warm-dev | **188.4%** |

All flagged Vite variance is attributable to Windows Defender scanning on first module access. Rspack and Webpack warm-dev show stable CVs (< 11 %) with the current sample size.

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