'use strict';
/* THE LISTENING POST — boot. One namespace, one rAF ticker (stops when the
   tab hides or nothing animates), storage with a seatbelt. */
const LP = {};

LP.store = {
  get(k, d) { try { const v = localStorage.getItem('lp-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('lp-' + k, JSON.stringify(v)); } catch { /* private mode */ } },
};

LP.rm = matchMedia('(prefers-reduced-motion: reduce)');
LP.DPR = () => Math.min(devicePixelRatio || 1, 2);

LP.ticker = (() => {
  const tasks = new Set();
  let rafId = null, last = 0;
  function frame(now) {
    rafId = null;
    const dt = Math.min(50, now - last) || 16; last = now;
    for (const t of [...tasks]) { if (t(dt, now) === false) tasks.delete(t); }
    if (tasks.size && !document.hidden) rafId = requestAnimationFrame(frame);
  }
  function kick() { if (rafId === null && tasks.size && !document.hidden) { last = performance.now(); rafId = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  return { add(t) { tasks.add(t); kick(); return () => tasks.delete(t); }, kick };
})();

LP.TAU = Math.PI * 2;
LP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
LP.lerp = (a, b, t) => a + (b - a) * t;

/* seeded PRNG for stable texture */
LP.mulberry = (seed) => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

LP.say = (msg) => { const el = document.getElementById('sr-status'); if (el) el.textContent = msg; };
