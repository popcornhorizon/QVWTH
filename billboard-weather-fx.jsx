// ============================================================================
// WeatherFX — cinematic, depth-layered precipitation & atmosphere for the
// Atmosphere variant. Sits ON TOP of the LivingSky canvas and renders the
// weather the sky can't: rain, snow, fog banks, forked lightning, and Aktau's
// signature wind-driven dust. Everything is depth-parallaxed, wind-sheared
// from the real wind vector, and scaled by an `intensity` 0..1.
//
// One <canvas> + one rAF loop, throttled to QV_FPS. Prop changes mutate a state
// ref (S) so the loop never restarts. Horizon (the Caspian sea line) is at 0.6·H
// to match LivingSky, so rain ripples and sea-mist land exactly on the water.
//
// PERF CONTRACT (the LED player is a weak Android SoC — respect this):
//   - Nothing allocates a gradient inside the frame loop. Every gradient is
//     baked once into an offscreen sprite and blitted with drawImage().
//   - Particle radii/lengths are quantised into buckets at build() time so a
//     handful of sprites cover hundreds of particles.
//   - No ctx.shadowBlur anywhere — lightning glow is layered strokes instead.
// ============================================================================
const { useRef: wxUseRef, useEffect: wxUseEffect } = React;

// Frame budget + resolution cap. The billboard is viewed from tens of metres;
// dpr 1 is indistinguishable there and costs a quarter of the fill rate of 2.
const WX_FPS = window.QV_FPS || 30;
const WX_DPR_CAP = window.QV_DPR_CAP || 1;

// ---- local color helpers (prefixed to avoid cross-script collisions) ----
function wxRgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function wxMix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function wxClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wxRand(a, b) { return a + Math.random() * (b - a); }
function wxQuant(v, step) { return Math.max(step, Math.round(v / step) * step); }

// weather_code → intensity 0..1 (drizzle ≠ downpour, flurry ≠ blizzard)
function sceneIntensity(code) {
  const m = {
    51: 0.25, 53: 0.4, 55: 0.55,           // drizzle
    56: 0.35, 57: 0.5,                       // freezing drizzle
    61: 0.5, 63: 0.72, 65: 1.0,            // rain
    66: 0.65, 67: 0.9,                       // freezing rain
    80: 0.6, 81: 0.82, 82: 1.0,            // showers
    71: 0.42, 73: 0.7, 75: 1.0, 77: 0.5,  // snow
    85: 0.7, 86: 1.0,                       // snow showers
    45: 0.7, 48: 0.9,                       // fog / rime
    95: 0.85, 96: 0.93, 99: 1.0,           // thunder
  };
  return m[code] != null ? m[code] : 0.6;
}

