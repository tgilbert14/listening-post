'use strict';
/* NIGHT GLASS — the cover is part of the fiction, not a brochure before it. */
(() => {
  const screen = document.getElementById('title-screen');
  const start = document.getElementById('mission-start');
  const intercept = document.getElementById('title-intercept');
  const recordLine = document.getElementById('title-record');
  if (!screen || !start) return;

  const record = LP.store.get('night-glass-record', null);
  if (record && recordLine) {
    recordLine.textContent = `LAST OPERATION // ${record.rank || 'UNRANKED'} // ${String(record.score || 0).padStart(4, '0')} PTS // THE FILE CLAIMS THIS WAS YOUR FIRST ATTEMPT`;
    start.firstChild.textContent = 'REPLAY MISSION ';
  }
  setTimeout(() => { if (!screen.hidden) screen.classList.add('incoming'); }, 2400);

  function startMission(intercepted = false) {
    if (screen.classList.contains('departing')) return;
    document.body.classList.add('mission-started');
    screen.classList.add('departing');
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      const ac = new C(), g = ac.createGain(), o = ac.createOscillator();
      o.type = 'square'; o.frequency.setValueAtTime(220, ac.currentTime); o.frequency.setValueAtTime(440, ac.currentTime + .08);
      g.gain.setValueAtTime(.035, ac.currentTime); g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + .22);
      o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + .23); o.onended = () => ac.close();
    } catch { /* the cover still opens */ }
    setTimeout(() => { screen.hidden = true; document.getElementById('dial')?.focus(); }, LP.rm.matches ? 0 : 520);
    LP.say('Operation Night Glass active. Sweep the band and hold a carrier to acquire it.');
    if (LP.mission) LP.mission.start({ intercepted });
  }
  start.addEventListener('click', () => startMission(false));
  if (intercept) intercept.addEventListener('click', () => startMission(true));
  addEventListener('keydown', e => {
    if (screen.hidden || screen.classList.contains('departing')) return;
    if (e.key === 'Enter') { e.preventDefault(); startMission(false); }
  });
})();
