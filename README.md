# HELI SUNSET

Browser-based low-poly helicopter arcade game built with **Three.js**, **TypeScript**, and **Vite**.

Fly a neon course over the **Fruzer Polygon** map (Chicken Gun–style battle-royale island).

## Play

**Live:** https://melodious-hamster-4cfdfd.netlify.app  

Public deploy (no password). Claim it into your Netlify account soon so it is not suspended — see `NETLIFY_DEPLOY.md`.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

## Build

```bash
npm run build
```

## Deploy (Netlify)

```bash
npm run build
npx netlify deploy --dir dist --prod
```

`netlify.toml` publishes `dist` after `npm run build`.

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
