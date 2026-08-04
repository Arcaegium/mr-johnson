# Mr. Johnson — System State

**The volatile document.** `UNDERSTANDING.md` is what the game is;
`BUILD-PLAN.md` is how we build it; this is **what is actually in the code
right now**, what is a placeholder, and what is built-but-unreachable.

Update this whenever a system lands. If it disagrees with the code, the code
wins and this file is stale — verify before trusting a line here.

Last verified at commit `7c7db34`.

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
js/models/combat.js   391  WEAPONS COMBAT_STANCES FIRE_MODES weaponProfile
                           makeCombatant initiativeScore buildRound
                           beginCombat combatActor combatAct combatOver
                           physicalTrack stunTrack
js/models/mission.js 1840  THE BIG ONE. crewCapability AXIS_SKILLS
                           create*Mission (recon/matrix/astral/crafting/medical/
                             resource/search)
                           routeObstacles hostRoute hostPaths astralRoute tetherFor
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
js/stress.js          ~1.3k 11+ probe classes. ~82k assertions.
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
- Dual tracks (`8 + ceil(attr/2)`), stances (open/cover/flanking/fullDefence),
  fire modes (SS/SA/BF/FA) with ammunition, surprise round.
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
- **Meatspace** — `routeObstacles`: shortest path, collecting obstacles from
  entry points, edges, room post-slots, and **patrols and spirit zones** whose
  circuit the route crosses.
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
| Health tracks / initiative / weapon profile | yes | only inside a fight |
| Site host graph | yes | **no** |
| Site room layout / obstacle inventory | yes | **no** |
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
3. **Site name reorder** to `Adverb-Adjective-Color-Noun-####`. Encode and decode
   move together. Confirm the colour and adjective word lists are disjoint first,
   so any name in the older order fails cleanly.
4. **Simultaneity** — the last Phase 2 item, gated on the console.
