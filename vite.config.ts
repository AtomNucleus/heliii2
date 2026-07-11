import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: true,
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: true,
    modulePreload: {
      polyfill: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/@dimforge/rapier')) {
            return 'rapier';
          }
          if (id.includes('node_modules/three/examples')) {
            return 'three-examples';
          }
          if (id.includes('three.webgpu') || id.includes('/three/webgpu') || id.includes('three.tsl')) {
            return 'three-webgpu';
          }
          if (id.includes('node_modules/three')) {
            return 'three';
          }
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
