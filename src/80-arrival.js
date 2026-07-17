/* THE LISTENING POST — arrival. The glass is already alive when you walk
   in; the chassis lights come up around it. */
(() => {
  try {
    if (!LP.rm.matches) document.body.classList.add('arriving');

    LP.display.boot();

    /* the engine is alive: hand the controls over */
    document.querySelectorAll('button[disabled]').forEach(b => { b.disabled = false; });

    if (!LP.rm.matches) {
      setTimeout(() => document.body.classList.remove('arriving'), 900);
      /* first visit only: the operator's card is clipped to the rig, and the
         set glides the last nudge into the music — the dial teaches itself */
      if (!LP.store.get('visited', false)) {
        LP.store.set('visited', true);
        setTimeout(() => { if (LP.showCard) LP.showCard(true); }, 1200);
        const from = LP.rx.vfo - 9, to = LP.rx.vfo;
        const t0 = performance.now();
        const glide = () => {
          const p = Math.min(1, (performance.now() - t0) / 2600);
          LP.rx.vfo = from + (to - from) * (1 - Math.pow(1 - p, 3));
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
      LP.say(`A shortwave receiver, three bands. Arrow keys tune; 1, 2, 3 change band; L opens the station log. Currently ${LP.rx.vfo.toFixed(1)} kilohertz.`);
    }, 1400);
  } catch (err) {
    console.error(err);
    const p = document.createElement('p');
    p.style.cssText = 'position:fixed;inset:auto 0 40px 0;text-align:center;color:#9aa39c;font:15px Georgia,serif;letter-spacing:.14em;';
    p.textContent = 'The receiver failed to start. A shortwave set lives here — try a newer browser.';
    document.body.appendChild(p);
  }
})();
