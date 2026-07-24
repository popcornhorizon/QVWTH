// Variant 1 — "Atmosphere": one living screen, three views.
// Architecture:
//   <Screen>
//     <bg + halos + particles + topbar>     // never transitions
//     <RotatingLayer>                       // cross-fades only
//       <ViewAtmosphere | ViewHero | ViewForecast />
//     </RotatingLayer>
//     <DotIndicator />
//   </Screen>

// ---------- Halos (always-on backdrop) ----------
// NOTE: these two used to carry filter: blur(20px) / blur(30px). On a 1200x1200
// and a 1400x1400 layer that is the single most expensive thing on the page --
// a CSS blur needs source, intermediate and result buffers, so those two alone
// cost roughly 40MB of graphics memory on a player that only has ~300-400MB for
// the whole renderer. The blur was also close to invisible: a radial-gradient
// with `transparent 70%` is already a soft falloff, and blurring a soft gradient
// changes almost nothing on screen. Dropping the filter keeps the geometry and
// the look, and hands the memory back.
function HaloOverlay({ glow }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      <div
        className="absolute halo-a"
        style={{
          left: "8%", top: "10%", width: 1200, height: 1200,
          background: `radial-gradient(closest-side, ${glow}33, transparent 70%)`,
        }}
      />
      <div
        className="absolute halo-b"
        style={{
          right: "-10%", bottom: "-15%", width: 1400, height: 1400,
          background: `radial-gradient(closest-side, ${glow}22, transparent 70%)`,
        }}
      />
    </div>
  );
}

// ---------- Scene helper ----------
function isDarkScene(scene, isDay) {
  return scene === "rain" || scene === "thunder" || scene === "fog" ||
         (scene === "cloudy" && !isDay);
}

// ---------- Rotation hook ----------
function useRotation(views, intervalMs = 15000) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((v) => (v + 1) % views), intervalMs);
    return () => clearInterval(id);
  }, [views, intervalMs]);
  return i;
}

// ---------- Painterly weather glyph ----------
function WeatherGlyph({ scene, isDay, sun }) {
  const size = 300;

  // Painterly cloud body: large soft radial blob via div + blur filter
  const PainterlyCloud = ({ tint = "rgba(255,255,255,0.55)", w = 420, h = 280, top = 40, left = -20 }) => (
    <div
      className="absolute cloud-drift"
      style={{
        left, top, width: w, height: h,
        background: `radial-gradient(60% 50% at 50% 55%, ${tint} 0%, transparent 78%)`,
        filter: "blur(18px)",
        mixBlendMode: "screen",
      }}
    />
  );

  if (scene === "rain" || scene === "thunder") {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <PainterlyCloud tint="rgba(245,250,255,0.5)" w={420} h={260} top={20} left={-20} />
        <PainterlyCloud tint="rgba(255,255,255,0.32)" w={300} h={200} top={70} left={70} />
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
          {[0,1,2,3,4,5].map((i) => (
            <line key={i} className="rain-stroke" style={{ animationDelay: `${i*0.18}s` }}
              x1={56+i*18} y1={130} x2={52+i*18} y2={184}
              stroke="rgba(220,235,255,0.85)" strokeWidth="2.4" strokeLinecap="round" />
          ))}
        </svg>
      </div>
    );
  }

  if (scene === "snow") {
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <PainterlyCloud tint="rgba(255,255,255,0.55)" w={420} h={260} top={20} left={-20} />
        <PainterlyCloud tint="rgba(220,235,255,0.4)"  w={300} h={200} top={70} left={70} />
        <svg viewBox="0 0 200 200" className="absolute inset-0 w-full h-full">
          {[0,1,2,3,4,5].map((i) => (
            <text key={i} x={50+i*18} y={150+(i%2)*18} fill="rgba(255,255,255,0.92)"
              fontSize="20" className="snow-glyph" style={{ animationDelay: `${i*0.3}s`}}>❄</text>
          ))}
        </svg>
      </div>
    );
  }

  if (scene === "cloudy" || scene === "fog") {
    const isFog = scene === "fog";
    return (
      <div className="relative" style={{ width: size, height: size }}>
        <PainterlyCloud
          tint={isFog ? "rgba(220,225,232,0.55)" : "rgba(255,255,255,0.6)"}
          w={440} h={280} top={60} left={-30}
        />
        <PainterlyCloud
          tint={isFog ? "rgba(200,208,218,0.4)" : "rgba(255,255,255,0.42)"}
          w={340} h={220} top={20} left={70}
        />
      </div>
    );
  }

  if (!isDay) {
    // Clear night: no foreground moon glyph — the upgraded cinematic sky
    // already renders the moon disc, so this slot stays empty to avoid a
    // duplicate second moon.
    return null;
  }

  // Clear day: no foreground sun glyph — the cinematic sky already renders the
  // sun disc (arcing along its path), so this slot stays empty to avoid a
  // duplicate, static second sun.
  return null;
}

