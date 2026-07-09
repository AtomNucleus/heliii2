# HELI SUNSET

Browser-based low-poly helicopter arcade game built with **Three.js**, **TypeScript**, and **Vite**.

## Play

**Live (Netlify claimable deploy):** https://euphonious-lokum-d5606e.netlify.app  
Password if prompted: `My-Drop-Site`  
See `NETLIFY_DEPLOY.md` to claim the site into your Netlify account.

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