// ----------------------------------------------------------------------------
function WeatherFX({
  scene = "clear", intensity = 0.7, isDay = true,
  windDir = 0, windSpeed = 0, glow = "#3a86ff", horizonFrac = 0.6,
}) {
  const ref = wxUseRef(null);
  const S = wxUseRef({ scene, intensity, isDay, windDir, windSpeed, glow, horizonFrac });
  Object.assign(S.current, { scene, intensity, isDay, windDir, windSpeed, glow, horizonFrac });

  wxUseEffect(() => {
    const cnv = ref.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    const dpr = Math.min(WX_DPR_CAP, window.devicePixelRatio || 1);
    let W = 0, H = 0;

    // ---- offscreen sprite bakery -------------------------------------------
    // Every sprite is drawn once at dpr and then blitted at CSS size. Alpha that
    // varies per particle is applied at blit time via globalAlpha, so one sprite
    // serves every particle that shares a shape.
    const sprites = new Map();
    function spriteCanvas(w, h) {
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.ceil(w * dpr));
      c.height = Math.max(1, Math.ceil(h * dpr));
      const g = c.getContext("2d");
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      return { c, g };
    }
    function blit(sp, x, y, alpha) {
      if (!sp) return;
      if (alpha != null) ctx.globalAlpha = alpha;
      ctx.drawImage(sp.img, x - sp.ox, y - sp.oy, sp.w, sp.h);
      if (alpha != null) ctx.globalAlpha = 1;
    }

    // A falling streak: transparent head → solid tail, baked at full alpha.
    function streakSprite(key, len, slope, lw, tint) {
      let sp = sprites.get(key);
      if (sp) return sp;
      const dx = slope * len;
      const pad = lw + 1;
      const w = Math.abs(dx) + pad * 2, h = len + pad * 2;
      const ox = dx >= 0 ? pad : pad + Math.abs(dx), oy = pad;
      const { c, g } = spriteCanvas(w, h);
      const grad = g.createLinearGradient(ox, oy, ox + dx, oy + len);
      grad.addColorStop(0, wxRgba(tint, 0));
      grad.addColorStop(1, wxRgba(tint, 1));
      g.strokeStyle = grad; g.lineWidth = lw; g.lineCap = "round";
      g.beginPath(); g.moveTo(ox, oy); g.lineTo(ox + dx, oy + len); g.stroke();
      sp = { img: c, w, h, ox, oy };
      sprites.set(key, sp);
      return sp;
    }
    // A soft round blob (radial falloff), baked at full alpha.
    function blobSprite(key, r, inner, outer, aOut) {
      let sp = sprites.get(key);
      if (sp) return sp;
      const { c, g } = spriteCanvas(r * 2, r * 2);
      const grad = g.createRadialGradient(r, r, 0, r, r, r);
      grad.addColorStop(0, wxRgba(inner, 1));
      grad.addColorStop(1, wxRgba(outer, aOut));
      g.fillStyle = grad;
      g.beginPath(); g.arc(r, r, r, 0, 6.283); g.fill();
      sp = { img: c, w: r * 2, h: r * 2, ox: r, oy: r };
      sprites.set(key, sp);
      return sp;
    }
    // A flat disc (no falloff) — replaces per-flake arc+fill.
    function discSprite(key, r, col) {
      let sp = sprites.get(key);
      if (sp) return sp;
      const pad = 1;
      const { c, g } = spriteCanvas(r * 2 + pad * 2, r * 2 + pad * 2);
      g.fillStyle = wxRgba(col, 1);
      g.beginPath(); g.arc(r + pad, r + pad, r, 0, 6.283); g.fill();
      sp = { img: c, w: r * 2 + pad * 2, h: r * 2 + pad * 2, ox: r + pad, oy: r + pad };
      sprites.set(key, sp);
      return sp;
    }
    // An ice pellet: off-centre specular highlight.
    function pelletSprite(key, r) {
      let sp = sprites.get(key);
      if (sp) return sp;
      const { c, g } = spriteCanvas(r * 2, r * 2);
      const grad = g.createRadialGradient(r - r * 0.3, r - r * 0.3, 0, r, r, r);
      grad.addColorStop(0, wxRgba([255, 255, 255], 1));
      grad.addColorStop(1, wxRgba([176, 202, 226], 0.5));
      g.fillStyle = grad;
      g.beginPath(); g.arc(r, r, r, 0, 6.283); g.fill();
      sp = { img: c, w: r * 2, h: r * 2, ox: r, oy: r };
      sprites.set(key, sp);
      return sp;
    }
    // An elliptical fog bank (the scale is baked in, so no per-frame transform).
    function fogSprite(key, rx, ry, col) {
      let sp = sprites.get(key);
      if (sp) return sp;
      const { c, g } = spriteCanvas(rx * 2, ry * 2);
      g.save();
      g.translate(rx, ry); g.scale(1, ry / rx);
      const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx);
      grad.addColorStop(0, wxRgba(col, 1));
      grad.addColorStop(1, wxRgba(col, 0));
      g.fillStyle = grad;
      g.beginPath(); g.arc(0, 0, rx, 0, 6.283); g.fill();
      g.restore();
      sp = { img: c, w: rx * 2, h: ry * 2, ox: rx, oy: ry };
      sprites.set(key, sp);
      return sp;
    }
    // A feathered horizontal streak used by the gust lines.
    function gustSprite(key, len, col) {
      let sp = sprites.get(key);
      if (sp) return sp;
      const h = 4;
      const { c, g } = spriteCanvas(len, h);
      const grad = g.createLinearGradient(0, 0, len, 0);
      grad.addColorStop(0, wxRgba(col, 1));
      grad.addColorStop(1, wxRgba(col, 0));
      g.strokeStyle = grad; g.lineWidth = 1.5; g.lineCap = "round";
      g.beginPath(); g.moveTo(0, h / 2); g.lineTo(len, h / 2); g.stroke();
      sp = { img: c, w: len, h, ox: 0, oy: h / 2 };
      sprites.set(key, sp);
      return sp;
    }

    // ---- full-screen washes: baked once per (scene|intensity|size) ----------
    let washes = {};
    function linearWash(x0, y0, x1, y1, stops) {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      for (const [at, col] of stops) g.addColorStop(at, col);
      return g;
    }

    function size() {
      W = cnv.offsetWidth; H = cnv.offsetHeight;
      cnv.width = W * dpr; cnv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      builtKey = "";           // size changed → every sprite is stale
      build();
    }

    // --- particle pools, rebuilt when scene/intensity/wind/size change ---
    let rain = [], flakes = [], fog = [], dust = [], ripples = [], gusts = [], pellets = [], motes = [];
    let builtKey = "";
    function glowRGB() {
      const h = S.current.glow.replace("#", "");
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    function windVec() {
      const moveRad = ((S.current.windDir + 180) % 360) * Math.PI / 180;
      return { x: Math.sin(moveRad), mag: Math.min(1.5, (S.current.windSpeed || 0) / 30) };
    }

    function build() {
      const s = S.current;
      // Wind is in the key: it sets the streak angle, which is baked into sprites.
      const key = `${s.scene}|${Math.round(s.intensity * 20)}|${Math.round(s.windDir / 8)}|${Math.round((s.windSpeed || 0) / 3)}|${W}x${H}`;
      if (key === builtKey) return;
      builtKey = key;
      sprites.clear();
      washes = {};
      rain = []; flakes = []; fog = []; dust = []; ripples = []; gusts = []; pellets = []; motes = [];
      const I = wxClamp(s.intensity, 0, 1);
      const wv = windVec();
      const hzY = H * s.horizonFrac;

      if (s.scene === "rain" || s.scene === "thunder") {
        washes.veil = linearWash(0, 0, 0, H, [
          [0, wxRgba([130, 150, 180], 0.04 + 0.06 * I)],
          [0.6, wxRgba([110, 130, 165], 0.02 + 0.04 * I)],
          [1, wxRgba([90, 110, 150], 0)],
        ]);
        // slope = vx/vy, identical for every drop, so the streak angle is constant
        const slope = wv.x * wv.mag * 0.7;
        const tint = wxMix([200, 218, 245], glowRGB(), 0.18);
        const layers = [
          { n: Math.round((60 + 120 * I)),  depth: 0.35, w: 0.9, spd: 10, len: 12, a: 0.18 },
          { n: Math.round((50 + 110 * I)),  depth: 0.62, w: 1.4, spd: 15, len: 20, a: 0.30 },
          { n: Math.round((30 + 80 * I)),   depth: 1.0,  w: 2.2, spd: 22, len: 34, a: 0.5 },
        ];
        for (const L of layers) for (let i = 0; i < L.n; i++) {
          const sp = L.spd * wxRand(0.8, 1.2);
          const len = wxQuant(L.len * wxRand(0.7, 1.3), 3);   // bucketed → few sprites
          const key = `r|${L.w}|${len}`;
          streakSprite(key, len, slope, L.w, tint);
          rain.push({
            x: Math.random() * (W * 1.3) - W * 0.15, y: Math.random() * H,
            vy: sp, vx: slope * sp,
            len, a: L.a, depth: L.depth, key,
          });
        }
      } else if (s.scene === "snow") {
        const layers = [
          { n: Math.round(50 + 90 * I),  depth: 0.4, r: [0.8, 1.6], spd: 0.5, a: 0.55 },
          { n: Math.round(45 + 80 * I),  depth: 0.7, r: [1.6, 3.0], spd: 0.9, a: 0.7 },
          { n: Math.round(24 + 46 * I),  depth: 1.0, r: [3.2, 6.5], spd: 1.4, a: 0.85 },
        ];
        for (const L of layers) for (let i = 0; i < L.n; i++) {
          const r = wxQuant(wxRand(L.r[0], L.r[1]), 0.4);
          const soft = L.depth >= 0.95;
          const key = soft ? `sb|${r}` : `sd|${r}`;
          if (soft) blobSprite(key, r, [255, 255, 255], [255, 255, 255], 0);
          else discSprite(key, r, [255, 255, 255]);
          flakes.push({
            x: Math.random() * W, y: Math.random() * H,
            r, vy: L.spd * wxRand(0.7, 1.3),
            sway: wxRand(0.3, 1.0), ph: Math.random() * 6.28, depth: L.depth, a: L.a,
            glint: Math.random() < 0.10 ? wxRand(0, 6.28) : -1,
            key,
          });
        }
      } else if (s.scene === "fog") {
        const N = Math.round(10 + 14 * I);
        for (let i = 0; i < N; i++) {
          const low = i / N;
          const rx = wxQuant(wxRand(220, 460), 60);
          const ry = wxQuant(wxRand(70, 150), 30);
          const col = low > 0.6 ? [206, 214, 224] : [222, 228, 238];
          const key = `f|${rx}|${ry}|${col[0]}`;
          fogSprite(key, rx, ry, col);
          fog.push({
            x: Math.random() * W, baseY: H * (0.30 + low * 0.62),
            rx, ry, vx: wxRand(0.10, 0.34) * (1 + wv.mag), ph: Math.random() * 6.28,
            a: (0.05 + 0.07 * I) * (0.6 + low * 0.8), low, key,
          });
        }
        washes.mist = linearWash(0, hzY - 60, 0, hzY + 120, [
          [0, wxRgba([210, 218, 228], 0)],
          [0.4, wxRgba([210, 218, 228], 0.16 * (0.6 + I * 0.6))],
          [1, wxRgba([196, 206, 218], 0)],
        ]);
      } else if (s.scene === "dust") {
        const lead = wv.x >= 0 ? 1 : 0;
        washes.hz = linearWash(0, 0, W, 0, [
          [0, wxRgba([196, 150, 96], (0.10 + 0.14 * I) * (lead ? 0.5 : 1))],
          [1, wxRgba([196, 150, 96], (0.10 + 0.14 * I) * (lead ? 1 : 0.5))],
        ]);
        washes.band = linearWash(0, hzY - 40, 0, H, [
          [0, wxRgba([182, 138, 86], 0)],
          [1, wxRgba([168, 122, 72], 0.22 * (0.5 + I))],
        ]);
        const N = Math.round(120 + 220 * I);
        for (let i = 0; i < N; i++) {
          const depth = wxRand(0.25, 1);
          dust.push({
            x: Math.random() * W, y: wxRand(H * 0.18, H),
            spd: wxRand(3, 9) * (0.5 + I) * depth, depth,
            r: wxRand(0.6, 2.2) * depth, a: wxRand(0.1, 0.4) * depth,
            ph: Math.random() * 6.28, big: Math.random() < 0.05,
          });
        }
      } else if (s.scene === "sleet") {
        washes.veil = linearWash(0, 0, 0, H, [
          [0, wxRgba([150, 165, 185], 0.05 + 0.06 * I)],
          [0.6, wxRgba([128, 146, 170], 0.02 + 0.03 * I)],
          [1, wxRgba([110, 130, 158], 0)],
        ]);
        const slope = wv.x * wv.mag * 0.7;
        const tint = [206, 224, 240];
        const layers = [
          { n: Math.round(40 + 70 * I), depth: 0.5, w: 1.2, spd: 14, len: 9,  a: 0.26 },
          { n: Math.round(28 + 60 * I), depth: 1.0, w: 1.8, spd: 20, len: 15, a: 0.44 },
        ];
        for (const L of layers) for (let i = 0; i < L.n; i++) {
          const sp = L.spd * wxRand(0.8, 1.2);
          const len = wxQuant(L.len * wxRand(0.7, 1.3), 3);
          const key = `sl|${L.w}|${len}`;
          streakSprite(key, len, slope, L.w, tint);
          rain.push({
            x: Math.random() * (W * 1.3) - W * 0.15, y: Math.random() * H,
            vy: sp, vx: slope * sp, len, a: L.a, depth: L.depth, key,
          });
        }
        const Np = Math.round(30 + 80 * I);
        for (let i = 0; i < Np; i++) {
          const r = wxQuant(wxRand(1.0, 2.2), 0.4);
          const key = `p|${r}`;
          pelletSprite(key, r);
          pellets.push({
            x: Math.random() * W, y: Math.random() * H,
            vy: wxRand(5, 9) * (0.7 + I), vx: wv.x * wv.mag * 4,
            r, a: wxRand(0.5, 0.85), key,
          });
        }
      } else if (s.scene === "wind") {
        const N = Math.round(16 + 38 * I);
        for (let i = 0; i < N; i++) {
          const len = wxQuant(wxRand(120, 360) * (0.6 + I), 40);
          const key = `g|${len}`;
          gustSprite(key, len, [238, 244, 252]);
          gusts.push({
            x: Math.random() * W, y: wxRand(H * 0.06, H * 0.94),
            len, spd: wxRand(8, 20) * (0.6 + I),
            a: wxRand(0.05, 0.18), ph: Math.random() * 6.28, key,
          });
        }
        const Nd = Math.round(10 + 26 * I);
        for (let i = 0; i < Nd; i++) {
          const r = wxQuant(wxRand(0.8, 2.4), 0.4);
          const key = `m|${r}`;
          discSprite(key, r, [210, 214, 220]);
          motes.push({
            x: Math.random() * W, y: wxRand(H * 0.28, H),
            spd: wxRand(6, 16) * (0.6 + I), r,
            a: wxRand(0.18, 0.5), ph: Math.random() * 6.28, spin: wxRand(0.1, 0.3), key,
          });
        }
      } else if (s.scene === "heat") {
        washes.glare = linearWash(0, 0, 0, H, [
          [0, wxRgba([255, 238, 205], 0.10 + 0.12 * I)],
          [0.5, wxRgba([255, 232, 196], 0.04 + 0.06 * I)],
          [1, wxRgba([250, 222, 180], 0)],
        ]);
        const N = Math.round(14 + 28 * I);
        for (let i = 0; i < N; i++) {
          const r = wxQuant(wxRand(0.8, 2.0), 0.4);
          const key = `h|${r}`;
          discSprite(key, r, [255, 236, 200]);
          motes.push({
            x: Math.random() * W, y: wxRand(H * 0.2, H),
            spd: wxRand(0.3, 1.0), r,
            a: wxRand(0.08, 0.22), ph: Math.random() * 6.28, spin: wxRand(0.02, 0.06), key,
          });
        }
      }
    }
    let flash = 0, flash2 = 0, boltT = 0, bolt = null, nextStrike = wxRand(40, 160);
    function makeBolt() {
      const x0 = wxRand(W * 0.25, W * 0.75);
      const pts = [[x0, -10]];
      let x = x0, y = 0;
      const segH = H * horizonNow() / 9;
      while (y < H * horizonNow() * 0.98) {
        y += segH * wxRand(0.6, 1.1);
        x += wxRand(-70, 70);
        pts.push([x, y]);
      }
      // branches
      const branches = [];
      for (let i = 1; i < pts.length - 1; i++) {
        if (Math.random() < 0.4) {
          let bx = pts[i][0], by = pts[i][1];
          const bp = [[bx, by]];
          const steps = 2 + (Math.random() * 3 | 0);
          for (let k = 0; k < steps; k++) { bx += wxRand(-60, 60); by += segH * wxRand(0.4, 0.8); bp.push([bx, by]); }
          branches.push(bp);
        }
      }
      return { pts, branches };
    }
    function horizonNow() { return S.current.horizonFrac; }

    // Glow without shadowBlur: stack progressively narrower, brighter strokes
    // under "lighter". Four cheap strokes beat one blurred one by a mile.
    const BOLT_LAYERS = [
      { w: 14,  c: [110, 150, 255], a: 0.10, br: false },
      { w: 8,   c: [140, 175, 255], a: 0.20, br: true },
      { w: 4,   c: [190, 210, 255], a: 0.40, br: true },
      { w: 2.4, c: [255, 255, 255], a: 1.00, br: true },
    ];
    function drawBolt(b, alpha) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const L of BOLT_LAYERS) {
        ctx.strokeStyle = wxRgba(L.c, L.a * alpha);
        ctx.lineWidth = L.w;
        strokePath(b.pts);
        if (L.br) {
          ctx.lineWidth = L.w * 0.58;
          for (const br of b.branches) strokePath(br);
        }
      }
      ctx.restore();
    }
    function strokePath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    // ------------------------------------------------------------------------
    const FRAME_MS = 1000 / WX_FPS;
    let raf, last = performance.now(), lastDraw = -1e9;
    function frame(ms) {
      raf = requestAnimationFrame(frame);
      if (ms - lastDraw < FRAME_MS - 1) return;   // throttle to WX_FPS
      lastDraw = ms;

      const s = S.current;
      build();
      // dt is measured in 60fps-frame units, so physics is unchanged by the cap
      // (at 30fps dt ≈ 2). The clamp absorbs stalls without teleporting anything.
      const dt = Math.min(3, (ms - last) / 16.67); last = ms;
      const I = wxClamp(s.intensity, 0, 1);
      const wv = windVec();
      const hzY = H * s.horizonFrac;
      ctx.clearRect(0, 0, W, H);

      // ===================== RAIN / THUNDER =====================
      if (s.scene === "rain" || s.scene === "thunder") {
        if (washes.veil) { ctx.fillStyle = washes.veil; ctx.fillRect(0, 0, W, H); }

        for (const p of rain) {
          blit(sprites.get(p.key), p.x, p.y, p.a);
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > H) {
            // spawn a ripple on the sea / ground for near-layer drops
            if (p.depth > 0.7 && Math.random() < 0.16) {
              const ry = hzY + Math.random() * (H - hzY) * 0.5;
              ripples.push({ x: p.x, y: ry, r: 1, a: 0.22, vr: wxRand(0.5, 0.9) });
            }
            p.y = -p.len; p.x = Math.random() * (W * 1.3) - W * 0.15;
          }
          if (p.x < -40) p.x += W * 1.3; else if (p.x > W * 1.15) p.x -= W * 1.3;
        }
        // ripples
        for (let i = ripples.length - 1; i >= 0; i--) {
          const r = ripples[i];
          ctx.strokeStyle = wxRgba([200, 220, 245], r.a);
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r * 3.2, r.r * 1.1, 0, 0, 6.283); ctx.stroke();
          r.r += r.vr * dt; r.a -= 0.016 * dt;
          if (r.a <= 0) ripples.splice(i, 1);
        }
        if (ripples.length > 90) ripples.splice(0, ripples.length - 90);

        // ===== thunder: strikes + flash =====
        if (s.scene === "thunder") {
          nextStrike -= dt;
          if (nextStrike <= 0 && boltT <= 0) {
            bolt = makeBolt(); boltT = 9; flash = 0.7; flash2 = 0;
            nextStrike = wxRand(70, 220) * (1.4 - I);
          }
          if (boltT > 0) {
            const a = wxClamp(boltT / 9, 0, 1) * (0.6 + 0.4 * Math.random()); // flicker
            drawBolt(bolt, a);
            boltT -= dt;
            if (boltT <= 0) flash2 = 0.5; // afterflash
          }
          if (flash > 0) { ctx.fillStyle = wxRgba([200, 215, 255], flash * 0.5); ctx.fillRect(0, 0, W, H); flash -= 0.08 * dt; }
          if (flash <= 0 && flash2 > 0) { ctx.fillStyle = wxRgba([180, 200, 255], flash2 * 0.3); ctx.fillRect(0, 0, W, H); flash2 -= 0.05 * dt; }
        }

      // ===================== SNOW =====================
      } else if (s.scene === "snow") {
        // white-out haze at high intensity
        if (I > 0.6) { ctx.fillStyle = wxRgba([235, 242, 252], (I - 0.6) * 0.18); ctx.fillRect(0, 0, W, H); }
        for (const p of flakes) {
          p.ph += 0.02 * dt;
          p.x += (wv.x * wv.mag * 1.8 * p.depth + Math.sin(p.ph) * p.sway) * dt;
          p.y += p.vy * (0.6 + I * 0.8) * dt;
          if (p.y > H + 6) { p.y = -6; p.x = Math.random() * W; }
          if (p.x < -8) p.x = W + 8; else if (p.x > W + 8) p.x = -8;
          blit(sprites.get(p.key), p.x, p.y, p.a);
          if (p.glint >= 0) {
            p.glint += 0.05 * dt;
            const tw = Math.max(0, Math.sin(p.glint));
            if (tw > 0.5) {
              ctx.strokeStyle = wxRgba([255, 255, 255], (tw - 0.5) * 1.6 * p.a);
              ctx.lineWidth = 0.8;
              const L = p.r * 2.6;
              ctx.beginPath();
              ctx.moveTo(p.x - L, p.y); ctx.lineTo(p.x + L, p.y);
              ctx.moveTo(p.x, p.y - L); ctx.lineTo(p.x, p.y + L);
              ctx.stroke();
            }
          }
        }

      // ===================== FOG =====================
      } else if (s.scene === "fog") {
        for (const p of fog) {
          p.ph += 0.005 * dt;
          p.x += p.vx * dt;
          if (p.x - p.rx > W) p.x = -p.rx;
          const breathe = 0.75 + 0.25 * Math.sin(p.ph);
          const y = p.baseY + Math.sin(p.ph * 0.7) * 14;
          blit(sprites.get(p.key), p.x, y, p.a * breathe);
        }
        // dense sea-mist hugging the waterline
        if (washes.mist) { ctx.fillStyle = washes.mist; ctx.fillRect(0, hzY - 60, W, 180); }
        // overall contrast wash
        ctx.fillStyle = wxRgba([214, 220, 230], 0.04 + 0.05 * I);
        ctx.fillRect(0, 0, W, H);

      // ===================== DUST (Aktau wind) =====================
      } else if (s.scene === "dust") {
        if (washes.hz) { ctx.fillStyle = washes.hz; ctx.fillRect(0, 0, W, H); }
        if (washes.band) { ctx.fillStyle = washes.band; ctx.fillRect(0, hzY - 40, W, H - hzY + 40); }
        // streaming grit
        const dir = wv.x >= 0 ? 1 : -1;
        for (const p of dust) {
          p.ph += 0.06 * dt;
          const drift = Math.sin(p.ph) * 0.6;
          p.x += (dir * p.spd + drift) * dt;
          p.y += drift * 0.5 * dt;
          if (dir > 0 && p.x > W + 10) { p.x = -10; p.y = wxRand(H * 0.18, H); }
          if (dir < 0 && p.x < -10) { p.x = W + 10; p.y = wxRand(H * 0.18, H); }
          const col = p.big ? [150, 110, 66] : [214, 178, 120];
          if (p.big) {
            ctx.fillStyle = wxRgba(col, p.a);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          } else {
            // motion-streaked grit
            ctx.strokeStyle = wxRgba(col, p.a);
            ctx.lineWidth = p.r;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dir * p.spd * 1.6, p.y); ctx.stroke();
          }
        }

      // ===================== SLEET (freezing rain) =====================
      } else if (s.scene === "sleet") {
        if (washes.veil) { ctx.fillStyle = washes.veil; ctx.fillRect(0, 0, W, H); }
        // glassy streaks
        for (const p of rain) {
          blit(sprites.get(p.key), p.x, p.y, p.a);
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > H) { p.y = -p.len; p.x = Math.random() * (W * 1.3) - W * 0.15; }
          if (p.x < -40) p.x += W * 1.3; else if (p.x > W * 1.15) p.x -= W * 1.3;
        }
        // hard ice pellets (round, highlighted)
        for (const p of pellets) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > H) { p.y = -4; p.x = Math.random() * W; }
          if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
          blit(sprites.get(p.key), p.x, p.y, p.a);
        }

      // ===================== WIND (Caspian gale) =====================
      } else if (s.scene === "wind") {
        const dir = wv.x >= 0 ? 1 : -1;
        // streaking gust lines flowing downwind
        for (const p of gusts) {
          p.ph += 0.02 * dt;
          p.x += dir * p.spd * dt;
          const y = p.y + Math.sin(p.ph) * 6;
          if (dir > 0 && p.x - p.len > W) { p.x = -wxRand(0, W * 0.4); p.y = wxRand(H * 0.06, H * 0.94); }
          if (dir < 0 && p.x + p.len < 0) { p.x = W + wxRand(0, W * 0.4); p.y = wxRand(H * 0.06, H * 0.94); }
          const sp = sprites.get(p.key);
          if (sp) {
            // sprite runs head→tail in +x; mirror it when the wind blows left
            ctx.globalAlpha = p.a;
            if (dir > 0) ctx.drawImage(sp.img, p.x - sp.w, y - sp.oy, sp.w, sp.h);
            else {
              ctx.save(); ctx.translate(p.x, y - sp.oy); ctx.scale(-1, 1);
              ctx.drawImage(sp.img, -sp.w, 0, sp.w, sp.h);
              ctx.restore();
            }
            ctx.globalAlpha = 1;
          }
        }
        // tumbling debris specks
        for (const p of motes) {
          p.ph += p.spin * dt;
          p.x += (dir * p.spd + Math.sin(p.ph) * 0.6) * dt;
          p.y += Math.sin(p.ph * 1.3) * 0.8 * dt;
          if (dir > 0 && p.x > W + 8) { p.x = -8; p.y = wxRand(H * 0.28, H); }
          if (dir < 0 && p.x < -8) { p.x = W + 8; p.y = wxRand(H * 0.28, H); }
          blit(sprites.get(p.key), p.x, p.y, p.a);
        }

      // ===================== HEAT (Caspian summer haze) =====================
      } else if (s.scene === "heat") {
        const t = ms / 1000;
        // bleaching warm glare, strongest overhead
        if (washes.glare) { ctx.fillStyle = washes.glare; ctx.fillRect(0, 0, W, H); }
        // mirage shimmer hugging the horizon — wavering translucent strips
        const bandTop = hzY - 26, bandH = 120;
        for (let i = 0; i < 8; i++) {
          const f = i / 8;
          const y = bandTop + f * bandH;
          const amp = (1 - f) * 9 * (0.5 + I);
          const off = Math.sin(t * 2 + f * 6) * amp;
          ctx.fillStyle = wxRgba([255, 246, 218], (0.045 + 0.05 * I) * (1 - f));
          ctx.beginPath();
          ctx.moveTo(0, y + off);
          for (let x = 0; x <= W; x += 48) ctx.lineTo(x, y + off + Math.sin(t * 2.4 + x * 0.01 + f * 5) * amp * 0.6);
          ctx.lineTo(W, y + bandH * 0.12); ctx.lineTo(0, y + bandH * 0.12);
          ctx.closePath(); ctx.fill();
        }
        // slow rising heat motes
        for (const p of motes) {
          p.ph += p.spin * dt;
          p.y -= p.spd * dt;
          p.x += Math.sin(p.ph) * 0.5 * dt;
          if (p.y < H * 0.18) { p.y = H + wxRand(0, 40); p.x = Math.random() * W; }
          blit(sprites.get(p.key), p.x, p.y, p.a);
        }
      }
    }

    size();
    raf = requestAnimationFrame(frame);
    const ro = new ResizeObserver(size);
    ro.observe(cnv);
    const onVis = () => { last = performance.now(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

Object.assign(window, { WeatherFX, sceneIntensity });
