# Qalavision Weather Billboard — System & Automation Handoff

> Context document for continuing work in Claude Desktop. Goal: get the existing
> live weather widget running automatically on the Aktau outdoor LED wall.
> Everything below is taken from the actual project code and the hardware facts
> you provided — not assumptions.

---

## 0. TL;DR — read this first

You do **not** need an "AI bot" for this, and you probably do **not** need to
"record" the widget into video at all. The widget is already a **live, self-
updating web page** that pulls real Aktau weather every 10 minutes on its own.

There are two realistic paths:

- **Path A (recommended): show the live URL directly on the player.** Your
  NovaStar Taurus **TB50** supports a **"Web page" media type** — you give it a
  URL and it renders the live page on the wall. The widget then refreshes its own
  weather forever. **No recording, no upload, no bot, no server.** This is by far
  the simplest and best-looking option.
- **Path B (fallback): scheduled render → auto-upload.** Only if the TB50's
  built-in browser can't render the animations smoothly. A small always-on
  machine runs headless Chrome to record a short looping MP4 every 30–60 min and
  pushes it to the player. This is a **cron job + script**, not AI.

The single most important thing to verify first: **does the TB50 render the live
URL smoothly enough on the wall?** That one test decides Path A vs Path B.

There is also a **resolution/aspect-ratio problem** you must fix either way — see
§4. The current design is 16:9; your wall is not.

---

## 1. What the widget is

A live weather billboard for **Aktau, Kazakhstan** (Caspian seaboard), branded
**Qalavision Media**. It is a single self-contained web page that shows current
conditions, forecast, sea state, air quality, and an animated "living sky" that
matches the real weather and time of day. Labels rotate through **three languages
— English / Russian / Kazakh** every 5 seconds.

It is **already live and real-time** — this is the key point for automation. It
is not a static graphic that needs re-rendering; it updates itself.

### Two design directions (both in the file)
1. **Atmosphere** — one cinematic full-screen "living sky" that cycles through
   three views every 15 s: (a) hero temperature + 5 stat columns, (b) giant
   hero-only temperature, (c) "Today's Arc" — the sun/moon path with a live NOW
   bead.
2. **Mosaic** — an editorial bento-grid layout.

For the billboard you'll pick **one** (Atmosphere is the more billboard-friendly).

---

## 2. Tech stack & how it runs

- **No build step.** It's plain HTML + in-browser JSX. Open the HTML and it runs.
- **React 18.3.1** + **Babel Standalone** (transpiles the `.jsx` files in the
  browser at load time) + **Tailwind CDN** for utility classes.
- **Fonts:** Manrope + JetBrains Mono (Google Fonts).
- **Canvas 2D** for particles (rain/snow/stars/fog), the living sky, and the
  Today's-Arc animation. CSS keyframes for halos, drifts, pulses.
- Everything is **client-side**; the only external calls are the weather APIs.

### File map
| File | Role |
|---|---|
| `Qalavision Billboard Weather.html` | Entry point. Loads scripts, holds global CSS keyframes. |
| `main.jsx` | Mounts the design canvas + Tweaks panel. Holds tweak defaults (flythrough demo, weather preview). |
| `billboard-shared.jsx` | **Data layer + helpers.** Weather fetch hook, WMO code lookup, trilingual strings, all formatting/scale helpers, the particle engine, logo, background palettes. Start here. |
| `billboard-sky.jsx` | `LivingSky` — the cinematic day→night gradient sky. |
| `billboard-weather-fx.jsx` | `WeatherFX` — depth-layered rain/snow/fog/lightning/dust overlay. |
| `billboard-atmosphere.jsx` | **Variant 1.** The three rotating views + stat columns. |
| `billboard-mosaic.jsx` | **Variant 2.** Bento-grid layout. |
| `design-canvas.jsx` | Side-by-side review canvas (a design tool — **not needed on the wall**). |
| `tweaks-panel.jsx` | The review tweak controls (demo only — **not needed on the wall**). |

> For the billboard you want to render **one variant full-screen**, without the
> design canvas or tweaks chrome. See §5 for the "production page" you'll need.

---

## 3. Data source (already live, free, no key)

All weather comes from **Open-Meteo** (free, no API key, no rate limit for this
volume). Coordinates are hard-coded for Aktau:

- **Latitude `43.65`, Longitude `51.16`**

Three endpoints are fetched in parallel:
1. **Forecast** — `https://api.open-meteo.com/v1/forecast` — current temp, feels-
   like, humidity, weather code, day/night flag, wind, pressure; hourly temp +
   precip probability; 10-day daily min/max, sunrise/sunset, UV.
