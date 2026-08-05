# Mr. Johnson — Pillar Grammar Plan

**Status: in progress.** Working document for the Phase 2.7 build. Read with
`UNDERSTANDING.md` (what the game is) and `BUILD-PLAN.md` (how we build).

---

## 0. THE TWO REFERENCES, ESTABLISHED

Both were checked rather than recalled, because the whole plan is built on them.

### Sega Genesis Shadowrun (1994, BlueSky Software)
- **Top-down for BOTH exploration and combat** — one view, not a separate battle
  screen.
- **Combat is real-time**, and fights are short. Firearms with ammunition
  management; magic with Drain on the caster; melee viable with the right
  cyberware.
- **The Matrix replaces the runner with a PERSONA** navigating **geometric node
  structures** (CPU, data stores), avoiding **IC** which can do physical harm.
  Objectives: steal data, erase files, crash the system via the CPU node.
- **Runners are recruited per-run or on lifetime contracts.**
- **Karma** from missions, kills and plot, spent directly on stats. Archetypes
  (samurai / decker / shaman) that branch into other skills.
- Travel by taxi between Seattle districts.

Already mirrored in the build: hire tiers (freelance/retainer/permanent),
karma-along-archetype growth, the host node graph with ice, districts, data haul.

### Shadowrun 5th Edition — CONFIRMED, do not drift to 6th
The user confirmed SR5 (2026-08-04). SR6 would replace damage-reduction armour
with Attack/Defense Ratings granting Edge, drop initiative re-rolls and passes,
and add an Edge economy. **We are not doing that.** Keep:
- Dice pool = Skill + Attribute; 5–6 hits; threshold `ceil(tier/2)`; glitches.
- The three-gate chain: Hit → Penetrate (Power vs Armour) → Damage (soak).
- Initiative passes; initiative dice = action count.
- Dual condition tracks; Drain scaling with Force.

---

## 1. THE CORRECTION THIS PLAN IMPLEMENTS

The three pillars currently share **one interaction grammar**. Verified by
comparing live prompt shapes:

```
street   promptKeys: index,label,obstacle,options,projection,tier,total
matrix   promptKeys: index,label,obstacle,options,projection,tier,total
         optionKeys: identical in both
```

Different nouns, identical verbs. Painting three renderers over that yields three
things that look different and play the same.

**But they must NOT become three unrelated games.** Per the user: the loop looks
and plays like Genesis Shadowrun, and the player can **flip in and out of
turn-based mode when not in combat; combat forces turn-based.** That is true of
all three pillars — which is exactly why one shell was right to begin with.

So: **shared mode structure, per-pillar verbs inside it.**

---

## 2. THE SHARED FRAME (all three pillars)

| mode | when | what it is |
|---|---|---|
| **Free** | default outside combat | The crew acts and the world advances alongside. Genesis-like flow. |
| **Turn-based** | player toggles it, or combat forces it | Discrete, ordered, one actor at a time. The existing stepper. |

Rules:
- The toggle is the player's control over **granularity**, never over the rules.
  The same dice resolve the same way in both.
- **Combat forces turn-based** and holds it until the fight ends.
- Leaving combat returns to whatever the player had chosen.

**Critical constraint (user):** a real-time clock must not affect a player whose
interface reads as turn-based. So the world-advance seam is built now but
**performs clocking only** — it counts, exposes counters for tests, and changes
nothing a player experiences until the visual layer lands.

---

## 3. PER-PILLAR VERBS

Each pillar gets its own verbs and its own **pressure clock**. The pressure clock
is what makes a pillar feel like itself.

### 3.1 Street — position and exposure
Pressure clock: **the alert bands** (built).

| verb | what it is |
|---|---|
| `move` | Advance to the next room on the walk. Currently automatic — becomes a choice, because where you stand decides who can see you. |
| `observe` | Read the room before committing: what is here, what has eyes. Costs a beat, buys certainty. |
| `approach` | The existing obstacle interaction. |
| `engage` | Deliberately open combat. Forces turn-based. |

The distinguishing resource is **exposure** — the awareness meter and the watcher
list already model it. `move` makes it a decision rather than a consequence.

### 3.2 Matrix — the persona and the trace
Pressure clock: **Overwatch Score** (SR5) — a rising trace that converges and
ends the run. This is the Matrix's own clock and it replaces alert bands there,
matching the Genesis IC threat.

