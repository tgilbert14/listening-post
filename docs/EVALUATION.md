# The Listening Post — Critical Evaluation

*Evaluated 2026-07-18 at commit `eecba4b` by a nine-reviewer panel with adversarial
verification of every significant finding, plus an instrumented runtime pass in
headless Chromium.*

---

## Methodology

Nine independent reviewers each audited one dimension of the app against an anchored
0–10 rubric, verifying every README claim against the actual code. Every medium- and
high-severity finding was then handed to an **adversarial verifier** whose only job was
to refute it by reading the code (or executing it). Only findings that survived
refutation count against the score. A tenth pass ran the app in headless Chromium —
console capture, keyboard sweeps, screenshot diffing, no-JS / reduced-motion / mobile
emulation, and instrumented measurement of the ticker and tuning state.

**Verification outcome: 36 findings confirmed, 1 refuted.** (The refuted claim — that
CW pitch does not track tuning error — was wrong; the 300 Hz floor is documented,
deliberate design.)

### Scoring anchors

| Score | Meaning |
|---|---|
| 10 | Exemplary — could teach from it |
| 8–9 | Excellent — only nits |
| 6–7 | Good — real, fixable issues |
| 4–5 | Mediocre — problems any professional review would flag |
| 2–3 | Poor — fundamental problems |
| 0–1 | Broken or absent |

### Dimensions and weights

Weights reflect what matters for a public, interactive, audio-visual art piece:
correctness and the live experience dominate; platform trivia matter least.

| Dimension | Weight |
|---|---|
| Correctness & robustness | 20% |
| Accessibility | 13% |
| Performance & resource discipline | 12% |
| UX & interaction design | 12% |
| Runtime health (instrumented) | 10% |
| Architecture, build & code quality | 10% |
| Content, fiction & craft | 10% |
| Radio/DSP authenticity | 8% |
| Web-platform citizenship & compatibility | 5% |

---

## Scorecard

| Dimension | Score | Weighted |
|---|---:|---:|
| Correctness & robustness | 6.5 | 1.30 |
| Accessibility | 7.5 | 0.98 |
| Performance & resource discipline | **9.0** | 1.08 |
| UX & interaction design | 7.0 | 0.84 |
| Runtime health | 6.0 | 0.60 |
| Architecture, build & code quality | 6.5 | 0.65 |
| Content, fiction & craft | 7.5 | 0.75 |
| Radio/DSP authenticity | 6.5 | 0.52 |
| Web-platform citizenship | 7.5 | 0.38 |
| **Overall** | | **7.1 / 10** |

# Final grade: **B**

**In one sentence:** an unusually ambitious and largely honest piece of engineering-as-art
whose model-driven core, performance discipline, and accessibility substance are
genuinely excellent — held back from an A by one severe runtime bug, two broken
narrative promises, one WCAG-AA failure, and a cluster of state-reflection defects
that a single hard editing pass would clear.

---

## What is genuinely excellent

- **The single-model claim is structurally real.** `spectrumRow()` and the audio
  voices consume the same `activity()` / `strength()` / compiled-morse spans
  (`20-band.js:506-516` → `30-audio.js:227-246`). The S-meter reads the model, not
  the audio graph, so it works with sound off. The lightning hazard is
  call-rate-independent so two consumers can't double the storm.
- **Performance discipline is textbook** (the 9.0 is earned): one rAF ticker that
  halts when hidden; a 512-column raster scrolled by exactly one self-blit plus one
  512×1 `putImageData`; reused buffers and a precomputed LUT; rate layering (raster
  30 Hz, ribbon 2 Hz, decode 6 Hz, composite only when dirty); voices killed 1.2 s
  out of earshot with delay-feedback cycles explicitly broken; 117 KB / ~36 KB
  gzipped, zero external requests.
- **Morse is exactly ITU-standard** (1-3-7 timing from `unit = 1200/wpm`, verified
  programmatically) and beacon traffic decodes to authentic idiom (`VVV DE VLT4 …
  QTH DUST SEA K`). CW keying is lookahead-scheduled 330 ms ahead on the audio clock
  so a stalled frame can't smear a dit.
- **Accessibility substance, not theater:** a real ARIA slider whose valuetext
  carries frequency *and* locked station; two debounced polite live regions with a
  clobber rule; reduced motion is a redesign (still spectrum graph), not a removal;
  a blind keyboard user can genuinely find, hold, and log a station (all named
  stations sit on integer frequencies reachable by arrow stepping).
