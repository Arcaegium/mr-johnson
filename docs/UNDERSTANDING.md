# Mr. Johnson — What This Game Is

**Read this first, every session, before touching anything.** It is written
for Claude's recall, not for a human reader: explicit over elegant, reasoning
attached to every decision so it is never re-litigated from scratch, concrete
numbers wherever they exist.

This file **records** decisions. It does not make them. If the user says
change something, it changes — this document is never an argument against a
new direction. (See §0.3, failure mode C.)

---

## 0. THE THINGS I KEEP GETTING WRONG

Four failure modes, all observed, all recurring. Check against these before
proposing anything.

### 0.1 Failure mode A — treating the placeholder as the design

The text shell is a **lie detector for the systems**, not the product. When a
system is built as an explicit V1/placeholder, its shape is scaffolding, not
canon.

**Observed:** `core/resolve.js` V1 rolled one die pool per obstacle and said so
in its own header. I built the entire affordance model, attempt budgets, threat
classes and the mission popup on top of it as though that one roll *were* the
design — then invented `attempts: 1` on "fight" to stop brute force being
spammed. That invented constraint failed a real mission because one missed shot
meant the crew could never fight that guard again. There is no attempt budget
anywhere in the design. I made it up to make a scaffold behave.

**Rule:** if a constraint is not written down, do not invent one to prop up a
placeholder. Say the system is missing.

### 0.2 Failure mode B — treating the console as the product

**This is the most recent and the most important.** The hub console is ONE
PIECE. We started with it because dispatch, roster, economy and gear must
exist and be operable before a street or a cyberspace has anything to render.
It is the instrument panel the real game reads from.

**Observed:** asked to improve the UI, I designed a web application — responsive
breakpoints, mobile overflow, viewport-gutter maths for a floating card, scroll
regions, collapse states. Then when planning the tabbed console I evaluated
designs by "is this readable in text," which is optimising the scaffold.

**Rule:** the console is finished when **every mechanic is reachable and every
piece of state is legible** — not when it looks good. It should stay ugly.
Polish is Phase 3 and gets thrown away.

### 0.3 Failure mode C — using the document as an authority

**Observed:** the user directed that runners arrive with their own gear. I
framed their own call as needing an exception granted by §03, as though the
document had a vote. It does not. It is a record.

**Rule:** cite the document to stay *consistent*, never to *resist*. If a new
call contradicts it, the document is what changes.

### 0.4 Failure mode D — verifying the code does what it is structured to do, without asking whether the structure is right

**Observed repeatedly.** Confirming an invariant holds is not confirming the
invariant is a good one. The user has caught this several times by asking me to
state a property out loud, at which point the property was obviously wrong.

**Rule:** when asked "is X true?", also answer "is X *right*?"

---

## 1. THE CORE PREMISE

You are **the Johnson** — a fixer. Not a runner. You take contracts, browse a
market of procedurally generated runners, hire and develop a roster, and
dispatch them. **You never personally go.** Your operation grows; you do not.

- **No ending.** Shadowrunning is a lifestyle, not a career with a finish
  line. Meant to be played indefinitely. No final boss, no credits.
- **No plot, deliberately.** Succeeding on the job in front of you is as far
  as anyone needs to think it through.
- **Depth > graphics > story**, in that order, by a wide margin. Genesis-tier
  (16-bit sprite) visual ambition.
- **Hub-based.** The player lives in a persistent hub between jobs.
- **No single meta item.** Enforced at three levels at once: which *pillar* a
  job routes to, which *skill* it rewards, and which specific *runner* brings
  it.

**Why infinite needs more than bigger numbers:** a single character grinding
toward godhood has one axis to scale and eventually gets tedious. A roster
scales horizontally — more specialists, more compositions, more relationships
to protect or gamble on — which is much harder to "solve" than a stat sheet.

