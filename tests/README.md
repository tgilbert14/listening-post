# tests

Headless verification suites (Playwright + Chromium). Run `node ../build.js` first.

```
npm i playwright        # once; set CHROME_PATH if the bundled browser isn't installed

node verify-phase0.js    # state honesty, fling regression, a11y, storage poisoning, reflow
node verify-phase1.js    # real ITA2 Baudot round-trip, 170 Hz shift, space weather
node verify-phase2.js    # the straddling-checkerboard cipher decode, THE PIPS / JAMMER /
                         #   WARNING, DX nights, ADIF export, click-to-retune
node verify-phase3.js    # Robot 36 frame law, line-curve ranges, the warp clock, the ?dev bar
node verify-regress.js   # the LIVE paths static checks miss: the SSTV audio scheduler across
                         #   cycle seams, a throwing ticker task, the ghost onboarding gate,
                         #   volume-0 persistence, Space activation, jammer/net agreement
```

Every suite must end `ALL ... CHECKS PASSED` with zero (unexpected) console errors. CI
(`.github/workflows/verify.yml`) runs all five on every push and pull request, and also fails if
the committed `index.html` has drifted from a fresh `node build.js`.

`verify-regress.js` exists because the re-grade panel found a crash that 47 passing static checks
missed — it only reproduced when sound was on and the SSTV audio scheduler actually ran across a
transmission boundary. When you add a feature with a live runtime path, add a check here that
*drives* it, not one that only inspects its constants.
