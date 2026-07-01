// ============================================================================
// WeatherFX — cinematic, depth-layered precipitation & atmosphere for the
// Atmosphere variant. Sits ON TOP of the LivingSky canvas and renders the
// weather the sky can't: rain, snow, fog banks, forked lightning, and Aktau's
// signature wind-driven dust. Everything is depth-parallaxed, wind-sheared
// from the real wind vector, and scaled by an `intensity` 0..1.
//
// One <canvas> + one rAF loop. Prop changes mutate a state ref (S) so the loop
// never restarts. Horizon (the Caspian sea line) is at 0.6·H to match LivingSky,
// so rain ripples and sea-mist land exactly on the water.
// ============================================================================
const { useRef: wxUseRef, useEffect: wxUseEffect } = React;

// ---- local color helpers (prefixed to avoid cross-script collisions) ----
function wxRgba(c, a) { return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; }
function wxMix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function wxClamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wxRand(a, b) { return a + Math.random() * (b - a); }

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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let W = 0, H = 0;
    function size() {
      W = cnv.offsetWidth; H = cnv.offsetHeight;
      cnv.width = W * dpr; cnv.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
    }

    // --- particle pools, rebuilt when scene/intensity/size change ---
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
      const key = `${s.scene}|${Math.round(s.intensity * 20)}|${W}x${H}`;
      if (key === builtKey) return;
      builtKey = key;
      rain = []; flakes = []; fog = []; dust = []; ripples = []; gusts = []; pellets = []; motes = [];
      const I = wxClamp(s.intensity, 0, 1);
      const wv = windVec();

      if (s.scene === "rain" || s.scene === "thunder") {
        // 3 depth layers: far (thin/faint/slow) → near (thick/bright/fast/long)
        const layers = [
          { n: Math.round((60 + 120 * I)),  depth: 0.35, w: 0.9, spd: 10, len: 12, a: 0.18 },
          { n: Math.round((50 + 110 * I)),  depth: 0.62, w: 1.4, spd: 15, len: 20, a: 0.30 },
          { n: Math.round((30 + 80 * I)),   depth: 1.0,  w: 2.2, spd: 22, len: 34, a: 0.5 },
        ];
        for (const L of layers) for (let i = 0; i < L.n; i++) {
          const sp = L.spd * wxRand(0.8, 1.2);
          rain.push({
            x: Math.random() * (W * 1.3) - W * 0.15, y: Math.random() * H,
            vy: sp, vx: wv.x * wv.mag * sp * 0.7,
            len: L.len * wxRand(0.7, 1.3), w: L.w, a: L.a, depth: L.depth,
          });
        }
      } else if (s.scene === "snow") {
        const layers = [
          { n: Math.round(50 + 90 * I),  depth: 0.4, r: [0.8, 1.6], spd: 0.5, a: 0.55 },
          { n: Math.round(45 + 80 * I),  depth: 0.7, r: [1.6, 3.0], spd: 0.9, a: 0.7 },
          { n: Math.round(24 + 46 * I),  depth: 1.0, r: [3.2, 6.5], spd: 1.4, a: 0.85 },
        ];
        for (const L of layers) for (let i = 0; i < L.n; i++) {
          flakes.push({
            x: Math.random() * W, y: Math.random() * H,
            r: wxRand(L.r[0], L.r[1]), vy: L.spd * wxRand(0.7, 1.3),
            sway: wxRand(0.3, 1.0), ph: Math.random() * 6.28, depth: L.depth, a: L.a,
            glint: Math.random() < 0.10 ? wxRand(0, 6.28) : -1,
          });
        }
      } else if (s.scene === "fog") {
        // layered volumetric banks; lower bands are denser (sea-mist)
        const N = Math.round(10 + 14 * I);
        for (let i = 0; i < N; i++) {
          const low = i / N;
          fog.push({
            x: Math.random() * W, baseY: H * (0.30 + low * 0.62),
            rx: wxRand(220, 460), ry: wxRand(70, 150),
            vx: wxRand(0.10, 0.34) * (1 + wv.mag), ph: Math.random() * 6.28,
            a: (0.05 + 0.07 * I) * (0.6 + low * 0.8), low,
          });
        }
      } else if (s.scene === "dust") {
        // streaming horizontal grit + a few tumbling specks
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
        // half-frozen mix: short glassy streaks + hard ice pellets
        const layers = [
          { n: Math.round(40 + 70 * I), depth: 0.5, w: 1.2, spd: 14, len: 9,  a: 0.26 },
          { n: Math.round(28 + 60 * I), depth: 1.0, w: 1.8, spd: 20, len: 15, a: 0.44 },
        ];
        for (const L of layers) for (let i = 0; i < L.n; i++) {
          const sp = L.spd * wxRand(0.8, 1.2);
          rain.push({
            x: Math.random() * (W * 1.3) - W * 0.15, y: Math.random() * H,
            vy: sp, vx: wv.x * wv.mag * sp * 0.7,
            len: L.len * wxRand(0.7, 1.3), w: L.w, a: L.a, depth: L.depth,
          });
        }
        const Np = Math.round(30 + 80 * I);
        for (let i = 0; i < Np; i++) {
          pellets.push({
            x: Math.random() * W, y: Math.random() * H,
            vy: wxRand(5, 9) * (0.7 + I), vx: wv.x * wv.mag * 4,
            r: wxRand(1.0, 2.2), a: wxRand(0.5, 0.85),
          });
        }
      } else if (s.scene === "wind") {
        // long faint gust streaks blown across + tumbling debris specks
        const N = Math.round(16 + 38 * I);
        for (let i = 0; i < N; i++) {
          gusts.push({
            x: Math.random() * W, y: wxRand(H * 0.06, H * 0.94),
            len: wxRand(120, 360) * (0.6 + I), spd: wxRand(8, 20) * (0.6 + I),
            a: wxRand(0.05, 0.18), ph: Math.random() * 6.28, curve: wxRand(-26, 26),
          });
        }
        const Nd = Math.round(10 + 26 * I);
        for (let i = 0; i < Nd; i++) {
          motes.push({
            x: Math.random() * W, y: wxRand(H * 0.28, H),
            spd: wxRand(6, 16) * (0.6 + I), r: wxRand(0.8, 2.4),
            a: wxRand(0.18, 0.5), ph: Math.random() * 6.28, spin: wxRand(0.1, 0.3),
          });
        }
      } else if (s.scene === "heat") {
        // slow rising heat motes (the boil above hot ground)
        const N = Math.round(14 + 28 * I);
        for (let i = 0; i < N; i++) {
          motes.push({
            x: Math.random() * W, y: wxRand(H * 0.2, H),
            spd: wxRand(0.3, 1.0), r: wxRand(0.8, 2.0),
            a: wxRand(0.08, 0.22), ph: Math.random() * 6.28, spin: wxRand(0.02, 0.06),
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

    function drawBolt(b, alpha) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // outer glow
      ctx.strokeStyle = wxRgba([150, 180, 255], 0.5 * alpha);
      ctx.lineWidth = 7;
      ctx.shadowColor = wxRgba([150, 185, 255], 0.9 * alpha);
      ctx.shadowBlur = 34;
      strokePath(b.pts);
      for (const br of b.branches) strokePath(br);
      // hot core
      ctx.shadowBlur = 12;
      ctx.strokeStyle = wxRgba([255, 255, 255], alpha);
      ctx.lineWidth = 2.4;
      strokePath(b.pts);
      ctx.lineWidth = 1.4;
      for (const br of b.branches) strokePath(br);
      ctx.restore();
    }
    function strokePath(pts) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }

    // ------------------------------------------------------------------------
    let raf, last = performance.now();
    function frame(ms) {
      const s = S.current;
      build();
      const dt = Math.min(2.5, (ms - last) / 16.67); last = ms;
      const I = wxClamp(s.intensity, 0, 1);
      const wv = windVec();
      const hzY = H * s.horizonFrac;
      ctx.clearRect(0, 0, W, H);

      // ===================== RAIN / THUNDER =====================
      if (s.scene === "rain" || s.scene === "thunder") {
        // atmospheric rain veil
        const veil = ctx.createLinearGradient(0, 0, 0, H);
        veil.addColorStop(0, wxRgba([130, 150, 180], 0.04 + 0.06 * I));
        veil.addColorStop(0.6, wxRgba([110, 130, 165], 0.02 + 0.04 * I));
        veil.addColorStop(1, wxRgba([90, 110, 150], 0));
        ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);

        const gc = glowRGB();
        ctx.lineCap = "round";
        for (const p of rain) {
          const tint = wxMix([200, 218, 245], gc, 0.18);
          const ang = p.vx, dx = ang * (p.len / p.vy);
          const g = ctx.createLinearGradient(p.x, p.y, p.x + dx, p.y + p.len);
          g.addColorStop(0, wxRgba(tint, 0));
          g.addColorStop(1, wxRgba(tint, p.a));
          ctx.strokeStyle = g; ctx.lineWidth = p.w;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx, p.y + p.len); ctx.stroke();
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
          if (p.depth >= 0.95) {
            // near flakes: soft focus blobs
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
            g.addColorStop(0, wxRgba([255, 255, 255], p.a));
            g.addColorStop(1, wxRgba([255, 255, 255], 0));
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          } else {
            ctx.fillStyle = wxRgba([255, 255, 255], p.a);
            ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
          }
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
          const g = ctx.createRadialGradient(p.x, y, 0, p.x, y, p.rx);
          const col = p.low > 0.6 ? [206, 214, 224] : [222, 228, 238];
          g.addColorStop(0, wxRgba(col, p.a * breathe));
          g.addColorStop(1, wxRgba(col, 0));
          ctx.save();
          ctx.translate(p.x, y); ctx.scale(1, p.ry / p.rx);
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(0, 0, p.rx, 0, 6.283); ctx.fill();
          ctx.restore();
        }
        // dense sea-mist hugging the waterline
        const mist = ctx.createLinearGradient(0, hzY - 60, 0, hzY + 120);
        mist.addColorStop(0, wxRgba([210, 218, 228], 0));
        mist.addColorStop(0.4, wxRgba([210, 218, 228], 0.16 * (0.6 + I * 0.6)));
        mist.addColorStop(1, wxRgba([196, 206, 218], 0));
        ctx.fillStyle = mist; ctx.fillRect(0, hzY - 60, W, 180);
        // overall contrast wash
        ctx.fillStyle = wxRgba([214, 220, 230], 0.04 + 0.05 * I);
        ctx.fillRect(0, 0, W, H);

      // ===================== DUST (Aktau wind) =====================
      } else if (s.scene === "dust") {
        // warm haze graded toward the windward side
        const lead = wv.x >= 0 ? 1 : 0;
        const hz = ctx.createLinearGradient(0, 0, W, 0);
        hz.addColorStop(0, wxRgba([196, 150, 96], (0.10 + 0.14 * I) * (lead ? 0.5 : 1)));
        hz.addColorStop(1, wxRgba([196, 150, 96], (0.10 + 0.14 * I) * (lead ? 1 : 0.5)));
        ctx.fillStyle = hz; ctx.fillRect(0, 0, W, H);
        // low warm band near the ground (kicked-up sand)
        const band = ctx.createLinearGradient(0, hzY - 40, 0, H);
        band.addColorStop(0, wxRgba([182, 138, 86], 0));
        band.addColorStop(1, wxRgba([168, 122, 72], 0.22 * (0.5 + I)));
        ctx.fillStyle = band; ctx.fillRect(0, hzY - 40, W, H - hzY + 40);
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
        // cold steel veil
        const veil = ctx.createLinearGradient(0, 0, 0, H);
        veil.addColorStop(0, wxRgba([150, 165, 185], 0.05 + 0.06 * I));
        veil.addColorStop(0.6, wxRgba([128, 146, 170], 0.02 + 0.03 * I));
        veil.addColorStop(1, wxRgba([110, 130, 158], 0));
        ctx.fillStyle = veil; ctx.fillRect(0, 0, W, H);
        // glassy streaks
        ctx.lineCap = "round";
        for (const p of rain) {
          const tint = [206, 224, 240];
          const dx = p.vx * (p.len / p.vy);
          const g = ctx.createLinearGradient(p.x, p.y, p.x + dx, p.y + p.len);
          g.addColorStop(0, wxRgba(tint, 0));
          g.addColorStop(1, wxRgba(tint, p.a));
          ctx.strokeStyle = g; ctx.lineWidth = p.w;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + dx, p.y + p.len); ctx.stroke();
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > H) { p.y = -p.len; p.x = Math.random() * (W * 1.3) - W * 0.15; }
          if (p.x < -40) p.x += W * 1.3; else if (p.x > W * 1.15) p.x -= W * 1.3;
        }
        // hard ice pellets (round, highlighted)
        for (const p of pellets) {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.y > H) { p.y = -4; p.x = Math.random() * W; }
          if (p.x < -6) p.x = W + 6; else if (p.x > W + 6) p.x = -6;
          const g = ctx.createRadialGradient(p.x - p.r * 0.3, p.y - p.r * 0.3, 0, p.x, p.y, p.r);
          g.addColorStop(0, wxRgba([255, 255, 255], p.a));
          g.addColorStop(1, wxRgba([176, 202, 226], p.a * 0.5));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }

      // ===================== WIND (Caspian gale) =====================
      } else if (s.scene === "wind") {
        const dir = wv.x >= 0 ? 1 : -1;
        ctx.lineCap = "round";
        // streaking gust lines flowing downwind
        for (const p of gusts) {
          p.ph += 0.02 * dt;
          p.x += dir * p.spd * dt;
          const y = p.y + Math.sin(p.ph) * 6;
          if (dir > 0 && p.x - p.len > W) { p.x = -wxRand(0, W * 0.4); p.y = wxRand(H * 0.06, H * 0.94); }
          if (dir < 0 && p.x + p.len < 0) { p.x = W + wxRand(0, W * 0.4); p.y = wxRand(H * 0.06, H * 0.94); }
          const g = ctx.createLinearGradient(p.x, y, p.x - dir * p.len, y);
          g.addColorStop(0, wxRgba([238, 244, 252], p.a));
          g.addColorStop(1, wxRgba([238, 244, 252], 0));
          ctx.strokeStyle = g; ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(p.x, y);
          ctx.quadraticCurveTo(p.x - dir * p.len * 0.5, y + p.curve * 0.4, p.x - dir * p.len, y + p.curve * Math.sin(p.ph));
          ctx.stroke();
        }
        // tumbling debris specks
        for (const p of motes) {
          p.ph += p.spin * dt;
          p.x += (dir * p.spd + Math.sin(p.ph) * 0.6) * dt;
          p.y += Math.sin(p.ph * 1.3) * 0.8 * dt;
          if (dir > 0 && p.x > W + 8) { p.x = -8; p.y = wxRand(H * 0.28, H); }
          if (dir < 0 && p.x < -8) { p.x = W + 8; p.y = wxRand(H * 0.28, H); }
          ctx.fillStyle = wxRgba([210, 214, 220], p.a);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }

      // ===================== HEAT (Caspian summer haze) =====================
      } else if (s.scene === "heat") {
        const t = ms / 1000;
        // bleaching warm glare, strongest overhead
        const glare = ctx.createLinearGradient(0, 0, 0, H);
        glare.addColorStop(0, wxRgba([255, 238, 205], 0.10 + 0.12 * I));
        glare.addColorStop(0.5, wxRgba([255, 232, 196], 0.04 + 0.06 * I));
        glare.addColorStop(1, wxRgba([250, 222, 180], 0));
        ctx.fillStyle = glare; ctx.fillRect(0, 0, W, H);
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
          ctx.fillStyle = wxRgba([255, 236, 200], p.a);
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
        }
      }

      raf = requestAnimationFrame(frame);
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
