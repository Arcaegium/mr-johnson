# Phase 2 — Text Missions

Every design decision locked in the 3 August 2026 session, in dependency
order. Phase 1 is complete. **This is the current work.**

Companion documents (living, canonical):

- **Design bible** — https://claude.ai/code/artifact/43d59edd-4438-4069-af3b-f9262adacff8
- **Build plan** — https://claude.ai/code/artifact/225900e6-99bc-408a-9ea7-0533d727140d
- **This plan, formatted** — https://claude.ai/code/artifact/ae02034e-d2a1-4496-9828-fc84d275eba3

> **Read the artifacts, don't work from memory of them.** Working from a
> remembered version of the design is what caused the drift this plan exists
> to correct.

---

## 0. The correction this plan exists to fix

The build plan's fidelity ladder is about **rendering, not mechanical depth**:

> Scene-text abstracts the **spatial** tactical feel — exact positioning, cover
> angles, the radius dance — into scene choices; that specific feel is
> precisely what the visual layer restores.

Geometry is the *only* thing scene-text defers. Initiative, action economy,
the three-gate chain, health tracks and Drain all belong at this rung.
Quick-resolve is defined as *"one aggregate roll, instant — the skip button"*:
a Phase 1 deliverable and a permanent fallback, **never the game**.

What got built instead was one roll per obstacle with an invented `attempts: N`
budget, treated as the target rather than the scaffold. Every item below either
replaces that or was blocked by it.

---

## 1. The work, in dependency order

| id | item | notes |
|----|------|-------|
| **P2.0** | Attributes into the dice pool | Blocks everything. Pool = Skill + Attribute. Includes metatype/Awakened reweight and the `presence` split. |
| **P2.1** | Extended tests | Multi-roll tasks; hits accumulate toward a threshold, pool drops each pass, glitch ends it. Canonical case: on-prem hacking mid-mission. |
| **P2.2** | Turn-based mode | The container. Forced on hostilities, or chosen; chosen-while-undetected is the ambush. |
| **P2.3** | Combat, health, Drain, death | Three-gate chain, dual tracks, Drain, scaled wounds, death. Ammo later in the phase. |
| **P2.4** | Planes and witnessing | An act happens on a plane; only perceivers on that plane witness it. |
| **P2.5** | Pillar scene-text | Matrix node-crawl, meatspace scene-and-roll, astral sense-and-resolve. |
| **P2.6** | Retire the scaffolding | `attempts: N` comes off violent affordances. Obstacles become situations, not checks. |

---

## 2. P2.0 — the character sheet, settled

**Seven attributes.** Strength restored; Body and Willpower carry no skills.

| attribute | skills | also does |
|---|---|---|
| Agility (5) | firearms, marksmanship, stealth, larceny, rigging | evasion, ½ initiative |
| Strength (3) | heavyWeapons, melee, athletics | melee Power, recoil compensation |
| Intelligence (5) | demolitions, medicine, computer, hacking, electronics | ½ initiative |
| Charisma (3) | con, leadership, intimidation | — |
| Magic (4) | sorcery, conjuring, enchanting, assensing | capped by Essence |
| Body (0) | — | physical damage track, soak |
| Willpower (0) | — | stun damage track, Drain, Full Defense |

**Why Strength came back.** In SR5 no attack roll is Strength-linked — melee
and heavy weapons are Agility, and Strength feeds *damage*. Folding it into
Body made Body do attack + damage track + soak at once, and flattened melee
Power so a troll and an elf hit identically with the same knife.

**The presence split.** `presence` becomes `leadership` + `intimidation`, and
the `presence` *focus* is retired — a Specialist focuses one skill, and
presence is just the Face's general job. FOCUSES goes 18 → 19;
`ARCHETYPE_SKILLS` needs its Face-family lists rebuilt. The guard's "taunt and
draw them off" affordance becomes `intimidation`.

**Attribute growth — deliberately NOT SR5 pricing.** SR5's `rating × 5` assumes
a player choosing to save up. `growRunner`'s cascade takes the cheapest
affordable option, so a 25-karma attribute would never beat a 2-karma fresh
overflow skill — attributes would never rise at all. That is the half-step bug
one level up. Instead: **a reserved share of every award banks into an
attribute fund**, spent on the focus's key attribute first, then attributes
backing archetype skills; skills keep the existing cascade with the remainder.

**Metatype sets attribute CEILINGS**, not just starting deltas — that is what
makes race compound across a career. Skills cap too.

**Generation distribution.** Metatype: Human 50 / Ork 20 / Elf 10 / Dwarf 10 /
Troll 10. Awakened: **one third total** — ~25% mages, ~8% physical adepts.
Two dials must move together: the metatype draw (flat 1-in-5 today) and the
focus draw — **7 of 19 focuses are mage-only**, forcing ~37% Awakened before
the origin roll is consulted.

---

## 3. P2.2 / P2.3 — combat, the load-bearing item

