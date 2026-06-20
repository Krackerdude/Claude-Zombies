import { defineConfig } from 'vite';

// Notes on this config:
// - `base: './'` makes built asset URLs relative, so the production build works
//   whether it's served from a domain root, a sub-path, or opened locally. (An
//   absolute base is the usual cause of "Failed to load resource: 404" after a
//   build.)
// - `target: 'esnext'` keeps top-level `await` + modern WASM glue used by
//   @dimforge/rapier3d-compat intact, and avoids down-leveling private class
//   methods/fields.
// - `minify: 'terser'` deliberately avoids esbuild's minifier for the final
//   pass. Some esbuild versions mis-mangle private class members and throw
//   "TypeError: Private method '#x' is not writable" at runtime. Terser mangles
//   safely. esbuild is still used for fast transforms (no down-leveling at
//   esnext), just not for the minify step.
export default defineConfig({
  base: './',
  server: {
    port: 5173,
    host: true,
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 1 },
      keep_classnames: true,
      keep_fnames: true,
    },
  },
  esbuild: {
    target: 'esnext',
  },
  optimizeDeps: {
    include: ['three', '@dimforge/rapier3d-compat'],
  },
});
