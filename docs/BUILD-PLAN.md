# Mr. Johnson — Build Plan

Companion to `UNDERSTANDING.md`. **Read that first.** This file is how we
build; that file is what we are building.

Written for Claude's recall. Explicit over elegant.

---

## 1. THE GOVERNING PRINCIPLE

> **If the systems don't work in simulation mode, they won't work after we've
> spent a ton of time polishing the turds.**

The fun lives in the **systems** — roster market, economy, growth, Discipline
mispricing, job interconnection, the whole Johnson loop. Those are data, menus
and math: buildable and *provable* in text, where iteration is instant and
free. The tactical missions are content those systems generate; their visuals
are a **rendering layer**, not the game.

So: build the entire game as text/simulation first — a real, complete, playable
thing — and skin it only once the core has earned it. Simulation mode is a lie
detector.

**Why this game suits it:** the whole design is *data* per "systems are
expensive, rows are cheap." Obstacles are affordance lists; skills gate them;
job grammar generates objectives. The design came out text-ready by accident.

---

## 2. THE FIDELITY LADDER — AND THE THING I KEEP MISREADING

Three renderings of the **same** underlying systems.

| rung | what it is | when |
|---|---|---|
| **Quick-resolve** | one aggregate roll, instant. The skip button and the always-available fallback that keeps the game playable while anything else is half-built. | exists from Phase 1 |
| **Scene-text** | describe the scene from site data, offer the affordance rolls, resolve, mark, advance. Interactive, choice-driven, no rendering. Every system, no skin. | ← we build here first |
| **Full spatial** | top-down positioning, radius movement, cover geometry, the visual pillars. Laid over the proven text core, added per pillar. | Phase 3+ |

### ⚠ THE LADDER IS ABOUT RENDERING, NOT MECHANICAL DEPTH

> Scene-text abstracts the **spatial** tactical feel — exact positioning, cover
> angles, the radius dance — into scene choices; that specific feel is precisely
> what the visual layer restores.

**Geometry is the ONLY thing scene-text defers.** Initiative, action economy,
the three-gate chain, health tracks, Drain, the tether, ammunition — all belong
at scene-text.

**Failure already committed:** reading this rung as "scene-text means one roll
per obstacle" stalled Phase 2 for a long stretch, because quick-resolve — the
*skip button* — was mistaken for the target and then hardened with invented
constraints. See `UNDERSTANDING.md` §0.1.

### ⚠ AND THE CONSOLE IS NOT THE PRODUCT

The text shell renders **the hub console**, which is ONE PIECE of the game. We
started with it because dispatch, roster, economy and gear must exist and be
operable before a street or a cyberspace has anything to render.

**The console is an instrument panel over the mechanics.** It is finished when
every mechanic is reachable and every piece of state is legible — **not** when
it looks good. It should stay ugly. Do not self-initiate polish; do not solve
web-app problems (breakpoints, mobile overflow, viewport gutters) as though they
were the work. See `UNDERSTANDING.md` §0.2.

**Corollary for the eventual visual layer:** the console and the pillar worlds
will both need to read the same state and issue the same operations — a street
mission needs the crew, their loadout, the site, the intel. Build a layer that
*describes* console state and operations, so the text renderer and the CRT
renderer are two consumers of one model rather than two implementations. Same
move `MJ.decide` made for prompts, one level up.

---

## 3. TECH & BUDGET

| area | approach | cost |
|---|---|---|
| Engine | vanilla JS + HTML + Canvas, no build step, classic `<script>` tags, global `MJ` namespace. Reassess a free lib (Phaser) only for the spatial phase. | $0 |
| Hub UI | adapt the Profile project — already Arcaegium's terminal-widget visual language in working code | $0 |
| Backend | none, ever. Client-side only; IndexedDB save storing **seeds + deltas**. | $0 |
| Hosting | GitHub Pages under arcaegium.com | $0 |
| Art | procedural/canvas + placeholders; CC0 packs and AI-assisted pixel art per visual phase; paid commission only if the game proves out | deferred |
| Labor | Claude writes code; user directs, tests, makes the calls | time |

**Local test:** `python -m http.server 8123` from the project folder, or the
preview server named `mrjohnson`. The Browser pane does not composite this page
reliably — **verify by executing `javascript_tool` against the loaded page**,
not by reading rendered output or screenshots.

**Script tags cache independently of the page.** A cache-busting query string on
the page URL does NOT force sub-resource scripts to re-fetch. Use
`location.reload()` after edits, and confirm the change took.

---

## 4. THE PHASES

| phase | what gets built | ends when |
|---|---|---|
| **0** Foundation | three data models (runner, site, save), seeded RNG, day clock, save/load. A dev harness to inspect generated state. | generate runners and sites from seeds, save and reload them. **✅ DONE** |
| **1** Management Game | hub console, job board, roster/market, hire/watch/retain, gear armory, **quick-resolve missions**, market state machine. | **GO/NO-GO GATE** — is the roster loop fun? **✅ DONE (console UI still owes debt — see §5)** |
| **2** Text Missions | all three pillars as **scene-text**. Matrix node-crawl, meatspace scene-and-roll, astral sense-and-resolve, multi-front ops. Play-through vs quick-resolve becomes a real choice. | the **whole game** is playable in text — every pillar, every system. **◀ CURRENT** |
| **3+** Visual Layer | rendering laid over the proven core, one pillar at a time (Matrix cheapest first). Then depth & content: crafting benches, tag/combo, faction-heat, job variety, balance, art. | never — the "infinite game" content, added at leisure from a position of a working, fun game |

