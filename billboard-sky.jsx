// ============================================================================
// LivingSky — a cinematic, depth-layered painted sky on <canvas>.
//
// One renderer drives BOTH modes:
//   • LIVE      — sky state derived from the real clock + sunrise/sunset.
//   • FLYTHROUGH — an internal phase sweeps dawn→noon→golden→dusk→night→dawn
//                  so a viewer sees the billboard's full emotional range.
//
// Layers (back→front): sky gradient · stars · god-rays · sun/moon disc · 3
// parallax cloud bands · Caspian horizon + sun-glitter sea · temperature grade
// · readability scrim. Everything morphs continuously off a single time value.
// ============================================================================

// ---------- color helpers ----------
function _hex(h) {
  h = h.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function _mix(a, b, t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function _rgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function _smooth(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ---------- astronomy: real lunar phase ----------
// Returns 0..1 synodic phase: 0/1 = new, 0.25 = first quarter, 0.5 = full,
// 0.75 = last quarter. Anchored to a known new moon (2000-01-06 18:14 UTC).
const _SYNODIC = 29.530588853;
function _moonPhase(date) {
  const ref = Date.UTC(2000, 0, 6, 18, 14, 0);
  const days = ((date ? date.getTime() : Date.now()) - ref) / 86400000;
  let p = (days % _SYNODIC) / _SYNODIC;
  if (p < 0) p += 1;
  return p;
}

// Paint the unlit portion of the moon for a given phase, clipped to the disc.
// The boundary is the dark limb (a semicircle) joined to the terminator
// (a half-ellipse whose minor radius tracks cos of the phase angle). A faint
// earthshine tint keeps the shadowed disc from reading as a flat hole.
function _drawMoonShadow(ctx, cx, cy, r, phase, earthCol) {
  const phi = phase * 2 * Math.PI;
  const cosPhi = Math.cos(phi);
  const rx = r * Math.abs(cosPhi);
  const waxing = phase < 0.5;            // lit on the right while waxing
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.clip();
  ctx.beginPath();
  if (waxing) ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, true);   // dark limb = left
  else        ctx.arc(cx, cy, r, -Math.PI / 2, Math.PI / 2, false);  // dark limb = right
  const anti = waxing ? cosPhi > 0 : cosPhi < 0;
  ctx.ellipse(cx, cy, rx, r, 0, Math.PI / 2, -Math.PI / 2, anti);
  ctx.closePath();
  // earthshine: nearly-opaque shadow with a whisper of reflected light
  const sh = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  sh.addColorStop(0, _rgba(earthCol, 0.80));
  sh.addColorStop(1, _rgba([6, 9, 18], 0.94));
  ctx.fillStyle = sh;
  ctx.fill();
  ctx.restore();
}

// Palette anchors
const SKY = {
  nightZen: _hex("#04050c"), nightMid: _hex("#070d1e"), nightHor: _hex("#0e1830"),
  dayZen:   _hex("#1559a8"), dayMid:   _hex("#3f86d4"), dayHor:   _hex("#a9cfee"),
  warmHor:  _hex("#ff8338"), warmMid:  _hex("#ff7a66"), warmZen:  _hex("#4a3168"),
};

// Map a normalized time-of-day t∈[0,1) → full sky description.
// t: 0=solar midnight, 0.25=sunrise, 0.5=noon, 0.75=sunset.
function skyFromT(t) {
  const alt = Math.sin(2 * Math.PI * (t - 0.25));          // -1..1 sun altitude
  const light = _smooth(_clamp(alt * 1.25 + 0.2, 0, 1));   // daylight amount
  const warmth = Math.exp(-Math.pow(alt / 0.24, 2));        // golden-hour glow
  const stars = _clamp(-alt * 1.5 + 0.05, 0, 1);

  let zen = _mix(SKY.nightZen, SKY.dayZen, light);
  let mid = _mix(SKY.nightMid, SKY.dayMid, light);
  let hor = _mix(SKY.nightHor, SKY.dayHor, light);
  zen = _mix(zen, SKY.warmZen, warmth * 0.5);
  mid = _mix(mid, SKY.warmMid, warmth * 0.45);
  hor = _mix(hor, SKY.warmHor, warmth * 0.85);

  const horizonY = 0.6;
  const sunArcX = 0.12 + _clamp((t - 0.2) / 0.6, 0, 1) * 0.76;
  const sunY = horizonY - alt * (horizonY - 0.08);

  // Luminary: sun by day, moon by night, cross-fading on `light`.
  const isMoon = light < 0.32;
  const moonAlt = Math.sin(2 * Math.PI * ((t + 0.5) - 0.25)); // opposite arc
  const moonX = 0.88 - sunArcX;
  const moonY = horizonY - moonAlt * (horizonY - 0.1);

  const sunCol = _mix([255, 240, 196], [255, 116, 52], warmth);
  const moonCol = [228, 232, 244];

  return {
    alt, light, warmth, stars, horizonY,
    zen, mid, hor,
    lumX: isMoon ? moonX : sunArcX,
    lumY: isMoon ? moonY : sunY,
    lumVisible: (isMoon ? moonY : sunY) < horizonY - 0.01,
    lumCol: isMoon ? moonCol : sunCol,
    lumR: isMoon ? 0.032 : 0.05,
    isMoon,
    rayStrength: _clamp(light * (1 - warmth * 0.3), 0, 1) * (alt > 0.02 ? 1 : 0),
  };
}

// Live: convert real clock + sun events → the same t the renderer expects.
function liveT({ now, sunProgress, isDay, sunriseISO, sunsetISO }) {
  if (isDay) return 0.25 + _clamp(sunProgress, 0, 1) * 0.5;
  const t = now.getTime();
  const sunset = sunsetISO ? new Date(sunsetISO).getTime() : null;
  const sunrise = sunriseISO ? new Date(sunriseISO).getTime() : null;
  const TW = 2 * 3600 * 1000; // 2h twilight ramp
  if (sunset != null && t >= sunset) {
    const f = _clamp((t - sunset) / TW, 0, 1);
    return 0.75 + f * 0.22;
  }
  if (sunrise != null && t < sunrise) {
    const f = _clamp((sunrise - t) / TW, 0, 1);
    return (0.25 - f * 0.22 + 1) % 1;
  }
  return 0.97; // deep night fallback
}

// Cloudiness 0..1 per scene
function sceneCloudiness(scene) {
  if (scene === "rain" || scene === "thunder") return 0.95;
  if (scene === "sleet") return 0.9;
  if (scene === "fog") return 0.9;
  if (scene === "snow") return 0.82;
  if (scene === "cloudy") return 0.76;
  if (scene === "dust") return 0.42;
  if (scene === "wind") return 0.34;
  if (scene === "heat") return 0.05;
  return 0.14; // clear
}

// Deterministic cloud field: bands of soft puff-clusters with flat bottoms
// and billowing tops (real clouds), not floating orbs.
function buildClouds() {
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const layers = [];
  const cfg = [
    { n: 8, y: [0.10, 0.24], w: [0.24, 0.40], speed: 0.0050, alpha: 0.40 }, // far/high cirrus-ish
    { n: 8, y: [0.22, 0.38], w: [0.32, 0.52], speed: 0.010, alpha: 0.64 },  // mid
    { n: 6, y: [0.34, 0.50], w: [0.42, 0.66], speed: 0.019, alpha: 0.84 },  // near/low
  ];
  for (const c of cfg) {
    const clouds = [];
    for (let i = 0; i < c.n; i++) {
      const cx = (i + 0.5 + (rnd() - 0.5) * 0.8) / c.n;   // spread evenly across the sky
      const cy = c.y[0] + rnd() * (c.y[1] - c.y[0]);
      const cw = c.w[0] + rnd() * (c.w[1] - c.w[0]);     // cluster width (frac of W)
      const ch = cw * (0.34 + rnd() * 0.16);              // billowing height
      const thr = rnd();   // coverage threshold: this cloud appears once cloudiness exceeds it
      const puffs = [];
      const np = 6 + ((rnd() * 5) | 0);
      for (let p = 0; p < np; p++) {
        const fx = (p / (np - 1)) - 0.5 + (rnd() - 0.5) * 0.12; // along width
        // tops billow up toward the centre (bell-ish), bottoms sit on baseline
        const bell = Math.cos(fx * Math.PI) * 0.5 + 0.5;
        const rr = (0.32 + bell * 0.68) * (0.8 + rnd() * 0.4);  // radius factor
        puffs.push({ fx, lift: bell, rr });
      }
      clouds.push({ cx, cy, cw, ch, puffs, phase: rnd() * 6.28, thr });
    }
    layers.push({ clouds, speed: c.speed, alpha: c.alpha });
  }
  return layers;
}

// Frame cap and pixel-density cap for the sky canvas. The TB50 gains nothing
// from 60fps on a scene that changes over minutes, and nothing from rendering
// above 1 device pixel per CSS pixel — both just burn fill rate the player does
// not have. Override with window.QV_FPS / window.QV_DPR_CAP before this loads.
const SKY_FPS = window.QV_FPS || 30;
const SKY_DPR_CAP = window.QV_DPR_CAP || 1;

function LivingSky({
  scene = "clear", isDay = true, sunProgress = 0.5,
  sunriseISO, sunsetISO, now, tempC = 20,
  windDir = 0, windSpeed = 0,
  flythrough = false, flySpeed = 1,
}) {
  const ref = React.useRef(null);
  const clouds = React.useMemo(buildClouds, []);
  // Mutable state shared with the rAF loop (so prop changes don't restart it).
  const S = React.useRef({
    cur: null, phase: 0.3, tPrev: 0,
    scene, isDay, sunProgress, sunriseISO, sunsetISO, now, tempC, windDir, windSpeed, flythrough, flySpeed,
  });
  Object.assign(S.current, { scene, isDay, sunProgress, sunriseISO, sunsetISO, now, tempC, windDir, windSpeed, flythrough, flySpeed });

  React.useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext("2d");
    let raf, W = 0, H = 0, dpr = 1;
    // Baked once per resize rather than rebuilt every frame (see draw()).
    let scrimL = null, scrimB = null, scrimT = null;
    let glitterSprite = null, glitterKey = "";

    function resize() {
      dpr = Math.min(SKY_DPR_CAP, window.devicePixelRatio || 1);
      W = cnv.offsetWidth; H = cnv.offsetHeight;
      cnv.width = W * dpr; cnv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The readability scrims are fixed geometry in fixed colours — they only
      // depend on W/H, so there is no reason to re-create them 30 times a second.
      scrimL = ctx.createLinearGradient(0, 0, W * 0.62, 0);
      scrimL.addColorStop(0, "rgba(0,0,0,0.34)");
      scrimL.addColorStop(1, "rgba(0,0,0,0)");
      scrimB = ctx.createLinearGradient(0, H * 0.62, 0, H);
      scrimB.addColorStop(0, "rgba(0,0,0,0)");
      scrimB.addColorStop(1, "rgba(0,0,0,0.4)");
      scrimT = ctx.createLinearGradient(0, 0, 0, 150);
      scrimT.addColorStop(0, "rgba(0,0,0,0.28)");
      scrimT.addColorStop(1, "rgba(0,0,0,0)");
      glitterKey = "";   // sprite is sized in CSS px; force a rebake
    }
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cnv);

    function targetT(now) {
      const s = S.current;
      if (s.flythrough) {
        // ~26s loop at speed 1 (start just before dawn for a satisfying open)
        const LOOP = 26000 / Math.max(0.25, s.flySpeed);
        return ((now / LOOP) + 0.16) % 1;
      }
      return liveT(s);
    }

    function draw(ms) {
      const s = S.current;
      const tt = targetT(ms);
      // Smoothly approach target t (handle 0/1 wrap by shortest path)
      let cur = s.phase;
      let d = tt - cur;
      if (d > 0.5) d -= 1; else if (d < -0.5) d += 1;
      // Flythrough advances continuously; live eases.
      const k = s.flythrough ? 1 : 0.04;
      cur = (cur + d * k + 1) % 1;
      s.phase = cur;

      const sky = skyFromT(cur);
      const cloudiness = s.flythrough ? 0.36 : sceneCloudiness(s.scene);
      // How much the cloud deck veils the sun/moon: clear = full disc, overcast /
      // rain = the luminary is swallowed and the light goes flat & diffuse.
      const lumDim = 1 - _clamp((cloudiness - 0.34) / 0.5, 0, 1);
      const horizon = sky.horizonY * H;

      // Real lunar phase + illuminated fraction (drives the disc & sea shimmer).
      const moonPhaseVal = _moonPhase(s.now);
      const moonIllum = 0.5 * (1 - Math.cos(2 * Math.PI * moonPhaseVal));

      ctx.clearRect(0, 0, W, H);

      // 1 — SKY GRADIENT
      const g = ctx.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, _rgba(sky.zen, 1));
      g.addColorStop(0.55, _rgba(sky.mid, 1));
      g.addColorStop(1, _rgba(sky.hor, 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, horizon + 2);

      // 2 — NIGHT SKY: Milky Way band, varied stars, occasional meteor
      if (sky.stars > 0.02) {
        // 2a — faint Milky Way: a soft diagonal river of light + dust
        if (sky.stars > 0.12 && cloudiness < 0.55) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.translate(W * 0.62, horizon * 0.34);
          ctx.rotate(-0.62);
          const bandL = Math.hypot(W, H) * 0.9;
          const bandW = horizon * 0.5;
          ctx.scale(1, bandW / bandL);
          const mw = ctx.createRadialGradient(0, 0, 0, 0, 0, bandL / 2);
          const mwA = sky.stars * 0.10;
          mw.addColorStop(0, _rgba([150, 165, 215], mwA));
          mw.addColorStop(0.5, _rgba([120, 135, 195], mwA * 0.55));
          mw.addColorStop(1, _rgba([90, 100, 160], 0));
          ctx.fillStyle = mw;
          ctx.beginPath(); ctx.arc(0, 0, bandL / 2, 0, 6.283); ctx.fill();
          // dust grains hugging the band
          for (let i = 0; i < 80; i++) {
            const u = (((i * 83.7) % 100) / 100 - 0.5) * bandL;
            const v = (((i * 49.3) % 100) / 100 - 0.5) * bandL * 0.5;
            const a = sky.stars * 0.5 * (((i * 17) % 10) / 10) * (1 - Math.abs(u) / (bandL / 2));
            if (a <= 0.02) continue;
            ctx.fillStyle = _rgba([220, 226, 245], a);
            ctx.fillRect(u, v, 1.3, 1.3);
          }
          ctx.restore();
        }

        // 2b — stars with size, brightness and colour-temperature variation
        for (let i = 0; i < 110; i++) {
          const sx = ((i * 73.13) % 100) / 100 * W;
          const sy = ((i * 977.31 % 100) / 100) * horizon * 0.94;
          const tw = 0.5 + 0.5 * Math.sin(ms / 700 + i * 1.7);
          const big = ((i * 31) % 10) / 10;
          const r = big < 0.06 ? 2.1 : big < 0.22 ? 1.4 : 0.85;
          // hue jitter: most white, a few warm (amber) or cool (blue)
          const hk = (i * 53) % 10;
          const col = hk < 2 ? [255, 226, 196] : hk < 4 ? [206, 222, 255] : [255, 250, 238];
          ctx.fillStyle = _rgba(col, sky.stars * (0.32 + 0.55 * tw));
          ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.283); ctx.fill();
          // brightest stars get a tiny cross-glint
          if (big < 0.06) {
            ctx.strokeStyle = _rgba(col, sky.stars * 0.4 * tw);
            ctx.lineWidth = 0.7;
            ctx.beginPath();
            ctx.moveTo(sx - r * 3, sy); ctx.lineTo(sx + r * 3, sy);
            ctx.moveTo(sx, sy - r * 3); ctx.lineTo(sx, sy + r * 3);
            ctx.stroke();
          }
        }

        // 2c — occasional shooting star (deterministic per ~8s epoch)
        if (sky.stars > 0.4 && cloudiness < 0.5) {
          const PERIOD = 8200;
          const epoch = Math.floor(ms / PERIOD);
          const local = (ms % PERIOD) / PERIOD; // 0..1
          const seed = Math.abs(Math.sin(epoch * 127.13) * 43758.5453);
          const fire = (seed % 1) > 0.45;       // skip some epochs
          if (fire && local < 0.16) {
            const f = local / 0.16;              // 0..1 across the streak
            const a = Math.sin(f * Math.PI) * sky.stars;
            const ox = (((seed * 13) % 1) * 0.6 + 0.15) * W;
            const oy = (((seed * 29) % 1) * 0.4 + 0.05) * horizon;
            const ang = 0.5 + ((seed * 7) % 1) * 0.5; // down-right
            const len = 150 + ((seed * 5) % 1) * 120;
            const hx = ox + Math.cos(ang) * f * (W * 0.4);
            const hy = oy + Math.sin(ang) * f * (W * 0.4);
            const tx = hx - Math.cos(ang) * len;
            const ty = hy - Math.sin(ang) * len;
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            const tg = ctx.createLinearGradient(tx, ty, hx, hy);
            tg.addColorStop(0, _rgba([255, 252, 240], 0));
            tg.addColorStop(1, _rgba([255, 252, 240], a));
            ctx.strokeStyle = tg;
            ctx.lineWidth = 2;
            ctx.lineCap = "round";
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(hx, hy); ctx.stroke();
            ctx.fillStyle = _rgba([255, 255, 250], a);
            ctx.beginPath(); ctx.arc(hx, hy, 2.2, 0, 6.283); ctx.fill();
            ctx.restore();
          }
        }
      }

      const lumX = sky.lumX * W, lumY = sky.lumY * H, lumR = sky.lumR * H;

      // 3 — GOD-RAYS (clear-ish skies, sun above horizon)
      if (sky.rayStrength > 0.05 && cloudiness < 0.6 && sky.lumVisible) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(lumX, lumY);
        const rot = ms / 26000;
        const rays = 11, reach = Math.hypot(W, H);
        for (let i = 0; i < rays; i++) {
          const a = rot + (i / rays) * Math.PI * 2;
          const spread = 0.045 + 0.02 * Math.sin(ms / 1500 + i);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a - spread) * reach, Math.sin(a - spread) * reach);
          ctx.lineTo(Math.cos(a + spread) * reach, Math.sin(a + spread) * reach);
          ctx.closePath();
          const rg = ctx.createRadialGradient(0, 0, 0, 0, 0, reach);
          const ra = sky.rayStrength * (0.05 + 0.03 * Math.sin(ms / 1200 + i * 2));
          rg.addColorStop(0, _rgba(sky.lumCol, ra));
          rg.addColorStop(0.5, _rgba(sky.lumCol, ra * 0.25));
          rg.addColorStop(1, _rgba(sky.lumCol, 0));
          ctx.fillStyle = rg;
          ctx.fill();
        }
        ctx.restore();
      }

      // 4 — LUMINARY (sun/moon) with bloom
      if (sky.lumVisible && lumDim > 0.02) {
        // Moon light scales with its illuminated fraction; the sun is constant.
        // Both fade behind a thickening cloud deck (lumDim).
        const lumLight = (sky.isMoon ? (0.18 + 0.62 * moonIllum) : 1) * lumDim;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const bloom = ctx.createRadialGradient(lumX, lumY, 0, lumX, lumY, lumR * 7);
        bloom.addColorStop(0, _rgba(sky.lumCol, (sky.isMoon ? 0.5 : 0.85) * (sky.isMoon ? lumLight : lumDim)));
        bloom.addColorStop(0.18, _rgba(sky.lumCol, (sky.isMoon ? 0.22 : 0.4) * (sky.isMoon ? lumLight : lumDim)));
        bloom.addColorStop(1, _rgba(sky.lumCol, 0));
        ctx.fillStyle = bloom;
        ctx.fillRect(lumX - lumR * 8, lumY - lumR * 8, lumR * 16, lumR * 16);
        ctx.restore();
        // disc (also fades out under heavy cloud)
        const disc = ctx.createRadialGradient(lumX, lumY, 0, lumX, lumY, lumR);
        disc.addColorStop(0, _rgba(_mix(sky.lumCol, [255, 255, 255], 0.6), lumDim));
        disc.addColorStop(1, _rgba(sky.lumCol, 0.9 * lumDim));
        ctx.fillStyle = disc;
        ctx.beginPath(); ctx.arc(lumX, lumY, lumR, 0, 6.283); ctx.fill();
        if (sky.isMoon) {
          // maria: soft grey patches across the full disc (the shadow will mask
          // whatever falls on the unlit side, so they only show where it's lit)
          ctx.fillStyle = _rgba([176, 184, 206], 0.40);
          ctx.beginPath(); ctx.arc(lumX + lumR * 0.30, lumY - lumR * 0.20, lumR * 0.24, 0, 6.283); ctx.fill();
          ctx.beginPath(); ctx.arc(lumX - lumR * 0.22, lumY + lumR * 0.28, lumR * 0.16, 0, 6.283); ctx.fill();
          ctx.fillStyle = _rgba([176, 184, 206], 0.28);
          ctx.beginPath(); ctx.arc(lumX + lumR * 0.04, lumY + lumR * 0.05, lumR * 0.12, 0, 6.283); ctx.fill();
          // real phase: carve the unlit portion with a soft terminator + earthshine
          _drawMoonShadow(ctx, lumX, lumY, lumR, moonPhaseVal, [54, 62, 92]);
        }
      }

      // 5 — PARALLAX CLOUD BANDS (soft masses: flat base, billowing tops)
      const coverage = _clamp(cloudiness, 0, 1);
      // Overcast sheet: a flat sky wash that grows once coverage passes ~46%,
      // so cloudy / overcast / storm skies read as genuinely covered (grey by
      // day, heavy slate by night) instead of a few stray puffs.
      if (coverage > 0.46) {
        const ov = (coverage - 0.46) / 0.54;
        const sheetCol = _mix([156, 166, 184], [34, 42, 60], 1 - sky.light);
        const og = ctx.createLinearGradient(0, 0, 0, horizon);
        og.addColorStop(0, _rgba(sheetCol, 0.08 + ov * 0.44));
        og.addColorStop(1, _rgba(_mix(sheetCol, [96, 106, 126], 0.4), 0.05 + ov * 0.30));
        ctx.fillStyle = og; ctx.fillRect(0, 0, W, horizon + 2);
      }
      // Night clouds keep a grey floor so they read as moonlit masses, not voids.
      const cloudLit = _mix(_mix([92, 100, 118], [250, 252, 255], sky.light), SKY.warmHor, sky.warmth * 0.4);
      const cloudTop = _mix(cloudLit, [255, 255, 255], 0.34);   // sunlit crowns
      const cloudShad = _mix(cloudLit, [22, 26, 40], 0.58);     // shaded undersides
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      clouds.forEach((layer) => {
        const drift = (ms / 1000) * layer.speed;
        layer.clouds.forEach((cl) => {
          // Coverage gates how many clouds show: clear sky = a couple of puffs,
          // overcast = nearly all of them, each fading in around its threshold.
          if (cl.thr > coverage * 1.12) return;
          const fade = _clamp((coverage * 1.12 - cl.thr) / 0.2, 0, 1);
          const la = layer.alpha * (0.62 + coverage * 0.5) * fade;
          let x = (((cl.cx + drift) % 1.35) + 1.35) % 1.35 - 0.175;
          const cx = x * W;
          const cy = cl.cy * H + Math.sin(ms / 5000 + cl.phase) * 3;
          const cw = cl.cw * W, ch = cl.ch * H;
          const baseY = cy + ch * 0.5;
          // soft underside shadow (gives the flat-bottom, 3D read)
          const shg = ctx.createRadialGradient(cx, baseY, 0, cx, baseY, cw * 0.58);
          shg.addColorStop(0, _rgba(cloudShad, _clamp(la * 0.7, 0, 0.7)));
          shg.addColorStop(1, _rgba(cloudShad, 0));
          ctx.fillStyle = shg;
          ctx.save(); ctx.translate(cx, baseY); ctx.scale(1, 0.32);
          ctx.beginPath(); ctx.arc(0, 0, cw * 0.58, 0, 6.283); ctx.fill(); ctx.restore();
          // billowing puffs: solid body with feathered rim + sunlit top, so the
          // cloud reads as a defined mass instead of a faint smudge.
          cl.puffs.forEach((p) => {
            const pr = (cw * 0.19) * p.rr;
            const px = cx + p.fx * cw;
            const py = baseY - pr * 0.5 - p.lift * ch * 0.7;
            const pa = _clamp(la * 1.3, 0, 0.96);
            const pg = ctx.createRadialGradient(px, py - pr * 0.3, pr * 0.1, px, py + pr * 0.2, pr);
            pg.addColorStop(0, _rgba(cloudTop, pa));
            pg.addColorStop(0.45, _rgba(cloudLit, pa));
            pg.addColorStop(0.8, _rgba(cloudLit, pa * 0.9));
            pg.addColorStop(1, _rgba(cloudLit, 0));
            ctx.fillStyle = pg;
            ctx.save(); ctx.translate(px, py); ctx.scale(1, 0.82);
            ctx.beginPath(); ctx.arc(0, 0, pr, 0, 6.283); ctx.fill(); ctx.restore();
          });
        });
      });
      ctx.restore();

      // 6 — CASPIAN SEA + sun glitter
      const seaTop = _mix(sky.hor, [6, 12, 22], 0.35);
      const seaBot = _mix(sky.hor, [2, 5, 11], 0.86);
      const sg = ctx.createLinearGradient(0, horizon, 0, H);
      sg.addColorStop(0, _rgba(seaTop, 1));
      sg.addColorStop(1, _rgba(seaBot, 1));
      ctx.fillStyle = sg; ctx.fillRect(0, horizon, W, H - horizon);
      // horizon seam glow (dampened under cloud so overcast skies stay flat)
      const seam = ctx.createLinearGradient(0, horizon - 6, 0, horizon + 18);
      seam.addColorStop(0, _rgba(_mix(sky.hor, [255, 255, 255], sky.warmth * 0.5), 0));
      seam.addColorStop(0.4, _rgba(_mix(sky.hor, [255, 245, 220], 0.4 + sky.warmth * 0.4), 0.55 * (0.4 + sky.light) * (0.32 + 0.68 * lumDim)));
      seam.addColorStop(1, _rgba(seaTop, 0));
      ctx.fillStyle = seam; ctx.fillRect(0, horizon - 6, W, 24);
      // glitter path beneath luminary — smooth, soft-edged light streaks.
      // Every value is driven by continuous sines (no per-frame Math.random),
      // so the shimmer glides instead of stuttering.
      if (sky.lumVisible && sky.lumY < sky.horizonY) {
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        const rows = 40;
        const baseCol = _mix(sky.lumCol, [255, 255, 255], 0.3);
        const t = ms / 1000;
        // Every row wants the same feathered streak at a different width, alpha
        // and offset — so bake it once at full alpha and stretch the bitmap per
        // row, varying alpha with globalAlpha. Rebuilt only when the luminary
        // colour shifts, which is minutes apart, not frames.
        const glKey = `${baseCol[0] | 0},${baseCol[1] | 0},${baseCol[2] | 0}`;
        if (glKey !== glitterKey || !glitterSprite) {
          glitterKey = glKey;
          const GW = 128;
          const gc = document.createElement("canvas");
          gc.width = GW; gc.height = 1;
          const gg = gc.getContext("2d");
          const lg = gg.createLinearGradient(0, 0, GW, 0);
          lg.addColorStop(0, _rgba(baseCol, 0));
          lg.addColorStop(0.5, _rgba(baseCol, 1));
          lg.addColorStop(1, _rgba(baseCol, 0));
          gg.fillStyle = lg; gg.fillRect(0, 0, GW, 1);
          glitterSprite = gc;
        }
        for (let i = 0; i < rows; i++) {
          const f = i / rows;
          const y = horizon + f * (H - horizon);
          const spread = (lumR * 1.4) * (1 + f * 7);
          // stable per-row phase offsets (deterministic, not random)
          const ph1 = i * 0.7, ph2 = i * 1.37, ph3 = i * 2.11;
          const wob = Math.sin(t * 0.6 + ph1) * spread * 0.35;
          // width breathes smoothly between ~55%–100% of spread
          const segW = spread * (0.78 + 0.22 * Math.sin(t * 0.9 + ph2));
          const a = (1 - f) * 0.42 * (sky.isMoon ? (0.18 + 0.5 * moonIllum) : 1) * (0.4 + sky.light * 0.6) * lumDim *
                    (0.62 + 0.38 * Math.sin(t * 1.3 + ph3));
          if (a <= 0.005) continue;
          const cxg = lumX + wob;
          const h = 1.5 + f * 3.5;
          // feathered horizontal streak (transparent → bright → transparent)
          ctx.globalAlpha = _clamp(a, 0, 1);
          ctx.drawImage(glitterSprite, cxg - segW / 2, y, segW, h);
        }
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      // 7 — TEMPERATURE COLOR GRADE (subtle warm/cool wash)
      const tNorm = _clamp((s.tempC - 12) / 24, -1, 1); // 12°→0, 36°→1, 0°→-0.5
      const gradeAmt = Math.min(0.14, Math.abs(tNorm) * 0.16);
      if (gradeAmt > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = "overlay";
        ctx.fillStyle = tNorm > 0
          ? _rgba([255, 150, 60], gradeAmt)
          : _rgba([90, 150, 235], gradeAmt);
        ctx.fillRect(0, 0, W, H);
        ctx.restore();
      }

      // 8 — READABILITY SCRIM (left column + bottom strip where text lives)
      // Gradients baked in resize() — these never change between resizes.
      ctx.fillStyle = scrimL; ctx.fillRect(0, 0, W * 0.62, H);
      ctx.fillStyle = scrimB; ctx.fillRect(0, H * 0.62, W, H * 0.38);
      ctx.fillStyle = scrimT; ctx.fillRect(0, 0, W, 150);
    }
    // draw() no longer schedules itself; loop() owns the rAF chain so it can skip
    // frames without the throttle ever being able to stall the loop.
    const SKY_FRAME_MS = 1000 / SKY_FPS;
    let lastDraw = -1e9;
    function loop(ms) {
      raf = requestAnimationFrame(loop);
      if (ms - lastDraw < SKY_FRAME_MS - 1) return;   // throttle to SKY_FPS
      lastDraw = ms;
      draw(ms);
    }
    // Paint one frame synchronously so the canvas is never blank even while the
    // tab/iframe is hidden (requestAnimationFrame is paused when not visible).
    // The rAF chain then animates whenever the page is visible.
    draw(performance.now());
    raf = requestAnimationFrame(loop);
    const onVis = () => { if (!document.hidden) draw(performance.now()); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, [clouds]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

window.LivingSky = LivingSky;
