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
