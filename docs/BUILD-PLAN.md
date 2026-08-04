# Build Plan — Mr. Johnson

*Companion to the design bible. How a two-person team — you and Claude — ships
an enormous systems game without drowning in it. The spine is
simulation-first: prove the systems bare, add the skin later.*

**Team** you + Claude · **Cash to playable** ~$0 · **Stack** vanilla JS /
Canvas, client-side · **Host** GitHub Pages under arcaegium.com

> Mirrored from the living artifact:
> https://claude.ai/code/artifact/225900e6-99bc-408a-9ea7-0533d727140d
> Edit the artifact, then refresh this file — or edit here and republish.

---

## 1. The governing principle

> **If the systems don't work in simulation mode, they won't work after we've
> spent a ton of time polishing the turds.**

This game's fun lives in its **systems** — the roster market, the economy,
growth, Discipline mispricing, job interconnection, the whole Johnson loop.
Those are data, menus, and math: they can be built and *proven fun* in text,
where iteration is instant and free. The tactical missions are content those
systems generate; their eventual visuals are a **rendering layer**, not the
game. So we build the entire game as a text/simulation first — a real,
complete, playable thing — and only skin it with visuals once the core has
earned it. Simulation mode is a lie detector: it tells us cheaply whether the
loop is fun before a single sprite is drawn.

**Why this game specifically suits it:** we built the whole design as *data*
per "systems are expensive, rows are cheap." A site's obstacles are affordance
lists; skills gate them; the job grammar generates objectives. That means the
design came out text-ready by accident — a text renderer just reads the data
the generators already produce and prints choices. Nothing needs re-designing
to run in simulation mode.

---

## 2. The fidelity ladder

Three renderings of the *same* underlying systems. We build the whole game at
the middle rung first.

| rung | what it is | when |
|---|---|---|
| **Quick-resolve** | One aggregate roll, instant. The skip button, and the always-available fallback that keeps the game playable while anything else is half-built. | exists from Phase 1 |
| **Scene-text** | Describe the scene from the site data, offer the affordance skill-rolls, resolve the chosen one, mark the result, advance. Interactive, choice-driven, no rendering. Every system, no skin. | **← we build here first** |
| **Full spatial** | Top-down positioning, radius movement, cover geometry, the visual pillars. The eventual layer, laid over the proven text core, added per pillar. | Phase 3+ |

**What scene-text validates vs. defers.** It fully proves the systems, the
economy, the roster loop, and job interconnection — the core. It abstracts the
*spatial* tactical feel (exact positioning, cover angles, the radius dance)
into scene choices; that specific feel is precisely what the visual layer
restores. Since this game's fun lives in the systems, that's the right thing to
defer — named, not glossed.

> **Read this rung carefully.** Geometry is the *only* thing scene-text defers.
> Initiative, action economy, combat resolution and health tracks belong at
> this rung, not the next one. See `PHASE-2-PLAN.md` §0.

---

## 3. Tech & budget

| area | approach | cost |
|---|---|---|
| Engine | Vanilla JS + HTML + Canvas, matching the Apocollapse/Profile Arcaegium stack. Reassess a free lib (Phaser) only for the spatial phase. | $0 |
| Hub UI | **Adapt the Profile project** — already the terminal-widget visual language in working code. Biggest UI surface, largely done. | $0 |
| Backend | None, ever. Client-side only; IndexedDB save (seeds + deltas). | $0 |
| Hosting | GitHub Pages under arcaegium.com, like the rest of the catalog. | $0 |
| Art | Procedural/canvas + placeholders early; CC0 packs and AI-assisted pixel art per visual phase; paid commission only if the game proves out. | deferred |
| Labor | Claude writes the code; you direct, test, and make the calls. | your time |

---

## 4. The phases

Phases 0–2 produce a complete, playable game in text. Phase 3+ is optional
visual polish over a proven core. It is always playable from Phase 1 on.

| phase | what gets built | ends when |
|---|---|---|
| **0** Foundation | The three data models (runner, site, save), seeded RNG, the day clock, save/load to IndexedDB. Bedrock from §09 of the bible. A dev harness to inspect generated state. | We can generate runners and sites from seeds, save and reload them. **✅ DONE** |
| **1** Management Game | Hub console, job board, roster/market, hire/watch/retain, gear armory, **quick-resolve missions** (Discipline pricing, Karma growth, wounds, wipes, the economy), the market state machine. | **GO / NO-GO GATE.** A complete, playable management game. Is the roster loop fun? **✅ DONE** |
| **2** Text Missions | All three pillars as **scene-text**: read the site's affordances, offer skill-rolls, resolve, advance. Matrix node-crawl, meatspace scene-and-roll, astral sense-and-resolve, the multi-front ops. Play-through vs. quick-resolve becomes a real choice. | The **whole game** is playable in text — every pillar, every system, proven fun or revised. **◀ CURRENT — see `PHASE-2-PLAN.md`** |
| **3+** Visual Layer | Rendering laid over the proven core, one pillar at a time (Matrix cheapest first). Then depth & content: crafting benches, full tag/combo, faction-heat escalation, job variety, the framing/McGuffin, balance, art pass. | Never — this is the "infinite game" content, added at leisure from a position of a working, fun game. |