// ============================================================================
// VIEW 1 — full layout (hero + bottom strip)
// ============================================================================
function ViewAtmosphere({ data, now, heroLang, w, bg, sun }) {
  const cur = data.current;
  const daily = data.daily;
  const isDay = !!cur.is_day;
  const aqi = data.air?.current?.european_aqi;
  const uv = daily.uv_index_max?.[0];

  return (
    <>
      <div className="absolute" style={{ left: 56, top: 200, right: 56, bottom: 344 }}>
        <div className="flex items-end justify-between h-full">
          <div>
            <div
              key={"city-"+heroLang}
              className="rot-label"
              style={{ fontSize: 34, letterSpacing: "0.34em", fontWeight: 600, color: "rgba(255,255,255,0.92)" }}
            >
              {T.city[heroLang]}
            </div>

            <div className="flex items-start" style={{ marginTop: 22, lineHeight: 0.78 }}>
              <span
                className="hero-temp"
                style={{
                  fontSize: 440,
                  fontWeight: 200,
                  letterSpacing: "-0.04em",
                  background: "linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.74) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: `drop-shadow(0 3px 90px ${bg.glow}55)`,
                }}
              >
                {round(cur.temperature_2m)}
              </span>
              <span style={{ fontSize: 108, fontWeight: 200, marginTop: 30, marginLeft: 6, color: "rgba(255,255,255,0.82)" }}>°</span>
            </div>

            <div className="flex items-center gap-8" style={{ marginTop: 10 }}>
              <span
                key={"cond-"+heroLang}
                className="rot-label"
                style={{ fontSize: 38, fontWeight: 400, letterSpacing: "0.02em" }}
              >
                {w[heroLang]}
              </span>
              <span className="text-white/55" style={{ fontSize: 22, letterSpacing: "0.1em" }}>
                ↑ {round(daily.temperature_2m_max[0])}°  ·  ↓ {round(daily.temperature_2m_min[0])}°
              </span>
            </div>
          </div>

          <div style={{ opacity: 0.82, transform: "translateY(-70px)", marginRight: 20 }}>
            <WeatherGlyph scene={w.scene} isDay={isDay} sun={sun} />
          </div>
        </div>
      </div>

      <div className="absolute" style={{ left: 56, right: 56, bottom: 60 }}>
        <div
          className="grid grid-cols-5"
          style={{ borderTop: "1px solid rgba(255,255,255,0.22)" }}
        >
          <StatFeels i={0} scene={w.scene} value={data.sea?.temp} actual={cur.temperature_2m} />
          <StatHumidity i={1} value={cur.relative_humidity_2m} />
          <StatWind i={2} speed={cur.wind_speed_10m} dir={cur.wind_direction_10m} />
          <StatUV i={3} value={uv} />
          <StatAir i={4} value={aqi} pm25={data.air?.current?.pm2_5} />
        </div>
      </div>
    </>
  );
}

// ============================================================================
// VIEW 2 — hero only, maximum readability
// ============================================================================
function ViewHero({ data, heroLang, w, bg }) {
  const cur = data.current;
  const daily = data.daily;
  const isDay = !!cur.is_day;

  return (
    <div className="absolute inset-0 flex items-center" style={{ paddingTop: 60 }}>
      <div className="w-full flex items-center justify-between" style={{ padding: "0 120px" }}>
        <div className="flex-1">
          <div
            key={"city-h-"+heroLang}
            className="rot-label"
            style={{ fontSize: 38, letterSpacing: "0.38em", fontWeight: 600, color: "rgba(255,255,255,0.95)" }}
          >
            {T.city[heroLang]}
          </div>

          <div className="flex items-start" style={{ marginTop: 18, lineHeight: 0.78 }}>
            <span
              className="hero-temp"
              style={{
                fontSize: 680,
                fontWeight: 200,
                letterSpacing: "-0.045em",
                background: `linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.75) 100%)`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                filter: `drop-shadow(0 4px 120px ${bg.glow}66)`,
              }}
            >
              {round(cur.temperature_2m)}
            </span>
            <span style={{
              fontSize: 180, fontWeight: 200, marginTop: 50, marginLeft: 10,
              color: "rgba(255,255,255,0.85)",
            }}>°</span>
          </div>

          <div className="flex items-center gap-10" style={{ marginTop: 20 }}>
            <span
              key={"cond-h-"+heroLang}
              className="rot-label"
              style={{ fontSize: 52, fontWeight: 600, letterSpacing: "0.01em" }}
            >
              {w[heroLang]}
            </span>
            <span className="text-white/50" style={{ fontSize: 24, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 500 }}>
              <RotatingLabel k="high" offset={0} /> {round(daily.temperature_2m_max[0])}°
              <span className="text-white/30"> · </span>
              <RotatingLabel k="low" offset={2} /> {round(daily.temperature_2m_min[0])}°
            </span>
          </div>
        </div>

        <div style={{ opacity: 0.55, transform: "translateY(-40px)" }}>
          <WeatherGlyph scene={w.scene} isDay={isDay} />
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VIEW 3 — "Today's Arc": the sun/moon's path across the sky, drawn as a
// glowing celestial track with a live NOW bead, sunrise/sunset anchored at the
// horizon, today's temperature living in the bowl of the arc, and a
// daylight / golden-hour ribbon below. Re-animates each time it loops in.
// ============================================================================
const _hexA   = (h) => { h = h.replace("#", ""); return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)]; };
const _rgbaA  = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
const _clampA = (v, a, b) => (v < a ? a : v > b ? b : v);
const _easeA  = (t) => 1 - Math.pow(1 - t, 3);

