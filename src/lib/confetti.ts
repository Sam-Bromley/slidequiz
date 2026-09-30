/**
 * A short burst of confetti (no library): a canvas over the page for about two seconds.
 * Skipped for people who've asked their device for reduced motion.
 */
export function confetti({ count = 140, originY = 0.35 }: { count?: number; originY?: number } = {}) {
  if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, { position: "fixed", inset: "0", width: "100vw", height: "100vh", pointerEvents: "none", zIndex: "9999" });
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (canvas.width = innerWidth * dpr);
  const H = (canvas.height = innerHeight * dpr);
  const ctx = canvas.getContext("2d")!;
  const colours = ["#f97316", "#facc15", "#22c55e", "#3b82f6", "#a855f7", "#ec4899", "#14b8a6"];
  const bits = Array.from({ length: count }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = (9 + Math.random() * 11) * dpr;
    return {
      x: W / 2 + (Math.random() - 0.5) * W * 0.25,
      y: H * originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      w: (6 + Math.random() * 6) * dpr,
      h: (3 + Math.random() * 4) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.35,
      c: colours[(Math.random() * colours.length) | 0],
    };
  });
  const start = performance.now();
  const frame = (t: number) => {
    const age = t - start;
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 1400) / 700);
    for (const b of bits) {
      b.vy += 0.42 * dpr;
      b.vx *= 0.985;
      b.vy *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h * Math.abs(Math.cos(b.r * 2)) + 1);
      ctx.restore();
    }
    if (age < 2100) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
