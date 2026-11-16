import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // three.js is one ~730 kB chunk (about 190 kB gzipped); it loads after the page has painted
    chunkSizeWarningLimit: 800,
  },
});
