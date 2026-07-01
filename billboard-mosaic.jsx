// Variant 2 — "Mosaic": calm bento with 3 rotating views.
//
// Architecture mirrors Atmosphere: background + top bar continuous,
// only the content layer cross-fades between views every 15s.
//
// View 1 — "Now"        : 6-tile semantic bento (hero + sea + sun + comfort + wind + exposure)
// View 2 — "Hourly"     : next 12 hours, sparkline + condition glyphs + precip bars
// View 3 — "Outlook"    : 10-day forecast with range bars

const isDarkSceneM = (scene, isDay) =>
  scene === "rain" || scene === "thunder" || scene === "fog" ||
  (scene === "cloudy" && !isDay);

function MosaicTile({ children, className = "", style, scene, isDay, accent }) {
  const dark = isDarkSceneM(scene, isDay);
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] ${className}`}
      style={{
        background: dark ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.12)",
        backdropFilter: dark ? "blur(24px)" : "blur(16px)",
        WebkitBackdropFilter: dark ? "blur(24px)" : "blur(16px)",
        boxShadow: "0 10px 36px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.07)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

// Broadcast-style LIVE pill (mirrors Atmosphere's), sized for the Mosaic bar.
function MLivePill({ offset = 2 }) {
  return (
    <span className="flex items-center" style={{ gap: 9, padding: "7px 14px 7px 12px", borderRadius: 999, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.14)" }}>
      <span className="relative inline-flex" style={{ width: 9, height: 9 }}>
        <span className="absolute inset-0 rounded-full" style={{ background: "#ff5e5e", animation: "liveRing 1.8s ease-out infinite" }} />
        <span className="relative inline-block rounded-full" style={{ width: 9, height: 9, background: "#ff5e5e", boxShadow: "0 0 10px #ff5e5e" }} />
      </span>
      <RotatingLabel k="live" className="text-white/85" offset={offset} />
    </span>
  );
}

function MHeader({ k, offset = 0, suffix, fallback }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
      {fallback
        ? <span className="text-white/55" style={{ fontSize: 13, letterSpacing: "0.28em", fontWeight: 600 }}>{fallback}</span>
        : <RotatingLabel k={k} offset={offset} className="text-white/55" />}
      {suffix}
    </div>
  );
}

// ============================================================================
// SHARED: Hero block reused by view 1 (the "now" tile)
// ============================================================================
function HeroBlock({ data, heroLang, w, bg, scene, isDay }) {
  const cur = data.current;
  const daily = data.daily;
  return (
    <div className="absolute inset-0 p-10 flex flex-col justify-between">
      {/* Oversized glyph bleeding off the top-right corner */}
      <div className="absolute" style={{ top: -40, right: -30, opacity: 0.9, transform: "scale(1.9)", transformOrigin: "top right" }}>
        <MosaicGlyph scene={w.scene} isDay={isDay} />
      </div>

      <div className="flex items-center justify-between" style={{ position: "relative", zIndex: 1 }}>
        <span style={{ fontSize: 14, letterSpacing: "0.32em", fontWeight: 600 }} className="text-white/65">
          <RotatingLabel k="today" offset={0} /> · 43.65°N · 51.16°E
        </span>
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        <div
          key={"cond-"+heroLang}
          className="rot-label text-white/85"
          style={{ fontSize: 40, fontWeight: 300, letterSpacing: "0.01em", marginBottom: 4 }}
        >
          {w[heroLang]}
        </div>
        <div className="flex items-end" style={{ gap: 30 }}>
          <div className="flex items-start" style={{ lineHeight: 0.78 }}>
            <span style={{ fontSize: 360, fontWeight: 200, letterSpacing: "-0.04em",
              background: "linear-gradient(180deg, #ffffff 0%, rgba(255,255,255,0.72) 100%)",
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              {round(cur.temperature_2m)}
            </span>
            <span style={{ fontSize: 96, fontWeight: 200, marginTop: 28, marginLeft: 4, opacity: 0.8 }}>°</span>
          </div>
          {/* HIGH / LOW tucked beside the baseline, much quieter */}
          <div style={{ marginBottom: 40 }} className="flex items-center gap-3">
            <span className="text-white/45" style={{ fontSize: 13, letterSpacing: "0.28em", fontWeight: 600 }}>
              <RotatingLabel k="high" offset={0} />
            </span>
            <span style={{ fontSize: 30, fontWeight: 300 }}>{round(daily.temperature_2m_max[0])}°</span>
            <span className="text-white/25" style={{ fontSize: 20 }}>·</span>
            <span className="text-white/45" style={{ fontSize: 13, letterSpacing: "0.28em", fontWeight: 600 }}>
              <RotatingLabel k="low" offset={2} />
            </span>
            <span className="text-white/70" style={{ fontSize: 30, fontWeight: 300 }}>{round(daily.temperature_2m_min[0])}°</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VIEW 1 — "Now": 6-tile semantic bento
// ============================================================================
function ViewNow({ data, now, heroLang, w, bg, scene, isDay }) {
  const cur = data.current;
  const daily = data.daily;
  const aqi = data.air?.current?.european_aqi;
  const uv  = daily.uv_index_max?.[0];
  const marine = data.marine?.current;
  const phrase = comfortPhrase(cur, uv, marine?.wave_height);

  return (
    <div className="absolute" style={{ left: 44, right: 44, top: 96, bottom: 80 }}>
      <div
        className="grid h-full w-full"
        style={{
          gridTemplateColumns: "repeat(12, 1fr)",
          gridTemplateRows: "repeat(6, 1fr)",
          gap: 16,
        }}
      >
        {/* HERO 7×4 */}
        <MosaicTile scene={scene} isDay={isDay} style={{ gridColumn: "span 7", gridRow: "span 4" }}>
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(80% 60% at 30% 40%, ${bg.glow}26, transparent 70%)` }}
          />
          <HeroBlock data={data} heroLang={heroLang} w={w} bg={bg} scene={scene} isDay={isDay} />
        </MosaicTile>

        {/* SEA 5×2 — the accent tile (Aktau is a Caspian port) */}
        <MosaicTile scene={scene} isDay={isDay} style={{ gridColumn: "span 5", gridRow: "span 2" }}>
          <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(34,98,140,0.55) 0%, rgba(20,58,92,0.35) 55%, transparent 100%)" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(90% 120% at 100% 100%, rgba(110,190,235,0.28), transparent 60%)" }} />
          <div className="relative h-full">
            <SeaTile marine={marine} heroLang={heroLang} />
          </div>
        </MosaicTile>

        {/* SUN 5×2 */}
        <MosaicTile scene={scene} isDay={isDay} style={{ gridColumn: "span 5", gridRow: "span 2" }}>
          <SunTile daily={daily} now={now} heroLang={heroLang} />
        </MosaicTile>

        {/* COMFORT 4×2 */}
        <MosaicTile scene={scene} isDay={isDay} style={{ gridColumn: "span 4", gridRow: "span 2" }}>
          <ComfortTile cur={cur} phrase={phrase} heroLang={heroLang} />
        </MosaicTile>

        {/* WIND 4×2 */}
        <MosaicTile scene={scene} isDay={isDay} style={{ gridColumn: "span 4", gridRow: "span 2" }}>
          <WindTile cur={cur} />
        </MosaicTile>

        {/* EXPOSURE 4×2 */}
        <MosaicTile scene={scene} isDay={isDay} style={{ gridColumn: "span 4", gridRow: "span 2" }}>
          <ExposureTile uv={uv} aqi={aqi} air={data.air?.current} />
        </MosaicTile>
      </div>
    </div>
  );
}

