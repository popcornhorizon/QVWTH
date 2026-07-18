// Shared data hook, lookups, helpers, logo, label rotator
const { useState, useEffect, useLayoutEffect, useRef, useMemo } = React;

// ---------- Open-Meteo ----------
const LAT = 43.65;
const LON = 51.16;
const FORECAST_URL = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,pressure_msl&hourly=temperature_2m,weather_code,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,weather_code&timezone=auto&forecast_days=10`;
const AQ_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${LAT}&longitude=${LON}&current=european_aqi,pm10,pm2_5&timezone=auto`;
const MARINE_URL = `https://marine-api.open-meteo.com/v1/marine?latitude=${LAT}&longitude=${LON}&current=wave_height,wave_direction,wave_period,sea_surface_temperature&timezone=auto`;
// Caspian sea-surface temperature. Open-Meteo's marine model has NO Caspian
// coverage (returns null everywhere in the basin), so this is served by our
// own same-origin Vercel function (api/sea.js) which blends NOAA satellite
// analyses server-side. Same origin = no new domains for the TB50 player.
const SEA_URL = "/api/sea";

const WEATHER_CACHE_KEY = "qalavision_weather_cache_v1";

function useWeather() {
  // Hydrate instantly from the last successful fetch so a fresh page load
  // (the LED player reloads this page on every solution loop) never shows
  // a blank/black frame while waiting on the network - it shows the last
  // known-good data immediately, then updates once the new fetch resolves.
  const [data, setData] = useState(() => {
    try {
      const cached = localStorage.getItem(WEATHER_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let retryTimer = null;
    let retryDelay = 15 * 1000; // start fast: 15s, back off up to 2 min
    const REFRESH_MS = 10 * 60 * 1000;

    async function load() {
      try {
        const [w, a, m, s] = await Promise.all([
          fetch(FORECAST_URL).then((r) => r.json()),
          fetch(AQ_URL).then((r) => r.json()).catch(() => null),
          fetch(MARINE_URL).then((r) => r.json()).catch(() => null),
          fetch(SEA_URL).then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        const fresh = { ...w, air: a, marine: m, sea: s, _fetchedAt: Date.now() };
        setData(fresh);
        setError(null);
        retryDelay = 15 * 1000; // reset backoff after a success
        try {
          localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(fresh));
        } catch {
          // storage unavailable/full - non-fatal, just skip caching
        }
      } catch (e) {
        if (cancelled) return;
        setError(e.message || "Network error");
        // Retry quickly instead of sitting dark for the full 10-minute cycle -
        // a transient DNS/network blip should self-heal within seconds, not
        // leave the screen on the error frame for 10 minutes.
        retryTimer = setTimeout(load, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 2 * 60 * 1000);
      }
    }

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return { data, error };
}

// Live ticking clock locked to the city's timezone offset reported by API.
function useCityClock(timezoneOffsetSeconds) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  if (timezoneOffsetSeconds == null) return now;
  // Shift "now" by the difference between city offset and local offset
  const localOffset = -now.getTimezoneOffset() * 60;
  const delta = (timezoneOffsetSeconds - localOffset) * 1000;
  return new Date(now.getTime() + delta);
}

// ---------- WMO weather code lookup ----------
// label trilingual + scene tag for visuals
const WMO = {
  0:  { en: "Clear",            ru: "Ясно",                kz: "Ашық",            scene: "clear" },
  1:  { en: "Mostly clear",     ru: "Малооблачно",         kz: "Аз бұлтты",       scene: "clear" },
  2:  { en: "Partly cloudy",    ru: "Переменная облачность",kz: "Бұлтты болады",   scene: "cloudy" },
  3:  { en: "Overcast",         ru: "Пасмурно",            kz: "Тұманды",         scene: "cloudy" },
  45: { en: "Fog",              ru: "Туман",               kz: "Тұман",           scene: "fog" },
  48: { en: "Rime fog",         ru: "Изморозь",            kz: "Қырау",           scene: "fog" },
  51: { en: "Light drizzle",    ru: "Лёгкая морось",       kz: "Жеңіл жаңбыр",    scene: "rain" },
  53: { en: "Drizzle",          ru: "Морось",              kz: "Жаңбыр себелейді",scene: "rain" },
  55: { en: "Heavy drizzle",    ru: "Сильная морось",      kz: "Қатты жаңбыр",    scene: "rain" },
  56: { en: "Freezing drizzle", ru: "Ледяная морось",      kz: "Мұзды себелек",   scene: "sleet" },
  57: { en: "Freezing drizzle", ru: "Ледяная морось",      kz: "Мұзды себелек",   scene: "sleet" },
  61: { en: "Light rain",       ru: "Лёгкий дождь",        kz: "Жеңіл жаңбыр",    scene: "rain" },
  63: { en: "Rain",             ru: "Дождь",               kz: "Жаңбыр",          scene: "rain" },
  65: { en: "Heavy rain",       ru: "Сильный дождь",       kz: "Нөсер",           scene: "rain" },
  66: { en: "Freezing rain",    ru: "Ледяной дождь",       kz: "Мұзды жаңбыр",    scene: "sleet" },
  67: { en: "Freezing rain",    ru: "Ледяной дождь",       kz: "Мұзды жаңбыр",    scene: "sleet" },
  71: { en: "Light snow",       ru: "Небольшой снег",      kz: "Жеңіл қар",       scene: "snow" },
  73: { en: "Snow",             ru: "Снег",                kz: "Қар",             scene: "snow" },
  75: { en: "Heavy snow",       ru: "Сильный снег",        kz: "Қатты қар",       scene: "snow" },
  77: { en: "Snow grains",      ru: "Снежная крупа",       kz: "Қар түйіршіктері",scene: "snow" },
  80: { en: "Rain showers",     ru: "Ливень",              kz: "Нөсер",           scene: "rain" },
  81: { en: "Heavy showers",    ru: "Сильный ливень",      kz: "Қатты нөсер",     scene: "rain" },
  82: { en: "Violent showers",  ru: "Сильнейший ливень",   kz: "Қатты нөсер",     scene: "rain" },
  85: { en: "Snow showers",     ru: "Снежный ливень",      kz: "Қар нөсері",      scene: "snow" },
  86: { en: "Heavy snow showers",ru:"Сильный снежный ливень",kz:"Қатты қар нөсері",scene: "snow" },
  95: { en: "Thunderstorm",     ru: "Гроза",               kz: "Найзағай",        scene: "thunder" },
  96: { en: "Thunder w/ hail",  ru: "Гроза с градом",      kz: "Бұршақты найзағай",scene:"thunder" },
  99: { en: "Severe thunder",   ru: "Сильная гроза",       kz: "Қатты найзағай",  scene: "thunder" },
};
function wmo(code) { return WMO[code] || WMO[0]; }

// ---------- Trilingual labels ----------
const T = {
  city:       { en: "AKTAU",          ru: "АКТАУ",          kz: "АҚТАУ" },
  feels:      { en: "CASPIAN SEA",    ru: "КАСПИЙ",         kz: "КАСПИЙ ТЕҢІЗІ" },
  humidity:   { en: "HUMIDITY",       ru: "ВЛАЖНОСТЬ",      kz: "ЫЛҒАЛДЫЛЫҚ" },
  wind:       { en: "WIND",           ru: "ВЕТЕР",          kz: "ЖЕЛ" },
  uv:         { en: "UV INDEX",       ru: "УФ-ИНДЕКС",      kz: "УК ИНДЕКСІ" },
  air:        { en: "AIR QUALITY",    ru: "КАЧЕСТВО ВОЗДУХА",kz:"АУА САПАСЫ" },
  sunrise:    { en: "SUNRISE",        ru: "ВОСХОД",         kz: "КҮН ШЫҒУ" },
  sunset:     { en: "SUNSET",         ru: "ЗАКАТ",          kz: "КҮН БАТУ" },
  high:       { en: "HIGH",           ru: "МАКС",           kz: "ЖОҒАРЫ" },
  low:        { en: "LOW",            ru: "МИН",            kz: "ТӨМЕН" },
  pressure:   { en: "PRESSURE",       ru: "ДАВЛЕНИЕ",       kz: "ҚЫСЫМ" },
  today:      { en: "TODAY",          ru: "СЕГОДНЯ",        kz: "БҮГІН" },
  live:       { en: "LIVE",           ru: "В ЭФИРЕ",        kz: "ЭФИРДЕ" },
  forecast10: { en: "10-DAY FORECAST",ru: "ПРОГНОЗ НА 10 ДНЕЙ",kz: "10 КҮНДІК БОЛЖАМ" },
  hourly:     { en: "NEXT 12 HOURS",  ru: "БЛИЖАЙШИЕ 12 ЧАСОВ",kz: "КЕЛЕСІ 12 САҐАТ" },
  caspian:    { en: "CASPIAN SEA",    ru: "КАСПИЙ",         kz: "КАСПИЙ" },
  water:      { en: "WATER",          ru: "ВОДА",           kz: "СУ" },
  waves:      { en: "WAVES",          ru: "ВОЛНЫ",          kz: "ТОЛҚЫН" },
  sunsetIn:   { en: "SUNSET IN",      ru: "ДО ЗАКАТА",      kz: "КҮН БАТУҐА" },
  sunriseIn:  { en: "SUNRISE IN",     ru: "ДО ВОСХОДА",     kz: "КҮН ШЫғУҐА" },
  goldenHour: { en: "GOLDEN HOUR",    ru: "ЗОЛОТОЙ ЧАС",    kz: "АЛТЫН САҐАТ" },
  updated:    { en: "UPDATED",        ru: "ОБНОВЛЕНО",      kz: "ЖАНАРТЫЛДЫ" },
  exposure:   { en: "EXPOSURE",       ru: "ВОЗДЕЙСТВИЕ",    kz: "ӘСЕР" },
  comfort:    { en: "COMFORT",        ru: "КОМФОРТ",        kz: "ЮЙАЛЫҚ" },
  daylight:   { en: "DAYLIGHT",       ru: "СВЕТОВОЙ ДЕНЬ",  kz: "ЖАРЫҚ КҮН" },
  daysky:     { en: "TODAY · SKY",    ru: "СЕГОДНЯ · НЕБО", kz: "БҮГІН · АСПАН" },
  nowLbl:     { en: "NOW",            ru: "СЕЙЧАС",         kz: "ҚАЗІР" },
};

// Trilingual short day names. Index 0..6 = Sun..Sat (matches Date#getDay).
const DAYS = {
  en: ["SUN","MON","TUE","WED","THU","FRI","SAT"],
  ru: ["ВС","ПН","ВТ","СР","ЧТ","ПТ","СБ"],
  kz: ["ЖК","ДС","СС","СР","БС","ЖМ","СН"],
};
function dayLabel(isoDate, lang, isToday) {
  if (isToday) return T.today[lang];
  const d = new Date(isoDate);
  return DAYS[lang][d.getDay()];
}

// WMO code -> emoji glyph (used in the forecast list)
function wmoEmoji(code) {
  if (code === 0 || code === 1) return "☀️";
  if (code === 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 55) return "🌦️";
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) return "🌧️";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "❄️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}
const LANGS = ["en", "ru", "kz"];

// One global, orchestrated language clock. Every RotatingLabel / useLang call
// subscribes to the SAME tick, so all trilingual labels flip together (offsets
// just shift which language each starts on). This removes the faint jitter you
// get when each label runs its own independent timer.
const _langSubs = new Set();
let _langTick = 0;
let _langTimer = null;
function _ensureLangTimer() {
  if (_langTimer) return;
  _langTimer = setInterval(() => {
    _langTick = (_langTick + 1) % 30030; // big multiple of 3 to avoid drift
    _langSubs.forEach((fn) => fn(_langTick));
  }, 5000);
}
function useLang(interval = 5000, offset = 0) {
  const [tick, setTick] = useState(_langTick);
  useEffect(() => {
    _ensureLangTimer();
    _langSubs.add(setTick);
    return () => { _langSubs.delete(setTick); };
  }, []);
  return LANGS[(tick + offset) % LANGS.length];
}

// Tiny presentational label with a soft cross-fade when language flips.
// Implementation: drives opacity via React state + CSS transition (not a CSS
// keyframe). Memoized so parent re-renders (the clock ticks every second) don't
// thrash the animation.
const RotatingLabel = React.memo(function RotatingLabel({ k, className = "", offset = 0 }) {
  const lang = useLang(5000, offset);
  const text = (T[k] && T[k][lang]) || k;
  const [shown, setShown] = useState(text);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (shown === text) return;
    setVisible(false);
    const t1 = setTimeout(() => {
      setShown(text);
      setVisible(true);
    }, 280);
    return () => clearTimeout(t1);
  }, [text, shown]);

  return (
    <span
      className={`rot-label ${className}`}
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 280ms ease",
        display: "inline-block",
      }}
    >
      {shown}
    </span>
  );
});

