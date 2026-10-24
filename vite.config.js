import { defineConfig } from 'vite';
import { resolve } from 'path';

function coreUmdPlugin() {
  return {
    name: 'core-umd-to-esm',
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, '/');
      if (normalizedId.includes('/src/core/')) {
        const isGeoOrParts = normalizedId.includes('geometry') || normalizedId.includes('parts');
        const importLine = isGeoOrParts ? '' : "import Geo from './geometry.js';";
        const requireHelper = isGeoOrParts ? '' : "const require = (mod) => { if (mod.includes('geometry')) return Geo; throw new Error('Cannot require ' + mod); };";
        return {
          code: `${importLine}\n${requireHelper}\nconst module = { exports: {} };\nconst exports = module.exports;\n${code}\nexport default module.exports;\n`,
          map: null
        };
      }
    }
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [coreUmdPlugin()],
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    commonjsOptions: {
      include: [/src\/core/, /node_modules/],
      transformMixedEsModules: true
    }
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: {
      allow: [resolve(__dirname)]
    }
  }
});
