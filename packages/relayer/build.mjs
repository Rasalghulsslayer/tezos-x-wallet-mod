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
    Buffer: 'globalThis.Buffer',
  },
  banner: {
    js: `if (typeof globalThis.Buffer === 'undefined') {
  class FakeBuffer extends Uint8Array {
    toString(encoding) {
      if (encoding === 'hex') return Array.from(this).map(b => b.toString(16).padStart(2,'0')).join('');
      return new TextDecoder().decode(this);
    }
    static from(data, encoding) {
      if (typeof data === 'string') {
        if (encoding === 'hex') {
          const b = new FakeBuffer(data.length / 2);
          for (let i = 0; i < b.length; i++) b[i] = parseInt(data.slice(i*2, i*2+2), 16);
          return b;
        }
        return new FakeBuffer(new TextEncoder().encode(data));
      }
      return new FakeBuffer(data);
    }
    static isBuffer(o) { return o instanceof FakeBuffer; }
    static alloc(size) { return new FakeBuffer(size); }
    static concat(list) {
      const total = list.reduce((s, b) => s + b.length, 0);
      const out = new FakeBuffer(total);
      let offset = 0;
      for (const b of list) { out.set(b, offset); offset += b.length; }
      return out;
    }
  }
  globalThis.Buffer = FakeBuffer;
}`,
  },
});

console.log('Build complete → dist/relayer.iife.js');