// Shared arc geometry — resolution-independent, expressed as fractions of the stage
function _arcGeom(W, H) {
  const x0 = W * 0.155, x1 = W * 0.845;
  const horizonY = H * 0.685;
  const arcH = horizonY - H * 0.255;
  return { x0, x1, horizonY, arcH };
}
function _arcPos(p, W, H) {
  const { x0, x1, horizonY, arcH } = _arcGeom(W, H);
  return [x0 + (x1 - x0) * p, horizonY - arcH * Math.sin(Math.PI * p)];
}

// Keeps the DOM overlay locked to the same stage box the canvas draws into,
// so the arc markers stay on the arc at any stage size.
function useStageSize(ref) {
  const [size, setSize] = useState({ W: 1920, H: 1152 });
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => setSize({ W: el.offsetWidth, H: el.offsetHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

function drawTodayArc(ctx, W, H, p, isDay, accentHex, ms, introT) {
  const ac = _hexA(accentHex);
  const { x0, x1, horizonY } = _arcGeom(W, H);
  const STEPS = 96;
  ctx.clearRect(0, 0, W, H);

  // 1 — daylight wash inside the bowl
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(..._arcPos(0, W, H));
  for (let i = 1; i <= STEPS; i++) ctx.lineTo(..._arcPos(i / STEPS, W, H));
  ctx.lineTo(x1, horizonY); ctx.lineTo(x0, horizonY); ctx.closePath();
  const wash = ctx.createLinearGradient(0, H * 0.255, 0, horizonY);
  wash.addColorStop(0, _rgbaA(ac, isDay ? 0.12 : 0.07));
  wash.addColorStop(1, _rgbaA(ac, 0));
  ctx.fillStyle = wash; ctx.fill();
  ctx.restore();

  // 2 — horizon line
  ctx.strokeStyle = _rgbaA([255, 255, 255], 0.13);
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0 - 60, horizonY); ctx.lineTo(x1 + 60, horizonY); ctx.stroke();

  // 3 — faint full track, revealed left→right by the intro
  ctx.lineWidth = 2;
  ctx.strokeStyle = _rgbaA([255, 255, 255], 0.18);
  ctx.beginPath();
  let started = false;
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS; if (f > introT) break;
    const pt = _arcPos(f, W, H);
    started ? ctx.lineTo(pt[0], pt[1]) : (ctx.moveTo(pt[0], pt[1]), started = true);
  }
  ctx.stroke();

  // 4 — endpoint glow dots
  for (const f of [0, 1]) {
    const [px, py] = _arcPos(f, W, H);
    ctx.fillStyle = _rgbaA([255, 255, 255], 0.55 * introT);
    ctx.beginPath(); ctx.arc(px, py, 6, 0, 6.283); ctx.fill();
  }

  // 5 — traveled portion: bright gradient glow 0 → p
  const trav = p * introT;
  ctx.save();
  ctx.shadowColor = _rgbaA(ac, 0.85);
  ctx.shadowBlur = 26;
  ctx.lineCap = "round";
  ctx.lineWidth = 4.5;
  const grad = ctx.createLinearGradient(x0, 0, x1, 0);
  grad.addColorStop(0, _rgbaA(ac, 0.0));
  grad.addColorStop(0.5, _rgbaA(ac, 0.7));
  grad.addColorStop(1, _rgbaA(ac, 1));
  ctx.strokeStyle = grad;
  ctx.beginPath();
  started = false;
  for (let i = 0; i <= STEPS; i++) {
    const f = i / STEPS; if (f > trav) break;
    const pt = _arcPos(f, W, H);
    started ? ctx.lineTo(pt[0], pt[1]) : (ctx.moveTo(pt[0], pt[1]), started = true);
  }
  ctx.stroke();
  ctx.restore();

  // 6 — drifting sparkle motes around the bowl
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 26; i++) {
    const along = ((i * 0.0739) + 0.03) % 1;
    const [ax, ay] = _arcPos(along, W, H);
    const span = 120 + (i * 53) % 200;
    const yy = ay - (((ms * 0.018 * (0.4 + (i % 4) / 4)) + i * 37) % span);
    const tw = 0.5 + 0.5 * Math.sin(ms / 520 + i * 1.3);
    ctx.fillStyle = _rgbaA(ac, 0.16 * tw * introT);
    ctx.beginPath();
    ctx.arc(ax + ((i % 7) - 3) * 9, yy, 1.7, 0, 6.283);
    ctx.fill();
  }
  ctx.restore();

  // 7 — the NOW bead with bloom
  const [bx, by] = _arcPos(trav, W, H);
  const pulse = 1 + 0.06 * Math.sin(ms / 600);
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const bloom = ctx.createRadialGradient(bx, by, 0, bx, by, 110 * pulse);
  bloom.addColorStop(0, _rgbaA(ac, 0.85 * introT));
  bloom.addColorStop(0.22, _rgbaA(ac, 0.32 * introT));
  bloom.addColorStop(1, _rgbaA(ac, 0));
  ctx.fillStyle = bloom;
  ctx.beginPath(); ctx.arc(bx, by, 110 * pulse, 0, 6.283); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = _rgbaA(ac, 0.9 * introT);
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(bx, by, 16, 0, 6.283); ctx.stroke();
  ctx.fillStyle = _rgbaA([255, 255, 255], introT);
  ctx.beginPath(); ctx.arc(bx, by, 9.5, 0, 6.283); ctx.fill();
}

