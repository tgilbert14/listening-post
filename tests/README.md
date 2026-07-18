# tests

Headless verification suites (Playwright + Chromium). Run `node ../build.js` first.

```
npm i playwright        # once; set CHROME_PATH if the bundled browser isn't installed
node verify-phase0.js   # 17 checks: fling regression, state honesty, a11y, storage poisoning
node verify-phase1.js   # 13 checks: real ITA2 Baudot round-trip, 170 Hz shift, space weather
```

Both suites must end `ALL ... CHECKS PASSED` with zero console errors.
