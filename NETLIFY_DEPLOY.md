# Netlify deploy

## Live site (public, no password)

**https://friendly-figolla-4e95d9.netlify.app**

- Site ID: `c6685e60-1779-4c81-b066-77514e27ca5d`
- Deployed with `--allow-anonymous --created-via cli` (no drop password)

### Claim into your Netlify account (recommended)

Anonymous sites can be suspended if left unclaimed. Claim within ~1 hour:

1. Log in: `netlify login`
2. Run:
   ```bash
   netlify claim --site c6685e60-1779-4c81-b066-77514e27ca5d --token eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzIyNTYsImV4cCI6MTc4MzU3NTg1NiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJiNTE0YjJjYi02M2NiLTRiODYtOGIwOS0zNjMyZjc3OWNmZjQifQ.qSFDB6qt_mp8oXb6IXfIoauy3RAhvtRNms2t9zrr5PA
   ```
3. Or open: https://app.netlify.com/drop/friendly-figolla-4e95d9#drop_token=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpYXQiOjE3ODM1NzIyNTYsImV4cCI6MTc4MzU3NTg1NiwiaXNzIjoiTmV0bGlmeSIsInNlc3Npb25faWQiOiJiNTE0YjJjYi02M2NiLTRiODYtOGIwOS0zNjMyZjc3OWNmZjQifQ.qSFDB6qt_mp8oXb6IXfIoauy3RAhvtRNms2t9zrr5PA

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
