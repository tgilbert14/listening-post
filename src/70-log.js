/* THE LISTENING POST — the station log. Hold a signal and it gets pencilled
   in; the book survives the night. Log enough of the band and, once, every
   station keys the same three characters at the same moment — the net
   acknowledging a new listener. */
LP.log = (() => {
  const entries = LP.store.get('log', []);
  const list = document.getElementById('log-list');
  const seen = new Set(entries.map(e => e.id));
  let netDone = LP.store.get('net', false);
  let lockedOn = null, lockT0 = 0, lastActive = 0;

  function has(id) { return seen.has(id); }

  function add(id, f, note, cls) {
    if (seen.has(id)) return;
    seen.add(id);
    const d = new Date();
    entries.push({ id, f, note, at: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, cls: cls || '' });
    LP.store.set('log', entries);
    LP.say(`Logged: ${id}, ${f ? f.toFixed(1) + ' kilohertz' : 'frequency unknown'}.`);
    render();
    maybeNet();
  }

  function render() {
    if (!list) return;
    list.textContent = '';
    if (!entries.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'nothing pencilled in yet — hold a signal';
      list.appendChild(li);
      return;
    }
    for (const e of entries) {
      const li = document.createElement('li');
      if (e.cls) li.className = e.cls;
      const id = document.createElement('span'); id.className = 'id'; id.textContent = e.id;
      const f = document.createElement('span'); f.className = 'f'; f.textContent = e.f ? `${e.f.toFixed(1)} · ${e.at}` : e.at;
      const note = document.createElement('span'); note.className = 'note'; note.textContent = e.note;
      li.append(id, f, note);
      list.appendChild(li);
    }
  }

  /* the net: seven names in the book and the band answers, once */
  function maybeNet() {
    if (netDone) return;
    const core = entries.filter(e => e.id !== 'ALL STATIONS').length;
    if (core >= 7) {
      netDone = true;
      LP.store.set('net', true);
      LP.band.net.until = Date.now() + 26000;
      setTimeout(() => {
        add('ALL STATIONS', 0, 'the net acknowledged you', 'net');
      }, 9000);
    }
  }

  /* lock detection: near a station's carrier, signal present, held ~4s */
  function check(t) {
    let candidate = null;
    for (const st of LP.band.stations) {
      if (st.band !== LP.rx.band) continue;
      if (st.type === 'night' && !st.isOn()) continue;
      const off = Math.abs(LP.rx.vfo - st.f);
      if (off < Math.max(st.bw * 0.9, 0.4)) { candidate = st; break; }
    }
    if (candidate && candidate.activity(t) > 0.05) lastActive = t;
    if (candidate && (candidate.id === (lockedOn && lockedOn.id))) {
      if (t - lockT0 > 4200 && t - lastActive < 3000) add(candidate.id, candidate.f, candidate.note);
    } else {
      lockedOn = candidate;
      lockT0 = t;
    }

    /* the ghost is logged the moment it asks its question at your ear */
    const gh = LP.band.ghost;
    if (gh.state === 'asking' && Math.abs(LP.rx.vfo - gh.f) < 0.4) {
      add('THE OTHER', gh.f, 'it asked who was there', 'net');
      gh.heard = true;
    }
    LP.log.lockedOn = candidate ? candidate.id : null;
  }

  render();
  return { has, add, check, render, get lockedOn() { return lockedOn && lockedOn.id; }, set lockedOn(v) { }, entries };
})();