| verb | what it is |
|---|---|
| `traverse` | Move the persona to an adjacent node. The node graph exists; traversal becomes a choice, not a fixed route. |
| `probe` | Read a node before entering — what ice sits on it, whether it holds data. Costs Overwatch, buys knowledge. |
| `run` | Execute against ice or a node. |
| `exfiltrate` | Pull data out. The haul exists; taking it becomes an act with a cost. |
| `jack out` | Leave. Clean if you are not traced; damaging if you are. |

The distinguishing resource is **Overwatch**: every illegal act raises it, and
convergence ends the run regardless of how well the crew is doing. A decker
plays against a timer no one else has.

### 3.3 Astral — THE LATTICE
Pressure clock: **the tether** (built, Magic × 6).

The astral's distinct flavour is that magic is not a roll, it is a **structure
you manipulate**. Every construct — a ward, a spirit's binding, a spell being
assembled — is a lattice of mana threads. One metaphor, three uses.

**The dials (user spec, 2026-08-04):**

| stat | what it governs |
|---|---|
| **Magic** | how hard you can push at MAX — your ceiling, and your max threads when assembling |
| **Force** | what **% of your max** you are pushing right now. A throttle on Magic, and Drain scales with it |
| **Sorcery** | how strong a **single move** is — how far one push carries you toward the goal |
| **Conjuring** | the same measure, for summoning and banishing spirits |
| **Assensing** | the **quality of information** about each thread — its strength, whether it is a dead end. NOT whether threads are visible; you see the lattice, assensing tells you what you are looking at |

**The three uses:**

1. **Break a ward** — *unwind the spell far enough to slip through before it
   cranks itself back closed.* A race: you unwind, it re-winds, you need a window
   wide enough to pass. Progress against decay.
2. **Banish a spirit** — *cut the threads in the right order, like defusing a
   bomb.* There is a correct sequence. Assensing tells you which strands are
   dead ends and which are load-bearing; a wrong cut backlashes.
3. **Cast / summon** — *assemble your own circuit.* The spell or spirit defines
   the **shape**; Magic sets your **max threads**; Force decides **how many you
   commit**.

**The design constraint that must hold:** the player is the Johnson and never
personally goes. So the puzzle must never be a test of the PLAYER's dexterity or
pattern-recognition — that would make a brilliant mage and a mediocre one play
identically and quietly replace runner skill with player skill, gutting the
roster loop. The runner's stats set the puzzle's parameters; the player's choices
are the modifier on top.

### 3.4 Bound helpers — watcher spirits and AGENTS
The user's parallel: summoning a spirit should mirror running an autonomous
program in the Matrix. **Both are one model with two skins.**

**No technomancers, no sprites.** Sprites are technomancer-only (Compiling,
Resonance, Fading) and the user does not want that class. The thing they were
remembering is the **Agent** — and agents are plain decker gear:

| SR5 fact | consequence here |
|---|---|
| Agents are rated **1–6**, autonomous, with their own persona icon | no new attribute, no new skill, no new origin |
| Each occupies **one program slot** | the deck's capacity is the cost |
| A deck runs agents of **rating ≤ deck rating** | the existing deck tiers (3/6/9) already gate it |
| Explicitly **"dog-brain"** | genuinely limited, not a second decker |
| Unexpected situation → **Rating × 2 test**; on failure it acts wrongly or **stops and asks for instructions** | autonomy with a real edge — this is the flavour |

`ITEM_TEMPLATES.watchdog` ("Watchdog Agent", category `program`, requires a deck)
already exists as a flat dice bonus. It becomes an actual entity.

**The shared model:** a bound helper owes you **N tasks** — effectively rounds it
helps — and each task it spends is a **separate action**, so it widens what the
crew can do in a beat rather than doing it better.

| | watcher spirit | agent |
|---|---|---|
| pillar | astral | matrix |
| acquired by | Conjuring, via the Lattice (assemble a circuit) | loaded onto a deck |
| cost | Drain | a program slot |
| capped by | Force | deck rating |
| brains | limited | dog-brain, stalls on the unexpected |

---

### 3.5 Spells in meatspace — in and out of combat
Magic is not an astral-only pillar. A mage walks the street with the crew, and
SR5 spells are cast **into physical reality** from a body standing in it. The
astral is where you *project*; spellcasting is something you do anywhere.