function TodayArc({ p, isDay, accent, active }) {
  const ref = useRef(null);
  const pRef = useRef(p);          pRef.current = p;
  const accRef = useRef(accent);   accRef.current = accent;
  const dayRef = useRef(isDay);    dayRef.current = isDay;
  const startRef = useRef(performance.now());
  const prevActive = useRef(active);

  useEffect(() => {
    if (active && !prevActive.current) startRef.current = performance.now();
    prevActive.current = active;
  }, [active]);

  useEffect(() => {
    const cnv = ref.current; if (!cnv) return;
    const ctx = cnv.getContext("2d");
    // The stage is authored at the wall's native 1920x1152 and maps 1:1 to the
    // LEDs, so a buffer above 1 device pixel per CSS pixel is resampled straight
    // back down — cost with no visible gain on the player.
    let raf, dpr = Math.min(window.QV_DPR_CAP || 1, window.devicePixelRatio || 1);
    function size() {
      const w = cnv.offsetWidth, h = cnv.offsetHeight;
      cnv.width = w * dpr; cnv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const ARC_FRAME_MS = 1000 / (window.QV_FPS || 30);
    let lastDraw = -1e9;
    function frame() {
      // Scheduled first so an early return can never break the chain.
      raf = requestAnimationFrame(frame);
      const ms = performance.now();
      if (ms - lastDraw < ARC_FRAME_MS - 1) return;   // throttle to QV_FPS
      lastDraw = ms;
      const introT = _easeA(_clampA((ms - startRef.current) / 1300, 0, 1));
      drawTodayArc(ctx, cnv.offsetWidth, cnv.offsetHeight, pRef.current, dayRef.current, accRef.current, ms, introT);
    }
    frame();
    const onR = () => size();
    window.addEventListener("resize", onR);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onR); };
  }, []);

  return <canvas ref={ref} className="absolute inset-0" style={{ width: "100%", height: "100%" }} />;
}

