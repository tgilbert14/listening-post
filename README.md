# The Listening Post

**A shortwave receiver at 3 AM. The band is open.**

An interactive showcase by [Desert Data Labs](https://desertdatalabs.com): a longwave radio room
rendered entirely in procedural canvas and WebAudio — no frameworks, no images, no audio files.
One model is the single source of truth: the waterfall paints it and the audio engine sounds it,
so what you see is exactly what you hear. CW beats against the BFO, which means the pitch of a
beacon **is** your tuning error. Signals fade on slow ionospheric cycles. Lightning crashes are
broadband on the glass and in your ears at the same moment.

Three bands, and the traffic runs on the wall clock whether anyone is listening or not:

- **Beacons** keying real morse, all night, forever
- **THE LATTICE** — a buzzer that reads five groups of five in tone-digits; the groups change daily
- **THE FORECAST** — 45-baud RTTY carrying the weather for places without weather stations
- **AURORA** — someone, somewhere, is playing records through 2,000 miles of ionosphere
- **POSTCARD** — an SSTV station: every six minutes, a new procedurally-drawn picture, painted
  thirty-two lines at a time; tune it badly and the lines come in skewed and snowy
- **HOMECOMING** — eleven tones, only transmitted after dark, your local dark
- and if you hold a quiet frequency long enough, something notices. It drifts toward your dial,
  falls to zero-beat, and asks who was there. Once.

Hold a signal and it gets pencilled into the **station log** (the book survives the night).
Log enough of the band and, once, every station keys the same three characters at the same
moment — the net acknowledging a new listener.

**Live:** https://tgilbert14.github.io/listening-post/

## The controls

| Verb | Pointer | Keys |
|---|---|---|
| Tune | drag the glass or the dial strip; wheel for fine work | arrows (±0.1 / ±1), PgUp/PgDn (±5), Home/End |
| Jump across the band | tap the ribbon at the top of the glass | — |
| Change band | GROUND / SKY / HIGH chips | `1` `2` `3` |
| Station log | LOG chip | `L` |

## Build

```
node build.js     # src/ fragments -> index.html (+ fragment.html, headless)
```

Fragments concatenate in order: tokens → shell → body → boot → band → audio → waterfall →
sstv → interact → log → arrival. The build fails loudly if any `__PLACEHOLDER__` survives.

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
  is remembered; hidden tabs are silent — and the ghost refuses to stalk them.
- DPR capped at 2, one rAF ticker, one 512-column raster scrolled with a single self-blit.

Forged by the MITHRIL guild (Desert Data Labs' web-experience crew), July 2026.
