# Netlify deploy

## Live site (public, no password)

**https://genuine-khapse-40e5e6.netlify.app**

Fruzer Polygon map build with staged, low-memory startup processing. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `dd3a731c-1c58-4ffd-a2b7-7759c78b33ea`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour of an anonymous deploy:

1. Log in: `netlify login`
2. Claim the site (use your own Netlify auth — do not commit tokens):
   ```bash
   netlify claim --site dd3a731c-1c58-4ffd-a2b7-7759c78b33ea
   ```
3. Or open the Netlify Drop claim UI for the site slug `genuine-khapse-40e5e6` while logged in, and follow the claim prompt shown in the Netlify dashboard.

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