- **The fiction is real, not vapor.** Every README station exists with genuine
  content. Several secrets *exceed* the README: the trace-day (the numbers station
  reads back your own most-kept frequency, flagged only by one flat music-box note),
  the room behind the buzzer, the post-departure fourth postcard (`NO ONE AT THE
  KEY` — a mise en abyme of the site itself), and the silent-key net keyed in the
  departed ghost's own fist via a genuinely shared PRNG seed (`mulberry(4257)`).
- **Honest degradation everywhere:** no-JS gets a real styled brochure; the sound
  chip never claims ON until the context is running; opt-out is remembered;
  localStorage is type-sanitized field-by-field for `log` and `rx`.

---

## Confirmed findings (the ledger)

### High severity

| # | Finding | Where |
|---|---|---|
| H1 | **One dial fling permanently multiplies the rAF loop (~95× measured).** `ticker.frame()` nulls `rafId` at entry; the coast task's `tuneTo()` → `kick()` schedules a rAF mid-frame, then the end-of-frame line schedules a second without checking `rafId`. Callbacks double each frame while coasting and persist forever (the master loop keeps `tasks.size ≥ 1`). Same-paint callbacks get `dt = 0 ‖ 16 = 16`, so coast physics integrate N× per paint — measured runaway to 9,438 executions/sec and the VFO slamming into the band edge. | `10-boot.js:17-25`, `60-interact.js:109-123` |
| H2 | **The ghost's "Once." is not honored.** `ghost.state` resets to `asleep` every load and `tune()` never consults the persisted log, so THE OTHER re-stalks and re-asks every session — against the app's central promise ("asks who was there. Once."). The *anomalies* stay ceased (the log persists), but the haunting repeats. | `20-band.js:437-464` |
| H3 | **400% zoom clips controls with no scroll path** (WCAG 1.4.10 reflow failure): global `overflow:hidden` plus fixed layout. | `02-shell.css` |

### Medium severity (confirmed by adversarial verification)

| # | Finding | Where |
|---|---|---|
| M1 | First visit shows the wrong band chip: HTML statically marks GROUND pressed, boot state is SKY; `reflectBand()` runs only when saved state exists. The documented `2` key is then a dead no-op (already on band 1). | `03-body.html:25`, `60-interact.js:18-29` |
| M2 | FORECAST decoder blanks to `·` for the last ~3.7 s of every 30 s transmission while the RTTY is still audibly sending — wraparound bug in a reimplemented schedule (flagged independently by four reviewers). | `40-waterfall.js:194-201` |
| M3 | The RTTY "decode" is a teleprompter unconnected to the FSK audio; the model's own `charAt()` is dead code. Waterfall paints a 340 Hz shift while audio plays 170 Hz. | `40-waterfall.js:196`, `20-band.js:263-268`, `30-audio.js:117-119` |
| M4 | Restored zoom span is never reflected: chip label and aria-label lie on every return visit (`boot()` writes `LP.rx.span` directly, skipping `reflectZoom`). | `40-waterfall.js:317-320` |
| M5 | One poisoned `lp-trace` entry throws inside `tuneTo()` and permanently breaks tuning — the storage seatbelt covers `log`/`rx` but not `trace`. | `60-interact.js:40-51` |
| M6 | Ghost "asking" audio and S-meter ignore tuning offset and band — audible from anywhere on any band while invisible on the glass. | `30-audio.js:372-375`, `30-audio.js:205-207` |
| M7 | Bare-key map (1/2/3/Z/L) goes dead whenever any chip or the dial has focus — and the dial focuses itself on every drag; PgUp/PgDn/Home/End only work with dial focus, against the README's control table. | `60-interact.js:155-169, 254-273` |
| M8 | Sound chip's first click can permanently opt the user out of the audio they were trying to enable (chip reads OFF pre-gesture; clicking it toggles `enabled` false and persists the opt-out). | `30-audio.js:70-76` |
| M9 | Hold-to-log — the core reward loop — has no visible progress and no visible completion moment beyond the live region. | `70-log.js:124-146` |
| M10 | Reduced-motion users get zero onboarding: the first-visit operator's card is gated behind the motion check. | `80-arrival.js:12-18` |
| M11 | The net event overclaims: "every station keys the same three characters" — only beacons and THE CONSTANT participate (4 of 10; zero stations on SKY). | `20-band.js:116-123` |
| M12 | Forced-colors pressed-chip styling self-defeats in light high-contrast themes. | `02-shell.css` |
| M13 | Small-text contrast failures: QSL signature 3.3:1, canvas scale labels 3.0:1, SPAN badge 3.7:1 (WCAG 1.4.3). | `02-shell.css`, `40-waterfall.js:137-151` |
| M14 | Focus drops to `<body>` when the operator's card closes (WCAG 2.4.3). | `60-interact.js:241-251` |
| M15 | Masthead decoder types morse that is not on the air when locked on POSTCARD, and runs out of phase during its real CW ident. | `40-waterfall.js:203-216` |
| M16 | Adding a band requires touching 4+ files; `aria-valuemax="240"` hardcodes an undocumented all-bands-are-240-kHz invariant; the passband selectivity formula is duplicated three times across two modules. | `03-body.html:21`, `30-audio.js:202,230`, `70-log.js:39` |

