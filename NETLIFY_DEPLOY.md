# Netlify deploy

## Live site (public, no password)

**https://tranquil-marshmallow-94dc37.netlify.app**

Fruzer Polygon map build. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `1bdd98ed-155f-4021-9603-fcf362fe384f`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour of an anonymous deploy:

1. Log in: `netlify login`
2. Claim the site (use your own Netlify auth — do not commit tokens):
   ```bash
   netlify claim --site 1bdd98ed-155f-4021-9603-fcf362fe384f
   ```
3. Or open the Netlify Drop claim UI for the site slug `tranquil-marshmallow-94dc37` while logged in, and follow the claim prompt shown in the Netlify dashboard.

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
