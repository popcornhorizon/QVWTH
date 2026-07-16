/** Stock Tailwind, matching what cdn.tailwindcss.com serves in development.
 *  Content globs must cover every file that can contain a class name — the
 *  hardened build bakes this output in, so anything missed here is a class that
 *  works on localhost and silently does nothing on the billboard. */
module.exports = {
  content: [
    // Exactly the files the build compiles into index.html (SOURCES in
    // scripts/build-hardened.js) plus its dev shell. The design-canvas files
    // (main.jsx, design-canvas.jsx, tweaks-panel.jsx, billboard-mosaic.jsx) are
    // deliberately absent — they never reach the wall.
    "./billboard-shared.jsx",
    "./billboard-sky.jsx",
    "./billboard-weather-fx.jsx",
    "./billboard-atmosphere.jsx",
    "./production.jsx",
    "./production.html",
  ],
  theme: { extend: {} },
  plugins: [],
};