**The critical property:** after Phase 1 you have a shippable game, and every
phase after is independent and optional. Stop, pause or reorder between phases
and it stays playable.

---

## 5. THE CONSOLE DEBT (Phase 1 unfinished business)

Phase 1 nominally delivered the hub console; it delivered a **deliberately ugly
v0** and the mechanics have since massively outgrown it. This is not Phase 3
work and does not conflict with finishing Phase 2.

**It also unblocks the one Phase 2 item that is parked:** *simultaneity*
(multi-front ops) was deferred because it "requires much more developed UI to
properly convey the necessary and appropriate information." The console rebuild
IS that UI.

### Currently built, working, and INVISIBLE OR UNREACHABLE
This list is the actual justification for the rebuild — not aesthetics.

- **Runners:** no full skill list (zeros hidden), no record of what they have
  done (data does not exist), bench value vs field value invisible, health
  tracks / initiative / weapon profile exist only inside a fight.
- **Sites:** the host graph, room layout, obstacle inventory, loot table, and
  the live Min/Current/Max per axis — all generated, none displayed.
- **Recon:** produces confirmed intel that surfaces as one `~3 → 3✓`. The
  obstacle knowledge it buys has no home. The user wants it landing **on the
  contract**, because that is where prep decisions happen.
- **Gear:** Power, AP, armour rating, crafted quality/mark — all real in combat,
  none of it on a card.
- **Everything from the combat/pillar work:** Drain, tether, extended-test
  progress, ammunition, the Matrix data haul — visible for one frame during a
  run, then gone.

### The bar
A console that cannot show the systems cannot be used to **judge** the systems,
which is the entire point of building this rung first.

---

## 6. PHASE 2 STATUS

| id | item | status |
|----|------|--------|
| P2.0 | Attributes into the dice pool | **DONE** |
| P2.1 | Extended tests | **DONE** |
| P2.2 | Turn-based mode | **DONE** (engine + wired) |
| P2.3 | Combat, health, Drain, death | **DONE** |
| P2.4 | Planes and witnessing | **DONE** |
| P2.5 | Pillar scene-text | **MOSTLY** — Matrix and astral genres built; **simultaneity remains**, gated on the console rebuild |
| P2.6 | Retire the scaffolding | partial — `attempts: N` off violent affordances; obstacles still checks in places |

---

## 7. RISKS & HOW THE PLAN ANSWERS THEM

| risk | mitigation |
|---|---|
| Scope — enormous design, tiny team | always-playable phasing; shippable at Phase 1 |
| The loop might not be fun | simulation-first: find out at Phase 1, cheapest medium |
| Solo + AI sustainability | each phase self-contained, leaves a working build |
| Art cost/time | deferred to Phase 3+, only spent on a proven game |
| **A placeholder gets mistaken for the design** | cost most of a session once. Re-read `UNDERSTANDING.md` before extending anything. If a constraint is not written down, do not invent one to make a scaffold behave — say the system is missing. |
| **The console gets mistaken for the product** | cost a planning cycle. The console is an instrument over the mechanics; measure it by coverage and legibility, never by looks. |

---

## 8. WORKING PRACTICES THAT HAVE PROVEN NECESSARY

- **Measure before tuning.** Every balance number that got set by intuition was
  wrong and every one set against a measured distribution was right. The astral
  tether (Magic×2 → ×6) and enemy skill scaling (tier → half-tier) were both
  caught this way.
- **Verify every changed path, not a sample.** A missed call site broke prod
  once.
- **Move the suite baseline deliberately and say why.** Never let assertion
  counts renumber silently.
- **One definition per concept.** `dicePoolFor` exists because the popup
  computed its own pool and silently fell an entire attribute short of what got
  rolled. Two definitions of one thing will drift.
- **Probes over silence.** When a bug is found, add the probe that would have
  caught it.
- **PS5.1 corrupts UTF-8** on `Get-Content | -replace` round-trips. Use the Edit
  tool or Python for bulk text changes; grep for `â€` as a canary.
- **`git commit -F <file>`**, never a here-string with quotes in it.
- Commit messages carry the reasoning — they are the densest surviving record of
  *why*, and they have been load-bearing for recall.

---

## 9. DEFERRED POLISH BACKLOG

Not blockers. Flagged so they are not lost.

- **Flavor text volume** — personality/aims lines are small placeholder pools.
- **Obstacle placement tuning** — room post-slot counts by size and patrol/zone
  counts are provisional. More importantly: edges place obstacles evenly
  regardless of distance from the objective. Revisit so transitions closer to
  the objective roll **concentrated, layered** security — the classic image of a
  maglock, a camera, a turret and an armoured guard all between the crew and the
  payload — rather than one type spread thin.
- **Immunities need a scannable in-fiction tell.** Every Watsonian immunity
  needs an observable artifact a scout can notice in advance (a visible sensor
  rig, telltale shielding, an aura reading unusually old). The data already
  carries `blocked`/`reason`; the scan interaction and its UI are missing.
- **Reputation's scaling and impact** — flat +1 per job, undefined meaning.
- **Job/mission sequencing** — flat uniform 1–3; no player-facing concept of
  running extra non-contracted prep missions before the closing one.
- **Route-type missions** — reserved `locationType`, ungeneratable.
- **Ammunition depth** — tracked in combat; no restock economy.
- **Adept powers** — do not exist; Magic on a non-mage is inert.
- **Leadership effects layer** — see `UNDERSTANDING.md` §13.6.
