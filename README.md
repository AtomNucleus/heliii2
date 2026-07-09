# HELI SUNSET

Browser-based low-poly helicopter arcade game built with **Three.js**, **TypeScript**, and **Vite**.

## Play

**Live:** https://gentle-druid-51a70b.netlify.app  

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

## Controls

- **WASD / Arrows** — steer & move
- **Space** — ascend
- **Shift** — descend
- **R** — restart
- Fly through neon rings in order (10 total)
