/* THE LISTENING POST — WEFAX. HF radiofax, the weather drawn slowly: a
   synoptic analysis chart transmitted at 120 lines/minute, FM, black ink at
   1500 Hz and white paper at 2300. The chart is procedural and tracks the
   day's real space weather — a storm day draws a deeper low. Sit with one to
   the end and the finished chart is pinned into your log beside the postcards.

   Like POSTCARD, the audio reads lineAt() so the whine you hear IS the ink
   passing under the drum. */
LP.wefax = (() => {
  const W = 320, H = 240;
  const panel = document.getElementById('wefax-develop');
  const cv = document.getElementById('wefax');
  if (!cv) return { update() {}, lineAt() { return 0.9; } };
  const cx = cv.getContext('2d');
  const idEl = document.getElementById('wefax-id');
  const pctEl = document.getElementById('wefax-pct');

  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sx = src.getContext('2d');
  let ink = null, genIx = -1, painted = 0, lastSeen = 0, announced = false, curCaption = '';

  /* ---------- the chart ---------- */
  function generate(seed) {
    const rnd = LP.mulberry(seed);
    const k = LP.band.weather.k();
    /* fax paper: an off-white with a faint tea stain */
    sx.fillStyle = '#efe9d8'; sx.fillRect(0, 0, W, H);
    sx.fillStyle = 'rgba(150,135,95,.05)'; sx.fillRect(0, 0, W, H);

    sx.strokeStyle = '#3a4152'; sx.fillStyle = '#3a4152';
    sx.lineWidth = 0.6;
    /* the graticule: lat/lon crosses */
    sx.globalAlpha = 0.35;
    for (let gx = 40; gx < W; gx += 48) for (let gy = 30; gy < H - 18; gy += 40) {
      sx.beginPath(); sx.moveTo(gx - 3, gy); sx.lineTo(gx + 3, gy); sx.moveTo(gx, gy - 3); sx.lineTo(gx, gy + 3); sx.stroke();
    }
    sx.globalAlpha = 1;

    /* a coastline: a wavy meridian, land faintly shaded to its west */
    const cxs = 70 + rnd() * 40;
    sx.beginPath();
    sx.moveTo(cxs, 22);
    for (let y = 22; y <= H - 18; y += 6) {
      sx.lineTo(cxs + Math.sin(y / 34 + seed) * 16 + Math.sin(y / 11) * 4, y);
    }
    sx.strokeStyle = '#2b3242'; sx.lineWidth = 1.1; sx.stroke();
    sx.save();
    sx.globalAlpha = 0.06; sx.fillStyle = '#4a5a4e';
    sx.lineTo(0, H - 18); sx.lineTo(0, 22); sx.closePath(); sx.fill();
    sx.restore();

    /* pressure centres: one LOW (deeper when the band is stormy) and one HIGH,
       each ringed by concentric isobars labelled in millibars */
    function system(cxp, cyp, kind, rings, mb, step) {
      sx.strokeStyle = kind === 'L' ? '#7a2f27' : '#2b3242';
      for (let r = 1; r <= rings; r++) {
        const rr = r * (7 + rnd() * 2);
        sx.beginPath();
        for (let a = 0; a <= LP.TAU + 0.1; a += 0.35) {
          const wob = 1 + Math.sin(a * 3 + r + seed) * 0.08;
          const x = cxp + Math.cos(a) * rr * 1.25 * wob;
          const y = cyp + Math.sin(a) * rr * wob;
          a === 0 ? sx.moveTo(x, y) : sx.lineTo(x, y);
        }
        sx.lineWidth = 0.7; sx.stroke();
        if (r === rings) {
          sx.font = '7px Consolas, monospace'; sx.fillStyle = sx.strokeStyle;
          sx.fillText(String(mb + (kind === 'L' ? r : -r) * step), cxp + rr * 1.25 + 2, cyp);
        }
      }
      sx.font = 'bold 15px Georgia, serif'; sx.fillStyle = kind === 'L' ? '#7a2f27' : '#2b3242';
      sx.textAlign = 'center'; sx.fillText(kind, cxp, cyp + 5); sx.textAlign = 'left';
    }
    const lowMb = 1004 - k * 4 - Math.floor(rnd() * 8);        /* storm days: deeper */
    const lowX = 150 + rnd() * 60, lowY = 70 + rnd() * 60;
    system(lowX, lowY, 'L', 3 + Math.min(2, Math.floor(k / 3)), lowMb, 4);
    system(210 + rnd() * 70, 150 + rnd() * 50, 'H', 3, 1024 + Math.floor(rnd() * 8), 4);

    /* a cold front trailing from the low: a line barbed with triangles */
    sx.strokeStyle = '#2b4a8a'; sx.fillStyle = '#2b4a8a'; sx.lineWidth = 1.4;
    const fpts = [];
    for (let s = 0; s <= 10; s++) {
      fpts.push([lowX + s * (5 + rnd() * 2), lowY + s * (9 + rnd() * 3) - 8]);
    }
    sx.beginPath(); fpts.forEach(([x, y], i) => i ? sx.lineTo(x, y) : sx.moveTo(x, y)); sx.stroke();
    for (let s = 1; s < fpts.length - 1; s += 2) {
      const [x, y] = fpts[s]; const [nx, ny] = fpts[s + 1];
      const dx = nx - x, dy = ny - y, len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;
      sx.beginPath(); sx.moveTo(x, y); sx.lineTo(x + dx * 0.5 + px * 5, y + dy * 0.5 + py * 5); sx.lineTo(nx, ny); sx.closePath(); sx.fill();
    }

    /* header + footer strips */
    sx.fillStyle = '#20242c'; sx.font = '9px Consolas, monospace'; sx.textAlign = 'left';
    const dd = LP.date(seed * 1); /* seed is the cycle index; label with today */
    const now = LP.date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    curCaption = `SURFACE ANALYSIS ${hh}00Z`;
    sx.fillText(curCaption, 6, 12);
    sx.fillText('DESERT MET  ' + (k >= 6 ? 'GALE WARNING' : k >= 4 ? 'SEAS ROUGHENING' : 'SLACK GRADIENT'), 6, H - 6);
    cv.setAttribute('aria-label', `Received weather chart: ${curCaption.toLowerCase()}, ${k >= 6 ? 'a deep low, gale warning' : 'a settled pattern'}.`);

    /* ink table for the audio: 0 = paper (white/2300 Hz), 1 = ink (1500 Hz) */
    const img = sx.getImageData(0, 0, W, H).data;
    ink = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const lum = img[i * 4] * 0.3 + img[i * 4 + 1] * 0.59 + img[i * 4 + 2] * 0.11;
      ink[i] = 255 - lum; /* dark ink → high ink value */
    }
  }

  /* the tone the drum is sending at this progress: white paper rides high */
  function lineAt(prog) {
    if (!ink) return 0.1;
    const line = Math.min(H - 1, Math.floor(prog * H));
    const x = Math.min(W - 1, Math.floor((prog * H % 1) * W));
    return ink[line * W + x] / 255; /* 0 paper .. 1 ink */
  }

  let _st = null;
  const station = () => _st || (_st = LP.band.stations.find(s => s.type === 'wefax'));
  function update(t) {
    const st = station();
    if (!st) return;
    const off = LP.rx.vfo - st.f;
    const tuned = LP.rx.band === st.band && Math.abs(off) < 3.0;
    const prog = st.prog(t);
    const ix = Math.floor(t / st.PERIOD);

    if (tuned && ix !== genIx) {
      genIx = ix; generate(ix); painted = 0; announced = false;
      cx.fillStyle = '#0a0d0b'; cx.fillRect(0, 0, W, H);
    }
    if (tuned && prog >= 0) {
      lastSeen = t;
      const target = Math.floor(prog * H);
      const quality = LP.band.strength(st, t) * Math.exp(-(off * off) / 2.2);
      if (target - painted > 3) { /* lines missed while away come in as static */
        cx.fillStyle = '#12100c'; cx.fillRect(0, painted, W, target - 2 - painted);
        painted = target - 2;
      }
      let budget = 40;
      while (painted < target && budget-- > 0) {
        const y = painted;
        const skew = Math.round(off * 5);
        cx.drawImage(src, 0, y, W, 1, skew, y, W, 1);
        if (quality < 0.8) { /* a noisy copy speckles */
          cx.globalAlpha = (0.8 - quality) * 0.9; cx.fillStyle = '#0a0d0b';
          for (let n = 0; n < 12; n++) cx.fillRect(Math.random() * W, y, 2 + Math.random() * 7, 1);
          cx.globalAlpha = 1;
        }
        painted++;
      }
      if (!announced && painted > 4) { announced = true; LP.say('A weather chart is coming in on 9410.'); }
      if (painted >= H - 1 && announced !== 'done') {
        announced = 'done';
        LP.say(`Chart received: ${curCaption.toLowerCase()}. Pinned to the log.`);
        if (LP.log && LP.log.attachPicture) {
          try {
            const th = document.createElement('canvas'); th.width = 128; th.height = 96;
            th.getContext('2d').drawImage(cv, 0, 0, 128, 96);
            LP.log.attachPicture(th.toDataURL('image/jpeg', 0.6), curCaption.toLowerCase(), 'WEFAX');
          } catch { /* tainted/oversized canvas just skips the keepsake */ }
        }
      }
      cx.fillStyle = 'rgba(180,190,180,.85)'; cx.fillRect(0, Math.min(H - 1, target), W, 1);
      if (pctEl) pctEl.textContent = `${Math.floor(prog * 100)}%`;
      if (idEl) idEl.textContent = 'WEFAX · 9410';
    } else if (tuned && prog < 0) {
      if (idEl) idEl.textContent = 'WEFAX · IDENT';
      if (pctEl) pctEl.textContent = '';
      lastSeen = t;
    }
    const open = (t - lastSeen < 9000 && painted > 0) || (tuned && prog >= 0);
    if (open !== update._open) {
      update._open = open;
      if (!panel) return;
      if (open) { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open')); }
      else { panel.classList.remove('open'); setTimeout(() => { if (!update._open) panel.hidden = true; }, 520); }
    }
  }

  return { update, lineAt };
})();