// ============================================================================
// VIEW 2 — "Hourly": next 12 hours
// ============================================================================
// Compact, clean SVG icon set for hourly forecast — day/night aware,
// scales crisply at billboard distance unlike OS emoji rendering.
function WeatherIcon({ code, isDay = true, size = 56 }) {
  // Color tokens
  const sun  = "#ffd166";
  const moon = "#e6e0c0";
  const cloud = "rgba(255,255,255,0.92)";
  const cloudDim = "rgba(255,255,255,0.7)";
  const drop = "#9ed4ff";
  const flake = "#e9f3ff";
  const bolt = "#ffd166";
  const fog  = "rgba(220,228,240,0.8)";

  const Sun = () => (
    <g>
      <circle cx="32" cy="32" r="12" fill={sun} />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i * Math.PI) / 4;
        const x1 = 32 + Math.cos(a) * 18, y1 = 32 + Math.sin(a) * 18;
        const x2 = 32 + Math.cos(a) * 26, y2 = 32 + Math.sin(a) * 26;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={sun} strokeWidth="3" strokeLinecap="round" />;
      })}
    </g>
  );

  const Moon = () => (
    <path d="M40 18 a 16 16 0 1 0 12 28 a 13 13 0 0 1 -12 -28 z" fill={moon} />
  );

  const Cloud = ({ x = 32, y = 36, scale = 1, fill = cloud }) => (
    <g transform={`translate(${x - 32*scale}, ${y - 24*scale}) scale(${scale})`}>
      <path d="M16 32 a 10 10 0 0 1 8 -18 a 14 14 0 0 1 26 4 a 8 8 0 0 1 4 14 z" fill={fill} />
    </g>
  );

  // -- Render by code --
  if (code === 0 || code === 1) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        {isDay ? <Sun /> : <Moon />}
      </svg>
    );
  }
  if (code === 2) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <g transform="translate(8, -6) scale(0.7)">{isDay ? <Sun /> : <Moon />}</g>
        <Cloud x={36} y={42} scale={0.95} />
      </svg>
    );
  }
  if (code === 3) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <Cloud x={26} y={32} scale={0.7} fill={cloudDim} />
        <Cloud x={36} y={38} scale={0.95} />
      </svg>
    );
  }
  if (code === 45 || code === 48) {
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <Cloud x={32} y={28} scale={0.9} fill={fog} />
        {[0, 1, 2].map(i => (
          <line key={i} x1="10" y1={42 + i * 6} x2="54" y2={42 + i * 6}
            stroke={fog} strokeWidth="3" strokeLinecap="round" opacity={0.8 - i * 0.18} />
        ))}
      </svg>
    );
  }
  if ((code >= 51 && code <= 55) || (code >= 61 && code <= 65) || (code >= 80 && code <= 82)) {
    // Rain
    const drops = code >= 65 || code === 82 ? 5 : code >= 53 ? 4 : 3;
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <Cloud x={32} y={26} scale={1} />
        {Array.from({ length: drops }).map((_, i) => {
          const x = 16 + i * (32 / Math.max(1, drops - 1));
          return (
            <path key={i} d={`M ${x} 44 l 2 8 a 3 3 0 1 1 -4 0 z`} fill={drop} />
          );
        })}
      </svg>
    );
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    // Snow
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <Cloud x={32} y={24} scale={1} />
        {[18, 32, 46].map((x, i) => (
          <g key={i} transform={`translate(${x}, ${48 + (i % 2) * 4})`} stroke={flake} strokeWidth="2" strokeLinecap="round">
            <line x1="0" y1="-5" x2="0" y2="5" />
            <line x1="-5" y1="0" x2="5" y2="0" />
            <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" />
            <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" />
          </g>
        ))}
      </svg>
    );
  }
  if (code >= 95) {
    // Thunder
    return (
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <Cloud x={32} y={24} scale={1} />
        <path d="M30 40 L24 52 L30 52 L26 60 L40 46 L34 46 L38 40 Z" fill={bolt} />
      </svg>
    );
  }
  // Default: cloud
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <Cloud x={32} y={36} scale={1} />
    </svg>
  );
}

