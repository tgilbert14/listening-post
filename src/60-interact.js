/* THE LISTENING POST — the operator's hands. Drag the glass or the dial,
   roll the wheel for fine work, or never touch the pointer at all:
   arrows tune, 1/2/3 change bands, L opens the log. */
(() => {
  const dial = document.getElementById('dial');
  const glass = document.getElementById('waterfall');
  const bands = [0, 1, 2].map(i => document.getElementById('band-' + i));
  const logBtn = document.getElementById('log-toggle');

  const anyGesture = () => { LP.audio.arm(); LP.ticker.kick(); };
  addEventListener('pointerdown', anyGesture, { capture: true });
  addEventListener('pointerup', anyGesture, { capture: true });
  addEventListener('keydown', anyGesture, { capture: true });

  const saved = LP.store.get('rx', null);
  const lastVfo = [3303.0, 6780.6, 9425.0];
  if (saved && typeof saved.band === 'number') {
    LP.rx.band = LP.clamp(Math.round(saved.band), 0, 2);
    if (Array.isArray(saved.lastVfo)) {
      for (let i = 0; i < 3; i++) {
        const B = LP.band.BANDS[i];
        const v = Number(saved.lastVfo[i]);
        if (Number.isFinite(v)) lastVfo[i] = LP.clamp(v, B.lo, B.hi); /* a poisoned store can't strand the VFO */
      }
    }
    LP.rx.vfo = lastVfo[LP.rx.band];
    reflectBand();
  }

  function persist() {
    lastVfo[LP.rx.band] = LP.rx.vfo;
    LP.store.set('rx', { band: LP.rx.band, lastVfo });
  }

  function reflectDial() {
    const B = LP.band.BANDS[LP.rx.band];
    dial.setAttribute('aria-valuenow', String(Math.round(LP.rx.vfo - B.lo)));
    const lock = LP.log && LP.log.lockedOn;
    dial.setAttribute('aria-valuetext', `${LP.rx.vfo.toFixed(1)} kilohertz${lock ? ' — signal: ' + lock : ''}`);
  }
  LP.reflectDial = reflectDial;

  function tuneTo(f, coarse) {
    const B = LP.band.BANDS[LP.rx.band];
    LP.rx.vfo = LP.clamp(Math.round(f * 10) / 10, B.lo, B.hi);
    LP.rx.dwellT0 = performance.now();
    reflectDial();
    if (LP.display && LP.display.invalidateRow) LP.display.invalidateRow();
    LP.ticker.kick();
    clearTimeout(LP._tuneSayT);
    if (!coarse) LP._tuneSayT = setTimeout(() => LP.sayTune(`${LP.rx.vfo.toFixed(1)} kilohertz`), 700);
    clearTimeout(LP._persistT);
    LP._persistT = setTimeout(persist, 800);
  }
  LP.tuneTo = tuneTo;
  reflectDial(); /* the slider tells the truth from the first Tab stop */

  /* dwell is ATTENTIVE time: a hidden tab neither stalks nor is stalked */
  document.addEventListener('visibilitychange', () => { LP.rx.dwellT0 = performance.now(); });

  function setBand(ix) {
    if (ix === LP.rx.band) return;
    dialDrag = null; glassDrag = null; /* a band jump ends any drag in flight */
    lastVfo[LP.rx.band] = LP.rx.vfo;
    LP.rx.band = ix;
    reflectBand();
    tuneTo(lastVfo[ix], true);
    LP.say(`Band ${LP.band.BANDS[ix].name.toLowerCase()}, ${LP.rx.vfo.toFixed(1)} kilohertz.`);
    persist();
  }
  function reflectBand() {
    bands.forEach((b, i) => b.setAttribute('aria-pressed', String(i === LP.rx.band)));
  }
  bands.forEach((b, i) => b.addEventListener('click', () => setBand(i)));

  /* ---------- the dial strip (one pointer owns a drag, start to finish) ---------- */
  let dialDrag = null;
  dial.addEventListener('pointerdown', (e) => {
    if (dialDrag) return;
    e.preventDefault();
    dial.setPointerCapture(e.pointerId);
    dialDrag = { id: e.pointerId, x: e.clientX, vfo: LP.rx.vfo };
    dial.focus();
  });
  dial.addEventListener('pointermove', (e) => {
    if (!dialDrag || e.pointerId !== dialDrag.id) return;
    const dx = e.clientX - dialDrag.x;
    tuneTo(dialDrag.vfo + dx * 0.12, true);
  });
  const dialUp = (e) => { if (dialDrag && e.pointerId === dialDrag.id) dialDrag = null; };
  dial.addEventListener('pointerup', dialUp);
  dial.addEventListener('pointercancel', dialUp);
  dial.addEventListener('lostpointercapture', dialUp);

  dial.addEventListener('keydown', (e) => {
    const B = LP.band.BANDS[LP.rx.band];
    switch (e.key) {
      case 'ArrowLeft': tuneTo(LP.rx.vfo - 0.1); break;
      case 'ArrowRight': tuneTo(LP.rx.vfo + 0.1); break;
      case 'ArrowDown': tuneTo(LP.rx.vfo - 1); break;
      case 'ArrowUp': tuneTo(LP.rx.vfo + 1); break;
      case 'PageDown': tuneTo(LP.rx.vfo - 5); break;
      case 'PageUp': tuneTo(LP.rx.vfo + 5); break;
      case 'Home': tuneTo(B.lo); break;
      case 'End': tuneTo(B.hi); break;
      default: return;
    }
    e.preventDefault();
  });

  /* ---------- the glass: grab the spectrum itself ---------- */
  let glassDrag = null;
  glass.addEventListener('pointerdown', (e) => {
    if (glassDrag) return;
    const r = glass.getBoundingClientRect();
    const yFrac = (e.clientY - r.top) / r.height;
    if (yFrac < 0.08) {
      /* the ribbon: jump straight there */
      const B = LP.band.BANDS[LP.rx.band];
      tuneTo(B.lo + (e.clientX - r.left) / r.width * (B.hi - B.lo), true);
      return;
    }
    e.preventDefault();
    glass.setPointerCapture(e.pointerId);
    glassDrag = { id: e.pointerId, x: e.clientX, vfo: LP.rx.vfo, w: r.width };
  });
  glass.addEventListener('pointermove', (e) => {
    if (!glassDrag || e.pointerId !== glassDrag.id) return;
    const dx = e.clientX - glassDrag.x;
    tuneTo(glassDrag.vfo - dx * (LP.display.WIN / glassDrag.w), true);
  });
  const glassUp = (e) => { if (glassDrag && e.pointerId === glassDrag.id) glassDrag = null; };
  glass.addEventListener('pointerup', glassUp);
  glass.addEventListener('pointercancel', glassUp);

  /* fine tuning: the wheel, anywhere over the rig */
  for (const el of [glass, dial]) {
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const step = e.shiftKey ? 1 : 0.1;
      tuneTo(LP.rx.vfo + (e.deltaY > 0 ? -step : step));
    }, { passive: false });
  }

  /* ---------- logbook ---------- */
  function toggleLog(force) {
    const book = document.getElementById('logbook');
    const open = force !== undefined ? force : book.hidden;
    if (open) {
      book.hidden = false;
      requestAnimationFrame(() => book.classList.add('open'));
      LP.log.render();
      LP.say(`Station log open — ${LP.log.entries.length} ${LP.log.entries.length === 1 ? 'entry' : 'entries'}.`);
    } else {
      book.classList.remove('open');
      setTimeout(() => { if (!book.classList.contains('open')) book.hidden = true; }, 520);
      LP.say('Station log closed.');
    }
    logBtn.setAttribute('aria-expanded', String(open));
  }
  logBtn.addEventListener('click', () => toggleLog());
  LP.toggleLog = toggleLog;

  /* ---------- bare keys ---------- */
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('logbook').hidden) { toggleLog(false); return; }
    if (e.target instanceof HTMLElement && ['BUTTON', 'INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (e.target === dial) return; /* the dial has its own map */
    if (dialDrag || glassDrag) return; /* no band jumps mid-drag */
    switch (e.key) {
      case 'ArrowLeft': tuneTo(LP.rx.vfo - 0.1); break;
      case 'ArrowRight': tuneTo(LP.rx.vfo + 0.1); break;
      case 'ArrowDown': tuneTo(LP.rx.vfo - 1); break;
      case 'ArrowUp': tuneTo(LP.rx.vfo + 1); break;
      case '1': setBand(0); break;
      case '2': setBand(1); break;
      case '3': setBand(2); break;
      case 'l': case 'L': toggleLog(); break;
      default: return;
    }
    e.preventDefault();
  });
})();
