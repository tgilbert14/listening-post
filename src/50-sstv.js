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
  const CAPTIONS = ['THE DUNES, AFTER MIDNIGHT', 'SHE IS STILL UP THERE', 'WE ARE STILL LISTENING', 'NO ONE AT THE KEY'];
  let luma = null, genIx = -1, painted = 0, lastSeen = 0, announced = false;
  let curCaption = CAPTIONS[0];

  /* ---------- the postcards ---------- */
  function generate(seed) {
    const rnd = LP.mulberry(seed);
    /* the fourth card only enters the rotation after the departure */
    const motifs = (LP.band.present && !LP.band.present()) ? 4 : 3;
    const motif = seed % motifs;
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
    } else if (motif === 2) {
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
    } else {
      /* the room, afterward: lamp lit, the set still on, the chair empty.
         This card only transmits once the band has gone quiet inside. */
      sx.fillStyle = '#0b0e16'; sx.fillRect(0, 0, W, H);
      /* the lamp's cone */
      const lg = sx.createRadialGradient(76, 42, 4, 76, 42, 170);
      lg.addColorStop(0, 'rgba(240,214,150,.85)');
      lg.addColorStop(0.28, 'rgba(190,160,104,.30)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      sx.fillStyle = lg; sx.fillRect(0, 0, W, H);
      /* the lamp itself */
      sx.fillStyle = '#12101c';
      sx.beginPath(); sx.moveTo(52, 38); sx.lineTo(100, 38); sx.lineTo(88, 16); sx.lineTo(64, 16); sx.closePath(); sx.fill();
      sx.fillRect(74, 38, 4, 76);
      /* the desk */
      sx.fillStyle = '#191423'; sx.fillRect(0, 150, W, 7);
      sx.fillStyle = '#0e0b16'; sx.fillRect(0, 157, W, H - 157);
      /* the receiver: dark chassis, one green line still crawling, dial lamp lit */
      sx.fillStyle = '#0c0f16'; sx.fillRect(128, 100, 138, 50);
      sx.strokeStyle = '#1e2430'; sx.lineWidth = 1; sx.strokeRect(128.5, 100.5, 138, 50);
      sx.fillStyle = '#6fdd8b';
      for (let x = 0; x < 118; x += 2) {
        const a = 0.25 + 0.75 * Math.abs(Math.sin(x * 0.7 + seed));
        sx.globalAlpha = a * 0.8;
        sx.fillRect(138 + x, 112 + Math.sin(x * 1.3) * 1.2, 1.4, 3);
      }
      sx.globalAlpha = 1;
      sx.fillStyle = '#d9a441';
      sx.fillRect(246, 132, 8, 3);          /* the dial lamp, still warm */
      sx.fillStyle = 'rgba(217,164,65,.25)';
      sx.fillRect(240, 126, 20, 15);
      /* headphones, set down on the desk */
      sx.strokeStyle = '#232030'; sx.lineWidth = 4;
      sx.beginPath(); sx.arc(96, 146, 15, Math.PI * 0.95, Math.PI * 2.05); sx.stroke();
      sx.fillStyle = '#232030';
      sx.fillRect(80, 142, 7, 10); sx.fillRect(106, 142, 7, 10);
      /* the key, cocked and quiet */
      sx.fillStyle = '#1c1826'; sx.fillRect(176, 158, 34, 5);
      sx.fillStyle = '#2c2438'; sx.fillRect(202, 152, 9, 5);
      /* the empty chair, foreground right, back to us */
      sx.fillStyle = '#070510';
      sx.fillRect(236, 168, 62, 8);
      sx.fillRect(240, 176, 6, 56);
      sx.fillRect(288, 176, 6, 56);
      sx.fillRect(236, 120, 8, 52);          /* the chair back, against the lamp light */
      sx.fillRect(290, 120, 8, 52);
      sx.fillRect(236, 116, 62, 8);
    }
    /* caption strip, like a wish-you-were-here card */
    curCaption = CAPTIONS[motif];
    sx.fillStyle = 'rgba(232,230,218,.92)';
    sx.fillRect(0, H - 18, W, 18);
    sx.fillStyle = '#20242c';
    sx.font = '10px Georgia, serif';
    sx.textAlign = 'center';
    sx.fillText(curCaption, W / 2, H - 6);
    cv.setAttribute('aria-label', `Received picture: ${curCaption.toLowerCase()}.`);

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
  let _st = null;
  const station = () => _st || (_st = LP.band.stations.find(s => s.type === 'sstv'));
  function update(t) {
    const st = station();
    const off = LP.rx.vfo - st.f;
    const tuned = LP.rx.band === st.band && Math.abs(off) < 3.2;
    const prog = st.prog(t);
    const ix = Math.floor(t / st.PERIOD);

    /* the picture only exists once someone actually tunes it in (lazy, and
       deterministic anyway — the cycle index is the whole seed) */
    if (tuned && ix !== genIx) {
      genIx = ix;
      generate(ix);
      painted = 0;
      announced = false;
      cx.fillStyle = '#060a08';
      cx.fillRect(0, 0, W, H);
    }
    if (tuned && prog >= 0) {
      lastSeen = t;
      const target = Math.floor(prog * H);
      const quality = LP.band.strength(st, t) * Math.exp(-(off * off) / 2.2);
      /* lines transmitted while you were away are GONE — mark them as static */
      if (target - painted > 3) {
        cx.fillStyle = '#0d120e';
        cx.fillRect(0, painted, W, target - 2 - painted);
        cx.globalAlpha = .5; cx.fillStyle = '#1a241c';
        for (let n = 0; n < (target - painted) * 3; n++) cx.fillRect(Math.random() * W, painted + Math.random() * (target - 2 - painted), 3 + Math.random() * 10, 1);
        cx.globalAlpha = 1;
        painted = target - 2;
      }
      let budget = 16; /* the film develops; it never hitches a frame */
      while (painted < target && budget-- > 0) {
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
      if (!announced && painted > 4) {
        announced = true;
        LP.say('A picture is developing on 9430.');
      }
      if (painted >= H - 1 && announced !== 'done') {
        announced = 'done';
        const caption = curCaption.toLowerCase();
        LP.say(`Picture received: ${caption}. Pinned to the log.`);
        /* the keepsake: a small JPEG of the developed card, pinned to the
           POSTCARD line so the picture outlives its six-minute cycle */
        if (LP.log && LP.log.attachPicture) {
          try {
            const th = document.createElement('canvas'); th.width = 128; th.height = 96;
            th.getContext('2d').drawImage(cv, 0, 0, 128, 96);
            LP.log.attachPicture(th.toDataURL('image/jpeg', 0.55), caption);
          } catch { /* a tainted or oversized canvas just skips the keepsake */ }
        }
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
    const open = (t - lastSeen < 9000 && painted > 0) || (tuned && prog >= 0);
    if (open !== update._open) {
      update._open = open;
      if (open) { panel.hidden = false; requestAnimationFrame(() => panel.classList.add('open')); }
      else { panel.classList.remove('open'); setTimeout(() => { if (!update._open) panel.hidden = true; }, 520); }
    }
  }

  return { update, lumaAt };
})();
