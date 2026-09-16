# Qalavision — Atmosphere Weather (standalone)

Live weather billboard for **Aktau, Kazakhstan**, "Atmosphere" direction only:
one cinematic full-screen living sky that tracks the real sky, weather, and moon
phase, with a rotating hero / stats / sun-arc view. Self-contained and self-
updating — open the HTML and it runs.

---

## How to run

No build step. Just serve the folder over HTTP and open the page:

```bash
# any static server works; e.g.
npx serve .
# then open  http://localhost:3000/Atmosphere%20Weather.html
```

Opening the file directly via `file://` also works in most browsers. It fetches
live data on load and refreshes every 10 minutes.

---

## Files in this package

The four `../billboard-*.jsx` sources are shared with the root package — this folder holds only its own entry point and mount.

| File | Role |
|---|---|
| `Atmosphere Weather.html` | Entry point. Loads CDN libs, holds the CSS keyframes, mounts the app. |
| `mount.jsx` | Mounts `VariantAtmosphere` full-screen in a 1920×1080 stage that auto-scales to any viewport (letterboxed). Live mode, no tweaks/canvas. |
| `../billboard-shared.jsx` | Data layer: Open-Meteo fetch hook, WMO code lookup, trilingual (EN/RU/KZ) strings, formatting helpers, particle engine, logo, palettes. |
| `../billboard-sky.jsx` | `LivingSky` — day→night gradient sky, stars, sun/moon disc (procedural lunar surface), parallax clouds, god-rays. |
| `../billboard-weather-fx.jsx` | `WeatherFX` — depth-layered rain / snow / fog / lightning / dust overlay. |
| `../billboard-atmosphere.jsx` | `VariantAtmosphere` — the three rotating views + stat columns. |

Script load order in the HTML matters: `shared → sky → weather-fx → atmosphere → mount`.

---

## Tools, libraries & programs used

Everything is loaded from CDN at runtime — there are **no local `node_modules`**
and nothing to install to run it. Versions are pinned with integrity hashes in
the HTML.

**Runtime dependencies (CDN):**
- **React 18.3.1** — `unpkg.com/react@18.3.1/umd/react.development.js`
- **ReactDOM 18.3.1** — `unpkg.com/react-dom@18.3.1/umd/react-dom.development.js`
- **Babel Standalone 7.29.0** — `unpkg.com/@babel/standalone@7.29.0/babel.min.js` (transpiles the in-browser JSX at load time)
- **Tailwind CSS (Play CDN)** — `cdn.tailwindcss.com` (utility classes)
- **Google Fonts** — Manrope + JetBrains Mono

**Rendering techniques (no library — hand-written):**
- **HTML5 Canvas 2D** — the living sky, particle systems, and the moon.
- **Procedural value-noise (fBm)** — bakes the cloud sprites and the lunar
  surface texture (real near-side maria layout, ~90 craters, Tycho/Copernicus
  ray systems). Seeded PRNG (`mulberry32`) for deterministic results.
- **CSS keyframe animations** — halos, drifts, pulses, view cross-fades.

**Data source (no API key required):**
- **Open-Meteo** — three endpoints fetched in parallel:
  - Forecast: `https://api.open-meteo.com/v1/forecast`
  - Air quality: `https://air-quality-api.open-meteo.com/v1/air-quality`
  - Marine (Caspian): `https://marine-api.open-meteo.com/v1/marine`
- Aktau coordinates hard-coded: **lat `43.65`, lon `51.16`**. Re-fetch interval:
  **10 min**.

> ⚠️ Production notes: the Tailwind Play CDN and in-browser Babel both print a
> "not for production" console warning. They work fine for the billboard, but if
> you want a leaner/faster build later, precompile the JSX and use a built
> Tailwind stylesheet. Also confirm the display's network can reach
> `open-meteo.com` over HTTPS, or live data won't load.

---

## Pushing to GitHub (for Claude Code)

From inside this `Atmosphere/` folder:

```bash
git init
git add .
git commit -m "Qalavision Atmosphere weather billboard (standalone)"
# create the repo first (either on github.com or with the GitHub CLI):
gh repo create qalavision-atmosphere-weather --public --source=. --remote=origin
git push -u origin main
```

If not using the GitHub CLI (`gh`), create an empty repo on github.com and then:

```bash
git remote add origin https://github.com/<you>/qalavision-atmosphere-weather.git
git branch -M main
git push -u origin main
```

**Suggested `.gitignore`** (nothing heavy to ignore here, but if you later add a
build step):

```
node_modules/
dist/
.DS_Store
```

Optional — publish it live for the LED wall's "Web page" media item via
**GitHub Pages**: push to `main`, then in the repo Settings → Pages, serve from
the `main` branch root. The page URL becomes the URL you paste into ViPlex/VNNOX.

---

## Note on resolution

This renders at **1920×1080 (16:9)** and auto-scales to fit. The Aktau LED wall
is **~2834×1167 (17:7 ≈ 2.43:1)** — a much wider, shorter frame — so scaling this
16:9 layout will letterbox or crop. For a true 1:1 fit, the layout should be
re-authored natively at 2834×1167 (see the main automation handoff doc).
