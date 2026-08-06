# Mr. Johnson — What This Game Is

**Read this first, every session, before touching anything.** Written for
Claude's recall: explicit over elegant, reasoning attached to every decision so
it is never re-derived from scratch, concrete numbers wherever they exist.

This file **records** decisions. The user makes them. Cite this to stay
consistent; when the direction changes, this is what changes.

> ## There are exactly two documents.
> | | |
> |---|---|
> | **`UNDERSTANDING.md`** | what the game is, and how we build it — the stable one (this file) |
> | **`SYSTEM-STATE.md`** | what is in the code right now, and what happens next — the volatile one |
>
> Nothing else. Earlier sessions produced a build plan, a phase plan, a pillar
> plan and two HTML artifacts; all of it is folded into these two or deleted.
> If you find yourself looking for another document, it does not exist.
>
> **`§NN` in code comments is dead numbering.** It points at a retired HTML
> version of this design and does not match the sections here. Ignore it, and
> strip it when you touch the surrounding comment.

---

## 0. THE FOUR PILLARS OF PERSPECTIVE

Orient on these before proposing anything. They decide most questions on their
own.

### I. Depth belongs to the systems; the skin is interchangeable

Every mechanic gets built at the depth the design specifies, whatever it is
currently rendered as. A system's shape comes from what it *is* — a fight is an
exchange with an order and an action economy; a hack is a crawl through a
topology — never from what is convenient to print today.

The specification is the target. When something in the code is simpler than the
design describes, the design is the thing to build toward, and the honest
report is "that system is still to come."

**AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.** The corollary of this pillar,
and the one that keeps getting lost: never describe the game by describing what
`autoResolve` does. It is a harness for building and probing the systems without
a human clicking through every obstacle. Its choices are a stand-in for a
player, never a statement about the design. If a sentence about how this game
plays could be checked by reading `autoResolve`, that sentence is wrong.

### II. The console is an instrument panel

The hub console is one piece of the game, built first because dispatch, roster,
economy and gear must exist and be operable before a street or a cyberspace has
anything to render. It is how the mechanics are seen and operated.

**Measure it by coverage and legibility:** every mechanic reachable, every piece
of state visible. A console that can show the systems is one that can be used to
*judge* the systems, which is the entire reason this rung is built first. It
stays plain until Phase 3; the drawn CRT terminal is a later rendering of the
same model.

### III. Direction comes from the user

The user sets the design. This document keeps the record so that work stays
consistent between sessions. When a new call arrives, apply it and update the
record.

### IV. Evaluate the structure, not only its behaviour

When asked whether a property holds, answer two questions: does it hold, and is
it the right property? Confirming an invariant is satisfied is a separate act
from confirming the invariant is a good one. Measure distributions before
setting a balance number; a dial chosen against real data holds up, and one
chosen by intuition is a guess.

---

## 1. THE CORE PREMISE

You are **the Johnson** — a fixer. Not a runner. You take contracts, browse a
market of procedurally generated runners, hire and develop a roster, and
dispatch them. **You never personally go.** Your operation grows; you do not.

> ### ⚠ "You never personally go" ≠ "you don't play the mission"
>
> **THE PLAYER CONTROLS WHAT HAPPENS DURING MISSIONS.** Stance, method, mode,
> which thread to pull, how hard to push, when to press and when to pull out —
> action by action, runner by runner. That is the game.
>
> What you don't have is an avatar. No personal stat sheet, no character to
> level, nobody who can get shot. You are the mind, the crew are the hands.
> Losing that distinction turns a tactics game into a spreadsheet that reports
> at you, and **it is the single easiest mistake to make reading this document.**
>
> **AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.** See §14 and §15.

- **No ending.** Shadowrunning is a lifestyle, not a career with a finish line.
  Meant to be played indefinitely. No final boss, no credits.
- **No plot, deliberately.** Succeeding on the job in front of you is as far as
  anyone needs to think it through.
- **Depth > graphics > story**, in that order, by a wide margin. Genesis-tier
  (16-bit sprite) visual ambition.
- **Hub-based.** The player lives in a persistent hub between jobs.
- **No single meta item.** Enforced at three levels at once: which *pillar* a job
  routes to, which *skill* it rewards, and which specific *runner* brings it.

**Why infinite needs more than bigger numbers:** a single character grinding
toward godhood has one axis to scale and eventually gets tedious. A roster
scales horizontally — more specialists, more compositions, more relationships to
protect or gamble on — which is much harder to "solve" than a stat sheet.

**Longevity comes from situation variety, not progression.** This is a
roguelike's shape. Chess has no progression; what sustains it is that every
position is a different problem. A maxed roster is the end of the tutorial.

---

## 2. THE TWO MODES — THE STRUCTURAL RHYTHM

The game alternates between two deliberately opposed surfaces:

| | what it is | visual language |
|---|---|---|
| **The hub console** | the Johnson's admin terminal, where the player lives *between* missions | cyan-on-black CRT, framed widgets with ID codes, live status readouts, a telemetry frame — Arcaegium's established worker-console language |
| **The pillar worlds** | where dispatched missions happen | three genuinely different renderers, below |

Dispatching **drops the player out of the clean console into the pillar's
immersive world, and back to the terminal on return.** Sterile command desk
versus in-the-field. This rhythm is deliberate and load-bearing.

Missions live in the pillar worlds. Anything that resolves a mission is a
stand-in for one of those three renderers.

---

## 3. THREE PILLARS & THE CONSCIOUSNESS PRINCIPLE

**The organizing rule:** a pillar exists wherever a character's active
consciousness can leave **physical reality itself** — not just leave the body. A
decker's mind projects into something purely virtual. A mage's mind projects onto
a metaphysical plane. Both are categorically different from being a body in the
world, so both earn their own genre. **A rigger jacking into a drone stays in
physical reality** — the drone is a second body in the same meatspace — which is
why Rigging is a meatspace specialty.

