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

/* THE CLOCK. All station traffic reads the wall through these two, so the
   ?dev workshop can turn the hands and audition midnight at noon. LP.warp
   stays 0 for every real listener. (The underbrush seeds once at load and
   ignores a mid-session warp across midnight — a known, harmless limit.) */
LP.warp = 0;
LP.now = () => Date.now() + LP.warp;
LP.date = (t) => new Date(t === undefined ? LP.now() : t);

LP.ticker = (() => {
  const tasks = new Set();
  let rafId = null, last = 0, inFrame = false;
  function frame(now) {
    rafId = null;
    inFrame = true; /* a kick() from inside a task must not double-schedule the loop */
    const dt = Math.min(50, now - last) || 16; last = now;
    for (const t of tasks) { if (t(dt, now) === false) tasks.delete(t); } /* Set tolerates delete-during-iteration */
    inFrame = false;
    if (rafId === null && tasks.size && !document.hidden) rafId = requestAnimationFrame(frame);
  }
  function kick() { if (!inFrame && rafId === null && tasks.size && !document.hidden) { last = performance.now(); rafId = requestAnimationFrame(frame); } }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });
  return { add(t) { tasks.add(t); kick(); return () => tasks.delete(t); }, kick };
})();

LP.TAU = Math.PI * 2;
LP.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
LP.lerp = (a, b, t) => a + (b - a) * t;

/* the receiver's passband: how much of a signal at offset `off` kHz lands in
   the ear. ONE formula — the audio, the meter, and the RST all share it. */
LP.selectivity = (off, bw) => Math.exp(-(off * off) / (2 * Math.pow(Math.max(bw, 0.35) * 0.9, 2)));

/* seeded PRNG for stable texture */
LP.mulberry = (seed) => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

/* two live regions: durable events must never be clobbered by dial chatter */
LP.say = (msg) => {
  clearTimeout(LP._tuneSayT); /* a pending frequency readout yields to real news */
  const el = document.getElementById('sr-status'); if (el) el.textContent = msg;
};
LP.sayTune = (msg) => { const el = document.getElementById('sr-tune'); if (el) el.textContent = msg; };