// Dedupe pass: keep first, last, the "now" point (index 0 is already first),
// every change in rounded temp, and any local extremum.
function markVisibleLabels(hours) {
  const N = hours.length;
  return hours.map((h, i) => {
    const t = Math.round(h.temp);
    if (i === 0 || i === N - 1) return { ...h, _show: true };
    const prev = Math.round(hours[i - 1].temp);
    const next = Math.round(hours[i + 1].temp);
    const isLocalExtremum = (t > prev && t > next) || (t < prev && t < next);
    return { ...h, _show: t !== prev || isLocalExtremum };
  });
}

function ViewHourly({ data, now, heroLang, w, bg }) {
  const cur = data.current;
  const daily = data.daily;
  const rawHours = nextHours(data.hourly, now, 12);
  if (!rawHours.length) return null;
  const hours = markVisibleLabels(rawHours);

  // Sparkline geometry — wide aspect so it fills the tile vertically too
  const W = 1700, H = 600;
  const padX = 80, padTop = 110, padBottom = 170;
  const tempPad = 3;
  const minT = Math.min(...hours.map(h => h.temp)) - tempPad;
  const maxT = Math.max(...hours.map(h => h.temp)) + tempPad;
  const xAt = (i) => padX + (i / (hours.length - 1)) * (W - padX * 2);
  const yAt = (t) => padTop + (1 - (t - minT) / (maxT - minT)) * (H - padTop - padBottom);

  // Smooth curve via Catmull-Rom → cubic Bezier
  const pts = hours.map((h, i) => [xAt(i), yAt(h.temp)]);
  let linePath = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    linePath += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2[0]} ${p2[1]}`;
  }
  const areaPath = `${linePath} L ${pts[pts.length - 1][0]} ${H - padBottom} L ${pts[0][0]} ${H - padBottom} Z`;

  const isDay = !!cur.is_day;

  return (
    <div className="absolute" style={{ left: 44, right: 44, top: 110, bottom: 80 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 24 }}>
        <RotatingLabel
          k="hourly"
          className="text-white/80"
          offset={0}
        />
        <span
          className="text-white/55"
          style={{ fontSize: 22, letterSpacing: "0.32em", fontWeight: 700 }}
        >
          AKTAU · 43.65°N
        </span>
      </div>

      <div className="grid" style={{
        gridTemplateColumns: "480px 1fr",
        gap: 18,
        height: "calc(100% - 56px)",
      }}>
        {/* "Now" summary card */}
        <MosaicTile scene={w.scene} isDay={isDay}>
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(80% 60% at 50% 25%, ${bg.glow}3a, transparent 70%)` }}
          />
          <div className="relative h-full p-9 flex flex-col justify-between">
            <div>
              <MLivePill offset={0} />
              <div className="flex items-start" style={{ marginTop: 18, lineHeight: 0.78 }}>
                <span style={{ fontSize: 300, fontWeight: 200, letterSpacing: "-0.04em" }}>
                  {round(cur.temperature_2m)}
                </span>
                <span style={{ fontSize: 88, fontWeight: 200, marginTop: 22, marginLeft: 6, opacity: 0.85 }}>°</span>
              </div>
              <div
                key={"hcond-"+heroLang}
                className="rot-label text-white"
                style={{ fontSize: 44, fontWeight: 500, marginTop: 14, letterSpacing: "-0.005em" }}
              >
                {w[heroLang]}
              </div>
              <div className="text-white/75" style={{ fontSize: 24, letterSpacing: "0.08em", marginTop: 18, fontWeight: 600 }}>
                ↑ {round(daily.temperature_2m_max[0])}° · ↓ {round(daily.temperature_2m_min[0])}°
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <HourlyRow label=<RotatingLabel k="feels"    offset={1} className="text-white/85" /> value={`${round(cur.apparent_temperature)}°`} />
              <HourlyRow label=<RotatingLabel k="humidity" offset={2} className="text-white/85" /> value={`${Math.round(cur.relative_humidity_2m)}%`} />
              <HourlyRow label=<RotatingLabel k="wind"     offset={0} className="text-white/85" /> value={`${round(cur.wind_speed_10m)} ${compass(cur.wind_direction_10m)}`} />
            </div>
          </div>
        </MosaicTile>

        {/* Big chart tile */}
        <MosaicTile scene={w.scene} isDay={isDay}>
          <div className="relative h-full">
            <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="hourly-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0"   stopColor={bg.glow} stopOpacity="0.55" />
                  <stop offset="1"   stopColor={bg.glow} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="hourly-line" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0"   stopColor="#ffffff" stopOpacity="1" />
                  <stop offset="0.5" stopColor={bg.glow} stopOpacity="1" />
                  <stop offset="1"   stopColor="#ffffff" stopOpacity="0.95" />
                </linearGradient>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* dashed baseline */}
              <line x1={padX} y1={H - padBottom} x2={W - padX} y2={H - padBottom}
                stroke="rgba(255,255,255,0.18)" strokeDasharray="6 10" />

              {/* Curve area + line */}
              <path d={areaPath} fill="url(#hourly-area)" />
              <path d={linePath} fill="none" stroke="url(#hourly-line)"
                strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />

              {/* points */}
              {hours.map((h, i) => (
                <circle key={`pt${i}`} cx={xAt(i)} cy={yAt(h.temp)} r={i === 0 ? 14 : 6}
                  fill={i === 0 ? "#fff" : "rgba(255,255,255,0.85)"}
                  stroke={i === 0 ? bg.glow : "none"} strokeWidth={i === 0 ? 5 : 0}
                  style={i === 0 ? { filter: `drop-shadow(0 0 16px ${bg.glow})` } : {}} />
              ))}

              {/* Deduped temp labels above each shown point */}
              {hours.map((h, i) => {
                if (!h._show) return null;
                return (
                  <text key={`tt${i}`} x={xAt(i)} y={yAt(h.temp) - 30}
                    textAnchor="middle" fill="#fff"
                    fontSize="44" fontWeight="600"
                    style={{ fontVariantNumeric: "tabular-nums", fontFamily: "Manrope", letterSpacing: "-0.01em" }}>
                    {round(h.temp)}°
                  </text>
                );
              })}
            </svg>

            {/* Hour cards along the bottom — icons + time + precip, drawn as HTML
                for crisper text than scaled SVG <text> elements. */}
            <div
              className="absolute left-0 right-0 flex items-end"
              style={{
                bottom: 28,
                paddingLeft: `${(padX / W) * 100}%`,
                paddingRight: `${(padX / W) * 100}%`,
              }}
            >
              {hours.map((h, i) => (
                <div
                  key={`hb${i}`}
                  className="flex flex-col items-center"
                  style={{
                    flex: "1 1 0",
                    minWidth: 0,
                    gap: 8,
                    textAlign: "center",
                  }}
                >
                  <div style={{ filter: i === 0 ? `drop-shadow(0 0 12px ${bg.glow})` : "none" }}>
                    <WeatherIcon code={h.code} isDay={isDay} size={60} />
                  </div>
                  <div
                    className="tabular-nums whitespace-nowrap"
                    style={{
                      fontSize: 26,
                      letterSpacing: "0.14em",
                      fontWeight: 700,
                      color: i === 0 ? "#fff" : "rgba(255,255,255,0.9)",
                      fontFamily: "Manrope",
                    }}
                  >
                    {i === 0 ? "NOW" : `${pad2(h.hour)}:00`}
                  </div>
                  {h.pop != null && h.pop > 10 ? (
                    <div
                      className="whitespace-nowrap"
                      style={{
                        fontSize: 22, fontWeight: 700, letterSpacing: "0.04em",
                        color: "rgba(158,212,255,1)", fontFamily: "Manrope",
                      }}
                    >
                      ☂ {h.pop}%
                    </div>
                  ) : (
                    <div style={{ height: 22 }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </MosaicTile>
      </div>
    </div>
  );
}

function HourlyRow({ label, value }) {
  return (
    <div
      className="flex items-baseline justify-between"
      style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 14 }}
    >
      <span style={{ fontSize: 19, letterSpacing: "0.24em", fontWeight: 700 }}>{label}</span>
      <span className="tabular-nums" style={{ fontSize: 30, fontWeight: 500, color: "#fff", letterSpacing: "-0.005em" }}>{value}</span>
    </div>
  );
}

// ============================================================================
// VIEW 3 — "Outlook": 10-day forecast
// ============================================================================
function ViewOutlook({ data, now, heroLang, bg }) {
  const daily = data.daily;
  const cur = data.current;

  const weekMin = Math.min(...daily.temperature_2m_min);
  const weekMax = Math.max(...daily.temperature_2m_max);
  const span = Math.max(1, weekMax - weekMin);

  return (
    <div className="absolute" style={{ left: 88, right: 88, top: 110, bottom: 80 }}>
      <div className="flex items-baseline justify-between" style={{ marginBottom: 14 }}>
        <RotatingLabel k="forecast10" className="text-white/65" offset={0} />
        <span className="text-white/40" style={{ fontSize: 14, letterSpacing: "0.32em", fontWeight: 500 }}>
          AKTAU · CASPIAN
        </span>
      </div>

      <div className="flex-1 flex flex-col justify-center" style={{ height: "calc(100% - 30px)" }}>
        {daily.time.slice(0, 10).map((iso, i) => {
          const isToday = i === 0;
          const dMin = daily.temperature_2m_min[i];
          const dMax = daily.temperature_2m_max[i];
          const code = daily.weather_code[i];
          const wInfo = wmo(code);
          const leftPct  = ((dMin - weekMin) / span) * 100;
          const rightPct = ((dMax - weekMin) / span) * 100;
          const fillW = Math.max(4, rightPct - leftPct);
          const todayDot = isToday
            ? ((cur.temperature_2m - weekMin) / span) * 100
            : null;

          return (
            <MosaicForecastRow
              key={iso}
              iso={iso}
              isToday={isToday}
              lang={heroLang}
              wInfo={wInfo}
              code={code}
              dMin={dMin}
              dMax={dMax}
              leftPct={leftPct}
              fillW={fillW}
              todayDot={todayDot}
              glow={bg.glow}
            />
          );
        })}
      </div>
    </div>
  );
}

function MosaicForecastRow({ iso, isToday, lang, wInfo, code, dMin, dMax, leftPct, fillW, todayDot, glow }) {
  return (
    <div className="flex items-center"
      style={{
        height: 58,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        gap: 28,
      }}>
      <div className="flex-shrink-0" style={{
        width: 130, fontSize: 26, fontWeight: 600, letterSpacing: "0.04em",
        color: isToday ? "#fff" : "rgba(255,255,255,0.92)",
      }}>
        {dayLabel(iso, lang, isToday)}
      </div>
      <div style={{ fontSize: 26, width: 40, textAlign: "center" }}>
        {wmoEmoji(code)}
      </div>
      <div className="flex-shrink-0" style={{
        fontSize: 17, letterSpacing: "0.02em",
        color: "rgba(255,255,255,0.55)", width: 280,
      }}>
        {wInfo[lang]}
      </div>
      <div className="flex-shrink-0 text-right tabular-nums" style={{
        width: 80, fontSize: 32, fontWeight: 300, color: "rgba(255,255,255,0.85)"
      }}>
        {round(dMin)}°
      </div>
      <div className="relative flex-1" style={{ maxWidth: 380, height: 6 }}>
        <div className="absolute inset-0" style={{ background: "rgba(255,255,255,0.10)", borderRadius: 3 }} />
        <div className="absolute" style={{
          left: `${leftPct}%`, width: `${fillW}%`, top: 0, height: 6, borderRadius: 3,
          background: `linear-gradient(90deg, ${glow}55 0%, ${glow} 100%)`,
          boxShadow: `0 0 10px ${glow}40`,
        }} />
        {todayDot != null && (
          <div className="absolute" style={{
            left: `calc(${todayDot}% - 9px)`, top: -6,
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            boxShadow: "0 0 18px rgba(255,255,255,0.9), 0 0 6px rgba(255,255,255,1)",
            animation: "todayPulse 2.4s ease-in-out infinite",
          }} />
        )}
      </div>
      <div className="flex-shrink-0 tabular-nums" style={{
        width: 80, fontSize: 32, fontWeight: 500, color: "#fff"
      }}>
        {round(dMax)}°
      </div>
    </div>
  );
}

// ============================================================================
// Sub-tiles for View 1
// ============================================================================
function SeaTile({ marine, heroLang }) {
  const sst = marine?.sea_surface_temperature;
  const waveH = marine?.wave_height;
  const wScale = waveScale(waveH);
  const have = sst != null || waveH != null;

  return (
    <div className="h-full p-6 flex flex-col justify-between">
      <MHeader k="caspian" offset={1} suffix={
        <span className="text-white/40" style={{ fontSize: 12, letterSpacing: "0.22em" }}>
          {have ? "LIVE" : "—"}
        </span>
      } />

      <div className="flex items-stretch justify-between gap-4 flex-1">
        {/* Water temp */}
        <div className="flex flex-col justify-end">
          <div className="text-white/45" style={{ fontSize: 11, letterSpacing: "0.28em", marginBottom: 4 }}>
            <RotatingLabel k="water" offset={2} />
          </div>
          <div className="flex items-end">
            <span style={{ fontSize: 92, fontWeight: 200, lineHeight: 0.85 }}>
              {sst != null ? round(sst) : "—"}
            </span>
            <span style={{ fontSize: 32, fontWeight: 300, opacity: 0.7, marginBottom: 4 }}>°</span>
          </div>
        </div>

        {/* Wave viz */}
        <div className="flex-1 flex flex-col items-end justify-end" style={{ minWidth: 0 }}>
          <div className="text-white/45" style={{ fontSize: 11, letterSpacing: "0.28em", marginBottom: 4 }}>
            <RotatingLabel k="waves" offset={0} />
          </div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 60, fontWeight: 200, lineHeight: 0.85 }}>
              {waveH != null ? waveH.toFixed(1) : "—"}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.6, letterSpacing: "0.18em" }}>M</span>
          </div>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: "0.22em",
            color: wScale.color, marginTop: 6,
          }}>
            {typeof wScale.label === "object" ? wScale.label[heroLang] : wScale.label}
          </div>
        </div>

        {/* SVG wave illustration */}
        <div className="hidden md:block" style={{ width: 90 }}>
          <svg viewBox="0 0 100 80" className="w-full h-full">
            <path d="M0 50 Q 15 40, 30 50 T 60 50 T 100 50" stroke="rgba(150,210,255,0.55)" strokeWidth="2" fill="none">
              <animate attributeName="d" dur="4s" repeatCount="indefinite"
                values="M0 50 Q 15 40, 30 50 T 60 50 T 100 50;
                        M0 50 Q 15 60, 30 50 T 60 50 T 100 50;
                        M0 50 Q 15 40, 30 50 T 60 50 T 100 50" />
            </path>
            <path d="M0 62 Q 15 54, 30 62 T 60 62 T 100 62" stroke="rgba(150,210,255,0.35)" strokeWidth="1.5" fill="none">
              <animate attributeName="d" dur="5s" repeatCount="indefinite"
                values="M0 62 Q 15 54, 30 62 T 60 62 T 100 62;
                        M0 62 Q 15 70, 30 62 T 60 62 T 100 62;
                        M0 62 Q 15 54, 30 62 T 60 62 T 100 62" />
            </path>
          </svg>
        </div>
      </div>
    </div>
  );
}