### Low severity (sampling; all confirmed or independently hand-verified)

- README says the SSTV picture is "painted thirty-two lines at a time" — no such
  mechanism exists (the paint budget is 16 lines/frame).
- README implies one machine-perfect morse hand is the tell — there are four (all
  three beacons plus THE CONSTANT key clean).
- Underbrush is seeded once at load (stale across midnight); the "daily" rollover
  lands at 01:00 during DST; underbrush CW is keyed at frame rate, not scheduled.
- First-visit glide fights live user input for 2.6 s.
- Wheel tuning ignores delta magnitude (coarse on trackpads); chip touch targets
  ~31 px; ribbon tap zone has no affordance.
- Waterfall noise floor rises with frequency — inverted from real HF atmospheric
  noise. SK sign-off keyed as two letters, not the prosign.
- Audio hot path allocates garbage and redundantly reschedules automation per frame;
  `note()` omits the onended cleanup every other one-shot voice performs; the meter
  repaints its static scale every frame.
- 12.4 KB of CSS is emitted inside `<body>` (non-conforming); no
  `-webkit-backdrop-filter`; no `og:image:alt`; SVG-data-URI-only favicon (older
  Safari 404s on `/favicon.ico`); `robots.txt` on a project-pages subpath is never
  read by crawlers, making it (and its Sitemap directive) decorative; the 404 page's
  only link (`./`) self-loops for nested missing paths; no-JS brochure hides the
  `h1` and offers no link out.

---

## Per-dimension verdicts

**Correctness 6.5** — Careful core (lookahead keying, storage seatbelts, the net
capstone surviving a mid-window reload) undermined by M1/M5/M6/M7 and the ticker
re-entrancy defect (H1) that code-reading alone missed.

**Accessibility 7.5** — Every README a11y claim is real code; blind-user task
completion genuinely works; docked for H3 (reflow), M13 (contrast), M14 (focus),
M12 (forced colors).

**Performance 9.0** — All four README performance claims honored verbatim; hot-loop
cost awareness is written down and acted on; remaining findings are micro-level.
(H1 is charged to correctness/runtime, not here — the steady-state design is
excellent; the runaway is a logic bug.)

**UX 7.0** — Onboarding under a prose-forbidding constraint is elegantly solved
(operator's card, arrival glide into AURORA); lock feedback is layered and honest;
docked for M7/M8/M9/M10 and touch-target/affordance nits.

**Runtime 6.0** — Zero console errors in every run and every degraded mode honored,
but instrumentation surfaced H1 and M1 — both README-claim breaks a user can hit in
their first minute.

**Architecture 6.5** — Deterministic, verifiable build; exemplary comment culture
("the duck lives HERE, not on the shared gain"); single-model claim structurally
true. Docked for M2/M3/M4/M16 — the RTTY decoder reimplementing the model it sits
next to is exactly the "two renderings" drift the architecture exists to prevent.

**Content 7.5** — The fiction is real and often exceeds its own advertising; the
elegy design (every anomaly gated on `present()`) is coherent across five
subsystems. Docked for the two capstone breaks: H2 ("Once.") and M11 (the net).

**DSP 6.5** — Morse, propagation, QSB, RST practice, 45.45-baud display pace, and
the 170 Hz audio shift are all genuine; docked for M3 (RTTY carries no data), fake
SSTV physics, and fixed-pitch non-CW voices.

**Platform 7.5** — Complete correct head, real 1200×630 OG card, byte-reproducible
build, exceptional API conservatism (verified by exhaustive grep: no OffscreenCanvas,
roundRect, structuredClone, `:has()`, optional chaining…), honest 404/sitemap/robots.
Docked for the low findings above.

---

*Companion document: [`PROPOSAL.md`](./PROPOSAL.md) — the maximal upgrade plan built
from this evaluation.*
