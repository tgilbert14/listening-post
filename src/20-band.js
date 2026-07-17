/* THE LISTENING POST — the band. One model is the single source of truth:
   the waterfall paints it and the audio engine sounds it, so what you see
   is exactly what you hear.

   All times are wall-clock ms — the stations keep transmitting whether or
   not anyone is rendering, and two visitors at the same minute hear the
   same traffic. The numbers station reads a schedule seeded by the DAY. */
LP.band = (() => {
  const BANDS = [
    { name: 'GROUND', lo: 3200, hi: 3440 },
    { name: 'SKY', lo: 6600, hi: 6840 },
    { name: 'HIGH', lo: 9300, hi: 9540 },
  ];

  /* ---------- morse ---------- */
  const MORSE = {
    A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....',
    I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.',
    Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-',
    Y: '-.--', Z: '--..', 0: '-----', 1: '.----', 2: '..---', 3: '...--', 4: '....-',
    5: '.....', 6: '-....', 7: '--...', 8: '---..', 9: '----.', '?': '..--..', '/': '-..-.',
  };
  /* compile text -> [ [onMs, offMs], ... ] repeating pattern + total length */
  function compileMorse(text, wpm, tailMs) {
    const unit = 1200 / wpm;
    const spans = []; /* {on, t0, t1} flattened to on-intervals */
    const chars = []; /* {ch, end} — so a decoder can read along with the key */
    let t = 0;
    for (const word of text.toUpperCase().split(' ')) {
      for (const ch of word) {
        const code = MORSE[ch];
        if (!code) continue;
        for (const sym of code) {
          const d = (sym === '-' ? 3 : 1) * unit;
          spans.push([t, t + d]);
          t += d + unit;
        }
        chars.push({ ch, end: t + unit });
        t += unit * 2; /* char gap = 3 total */
      }
      chars.push({ ch: ' ', end: t + unit * 2 });
      t += unit * 4;   /* word gap = 7 total */
    }
    return { spans, chars, total: t + (tailMs || 1500) };
  }
  /* everything the key has finished saying by time m into the cycle */
  function decodeMorse(compiled, m) {
    let s = '';
    for (const c of compiled.chars) {
      if (c.end > m) break;
      s += c.ch;
    }
    return s;
  }
  function morseOn(compiled, tMs) {
    const m = tMs % compiled.total;
    /* spans are sorted; a coarse scan is fine at these sizes */
    for (let i = 0; i < compiled.spans.length; i++) {
      const s = compiled.spans[i];
      if (m < s[0]) return false;
      if (m < s[1]) return true;
    }
    return false;
  }

  /* ---------- the day's numbers ---------- */
  const daySeed = () => {
    const d = new Date();
    return d.getFullYear() * 1000 + Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000);
  };
  function latticeGroups() {
    const rnd = LP.mulberry(daySeed());
    const groups = [];
    for (let g = 0; g < 5; g++) {
      let s = '';
      for (let i = 0; i < 5; i++) s += Math.floor(rnd() * 10);
      groups.push(s);
    }
    return groups;
  }

  /* ---------- station definitions ---------- */
  /* Every station: { id, name, f (kHz), band, bw (kHz, display), type, note }
     plus type params. activity(tMs) -> 0..1 keying, computed on demand. */
  const S = [];

  /* the net: when it fires, every keyed station sends the same three
     characters in unison, once, from the top, for a new listener */
  const net = { t0: 0, until: 0, m: compileMorse('73 73 73', 14, 2600) };
  net.arm = () => { net.t0 = Date.now(); net.until = net.t0 + net.m.total; };

  const beacon = (id, f, band, text, wpm, pitchBias, note) => S.push({
    id, name: id, f, band, type: 'beacon', bw: 0.12, wpm, pitchBias, note,
    _m: compileMorse(text, wpm, 2200), text,
    activity(t) {
      if (t >= net.t0 && t < net.until) return morseOn(net.m, t - net.t0) ? 1 : 0;
      return morseOn(this._m, t) ? 1 : 0;
    },
  });

  beacon('VLT-4', 3305.0, 0, 'VVV DE VLT4 VLT4 QTH DUST SEA K', 13, 0, 'keys the same watch, all night');
  beacon('KST-2', 9472.0, 2, 'DE KST2 KST2 73 73', 17, 60, 'says goodbye over and over');
  beacon('MRD-8', 9350.0, 2, 'DE MRD8 BCN GRID DM42 DM42', 15, -40, 'a beacon that knows where it lives');

  /* THE LATTICE: a Buzzer. Carrier + rasping buzz; five groups of five,
     read in tone-digits every other minute, changing daily. */
  S.push({
    id: 'THE LATTICE', name: 'THE LATTICE', f: 6727.0, band: 1, type: 'buzzer', bw: 0.5,
    note: 'five groups of five; different tomorrow',
    _seed: -1, _g: null,
    groups() {
      const s = daySeed();
      if (s !== this._seed) { this._seed = s; this._g = latticeGroups(); }
      return this._g;
    },
    /* cycle: 120s. 0-84s buzz at 1.25s period; 84-118s the digits, unhurried. */
    phase(t) {
      const m = t % 120000;
      if (m < 84000) return { mode: 'buzz', on: (m % 1250) < 820 };
      const dt = m - 84000;
      const SLOT = 1130; /* 30 slots fill the 84-118s window */
      const digitIx = Math.floor(dt / SLOT);
      const groups = this.groups().join('');
      if (digitIx < groups.length + 5) {
        /* a breath every 5 digits */
        const withGaps = Math.floor(digitIx / 6);
        const inGroup = digitIx % 6;
        if (inGroup === 5) return { mode: 'gap' };
        const gi = withGaps * 5 + inGroup;
        if (gi < groups.length) {
          const on = (dt % SLOT) < 830;
          return { mode: 'digit', digit: +groups[gi], on };
        }
      }
      return { mode: 'gap' };
    },
    activity(t) { const p = this.phase(t); return p.on ? 1 : (p.mode === 'gap' ? 0 : 0.12); },
  });

  /* THE FORECAST: RTTY, 45 baud FSK. Lock it and the masthead's sub-line
     becomes the decoder, typing out a desert shipping forecast. */
  S.push({
    id: 'THE FORECAST', name: 'THE FORECAST', f: 3388.0, band: 0, type: 'rtty', bw: 0.45,
    note: 'the weather for places without weather stations',
    text: 'SECTOR ONE CLEAR WIND LIGHT SW DUST RISING BY DAWN + SECTOR TWO STILL AIR MOONSET 0341 + SECTOR THREE HEAT LOW GOOD PASSAGE + ALL SECTORS THE BAND IS OPEN + ',
    baud: 45.45,
    activity(t) { const m = t % 34000; return m < 30000 ? 1 : 0; },
    charAt(t) {
      const m = t % 34000;
      if (m >= 30000) return null;
      const cps = 6; /* display pace, characters per second */
      return this.text[Math.floor(m / 1000 * cps) % this.text.length];
    },
  });

  /* AURORA: a distant music programme, warm and lowpassed. */
  S.push({
    id: 'AURORA', name: 'AURORA', f: 6785.0, band: 1, type: 'music', bw: 4.2,
    note: 'someone, somewhere, is playing records',
    activity(t) { const m = t % 52000; return m < 47000 ? 1 : 0.15; },
  });

  /* HOMECOMING: only after dark, local. Eleven slow tones. */
  S.push({
    id: 'HOMECOMING', name: 'HOMECOMING', f: 6810.0, band: 1, type: 'night', bw: 0.8,
    note: 'eleven tones, only after dark',
    isOn() { const h = new Date().getHours(); return h >= 21 || h < 6; },
    activity(t) {
      if (!this.isOn()) return 0;
      const m = t % 26000;
      const ix = Math.floor(m / 2000);
      if (ix >= 11) return 0;                 /* rest after the eleventh */
      return (m % 2000) < 1400 ? 1 : 0;
    },
    toneIx(t) { const m = t % 26000; const ix = Math.floor(m / 2000); return ix < 11 ? ix : -1; },
  });

  /* POSTCARD: SSTV. Six-minute cycle — 200s of picture, then a CW ident. */
  S.push({
    id: 'POSTCARD', name: 'POSTCARD', f: 9430.0, band: 2, type: 'sstv', bw: 2.4,
    note: 'a picture, thirty-two lines at a time',
    _m: compileMorse('DE POSTCARD PIC QRV', 16, 3000),
    PERIOD: 360000, TX: 200000,
    prog(t) { const m = t % this.PERIOD; return m < this.TX ? m / this.TX : -1; },
    activity(t) {
      const m = t % this.PERIOD;
      if (m < this.TX) return 1;
      if (m > this.TX + 8000 && m < this.TX + 40000) return morseOn(this._m, m - this.TX - 8000) ? 1 : 0;
      return 0;
    },
  });

  /* ---------- propagation ---------- */
  /* real HF behavior, played straight: the low band carries at night, the
     high band by day, the middle hardly cares. The ionosphere is the game. */
  function bandFactor(bandIx) {
    const d = new Date();
    const h = d.getHours() + d.getMinutes() / 60;
    const day = 0.5 + 0.5 * Math.cos(((h - 13) / 24) * 2 * Math.PI); /* 1 at 13:00, 0 at 01:00 */
    if (bandIx === 0) return 0.55 + 0.45 * (1 - day);  /* GROUND: a night band */
    if (bandIx === 2) return 0.55 + 0.45 * day;        /* HIGH: a day band */
    return 0.92;                                        /* SKY: the reliable middle */
  }
  /* slow QSB fading, per station */
  function fade(st, t) {
    const seed = st.f * 7.3;
    return 0.62
      + 0.28 * Math.sin(t / 9000 + seed)
      + 0.10 * Math.sin(t / 2300 + seed * 1.7);
  }
  function strength(st, t) {
    if (st.type === 'night' && !st.isOn()) return 0;
    return LP.clamp(fade(st, t) * bandFactor(st.band), 0.08, 1);
  }

  /* ---------- the ghost ---------- */
  /* THE OTHER is not in the station list: it has no frequency until it
     chooses yours. State machine lives here; interact feeds it dwell. */
  const ghost = {
    state: 'asleep',      /* asleep | approaching | holding | asking | gone */
    f: 0, t0: 0, heard: false,
    _m: compileMorse('QRZ? QRZ?', 12, 400),
    tune(vfo, dwellMs, nearStation, dt = 16.7) {
      if (this.state === 'gone' || document.hidden) return;
      const t = performance.now();
      if (this.state === 'asleep') {
        if (dwellMs > 20000 && !nearStation) {
          this.state = 'approaching';
          this.f = vfo + 1.8;
          this.t0 = t;
        }
      } else if (this.state === 'approaching') {
        /* drift toward the visitor's frequency — nine patient seconds at ANY frame rate */
        this.f = vfo + (this.f - vfo) * Math.exp(-dt / 2200);
        if (Math.abs(this.f - vfo) < 0.03) { this.state = 'holding'; this.t0 = t; }
        if (dwellMs < 400) { this.state = 'asleep'; } /* they moved; it loses the scent */
      } else if (this.state === 'holding') {
        this.f = vfo + (this.f - vfo) * Math.exp(-dt / 800);
        if (t - this.t0 > 9000) { this.state = 'asking'; this.t0 = t; }
        if (dwellMs < 400) { this.state = 'asleep'; }
      } else if (this.state === 'asking') {
        if (t - this.t0 > 14000) { this.state = 'gone'; }
      }
    },
    activity(t) {
      if (this.state === 'approaching' || this.state === 'holding') return 0.9;
      if (this.state === 'asking') return morseOn(this._m, performance.now() - this.t0) ? 1 : 0;
      return 0;
    },
    strength() {
      if (this.state === 'approaching') return 0.35;
      if (this.state === 'holding') return 0.5;
      if (this.state === 'asking') return 0.62;
      return 0;
    },
  };

  /* ---------- spectrum synthesis for the waterfall ---------- */
  /* one row: intensity 0..1 per column across [fLo..fHi] at time t */
  const sferic = { until: 0, level: 0, lastRoll: 0 };
  function spectrumRow(out, fLo, fHi, t, bandIx, rng) {
    const cols = out.length;
    const noiseBase = 0.055 + bandIx * 0.012;
    /* lightning crash: a TIME-based hazard (one per ~24s on average), so the
       storm doesn't care how often anyone renders it */
    if (t > sferic.until) {
      const p = 1 - Math.exp(-(t - sferic.lastRoll) / 24000);
      sferic.lastRoll = t;
      if (rng() < p) { sferic.until = t + 140 + rng() * 400; sferic.level = 0.25 + rng() * 0.5; }
    }
    const crash = t < sferic.until ? sferic.level * (0.4 + 0.6 * rng()) : 0;
    for (let i = 0; i < cols; i++) {
      out[i] = noiseBase * (0.4 + rng() * 1.1) + crash * (0.5 + rng() * 0.5);
    }
    for (const st of S) {
      if (st.band !== bandIx) continue;
      const a = st.activity(t) * strength(st, t);
      if (a <= 0.001) continue;
      paint(out, fLo, fHi, st.f, st.bw, a, st, t);
    }
    if (ghost.state !== 'asleep' && ghost.state !== 'gone') {
      const a = ghost.activity(t) * ghost.strength();
      if (a > 0.001) paint(out, fLo, fHi, ghost.f, 0.1, a, null, t);
    }
    return out;
  }
  function paint(out, fLo, fHi, f, bw, amp, st, t) {
    const cols = out.length;
    const span = fHi - fLo;
    const center = (f - fLo) / span * cols - 0.5; /* sample column CENTERS: zero-beat bisects the marker */
    const sigma = Math.max(0.7, bw / span * cols / 2);
    /* type texture: rtty is two resolved tones; music/sstv fill their bandwidth */
    if (st && st.type === 'rtty') {
      const off = 0.34 / span * cols / 2; /* display license: the shift reads as TWO tones */
      splat(out, center - off, Math.max(0.7, sigma * 0.3), amp);
      splat(out, center + off, Math.max(0.7, sigma * 0.3), amp * 0.9);
      return;
    }
    if (st && st.type === 'sstv') {
      /* the picture is a textured band: scan-line shimmer */
      const w = Math.max(2, sigma * 2);
      for (let i = Math.max(0, Math.floor(center - w)); i < Math.min(cols, center + w); i++) {
        out[i] += amp * (0.35 + 0.65 * Math.abs(Math.sin(i * 1.7 + t / 60)));
      }
      return;
    }
    if (st && st.type === 'music') {
      const w = Math.max(2, sigma * 2);
      for (let i = Math.max(0, Math.floor(center - w)); i < Math.min(cols, center + w); i++) {
        const x = (i - center) / w;
        out[i] += amp * Math.max(0, 1 - x * x) * (0.35 + 0.4 * Math.abs(Math.sin(i * 0.9 + t / 140)));
      }
      /* carrier spike in the middle */
      splat(out, center, 1, amp * 1.2);
      return;
    }
    splat(out, center, sigma, amp);
  }
  function splat(out, center, sigma, amp) {
    const cols = out.length;
    const from = Math.max(0, Math.floor(center - sigma * 4));
    const to = Math.min(cols - 1, Math.ceil(center + sigma * 4));
    for (let i = from; i <= to; i++) {
      const x = (i - center) / sigma;
      out[i] += amp * Math.exp(-x * x / 2);
    }
  }

  /* keying edges for lookahead audio scheduling: [{t (wall ms), on}] inside [t0..t1] */
  function keyEdges(st, t0, t1) {
    const useNet = t0 >= net.t0 && t0 < net.until;
    const m = useNet ? net.m : st._m;
    const base = useNet ? net.t0 : 0;
    const edges = [];
    const from = t0 - base, to = t1 - base;
    for (let cycle = Math.floor(from / m.total) * m.total; cycle < to; cycle += m.total) {
      for (const s of m.spans) {
        const on = cycle + s[0], off = cycle + s[1];
        if (off < from) continue;
        if (on > to) break;
        edges.push({ t: on + base, on: true }, { t: off + base, on: false });
      }
    }
    return edges.filter(e => e.t >= t0 && e.t <= t1);
  }

  return { BANDS, stations: S, strength, spectrumRow, ghost, latticeGroups, compileMorse, morseOn, decodeMorse, sferic, net, keyEdges };
})();

/* the receiver state: one VFO, one band. Arrival parks it a nudge below
   AURORA so the first drag of the dial tunes INTO the music. */
LP.rx = { band: 1, vfo: 6779.0, dwellT0: performance.now() };

