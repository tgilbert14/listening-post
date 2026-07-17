/* THE LISTENING POST — POSTCARD. An SSTV station: every six minutes it
   transmits a new procedurally-drawn postcard, thirty-two lines at a time.
   Tune it well and the picture develops clean; tune it badly and the lines
   come in skewed and snowy — exactly like the real thing.

   The audio engine reads lumaAt() so the whistle you hear IS the pixel
   brightness being painted. */
LP.sstv = (() => {
  const W = 320, H = 240;
  const panel = document.getElementById('develop');
  const cv = document.getElementById('sstv');
  const cx = cv.getContext('2d');
  const idEl = document.getElementById('sstv-id');
  const pctEl = document.getElementById('sstv-pct');

  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  const sx = src.getContext('2d');
  let luma = null, cycleIx = -1, painted = 0, lastSeen = 0;

  /* ---------- the postcards ---------- */
  function generate(seed) {
    const rnd = LP.mulberry(seed);
    const motif = seed % 3;
    /* night sky */
    const g = sx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1226'); g.addColorStop(.62, '#1a2340'); g.addColorStop(1, '#2c3055');
    sx.fillStyle = g; sx.fillRect(0, 0, W, H);
    sx.fillStyle = '#e8e6da';
    for (let i = 0; i < 130; i++) {
      const y = rnd() * H * 0.62;
      sx.globalAlpha = 0.3 + rnd() * 0.7;
      sx.fillRect(rnd() * W, y, rnd() < 0.08 ? 2 : 1, 1);
    }
    sx.globalAlpha = 1;

    if (motif === 0) {
      /* the dunes: a big moon, ridgelines, one saguaro */
      const mx = 60 + rnd() * 200, my = 40 + rnd() * 50;
      const mg = sx.createRadialGradient(mx - 6, my - 6, 2, mx, my, 26);
      mg.addColorStop(0, '#fdf6dd'); mg.addColorStop(1, '#cfc394');
      sx.fillStyle = mg;
      sx.beginPath(); sx.arc(mx, my, 24, 0, LP.TAU); sx.fill();
      for (let ridge = 0; ridge < 3; ridge++) {
        const base = H * (0.62 + ridge * 0.13);
        sx.fillStyle = ['#232848', '#181c36', '#0e1024'][ridge];
        sx.beginPath();
        sx.moveTo(0, H);
        for (let x = 0; x <= W; x += 8) {
          sx.lineTo(x, base + Math.sin(x / 43 + ridge * 2 + seed) * 12 + Math.sin(x / 17 + ridge) * 5);
        }
        sx.lineTo(W, H); sx.closePath(); sx.fill();
      }
      /* the saguaro stands on the mid ridge */
      const sxp = 40 + rnd() * 240, syp = H * 0.74;
      sx.strokeStyle = '#0a0c1c'; sx.lineWidth = 7; sx.lineCap = 'round';
      sx.beginPath(); sx.moveTo(sxp, syp); sx.lineTo(sxp, syp - 46); sx.stroke();
      sx.lineWidth = 5;
      sx.beginPath(); sx.moveTo(sxp - 1, syp - 26); sx.lineTo(sxp - 14, syp - 30); sx.lineTo(sxp - 14, syp - 44); sx.stroke();
      sx.beginPath(); sx.moveTo(sxp + 1, syp - 18); sx.lineTo(sxp + 13, syp - 24); sx.lineTo(sxp + 13, syp - 38); sx.stroke();
    } else if (motif === 1) {
      /* the derelict: a dead ship over the horizon — the registry beacon still blinks */
      const y0 = 70 + rnd() * 40;
      sx.fillStyle = '#05070f';
      sx.beginPath();
      sx.moveTo(48, y0 + 14);
      sx.lineTo(96, y0 - 2); sx.lineTo(210, y0 - 6); sx.lineTo(262, y0 + 4);
      sx.lineTo(268, y0 + 16); sx.lineTo(210, y0 + 26); sx.lineTo(88, y0 + 28);
      sx.closePath(); sx.fill();
      sx.fillRect(150, y0 - 18, 5, 16); /* the snapped mast */
      sx.fillStyle = '#d9a441';
      sx.fillRect(151, y0 - 22, 3, 3);  /* the beacon */
      sx.fillStyle = '#7c8fd0'; sx.globalAlpha = .8;
      sx.fillRect(118, y0 + 6, 3, 3);   /* one lit window */
      sx.globalAlpha = 1;
      /* sea of dunes below */
      sx.fillStyle = '#10142a';
      sx.beginPath(); sx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) sx.lineTo(x, H * 0.8 + Math.sin(x / 37 + seed) * 9);
      sx.lineTo(W, H); sx.closePath(); sx.fill();
    } else {
      /* the mast: a listening post of our own, guyed wires, red lamp */
      sx.fillStyle = '#10142a';
      sx.beginPath(); sx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) sx.lineTo(x, H * 0.78 + Math.sin(x / 53 + seed) * 7);
      sx.lineTo(W, H); sx.closePath(); sx.fill();
      const bx = 90 + rnd() * 140, by = H * 0.8;
      sx.strokeStyle = '#0a0c1c'; sx.lineWidth = 3;
      sx.beginPath(); sx.moveTo(bx, by); sx.lineTo(bx, 46); sx.stroke();
      sx.lineWidth = 1;
      for (const [dx, dy] of [[-58, 0], [52, 6], [-40, 10], [36, 14]]) {
        sx.beginPath(); sx.moveTo(bx, 60 + dy * 3); sx.lineTo(bx + dx, by + 2); sx.stroke();
      }
      sx.fillStyle = '#d96d5a';
      sx.beginPath(); sx.arc(bx, 44, 3, 0, LP.TAU); sx.fill();
      sx.fillStyle = 'rgba(217,109,90,.28)';
      sx.beginPath(); sx.arc(bx, 44, 9, 0, LP.TAU); sx.fill();
    }
    /* caption strip, like a wish-you-were-here card */
    sx.fillStyle = 'rgba(232,230,218,.92)';
    sx.fillRect(0, H - 18, W, 18);
    sx.fillStyle = '#20242c';
    sx.font = '10px Georgia, serif';
    sx.textAlign = 'center';
    sx.fillText(['THE DUNES, AFTER MIDNIGHT', 'SHE IS STILL UP THERE', 'WE ARE STILL LISTENING'][motif], W / 2, H - 6);

    /* luma table for the audio */
    const img = sx.getImageData(0, 0, W, H).data;
    luma = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      luma[i] = (img[i * 4] * 0.3 + img[i * 4 + 1] * 0.55 + img[i * 4 + 2] * 0.15);
    }
  }

  function lumaAt(prog) {
    if (!luma) return 0.4;
    const line = Math.min(H - 1, Math.floor(prog * H));
    const x = Math.min(W - 1, Math.floor((prog * H % 1) * W));
    return luma[line * W + x] / 255;
  }

  /* ---------- the develop panel ---------- */
  function update(t) {
    const st = LP.band.stations.find(s => s.type === 'sstv');
    const off = LP.rx.vfo - st.f;
    const tuned = LP.rx.band === st.band && Math.abs(off) < 3.2;
    const prog = st.prog(t);
    const ix = Math.floor(t / st.PERIOD);

    if (ix !== cycleIx) {
      cycleIx = ix;
      generate(ix);
      painted = 0;
      cx.fillStyle = '#060a08';
      cx.fillRect(0, 0, W, H);
    }
    if (tuned && prog >= 0) {
      lastSeen = t;
      const target = Math.floor(prog * H);
      const quality = LP.band.strength(st, t) * Math.exp(-(off * off) / 2.2);
      while (painted < target) {
        const y = painted;
        /* a badly tuned line comes in skewed and snowy */
        const skew = Math.round(off * 6 + (1 - quality) * (Math.random() * 8 - 4));
        cx.drawImage(src, 0, y, W, 1, skew, y, W, 1);
        if (quality < 0.75) {
          cx.globalAlpha = (0.75 - quality) * 0.9;
          cx.fillStyle = '#0a0f0c';
          for (let n = 0; n < 14; n++) cx.fillRect(Math.random() * W, y, 2 + Math.random() * 9, 1);
          cx.globalAlpha = 1;
        }
        painted++;
      }
      /* the live scan line glows */
      cx.fillStyle = 'rgba(111,221,139,.8)';
      cx.fillRect(0, Math.min(H - 1, target), W, 1);
      pctEl.textContent = `${Math.floor(prog * 100)}%`;
      idEl.textContent = 'POSTCARD · 9430';
    } else if (tuned && prog < 0) {
      idEl.textContent = 'POSTCARD · IDENT';
      pctEl.textContent = '';
      lastSeen = t;
    }
    const open = t - lastSeen < 9000 && painted > 0;
    panel.classList.toggle('open', open || (tuned && prog >= 0));
  }

  return { update, lumaAt };
})();
