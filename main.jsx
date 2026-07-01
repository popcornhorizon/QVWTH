// Mounts the design canvas with the two billboard variants as artboards.
// A Tweaks panel exposes the cinematic "flythrough" demo mode (and its speed),
// which drives the Atmosphere living sky through a full day in seconds.
const { createRoot } = ReactDOM;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "flythrough": false,
  "flySpeed": 1,
  "previewWeather": "live"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  return (
    <React.Fragment>
      <DesignCanvas
        title="Qalavision · Billboard Weather"
        subtitle="Aktau · 2 directions · 1920×1080 (renders 1:1 to your 2834×1167 LED at 1.475×)"
      >
        <DCSection id="variants" title="Directions">
          <DCArtboard id="atmosphere" label="01 · Atmosphere — cinematic living sky" width={1920} height={1080}>
            <VariantAtmosphere flythrough={t.flythrough} flySpeed={t.flySpeed} previewWeather={t.previewWeather} />
          </DCArtboard>
          <DCArtboard id="mosaic" label="02 · Mosaic — editorial bento grid" width={1920} height={1080}>
            <VariantMosaic />
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel>
        <TweakSection label="Cinematic demo" />
        <TweakToggle
          label="Flythrough"
          value={t.flythrough}
          onChange={(v) => setTweak("flythrough", v)}
        />
        <div style={{ fontSize: 11, lineHeight: 1.5, opacity: 0.55, margin: "-2px 0 10px" }}>
          Sweeps the Atmosphere sky through dawn → noon → golden hour → night.
          Off = live, accurate to Aktau's real sky.
        </div>
        <TweakSlider
          label="Loop speed"
          value={t.flySpeed}
          min={0.5}
          max={3}
          step={0.5}
          unit="×"
          onChange={(v) => setTweak("flySpeed", v)}
        />

        <TweakSection label="Weather preview" />
        <TweakSelect
          label="Condition"
          value={t.previewWeather}
          options={[
            { value: "live", label: "Live (real Aktau)" },
            { value: "clear", label: "Clear" },
            { value: "cloudy", label: "Cloudy" },
            { value: "rain", label: "Rain" },
            { value: "heavyrain", label: "Heavy rain" },
            { value: "thunder", label: "Thunderstorm" },
            { value: "snow", label: "Snow" },
            { value: "blizzard", label: "Blizzard" },
            { value: "fog", label: "Fog / sea-mist" },
            { value: "dust", label: "Dust storm (Aktau wind)" },
            { value: "freezing", label: "Freezing rain (sleet)" },
            { value: "heat", label: "Heat haze (Caspian summer)" },
            { value: "wind", label: "High wind (Caspian gale)" },
          ]}
          onChange={(v) => setTweak("previewWeather", v)}
        />
        <div style={{ fontSize: 11, lineHeight: 1.5, opacity: 0.55, margin: "-2px 0 10px" }}>
          Forces a weather treatment on the Atmosphere sky for review. Keeps the
          real day/night. Set back to Live for the accurate forecast.
        </div>
      </TweaksPanel>
    </React.Fragment>
  );
}

createRoot(document.getElementById("root")).render(<App />);
