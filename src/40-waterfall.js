/* THE LISTENING POST — the glass. A phosphor waterfall of a 48 kHz window
   around the VFO, a full-band ribbon above it, a falling-raster history
   below the scan line. Reduced motion swaps the scroll for a still
   spectrum graph, redrawn gently.

   This file also owns the master loop: model → audio → glass → meter. */
LP.display = (() => {
  const cv = document.getElementById('waterfall');
  const cx = cv.getContext('2d');
  const meter = document.getElementById('smeter');
  const mx = meter.getContext('2d');
  const freqEl = document.getElementById('freq');
  const COLS = 512;
  const ROWS = 300;
  const WIN = () => LP.rx.span;   /* kHz visible in the waterfall — now zoomable */

  /* offscreen raster */
  const wf = document.createElement('canvas');
  wf.width = COLS; wf.height = ROWS;
  const wx = wf.getContext('2d');
  wx.fillStyle = '#03100a'; wx.fillRect(0, 0, COLS, ROWS);

  /* phosphor LUT */
  const LUT = new Uint8ClampedArray(256 * 3);
  for (let i = 0; i < 256; i++) {
    const x = i / 255;
    const r = x < .55 ? x * 30 : 30 + (x - .55) * 420;
    const g = 18 + x * 225;
    const b = x < .5 ? 14 + x * 60 : 44 + (x - .5) * 140;
    LUT[i * 3] = x < .04 ? 3 : r;
    LUT[i * 3 + 1] = x < .04 ? 14 : g;
    LUT[i * 3 + 2] = x < .04 ? 8 : b;
  }
  const rowImg = wx.createImageData(COLS, 1);
  const rowBuf = new Float32Array(COLS);
  const ribbonBuf = new Float32Array(COLS);
  const rng = LP.mulberry(9130);

  let lastRow = 0, lastRibbon = 0, ribbonImg = null, dirty = true;
  /* phosphor bloom is a glow effect, not information: on for motion, off for
     reduced-motion (and it costs one blurred blit, so it stays cheap) */
  const bloom = !LP.rm.matches;

  /* soft-knee transfer: peaks glow near-white but never flatten, so QSB
     fading stays readable all the way down the raster's history */
  const level = (x) => Math.min(255, Math.floor(255 * Math.tanh(x * 1.55)));

  function pushRow(t) {
    const win = WIN();
    const fLo = LP.rx.vfo - win / 2, fHi = LP.rx.vfo + win / 2;
    LP.band.spectrumRow(rowBuf, fLo, fHi, t, LP.rx.band, rng);
    const d = rowImg.data;
    for (let i = 0; i < COLS; i++) {
      const v = level(rowBuf[i]);
      d[i * 4] = LUT[v * 3]; d[i * 4 + 1] = LUT[v * 3 + 1]; d[i * 4 + 2] = LUT[v * 3 + 2]; d[i * 4 + 3] = 255;
    }
    /* scroll down one, new row on top */
    wx.drawImage(wf, 0, 0, COLS, ROWS - 1, 0, 1, COLS, ROWS - 1);
    wx.putImageData(rowImg, 0, 0);
    dirty = true;
  }

  let ribbonCv = null;
  function ribbon(t) {
    /* the whole band at a glance, redrawn at 2 fps */
    const B = LP.band.BANDS[LP.rx.band];
    LP.band.spectrumRow(ribbonBuf, B.lo, B.hi, t, LP.rx.band, rng);
    if (!ribbonImg) ribbonImg = wx.createImageData(COLS, 1);
    const d = ribbonImg.data;
    for (let i = 0; i < COLS; i++) {
      const v = level(ribbonBuf[i] * 0.88);
      d[i * 4] = LUT[v * 3]; d[i * 4 + 1] = LUT[v * 3 + 1]; d[i * 4 + 2] = LUT[v * 3 + 2]; d[i * 4 + 3] = 255;
    }
    if (!ribbonCv) { ribbonCv = document.createElement('canvas'); ribbonCv.width = COLS; ribbonCv.height = 1; }
    ribbonCv.getContext('2d').putImageData(ribbonImg, 0, 0); /* uploaded at 2 fps, not per frame */
    dirty = true;
  }

  function draw(t) {
    const w = cv.width, h = cv.height;
    if (!w) return;
    cx.clearRect(0, 0, w, h);
    const ribbonH = Math.max(14, h * 0.05);
    const scaleH = Math.max(18, h * 0.055);
    const wfY = ribbonH + 6;
    const wfH = h - wfY - scaleH;

    /* ribbon: full band + logged pencil ticks + the cursor */
    if (ribbonCv) {
      cx.imageSmoothingEnabled = false;
      cx.drawImage(ribbonCv, 0, 0, COLS, 1, 0, 0, w, ribbonH);
      cx.imageSmoothingEnabled = true;
    }
    const B = LP.band.BANDS[LP.rx.band];
    for (const st of LP.band.stations) {
      if (st.band !== LP.rx.band || !LP.log.has(st.id)) continue;
      const x = (st.f - B.lo) / (B.hi - B.lo) * w;
      cx.strokeStyle = 'rgba(154,163,156,.8)';
      cx.lineWidth = 1;
      cx.beginPath(); cx.moveTo(x - 3, ribbonH + 3); cx.lineTo(x, ribbonH - 2); cx.lineTo(x + 3, ribbonH + 3); cx.stroke();
    }
    const cursorX = (LP.rx.vfo - B.lo) / (B.hi - B.lo) * w;
    cx.fillStyle = 'rgba(217,164,65,.9)';
    cx.fillRect(cursorX - 1, 0, 2, ribbonH + 4);

    /* waterfall window (or the rm spectrum graph) */
    if (LP.rm.matches) {
      /* designed still: the current row as a line graph */
      cx.strokeStyle = 'rgba(111,221,139,.85)';
      cx.lineWidth = 1.5;
      cx.beginPath();
      for (let i = 0; i < COLS; i++) {
        const x = i / COLS * w;
        const y = wfY + wfH - Math.min(1, rowBuf[i] * 1.4) * wfH * 0.92;
        i === 0 ? cx.moveTo(x, y) : cx.lineTo(x, y);
      }
      cx.stroke();
      cx.strokeStyle = 'rgba(46,92,60,.5)';
      cx.strokeRect(0.5, wfY + .5, w - 1, wfH - 1);
    } else {
      cx.imageSmoothingEnabled = false;
      cx.drawImage(wf, 0, 0, COLS, ROWS, 0, wfY, w, wfH);
      cx.imageSmoothingEnabled = true;
      /* PHOSPHOR BLOOM: a second, blurred, additive pass so bright traces
         glow and halo the way a real tube does — the single most "CRT" move.
         One extra blit at the 30 Hz composite rate; skipped for reduced motion
         and when the filter API is missing. */
      if (bloom && cx.filter !== undefined) {
        cx.save();
        cx.globalCompositeOperation = 'lighter';
        cx.globalAlpha = 0.5;
        cx.filter = `blur(${Math.max(1.5, wfH * 0.006)}px)`;
        cx.imageSmoothingEnabled = true;
        cx.drawImage(wf, 0, 0, COLS, ROWS, 0, wfY, w, wfH);
        cx.filter = 'none';
        cx.restore();
      }
    }

    /* center line: where you are listening (device-pixel true weights) */
    const px = LP.DPR();
    cx.fillStyle = 'rgba(217,164,65,.55)';
    cx.fillRect(w / 2 - px / 2, wfY, px, wfH);
    cx.fillStyle = 'rgba(217,164,65,.9)';
    cx.beginPath();
    cx.moveTo(w / 2 - 5 * px, wfY); cx.lineTo(w / 2 + 5 * px, wfY); cx.lineTo(w / 2, wfY + 7 * px);
    cx.closePath(); cx.fill();

    /* frequency scale: the tick step tightens as you zoom in, so a 12 kHz
       window is graduated in single kilohertz */
    const win = WIN();
    const fLo = LP.rx.vfo - win / 2;
    const step = win >= 40 ? 5 : (win >= 20 ? 2 : 1);
    cx.font = `${Math.max(9, h * 0.028)}px Consolas, monospace`;
    cx.textAlign = 'center';
    const first = Math.ceil(fLo / step) * step;
    for (let f = first; f < fLo + win; f += step) {
      const x = (f - fLo) / win * w;
      cx.fillStyle = 'rgba(154,163,156,.4)';
      cx.fillRect(x, wfY + wfH, px, 5 * px);
      cx.fillStyle = 'rgba(154,163,156,.8)';
      cx.fillText(String(f), x, h - 5);
    }
    /* span badge: tell the operator how wide the window is */
    cx.textAlign = 'right';
    cx.fillStyle = 'rgba(217,164,65,.85)';
    cx.font = `${Math.max(8, h * 0.024)}px Consolas, monospace`;
    cx.fillText(`SPAN ${win} kHz`, w - 6, wfY + 12 * px);
  }

  /* ---------- S-meter ---------- */
  /* the scale never changes between resizes: paint it once, blit it forever.
     Graduated in S-units now — S1..S9 in pencil, the red past S9 — with a
     perceptual (log-ish) needle law like a real movement. */
  let needle = 0, needleV = 0, meterBg = null;
  function meterScale() {
    const w = meter.width, h = meter.height;
    if (!w) return;
    if (!meterBg) meterBg = document.createElement('canvas');
    meterBg.width = w; meterBg.height = h;
    const bx = meterBg.getContext('2d');
    const px = LP.DPR();
    const cxp = w / 2, cyp = h * 1.32, r = h * 1.05;
    bx.strokeStyle = '#2b332e'; bx.lineWidth = px;
    bx.beginPath(); bx.arc(cxp, cyp, r, -2.25, -0.9); bx.stroke();
    bx.font = `${Math.max(6, h * 0.14)}px Consolas, monospace`;
    bx.textAlign = 'center';
    const LABELS = ['1', '', '3', '', '5', '', '7', '', '9'];
    for (let i = 0; i <= 8; i++) {
      const a = -2.25 + (i / 8) * 1.35;
      bx.strokeStyle = i > 6 ? 'rgba(217,109,90,.8)' : 'rgba(154,163,156,.5)';
      bx.lineWidth = (i % 2 === 0 ? 1.6 : 1) * px;
      bx.beginPath();
      bx.moveTo(cxp + Math.cos(a) * (r - 4 * px), cyp + Math.sin(a) * (r - 4 * px));
      bx.lineTo(cxp + Math.cos(a) * (r + 3 * px), cyp + Math.sin(a) * (r + 3 * px));
      bx.stroke();
      if (LABELS[i]) {
        bx.fillStyle = i > 6 ? 'rgba(217,109,90,.8)' : 'rgba(154,163,156,.7)';
        bx.fillText(LABELS[i], cxp + Math.cos(a) * (r + 8 * px), cyp + Math.sin(a) * (r + 8 * px) + 3 * px);
      }
    }
    bx.fillStyle = 'rgba(154,163,156,.55)';
    bx.textAlign = 'left';
    bx.fillText('S', 4 * px, h - 4 * px);
  }
  function drawMeter(dt) {
    const w = meter.width, h = meter.height;
    const px = LP.DPR();
    mx.clearRect(0, 0, w, h);
    if (meterBg) mx.drawImage(meterBg, 0, 0);
    const cxp = w / 2, cyp = h * 1.32, r = h * 1.05;
    /* a real movement: log-taper target, spring-and-damper needle with a
       touch of overshoot. Reduced motion snaps honestly. */
    const target = Math.pow(LP.clamp(LP.audio.smeter, 0, 1), 0.72);
    if (LP.rm.matches) { needle = target; needleV = 0; }
    else {
      const dtS = Math.min(0.05, (dt || 16) / 1000);
      const W0 = 18, ZETA = 0.6; /* ~60 ms response, slight overshoot */
      needleV += (W0 * W0 * (target - needle) - 2 * ZETA * W0 * needleV) * dtS;
      needle += needleV * dtS;
    }
    const a = -2.25 + LP.clamp(needle, 0, 1) * 1.35;
    mx.strokeStyle = '#d9a441'; mx.lineWidth = 1.6 * px;
    mx.beginPath();
    mx.moveTo(cxp, cyp);
    mx.lineTo(cxp + Math.cos(a) * (r + px), cyp + Math.sin(a) * (r + px));
    mx.stroke();
  }

  /* ---------- the decoder: the sub-line types what the lock is sending ---------- */
  const subEl = document.getElementById('sub-line');
  let lastDecode = 0, decoding = false, rttySt = null;
  function decodeTicker(t) {
    if (t - lastDecode < 160) return;
    lastDecode = t;
    if (!subEl) return;
    const lock = LP.log.lockedOn;
    if (lock === 'THE FORECAST') {
      /* the model owns the schedule; the masthead only types what it is told.
         An idle carrier types nothing — but stays a decoder, not a slogan. */
      rttySt = rttySt || LP.band.stations.find(s => s.type === 'rtty');
      const s = rttySt.window(t, 42);
      subEl.textContent = s === null ? '·' : (s || '·');
      decoding = true;
      return;
    } else if (lock) {
      const st = LP.band.stations.find(s => s.id === lock);
      if (st && st.type === 'sstv') {
        /* the picture is not morse: while it paints, the masthead says so,
           and during the ident it decodes IN PHASE with the keying */
        const prog = st.prog(t);
        if (prog >= 0) { subEl.textContent = `PICTURE ${Math.floor(prog * 100)}%`; decoding = true; return; }
        const identT = (t % st.PERIOD) - st.TX - 8000;
        subEl.textContent = (identT > 0 && identT < 32000)
          ? (LP.band.decodeMorse(st._m, identT % st._m.total).slice(-44) || '·') : '·';
        decoding = true;
        return;
      }
      /* lock any CW station and the masthead becomes the decoder — the text
         appears character by character, in sync with the keying you hear.
         It decodes whatever is actually on the air: during a cross-read the
         sub-line types the WRONG ident under the right nameplate. */
      if (st && st._m && st._m.chars) {
        const k = st.keyed ? st.keyed(t) : { m: st._m, off: t };
        const s = LP.band.decodeMorse(k.m, k.off % k.m.total).replace(/%/g, 'SK');
        subEl.textContent = s.slice(-44) || '·';
        decoding = true;
        return;
      }
    }
    if (decoding) { decoding = false; subEl.textContent = 'The band is open'; }
  }

  /* ---------- readout ---------- */
  const lockbar = document.getElementById('lockbar');
  let lastShown = -1, lastLock = null, lastProg = -1;
  function readout() {
    const v = LP.rx.vfo;
    const vi = Math.round(v * 10); /* cheap change check before any string work */
    if (vi !== lastShown) {
      lastShown = vi;
      const s = `${Math.floor(v / 1000)} ${String(Math.floor(v % 1000)).padStart(3, '0')}.${Math.floor((v * 10) % 10)}`;
      freqEl.innerHTML = `${s} <span class="khz">kHz</span>`;
    }
    /* the pencil line: holding a signal visibly draws its log entry */
    if (lockbar) {
      const p = Math.round((LP.log.lockProgress || 0) * 100);
      if (p !== lastProg) { lastProg = p; lockbar.style.width = p + '%'; }
    }
    const lock = LP.log.lockedOn;
    if (lock !== lastLock) {
      lastLock = lock;
      freqEl.classList.toggle('locked', !!lock);
      /* the nameplate: the set tells you what you are hearing */
      const idEl = document.getElementById('station-id');
      if (idEl) {
        if (lock) idEl.textContent = lock;
        idEl.classList.toggle('on', !!lock);
      }
      if (LP.reflectDial) LP.reflectDial();               /* the slider's valuetext carries the signal */
      if (lock) LP.say(`Signal: ${lock}.`);
    }
  }

  /* ---------- sizing ---------- */
  function resize() {
    const r = cv.getBoundingClientRect();
    if (!r.width) return;
    const px = LP.DPR();
    cv.width = Math.round(r.width * px);
    cv.height = Math.round(r.height * px);
    const mr = meter.getBoundingClientRect();
    meter.width = Math.round(mr.width * px);
    meter.height = Math.round(mr.height * px);
    meterScale();
    dirty = true;
    LP.ticker.kick();
  }
  addEventListener('resize', () => { clearTimeout(LP._rzT); LP._rzT = setTimeout(resize, 120); });

  /* ---------- the master loop ---------- */
  let lastVfoDrawn = 0;
  function loop(dt) {
    if (!cv.width) { resize(); if (!cv.width) return; }
    const t = LP.now();
    const dwell = performance.now() - LP.rx.dwellT0;

    /* the ghost stalks quiet frequencies */
    let nearStation = false;
    for (const s of LP.band.stations) {
      if (s.band === LP.rx.band && Math.abs(s.f - LP.rx.vfo) < 3 && LP.band.strength(s, t) > 0.05 && (!s.isOn || s.isOn())) { nearStation = true; break; }
    }
    LP.band.ghost.tune(LP.rx.vfo, dwell, nearStation, dt);

    const rm = LP.rm.matches;
    const rowEvery = rm ? 500 : 33;
    /* the one permitted lie: on echo nights, for one seeded half-minute,
       the glass runs one row ahead of the ear (see docs/PROPOSAL.md) */
    if (t - lastRow > rowEvery) { lastRow = t; pushRow(LP.band.earlyNow(t) ? t + 33 : t); }
    if (t - lastRibbon > 500) { lastRibbon = t; ribbon(t); }

    LP.audio.update(t);
    if (LP.sstv) LP.sstv.update(t);
    if (LP.log) LP.log.check(t);

    /* the glass repaints only when its content did (the raster is 30 Hz,
       the tune is event-driven); the little meter runs every frame */
    if (LP.rx.vfo !== lastVfoDrawn) dirty = true;
    if (dirty && (!rm || t - (loop._rmDraw || 0) > 400)) {
      draw(t);
      dirty = false;
      lastVfoDrawn = LP.rx.vfo;
      loop._rmDraw = t;
    }
    drawMeter(dt);
    readout();
    decodeTicker(t);
  }

  function invalidateRow() { lastRow = 0; dirty = true; }

  /* zoom the window. The raster below is wiped so its history never shows two
     different scales stacked; the new width redraws from the next row down. */
  function setSpan(span) {
    if (span === LP.rx.span) return;
    LP.rx.span = span;
    wx.fillStyle = '#03100a'; wx.fillRect(0, 0, COLS, ROWS);
    lastRow = 0; dirty = true;
    LP.ticker.kick();
    LP.store.set('span', span);
    if (LP.reflectZoom) LP.reflectZoom();
    if (LP.reflectDial) LP.reflectDial();
    LP.say(`Span ${span} kilohertz${span === 12 ? ' — the keying resolves' : ''}.`);
  }
  function cycleSpan() {
    const i = LP.SPANS.indexOf(LP.rx.span);
    setSpan(LP.SPANS[(i + 1) % LP.SPANS.length]);
  }
  LP.setSpan = setSpan; LP.cycleSpan = cycleSpan;

  function boot() {
    const saved = LP.store.get('span', 48);
    if (LP.SPANS.includes(saved)) LP.rx.span = saved;
    if (LP.reflectZoom) LP.reflectZoom(); /* the chip tells the truth on return visits too */
    resize();
    LP.ticker.add(loop);
  }

  return { boot, resize, frame: loop, get WIN() { return LP.rx.span; }, invalidateRow, setSpan, cycleSpan };
})();
