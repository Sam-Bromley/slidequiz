// Generates a local, API-compatible subset of `lucide-react` from the official Lucide SVG sources.
// Only needed in offline environments; with network access, `npm i lucide-react` replaces this.
import fs from "node:fs";
import path from "node:path";
const [,, iconsDir, outDir, ...names] = process.argv;
const pascal = (s) => s.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("");
const attrName = (a) => a.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
let js = `import { createElement, forwardRef } from "react";
const base = { xmlns: "http://www.w3.org/2000/svg", width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
function make(name, nodes) {
  const C = forwardRef(function Icon({ size = 24, strokeWidth = 2, absoluteStrokeWidth, className = "", color = "currentColor", children, ...rest }, ref) {
    const sw = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
    return createElement("svg", { ref, ...base, width: size, height: size, stroke: color, strokeWidth: sw, className: ["lucide", "lucide-" + name, className].filter(Boolean).join(" "), "aria-hidden": rest["aria-label"] ? undefined : true, ...rest },
      ...nodes.map(([t, a], i) => createElement(t, { key: i, ...a })), children);
  });
  C.displayName = name;
  return C;
}
`;
let dts = `import type { ForwardRefExoticComponent, RefAttributes, SVGProps } from "react";
export interface LucideProps extends Omit<SVGProps<SVGSVGElement>, "ref"> { size?: string | number; absoluteStrokeWidth?: boolean; }
export type LucideIcon = ForwardRefExoticComponent<LucideProps & RefAttributes<SVGSVGElement>>;
`;
// Resolve deprecated/alias names (e.g. more-horizontal → ellipsis) from the icons' metadata.
const aliases = new Map();
for (const j of fs.readdirSync(iconsDir).filter((x) => x.endsWith(".json"))) {
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(iconsDir, j), "utf8"));
    for (const a of meta.aliases ?? []) aliases.set(typeof a === "string" ? a : a.name, j.replace(/\.json$/, ""));
  } catch {}
}
const missing = [];
for (const n of [...new Set(names)]) {
  let file = n.replace(/-icon$/, "");
  if (!fs.existsSync(path.join(iconsDir, file + ".svg"))) file = aliases.get(file) ?? file;
  const f = path.join(iconsDir, file + ".svg");
  if (!fs.existsSync(f)) { missing.push(n); continue; }
  const svg = fs.readFileSync(f, "utf8");
  const nodes = [];
  for (const m of svg.matchAll(/<(path|circle|rect|line|polyline|polygon|ellipse)\s([^>]*?)\/>/g)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([a-z0-9-]+)="([^"]*)"/g)) attrs[attrName(a[1])] = a[2];
    nodes.push([m[1], attrs]);
  }
  const P = pascal(n);
  js += `export const ${P} = make(${JSON.stringify(n)}, ${JSON.stringify(nodes)});\n`;
  dts += `export declare const ${P}: LucideIcon;\n`;
}
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "index.js"), js);
fs.writeFileSync(path.join(outDir, "index.d.ts"), dts);
fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ name: "lucide-react", version: "0.0.0-local", main: "index.js", module: "index.js", types: "index.d.ts", sideEffects: false }, null, 2));
if (missing.length) { console.error("Missing icons:", missing.join(", ")); process.exit(1); }
console.log("lucide shim:", names.length, "icons");