**Longevity is NOT progression.** This is a roguelike's shape, not an idle
game's. Chess has no progression; what sustains it is that every position is a
different problem. A maxed roster is the end of the tutorial, not the end of
the game. (User's own framing, confirmed.)

---

## 2. THE TWO MODES — THE STRUCTURAL RHYTHM

The game alternates between two deliberately opposed surfaces:

| | what it is | visual language |
|---|---|---|
| **The hub console** | the Johnson's admin terminal, where you live *between* missions | cyan-on-black CRT, framed widgets with ID codes, live status readouts, a telemetry frame — Arcaegium's established worker-console language |
| **The pillar worlds** | where dispatched missions actually happen | three genuinely different renderers, below |

Dispatching **drops the player out of the clean console into the pillar's
immersive world, and back to the terminal on return.** Sterile command desk
versus in-the-field. This rhythm is deliberate and load-bearing.

**Consequence I keep missing:** the missions are not in the console. The
mission popup currently in the code is a *stand-in for the top-down street*,
not a hub widget.

---

## 3. THREE PILLARS & THE CONSCIOUSNESS PRINCIPLE

**The organizing rule:** a pillar exists wherever a character's active
consciousness can leave **physical reality itself** — not just leave the body.
A decker's mind projects into something purely virtual. A mage's mind projects
onto a metaphysical plane. Both are categorically different from being a body
in the world, so both earn their own genre. **A rigger jacking into a drone
never leaves physical reality** — the drone is a second body in the same
meatspace — which is why Rigging is a meatspace specialty, not a fourth pillar.

| pillar | visual treatment | consciousness | good at |
|---|---|---|---|
| Meatspace | top-down cyberpunk street | nowhere — the default embodied world | combat, infiltration, escort, courier |
| Matrix | over-the-shoulder CRT / terminal dossier | a wholly virtual space (the decker's Persona) | data theft, remote sabotage, zero-travel jobs |
| Astral | over-the-shoulder oil-painting / impressionist | a metaphysical plane (the mage's projection) | detecting/hunting spirits and the Infected, scouting, non-lethal resolution |

**Why the pace differs, in-fiction:** Matrix is discrete because it is
processors trading packets — turns make sense. Meatspace is real-time because
it is bodies in space. Astral consciousness is unbound from the body and runs
faster than flesh — canonically 2 initiative dice to meatspace's 1. That is
flavour for *why* the pace differs, **not** a mandate to share an engine.

---

## 4. THE ROSTER — THE ACTUAL CORE SYSTEM

More central than any single pillar. Progress is not a stat sheet; it is who
you know, who you have protected, and who you can afford.

### 4.1 The market
Continuously, procedurally regenerated pool. Each runner has a **dossier**:
fully-visible stats, a **Discipline line** (Generalist or a named Specialist
focus), a personality line, a price.

**Price is the Discipline lens applied to the visible skills** — not a flat
number and not always a fair one. The label can over- or under-value the actual
skills. That is exactly where bargains and traps live.

### 4.2 Watched / unwatched / hired
- **All Hired runners are Watched.** Watched turns on stat tracking and growth,
  and exposes a runner to the shelf-life roll — *unless* under contract, which
  suppresses that roll for the contract's duration.
- **Unwatched = guaranteed loss.** One shelf-life timer, no roll, no growth, no
  closure. The timer is **visible** — "leaves in 2 days" vs "leaves in 7" is
  what makes pick-or-pass a real decision.
- State machine (watched, not hired): Available → Working / Out of Town / KIA.
  Shelf life **re-rolls after every transition** rather than pausing — a cheap
  abstraction implying a whole hidden economy of other Johnsons.
- Odds are tier-weighted: top-tier runners rarely roll KIA (too good at not
  dying); low-tier carry real risk. This is why losing a runner saved up for
  does not feel like a rug-pull — KIA will have visibly happened to lesser
  runners many times first.

### 4.3 Growth
Runners grow through **Karma**, awarded per mission, scaled to the security
threat actually faced, spent automatically along their archetype.

**Growth only ever comes from something the player assigned that runner to do**
— a mission, a scouting task, or crafting duty. Never automatically. A
Watched-but-not-hired runner cycling through Working is NOT secretly running
jobs and levelling. **Reason:** a top-tier dream hire must stay a reachable
target while the player saves toward them, never one that gets more expensive
*and* more skilled from sitting on the shelf — that turns the chase into a
tease.

**Support work grows too** but at a visibly lower rate, with lower difficulty
ceilings. Safe grinding is allowed; it is never optimal.

### 4.4 Hiring tiers — counted in MISSIONS, never calendar days
| tier | what it buys |
|---|---|
| Freelance | exactly one mission at market price |
| Retainer | a contracted block at a discount, protected until used — the **audition tier** |
| Permanent | lump sum, paid once, protected forever, **plus daily upkeep** |

An untouched retainer never lapses, on purpose — the cost is self-balancing
(they do not grow while benched, and the operation moves past them).

**Permanent upkeep (added this session):** a small daily wage scaled to market
value. Retainers pay nothing. Reason: the endgame leak is an **active** elite
crew earning without limit, not a full bench.

### 4.5 Mission risk — AMENDED
**Runners CAN die on jobs.** Originally the design said they could never die,
to avoid a rug-pull. That reasoning stopped holding once missions are *played*:
the player watches the health tracks fill, chooses to press or withdraw, can
spend a revive, can retreat. A death you saw coming is a consequence, not an
ambush. Save-scumming also exists.

- Full takedown → **1 in 20 dies**, 19 in 20 take a wound.
- Wounds scale with **damage taken vs the runner's own resilience**, not a flat
  −1. Being dropped by a tier-9 hardsuit marks a career; a rent-a-cop does not.
- Wounds are **debt, not status effects** — the score is simply lower. They
  must not cap, or recklessness stops costing anything.
- Two ways to pay it: **magical therapy** truly removes wound points but is
  penalised by Essence loss (works best on natural bodies); **cyberware
  offsets** instead of removing (a thrice-wounded veteran who chromes sits at
  net zero, not +3). Self-reinforcing: high-Essence runners stay maintainable
  through the mage, low-Essence slide toward the machine, and Essence is
  finite so the slide has a floor.

### 4.6 Equipment — AMENDED
Gear is owned by the **operation**, issued per job, reclaimed and reassigned.
"Two decker runners, one top-tier deck" is a real allocation decision.

**Amendment:** runners now arrive with **personal kit** — a weapon and armour
suited to what they are good at, **capped at tier 4**. The allocation decision
survives intact because the armoury is the only route past mid-tier. Personal
kit cannot be issued, pooled or sold. Reason: a hired professional turning up
to a firefight with their fists was absurd.

**Crafted gear is ALWAYS better than the shop version of the same item.** Every
crafted item carries `quality` ≥ 1 (max 3, scaled by the crafter's margin),
stacking onto tier everywhere tier already means something. Paid for in the one
currency that never replenishes: a runner is at the bench instead of on a job.
The shop sells **time**, which is the scarce thing.

### 4.7 The economy
**Time is the binding constraint, not nuyen.** Every action costs days, and
days are bounded by board churn — jobs expire while you spend them. Nuyen
replenishes; time does not.

The roster is an infinite money sink (always another elite, another specialist,
another veteran to chrome). Failure also feeds the economy: wounds and wipes
are sinks triggered by loss, which gives caution monetary value.

Two secondary-yield loops exit differently: Matrix **data** → fence → nuyen;
Astral **reagents** → crafted gear with no nuyen middleman.

---

## 5. ARCHETYPES, SKILLS, ATTRIBUTES

### 5.1 The rubric and the design law
- **Distinct, Frequent, Versatile** — a specialty must differ from what a
  generalist does, come up often, and have ≥2 meaningfully different uses.
- **Systems are expensive, rows are cheap.** A focus may only *recombine verbs
  the game already has*. If it needs a new system, it is scope creep, not an
  archetype.

### 5.2 The seven attributes (SETTLED — Strength restored)
| attribute | skills | also does |
|---|---|---|
| Agility (5) | firearms, marksmanship, stealth, larceny, rigging | evasion, ½ Initiative |
| Strength (3) | heavyWeapons, melee, athletics | melee Power, recoil comp |
| Intelligence (5) | demolitions, medicine, computer, hacking, electronics | ½ Initiative |
| Charisma (3) | con, leadership, intimidation | — |
| Magic (4) | sorcery, conjuring, enchanting, assensing | capped by Essence |
| **Body (0)** | — | physical damage track, soak |
| **Willpower (0)** | — | stun damage track, Drain resistance, Full Defense |

**Why Strength came back:** no attack roll is Strength-linked in the source
(melee and heavy weapons roll Agility; Strength feeds *damage*). Folding it into
Body made Body do attack roll + damage track + soak at once, and flattened melee
Power so a troll and an elf hit identically with the same knife — destroying
exactly the texture §1's "no single meta item" rule protects.

**Body and Willpower deliberately carry no skills.** They are the two pure
defensive stats. This is how the source uses them.

**Collapses from the source:** Reaction → Agility, Intuition + Logic →
Intelligence. (Fixed by the design's own "Initiative = Agility + Intelligence".)

### 5.3 Attribute growth — deliberately NOT tabletop pricing
The tabletop charges rating×5 for an attribute vs rating×2 for a skill, and
that works there because **a player decides to save up**. Our cascade has no
patience: it buys the first affordable thing, so a 25-karma attribute loses to
a 2-karma fresh overflow skill forever. **Pricing cannot solve an allocation
problem.**

**Solution:** 25% of every award banks into an **attribute fund**, spent on the
focus's key attribute first, then attributes behind the archetype list. Skills
keep the existing cascade with the remainder. An attribute no skill of theirs
uses is never bought — growth stays thematic by construction.

### 5.4 Metatype sets CEILINGS, not just starting rolls
A metatype's real mechanical identity is the **maximum** each attribute can
reach. That is what makes race compound across a career and makes the metatype
line worth reading at hire time — it tells you where that runner's career ends.

Population: **Human 50 / Ork 20 / Elf 10 / Dwarf 10 / Troll 10.**
Awakened: **one third of the market** — ~25% mages, ~8% physical adepts.
Deliberately far above the setting's ~1% baseline (a runner market is
self-selected for outliers) and far below an even split (humans must read as
the norm).

**Two dials that only work together:** the metatype draw AND the focus draw.
Every mage focus is Awakened by construction, so the mage focuses' share of the
focus table sets a FLOOR on Awakened frequency before origin is consulted.

### 5.5 Skills cap too
Both attributes and skills cap. What a finished runner is *for* is answered by
§1: the roster scales horizontally; a maxed runner is a completed tool, not a
dead end.

---

## 6. JOBS, THE BOARD & MISSIONS

**A Job is the contract**: one hiring faction, one nuyen payout, paid once on
completing its success criteria.
**A Mission is the dispatch unit**: its own target faction, its own site, its
own objective/verb/domain/tier/crew.

A job bundles 1+ sequential missions for the same client, and **can span
multiple target factions**.

- **Karma is per-mission.** Every runner who completes a mission's objective
  earns it, whether or not that mission was the contracted deliverable. This is
  what makes "send a couple of runners to soften up a target first" a real
  tactical choice — everyone grows, but nuyen only pays once.
- **Nuyen is per-job**, summed from every mission's site-derived contribution.
  **This is the mechanism for unbounded pay scaling** — more missions sequenced
  into one job as the operation matures. NEVER a single site getting harder;
  site Value is capped at 10 forever by design.

**Language discipline (user correction):** jobs are *accepted* and *completed*;
missions are *dispatched* and *resolved*. Say "job-derived objectives," never
"job-completion," in dispatch lists.

**Crew size:** every job has an **intended crew size** shown on the board card.
Every job is **runnable by any crew of 1–4 regardless**. But **runnable is not
solvable** — success depends on which *skills* are present, independent of
headcount. A crew of the right size with the wrong composition fails outright.
This is intentional and load-bearing; it is what makes roster composition the
real decision.

**Security is a RESULT, not a roll.** Every site has a **Value** (1–10, how big
a deal the target is) and an **Orientation** (physical/astral/matrix/balanced).
The leaned axis carries Value directly; the others take a steep discount, so a
leaned site reads genuinely lopsided ("astrally naked, physically stacked").
A job's tier/pay derives from whichever site it matched to.

**Matching is loose, not strict** — a job can run harder or easier than its
label implies, and that gap is meant to be **discoverable through scouting**.

---

## 7. MEATSPACE & COMBAT

### 7.1 Entering turn-based
Turn-based is where **all deliberate action** happens — combat, but also any
coordinated interaction. Two entries:
- **Forced:** hostilities go live — *a witnessed or failed takedown*, a tripped
  alarm, a spotted crew.
- **Chosen:** the player drops in to coordinate. Choosing it **while still
  undetected is the ambush** — a surprise round where the crew acts and the
  unaware enemy cannot respond.

**Why turn-based at all:** fairness. In real time the player gives one order
while the AI moves its whole side at once; alternation lets the crew act as a
coordinated team, which the mind reads as simultaneous — the load-bearing
fiction of the genre.

### 7.2 Initiative — deterministic, no roll
- **Initiative Attribute = Agility + Intelligence.** Flat. Perfect information,
  plannable, chess. Being able to read the order before committing is what makes
  an ambush a plan rather than a gamble.
- **Initiative dice = ACTION COUNT.** The mechanic worth building the combat
  economy around. A mundane guard gets one; a samurai with Wired Reflexes gets
  three or four.
- **Pass structure:** everyone acts in pass 1, then only units with 2+ act in
  pass 2, then 3+. Because order within each pass is by initiative, fast units
  **lead every pass** and read as constantly in motion. Everyone is guaranteed
  their pass-1 action before anyone doubles, so slow units are never deleted
  before they move.
- Extra actions bought via **Wired Reflexes** (cyber, Essence-priced) or
  **Improved Reflexes** (adept magic, no Essence).

### 7.3 Action economy
Each action is **move + one thing**. Movement is a per-round **radius**
(Agility-based), no grid; the budget is shared across all a runner's actions,
so extra initiative dice grant more *actions*, never more *distance*. The
blur-samurai shoots four times; they do not sprint four times as far.

### 7.4 The three-gate chain — kills the single meta weapon
1. **Hit** — attacker accuracy vs target evasion (Agility) and **cover state**.
   A geometry check the player controls through positioning, not a reflex check.
2. **Penetrate** — the weapon's **Power** vs the target's **Armor**. A
   high-Damage low-Power weapon does nothing to a plated tank; an
   armour-piercing rifle chews through it. **This gate is why weapon variety
   matters.**
3. **Damage** — only if penetrated, applied to a health track.

**Dual health tracks:** Body drives physical, Willpower drives stun. Lethal
weapons fill physical; stun weapons (gel rounds, batons, stun spells) fill
stun. **Either full = down.** This gives non-lethal a real mechanical lane, so
a capture contract is a loadout decision rather than a fiction.

**Cover is positional** — computed from where a runner stands relative to the
shooter. Moving into hard cover against one threat can leave them open to
another angle. **Reinforcements arrive** — they path in from entry points on
rising Alert, giving a window to reposition or run rather than teleporting in.

---

## 8. THE ASTRAL REALM

Played solo by whichever mage is assigned — turn-exchange encounters over a
painted mirror of the physical world.

**Why impressionist:** astral perception is not sight. Mages read a "third eye"
impression of emotion and intent rather than light and surfaces. Mirrors are
blank. Living things blaze with colour; the corrupted read sick, dim, wrong.
That is a description of an impressionist painting, not a photograph. The
renderer **subtracts detail** — murky silhouettes — then paints on the only
things astral perception sees: auras, emotional stains (a murder site burns
red, a sterile office reads grey-dead), wards as walls of light, signatures.
Cheaper to produce than meatspace, not more expensive, and lore-faithful for
exactly that reason.

**Traversal: movement is free, vision is constrained.** Astral forms pass
through walls, but walls cast opaque astral shadows so you cannot see through
them. The inverse of meatspace: go anywhere, navigate murk where only living
and magical things shine.

**Two exceptions define the level design:** earth is solid, and **wards block
movement — the one wall that works both ways.** Which yields the pillar's
nastiest situation for free: **a ward between you and your body blocks the way
home.** Budgeting the way out is part of going in.

### The pressure triangle
| pressure | what it is | managed by |
|---|---|---|
| **Drain** | the action cost, scaled by the **Force** dial — push soft (weak, cheap) or hard (strong, draining). Drain full = dumped back to the body, KO'd — the *soft* fail. | Force discipline; fetishes absorb drain |
| **Tether** | a budget of astral **turns**, sized by Magic. Every move, assense and exchange ticks it. Tether out = forced snap-back plus downed (a wound) — the *hard* fail. | efficiency; an anchor talisman extends it |
| **Attention** | the Alert-mirror: quiet → watchers curious → guardian spirits hunting → **the site's own mage projects in to find you** | masking (the Illusion specialty) |

Drain is how hard you pushed; the tether is how long you have been out. A fast
loud run burns Drain but few ticks; a slow careful run conserves Drain and eats
the tether — the same duality that makes the Matrix's cards-vs-Alert work,
wearing different clothes.

**Loadout:** spells live on the dossier (they are what you hired). Foci,
talismans and fetishes are armoury equipment issued per job, exactly like decks.

---

## 9. THE MATRIX

**A node-traversal puzzle wrapping a deck-building combat/stealth layer**, run
by whichever decker is assigned — **using a deck the Johnson owns**, not one the
runner carries. RAM, program loadout and every deck stat belong to equipment
the player builds and upgrades.

### Four layers
1. **Intel** — what is known before committing; rough at first, earned in full
   through repeated runs.
2. **Loadout** — the deck locked in at mission start, built against that intel
   from a single shared RAM budget.
3. **Route** — which path through the node graph; a live trade between Alert
   exposure and card expenditure.
4. **Encounter** — card resolution at each node, programs vs ice, turn by turn.

**Intel is earned through repetition.** Astral scouting cannot feed a decker
intel — the Matrix is wholly virtual, so it earns knowledge through the
assigned decker's own attempts. Nodes cleared or scouted stay known across
separate attempts. Getting dumped triggers a consequence (timed lockout,
hardened ice next attempt) and **can poison a linked meatspace job on the same
target the way a clean run sweetens one.** Nothing learned is guaranteed to
stay true.

### Loadout: one shared budget, three card kinds
| type | behaviour | example |
|---|---|---|
| Permanent / reusable | always active once equipped, no charges, until suppressed | Detection, Masking |
| Impermanent / reusable | owned permanently; choose RAM spend on charges; refillable mid-run at a cost | Blast, Heal, Wipe |
| Permanent / consumable | true one-time use, no refill ever — the payoff for precise intel | databombs, high-density Anti-ICE |

**Refilling:** one action remakes any quantity of ONE already-owned program's
charges — cheap regardless of quantity. Each distinct program refilled costs
its own action, and every action at a node ticks Alert. **Suppressed nodes emit
far less Alert, making a cleared hub a natural restocking base.**

### Route: Alert vs cards
The long stealthy route bleeds **Alert** (scaling with node count and per-node
type — an SPU barely registers, a CPU ticks hard). The short aggressive route
bleeds **cards** punching through Barrier and Black Ice. **The objective node
always costs cards too**, so no pure-stealth loadout skips paying at the finish
line.

Alert tiers 0–50 map to Response Level 1–5. Worked example: an 18-Blast loadout
on a route breaching Alert 30 (Response 3) needs roughly a third more copies per
fight than at Response 2 — the real question being whether some of that RAM is
better spent on Wipe (9 Alert cleared per use, costing as much RAM as 10 Blast
or 5 Heal), suppressing the curve instead of fighting it.

**CPU Cores** — mid/late-game deck unlock letting a decker play multiple cards
in one action, including refills.

### Data: the run's second payday
Beyond the contract objective, a decker pulls extra datafiles from datastore
nodes on the way out. Pulled data occupies the deck's **Storage** (distinct
from RAM): a bigger deck carries a bigger haul. Files sell to a fence scaling
with system tier and data quality; a Search-leaning decker finds more and
better. **This can exceed the contract fee — the run's real profit is often the
data, not the pay.** The deeper and longer you stay, the more Alert you eat, so
profit trades directly against safety. It is the loop that makes a good decker
self-funding: data buys the better deck that pulls deeper for more data.

**Signal distance:** early on a decker must go **on-site**, full stop — which
makes them a real, protectable body on the mission. A signal relay is a
later-game unlock extending range, which matters because it frees a crew slot.

---

## 10. THE HUB CONSOLE

Where the player lives between missions. **Three levels of zoom:**
0. **The console** — full dashboard, every widget in collapsed summary.
1. **A subsystem** — click a widget for its full interface.
2. **An item** — one entry's own dossier card.

### Frame vs widget — the rule
Two questions decide where information lives, and "is it global?" is not one:
- **The frame** carries compact state you **monitor but cannot operate** —
  results of what you have done, nothing to act on: money, day, aggregate heat,
  operation status.
- **A widget** is earned two ways: it is a **subsystem you operate**, or it is
  **too voluminous to fit the frame**. (Faction standings are the second case:
  as un-actionable as heat, but far too many to glance at.)

### Widget set
| widget | role | gated by |
|---|---|---|
| Job Board | operate | always |
| Runners | operate | always |
| Armory | operate | buying always; the forge needs a weaponsmith |
| Drone Bay | operate | appears with drones; fabrication needs a rigger |
| Deck Building | operate | appears with a deck; program forge needs a Computer-skilled runner |
| Grimoire | operate | appears with a mage; design bench needs mage + lodge |
| Medicae | operate | wounds always; therapy needs a healer mage, surgery a Street Doc |
| Contacts | monitor | appears once you hold standings |

**The console grows with the operation.** Buying is always open; crafting is
gated by staff. A subsystem's forge stays dark until a runner who can work it is
on the roster. **This is the "see your empire grow" payoff rendered as the
terminal itself filling with active production** — and it creates a real roster
archetype: the runner with 9 Computer and nothing else is not a field decker,
they are your full-time programmer, earning a permanent slot without ever going
on a mission. **Field value and bench value are two independent axes** the
generator produces separately.

### Deploy is a flow, not a widget
Launching spans widgets: Job Board → pick a contract → pull a crew from Runners
→ issue gear from Armory / Drone Bay / Deck Building / Grimoire → go.

### PENDING AMENDMENT (user, this session — not yet applied)
The user is moving toward **tabs holding several widgets each**, which adds a
level: tab → widget → item. Settled so far:
- **Frame: core stats anchored LEFT** (day, nuyen, rep, capacity); **the day's
  plan anchored RIGHT**, collapsed, clicking opens a card. This preserves the
  frame rule — the frame shows a summary (monitor), the card is where you
  operate.
- **Armory splits from Crafting.** Buying/issuing are not dispatches; crafting
  occupies a runner for days.
- **Staff gating stays.**
- Proposed tabs: Runners (hired / watchlist / available pool), Contracts
  (active / available / completed, completed auto-collapsed), Crafting
  (Equipment / Programs / Spells), **Locations** (NEW — §10 has no site widget
  and one is needed for recon, search, and the known-site list).
- Runner cards show the **full** skill list including zeros, but must hide
  designated qualities. **`trueArchetype` is hidden truth** — a card that dumps
  the record leaks the entire Discipline mispricing system. Any card component
  needs an explicit allowlist of player-visible fields.
- Runner records will expand to track successful/total runs, kills, hacks, etc.
  **This data does not exist yet** and must be added before a sheet can show it.
- **Still open:** is there a home/level-0 tab; where Medicae and Contacts land;
  is Runners one widget or three.

---

## 11. THE DATA FOUNDATION

### 11.1 The four-layer entropy model
1. **Universe** — pure seed, lazy, infinite. Runner #N and site #N of a universe
   are pure functions of (universeSeed, index).
2. **History** — saved deltas.
3. **Arrivals** — universeSeed + wall-clock timestamp. Reload to before a board
   refresh and those offers never existed.
4. **Live action** — fresh entropy, never replayable. Replaying a day never
   replays its dice.

**Save stores seeds + deltas, never generated content.**

### 11.2 Site names ARE the seed
Format: `Adverb-Color-Adjective-Noun-####`
- Color → owner (8 options), Adjective → district (9), Noun → value ×
  orientation (40), Adverb + 4 digits = uniquifier. ~4.2B names.
- `decodeSiteName` is **positional** — `parts[1]` looked up in colours,
  `parts[2]` in adjectives.

**PENDING (user request, not applied):** swap to
`Adverb-Adjective-Color-Noun-####` for readability. **This is a seed-format
break, not a display change.** Old names stop resolving. Before doing it,
verify the colour and adjective word lists are **disjoint** — if any word
appears in both, an old name would silently decode to a *different site*
instead of failing loudly.

### 11.3 The threat read & live security (the model, in full)
**Three layers:**
1. **The band** — Min / Current / Max per axis. Current = "how much room are we
   giving for bullshit today."
2. **The threat read** — `normal → awkward → questionable → threatening`, per
   site **per day**. What your actions credibly reveal, and only if something
   witnessed them.
3. **Alert** — the response, engaged **only at threatening**. Three of them, one
   per axis, each bounded `[Current, Max]`.

**Nothing changes mechanically below threatening.** Three stacking awkwards →
questionable. Once questionable, security is sure enough and waiting for an
excuse, so any further witnessed awkward OR questionable act tips you over.

**ALERT IS THE RATCHET.** It engages at Current (what they already committed to)
and every step it climbs is them fielding more than they planned. **Where it
settles becomes the new Current** — nobody stands the reserves down next
morning. So tripping a site and withdrawing immediately ratchets nothing, while
fighting through three waves permanently rewrites their posture. **Max only
grows when they pin at the ceiling and pressure keeps coming** — the budget
meeting — and never decays.

**Points, not levels, are what move:** an axis engages at Current × 10 and
ceilings at Max × 10. Without that budget a Current:5 Max:10 site would deploy
every asset it owns within about thirty seconds of in-universe time.

Everything resets nightly — the read, the alert, obstacle knowledge. **Identity
is never remembered.** You can farm a site that shot at you yesterday; that is
balanced by the ratchet starting them higher.

### 11.4 Witnessing — the rules, exactly
- **A quiet act registers ONLY if it FAILS.** Switch a camera off properly and
  it has nothing to report; read a spirit correctly and it never knew you were
  there. Security reacts to the **fumble**, not the deed. An affordance's threat
  class is the price of getting it **wrong**.
- **Loud is the only exception** — a gunshot is a gunshot whether or not it hits.
- **Witnessing asks what ELSE has eyes on the same ground.** Take down the only
  guard in the room and nobody is left to have an opinion; do it in front of a
  camera and "silent" was never on the table.
- **Witnessing is PER-PLANE.** An act happens on a plane and only perceivers on
  that plane can see it. A decker jacked in out of the guard's sight is
  invisible to him, and the camera he kills does not phone anyone. The plane
  follows the skill (hacking → matrix; sorcery/conjuring/assensing/enchanting →
  astral; else physical), with the exception that matters: **doing the same job
  by hand is a physical act even when the target is a machine.**
- `senses` is a **list of planes**. Guard `["physical"]`, camera `["physical"]`,
  spirit `["astral","physical"]` (**dual-natured**), ward `[]`, maglock `[]`.
- **Threat class is intrinsic to the act**, not to whether it worked.
- **Exceptional success (margin ≥ 3) buys headroom back** — the thoroughly
  bamboozled guard who decides you are fine, actually.

### 11.5 Obstacles are affordance lists
Every obstacle carries 2+ distinct non-loud skill-bearing affordances (or a
skill-less always-available option like route-around) plus exactly one loud
brute-force fallback, which is never eligible for immunity.

**Watsonian immunities:** each instance can roll skill-specific resistances
scaled by tier, with an in-fiction reason. A floor guarantees ≥2 genuinely
usable non-brute-force ways survive the roll. **An immunity is only knowable by
trying it** — information is not confirmed until experienced.

**Three generator invariants**, enforced by construction and re-verified across
thousands of seeds: brute force always available; ≥1 additional distinct
solution chain; ≥2 usable non-loud ways per obstacle.

### 11.6 Physical / astral / matrix are three different graphs
- **Physical:** rooms, edges, entry points, patrols. Movement gated by
  doors/guards/cameras.
- **Astral:** ignores walls entirely — obstacles attach to **rooms directly** (a
  ward seals an area, not a doorway) and roaming spirits get **zones** (2–3
  rooms, no adjacency needed).
- **Matrix:** a **host** — its own node graph (SPU / Datastore / Slave / Data
  store / CPU), never the room graph reskinned. Node 0 is the public face, the
  objective sits deepest, shortcuts exist so there is always more than one route.

Each point of a security axis is **10% coverage of that projection's own
encounter-point count** — a minimum requirement, not a probability.

---

## 12. WHAT THE PLAYER IS AND IS NOT SHOWN

- **Shown exactly:** their own crew's dice pools, skills, attributes, gear.
  Reason: it is their crew, they know what they hired and issued.
- **Estimated only:** site security (`est P:~3`), until recon or experience
  confirms it.
- **Never shown:** the threshold, the odds, `trueArchetype`, whether an approach
  is `blocked` before it is tried.
- **After the fact is fair game:** what an act *registered as* is information
  the attempt bought.

---

## 13. OPEN QUESTIONS (unresolved, tracked)
1. Solo vs multi-decker Matrix jobs — lean solo, not closed.
2. Gambling's mechanical home — proposed for Face/Thief, no system yet.
3. Active roster size — soft cap, or is per-job assignment already the real
   decision?
4. Does **Stance** apply outside meatspace? Astral has no cover in the physical
   sense; the Matrix has no position at all.
5. **Adept powers do not exist.** A magic-origin non-mage gets Magic 2–4 that
   does literally nothing. The dossier should also read "Adept", not "magic".
6. **Leadership needs an effects layer** — it is the only skill that modifies
   *another* runner's roll. Needs modifiers with source/magnitude/scope/lifetime
   that spells will reuse. Rally means Initiative must be a **function**, not a
   stored number.
7. Reputation's scaling and impact — currently a flat +1 per job, undefined.
8. Job/mission sequencing count — flat uniform 1–3, no distribution behind it.
9. Route-type missions (movement between two sites) — reserved shape, ungeneratable.
10. **Opposition tops out**: single-roll threshold is `ceil(tier/2)`, max 5,
    forever. Difficulty must come from density and depletion.
