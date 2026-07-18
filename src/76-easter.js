'use strict';
/* NIGHT GLASS — unnecessary tactical systems. Every serious system deserves a silly edge case. */
(() => {
  const box = document.getElementById('box-toggle');
  const alertState = document.getElementById('alert-state');
  const alertCard = document.getElementById('mission-alert');
  const tags = document.getElementById('tag-count');
  const splat = document.getElementById('screen-splat');
  const title = document.querySelector('.masthead h1');
  const release = document.getElementById('box-release');
  let boxOn = false, titleTaps = 0, lastVfo = 0, alertUntil = 0, lastActivity = performance.now(), idleCall = false;

  function call(who, line, state = 'PRIORITY CALL') {
    if (LP.comms) LP.comms.show([who, line], state);
  }
  function setAlert(text = 'ALERT', ms = 1900) {
    alertState.textContent = text;
    alertState.classList.add('hot');
    alertCard.querySelector('span').textContent = text;
    alertCard.classList.add('on');
    alertUntil = performance.now() + ms;
  }
  function clearAlert() {
    alertState.textContent = 'NORMAL'; alertState.classList.remove('hot'); alertCard.classList.remove('on');
  }

  function setBox(next, announce = true) {
    boxOn = !!next; document.body.classList.toggle('box-mode', boxOn);
    box.setAttribute('aria-pressed', String(boxOn)); box.textContent = boxOn ? 'Unbox' : 'Box';
    LP.audio?.setMissionMuffle?.(boxOn);
    dispatchEvent(new CustomEvent('lp:box', { detail: { on: boxOn } }));
    if (LP.mission && LP.mission.active) LP.mission.onBox(boxOn);
    else if (announce) call(boxOn ? 'RAVEN' : 'VESPER', boxOn
        ? 'Perfect camouflage. Remain absolutely still. The radio cabinet has never seen a cardboard box before.'
        : 'You abandoned the box. Command has recorded a catastrophic loss of corrugated assets.', 'ITEM EQUIPPED');
  }
  if (box) box.addEventListener('click', () => setBox(!boxOn));
  if (release) release.addEventListener('click', () => setBox(false));

  if (title) title.addEventListener('click', () => {
    titleTaps++;
    if (titleTaps === 3) call('VESPER', 'Stop tapping the operation title. It is laminated, not interactive.', 'DISCIPLINARY CALL');
    if (titleTaps === 6) {
      document.body.classList.toggle('deep-fried');
      call('???', 'DISPLAY DRIVER DEFEATED. THE PIXELS ARE NOW OPERATING WITHOUT SUPERVISION.', 'PACKET FAILED SUCCESSFULLY');
      titleTaps = 0;
    }
  });

  const secret = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let secretAt = 0;
  addEventListener('keydown', e => {
    lastActivity = performance.now();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    secretAt = key === secret[secretAt] ? secretAt + 1 : (key === secret[0] ? 1 : 0);
    if (secretAt === secret.length) {
      secretAt = 0; document.body.classList.toggle('vr-party');
      call('RAVEN', 'Training mode unlocked. There is no training mode. The colors changed, though, so the budget was approved.', 'VR SIMULATION(?)');
    }
  });
  for (const event of ['pointerdown','wheel','touchstart']) addEventListener(event, () => { lastActivity = performance.now(); }, { passive:true });

  /* A tiny gull. Clicking it is discouraged by every department except the Easter egg department. */
  const gull = document.createElement('button');
  gull.className = 'pixel-gull'; gull.type = 'button'; gull.setAttribute('aria-label', 'Suspicious pixel bird'); gull.textContent = '<v';
  document.body.appendChild(gull);
  gull.addEventListener('click', () => {
    gull.classList.remove('fly'); splat.classList.add('on'); setAlert('BIRD CONTACT', 2600);
    call('VESPER', 'You made direct contact with local wildlife. Your screen has received the consequences.', 'FAUNA INCIDENT');
    setTimeout(() => splat.classList.remove('on'), 7000);
  });
  setTimeout(() => gull.classList.add('fly'), 12000);

  LP.ticker.add(() => {
    if (!LP.rx) return;
    const now = performance.now(), v = LP.rx.vfo;
    if (lastVfo && Math.abs(v - lastVfo) > 3.5 && now > alertUntil) {
      if (LP.mission && LP.mission.active) LP.mission.dialPanic(Math.abs(v - lastVfo));
      else setAlert('DIAL PANIC');
    }
    lastVfo = v;
    if ((!LP.mission || !LP.mission.active) && alertUntil && now > alertUntil) { alertUntil = 0; clearAlert(); }
    if (LP.log && tags) {
      const count = LP.mission && LP.mission.active ? LP.mission.tags : new Set(LP.log.entries.map(x => x.id)).size;
      tags.textContent = String(count).padStart(2, '0');
    }
    if (!idleCall && LP.engaged && now - lastActivity > 45000) {
      idleCall = true;
      call('???', 'You have been staring at static for forty-five seconds. Excellent. The simulation says you are ready for management.', 'WELLNESS CHECK');
    }
  });
  LP.easter = { setBox, setAlert, clearAlert, get boxOn() { return boxOn; } };
})();