function SunTile({ daily, now, heroLang }) {
  const sunriseISO = daily.sunrise[0];
  const sunsetISO  = daily.sunset[0];
  const sunriseToday = new Date(sunriseISO);
  const sunsetToday  = new Date(sunsetISO);
  const isBeforeSunrise = now < sunriseToday;
  const isBeforeSunset  = now < sunsetToday;

  // Pick next event
  let nextLabelKey, nextTimeISO;
  if (isBeforeSunrise) {
    nextLabelKey = "sunriseIn";
    nextTimeISO = sunriseISO;
  } else if (isBeforeSunset) {
    nextLabelKey = "sunsetIn";
    nextTimeISO = sunsetISO;
  } else {
    // After sunset — fall back to tomorrow's sunrise if available
    nextLabelKey = "sunriseIn";
    nextTimeISO = daily.sunrise[1] || sunriseISO;
  }
  const until = timeUntil(nextTimeISO, now);

  const sun = sunProgress(now, sunriseISO, sunsetISO);

  // Sun arc geometry
  const W = 600, H = 70;
  const cx = W/2, cy = H, r = H - 8;
  const ang = Math.PI - sun * Math.PI;
  const sx = cx + Math.cos(ang) * r;
  const sy = cy - Math.sin(ang) * r;

  return (
    <div className="h-full p-6 flex flex-col justify-between">
      <div className="flex items-start justify-between">
        <div>
          <RotatingLabel k={nextLabelKey} className="text-white/55" offset={0} />
          {until && (
            <div className="flex items-baseline gap-2" style={{ marginTop: 4 }}>
              <span style={{ fontSize: 56, fontWeight: 200, lineHeight: 0.9, letterSpacing: "-0.01em" }}>
                {until.h}<span className="text-white/45" style={{ fontSize: 22, fontWeight: 500, marginLeft: 2, marginRight: 6 }}>H</span>
                {pad2(until.m)}<span className="text-white/45" style={{ fontSize: 22, fontWeight: 500, marginLeft: 2 }}>M</span>
              </span>
            </div>
          )}
        </div>

        <div className="text-right">
          <div className="text-white/45" style={{ fontSize: 11, letterSpacing: "0.28em" }}>
            <RotatingLabel k="sunrise" offset={1} /> · <RotatingLabel k="sunset" offset={2} />
          </div>
          <div className="text-white/85 tabular-nums" style={{ fontSize: 22, fontWeight: 400, marginTop: 4 }}>
            {fmtTime(sunriseISO)} <span className="text-white/40">·</span> {fmtTime(sunsetISO)}
          </div>
        </div>
      </div>

      {/* Sun arc */}
      <div className="relative w-full" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sunarc-m" x1="0" x2="1">
              <stop offset="0" stopColor="#ff9b3d" stopOpacity="0.2" />
              <stop offset="0.5" stopColor="#ffd166" stopOpacity="0.9" />
              <stop offset="1" stopColor="#ff9b3d" stopOpacity="0.2" />
            </linearGradient>
          </defs>
          <line x1="0" y1={H-1} x2={W} y2={H-1} stroke="rgba(255,255,255,0.14)" strokeDasharray="4 4" />
          <path d={`M ${cx-r} ${H} A ${r} ${r} 0 0 1 ${cx+r} ${H}`} stroke="url(#sunarc-m)" strokeWidth="2" fill="none" />
          <circle cx={sx} cy={sy} r="8" fill="#ffd166" style={{ filter: "drop-shadow(0 0 12px rgba(255,210,100,0.7))" }} />
        </svg>
      </div>
    </div>
  );
}

