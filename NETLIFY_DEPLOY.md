# Netlify deploy

## Live site (public, no password)

**https://extraordinary-klepon-9daa75.netlify.app**

Fruzer Polygon map build with startup hang fixes. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `005c202c-bde4-45b7-805c-1abcf62d2e80`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour of an anonymous deploy:

1. Log in: `netlify login`
2. Claim the site (use your own Netlify auth — do not commit tokens):
   ```bash
   netlify claim --site 005c202c-bde4-45b7-805c-1abcf62d2e80
   ```
3. Or open the Netlify Drop claim UI for the site slug `extraordinary-klepon-9daa75` while logged in, and follow the claim prompt shown in the Netlify dashboard.

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
