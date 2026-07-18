# The Listening Post — PLUS ULTRA

*The maximal upgrade plan. Built directly on the confirmed findings in
[`EVALUATION.md`](./EVALUATION.md): every defect becomes a fix, every fix becomes a
feature, and every feature deepens the one thing this app already does better than
almost anything on the web — a haunted band that is actually modeled, not narrated.*

The plan is five phases. Each phase is independently shippable and ordered so that
honesty comes before depth, depth before breadth, and breadth before spectacle.

---

## Phase 0 — MAKE IT TRUE
*Every sentence in the README becomes literally true. Every confirmed finding dies.
This phase alone moves the grade from B to A−.*

### The three highs

1. **Fix the ticker re-entrancy (H1).** Two-line fix with a big payoff:
   guard the end-of-frame reschedule (`if (rafId === null) rafId = rAF(frame)`) and
   make `kick()` a no-op while a frame is executing (`let inFrame` flag). Add a
   regression test that counts task executions across a synthetic fling. The fling
   — currently the app's most dangerous gesture — becomes its most delicious.

2. **Honor "Once." (H2).** On boot: `if (LP.log.has('THE OTHER'))
   ghost.state = 'gone'`. One line. The ghost asks once per *lifetime*, as promised —
   which is what makes hearing it matter.

3. **Reflow at 400% zoom (H3).** Replace global `overflow:hidden` with scoped
   overflow on the glass; let the page scroll under zoom/reflow (WCAG 1.4.10). Bump
   the three failing small-text contrasts to 4.5:1 (M13).

### State that tells the truth

- `reflectBand()` and `reflectZoom()` unconditionally at boot (M1, M4) — the chips
  never lie again, and the documented `2` key always means something.
- Seatbelt `lp-trace` like every other key: validate it's a plain object of finite
  numbers, else reset (M5). Never let a corrupt keepsake brick the tuning.
- Sound chip: if the context has never run and `enabled` is true, the first click
  *arms* instead of toggling off (M8). The chip's label should match its next action.
- Focus returns to the Card chip when the operator's card closes (M14); reduced-motion
  visitors get the card too, shown statically (M10).
- The arrival glide yields instantly to any user tune (first `tuneTo` cancels it).

### One model, zero drift

- **Delete the teleprompter.** The RTTY decoder consumes `st.charAt(t)` — the model
  function that already exists and is currently dead code (M2, M3). The wraparound
  blanking dies with it. The masthead decoder gets a POSTCARD mode driven by
  `st.prog(t)`/ident phase so it never types morse that isn't on the air (M15).
- Extract `LP.selectivity(off, bw)` — one passband formula, three call sites (M16).
- Derive `aria-valuemax` from `BANDS` at boot; a band becomes data, not a diff.

### Keyboard that always works

- Move the full key map (arrows, PgUp/PgDn, Home/End, 1/2/3, Z, L, Esc) to one
  document-level handler that works regardless of focus, guarded to skip modifier
  combos (no more hijacking Ctrl+1) and real form controls (M7). The dial keeps its
  slider semantics; the map stops caring where focus landed.

### The net keeps its promise (M11)

"Every station keys the same three characters at the same moment" — make it *true*,
in each station's own voice, which is far eerier than beacons alone:

- THE LATTICE reads `7 3 7 3 7 3` in tone-digits, off-schedule, once.
- THE FORECAST types `73 73 73 +` into its FSK stream.
- HOMECOMING sounds three tones in dit-dah rhythm; THE CROSSING swings its bell in
  morse cadence; AURORA's record pauses and its carrier keys plain CW — the one time
  the music stops.
- POSTCARD's next card carries the caption `73 · ALL STATIONS`.

### Small honesty items

- Give the three named beacons *fists* (`humanize()` with per-station seeds) so THE
  CONSTANT is the **only** machine-perfect hand on the band — the README's tell
  becomes real and the anomaly gets sharper.
- SSTV paints in true 32-line bursts (or the README says 16 — pick the code).
- Underbrush re-seeds at local midnight (recompute `daySeed` per slot roll); SK keyed
  as a true prosign (no inter-letter gap).
