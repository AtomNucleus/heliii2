# Netlify deploy

## Live site (public, no password)

**https://melodious-hamster-4cfdfd.netlify.app**

Fruzer Polygon map build. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `c1e39821-32dd-4f15-8ea6-79889f137cab`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site c1e39821-32dd-4f15-8ea6-79889f137cab --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzQ5NTMsImV4cCI6MTc4MzU3ODU1MywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJkNmJmNDQxNy0xMDdkLTQzZmItYjk3Mi1kMzQ1MjI0OWYxNGQifQ.3-qJlSGJVYlaTSR9VMxX8Qip2BZqKW3TxBDWU5IIlwE
   ```
3. Or open: https://app.netlify.com/drop/melodious-hamster-4cfdfd#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzQ5NTMsImV4cCI6MTc4MzU3ODU1MywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJkNmJmNDQxNy0xMDdkLTQzZmItYjk3Mi1kMzQ1MjI0OWYxNGQifQ.3-qJlSGJVYlaTSR9VMxX8Qip2BZqKW3TxBDWU5IIlwE

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