**The critical property:** after Phase 1 you have a shippable game, and every
phase after is independent and optional. You can stop, pause, or reorder
between phases, and it stays playable. No month-long sink before a payoff.

**Scheduled within Phase 2, after the pillars:** *simultaneity* — multi-front
operations requiring several teams at the same hour. It is the pressure that
makes bench depth matter once breadth is complete, and it is gated on UI that
can convey it. See `PHASE-2-PLAN.md` §5.

---

## 5. Phase 0 — the first concrete tasks *(complete)*

1. **Repo scaffold.** Arcaegium subfolder, `index.html`, module structure, git.
2. **Seeded RNG.** Deterministic PRNG — the core of the save-as-seeds model.
3. **Runner model + generator.** Record schema (attributes, skills, Discipline
   label + hidden true-archetype, Essence, wounds, Karma, market state);
   generation from seed; the derived price function.
4. **Site model + generator.** Schema (three security axes, room/obstacle
   graph, obstacles as affordance lists, population) and generation from seed,
   with the three invariants (brute force always available, ≥1 alternate
   solution chain, no obstacle single-skill-locked).
5. **Day clock + save/load.** Spent-not-elapsed day counter; IndexedDB
   persistence storing seeds + deltas; stamped schema version.
6. **Dev harness.** A bare inspector page — generate and dump runners and
   sites, roll the day, save and reload.

**Phase 0 done =** we can conjure a believable runner market and a believable
job site from seeds, watch them vary and persist, and trust the data before
building a single screen on top of it.

---

## 6. Risks & how the plan answers them

| risk | mitigation |
|---|---|
| Scope — an enormous design, a tiny team | Always-playable phasing. A shippable game at Phase 1; everything after is optional and independent. |
| The loop might not be fun | Simulation-first means we find out at Phase 1, in the cheapest possible medium, before any polish investment. |
| Solo + AI sustainability | Each phase is self-contained and leaves a working build. Pauses cost nothing. |
| Art cost / time | Deferred entirely to Phase 3+, placeholder-and-procedural until then, and only ever spent on a game that's already proven. |

---

## 7. Deferred polish backlog

Work that's explicitly not a current-pass blocker — flagged so it doesn't get
lost. Most is inert flavor per the bible's own rule (§03) that only the
Discipline line is a legible market signal; a couple are mechanical tuning
deferred until the systems around them settle.

- **Flavor text volume.** Personality and aims lines ship as small placeholder
  pools — enough to prove the generator wires them in, not enough for real
  market variety at scale.
- **Handle/name formatting.** *(Largely addressed — expanded pools, L337
  spellings, anti-collision.)*
- **Obstacle placement tuning (site generator).** Room post-slot counts by size
  (1/2/3) and patrol/zone route count (0–2) are provisional defaults. More
  importantly: transition points (edges) place obstacles evenly regardless of
  distance from the objective room. Revisit so transitions closer to the
  objective can roll *concentrated*, layered security — a maglock, a camera, a
  turret and an armored guard all between the crew and the payload — rather
  than one type spread thin. A "closer to the objective, more likely to stack"
  weighting is the missing piece.
- **Immunities need a scannable in-fiction tell.** Every Watsonian immunity
  (sensor-equipped, hardened, air-gapped, cloaked) needs an observable artifact
  a player can notice — a visible sensor rig, telltale shielding, an aura
  reading as unusually old or bound. Same "recon is a sensor, not a dial"
  principle as job-board scouting (§06), applied per-obstacle. The data already
  carries `blocked`/`reason`; what's missing is the scan interaction and UI.
- **Metatype and Awakened distribution.** *(RESOLVED — see `PHASE-2-PLAN.md`
  §2: Human 50 / Ork 20 / Elf 10 / Dwarf 10 / Troll 10, Awakened one third.
  Implementation still pending.)*
- **Task resolution needs an attribute in the dice pool.** V1 of `resolveTask`
  deliberately rolls skill rank alone. *(RESOLVED — full skill→attribute map in
  `PHASE-2-PLAN.md` §2. This is now **P2.0** and blocks the phase.)*
- **Karma growth needs to consider Attributes.** The cascade only grows Skills;
  Attributes never advance through play. *(RESOLVED in design — the reserved
  attribute-fund model, `PHASE-2-PLAN.md` §2. SR5's `rating × 5` pricing is
  explicitly **not** used, because a greedy cascade would never reach it.)*
- **Reputation's actual scaling and impact needs defining.** Currently a flat
  +1 per completed job. Meant to represent negotiating power (access to and
  discounts on purchasable things), but neither the award curve nor what it
  unlocks has been designed. Needs an armory/purchase system to modify.
- **Job/mission sequencing is still a placeholder shape.** `missionCount` is a
  flat uniform 1–3 with no distribution behind it. There's no player-facing
  concept yet of running *extra*, non-contracted prep missions (recon,
  softening a target) before the closing mission — real designed-for gameplay
  (Karma to everyone involved, nuyen only once). Route-type missions (movement
  between two sites — the Gauntlet transit case) are a reserved shape
  (`locationType`) that site.js cannot generate at all yet.

**Why deferred, not dropped:** none of this blocks any system from being
provably fun in simulation mode. Expanding it is content volume, cheapest in a
dedicated pass rather than piecemeal while the mechanical foundation moves.
