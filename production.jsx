// production.jsx — billboard entry point (no design canvas, no tweaks).
// Mounts the Atmosphere variant full-screen, live weather only, scaled from
// its design canvas to fit whatever screen it's shown on (uniform scale-to-fit,
// letterboxed rather than cropped or stretched).
//
// The canvas matches the Aktau wall's real pixel grid as registered in VNNOX
// (screen "Weather Billboard", 1920×1152), so on the TB50 the scale lands on
// exactly 1 and the stage maps 1:1 to the LEDs with no resampling and no bars.
const { createRoot } = ReactDOM;

const DESIGN_W = 1920;
const DESIGN_H = 1152;

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