function ComfortTile({ cur, phrase, heroLang }) {
  return (
    <div className="h-full p-6 flex flex-col justify-between">
      <MHeader k="comfort" offset={1} />
      <div className="flex items-end gap-2">
        <span style={{ fontSize: 84, fontWeight: 200, lineHeight: 0.85 }}>
          {round(cur.apparent_temperature)}
        </span>
        <span style={{ fontSize: 32, fontWeight: 300, opacity: 0.7, marginBottom: 6 }}>°</span>
      </div>
      <div className="flex flex-col gap-1">
        <div className="text-white/80" style={{ fontSize: 15, letterSpacing: "0.02em", lineHeight: 1.25 }}>
          {phrase[heroLang]}
        </div>
        <div className="text-white/45" style={{ fontSize: 12, letterSpacing: "0.18em", marginTop: 4 }}>
          {Math.round(cur.relative_humidity_2m)}% · {Math.round(cur.pressure_msl)} hPa
        </div>
      </div>
    </div>
  );
}

function WindTile({ cur }) {
  return (
    <div className="h-full p-6 flex flex-col justify-between">
      <MHeader k="wind" offset={0} />
      <div className="flex items-center justify-between flex-1">
        <div>
          <div className="flex items-baseline gap-2">
            <span style={{ fontSize: 80, fontWeight: 200, lineHeight: 0.85 }}>
              {round(cur.wind_speed_10m)}
            </span>
            <span style={{ fontSize: 14, fontWeight: 600, opacity: 0.6, letterSpacing: "0.18em" }}>KM/H</span>
          </div>
          <div className="text-white/65" style={{ fontSize: 15, letterSpacing: "0.18em", marginTop: 6 }}>
            {compass(cur.wind_direction_10m)} · {Math.round(cur.wind_direction_10m)}°
          </div>
        </div>
        <MosaicCompass dir={cur.wind_direction_10m} size={120} />
      </div>
    </div>
  );
}

