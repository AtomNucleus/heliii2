# Netlify deploy

## Live site (public, no password)

**https://leafy-gecko-736a8b.netlify.app**

Build with chase-camera wall / map-edge occlusion (baked map + procedural env occluders + perimeter rim) and deterministic visual harnesses (`/camera-harness.html`, `/vfx-harness.html`). Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `7e6b7d3c-4d11-4bb5-b7f9-340829ab219a`

Manual camera validation on the live site:

- `/camera-harness.html?scenario=thin-wall-tunnel&frames=60&view=chase` — player POV against a thin wall
- `/camera-harness.html?scenario=rim-perimeter&frames=60&view=chase` — player POV at the map edge
- Scenarios: `wall-block`, `thin-wall-tunnel`, `lag-through-wall`, `rim-perimeter`, `corner-yaw`, `clear-arm`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour of an anonymous deploy:

1. Log in: `netlify login`
2. Claim the site (use your own Netlify auth — do not commit tokens):
   ```bash
   netlify claim --site 7e6b7d3c-4d11-4bb5-b7f9-340829ab219a
   ```
3. Or open the Netlify Drop claim UI for the site slug `leafy-gecko-736a8b` while logged in, and follow the claim prompt shown in the Netlify dashboard.

> **Security note:** Never commit Netlify session JWTs, drop tokens, or personal access tokens. If a token was previously shared in this file, treat it as compromised and rely on `netlify login` instead.

### Redeploy (public, no password)

```bash
npm run build
npx netlify deploy --allow-anonymous --created-via cli --dir dist --no-build --prod
```

After claiming / logging in:

```bash
npm run build
npx netlify deploy --dir dist --prod
```
