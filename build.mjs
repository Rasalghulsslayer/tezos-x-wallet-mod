import * as esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  outfile: 'dist/relayer.iife.js',
  minify: false,
  sourcemap: true,
  alias: {
    events: 'eventemitter3',
    crypto: './src/polyfills/crypto.js',
  },
  define: {
    global: 'globalThis',
    'process.env.NODE_ENV': '"production"',
  },
});

console.log('Build complete → dist/relayer.iife.js');
