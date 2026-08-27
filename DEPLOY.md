# Getting the app live

Three ways, fastest first. All give an HTTPS URL, which is what the phone needs to install the app to the home screen (Safari: Share, Add to Home Screen).

## 1. Drag and drop (5 minutes, no code)

1. Unzip `wh-field-webapp-build.zip`. It contains the built site (a `dist` folder).
2. Go to https://app.netlify.com/drop and drag the `dist` folder onto the page.
3. Netlify gives you a URL like `https://something.netlify.app`. Open it on a phone.

This build runs local-only: each phone keeps its own data and exports CSV. Sync needs the Supabase keys at build time, so use option 2 or 3 once you have them.

## 2. GitHub Pages (one push, rebuilds on every change)

1. Put the `wh-field` folder in a GitHub repository (main branch).
2. In the repo: Settings > Pages > Source: GitHub Actions.
3. Optional, for sync: Settings > Secrets and variables > Actions > New repository secret. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
4. Push. The workflow in `.github/workflows/deploy-pages.yml` runs the tests, builds, and publishes to `https://<your-account>.github.io/<repo-name>/`.

## 3. Netlify or Vercel from the repo (best long term)

1. Import the GitHub repo in Netlify or Vercel.
2. Build command `npm run build`, output directory `dist`.
3. Add the two `VITE_SUPABASE_*` environment variables.
4. Every push redeploys. Both give preview URLs for branches, which is handy for trying changes with the crew.

## Enabling sync

Sync needs a Supabase project (free tier is fine). Steps are in README.md under "Supabase setup". Until then the app works, just one device at a time.
