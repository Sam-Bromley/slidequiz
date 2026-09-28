// Build pipeline: lucide shim (offline only) → Tailwind CSS → esbuild bundle → static dist/.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as esbuild from "esbuild";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");
const prod = !watch;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]);
}

function ensureLucide() {
  const shimDir = path.join(root, "node_modules", "lucide-react");
  const pkg = path.join(shimDir, "package.json");
  const isShim = !fs.existsSync(pkg) || JSON.parse(fs.readFileSync(pkg, "utf8")).version === "0.0.0-local";
  if (!isShim) return; // real lucide-react installed
  const names = new Set();
  for (const f of walk(path.join(root, "src")).filter((f) => /\.tsx?$/.test(f))) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
      for (const raw of m[1].split(",")) {
        const n = raw.trim().split(/\s+as\s+/)[0].trim();
        if (!n || n === "LucideIcon" || n === "LucideProps" || n.startsWith("type ")) continue;
        names.add(n.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([a-zA-Z])(\d)/g, "$1-$2").replace(/(\d)x-(\d)/g, "$1x$2").toLowerCase());
      }
    }
  }
  const icons = process.env.LUCIDE_ICONS_DIR || "/home/claude/vendor/lucide/icons";
  execFileSync("node", [path.join(root, "scripts/gen-lucide-shim.mjs"), icons, shimDir, ...names], { stdio: "inherit" });
}

function css() {
  execFileSync("node", [path.join(root, "node_modules/tailwindcss/lib/cli.js"), "-c", path.join(root, "tailwind.config.js"),
    "-i", path.join(root, "src/styles/globals.css"), "-o", path.join(dist, "app.css"), ...(prod ? ["--minify"] : [])], { stdio: "inherit", cwd: root });
}

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
ensureLucide();
css();
fs.copyFileSync(path.join(root, "public/index.html"), path.join(dist, "index.html"));
// Body-only variant for hosts that supply their own document skeleton (e.g. a claude.ai artifact).
{
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  const head = html.slice(html.indexOf("<head>") + 6, html.indexOf("</head>")).replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>|<link rel="icon"[^>]*>/g, "");
  // Analytics only runs on the real website, not in embedded previews.
  const body = html.slice(html.indexOf("<body>") + 6, html.indexOf("</body>")).replace(/<!-- Cloudflare Web Analytics -->[\s\S]*?<!-- End Cloudflare Web Analytics -->/, "");
  fs.writeFileSync(path.join(dist, "embed.html"), (head + body).replace(/\n\s*\n/g, "\n").trim() + "\n");
}
for (const f of fs.readdirSync(path.join(root, "public"))) if (f !== "index.html") fs.copyFileSync(path.join(root, "public", f), path.join(dist, f));
// Re-emit the pdf.js worker with ASCII-only output (some hosts reject raw control bytes in text files).
// The worker also gets the small fallbacks from src/lib/polyfills.ts (newer Map/Promise features older browsers lack).
const polyfill = fs.readFileSync(path.join(root, "src/lib/polyfills.ts"), "utf8").match(/POLYFILL_SOURCE = `([\s\S]*?)`;/)[1];
await esbuild.build({ entryPoints: [path.join(root, "node_modules/pdfjs-dist/build/pdf.worker.min.mjs")], outfile: path.join(dist, "pdf.worker.min.mjs"), format: "esm", minify: true, charset: "ascii", logLevel: "warning", banner: { js: polyfill } });

const opts = {
  entryPoints: [path.join(root, "src/main.tsx")],
  bundle: true, splitting: true, format: "esm", outdir: path.join(dist, "assets"),
  entryNames: "app", chunkNames: "chunk-[hash]", jsx: "automatic", target: "es2022",
  minify: prod, sourcemap: !prod, platform: "browser", charset: "ascii", logLevel: "info",
  define: { "process.env.NODE_ENV": JSON.stringify(prod ? "production" : "development"), global: "globalThis" },
  alias: { "@": path.join(root, "src") },
};
/** Rewrite raw control characters (only legal inside string/regex literals) as \xHH escapes. */
function escapeControlChars(file) {
  const src = fs.readFileSync(file, "latin1");
  let out = "";
  for (let i = 0; i < src.length; i++) {
    const c = src.charCodeAt(i);
    if (c < 32 && c !== 9 && c !== 10 && c !== 13) {
      let n = 0;
      while (out.length - 1 - n >= 0 && out[out.length - 1 - n] === "\\") n++;
      if (n % 2 === 1) out = out.slice(0, -1); // "\<ctrl>" was an escaped control char
      out += "\\x" + c.toString(16).padStart(2, "0");
    } else out += src[i];
  }
  fs.writeFileSync(file, out, "latin1");
}

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log("watching…");
} else {
  await esbuild.build(opts);
  for (const f of walk(dist).filter((f) => /\.(m?js)$/.test(f))) escapeControlChars(f);
  const size = walk(dist).reduce((s, f) => s + fs.statSync(f).size, 0);
  console.log(`dist ready: ${(size / 1024).toFixed(0)} KB`);
}