function ViewToday({ data, now, heroLang, w, bg, active }) {
  const stageRef = useRef(null);
  const cur = data.current;
  const daily = data.daily;
  const isDay = !!cur.is_day;
  const lang = heroLang;

  const srISO = daily.sunrise[0], ssISO = daily.sunset[0];
  const sr = new Date(srISO).getTime();
  const ss = new Date(ssISO).getTime();
  const t = now.getTime();
  const hhmm = (msv) => { const d = new Date(msv); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };

  // Arc semantics: by day the sun rides sunrise→sunset; by night the bead
  // rides sunset→(next) sunrise so the path always reads as "the sky's journey".
  let p, leftKey, rightKey, leftTime, rightTime;
  if (isDay) {
    p = _clampA((t - sr) / (ss - sr), 0, 1);
    leftKey = "sunrise"; rightKey = "sunset";
    leftTime = hhmm(sr); rightTime = hhmm(ss);
  } else {
    let aStart, aEnd;
    if (t >= ss) { aStart = ss; aEnd = new Date(daily.sunrise[1] || srISO).getTime(); }
    else         { aStart = ss - 86400000; aEnd = sr; }
    p = _clampA((t - aStart) / (aEnd - aStart), 0, 1);
    leftKey = "sunset"; rightKey = "sunrise";
    leftTime = hhmm(aStart); rightTime = hhmm(aEnd);
  }

  const accent = isDay ? "#ffce6e" : "#bcd2ff";
  const { W, H } = useStageSize(stageRef);
  const [bx, by] = _arcPos(p, W, H);
  const { x0, x1, horizonY } = _arcGeom(W, H);

  const dayMin = Math.max(0, Math.round((ss - sr) / 60000));
  const dlH = Math.floor(dayMin / 60), dlM = dayMin % 60;
  const goldenStr = hhmm(ss - 3600000);

  // bottom ribbon (3 figures)
  const ribbon = [
    { k: "daylight", val: `${dlH}H ${pad2(dlM)}M` },
    { k: isDay ? "high" : "low", val: `${round(isDay ? daily.temperature_2m_max[0] : daily.temperature_2m_min[0])}°`,
      k2: isDay ? "low" : "high", val2: `${round(isDay ? daily.temperature_2m_min[0] : daily.temperature_2m_max[0])}°` },
    isDay ? { k: "goldenHour", val: goldenStr } : { k: "humidity", val: `${round(cur.relative_humidity_2m)}%` },
  ];

  return (
    <div ref={stageRef} className="absolute inset-0" style={{ overflow: "hidden" }}>
      <TodayArc p={p} isDay={isDay} accent={accent} active={active} />

      {/* OVERLAYS — non-interactive, crisp text on top of the canvas glow */}
      <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
        {/* section header */}
        <div className="absolute flex items-baseline justify-between"
          style={{ left: 96, right: 96, top: 168 }}>
          <span style={{ fontSize: 24, letterSpacing: "0.2em", fontWeight: 600 }}>
            <RotatingLabel k="daysky" className="text-white/65" offset={0} />
          </span>
          <span className="text-white/40" style={{ fontSize: 16, letterSpacing: "0.32em", fontWeight: 500 }}>
            AKTAU · CASPIAN
          </span>
        </div>

        {/* current temperature living in the bowl of the arc */}
        <div className="absolute text-center today-rise"
          style={{ left: "50%", top: 392, transform: "translateX(-50%)", animationDelay: "260ms" }}>
          <div style={{ fontSize: 168, fontWeight: 200, lineHeight: 0.9, letterSpacing: "-0.04em" }}>
            {round(cur.temperature_2m)}°
          </div>
          <div className="text-white/70" style={{ fontSize: 30, letterSpacing: "0.04em", marginTop: 10 }}>
            {w[lang]}
          </div>
          <div className="text-white/40" style={{ fontSize: 18, letterSpacing: "0.16em", marginTop: 12, fontWeight: 600 }}>
            <RotatingLabel k="feels" offset={1} /> {data.sea?.temp != null ? `${round(data.sea.temp)}°` : "--°"}
          </div>
        </div>

        {/* NOW bead tag */}
        <div className="absolute" style={{
          left: bx, top: by - 96, transform: "translate(-50%, 0)",
          animation: "nowFloat 4s ease-in-out infinite",
        }}>
          <div className="flex flex-col items-center" style={{ gap: 6 }}>
            <span style={{
              fontSize: 14, letterSpacing: "0.34em", fontWeight: 700,
              color: accent,
            }}>
              <RotatingLabel k="nowLbl" offset={0} />
            </span>
            <span className="tabular-nums" style={{ fontSize: 28, fontWeight: 500, color: "#fff" }}>
              {fmtClock(now)}
            </span>
            <span style={{ width: 1, height: 26, background: `linear-gradient(${accent}, transparent)` }} />
          </div>
        </div>

        {/* horizon anchors: sunrise / sunset */}
        <ArcAnchor x={x0} y={horizonY} k={leftKey} time={leftTime} accent={accent} delay={460} />
        <ArcAnchor x={x1} y={horizonY} k={rightKey} time={rightTime} accent={accent} delay={560} align="right" />

        {/* bottom ribbon */}
        <div className="absolute today-rise" style={{
          left: "50%", bottom: 96, transform: "translateX(-50%)",
          display: "flex", alignItems: "center", gap: 0, animationDelay: "680ms",
        }}>
          {ribbon.map((r, i) => (
            <div key={i} className="text-center" style={{
              padding: "0 64px",
              borderLeft: i ? "1px solid rgba(255,255,255,0.14)" : "none",
            }}>
              <div className="text-white/55" style={{ fontSize: 17, letterSpacing: "0.22em", fontWeight: 600 }}>
                <RotatingLabel k={r.k} offset={i} />
              </div>
              <div className="tabular-nums" style={{ fontSize: 46, fontWeight: 300, marginTop: 10, color: "#fff" }}>
                {r.k2 ? (
                  <span>
                    {r.val}
                    <span className="text-white/30" style={{ margin: "0 12px", fontSize: 30 }}>·</span>
                    <span className="text-white/65">{r.val2}</span>
                  </span>
                ) : r.val}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ArcAnchor({ x, y, k, time, accent, delay, align }) {
  return (
    <div className="absolute today-rise" style={{
      left: x, top: y + 26, transform: "translateX(-50%)",
      textAlign: "center", animationDelay: `${delay}ms`,
    }}>
      <div style={{ fontSize: 16, letterSpacing: "0.26em", fontWeight: 600, color: accent }}>
        <RotatingLabel k={k} offset={0} />
      </div>
      <div className="tabular-nums" style={{ fontSize: 40, fontWeight: 300, marginTop: 8, color: "rgba(255,255,255,0.92)" }}>
        {time}
      </div>
    </div>
  );
}

// ============================================================================
// SCREEN ROOT — background continuous, content rotates
// ============================================================================
function VariantAtmosphere({ flythrough = false, flySpeed = 1, previewWeather = "live" }) {
  const { data, error } = useWeather();
  const tzOff = data?.utc_offset_seconds;
  const now = useCityClock(tzOff);
  const heroLang = useLang(5000, 0);
  const viewIdx = useRotation(3, 15000);

  if (error && !data) {
    return (
      <div className="w-full h-full grid place-items-center text-white/80 bg-[#0a0a14]">
        <div>Network error · {error}</div>
      </div>
    );
  }
  if (!data) return <div className="w-full h-full bg-[#0a0a14]" />;

  const cur = data.current;
  const daily = data.daily;
  const isDay = !!cur.is_day;
  const liveW = wmo(cur.weather_code);

  // Preview-weather override (Tweaks): force any condition for review. Maps a
  // menu choice to an effective scene + intensity; "live" uses the real API.
  const PREVIEW = {
    rain:      { scene: "rain",    intensity: 0.62 },
    heavyrain: { scene: "rain",    intensity: 1.0  },
    snow:      { scene: "snow",    intensity: 0.55 },
    blizzard:  { scene: "snow",    intensity: 1.0  },
    fog:       { scene: "fog",     intensity: 0.85 },
    thunder:   { scene: "thunder", intensity: 0.95 },
    dust:      { scene: "dust",    intensity: 0.8  },
    freezing:  { scene: "sleet",   intensity: 0.8  },
    heat:      { scene: "heat",    intensity: 0.85 },
    wind:      { scene: "wind",    intensity: 0.85 },
    clear:     { scene: "clear",   intensity: 0    },
    cloudy:    { scene: "cloudy",  intensity: 0    },
  };
  const ov = previewWeather !== "live" ? PREVIEW[previewWeather] : null;
  const effScene = ov ? ov.scene : liveW.scene;
  const effIntensity = ov ? ov.intensity : sceneIntensity(cur.weather_code);
  // Keep the label/text reading from live data; only visuals follow the preview.
  const w = liveW;
  const bg = backgroundFor(effScene, isDay);
  const sun = sunProgress(now, daily.sunrise[0], daily.sunset[0]);

  // FX renders for any precipitating/dusty scene; clear & cloudy stay handled
  // by the LivingSky alone. During flythrough we still honour an explicit preview.
  const fxScene = effScene;
  const showFX = (fxScene === "rain" || fxScene === "snow" || fxScene === "thunder" || fxScene === "fog" || fxScene === "dust" || fxScene === "sleet" || fxScene === "heat" || fxScene === "wind")
    && (ov != null || !flythrough);

  return (
    <div
      className="relative w-full h-full overflow-hidden text-white"
      style={{
        fontFamily: "Manrope, ui-sans-serif, system-ui",
        background: "#05060d",
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {/* CONTINUOUS BACKGROUND — cinematic living sky (never transitions) */}
      <LivingSky
        scene={effScene}
        isDay={isDay}
        sunProgress={sun}
        sunriseISO={daily.sunrise[0]}
        sunsetISO={daily.sunset[0]}
        now={now}
        tempC={cur.temperature_2m}
        windDir={cur.wind_direction_10m}
        windSpeed={cur.wind_speed_10m}
        flythrough={flythrough}
        flySpeed={flySpeed}
      />
      {/* Cinematic weather overlay — depth-layered rain/snow/fog/lightning/dust */}
      {showFX && (
        <WeatherFX
          scene={fxScene}
          intensity={effIntensity}
          isDay={isDay}
          windDir={cur.wind_direction_10m}
          windSpeed={cur.wind_speed_10m}
          glow={bg.glow}
        />
      )}

      {/* CONTINUOUS TOP BAR (1.5× billboard scale) — logo · location · live/time */}
      <div
        className="absolute top-0 left-0 right-0 grid items-center"
        style={{ padding: "44px 80px", gridTemplateColumns: "1fr auto 1fr" }}
      >
        <QalavisionMark className="text-white" size="lg" />

        {/* CENTER — coordinates earn the empty middle (city stays bold in the hero) */}
        <div className="flex flex-col items-center" style={{ gap: 7 }}>
          <span style={{ fontSize: 15, letterSpacing: "0.5em", fontWeight: 600, color: "rgba(255,255,255,0.55)" }}>
            CASPIAN SEABOARD
          </span>
          <span className="text-white/35" style={{ fontSize: 13, letterSpacing: "0.4em", fontWeight: 500 }}>
            43.65°N · 51.16°E
          </span>
        </div>

        {/* RIGHT — live status + clock */}
        <div className="flex items-center justify-end gap-6">
          <LivePill offset={2} />
          <span style={{ fontSize: 34, letterSpacing: "0.04em", fontWeight: 500 }} className="text-white/95 tabular-nums">
            {fmtClock(now)}
          </span>
          <span className="text-white/25" style={{ fontSize: 18 }}>·</span>
          <span className="text-white/65" style={{ fontSize: 21, letterSpacing: "0.24em", fontWeight: 500 }}>
            {fmtDate(now, heroLang)}
          </span>
        </div>
      </div>

      {/* ROTATING CONTENT LAYER */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute inset-0 view-fade"
          style={{ opacity: viewIdx === 0 ? 1 : 0 }}
        >
          <ViewAtmosphere data={data} now={now} heroLang={heroLang} w={w} bg={bg} sun={sun} />
        </div>
        <div
          className="absolute inset-0 view-fade"
          style={{ opacity: viewIdx === 1 ? 1 : 0 }}
        >
          <ViewHero data={data} heroLang={heroLang} w={w} bg={bg} />
        </div>
        <div
          className="absolute inset-0 view-fade"
          style={{ opacity: viewIdx === 2 ? 1 : 0 }}
        >
          <ViewToday data={data} now={now} heroLang={heroLang} w={w} bg={bg} active={viewIdx === 2} />
        </div>
      </div>

      {/* DOT INDICATOR */}
      <DotIndicator count={3} active={viewIdx} />
    </div>
  );
}

// Confident broadcast-style LIVE indicator (a refined pill, not a dev dot).
function LivePill({ offset = 2 }) {
  return (
    <span
      className="flex items-center"
      style={{
        gap: 11,
        padding: "9px 18px 9px 15px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.14)",
      }}
    >
      <span className="relative inline-flex" style={{ width: 11, height: 11 }}>
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: "#ff5e5e", animation: "liveRing 1.8s ease-out infinite" }}
        />
        <span
          className="relative inline-block rounded-full"
          style={{ width: 11, height: 11, background: "#ff5e5e", boxShadow: "0 0 12px #ff5e5e" }}
        />
      </span>
      <RotatingLabel k="live" className="text-white/85" offset={offset} />
    </span>
  );
}

function DotIndicator({ count, active }) {
  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-center"
      style={{ bottom: 28, gap: 10 }}
    >
      {Array.from({ length: count }).map((_, i) => {
        const on = i === active;
        return (
          <span
            key={i}
            style={{
              width: on ? 24 : 8,
              height: 8,
              borderRadius: on ? 4 : "50%",
              background: "#fff",
              opacity: on ? 1 : 0.25,
              transition: "width 300ms ease, opacity 300ms ease, border-radius 300ms ease",
            }}
          />
        );
      })}
    </div>
  );
}

// ============================================================================
// Bottom-strip stats — floating on the gradient, divided by hairlines (no cards)
// ============================================================================
function StatShell({ i, k, offset, children }) {
  return (
    <div style={{ padding: "38px 46px 16px", borderLeft: i ? "1px solid rgba(255,255,255,0.10)" : "none" }}>
      <div style={{ fontSize: 24, letterSpacing: "0.2em", fontWeight: 600 }}>
        <RotatingLabel k={k} offset={offset} className="text-white/60" />
      </div>
      <div style={{ marginTop: 20 }}>{children}</div>
    </div>
  );
}

function BigNum({ value, unit, unitSize = 38 }) {
  return (
    <div className="flex items-end" style={{ gap: 6, lineHeight: 0.8 }}>
      <span style={{ fontSize: 104, fontWeight: 200 }}>{value}</span>
      {unit ? <span style={{ fontSize: unitSize, fontWeight: 300, opacity: 0.72, marginBottom: 9 }}>{unit}</span> : null}
    </div>
  );
}

function StatFeels({ i, value, actual }) {
  // value = Caspian sea-surface temperature (api/sea.js, NOAA satellite blend).
  const delta = value != null ? value - actual : 0;
  const phrase = value == null
    ? { en: "Updating\u2026", ru: "Обновление\u2026", kz: "Жаңартылуда\u2026" }
    : Math.abs(delta) < 1.2
      ? { en: "Same as the air", ru: "Как воздух", kz: "Ауамен бірдей" }
      : delta < 0
        ? { en: "Cooler than the air", ru: "Прохладнее воздуха", kz: "Ауадан салқын" }
        : { en: "Warmer than the air", ru: "Теплее воздуха", kz: "Ауадан жылы" };
  const lang = useLang(5000, 1);
  return (
    <StatShell i={i} k="feels" offset={1}>
      <BigNum value={value != null ? round(value) : "--"} unit="°" />
      <div className="text-white/60" style={{ fontSize: 19, letterSpacing: "0.03em", marginTop: 16 }}>
        {phrase[lang]}
      </div>
    </StatShell>
  );
}

function StatHumidity({ i, value }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <StatShell i={i} k="humidity" offset={2}>
      <BigNum value={round(value)} unit="%" unitSize={34} />
      <div className="relative" style={{ height: 7, borderRadius: 4, background: "rgba(255,255,255,0.12)", marginTop: 22 }}>
        <div className="absolute top-0 left-0 h-full" style={{
          width: `${pct}%`, borderRadius: 3,
          background: "linear-gradient(90deg, rgba(150,210,255,0.55), rgba(255,255,255,0.9))",
          boxShadow: "0 0 14px rgba(150,210,255,0.4)",
        }} />
      </div>
    </StatShell>
  );
}

function StatWind({ i, speed, dir }) {
  return (
    <div style={{ padding: "38px 46px 16px", borderLeft: "1px solid rgba(255,255,255,0.10)" }}>
      <div style={{ fontSize: 24, letterSpacing: "0.2em", fontWeight: 600 }}>
        <RotatingLabel k="wind" offset={0} className="text-white/60" />
      </div>
      <div className="flex items-end justify-between" style={{ marginTop: 20 }}>
        <div>
          <div className="flex items-baseline" style={{ gap: 7, lineHeight: 0.8 }}>
            <span style={{ fontSize: 104, fontWeight: 200 }}>{round(speed)}</span>
            <span style={{ fontSize: 18, fontWeight: 500, opacity: 0.62, letterSpacing: "0.16em" }}>KM/H</span>
          </div>
          <div className="text-white/65" style={{ fontSize: 18, letterSpacing: "0.16em", marginTop: 12 }}>
            {compass(dir)} · {Math.round(dir)}°
          </div>
        </div>
        <div className="relative" style={{ width: 112, height: 112, alignSelf: "center", flexShrink: 0 }}>
          <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.22)" }} />
          <div className="absolute inset-0 grid place-items-center">
            <div style={{
              width: 4, height: 50, background: "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.2) 100%)",
              borderRadius: 4, transform: `rotate(${dir}deg)`, transformOrigin: "center 90%",
              transition: "transform 1s ease",
            }} />
          </div>
          <div className="absolute" style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
        </div>
      </div>
    </div>
  );
}

function StatUV({ i, value }) {
  const s = uvScale(value);
  const pct = Math.max(0, Math.min(11, value || 0)) / 11;
  return (
    <StatShell i={i} k="uv" offset={1}>
      <div className="flex items-end" style={{ gap: 12, lineHeight: 0.8 }}>
        <span style={{ fontSize: 104, fontWeight: 200 }}>{round(value)}</span>
        <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.18em", marginBottom: 15, color: s.color }}>
          {s.label}
        </span>
      </div>
      <div className="relative" style={{ height: 9, borderRadius: 5, marginTop: 22, background: "linear-gradient(90deg, #5ec27a, #f0c243, #f08c43, #e15252, #9b5de5)" }}>
        <div className="absolute" style={{
          left: `calc(${pct * 100}% - 9px)`, top: -4.5,
          width: 18, height: 18, borderRadius: "50%", background: "#fff",
          border: "2px solid rgba(0,0,0,0.3)", boxShadow: "0 0 12px rgba(255,255,255,0.6)",
        }} />
      </div>
    </StatShell>
  );
}

function StatAir({ i, value, pm25 }) {
  const s = aqiScale(value);
  return (
    <StatShell i={i} k="air" offset={2}>
      <div className="flex items-end" style={{ gap: 12, lineHeight: 0.8 }}>
        <span style={{ fontSize: 104, fontWeight: 200 }}>{value != null ? Math.round(value) : "—"}</span>
        <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: "0.18em", marginBottom: 15, color: s.color }}>
          {s.label}
        </span>
      </div>
      <div className="text-white/55" style={{ fontSize: 17, letterSpacing: "0.14em", marginTop: 22 }}>
        PM2.5 · {pm25 != null ? pm25.toFixed(1) : "—"} μg/m³
      </div>
    </StatShell>
  );
}

window.VariantAtmosphere = VariantAtmosphere;
