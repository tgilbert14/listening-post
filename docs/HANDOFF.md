# Session handoff — The Listening Post

*Written 2026-07-18 to preserve state across a credit/session boundary.*

## Where things stand

**The project is complete and fully shipped.** All work is merged to `main`; the
live site (https://tgilbert14.github.io/listening-post/) redeploys from it.

Merged pull requests (all closed, CI green):
- **#1** — Critical evaluation (`docs/EVALUATION.md`, grade **B / 7.1**), the
  PLUS ULTRA proposal (`docs/PROPOSAL.md`), and **Phase 0** (every confirmed
  finding fixed).
- **#2** — **Phase 1**: real ITA2 Baudot RTTY, living ionosphere, S-unit meter.
- **#3** — **Phases 2 + 2½ + 3**: THE PIPS / THE JAMMER / DX nights / the
  solvable numbers cipher; THE FAR FIELD horror layer (THE WARNING, LONG DELAY,
  THE SLEEPER, HULL NOISE, THE DUET, ONE ROW EARLY, failing pips); PWA, ADIF +
  QSL export, click-to-retune, haptics, volume; and CI.
- **#4** — Robot 36 SSTV (decodable by a phone SSTV app), the `?dev` warp-clock
  workshop, AGC, the long-elegy first movement, seasonal traffic.
- **#5** — The re-grade (`docs/EVALUATION-AFTER.md`) and fixes for the three HIGH
  regressions it found, plus `tests/verify-regress.js`.

Working branch `claude/app-evaluation-grading-8p5na4` is identical to `main`.
Test suites: `tests/verify-phase{0,1,2,3}.js` + `verify-regress.js` — **60 checks**,
all green, run by `.github/workflows/verify.yml` on every push/PR (also gates on
build-drift). Run locally: `node build.js` then `CHROME_PATH=<chromium> node tests/verify-*.js`.

## The re-grade (resolved)

**RESOLVED (PR #5).** The re-run of the original nine-reviewer adversarial panel
against the finished app (workflow `wf_d9ac57cb-4ca`) completed. Result: **7.0
weighted as-graded** vs the original 7.1 — Content **7.5 → 8.5**, DSP and
Architecture **+1.0** each. The panel found three HIGH regressions (two introduced
during the upgrade: the Robot 36 audio-scheduler crash and the ticker `inFrame`
latch) plus a set of MEDIUMs; all three HIGHs and four MEDIUMs were fixed and fenced
by `tests/verify-regress.js`. Full write-up: [`EVALUATION-AFTER.md`](./EVALUATION-AFTER.md).

## Deliberately deferred (scoped in `docs/PROPOSAL.md` / `EVALUATION-AFTER.md`, not built)
The station-type registry refactor; factoring the repeated keying-scheduler block;
making the SSTV/music/jammer waterfall texture model-driven rather than screen-space
shimmer; the underbrush/DX/sleeper population re-seeding at local midnight for tabs
left open overnight; single-character shortcut remap/disable (WCAG 2.1.4); the phone
`.side` reflow; WEFAX charts; selectable sideband (USB/LSB).

## Notes for whoever resumes
- Never commit `tests/node_modules` — it's a symlink into the ephemeral scratchpad.
- Session git identity should be `Claude <noreply@anthropic.com>`.
- All model time-of-day reads go through `LP.now()`/`LP.date()`; `LP.warp` is 0
  for real users and only the `?dev` bar moves it.
