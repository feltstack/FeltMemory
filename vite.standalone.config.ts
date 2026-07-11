import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import pkg from './package.json';

// Builds a single self-contained HTML file (dist-standalone/index.html)
// that can be opened directly from disk — handy for quick desktop use
// without any hosting. No service worker / PWA install in this variant;
// IndexedDB persistence still works in Chrome/Edge/Firefox on file://.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version + '-standalone'),
  },
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-standalone',
  },
});
