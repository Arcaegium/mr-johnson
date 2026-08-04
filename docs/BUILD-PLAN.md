# Mr. Johnson — Build Plan

Companion to `UNDERSTANDING.md`. **Read that first.** It is what we are
building; this is how.

---

## 1. THE GOVERNING PRINCIPLE

> **If the systems don't work in simulation mode, they won't work after we've
> spent a ton of time polishing the turds.**

The fun lives in the **systems** — roster market, economy, growth, Discipline
mispricing, job interconnection, the whole Johnson loop. Those are data, menus
and math: buildable and *provable* in text, where iteration is instant and free.
The tactical missions are content those systems generate; their visuals are a
**rendering layer**.

So: build the entire game as text/simulation first — a real, complete, playable
thing — and skin it once the core has earned it. Simulation mode is a lie
detector: it says cheaply whether the loop is fun before a sprite is drawn.

**Why this game suits it:** the whole design is *data*, per "systems are
expensive, rows are cheap." Obstacles are affordance lists; skills gate them; job
grammar generates objectives. The design came out text-ready by accident — a text
renderer reads the data the generators already produce and prints choices.

---

## 2. THE FIDELITY LADDER

Three renderings of the **same** underlying systems.

| rung | what it is | when |
|---|---|---|
| **Quick-resolve** | one aggregate roll, instant. The skip button, and the always-available fallback that keeps the game playable while anything else is half-built. | exists from Phase 1 |
| **Scene-text** | describe the scene from site data, offer the affordance rolls, resolve, mark, advance. Interactive, choice-driven, no rendering. Every system, no skin. | ← we build here first |
| **Full spatial** | top-down positioning, radius movement, cover geometry, the visual pillars. Laid over the proven text core, added per pillar. | Phase 3+ |

**The ladder is about rendering.** Scene-text abstracts the *spatial* tactical
feel — exact positioning, cover angles, the radius dance — into scene choices,
and that specific feel is what the visual layer restores. **Geometry is what
scene-text defers.** Initiative, the action economy, the three-gate chain, health
tracks, Drain, the tether and ammunition all belong at this rung, built to the
depth `UNDERSTANDING.md` specifies.

**Quick-resolve is the skip button.** It stays available forever as the fast
path, and it is measured against the played path rather than standing in for it.

---

## 3. TECH & BUDGET

| area | approach | cost |
|---|---|---|
| Engine | vanilla JS + HTML + Canvas, no build step, classic `<script>` tags, global `MJ` namespace. Reassess a free lib (Phaser) for the spatial phase. | $0 |
| Hub UI | adapt the Profile project — already Arcaegium's terminal-widget visual language in working code | $0 |
| Backend | none, ever. Client-side only; IndexedDB save storing **seeds + deltas**. | $0 |
| Hosting | GitHub Pages under arcaegium.com | $0 |
| Art | procedural/canvas + placeholders; CC0 packs and AI-assisted pixel art per visual phase; paid commission only if the game proves out | deferred |
| Labor | Claude writes code; the user directs, tests, and makes the calls | time |

**Local test:** `python serve.py` (or the preview server named `mrjohnson`) on
port 8123.

**Verification method:** execute `javascript_tool` against the loaded page and
assert on returned values. That is how this project is checked — the Browser
pane does not composite these pages, so measurement is the reliable signal.

**Script tags cache independently of the page.** Use `location.reload()` after
edits and confirm the change took effect.

---

## 4. THE PHASES

| phase | what gets built | ends when |
|---|---|---|
| **0** Foundation | three data models (runner, site, save), seeded RNG, day clock, save/load. A dev harness to inspect generated state. | generate runners and sites from seeds, save and reload them. **✅ DONE** |
| **1** Management Game | hub console, job board, roster/market, hire/watch/retain, gear armory, **quick-resolve missions**, market state machine. | **GO/NO-GO GATE** — is the roster loop fun? **✅ DONE** (console work continues, §5) |
| **2** Text Missions | all three pillars as **scene-text**. Matrix node-crawl, meatspace scene-and-roll, astral sense-and-resolve, multi-front ops. Play-through vs quick-resolve becomes a real choice. | the **whole game** is playable in text — every pillar, every system. **◀ CURRENT** |
| **3+** Visual Layer | rendering laid over the proven core, one pillar at a time (Matrix cheapest first). Then depth & content: crafting benches, tag/combo, faction-heat, job variety, balance, art. | never — the "infinite game" content, added at leisure from a position of a working, fun game |

**The critical property:** after Phase 1 there is a shippable game, and every
phase after is independent and optional. Stop, pause or reorder between phases
and it stays playable.

---

## 5. THE CONSOLE BUILD-OUT

The hub console is the instrument panel over the mechanics
(`UNDERSTANDING.md` §0.II, §10). Phase 1 delivered a working v0; the mechanics
have since grown well past what it surfaces, so the next pass gives every system
a home.

**It also unblocks the last Phase 2 item.** *Simultaneity* — multi-front
operations — needs a UI that can convey several teams acting in one day against
one site. The console build-out is that UI.

