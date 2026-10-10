/**
 * Small rewards for a right answer: a burst of sparks from the answer, a soft two-note chime and a tiny buzz on phones.
 * All skipped for people who've asked their device for reduced motion (the sound has its own setting).
 */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Sparks flying out from the middle of an element. */
export function burst(el: Element | null, colours = ["#22c55e", "#4ade80", "#facc15", "#86efac"]) {
  if (!el || reduced()) return;
  const r = el.getBoundingClientRect();
  // Page coordinates, so the sparks stay on the answer while the page scrolls.
  const cx = r.left + r.width / 2 + window.scrollX;
  const cy = r.top + r.height / 2 + window.scrollY;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { position: "absolute", left: "0", top: "0", width: "0", height: "0", pointerEvents: "none", zIndex: "60" });
  document.body.appendChild(layer);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const s = document.createElement("span");
    const angle = (i / n) * Math.PI * 2 + Math.random() * 0.4;
    const dist = 26 + Math.random() * 22;
    const size = 4 + Math.random() * 4;
    Object.assign(s.style, {
      position: "absolute",
      left: `${cx - size / 2}px`,
      top: `${cy - size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: i % 3 === 0 ? "2px" : "999px",
      background: colours[i % colours.length],
      opacity: "1",
      transform: "translate(0,0) scale(1)",
      transition: "transform 520ms cubic-bezier(.15,.75,.25,1), opacity 520ms ease-out",
    });
    layer.appendChild(s);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        s.style.transform = `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(0.4)`;
        s.style.opacity = "0";
      }),
    );
  }
  setTimeout(() => layer.remove(), 700);
}

let audio: AudioContext | null = null;

/** A soft, quick rising chime (two notes). */
export function chime(level = 0) {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    audio ??= new AC();
    if (audio.state === "suspended") void audio.resume();
    const now = audio.currentTime;
    // Climbs a little higher with each one in a row.
    const lift = Math.pow(2, Math.min(level, 5) / 12);
    for (const [k, f] of [880, 1318.5].entries()) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = "sine";
      o.frequency.value = f * lift;
      const t = now + k * 0.075;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.07, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(g).connect(audio.destination);
      o.start(t);
      o.stop(t + 0.34);
    }
  } catch {
    /* no sound available */
  }
}

/** A tiny tap on phones that support it. */
export function buzz(ms = 12) {
  try {
    if (!reduced()) navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
