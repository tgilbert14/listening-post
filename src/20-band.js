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
    '%': '...-.-', /* the SK prosign, sent as one character: end of contact */
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
  /* a FIST: a human hand's involuntary timing signature. The same seeded
     wobble every cycle — recognizable, like a real operator's. Machine-sent
     morse is the absence of one; perfection is itself a fingerprint. */
  function humanize(compiled, rnd, unit) {
    const j = unit * 0.14;
    const dashBias = 0.92 + rnd() * 0.3;   /* some hands send heavy dashes */
    compiled.spans = compiled.spans.map(([a, b]) => {
      let d = b - a;
      if (d > unit * 2) d *= dashBias;
      const s = Math.max(0, a + (rnd() - 0.5) * 2 * j);
      return [s, s + Math.max(unit * 0.4, d + (rnd() - 0.5) * j)];
    });
    return compiled;
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
  /* local calendar date, UTC arithmetic: the seed rolls at local midnight and
     never drifts an hour across a DST change */
  const daySeed = () => {
    const d = new Date();
    return d.getFullYear() * 1000
      + Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
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

  /* ---------- the presence ---------- */
  /* While THE OTHER has not yet asked its question, something inhabits the
     band, and the anomalies below are live. Once it is noticed noticing —
     logged, gone — every one of them ceases, permanently, and the band
     becomes exactly what it always claimed to be. That is the elegy. */
  function present() {
    if (ghost.state === 'gone') return false;
    return !(LP.log && LP.log.has && LP.log.has('THE OTHER'));
  }

  /* the net: when it fires, every keyed station sends the same characters in
     unison, once, from the top, for a new listener. If the band's tenant has
     already departed, the net is a silent-key net instead: the sign-off SK,
     keyed by every station at once — in the departed's own fist. */
  const net = { t0: 0, until: 0, m: compileMorse('73 73 73', 14, 2600) };
  net.arm = () => {
    net.m = present()
      ? compileMorse('73 73 73', 14, 2600)
      : humanize(compileMorse('73 73 %', 14, 2600), LP.mulberry(4257), 1200 / 14);
    net.t0 = Date.now();
    net.until = net.t0 + net.m.total;
  };
  const netActive = (t) => t >= net.t0 && t < net.until;

  /* THE CROSS-READ: some nights, for one message, a beacon keys its sister's
     ident — the wrong mask, once, corrected next cycle. Never after. */
  let _cr = { slot: -1 };
  function crossReadCalc(slot) {
    if (_cr.slot === slot) return _cr;
    const r = LP.mulberry(daySeed() * 13 + slot * 7);
    _cr = { slot, active: r() < 0.22 };
    if (_cr.active) {
      const bs = S.filter(s => s.type === 'beacon');
      _cr.imp = bs[Math.floor(r() * bs.length)];
      let vi = Math.floor(r() * bs.length);
      if (bs[vi] === _cr.imp) vi = (vi + 1) % bs.length;
      _cr.vic = bs[vi];
      _cr.w0 = slot * 2400000 + 30000 + Math.floor(r() * (2400000 - _cr.vic._m.total - 90000));
      _cr.w1 = _cr.w0 + _cr.vic._m.total;
    }
    return _cr;
  }
  function crossRead(st, t) {
    if (st.type !== 'beacon' || !present()) return null;
    const c = crossReadCalc(Math.floor(t / 2400000));
    if (!c.active || c.imp !== st || t < c.w0 || t >= c.w1) return null;
    return { m: c.vic._m, off: t - c.w0 };
  }

  /* every beacon keeper has a FIST — a seeded, repeatable wobble, a hand you
     could learn to recognize. THE CONSTANT alone keys machine-perfect: the one
     hand on the band that does not wobble is the tell. */
  const beacon = (id, f, band, text, wpm, pitchBias, note) => S.push({
    id, name: id, f, band, type: 'beacon', bw: 0.12, wpm, pitchBias, note,
    _m: humanize(compileMorse(text, wpm, 2200), LP.mulberry((f * 37) | 0), 1200 / wpm), text,
    /* which compiled pattern is on the air right now: the net outranks the
       masks (the unison is the tenant's own voice), the mask outranks habit */
    keyed(t) {
      if (t >= net.t0 && t < net.until) return { m: net.m, off: t - net.t0 };
      const x = crossRead(this, t);
      if (x) return x;
      return { m: this._m, off: t };
    },
    activity(t) {
      const k = this.keyed(t);
      return morseOn(k.m, k.off) ? 1 : 0;
    },
  });

  beacon('VLT-4', 3305.0, 0, 'VVV DE VLT4 VLT4 QTH DUST SEA K', 13, 0, 'keys the same watch, all night');
  beacon('KST-2', 9472.0, 2, 'DE KST2 KST2 73 73', 17, 60, 'says goodbye over and over');
  beacon('MRD-8', 9350.0, 2, 'DE MRD8 BCN GRID DM42 DM42', 15, -40, 'a beacon that knows where it lives');

  /* THE LATTICE: a Buzzer. Carrier + rasping buzz; a toy music-box ident;
     five groups of five, read in tone-digits every other minute, changing
     daily. On rare days, one group is not random: it is the listener's own
     most-kept frequency, read back in tone-digits — and on those days one
     note of the music box plays flat. Nothing announces this. */
  S.push({
    id: 'THE LATTICE', name: 'THE LATTICE', f: 6727.0, band: 1, type: 'buzzer', bw: 0.5,
    note: 'five groups of five; different tomorrow',
    _seed: -1, _g: null, _traceDay: false,
    /* the ident melody: eight notes, semitones from A4, ends low, unresolved.
       The detune is fixed per note — a toy's imperfection, not a random one. */
    MELODY: [7, 10, 9, 5, 7, 3, 2, -5],
    DETUNE: [4, -3, 6, 0, 5, -4, 3, 7],
    groups() {
      const s = daySeed();
      if (s !== this._seed) {
        this._seed = s;
        this._g = latticeGroups();
        this._traceDay = false;
        /* the group that is about you: rare, seeded, deniable */
        if (present() && LP.mulberry(s + 99)() < 0.25) {
          let tr = LP.store.get('trace', {});
          if (!tr || typeof tr !== 'object' || Array.isArray(tr)) tr = {}; /* a poisoned trace stays a rumor */
          const top = Object.keys(tr).sort((a, b) => tr[b] - tr[a])[0];
          if (top) {
            this._traceDay = true;
            this._g[3] = String(Math.round(Number(top) * 10)).padStart(5, '0').slice(0, 5);
          }
        }
      }
      return this._g;
    },
    /* cycle: 120s. 0-76s buzz at 1.25s period; 76-84s the music box;
       84-118s the digits, unhurried. */
    phase(t) {
      const m = t % 120000;
      if (m < 76000) return { mode: 'buzz', on: (m % 1250) < 820 };
      if (m < 84000) {
        const noteIx = Math.floor((m - 76000) / 1000);
        return { mode: 'musicbox', note: Math.min(7, noteIx), on: ((m - 76000) % 1000) < 700 };
      }
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
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0; /* the buzzer, keying morse: once */
      const p = this.phase(t);
      if (p.mode === 'musicbox') return p.on ? 0.7 : 0.12;
      return p.on ? 1 : (p.mode === 'gap' ? 0 : 0.12);
    },
  });

  /* THE ROOM: the buzzer is an acoustic device in front of a live microphone,
     and the room it stands in is not empty. Rarely, at low level behind the
     buzz: a chair, a door, something set down, unintelligible speech, once a
     phone ringing far away. Wall-clock scheduled — two listeners at the same
     minute hear the same room, and can ask each other "did you hear it too?"
     After the departure, the buzz continues. The room is empty now. */
  function roomEvent(t) {
    if (!present()) return null;
    const SLOT = 210000;
    const slot = Math.floor(t / SLOT);
    const r = LP.mulberry((daySeed() * 5 + Math.imul(slot, 2654435761)) | 0);
    if (r() > 0.42) return null;
    const kinds = ['thud', 'chair', 'door', 'murmur', 'murmur', 'phone'];
    const kind = kinds[Math.floor(r() * kinds.length)];
    const t0 = slot * SLOT + 15000 + Math.floor(r() * (SLOT - 45000));
    const dur = kind === 'murmur' ? 2500 + r() * 2500 : (kind === 'phone' ? 6500 : 1100);
    if (t < t0 || t >= t0 + dur) return null;
    return { kind, t0, dur };
  }

  /* THE FORECAST: RTTY, 45 baud FSK. Lock it and the masthead's sub-line
     becomes the decoder, typing out a desert shipping forecast. */
  S.push({
    id: 'THE FORECAST', name: 'THE FORECAST', f: 3388.0, band: 0, type: 'rtty', bw: 0.45,
    note: 'the weather for places without weather stations',
    text: 'SECTOR ONE CLEAR WIND LIGHT SW DUST RISING BY DAWN + SECTOR TWO STILL AIR MOONSET 0341 + SECTOR THREE HEAT LOW GOOD PASSAGE + ALL SECTORS THE BAND IS OPEN + ',
    baud: 45.45,
    cps: 6, /* display pace ≈ true 45.45-baud Baudot character rate */
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0;
      const m = t % 34000;
      return m < 30000 ? 1 : 0;
    },
    charAt(t) {
      const m = t % 34000;
      if (m >= 30000) return null;
      return this.text[Math.floor(m / 1000 * this.cps) % this.text.length];
    },
    /* the decoder's window: the last `span` characters finished by time t.
       Null when the carrier is idle. The schedule lives HERE, with the model. */
    window(t, span) {
      const m = t % 34000;
      if (m >= 30000) return null;
      const n = Math.floor(m / 1000 * this.cps);
      let s = '';
      for (let i = Math.max(0, n - span); i < n; i++) s += this.text[i % this.text.length];
      return s;
    },
  });

  /* AURORA: a distant music programme, warm and lowpassed. */
  S.push({
    id: 'AURORA', name: 'AURORA', f: 6785.0, band: 1, type: 'music', bw: 4.2,
    note: 'someone, somewhere, is playing records',
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0; /* the record stops for this */
      const m = t % 52000;
      return m < 47000 ? 1 : 0.15;
    },
  });

  /* HOMECOMING: only after dark, local. Eleven slow tones. */
  S.push({
    id: 'HOMECOMING', name: 'HOMECOMING', f: 6810.0, band: 1, type: 'night', bw: 0.8,
    note: 'eleven tones, only after dark',
    isOn() { const h = new Date().getHours(); return h >= 21 || h < 6; },
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0; /* even in daylight: once */
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
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0; /* the picture can wait */
      const m = t % this.PERIOD;
      if (m < this.TX) return 1;
      if (m > this.TX + 8000 && m < this.TX + 40000) return morseOn(this._m, m - this.TX - 8000) ? 1 : 0;
      return 0;
    },
  });

  /* ---------- THE CROSSING: some nights, a bell far away ---------- */
  /* A rare visitor (about one night in four, seeded by the date): a faint
     two-tone crossing bell drifting over 6660. Hearing it at all is the event. */
  S.push({
    id: 'THE CROSSING', name: 'THE CROSSING', f: 6660.0, band: 1, type: 'crossing', bw: 0.35,
    note: 'some nights, a bell far away ★',
    isOn() {
      const h = new Date().getHours();
      const night = h >= 20 || h < 6;
      return night && LP.mulberry(daySeed() + 777)() < 0.28;
    },
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0; /* the bell keeps the rhythm too */
      if (!this.isOn()) return 0;
      const m = t % 46000;
      if (m > 34000) return 0;                       /* it fades between rings */
      return (m % 540) < 260 ? 1 : 0.1;              /* the two-tone swing */
    },
    toneHigh(t) { return Math.floor((t % 46000) / 540) % 2 === 0; },
  });

  /* ---------- THE CONSTANT: no distance to it ---------- */
  /* A weak carrier that keys a single K — the invitation to transmit —
     forever, machine-perfect. While the band's tenant is present, it does
     not obey radio: it never fades while everything around it breathes, it
     does not beat against the BFO (the same pitch at every tuning error, as
     if it never arrived as radio at all), and it sits dead-center in the
     stereo image — it is not coming from a direction. The S-meter needle,
     alone on the band, holds still. Afterward it keys on, but fades like
     any carrier: the invitation continues; nothing is behind it now. */
  S.push({
    id: 'THE CONSTANT', name: 'THE CONSTANT', f: 9512.0, band: 2, type: 'constant', bw: 0.12,
    note: 'no distance to it',
    _m: compileMorse('K', 13, 2600),
    activity(t) {
      if (t >= net.t0 && t < net.until) return morseOn(net.m, t - net.t0) ? 1 : 0;
      return morseOn(this._m, t) ? 1 : 0;
    },
  });

  /* ---------- the underbrush: the band is INHABITED ---------- */
  /* Dozens of minor signals seeded fresh each day — weak CW ragchews,
     drifting carriers, splatter. Not loggable, never named: they exist so
     the named stations are discoveries in a crowd, not exhibits in a hall. */
  const minors = (() => {
    const list = [];
    const rnd = LP.mulberry(daySeed() * 31 + 7);
    const CALLS = 'KNWV';
    const L = () => String.fromCharCode(65 + Math.floor(rnd() * 26));
    const mkCall = () => CALLS[Math.floor(rnd() * 4)] + Math.floor(1 + rnd() * 9) + L() + L() + L();
    for (let b = 0; b < 3; b++) {
      const B = BANDS[b];
      for (let i = 0; i < 24; i++) {
        let f = B.lo + 6 + rnd() * (B.hi - B.lo - 12);
        /* keep clear water around the named stations — a discovery must never
           be drowned by the crowd it is hiding in */
        if (S.some(st => st.band === b && Math.abs(st.f - f) < 7)) f = B.lo + 4 + rnd() * 3 + i * 1.7;
        const roll = rnd();
        const kind = roll < 0.5 ? 'cw' : (roll < 0.82 ? 'carrier' : 'splatter');
        const m = {
          id: `m${b}-${i}`, band: b, f, kind,
          base: 0.10 + rnd() * 0.20,
          seed: Math.floor(rnd() * 1e9),
          phase: rnd() * LP.TAU,                 /* its own slow fade, not the day's */
          drift: (rnd() - 0.5) * 0.9,            /* carriers wander, kHz either way */
          wpm: 14 + Math.floor(rnd() * 9),
          _slot: -1, _live: false,
        };
        if (kind === 'cw') {
          const call = mkCall(), other = mkCall();
          m._m = rnd() < 0.4
            ? compileMorse(`${other} DE ${call} R R TNX FER RPRT 73`, m.wpm, 6000 + rnd() * 8000)
            : compileMorse(`CQ CQ DE ${call} ${call} K`, m.wpm, 4000 + rnd() * 9000);
          /* every human hand has a fist — a repeatable timing wobble, visible
             at the 12 kHz zoom. The named beacons wobble too (keepers, not
             machines); the one signal with NO fist and NO fade is the tell. */
          humanize(m._m, rnd, 1200 / m.wpm);
        }
        list.push(m);
      }
    }
    return list;
  })();
  /* on the air in bursts: a seeded duty schedule, no two alike. The slot roll
     is cached — this runs for every minor on every raster row. */
  function minorActive(m, t) {
    const slot = Math.floor(t / (60000 + (m.seed % 50000)));
    if (slot !== m._slot) { m._slot = slot; m._live = LP.mulberry(m.seed + slot)() <= 0.55; }
    if (!m._live) return 0;
    if (m.kind === 'cw') return morseOn(m._m, t) ? 1 : 0;
    return 1;
  }
  function minorF(m, t) {
    return m.kind === 'carrier' ? m.f + Math.sin(t / 100000 + m.phase) * m.drift : m.f;
  }
  function minorStrength(m, t) {
    return LP.clamp(m.base * bandFactor(m.band) * (0.7 + 0.3 * Math.sin(t / 7000 + m.phase)), 0, 1);
  }

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
    if (st.isOn && !st.isOn() && !netActive(t)) return 0;   /* its own hours — except for the net, once */
    /* THE CONSTANT, while the tenant is present, has no distance: no QSB, no
       day/night curve, the same strength for every listener on Earth. Every
       log of it carries the identical report. Afterward, it fades like
       anything — the body remains; the tenant left. */
    if (st.type === 'constant' && present()) return 0.42;
    return LP.clamp(fade(st, t) * bandFactor(st.band), 0.08, 1);
  }

  /* ---------- the ghost ---------- */
  /* THE OTHER is not in the station list: it has no frequency until it
     chooses yours. State machine lives here; interact feeds it dwell. */
  const ghost = {
    state: 'asleep',      /* asleep | approaching | holding | asking | gone */
    f: 0, t0: 0, heard: false,
    /* its one question is keyed with a HAND — the same seeded fist the
       silent-key net will one day reproduce, band-wide, in its memory */
    _m: humanize(compileMorse('QRZ? QRZ?', 12, 400), LP.mulberry(4257), 100),
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
    /* the underbrush first, so a named station always paints over its crowd */
    for (const m of minors) {
      if (m.band !== bandIx) continue;
      const f = minorF(m, t);
      if (f < fLo - 1 || f > fHi + 1) continue;   /* skip the morse scan entirely */
      const a = minorActive(m, t) * minorStrength(m, t);
      if (a <= 0.004) continue;
      const center = (f - fLo) / (fHi - fLo) * cols - 0.5;
      if (m.kind === 'splatter') splat(out, center, Math.max(1.4, 2.2 / (fHi - fLo) * cols), a * 0.6);
      else splat(out, center, Math.max(0.7, 0.09 / (fHi - fLo) * cols / 2), a);
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
    const k = st.keyed ? st.keyed(t0)
      : (t0 >= net.t0 && t0 < net.until) ? { m: net.m, off: t0 - net.t0 }
        : { m: st._m, off: t0 };
    const m = k.m;
    const base = t0 - k.off;
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

  return {
    BANDS, stations: S, strength, spectrumRow, ghost, latticeGroups,
    compileMorse, morseOn, decodeMorse, sferic, net, netActive, keyEdges,
    minors, minorActive, minorF, minorStrength,
    present, roomEvent, crossRead,
  };
})();

/* the receiver state: one VFO, one band, one span (the width of the window
   the waterfall resolves). Arrival parks it a nudge below AURORA so the first
   drag of the dial tunes INTO the music. */
LP.rx = { band: 1, vfo: 6779.0, span: 48, dwellT0: performance.now() };
LP.SPANS = [48, 24, 12];   /* wide to narrow: zoom in and the keying resolves */