2. **Air quality** — `https://air-quality-api.open-meteo.com/v1/air-quality` —
   European AQI, PM10, PM2.5.
3. **Marine** — `https://marine-api.open-meteo.com/v1/marine` — wave height,
   direction, period, sea-surface temperature (Caspian).

The hook `useWeather()` in `billboard-shared.jsx` loads these on mount and then
**re-fetches every 10 minutes** (`setInterval(load, 10 * 60 * 1000)`). Weather
codes are mapped to scenes via the **WMO code table**, which drives both the text
label (trilingual) and the visual treatment (clear / cloudy / rain / snow /
thunder / fog / sleet).

**Implication for automation:** because the page refreshes its own data, a live
URL on the player needs **zero** external automation to stay current. This is the
heart of why Path A is so much simpler.

> One thing to confirm: the player/network must allow outbound HTTPS to
> `open-meteo.com`. You said the wall is always online — verify the player itself
> (not just the office) can reach those domains.

---

## 4. ⚠️ The resolution / aspect-ratio problem (must fix)

- **Physical wall:** 17 m × 7 m ≈ **119 m²**, aspect ratio **17:7 ≈ 2.43 : 1**.
- **Stated pixel canvas:** **2834 × 1167** (2834 ÷ 1167 = 2.43 — consistent ✓).
- **Pixel pitch:** ~17000 mm ÷ 2834 px ≈ **6 mm** → roughly a **P6 outdoor** wall.
- **But the widget is designed at 1920 × 1080 = 16:9 (1.78 : 1).**

16:9 content on a 2.43:1 wall will be **letterboxed, stretched, or cropped** —
none acceptable for a flagship billboard. **The design must be re-authored to the
wall's native 2834 × 1167 (a much wider, shorter frame).** This is a layout job,
not a scaling trick: the hero temperature, stat columns, and arc all need to be
re-composed for a wide-short canvas.

This is true for **both** Path A and Path B. Recommend doing this layout pass
**before** wiring up any automation. (I can build the native 2834×1167 layout for
you here — just ask.)

> Verify with whoever commissioned the wall: is **2834 × 1167** the true active
> pixel count the V1160 expects, and is the wall **one** logical screen or
> stitched from cabinets? The TB50's output canvas must match exactly.

---

## 5. The hardware pipeline (your setup)

```
[ TB50 Taurus player ]  --HDMI-->  [ V1160 video processor ]  -->  [ receiving cards ]  -->  LED cabinets (17×7 m)
   runs the content              scales/maps to the wall
   (ViPlex / VNNOX)
```

- **NovaStar Taurus TB50** — an **Android-based asynchronous multimedia player**.
  It stores and plays the content. It is managed by the **ViPlex** software family
  and/or **VNNOX Cloud**. Crucially, Taurus solutions support a **"Web page"
  media type** (a URL), alongside image/video/text/clock/weather widgets.
- **NovaStar V1160** — a 4K **video processor / controller** (splicing + scaling).
  It takes the TB50's output and maps it to the physical wall. Content choices
  live on the TB50, not here.
- **ViPlex ecosystem:**
  - **ViPlex Express** (Windows, same LAN) — create "solutions" (playlists),
    schedule, publish to players on the network.
  - **ViPlex Handy** (mobile) — same idea over Wi-Fi/Bluetooth.
  - **VNNOX Cloud** (AsyncPlay / Player) — manage players **remotely over the
    internet**, publish solutions, schedule. Since your wall is always online,
    this is the natural remote-control plane.

---

## 6. Recommended automation architecture

### ✅ Path A — Live URL as a "Web page" media item (do this first)

1. Make a **production page** (one full-screen variant, no design canvas, no
   tweak panel — see §7) authored at **2834 × 1167** (§4).
2. **Host it** on any always-on HTTPS host (Netlify/Vercel/Cloudflare Pages/your
   own server). Because it's static + client-side, hosting is trivial and free.
3. In **ViPlex Express** or **VNNOX**, create a solution and add a **Web page /
   URL** media item pointing at that hosted URL, sized to the full canvas.
4. **Publish to the TB50.** The page renders on the wall and **refreshes its own
   weather every 10 min**. Done — nothing else to build.

**Why this is best:** truly live (clock ticks, sky tracks real sunrise/sunset,
conditions update), zero moving parts, no server to maintain, no "bot," no stale
clips. The automation you imagined is replaced by "the page updates itself."

**The one risk:** the Taurus on-board browser may render heavy Canvas/CSS
animation at a low frame rate. **Test this on the actual wall before committing.**
If it stutters, either (a) simplify the animations for the on-device build, or
(b) fall back to Path B.

