# Netlify deploy

## Live site (public, no password)

**https://splendid-granita-af9b87.netlify.app**

Fruzer Polygon map build. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `919ea34e-14b2-4dfb-abef-a1bfff9227fe`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site 919ea34e-14b2-4dfb-abef-a1bfff9227fe --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzM1OTcsImV4cCI6MTc4MzU3NzE5NywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJmMDE0MTc4NC04MDllLTRiYWQtODc4Yi05YzNhOGRkNmQ3YjgifQ.zxvWK4ZrS-WnCBuFDjDD6Clpbot2rScnDDskUQqydF0
   ```
3. Or open: https://app.netlify.com/drop/splendid-granita-af9b87#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzM1OTcsImV4cCI6MTc4MzU3NzE5NywiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJmMDE0MTc4NC04MDllLTRiYWQtODc4Yi05YzNhOGRkNmQ3YjgifQ.zxvWK4ZrS-WnCBuFDjDD6Clpbot2rScnDDskUQqydF0

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
