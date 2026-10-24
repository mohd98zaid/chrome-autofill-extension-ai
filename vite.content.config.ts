import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src')
    }
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    sourcemap: true,
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/content-script.ts'),
      name: 'ContentScriptController',
      formats: ['iife'],
      fileName: () => 'content/content-script.js'
    }
  }
});
