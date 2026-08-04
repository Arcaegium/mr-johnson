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

### 3.3 Astral — perception and Force
Pressure clock: **the tether** (built, Magic × 6).

| verb | what it is |
|---|---|
| `assense` | The astral's core verb: read auras. What is here, what it is, whether it has noticed. Nothing else in the game perceives this way. |
| `drift` | Move through the astral, ignoring walls. Wards are the only barrier. |
| `manifest` | Become perceptible to the physical world — powerful, and instantly witnessable. |
| `channel` | Act at a chosen Force, with Drain scaling. Built; becomes an explicit verb. |

The distinguishing resource is the **tether against Force**: everything you do
out of body burns the clock, and pushing Force burns you.

---

## 4. BUILD ORDER

1. **`js/core/tempo.js`** — the mode machine and the world-advance seam.
   Clocking only; no player-visible effect. Exposes counters for tests.
2. **Wire mode into the run** — `run.mode`, combat forces turn-based, toggle
   surfaces in the popup.
3. **Matrix grammar** — traverse / probe / run / exfiltrate / jack out, plus
   Overwatch. Cheapest to prove because the node graph and ice already exist.
4. **Astral grammar** — assense / drift / manifest / channel against the tether.
5. **Street grammar** — move / observe / approach / engage.
6. **Probes** — one class per pillar asserting its verbs and clock are distinct,
   plus a shared-frame class for the mode machine.
7. **Docs** — fold into `UNDERSTANDING.md` §3 and `SYSTEM-STATE.md`.

Each step commits separately and leaves the suite green.

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
