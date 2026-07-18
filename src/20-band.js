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
    const d = LP.date();
    return d.getFullYear() * 1000
      + Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000) + 1;
  };
  /* The groups are not random. They never were. Each day's five groups are
     a straddling-checkerboard message under an additive key drawn from that
     day's FORECAST text — the oldest numbers-station tradecraft there is.
     Decode the RTTY, strip the spaces, subtract mod ten, read the board.
     Nothing announces this, and nothing ever will. */
  const BOARD = { /* straddling checkerboard; 2 and 6 prefix the long rows */
    A: '0', T: '1', O: '3', N: '4', E: '5', S: '7', I: '8', R: '9',
    B: '20', C: '21', D: '22', F: '23', G: '24', H: '25', J: '26', K: '27', L: '28', M: '29',
    P: '60', Q: '61', U: '62', V: '63', W: '64', X: '65', Y: '66', Z: '67', '.': '68', '/': '69',
  };
  const SENTENCE = 'NO ONE LISTENS ALONE.';
  function latticeGroups() {
    let plain = '';
    for (const ch of SENTENCE) if (BOARD[ch]) plain += BOARD[ch];
    while (plain.length < 25) plain += '69';        /* nulls square the last group */
    plain = plain.slice(0, 25);
    const book = forecastText().replace(/ /g, '');  /* spaces carry no key */
    const groups = [];
    for (let g = 0; g < 5; g++) {
      let s = '';
      for (let i = 0; i < 5; i++) {
        const ix = g * 5 + i;
        s += String((Number(plain[ix]) + book.charCodeAt(ix % book.length)) % 10);
      }
      groups.push(s);
    }
    return groups;
  }

  /* ---------- space weather ---------- */
  /* The ionosphere is the game, so the ionosphere gets WEATHER: a daily
     geomagnetic K-index, sudden ionospheric disturbances on the dayside,
     and sporadic-E openings at night. All seeded, all shared — the FORECAST
     forecasts it, the S-meter reads it, the RST records it. */
  const weather = {
    /* daily K-index 0..8, weighted toward quiet days */
    k() { return Math.floor(Math.pow(LP.mulberry(daySeed() + 31337)(), 1.8) * 9); },
    /* SID: a flare hits the dayside D-layer and the band goes quiet for
       minutes — fast onset, slow recovery. 0..1 severity. */
    sid(t) {
      const SLOT = 10800000; /* one roll per 3 h */
      const slot = Math.floor(t / SLOT);
      const r = LP.mulberry((daySeed() * 17 + slot * 131) | 0);
      if (r() > 0.12) return 0;
      const h = new Date(t).getHours();
      if (h < 8 || h > 18) return 0; /* flares are a dayside problem */
      const t0 = slot * SLOT + 600000 + r() * (SLOT - 1800000);
      const dur = 180000 + r() * 300000;
      if (t < t0 || t > t0 + dur) return 0;
      const x = (t - t0) / dur;
      return x < 0.12 ? x / 0.12 : Math.pow(1 - (x - 0.12) / 0.88, 1.6);
    },
    /* sporadic E: some nights the HIGH band opens anyway, for a while */
    esOpen(t) {
      const SLOT = 5400000; /* 90-minute patches */
      const h = new Date(t).getHours();
      if (h >= 7 && h < 20) return false;
      return LP.mulberry((daySeed() * 23 + Math.floor(t / SLOT) * 71) | 0)() < 0.15;
    },
  };

  /* ---------- ITA2 Baudot ---------- */
  /* THE FORECAST is real RTTY now: five data bits, one start, one and a half
     stop, LTRS/FIGS shifts, 45.45 baud. The half-bit stream below IS the
     transmission — the FSK audio keys it and the decoder reads it back. */
  const ITA2_LTRS = [null, 'E', '\n', 'A', ' ', 'S', 'I', 'U', '\r', 'D', 'R', 'J', 'N', 'F', 'C', 'K',
    'T', 'Z', 'L', 'W', 'H', 'Y', 'P', 'Q', 'O', 'B', 'G', null, 'M', 'X', 'V', null];
  const ITA2_FIGS = [null, '3', '\n', '-', ' ', "'", '8', '7', '\r', '$', '4', '', ',', '!', ':', '(',
    '5', '+', ')', '2', '#', '6', '0', '1', '9', '?', '&', null, '.', '/', '=', null];
  const ITA2_HALF = 1000 / 45.45 / 2; /* half-bit ms: 1.5 stop bits need half resolution */
  function ita2encode(text) {
    const L = {}, F = {};
    ITA2_LTRS.forEach((ch, c) => { if (ch) L[ch] = c; });
    ITA2_FIGS.forEach((ch, c) => { if (ch && !(ch in L)) F[ch] = c; });
    const halves = []; const chars = [];
    let shift = 'L';
    const frame = (code) => { /* start(0) + 5 data LSB-first + 1.5 stop(1) */
      halves.push(0, 0);
      for (let b = 0; b < 5; b++) { const v = (code >> b) & 1; halves.push(v, v); }
      halves.push(1, 1, 1);
    };
    frame(31); /* open in LTRS, like an operator */
    for (const ch of text.toUpperCase()) {
      if (L[ch] !== undefined) { if (shift !== 'L') { frame(31); shift = 'L'; } frame(L[ch]); }
      else if (F[ch] !== undefined) { if (shift !== 'F') { frame(27); shift = 'F'; } frame(F[ch]); }
      else continue;
      chars.push({ ch, end: halves.length * ITA2_HALF }); /* printed when its stop bit lands */
    }
    return { halves, chars, txMs: halves.length * ITA2_HALF };
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
    net.t0 = LP.now();
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
  /* some days a rasping wall parks itself exactly where the numbers live —
     and the numbers move 2 kHz up to get clear of it. Nobody explains this.
     The band just... adjusts. */
  const jammerToday = () => LP.mulberry(daySeed() + 555)() < 0.13;
  S.push({
    id: 'THE LATTICE', name: 'THE LATTICE', get f() { return jammerToday() ? 6729.0 : 6727.0; }, band: 1, type: 'buzzer', bw: 0.5,
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
  /* days since THE OTHER was logged; -1 while it is still here */
  function elegyDays() {
    if (present()) return -1;
    const e = LP.log && LP.log.entries && LP.log.entries.find(x => x.id === 'THE OTHER');
    if (!e || !e.date || e.date.length !== 8) return 999; /* departed, date unknown: long ago */
    const dep = Date.UTC(+e.date.slice(0, 4), +e.date.slice(4, 6) - 1, +e.date.slice(6, 8));
    return Math.floor((LP.now() - dep) / 86400000);
  }
  function roomEvent(t) {
    if (present()) {
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
    /* THE LONG ELEGY: the room stays empty for a week. Then, one night —
       a chair scrapes. Higher. Tentative. Unfamiliar. Someone new is
       moving in, and the buzz just keeps buzzing. */
    if (elegyDays() < 7) return null;
    const SLOT = 210000;
    const slot = Math.floor(t / SLOT);
    const r = LP.mulberry((daySeed() * 7 + Math.imul(slot, 40503)) | 0);
    if (r() > 0.12) return null;
    const kind = r() < 0.6 ? 'chair' : 'thud';
    const t0 = slot * SLOT + 15000 + Math.floor(r() * (SLOT - 45000));
    if (t < t0 || t >= t0 + 1100) return null;
    return { kind, t0, dur: 1100, newcomer: true };
  }

  /* THE FORECAST: real RTTY — 45.45-baud ITA2 Baudot FSK, 170 Hz shift.
     The half-bit stream is the single source of truth: the audio keys it,
     the waterfall paints whichever tone is live, and the masthead decoder
     prints each character the moment its stop bit lands. The forecast
     itself is fresh each day, and it forecasts the BAND's weather too. */
  const forecastText = () => {
    const r = LP.mulberry(daySeed() * 7 + 5);
    const pick = (a) => a[Math.floor(r() * a.length)];
    const sky = ['CLEAR', 'HIGH HAZE', 'DUST RISING BY DAWN', 'COLD AND CLEAR'];
    const wind = ['WIND LIGHT SW', 'WIND FRESH NW', 'STILL AIR', 'GUSTS OFF THE RIDGE'];
    const p3 = ['HEAT LOW GOOD PASSAGE', 'PASSAGE FAIR', 'NO TRAFFIC EXPECTED', 'GOOD PASSAGE ALL NIGHT'];
    const moon = `MOONSET 0${2 + Math.floor(r() * 4)}${String(Math.floor(r() * 60)).padStart(2, '0')}`;
    const k = weather.k();
    const cond = k >= 6 ? 'ROUGH BAND EXPECT FADES' : (k >= 4 ? 'BAND UNSETTLED' : 'THE BAND IS OPEN');
    return `SECTOR ONE ${pick(sky)} ${pick(wind)} + SECTOR TWO ${pick(sky)} ${moon} + SECTOR THREE ${pick(p3)} + ALL SECTORS ${cond} + `;
  };
  S.push({
    id: 'THE FORECAST', name: 'THE FORECAST', f: 3388.0, band: 0, type: 'rtty', bw: 0.45,
    note: 'the weather for places without weather stations',
    baud: 45.45, text: '', _seed: -1, _enc: null, _cycle: 0,
    refresh() {
      const s = daySeed();
      if (s === this._seed) return;
      this._seed = s;
      this.text = forecastText();
      this._enc = ita2encode(this.text);
      this._cycle = this._enc.txMs + 4000; /* the transmission, then a breath */
    },
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0;
      this.refresh();
      return (t % this._cycle) < this._enc.txMs ? 1 : 0;
    },
    /* mark (1) or space (0) on the air at time t; idle rests on mark */
    bitAt(t) {
      this.refresh();
      const m = t % this._cycle;
      if (m >= this._enc.txMs) return 1;
      return this._enc.halves[Math.floor(m / ITA2_HALF)];
    },
    /* FSK edges inside [t0..t1] for lookahead audio scheduling */
    edges(t0, t1) {
      this.refresh();
      const out = [];
      let prev = this.bitAt(t0);
      /* walk half-bit boundaries; a cycle seam is just another boundary */
      const step = ITA2_HALF;
      for (let t = (Math.floor(t0 / step) + 1) * step; t <= t1; t += step) {
        const b = this.bitAt(t);
        if (b !== prev) { out.push({ t, mark: !!b }); prev = b; }
      }
      return out;
    },
    /* the decoder's window: the last `span` characters whose stop bits have
       landed by time t. Null when the carrier is idle. */
    window(t, span) {
      this.refresh();
      const m = t % this._cycle;
      if (m >= this._enc.txMs) return null;
      let s = '';
      for (const c of this._enc.chars) {
        if (c.end > m) break;
        s += c.ch;
      }
      return s.slice(-span);
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
    isOn() {
      const d = LP.date();
      /* the solstices: the longest and shortest nights, it never signs off */
      if ((d.getMonth() === 5 || d.getMonth() === 11) && d.getDate() === 21) return true;
      const h = d.getHours();
      return h >= 21 || h < 6;
    },
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
    /* REAL Robot 36 timing: a VIS header, then 240 lines at 150 ms each —
       sync, porch, 88 ms of Y, separator, 44 ms of alternating chroma.
       The six-minute cycle keeps the fiction; the frame keeps the spec. */
    PERIOD: 360000, H: 240, VIS: 2400, LINE: 150,
    get FRAME() { return this.H * this.LINE; },
    get TX() { return this.VIS + this.FRAME; },
    lineMs() { return this.LINE; },
    prog(t) {
      const m = t % this.PERIOD;
      if (m >= this.TX) return -1;
      return m < this.VIS ? 0 : (m - this.VIS) / this.FRAME;
    },
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
      const h = LP.date().getHours();
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

  /* ---------- THE PIPS: a time station ---------- */
  /* Five short, one long, on the minute, every minute, forever. The most
     comforting station on any band — which is exactly why, on one rare
     seeded night, pips start going missing. Count the gaps. */
  S.push({
    id: 'THE PIPS', name: 'THE PIPS', f: 9500.0, band: 2, type: 'pips', bw: 0.15,
    note: 'on the minute, every minute',
    failNight() { return LP.mulberry(daySeed() + 2027)() < 0.04; },
    activity(t) {
      if (netActive(t)) return morseOn(net.m, t - net.t0) ? 1 : 0;
      const d = LP.date(t);
      /* the first minute of the year: twelve strikes instead of six pips */
      if (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() === 0) {
        return (t / 1000 % 5) < 0.5 ? 1 : 0.06;
      }
      const s = (t / 1000) % 60;
      const shortPip = s >= 55 && (s % 1) < 0.1;
      const longPip = s < 0.5;
      if (!shortPip && !longPip) return 0.06;      /* the carrier idles, barely */
      if (this.failNight()) {
        const pipIx = Math.floor(t / 60000) * 6 + (longPip ? 5 : Math.floor(s) - 55);
        if (LP.mulberry((pipIx * 131 + 7) | 0)() < 0.15) return 0.06; /* ...missing */
      }
      return 1;
    },
  });

  /* THE JAMMER: the wall itself. It transmits nothing. It only takes. */
  S.push({
    id: 'THE JAMMER', name: 'THE JAMMER', f: 6727.0, band: 1, type: 'jammer', bw: 1.6,
    note: 'it sits where the numbers were',
    isOn() { return jammerToday(); },
    activity(t) {
      if (netActive(t)) return 0; /* it does not join the net. it is not one of us. */
      return 0.75 + 0.25 * Math.sin(t / 90) * Math.sin(t / 1300);
    },
  });

  /* ---------- THE FAR FIELD ---------- */
  /* THE WARNING: an automated distress call, repeating, degrading. A
     short-stay listener hears a mayday and pencils it in as one. Once an
     hour — the last three minutes — it keys the one message that inverts
     the reading. It is not asking for help. It is telling you not to come.
     The log quietly amends itself for whoever was still there to copy it. */
  S.push((() => {
    const cry = humanize(compileMorse('SOS SOS DE VESSEL QTH 31N 48E QRK? K', 10, 4000), LP.mulberry(9538), 120);
    const tail = compileMorse('NIL QRK NIL QSP DO NOT ANSWER DO NOT COME', 10, 5000);
    return {
      id: 'THE WARNING', name: 'THE WARNING', f: 9538.0, band: 2, type: 'beacon', bw: 0.12,
      wpm: 10, note: 'a mayday, repeating',
      _m: cry, text: 'SOS SOS DE VESSEL QTH 31N 48E QRK? K',
      tailActive(t) { return Math.floor(t / 60000) % 60 >= 57; },
      keyed(t) {
        if (t >= net.t0 && t < net.until) return { m: net.m, off: t - net.t0 };
        if (this.tailActive(t)) {
          const h0 = Math.floor(t / 3600000) * 3600000 + 57 * 60000;
          return { m: tail, off: t - h0 };
        }
        return { m: cry, off: t };
      },
      activity(t) { const k = this.keyed(t); return morseOn(k.m, k.off) ? 1 : 0; },
    };
  })());

  /* ---------- DX: one night only ---------- */
  /* Some nights — the same nights for every listener on Earth, seeded by
     the UTC date — a stranger crosses the whole sky. Gone by morning. */
  const utcDaySeed = () => {
    const d = LP.date();
    return d.getUTCFullYear() * 1000
      + Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000) + 1;
  };
  {
    const r = LP.mulberry(utcDaySeed() + 9090);
    if (r() < 0.17) {
      const DXS = [
        { id: 'ORPHAN', f: 3230.0, band: 0, text: 'DE ORPHAN ORPHAN QSL VIA NIGHT ONLY K', wpm: 11 },
        { id: '4XR-9', f: 6614.0, band: 1, text: 'VVV DE 4XR9 4XR9 EX PACIFIC RELAY 73 K', wpm: 19 },
        { id: 'THE LIGHTSHIP', f: 9315.0, band: 2, text: 'DE LIGHTSHIP QTH UNKNOWN DRIFTING K', wpm: 9 },
      ];
      const d = DXS[Math.floor(r() * DXS.length)];
      beacon(d.id, d.f, d.band, d.text, d.wpm, (r() - 0.5) * 120, 'one night only ★');
      S[S.length - 1].isOn = () => { const h = LP.date().getHours(); return h >= 20 || h < 6; };
    }
  }

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
    return LP.clamp(m.base * bandFactor(m.band, t) * (0.7 + 0.3 * Math.sin(t / 7000 + m.phase)), 0, 1)
      * (1 - weather.sid(t) * 0.85)  /* a flare flattens the underbrush too */
      * sleeper.gain(m, t);
  }

  /* ---------- more of THE FAR FIELD ---------- */
  /* THE SLEEPER: one carrier in the underbrush, on rare seeded nights,
     breathes — twelve to the minute, the rate of something large at rest.
     Now and then it stops. Slightly too long. It is not on the station
     list. It is not loggable. It is not acknowledged, here or anywhere. */
  const sleeper = {
    m: null, _tried: false,
    night() { return LP.mulberry(daySeed() + 808)() < 0.13; },
    gain(m, t) {
      if (!this._tried) {
        this._tried = true;
        if (this.night()) {
          const carriers = minors.filter(x => x.kind === 'carrier');
          if (carriers.length) this.m = carriers[Math.floor(LP.mulberry(daySeed() + 809)() * carriers.length)];
        }
      }
      if (m !== this.m) return 1;
      const ph = t % 47000;
      if (ph > 36000) return 0.35;                 /* the pause. count it. */
      const b = Math.sin(ph / 5000 * LP.TAU);      /* twelve to the minute */
      return 0.55 + 0.45 * Math.max(0, b) + 0.1 * Math.min(0, b);
    },
  };

  /* LONG DELAY: on rare seeded nights the band echoes — leave a station
     and, seconds later, its last minute repeats below it: weaker, lower,
     late. Reported since 1927. Never fully explained. Not explained here. */
  const lde = {
    echo: null,
    night() { return LP.mulberry(daySeed() + 404)() < 0.11; },
    depart(st, t) { /* the log calls this when a lock lets go */
      if (!this.night() || !st || !st.activity || this.echo) return;
      const r = LP.mulberry((Math.floor(t / 1000) * 7 + 13) | 0);
      if (r() > 0.5) return;
      const lag = 8000 + r() * 32000;
      this.echo = { st, lag, from: t + lag, until: t + lag + 9000 };
    },
    activity(t) {
      if (!this.echo) return 0;
      if (t > this.echo.until) { this.echo = null; return 0; }
      if (t < this.echo.from) return 0;
      return this.echo.st.activity(t - this.echo.lag);
    },
    f() { return this.echo ? this.echo.st.f - 0.7 : 0; },
    band() { return this.echo ? this.echo.st.band : -1; },
  };

  /* HULL NOISE: on storm nights, behind the forecast, something enormous
     settles. The antenna farm, in the wind. Of course. The antenna farm. */
  function hullEvent(t) {
    if (weather.k() < 6) return null;
    const h = new Date(t).getHours();
    if (h >= 6 && h < 20) return null;
    const SLOT = 180000;
    const slot = Math.floor(t / SLOT);
    const r = LP.mulberry((daySeed() * 3 + slot * 977) | 0);
    if (r() > 0.4) return null;
    const t0 = slot * SLOT + 20000 + r() * (SLOT - 60000);
    const dur = 2500 + r() * 3500;
    if (t < t0 || t >= t0 + dur) return null;
    return { t0, dur, deep: r() < 0.5 };
  }

  /* ONE ROW EARLY: the single permitted lie. On echo nights, for one
     seeded half-minute, the glass runs one raster row AHEAD of the ear.
     This is the only sanctioned violation of the house rule — one row,
     once a night, only on nights the band is already repeating itself. */
  function earlyNow(t) {
    if (!lde.night()) return false;
    const minute = Math.floor(LP.mulberry(daySeed() + 1927)() * 1440);
    const m = Math.floor((t % 86400000) / 60000);
    return m === minute && (t % 60000) < 30000;
  }

  /* ---------- propagation ---------- */
  /* real HF behavior, played straight: the low band carries at night, the
     high band by day, the middle hardly cares. The ionosphere is the game —
     and now it has weather: storm days absorb the low band, sporadic E
     opens the high band on nights it has no business being open. */
  function bandFactor(bandIx, t) {
    const d = LP.date();
    const h = d.getHours() + d.getMinutes() / 60;
    const day = 0.5 + 0.5 * Math.cos(((h - 13) / 24) * 2 * Math.PI); /* 1 at 13:00, 0 at 01:00 */
    const k = weather.k();
    if (bandIx === 0) {
      let f = 0.55 + 0.45 * (1 - day);                  /* GROUND: a night band */
      if (k >= 6) f *= 0.78;                            /* storm absorption bites low first */
      return f;
    }
    if (bandIx === 2) {
      let f = 0.55 + 0.45 * day;                        /* HIGH: a day band */
      if (k >= 6) f *= day > 0.5 ? 0.9 : 0.7;           /* storms close the night path harder */
      if (t !== undefined && weather.esOpen(t)) f = Math.max(f, 0.82); /* sporadic E: open anyway */
      return f;
    }
    return 0.92;                                        /* SKY: the reliable middle */
  }
  /* slow QSB fading, per station — plus auroral flutter on storm days */
  function fade(st, t) {
    const seed = st.f * 7.3;
    let v = 0.62
      + 0.28 * Math.sin(t / 9000 + seed)
      + 0.10 * Math.sin(t / 2300 + seed * 1.7);
    if (weather.k() >= 5) v += 0.07 * Math.sin(t / 130 + seed * 3); /* fast shallow flutter */
    return v;
  }
  function strength(st, t) {
    if (st.isOn && !st.isOn() && !netActive(t)) return 0;   /* its own hours — except for the net, once */
    /* THE CONSTANT, while the tenant is present, has no distance: no QSB, no
       day/night curve, no storm, no flare. The same strength for every
       listener on Earth. Afterward, it fades like anything. */
    if (st.type === 'constant' && present()) return 0.42;
    /* a flare on the dayside pushes every real signal down toward the noise */
    return LP.clamp(fade(st, t) * bandFactor(st.band, t), 0.08, 1) * (1 - weather.sid(t) * 0.85);
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
      /* it only notices a listener who is actually THERE: a page left open on
         a desk, never touched, must not summon and spend the once-ever event.
         Once it has begun approaching a present listener, it sees it through. */
      if (this.state === 'asleep' && !LP.engaged) return;
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
    /* atmospheric noise falls WITH frequency, as it does on a real HF rig */
    const noiseBase = 0.079 - bandIx * 0.012;
    /* lightning crash: a TIME-based hazard (one per ~24s on average), so the
       storm doesn't care how often anyone renders it. A flare in progress
       charges the sky: crashes come more often while the signals sink. */
    if (t > sferic.until) {
      const p = 1 - Math.exp(-(t - sferic.lastRoll) / 24000);
      sferic.lastRoll = t;
      if (rng() < p * (1 + 2 * weather.sid(t))) { sferic.until = t + 140 + rng() * 400; sferic.level = 0.25 + rng() * 0.5; }
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
    /* the echo: what you just left, again, lower and late */
    if (lde.echo && lde.band() === bandIx) {
      const a = lde.activity(t) * 0.16;
      if (a > 0.002) paint(out, fLo, fHi, lde.f(), 0.1, a, null, t);
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
      /* the honest 170 Hz shift, and the LIVE tone paints hot: zoom to
         12 kHz and the start bits resolve — the raster shows the data */
      const off = 0.17 / span * cols / 2;
      const mark = st.bitAt ? st.bitAt(t) : 1;
      splat(out, center + off, Math.max(0.7, sigma * 0.3), amp * (mark ? 1 : 0.3));
      splat(out, center - off, Math.max(0.7, sigma * 0.3), amp * (mark ? 0.3 : 1));
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
    if (st && st.type === 'jammer') {
      /* a wall of hash: wideband, textured, unmusical */
      const w = Math.max(2, sigma * 2);
      for (let i = Math.max(0, Math.floor(center - w)); i < Math.min(cols, center + w); i++) {
        out[i] += amp * (0.5 + 0.5 * Math.abs(Math.sin(i * 12.9898 + t / 35)));
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

  /* keying edges for lookahead audio scheduling: [{t (wall ms), on}] inside
     [t0..t1]. noNet: the underbrush never joins the net — strangers stay
     strangers even at the one moment the named band speaks in unison. */
  function keyEdges(st, t0, t1, noNet) {
    const k = st.keyed ? st.keyed(t0)
      : (!noNet && t0 >= net.t0 && t0 < net.until) ? { m: net.m, off: t0 - net.t0 }
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
    present, roomEvent, crossRead, weather,
    lde, hullEvent, earlyNow, jammerToday, elegyDays,
  };
})();

/* the receiver state: one VFO, one band, one span (the width of the window
   the waterfall resolves). Arrival parks it a nudge below AURORA so the first
   drag of the dial tunes INTO the music. */
LP.rx = { band: 1, vfo: 6779.0, span: 48, dwellT0: performance.now() };
LP.SPANS = [48, 24, 12];   /* wide to narrow: zoom in and the keying resolves */

