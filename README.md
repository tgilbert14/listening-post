# The Listening Post

**A shortwave receiver at 3 AM. The band is open.**
**A haunted band you can actually tune.**

An interactive showcase by [Desert Data Labs](https://desertdatalabs.com): a shortwave radio room
rendered entirely in procedural canvas and WebAudio — no frameworks, no images, no audio files.
One model is the single source of truth: the waterfall paints it and the audio engine sounds it,
so what you see is exactly what you hear. CW beats against the BFO, which means the pitch of a
beacon **is** your tuning error — and it has a **side**: on USB a signal above the dial beats
high and below beats low; switch to LSB and every pitch on the band turns over. Signals fade on
slow ionospheric cycles that carry real space
weather — a daily geomagnetic index, dayside flares, sporadic-E openings. Lightning crashes are
broadband on the glass and in your ears at the same moment. The set rides its own **AGC**, so a
strong carrier pulls the floor down and the band swells back when it lets go.

The band is **inhabited**. Under the named stations runs an underbrush of dozens of minor
signals — weak CW ragchews, drifting carriers, splatter — seeded fresh each day, never named,
never logged. They exist so the named stations are discoveries in a crowd, not exhibits in an
empty hall. The traffic runs on the wall clock whether anyone is listening or not:

- **Beacons** keying real morse, all night, forever
- **THE LATTICE** — a buzzer that reads five groups of five in tone-digits; the groups change
  daily, and they are not random — they are an enciphered message, solvable if you keep notes
- **THE FORECAST** — real 45.45-baud ITA2 Baudot RTTY carrying the weather for places without
  weather stations. Point a decoder at the speaker and it prints; the on-screen sub-line decodes
  the same bitstream you hear
- **AURORA** — someone, somewhere, is playing records through 2,000 miles of ionosphere
- **POSTCARD** — an SSTV station transmitting **real Robot 36**: a VIS header, then 240 scan
  lines of sync, luma, and chroma, every six minutes. Point a phone running an SSTV decoder at
  the speaker and see what develops. Tune it badly and the picture pays for it. Sit with one to
  the end and the finished card is **pinned into your log** as a keepsake
- **HOMECOMING** — eleven tones, only transmitted after dark, your local dark
- **THE CROSSING** — some nights, a bell far away over 6660. About one night in four, seeded by
  the date. Hearing it at all is the event
- **THE PIPS** — a time station: five short, one long, on the minute, every minute, forever
- and if you hold a quiet frequency long enough, something notices. It drifts toward your dial,
  falls to zero-beat, and asks who was there. Once.

Some listeners keep further notes: a weak signal that never fades while everything around it
breathes; a room faintly audible behind the buzzer; a station that once keyed its sister's name;
morse hands that wobble like hands — and one that doesn't. Some days the numbers arrive two
kilohertz high, shouldering past a wall of rasp that wasn't there yesterday. Some nights, the
same night for every listener on Earth, a stranger crosses the sky and is gone by morning. And
a few keep notes they don't show anyone: a band that repeats what it just heard, seconds late
and a shade low; a mayday that stops sounding like one if you stay; breathing where only
machines should be. None of this is announced, none of it is explained, and all of it ends.
Watch the needle.

**Zoom** the window from 48 kHz down to 12 kHz and the keying resolves in the raster — dits and
dahs become individually legible. The **dial has mass**: fling it and the weighted flywheel coasts,
shedding speed against friction. Switching bands throws a **relay** you can hear.

Hold a named signal and it gets pencilled into the **station log** the way an operator keeps one —
UTC timestamp, band, and a signal report in RST computed from what the set is actually hearing
(the book survives the night). Click a pencilled line to **retune straight back to it**. The log
exports as **ADIF** — the real amateur-radio interchange format, openable in any ham logger — or
as a **QSL card** image. Log enough of the band and, once, every station keys the same sign-off
in unison — the net acknowledging a new listener.

The receiver **installs**: it is a PWA with a service worker, so you can add it to a home screen
and it runs at 3 AM with the wire cut. A **volume** knob rides beside the chips, and its setting
is remembered.

**Live:** https://tgilbert14.github.io/listening-post/

## The controls

| Verb | Pointer | Keys |
|---|---|---|
| Tune | drag the glass or the dial strip; wheel for fine work; fling the dial to coast | arrows (±0.1 / ±1), PgUp/PgDn (±5), Home/End |
| Jump across the band | tap the ribbon at the top of the glass | — |
| Zoom the window | 48/24/12 kHz chip | `Z` |
| Sideband (flips the CW pitch sense) | USB/LSB chip | `S` |
| Change band | GROUND / SKY / HIGH chips | `1` `2` `3` |
| Station log (retune / export from it) | LOG chip | `L` |
| Sound on/off · volume | SOUND chip · volume slider | — |
| Operator's card | CARD chip | `Esc` closes |

The keyboard map works from anywhere on the page, not just the dial. Every chip is a real button
with `aria-pressed` / `aria-expanded`; the dial is a real slider that speaks its frequency and any
locked signal; a polite live region announces tuning, locks, and log entries.

## Build & test

```
node build.js                 # src/ fragments -> index.html (+ fragment.html, headless)
node tests/verify-phase0.js   # 17 checks: fling regression, state honesty, a11y, storage poisoning
node tests/verify-phase1.js   # real ITA2 Baudot round-trip, 170 Hz shift, space weather
node tests/verify-phase2.js   # the cipher decode, THE PIPS/JAMMER/WARNING, ADIF, retune
node tests/verify-phase3.js   # Robot 36 frame law, the warp clock, the ?dev workshop
node tests/verify-regress.js  # the live paths static checks miss (SSTV scheduler, ticker, ghost gate)
```

Fragments concatenate in order: tokens → shell → body → boot → band → audio → waterfall →
sstv → interact → log → arrival. The build fails loudly if any `__PLACEHOLDER__` survives.
CI (`.github/workflows/verify.yml`) rebuilds, fails on any drift from the committed `index.html`,
and gates on all five suites. See [`tests/README.md`](tests/README.md).

**Developers:** append `?dev` to the URL for a workshop bar — a clock-warp slider (night-only and
rare-seeded traffic is otherwise unauditable by day) with live flags for the day's seeded events
(K-index, flare, sporadic-E, jammer, echo night, and the rest). Real listeners never see it.

## House rules it honors

- THE JOURNEY IS VISUAL (and audible). The room holds one headline and a handful of chips;
  the only prose the fiction allows itself is what the stations transmit.
- One model, two renderings: every station's keying function drives both the spectrum paint
  and the audio voice. Nothing is faked separately.
- All traffic is anchored to the wall clock: the numbers change daily, the SSTV cycle is
  shared by every listener, the night station keeps YOUR local night (nine to six) — and the ionosphere is real: the low band carries after dark, the high band by day.
- No JS = a complete brochure. Reduced motion = the scroll becomes a still spectrum graph,
  redrawn gently. Forced colors keep chip state on borders.
- Every interaction is keyboard-reachable; the dial is a real slider with value text; a polite
  live region announces tuning, locks, and log entries.
- The sound chip never claims ON until the AudioContext is truly running; an explicit opt-out
  is remembered; hidden tabs are silent — and the ghost refuses to stalk them, or to spend its
  one appearance on a page nobody has touched.
- DPR capped at 2, one rAF ticker (one throwing task can never brick it), one 512-column raster
  scrolled with a single self-blit.

## The record

This build was critically evaluated by an adversarial review panel, then rebuilt against every
finding across five phases and re-graded by the same panel. The write-ups live in
[`docs/`](docs): the original [`EVALUATION.md`](docs/EVALUATION.md), the
[`PROPOSAL.md`](docs/PROPOSAL.md) that planned the work, and the
[`EVALUATION-AFTER.md`](docs/EVALUATION-AFTER.md) that grades the result and is honest about what
is still deferred.

Forged by the MITHRIL guild (Desert Data Labs' web-experience crew), July 2026.
