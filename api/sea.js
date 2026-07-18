// GET /api/sea  ->  { temp, sources, time }
//
// Caspian Sea surface temperature off Aktau for the billboard's CASPIAN SEA
// stat. Open-Meteo's marine model has no Caspian coverage (verified: null
// across the whole basin), so we blend two NOAA satellite analyses server-side
// and serve them same-origin — the TB50 player never talks to a new domain.
//
//   - NOAA Coral Reef Watch CoralTemp 5 km  (PacIOOS ERDDAP)
//   - NASA/JPL MUR 1 km                     (NOAA CoastWatch ERDDAP)
//
// The east Caspian coast has strong summer upwelling; the two products can
// disagree by several degrees, and their mean tracks reference in-situ sites
// well. Answer is cached on Vercel's CDN for 3 h (SST is a daily product).

const POINT = { lat: 43.6, lon: 51.0 }; // just offshore of Aktau

const SOURCES = [
  {
    name: "crw",
    url: `https://pae-paha.pacioos.hawaii.edu/erddap/griddap/dhw_5km.json?CRW_SST%5B(last)%5D%5B(${POINT.lat}):(${POINT.lat})%5D%5B(${POINT.lon}):(${POINT.lon})%5D`,
  },
  {
    name: "mur",
    url: `https://coastwatch.pfeg.noaa.gov/erddap/griddap/jplMURSST41.json?analysed_sst%5B(last)%5D%5B(${POINT.lat}):(${POINT.lat})%5D%5B(${POINT.lon}):(${POINT.lon})%5D`,
  },
];

async function fetchSST({ name, url }) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    const j = await r.json();
    const row = j?.table?.rows?.[0]; // [time, lat, lon, sst]
    const v = row?.[3];
    return typeof v === "number" && isFinite(v) ? { name, temp: v, time: row[0] } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  const results = (await Promise.all(SOURCES.map(fetchSST))).filter(Boolean);
  if (!results.length) {
    res.setHeader("Cache-Control", "s-maxage=300"); // retry soon on total failure
    return res.status(502).json({ temp: null, sources: [], error: "no SST source reachable" });
  }
  const temp = Math.round((results.reduce((a, s) => a + s.temp, 0) / results.length) * 10) / 10;
  res.setHeader("Cache-Control", "s-maxage=10800, stale-while-revalidate=86400");
  res.setHeader("Access-Control-Allow-Origin", "*");
  return res.status(200).json({
    temp,
    sources: results.map(({ name, temp, time }) => ({ name, temp, time })),
    time: new Date().toISOString(),
  });
}