### The coverage goal
`SYSTEM-STATE.md` §4 holds the live table of what is built and where it should
surface. In summary, the console should give a home to:

- **Runners:** the full skill list including zeros, career record, bench value
  alongside field value, health tracks, initiative, weapon profile.
- **Sites:** the host graph, room layout, obstacle inventory, loot table, and the
  live Min/Current/Max per axis.
- **Recon:** the obstacle knowledge it buys, surfaced **on the contract**, since
  that is where prep decisions are made.
- **Gear:** Power, AP, armour rating, crafted quality and mark, on a card.
- **Run state:** Drain, tether, extended-test progress, ammunition, the data
  haul — legible during a run and recorded after it.

### The bar
A console that can show the systems is one that can be used to **judge** the
systems, which is why this rung is built first. It stays plain; the drawn CRT
terminal in Phase 3 is a later rendering of the same model.

### The model/renderer split
The console and the pillar worlds both read the same state and issue the same
operations — a street mission needs the crew, their loadout, the site, the intel.
A layer that *describes* console state and operations lets the text renderer and
the CRT renderer be two consumers of one model. Same move `MJ.decide` made for
prompts, one level up.

---

## 6. PHASE 2 STATUS

| id | item | status |
|----|------|--------|
| P2.0 | Attributes into the dice pool | **DONE** |
| P2.1 | Extended tests | **DONE** |
| P2.2 | Turn-based mode | **DONE** — engine and wired |
| P2.3 | Combat, health, Drain, death | **DONE** |
| P2.4 | Planes and witnessing | **DONE** |
| P2.5 | Pillar scene-text | **MOSTLY** — Matrix and astral genres built; **simultaneity remains**, following the console build-out |
| P2.6 | Obstacles as situations | ongoing |

---

## 7. RISKS & HOW THE PLAN ANSWERS THEM

| risk | mitigation |
|---|---|
| Scope — enormous design, tiny team | always-playable phasing; shippable at Phase 1 |
| The loop might not be fun | simulation-first: find out at Phase 1, in the cheapest medium |
| Solo + AI sustainability | each phase self-contained, leaves a working build |
| Art cost/time | deferred to Phase 3+, only spent on a proven game |
| Design drift between sessions | `UNDERSTANDING.md` is read at the start of every session and updated when a call changes; commit messages carry the reasoning |

---

## 8. WORKING PRACTICES

- **Measure, then set the dial.** Sample the real distribution — how many ticks a
  run actually consumes, how many dice a crew actually brings — and set the
  number against it. Every balance value in the game should be traceable to a
  measurement.
- **Exercise every changed path.** A refactor is verified when each call site has
  been run, not sampled.
- **Move the suite baseline deliberately and say which assertions changed and
  why.** The count is a signal; keep it meaningful.
- **One definition per concept.** `dicePoolFor`, `applyCriticalGlitch`,
  `combatLoadoutFor`, `effectiveTier` — anything the resolver, the UI and the
  chooser all need reads from a single function, so all three agree by
  construction.
- **Add the probe with the fix.** Every bug found becomes an assertion.
- **Play it, not just test it.** The suite proves the plumbing; a real
  playthrough is what shows whether the output reads well.
- **PS5.1 note:** use the Edit tool or Python for bulk text changes;
  `Get-Content | -replace` round-trips corrupt UTF-8. Grep `â€` as a canary.
- **`git commit -F <file>`** for anything with quotes in it.
- **Commit messages carry the reasoning.** They are the densest surviving record
  of *why* and have proven load-bearing for recall.

---

## 9. DEFERRED POLISH BACKLOG

Flagged so it is not lost; none of it blocks a system from being provably fun.

- **Flavor text volume** — personality and aims lines are small starter pools,
  cheapest to expand in a dedicated content pass.
- **Obstacle placement tuning** — room post-slot counts by size and patrol/zone
  counts are provisional. Transitions closer to the objective should be able to
  roll **concentrated, layered** security — a maglock, a camera, a turret and an
  armoured guard all between the crew and the payload — rather than one type
  spread evenly along the route.
- **Immunities want a scannable in-fiction tell.** Every Watsonian immunity
  deserves an observable artifact a scout can notice in advance: a visible sensor
  rig, telltale shielding, an aura reading unusually old. The data already
  carries `blocked`/`reason`; the scan interaction and its UI complete it. Same
  "recon is a sensor, not a dial" principle the job board already runs on.
- **Reputation** — define what a job is worth in it and what it unlocks, once
  there is a purchase system for it to modify.
- **Job/mission sequencing** — a real distribution behind mission count, plus the
  player-facing concept of running extra non-contracted prep missions before the
  closing one. Karma to everyone involved, nuyen once.
- **Route-type missions** — movement between two sites, the Gauntlet transit
  case; a reserved `locationType` awaiting a route-shaped site model.
- **Ammunition economy** — restock as a purchase and a logistics decision.
- **Adept powers** — Killing Hands, Improved Reflexes and the rest, which give
  Magic meaning on a non-mage.
- **Leadership effects layer** — see `UNDERSTANDING.md` §13.6.
