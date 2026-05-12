export const ITERATIONS = {
  smoke: 1,
  full: 5,
};

export const PORTS = {
  webpack: 3001,
  vite: 3002,
  rspack: 3003,
  next: 3000,
};

export const CACHE_DIRS = {
  webpack: 'node_modules/.cache/webpack',
  vite: 'node_modules/.vite',
  rspack: 'node_modules/.cache/rspack',
  'next-turbopack': '.next',
  'next-webpack': '.next',
};

export const OUTPUT_PATHS = {
  webpack: 'benchmarks/spa/webpack/dist',
  vite: 'benchmarks/spa/vite/dist',
  rspack: 'benchmarks/spa/rspack/dist',
  'next-turbopack': 'benchmarks/next/app/.next',
  'next-webpack': 'benchmarks/next/app/.next',
};

export const RESULTS_DIR = 'results';
export const RAW_DIR = `${RESULTS_DIR}/raw`;
export const SUMMARY_DIR = `${RESULTS_DIR}/summary`;

export const MATRIX = {
  spa: ['webpack', 'vite', 'rspack'],
  next: ['next-turbopack', 'next-webpack'],
};

export const SCENARIOS = [
  'cold-dev',
  'warm-dev',
  'hmr',
  'cold-build',
  'warm-build',
];

export const HMR_PROBE_FILE = 'src/components/HotLeaf.tsx';

export const READY_MARKERS = {
  devReady: {
    webpack: 'compiled successfully',
    vite: 'ready in',
    rspack: 'compiled successfully',
    'next-turbopack': 'ready started server on',
    'next-webpack': 'ready started server on',
  },
  hmrApplied: {
    webpack: '[HMR] App is up to date',
    vite: '[vite] hmr update',
    rspack: '[HMR] App is up to date',
    'next-turbopack': 'Fast Refresh',
    'next-webpack': 'Fast Refresh',
  },
};

export const TIMEOUTS = {
  devStartup: 120_000,
  hmr: 15_000,
  build: 300_000,
};

export const CV_WARNING_THRESHOLD = 0.15;