function ExposureTile({ uv, aqi, air }) {
  const uvS = uvScale(uv);
  const aqS = aqiScale(aqi);
  return (
    <div className="h-full p-6 flex flex-col justify-between">
      <MHeader k="exposure" offset={2} />
      <div className="grid grid-cols-2 gap-4 flex-1 items-center">
        {/* UV */}
        <div>
          <div className="text-white/45" style={{ fontSize: 11, letterSpacing: "0.28em", marginBottom: 4 }}>
            <RotatingLabel k="uv" offset={0} />
          </div>
          <div className="flex items-end gap-2">
            <span style={{ fontSize: 60, fontWeight: 200, lineHeight: 0.85 }}>{round(uv)}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", color: uvS.color, marginTop: 6 }}>
            {uvS.label}
          </div>
        </div>
        {/* AQI */}
        <div>
          <div className="text-white/45" style={{ fontSize: 11, letterSpacing: "0.28em", marginBottom: 4 }}>
            <RotatingLabel k="air" offset={1} />
          </div>
          <div className="flex items-end gap-2">
            <span style={{ fontSize: 60, fontWeight: 200, lineHeight: 0.85 }}>{aqi != null ? Math.round(aqi) : "—"}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.22em", color: aqS.color, marginTop: 6 }}>
            {aqS.label}
          </div>
          {air?.pm2_5 != null && (
            <div className="text-white/40" style={{ fontSize: 10, letterSpacing: "0.18em", marginTop: 4 }}>
              PM2.5 {air.pm2_5.toFixed(1)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MosaicGlyph({ scene, isDay }) {
  if (scene === "rain" || scene === "thunder") {
    return (
      <div className="relative" style={{ width: 90, height: 70 }}>
        <div className="absolute" style={{
          left: -5, top: 5, width: 90, height: 50,
          background: "radial-gradient(60% 50% at 50% 55%, rgba(255,255,255,0.55) 0%, transparent 78%)",
          filter: "blur(8px)",
        }} />
        <svg viewBox="0 0 100 80" className="absolute inset-0 w-full h-full">
          {[0,1,2].map(i => (
            <line key={i} className="rain-stroke" style={{ animationDelay: `${i*0.18}s` }}
              x1={36+i*12} y1={50} x2={34+i*12} y2={74}
              stroke="rgba(220,235,255,0.8)" strokeWidth="2" strokeLinecap="round" />
          ))}
        </svg>
      </div>
    );
  }
  if (scene === "snow") {
    return (
      <div className="relative" style={{ width: 90, height: 70 }}>
        <div className="absolute" style={{
          left: -5, top: 5, width: 90, height: 50,
          background: "radial-gradient(60% 50% at 50% 55%, rgba(255,255,255,0.6) 0%, transparent 78%)",
          filter: "blur(8px)",
        }} />
        <svg viewBox="0 0 100 80" className="absolute inset-0 w-full h-full">
          {[0,1,2].map(i => (
            <text key={i} x={32+i*16} y={70} fill="rgba(255,255,255,0.85)" fontSize="14" className="snow-glyph" style={{ animationDelay: `${i*0.3}s`}}>❄</text>
          ))}
        </svg>
      </div>
    );
  }
  if (scene === "cloudy" || scene === "fog") {
    return (
      <div className="relative" style={{ width: 90, height: 70 }}>
        <div className="absolute cloud-drift" style={{
          left: -10, top: 8, width: 80, height: 50,
          background: "radial-gradient(60% 50% at 50% 55%, rgba(255,255,255,0.55) 0%, transparent 78%)",
          filter: "blur(10px)",
        }} />
        <div className="absolute cloud-drift" style={{
          left: 20, top: 0, width: 80, height: 50, animationDuration: "20s",
          background: "radial-gradient(60% 50% at 50% 55%, rgba(255,255,255,0.7) 0%, transparent 78%)",
          filter: "blur(10px)",
        }} />
      </div>
    );
  }
  if (!isDay) {
    return (
      <div style={{ width: 60, height: 60, borderRadius: "50%",
        background: "radial-gradient(circle at 38% 38%, #f8f0d8, #c2b483 70%, transparent 78%)",
        boxShadow: "0 0 50px rgba(255,240,200,0.3)" }} />
    );
  }
  return (
    <div className="sun-pulse" style={{ width: 64, height: 64, borderRadius: "50%",
      background: "radial-gradient(circle, #fff7d6 0%, #ffd166 50%, #ff9b3d 80%, transparent 85%)",
      boxShadow: "0 0 60px rgba(255,210,120,0.45)" }} />
  );
}

function MosaicCompass({ dir, size = 120 }) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ border: "1px solid rgba(255,255,255,0.22)" }} />
      <div className="absolute inset-2 rounded-full" style={{ border: "1px dashed rgba(255,255,255,0.14)" }} />
      {["N","E","S","W"].map((c, i) => (
        <span key={c} className="absolute text-white/55" style={{
          fontSize: 10, letterSpacing: "0.2em", fontWeight: 600,
          top: i === 0 ? 4 : i === 2 ? "auto" : "50%",
          bottom: i === 2 ? 4 : "auto",
          left: i === 3 ? 4 : i === 1 ? "auto" : "50%",
          right: i === 1 ? 4 : "auto",
          transform: (i === 0 || i === 2) ? "translateX(-50%)" : "translateY(-50%)",
        }}>{c}</span>
      ))}
      <div className="absolute inset-0 grid place-items-center">
        <div style={{
          width: 4, height: size*0.42,
          background: "linear-gradient(180deg, #fff 0%, rgba(255,255,255,0.2) 100%)",
          borderRadius: 4, transform: `rotate(${dir}deg)`, transformOrigin: "center 90%",
          transition: "transform 1s ease",
        }} />
      </div>
      <div className="absolute" style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />
    </div>
  );
}

function MDotIndicator({ count, active }) {
  return (
    <div className="absolute left-0 right-0 flex items-center justify-center" style={{ bottom: 24, gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => {
        const on = i === active;
        return (
          <span key={i} style={{
            width: on ? 24 : 8, height: 8,
            borderRadius: on ? 4 : "50%",
            background: "#fff", opacity: on ? 1 : 0.25,
            transition: "width 300ms ease, opacity 300ms ease, border-radius 300ms ease",
          }} />
        );
      })}
    </div>
  );
}

// ============================================================================
// SCREEN ROOT
// ============================================================================
function VariantMosaic() {
  const { data, error } = useWeather();
  const tzOff = data?.utc_offset_seconds;
  const now = useCityClock(tzOff);
  const heroLang = useLang(5000, 0);
  const viewIdx = useRotation(3, 15000);

  if (error && !data) {
    return (
      <div className="w-full h-full grid place-items-center text-white/80 bg-[#08080d]">
        <div>Network error · {error}</div>
      </div>
    );
  }
  if (!data) return <div className="w-full h-full bg-[#08080d]" />;

  const cur = data.current;
  const daily = data.daily;
  const isDay = !!cur.is_day;
  const w = wmo(cur.weather_code);
  const bg = backgroundFor(w.scene, isDay);

  return (
    <div
      className="relative w-full h-full overflow-hidden text-white"
      style={{
        fontFamily: "Manrope, ui-sans-serif, system-ui",
        background: `radial-gradient(120% 80% at 80% -10%, ${bg.b}aa 0%, transparent 60%), linear-gradient(180deg, ${bg.a} 0%, ${bg.c} 100%)`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {/* CONTINUOUS BACKGROUND */}
      <ParticleScene scene={w.scene} isDay={isDay} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(closest-side, ${bg.glow}1f, transparent 60%) 80% 0% / 80% 80% no-repeat` }}
      />

      {/* CONTINUOUS TOP BAR — matched to Atmosphere's billboard scale */}
      <div className="absolute top-0 left-0 right-0 grid items-center" style={{ padding: "34px 56px", gridTemplateColumns: "1fr auto 1fr" }}>
        <QalavisionMark className="text-white" size="md" />

        <div className="flex flex-col items-center" style={{ gap: 5 }}>
          <span style={{ fontSize: 18, letterSpacing: "0.46em", fontWeight: 600, color: "rgba(255,255,255,0.9)" }}>
            {T.city[heroLang]}
          </span>
          <span className="text-white/40" style={{ fontSize: 12, letterSpacing: "0.4em", fontWeight: 500 }}>
            43.65°N · 51.16°E
          </span>
        </div>

        <div className="flex items-center justify-end gap-5">
          <MLivePill offset={2} />
          <span style={{ fontSize: 27, letterSpacing: "0.04em", fontWeight: 500 }} className="text-white/95 tabular-nums">
            {fmtClock(now)}
          </span>
          <span className="text-white/25" style={{ fontSize: 15 }}>·</span>
          <span className="text-white/60" style={{ fontSize: 17, letterSpacing: "0.24em", fontWeight: 500 }}>
            {fmtDate(now, heroLang)}
          </span>
        </div>
      </div>

      {/* ROTATING CONTENT */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0 view-fade" style={{ opacity: viewIdx === 0 ? 1 : 0 }}>
          <ViewNow data={data} now={now} heroLang={heroLang} w={w} bg={bg} scene={w.scene} isDay={isDay} />
        </div>
        <div className="absolute inset-0 view-fade" style={{ opacity: viewIdx === 1 ? 1 : 0 }}>
          <ViewHourly data={data} now={now} heroLang={heroLang} w={w} bg={bg} />
        </div>
        <div className="absolute inset-0 view-fade" style={{ opacity: viewIdx === 2 ? 1 : 0 }}>
          <ViewOutlook data={data} now={now} heroLang={heroLang} bg={bg} />
        </div>
      </div>

      <MDotIndicator count={3} active={viewIdx} />
    </div>
  );
}

window.VariantMosaic = VariantMosaic;