- Ghost "asking" voice obeys the passband and band like every other signal (M6).
- Hold-to-log progress: a pencil line literally draws itself under the nameplate
  during the 4.2 s hold, and the completed entry flashes once in the ribbon (M9).

### Platform sweep

CSS into `<head>` at build; `-webkit-backdrop-filter`; `og:image:alt` +
`twitter:image:alt`; a real `favicon.ico` fallback; noscript brochure keeps the
`h1` and links to the repo; 404 link made absolute (`/listening-post/`); drop the
decorative `robots.txt` Sitemap line or document why it stays.

---

## Phase 1 — MAKE IT DEEP
*The simulation stops approximating radio and starts being radio. Flagship goal:
__real ham software can decode this app__ — that's the review it deserves.*

1. **Real Baudot RTTY.** Encode the forecast as actual ITA2 frames at 45.45 baud —
   start bit, five data bits, 1.5 stop bits — driving the FSK oscillator's
   mark/space directly. The on-screen decoder becomes an honest FSK-edge reader of
   the same span list. Point **fldigi** or a phone RTTY app at the speaker and the
   desert forecast prints. Zoom to 12 kHz and individual start bits resolve in the
   raster. (The display pace already matches 45.45-baud character rate — the fiction
   was one layer short of true.)

2. **Real SSTV (Robot 36 or Scottie S1).** Actual line timing, sync pulses, and
   frequency-encoded luma. Mistuning then produces *authentic* artifacts (slant from
   timing error, brightness shift from frequency error) instead of the current
   inverted physics — and a phone running Robot36 decodes the postcard. The keepsake
   pipeline stays; the postcard becomes portable folklore.

3. **A living ionosphere.** Layer onto `bandFactor`: seeded geomagnetic weather
   (K-index by day), rare **sudden ionospheric disturbances** — every band drops for
   minutes while the sferics spike — sporadic-E openings that briefly light HIGH at
   night, and auroral flutter (rapid shallow AM) on signals during storm nights.
   Invert the noise-floor slope (atmospheric noise belongs on the low bands).
   THE FORECAST starts *forecasting it*: "ALL SECTORS ROUGH BAND TONIGHT".

4. **Receiver realism.** Underbrush CW scheduled via `keyEdges` like the beacons
   (the same fix the beacon path already got); AGC with audible recovery time;
   optional selectable sideband (USB/LSB) so tuning across zero-beat flips the
   pitch slope — the moment CW operators smile; a soft passband-edge hiss so the
   window has walls you can hear.

5. **S-meter with units.** S1–S9+ scale, logarithmic mapping, needle overshoot —
   and the RST report derives R from actual QRM/QRN at log time (a crowded
   frequency earns its 3).

---

## Phase 2 — MAKE IT ALIVE
*The band gets a calendar, a memory, and a community surface. Wall-clock anchoring
is the app's superpower — spend it.*

1. **New residents** (each one modeled, never narrated):
   - **THE PIPS** — a time station: five short, one long, on the minute, every
     minute, forever. The most comforting station on any band.
   - **THE JAMMER** — some days a rasping wall parks itself *on* THE LATTICE and the
     numbers move 2 kHz up to escape it. Numbers-station lore, played straight.
   - **WEFAX** — a weather chart that draws over nine minutes; finished charts pin
     to the log beside the postcards.
   - **THE SISTER** — one night a year (the cross-read explained), a fourth beacon
     appears and the others go silent while she sends. The date is derivable from
     the cross-read schedule by anyone keeping notes.
2. **A real cipher.** The LATTICE groups become a book cipher keyed against the
   FORECAST text — solvable, once, to a single sentence. No announcement; let the
   internet find it. (The trace-day mechanic already proved the design language.)
3. **DX nights.** A handful of one-night-only stations seeded by UTC date so *every
   listener on Earth* shares the same rare catch — "were you on the band last
   night?" becomes a real conversation.
4. **Seasonal traffic**: solstice/equinox specials, a New Year's net where the
   band counts down in tone-digits, an anniversary transmission on the repo's
   first-commit date.
5. **The long elegy.** After THE OTHER departs, the band changes over *weeks*:
   the room stays empty, then one night — a new chair scrapes. Someone new is
   moving in. The app's timeline becomes longer than any session.

