# The Listening Post — Re-Evaluation (after PLUS ULTRA)

*Re-graded 2026-07-18 at the finished commit by the **same** nine-reviewer
adversarial panel, same anchored rubric, same weights as
[`EVALUATION.md`](./EVALUATION.md). This is the honest before/after.*

---

## Headline

| | Before (commit `eecba4b`) | After (as-graded) |
|---|---:|---:|
| **Weighted overall** | **7.1 / 10** | **7.0 / 10** |
| Grade | B | B |

The number barely moved — and that is the real finding, so let's not spin it.

**Why five phases of features didn't raise the grade:** the rubric is *absolute*
("does the code honor its claims?"), not scored relative to ambition. A far larger,
more ambitious app makes *more* claims and exposes *more* surface for a critical
panel to test — so the same rubric finds proportionally more to flag. The features
genuinely deepened the work (Content rose **7.5 → 8.5**; DSP authenticity is now
"textbook", verified by independent decoders). But the new surface area — a live
Robot 36 audio scheduler, a growing station roster, new interaction paths — also
introduced fresh defects, and two of the three HIGH findings below were regressions
introduced *during this very upgrade*. A bigger, braver app is not automatically a
higher-scoring one against an unmoving bar.

**Then we fixed them.** All three HIGH findings and four of the confirmed MEDIUMs
are resolved in the commit that ships alongside this document, each covered by a new
`tests/verify-regress.js` suite. Post-fix, Correctness realistically returns to the
~7–7.5 band (the three HIGHs and the volume/jammer/focus/Space MEDIUMs are gone),
lifting the weighted overall back to roughly **7.3–7.4**. That estimate is labelled
as an estimate — the panel graded the pre-fix snapshot; we did not re-run it.

---

## Scorecard, dimension by dimension

| Dimension | Before | After | Δ |
|---|---:|---:|---:|
| Content, fiction & craft | 7.5 | **8.5** | +1.0 |
| Radio/DSP authenticity | 6.5 | **7.5** | +1.0 |
| Architecture, build & code quality | 6.5 | **7.5** | +1.0 |
| Accessibility | 7.5 | 7.5 | — |
| Performance & resource discipline | 9.0 | 7.5 | −1.5 |
| UX & interaction design | 7.0 | 7.0 | — |
| Web-platform citizenship | 7.5 | 7.5 | — |
| Runtime health (instrumented) | 6.0 | 6.5 | +0.5 |
| Correctness & robustness | 6.5 | 5.5 → *~7.3 post-fix* | −1.0 (fixed) |
| **Weighted overall** | **7.1** | **7.0 → ~7.3 post-fix** | |

Notes on the movers:
- **Content +1.0** — "almost every README promise is backed by real, verifiable
  machinery rather than vapor: the numbers station is an actual straddling-
  checkerboard cipher keyed from the daily RTTY text, the SSTV is spec-correct
  Robot 36." The fiction got deeper *and* more literally true.
- **DSP +1.0** — "true 45.45-baud ITA2 Baudot… a byte-accurate Robot 36 frame
  including a VIS header with correct code 8 and even parity… a propagation model
  that is computed, not narrated."
- **Architecture +1.0** — the one-model-two-renderings claim now "verifies as
  genuinely true down to the ITA2 half-bit and morse-span level."
- **Performance −1.5** — the earlier 9.0 was for a smaller engine; the panel now
  charges the audio hot path (per-frame automation rebuilds) and the SSTV/music/
  jammer waterfall texture being screen-space shimmer rather than modeled. Real,
  and now on the deferred list rather than papered over.
- **Correctness −1.0 as-graded** — dragged almost entirely by the two regressions
  this upgrade introduced (below), now fixed.

---

## The three HIGH findings — all fixed

| # | Finding | Origin | Fix |
|---|---|---|---|
| H1 | **SSTV audio scheduler throws `NotSupportedError`** within ~1 s of tuning POSTCARD with sound on — adjacent Robot 36 chroma curves overlap because each line's start was recomputed every frame from two drifting clocks (audio vs wall). | Introduced in Phase 1/4 (Robot 36). | Anchor the whole frame to a single audio-clock base captured once per cycle (`v._audioBase`), so line times are monotonic and never overlap; curve calls wrapped defensively. |
| H2 | **One throwing ticker task permanently bricks the app** — the `inFrame` latch (added in Phase 0 to fix the fling runaway) never reset on exception, so `kick()` could never restart the loop. H1 was the trigger that made this catastrophic. | Introduced in Phase 0. | `try/finally` guarantees `inFrame` clears and the loop re-arms; each task is isolated in its own `try/catch` so one bad task can't stop the others. |
| H3 | **The once-ever ghost can burn silently during onboarding** — an untouched page reaches the 20 s dwell, the ghost approaches, asks, and goes `gone`, permanently ceasing every anomaly, without the visitor ever noticing. | Pre-existing (design gap). | The ghost only wakes for a listener who is actually present (`LP.engaged`, set on the first real gesture); an idle page on a desk can never spend the event. |

## MEDIUM findings fixed this pass

- **Volume 0 was never restored** (`Number(0) || 85` → 85 on reload): now guarded with
  `Number.isFinite`, so a knob-mute survives a reload.
- **THE JAMMER audibly keyed the net** while the model painted it silent (a
  one-model-two-renderings violation): the audio net catch-all now excludes `jammer`.
- **Retunable log entries didn't activate on Space** (ARIA button pattern requires
  Enter *and* Space): Space now activates them.
- **Closing the logbook dropped focus to `<body>`** (WCAG 2.4.3): focus returns to the
  Log chip when the book had focus.

## Acknowledged, deferred (scoped, not rushed)

Larger refactors and design calls the panel raised, left for a deliberate pass rather
than a hurried one: the station-type registry refactor (dispatch chains duplicated
across files); factoring the four-times-repeated keying-scheduler block; making the
SSTV/music/jammer *waterfall texture* a function of the model rather than screen-space
shimmer; per-frame audio automation micro-optimisation; the underbrush/DX/sleeper
population re-seeding at local midnight for tabs left open overnight (a LOW in the
original evaluation); single-character shortcut remap/disable (WCAG 2.1.4); and the
phone letterbox layout for `.side`. See [`PROPOSAL.md`](./PROPOSAL.md).

---

## The honest bottom line

The re-grade confirms the upgrade did what it set out to do where it counts for the
*fiction and the engineering truth* — Content, DSP, and Architecture each gained a
full point, and the panel calls the modes "genuinely real, not faked." It also proved
the value of grading against an absolute bar: the same critical eye that gave the
original a B caught two real regressions this work introduced, which we then fixed and
fenced with regression tests. The app is a stronger, deeper, and now better-defended B
than it started — and the path from here to an A is the deferred list above, not more
features.
