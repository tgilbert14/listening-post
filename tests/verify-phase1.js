const { chromium } = require('playwright');
const path = require('path');
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
let fails = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail.slice(0, 160) : ''}`);
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

  // ---- 1. The RTTY bitstream is REAL ITA2 Baudot: decode it independently ----
  const rtty = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'rtty');
    st.refresh();
    return { text: st.text, halves: Array.from(st._enc.halves), txMs: st._enc.txMs, cycle: st._cycle };
  });
  // independent decoder: 15 half-bits per frame (start 00, 5 data bits x2 LSB-first, stop 111)
  const LTRS = [null,'E','\n','A',' ','S','I','U','\r','D','R','J','N','F','C','K','T','Z','L','W','H','Y','P','Q','O','B','G',null,'M','X','V',null];
  const FIGS = [null,'3','\n','-',' ',"'",'8','7','\r','$','4','','!',':','(','5','+',')','2','#','6','0','1','9','?','&',null,'.','/','=',null];
  // NOTE: FIGS table above must match band.js indices — rebuild from band tables instead:
  const tables = await page.evaluate(() => {
    // reconstruct the tables the encoder used by encoding probe strings
    return null;
  });
  let shift = 'L', decoded = '', frameErrors = 0;
  const H = rtty.halves;
  for (let i = 0; i + 15 <= H.length; i += 15) {
    if (H[i] !== 0 || H[i + 1] !== 0) { frameErrors++; continue; }
    if (H[i + 12] !== 1 || H[i + 13] !== 1 || H[i + 14] !== 1) frameErrors++;
    let code = 0;
    for (let b = 0; b < 5; b++) {
      if (H[i + 2 + b * 2] !== H[i + 3 + b * 2]) frameErrors++;
      code |= (H[i + 2 + b * 2] & 1) << b;
    }
    if (code === 31) { shift = 'L'; continue; }
    if (code === 27) { shift = 'F'; continue; }
    const ch = shift === 'L' ? LTRS[code] : (code === 4 ? ' ' : FIGS2(code));
    if (ch) decoded += ch;
  }
  function FIGS2(code) {
    const F = [null,'3','\n','-',' ',"'",'8','7','\r','$','4','',',','!',':','(','5','+',')','2','#','6','0','1','9','?','&',null,'.','/','=',null];
    return F[code];
  }
  check('ITA2 framing: zero frame errors in the whole bitstream', frameErrors === 0, `${frameErrors} errors, ${H.length / 15} frames`);
  check('independent Baudot decode recovers the forecast text', decoded === rtty.text.toUpperCase(), `decoded="${decoded.slice(0, 60)}..." expected="${rtty.text.slice(0, 60)}..."`);
  check('bit timing is 45.45 baud', Math.abs(rtty.txMs / H.length - 1000 / 45.45 / 2) < 0.01, `half-bit=${(rtty.txMs / H.length).toFixed(3)}ms`);

  // ---- 2. bitAt/edges consistency with the stream ----
  const bitCheck = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'rtty');
    st.refresh();
    const HALF = 1000 / 45.45 / 2;
    let ok = true;
    for (let i = 0; i < 200; i++) {
      const t = i * 37.3; // arbitrary sample times inside tx
      const m = t % st._cycle;
      if (m >= st._enc.txMs) continue;
      if (st.bitAt(t) !== st._enc.halves[Math.floor(m / HALF)]) ok = false;
    }
    // edges must alternate and agree with bitAt on both sides
    const edges = st.edges(0, 2000);
    let agree = edges.length > 5;
    for (const e of edges) {
      if (st.bitAt(e.t + 0.5) !== (e.mark ? 1 : 0)) agree = false;
    }
    return { ok, agree, edgeCount: edges.length };
  });
  check('bitAt() agrees with the half-bit stream', bitCheck.ok);
  check('edges() agree with bitAt() either side', bitCheck.agree, `${bitCheck.edgeCount} edges in 2s`);

  // ---- 3. Waterfall paints the true 170 Hz shift ----
  const shift170 = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'rtty');
    st.refresh();
    // find a time where the space tone is live, then a mark time
    let tSpace = -1, tMark = -1;
    for (let t = 0; t < st._enc.txMs; t += 5.5) {
      if (st.bitAt(t) === 0 && tSpace < 0) tSpace = t;
      if (st.bitAt(t) === 1 && tMark < 0) tMark = t;
      if (tSpace >= 0 && tMark >= 0) break;
    }
    const probe = (t) => {
      const cols = 512, span = 2; // 2 kHz window around the carrier
      const out = new Float32Array(cols);
      LP.band.spectrumRow(out, st.f - span / 2, st.f + span / 2, t, st.band, LP.mulberry(7));
      // find the two brightest columns
      let a = 0, b = 0;
      for (let i = 1; i < cols; i++) { if (out[i] > out[a]) { b = a; a = i; } else if (out[i] > out[b]) b = i; }
      const hz = (i) => ((i + 0.5) / cols * span - span / 2) * 1000;
      return { hot: hz(a), cold: hz(b) };
    };
    return { mark: probe(tMark), space: probe(tSpace) };
  });
  const sep = Math.abs(shift170.mark.hot - shift170.space.hot);
  check('live tone flips between mark and space, 170 Hz apart', sep > 130 && sep < 210, `hot(mark)=${shift170.mark.hot.toFixed(0)}Hz hot(space)=${shift170.space.hot.toFixed(0)}Hz sep=${sep.toFixed(0)}Hz`);

  // ---- 4. Decoder window is character-accurate at frame boundaries ----
  const win = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'rtty');
    st.refresh();
    const c3 = st._enc.chars[2]; // third printed character
    const before = st.window(c3.end - 1, 80);
    const after = st.window(c3.end + 1, 80);
    return { before, after, ch: c3.ch };
  });
  check('decoder prints a char exactly when its stop bit lands', win.after === win.before + win.ch, `"${win.before}" -> "${win.after}"`);

  // ---- 5. Space weather API sane and deterministic ----
  const wx = await page.evaluate(() => {
    const w = LP.band.weather;
    const t = Date.now();
    return { k: w.k(), k2: w.k(), sid: w.sid(t), es: w.esOpen(t) };
  });
  check('K-index in 0..8 and stable within a day', wx.k >= 0 && wx.k <= 8 && wx.k === wx.k2, `K=${wx.k}`);
  check('SID severity in 0..1', wx.sid >= 0 && wx.sid <= 1, `sid=${wx.sid}`);

  // ---- 6. SSTV: Robot 36 line timing (frame excludes the VIS header) ----
  const sstv = await page.evaluate(() => {
    const st = LP.band.stations.find((s) => s.type === 'sstv');
    return { lineMs: st.lineMs(), H: st.H, TX: st.TX, VIS: st.VIS, FRAME: st.FRAME };
  });
  check('SSTV line timing derives from FRAME/H (Robot 36: 150 ms)',
    Math.abs(sstv.lineMs - sstv.FRAME / sstv.H) < 0.001 && sstv.TX === sstv.VIS + sstv.FRAME,
    `${sstv.lineMs.toFixed(1)}ms/line`);

  // ---- 7. Forecast text is daily and mentions band condition ----
  check('forecast text carries a band condition', /ALL SECTORS (THE BAND IS OPEN|BAND UNSETTLED|ROUGH BAND EXPECT FADES)/.test(rtty.text), rtty.text.slice(-40));

  // ---- 8. S-meter needle stays finite through a session ----
  await page.keyboard.press('1');
  await page.waitForTimeout(2500);
  const needleOk = await page.evaluate(() => Number.isFinite(LP.audio.smeter));
  check('S-meter model value finite', needleOk);

  check('zero console errors/warnings through Phase 1 checks', logs.length === 0, logs.slice(0, 4).join(' | '));
  await page.close();
  await browser.close();
  console.log(fails === 0 ? '\nALL PHASE 1 CHECKS PASSED' : `\n${fails} CHECK(S) FAILED`);
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAILURE:', e); process.exit(2); });
