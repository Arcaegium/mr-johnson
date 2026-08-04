# Mr. Johnson — System State

**The volatile document.** `UNDERSTANDING.md` is what the game is;
`BUILD-PLAN.md` is how we build it; this is **what is actually in the code
right now**, what is a placeholder, and what is built-but-unreachable.

Update this whenever a system lands. If it disagrees with the code, the code
wins and this file is stale — verify before trusting a line here.

Last verified at commit `e7c8fc9` + the name-table and modifier-layer pass.

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
js/core/resolve.js    243  THE DICE. rollDicePool countHits thresholdForTier
                           dicePoolFor resolveTask
                           drainValueFor resistDrain maxForceFor
                           beginExtendedTest extendedTestStep resolveExtendedTest

js/models/runner.js   901  SKILLS(20) SKILL_ATTRIBUTE attributeFor attributeCeiling
                           attributeCost attributePriority ATTRIBUTE_SHARE
                           METATYPES FOCUSES(19) ARCHETYPE_SKILLS buildSkillTiers
                           generateRunner mintRunner getEffectiveSkills
                           computePrice describeDiscipline karmaCost trueValue
                           growRunner marginalSkillCost halfStepCost
                           SKILL_GATES isSkillEligible HANDLES handleBaseFromIndex
js/models/site.js    1030  THREAT OBSTACLE_TEMPLATES generateObstacleInstance
                           generateHost NODE_TYPES planeOfAffordance SKILL_PLANE
                           deriveSecurity generateSite mintSite mintSiteByName
                           encodeSiteName decodeSiteName siteIdentityFromIndex
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
                           gearBonusFor woundGuardFor findConsumable consumeItem
                           generatePersonalKit PERSONAL_TIER_CAP
                           combatWeaponFor combatLoadoutFor armourRatingFor
                           effectiveTier craftQualityFromMargin markCrafted
                           implantSurgery teachFormula
js/models/economy.js  280  canAfford spend earn collectJobPay
                           dailyUpkeep payUpkeep hireCost hireRunnerWithCost
                           upgradeContractWithCost itemCost buyItem sellItem
                           sellMaterials expandBoardCapacity
js/models/combat.js   600  WEAPONS FIRE_MODES weaponProfile
                           COMBAT_EFFECTS COMBAT_CHANNELS COMBAT_POSTURES
                           effectDef applyEffect clearEffect hasEffect
                           effectModifier tickEffects describeEffects
                           postureOf actionsFor
                           makeCombatant initiativeScore buildRound
                           beginCombat combatActor combatAct combatOver
                           physicalTrack stunTrack
                           carriedDamage carryDamageHome restDay
                           -- physicalTrack/stunTrack read `.attributes`, so a
                              roster runner measures without being in a fight
js/models/mission.js 1840  THE BIG ONE. crewCapability AXIS_SKILLS
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
js/models/sitelist.js 156  addKnownSite watchSite siteListView compressSite reviveSite

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
js/stress.js          ~1.5k 13 probe classes. ~82.6k assertions, 0 failures.
                           Deterministic by construction: no live entropy, so a
                           failure always reproduces.
```

**Two pages:** `index.html` (the playable shell) and `inspector.html` (benches +
the stress suite). Both load the same modules.

---

## 2. THE CRITICAL SHARED DEFINITIONS

Anything the resolver, the UI and the chooser all need reads from a single
function, so all three agree by construction.

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
- **`attemptKey(index, approach)`** vs **`discoveryKey(index, skill)`** — budgets
  are per-AFFORDANCE (a guard's two stealth plays are different swings);
  discoveries are per-SKILL (learning he is sensor-equipped rules out sneaking
  however you found out).
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
- 7 attributes, 20 skills, metatype ceilings, weighted metatype + focus +
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
`BUILD-PLAN.md` §5.

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
- **`js/stress.js`** — ~82k assertions across 11+ classes. Verdict line reads
  `VERDICT: N failures across M assertions.`
- **How to run headless:** load `inspector.html` in the preview tab, then
  `javascript_tool`: click every `btn-*` id, then scrape `document.body.innerText`
  for `/VERDICT/` and `/^✗/`.
- **Verify by executing JS against the page and asserting on returned values** —
  that is the reliable signal here.

---

## 7. IMMEDIATE NEXT WORK

1. **The console rebuild** (see `BUILD-PLAN.md` §5 and `UNDERSTANDING.md` §10
   CURRENT DIRECTION). Decisions still open: home/level-0 tab?
   where Medicae and Contacts land? is Runners one widget or three?
2. **Runner career record** — data model first, then the sheet.
3. **Simultaneity** — the last Phase 2 item, gated on the console.
4. **Postures versus geometry.** The posture effects are position expressed as a
   menu choice. When the top-down street arrives it supplies real position, and
   `cover` becomes ground the crew is standing behind rather than a posture they
   select — but it stays the same effect on the same channels, so the spatial
   layer changes what APPLIES it, not what it does. Conditions and boons are
   unaffected. The three-gate chain does not move.