### 🔁 Path B — Scheduled render → auto-upload (fallback only)

Use only if Path A's on-device rendering is too slow or "Web page" media isn't
viable.

1. **One always-on machine** — cheapest reliable option is a **small cloud VM**
   (e.g. a $5–10/mo Linux box) since the wall is internet-connected. A site PC
   that's always on works too, but a VM won't depend on local uptime.
2. **Render job** (Node + **Playwright/Puppeteer** headless Chromium):
   - Load the production page at **2834 × 1167**.
   - Let it fetch live data and settle.
   - Capture a **seamless 20–40 s loop** with **ffmpeg** (or a frame sequence →
     H.264 MP4). Match the wall's frame rate (typically 25–30 fps).
3. **Trigger cadence:** every **30–60 min** (you said that's fine) — not
   continuous. A simple `cron` entry. Optionally only re-render when the weather
   code or temperature actually changed, to avoid identical clips.
4. **Upload to the TB50:** publish the MP4 into the playing solution via **VNNOX
   Cloud** (remote) or **ViPlex Express** on the LAN. Investigate whether your
   VNNOX tier exposes an **API / OpenAPI** for programmatic publish; if not, a
   watched **hot-folder / scheduled re-publish** is the pragmatic route.

**Where (and whether) "AI" fits:** essentially nowhere in the core loop — it's
deterministic rendering + file upload. The only genuinely useful "smart" add-ons,
if you want them later:
- An LLM step that writes a short **trilingual human caption** for unusual
  conditions (dust storm, Caspian gale, freezing rain) layered onto the clip.
- A **watchdog** that screenshots the wall feed / player status and alerts you
  (Telegram/email) if the display goes blank or data goes stale.
Both are optional polish, not the mechanism.

### Recommendation
Pursue **Path A**. Spend your first effort on (1) the native 2834×1167 layout and
(2) a 10-minute test of "Web page" media on the TB50. If that test looks good on
the wall, you're essentially finished and you never build a bot. Keep Path B in
your back pocket only for the rendering-performance failure case.

---

## 7. The "production page" you still need to create

The current HTML loads a **design/review** environment (side-by-side canvas +
tweak panel). For the wall you want a stripped page that:

- Renders **one variant full-screen** (recommend **Atmosphere**) — mount
  `VariantAtmosphere` directly into a full-viewport root, **without**
  `DesignCanvas` or `TweaksPanel`.
- Is sized to **2834 × 1167** (or uses the fixed-canvas + scale pattern so it
  fills the wall exactly with no letterboxing).
- Drops `flythrough`/`previewWeather` (those are review-only overrides) and runs
  pure **live** mode.
- Self-hosts its fonts/scripts if the player's network is restrictive (optional —
  bundling to a single offline file avoids CDN dependency on the player).

This is a small, well-scoped task. I can produce this production page **and** the
native-resolution layout in this project whenever you're ready — just say the
word and tell me Atmosphere vs Mosaic.

---

## 8. Open questions to resolve (carry these into Claude Desktop)

1. **Does the TB50 render the live URL smoothly on the wall?** (Decides A vs B.)
2. Is **2834 × 1167** the true active pixel count, and is the wall one logical
   screen or stitched cabinets? (Decides the exact canvas size.)
3. Can the **player itself** reach `open-meteo.com` over HTTPS? (Required for live
   mode; a captive/whitelisted player network would block it.)
4. Which control plane will you standardize on — **VNNOX Cloud** (remote) or
   **ViPlex Express** (LAN)? Does your VNNOX tier expose an **API** for
   programmatic publishing? (Only matters for Path B.)
5. Wall **frame rate** and brightness/color expectations from the integrator
   (affects video encode settings in Path B and animation tuning in Path A).

---

## 9. Quick reference — key constants

- **City:** Aktau, Kazakhstan · Caspian seaboard
- **Coordinates:** 43.65 °N, 51.16 °E
- **Data:** Open-Meteo (forecast + air-quality + marine), no API key, self-
  refresh every 10 min
- **Languages:** EN / RU / KZ, rotating every 5 s
- **Design canvas today:** 1920 × 1080 (16:9) — **must become 2834 × 1167 (2.43:1)**
- **Wall:** 17 × 7 m ≈ 119 m², ~P6 outdoor (~6 mm pitch)
- **Player:** NovaStar Taurus **TB50** (Android async, ViPlex/VNNOX, supports
  Web-page media)
- **Processor:** NovaStar **V1160** (4K splicer/scaler)
- **Refresh cadence acceptable:** 30–60 min (only relevant to Path B)
