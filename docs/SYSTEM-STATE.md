# Mr. Johnson — System State

**The volatile document, and one of only two.** `UNDERSTANDING.md` is what the
game is and how we build it; this is **what is actually in the code right now**,
what is a placeholder, what is built-but-unreachable, and what happens next.

Update this whenever a system lands. If it disagrees with the code, the code
wins and this file is stale — verify before trusting a line here.

> ## ⚠ AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME
>
> Almost everything below is currently exercised through `autoResolve`, because
> that is how you drive 94,000 assertions and 360 simulated days without a human
> clicking. **That is a testing harness.** It is not the design, it is not the
> deliverable, and its behaviour is not evidence about how this game plays.
>
> **THE PLAYER CONTROLS WHAT HAPPENS DURING MISSIONS** — stance, method, mode,
> which approach, how much Force, press or withdraw, action by action. Reading
> `autoResolve` and concluding otherwise has now happened twice across sessions.
> If you catch yourself writing "the player has no input here," you are
> describing the harness. See `UNDERSTANDING.md` §1, §14 and §15.

Last verified after the canon grimoire landed. Suite: 25 classes,
98,899 assertions, 0 failures, identical across three consecutive runs.

**Baseline moved deliberately**, 89,390 → 98,899. Class 17 was rewritten
against the canon spell system (512 assertions — grimoire gating, canon Drain
codes, the 2×Magic ceiling, direct-vs-indirect against armour, the verb
bridge, generation, the Attack lane reading the dossier). C11 grew formula
probes (canon names, ids, the 5-karma price). The rest is content drift:
`generateGrimoire` consumes the RNG during mage generation, so every runner
and site in every seed differs, and the soak plus the content-guarded loops
count in proportion to what got generated.

---

## 1. MODULE MAP

No build step. Classic `<script>` tags, global `MJ` namespace. Load order
matters and is set in `index.html` / `inspector.html`.

