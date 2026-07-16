#!/usr/bin/env node
// Regenerates the VNNOX/TB50 billboard (index.html) from the root .jsx sources.
//
//   npm run build:hardened     write the built files
//   npm run verify:hardened    rebuild in memory and fail if the built files
//                              differ from what the sources produce (writes nothing)
//
// WHY THIS EXISTS
// index.html used to be hand-built. That is how the sources and the deployed page
// drifted apart, and how a Tailwind snapshot with no colour utilities reached the
// wall. index.html should never be edited by hand again: change the .jsx sources,
// run this, deploy the output.
//
// WHAT IT DOES
// production/shell.template.html holds the parts that essentially never change:
// the inlined fonts (~480KB of woff2 data URIs), React + ReactDOM production
// builds, and the two resilience layers. This script fills its placeholders:
//   /*__TAILWIND__*/ <- Tailwind, compiled against the root sources (see below)
//   /*__PAGECSS__*/  <- the <style> block from production.html
//   /*__APP__*/      <- the root *.jsx, Babel-compiled and concatenated in order
//
// TAILWIND — WHY IT IS COMPILED HERE
// Development loads cdn.tailwindcss.com, which generates classes at runtime by
// scanning the live DOM, so localhost always looks right. The built file
// cannot fetch a CDN, so it needs a real stylesheet baked in. This build used to
// carry a FROZEN snapshot, and that snapshot had drifted badly: 48 layout rules
// and NOT ONE typography or colour utility. The deployed billboard was rendering
// its stat labels with no styling at all. Compiling from tailwind.config.js on
// every build is what stops that from happening again — if you use a class, it
// ships. Anything added outside the config's content globs will not.
//
// NOT MINIFIED
// No minifier is installed and Babel Standalone has no minify preset, so the app
// bundle ships readable. It costs ~60KB against a ~700KB file that is mostly
// fonts. If that ever matters, add terser and pipe the bundle through it.

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const babel = require("@babel/standalone");

const CHECK = process.argv.includes("--check");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "production", "shell.template.html");
const PAGE = path.join(ROOT, "production.html");
const TW_INPUT = path.join(__dirname, "tailwind.input.css");

// Load order matters: shared defines the helpers the rest hang off window for.
// This list mirrors the <script type="text/babel"> tags in production.html — the
// dev shell and the build must compile the same files in the same order, or
// "works on localhost" stops predicting "works on the wall".
//
// production.jsx is the entry (DESIGN_W/H 1920x1152, the wall's real VNNOX grid).
// Do NOT swap in the Atmosphere/ folder's mount.jsx: that is the abandoned
// 2834x1167 experiment, and building it would revert commit 598a228 and put the
// black bars back on the wall.
const SOURCES = [
  "billboard-shared.jsx",
  "billboard-sky.jsx",
  "billboard-weather-fx.jsx",
  "billboard-atmosphere.jsx",
  "production.jsx",
];

// GitHub Pages serves index.html at the repo root URL, which is what VNNOX points
// at. This file IS the billboard — it is generated, never hand-edited.
const OUTPUTS = [path.join(ROOT, "index.html")];

function fail(msg) {
  console.error("\n  BUILD FAILED: " + msg + "\n");
  process.exit(1);
}

// ---- 1. compile the app ----------------------------------------------------
function compile() {
  const parts = [];
  for (const name of SOURCES) {
    const file = path.join(ROOT, name);
    if (!fs.existsSync(file)) fail("missing source " + name);
    const src = fs.readFileSync(file, "utf8");
    let out;
    try {
      // runtime:"classic" is mandatory. The default ("automatic") emits
      //   import { jsx as _jsx } from "react/jsx-runtime"
      // which is an ES module statement — fatal inside a plain <script>, and it
      // blanks the whole page. Development works because <script type="text/babel">
      // compiles classic by default, so this only ever breaks in the built file.
      out = babel.transform(src, {
        presets: [["react", { runtime: "classic" }]],
        filename: name,
      }).code;
    } catch (e) {
      fail("could not compile " + name + "\n  " + e.message.split("\n")[0]);
    }
    // A module statement here means the page dies with "Cannot use import
    // statement outside a module" and renders black. Catch it at build time.
    if (/^\s*(import|export)\s/m.test(out)) {
      fail(name + " compiled to an ES module — the built page would render black.\n" +
           "  Check the react preset's runtime option (must be \"classic\").");
    }
    parts.push("/* ==== " + name + " ==== */\n" + out);
  }
  // Each file is an IIFE-free script that leans on `window`, exactly as the
  // <script type="text/babel"> tags do in development. Concatenating preserves
  // that, but every file must not collide at top level — they already don't,
  // which is why the wx*/_* helper prefixes exist.
  return parts.join("\n;\n");
}

// ---- 2. lift the page CSS --------------------------------------------------
function pageCss() {
  const html = fs.readFileSync(PAGE, "utf8");
  const m = html.match(/<style>([\s\S]*?)<\/style>/i);
  if (!m) fail("no <style> block in production.html");
  return m[1];
}

