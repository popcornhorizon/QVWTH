// Standalone mount — Atmosphere living-sky only, full-screen, live Aktau data.
// No design canvas, no Mosaic, no tweaks.
//
// The stage is authored NATIVELY at the Aktau LED wall size, 2834×1167
// (≈2.43:1), and scaled to the browser viewport. URL params:
//   ?w=2834&h=1167   stage size override (defaults = the Aktau wall)
//   ?fit=fill        (default) non-uniform scale that FILLS the viewport.
//                    On the TB50 the webview is 16:9 (1920×1080 HDMI out);
//                    the widget renders pre-squeezed, and when the V1160
//                    stretches the full HDMI frame across the 2.43:1 wall the
//                    two distortions cancel — the wall shows true proportions,
//                    no black bars.
//   ?fit=contain     uniform scale, letterboxed on black. Use for desktop
//                    preview, or if the video processor is configured to CROP
//                    the letterboxed band instead of stretching full frame.
const { createRoot } = ReactDOM;

const _qs = new URLSearchParams(window.location.search);
const STAGE_W = parseInt(_qs.get("w"), 10) || 2834;
const STAGE_H = parseInt(_qs.get("h"), 10) || 1167;
const FIT = _qs.get("fit") === "contain" ? "contain" : "fill";
// Expose so layout code (e.g. ViewToday's arc overlay) shares the same geometry.
window.STAGE_W = STAGE_W;
window.STAGE_H = STAGE_H;

function AtmosphereStage() {
  const stageRef = React.useRef(null);
  React.useEffect(() => {
    const fit = () => {
      const sx = window.innerWidth / STAGE_W;
      const sy = window.innerHeight / STAGE_H;
      const t = FIT === "fill"
        ? `translate(-50%, -50%) scale(${sx}, ${sy})`
        : `translate(-50%, -50%) scale(${Math.min(sx, sy)})`;
      if (stageRef.current) stageRef.current.style.transform = t;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return (
    <div
      ref={stageRef}
      style={{
        position: "absolute", left: "50%", top: "50%",
        width: STAGE_W, height: STAGE_H, transformOrigin: "center center",
        overflow: "hidden",
      }}
    >
      <VariantAtmosphere flythrough={false} flySpeed={1} previewWeather="live" />
    </div>
  );
}

createRoot(document.getElementById("root")).render(<AtmosphereStage />);
