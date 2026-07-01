// production.jsx — billboard entry point (no design canvas, no tweaks).
// Mounts the Atmosphere variant full-screen, live weather only, scaled from
// its fixed 1920×1080 design canvas to fit whatever screen it's shown on
// (uniform scale-to-fit, letterboxed rather than cropped or stretched).
//
// NOTE: the wall's native canvas (2834×1167, ~2.43:1) is wider-and-shorter
// than this 16:9 design, so scale-to-fit will letterbox left/right on that
// exact screen. A native 2834×1167 re-layout (recomposing the hero/stat/arc
// views for that aspect ratio) is a separate follow-up — see the handoff doc
// §4/§7. This page is safe to test on the TB50 today as-is.
const { createRoot } = ReactDOM;

const DESIGN_W = 1920;
const DESIGN_H = 1080;

function useFitScale(designW, designH) {
  const [scale, setScale] = React.useState(1);
  React.useEffect(() => {
    function fit() {
      setScale(Math.min(window.innerWidth / designW, window.innerHeight / designH));
    }
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [designW, designH]);
  return scale;
}

function ProductionStage() {
  const scale = useFitScale(DESIGN_W, DESIGN_H);
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <VariantAtmosphere />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<ProductionStage />);
