# Netlify deploy

## Live site (public, no password)

**https://gentle-druid-51a70b.netlify.app**

- Site ID: `0c349ce1-b08b-441d-bc4c-84d13034fe19`
- Deployed with `--allow-anonymous --created-via cli` (no drop password)

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site 0c349ce1-b08b-441d-bc4c-84d13034fe19 --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzE1MzAsImV4cCI6MTc4MzU3NTEzMCwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJhNjQ1MzUzNC01Y2U0LTRlODktYmYxOC1iNTA5OTY5ODk2NTcifQ._MM3e7KGLFTuGPQ9Cq_wHKxjE0Y9Iyd1hpXHPJdnuu0
   ```
3. Or open: https://app.netlify.com/drop/gentle-druid-51a70b#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzE1MzAsImV4cCI6MTc4MzU3NTEzMCwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJhNjQ1MzUzNC01Y2U0LTRlODktYmYxOC1iNTA5OTY5ODk2NTcifQ._MM3e7KGLFTuGPQ9Cq_wHKxjE0Y9Iyd1hpXHPJdnuu0

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