// ---------- Numeric helpers ----------
const round = (n) => (n == null || isNaN(n) ? "—" : Math.round(n));
const pad2 = (n) => String(n).padStart(2, "0");
function fmtTime(iso, tzOffsetS) {
  if (!iso) return "—";
  // Open-Meteo returns local times already (no Z). Just parse and HH:mm.
  const d = new Date(iso);
  const h = pad2(d.getHours());
  const m = pad2(d.getMinutes());
  return `${h}:${m}`;
}
function fmtClock(d) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function fmtSeconds(d) {
  return pad2(d.getSeconds());
}
function fmtDate(d, lang = "en") {
  const months = {
    en: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],
    ru: ["янв","фев","мар","апр","май","июн","июл","авг","сен","окт","ноя","дек"],
    kz: ["қаң","ақп","нау","сәу","мам","мау","шіл","там","қыр","қаз","қар","жел"],
  };
  return `${d.getDate()} ${months[lang][d.getMonth()].toUpperCase()}`;
}
function compass(deg) {
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  return dirs[Math.round(((deg % 360) / 45)) % 8];
}
function uvScale(uv) {
  if (uv == null) return { label: "—", color: "#888" };
  if (uv < 3)  return { label: "LOW",       color: "#5ec27a" };
  if (uv < 6)  return { label: "MODERATE",  color: "#f0c243" };
  if (uv < 8)  return { label: "HIGH",      color: "#f08c43" };
  if (uv < 11) return { label: "VERY HIGH", color: "#e15252" };
  return                { label: "EXTREME", color: "#9b5de5" };
}
function aqiScale(v) {
  if (v == null) return { label: "—", color: "#888" };
  if (v <= 20)  return { label: "GOOD",       color: "#5ec27a" };
  if (v <= 40)  return { label: "FAIR",       color: "#aac95a" };
  if (v <= 60)  return { label: "MODERATE",   color: "#f0c243" };
  if (v <= 80)  return { label: "POOR",       color: "#f08c43" };
  if (v <= 100) return { label: "VERY POOR",  color: "#e15252" };
  return                { label: "HAZARDOUS", color: "#9b5de5" };
}
// Sun position: 0..1 between sunrise and sunset, clamped
function sunProgress(now, sunriseISO, sunsetISO) {
  const sr = new Date(sunriseISO).getTime();
  const ss = new Date(sunsetISO).getTime();
  const t  = now.getTime();
  return Math.max(0, Math.min(1, (t - sr) / (ss - sr)));
}

