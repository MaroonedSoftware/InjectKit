import { defineConfig } from 'tsup';

// Browser builds start from the compiled ESM output so declaration generation
// stays owned by the normal Node/package build.
const browserConfig = {
  bundle: true,
  clean: false,
  dts: false,
  entry: {
    injectkit: 'dist/index.js',
  },
  format: ['esm'],
  noExternal: ['reflect-metadata'],
  outDir: 'dist/browser',
  platform: 'browser',
  sourcemap: true,
  splitting: false,
  target: 'es2020',
} as const;

export default defineConfig([
  browserConfig,
  {
    ...browserConfig,
    minify: true,
    outExtension: () => ({
      js: '.min.js',
    }),
  },
]);
