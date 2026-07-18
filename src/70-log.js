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
      date: typeof e.date === 'string' ? e.date : '',
    }));
  const list = document.getElementById('log-list');
  const seen = new Set(entries.map(e => e.id));
  let netDone = LP.store.get('net', false);
  let lockedOn = null, lockT0 = 0, lastActive = 0, prevLock = null;
  const pendingPic = {};   /* pictures that finished before their line existed, by id */

  function has(id) { return seen.has(id); }
  const bandName = () => LP.band.BANDS[LP.rx.band].name;
  const pad2 = (n) => String(n).padStart(2, '0');

  /* the signal report, in the operator's shorthand: R(1-5) S(1-9), and for a
     pure CW tone a T(9). Computed from what the set is actually hearing. */
  function reportFor(id, t) {
    const st = LP.band.stations.find(s => s.id === id);
    if (!st) return '';
    const off = Math.abs(LP.rx.vfo - st.f);
    const sel = LP.selectivity(off, st.bw);
    const s = LP.clamp(Math.round(1 + LP.band.strength(st, t) * sel * 8), 1, 9);
    /* readability suffers on rough nights: storms and flares cost a point.
       THE CONSTANT ignores the weather like it ignores everything else. */
    const wx = st.type === 'constant' && LP.band.present() ? 0
      : (LP.band.weather.k() >= 6 ? 1 : 0) + (LP.band.weather.sid(t) > 0.3 ? 1 : 0);
    const r = LP.clamp(Math.round(2 + sel * 3 - wx), 1, 5);
    const cw = st.type === 'beacon' || st.type === 'crossing' || st.type === 'constant';
    return cw ? `${r}${s}9` : `${r}${s}`;
  }

  function store() { LP.store.set('log', entries); }

  function add(id, f, note, cls, report) {
    if (seen.has(id)) return;
    seen.add(id);
    const d = LP.date();
    const e = {
      id, f, band: bandName(), note: note || '',
      at: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
      utc: `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`,
      rst: report || '', cls: cls || '', pic: '',
      date: `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`,
    };
    if (navigator.vibrate) navigator.vibrate(12); /* the pencil lands */
    if (pendingPic[id]) { e.pic = pendingPic[id].url; if (pendingPic[id].caption) e.note = pendingPic[id].caption; delete pendingPic[id]; }
    entries.push(e);
    store();
    LP.say(`Logged: ${id}${f ? ', ' + f.toFixed(1) + ' kilohertz' : ''}${report ? ', report ' + report.split('').join(' ') : ''}.`);
    render();
    maybeNet();
    dispatchEvent(new CustomEvent('lp:logged', { detail: { entry: e } }));
  }

  /* pin a finished picture to its line — the last postcard OR weather chart
     you sat with long enough to receive whole. Keyed by station id. */
  function attachPicture(url, caption, id = 'POSTCARD') {
    const e = entries.find(x => x.id === id);
    if (e) { e.pic = url; if (caption) e.note = caption; store(); render(); }
    else pendingPic[id] = { url, caption };  /* the line will get it when it's logged */
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
      /* the log is a map: a line with a frequency retunes the set */
      if (e.f) {
        li.tabIndex = 0;
        li.setAttribute('role', 'button');
        li.setAttribute('aria-label', `Retune to ${e.id}, ${e.f.toFixed(1)} kilohertz, ${e.band} band.`);
        li.classList.add('jump');
        const go = () => {
          const bi = LP.band.BANDS.findIndex(b => b.name === e.band);
          if (bi >= 0 && bi !== LP.rx.band && LP.setBand) LP.setBand(bi);
          LP.tuneTo(e.f, true);
          LP.say(`Retuned to ${e.id}, ${e.f.toFixed(1)} kilohertz.`);
        };
        li.addEventListener('click', go);
        /* the ARIA button pattern activates on BOTH Enter and Space */
        li.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
      }
      list.appendChild(li);
    }
  }

  /* ---------- keepsakes: the log leaves the building ---------- */
  function download(name, url, revoke) {
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    if (revoke) setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  /* ADIF — the real amateur-log interchange format; any ham logger opens it */
  function exportAdif() {
    const field = (k, v) => `<${k}:${String(v).length}>${v}`;
    const d = LP.date();
    const today = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}`;
    let out = 'The Listening Post station log\n<ADIF_VER:5>3.1.4<PROGRAMID:18>THE LISTENING POST<EOH>\n';
    for (const e of entries) {
      if (!e.f) continue;
      out += [
        field('CALL', e.id.replace(/[^A-Z0-9/]/gi, '') || 'UNKNOWN'),
        field('QSO_DATE', e.date || today),
        field('TIME_ON', (e.utc || '0000').replace(/[:Z]/g, '').padStart(4, '0')),
        field('FREQ', (e.f / 1000).toFixed(4)),
        field('MODE', (e.rst || '').length === 3 ? 'CW' : 'AM'),
        field('RST_RCVD', e.rst || '599'),
        field('COMMENT', e.note || ''),
        '<EOR>',
      ].join('') + '\n';
    }
    download('listening-post.adi', URL.createObjectURL(new Blob([out], { type: 'text/plain' })), true);
    LP.say('Log exported as ADIF.');
  }
  /* a QSL card: the night, pressed onto card stock */
  function exportQsl() {
    const W = 880, H = 560;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.fillStyle = '#e7dfc9'; x.fillRect(0, 0, W, H);
    x.strokeStyle = 'rgba(88,80,60,.14)';
    for (let y = 120; y < H - 70; y += 36) { x.beginPath(); x.moveTo(44, y + 24.5); x.lineTo(W - 44, y + 24.5); x.stroke(); }
    x.fillStyle = '#4a5a4e';
    x.font = '600 34px Georgia, serif';
    x.fillText('THE LISTENING POST', 44, 62);
    x.fillRect(44, 76, W - 88, 3);
    x.font = 'italic 15px Georgia, serif'; x.fillStyle = '#6a746c';
    x.textAlign = 'right';
    const d = LP.date();
    x.fillText(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} · heard on a desert receiver`, W - 44, 62);
    x.textAlign = 'left';
    x.font = '17px Consolas, monospace';
    let y = 144;
    for (const e of entries.filter(v => v.id !== 'ALL STATIONS').slice(0, 10)) {
      x.fillStyle = '#2c3230';
      x.fillText(e.id.padEnd(14).slice(0, 14), 44, y);
      x.fillStyle = '#7a3d2c';
      x.fillText(e.f ? `${e.f.toFixed(1)} kHz` : '—', 300, y);
      x.fillStyle = '#4a5a4e';
      x.fillText(`${e.band || ''}  ${e.utc || ''}  ${e.rst ? 'RST ' + e.rst : ''}`, 470, y);
      y += 36;
    }
    x.font = 'italic 16px Georgia, serif'; x.fillStyle = '#6a746c';
    x.textAlign = 'right';
    x.fillText('73 — the band is open · desertdatalabs.com', W - 44, H - 40);
    download('listening-post-qsl.png', c.toDataURL('image/png'));
    LP.say('QSL card saved.');
  }
  const adifBtn = document.getElementById('log-adif');
  const qslBtn = document.getElementById('log-qsl');
  if (adifBtn) adifBtn.addEventListener('click', exportAdif);
  if (qslBtn) qslBtn.addEventListener('click', exportQsl);

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

  /* it asked who was there. ONCE. A visitor it has already met is never
     stalked again — the book remembers, so the band remembers. */
  if (seen.has('THE OTHER')) LP.band.ghost.state = 'gone';

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

    /* releasing a lock can leave an echo on the right nights */
    const cur = (candidate && t - lastActive < 3000) ? candidate : null;
    if (prevLock && prevLock !== cur) LP.band.lde.depart(prevLock, t);
    prevLock = cur;

    /* THE WARNING quietly amends its own line for whoever stayed to copy
       the hourly tail. Nothing is announced. The book just changes. */
    if (cur && cur.id === 'THE WARNING' && cur.tailActive && cur.tailActive(t)) {
      const e = entries.find(x => x.id === 'THE WARNING');
      if (e && e.note !== 'it is not asking for help') {
        e.note = 'it is not asking for help';
        store(); render();
      }
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
    /* how far along the pencil is: 0..1 across the hold that logs a NEW station */
    get lockProgress() {
      if (!lockedOn || seen.has(lockedOn.id) || lastCheckT - lastActive >= 3000) return 0;
      return LP.clamp((lastCheckT - lockT0) / 4200, 0, 1);
    },
  };
})();
