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

Working branch `claude/app-evaluation-grading-8p5na4` is identical to `main`.
Test suites: `tests/verify-phase{0,1,2,3}.js` — **53 checks**, all green, run by
`.github/workflows/verify.yml` on every push/PR (also gates on build-drift).
Run locally: `node build.js` then `CHROME_PATH=<chromium> node tests/verify-phaseN.js`.

## The one loose end: the re-grade

A **re-run of the original nine-reviewer adversarial evaluation panel** against the
finished app was launched to produce a before/after scorecard vs the original
B / 7.1. Workflow run id: **`wf_d9ac57cb-4ca`** (task `w194165l7`).

Last observed progress (8/9 dimensions scored, verification underway); partial
per-dimension scores seen: **7.5, 7.5, 7.5, 5.5, 7, 7.5, 7.5, 8.5** (one ~5.5
outlier worth reading — likely a dimension where new surface area (Robot 36 audio
scheduling, the `?dev` bar, or the growing station list) introduced a real nit).

**To finish the re-grade next session:**
1. Read `.../subagents/workflows/wf_d9ac57cb-4ca/journal.jsonl` (under the session
   project dir) — it records each reviewer's score/justification and every
   verifier verdict.
2. Apply the same weighting as `docs/EVALUATION.md` (Correctness 20%, A11y 13%,
   Perf 12%, UX 12%, Runtime 10%, Arch 10%, Content 10%, DSP 8%, Platform 5%).
3. Deliver the before→after scorecard to the user; fix any confirmed regressions
   the panel surfaced (the ~5.5 dimension first).

## Deliberately deferred (scoped in `docs/PROPOSAL.md`, not built)
WEFAX charts; selectable sideband (USB/LSB); the station-type registry refactor.

## Notes for whoever resumes
- Never commit `tests/node_modules` — it's a symlink into the ephemeral scratchpad.
- Session git identity should be `Claude <noreply@anthropic.com>`.
- All model time-of-day reads go through `LP.now()`/`LP.date()`; `LP.warp` is 0
  for real users and only the `?dev` bar moves it.
