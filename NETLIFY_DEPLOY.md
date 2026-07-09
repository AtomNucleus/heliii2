# Netlify deploy

## Live site (public, no password)

**https://ornate-mermaid-7f4f64.netlify.app**

Fruzer Polygon map build. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `3632e38a-054a-4d32-b01a-b3b206330f60`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site 3632e38a-054a-4d32-b01a-b3b206330f60 --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzQwMTMsImV4cCI6MTc4MzU3NzYxMywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiIzM2UxNTNmNy0xMzIxLTQwYmMtYTRmYi03YjljZWY2NTFlZTkifQ.xCRRD6TpUar_80n22r0ZdqRKFD5sRNc5NW6mZBMbCvg
   ```
3. Or open: https://app.netlify.com/drop/ornate-mermaid-7f4f64#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzQwMTMsImV4cCI6MTc4MzU3NzYxMywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiIzM2UxNTNmNy0xMzIxLTQwYmMtYTRmYi03YjljZWY2NTFlZTkifQ.xCRRD6TpUar_80n22r0ZdqRKFD5sRNc5NW6mZBMbCvg

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
