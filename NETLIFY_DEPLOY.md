# Netlify deploy

## Live site (public, no password)

**https://flourishing-cactus-903a36.netlify.app**

Fruzer Polygon map build (density-cluster framing, unlit nearest materials, outdoor spawn). Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `1e50b314-13eb-4377-8aa6-37474d6f573a`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site 1e50b314-13eb-4377-8aa6-37474d6f573a --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzcwNjQsImV4cCI6MTc4MzU4MDY2NCwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiI2MWU1YjNjMy0yNTg5LTQ1NmMtOTY3NC1mMTYxNGUwOTZkMzEifQ.Xa8WwWAl0MnbnRg1y5W6EKnBVs79F7zBiLNmXBE2NrE
   ```
3. Or open: https://app.netlify.com/drop/flourishing-cactus-903a36#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzcwNjQsImV4cCI6MTc4MzU4MDY2NCwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiI2MWU1YjNjMy0yNTg5LTQ1NmMtOTY3NC1mMTYxNGUwOTZkMzEifQ.Xa8WwWAl0MnbnRg1y5W6EKnBVs79F7zBiLNmXBE2NrE

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
