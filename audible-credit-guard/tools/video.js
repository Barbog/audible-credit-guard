// Renders tools/video.html frame by frame (all CSS animations seeked to an
// exact time) and encodes store/promo-video.mp4 (1280x720, 30 fps, H.264).
// Needs the popup renders from assets.js. Run with: node video.js
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { chromium } = require("playwright");
const ffmpeg = require("ffmpeg-static");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(__dirname, "out");
const FRAMES = path.join(__dirname, "frames");
const FPS = 30, SECONDS = 45;
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;   // e.g. "2,9,15" to preview seconds

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const dataUri = f => "data:image/png;base64," + fs.readFileSync(f).toString("base64");
const fontDir = path.join(__dirname, "node_modules/@fontsource/inter/files");
const fontFace = [400, 600, 700, 800].map(w =>
  `@font-face{font-family:Inter;font-weight:${w};src:url(file://${fontDir}/inter-latin-${w}-normal.woff2) format("woff2")}`).join("");

let html = fs.readFileSync(path.join(__dirname, "video.html"), "utf8")
  .replace("<style>", "<style>" + fontFace)
  .replaceAll("ICON_256", dataUri(path.join(OUT, "icon-256.png")))
  .replaceAll("ICON_32", dataUri(path.join(OUT, "icon-32.png")))
  .replaceAll("POPUP_HOLD", dataUri(path.join(OUT, "popup-onhold.png")));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const htmlFile = path.join(OUT, "video-rendered.html");
  fs.writeFileSync(htmlFile, html);
  await page.goto("file://" + htmlFile);
  await page.evaluate(() => document.fonts.ready);
  const n = await page.evaluate(() => document.getAnimations().length);
  console.log(`animations: ${n}`);

  if (only) {
    for (const s of only) {
      await page.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t; }), s * 1000);
      await page.screenshot({ path: path.join(OUT, `preview-${s}s.png`) });
    }
    console.log("previews written to tools/out/");
    await browser.close();
    return;
  }

  const total = FPS * SECONDS;
  for (let i = 0; i < total; i++) {
    await page.evaluate(t => document.getAnimations().forEach(a => { a.currentTime = t; }), i * 1000 / FPS);
    await page.screenshot({ path: path.join(FRAMES, `f${String(i).padStart(5, "0")}.png`) });
    if (i % 150 === 0) console.log(`frame ${i}/${total}`);
  }
  await browser.close();

  const out = path.join(ROOT, "store", "promo-video.mp4");
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FRAMES, "f%05d.png"),
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out]);
  const webm = path.join(ROOT, "store", "promo-video.webm");
  execFileSync(ffmpeg, ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", path.join(FRAMES, "f%05d.png"),
    "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "30", "-pix_fmt", "yuv420p", webm]);
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log("wrote", out, (fs.statSync(out).size / 1e6).toFixed(1), "MB and", webm, (fs.statSync(webm).size / 1e6).toFixed(1), "MB");
})().catch(e => { console.error(e); process.exit(1); });