// ---------- Particle scene ----------
// Renders weather-reactive particle field appropriate to scene.
function ParticleScene({ scene = "clear", isDay = true, intensity = 1, windDir = 0, windSpeed = 0 }) {
  const ref = useRef(null);
  useEffect(() => {
    const cnv = ref.current;
    if (!cnv) return;
    const ctx = cnv.getContext("2d");
    const w = cnv.width = cnv.offsetWidth;
    const h = cnv.height = cnv.offsetHeight;
    let raf;
    let ps = [];

    // Wind → horizontal drift. windDir is the meteorological FROM-direction;
    // particles travel toward (dir+180). Screen +x = east (90°).
    const moveRad = ((windDir + 180) % 360) * Math.PI / 180;
    const windX = Math.sin(moveRad); // -1..1
    const windMag = Math.min(1.4, (windSpeed || 0) / 32); // 0..~1.4

    function reset() {
      ps = [];
      const N = scene === "rain" ? 220
            : scene === "snow" ? 140
            : scene === "thunder" ? 260
            : scene === "fog" ? 28
            : scene === "cloudy" ? 16
            : isDay ? 36 : 60; // clear day: motes; clear night: stars
      for (let i = 0; i < N; i++) ps.push(make(i));
    }
    function make() {
      if (scene === "rain" || scene === "thunder") {
        const vy = 9 + Math.random() * 8;
        return { x: Math.random()*w, y: Math.random()*h, vy, vx: windX * windMag * vy * 0.6 - 0.6, len: 14+Math.random()*16, a: 0.25+Math.random()*0.5 };
      }
      if (scene === "snow") {
        return { x: Math.random()*w, y: Math.random()*h, vy: 0.6+Math.random()*1.2, vx: windX * windMag * 1.6 + (-0.3+Math.random()*0.6), r: 1.2+Math.random()*2.4, a: 0.4+Math.random()*0.5, ph: Math.random()*Math.PI*2 };
      }
      if (scene === "fog" || scene === "cloudy") {
        return { x: Math.random()*w, y: Math.random()*h*0.8, vx: 0.15+Math.random()*0.25, r: 80+Math.random()*180, a: 0.04+Math.random()*0.06 };
      }
      if (!isDay) {
        return { x: Math.random()*w, y: Math.random()*h*0.7, r: 0.4+Math.random()*1.6, a: 0.4+Math.random()*0.6, tw: Math.random()*Math.PI*2 };
      }
      // motes
      return { x: Math.random()*w, y: Math.random()*h, vx: -0.2+Math.random()*0.4, vy: -0.1-Math.random()*0.3, r: 0.6+Math.random()*1.6, a: 0.15+Math.random()*0.25 };
    }
    reset();

    let flashT = 0;
    function tick() {
      ctx.clearRect(0,0,w,h);

      if (scene === "fog" || scene === "cloudy") {
        for (const p of ps) {
          const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
          g.addColorStop(0, `rgba(255,255,255,${p.a})`);
          g.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
          p.x += p.vx;
          if (p.x - p.r > w) p.x = -p.r;
        }
      } else if (scene === "rain" || scene === "thunder") {
        ctx.strokeStyle = "rgba(200,220,255,0.7)";
        ctx.lineWidth = 1.2;
        for (const p of ps) {
          ctx.globalAlpha = p.a;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx*2, p.y + p.len);
          ctx.stroke();
          p.x += p.vx; p.y += p.vy;
          if (p.y > h) { p.y = -p.len; p.x = Math.random()*w; }
          else if (p.x < -20) p.x = w + 10;
          else if (p.x > w + 20) p.x = -10;
        }
        ctx.globalAlpha = 1;
        if (scene === "thunder") {
          flashT -= 1;
          if (flashT <= 0 && Math.random() < 0.005) flashT = 6 + Math.random()*8;
          if (flashT > 0) {
            ctx.fillStyle = `rgba(255,255,255,${0.05 + flashT/30})`;
            ctx.fillRect(0,0,w,h);
          }
        }
      } else if (scene === "snow") {
        for (const p of ps) {
          p.ph += 0.02;
          p.x += p.vx + Math.sin(p.ph)*0.3;
          p.y += p.vy;
          if (p.y > h) { p.y = -10; p.x = Math.random()*w; }
          ctx.fillStyle = `rgba(255,255,255,${p.a})`;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
        }
      } else if (!isDay) {
        // stars
        for (const p of ps) {
          p.tw += 0.04;
          const a = p.a * (0.6 + 0.4*Math.sin(p.tw));
          ctx.fillStyle = `rgba(255,245,220,${a})`;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
        }
      } else {
        // day motes
        for (const p of ps) {
          p.x += p.vx; p.y += p.vy;
          if (p.y < -5) { p.y = h+5; p.x = Math.random()*w; }
          if (p.x < -5) p.x = w+5;
          ctx.fillStyle = `rgba(255,250,230,${p.a})`;
          ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene, isDay, windDir, windSpeed]);

  return <canvas ref={ref} className="absolute inset-0 w-full h-full pointer-events-none" />;
}

// ---------- Qalavision wordmark (placeholder until logo arrives) ----------
// size: "sm" (mosaic), "md" (default), "lg" (atmosphere billboard top bar — 1.5×)
function QalavisionMark({ className = "", small = false, size }) {
  const sz = size || (small ? "sm" : "md");
  const cfg = sz === "lg" ? { svg: 54, gap: 16, brand: 26, tag: 13 }
            : sz === "sm" ? { svg: 28, gap: 10, brand: 14, tag: 8 }
            : { svg: 36, gap: 12, brand: 18, tag: 10 };
  return (
    <div className={`flex items-center ${className}`} style={{ gap: cfg.gap }}>
      <svg width={cfg.svg} height={cfg.svg} viewBox="0 0 40 40" fill="none">
        <rect x="2" y="2" width="36" height="36" rx="2" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
        <path d="M11 11 L29 11 L29 29 L11 29 Z" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="20" cy="20" r="3.5" fill="currentColor" />
        <path d="M27 27 L33 33" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div className="flex flex-col leading-none">
        <span style={{ letterSpacing: "0.22em", fontWeight: 600, fontSize: cfg.brand }}>QALAVISION</span>
        <span style={{ letterSpacing: "0.32em", fontWeight: 400, fontSize: cfg.tag, opacity: 0.55, marginTop: 5 }}>MEDIA · AKTAU</span>
      </div>
    </div>
  );
}

// ---------- Background gradient by scene + day/night ----------
function backgroundFor(scene, isDay) {
  // Two-stop deep gradient + accent overlay
  if (scene === "thunder")            return { a: "#0b0b18", b: "#311b3f", c: "#0a0a14", glow: "#7a4cff" };
  if (scene === "sleet")              return { a: "#1b2735", b: "#3d556b", c: "#0a131d", glow: "#bcd2e6" };
  if (scene === "dust")               return { a: "#5a4326", b: "#a07a44", c: "#241a0e", glow: "#e0b070" };
  if (scene === "wind")                return isDay ? { a: "#2a567f", b: "#7aa8cf", c: "#122636", glow: "#d6e6f2" }
                                                       : { a: "#0b1422", b: "#22344a", c: "#05080f", glow: "#7d96b4" };
  if (scene === "heat")                return { a: "#3f74a8", b: "#e9c98a", c: "#7a5a30", glow: "#ffdd99" };
  if (scene === "rain")                return { a: "#0d2233", b: "#1d3b54", c: "#070d18", glow: "#3a86ff" };
  if (scene === "snow")                return { a: "#1a2a3d", b: "#456a8a", c: "#0a141f", glow: "#a8d8ff" };
  if (scene === "fog")                 return { a: "#293440", b: "#5a6772", c: "#13181f", glow: "#c0c8d2" };
  if (scene === "cloudy" && isDay)     return { a: "#3a4a60", b: "#6a7d96", c: "#1a2230", glow: "#aabbd0" };
  if (scene === "cloudy" && !isDay)    return { a: "#0e1626", b: "#26334a", c: "#06080f", glow: "#5a6e90" };
  if (isDay)                            return { a: "#1c4b91", b: "#5aa6e8", c: "#0a1d3a", glow: "#ffd166" };
  return                                { a: "#070914", b: "#1a1f3a", c: "#000003", glow: "#9b8cff" };
}

// Expose to window for sibling babel scripts
// Beaufort scale for wave height: comfort/danger label
function waveScale(h) {
  if (h == null) return { label: "—", color: "#888" };
  if (h < 0.3) return { label: { en: "CALM", ru: "ШТИЛЬ", kz: "ТЫНЫШ" }, color: "#5ec27a" };
  if (h < 0.8) return { label: { en: "LIGHT", ru: "ЛЁГКО", kz: "ЖЕҢІЛ" }, color: "#aac95a" };
  if (h < 1.5) return { label: { en: "MODERATE",ru: "СРЕДНИЕ",kz: "ОРТАША" }, color: "#f0c243" };
  if (h < 2.5) return { label: { en: "ROUGH", ru: "СИЛЬНО", kz: "ҚАТТЫ" }, color: "#f08c43" };
  return                { label: { en: "VERY ROUGH",ru:"ШТОРМ", kz:"ДАУЫЛ" }, color: "#e15252" };
}

// Time-until helper. Returns { h, m, totalMin, label } for distance from `now` to `targetISO`.
function timeUntil(targetISO, now) {
  if (!targetISO) return null;
  const t = new Date(targetISO).getTime();
  const diff = t - now.getTime();
  if (diff <= 0) return null;
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return { h, m, totalMin };
}

// Slice the hourly arrays to N entries starting AT or AFTER `now`.
function nextHours(hourly, now, n = 12) {
  if (!hourly || !hourly.time) return [];
  const t = now.getTime();
  let startIdx = hourly.time.findIndex((iso) => new Date(iso).getTime() >= t);
  if (startIdx < 0) startIdx = 0;
  const out = [];
  for (let i = 0; i < n && startIdx + i < hourly.time.length; i++) {
    const k = startIdx + i;
    out.push({
      iso: hourly.time[k],
      hour: new Date(hourly.time[k]).getHours(),
      temp: hourly.temperature_2m[k],
      code: hourly.weather_code[k],
      pop: hourly.precipitation_probability ? hourly.precipitation_probability[k] : null,
    });
  }
  return out;
}

// Context-aware comfort phrase for the current conditions, trilingual.
function comfortPhrase(cur, uv, wave) {
  const t = cur.temperature_2m;
  const w = cur.wind_speed_10m;
  const h = cur.relative_humidity_2m;
  if (w > 35) return { en: "Strong wind · hold on to things", ru: "Сильный ветер", kz: "Қатты жел" };
  if (uv != null && uv >= 8) return { en: "High UV · cover up outdoors", ru: "Высокий УФ · берегите кожу", kz: "Жоғары УК · жабылыңыз" };
  if (t >= 30) return { en: "Hot · stay hydrated", ru: "Жарко · пейте воду", kz: "Ыстық · су ішіңіз" };
  if (t <= 0) return { en: "Freezing · layer up", ru: "Мороз · оденьтесь теплее", kz: "Аяз · жылы киініңіз" };
  if (t <= 10) return { en: "Cool · a light jacket", ru: "Прохладно · лёгкая куртка", kz: "Салқын · жеңіл куртка" };
  if (h > 75) return { en: "Humid · feels heavier", ru: "Влажно · душно", kz: "Ылғалды" };
  if (wave && wave > 1.2) return { en: "Rough sea · caution near shore", ru: "Сильные волны у берега", kz: "Жағада күшті толқын" };
  return { en: "Pleasant outside", ru: "Приятная погода", kz: "Жағымды ауа-райы" };
}

Object.assign(window, {
  useWeather, useCityClock, useLang, RotatingLabel, T, LANGS, DAYS, dayLabel,
  wmo, wmoEmoji, round, pad2, fmtTime, fmtClock, fmtSeconds, fmtDate, compass,
  uvScale, aqiScale, sunProgress, waveScale, timeUntil, nextHours, comfortPhrase,
  ParticleScene, QalavisionMark, backgroundFor,
});
