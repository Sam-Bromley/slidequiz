/**
 * Small fallbacks for newer JavaScript features that the PDF reader (pdf.js) uses
 * but that many browsers don't have yet.
 */
type AnyMap = { has(k: unknown): boolean; get(k: unknown): unknown; set(k: unknown, v: unknown): unknown };

export const POLYFILL_SOURCE = `(() => {
  for (const C of [Map, WeakMap]) {
    const p = C.prototype;
    if (!p.getOrInsertComputed) Object.defineProperty(p, "getOrInsertComputed", { configurable: true, writable: true, value(k, f) { if (this.has(k)) return this.get(k); const v = f(k); this.set(k, v); return v; } });
    if (!p.getOrInsert) Object.defineProperty(p, "getOrInsert", { configurable: true, writable: true, value(k, v) { if (this.has(k)) return this.get(k); this.set(k, v); return v; } });
  }
  if (typeof Promise.try !== "function") Promise.try = (f, ...a) => new Promise((r) => r(f(...a)));
  if (typeof Uint8Array.prototype.toHex !== "function") Object.defineProperty(Uint8Array.prototype, "toHex", { configurable: true, writable: true, value() { return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join(""); } });
})();`;

for (const C of [Map, WeakMap] as unknown as { prototype: AnyMap & Record<string, unknown> }[]) {
  const p = C.prototype;
  if (!p.getOrInsertComputed)
    Object.defineProperty(p, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value(this: AnyMap, k: unknown, f: (k: unknown) => unknown) {
        if (this.has(k)) return this.get(k);
        const v = f(k);
        this.set(k, v);
        return v;
      },
    });
  if (!p.getOrInsert)
    Object.defineProperty(p, "getOrInsert", {
      configurable: true,
      writable: true,
      value(this: AnyMap, k: unknown, v: unknown) {
        if (this.has(k)) return this.get(k);
        this.set(k, v);
        return v;
      },
    });
}
const P = Promise as unknown as { try?: unknown };
if (typeof P.try !== "function") P.try = (f: (...a: unknown[]) => unknown, ...a: unknown[]) => new Promise((r) => r(f(...a)));
const U = Uint8Array.prototype as unknown as { toHex?: unknown };
if (typeof U.toHex !== "function")
  Object.defineProperty(Uint8Array.prototype, "toHex", {
    configurable: true,
    writable: true,
    value(this: Uint8Array) {
      return Array.from(this, (b) => b.toString(16).padStart(2, "0")).join("");
    },
  });
