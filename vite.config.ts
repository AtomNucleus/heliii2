import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

/** Shell precache only — large GLB/WASM use runtime CacheFirst to limit RAM pressure. */
const PRECACHE_MAX_BYTES = 2 * 1024 * 1024;

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
      resolveDependencies(filename, deps) {
        // Avoid eager preload of optional heavy backends on every visit.
        return deps.filter(
          (dep) =>
            !dep.includes('three-webgpu') && !dep.includes('rapier') && !dep.endsWith('.map'),
        );
      },
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
            id.includes('three.tsl') ||
            id.includes('/src/scene/skyMaterials') ||
            id.includes('/src/effects/postprocessingWebgpu')
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
      registerType: 'prompt',
      devOptions: {
        enabled: false,
      },
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
        // Precache the app shell only. Optional backends + GLB stay runtime-cached.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        globIgnores: [
          '**/ATTRIBUTION.md',
          '**/manifest.webmanifest',
          '**/icons/icon-192.png',
          '**/icons/icon-512.png',
          '**/icons/maskable-192.png',
          '**/icons/maskable-512.png',
          '**/rapier-*.js',
          '**/three-webgpu-*.js',
          '**/*.map',
          '**/draco_decoder-*.js',
          '**/draco_decoder-*.wasm',
          '**/draco_wasm_wrapper-*.js',
        ],
        maximumFileSizeToCacheInBytes: PRECACHE_MAX_BYTES,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              /\.(?:glb|wasm)$/i.test(url.pathname) ||
              /\/draco\//i.test(url.pathname) ||
              /\/maps\//i.test(url.pathname) ||
              /\/models\//i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'heli-heavy-assets',
              expiration: {
                maxEntries: 12,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) =>
              /rapier-/i.test(url.pathname) || /three-webgpu-/i.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'heli-optional-backends',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
    }),
  ],
});
