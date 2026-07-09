# Netlify deploy

## Live site (public, no password)

**https://strong-sprite-b2ec32.netlify.app**

Fruzer Polygon map build (density-cluster framing, unlit nearest materials, outdoor spawn). Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `f71580d7-7b7c-46fd-a873-9c94daf58a76`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site f71580d7-7b7c-46fd-a873-9c94daf58a76 --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzczODYsImV4cCI6MTc4MzU4MDk4NiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJlYWEzYzNiYy02NWRlLTQ4ZjgtODQyZC0xZTJjZGMzZmE4NmIifQ.dSW7hmZ60_8ZPSPyxTCiOFeQFLn6rg6VsDqvxr7Xok8
   ```
3. Or open: https://app.netlify.com/drop/strong-sprite-b2ec32#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzczODYsImV4cCI6MTc4MzU4MDk4NiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJlYWEzYzNiYy02NWRlLTQ4ZjgtODQyZC0xZTJjZGMzZmE4NmIifQ.dSW7hmZ60_8ZPSPyxTCiOFeQFLn6rg6VsDqvxr7Xok8

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
