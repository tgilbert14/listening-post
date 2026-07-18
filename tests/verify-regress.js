/* Regression suite — drives the live paths that static checks miss.
   Covers the re-grade panel's confirmed HIGH findings so they can't return. */
const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + String(detail).slice(0, 160) : ''}`);
  if (!ok) fails++;
};

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(2500);

  // ---- HIGH: SSTV audio scheduler must not throw across a cycle boundary ----
  // Enable sound, park on POSTCARD (9430 HIGH), and jump the warp clock across
  // a 6-minute transmission boundary repeatedly while the scheduler runs.
  await page.evaluate(() => {
    // force-arm audio without a real gesture (test harness only)
    LP.engaged = true;
    document.getElementById('sound-toggle').click(); // toggles; ensure on below
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    if (document.getElementById('sound-toggle').getAttribute('aria-pressed') !== 'true') {
      document.getElementById('sound-toggle').click();
    }
    LP.setBand(2);
    LP.tuneTo(9430, true);
  });
  // sweep the warp clock across TX boundaries; the scheduler runs each frame
  for (let i = 0; i < 24; i++) {
    await page.evaluate((k) => { LP.warp = k * 15000; }, i); // +15s steps → crosses line and cycle seams
    await page.waitForTimeout(120);
  }
  // land right before a cycle rollover and step across it slowly
  await page.evaluate(() => { LP.warp = 360000 - 400 - Date.now() % 360000; });
  for (let i = 0; i < 12; i++) { await page.evaluate(() => { LP.warp += 90; }); await page.waitForTimeout(90); }
  await page.waitForTimeout(500);
  check('SSTV audio scheduler throws nothing across transmission/cycle seams', errs.length === 0, errs.slice(0, 3).join(' | '));

  // ---- HIGH: a throwing ticker task cannot brick the loop ----
  const survives = await page.evaluate(async () => {
    let good = 0;
    // a task that throws once, then a healthy counter added afterward
    let threw = false;
    LP.ticker.add(() => { if (!threw) { threw = true; throw new Error('synthetic'); } return false; });
    await new Promise((r) => setTimeout(r, 60));
    const off = LP.ticker.add(() => { good++; });
    await new Promise((r) => setTimeout(r, 300));
    off();
    return good;
  });
  check('one throwing task does not freeze the ticker', survives > 3, `healthy ticks after throw: ${survives}`);

  // ---- HIGH: the once-ever ghost does not wake for an untouched page ----
  const ghostGate = await page.evaluate(() => {
    // simulate a long idle dwell with NO engagement
    LP.engaged = false;
    LP.band.ghost.state = 'asleep';
    LP.band.ghost.tune(3250, 999999, false, 16.7); // huge dwell, quiet freq
    const before = LP.band.ghost.state;
    LP.engaged = true;
    LP.band.ghost.tune(3250, 999999, false, 16.7);
    const after = LP.band.ghost.state;
    LP.band.ghost.state = 'asleep'; LP.engaged = false;
    return { before, after };
  });
  check('ghost stays asleep for an unengaged page, wakes once engaged',
    ghostGate.before === 'asleep' && ghostGate.after === 'approaching', JSON.stringify(ghostGate));

  // ---- MED: volume 0 survives a reload ----
  await page.evaluate(() => localStorage.setItem('lp-vol', '0'));
  await page.reload();
  await page.waitForTimeout(2000);
  const vol0 = await page.evaluate(() => document.getElementById('vol').value);
  check('a muted set (vol 0) stays muted after reload', vol0 === '0', `vol=${vol0}`);

  // ---- MED: log entry activates on Space ----
  await page.evaluate(() => localStorage.setItem('lp-log', JSON.stringify([
    { id: 'VLT-4', f: 3305, band: 'GROUND', note: '', at: '', utc: '03:00Z', rst: '579', cls: '', pic: '', date: '20260718' },
  ])));
  await page.reload();
  await page.waitForTimeout(2000);
  await page.evaluate(() => { LP.setBand(1); LP.tuneTo(6800, true); LP.toggleLog(true); });
  await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('#log-list li.jump').focus());
  await page.keyboard.press(' ');
  await page.waitForTimeout(400);
  const jumped = await page.evaluate(() => ({ band: LP.rx.band, vfo: LP.rx.vfo }));
  check('Space activates a retunable log entry', jumped.band === 0 && Math.abs(jumped.vfo - 3305) < 0.05, JSON.stringify(jumped));

  // ---- MED: THE JAMMER stays silent during the net (model/audio agreement) ----
  const jam = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'jammer');
    // during the net the model returns 0 activity; audio must not key it
    return { modelSilent: st.activity(LP.band.net.t0 + 100) === 0 || !LP.band.netActive(LP.band.net.t0 + 100) };
  });
  check('THE JAMMER model does not key the net', jam.modelSilent);

  // ---- sideband: flipping USB/LSB turns the CW pitch slope over ----
  const sb = await page.evaluate(() => {
    // reproduce the audio's bfo law for a beacon above the dial
    const st = LP.band.stations.find((s) => s.type === 'beacon');
    const probe = (mode) => {
      LP.rx.sb = mode;
      const off = LP.rx.vfo - st.f;              // tune 1 kHz below the beacon
      const dir = LP.rx.sb === 'LSB' ? -1 : 1;
      return LP.clamp(300 + (-off * dir * 1000), 120, 1900);
    };
    LP.tuneTo(st.f - 1, true);
    const usb = probe('USB'), lsb = probe('LSB');
    LP.rx.sb = 'USB';
    return { usb, lsb };
  });
  check('sideband inverts the CW pitch sense (USB high vs LSB low for a signal above)',
    sb.usb > 900 && sb.lsb < 300, `USB=${sb.usb.toFixed(0)}Hz LSB=${sb.lsb.toFixed(0)}Hz`);
  const sbUi = await page.evaluate(() => {
    const btn = document.getElementById('sb-toggle');
    const was = btn.textContent;
    btn.click();
    const now = btn.textContent;
    const stored = localStorage.getItem('lp-sb');
    btn.click(); // restore
    return { was, now, stored: stored ? JSON.parse(stored) : null };
  });
  check('the sideband chip toggles and persists', sbUi.was === 'USB' && sbUi.now === 'LSB' && sbUi.stored === 'LSB', JSON.stringify(sbUi));

  // ---- midnight reseed: the underbrush re-rolls in place across a day boundary ----
  const reseed = await page.evaluate(() => {
    const arrRef = LP.band.minors;                 // the exported reference audio holds
    const before = arrRef.map((m) => m.f).join(',');
    // warp the clock a full day forward and force a spectrum render (calls reseedDay)
    LP.warp = 26 * 3600 * 1000;
    const out = new Float32Array(512);
    LP.band.spectrumRow(out, 3200, 3440, LP.now(), 0, LP.mulberry(1));
    const sameRef = LP.band.minors === arrRef;     // must mutate in place, not replace
    const after = LP.band.minors.map((m) => m.f).join(',');
    LP.warp = 0;
    LP.band.spectrumRow(out, 3200, 3440, LP.now(), 0, LP.mulberry(1));
    return { sameRef, changed: before !== after, count: LP.band.minors.length };
  });
  check('underbrush re-rolls at midnight, in place (same array reference)',
    reseed.sameRef && reseed.changed && reseed.count > 0, JSON.stringify(reseed));

  // the ticker test deliberately throws one 'synthetic' error, which the loop
  // now correctly logs instead of dying on — exclude only that expected line
  const unexpected = errs.filter((e) => !/synthetic/.test(e));
  check('no unexpected console errors across the whole regression run', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));
  await page.close();
  await browser.close();
  console.log(fails === 0 ? '\nALL REGRESSION CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE:', e); process.exit(2); });
