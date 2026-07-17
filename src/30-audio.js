/* THE LISTENING POST — audio. Zero audio files. The same band model the
   waterfall paints is rendered here as sound: CW beats against the BFO so
   pitch follows your tuning error, the buzzer rasps, the RTTY diddles,
   AURORA plays actual music through 2,000 miles of ionosphere, and the
   ghost is a heterodyne whistle falling toward zero-beat.

   THE LAW: no sound before an activation-bearing gesture; the chip never
   claims ON until the context runs; opt-out is remembered; hidden tabs
   are silent. */
LP.audio = (() => {
  let ctx = null, master = null, noiseGain = null, crashGain = null;
  let enabled = LP.store.get('sound', true);
  const chip = document.getElementById('sound-toggle');
  const voices = new Map();   /* station id -> voice */
  let smeter = 0;             /* 0..1, for the needle */

  function build() {
    if (ctx) return;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { ctx = null; return; } /* a silent set beats a console fire */
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 22; comp.ratio.value = 5;
    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(comp).connect(ctx.destination);

    /* the noise floor: band hiss, shaped */
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf; noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.5;
    noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.05;
    noise.connect(bp).connect(noiseGain).connect(master);
    noise.start();

    /* lightning crashes ride a separate wideband path */
    const nz2 = ctx.createBufferSource();
    nz2.buffer = buf; nz2.loop = true; nz2.playbackRate.value = 0.7;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 300;
    crashGain = ctx.createGain(); crashGain.gain.value = 0;
    nz2.connect(hp).connect(crashGain).connect(master);
    nz2.start();

    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else if (enabled) ctx.resume().then(reflect).catch(reflect);
    });
    ctx.onstatechange = reflect;
  }

  function reflect() {
    const on = !!(ctx && ctx.state === 'running' && enabled);
    if (chip) chip.setAttribute('aria-pressed', String(on));
  }
  function arm() {
    if (!enabled) return;
    build();
    if (!ctx) return;
    if (ctx.state !== 'running') ctx.resume().then(reflect).catch(reflect);
    else reflect();
  }
  function toggle() {
    enabled = !enabled;
    LP.store.set('sound', enabled);
    if (enabled) { build(); if (ctx) ctx.resume().then(reflect).catch(reflect); LP.say('Sound on.'); }
    else { if (ctx) ctx.suspend(); reflect(); LP.say('Sound off.'); }
  }
  if (chip) chip.addEventListener('click', toggle);

  const audible = () => ctx && ctx.state === 'running' && enabled;

  /* ---------- voices ---------- */
  function mkVoice(st) {
    const g = ctx.createGain(); g.gain.value = 0;
    /* the band has a stereo image: a station below your dial sits left,
       above sits right — turn the knob and the room turns with you */
    let pan = null;
    if (ctx.createStereoPanner) {
      pan = ctx.createStereoPanner();
      g.connect(pan).connect(master);
    } else {
      g.connect(master);
    }
    const v = { g, pan, st, nodes: [] };
    if (pan) (v.aux = v.aux || []).push(pan);
    const osc = (type, freq) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq;
      o.start();
      v.nodes.push(o);
      return o;
    };

    v.aux = v.aux || [];
    if (st.type === 'beacon' || st.type === 'ghostcw') {
      v.o = osc('sine', 600);
      v.o.connect(g);
    } else if (st.type === 'buzzer') {
      v.o = osc('sawtooth', 238);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 640; f.Q.value = 1.6;
      v.buzzG = ctx.createGain(); v.buzzG.gain.value = 0; /* the duck lives HERE, not on the shared gain */
      v.o.connect(f).connect(v.buzzG).connect(g);
      v.digit = osc('sine', 500);
      v.digitG = ctx.createGain(); v.digitG.gain.value = 0;
      v.digit.connect(v.digitG).connect(g);
      v.aux.push(f, v.buzzG, v.digitG);
    } else if (st.type === 'rtty') {
      v.o = osc('sine', 935);
      const lfo = osc('square', st.baud / 2);
      const dep = ctx.createGain(); dep.gain.value = 85;
      lfo.connect(dep).connect(v.o.frequency);
      v.o.connect(g);
    } else if (st.type === 'night') {
      v.o = osc('sine', 220);
      const echoIn = ctx.createGain();
      const dl = ctx.createDelay(1.2); dl.delayTime.value = 0.62;
      const fb = ctx.createGain(); fb.gain.value = 0.42;
      v.toneG = ctx.createGain(); v.toneG.gain.value = 0;
      v.o.connect(v.toneG).connect(echoIn);
      echoIn.connect(g);
      echoIn.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(g);
      v.lastTone = -1;
      v.aux.push(echoIn, dl, fb, v.toneG);
    } else if (st.type === 'sstv') {
      v.o = osc('sine', 1500);
      const sg = ctx.createGain(); sg.gain.value = 0.55;
      v.o.connect(sg).connect(g);
      v.aux.push(sg);
    } else if (st.type === 'crossing') {
      /* a grade-crossing bell heard across a long night: two warm tones
         through a lowpass, swinging back and forth, far away and small */
      v.o = osc('triangle', 620);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1400; lp.Q.value = 0.6;
      v.o.connect(lp).connect(g);
      v.aux.push(lp);
    } else if (st.type === 'music') {
      /* AURORA's little orchestra: lead + bass through a warm lowpass + echo.
         The tune rides the WALL CLOCK — retune away and back, and the same
         broadcast has moved on without you, like a real one. */
      v.bus = ctx.createGain(); v.bus.gain.value = 0.9;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2100; lp.Q.value = 0.4;
      const dl = ctx.createDelay(1); dl.delayTime.value = 0.34;
      const fb = ctx.createGain(); fb.gain.value = 0.35;
      v.bus.connect(lp).connect(g);
      lp.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(g);
      v.step = Math.floor(Date.now() / 320);
      v.nextNote = ctx.currentTime + (320 - (Date.now() % 320)) / 1000;
      v.scale = [0, 3, 5, 7, 10, 12, 15];
      v.aux.push(v.bus, lp, dl, fb);
    }
    return v;
  }

  /* the underbrush gets cheap voices: a CW ragchew beats against the BFO
     like a beacon, a carrier is a steady het, splatter is a rough rasp. Only
     the few minors within earshot ever build one. */
  function mkMinorVoice(m) {
    const g = ctx.createGain(); g.gain.value = 0;
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); g.connect(pan).connect(master); }
    else g.connect(master);
    const o = ctx.createOscillator();
    o.type = m.kind === 'splatter' ? 'sawtooth' : 'sine';
    o.frequency.value = 500; o.start();
    const v = { g, pan, o, m, nodes: [o], aux: pan ? [pan] : [] };
    if (m.kind === 'splatter') {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
      o.connect(f).connect(g); v.aux.push(f);
    } else {
      o.connect(g);
    }
    return v;
  }

  function killVoice(v) {
    for (const n of v.nodes) { try { n.stop(); } catch { } }
    for (const n of v.aux || []) { try { n.disconnect(); } catch { } } /* break the delay-feedback cycles */
    try { v.g.disconnect(); } catch { }
  }

  /* the S-meter reads the MODEL, not the audio path: it works with sound
     off, opted out, or before the first gesture */
  function meterScan(t) {
    const rx = LP.rx;
    let m = 0;
    for (const st of LP.band.stations) {
      if (st.band !== rx.band) continue;
      const off = rx.vfo - st.f;
      if (Math.abs(off) > 5) continue;
      const sel = Math.exp(-(off * off) / (2 * Math.pow(Math.max(st.bw, 0.35) * 0.9, 2)));
      m = Math.max(m, LP.band.strength(st, t) * sel * (0.4 + 0.6 * st.activity(t)));
    }
    const gh = LP.band.ghost;
    if (gh.state !== 'asleep' && gh.state !== 'gone') m = Math.max(m, gh.strength() * 0.8);
    return m;
  }

  /* per-frame render: called by the display loop with wall time */
  function update(t) {
    smeter = meterScan(t);
    if (!ctx || !audible()) return;
    const rx = LP.rx;
    const now = ctx.currentTime;
    const K = 0.012; /* keying time-constant */

    /* which stations are within earshot (±5 kHz) */
    const near = new Set();
    for (const st of LP.band.stations) {
      if (st.band !== rx.band) continue;
      const off = rx.vfo - st.f;
      if (Math.abs(off) > 5) continue;
      near.add(st.id);
      let v = voices.get(st.id);
      if (!v) { v = mkVoice(st); voices.set(st.id, v); }
      const act = st.activity(t);
      const str = LP.band.strength(st, t);
      /* selectivity: how much of it lands in the passband */
      const sel = Math.exp(-(off * off) / (2 * Math.pow(Math.max(st.bw, 0.35) * 0.9, 2)));
      let vol = act * str * sel;
      if (v.pan) v.pan.pan.setTargetAtTime(LP.clamp((st.f - rx.vfo) / 3.5, -0.75, 0.75), now, 0.08);

      if (st.type === 'beacon') {
        /* CW against the BFO: pitch IS your tuning error (1 kHz off = 1 kHz beat,
           floored at 300 Hz so zero-beat stays musical) */
        const pitch = LP.clamp(300 + Math.abs(off) * 1000 + (st.pitchBias || 0), 220, 1900);
        v.o.frequency.setTargetAtTime(pitch, now, 0.03);
        /* keying is SCHEDULED 330ms ahead on the audio clock: a stalled frame
           can no longer smear a dit into a stuck carrier */
        const lvl = str * sel * 0.30;
        const gg = v.g.gain;
        gg.cancelScheduledValues(now);
        gg.setTargetAtTime(st.activity(t) > 0 ? lvl : 0, now, K);
        for (const e of LP.band.keyEdges(st, t, t + 330)) {
          gg.setTargetAtTime(e.on ? lvl : 0, now + Math.max(0.001, (e.t - t) / 1000), 0.008);
        }
      } else if (st.type === 'buzzer') {
        const p = st.phase(t);
        v.g.gain.setTargetAtTime(str * sel * 0.26, now, K);
        v.buzzG.gain.setTargetAtTime(p.mode === 'buzz' ? (p.on ? 1 : 0.06) : 0.05, now, K);
        if (p.mode === 'digit' && p.on) {
          v.digit.frequency.setTargetAtTime(430 + p.digit * 74, now, 0.01);
          v.digitG.gain.setTargetAtTime(0.55, now, K);
        } else {
          v.digitG.gain.setTargetAtTime(0, now, K);
        }
      } else if (st.type === 'rtty') {
        v.g.gain.setTargetAtTime(vol * 0.16, now, K);
      } else if (st.type === 'night') {
        v.g.gain.setTargetAtTime(str * sel * 0.5, now, 0.05);
        const ix = st.toneIx(t);
        if (ix >= 0 && ix !== v.lastTone && st.activity(t) > 0) {
          v.lastTone = ix;
          /* eleven tones: a slow minor climb that resolves */
          const semis = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24][ix];
          v.o.frequency.setValueAtTime(164.81 * Math.pow(2, semis / 12), now);
          v.toneG.gain.cancelScheduledValues(now);
          v.toneG.gain.setValueAtTime(0.0001, now);
          v.toneG.gain.exponentialRampToValueAtTime(0.5, now + 0.06);
          v.toneG.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
        }
        if (ix === -1) v.lastTone = -1;
      } else if (st.type === 'sstv') {
        const prog = st.prog(t);
        if (prog >= 0 && LP.sstv) {
          v.o.frequency.setTargetAtTime(1200 + LP.sstv.lumaAt(prog) * 1100, now, 0.008);
          v.g.gain.setTargetAtTime(vol * 0.14, now, K);
        } else {
          /* the CW ident between pictures */
          v.o.frequency.setTargetAtTime(740, now, 0.02);
          v.g.gain.setTargetAtTime(st.activity(t) * str * sel * 0.2, now, K);
        }
      } else if (st.type === 'crossing') {
        v.o.frequency.setTargetAtTime(st.toneHigh(t) ? 660 : 494, now, 0.02);
        v.g.gain.setTargetAtTime(vol * 0.22, now, 0.03);
      } else if (st.type === 'music') {
        v.g.gain.setTargetAtTime(vol * 0.5, now, 0.05);
        /* schedule the little tune ahead of time; the melody is a pure
           function of the wall-clock step, so the broadcast never restarts */
        while (v.nextNote < now + 0.35) {
          const when = Math.max(v.nextNote, now + 0.02);
          const beat = 0.32;
          const r = LP.mulberry((20260716 + new Date().getDate() * 977 + v.step) | 0);
          const deg = v.scale[Math.floor(r() * v.scale.length)];
          if (v.step % 4 === 0) note(v.bus, 110 * Math.pow(2, (v.step % 8 === 0 ? 0 : 7) / 12), when, beat * 3.4, 'triangle', 0.16);
          if (r() < 0.82) note(v.bus, 440 * Math.pow(2, deg / 12), when, beat * (r() < 0.3 ? 1.9 : 0.95), 'sine', 0.14);
          v.nextNote = when + beat;
          v.step++;
        }
      }
    }

    /* the underbrush within earshot: quiet CW, hets, and hash under the dial */
    for (const m of LP.band.minors) {
      if (m.band !== rx.band) continue;
      const f = LP.band.minorF(m, t);
      const off = rx.vfo - f;
      if (Math.abs(off) > 4) continue;
      const a = LP.band.minorActive(m, t);
      if (a <= 0) { if (voices.has(m.id)) voices.get(m.id).g.gain.setTargetAtTime(0, now, K); continue; }
      near.add(m.id);
      let v = voices.get(m.id);
      if (!v) { v = mkMinorVoice(m); voices.set(m.id, v); }
      const str = LP.band.minorStrength(m, t);
      const sel = Math.exp(-(off * off) / (2 * 0.42 * 0.42));
      if (v.pan) v.pan.pan.setTargetAtTime(LP.clamp(-off / 3.5, -0.75, 0.75), now, 0.08);
      if (m.kind === 'carrier') {
        v.o.frequency.setTargetAtTime(LP.clamp(120 + Math.abs(off) * 1000, 90, 1800), now, 0.05);
        v.g.gain.setTargetAtTime(str * sel * 0.11, now, 0.05);
      } else if (m.kind === 'splatter') {
        v.o.frequency.setTargetAtTime(140 + Math.abs(off) * 260, now, 0.05);
        v.g.gain.setTargetAtTime(str * sel * 0.05, now, K);
      } else { /* cw */
        v.o.frequency.setTargetAtTime(LP.clamp(300 + Math.abs(off) * 1000, 220, 1700), now, 0.03);
        v.g.gain.setTargetAtTime(str * sel * 0.16, now, K);
      }
    }

    /* the ghost: a carrier with no name */
    const gh = LP.band.ghost;
    if (gh.state !== 'asleep' && gh.state !== 'gone') {
      near.add('THE OTHER');
      let v = voices.get('THE OTHER');
      if (!v) { v = mkVoice({ type: 'ghostcw', id: 'THE OTHER' }); voices.set('THE OTHER', v); }
      const off = Math.abs(LP.rx.vfo - gh.f);
      if (v.pan) v.pan.pan.setTargetAtTime(LP.clamp((gh.f - LP.rx.vfo) / 3.5, -0.75, 0.75), now, 0.08);
      if (gh.state === 'asking') {
        v.o.frequency.setTargetAtTime(478, now, 0.02);
        v.g.gain.setTargetAtTime(gh.activity(t) * 0.24, now, K);
      } else {
        /* heterodyne: the whistle falls as it closes on you */
        const beat = LP.clamp(off * 1000, 24, 2400);
        v.o.frequency.setTargetAtTime(beat, now, 0.03);
        v.g.gain.setTargetAtTime(gh.strength() * 0.2 * Math.exp(-off * off / 4), now, 0.05);
      }
    }

    /* silence + release voices that drifted out of earshot */
    for (const [id, v] of voices) {
      if (!near.has(id)) {
        v.g.gain.setTargetAtTime(0, now, 0.05);
        if (!v._dieAt) v._dieAt = t + 1200;
        else if (t > v._dieAt) { killVoice(v); voices.delete(id); }
      } else v._dieAt = 0;
    }

    /* noise floor swells when nothing is tuned; crashes follow the sky */
    noiseGain.gain.setTargetAtTime(0.028 + 0.05 * (1 - Math.min(1, smeter * 1.6)), now, 0.2);
    const sf = LP.band.sferic;
    crashGain.gain.setTargetAtTime(t < sf.until ? sf.level * 0.16 : 0, now, 0.02);
  }

  /* the band switch throws a physical relay: a click transient over a low
     thud. Built on demand, gesture-gated like everything else. */
  function relayClunk() {
    if (!audible()) return;
    const now = ctx.currentTime;
    /* the click: a very short filtered noise snap */
    const len = Math.floor(ctx.sampleRate * 0.05);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const cg = ctx.createGain(); cg.gain.value = 0.16;
    src.connect(bp).connect(cg).connect(master);
    src.start(now); src.stop(now + 0.06);
    src.onended = () => { try { src.disconnect(); bp.disconnect(); cg.disconnect(); } catch { } };
    /* the thud: a low body that decays fast */
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(150, now);
    o.frequency.exponentialRampToValueAtTime(70, now + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.22, now + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
    o.connect(g).connect(master);
    o.start(now); o.stop(now + 0.16);
    o.onended = () => { try { o.disconnect(); g.disconnect(); } catch { } };
  }

  function note(bus, freq, when, dur, type, amp) {
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(amp, when + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(bus);
    o.start(when); o.stop(when + dur + 0.1);
  }

  LP.relayClunk = relayClunk;
  return { arm, toggle, update, reflect, relayClunk, get smeter() { return smeter; }, get enabled() { return enabled; } };
})();
