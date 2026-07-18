/* THE LISTENING POST — arrival. The glass is already alive when you walk
   in; the chassis lights come up around it. */
(() => {
  try {
    if (!LP.rm.matches) document.body.classList.add('arriving');

    LP.display.boot();
    const landing = LP.rx.vfo; /* where the set settles — captured before any glide rewinds the dial */

    /* the engine is alive: hand the controls over */
    document.querySelectorAll('button[disabled]').forEach(b => { b.disabled = false; });

    if (!LP.rm.matches) setTimeout(() => document.body.classList.remove('arriving'), 900);

    /* first visit: the title screen now carries onboarding; the set still glides
       the last nudge into the music, so the dial teaches itself */
    if (!LP.store.get('visited', false)) {
      LP.store.set('visited', true);
      if (!LP.rm.matches) {
        const from = LP.rx.vfo - 9, to = LP.rx.vfo;
        const t0 = performance.now();
        let lastSet = from;
        const glide = () => {
          if (Math.abs(LP.rx.vfo - lastSet) > 0.001) return false; /* the visitor took the dial: theirs */
          const p = Math.min(1, (performance.now() - t0) / 2600);
          lastSet = from + (to - from) * (1 - Math.pow(1 - p, 3));
          LP.rx.vfo = lastSet;
          if (LP.display.invalidateRow) LP.display.invalidateRow();
          if (p < 1) return; /* stay in the ticker till landed */
          LP.rx.dwellT0 = performance.now();
          if (LP.reflectDial) LP.reflectDial();
          return false;
        };
        LP.rx.vfo = from;
        LP.ticker.add(glide);
      }
    }

    setTimeout(() => {
      LP.say(`A shortwave receiver, three bands. Arrow keys tune; 1, 2, 3 change band; L opens the station log. Currently ${landing.toFixed(1)} kilohertz.`);
    }, 1400);

    /* installable: the set becomes a bedside object. https only — file: and
       exotic contexts just stay a page, silently. */
    if ('serviceWorker' in navigator && location.protocol === 'https:') {
      navigator.serviceWorker.register('./sw.js').catch(() => { });
    }

    /* ---- the workshop door: ?dev exposes a clock you can turn ---- */
    /* Night-only stations, storm nights, echo nights — none of it is
       humanly testable at 2 PM without this. Real listeners never see it. */
    if (/[?&]dev\b/.test(location.search)) {
      const bar = document.createElement('div');
      bar.className = 'devbar';
      bar.innerHTML = '<label>WARP <input id="dev-warp" type="range" min="-1440" max="1440" step="5" value="0" aria-label="Clock warp, minutes"></label>'
        + '<span id="dev-clock"></span><span id="dev-flags"></span>';
      document.body.appendChild(bar);
      const warp = bar.querySelector('#dev-warp');
      const clock = bar.querySelector('#dev-clock');
      const flags = bar.querySelector('#dev-flags');
      const p2 = (n) => String(n).padStart(2, '0');
      const reflect = () => {
        LP.warp = warp.value * 60000;
        const d = LP.date(), t = LP.now(), B = LP.band;
        const on = (id) => { const s = B.stations.find(x => x.id === id); return s && (!s.isOn || s.isOn()); };
        clock.textContent = ` ${p2(d.getHours())}:${p2(d.getMinutes())} `;
        flags.textContent = [
          'K' + B.weather.k(),
          B.weather.sid(t) > 0 ? 'SID' : '',
          B.weather.esOpen(t) ? 'Es' : '',
          B.jammerToday() ? 'JAM' : '',
          B.lde.night() ? 'LDE' : '',
          on('THE CROSSING') ? 'XING' : '',
          on('HOMECOMING') ? 'HOME' : '',
          B.stations.some(s => s.type === 'pips' && s.failNight()) ? 'PIPFAIL' : '',
        ].filter(Boolean).join(' ');
        if (LP.display.invalidateRow) LP.display.invalidateRow();
        LP.ticker.kick();
      };
      warp.addEventListener('input', reflect);
      setInterval(reflect, 2000);
      reflect();
    }
  } catch (err) {
    console.error(err);
    const p = document.createElement('p');
    p.style.cssText = 'position:fixed;inset:auto 0 40px 0;text-align:center;color:#9aa39c;font:15px Georgia,serif;letter-spacing:.14em;';
    p.textContent = 'The receiver failed to start. A shortwave set lives here — try a newer browser.';
    document.body.appendChild(p);
  }
})();
