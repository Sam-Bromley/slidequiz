/**
 * Tiny hash router. Hash routing keeps the app deployable to any static host.
 * In a Next.js port, `navigate` maps to `router.push` and `<Link>` to `next/link`.
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

export interface Location {
  path: string;
  query: URLSearchParams;
}

function read(): Location {
  const raw = window.location.hash.replace(/^#/, "") || "/";
  const [path, qs = ""] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(qs) };
}

let current = read();
let currentKey = window.location.hash;
const listeners = new Set<() => void>();
window.addEventListener("hashchange", () => {
  current = read();
  currentKey = window.location.hash;
  listeners.forEach((l) => l());
});

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useLocation(): Location {
  useSyncExternalStore(subscribe, () => currentKey);
  return current;
}

export function navigate(to: string, opts: { replace?: boolean } = {}) {
  const hash = "#" + (to.startsWith("/") ? to : "/" + to);
  if (opts.replace) {
    history.replaceState(null, "", hash);
    current = read();
    currentKey = window.location.hash;
    listeners.forEach((l) => l());
  } else {
    try {
      window.location.hash = hash;
    } catch {
      /* sandboxed frames may refuse; fall through to in-memory update */
    }
    if (window.location.hash !== hash) {
      // Hash didn't change (restricted frame): route in memory so navigation still works.
      const [path, qs = ""] = hash.slice(1).split("?");
      current = { path: path || "/", query: new URLSearchParams(qs) };
      currentKey = hash;
      listeners.forEach((l) => l());
    }
  }
}

export function back(fallback = "/") {
  if (history.length > 1) history.back();
  else navigate(fallback);
}

/** Match "/materials/:id" against a path; returns params or null. */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const s = path.split("/").filter(Boolean);
  if (p.length !== s.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(":")) params[p[i].slice(1)] = decodeURIComponent(s[i]);
    else if (p[i] !== s[i]) return null;
  }
  return params;
}

export function href(to: string) {
  return "#" + to;
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & { to: string };

export function Link({ to, onClick, ...rest }: LinkProps) {
  return (
    <a
      href={href(to)}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