```
js/core/rng.js        115  makeRNG — xmur3 + mulberry32. float/int/range/chance/
                           pick/weighted/shuffle/fork. weighted takes {item,weight}.
                           fork(label) derives purely from (seed+label): fork a
                           UNIQUE label per slot to get independent sub-streams.
js/core/clock.js       20  advanceDay
js/core/save.js        88  SCHEMA_VERSION defaultSave saveGame loadGame deleteSave (IndexedDB)
js/core/tempo.js      140  THE SHARED FRAME. newTempo isTurnBased setMode
                           toggleMode enterCombat exitCombat advanceWorld
                           describeTempo
                           -- free <-> turnBased; combat FORCES turnBased.
                              advanceWorld COUNTS ONLY and must stay inert
                              until the visual layer lands.
js/core/resolve.js    243  THE DICE. rollDicePool countHits thresholdForTier
                           tierBandMid tierBandHigh diceForSecurity
                           dicePoolFor resolveTask
                           -- A RATING IS A SPREAD (tiers roll 1..rating) and
                              NO number quoted at the player may be read off
                              its maximum -- they cannot see where it is.
                              tierBandHigh is capped at rating-1 because
                              ceil(3r/4) lands ON the max at rating 3.
                           drainValueFor resistDrain maxForceFor
                           beginExtendedTest extendedTestStep resolveExtendedTest

js/models/runner.js   901  SKILLS(21) SKILL_ATTRIBUTE attributeFor attributeCeiling
                           attributeCost attributePriority ATTRIBUTE_SHARE
                           METATYPES FOCUSES(19) ARCHETYPE_SKILLS buildSkillTiers
                           generateRunner mintRunner getEffectiveSkills
                           computePrice describeDiscipline karmaCost trueValue
                           growRunner marginalSkillCost halfStepCost
                           SKILL_GATES isSkillEligible HANDLES handleBaseFromIndex
js/models/site.js    1286  THREAT OBSTACLE_TEMPLATES generateObstacleInstance
                           generateHost NODE_TYPES weaponForTier canBeForced
                           deriveSecurity generateSite mintSite mintSiteByName
                           encodeSiteName decodeSiteName siteIdentityFromIndex
                           nonLoudWaysFor CONDITIONS CONDITION_IDS CONDITION_WORDS
                           -- templates carry PROPERTIES ONLY, no menus:
                              presence / senses / living / sapient /
                              summoned / construct / fights / bypassable /
                              repairs / armour / structure. What can be
                              DONE to one is MJ.actsFor(thing). Immunities
                              ride the instance as `immune` (skill -> why),
                              rolled against the crossing so the >=2
                              non-loud ways floor is measured against the
                              menu the player will actually see.
                           -- condition is the name's FIRST word and a real
                              quality. Its main lever is COMPOSITION: `weights`
                              multiply each obstacle type's chance of being what
                              a slot buys, so a derelict block fields bodies
                              where a posh tower fields cameras, at comparable
                              strength. `security` moves only where the
                              condition destroys or creates capability.
                              Orthogonal to theme -- every theme under every
                              condition.
                           allObstacles findPaths usableNonLoudWays
js/models/alert.js    274  THE THREAT READ. initSecurityState threatBand witnessAct
                           grantHeadroom engageAlert alertLevel alertEngaged
                           allAxesPinned addAlertPoints addAlertPointsAll
                           settleIncident advanceSiteDay
js/models/job.js      339  OBJECTIVE_VERBS PAYLOAD_DOMAINS JOB_FAMILIES TIER_BANDS
                           generateMission generateJob generateBoard isJobComplete
js/models/market.js   191  kiaChance watchRunner CONTRACT_MISSIONS hireRunner
                           consumeContractMission releaseRunner isHireable
                           advanceMarketDay
js/models/armory.js   520  ITEM_TEMPLATES makeItem issueItem reclaimItem
                           gearSlotOf slotConflict
                           -- ONE PER SLOT, slot = (category, skill). Nothing
                              in this file stacks, so a second coat/deck was
                              nuyen spent on nothing and the armoury allowed
                              it silently. Consumables EXEMPT (spares are the
                              point). Personal kit does NOT occupy a slot, or
                              a runner who brought their own gun could never
                              be issued a better one.
                           gearBonusFor woundGuardFor findConsumable consumeItem
                           generatePersonalKit PERSONAL_TIER_CAP
                           combatWeaponFor combatLoadoutFor armourRatingFor
                           effectiveTier craftQualityFromMargin markCrafted
                           implantSurgery teachFormula
js/models/economy.js  280  canAfford spend earn collectJobPay
                           dailyUpkeep payUpkeep hireCost hireRunnerWithCost
                           upgradeContractWithCost itemCost buyItem sellItem
                           sellMaterials expandBoardCapacity
js/models/combat.js   713  WEAPONS FIRE_MODES weaponProfile
                           COMBAT_EFFECTS COMBAT_CHANNELS COMBAT_POSTURES
                           effectDef applyEffect clearEffect hasEffect
                           effectModifier tickEffects describeEffects
                           postureOf actionsFor
                           makeCombatant initiativeScore buildRound
                           beginCombat combatActor combatAct combatOver
                           forceAgainstThing
                           -- forceAgainstThing is the SAME three gates
                              aimed at something that does not fight back:
                              a door, a camera, a ward, barrier ICE. Gate 1
                              collapses to "did you connect", gate 3
                              accumulates against `structure`. It does NOT
                              write to the thing -- the caller holds the
                              running total per run.
                           physicalTrack stunTrack
                           carriedDamage carryDamageHome restDay
                           -- physicalTrack/stunTrack read `.attributes`, so a
                              roster runner measures without being in a fight
js/models/mission.js 2363  THE BIG ONE.
                           optionsFor actFor forceThrough resolveIneffective
                           remainingApproaches
                           create*Mission (recon/matrix/astral/crafting/medical/
                             resource/search)
                           streetRoute (= routeObstacles) hostRoute hostPaths
                           astralRoute tetherFor
                           -- all three routes share the shape {path, obstacles}
                              so anything that draws a run can draw any of them
                           beginMission missionPrompt missionChoose
                           missionExtendedStep missionAbort missionDone finishMission
                           autoResolve openDispatch closeDispatch runActionPeriod
                           siteIntelView suppressionBonus applySuppression
                           -- autoResolve IS SCAFFOLDING, NOT THE GAME. It is
                              the harness that drives the stepper without a
                              human, so the systems can be probed while they
                              are built, and it doubles as the player's skip
                              button. Its ranking (quiet first, then biggest
                              pool, AUTO_PATIENCE swings at a loud wall) is a
                              STAND-IN FOR A PLAYER and says nothing about the
                              design. THE PLAYER CONTROLS WHAT HAPPENS DURING
                              MISSIONS: missionPrompt/missionChoose is the seat
                              they sit in.
js/models/sitelist.js 156  addKnownSite watchSite siteListView compressSite reviveSite
js/models/verbs.js    371  VERBS x PROPERTIES -- THE AUTHORITY ON WHAT IS
                           POSSIBLE. VERBS(18) verbDef verbsFor actsFor
                           verbLabel verbSkill verbPlane
                           verbReaches verbLands verbWhyNot verbThreat
                           -- two gates: PRESENCE (can it reach) then NATURE
                              (does it land). DRIVES missionPrompt.
                           -- `requiresSense`: evasion is pillar-bound, you
                              can only hide from a watcher in the medium it
                              watches. Assensing is deliberately NOT one of
                              these -- an aura is readable whether or not it
                              is looking back.
                           -- `drains` marks the acts that bill the caster.
                              Spellcasting, summoning and banishing do;
                              ASSENSING DOES NOT, it is perception.
                           -- `skillFor` reads the skill off the runner for
                              `shoot`, so a rifle is marksmanship and a
                              shotgun is firearms.
                           -- plane = the verb's PILLAR, not a skill lookup.
                           -- NO MATRIX ATTACK VERB. `attackIce` was removed:
                              force is a currency between bodies and nothing
                              on the wire has one. Every Matrix verb rolls
                              hacking; `computer` is a bench skill only.
js/models/lanes.js    340  THE REPORT CARD -- what a runner NEEDS TO BE.
                           LANE_DEFS(7) LANE_ORDER lanesOfSkill lanesOfVerb
                           runnerLane crewLane teamworkStack
                           siteObstacles laneDemands attackPowerFor laneReport
                           -- Sneak Face Tech Banish Attack Defense Awareness.
                              Replaces crewCapability/AXIS_SKILLS, which
                              bundled nine unrelated skills under "physical"
                              and answered a question about nobody.
                           -- LANES FORECAST, THEY DO NOT RESOLVE. No file in
                              the resolution path may consult one; stress C25
                              reads their SOURCE as text to prove it.
                           -- every `need` derives from the ESTIMATE the
                              player holds, never the true tier. C25 proves it
                              by moving the estimate and requiring every need
                              to move with it.
                           -- sorcery sits in TWO lanes (Banish + Attack): the
                              one skill that acts on both planes.
                           -- stacking = SR5 Teamwork (lead + floor(pool/3)
                              each, capped at the lead's rank). Awareness is
                              max instead (you cannot help someone look);
                              Defense is min (nobody soaks for you).
                           -- A RATING IS A SPREAD (tiers roll 1..rating), and
                              laneMidTier/laneHighTier pick where on it each
                              fight read stands. Defense = MEDIAN (absorbing
                              is averaged over a firefight). Attack = UPPER
                              QUARTER (failing to penetrate is not averaged).
                              NEITHER may be the maximum -- highTier is capped
                              at rating-1 because ceil(3r/4) lands on the max
                              at rating 3.
                           -- the card is a FLOOR, not a promise. Measured over
                              300 sites: something harder than it was in the
                              building 33% of the time. That is the lesson,
                              not a bug -- pack above the card.
                           -- EVERYTHING is on the band, header included.
                              diceForSecurity reads tierBandHigh, so "P:~12d"
                              is the high end of typical, not the site's
                              worst. "You must clear every obstacle" is an
                              argument about MECHANICS -- it says nothing
                              about what the player has been told, and they
                              cannot see where the maximum is.
                           -- NEITHER half of the fight read may see ICE. It
                              has fights:true and a weapon and no coat or gun
                              answers it. Left in, it demanded armour 8 at a
                              P4 site AND zeroed Attack for a samurai.
                           -- `estimated` on a row: the "~" the card prints
                              until the axis is confirmed. Changes no number.
js/models/armory.js        -- ARMOUR LADDER IS CONTIGUOUS 1-8. Every rating a
                              weapon can demand must be BUYABLE or the
                              Penetrate gate has bands nobody can stand in.
                              Was 1,2,3,6,8; the 4-5 hole left the best
                              affordable coat one short of the softest site.
js/models/lattice.js  330  THE ASTRAL PUZZLE. beginLattice latticePull
                           latticeAbandon latticeDone latticeRead latticeDrain
                           latticeMoveStrength latticeReadDepth
                           -- modes unwind / unravel / assemble. NEVER hand a
                              renderer the raw lattice; latticeRead only.
js/models/spells.js   560  THE CANON GRIMOIRE. SPELLS(57 of SR5 core's 93)
                           spellDef spellsFor knowsSpell knowsSpellOfShape
                           bestSpellOfShape bestCombatSpell bestCommandSpell
                           spellDrain castSpell finishCast applySpellToRun
                           sustainPenaltyFor dropSustainedInRun
                           spellCombatAction dropSustained registerSpellEffects
                           -- CANON SR5 SPELLS, names and stats as printed
                              (UNDERSTANDING.md §7b). 36 deferred BY NAME in
                              the file, each with its reason.
                           -- spellsFor = GRIMOIRE ∩ trained, never the book.
                              classification.spellsKnown holds spell IDS,
                              generated Magic-rating deep, focus-weighted,
                              signature guaranteed (runner.js FOCUS_SPELLS).
                           -- Drain = max(2, Force + printed mod), through
                              resistDrain's drainValue override. maxForceFor
                              = 2× Magic (canon); overcast past Magic is
                              physical.
                           -- castSpell default = meatspace QUICK CAST (one
                              sorcery roll); opts.viaLattice = the astral
                              deep path, same spell, thread by thread.
                           -- direct spells IGNORE armour (combat AND
                              forceAgainstThing); indirect AP = −Force.
                           -- writes one formula item per spell into
                              ITEM_TEMPLATES at load (fml_<id>, canon name);
                              teachFormula = formula + 5 karma -> spell id.
                           -- verb bridge: castBolt/castSmash/castBlast +
                              magicFingers/levitate/command in verbs.js, all
                              grimoire-gated via carries. `blast` fronts
                              bestCombatSpell — no longer anonymous.
                           -- run hooks: spellConcealment is PER-WATCHER
                              (mana fools minds not lenses; nothing physical
                              hides an aura), silenced suppresses loud in
                              wasWitnessed, revealed feeds missionPrompt,
                              sustaining carries effects into crewCombatants
                              and bills −2/spell via spellPoolMods.
                           -- Stabilize auto-casts at resolveTakedown between
                              the wound and the grave.
                           -- Armor grants FORCE armour (stacksFromForce),
                              and the Defense lane counts it: cast on the
                              worst-dressed runner, floor +min(6,Magic),
                              capped at the SECOND-worst coat.
                           -- spellThreat(def): a cast is NOT one flat odd
                              moment. buff/barrier/debuff -> THREATENING
                              (armour going up is a man watching someone
                              prepare for violence), conceal/silence/heal/
                              disguise -> QUESTIONABLE, analyze/reveal ->
                              AWKWARD. Only lands if something SEES it, which
                              is why you cast before you walk up.
                           -- forceLadder/drainPreview: the §14 Force dial.
js/grimoire.js        230  THE GRIMOIRE, ANYWHERE IN MEATSPACE. entriesFor
                           forceRows open castersIn SPELL_VERB_IDS
                           -- KNOWS NOTHING ABOUT OBSTACLES. ctx.obstacle is
                              OPTIONAL; without one the spells needing a
                              target grey out with "nothing in front of
                              them". Callers: the obstacle prompt's "cast a
                              spell" row AND the pre-run prep step. Any
                              future caller (hub, astral scene) gets the same
                              rules for free.
                           -- SHOWS unusable spells greyed with the reason.
                              Deliberately breaks the main menu's hide-what-
                              doesn't-apply rule: the submenu is the
                              character sheet.
                           -- two steps: pick spell -> pick FORCE. The ladder
                              always straddles the overcast line and prints
                              what each rung buys and costs.
                           -- a spell routed through a verb shows the VERB's
                              readsAs (escalation included), never its own
                              home threat -- shown must equal applied.
js/models/mission.js       castUtilitySpell(run, runner, spellId, opts)
                           -- ASSUMES NO OBSTACLE. opts.prep = the crew still
                              outside, and it is EXPLICIT rather than
                              inferred: run.obstacles[0] exists from the
                              moment the run is built, so a prep cast falling
                              through to it would be "seen" by a guard they
                              have not walked up to yet.
                           castNoticedBy -- a cast asks a WIDER witness
                              question than an act. wasWitnessed excludes the
                              obstacle acted ON (take down the guard, nobody
                              is left to have an opinion); a spell is not
                              aimed at him, so he is a bystander with eyes
                              and he counts.
                           missionPlanes(mission) -- WHICH GROUND A DISPATCH
                              WALKS, and the lane card reads it instead of
                              the whole site. astralRun/recon:astral ->
                              ["astral"], matrixRun -> ["matrix"], street ->
                              ["physical","astral"]. Inside: BODIES REACH
                              EVERYTHING -- on a street job every pillar's
                              verbs count (the decker hacks the maglock from
                              the corridor in AR, no jack-in), so Tech stays
                              on a street card; a projection has no body, so
                              no Sneak/Face/Tech/Defense rows.
js/models/helpers.js  270  makeHelper bindSpirit finishBind loadAgent
                           unloadAgent agentSlotsFor helperAct instructHelper
                           dismissHelper describeHelper
                           -- N tasks, each a SEPARATE action. No sprites.
js/models/astral.js   250  ASTRAL_VERBS astralPrompt astralAct astralEngage
                           astralResolve astralStudied
                           -- clock: the tether. assensing raises Lattice depth.
js/models/matrix.js   270  MATRIX_VERBS matrixPrompt matrixAct overwatchOf
                           raiseOverwatch matrixAdjacent
                           -- clock: Overwatch, converging at 40.
js/models/street.js   180  STREET_VERBS streetPrompt streetAct streetWatchers
                           -- clock: the alert bands. Position is the point.

js/game.js            895  MJ.game — THE INTEGRATION LAYER. DOM-free.
                           newGame refreshBoard refreshMarket acceptJob
                           watchFromMarket hire upgrade release
                           queueDispatch unqueue moveQueued
                           beginDay resolveEntry settleDay endDay logResult
                           serializeSession deserializeSession saveSession loadSession
js/game-ui.js         583  MJ.ui — the v0 text shell renderer. ONLY reads session +
                           calls MJ.game commands. MJ.ui.session() is a dev handle.
js/mission-popup.js   315  MJ.decide (generic decision prompt, reusable)
                           MJ.missionPopup (drives the mission stepper through it)

js/harness.js         ~1k  dev inspector benches (buttons on inspector.html)
js/stress.js          ~2.9k 22 probe classes. ~94.2k assertions, 0 failures.
                           Deterministic by construction: no live entropy, so a
                           failure always reproduces.
                           -- it drives everything through autoResolve, which is
                              SCAFFOLDING, NOT THE GAME. A green suite proves
                              the systems are CONSISTENT. It cannot say whether
                              any of it is fun, because nothing in it is played.
```

