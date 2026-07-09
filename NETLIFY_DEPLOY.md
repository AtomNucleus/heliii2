# Netlify anonymous deploy (claimable)

- Site URL: https://euphonious-lokum-d5606e.netlify.app
- Site ID: b73b9471-a7ff-4bc5-a94b-f25e262e9be3
- Deploy password (if prompted): My-Drop-Site
- Claim in browser: https://app.netlify.com/drop/euphonious-lokum-d5606e
  (open the claim_url from the deploy JSON if the drop page asks for a token)

To claim into your Netlify account (token expires ~1 hour after deploy):

```bash
netlify claim --site b73b9471-a7ff-4bc5-a94b-f25e262e9be3 --token <token-from-deploy-output>
```

Or redeploy after `netlify login`:

```bash
npm run build
npx netlify deploy --dir dist --prod --site-name heli-sunset
```