**Stubs now, content later.** The point is the seams, not a full grimoire.

SR5's five categories, each with a representative entry or two:

| category | examples | where it lands here |
|---|---|---|
| **Combat** | Manabolt (direct), Fireball (indirect) | a combat action alternative to a weapon; direct vs indirect decides whether armour applies |
| **Detection** | Detect Life, Clairvoyance | out of combat: buys knowledge, like `observe` but through mana |
| **Health** | Heal, Increase Reflexes | Heal touches `runner.wounds`; Increase Reflexes is the `initiativeDice` channel — the seam already exists |
| **Illusion** | Invisibility, Confusion | Invisibility feeds `run.concealment`, the hook already built for exactly this |
| **Manipulation** | Levitate, Armor, Physical Barrier | Armor is the `armour` channel; Levitate/Barrier bypass or create obstacles |

**Everything it needs already exists:**
- **Force / Drain** — `maxForceFor` (Magic + 2), `drainValueFor`, `resistDrain`,
  with overcast Drain going physical. Complete.
- **The combat modifier layer** — channels `accuracy`, `defence`, `power`,
  `damage`, `armour`, `soak`, `initiative`, `initiativeDice`. A sustained combat
  spell IS an effect; nothing new is required to hold one.
- **`run.concealment`** — built when the witness rules changed, explicitly as the
  hook a spell would plug into.
- **The Lattice** — casting resolves as assembling a circuit, so spells depend on
  it and are built after.

**Sustaining** is the cost that makes spells a decision rather than free power:
a sustained spell should hold an effect open and charge for it. The effects layer
already supports an indefinite effect with a channel, so sustaining is a
`sustained` effect on the caster carrying a penalty — the standard tabletop
trade, expressed in machinery that already exists.

---

## 4. BUILD ORDER

1. ~~`js/core/tempo.js` — the mode machine and world-advance seam.~~
   **DONE** `c0fb7eb`. Proven inert: identical output at 0/7/50 ticks.
2. ~~Wire mode into the run — combat forces turn-based.~~ **DONE** `c0fb7eb`.
3. ~~`js/models/lattice.js` — the astral puzzle.~~ **DONE** `674e548`.
4. ~~Spells in meatspace.~~ **DONE** `b6c6e2a`.
5. ~~`js/models/helpers.js` — spirits and agents.~~ **DONE** `87c7e50`.
6. ~~Astral grammar — assense / drift / manifest / engage.~~ **DONE** `69197aa`.
7. ~~Matrix grammar — traverse / probe / run / exfiltrate / jackOut + Overwatch.~~
   **DONE** `0702d8a`.
8. ~~Street grammar — move / observe / approach / engage.~~ **DONE** (this pass).
9. **Docs** — fold into `UNDERSTANDING.md` §3 and `SYSTEM-STATE.md`. *Remaining.*

## 4b. WHAT LANDED — THREE PILLARS, THREE CLOCKS

The exercise is complete when each pillar pressures a crew in its own way and
carries none of the others' machinery. Probed in class 21:

| pillar | verbs | clock | character |
|---|---|---|---|
| **street** | move / observe / approach / engage | alert bands | **social** — moves only when something perceives you, so care is free but slow |
| **astral** | assense / drift / manifest / engage | the tether | **absolute** — runs whether or not anyone noticed; your body is waiting |
| **matrix** | traverse / probe / run / exfiltrate / jackOut | Overwatch → 40 | **arithmetic** — climbs the moment you touch anything; you are being counted |

Three reasons to hurry: *they might see you* / *the cord is finite* / *they are
already counting.*

Probes hold that each pillar's prompt returns `null` on the other two, so the
grammars cannot quietly re-merge.

---

## 5. INVARIANTS TO HOLD THROUGHOUT

- The **same dice** resolve in both modes. Mode changes granularity, never math.
- **Combat always forces turn-based**, in every pillar.
- The world-advance seam **must not** alter any player-visible outcome yet.
- Quick-resolve stays available and correct for every pillar.
- Nothing runs out through use; repetition escalates (see `UNDERSTANDING.md`
  §10.5).
- Per-run memory keys on the **obstacle object**, never the route index.
- SR5, not SR6.
