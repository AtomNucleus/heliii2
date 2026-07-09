# Netlify deploy

## Live site (public, no password)

**https://superb-moxie-5b001c.netlify.app**

Fruzer Polygon map build (density-cluster framing, unlit nearest materials, outdoor spawn). Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `921c665b-8a9a-4c6a-b3ce-78877f486eb4`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site 921c665b-8a9a-4c6a-b3ce-78877f486eb4 --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzcyMzMsImV4cCI6MTc4MzU4MDgzMywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJlMTZhNWU3NC01NzQ0LTQwOWYtYjdkMS1hYTVlODlmOGNmOTEifQ.ZphIFnAwEYc8fSTUHj6OaYuD63AoZTVUg4Y2ogtuJSE
   ```
3. Or open: https://app.netlify.com/drop/superb-moxie-5b001c#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzcyMzMsImV4cCI6MTc4MzU4MDgzMywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJlMTZhNWU3NC01NzQ0LTQwOWYtYjdkMS1hYTVlODlmOGNmOTEifQ.ZphIFnAwEYc8fSTUHj6OaYuD63AoZTVUg4Y2ogtuJSE

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
