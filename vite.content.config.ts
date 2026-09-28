import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    emptyOutDir: false,
    outDir: 'dist',
    lib: {
      entry: resolve(__dirname, 'src/content/content-script.ts'),
      name: 'ContentScriptController',
      formats: ['iife'],
      fileName: () => 'content/content-script.js'
    }
  }
});