---

## Phase 2½ — THE FAR FIELD
*The horror deepening. Cosmic-industrial dread — the patient, biological, wrongly-
quiet kind — delivered entirely through the receiver. In antenna theory the far
field is the region where the wave has detached from whatever made it and travels
on its own. That is the register: signals whose senders are no longer the point.*

**The design law (before any feature):** the horror is only allowed to arrive the
way everything else on this band arrives — modeled, wall-clock-seeded, rare,
shared, unannounced, and *deniable*. Every event must leave the listener a mundane
explanation they can almost believe. No lore text, no names from any franchise, no
jump scares, no screams. Dread through implication; the moment the app confirms
the horror, the horror dies. And like everything else here: all of it ends.

The bridge that keeps the fiction honest is that shortwave already has its own
cosmic-horror canon — **real, documented, unexplained radio phenomena**. We
implement those, played straight:

1. **THE WARNING.** A distress beacon on the far edge of HIGH — automated,
   repeating, slowly degrading, keying what any operator would read as a mayday
   with coordinates. It logs that way too. But the cycle is long, and once per
   hour it keys one additional group the short-stay listener never hears — and the
   full message, assembled by someone patient, is not a request for help. It is
   telling you not to come. (The oldest trick in cosmic horror: the signal you
   misread until you've already answered. Implementation: one long compiled-morse
   cycle whose tail group inverts the reading; the log entry quietly gains a
   second line if you were on frequency for the tail.)

2. **LONG DELAY.** Long-delayed echoes — the real LDE phenomenon, reported since
   1927 and never fully explained. On rare seeded nights, a station you just left
   repeats its last few seconds *behind* you: same keying, 8–40 seconds late, a
   few hundred hertz low, weaker, as if the band remembered it. Implementation is
   pure model: replay the same compiled spans at an offset frequency with a delay
   — one function, no new assets. Deniability is built into the phenomenon
   itself; even the 1920s engineers argued about what it was.

3. **THE SLEEPER.** One unnamed carrier in the underbrush, on rare seeded nights,
   carries amplitude modulation at twelve cycles per minute — the rate of a large
   animal breathing at rest. It is not on the station list. It is not loggable.
   Occasionally the breathing pauses — slightly too long — and resumes. Nothing
   about it is ever acknowledged anywhere. (Slow AM envelope on an existing minor;
   fifteen lines of code; the single most Alien-shaped object on the band.)

4. **THE PIPS FAIL.** Once THE PIPS exist (Phase 2), clock horror becomes
   available: on one seeded night a year, a pip is missing. Two minutes later,
   another. The failures spell something in their spacing, for anyone keeping
   time. A time station losing time is the industrial equivalent of a heartbeat
   skipping — the most primal wrongness the fiction can afford without a single
   new sound.

