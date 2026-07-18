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

  // ---- 1. The cipher: decode the day's groups back to the sentence ----
  const cipher = await page.evaluate(() => {
    const groups = LP.band.latticeGroups().join('');
    const rtty = LP.band.stations.find((s) => s.type === 'rtty');
    rtty.refresh();
    return { groups, book: rtty.text.replace(/ /g, '') };
  });
  {
    // subtract the book key mod 10, then read the straddling checkerboard
    let digits = '';
    for (let i = 0; i < 25; i++) {
      digits += String((Number(cipher.groups[i]) - cipher.book.charCodeAt(i % cipher.book.length) + 100) % 10);
    }
    const SHORT = { 0: 'A', 1: 'T', 3: 'O', 4: 'N', 5: 'E', 7: 'S', 8: 'I', 9: 'R' };
    const LONG2 = { 20: 'B', 21: 'C', 22: 'D', 23: 'F', 24: 'G', 25: 'H', 26: 'J', 27: 'K', 28: 'L', 29: 'M' };
    const LONG6 = { 60: 'P', 61: 'Q', 62: 'U', 63: 'V', 64: 'W', 65: 'X', 66: 'Y', 67: 'Z', 68: '.', 69: '/' };
    let msg = '';
    for (let i = 0; i < digits.length;) {
      const d = digits[i];
      if (d === '2' || d === '6') {
        const pair = Number(digits.slice(i, i + 2));
        msg += (d === '2' ? LONG2[pair] : LONG6[pair]) || '?';
        i += 2;
      } else { msg += SHORT[d] || '?'; i += 1; }
    }
    const clean = msg.replace(/\//g, '');
    check('the numbers decode to the sentence (book cipher vs FORECAST)',
      clean.startsWith('NOONELISTENSALONE.'), `decoded="${msg}"`);
  }

  // ---- 2. THE PIPS: timing law ----
  const pips = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'pips');
    const base = 1770000000000; // fixed epoch minute boundary: divisible by 60000
    let on = 0;
    for (let p = 0; p < 5; p++) if (st.activity(base + (55 + p) * 1000 + 30) === 1) on++;
    const long = st.activity(base + 60000 + 200);
    const quiet = st.activity(base + 30000);
    return { on, long, quiet, fail: st.failNight() };
  });
  check('five short pips in the last five seconds (fail nights may drop some)',
    pips.fail ? pips.on >= 3 : pips.on === 5, `on=${pips.on} failNight=${pips.fail}`);
  check('the minute mark is long-pip or (rare) dropped', pips.long === 1 || pips.fail, `long=${pips.long}`);
  check('the carrier idles between pips', pips.quiet < 0.1, `quiet=${pips.quiet}`);

  // ---- 3. THE JAMMER and the displaced numbers ----
  const jam = await page.evaluate(() => {
    const lat = LP.band.stations.find((s) => s.type === 'buzzer');
    const jm = LP.band.stations.find((s) => s.type === 'jammer');
    return { today: LP.band.jammerToday(), latF: lat.f, jamOn: jm.isOn() };
  });
  check('the numbers move up 2 kHz exactly when the jammer sits down',
    jam.today ? (jam.latF === 6729 && jam.jamOn) : (jam.latF === 6727 && !jam.jamOn),
    JSON.stringify(jam));

  // ---- 4. THE WARNING: hourly tail inverts the mayday ----
  const warn = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.id === 'THE WARNING');
    const inTail = st.tailActive(58 * 60000);
    const offTail = st.tailActive(30 * 60000);
    const k = st.keyed(57 * 60000 + 5000);
    const tailText = LP.band.decodeMorse(k.m, k.m.total - 1);
    return { inTail, offTail, tailText };
  });
  check('WARNING tail active only in the last three minutes of the hour', warn.inTail && !warn.offTail);
  check('the tail keys the inversion', /DO NOT ANSWER DO NOT COME/.test(warn.tailText), warn.tailText);

  // ---- 5. FAR FIELD systems exist and stay in range ----
  const far = await page.evaluate(() => {
    const t = Date.now();
    const gains = LP.band.minors.slice(0, 40).map((m) => LP.band.minorStrength(m, t));
    return {
      ldeApi: typeof LP.band.lde.depart === 'function' && typeof LP.band.lde.night === 'function',
      early: typeof LP.band.earlyNow(t) === 'boolean',
      hull: LP.band.hullEvent(t) === null || typeof LP.band.hullEvent(t) === 'object',
      gainsOk: gains.every((g) => g >= 0 && g <= 1.2),
    };
  });
  check('LDE / early-row / hull APIs live and sane', far.ldeApi && far.early && far.hull && far.gainsOk, JSON.stringify(far));

  // ---- 6. PWA plumbing ----
  const pwa = await page.evaluate(() => ({
    manifest: !!document.querySelector('link[rel="manifest"]'),
  }));
  check('manifest linked from the page', pwa.manifest);
  const fs = require('fs');
  check('sw.js and manifest.webmanifest exist', fs.existsSync(path.resolve(__dirname, '..', 'sw.js')) && fs.existsSync(path.resolve(__dirname, '..', 'manifest.webmanifest')));
  {
    const mf = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'manifest.webmanifest'), 'utf8'));
    check('manifest is valid JSON with icons + standalone display', mf.display === 'standalone' && mf.icons.length > 0, mf.name);
  }

  // ---- 7. Log: retune + exports ----
  await page.evaluate(() => {
    localStorage.setItem('lp-log', JSON.stringify([
      { id: 'VLT-4', f: 3305, band: 'GROUND', note: '', at: '', utc: '03:00Z', rst: '579', cls: '', pic: '', date: '20260718' },
    ]));
  });
  await page.reload();
  await page.waitForTimeout(2500);
  await page.keyboard.press('l');
  await page.waitForTimeout(600);
  const beforeJump = await page.evaluate(() => ({ band: LP.rx.band, vfo: LP.rx.vfo }));
  await page.click('#log-list li.jump');
  await page.waitForTimeout(500);
  const afterJump = await page.evaluate(() => ({ band: LP.rx.band, vfo: LP.rx.vfo }));
  check('clicking a log line retunes set and band', afterJump.band === 0 && Math.abs(afterJump.vfo - 3305) < 0.05,
    `${JSON.stringify(beforeJump)} -> ${JSON.stringify(afterJump)}`);

  const adifText = await page.evaluate(async () => {
    let captured = null;
    const orig = URL.createObjectURL;
    URL.createObjectURL = (blob) => { captured = blob; return 'blob:test'; };
    HTMLAnchorElement.prototype.click = function () { }; // swallow the download
    document.getElementById('log-adif').click();
    URL.createObjectURL = orig;
    return captured ? await captured.text() : null;
  });
  check('ADIF export carries a valid record', !!adifText && adifText.includes('<EOH>') && /<CALL:4>VLT4/.test(adifText) && adifText.includes('<EOR>'),
    (adifText || '').split('\n')[1]);

  check('zero console errors/warnings through Phase 2 checks', logs.length === 0, logs.slice(0, 4).join(' | '));
  await page.close();
  await browser.close();
  console.log(fails === 0 ? '\nALL PHASE 2 CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE:', e); process.exit(2); });
