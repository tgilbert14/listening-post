'use strict';
/* THE LISTENING POST — secure comms. Fiction wrapped around the real receiver. */
(() => {
  const panel = document.getElementById('codec');
  const toggle = document.getElementById('codec-toggle');
  const close = document.getElementById('codec-close');
  const msg = document.getElementById('codec-message');
  const speaker = document.getElementById('codec-title');
  const status = document.getElementById('codec-status');
  const frequency = document.getElementById('codec-frequency');
  const choices = document.getElementById('codec-choices');
  const portraits = panel ? panel.querySelectorAll('.codec-portrait') : [];
  const contactButtons = panel ? panel.querySelectorAll('[data-codec-contact]') : [];
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
    /* Reuse the receiver bus. A fresh AudioContext here would violate Chrome's
       autoplay policy when a delayed signal-acquired call arrives. */
    LP.audio?.cue?.('codec');
  }
  function show(data = intro, state = 'CONNECTED', options = {}) {
    previousFocus = document.activeElement;
    speaker.textContent = data[0]; msg.textContent = data[1]; status.textContent = state;
    if (frequency) frequency.textContent = options.frequency || (data[0] === 'RAVEN' ? '141.12' : data[0] === '???' ? '---.--' : '140.85');
    panel.classList.toggle('corrupted-call', !!options.corrupt);
    portraits.forEach(p => p.classList.toggle('speaking', p.querySelector('span')?.textContent === data[0]));
    if (choices) {
      choices.textContent = '';
      for (const choice of options.choices || []) {
        const button = document.createElement('button');
        const item = typeof choice === 'string' ? { label: choice, value: choice } : choice;
        button.type = 'button'; button.textContent = item.label; button.dataset.value = item.value || item.label;
        button.addEventListener('click', () => {
          const value = button.dataset.value;
          LP.audio?.cue?.('choice');
          if (item.close !== false) hide();
          if (options.onChoice) options.onChoice(value, item);
          dispatchEvent(new CustomEvent('lp:codec-choice', { detail: { value, speaker: data[0], state } }));
        });
        choices.appendChild(button);
      }
    }
    panel.hidden = false; toggle.setAttribute('aria-expanded', 'true');
    chirp(); requestAnimationFrame(() => (choices && choices.firstElementChild ? choices.firstElementChild : close).focus());
    LP.say(`Secure call from ${data[0]}. ${data[1]}`);
  }
  function hide() {
    if (panel.hidden) return;
    panel.hidden = true; toggle.setAttribute('aria-expanded', 'false');
    panel.classList.remove('corrupted-call');
    if (previousFocus && previousFocus.focus) previousFocus.focus(); else toggle.focus();
  }
  toggle.addEventListener('click', () => {
    if (!panel.hidden) return hide();
    if (LP.mission && LP.mission.active) { LP.mission.openComms(); return; }
    const data = manualCalls ? nuisance[Math.min(manualCalls - 1, nuisance.length - 1)] : intro;
    manualCalls++;
    show(data, manualCalls > 1 ? 'UNSOLICITED ADVICE' : 'CONNECTED');
  });
  close.addEventListener('click', hide);
  panel.addEventListener('click', e => { if (e.target === panel) hide(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { e.preventDefault(); hide(); } });

  contactButtons.forEach(button => button.addEventListener('click', () => {
    const contact = button.dataset.codecContact;
    if (LP.mission && LP.mission.active) LP.mission.contact(contact);
    else if (contact === 'VESPER') show(intro, 'MEMORY 01');
    else if (contact === 'RAVEN') show(['RAVEN', 'This is Raven. I am in a radio cabinet. The cabinet has excellent operational acoustics.'], 'MEMORY 02', { frequency: '141.12' });
    else show(['???', 'NO CARRIER. THE EMPTY MEMORY IS STILL LISTENING.'], 'MEMORY 03', { frequency: '---.--', corrupt: true });
  }));

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
  LP.comms = { show, hide, calls, get open() { return !panel.hidden; } };
})();
