/* THE LISTENING POST — the operator's hands. Drag the glass or the dial,
   roll the wheel for fine work, or never touch the pointer at all:
   arrows tune, 1/2/3 change bands, L opens the log. */
(() => {
  const dial = document.getElementById('dial');
  const glass = document.getElementById('waterfall');
  const bands = [0, 1, 2].map(i => document.getElementById('band-' + i));
  const logBtn = document.getElementById('log-toggle');
  const zoomBtn = document.getElementById('zoom-toggle');

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
  }
  reflectBand(); /* the chips tell the truth on the FIRST visit too */

  function persist() {
    lastVfo[LP.rx.band] = LP.rx.vfo;
    LP.store.set('rx', { band: LP.rx.band, lastVfo });
  }

  /* the trace: where this listener actually keeps their dial. Recorded only
     in long stays; the band reads it back on the rare days one of the
     numbers groups is about you. Never announced. */
  let dwellRec = { f: LP.rx.vfo, t0: performance.now() };
  function noteDwell() {
    const dur = performance.now() - dwellRec.t0;
    if (dur > 20000) {
      const key = String(Math.round(dwellRec.f));
      let tr = LP.store.get('trace', {});
      if (!tr || typeof tr !== 'object' || Array.isArray(tr)) tr = {}; /* a poisoned trace must never jam the dial */
      tr[key] = Math.min(3600000, (Number(tr[key]) || 0) + dur);
      const keep = Object.keys(tr).sort((a, b) => tr[b] - tr[a]).slice(0, 8);
      const slim = {};
      for (const k of keep) slim[k] = tr[k];
      LP.store.set('trace', slim);
    }
  }
  addEventListener('pagehide', noteDwell);

  function reflectDial() {
    const B = LP.band.BANDS[LP.rx.band];
    dial.setAttribute('aria-valuemax', String(Math.round(B.hi - B.lo))); /* the band defines the slider, not a constant */
    dial.setAttribute('aria-valuenow', String(Math.round(LP.rx.vfo - B.lo)));
    const lock = LP.log && LP.log.lockedOn;
    dial.setAttribute('aria-valuetext', `${LP.rx.vfo.toFixed(1)} kilohertz${lock ? ' — signal: ' + lock : ''}`);
  }
  LP.reflectDial = reflectDial;

  function tuneTo(f, coarse, fromCoast) {
    if (!fromCoast && typeof stopCoast === 'function') stopCoast(); /* any deliberate tune catches the flywheel */
    const B = LP.band.BANDS[LP.rx.band];
    if (Math.abs(f - dwellRec.f) > 0.5) {       /* leaving a spot: bank the stay */
      noteDwell();
      dwellRec = { f, t0: performance.now() };
    }
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
    dialDrag = null; glassDrag = null; stopCoast(); /* a band jump ends any drag or coast in flight */
    const gh = LP.band.ghost;
    if (gh.state !== 'asleep' && gh.state !== 'gone') gh.state = 'asleep'; /* the relay slams; it loses the scent */
    lastVfo[LP.rx.band] = LP.rx.vfo;
    LP.rx.band = ix;
    reflectBand();
    if (LP.relayClunk) LP.relayClunk();   /* the band switch throws a relay */
    tuneTo(lastVfo[ix], true);
    LP.say(`Band ${LP.band.BANDS[ix].name.toLowerCase()}, ${LP.rx.vfo.toFixed(1)} kilohertz.`);
    persist();
  }
  function reflectBand() {
    bands.forEach((b, i) => b.setAttribute('aria-pressed', String(i === LP.rx.band)));
  }
  bands.forEach((b, i) => b.addEventListener('click', () => setBand(i)));

  /* ---------- the dial strip (one pointer owns a drag, start to finish) ----------
     A weighted flywheel: fling the dial and it coasts, shedding speed against
     friction until it settles — the tuning knob has mass. */
  let dialDrag = null, coastV = 0, flingV = 0, coastTask = null, lastMoveT = 0, coastVfo = 0;
  /* stopCoast kills the ACTIVE coast; it must not touch flingV, the velocity a
     live drag is still accumulating (a deliberate tune stops the coast, but a
     fling in progress keeps its momentum) */
  function stopCoast() { if (coastTask) { coastTask(); coastTask = null; } coastV = 0; }
  function startCoast() {
    if (LP.rm.matches) { coastV = 0; return; }              /* no surprise motion */
    if (Math.abs(coastV) < 0.02) { coastV = 0; return; }   /* too slow to bother */
    if (coastTask) return;
    coastTask = LP.ticker.add((dt) => {
      const B = LP.band.BANDS[LP.rx.band];
      LP.rx.vfo = LP.rx.vfo + coastV * dt;
      coastV *= Math.exp(-dt / 320);                        /* the flywheel's drag */
      /* the band edge is a soft wall — the momentum dies against it */
      if (LP.rx.vfo <= B.lo) { LP.rx.vfo = B.lo; coastV = 0; }
      if (LP.rx.vfo >= B.hi) { LP.rx.vfo = B.hi; coastV = 0; }
      tuneTo(LP.rx.vfo, true, true);
      if (Math.abs(coastV) < 0.008) { coastTask = null; return false; }
    });
  }
  dial.addEventListener('pointerdown', (e) => {
    if (LP.dismissCardSoft) LP.dismissCardSoft(); /* hands on the dial: the card bows out */
    if (dialDrag) return;
    e.preventDefault();
    stopCoast();                                            /* catch the spinning knob */
    try { dial.setPointerCapture(e.pointerId); } catch { }
    dialDrag = { id: e.pointerId, x: e.clientX, vfo: LP.rx.vfo };
    lastMoveT = performance.now(); coastVfo = LP.rx.vfo;
    dial.focus();
  });
  dial.addEventListener('pointermove', (e) => {
    if (!dialDrag || e.pointerId !== dialDrag.id) return;
    const dx = e.clientX - dialDrag.x;
    const nv = dialDrag.vfo + dx * 0.12;
    const now = performance.now(), dt = now - lastMoveT;
    if (dt > 0) flingV = (nv - coastVfo) / dt;             /* kHz per ms, banked for release */
    lastMoveT = now; coastVfo = nv;
    tuneTo(nv, true);
  });
  const dialUp = (e) => {
    if (dialDrag && e.pointerId === dialDrag.id) {
      dialDrag = null;
      if (performance.now() - lastMoveT < 90) { coastV = flingV; startCoast(); } /* released mid-motion: let it run */
      else coastV = 0;
      flingV = 0;
    }
  };
  dial.addEventListener('pointerup', dialUp);
  dial.addEventListener('pointercancel', dialUp);
  dial.addEventListener('lostpointercapture', dialUp);

  /* ---------- the glass: grab the spectrum itself ---------- */
  let glassDrag = null;
  glass.addEventListener('pointerdown', (e) => {
    if (LP.dismissCardSoft) LP.dismissCardSoft();
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
    if (!glassDrag || e.pointerId !== glassDrag.id) {
      /* idle hover: the ribbon strip advertises that it can be tapped */
      const r = glass.getBoundingClientRect();
      if (r.height) glass.style.cursor = (e.clientY - r.top) / r.height < 0.08 ? 'pointer' : '';
      return;
    }
    const dx = e.clientX - glassDrag.x;
    tuneTo(glassDrag.vfo - dx * (LP.display.WIN / glassDrag.w), true);
  });
  const glassUp = (e) => { if (glassDrag && e.pointerId === glassDrag.id) glassDrag = null; };
  glass.addEventListener('pointerup', glassUp);
  glass.addEventListener('pointercancel', glassUp);
  glass.addEventListener('lostpointercapture', glassUp);

  /* fine tuning: the wheel, anywhere over the rig. Scroll distance is
     ACCUMULATED so a trackpad's stream of tiny deltas turns the dial one
     0.1 kHz notch per ~40px instead of one notch per event. */
  let wheelAcc = 0;
  for (const el of [glass, dial]) {
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (LP.dismissCardSoft) LP.dismissCardSoft();
      wheelAcc += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY; /* line-mode wheels count in lines */
      const notches = Math.trunc(wheelAcc / 40);
      if (!notches) return;
      wheelAcc -= notches * 40;
      tuneTo(LP.rx.vfo - notches * (e.shiftKey ? 1 : 0.1));
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

  /* ---------- zoom ---------- */
  function reflectZoom() {
    if (!zoomBtn) return;
    zoomBtn.textContent = `${LP.rx.span} kHz`;
    zoomBtn.setAttribute('aria-label', `Span: ${LP.rx.span} kilohertz. Zoom the window.`);
  }
  LP.reflectZoom = reflectZoom;
  if (zoomBtn) zoomBtn.addEventListener('click', () => { LP.cycleSpan(); reflectZoom(); });
  reflectZoom();

  /* ---------- the operator's card: docked, never a wall ---------- */
  const cardBtn = document.getElementById('card-toggle');
  const card = document.getElementById('opcard');
  const cardClose = document.getElementById('card-close');
  let cardAuto = false;
  function showCard(open, stealFocus = true) {
    const wasOpen = !card.hidden;
    card.hidden = !open;
    cardBtn.setAttribute('aria-expanded', String(open));
    cardAuto = open && !stealFocus;
    if (open && stealFocus) cardClose.focus();
    /* a deliberate close hands focus back to the chip that opened it; a soft
       dismissal (hands already on the dial) steals nothing */
    else if (!open && wasOpen && stealFocus) cardBtn.focus();
  }
  /* the card excuses itself the moment you start operating the set */
  LP.dismissCardSoft = () => { if (cardAuto && !card.hidden) showCard(false, false); };
  cardBtn.addEventListener('click', () => showCard(card.hidden));
  cardClose.addEventListener('click', () => showCard(false));
  LP.showCard = showCard;

  /* ---------- the keys: ONE map, live from any focus ---------- */
  /* The set is the instrument; the keys work wherever your hands are. Browser
     and OS chords pass through untouched, and Enter/Space still belong to
     whatever chip is focused. */
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return; /* never hijack a chord */
    if (e.key === 'Escape' && !card.hidden) { showCard(false); return; }
    if (e.key === 'Escape' && !document.getElementById('logbook').hidden) { toggleLog(false); return; }
    const el = e.target instanceof HTMLElement ? e.target : null;
    if (el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable)) return;
    if (el && el.tagName === 'BUTTON' && (e.key === 'Enter' || e.key === ' ')) return;
    if (dialDrag || glassDrag) return; /* no jumps mid-drag */
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
      case '1': setBand(0); break;
      case '2': setBand(1); break;
      case '3': setBand(2); break;
      case 'z': case 'Z': LP.cycleSpan(); break;
      case 'l': case 'L': toggleLog(); break;
      default: return;
    }
    e.preventDefault();
  });
})();
