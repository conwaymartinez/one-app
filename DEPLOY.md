# Deploying One for user testing

One is a static web app: a Vite build produces plain files in `dist/` that any
static host can serve. There is no server or database. Each tester's data is
saved in their own browser.

## 1. Check it builds on your machine

You need Node 22 and pnpm 10. The versions are pinned in `.mise.toml`.

```bash
corepack enable            # provides pnpm if you don't have it
pnpm install
pnpm build                 # writes the site to dist/
pnpm preview               # serves dist/ at http://localhost:8443
```

Open the preview on your phone too. Run `pnpm preview --host`, then visit
`http://<your-computer's-LAN-IP>:8443` on the same Wi-Fi network.

Keep the `.figma/` folder in the repo. `vite.config.ts` reads
`.figma/make/site.json` for the page title, description and the
"don't index this site" setting.

## 2. Put it on GitHub

```bash
git init
git add .
git commit -m "One: outline clock MVP for user testing"
gh repo create one-app --private --source=. --push
```

Or create an empty repo on github.com and follow its "push an existing
repository" steps.

Images use Git LFS (see `.gitattributes`). The app icons in `public/` are
exempt, so they deploy correctly without any LFS setup.

## 3. Deploy

### Vercel (recommended)

1. Go to vercel.com and click **Add New → Project**, then import the GitHub repo.
2. Vercel detects Vite. Confirm these settings:
   - Build command: `pnpm build`
   - Output directory: `dist`
   - Install command: `pnpm install`
3. Click **Deploy**. You get a URL like `one-app.vercel.app`.

Every push to `main` redeploys automatically. Other branches get their own
preview URLs, which is useful for trying a change on a few testers first.

### Netlify (alternative)

Use **Add new site → Import an existing project**, pick the repo, then set the
build command to `pnpm build` and the publish directory to `dist`.

### GitHub Pages

`.github/workflows/deploy.yml` builds and publishes the site on every push to
`main`. One-time setup: in the repo go to **Settings → Pages** and set
**Source** to **GitHub Actions**. The site appears at
`https://<your-username>.github.io/<repo-name>/`.

Pages serves the site from a sub-path (`/<repo-name>/`), so the workflow sets
`FIGMA_PUBLIC_URL=/<repo-name>`, which `vite.config.ts` turns into Vite's
`base`. To build the same thing locally: `FIGMA_PUBLIC_URL=/one-app pnpm build`.

Pages on a free account requires a **public** repo (private repos need a paid
plan). Every app on `<your-username>.github.io` shares one browser storage
area, so avoid hosting another app there that uses the same `one-*` keys.

## 4. Install it like an app

The app has a web manifest, icons and a dark theme colour, so it can be
installed from the browser and opens full screen without the browser's
address bar.

| Device | How |
| --- | --- |
| iPhone / iPad | Open the URL in **Safari** → Share → **Add to Home Screen** |
| Android | Open in **Chrome** → ⋮ menu → **Add to Home screen** (or **Install app**) |
| Mac | Chrome or Edge: install icon in the address bar. Safari 17+: **File → Add to Dock** |
| Windows / Linux | Chrome or Edge: install icon in the address bar, or menu → **Install One** |

## 5. What testers should know

- **Data stays on their device.** Nothing is synced or sent anywhere. A phone
  and a laptop are separate, and so are Safari and Chrome on the same phone.
- **Data survives updates.** Redeploying keeps everyone's projects, tasks and
  outlines, as long as the URL (domain) stays the same.
- **Start over** with **More → Reset to sample data**. On phones, More is
  the ⋯ button at the top of Home.
- **It needs a connection to open.** There's no offline mode yet (no service
  worker).
- **Search engines are told not to index it** (`robots: index false` in
  `.figma/make/site.json`).

## 6. Switches

- **Wrapped** shows by default. To hide the tab, set `SHOW_WRAPPED` to `false`
  in `src/App.tsx`.
