# HELI SUNSET

Browser-based low-poly helicopter arcade game built with **Three.js**, **TypeScript**, and **Vite**.

Fly a neon strike run over the **Fruzer Polygon** map (Chicken Gun–style battle-royale island).

## Project status

TypeScript / Three.js / Vite game sources are in place. This branch includes project foundation (lint/format/test/CI), Playwright smoke coverage, and production **PWA / offline** support via `vite-plugin-pwa`.

## Play

**Live:** https://tranquil-marshmallow-94dc37.netlify.app

Public deploy (no password). Claim it into your Netlify account soon so it is not suspended — see `NETLIFY_DEPLOY.md`.

## Install

```bash
npm ci
```

(`npm install` also works for local development.)

## Develop

```bash
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

**PWA note:** the service worker is **not** registered in `vite` dev mode (`devOptions.enabled: false`). That keeps HMR reliable and avoids stale-cache surprises while iterating. Use a production build + `npm run preview` (or Netlify) to exercise install/offline.

## Build

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

## PWA / offline

Production builds ship:

- Web app manifest (`manifest.webmanifest`) — name **HELI SUNSET**, `standalone`, `landscape`, theme/background `#061018`, relative `scope` / `start_url` (`./`) for Vite `base: './'` and Netlify
- Icons under `public/icons/` (authored SVG + PNG / maskable sizes)
- Workbox service worker that precaches the game shell, hashed assets, map/heli GLBs, and Draco decoder (max file size **5 MiB**)
- Cautious updates: when a new SW is waiting, a HUD-styled banner offers **Reload** / **Apply later** — activation never auto-interrupts an active mission
- Install affordance only after a real `beforeinstallprompt` (dismissible; hidden on unsupported browsers / already-installed / standalone)

Runtime state is exposed on `#app` for debugging/tests:

- `data-pwa-sw` — `unsupported` | `pending` | `registered` | `waiting` | `controlling`
- `data-pwa-update` — `none` | `available` | `deferred` | `reloading`
- `data-pwa-install` — `unsupported` | `available` | `dismissed` | `installed` | `standalone`
- `data-pwa-offline-ready` — `true` after first successful precache

Pure update/install policy lives in `src/pwa/policy.ts` (unit-tested).

### Platform limits

| Surface                    | Notes                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| Chromium desktop / Android | Full install prompt + offline after first load                                                     |
| Safari iOS                 | No `beforeinstallprompt`; Add to Home Screen is manual. SW caching works on supported iOS versions |
| Firefox                    | Install UI varies; SW offline works                                                                |
| Dev server                 | No SW on purpose                                                                                   |
| Fonts                      | Google Fonts CSS is network-fetched; offline may fall back to system fonts                         |

## Lint and format

```bash
npm run lint
npm run format:check
```

Prettier is configured for configs, scripts, e2e, docs, and the HTML shell. `src/` is ignored for now to avoid large style-only diffs while other workstreams land.

## Test

```bash
npm test                 # unit + verification scripts
npm run test:unit        # Node unit tests (combat AI, render prefs, physics, PWA policy)
npm run test:pwa         # PWA update/install policy only
npm run test:physics     # Rapier debris budget / fragment / lifecycle policies
npm run test:collision   # collision math verification
npm run test:mission     # mission authoring verification
npm run smoke-test       # Playwright Chromium smoke (needs build + browser)
```

See `PHYSICS_VISUAL.md` for the Rapier debris + visual fidelity slice (what shipped vs deferred).

First-time Playwright setup (local):

```bash
npx playwright install chromium
```

CI installs Chromium automatically via GitHub Actions.

## Deploy (Netlify)

```bash
npm run build
npx netlify deploy --dir dist --prod
```

`netlify.toml` publishes `dist` after `npm run build`. See `NETLIFY_DEPLOY.md` for claim/redeploy notes (no credentials stored in-repo).

## Map credit

Playable map:
[Chicken Gun Fruzer — Polygon](https://sketchfab.com/3d-models/chicken-gun-fruzer-polygon-f6bd85b8748a43fc95ee321f0e4a8677)
by [amogusstrikesback2](https://sketchfab.com/amogusstrikesback2) on Sketchfab  
License: **CC Attribution**

Asset path: `public/maps/fruzer-polygon.glb`

## Controls

- **WASD / Arrows** — steer & move
- **Space** — ascend
- **Shift** — descend
- **R** — restart
- **Mobile / touch** — left thumb steer pad, right thumb ascend/descend buttons, small restart button during flight
- Fly through neon rings in order (10 total)

## Credits

Helicopter model: **Attack Chopper** by Cheese Animal Productions (CC-BY) via [OpenGameArt](https://opengameart.org/content/attack-chopper). See `public/models/ATTRIBUTION.md`.
