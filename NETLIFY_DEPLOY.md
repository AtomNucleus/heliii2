# Netlify deploy

## Live site (public, no password)

**https://spectacular-queijadas-3c2b43.netlify.app**

Fruzer Polygon map build. Deployed with `--allow-anonymous --created-via cli` (no drop password).

- Site ID: `a54b7c76-7ce6-447a-8f6e-b41c67663881`

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site a54b7c76-7ce6-447a-8f6e-b41c67663881 --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzQ1MDIsImV4cCI6MTc4MzU3ODEwMiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiIxNjA5Y2U1Ni0wN2QwLTQ4ZDMtOWU1Mi1lNjkxOGU0ZDk5NGIifQ.TQn3m8uBEY4t3nEdXai2STYUEM8_MOSfY5-KZLT3Ue4
   ```
3. Or open: https://app.netlify.com/drop/spectacular-queijadas-3c2b43#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzQ1MDIsImV4cCI6MTc4MzU3ODEwMiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiIxNjA5Y2U1Ni0wN2QwLTQ4ZDMtOWU1Mi1lNjkxOGU0ZDk5NGIifQ.TQn3m8uBEY4t3nEdXai2STYUEM8_MOSfY5-KZLT3Ue4

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
