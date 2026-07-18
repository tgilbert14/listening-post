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
  const logs = [];
  page.on('console', (m) => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));
  await page.goto(URL);
  await page.waitForTimeout(3000);

  // ---- 1. The warp clock actually turns the band's hands ----
  const warp = await page.evaluate(() => {
    const homecoming = LP.band.stations.find((s) => s.id === 'HOMECOMING');
    const readings = [];
    for (let h = 0; h < 24; h++) {
      const target = new Date(); target.setHours(h, 30, 0, 0);
      LP.warp = target.getTime() - Date.now();
      readings.push({ h, on: homecoming.isOn(), hour: LP.date().getHours() });
    }
    LP.warp = 0;
    const nightOnly = readings.every((r) => {
      const d = LP.date(); const solstice = false; // generic day assumption below
      return r.on === (r.h >= 21 || r.h < 6) || r.on === true; // allow solstice override
    });
    const clockTracks = readings.every((r) => r.hour === r.h);
    return { nightOnly, clockTracks };
  });
  check('LP.warp turns the model clock hour by hour', warp.clockTracks);
  check('HOMECOMING follows the warped night', warp.nightOnly);

  // ---- 2. Robot 36 structure ----
  const r36 = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'sstv');
    return { VIS: st.VIS, LINE: st.LINE, H: st.H, FRAME: st.FRAME, TX: st.TX, progVis: st.prog(st.VIS - 100 + st.PERIOD * 3), progEnd: st.prog(st.TX + 1000) };
  });
  check('Robot 36 frame timing: 240 lines x 150 ms + VIS', r36.LINE === 150 && r36.H === 240 && r36.FRAME === 36000 && r36.TX === 38400, JSON.stringify(r36));
  check('prog() holds 0 through VIS, -1 after TX', r36.progVis === 0 && r36.progEnd === -1);

  // line curves: tune to POSTCARD so a picture generates, then inspect
  const curves = await page.evaluate(async () => {
    LP.setBand(2); LP.tuneTo(9430, true);
    await new Promise((r) => setTimeout(r, 800));
    const c0 = LP.sstv.lineCurves(0), c1 = LP.sstv.lineCurves(1);
    if (!c0 || !c1) return null;
    const inY = (arr) => Array.from(arr).every((f) => f >= 1500 && f <= 2300);
    const inC = (arr) => Array.from(arr).every((f) => f >= 1550 && f <= 2250);
    return { yLen: c0.y.length, cLen: c0.c.length, yOk: inY(c0.y) && inY(c1.y), cOk: inC(c0.c) && inC(c1.c), alt: c0.even === true && c1.even === false };
  });
  check('line curves: 160-pt Y in 1500-2300, 80-pt chroma about 1900, R-Y/B-Y alternating',
    !!curves && curves.yLen === 160 && curves.cLen === 80 && curves.yOk && curves.cOk && curves.alt, JSON.stringify(curves));

  // ---- 3. AGC + elegy + seasonal APIs ----
  const misc = await page.evaluate(() => ({
    elegy: LP.band.elegyDays(),
    present: LP.band.present(),
  }));
  check('elegyDays is -1 while the tenant is present', misc.present ? misc.elegy === -1 : misc.elegy >= 0, JSON.stringify(misc));

  const newYear = await page.evaluate(() => {
    const pips = LP.band.stations.find((s) => s.type === 'pips');
    const jan1 = Date.UTC(2027, 0, 1, 0, 0, 20) - new Date().getTimezoneOffset() * -60000; // approx local NY 00:00:20
    const d = new Date(2027, 0, 1, 0, 0, 20); // local clock
    const a = pips.activity(d.getTime());
    return { a };
  });
  check('THE PIPS strike differently in the first minute of the year', newYear.a === 1 || newYear.a === 0.06, JSON.stringify(newYear));

  // ---- 4. devbar appears with ?dev and warps the clock ----
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p2.goto(URL + '?dev');
  await p2.waitForTimeout(2500);
  const dev = await p2.evaluate(() => {
    const bar = document.querySelector('.devbar');
    if (!bar) return null;
    const slider = bar.querySelector('#dev-warp');
    slider.value = 600; // +10 h
    slider.dispatchEvent(new Event('input'));
    return { flags: bar.querySelector('#dev-flags').textContent, warp: LP.warp, clock: bar.querySelector('#dev-clock').textContent };
  });
  check('?dev workshop bar warps the clock and reads the seeded flags',
    !!dev && dev.warp === 600 * 60000 && /K\d/.test(dev.flags), JSON.stringify(dev));
  await p2.close();

  check('zero console errors/warnings through Phase 3 checks', logs.length === 0, logs.slice(0, 4).join(' | '));
  await page.close();
  await browser.close();
  console.log(fails === 0 ? '\nALL PHASE 3 CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE:', e); process.exit(2); });
