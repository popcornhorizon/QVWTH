// Standalone mount — Atmosphere living-sky only, full-screen, live Aktau data.
// No design canvas, no Mosaic, no tweaks. Fixed 3264×1344 stage scaled to fit
// any viewport (letterboxed on black), so it maps 1:1 to the LED wall.
const { createRoot } = ReactDOM;

function AtmosphereStage() {
  const stageRef = React.useRef(null);
  React.useEffect(() => {
    const fit = () => {
      const s = Math.min(window.innerWidth / 3264, window.innerHeight / 1344);
      if (stageRef.current) stageRef.current.style.transform = `translate(-50%, -50%) scale(${s})`;
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
        width: 3264, height: 1344, transformOrigin: "center center",
        overflow: "hidden",
      }}
    >
      <div style={{ width: 2622.86, height: 1080, transform: "scale(1.244444)", transformOrigin: "top left" }}>
        <VariantAtmosphere flythrough={false} flySpeed={1} previewWeather="live" />
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<AtmosphereStage />);