**Opposition currently tops out.** Threshold is `ceil(tier/2)`, so difficulty
caps at **5 — forever**. A late-career runner with skill 12 and Agility 6 rolls
18 dice and averages 6 hits, beating tier 10 every time without exception.
Difficulty must come from density and depletion, and a mission has nothing to
deplete: no ammo, no fatigue, no Drain, wounds only on a critical glitch.
Twenty obstacles at threshold 5 is the same as one, just slower.

**Turn-based mode** (bible §07): entered **forced** on hostilities — a
witnessed or *failed takedown*, a tripped alarm, a spotted crew — or **chosen**
to coordinate; chosen while undetected is the ambush, granting a surprise
round. Initiative Attribute = Agility + Intelligence, flat, no roll. Initiative
dice = action count, resolved in passes (all act, then 2+, then 3+). Action =
move + one thing. Exits when hostilities cease.

**Three-gate chain**: Hit (accuracy vs Agility evasion + cover) → Penetrate
(weapon Power vs Armor) → Damage. **Dual health tracks**: Body drives physical,
Willpower drives stun; either full = down.

**The player's action is three axes:**

| axis | sets | meatspace | magic | matrix |
|---|---|---|---|---|
| **Stance** | the Hit gate, both directions | open / cover / flanking / full defense | *open question* | *open question* |
| **Method** | Power, Damage, Accuracy | which weapon | which spell | which program |
| **Mode** | modifiers and costs | SS / semi / burst / full auto, aim, called shot | **Force** → Drain | **Attack vs Sleaze** |

Stance is the scene-text stand-in for position, which Phase 3 replaces with
real geometry. `MJ.decide` (the reusable prompt built for the mission popup)
already has the right shape for a three-axis action — it needs feeding, not
rebuilding.

**Death on jobs — APPROVED, amends bible §03.** On a full takedown: **1 in 20
dies, 19 in 20 take a wound.** Wounds scale with damage taken against the
runner's own resilience, not a flat −1. This overrides *"Once hired and
deployed, a runner can never die on a job"* — no longer a rug-pull, because the
player can see the death progression coming and interact with it, and
save-scumming remains available.

---

## 4. P2.4 — witnessing by plane

Built already: quiet acts register only on failure; witnessing asks what else
has eyes on the same ground (`rooms` tagging + a per-run `neutralized` set);
wards do not perceive, spirits do, maglocks never did.

**Outstanding.** A decker jacked into a terminal out of a guard's view takes
the camera down and the guard does not know — the hack happened in the Matrix,
and a dead camera does not announce itself. He then walks up and performs a
silent takedown, and still nothing registers, because nothing witnessed
anything.

- `perceives` becomes a **list of planes**, not a boolean.
- Plane sits on the **affordance**, not the skill — "kill it remotely"
  (hacking) is Matrix; "loop the feed" (electronics) is hands at the camera,
  physical. Same obstacle, same outcome, different witnesses.
- `dualNatured` tags beings perceiving astral *and* physical at once:
  materialized spirits, ghouls, a mage actively assensing.
- An **AR** tag for deckers/riggers is the same shape spanning physical +
  Matrix. Structure for it; do not build it yet.
- "The guard notices the camera go down" stays deliberately unbuilt.

---

## 5. Longevity — the answer that is not more sinks

Both attributes and skills cap. **Progression was never the longevity engine;
situation variety is.** This is a roguelike's shape, not an idle game's — chess
has no progression, and what sustains it is that every position is a different
problem. A maxed roster is the end of the tutorial, not the end of the game.

The endgame collapse — one of every archetype, maxed, running everything in a
day — is caused by the mission layer having no depth to fall back on, not by
growth caps. Second argument for P2.3.

**Simultaneity** is what makes bench *depth* matter once breadth is complete:
multi-front operations needing several teams at the same hour, so owning one
maxed decker does not help when a job needs two on two nodes. It is the one
pressure that scales with roster size instead of being solved by it. Wanted,
gated on UI that can convey it — **scheduled after Phase 2's pillars, before
the visual layer.**

**Shipped:** permanent hires draw a daily wage scaled to market value, so a
mature operation has something pulling nuyen back out. Retainers pay nothing —
an undispatched bench-warmer was never the leak; an active elite crew earning
without limit was.

---

## 6. Open questions and named gaps

- **Does Stance apply outside meatspace?** Astral has no cover in the physical
  sense and the Matrix has no position at all — either those pillars drop the
  axis or they get their own third dial.
- **Adept powers do not exist.** A magic-origin non-mage gets Magic 2–4 that
  does literally nothing: not in any pool, no powers implemented, no effect on
  price. The dossier should also read **"Adept"** rather than `magic`, which is
  what makes it look like a bug.
- **Leadership needs an effects layer.** It is the first skill that modifies
  another runner's roll. SR5 gives it Direct (teamwork), Inspire (surprise
  bonus), Rally (+1 initiative per two hits), Command (reserved — needs NPC
  allies). Rally means initiative must be a **function**, not a stored number,
  and the run needs somewhere to hold modifiers with a source, magnitude,
  scope and lifetime. Spells will reuse it.
- **The bible and build plan still need these folded in** — §03 on death, §04
  and §09 on the attribute set and skill map, and the Phase 2 row plus backlog
  on this document's contents. **This is the first task for a fresh session.**
