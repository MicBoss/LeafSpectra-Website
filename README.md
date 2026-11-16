# LeafSpectra — public website

The public website for LeafSpectra, the Android planting and plant-care assistant for novice home
vegetable growers, with the animated 3D Leafity mascot.

This is a plain **Vite** project (no React, no server). It is exported from the
"LeafSpectra Website — Main" page (the hand-drawn garden design) of the Leafity Studio Claude Design
project. The developer-only Animation Studio is **not** part of this project and is not in the build.

## Run and build

```bash
npm install
npm run dev       # local preview at http://localhost:5173
npm run build     # production build in dist/
npm run preview   # serve the production build
```

## Deploy to Vercel

Settings (also in `vercel.json`):

| Setting | Value |
|---|---|
| Framework | Vite |
| Install command | `npm install` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Environment variables | none |

From this folder: `npx vercel` (preview) or `npx vercel --prod` (production).
Or push the folder to a GitHub repository and import it at vercel.com/new.

## Things you will change

**The Android download** — `src/config.js`:

```js
export const DOWNLOAD = { url: '/apk.txt', fileName: 'apk.txt', isTest: true };
```

`public/apk.txt` is an empty (0-byte) test file. When the real installer is ready, put
`LeafSpectra.apk` in `public/`, set `url: '/LeafSpectra.apk'`, `fileName: 'LeafSpectra.apk'`,
`isTest: false`, and delete `public/apk.txt`. The release details (version, minimum Android,
file size) are in the same file.

**Phone screenshots** — two real app screenshots are used (Ask Leafity, the Garden screen) from
`public/hand-drawn-garden/assets/app/`; the other features show labelled concept placeholders.
`src/phone-mockup.js` accepts an `image` URL that replaces a concept screen with a real screenshot.

**Social preview URL** — `index.html` points `og:image` / `og:url` at
`https://leafspectra.vercel.app`. Change both if the site gets another domain.

## Project layout

```
index.html              page markup (prerendered) and styles
public/apk.txt          temporary empty download test file
public/brand/           official LeafSpectra logo files (unaltered), favicon, social image
src/main.js             connects the markup to the page logic
src/site.js             page behaviour + Leafity "director" (scroll sections, surprises, header visits)
src/leafity/            the 3D Leafity (model, animations, movement, effects) and the shared behaviour
                        modules: leafity-garden.js (hat, tools), leafity-farm.js (gardening moments),
                        leafity-sections.js (card, path, FAQ and download behaviours)
public/hand-drawn-garden/assets/   the hand-drawn illustrations (and app/ screenshots)
src/config.js           download link, release details, Leafity timing
src/phone-mockup.js     placeholder phone screens
src/runtime.js          small component base class used by site.js
src/leafity/            Leafity model, animations, movement, edge behaviours, add-ons
```

`public/brand/`: `Group 1.svg` (header, on light), `Group 2.svg` (footer, on dark), `Logo.svg`
(standalone mark). `favicon.svg` is `Logo.svg` with a tighter viewBox only; `og-image.png` and
`apple-touch-icon.png` are renders of the official files.

## Testing hooks

Add `?leafity-debug` to the URL to expose `window.leafitySite` (force surprise peeks and header
visits). Without it nothing is exposed.

## Rolling back

The previous production version (the cozy redesign, commit `9cfb1f8`) is tagged
`production-2026-11-16`. To return to it: revert the release merge on `main`
(`git revert -m 1 <merge commit>` or, for a fast-forward release, `git revert <first>..<last>`) and push;
or promote that older deployment again in the Vercel dashboard (Deployments → … → Promote to Production).
