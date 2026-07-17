/* THE LISTENING POST — the station log, kept the way an operator keeps one:
   UTC time, frequency, band, and a signal report in RST. Hold a signal and it
   gets pencilled in; a finished postcard is pinned to its line. The book
   survives the night. Log enough of the band and, once, every station keys
   the same three characters at the same moment — the net, acknowledging a new
   listener. */
LP.log = (() => {
  /* one poisoned localStorage entry must never kill the receiver */
  const raw = LP.store.get('log', []);
  const entries = (Array.isArray(raw) ? raw : [])
    .filter(e => e && typeof e.id === 'string')
    .map(e => ({
      id: e.id,
      f: Number.isFinite(Number(e.f)) ? Number(e.f) : 0,
      band: typeof e.band === 'string' ? e.band : '',
      note: typeof e.note === 'string' ? e.note : '',
      at: typeof e.at === 'string' ? e.at : '',
      utc: typeof e.utc === 'string' ? e.utc : '',
      rst: typeof e.rst === 'string' ? e.rst : '',
      cls: typeof e.cls === 'string' ? e.cls : '',
      pic: typeof e.pic === 'string' ? e.pic : '',
    }));
  const list = document.getElementById('log-list');
  const seen = new Set(entries.map(e => e.id));
  let netDone = LP.store.get('net', false);
  let lockedOn = null, lockT0 = 0, lastActive = 0;
  let pendingPic = null;   /* a postcard that finished before its line existed */

  function has(id) { return seen.has(id); }
  const bandName = () => LP.band.BANDS[LP.rx.band].name;
  const pad2 = (n) => String(n).padStart(2, '0');

  /* the signal report, in the operator's shorthand: R(1-5) S(1-9), and for a
     pure CW tone a T(9). Computed from what the set is actually hearing. */
  function reportFor(id, t) {
    const st = LP.band.stations.find(s => s.id === id);
    if (!st) return '';
    const off = Math.abs(LP.rx.vfo - st.f);
    const sel = Math.exp(-(off * off) / (2 * Math.pow(Math.max(st.bw, 0.35) * 0.9, 2)));
    const s = LP.clamp(Math.round(1 + LP.band.strength(st, t) * sel * 8), 1, 9);
    const r = LP.clamp(Math.round(2 + sel * 3), 1, 5);
    const cw = st.type === 'beacon' || st.type === 'crossing';
    return cw ? `${r}${s}9` : `${r}${s}`;
  }

  function store() { LP.store.set('log', entries); }

  function add(id, f, note, cls, report) {
    if (seen.has(id)) return;
    seen.add(id);
    const d = new Date();
    const e = {
      id, f, band: bandName(), note: note || '',
      at: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      utc: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`,
      rst: report || '', cls: cls || '', pic: '',
    };
    if (pendingPic && id === 'POSTCARD') { e.pic = pendingPic.url; if (pendingPic.caption) e.note = pendingPic.caption; pendingPic = null; }
    entries.push(e);
    store();
    LP.say(`Logged: ${id}${f ? ', ' + f.toFixed(1) + ' kilohertz' : ''}${report ? ', report ' + report.split('').join(' ') : ''}.`);
    render();
    maybeNet();
  }

  /* pin the finished postcard to its line — your keepsake is the last picture
     you sat with long enough to receive whole */
  function attachPicture(url, caption) {
    const e = entries.find(x => x.id === 'POSTCARD');
    if (e) { e.pic = url; if (caption) e.note = caption; store(); render(); }
    else pendingPic = { url, caption };  /* the line will get it when it's logged */
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
      const f = document.createElement('span'); f.className = 'f';
      f.textContent = e.f ? `${e.f.toFixed(1)}${e.band ? ' · ' + e.band : ''}` : (e.band || '');
      const meta = document.createElement('span'); meta.className = 'meta';
      const bits = [];
      if (e.utc) bits.push(e.utc); else if (e.at) bits.push(e.at);
      if (e.rst) bits.push('RST ' + e.rst);
      meta.textContent = bits.join('  ·  ');
      const note = document.createElement('span'); note.className = 'note'; note.textContent = e.note;
      li.append(id, f, meta, note);
      if (e.pic) {
        const img = document.createElement('img');
        img.className = 'pic'; img.loading = 'lazy'; img.src = e.pic;
        img.alt = `The received postcard: ${e.note || 'a picture'}.`;
        li.appendChild(img);
      }
      list.appendChild(li);
    }
  }

  /* the net: seven names in the book and the band answers — once, from the top */
  function maybeNet() {
    if (netDone) return;
    const core = entries.filter(e => e.id !== 'ALL STATIONS').length;
    if (core >= 7) {
      netDone = true;
      LP.store.set('net', true);
      LP.band.net.arm();
      setTimeout(() => {
        add('ALL STATIONS', 0, 'the net acknowledged you', 'net');
      }, 9000);
    }
  }
  /* a reload inside the 9s window must not eat the capstone entry */
  if (netDone && !seen.has('ALL STATIONS')) add('ALL STATIONS', 0, 'the net acknowledged you', 'net');

  /* lock detection: near a station's carrier, signal present, held ~4s */
  function check(t) {
    let candidate = null;
    for (const st of LP.band.stations) {
      if (st.band !== LP.rx.band) continue;
      if (st.isOn && !st.isOn()) continue;
      const off = Math.abs(LP.rx.vfo - st.f);
      if (off < Math.max(st.bw * 0.9, 0.4)) { candidate = st; break; }
    }
    if (candidate && candidate.activity(t) > 0.05) lastActive = t;
    if (candidate && (candidate.id === (lockedOn && lockedOn.id))) {
      if (t - lockT0 > 4200 && t - lastActive < 3000) add(candidate.id, candidate.f, candidate.note, '', reportFor(candidate.id, t));
    } else {
      lockedOn = candidate;
      lockT0 = t;
    }

    /* the ghost is logged the moment it asks its question at your ear */
    const gh = LP.band.ghost;
    if (gh.state === 'asking' && Math.abs(LP.rx.vfo - gh.f) < 0.4) {
      add('THE OTHER', gh.f, 'it asked who was there', 'net');
    }
    lastCheckT = t;
  }

  let lastCheckT = 0;
  render();
  return {
    has, add, check, render, attachPicture, entries,
    /* the lock light means SIGNAL, not proximity: a station in its dead
       window doesn't light the readout */
    get lockedOn() { return (lockedOn && lastCheckT - lastActive < 3000) ? lockedOn.id : null; },
  };
})();
