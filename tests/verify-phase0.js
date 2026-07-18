const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) fails++;
};
const openReceiverForTest = async (page) => {
  await page.evaluate(() => {
    const cover = document.getElementById('title-screen');
    if (cover) cover.hidden = true;
    const codec = document.getElementById('codec');
    if (codec) { codec.hidden = true; codec.style.pointerEvents = 'none'; }
    document.body.classList.add('mission-started');
  });
};

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const logs = [];
  page.on('console', (m) => { if (m.type() !== 'log') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[PAGEERROR] ${e.message}`));

  // ---- fresh visit ----
  await page.goto(URL);
  await page.waitForTimeout(3500);

  // M1: fresh visit — SKY chip pressed, not GROUND
  const pressed = await page.evaluate(() =>
    [0, 1, 2].map((i) => document.getElementById('band-' + i).getAttribute('aria-pressed')));
  check('fresh visit: SKY chip pressed, GROUND not', pressed[1] === 'true' && pressed[0] === 'false', JSON.stringify(pressed));
  // Receiver regressions are isolated from the asynchronous campaign calls;
  // dedicated checks below exercise the real START interaction itself.
  await openReceiverForTest(page);

  // M1b: documented '2' key is not a dead no-op semantically — '1' switches to GROUND
  await page.keyboard.press('1');
  await page.waitForTimeout(300);
  const p0 = await page.evaluate(() => document.getElementById('band-0').getAttribute('aria-pressed'));
  check("'1' switches to GROUND with chip reflected", p0 === 'true');

  // H1: fling regression — instrument ticker execution rate
  const rate = async () => page.evaluate(() => new Promise((res) => {
    let n = 0;
    const off = LP.ticker.add(() => { n++; });
    setTimeout(() => { off(); res(n); }, 1000);
  }));
  const before = await rate();
  // synthetic fling on the dial, three times
  for (let f = 0; f < 3; f++) {
    const dial = await page.$('#dial');
    const box = await dial.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + 50, y);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(box.x + 50 + i * 40, y);
    await page.mouse.up();
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(1500);
  const after = await rate();
  check('fling does not multiply the rAF loop', after < before * 2.5, `before=${before}/s after=${after}/s`);

  // M7: keyboard from chip focus — click Sound chip, then '3' must switch band
  await page.click('#sound-toggle');
  await page.waitForTimeout(400);
  await page.keyboard.press('3');
  await page.waitForTimeout(300);
  const p2 = await page.evaluate(() => document.getElementById('band-2').getAttribute('aria-pressed'));
  check("'3' works while a chip has focus", p2 === 'true');

  // M7b: PgDn works from body focus
  const v1 = await page.evaluate(() => LP.rx.vfo);
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(200);
  const v2 = await page.evaluate(() => LP.rx.vfo);
  check('PageDown tunes -5 from body focus', Math.abs(v2 - (v1 - 5)) < 0.001, `${v1} -> ${v2}`);

  // modifier chords pass through
  const v3 = await page.evaluate(() => LP.rx.vfo);
  await page.keyboard.press('Control+1');
  await page.waitForTimeout(150);
  const stillHigh = await page.evaluate(() => document.getElementById('band-2').getAttribute('aria-pressed'));
  check('Ctrl+1 is not hijacked', stillHigh === 'true');

  // M4: zoom persistence reflected — set span 12, reload, chip must say 12
  await page.keyboard.press('z'); // 24
  await page.keyboard.press('z'); // 12
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForTimeout(2500);
  const zoomLabel = await page.evaluate(() => document.getElementById('zoom-toggle').textContent.trim());
  check('restored span reflected on chip after reload', zoomLabel === '12 kHz', zoomLabel);

  // M5: poisoned lp-trace must not break tuning
  await page.evaluate(() => localStorage.setItem('lp-trace', '"not an object"'));
  await page.reload();
  await page.waitForTimeout(2000);
  const va = await page.evaluate(() => LP.rx.vfo);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('PageUp');
  await page.waitForTimeout(200);
  const vb = await page.evaluate(() => LP.rx.vfo);
  check('poisoned lp-trace does not jam the dial', Math.abs(vb - va) > 4, `${va} -> ${vb}`);

  // lockbar exists
  const hasLockbar = await page.evaluate(() => !!document.getElementById('lockbar'));
  check('lock progress bar present', hasLockbar);

  // aria-valuemax derived from band
  const vmax = await page.evaluate(() => document.getElementById('dial').getAttribute('aria-valuemax'));
  check('dial aria-valuemax derived from band width', vmax === '240', vmax);

  // CSS in head (not body)
  const styleInHead = await page.evaluate(() => !!document.head.querySelector('style'));
  check('stylesheet emitted in <head>', styleInHead);

  // og:image:alt present
  const ogAlt = await page.evaluate(() => !!document.querySelector('meta[property="og:image:alt"]'));
  check('og:image:alt present', ogAlt);

  // ghost Once: seed a log containing THE OTHER, reload, ghost must boot 'gone'
  await page.evaluate(() => localStorage.setItem('lp-log', JSON.stringify([{ id: 'THE OTHER', f: 6700, band: 'SKY', note: '', at: '', utc: '', rst: '', cls: 'net', pic: '' }])));
  await page.reload();
  await page.waitForTimeout(2000);
  const ghostState = await page.evaluate(() => LP.band.ghost.state);
  check("ghost state is 'gone' when already logged (Once.)", ghostState === 'gone', ghostState);

  // console clean through all of the above
  check('zero console errors/warnings/pageerrors', logs.length === 0, logs.slice(0, 5).join(' | '));

  await page.close();

  // M8: the cover's START gesture is now the first real interaction. It must
  // arm sound rather than silently banking an opt-out before the receiver opens.
  const ctxTrap = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const pt = await ctxTrap.newPage();
  await pt.goto(URL);
  await pt.waitForTimeout(2500);
  const preShown = await pt.evaluate(() => document.getElementById('sound-toggle').getAttribute('aria-pressed'));
  await pt.click('#mission-start');
  await pt.waitForTimeout(900);
  const trap = await pt.evaluate(() => ({
    pressed: document.getElementById('sound-toggle').getAttribute('aria-pressed'),
    stored: localStorage.getItem('lp-sound'),
  }));
  check('first-ever START gesture enables sound (no silent opt-out)',
    preShown === 'false' && trap.stored !== 'false' && trap.pressed === 'true',
    `preShown=${preShown} then ${JSON.stringify(trap)}`);
  await ctxTrap.close();

  // reduced-motion uses the new cover for onboarding and skips its transition
  const p3 = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await p3.emulateMedia({ reducedMotion: 'reduce' });
  await p3.goto(URL);
  await p3.waitForTimeout(2500);
  const coverShown = await p3.evaluate(() => !document.getElementById('title-screen').hidden);
  await p3.click('#mission-start');
  await p3.waitForTimeout(100);
  const coverGone = await p3.evaluate(() => document.getElementById('title-screen').hidden);
  check('reduced-motion cover onboards and opens without animation', coverShown && coverGone);
  await p3.close();

  // deep zoom reflow: 320x240 viewport must scroll, not clip
  const p4 = await browser.newPage({ viewport: { width: 320, height: 240 } });
  await p4.goto(URL);
  await p4.waitForTimeout(2000);
  const scrollable = await p4.evaluate(() => {
    const s = getComputedStyle(document.body).overflow;
    return { overflow: s, canScroll: document.documentElement.scrollHeight > 240 || s !== 'hidden' };
  });
  check('400%-zoom-equivalent viewport can scroll (WCAG 1.4.10)', scrollable.canScroll, JSON.stringify(scrollable));
  await p4.close();

  await browser.close();
  console.log(fails === 0 ? '\nALL CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE:', e); process.exit(2); });