**Two pages:** `index.html` (the playable shell) and `inspector.html` (benches +
the stress suite). Both load the same modules.

---

## 2. THE CRITICAL SHARED DEFINITIONS

Anything the resolver, the UI and the chooser all need reads from a single
function, so all three agree by construction.

- **`MJ.actsFor(thing)` → `optionsFor(run, obstacle)`** — the one crossing of
  every verb against what a thing IS, and the one list built on top of it.
  `missionPrompt` shows it, `remainingApproaches` counts it, `actFor` resolves
  the player's pick through it, and the auto-chooser ranks it. So what the
  player is offered, what the house plays, what gets resolved and what decides
  "no way through" cannot drift apart — they are one function. A probe holds
  the prompt's live count against `remainingApproaches`.
- **`MJ.dicePoolFor(runner, skill, bonus)`** — Skill + Attribute + situational.
  The one definition of a pool. Read by `resolveTask` (which rolls it),
  `missionPrompt` (which shows it), and the approach-ranking chooser (which
  ranks by it), so the number offered is always the number rolled.
- **`applyCriticalGlitch(run, runner)`** — armour → patch → wound. Shared by the
  single-roll and extended paths.
- **`MJ.combatLoadoutFor(runner)`** — weapon + its quality + armour in ONE read,
  so a weapon and its quality can never come from different items.
