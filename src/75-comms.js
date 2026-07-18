'use strict';
/* THE LISTENING POST — secure comms. Fiction wrapped around the real receiver. */
(() => {
  const panel = document.getElementById('codec');
  const toggle = document.getElementById('codec-toggle');
  const close = document.getElementById('codec-close');
  const msg = document.getElementById('codec-message');
  const speaker = document.getElementById('codec-title');
  const status = document.getElementById('codec-status');
  if (!panel || !toggle || !close) return;

  const calls = {
    'THE LATTICE': ['VESPER', 'That sequence is structured, not random. Copy every group exactly. The key changes with the date.'],
    'THE FORECAST': ['VESPER', 'Machine traffic acquired. Shift is one-seven-zero hertz. The message describes places that do not officially exist.'],
    'AURORA': ['RAVEN', 'Music, through two thousand miles of ionosphere. Someone chose that record for a listener they cannot see.'],
    'POSTCARD': ['VESPER', 'Image carrier. Stay on frequency until the final scan line. Bad tuning will scar the picture.'],
    'WEFAX': ['VESPER', 'Weather facsimile. Hold position and let the chart develop. The pressure systems are tied to today’s sky.'],
    'HOMECOMING': ['RAVEN', 'Eleven tones. Night traffic only. I have heard them before, but never from the same direction.'],
    'THE CROSSING': ['RAVEN', 'A bell at six-six-six-zero. Do not chase it. Log the time and listen for what follows.'],
    'THE PIPS': ['VESPER', 'Time reference confirmed. Five short, one long. Use it to measure everything else that drifts.']
  };
  const intro = ['VESPER', 'The receiver is live. Sweep the band, acquire a carrier, and hold it steady. Every transmission is happening now.'];
  const nuisance = [
    ['VESPER', 'You called to ask if the COMMS button works. It works. End transmission.'],
    ['RAVEN', 'I am hiding inside a radio cabinet. It is a highly advanced cabinet.'],
    ['VESPER', 'Mission update: the frequency is still a number. Intelligence is analyzing this development.'],
    ['RAVEN', 'Do not eat the tuning knob. This instruction was added after an incident.'],
    ['???', 'A waveform dreams of being a rectangle. A rectangle dreams of being a cardboard box.'],
    ['VESPER', 'You have contacted me six times without changing frequency. I have logged this as a tactical decision.']
  ];
  let previousFocus = null, lastLock = null;
  let manualCalls = 0;
  const heard = new Set();

  function chirp() {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ac = new C(), gain = ac.createGain(), osc = ac.createOscillator();
      osc.type = 'square'; osc.frequency.setValueAtTime(880, ac.currentTime); osc.frequency.exponentialRampToValueAtTime(440, ac.currentTime + .11);
      gain.gain.setValueAtTime(.0001, ac.currentTime); gain.gain.exponentialRampToValueAtTime(.055, ac.currentTime + .01); gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .15);
      osc.connect(gain).connect(ac.destination); osc.start(); osc.stop(ac.currentTime + .16); osc.onended = () => ac.close();
    } catch { /* visual alert still works */ }
  }
  function show(data = intro, state = 'CONNECTED') {
    previousFocus = document.activeElement;
    speaker.textContent = data[0]; msg.textContent = data[1]; status.textContent = state;
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    chirp(); requestAnimationFrame(() => close.focus());
    LP.say(`Secure call from ${data[0]}. ${data[1]}`);
  }
  function hide() {
    if (panel.hidden) return;
    panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
    if (previousFocus && previousFocus.focus) previousFocus.focus(); else toggle.focus();
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return hide();
    const data = manualCalls ? nuisance[Math.min(manualCalls - 1, nuisance.length - 1)] : intro;
    manualCalls++;
    show(data, manualCalls > 1 ? 'UNSOLICITED ADVICE' : 'CONNECTED');
  });
  close.addEventListener('click', hide);
  panel.addEventListener('click', e => { if (e.target === panel) hide(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); hide(); } });

  LP.ticker.add(() => {
    if (!LP.log) return;
    const lock = LP.log.lockedOn;
    if (lock !== lastLock) {
      lastLock = lock;
      if (lock && calls[lock] && !heard.has(lock)) {
        heard.add(lock);
        setTimeout(() => { if (document.hidden || !panel.hidden) return; show(calls[lock], 'SIGNAL ACQUIRED'); }, 650);
      }
    }
  });
  LP.comms = { show, hide, calls };
})();
