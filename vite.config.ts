import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Precache budget: Fruzer map GLB (~2.9MB) + heli + Draco + shell. */
const PRECACHE_MAX_BYTES = 5 * 1024 * 1024;

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
          if (
            id.includes('three.webgpu') ||
            id.includes('/three/webgpu') ||
            id.includes('three.tsl')
          ) {
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
  plugins: [
    VitePWA({
      // Player confirms reload; never auto-skipWaiting mid-mission.
      registerType: 'prompt',
      // Dev must not install a SW (avoids stale-cache surprises with HMR).
      devOptions: {
        enabled: false,
      },
      // Public icons are copied by Vite and picked up via workbox.globPatterns.
      includeAssets: [],
      manifest: {
        name: 'HELI SUNSET',
        short_name: 'HELI SUNSET',
        description:
          'Neon arcade helicopter strike run over Fruzer Polygon. Fly, fight, and chase grade S offline after the first load.',
        theme_color: '#061018',
        background_color: '#061018',
        display: 'standalone',
        orientation: 'landscape',
        // Relative paths keep install/scope correct with Vite base: './' and Netlify.
        scope: './',
        start_url: './',
        lang: 'en',
        categories: ['games', 'entertainment'],
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icons/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Shell + hashed assets + large local map/model/Draco payloads.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2,glb,wasm,webmanifest}'],
        // Avoid double-precache: vite-plugin-pwa also injects manifest icons + webmanifest.
        globIgnores: [
          '**/ATTRIBUTION.md',
          '**/manifest.webmanifest',
          '**/icons/icon-192.png',
          '**/icons/icon-512.png',
          '**/icons/maskable-192.png',
          '**/icons/maskable-512.png',
        ],
        maximumFileSizeToCacheInBytes: PRECACHE_MAX_BYTES,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
});
