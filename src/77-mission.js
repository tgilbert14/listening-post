'use strict';
/* OPERATION NIGHT GLASS — a short reactive campaign wrapped around the real
   receiver. Nothing here fakes a carrier: progression reads the same locks,
   dial and band model that drive the phosphor and the audio. */
LP.mission = (() => {
  const $ = (id) => document.getElementById(id);
  const ui = {
    objective: $('objective-live'), objectiveIndex: $('objective-index'), clock: $('mission-clock'),
    compactObjective: $('compact-objective'), compactClock: $('compact-clock'), compactState: $('compact-state'), compactTags: $('compact-tags'),
    dossierObjective: $('dossier-objective'), dossierSeed: $('dossier-seed'), evidence: $('evidence-list'),
    alertState: $('alert-state'), alertCard: $('mission-alert'), suspicion: document.querySelector('.suspicion'),
    supportName: $('support-name'), supportFrequency: $('support-frequency'), supportNode: $('support-node'), supportStatus: $('support-status'), supportKey: $('support-key'),
    tacticalState: $('tactical-state'), tacticalDetail: $('tactical-detail'), tacticalFoot: $('tactical-foot'), radar: $('mission-radar'),
    boxStealth: $('box-stealth'), anomaly: $('anomaly-flash'), unknown: $('codec-unknown'),
    debrief: $('debrief'), debriefRank: $('debrief-rank'), debriefSubtitle: $('debrief-subtitle'), debriefScore: $('debrief-score'),
    debriefTime: $('debrief-time'), debriefEvidence: $('debrief-evidence'), debriefAlerts: $('debrief-alerts'), debriefEnding: $('debrief-ending'), debriefSeed: $('debrief-seed'),
  };

  const state = {
    active: false, complete: false, phase: 'idle', startedAt: 0, phaseAt: 0,
    objectiveNo: 1, objectiveText: 'ACQUIRE ANY ACTIVE CARRIER', score: 0,
    suspicion: 0, alert: 'NORMAL', alerts: 0, evidence: [],
    lock: null, lockAt: 0, lastTune: 0, lastTuneBurst: 0, tuneBursts: 0,
    boxOn: false, boxAt: 0, decision: '', finalTarget: '', finalPrompted: false,
    intercepted: false, ending: '', seed: '', lastHud: 0,
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const elapsed = () => Math.max(0, performance.now() - state.startedAt);
  const stamp = (ms = elapsed()) => `${pad2(Math.floor(ms / 60000))}:${pad2(Math.floor(ms / 1000) % 60)}`;
  const station = (id) => LP.band.stations.find(s => s.id === id);
  function dailySeed() {
    const d = LP.date();
    const day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86400000);
    return `NG-${String(d.getFullYear()).slice(-2)}-${String(day).padStart(3, '0')}`;
  }

  function setObjective(text, no) {
    if (no !== undefined) state.objectiveNo = no;
    state.objectiveText = text;
    if (ui.objective) ui.objective.textContent = text;
    if (ui.objectiveIndex) ui.objectiveIndex.textContent = pad2(state.objectiveNo);
    if (ui.compactObjective) ui.compactObjective.textContent = text;
    if (ui.dossierObjective) ui.dossierObjective.textContent = text;
    LP.say(`Objective ${state.objectiveNo}: ${text.toLowerCase()}.`);
  }

  function addEvidence(label, detail) {
    if (state.evidence.some(e => e.label === label)) return;
    state.evidence.push({ label, detail: detail || '', at: stamp() });
    state.score += 120;
    renderEvidence();
    LP.audio?.cue?.('objective');
  }
  function renderEvidence() {
    if (!ui.evidence) return;
    ui.evidence.textContent = '';
    if (!state.evidence.length) {
      const li = document.createElement('li'); li.textContent = 'NO EVIDENCE FILED'; ui.evidence.appendChild(li); return;
    }
    for (const e of state.evidence) {
      const li = document.createElement('li');
      const strong = document.createElement('strong'); strong.textContent = e.label;
      const small = document.createElement('small'); small.textContent = `${e.at} // ${e.detail}`;
      li.append(strong, small); ui.evidence.appendChild(li);
    }
  }

  let flashTimer = 0;
  function flash(text, ms = 1100) {
    if (!ui.anomaly) return;
    clearTimeout(flashTimer); ui.anomaly.textContent = text; ui.anomaly.classList.add('on');
    LP.audio?.cue?.('anomaly');
    flashTimer = setTimeout(() => ui.anomaly.classList.remove('on'), ms);
  }

  let alertTimer = 0;
  function reflectAlert(force = false) {
    const next = state.suspicion >= 67 ? 'ALERT' : state.suspicion >= 34 ? 'CAUTION' : 'NORMAL';
    if (next !== state.alert || force) {
      const previous = state.alert; state.alert = next;
      document.body.classList.toggle('mission-caution', next === 'CAUTION');
      document.body.classList.toggle('mission-alerted', next === 'ALERT');
      if (next === 'ALERT' && previous !== 'ALERT') { state.alerts++; state.score = Math.max(0, state.score - 75); LP.audio?.cue?.('alert'); }
      if (ui.alertState) { ui.alertState.textContent = next; ui.alertState.classList.toggle('hot', next !== 'NORMAL'); }
      if (ui.compactState) ui.compactState.textContent = next;
      if (ui.alertCard) {
        clearTimeout(alertTimer);
        const label = ui.alertCard.querySelector('span'); if (label) label.textContent = next;
        ui.alertCard.classList.toggle('on', next !== 'NORMAL');
        if (next === 'CAUTION') alertTimer = setTimeout(() => ui.alertCard.classList.remove('on'), 1500);
      }
    }
    if (ui.suspicion) {
      [...ui.suspicion.children].forEach((bar, i) => bar.classList.toggle('on', state.suspicion >= (i + 1) * (100 / 6)));
      ui.suspicion.setAttribute('aria-label', `Trace level ${Math.round(state.suspicion)} percent, ${state.alert.toLowerCase()}`);
    }
  }

  function setSuspicion(value) {
    state.suspicion = LP.clamp(value, 0, 100); reflectAlert();
  }

  function updateSupport(who, status, key) {
    const raven = who === 'RAVEN';
    if (ui.supportName) ui.supportName.textContent = who;
    if (ui.supportFrequency) ui.supportFrequency.textContent = raven ? '141.12' : who === '???' ? '---.--' : '140.85';
    if (ui.supportNode) ui.supportNode.textContent = raven ? 'GROUND' : who === '???' ? 'NULL' : 'SKY';
    if (ui.supportStatus) ui.supportStatus.textContent = status || 'LIVE';
    if (ui.supportKey) ui.supportKey.textContent = key || 'NONE';
    document.body.classList.toggle('support-raven', raven);
    document.body.classList.toggle('support-unknown', who === '???');
  }

  function showCall(who, line, status, options) {
    updateSupport(who, status, options?.key);
    LP.comms?.show?.([who, line], status, options || {});
  }

  function start({ intercepted = false } = {}) {
    Object.assign(state, {
      active: true, complete: false, phase: 'acquire', startedAt: performance.now(), phaseAt: performance.now(),
      objectiveNo: 1, score: 500, suspicion: 0, alert: 'NORMAL', alerts: 0, evidence: [],
      lock: null, lockAt: 0, lastTune: performance.now(), lastTuneBurst: 0, tuneBursts: 0,
      boxOn: false, boxAt: 0, decision: '', finalTarget: '', finalPrompted: false,
      intercepted, ending: '', seed: dailySeed(), lastHud: 0,
    });
    document.body.classList.add('mission-live');
    document.body.classList.remove('mission-complete', 'mission-caution', 'mission-alerted', 'anomaly-one', 'anomaly-two', 'free-listen');
    LP.easter?.setBox?.(false, false);
    if (ui.unknown) ui.unknown.classList.add('locked');
    if (ui.dossierSeed) ui.dossierSeed.textContent = `DAILY SEED ${state.seed} // IONOSPHERE LIVE`;
    renderEvidence(); reflectAlert(true); setObjective('ACQUIRE ANY ACTIVE CARRIER AND HOLD', 1);
    updateSupport('VESPER', 'LIVE', 'NONE');
    if (ui.tacticalState) ui.tacticalState.textContent = 'SEARCHING';
    if (ui.tacticalDetail) ui.tacticalDetail.textContent = 'NO TRACE';
    if (ui.tacticalFoot) ui.tacticalFoot.innerHTML = '*PIGEON STATUS<br>UNCONFIRMED';
    setTimeout(() => {
      if (!state.active || state.phase !== 'acquire') return;
      const line = intercepted
        ? 'You answered before the call was transmitted. Do not mention that in the report. Sweep the band and hold any stable carrier.'
        : 'Operation Night Glass is live. Acquire any stable carrier and hold it. Command says this is routine, which is why I am concerned.';
      showCall('VESPER', line, intercepted ? 'CALL RECEIVED -00:02' : 'MISSION START', {
        choices: [{ label: 'ACKNOWLEDGE', value: 'ACK' }, { label: 'ASK ABOUT PIGEON', value: 'PIGEON' }],
        onChoice(value) {
          if (value === 'PIGEON') {
            addEvidence('FAUNA BULLETIN', 'COMMAND REFUSES TO DEFINE PIGEON');
            setTimeout(() => showCall('RAVEN', 'The pigeon is not part of the mission. It has attended every briefing.', 'UNSOLICITED CLARIFICATION', { frequency: '141.12' }), 180);
          }
        },
      });
    }, intercepted ? 520 : 900);
  }

  function firstAcquisition(id) {
    if (state.phase !== 'acquire') return;
    state.phase = 'lattice'; state.phaseAt = performance.now(); state.score += 180;
    addEvidence(`CARRIER ${id}`, 'AUTHENTIC SIGNAL LOCK');
    const target = station('THE LATTICE');
    setObjective(`SKY BAND // ACQUIRE THE LATTICE ${target ? target.f.toFixed(1) : '6727.0'} KHZ`, 2);
    if (ui.tacticalState) ui.tacticalState.textContent = 'TARGET MARKED';
    if (ui.tacticalDetail) ui.tacticalDetail.textContent = 'STRUCTURED SIGNAL';
    showCall('VESPER', `Good lock. New priority: THE LATTICE on ${target ? target.f.toFixed(1) : '6727.0'} kilohertz, SKY band. Copy the pattern. Do not let the pattern copy you.`, 'OBJECTIVE UPDATED', {
      choices: [{ label: 'MARK FREQUENCY', value: 'MARK' }, { label: 'WHY THIS SIGNAL?', value: 'WHY' }],
      onChoice(value) {
        if (value === 'WHY') setTimeout(() => showCall('VESPER', 'Because it began transmitting your mission seed six minutes ago.', 'ANSWER WITHHELD'), 160);
      },
    });
  }

  function latticeAcquired() {
    if (state.phase !== 'lattice') return;
    state.phase = 'trace'; state.phaseAt = performance.now(); state.lockAt = performance.now(); state.score += 220;
    /* Getting to the target should feel tense, but it should not pre-complete
       the next objective. The trace only learns the operator's movement after
       THE LATTICE has been decoded. */
    setSuspicion(Math.min(state.suspicion, 18));
    addEvidence('LATTICE GROUP 06', `CONTAINS ${state.seed}`);
    const tomorrow = new Date(LP.now() + 86400000);
    addEvidence('UNFILED LOG ENTRY', `${pad2(tomorrow.getUTCHours())}:${pad2(tomorrow.getUTCMinutes())}Z TOMORROW`);
    document.body.classList.add('anomaly-one');
    if (ui.supportName) ui.supportName.textContent = 'VESPER?';
    setObjective('BREAK CONTACT // MAKE THREE RAPID TUNING MOVES', 3);
    setTimeout(() => {
      if (!state.active || state.phase !== 'trace') return;
      const real = state.objectiveText;
      setObjective('STOP LISTENING', 0); flash('OBJECTIVE FILE DOES NOT MATCH OBJECTIVE FILE', 1250);
      setTimeout(() => { if (state.phase === 'trace') setObjective(real, 3); }, 850);
    }, 600);
    showCall('RAVEN', 'Vesper will tell you to hold position. Do not. Spin the dial hard enough to expose whoever is following your VFO.', 'UNAUTHORIZED OVERRIDE', {
      frequency: '141.12',
      choices: [{ label: 'FOLLOW RAVEN', value: 'RAVEN' }, { label: 'OBEY VESPER', value: 'VESPER' }],
      onChoice(value) {
        state.decision = value;
        if (value === 'VESPER') { setSuspicion(38); addEvidence('CONFLICTING ORDER', 'VESPER REQUESTS ZERO MOVEMENT'); }
      },
    });
  }

  function beginEvade() {
    if (state.phase !== 'trace') return;
    state.phase = 'evade'; state.phaseAt = performance.now(); state.score += 120;
    setSuspicion(Math.max(76, state.suspicion));
    setObjective('EVADE TRACE // DEPLOY BOX AND REMAIN STILL', 4);
    if (ui.tacticalState) ui.tacticalState.textContent = 'TRACE ACTIVE';
    if (ui.tacticalDetail) ui.tacticalDetail.textContent = 'VFO COMPROMISED';
    if (ui.tacticalFoot) ui.tacticalFoot.innerHTML = 'COUNTERMEASURE<br>CARDBOARD / TYPE A';
    showCall('VESPER', 'They have the receiver. Deploy the box and remain absolutely still. This is not a metaphor. Command paid forty-eight dollars for that box.', 'ALERT / COUNTERMEASURE', {
      choices: [{ label: 'DEPLOY BOX', value: 'BOX' }, { label: 'QUESTION PROCUREMENT', value: 'REFUSE' }],
      onChoice(value) {
        if (value === 'BOX') LP.easter?.setBox?.(true, false);
        else setTimeout(() => showCall('RAVEN', 'Procurement has entered the channel. Get in the box.', 'BUDGET EMERGENCY', { frequency: '141.12' }), 160);
      },
    });
  }

  function beginDecision() {
    if (state.phase !== 'evade') return;
    state.phase = 'decision'; state.phaseAt = performance.now(); state.score += 160; setSuspicion(0);
    addEvidence('TRACE EVADED', 'CORRUGATED SIGNATURE ACCEPTED');
    document.body.classList.add('anomaly-two');
    if (ui.unknown) ui.unknown.classList.remove('locked');
    setObjective('ANSWER UNKNOWN CALL // CHOOSE A CONTROL CHANNEL', 5);
    flash('MEMORY 03 HAS ALWAYS BEEN OCCUPIED', 1500);
    showCall('???', 'One of them is transmitting from the future. The other one is transmitting from inside the receiver. You may choose which explanation is safer.', 'MEMORY 03 / ORIGIN NULL', {
      frequency: '---.--', corrupt: true,
      choices: [
        { label: 'TRUST VESPER', value: 'VESPER' },
        { label: 'TRUST RAVEN', value: 'RAVEN' },
        { label: 'POWER DOWN', value: 'POWER' },
      ],
      onChoice: chooseChannel,
    });
  }

  function chooseChannel(value) {
    state.decision = value; LP.easter?.setBox?.(false, false);
    if (value === 'POWER') {
      state.ending = 'You powered down the receiver. The station log continued writing for eleven seconds.';
      addEvidence('POWER DISCONNECT', 'CARRIER REMAINED AUDIBLE');
      finish('POWER'); return;
    }
    state.phase = 'final'; state.phaseAt = performance.now(); state.finalPrompted = false;
    const id = value === 'VESPER' ? 'THE WARNING' : 'THE FORECAST';
    const target = station(id); state.finalTarget = id;
    addEvidence('CONTROL CHANNEL', `${value} SELECTED`);
    setObjective(`${target ? LP.band.BANDS[target.band].name : 'HIGH'} BAND // ACQUIRE ${id} ${target ? target.f.toFixed(1) : '—'} KHZ`, 6);
    if (value === 'VESPER') {
      showCall('VESPER', 'High band. Nine-five-three-eight. The distress signal is not asking for help. Confirm that yourself.', 'FINAL OBJECTIVE', { key: 'EMBER' });
    } else {
      showCall('RAVEN', 'Ground band. Three-three-eight-eight. The forecast contains coordinates for a room with no doors.', 'FINAL OBJECTIVE', { frequency: '141.12', key: 'MOTH' });
    }
  }

  function finalAcquired() {
    if (state.phase !== 'final' || state.finalPrompted) return;
    state.finalPrompted = true; state.phase = 'transmit'; state.score += 260;
    addEvidence(state.finalTarget, 'FINAL CARRIER VERIFIED');
    setObjective('DECIDE WHAT LEAVES THE RECEIVER', 7);
    const who = state.decision === 'RAVEN' ? 'RAVEN' : 'VESPER';
    const line = who === 'RAVEN'
      ? 'You were never assigned to Operation Night Glass. Your log proves you completed it. Decide which fact to transmit.'
      : 'Command confirms your log is empty. I can see every entry. Decide whether to send it anyway.';
    showCall(who, line, 'FINAL TRANSMISSION', {
      frequency: who === 'RAVEN' ? '141.12' : '140.85', corrupt: true,
      choices: [{ label: 'TRANSMIT LOG', value: 'TRANSMIT' }, { label: 'BURN EVIDENCE', value: 'BURN' }],
      onChoice(value) {
        state.ending = value === 'TRANSMIT'
          ? 'You transmitted the evidence. A second receiver answered in your own timing signature.'
          : 'You burned the evidence. The evidence was already included in the debrief.';
        finish(value);
      },
    });
  }

  function rankFor(score, ending) {
    if (ending === 'POWER') return ['CARDBOARD', 'CORRUGATED NON-COMPLIANCE'];
    if (score >= 1500 && state.alerts <= 1) return ['FOXHOUND', 'SILENT SPECTRUM OPERATIVE'];
    if (score >= 1250) return ['GECKO', 'TACTICAL FREQUENCY SPECIALIST'];
    if (score >= 950) return ['CAPYBARA', 'ACCEPTABLE LISTENING POSTURE'];
    return ['PIGEON', 'COMPROMISED BY LOCAL FAUNA'];
  }

  function finish(code) {
    if (state.complete) return;
    state.complete = true; state.active = false; state.phase = 'complete';
    document.body.classList.add('mission-complete');
    document.body.classList.remove('mission-caution', 'mission-alerted');
    LP.easter?.setBox?.(false, false); setSuspicion(0);
    const seconds = Math.floor(elapsed() / 1000);
    let total = state.score + state.evidence.length * 35 - state.alerts * 40 - Math.floor(seconds / 20);
    if (state.intercepted) total += 85;
    total = Math.max(0, total);
    const [rank, subtitle] = rankFor(total, code);
    const record = { rank, score: total, ending: code, seed: state.seed, at: new Date().toISOString() };
    LP.store.set('night-glass-record', record);
    if (!state.ending) state.ending = 'Operation complete. Command has classified the reason.';
    if (ui.debriefRank) ui.debriefRank.textContent = rank;
    if (ui.debriefSubtitle) ui.debriefSubtitle.textContent = subtitle;
    if (ui.debriefScore) ui.debriefScore.textContent = String(total).padStart(4, '0');
    if (ui.debriefTime) ui.debriefTime.textContent = stamp(elapsed());
    if (ui.debriefEvidence) ui.debriefEvidence.textContent = pad2(state.evidence.length);
    if (ui.debriefAlerts) ui.debriefAlerts.textContent = pad2(state.alerts);
    if (ui.debriefEnding) ui.debriefEnding.textContent = state.ending;
    if (ui.debriefSeed) ui.debriefSeed.textContent = `MISSION SEED ${state.seed} // REPORT TIMESTAMP ${new Date(LP.now() + 11000).toISOString().slice(11, 19)}Z`;
    LP.audio?.cue?.('complete');
    setObjective('OPERATION COMPLETE // REPORT FILED', 8);
    setTimeout(() => {
      LP.comms?.hide?.();
      if (ui.debrief) { ui.debrief.hidden = false; $('debrief-continue')?.focus(); }
    }, 850);
  }

  function contact(who) {
    if (!state.active) return;
    if (who === 'UNKNOWN' && !['decision', 'final', 'transmit'].includes(state.phase)) {
      showCall('???', 'NO CARRIER. THIS MEMORY SLOT HAS NOT HAPPENED YET.', 'MEMORY 03 LOCKED', { frequency: '---.--', corrupt: true }); return;
    }
    if (who === 'UNKNOWN') {
      showCall('???', state.phase === 'decision' ? 'You already know the question.' : 'The channel is open behind you.', 'MEMORY 03', { frequency: '---.--', corrupt: true }); return;
    }
    const lines = {
      acquire: who === 'VESPER' ? 'Find a stable line and hold it. The receiver rewards patience.' : 'Vesper calls patience a tactic because waiting was not in the budget.',
      lattice: who === 'VESPER' ? 'THE LATTICE is on SKY band near six-seven-two-seven.' : 'Its timing changed when you entered the room.',
      trace: who === 'VESPER' ? 'Hold position. That is an order.' : 'Move the dial. Make the watcher reveal itself.',
      evade: who === 'VESPER' ? 'Box. Stillness. Four seconds.' : 'The box is humiliating. That is why it works.',
      final: who === 'VESPER' ? 'Complete the marked acquisition.' : 'The last frequency is a choice disguised as an instruction.',
    };
    showCall(who, lines[state.phase] || 'The mission file is changing faster than I can read it.', `MEMORY ${who === 'VESPER' ? '01' : '02'}`, { frequency: who === 'RAVEN' ? '141.12' : '140.85' });
  }
  function openComms() { contact(state.decision === 'RAVEN' ? 'RAVEN' : 'VESPER'); }

  function onBox(on) {
    state.boxOn = !!on; state.boxAt = on ? performance.now() : 0;
    if (ui.boxStealth) ui.boxStealth.textContent = on ? 'CAMOUFLAGE INTEGRITY 00%' : 'CAMOUFLAGE INTEGRITY 00%';
    if (!state.active) return;
    if (on) {
      state.lastTune = performance.now();
      if (ui.tacticalState) ui.tacticalState.textContent = 'CAMOUFLAGED';
      if (ui.tacticalDetail) ui.tacticalDetail.textContent = 'PROBABLY A BOX';
      if (state.phase !== 'evade') showCall('RAVEN', 'You deployed the box without tactical need. Excellent initiative. Poor ventilation.', 'ITEM EQUIPPED', { frequency: '141.12' });
    } else if (state.phase === 'evade') {
      state.boxAt = 0; if (ui.tacticalState) ui.tacticalState.textContent = 'TRACE ACTIVE';
    }
  }

  function noteTune(from, to) {
    if (!state.active || state.complete || !Number.isFinite(from) || !Number.isFinite(to)) return;
    const now = performance.now(), delta = Math.abs(to - from);
    if (delta < 0.05) return;
    if (state.boxOn) { state.boxAt = now; setSuspicion(state.suspicion + Math.min(15, delta * 1.4)); }
    const rapid = now - state.lastTune < 260;
    if (delta > 0.7) {
      const tracing = state.phase === 'trace';
      const phaseGain = tracing ? 2.8 : state.phase === 'final' ? 0.18 : 0.08;
      const rapidGain = tracing && rapid ? 4 : state.phase === 'final' && rapid ? 1 : 0;
      setSuspicion(state.suspicion + Math.min(22, delta * phaseGain + rapidGain));
      if (state.phase === 'trace' && (now - state.lastTuneBurst > 240 || delta > 3.5)) {
        state.tuneBursts++; state.lastTuneBurst = now;
      }
    }
    state.lastTune = now;
    if (ui.radar) {
      const B = LP.band.BANDS[LP.rx.band];
      ui.radar.style.setProperty('--blip-x', `${18 + ((LP.rx.vfo - B.lo) / (B.hi - B.lo)) * 64}%`);
      ui.radar.style.setProperty('--blip-y', `${25 + LP.rx.band * 22}%`);
    }
  }
  function dialPanic(delta) {
    if (!state.active) return;
    setSuspicion(state.suspicion + Math.min(24, 7 + delta * (state.phase === 'trace' ? 2.4 : .7)));
  }

  function tick(dt, now) {
    if (!state.active || state.complete) return;
    const lock = LP.log?.lockedOn || null;
    if (lock !== state.lock) { state.lock = lock; state.lockAt = now; }
    const held = lock ? now - state.lockAt : 0;
    if (state.boxOn && now - state.lastTune > 180) setSuspicion(state.suspicion - dt * .028);
    else if (state.phase !== 'trace') setSuspicion(state.suspicion - dt * .0007);

    if (state.phase === 'acquire' && lock && held > 1300) firstAcquisition(lock);
    else if (state.phase === 'lattice' && lock === 'THE LATTICE' && held > 1600) latticeAcquired();
    else if (state.phase === 'trace') {
      if (state.tuneBursts >= 3 || state.suspicion >= 67 || now - state.phaseAt > 15000) beginEvade();
    } else if (state.phase === 'evade' && state.boxOn) {
      const still = Math.max(0, now - Math.max(state.boxAt, state.lastTune));
      if (ui.boxStealth) ui.boxStealth.textContent = `CAMOUFLAGE INTEGRITY ${String(Math.min(100, Math.floor(still / 40))).padStart(2, '0')}%`;
      if (still > 4000 && state.suspicion < 18) beginDecision();
    } else if (state.phase === 'final' && lock === state.finalTarget && held > 1800) finalAcquired();

    if (now - state.lastHud > 250) {
      state.lastHud = now;
      const t = stamp();
      if (ui.clock) ui.clock.textContent = t;
      if (ui.compactClock) ui.compactClock.textContent = t;
      if (ui.compactTags) ui.compactTags.textContent = pad2(state.evidence.length);
      if (ui.tacticalDetail && state.phase === 'acquire') ui.tacticalDetail.textContent = lock ? `LOCK ${lock}` : 'NO TRACE';
    }
  }

  addEventListener('lp:logged', (event) => {
    if (!state.active || !event.detail?.entry) return;
    const e = event.detail.entry;
    addEvidence(`LOG ${e.id}`, `${e.f ? e.f.toFixed(1) + ' KHZ' : 'NO FREQUENCY'} // RST ${e.rst || '--'}`);
  });
  $('debrief-continue')?.addEventListener('click', () => {
    if (ui.debrief) ui.debrief.hidden = true;
    document.body.classList.add('free-listen');
    setObjective('FREE LISTENING // COMMAND CHANNEL CLOSED', 0);
    $('dial')?.focus();
  });
  $('debrief-replay')?.addEventListener('click', () => location.reload());
  addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && ui.debrief && !ui.debrief.hidden) $('debrief-continue')?.click();
  });

  LP.ticker.add(tick);
  return {
    start, contact, openComms, onBox, noteTune, dialPanic, finish,
    get active() { return state.active && !state.complete; },
    get phase() { return state.phase; },
    get tags() { return state.evidence.length; },
    get state() { return state; },
  };
})();