// ---- 3. compile Tailwind ---------------------------------------------------
// Shells out to the installed CLI rather than using the PostCSS API, so what the
// build produces is exactly what `npx tailwindcss` produces — one less thing that
// can differ between "works when I run it by hand" and "works in the build".
function tailwind() {
  // Run the CLI's JS entry through node rather than node_modules/.bin. The .bin
  // shim is a .cmd on Windows and spawnSync refuses it with EINVAL; this path
  // needs no shell and behaves the same on every platform.
  const cli = path.join(ROOT, "node_modules", "tailwindcss", "lib", "cli.js");
  if (!fs.existsSync(cli)) fail("tailwindcss is not installed — run: npm i -D tailwindcss@3");
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qv-tw-")), "out.css");
  try {
    execFileSync(process.execPath, [cli, "-i", TW_INPUT, "-o", out, "--minify"], {
      cwd: ROOT,
      stdio: ["ignore", "ignore", "pipe"],
    });
  } catch (e) {
    fail("tailwind failed\n  " + String(e.stderr || e.message).trim().split("\n").slice(0, 3).join("\n  "));
  }
  const css = fs.readFileSync(out, "utf8");
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  // A stylesheet this small means the content globs matched nothing — which is
  // exactly the silent failure that shipped unstyled labels to the billboard.
  if (css.length < 4000) fail("tailwind produced only " + css.length + " bytes — check content globs in tailwind.config.js");
  return css;
}

// Report the emitted rule count. Tailwind only emits what the content globs find,
// so this number dropping sharply means a glob stopped matching — which is the
// failure that shipped unstyled labels to the billboard for who knows how long.
function tailwindReport(css) {
  const rules = new Set([...css.matchAll(/\.([-\w\\/[\].%]+)\{/g)].map((m) => m[1]));
  const colours = [...rules].filter((r) => r.startsWith("text-white")).length;
  console.log("  tailwind   : " + (css.length / 1024).toFixed(1) + "KB, " + rules.size +
              " rules (" + colours + " text-white variants)");
}

// ---- run -------------------------------------------------------------------
if (!fs.existsSync(TEMPLATE)) fail("missing " + path.relative(ROOT, TEMPLATE));
const template = fs.readFileSync(TEMPLATE, "utf8");
if (!template.includes("/*__APP__*/")) fail("template lost its /*__APP__*/ placeholder");
if (!template.includes("/*__PAGECSS__*/")) fail("template lost its /*__PAGECSS__*/ placeholder");
if (!template.includes("/*__TAILWIND__*/")) fail("template lost its /*__TAILWIND__*/ placeholder");

const app = compile();
const css = pageCss();
const tw = tailwind();

// Guard against the template silently losing the pieces that make it "hardened".
for (const [needle, what] of [
  ["qv-resilience-pre", "network-timeout layer"],
  ["qv-resilience-post", "offline-badge/watchdog layer"],
  ["@license React", "inlined React"],
  ["data:font/woff2", "inlined fonts"],
]) {
  if (!template.includes(needle)) fail("template is missing the " + what);
}

let out = template
  .replace("/*__TAILWIND__*/", () => tw)
  .replace("/*__PAGECSS__*/", () => css)
  .replace("/*__APP__*/", () => app);

// The whole point of the hardened build: nothing may be fetched from a CDN.
const ext = [...out.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
if (ext.length) fail("build references external URLs, which defeats the offline build:\n  " + ext.join("\n  "));

// --check: rebuild in memory and compare, writing nothing. This is what makes
// drift between the sources and the deployed file structurally impossible — if the
// committed build is not what the sources produce, this fails. Deliberately not
// implemented with `git diff`: that exits 0 even when files differ, and it
// ignores untracked files entirely, so it would pass while being wrong.
if (CHECK) {
  const stale = [];
  for (const dest of OUTPUTS) {
    const rel = path.relative(ROOT, dest).replace(/\\/g, "/");
    if (!fs.existsSync(dest)) { stale.push(rel + " (missing)"); continue; }
    if (fs.readFileSync(dest, "utf8") !== out) stale.push(rel + " (differs from sources)");
  }
  if (stale.length) {
    console.error("\n  OUT OF DATE:");
    for (const s of stale) console.error("    " + s);
    console.error("\n  index.html does not match the .jsx sources. Run: npm run build:hardened\n");
    process.exit(1);
  }
  console.log("\n  up to date — index.html matches the .jsx sources byte for byte");
  for (const d of OUTPUTS) console.log("    " + path.relative(ROOT, d).replace(/\\/g, "/"));
  console.log("");
  process.exit(0);
}

for (const dest of OUTPUTS) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, out);
}

console.log("\n  built " + (out.length / 1024).toFixed(0) + "KB");
console.log("  app        : " + (app.length / 1024).toFixed(0) + "KB from " + SOURCES.length + " sources");
console.log("  page css   : " + (css.length / 1024).toFixed(1) + "KB");
console.log("  external   : none");
tailwindReport(tw);
for (const d of OUTPUTS) console.log("  -> " + path.relative(ROOT, d).replace(/\\/g, "/"));
console.log("");
