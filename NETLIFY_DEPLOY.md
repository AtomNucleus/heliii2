# Netlify deploy

## Live site (public, no password)

**https://tranquil-marshmallow-94dc37.netlify.app**

Fruzer Polygon map build. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `1bdd98ed-155f-4021-9603-fcf362fe384f`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site 1bdd98ed-155f-4021-9603-fcf362fe384f --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM2MDU4MTIsImV4cCI6MTc4MzYwOTQxMiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJkZmUxZWU5Zi0yOGZkLTRjN2UtYmMzYi1hMDhhODdjNzFmYTUifQ.Yp3ktcKXoSvLlt1X5b232F0q4viSdm1Vx1v5JVcBTZY
   ```
3. Or open: https://app.netlify.com/drop/tranquil-marshmallow-94dc37#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM2MDU4MTIsImV4cCI6MTc4MzYwOTQxMiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJkZmUxZWU5Zi0yOGZkLTRjN2UtYmMzYi1hMDhhODdjNzFmYTUifQ.Yp3ktcKXoSvLlt1X5b232F0q4viSdm1Vx1v5JVcBTZY

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