| pillar | visual treatment | consciousness | good at |
|---|---|---|---|
| Meatspace | top-down cyberpunk street | nowhere — the default embodied world | combat, infiltration, escort, courier |
| Matrix | over-the-shoulder CRT / terminal dossier | a wholly virtual space (the decker's Persona) | data theft, remote sabotage, zero-travel jobs |
| Astral | over-the-shoulder oil-painting / impressionist | a metaphysical plane (the mage's projection) | detecting and hunting spirits and the Infected, scouting, non-lethal resolution |

**Why the pace differs, in-fiction:** Matrix is discrete because it is processors
trading packets — turns make sense. Meatspace is real-time because it is bodies
in space. Astral consciousness is unbound from the body and runs faster than
flesh — canonically 2 initiative dice to meatspace's 1. This is flavour for *why*
the pace differs; each pillar earns its own engine.

### 3.1 The reference loop — Sega Genesis Shadowrun (1994, BlueSky)
Checked, not recalled. Top-down for **both** exploration and combat — one view,
no separate battle screen — with **real-time** combat and short fights. Ammo
management, Drain on the caster, melee viable with the right chrome. The Matrix
replaces the runner with a **persona** navigating **geometric node structures**
(CPU, data stores) avoiding **IC**: steal data, erase files, crash the system.
Runners hired **per-run or on lifetime contracts**. Karma from missions, kills
and plot, spent straight into stats.

**Edition: SR5. Do not drift to SR6.** SR6 would replace damage-reduction armour
with Attack/Defense Ratings granting Edge, drop initiative passes, and add an
Edge economy — discarding approved, working systems. Keep the three-gate chain,
initiative passes, dual condition tracks, Drain scaling with Force.

### 3.2 The shared frame — free flow ⇄ turn-based
All three pillars run inside **one mode structure** (`core/tempo.js`), which is
why a single shell was right to begin with:

| mode | when |
|---|---|
| **free** | default; the crew acts and the world advances alongside |
| **turnBased** | the player toggles it, or **combat forces it** |

Two rules that never bend: **mode changes granularity, never math** — the same
dice resolve the same way in both, so a player who prefers turn-based plays a
slower game, not an easier one. And **combat forces turn-based in every pillar**,
handing back the player's own choice when the fight ends.

`advanceWorld()` is the seam a real-time street will hang patrol routes and
camera arcs on. It **counts and nothing else**, by constraint: a real-time clock
must not affect a player whose interface still reads as turn-based.

### 3.3 Three pillars, three clocks
Each pillar has its own verbs and its own pressure. This is what stops them being
one menu with different nouns:

| pillar | verbs | clock | character |
|---|---|---|---|
| **street** | move / observe / approach / engage | alert bands | **social** — moves only when something perceives you, so care is free but slow |
| **astral** | assense / drift / manifest / engage | the tether | **absolute** — runs whether or not anyone noticed; your body is waiting |
| **matrix** | traverse / probe / run / exfiltrate / jackOut | Overwatch → 40 | **arithmetic** — climbs the moment you touch anything |

Three reasons to hurry: *they might see you* / *the cord is finite* / *they are
already counting.*

### 3.4 The Lattice — the astral's own grammar
Magic is not a roll, it is a **structure you manipulate**. Every construct is a
lattice of mana threads; one metaphor, three uses:

- **unwind** a ward — race its re-closing. A caster who cannot out-push the
  repair rate cannot get through however many strands they pull.
- **unravel** a binding — cut in the *right order*, like defusing a bomb.
- **assemble** a circuit — cast or summon, building to a shape.

**Magic** is how hard you can push at max and your max threads. **Force** is what
*percentage* of that you are pushing now, with Drain scaling. **Sorcery** is how
far one move carries; **Conjuring** the same for spirits. **Assensing** governs
the *quality of information* about each thread — never whether threads are
visible. You always see the lattice; assensing decides how much you understand.

**The constraint:** the player is the Johnson and never personally goes, so this
can never become a test of the *player's* dexterity or pattern-reading. The
runner's stats set the puzzle; player choices modify from there. A renderer must
be handed `latticeRead()`, never the raw lattice — otherwise a dabbler solves it
like an adept and assensing becomes decorative.

### 3.5 Bound helpers — watcher spirits and agents
One model, two skins. A helper **owes N tasks, and each task is a separate
action** — width, not power. It lets a crew do *more things* in a beat rather
than the same things better.

| | watcher spirit | agent |
|---|---|---|
| pillar | astral | matrix |
| acquired | conjured through the Lattice | loaded onto a deck |
| cost | Drain | a program slot |
| capped by | Force | **deck rating** |

**No technomancers, no sprites** — sprites are technomancer-only. The Matrix
equivalent of a watcher is the **agent**: ordinary decker gear, rated 1–6,
explicitly *dog-brained*. On an unexpected situation it makes a Rating × 2 test
and on failure either does the wrong thing or **stops and asks for
instructions**. That last part is the flavour.

---

## 4. THE ROSTER — THE CORE SYSTEM

More central than any single pillar. Progress is who you know, who you have
protected, and who you can afford.

### 4.1 The market
Continuously, procedurally regenerated pool. Each runner has a **dossier**:
fully-visible stats, a **Discipline line** (Generalist or a named Specialist
focus), a personality line, a price.

**Price is the Discipline lens applied to the visible skills** — not a flat
number and not always a fair one. The label can over- or under-value the actual
skills, which is exactly where bargains and traps live.

### 4.2 Watched / unwatched / hired
- **All Hired runners are Watched.** Watched turns on stat tracking and growth,
  and exposes a runner to the shelf-life roll — *unless* under contract, which
  suppresses that roll for the contract's duration.
- **Unwatched runners are a guaranteed loss.** One shelf-life timer, no roll, no
  growth, no closure. The timer is **visible** — "leaves in 2 days" vs "leaves in
  7" is what makes pick-or-pass a real decision.
- State machine (watched, not hired): Available → Working / Out of Town / KIA.
  Shelf life **re-rolls after every transition**, a cheap abstraction implying a
  whole hidden economy of other Johnsons.
- Odds are tier-weighted: top-tier runners rarely roll KIA (too good at not
  dying); low-tier carry real risk. This is why losing a runner you saved up for
  lands fairly — KIA will have visibly happened to lesser runners many times
  first, so the rule was always true.

### 4.3 Growth
Runners grow through **Karma**, awarded per mission, scaled to the security
threat actually faced, spent automatically along their archetype.

**Growth comes from what the player assigned that runner to do** — a mission, a
scouting task, or crafting duty. The Available/Working/OutOfTown cycle is about
*availability and risk*, not a hidden clock that advances them. **Reason:** a
top-tier dream hire stays a reachable target while the player saves toward them,
which keeps the chase a real goal.

**Support work grows a runner too**, at a visibly lower rate with lower
difficulty ceilings. Safe grinding is legitimate and indefinite; missions with
real obstacles remain the obviously efficient path.

### 4.4 Hiring tiers — counted in MISSIONS, never calendar days
| tier | what it buys |
|---|---|
| Freelance | exactly one mission at market price |
| Retainer | a contracted block at a discount, protected until used — the **audition tier** |
| Permanent | lump sum paid once, protected forever, **plus a daily wage** |

An untouched retainer never lapses, on purpose — the cost is self-balancing
(they do not grow while benched, and the operation moves past them).

**Permanent upkeep** is a small daily wage scaled to market value; retainers pay
nothing. It gives a mature operation something pulling nuyen back out, aimed at
the **active** elite crew rather than the bench.

### 4.5 Mission risk
**Runners can die on jobs.** A death the player can see coming and choose to
risk is a consequence: they watch the health tracks fill, choose to press or
withdraw, can spend a revive, can retreat. Save-scumming also exists.

- Full takedown → **1 in 20 dies**, 19 in 20 take a wound.
- Wounds scale with **damage taken vs the runner's own resilience**. Being
  dropped by a tier-9 hardsuit marks a career; a rent-a-cop does not.
- Wounds are **debt, not status effects** — the score is simply lower. They do
  not cap, which keeps recklessness costly.
- Two ways to pay it: **magical therapy** truly removes wound points, penalised
  by Essence loss so it works best on natural bodies; **cyberware offsets**
  instead of removing — a thrice-wounded veteran who chromes sits at net zero,
  money and Essence spent to stand still. Self-reinforcing: high-Essence runners
  stay maintainable through the mage, low-Essence slide toward the machine, and
  Essence is finite so the slide has a floor.

### 4.6 Equipment
Gear is owned by the **operation**, issued per job, reclaimed and reassigned.
"Two decker runners, one top-tier deck" is a real allocation decision every time
both could use it.

**Runners arrive with personal kit** — a weapon and armour suited to what they
are good at, **capped at tier 4**. A hired professional owns a sidearm. The
allocation decision holds because the armoury is the only route past mid-tier;
personal kit cannot be issued, pooled or sold, and an issued weapon overrides it.

**Crafted gear is always better than the shop version of the same item.** Every
crafted item carries `quality` 1–3, scaled by the crafter's margin, stacking onto
tier everywhere tier already means something. It keeps the bench worth using at
every tier — a decker who owns the best deck money buys is still worth building
one *for*. The edge is paid for in the one currency that never replenishes: a
runner is at the bench instead of on a job while the board keeps turning. **The
shop sells time**, which is the scarce thing.

### 4.7 The economy
**Time is the binding constraint, not nuyen.** Every action costs days, and days
are bounded by board churn — jobs expire while you spend them. Nuyen
replenishes; time does not.

The roster is an infinite money sink (always another elite, another specialist,
another veteran to chrome). Failure feeds the economy too: wounds and wipes are
sinks triggered by loss, which gives caution monetary value.

Two secondary-yield loops exit differently: Matrix **data** → fence → nuyen;
Astral **reagents** → crafted gear with no nuyen middleman.

---

## 5. ARCHETYPES, SKILLS, ATTRIBUTES

### 5.1 The rubric and the design law
- **Distinct, Frequent, Versatile** — a specialty must differ from what a
  generalist does, come up often enough to matter, and have ≥2 meaningfully
  different uses.
- **Systems are expensive, rows are cheap.** A focus may only *recombine verbs
  the game already has*. Every focus is expressible as generator data, which is
  how the roster grows forever in *variety* without growing in *systems*.

### 5.2 The seven attributes
| attribute | skills | also does |
|---|---|---|
| Agility (5) | firearms, marksmanship, stealth, larceny, rigging | evasion, ½ Initiative |
| Strength (3) | heavyWeapons, melee, athletics | melee Power, recoil compensation |
| Intelligence (6) | demolitions, medicine, computer, hacking, electronics, perception | ½ Initiative |
| Charisma (3) | con, leadership, intimidation | — |
| Magic (4) | sorcery, conjuring, enchanting, assensing | capped by Essence |
| **Body (0)** | — | physical damage track, soak |
| **Willpower (0)** | — | stun damage track, Drain resistance, Full Defense |

**Strength is its own attribute** because melee Power scales with the arm
swinging the weapon. That is what makes a troll and an elf hit differently with
the same knife, and it is a direct expression of §1's "no single meta item" —
weapon choice, body, and target armour all matter to the same swing.

**Body and Willpower carry no skills** and are the two pure defensive stats:
Body the physical track, Willpower the stun track plus Drain and Full Defense.
This mirrors how the source uses them.

**Collapses from the source:** Reaction folds into Agility; Intuition and Logic
fold into Intelligence. Both are fixed by the design's own "Initiative = Agility
+ Intelligence".

### 5.3 Attribute growth — a reserved share
The tabletop charges rating×5 for an attribute against rating×2 for a skill, and
that pricing works there because **a player chooses to save up**. An automated
cascade needs allocation instead: **25% of every award banks into an attribute
fund**, spent on the focus's key attribute first, then the attributes behind the
archetype list. Skills keep their cascade with the remainder.

Growth stays thematic by construction — an attribute no skill of theirs uses is
never bought. When every relevant attribute reaches its ceiling, the share
returns to skills.

### 5.4 Metatype sets CEILINGS
A metatype's real mechanical identity is the **maximum** each attribute can
reach. That is what makes race compound across a career and makes the metatype
line worth reading at hire time — it says where that runner's career ends.

Population: **Human 50 / Ork 20 / Elf 10 / Dwarf 10 / Troll 10.**
Awakened: **one third of the market** — ~25% mages, ~8% physical adepts.
Deliberately above the setting's ~1% baseline (a runner market is self-selected
for outliers) and well below an even split (humans read as the norm).

**Two dials that only work together:** the metatype draw and the focus draw.
Every mage focus is Awakened by construction, so the mage focuses' share of the
focus table sets the floor on Awakened frequency before origin is consulted.

### 5.5 Skills cap too
Both attributes and skills cap. What a finished runner is *for* is answered by
§1: the roster scales horizontally, and a maxed runner is a completed tool.

### 5.6 LANES — the character sheet, on both sides of the table
P/A/M are **budget categories the generator spends**. They decide how much a site
buys and how hard its worst thing can be. They were never a statement about a
*person*, so "your crew brings P:12d against est P:4" was two numbers in
different units and no answer at all to *what does a runner need to be?*

Lanes are the answer. Seven of them, each a bag of skills that answer the same
**kind** of problem:

| lane | skills | unit |
|---|---|---|
| Sneak | stealth, larceny | dice |
| Face | con, intimidation | dice |
| Tech | hacking, electronics | dice |
| Banish | conjuring, **sorcery** | dice |
| Attack | firearms, marksmanship, melee, heavyWeapons, demolitions, **sorcery** | dice |
| Defense | *none* — armour rating | armour |
| Awareness | assensing, perception | dice |

**Sorcery is in two lanes on purpose.** It is the one skill that acts on both
astral beings and physical ones — it unwinds a ward and it throws mana at a
guard. That is not double-counting; it is what makes a combat mage worth the
Drain.

**Off the card, each for its own reason:** `computer` and `enchanting` are bench
skills and may never front a way past a thing; `medicine` and `leadership` are
never a site's requirement; `athletics` is terrain, a visual-layer concern;
`rigging` is a force multiplier — a drone carries the lane, it is not one.

**LANES FORECAST. THEY DO NOT RESOLVE.** Nothing in the resolution path may
consult a lane. Resolution stays exactly what §11.5 says it is: PRESENCE, then
NATURE, then dice. A lane is what the player reads *before* committing a crew,
and the moment it gates anything it has become a second, sloppier rules engine
on top of the real one. A stress probe reads mission.js, verbs.js, site.js,
combat.js and resolve.js as text to prove none of them mentions one.

**THE IMPRECISION IS THE POINT.** Bundling six skills into one number is not a
simplification for the player's benefit — it is deliberate blur. A lane says
"you are roughly short here"; it will not say which of the six would fix it, or
exactly what is waiting. **That gap is what makes recon worth a day.** A
perfectly precise report card would delete scouting from the game.

**Which** lanes a site demands is read off what it actually fields, crossed with
the verb table: a lane appears only if some verb it fronts would genuinely land
on something standing there. A building with cameras and locks and no people in
it does not want a Face, and the silence says so. **How much** it demands comes
from the number the player *has* — the estimate, or a confirmed reading if they
earned one, never the true tier. So the card is confidently wrong in exactly the
ways the briefing was wrong.

**Crew stacking is the source's Teamwork test.** The best pool leads; every other
runner adds `floor(their pool / 3)` — their expected hits — capped at the lead's
own skill rating. Not a max (four people are not worth exactly one) and not a
sum (four mediocre runners must not out-do a specialist). Two exceptions:

- **Awareness is the sharpest pair of eyes, not a teamwork test.** You cannot
  help someone else look at something; everyone rolls their own Perception and
  whoever makes it is told what they see.
- **Defense is the worst-dressed runner.** Nobody soaks a bullet on someone
  else's behalf, and that runner is the one who comes home in pieces.

**Attack asks the Penetrate gate before the pool.** A runner whose best Power
cannot beat the toughest armour that fights back contributes *nothing* to the
lane, however well they roll — because they genuinely cannot. That is the wipe
that prompted all of this: holdouts at Power 4 against T4 guards at Armour 5, a
fight that was arithmetically unwinnable and that nothing warned about.

**Tier buys better guns.** §6's note that a rating purchases "more of them,
better armed and better armoured" was true of armour and stats and never of the
weapon, so incoming Power was 6 at every rating and armour was worth the same
everywhere. Guards now ladder holdout → pistol → SMG → rifle → machine gun
across tiers 1–10, which is what gives Defense something to be a read *about*.

**A RATING IS A SPREAD, AND NEITHER END IS THE ANSWER.** Obstacle tiers are
drawn uniformly across `1..rating`, so a "~4" building is not four identical
guards — it is a 2, a 3, a 5 and a 6, and they even out. Every number the card
quotes has to pick a point on that spread, and **which** point is a design
decision per lane.

**Never the maximum.** That is the outlier, and a player standing outside has no
way to know whether it is in there. Quoting their best armour is the same
overclaim as quoting their best gun — or as reading the true tier. The
upper-quarter formula is explicitly held one below the rating for exactly this
reason (`ceil(3r/4)` lands *on* the max at rating 3).

| lane | reads | because |
|---|---|---|
| Defense | the **median** tier | Absorbing hits is averaged over a whole firefight, so the ordinary round is what decides whether the crew comes home. |
| Attack | the **upper quarter** | Failing to penetrate is *not* averaged. The guard you cannot scratch does not become scratchable because the last two were softer — he just stands there while the crew empties magazines into him. |

**The card is a FLOOR, not a promise, and it is meant to be learned by playing.**
A crew that packs exactly to it meets the half of the spread sitting above it and
takes a beating. Measured over 300 generated sites: the building held something
harder than the card's floor **33%** of the time, and the crew's best could not
hurt that thing **28%** of the time. That is the lesson — bring a few points more
than the card asks — and it is why the numbers are honest rather than padded.
Padding them would just move the floor and teach nothing.

**EVERY number quoted at the player is on this spread — including the header.**
`diceForSecurity` reads the high band too, so `P:~12d` is the pool for the high
end of typical, not for the site's hardest possible obstacle.

An earlier pass exempted the dice lanes on the grounds that you must clear
*every* obstacle, so the hardest one sets the bar. **That argument is about
mechanics and says nothing about information.** The player has no way to know
where the maximum sits, so quoting the pool for it hands them a fact they never
earned — the same overclaim as printing the true tier on the job card. The
mechanical point is real, and the answer to it is that the number is a **floor**:
bring exactly it and the top of the spread will still beat you sometimes. That is
what recon is for.

The scale moved: 3 → `4d` (was 8d), 5 → `8d` (was 12d), 7–8 → `12d` (was 16d),
9–10 → `16d` (was 19d).

**The armour ladder is contiguous, 1–8, and that is load-bearing.** Armour is one
side of the Penetrate gate, so every rating a weapon can demand has to be
*buyable* or the gate has bands nobody can stand in. It ran 1, 2, 3, 6, 8 — with
a hole at 4–5 the best affordable coat left a crew one short of the softest
target, and the next rung was a 3.5× price jump, so "buy better armour" was a
wall with a door on the far side of it. Personal kit tops out at the tier cap
too: a runner with a real combat record owns a jacket that stops a holdout round.

**ICE is not a firefight, and neither half of the fight read may see it.** Black
ICE carries `fights: true`, armour and a Black Hammer, and none of that is
answerable with a coat or a gun — it burns a decker's brain onto the stun track,
and there is no Matrix attack verb to shoot back with. Left in, it broke the card
twice: a P4 site demanded armour 8 quoting a weapon that will never be in the
room, and — worse — ICE became the "toughest thing that fights back", so every
runner failed the Penetrate gate and a wired samurai read **Attack 0** against a
building full of ordinary guards. A false zero in the one lane whose whole job is
to warn you honestly is worse than no lane at all. Getting caught by ICE is real
exposure, but it belongs to **Tech** — don't be seen — not to armour or guns.

**The card marks what is still a briefing.** A `~` sits on the right of the slash
until that axis has been confirmed, the same admission the header already makes
with `~4d` against `4d✓`. What the crew brings is never marked: you know who you
hired and what you issued. Confirming an axis changes no number — only what the
readout is entitled to claim.

---

## 6. JOBS, THE BOARD & MISSIONS

**A Job is the contract**: one hiring faction, one nuyen payout, paid once on
completing its success criteria.
**A Mission is the dispatch unit**: its own target faction, its own site, its own
objective/verb/domain/tier/crew.

A job bundles 1+ sequential missions for the same client and **can span multiple
target factions**.

- **Karma is per-mission.** Every runner who completes a mission's objective
  earns it, whether or not that mission was the contracted deliverable. This is
  what makes "send a couple of runners to soften up a target first" a real
  tactical choice — everyone grows, but nuyen only pays once.
- **Nuyen is per-job**, summed from every mission's site-derived contribution.
  **This is the mechanism for unbounded pay scaling** — more missions sequenced
  into one job as the operation matures. Site Value stays capped at 10 forever.

**Language:** jobs are *accepted* and *completed*; missions are *dispatched* and
*resolved*. Dispatch lists say "job-derived objectives."

**Crew size:** every job carries an **intended crew size** on its board card, and
every job is **runnable by any crew of 1–4 regardless**. But **runnable is not
solvable** — success depends on which *skills* are present, independent of
headcount. A crew of the right size with the wrong composition fails outright.
This is load-bearing: it is what makes roster composition the real decision.

**Security is a RESULT.** Every site has a **Value** (1–10, how big a deal the
target is) and an **Orientation** (physical/astral/matrix/balanced). The leaned
axis carries Value directly; the others take a steep discount, so a leaned site
reads genuinely lopsided ("astrally naked, physically stacked"). A job's tier and
pay derive from whichever site it matched to.

**Matching is loose**, and that gap is meant to be **discoverable through
scouting** — a Physical scout on a "safe" job turns up guard counts that do not
fit the label.

---

## 7. MEATSPACE & COMBAT

### 7.1 Entering turn-based
Turn-based is the **command mode**, not a combat screen — it is where **all
deliberate action** happens, combat and any coordinated interaction alike. The
player is the one entering it, and the one acting inside it. Two entries:
- **Forced:** hostilities go live — a witnessed or failed takedown, a tripped
  alarm, a spotted crew.
- **Chosen:** the player drops in to coordinate. Choosing it **while still
  undetected is the ambush** — a surprise round where the crew positions and hits
  while the unaware enemy cannot respond.

**Why turn-based at all:** fairness. In real time the player gives one order
while the AI moves its whole side at once; alternation lets the crew act as a
coordinated team, which the mind reads as simultaneous — the load-bearing fiction
of the genre.

**This whole section presumes a player in the seat.** A mode you toggle, an
order you read before committing, an ambush you plan — none of it means anything
to a resolver playing itself. **AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME**: it
drives this engine with house policy so the systems can be exercised, and the
day the player's seat is wired the engine underneath does not change.

> ### ⚠ What turn-based actually IS
>
> **A SEQUENCE, not a universal menu.** Turn-based puts every runner and every
> hostile into an initiative order and steps through them one at a time. When a
> combatant comes up, the player is prompted with **only the actions relevant to
> THAT character** — this runner's weapon, this runner's spells, this runner's
> reach and stance options.
>
> It is *not* "every character may choose from every option at every action
> point." A menu of everything at every step is a spreadsheet with dice; the
> sequence is what makes a fight a series of specific people doing specific
> things in a specific order.
>
> **This is a many-factors-at-once read** — position, cover, who is next, what
> is in reach — which is why the player's combat seat waits for the **visual
> layer**. Wiring it as a text prompt would bake in a shape the spatial layer
> then has to fight. Building the text version first is how the destination
> keeps getting mistaken for the renderer.

### 7.2 Initiative — deterministic
- **Initiative Attribute = Agility + Intelligence.** Flat, no roll. Perfect
  information, plannable, chess. Reading the order before committing is what
  makes an ambush a plan rather than a gamble.
- **Initiative dice = ACTION COUNT.** The mechanic worth building the combat
  economy around. A mundane guard gets one; a samurai with Wired Reflexes gets
  three or four.
- **Pass structure:** everyone acts in pass 1, then only units with 2+ act in
  pass 2, then 3+. Order within each pass is by initiative, so fast units **lead
  every pass** and read as constantly in motion. Everyone is guaranteed their
  pass-1 action before anyone doubles, so slow units always get to move.
- Extra actions are bought with **Wired Reflexes** (cyber, Essence-priced) or
  **Improved Reflexes** (adept magic, no Essence) — the cyber-vs-adept parallel
  attached to the single most powerful thing a combatant can have.

### 7.3 Action economy
Each action is **move + one thing**. Movement is a per-round **radius**
(Agility-based), no grid, shared across all a runner's actions — so extra
initiative dice grant more *actions*, never more *distance*. The blur-samurai
shoots four times; they do not sprint four times as far.

### 7.4 The three-gate chain
1. **Hit** — attacker accuracy vs target evasion (Agility) and **cover state**. A
   geometry check the player controls through positioning.
2. **Penetrate** — the weapon's **Power** vs the target's **Armor**. A
   high-Damage low-Power weapon does nothing to a plated tank; an
   armour-piercing rifle chews through it. **This gate is why weapon variety
   matters.**
3. **Damage** — only what got through, applied to a health track.

**Dual health tracks:** Body drives physical, Willpower drives stun. Lethal
weapons fill physical; stun weapons (gel rounds, batons, stun spells) fill stun.
**Either full = down.** This gives non-lethal a real mechanical lane, so a
capture contract is a loadout decision rather than a fiction.

**The two damages differ in what they leave behind, because they differ in what
they are.** Physical damage is injury: it rides home on the runner as
`runner.wounds` — boxes on the same track they would fill in a fight — and is
still there next week unless somebody treats it. Stun is exhaustion: real inside
the fight, gone by the next job. So:

- Walking out of a firefight is not walking out unhurt. Survivors carry their
  physical boxes; going down and living means carrying a full track.
- Boxes cost dice on **everything**, at **-1 per three**. A decker with cracked
  ribs is worse at talking their way out of the lobby too.
- A runner enters the next fight already on those boxes. Turning up at four
  filled is the whole reason a Johnson keeps a bench.
- **Two clocks close them.** Rest closes one box every few days, faster for high
  Body — free, and slow. Medicae closes the threshold plus every hit beyond it,
  and the case's tier is half the boxes plus Essence already spent, so chrome
  complicates surgery. Measured: a full track is **~5 days with a trained medic,
  ~19 with whoever happens to be standing there, ~30 with nobody.** Paying for a
  medic buys speed, and speed is what matters when a contract has a window.

**Cover is positional** — computed from where a runner stands relative to the
shooter, so moving into hard cover against one threat can open them to another
angle. **Reinforcements arrive**, pathing in from entry points on rising Alert,
giving a window to reposition or run.

### 6.1 Modifiers are one layer
Every number a fight produces is a base plus a sum over the **effects** active on
the combatant. Nothing in the resolver asks what posture someone is in; it asks
what the total is on a channel. That is what lets cover, a flashbang, a stun
baton's rattle, Wired Reflexes and a spell all be the same kind of thing.

**Channels:** accuracy, defence, power, damage, armour, soak, initiative,
initiativeDice.

**Three kinds of effect:**
- **Postures** — open, cover, flanking, full defence. Mutually exclusive: a
  combatant always has exactly one. This is what the spatial layer eventually
  drives from real geometry, and when it does it changes what *applies* cover,
  not what cover *does*.
- **Conditions** — prone, blinded, deafened, suppressed, rattled, wounded. These
  stack alongside a posture, cap at their own stack limit, and most run on a
  timer that counts down each round.
- **Boons** — chrome, adept powers, drugs, spells. The `initiativeDice` channel
  is how anything buys extra actions, so Wired Reflexes and Improved Reflexes
  have a home before either exists.

**Injury is one of them.** `wounded` goes on when a combatant has physical boxes
and comes off when they are treated. It moves the *defence* channel only —
attacks already pay for wounds through effective skills, and charging both would
bill one wound twice.

Adding a new modifier is adding a row, never editing the resolver.

---

## 7b. SPELLS — THE CANON GRIMOIRE

**These are Shadowrun's spells, not invented ones.** Names, categories, types,
ranges, damage codes and Drain modifiers come from the SR5 core rulebook
(verified against the Chummer5a data set: 93 core spells). The rules content IS
the homage — gear brands are original, the magic is Shadowrun's. **57 of the 93
are implemented**; the other 36 are deferred *by name* in `models/spells.js`,
each with its reason (no poison model, range geometry, no distraction hook), so
adding one later is a row, not a system.

### The canon axes, and where each lands
| axis | rule | lands on |
|---|---|---|
| **Direct vs Indirect** | direct touches mind/body, **armour does not apply**; indirect throws something real, armour resists, **AP −Force** | the Penetrate gate |
| **Mana vs Physical** | type M touches only the living and the magical; type P also touches objects | verbs × properties' `living` gate |
| **Touch / LOS / Area** | touch is cheap Drain priced against adjacency; area hits everything sharing the ground | `enemiesFor` |
| **Force** | chosen per cast, **up to 2× Magic** (canon; was Magic+2). Above Magic is overcasting — Drain turns PHYSICAL | `maxForceFor` |
| **Drain** | **max(2, Force + printed modifier)**: Punch F−6, Stunball F, Mob Mind F+1. This pricing is the spell economy | `resistDrain` w/ override |
| **Sustaining** | −2 dice on everything else the caster does while held | the effects layer + `sustainPenaltyFor` |

### Spells live on the dossier — finally true
A mage generates knowing **Magic-rating spells**, focus-weighted with the
signature guaranteed (a combatMage always has Manabolt; a healthMage, Heal).
`spellsFor()` is **grimoire ∩ trained**, never the whole book. Growth is canon:
a formula (auto-generated into the armoury, one per spell, named for the spell)
plus **5 karma**. The dossier renders the grimoire — two mages at the same
price knowing different spells are different hires, which is the point.

### Meatspace casting: a spell is a verb only its caster has
Grimoire-gated verbs (`carries`, the same mechanism as `shoot` needing a gun):
three attack shapes (`castBolt` direct mana / `castSmash` direct physical /
`castBlast` indirect), plus Magic Fingers (pick at range), Levitate (bypass
where nothing watches), and `command` (Influence/Control — con by force). The
crossing does the canon work unauthored: **Manabolt reaches a maglock and does
not land; Powerbolt opens it.** The astral pillar's `blast` is no longer
anonymous — it fronts the best combat spell on the dossier, and a mage without
one has nothing to throw.

Utility spells cast mid-run through `castUtilitySpell`: Invisibility feeds
per-watcher concealment (**mana fools minds, so cameras see through it — only
Improved Invisibility beats a lens; nothing physical hides an aura from astral
eyes**), Hush/Silence suppress `loud` (the shot still has to survive being
*seen*), Heal closes boxes, detection buys route knowledge onto the prompt,
Analyze reads one thing's immunities without paying an attempt for them,
Stabilize auto-casts between the wound and the grave. In combat a mage casts
when the grimoire beats the gun; the blow-by-blow prints casts, Force, Drain
and "straight through armour."

**The lattice is the SAME cast, one rung deeper** — `viaLattice` builds the
circuit thread by thread on the astral, exactly the fidelity-ladder abstraction
the decker gets: hack the maglock from the corridor, or jack in and do it
properly. The shallow/deep choice as a *mid-run* decision is designed but
deferred; its home is §3.3's clocks plus the initiative ratio — **meat 1 die,
astral 2, cold-sim 3, hot-sim 4** — and `buildRound`'s pass structure already
runs faster consciousnesses more often in one shared scene, with the slumped
body a defenceless combatant the crew defends (§9's "real, protectable body").

### The grimoire is its own thing, callable from anywhere
**`grimoire.js` knows nothing about obstacles.** A spell is not a way of
answering the thing in front of you; it is something a mage *does*, and the most
valuable moment to do most of them is before anybody is looking. So the module
owns two functions and one menu, and the obstacle prompt is merely *one caller*:

- `entriesFor(caster, ctx)` — every spell they know, each castable-here or greyed
  with the reason. **`ctx.obstacle` is optional**; without one, the spells that
  need a target say so ("nothing in front of them to cast it at").
- `open(opts)` — the two-step menu: pick the spell, then pick the **Force**.

Callers today: the obstacle prompt's "cast a spell" row, and the **pre-run prep
step**. Anything later — a hub screen, an astral scene, an overworld — calls the
same two functions and inherits the same rules.

The submenu **deliberately breaks the main menu's rule** that we never show what
we know doesn't apply. The main menu hides dead approaches because they are nine
lines of noise between the player and the transcript; the submenu is the
**character sheet**, and reading what your mage *cannot* do here is how the
player learns what the spells are. That knowledge was bought at hire.

The player's pick is honoured all the way down — `choice.spellId` overrides the
verb's automatic "best known of this shape", so choosing Stunbolt throws
Stunbolt. A spell routed through a verb shows the **verb's** projected class
(`readsAs`, repeat-escalation included), never its own, so the threat shown is
the threat applied.

### Force is the player's dial
§14 says the player picks Force, and until the dial existed every cast silently
went out at full Magic. Force is the one lever magic has that nothing else does:
**it scales what the spell does and what it costs in the same breath.** The
ladder offers the decisions worth making rather than 1..2×Magic as a wall of
rows, and always straddles the **overcast line** — where Drain turns PHYSICAL —
because crossing it is the decision. Each rung prints what it buys ("5 armour",
"DV 6, AP −6") and what it will cost to resist.

### Cast before anyone is watching
**A cast is not one flat "odd moment."** What it reads as is the spell's own
business, on the same ladder every other act uses:

| reads | what it looks like |
|---|---|
| **THREATENING** | a buff or a barrier — you are visibly arming yourself, or the air is hardening into a wall |
| **QUESTIONABLE** | somebody blurred out of sight, sound died, hands glowed over a wounded runner |
| **AWKWARD** | a mage staring a beat too long at a door |

Armour going up in front of a guard is **not awkward** — it is a man watching
someone prepare for violence, and he responds like one. But the threat only
lands if something **sees** it, so the same spell in an empty corridor costs
nothing. **That is the decision the prep step exists to offer:** the run opens
*outside*, with nothing in front of the crew, and the grimoire offers exactly the
spells worth pre-casting.

`opts.prep` says so **explicitly** rather than being inferred — `run.obstacles[0]`
exists from the moment the run is built, so a prep cast that fell through to it
would have been "seen" by a guard the crew has not walked up to yet, which is
precisely what pre-casting exists to avoid.

**A cast asks a wider witness question than an act does.** `wasWitnessed`
excludes the obstacle being acted *on* — take down the one guard in the room and
nobody is left to have an opinion. That is right for an act against the thing and
wrong for a spell not aimed at it: the mage who armours up six feet from a guard
has not *handled* him, he is a bystander with eyes. So `castNoticedBy` includes
the thing in front of the crew.

### The card reads the DISPATCH, not the site
An astral recon meets wards and spirits. Quoting the corridor's guards at it —
*Sneak 0/4, Face 0/4, Tech 0/4, Defense 1/4* — told a solo combat mage they were
unqualified for ground they will never stand on. `missionPlanes()` maps each
dispatch to the ground it walks, and the lane card filters to it.

The rule inside is **bodies reach everything**: on a street job every pillar's
verbs count, because the decker hacks the maglock **from the corridor** (AR — the
shallow rung, no jack-in) exactly as the mage casts at it. So **Tech stays on a
street card**. A pure projection or a host crawl has no body on site, so only
that pillar's verbs — and worn armour, being meat, gives a projection no Defense
row at all.

### Armor the spell is Defense the crew brings
The lane is the worst-dressed runner, and a mage who knows **Armor** casts it on
exactly that runner before the doors. The forecast says so: the floor rises by
`min(6, Magic)`, capped at the **second**-worst coat, because one cast armours
one person. The fight honours the same number — Armor grants **Force** armour
(`stacksFromForce`), not the flat +1 that was a rounding error wearing canon's
name.


## 8. THE ASTRAL REALM

Played solo by whichever mage is assigned — turn-exchange encounters over a
painted mirror of the physical world.

**Why impressionist:** astral perception is not sight. Mages read a "third eye"
impression of emotion and intent rather than light and surfaces. Mirrors are
blank. Living things blaze with colour; the corrupted read sick, dim, wrong. That
describes an impressionist painting, not a photograph. The renderer **subtracts
detail** — murky silhouettes — then paints on the only things astral perception
sees: auras, emotional stains (a murder site burns red, a sterile office reads
grey-dead), wards as walls of light, signatures as glowing traces. Cheaper to
produce than meatspace, and lore-faithful for exactly that reason.

**Traversal: movement is free, vision is constrained.** Astral forms pass through
walls, but walls cast opaque astral shadows. The inverse of meatspace: go
anywhere, navigate murk where only living and magical things shine.

**Two exceptions define the level design:** earth is solid, and **wards block
movement — the one wall that works both ways.** Which yields the pillar's nastiest
situation for free: **a ward between you and your body blocks the way home.**
Budgeting the way out is part of going in.

### The pressure triangle
| pressure | what it is | managed by |
|---|---|---|
| **Drain** | the action cost, scaled by the **Force** dial — push soft (weak, cheap) or hard (strong, draining). Drain full = dumped back to the body, KO'd: the *soft* fail. | Force discipline; fetishes absorb drain |
| **Tether** | a budget of astral **turns**, sized by Magic. Every move, assense and exchange ticks it. Tether out = forced snap-back plus a wound: the *hard* fail. | efficiency; an anchor talisman extends it |
| **Attention** | the Alert-mirror: quiet → watchers curious → guardian spirits hunting → **the site's own mage projects in to find you** | masking, the Illusion specialty |

Drain is how hard you pushed; the tether is how long you have been out. A fast
loud run burns Drain but few ticks; a slow careful run conserves Drain and eats
the tether — the same duality that makes the Matrix's cards-vs-Alert work,
wearing different clothes.

A projection lasts **Magic hours** in the fiction, so the tether is generous:
it constrains a weak projector meaningfully and rarely binds a strong one inside
a single infiltration.

**Loadout:** spells live on the dossier — they are what you hired. Foci,
talismans and fetishes are armoury equipment issued per job, exactly like decks.

---

## 9. THE MATRIX

**A node-traversal puzzle wrapping a deck-building combat/stealth layer**, run by
whichever decker is assigned — **using a deck the Johnson owns**. RAM, program
loadout and every deck stat belong to equipment the player builds and upgrades.

### Four layers
1. **Intel** — what is known before committing; rough at first, earned in full
   through repeated runs.
2. **Loadout** — the deck locked in at mission start, built against that intel
   from a single shared RAM budget.
3. **Route** — which path through the node graph; a live trade between Alert
   exposure and card expenditure.
4. **Encounter** — card resolution at each node, programs vs ice, turn by turn.

**Intel is earned through repetition.** Astral scouting cannot feed a decker
intel — the Matrix is wholly virtual, so it earns knowledge through the assigned
decker's own attempts. Nodes cleared or scouted stay known across separate
attempts. Getting dumped triggers a consequence (a timed lockout, hardened ice
next attempt) and **can poison a linked meatspace job on the same target the way
a clean run sweetens one**. Nothing learned is guaranteed to stay true — a system
that has been broken into does not sit still.

### Loadout: one shared budget, three card kinds
| type | behaviour | example |
|---|---|---|
| Permanent / reusable | always active once equipped, no charges, until suppressed | Detection, Masking |
| Impermanent / reusable | owned permanently; choose RAM spend on charges; refillable mid-run at a cost | Blast, Heal, Wipe |
| Permanent / consumable | true one-time use, no refill ever — the payoff for precise intel | databombs, high-density Anti-ICE |

**Refilling:** one action remakes any quantity of ONE already-owned program's
charges — cheap regardless of quantity. Each distinct program refilled costs its
own action, and every action at a node ticks Alert. **Suppressed nodes emit far
less Alert, making a cleared hub a natural restocking base.**

### Route: Alert vs cards
The long stealthy route bleeds **Alert**, scaling with node count and per-node
type — an SPU barely registers, a CPU ticks hard. The short aggressive route
bleeds **cards** punching through Barrier and Black Ice. **The objective node
always costs cards too**, so no pure-stealth loadout skips paying at the finish
line.

Alert 0–50 maps to Response Level 1–5. Worked example: an 18-Blast loadout on a
route breaching Alert 30 (Response 3) needs roughly a third more copies per fight
than at Response 2 — the real question being whether some of that RAM is better
spent on Wipe (9 Alert cleared per use, costing as much RAM as 10 Blast or 5
Heal), suppressing the curve instead of fighting it head-on.

**CPU Cores** — a mid/late-game deck unlock letting a decker play multiple cards
in one action, refills included, easing the logistics tax as a reward for
investment.

### Data: the run's second payday
Beyond the contract objective, a decker pulls extra datafiles from datastore
nodes on the way out. Pulled data occupies the deck's **Storage**, a stat
distinct from RAM: a bigger deck carries a bigger haul. Files sell to a fence,
scaling with system tier and data quality; a Search-leaning decker finds more and
better. **This can exceed the contract fee — the run's real profit is often the
data, not the pay.** The deeper and longer you stay to fill storage, the more
Alert you eat, so profit trades directly against safety. It is the loop that
makes a good decker self-funding: data buys the better deck that pulls deeper for
more data.

**Signal distance:** early on a decker goes **on-site**, which makes them a real,
protectable body on the mission. A signal relay is a later-game unlock extending
range — it matters because it frees a crew slot for another fighter.

---

## 10. THE HUB CONSOLE

Where the player lives between missions. **Three levels of zoom:**
0. **The console** — full dashboard, every widget in collapsed summary.
1. **A subsystem** — click a widget for its full interface.
2. **An item** — one entry's own dossier card.

### Frame vs widget — the rule
- **The frame** carries compact state you **monitor** — results of what you have
  done: money, day, aggregate heat, operation status.
- **A widget** is earned two ways: it is a **subsystem you operate**, or it is
  **too voluminous to fit the frame**. (Faction standings are the second case: as
  un-actionable as heat, but far too many to glance at.)

### Widget set
| widget | role | gated by |
|---|---|---|
| Job Board | operate | always |
| Runners | operate | always |
| Armory | operate | buying always; the forge needs a weaponsmith |
| Drone Bay | operate | appears with drones; fabrication needs a rigger |
| Deck Building | operate | appears with a deck; the program forge needs a Computer-skilled runner |
| Grimoire | operate | appears with a mage; the design bench needs mage + lodge |
| Medicae | operate | wounds always; therapy needs a healer mage, surgery a Street Doc |
| Contacts | monitor | appears once you hold standings |

**The console grows with the operation.** Buying is always open; crafting is
gated by staff. A subsystem's forge stays dark until a runner who can work it is
on the roster — the program forge lights up the day you sign a programmer.
**This is the "see your empire grow" payoff rendered as the terminal itself
filling with active production.** It also creates a real roster archetype: the
runner with 9 Computer and nothing else is your full-time programmer, earning a
permanent slot without ever going on a mission. **Field value and bench value are
two independent axes** the generator produces separately.

### Deploy is a flow
Launching spans widgets: Job Board → pick a contract → pull a crew from Runners →
issue gear from Armory / Drone Bay / Deck Building / Grimoire → go.

### CURRENT DIRECTION (settled with the user, not yet applied)
Moving toward **tabs holding several widgets each**, adding a level: tab → widget
→ item.
- **Frame: core stats anchored LEFT** (day, nuyen, rep, capacity); **the day's
  plan anchored RIGHT**, collapsed, clicking opens a card. This keeps the frame
  rule intact — the frame shows a summary you monitor, the card is where you
  operate.
- **Armory is separate from Crafting.** Buying and issuing are immediate;
  crafting occupies a runner for days.
- **Staff gating stays.**
- Tabs: Runners (hired / watchlist / available pool), Contracts (active /
  available / completed, completed auto-collapsed), Crafting (Equipment /
  Programs / Spells), **Locations** (the site list, recon and search dispatch).
- **Recon results surface on the contract**, because that is where prep decisions
  are made.
- Runner cards show the **full** skill list including zeros. Cards render from an
  **explicit allowlist of player-visible fields**, which keeps hidden qualities
  hidden — `trueArchetype` is hidden truth and the Discipline mispricing system
  depends on it staying that way.
- Runner records will track successful/total runs, kills, hacks and similar.
  **That data is added before the sheet that shows it.**
- **Open:** whether there is a home/level-0 tab; where Medicae and Contacts land;
  whether Runners is one widget or three.

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
Format: `Condition-Adjective-Color-Noun-####` — the colour sits last among the
adjectives, the way English stacks them: `Derelict-Crooked-Emerald-Saddle-5299`.

**Each quality owns its own words.** There is no arithmetic anywhere in this —
the tables ARE the mapping, both directions:

| slot | table | what it says |
|---|---|---|
| Condition | `CONDITION_WORDS` | 8 conditions, 8 flavour words each |
| Adjective | `DISTRICT_ADJECTIVES` | one list per district (9) |
| Color | `OWNER_COLORS` | two colours per owner (8) |
| Noun | `ORIENTATION_NOUNS` | *which* list = orientation; *where in it* = value 1–10 |
| 4 digits | — | no declared quality, but **every digit changes the building** |

**The digits are not decoration.** They carry no *declared* quality, but the
whole name string is the generation seed, so changing them changes theme, room
count, edges, patrol routes, spirit zones and host size — and on a *balanced*
site, the security triple too (value ±2 per axis). Measured over 300 digit
variations of one address: 12 themes, 141 distinct layout shapes, 116 distinct
security triples. On a *leaned* site the triple is fixed by value+orientation,
so only shape and theme move.

Writing a name is picking from the district's list, the owner's list, and the
one noun that means this orientation at this value. Reading one back is the same
tables the other way — each slot is a lookup, not a computation. `Candle` is an
astral site of value 4, always and everywhere.

- **Every word is unique within its own table**, which is what lets a slot be
  read directly. The reverse index is built at load and throws if a word claims
  two slots, so a table edit can't quietly create an ambiguous name.
- **Words repeat across tables on purpose.** Amber, Crimson, Ivory and Scarlet
  are each a perfectly good colour and a perfectly good adjective. The slot says
  which table applies — which makes slot ORDER load-bearing rather than
  cosmetic. A probe swaps the two slots and requires the name to mean something
  else.
- **The qualities are the class; the name is the individual.** There are
  9 × 8 × 4 × 10 = **2,880 quality combinations**, and a probe round-trips all
  of them with zero holes. But the FULL name string is what seeds generation, so
  every distinct name is its own building — **26.2 billion of them** (64
  adjectives across the districts × 2 colours × 8 owners × 40 orientation-value
  nouns × 64 adverbs × 10,000 digits). Two names carrying the same qualities are
  two different places that happen to share a district, an owner, a value and an
  orientation: same security triple, different theme, different floor plan,
  different patrols.
- The name is hashed to seed the site, so the word order is part of the seed — a
  name is a key to one building under one grammar.

### 11.2b Condition — the first word, and the one that changes most
Eight conditions, eight flavour words each (64 words, the same slot width the
uniquifier used to have). The condition is a **quality like any other**: it is in
the name, it round-trips, and it drives generation.

`derelict` `posh` `fortified` `haunted` `wired` `bustling` `flooded` `raw`

**The lever is COMPOSITION, not amount.** A derelict building is not an
undefended one — it is one defended by whoever moved in. The corporate systems
are dead (no power, no maintenance, water in the risers) and the bodies holding
the place are squatters, gangers, things that eat people. A posh building is the
reverse: fewer bodies, cameras and maglocks everywhere the money reached. Both
can be ferociously hard; they are hard in ways that ask a crew for completely
different skills.

So each condition carries `weights` that multiply an obstacle type's chance of
being what a slot buys, and moves `security` only where the condition genuinely
destroys or creates capability — water and neglect really do kill a host, money
really does buy more of everything. It also nudges cover, patrols, spirit zones,
entry points and loot.

Measured over physical-leaning sites, value 6–10:

| condition | avg P | obstacles/site | guards | cameras+maglocks | spirits |
|---|---|---|---|---|---|
| `derelict` | 8.2 | 18.4 | **70%** | 10% | 14% |
| `posh` | 8.7 | 20.5 | 18% | **60%** | 3% |
| `wired` | 8.0 | 19.6 | 12% | **62%** | 3% |
| `bustling` | 8.8 | 20.6 | 53% | 33% | 5% |
| `haunted` | 6.9 | 18.0 | 23% | 47% | **19%** |
| `flooded` | 8.0 | 17.9 | 65% | 19% | 7% |

A derelict site is **as physically defended as a posh one** and fields as much —
it just fields bodies where the posh one fields systems. That is the whole point:
the crew you send is a different crew.

**Value is untouched**, and the player reads what kind of fight it is off the
first word of the address, so it is intel rather than a trap.

**Condition and theme are orthogonal.** Any building can decay, flood, or fill
with squatters — a sealed-off arcology floor is a *better* location than a
tenement, not a disallowed one. Gating themes by condition would quietly delete
the most interesting half of the space, so every theme is reachable under every
condition and the pairing is the flavour:

```
Crumbling-Patient-Jade-Bell-5378   derelict arcology floor · P8 A4 M1 · 15 guard, 2 spirit, 1 camera
Opulent-Electric-Jade-Bell-4998    posh datacenter · P9 A3 M5 · 12 camera, 5 maglock, 3 guard
Drowned-Humble-Amber-Bell-5866     flooded datacenter · P8 A3 M1 · 14 guard, 2 spirit, 1 camera
Cursed-Loyal-Amber-Bell-5730       haunted datacenter · P7 A6 M2 · 10 maglock, 5 spirit, 4 camera
```

**Two rules a condition may never break**, both held by probes: security clamps
to 1–10, and no condition may leave a site with fewer than two distinct routes to
the objective. An early `fortified` that removed an entry point broke the second
in 400/400 sites — a fortified building is one where every door is hard, not one
with fewer doors.

**No dead dials.** A probe fails the suite if a condition declares a key the
generator never reads, so a player can never find a number that turns out not to
matter.

### 10.5 Nothing runs out; repetition is what costs you
There are **no attempt limits**. A crew can always try again. What changes is
what trying again *reveals*: every repeat of an approach reads one band worse
(immediately for approaches whose own safeguard handled the first try, otherwise
every second try). Persistence is priced in **exposure**, never in a counter.

**Brute force is always available; violence is only one form of it.** Which form
depends on what the obstacle *is*:

| class | data | the inexhaustible approach |
|---|---|---|
| **Inert** — maglock, ward, barrier ICE | `senses: []`, no `fights` | Work it. It cannot perceive you or act, so given time it opens. Kicking it does nothing — the loud option is demolitions or sorcery, a real skill, not a universal fallback. |
| **Sensor** — camera, patrol ICE | `senses: [plane]` | Perceives and reports; cannot stop you. Its presence is what makes acts nearby cost anything. |
| **Responder** — guard, spirit, black ICE | `fights: true` | Violence, which opens combat rather than a roll. |

You can always pull the trigger. Whether the bullet accomplishes anything is the
world's call, not the menu's.

**The two failure modes are withdrawing and going down.** Nothing else ends a
run. And a withdrawal is not only "half the crew is on the floor" — it is just as
often "that door is rated past anything we can pick, and nobody here carries
explosives." That verdict is **intel**, so it goes on the record naming what was
missing:

```
withdrew — Camera T3 needs electronics, hacking, stealth — this crew has none of it
no way through — Maglock door T4 needs electronics, larceny, hacking,
                 or 2 other ways in — this crew has none of it
```

That line is the next hire. A failed run that teaches you which specialist the
operation lacks is doing its job.

The one thing that genuinely removes an approach is **discovering it cannot work
here** — a Watsonian immunity, a fact about the obstacle, learned by trying.

### 10.5b A witness must be PRESENT — and must actually notice
Acting on something that cannot alert or respond moves the meter **only if
something else is there that can, and that catches it.** Both conditions, every
time. A lock forms no opinions; a maglock alone in an empty room can be worked
all night for free, and that is correct rather than an oversight. Nothing
arrives just because time passed.

**Presence is not awareness.** A guard ten feet away can respond, but only if he
noticed. So a nearby watcher gets a *chance* to catch the act — opposed, their
attention against how well the act was covered:

- **Attention** is built like a fight stat block, skill plus the attribute behind
  it (`1 + ceil(tier/2)` and `2 + floor(tier/3)`), so the same tier means the
  same calibre of opposition whether it is shooting at the crew or looking at
  them.
- **Concealment** is the runner's own stealth plus `run.concealment` — the hook
  every source of cover plugs into: a spell, darkness, a distraction, and later
  the plain fact of standing where the camera is not pointed.

Measured, acting beside a live watcher:

| concealment | caught |
|---|---|
| 0 (own tradecraft only) | 26% |
| +4 | 8% |
| +14 (heavy) | 0% |

Which is the fiction working: under a strong invisibility the crew picks the lock
three times over and the guard never turns round.

**Two things stay absolute.** Plane separation — a meatspace guard never
perceives a Matrix act, no roll involved. And fumbling *the thing itself*: you
botched it in its face, so if it senses that plane at all, it registers.

### 10.6 The awareness meter
A player who cannot see the read is being charged a resource they cannot budget.
The mission readout shows the ladder with the current band lit, and how much room
is left before it moves:

```
[NORMAL] › awkward › questionable › threatening — room for 3 more odd moments
normal › awkward › [QUESTIONABLE] › threatening — one more odd moment tips it
```

Every option also projects what **this** attempt would read as, before it is
clicked — `stealth 6d · reads questionable (try 2)` — so slowing down is a
decision the player can actually make rather than a lesson learned afterwards.

Alongside it, **what can perceive the crew on this ground right now**. That list
is deliberately per-watcher rather than one global number, because it is the
state the visual layer renders: a camera with a rotating vision arc the crew has
to stay out of. Same state, drawn instead of printed.

### 11.3 The threat read & live security
**Three layers:**
1. **The band** — Min / Current / Max per axis. Current = "how much room are we
   giving for bullshit today."
2. **The threat read** — `normal → awkward → questionable → threatening`, per
   site **per day**. What your actions credibly reveal, and only if something
   witnessed them.
3. **Alert** — the response, engaged **only at threatening**. Three of them, one
   per axis, each bounded `[Current, Max]`.

Mechanical consequences begin at threatening; the tiers below are the tripwire's
bookkeeping. Three stacking awkwards make you questionable. Once questionable,
security is sure enough and waiting for an excuse, so any further witnessed
awkward or questionable act tips you over.

**ALERT IS THE RATCHET.** It engages at Current — what they already committed to
— and every step it climbs is them fielding more than they planned. **Where it
settles becomes the new Current**; nobody stands the reserves down the next
morning. Tripping a site and withdrawing immediately ratchets nothing, while
fighting through three waves permanently rewrites their posture. **Max grows only
when they pin at the ceiling and pressure keeps coming** — the budget meeting —
and never decays.

**Points, not levels, are what move:** an axis engages at Current × 10 and
ceilings at Max × 10. That budget is what paces escalation across a real
engagement.

Everything resets nightly — the read, the alert, obstacle knowledge. **Identity
is never remembered.** You can farm a site that shot at you yesterday; that is
balanced by the ratchet starting them higher and by obstacle knowledge resetting
with it.

### 11.4 Witnessing — the rules
- **A quiet act registers when it FAILS.** Switch a camera off properly and it
  has nothing to report; read a spirit correctly and it never knew you were
  there. Security reacts to the fumble. An affordance's threat class is the price
  of getting it wrong.
- **Loud always registers** — a gunshot is a gunshot whether or not it hits.
- **Witnessing asks what ELSE has eyes on the same ground.** Take down the only
  guard in the room and nobody is left to have an opinion; do it in front of a
  camera and "silent" was never on the table. Patrols and spirit zones witness
  anywhere along their circuit.
- **Witnessing is PER-PLANE.** An act happens on a plane and only perceivers on
  that plane can see it. A decker jacked in out of the guard's sight is invisible
  to him, and the camera he kills does not announce itself. The plane follows the
  skill — hacking is Matrix; sorcery, conjuring, assensing and enchanting are
  astral; the rest are physical — with the distinction that **doing the same job
  by hand is a physical act even when the target is a machine**.
- `senses` is a **list of planes**: guard `["physical"]`, camera `["physical"]`,
  spirit `["astral","physical"]` (**dual-natured**), ward `[]`, maglock `[]`.
- **Threat class is intrinsic to the act.**
- **Exceptional success (margin ≥ 3) buys headroom back** — the thoroughly
  bamboozled guard who decides you are fine, actually.

### 11.5 Obstacles are VERBS × PROPERTIES
> An obstacle is **a point on the map where something interferes with the mission
> — an opportunity to raise the alert.** Not a barrier. Guards, spirits, cameras,
> turrets, doors, wards and ice are all *things at encounter points*.

**Every verb is attemptable against every thing within its pillar. The qualities
of the thing decide whether there is even a challenge to roll, let alone what the
result is.**

This replaced hand-authored affordance lists, which made the MENU the authority
on what was possible — a maglock could only be breached with demolitions because
nobody had written a "kick it" line, not because kicking a door is impossible.

**Two gates, in order:**

1. **Presence** — which planes a thing can be *touched* on. Not the same as
   `senses`, which is only what it *perceives*: a maglock senses nothing and is
   still a physical object **and** a device on the host. A verb from pillar P
   needs the thing present on P's plane. This is what stops you sleazing a spirit
   or banishing a guard.
2. **Nature** — `living`, `sapient`, `summoned`, `construct`, `fights`,
   `bypassable`, `repairs`, plus `armour`/`structure`. These decide whether a
   verb *lands*. You can talk at a camera all day; it has no opinion. A ward is
   astrally present but is a **construct**, not something summoned — so it is
   unwound, never banished.

**Evasion is pillar-bound.** Anything that works by staying outside a watcher's
attention — sneaking, masking an icon — requires the thing to perceive on that
verb's own plane. **You can only hide from a watcher in the medium it watches:**
sneaking past a maglock is meaningless, and masking your icon from a camera with
eyes in the room is meaningless. Getting a thing to *accept* you is a different
act: `con` and `sleaze` talk a person or a system into letting you through, and
neither needs it to be watching.

**Assensing is the deliberate exception.** It reads anything astrally present,
watching or not, because per §3.4 the lattice is always on screen and assensing
decides only how much of it you understand. It is an **extended test** — a
glance is one thing, reading a construct or a signature properly buys more of
the truth with every interval — and it causes **no Drain**, because perception
is not spellcasting. Spellcasting, summoning and banishing bill the caster;
looking at something does not.

**There is no Matrix attack verb, and that is the ruling, not a gap.** Force is a
currency between *bodies* — Power against Armour, damage against a structure that
eventually gives — and nothing on the wire has any of that. Every real way past a
system is to be taken for someone who belongs there (`sleaze`), to not be seen at
all (`maskIcon`), or to talk to the device in its own protocol (`hackDevice`).
An `attackIce` verb briefly sat alongside those and made all three optional.
Black ICE is what makes the removal matter rather than tidy: `fights: true` is
exactly what `hackDevice` cannot touch, so the decker who meets one has to go
quiet or go legitimate. **Invariant 1 (brute force is always offered) is therefore
claimed only against things with a physical or astral presence.**

**Decking is ONE skill.** Every Matrix verb rolls `hacking`. `computer` survives
on the crafting bench and may never front a way past a thing — same for
`enchanting`. This is why the generator's "≥2 non-loud ways" floor counts
**approaches, not distinct skills**: one skill can front several genuinely
different acts, and on the Matrix all of them do.

**Force reuses the three-gate chain** (§6): any damaging verb against a
physically-present thing goes Hit → Penetrate (Power vs Armour) → Damage,
accumulating against `structure`. A pistol at Power 6 sparks off a hardened door
at Armour 12 forever; a rifle, a Force-6 fireball or purpose-built demolitions
gets through. **Perseverance only pays if you can penetrate at all.** Kicking is a
melee attack with the existing `unarmed` profile — not a special mechanism.
Demolitions stays trained-and-equipped, because feet and explosives are different
categories of thing.

**Getting through is not the same as taking it off the board.** A verb only
removes a thing when removing it is what the verb *does* — a takedown, a
banishing, something broken past its structure. Passing it does not. **A ward is
the case that proves it:** a mana barrier repairs itself, so unwinding one is
opening a window and taking it before it cranks shut, and even blasting a hole
through leaves the wall standing. That is what keeps §8's best situation honest —
the ward between the mage and their body is still there on the way out, and
budgeting the way home stays part of going in.

**Nothing is ever removed from the menu**, but the two kinds of dead end are
shown differently, because the crew's position on them differs:

| | what it is | when the crew learns it |
|---|---|---|
| **Nature** | the thing is the wrong *kind* of thing | immediately — you can see a camera has no opinion, so the reason rides the option from the first look |
| **Immunity** | a Watsonian fact nothing announces | only by trying — the attempt is what buys the knowledge, and afterwards it is *marked*, never deleted |

Both stay listed and named. What stops is their counting as a way through, which
is what lets "no way through" still fire and still name the next hire.

**Generator invariants**, now *derived* from the crossing rather than declared:
brute force is always available in some form matched to what the thing is
(every pillar carries a damaging verb, and everything is present on some
pillar); ≥2 usable non-loud ways into any one thing; ≥1 additional distinct
solution chain per site.

### 11.6 Three different graphs
- **Physical:** rooms, edges, entry points, patrols. Movement gated by
  doors, guards and cameras.
- **Astral:** ignores walls — obstacles attach to **rooms directly** (a ward seals
  an area, not a doorway) and roaming spirits get **zones** of 2–3 rooms with no
  adjacency requirement.
- **Matrix:** a **host** — its own node graph (SPU / Datastore / Slave / Data
  store / CPU). Node 0 is the public face, the objective sits deepest, and
  shortcuts guarantee more than one route.

Each point of a security axis is **10% coverage of that projection's own
encounter-point count** — a minimum requirement, not a probability.

---

## 12. WHAT THE PLAYER IS SHOWN

- **Exactly:** their own crew's dice pools, skills, attributes, gear. It is their
  crew; they know what they hired and issued.
- **As an estimate:** site security (`est P:~3`), until recon or experience
  confirms it.
- **After the fact:** what an act *registered as* — information the attempt
  bought.
- **Held back:** the threshold, the odds, `trueArchetype`, and whether an
  approach is blocked before it is tried.

---

## 13. OPEN QUESTIONS
1. Solo vs multi-decker Matrix jobs — lean solo, not closed.
2. Gambling's mechanical home — proposed for Face/Thief.
3. Active roster size — soft cap, or is per-job assignment already the real
   decision?
4. Does **Stance** apply outside meatspace? Astral has no cover in the physical
   sense; the Matrix has no position at all.
5. **Adept powers** — the design calls for Killing Hands, Improved Reflexes and
   similar; Magic on a non-mage becomes meaningful when they exist. The dossier
   should read "Adept".
6. **Leadership needs an effects layer** — it is the only skill that modifies
   *another* runner's roll (Direct, Inspire, Rally, Command). Needs modifiers
   with source, magnitude, scope and lifetime, which spells will reuse. Rally
   means Initiative is a **function**, not a stored number.
7. Reputation's scaling and what it unlocks.
8. Job/mission sequencing distribution, and player-facing prep missions.
9. Route-type missions — movement between two sites, a reserved shape.
10. Difficulty at the top end comes from **density and depletion**; the single-roll
    threshold curve tops out, and extended tests plus combat attrition are where
    the headroom lives.

---

## 14. THE GOVERNING PRINCIPLE

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

> **⚠ READ THIS BEFORE ACTING ON THE PARAGRAPH ABOVE.**
>
> "Simulation mode" means **rendered as text instead of pixels**. It does NOT
> mean "resolved without a player." The word *playable* in that sentence is
> doing real work: a real, complete, **playable** thing — one a human sits down
> and makes decisions in, obstacle by obstacle and action by action.
>
> **AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.** `autoResolve` exists so 90,000
> assertions and 360 simulated days can run without a human clicking, and it
> doubles as the player's skip button. It is how we *test* the systems while
> building them. It is not what we are building.
>
> The lie detector tests whether the LOOP is fun. A loop nobody plays cannot
> answer that question, so a build where the missions run themselves has not
> yet earned the verdict this principle is asking for.

**Why this game suits it:** the whole design is *data*, per "systems are
expensive, rows are cheap." Things at encounter points carry PROPERTIES and verbs
cross against them; skills gate what a crew can bring; job grammar generates
objectives. The design came out text-ready by accident — a text renderer reads
the data the generators already produce and prints choices.

---

---

## 15. THE FIDELITY LADDER

Three renderings of the **same** underlying systems.

| rung | what it is | when |
|---|---|---|
| **Quick-resolve** | one aggregate roll, instant. **Scaffolding first, skip button second** — it is how we exercise the systems while building them, and it stays as the player's fast path. **It is never the thing being built.** | exists from Phase 1 |
| **Scene-text** | describe the scene from site data, offer the affordance rolls, resolve, mark, advance. Interactive, choice-driven, no rendering. Every system, no skin. | ← we build here first |
| **Full spatial** | top-down positioning, radius movement, cover geometry, the visual pillars. Laid over the proven text core, added per pillar. | Phase 3+ |

**The ladder is about rendering.** Scene-text abstracts the *spatial* tactical
feel — exact positioning, cover angles, the radius dance — into scene choices,
and that specific feel is what the visual layer restores. **Geometry is what
scene-text defers.** Initiative, the action economy, the three-gate chain, health
tracks, Drain, the tether and ammunition all belong at this rung, built to the
depth `UNDERSTANDING.md` specifies.

**AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.** Quick-resolve is how the systems
get built and probed without a human in the chair, and it stays afterwards as
the player's skip button. It is **measured against** the played path, never a
substitute for it — and the played path is the deliverable at every rung of this
ladder, including this one.

**The ladder never removes the player.** Scene-text defers geometry, not agency:
at this rung the player still picks the approach, the stance, the method, the
mode, the Force, and whether to press or pull out. What the full spatial rung
adds is *where everyone is standing*, not *somebody to decide*.

---

---

## 16. TECH, BUDGET AND HOW TO VERIFY

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

---

## 17. WORKING PRACTICES

- **SEARCH BEFORE YOU INVENT.** Before building any mechanic, grep the docs and
  the code for the concept. Almost every "new" mechanic proposed in this project
  turned out to already exist, designed, under a name nobody looked for.
  Reagents are the standing example: `RESOURCE_SITE_KINDS` already put them on
  an astrally-oriented site and `generateLootTable` already weighted what is
  findable by orientation — so "scrap vs reagents is a different run" was
  already true and needed nothing added. What got built instead was a parallel
  mechanic where a projecting mage gathered them on the astral, which is not
  merely redundant but **incoherent**: an astral form has no hands and cannot
  carry anything home.
  **A gap between what was asked for and what exists is a signal to go looking,
  not a licence to design.** If the search genuinely comes up empty, say so and
  ask — an invented mechanic costs far more to remove than a question costs to
  ask, because it looks finished.
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
  playthrough is what shows whether the output reads well. **AUTO-RESOLVE IS
  SCAFFOLDING, NOT THE GAME** — a green suite driven by `autoResolve` says the
  systems are consistent, and says nothing whatever about whether the game is
  any good. Only sitting in the chair answers that.
- **Never describe the game by describing the harness.** If a claim about how
  this game plays would be verified by reading `autoResolve`, `runCombat`'s
  house policy, or `AUTO_PATIENCE`, the claim is about the scaffolding. Check it
  against the player's decisions instead: stance, method, mode, press or
  withdraw.
- **PS5.1 note:** use the Edit tool or Python for bulk text changes;
  `Get-Content | -replace` round-trips corrupt UTF-8. Grep `â€` as a canary.
- **`git commit -F <file>`** for anything with quotes in it.
- **Commit messages carry the reasoning.** They are the densest surviving record
  of *why* and have proven load-bearing for recall.
- **PUSH EVERY CHANGE AS IT LANDS. `dev = prod` here.** This is a solo repo
  nobody else touches, and the user tests on the deployed page — so work that
  sits uncommitted on a local disk is work that does not exist. Standing
  authorization: commit and push without asking. A session that ends with a
  dirty tree has failed to deliver, however green the suite is.

---

---

## 18. DEFERRED POLISH BACKLOG

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