- **`MJ.effectiveTier(item)`** — tier + crafted quality. Every mechanical reader
  of tier must go through this.
- **Per-run memory is keyed by the OBSTACLE OBJECT, never by route index.**
  `run.attempts` (obstacle → {verbId: tries}, driving escalation),
  `run.discovered` (obstacle → {skill: why it can't work here}),
  `run.damaged` (obstacle → structure taken this run) and
  `run.neutralized` (a Set of obstacles) all hold identities. Responders splice
  into the route ahead of the crew and shift every later index, so anything filed
  under an index starts describing a different obstacle the moment a guard turns
  up — the newcomer inheriting tries and discoveries it never earned. Tries are
  per-VERB (a guard's two stealth plays are different swings); discoveries are
  per-SKILL (learning he is sensor-equipped rules out sneaking however you found
  out). **Structural damage is per-run too, and deliberately** — a site's walls
  come from its seed and reset nightly, so a door that remembered being shot at
  would turn a farmable address into rubble and would have to survive a save.
- **`session.log` holds RECORDS, not sentences.** The hub keeps a log at every
  fidelity — a scrolling pane today, a readout on a drawn console later — so an
  entry is `{seq, day, kind, text, refs}`. `kind` is one of
  `MJ.LOG_KINDS` (note / job / money / roster / dispatch / site / system) for
  filtering and styling; `refs` carries what the line is ABOUT (runner handles,
  site name, job number, deltas) so a view can colour the money lines, filter to
  one runner, or make a site name clickable without parsing English back out of
  a string. `MJ.logText(entry)` is the one-line rendering, and it tolerates the
  bare strings older saves stored. `MJ.game.note(session, text, kind, refs)` is
  how a renderer adds its own line.
- **`MJ.carryDamageHome(combatant)` / `MJ.restDay(runner, daysRested)` /
  `MJ.carriedDamage(runner)`** — the three functions that make injury persist.
  See `UNDERSTANDING.md` §on the dual tracks: physical rides home, stun does not.

---

## 3. WHAT IS BUILT AND WORKING

### Resolution
- Dice pool = **Skill + Attribute** (+gear/intel/suppression). Untrained rolls
  nothing, ever — no bonus rescues it.
- Hits on 5–6; threshold `ceil(tier/2)`; margin = hits beyond threshold; glitch =
  majority 1s; critical glitch = glitch with zero hits.
- **Extended tests** — accumulate hits toward `tier × 3`, pool drops 1 per
  interval, a glitch ends it and takes the accumulated progress. This is the
  difficulty axis with **no ceiling** (single rolls cap at threshold 5 forever).
- **Force / Drain** — Force raises effect and Drain; resisted by
  Willpower + Magic; lands on the **stun** track. **Overcasting** (Force > Magic)
  makes the Drain **physical**. Max Force = Magic + 2.

### Combat (`combat.js` + wired into `mission.js`)
- Deterministic initiative (Agility + Intelligence, no roll); initiative dice =
  action count; pass structure verified (`p1:Fast p1:Mid p1:Slow p2:Fast …`).
- Three-gate chain **verified to do its job**: shotgun and rifle both Power 9;
  vs armour 11 the shotgun landed 0/bounced 784, the rifle landed 327/bounced 0.
- Dual tracks (`8 + ceil(attr/2)`), fire modes (SS/SA/BF/FA) with ammunition,
  surprise round.
- **The modifier layer.** Every number a fight produces is a base plus a sum
  over the effects active on the combatant. The resolver never asks "what stance
  is this?" — it asks `effectModifier(c, channel)`, so a new source of modifiers
  is a row in `COMBAT_EFFECTS`, not an edit to the resolver.
  - **Channels:** `accuracy`, `defence`, `power`, `damage`, `armour`, `soak`,
    `initiative`, `initiativeDice`. A probe rejects any effect that moves a
    channel outside this list, so a typo can't silently never apply.
  - **Kinds:** *postures* (open / cover / flanking / fullDefence) share an
    `exclusive` group so a combatant always has exactly one; *conditions*
    (prone, blinded, deafened, suppressed, rattled, wounded) stack alongside;
    *boons* (wired, combatSense, painEditor) are the seam chrome, adept powers
    and spells land on — nothing generates them yet.
  - **Stacking** caps at `maxStacks`; **timers** (`rounds`) count down at the
    top of each round and re-applying refreshes rather than banks.
  - `initiativeDice` is how anything buys extra actions — `actionsFor(c)` is
    base + channel, floored at 1. Wired Reflexes lands here.
  - **Injury is an effect.** `wounded` goes on automatically when a combatant
    has physical boxes and comes off when they're treated. It contributes to
    `defence` ONLY — the attack side already pays through `getEffectiveSkills`,
    and charging both would bill one wound twice. A probe holds that.
  - Attack log entries carry `actorEffects` / `targetEffects`, so a readout can
    say *why* the numbers were what they were.
- **Stalemate detection** — bounded in ROUNDS. A fight neither side can finish is
  a break-off: the crew disengages, the obstacle stands, every round fed the
  alert.
- **Death:** 1-in-20 on a full takedown; wounds scale with overflow damage.
  `runner.dead` is its own flag; `market.phase` belongs to the watch-list state
  machine, which hiring suppresses. `settleDay` sweeps the dead off the roster.

### Threat / alert / witnessing
Full model per `UNDERSTANDING.md` §11.3–11.4. All of it live:
quiet-fails-only, other-perceivers-on-the-same-ground, per-plane senses,
dual-natured spirits, the ratchet, nightly reset, suppression.
**Responders spawn only on the runner's own plane** (astral→Spirit,
matrix→Patrol/Black ICE, meatspace→Guard/Camera).

### The three pillars
- **Meatspace** — `routeObstacles` (exported as `MJ.streetRoute`): the shortest
  entry→objective path, **walked**. The crew comes in through the entry point,
  clears the room they land in, crosses to the next, and so on to the objective;
  patrols and spirit zones are met at the **first room of their circuit** the
  crew sets foot in. Every obstacle is stamped with `rooms` (who can see you
  from the same ground), `leg` (how far along the walk) and `where` (entry /
  room / edge / patrol / zone).

  **Walk order is the contract with every renderer.** A list can print obstacles
  in any order and still read; a map cannot, because the crew occupies one room
  at a time and has to get to the next one. The sequence IS the movement. A
  stress probe holds it: legs never run backwards, every obstacle sits on ground
  the path crosses, and the walk ends in the objective room.

  **No cap on route length.** The site's security budget already decides how
  much gets bought and placed, so a second cap on top of it discounts the
  ratings the player is shown and prices against. Measured over 3000 sites: p50
  4, p90 11, max 22 obstacles. Long runs are the heavily-secured ones, which is
  the point; quick-resolve is the standing skip button.
- **Matrix** — `generateHost` builds a node graph (SPU/Datastore/Slave/Data
  store/CPU) scaled by `security.matrix`; ice as ordinary obstacles;
  `hostRoute` with quiet vs greedy routing; **data haul** capped by deck
  Storage.
- **Astral** — `astralRoute`: ignores the room graph entirely; obstacles are
  wards on the objective room + spirits in zones covering it; **every ward
  crossed inbound is crossed again outbound** ("the way back"); **tether**
  = Magic × 6 ticks, running out is a forced snap-back + wound.

### Runners / economy / gear
- 7 attributes, 21 skills, metatype ceilings, weighted metatype + focus +
  origin draws, attribute-fund growth, half-step skill growth.
- Personal kit at generation (capped T4), armoury issue overrides it.
- Crafted quality 1–3 with a flavour mark, stacking onto effective tier.
- Permanent-hire daily upkeep; tier ladder verified
  (retainer/mission < freelance).

### Save / load
`serializeSession` / `deserializeSession` round-trip: runners (incl.
`attributeFund`, `personalKit`), armoury items (incl. `crafted`/`quality`/
`mark`), sites (compressed to seeds), jobs, board, known sites.
**Item ids for personal kit derive from the runner**, keeping "same seed →
byte-identical state" true.

---

## 4. WHAT IS BUILT BUT INVISIBLE / UNREACHABLE

**This is the coverage target for the console build-out.** See
section 7 below.

| system | exists | surfaced? |
|---|---|---|
| Runner full skill list (incl. zeros) | yes | **no** — only non-zero shown |
| Runner career record (runs, kills, hacks) | **NO — data does not exist** | n/a; must be added before any sheet |
| Bench value vs field value | implicitly | **no** |
| Health tracks / initiative / weapon profile | yes | initiative and weapon only inside a fight; carried injury shows on the dossier as `n/max boxes (−Nd)` |
| Site host graph | yes | **no** |
| Site room layout / obstacle inventory | yes | the crew's current room shows during a run (`whereLine`); the layout as a whole, **no** |
| The walked route (`streetRoute.path`, per-obstacle `leg`/`where`) | yes | one line at a time; this is what a top-down street reads |
| Site loot table | yes | **no** |
| Live Min/Current/Max per axis | yes | partially, in the site row |
| Recon's obstacle knowledge | yes | **no** — only `~3 → 3✓` |
| Gear Power / AP / armour rating | yes | **no** |
| Crafted quality / mark | yes | only inside the item label |
| Drain, tether, extended progress, ammo, data haul | yes | one frame during a run, then gone |

---

## 5. PLACEHOLDERS AND KNOWN-WRONG NUMBERS

Anything here is a dial, not a decision.

- `STARTING_MONEY = 25000`, `MARKET_SLOTS = 8`, `WATCH_CAP_MULTIPLIER = 2`.
- `NUYEN_PER_VALUE = 6` — the karma-scale → nuyen conversion. **Moves with
  `computePrice`.** Guard condition: a median job leg out-earns the crew it takes
  (currently 1.27x).
- `PERMANENT_UPKEEP_RATE = 0.02`/day. `RETAINER_DISCOUNT = 0.7`,
  `PERMANENT_MULTIPLIER = 10`.
- `ATTRIBUTE_SHARE = 0.25`, `ATTRIBUTE_COST_MULT = 5`.
- `EXTENDED_THRESHOLD_PER_TIER = 3`, `MAX_CRAFT_QUALITY = 3`,
  `PERSONAL_TIER_CAP = 4`, `TETHER_PER_MAGIC = 6`, `DEATH_ON_TAKEDOWN = 0.05`,
  `DRAIN_DOWN_THRESHOLD = 8`, `MAX_ROUNDS = 10` (combat), `MAX_COMBAT_ROUNDS`.
- Enemy stat block: skill `1 + ceil(tier/2)`, attributes `2 + ceil(tier/3)`.
  Tier is how much security a site BOUGHT — coverage and budget — so individual
  competence rises at about half tier and stays in the range a crew competes in.
  High tier buys a site MORE of them, better armed.
- Reputation: flat +1 per job, no defined effect.
- `missionCount`: flat uniform 1–3.
- `getEffectiveSkills` applies a flat integer wound penalty to the key skill;
  the scaled wound magnitude from combat is recorded separately.

---

## 6. TEST SURFACE

- **`inspector.html`** — benches, one button each: RNG, Runner, Market, Growth,
  Site, Board, Resolve, Market Cycle, Economy, Alert, **Combat**, Dispatch,
  Site Watch-List, **Stress Test**.
- **`js/stress.js`** — ~94.2k assertions across 22 classes. Verdict line reads
  `VERDICT: N failures across M assertions.`
- **How to run headless:** load `inspector.html` in the preview tab, then
  `javascript_tool`: click every `btn-*` id, then scrape `document.body.innerText`
  for `/VERDICT/` and `/^✗/`.
- **Verify by executing JS against the page and asserting on returned values** —
  that is the reliable signal here.
- **AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.** Every probe in the suite drives
  missions through it, which is exactly what it is for. What that buys is
  "the systems agree with each other." What it can never buy is "this is worth
  playing" — for that somebody has to sit in the chair and make the decisions,
  and no assertion count substitutes for it.

---

---

## 7. THE PLAN OF RECORD

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

---

### Phase 2 status

| id | item | status |
|----|------|--------|
| P2.0 | Attributes into the dice pool | **DONE** |
| P2.1 | Extended tests | **DONE** |
| P2.2 | Turn-based mode | **ENGINE DONE, PLAYER'S SEAT NOT WIRED** — `runCombat` drives the whole fight with house policy. Turn-based is the COMMAND MODE, so a fight the player cannot act in is a fight that is only half-built |
| P2.3 | Combat, health, Drain, death | **ENGINE DONE, PLAYER'S SEAT NOT WIRED** — Stance / Method / Mode is the interface, and postures already sit on the effects layer as channels, so this is wiring over a built engine |
| P2.4 | Planes and witnessing | **DONE** |
| P2.5 | Pillar scene-text | **DONE** — all three built, each with its own verbs and its own pressure clock |
| P2.6 | Obstacles as situations | **DONE** — verbs × properties drives play; hand-authored affordance lists deleted |
| P2.7 | The shared frame | **DONE** — free ⇄ turn-based, combat forces it; world-seam inert by constraint |
| P2.8 | The Lattice, spells, bound helpers | **DONE** |
| P2.9 | Simultaneity | remaining — the last Phase 2 item, following the console build-out |

**Where the live detail is:** the open-refactor subsection below.

---

---

### Verbs × properties — landed

The model is in `UNDERSTANDING.md` §11.5. `OBSTACLE_TEMPLATES` no longer carry
affordance lists at all; they carry what a thing IS, and `MJ.actsFor(thing)`
crosses every verb the game has against that. What this changed:

- **The menu is no longer the authority.** A maglock can be kicked, shot,
  breached, picked, spliced, hacked or talked past *because of what it is*, not
  because somebody wrote those lines. 18 verbs across three pillars plus one
  that belongs to none (`routeAround`, gated on `bypassable`).
- **Damaging verbs route through the three-gate chain.** Against something that
  fights back that is combat, as before. Against something that does not, it is
  `MJ.forceAgainstThing` — Hit → Penetrate → Damage, accumulating against
  `structure`. A pistol at Power 6 sparks off a hardened door at Armour 12
  forever; a rifle, a Force-6 blast or a breaching charge opens it. **The bounce
  is recorded as a discovery**, so perseverance is priced honestly instead of
  being silently pointless.
- **Nothing is removed from the menu.** Two kinds of dead entry, shown
  differently on purpose: a **nature** mismatch names its reason from the first
  look (a crew can see a camera has no opinion), while a **Watsonian immunity**
  appears only after an attempt bought the knowledge. Both stay listed and
  named; neither is deleted. `available` is what stops counting.
- **The runner ranking got a second axis.** For a damaging verb against an inert
  thing, who gets *through* comes before who rolls best — otherwise the crack
  shot with a holdout is picked over the labourer with a shotgun.
- **Plane is the verb's pillar**, not a lookup on the skill. `SKILL_PLANE` and
  `planeOfAffordance` are deleted. This fixed a real bug: spoofed credentials
  (`computer`) were filed as a physical act, so a guard in the corridor got a
  vote on something that happened inside a host.

**Three astral rules were corrected against the source during this work**
(user call — the generalisation had quietly broken them):

- **A ward is raced, never removed.** A mana barrier repairs itself, so getting
  through one is opening a window and taking it. `unwind` does not disable, and
  the `repairs` property means even blasting a hole through leaves the wall
  standing. This is what keeps "a ward between you and your body blocks the way
  home" true — the way back is still a wall.
- **Assensing is an extended test.** A glance is one thing; reading a construct
  or a signature properly buys more of the truth with every interval. It reaches
  anything astrally present, watching or not, because the lattice is always on
  screen and assensing decides how much of it you understand.
- **Assensing causes no Drain.** It is perception, not spellcasting. The Drain
  branch keyed off "is this act astral", which billed a mage for looking at
  something. It now keys off the verb's own `drains` flag: spellcasting,
  summoning and banishing bill the caster; reading an aura does not.

Class 22 (415 assertions) holds all of it, including the ward rules explicitly,
so a future tidy-up of the verb table cannot quietly delete them again.

**One thing to raise with the user, not yet changed:** the source has a ward's
owner sense it when the ward is breached. This build deliberately gives wards
`senses: []` — "a barrier, not a sentry" — with the reasoning written into the
template. That is a live design decision, not an oversight, and changing it is
the user's call.

---

### The console build-out

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

---

### After that
- **Simultaneity** — the last Phase 2 item, gated on the console.
- **Runner career record** — data model first, then the sheet.
- **The astral is thin** — routes measure p50 0 obstacles, max 4. The mechanism
  is sound; there is almost no content in it. Cheapest real improvement
  available.
- **Postures versus geometry** — the posture effects are position expressed as a
  menu choice. The top-down street supplies real position later; `cover` stays
  the same effect on the same channels, so the spatial layer changes what
  APPLIES it, not what it does.