5. **HULL NOISE.** The room-behind-the-buzzer system, generalized: on geomagnetic
   storm nights (Phase 1's ionosphere), very low, behind THE FORECAST — long
   metallic groans, strain without source, the sound of an enormous structure
   settling. In-fiction it is the antenna farm in the wind. In the ear it is a
   hull. The ambiguity *is* the feature. (Reuses `roomEvent`'s scheduler with a
   new synth voice; the storm gating means two listeners can corroborate.)

6. **THE DUET.** Post-departure only — the elegy's dark twin. Hold zero-beat on a
   quiet frequency long enough and, very rarely, a second heterodyne rises a few
   cents from your beat pitch: a slow, physical binaural throb that stops the
   instant you move the dial. It never asks anything. It has no callsign. Where
   THE OTHER wanted to know who was there, whatever this is already knows — it is
   just *matching you*. (A second oscillator at `beatPitch ± 3 cents`; the
   detune, not the volume, is the horror.)

7. **ONE ROW EARLY.** The single permitted lie. On LDE nights only, once: the
   waterfall paints a signal's keying one raster row *before* the audio sounds
   it. The app's foundational law — what you see is exactly what you hear — is
   broken by exactly one row, exactly once, on nights the band is already
   echoing. The one rule this app never breaks, breaking, is the strongest
   sentence it can say. (Implementation: the raster's row clock leads the audio
   clock by one row-period for a single seeded window; a comment in the source
   marks it as the only sanctioned violation of the house rule.)

**Escalation across the arc:** these do not all run at once. LONG DELAY and THE
SLEEPER are ambient-rare from the start; THE WARNING is findable by anyone
patient; THE PIPS FAIL and HULL NOISE ride Phase 1–2 systems; THE DUET and ONE
ROW EARLY unlock only after the departure — the band does not get safer once the
ghost is gone. It gets quieter. Then it gets *attentive*.

---

## Phase 3 — MAKE IT YOURS
*The listener gets keepsakes, tools, and a bedside radio.*

1. **PWA.** Manifest + service worker — the app is already one self-contained file;
   installable and offline in an afternoon. The Listening Post becomes a genuine
   3 AM bedside object, which is the whole fiction.
2. **Log as artifact.** Export the station log as a rendered **QSL card image**
   (shareable) and as **ADIF** — the real ham log interchange format. Logged SSTV
   cards and WEFAX charts embed in the export.
3. **Jump-back.** Click any log entry to retune there; double-tap the ribbon to hop
   between your pencil ticks. The log stops being a list and becomes a map.
4. **Feel.** `navigator.vibrate` ticks on the relay clunk and lock (mobile);
   wheel tuning scales with `deltaY` magnitude (trackpad-fine, wheel-coarse);
   44 px touch targets; a visible affordance on the ribbon's tap zone.
5. **Volume.** One knob (a real `<input type=range>`), persisted — the only
   receiver control the set is missing, and an accessibility win besides.
6. **Non-visual band scanning.** While arrow-sweeping, the live region murmurs
   S-meter peaks ("signal rising… strong at 6 727") so a blind listener can *hunt*,
   not just visit known integers — the last gap in the non-visual pathway.

---

## Phase 4 — MAKE IT BULLETPROOF
*The engineering culture the code already aspires to, enforced by machines.*

1. **Tests** (plain node, no framework): morse compile golden vectors (1-3-7 ratios,
   decode round-trip); `keyEdges` ↔ `morseOn` consistency; Baudot encoder
   round-trip; seed determinism across timezones and DST; storage-seatbelt fuzzing
   (every `lp-*` key poisoned every way); build determinism (byte-identical output).
2. **CI** (GitHub Actions): build + tests + the Playwright smoke suite from this
   evaluation — console-error gate, fling instrumentation (regression for H1),
   no-JS/reduced-motion/forced-colors screenshots, axe-core audit, Lighthouse
   budget (≤120 KB, zero external requests).
3. **A dev harness** (`?dev=1`): time-warp slider to scrub the wall clock — preview
   HOMECOMING at noon, THE CROSSING on the wrong night, the net without seven logs;
   a station inspector overlay; deterministic ghost trigger. Time-gated content is
   currently untestable by humans in one sitting; this is how it stays polished.
4. **Registry architecture.** One `STATION_TYPES` table owning paint + voice + net
   participation + decoder per type; a new station type touches one file. `BANDS`
   drives every hardcoded 240. The docs promise a second developer can extend it —
   make that true too.

---

## Sequencing and effort

| Phase | Effort | Impact |
|---|---|---|
| 0 — Make it true | ~2–4 days | B → A−: every claim honest, worst bug dead |
| 1 — Make it deep | ~1–2 weeks | The "real software decodes it" reviews |
| 2 — Make it alive | ~1–2 weeks | Return visits, community folklore |
| 2½ — The Far Field | ~1 week | The dread the marketing copy already promises |
| 3 — Make it yours | ~1 week | Install base, shareable artifacts |
| 4 — Make it bulletproof | ~3–5 days | Permanent floor under quality |

Phase 0 is non-negotiable and should ship alone, fast. Phases 1–4 can ship in any
order, but 1 before 2 (depth before breadth) keeps the fiction's spine — *nothing on
this band is faked* — intact as it grows.

**The north star:** every upgrade must survive the app's own house rule. One model,
two renderings. If a feature can't be driven from the band model — if it would have
to be faked separately on the glass and in the ear — it doesn't belong on this band.
