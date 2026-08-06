/* ============================================================
   Mr. Johnson — models/mission.js
   The mission dispatch system: the one mechanism every kind of
   runner assignment goes through (current understanding §06). Recon,
   crafting, resource gathering, and job-derived objectives are
   all the same thing — a mission — differing only in what the
   objective is and whether a site is involved.

   Core rules this file implements (all user-confirmed):
     - Only CONTRACTED runners dispatch. The money paid to a runner
       is for the tasks they do — dispatching is what a contract
       buys, so every dispatch consumes one contract mission
       (market.js's consumeContractMission), success or fail,
       crafting included ("crafting is an assigned task, so it's
       the same thing as a mission").
     - One action period = one day = one action per runner. The
       player queues dispatches; they resolve IN QUEUE ORDER, so an
       earlier mission's effects (fresh intel, suppression, and the
       site's threat read) are real for later missions the same day.
       The read and the response both reset overnight; a ratcheted
       Current does not.
     - Karma is per mission, per participating runner, on success —
       keyed to the security values at the START of the mission
       (live Current, models/alert.js): escalation a crew calls
       down on itself mid-run is a problem, not a growth
       opportunity. Nuyen never comes from a mission — that's the
       job layer (economy.js's collectJobPay, once every included
       mission is resolved).
     - Recon is the scouting system: three lenses (physical /
       matrix / astral), writing a day-stamped snapshot into
       site.intel[lens] — the §09 staleness model ("fresh" =
       within INTEL_FRESH_DAYS). Fresh intel at a site grants a
       small dice bonus to later missions there — this is what
       makes "astral recon first, then the strike team" a real
       sequencing decision, not flavor.
     - Support work — crafting at the bench, working the Medicae —
       earns Karma that SCALES with the difficulty of the work (an
       item's tier; a case's severity, wounds + Essence loss) but at
       SUPPORT_KARMA_RATE, deliberately below the fieldwork rate:
       the risk-averse grind is legitimate and never optimal (§03's
       risk-lane split). A Medicae treatment session is the MEDIC'S
       mission — the patient is occupied for the period but spends
       no action and no contract. Medics grow by working cases, so
       sparing use never stales them out.
     - The player chooses missions with the estimated security
       picture in hand (siteIntelView), in TRUE FORM — a 1-10
       number per axis — but only ESTIMATE_ACCURACY of those
       numbers survive contact with reality (wrong informants,
       stale files), and misses can be wildly off. The BS rate is
       the tuition that teaches recon: "looks matrix-lite, poke
       there first... hotter than we thought... and physical was
       supposed to be hot but it's ICE cold — go in with stealth
       instead of armor." Recon overlays confirmed, day-stamped
       actuals per lens, stale past the horizon.
     - Resource gathering references a site, including
       player-DISCOVERED ones (discoverResourceSite) — the one
       case where sites enter the world without a job introducing
       them.

   Resolution walks the shortest entry->objective route as a
   STEPPER (beginMission / missionPrompt / missionChoose /
   missionAbort / finishMission) so a human can stand in the middle
   of it. Quick resolve is that same loop driven by an auto-chooser
   rather than a player, which is what keeps one code path.

   A failed approach is not a failed obstacle: the guard who told
   you to get lost is exactly as sneak-past-able as before, so the
   crew stays on the challenge and picks another way. Only
   exhausting every approach stops them. Attempt budgets and
   Watsonian immunities are what make that finite — and immunities
   are DISCOVERED by trying, never disclosed up front.

   Consequence flows through the §09 threat read, not through
   noise: an act's threat class is intrinsic to the act, applies
   only if something witnessed it, and tipping to threatening
   engages the site's response (which spawns responders in front of
   the crew at each axis's alert level). Placeholders, flagged:
     - Wounds: a critical glitch wounds the runner who rolled it.
     - Karma formulas (KARMA_PER_SECURITY etc.), the intel bonus
       size, route/recon sample caps, crafting tier: all shape-
       only numbers for tuning later.
     - Yields are returned in the result; the integration layer
       stores them (crafted items and harvested materials both
       land in save.armory). Matrix recon samples hacking/
       electronics-bearing obstacles (the card-based Matrix pillar
       isn't built).

   Usage:
     MJ.createReconMission(site, "astral");
     MJ.createCraftingMission();
     MJ.createResourceMission(site);   // or discoverResourceSite first
     MJ.runActionPeriod(rng, [ { mission, runners: [r1, r2] } ], day);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const RECON_LENSES = ["physical", "matrix", "astral"];

  // ── Tuning dials (all placeholder, shape only) ──────────────────
  const INTEL_FRESH_DAYS = 5;        // §09 staleness horizon
  const INTEL_BONUS_DICE = 1;        // fresh intel at the site -> +dice on every roll there
  const KARMA_PER_SECURITY = 4;      // site missions: award = this x avg start-of-mission Current
  const RECON_KARMA_PER_SECURITY = 2;// recon: award = this x the lens axis's start Current
  // Support work (crafting, Medicae): award = this x the work's tier.
  // INVARIANT to preserve under any tuning: this must stay VISIBLY
  // below KARMA_PER_SECURITY at comparable difficulty — safe
  // grinding keeps leveling, but is never the efficient path (§03).
  const SUPPORT_KARMA_RATE = 2;
  const DEFAULT_CRAFT_TIER = 3;      // until the armory gives items real tiers
  // First-hand estimates: the numbers a site gets handed to the
  // player with. ESTIMATE_ACCURACY of them are dead-on (user spec:
  // 60-70%); the rest miss by up to ±ESTIMATE_MAX_ERROR — small
  // lies and huge ones both, so recon stays load-bearing.
  const ESTIMATE_ACCURACY = 0.65;
  const ESTIMATE_MAX_ERROR = 5;
  // A route carries everything the site put on it. The site's own
  // security budget is the bound that matters — it already decides
  // how much gets bought and placed, so a second cap on top of it
  // discounts the ratings the player is shown and prices against.
  // Measured over 3000 sites: the street walk runs p50 4, p90 11,
  // max 22 obstacles; the host crawl p50 1, p90 6. Long runs are the
  // heavily-secured ones, which is the point, and quick-resolve is
  // the standing skip button for anyone who doesn't want to play one.
  const RECON_SAMPLE = 3;            // obstacles a recon pass examines

  // ── Eligibility: a dispatch is what a contract buys ─────────────
  function isDispatchable(runner) {
    if (runner.dead) return false; // died on a job — not a market state
    return !!runner.market.hired && runner.market.phase !== "kia";
  }

  // ── Reading your own crew — moved out, and why ─────────────────
  // `crewCapability` and its AXIS_SKILLS bag lived here: the best
  // pool any one runner could bring to physical / astral / matrix.
  // It answered the wrong question. P/A/M are budget categories the
  // GENERATOR spends — they decide how much a site buys and how hard
  // its worst thing can be — and bundling nine unrelated skills under
  // "physical" meant a crew's read went up because someone could pick
  // a lock, against a building full of guards. "Brings P:12d" was a
  // number about nobody.
  //
  // models/lanes.js asks it properly: seven lanes, each a bag of
  // skills that answer the same KIND of problem, crossed with what
  // the site actually fields. That file is a forecast for the player
  // and is deliberately not reachable from here — nothing in the
  // resolution path may consult a lane (stress C25 reads this file's
  // source to prove it).

  // ── Player-initiated mission records ────────────────────────────
  // Same record family as job.js's job-derived missions — `kind`
  // distinguishes; a job mission has no kind and resolves as
  // "jobObjective".
  // A Matrix run against a site's host. `wantData` is the greedy
  // route — more datastores, more ice, more exposure. §05: "the
  // deeper and longer you stay to fill storage, the more Alert you
  // eat, so profit trades directly against safety."
  function createMatrixMission(site, opts) {
    opts = opts || {};
    return {
      kind: "matrixRun",
      site: site,
      wantData: !!opts.wantData,
      objective: { verb: "Intel", domain: "data" },
    };
  }

  // Datastores passed on the way through. Storage caps the haul —
  // a bigger deck carries more out, so the deck is the difference
  // between a paid run and a profitable one.
  const DATA_PER_NODE = 2;

  function deckStorageFor(runners) {
    let best = 0;
    for (const r of runners) {
      for (const item of r.gear || []) {
        if (item.consumed) continue;
        const t = MJ.ITEM_TEMPLATES[item.templateId];
        if (t && t.category === "deck") best = Math.max(best, MJ.effectiveTier(item));
      }
    }
    return best; // 0 with no deck — nothing to carry it in
  }

  function haulData(run) {
    const route = run.mission && run.hostRoute;
    if (!route || !route.dataNodes || !route.dataNodes.length) return null;
    const storage = deckStorageFor(run.runners);
    if (storage <= 0) return null;
    // Only nodes whose ice you actually cleared are worth looting —
    // you cannot pull files out of a node still fighting you.
    const reached = route.dataNodes.filter((n) =>
      n.ice.every((i) => run.neutralized.has(i) || run.tasks.some((t) => t.obstacle === i.label && t.success)));
    const files = Math.min(storage, reached.length * DATA_PER_NODE);
    if (files <= 0) return null;
    return { files: files, storage: storage, nodesLooted: reached.length };
  }

  // An astral run: one mage, projecting. No crew walks in, no walls
  // matter, and the only things in the way are wards and whatever
  // lives there. Fast and short — and gated at both ends by any ward
  // it had to cross.
  function createAstralMission(site) {
    return {
      kind: "astralRun",
      site: site,
      objective: { verb: "Intel", domain: "astral" },
    };
  }

  function createReconMission(site, lens) {
    return { kind: "recon", lens: lens, site: site, locationType: "site", resolved: false, karmaAward: null };
  }

  // Two modes: pass a template id string ("medkit") to craft a real
  // armory item — tier, skill, and the yield all come from the
  // template — or a bare number (or nothing) for the legacy generic
  // exercise the bench tests use.
  function createCraftingMission(templateOrTier) {
    if (typeof templateOrTier === "string") {
      return { kind: "crafting", templateId: templateOrTier, site: null, locationType: "hub", resolved: false, karmaAward: null };
    }
    return { kind: "crafting", itemTier: templateOrTier || DEFAULT_CRAFT_TIER, site: null, locationType: "hub", resolved: false, karmaAward: null };
  }

  // A treatment session: the medic's mission, the patient's day on
  // the table. The patient spends nothing — no action, no contract.
  function createMedicalMission(patient) {
    return { kind: "medical", patient: patient, site: null, locationType: "hub", resolved: false, karmaAward: null };
  }

  // ── Scavenging: you come back with what you went looking for ────
  // A harvest is a CREW WALKING THE PLACE, whatever they are after —
  // an astral form has no hands and cannot carry a thing home, so
  // reagents are gathered physically like everything else.
  //
  // What makes scrap and reagents different runs is already in the
  // model and needs nothing added: RESOURCE_SITE_KINDS puts reagents
  // out in nature on an ASTRALLY-oriented site and scrap in a
  // PHYSICALLY-oriented yard, and generateLootTable weights what is
  // findable by that same orientation. So a reagent grove is warded
  // and spirit-patrolled while a scrap yard is fenced and guarded —
  // different security axis, different crew, same pair of boots.
  const RESOURCE_KINDS = ["scrap", "reagents", "data"];

  function createResourceMission(site, kind) {
    const want = RESOURCE_KINDS.indexOf(kind) !== -1 ? kind : "scrap";
    return {
      kind: "resourceGathering", site: site, locationType: "site",
      resourceKind: want,
      wants: "resource:" + want,
      resolved: false, karmaAward: null,
    };
  }

  // Search: the discovery legwork is itself a dispatch (user ruling
  // — "Search / Scrap" sits beside "Recon / Astral" on the menu).
  // The actual minting is the integration layer's business, so the
  // mission carries an onResolve callback (game.js closes it over
  // the session). v0: a search always pans out — a real
  // search-quality roll is future work, flagged.
  function createSearchMission(searchKind, onResolve) {
    return { kind: "search", searchKind: searchKind, site: null, locationType: "streets", resolved: false, karmaAward: null, onResolve: onResolve };
  }

  function resolveSearchMission(rng, mission, runners) {
    const karmaAward = SUPPORT_KARMA_RATE; // tiny flat legwork award
    for (const runner of runners) MJ.growRunner(runner, karmaAward, rng);
    mission.resolved = true;
    mission.karmaAward = karmaAward;
    const discovered = mission.onResolve ? mission.onResolve(rng) : null;
    return {
      kind: "search", success: true, karmaAward: karmaAward, tasks: [],
      discovered: discovered ? { universeIndex: discovered.identity.universeIndex, district: discovered.identity.district } : null,
    };
  }

  // Player-initiated site discovery (§06): finding a thematically
  // appropriate spot — out in nature for reagents, a scrap yard for
  // parts. Discovered sites are real sites like any other; once
  // found they can be watched and revisited for regular harvesting.
  const RESOURCE_SITE_KINDS = {
    reagents: { orientation: "astral", faction: "Independent" },
    scrap: { orientation: "physical", faction: "Independent" },
  };

  function discoverResourceSite(rng, kind) {
    const spec = RESOURCE_SITE_KINDS[kind] || RESOURCE_SITE_KINDS.scrap;
    const site = MJ.generateSite(rng, { orientation: spec.orientation, faction: spec.faction });
    site.tags.push({ tag: "resource:" + kind, expiryDay: Infinity });
    generateSecurityEstimate(rng, site); // discovery hands the player first impressions too
    return site;
  }

  // ── The handed-to-player estimate ───────────────────────────────
  // Rolled once, the moment a site enters the player's world (a job
  // introducing it, or discovery). Estimates target the site's live
  // Current at that moment — so even an honest number goes stale as
  // the site ratchets or cools. A rolled miss is guaranteed to be
  // actually wrong (never clamped back onto the truth).
  function generateSecurityEstimate(rng, site) {
    if (!site.securityState) MJ.initSecurityState(rng, site);
    const est = {};
    for (const axis of ["physical", "astral", "matrix"]) {
      const actual = site.securityState.axes[axis].current;
      if (rng.chance(ESTIMATE_ACCURACY)) {
        est[axis] = actual;
      } else {
        const err = rng.int(1, ESTIMATE_MAX_ERROR) * (rng.chance(0.5) ? 1 : -1);
        let v = actual + err;
        if (v < 1 || v > 10) v = actual - err; // flip rather than clamp onto the truth
        est[axis] = Math.max(1, Math.min(10, v));
      }
    }
    site.estimatedSecurity = est;
    return est;
  }

  function missionKind(mission) {
    return mission.kind || "jobObjective";
  }

  // ── Which planes a dispatch actually walks ──────────────────────
  // The report card reads THE DISPATCH, not the site: an astral recon
  // meets wards and spirits, so quoting the corridor's guards at it is
  // noise. The rule distinguishes the Matrix's REACH from its
  // INTERIOR:
  //   street   the crew is bodily present, so every pillar's verbs
  //            apply — the decker hacks the maglock from the corridor
  //            (AR, the shallow rung) exactly like the mage casts at
  //            it. The route walks physical AND astral ground. What
  //            it never walks is the host's inside.
  //   astral   pure projection: no body, no shooting, no AR fingers,
  //            no kevlar. Astral obstacles, astral verbs.
  //   matrix   the host crawl — its own graph, its own rules.
  // Null from a card-less kind means "no site read at all".
  function missionPlanes(mission) {
    const kind = missionKind(mission);
    if (kind === "astralRun") return ["astral"];
    if (kind === "matrixRun") return ["matrix"];
    // A recon examines through ONE lens — the sample it walks is
    // drawn from that pool alone, so that pool is what the card
    // reads. (A physical recon crew is still bodily present, so the
    // all-pillars rule below still lets the decker and mage front
    // approaches on what they meet.)
    if (kind === "recon") return [mission.lens || "physical"];
    if (kind === "crafting" || kind === "medical" || kind === "search") return null;
    return ["physical", "astral"]; // the street: bodies on real ground
  }

  // -- The three pillars' route builders ---------------------------
  // Lifted into models/mission-routes.js: pure shape, no dice, no
  // runners. Aliased so the call sites below read unchanged.
  const routeObstacles = MJ.routeObstacles;
  const hostPaths = MJ.hostPaths;
  const hostRoute = MJ.hostRoute;
  const astralRoute = MJ.astralRoute;

  // ── The tether ─────────────────────────────────────────────────
  // §08's second pressure: "a budget of astral turns, sized by the
  // mage's Magic stat — every move, assense, and encounter exchange
  // ticks it uniformly." Running out is the HARD fail: "forced
  // snap-back plus downed (a wound)."
  //
  // Where Drain asks how hard you pushed, the tether asks how long
  // you have been out — a fast loud run burns Drain but few ticks, a
  // slow careful one conserves Drain and eats the tether. Same
  // duality as the Matrix's cards-versus-Alert, different clothes.
  // In the source a projection lasts MAGIC HOURS — generous enough
  // that it is essentially never the thing that ends a single
  // infiltration. The first pass here read "2 dice to meatspace's 1"
  // as the budget itself and gave a Magic 5 mage ten ticks, which at
  // a combat round apiece is barely a minute out of body. Measured
  // against real runs it was catastrophic: the MEDIAN run spends 2
  // and p90 spends 9, so 15% of runs were ending on a forced
  // snap-back.
  //
  // A tick here is an EXCHANGE, not a six-second round — a careful
  // assensing pass is minutes of work — so the budget should be
  // generous the way the fiction is. Sized so it catches only the
  // long tail: at Magic 5 that is 30 against a p99 of 19, so an
  // ordinary run never feels it and a genuinely drawn-out one still
  // can. It bites hardest where it should, on a weak projector — a
  // Magic 2 mage gets 12, right at p95, so sending one on a long
  // astral job is a real risk rather than a formality.
  const TETHER_PER_MAGIC = 6;

  function tetherFor(runners) {
    let best = 0;
    for (const r of runners) best = Math.max(best, (r.attributes.magic || 0) * TETHER_PER_MAGIC);
    return best;
  }

  function tickTether(run) {
    if (run.tether === undefined || run.tether === null) return null;
    run.tether -= 1;
    if (run.tether > 0) return null;
    // Snapped back. Whoever was projecting takes it, exactly like any
    // other way of going down mid-run.
    const projector = run.runners.reduce((a, b) =>
      ((a.attributes.magic || 0) >= (b.attributes.magic || 0) ? a : b));
    if (!run.downed) run.downed = new Set();
    if (run.downed.has(projector)) return null;
    run.downed.add(projector);
    run.failed = true;
    run.aborted = true;
    const casualty = resolveTakedown(run, {
      source: projector, physical: 0, physicalMax: 1, stun: 1, stunMax: 1,
    });
    run.tasks.push({
      obstacle: "—", tier: 0,
      result: "the tether ran out — " + projector.identity.handle + " was snapped back into their body",
      tetherOut: true, casualty: casualty,
    });
    return casualty;
  }

  // -- The live read, recon sampling and suppression --------------
  // Lifted into models/mission-intel.js: everything about what the
  // crew KNOWS, as opposed to what is true. Local aliases so the
  // call sites below read as they did when it lived here.
  const axisTally = MJ.axisTally;
  const axisProven = MJ.axisProven;
  const reconObstacles = MJ.reconObstacles;
  const suppressionAxisFor = MJ.suppressionAxisFor;
  const suppressionBonus = MJ.suppressionBonus;
  const applySuppression = MJ.applySuppression;
  const hasFreshIntel = MJ.hasFreshIntel;
  // A responder is something the site SENT, not something it had
  // standing there — the census of what was faced excludes them.
  const isStanding = MJ.isStanding;
  const EXCEPTIONAL_MARGIN = 3;      // hits beyond threshold that read as "thoroughly bamboozled"
  const ALERT_POINTS_PER_BEAT = 3;   // ~3-4 beats buys them one escalation step

  // ── The mission stepper ─────────────────────────────────────────
  // Resolution is a state machine so a human can stand in the middle
  // of it: beginMission sets the table, missionPrompt describes the
  // challenge in front of the crew, missionChoose takes one decision
  // and rolls it, finishMission settles the consequences. Quick
  // resolve (resolveSiteMission, below) is just this loop driven by
  // an auto-chooser instead of a player — one code path, so the
  // soak exercises exactly what a human would drive.
  //
  // RNG DISCIPLINE, load-bearing: dice are only ever consumed by
  // resolveTask (per obstacle, in order) and growRunner (per runner,
  // in order) — every other step here is pure. Preserving those two
  // sequences is what makes interactive and auto play produce
  // identical worlds from identical choices.
  function beginMission(rng, mission, runners, day) {
    const site = mission.site;
    const kind = missionKind(mission);
    const matrixRun = kind === "matrixRun" ? hostRoute(site, { wantData: !!mission.wantData }) : null;
    const astralRun = kind === "astralRun" ? astralRoute(site) : null;
    // The meat run walks the building. Held like the other two routes
    // so a readout can say which room the crew is standing in.
    const streetRun = kind === "recon" || matrixRun || astralRun ? null : routeObstacles(site);
    if (!site.securityState) MJ.initSecurityState(rng, site);
    const state = site.securityState;
    // Karma keys off the START of the mission — snapshot first.
    const start = {
      physical: state.axes.physical.current,
      astral: state.axes.astral.current,
      matrix: state.axes.matrix.current,
    };
    // Armor: reusable wound guards, refreshed per mission.
    const armorGuard = new Map();
    for (const r of runners) armorGuard.set(r, MJ.woundGuardFor(r));
    const run = {
      rng: rng,
      mission: mission, runners: runners, day: day, site: site, kind: kind,
      state: state, start: start,
      intelBonus: hasFreshIntel(site, day) ? INTEL_BONUS_DICE : 0,
      obstacles: kind === "recon" ? reconObstacles(site, mission.lens)
        : kind === "matrixRun" ? matrixRun.obstacles
        : kind === "astralRun" ? astralRun.obstacles
        : streetRun.obstacles,
      // The room path the crew walks, for anything that draws it.
      streetRoute: streetRun,
      // Sized by the strongest projector on the crew. Null for every
      // other kind of run — only an astral form is on a tether.
      tether: kind === "astralRun" ? tetherFor(runners) : null,
      tetherMax: kind === "astralRun" ? tetherFor(runners) : null,
      astralRun: astralRun,
      // Matrix runs carry their route so the readout can say WHERE
      // in the host the decker is, and what is still worth grabbing.
      hostRoute: matrixRun,
      index: 0, tasks: [], armorGuard: armorGuard,
      // Held by object identity, not route index: responders splice
      // into the middle of the route and would shift any index key.
      // Per-run, so putting a guard down never leaks into tomorrow.
      // The shared frame (core/tempo.js): the player's granularity
      // choice, and the tick counter the eventual real-time street
      // hangs off. Clocking only for now — see PILLAR-PLAN.md §2.
      tempo: MJ.newTempo(),
      neutralized: new Set(),
      // Everything that hides the crew adds dice here: a spell,
      // darkness, a distraction, and eventually just standing where
      // the camera is not looking. Zero means they are relying on
      // their own tradecraft and nothing else.
      concealment: 0,
      extended: null, // in-progress extended work, if any (P2.1)
      anyLoud: false, anyGlitch: false, failed: false, aborted: false,
      attempts: new Map(), // obstacle -> { verbId: tries }, which drive escalation
      discovered: new Map(), // obstacle -> { skill: why it will never work here }
      // obstacle -> structural damage taken THIS RUN. The site's own
      // walls are generated from its seed and reset nightly, so a
      // door that remembered being shot at would turn a farmable
      // address into rubble and would have to survive a save.
      damaged: new Map(),
      engagedAlert: false, // did this run force a real response
    };
    // Walking into a building that is ALREADY responding — an
    // earlier crew tipped them this morning and the site never
    // stood down. They are waiting in the doorway, not politely
    // further along the route.
    if (MJ.alertEngaged(site.securityState)) {
      run.engagedAlert = true;
      run.walkedIntoResponse = spawnResponders(run, 0).map((o) => o.label + " T" + o.tier);
    }
    return run;
  }

  // ── Witnessing, threat classes and repeat counters ──────────────
  // Lifted wholesale into models/mission-witness.js — see that file's
  // header. Local aliases so every call site below reads exactly as
  // it did when the functions lived here.
  const sensesPlane = MJ.sensesPlane;
  const perceiversNear = MJ.perceiversNear;
  const noticePool = MJ.noticePool;
  const concealmentPool = MJ.concealmentPool;
  const noticedBy = MJ.noticedBy;
  const castNoticedBy = MJ.castNoticedBy;
  const wasWitnessed = MJ.wasWitnessed;
  const threatClassFor = MJ.threatClassFor;
  const triesOn = MJ.triesOn;
  const countTry = MJ.countTry;
  const knownUseless = MJ.knownUseless;
  const markUseless = MJ.markUseless;

  // ── Responders: what an engaged axis actually sends ─────────────
  // Each axis fields a challenge at its own alert level, in its own
  // idiom. Matrix has no obstacle vocabulary of its own yet, so its
  // response manifests physically — doors sealing, turrets waking —
  // rather than inventing ice the unbuilt Matrix pillar would have
  // to contradict later.
  const RESPONDER_TYPES = {
    // A RESPONSE IS SOMETHING THAT COMES. A camera is bolted to a
    // wall — it cannot be dispatched, cannot walk into the corridor
    // the crew is standing in, and "RESPONSE: Camera T3 — they are
    // coming" is a sentence about a light fitting. What a building
    // sends when it decides you are a problem is people.
    physical: ["guard"],
    astral: ["spirit"],
    // Ice, now that the Matrix pillar exists. This used to spawn
    // maglocks and cameras — the note above said it did so rather
    // than "inventing ice the unbuilt Matrix pillar would have to
    // contradict later." The pillar is built, so the response is
    // what a host actually sends.
    matrix: ["patrolIce", "blackIce"],
  };

  // Which world this run is happening in. A projecting mage is not
  // in the building and a decker is not in the room, so what can
  // actually get in their way is not the same list.
  function runPlane(run) {
    if (run.kind === "astralRun") return "astral";
    if (run.kind === "matrixRun") return "matrix";
    return "physical";
  }

  function spawnResponders(run, atIndex) {
    const spawned = [];
    const plane = runPlane(run);
    for (const axis of MJ.SECURITY_AXES) {
      const tier = MJ.alertLevel(run.state, axis);
      if (tier < 1) continue;
      // The site mobilises on every axis — that is the alert model,
      // and it stays true. But only what shares the runner's PLANE
      // can physically get in their way: a camera cannot stop a
      // projecting mage and ice cannot stop a man in a corridor.
      // Spawning all three regardless put Black ICE in the path of
      // an astral form, which is nonsense the plane system exists to
      // prevent.
      if (axis !== plane) continue;
      const typeId = run.rng.pick(RESPONDER_TYPES[axis]);
      const projection = axis === "astral" ? "astral" : axis === "matrix" ? "matrix" : "physical";
      const ob = MJ.generateObstacleInstance(run.rng, typeId, Math.min(10, tier), projection);
      ob.responder = axis;
      spawned.push(ob);
    }
    // They come to where the crew actually is, so they witness the
    // same ground — a response team is the definition of more eyes.
    const here = run.obstacles[run.index];
    for (const o of spawned) o.rooms = (here && here.rooms) || [];
    // They arrive in front of you — next, not at the end of the route.
    run.obstacles.splice(atIndex === undefined ? run.index + 1 : atIndex, 0, ...spawned);
    return spawned;
  }

  function missionDone(run) {
    return run.aborted || run.index >= run.obstacles.length;
  }

  // ── Extended work in progress ──────────────────────────────────
  // An extended approach isn't one swing, so the crew ends up stood
  // in a corridor with the job half done and a decision to make:
  // another interval, or cut losses. Threshold scales with tier, so
  // unlike a single roll — capped at threshold 5 forever — this
  // difficulty axis has no ceiling.
  const EXTENDED_THRESHOLD_PER_TIER = 3;

  function extendedThreshold(tier) {
    return Math.max(2, tier * EXTENDED_THRESHOLD_PER_TIER);
  }

  function extendedPrompt(run) {
    const w = run.extended;
    const obstacle = run.obstacles[run.index];
    return {
      extended: true,
      obstacle: obstacle,
      label: obstacle.label,
      tier: obstacle.tier,
      projection: obstacle.projection,
      index: run.index,
      total: run.obstacles.length,
      verb: w.verb,
      runner: w.runner,
      skill: w.test.skillId,
      hits: w.test.hits,
      threshold: w.test.threshold,
      pool: w.test.pool,          // already decremented — what the NEXT interval rolls
      intervals: w.test.intervals,
      options: [],                // the choice is continue/stop, not an approach list
    };
  }

  // ── What a runner would actually be swinging ───────────────────
  // A damaging verb is not an abstract "attack" — it is a specific
  // thing in specific hands, and gate 2 is decided by which. `shoot`
  // is whatever they are carrying (so combatLoadoutFor stays the one
  // definition of that), `kick` is the unarmed profile everyone has,
  // `breach` is the charge, and sorcery builds its profile out of the
  // Force being pushed.
  function manaProfile(force) {
    return {
      label: "Force " + force + " blast", skill: "sorcery",
      power: force + 3, dv: force, ap: -2, modes: ["melee"],
    };
  }

  function forceProfileFor(runner, verb, opts) {
    opts = opts || {};
    let profile;
    let quality = 0;
    if (verb.spellShape) {
      // A REAL SPELL from the grimoire, not an anonymous blast. The
      // shape decides the gate: direct skips armour entirely (and the
      // mana/physical split already decided reach at the verb layer);
      // indirect throws something real — Power = Force, AP = −Force,
      // per canon. A spell the player NAMED (opts.spellId, from the
      // cast-a-spell submenu) wins over the automatic best, provided
      // it is really theirs and really this shape.
      const named = opts.spellId && MJ.knowsSpell(runner, opts.spellId) &&
        (MJ.spellDef(opts.spellId) || {}).shape === verb.spellShape
        ? { id: opts.spellId, def: MJ.spellDef(opts.spellId) } : null;
      const best = named || MJ.bestSpellOfShape(runner, verb.spellShape);
      const force = Math.max(1, opts.force || (runner.attributes.magic || 0));
      const direct = verb.spellShape !== "indirect";
      profile = {
        label: (best ? best.def.label : "spell") + " at Force " + force,
        skill: "sorcery", spellId: best ? best.id : null,
        direct: direct, stun: !!(best && best.def.stun),
        power: force, dv: force, ap: direct ? 0 : -force, modes: ["melee"],
      };
    } else if (verb.skill === "sorcery") {
      // The astral pillar's `blast`: fronts the best combat spell on
      // the dossier, so the ward is hit with what the mage actually
      // knows. The anonymous manaProfile survives only as the
      // fallback for a caller that somehow got here without a
      // grimoire — the verb's own `carries` gate should prevent it.
      const best = MJ.bestCombatSpell ? MJ.bestCombatSpell(runner) : null;
      const force = Math.max(1, opts.force || (runner.attributes.magic || 0));
      if (best) {
        const direct = best.def.shape !== "indirect";
        profile = {
          label: best.def.label + " at Force " + force,
          skill: "sorcery", spellId: best.id,
          direct: direct, stun: !!best.def.stun,
          power: force, dv: force, ap: direct ? 0 : -force, modes: ["melee"],
        };
      } else {
        profile = manaProfile(force);
      }
    } else if (verb.weaponFor) {
      // Whatever they are holding — a crafted edge is genuinely better
      // than the shop's, so its quality rides along.
      const pick = MJ.meleeProfileFor(runner);
      profile = MJ.weaponProfile(pick.id);
      quality = pick.quality || 0;
    } else if (verb.weapon) {
      profile = MJ.weaponProfile(verb.weapon);
    } else {
      const loadout = MJ.combatLoadoutFor(runner);
      profile = MJ.weaponProfile(loadout.weaponId);
      quality = loadout.weaponQuality || 0;
    }
    const strength = (runner.attributes && runner.attributes.strength) || 0;
    return {
      profile: profile, quality: quality, strength: strength,
      power: (profile.power || 0) + quality + (profile.useStrength ? strength : 0),
    };
  }

  function penetrates(force, obstacle) {
    if (force.profile.direct) return true; // direct force does not ask armour
    return force.power > Math.max(0, (obstacle.armour || 0) + (force.profile.ap || 0));
  }

  // ── What magic is doing to this runner's OTHER work ────────────
  // Sustaining costs −2 dice per held spell (canon), and a disguise
  // spell lends dice to the skill it fronts. One helper, read by
  // every pool the mission computes — the number shown is the number
  // rolled, spells included.
  function spellPoolMods(run, runner, skill) {
    let mod = MJ.sustainPenaltyFor ? MJ.sustainPenaltyFor(run, runner) : 0;
    if (run.spellBoosts && runner && run.spellBoosts.has(runner)) {
      mod += (run.spellBoosts.get(runner)[skill] || 0);
    }
    return mod;
  }

  // ── Every way this crew could take this thing ──────────────────
  // VERBS × PROPERTIES. Not a list somebody wrote for a maglock —
  // every verb the game has, crossed against what this thing IS, with
  // the two gates already applied. ONE definition: missionPrompt
  // shows it, remainingApproaches counts it and the auto-chooser
  // ranks it, so what the player is offered, what the house plays and
  // what decides "no way through" cannot drift apart.
  //
  // Two kinds of dead end, and they are shown differently on purpose:
  //   `lands: false`  the thing is the wrong KIND of thing. A camera
  //                   has no opinion, and a crew can see that without
  //                   trying — so the reason rides the option from
  //                   the first look. It stays on the menu and stays
  //                   clickable; it just does nothing.
  //   `discovered`    a Watsonian immunity. Nothing visible says the
  //                   box is air-gapped, so this appears ONLY after
  //                   an attempt bought the knowledge, and thereafter
  //                   the option is marked rather than deleted.
  function optionsFor(run, obstacle) {
    // Effective skills are recomputed per prompt, not cached on the
    // run: a critical glitch mid-mission changes them. Once per
    // runner rather than once per runner PER verb, though — this used
    // to allocate a fresh skill map fifteen times a prompt. Anyone
    // dropped in a firefight is out of the run — they cannot front an
    // approach from the floor.
    const upright = run.runners.filter((r) => !run.downed || !run.downed.has(r));
    const eff = upright.map((r) => MJ.getEffectiveSkills(r));
    const options = [];
    for (const act of MJ.actsFor(obstacle)) {
      const verb = act.def;
      // How many swings this verb has already had, and therefore what
      // the NEXT one would read as. Handing the player the projected
      // read before they commit is the whole point: they should be
      // able to see themselves walking into questionable and choose
      // to do something else instead.
      const tries = triesOn(run, obstacle, act.id);
      const option = {
        verbId: act.id, approach: act.id, verb: act.label,
        _relabel: true,
        skill: verb.skill, runner: null, pool: 0, noRoll: false,
        loud: !!verb.loud, damaging: !!verb.damaging, extended: !!verb.extended,
        lands: act.lands, why: act.why, discovered: null,
        tries: tries, readsAs: threatClassFor(verb, tries + 1),
        available: false,
      };
      // A skill-less way is a real approach, not filler: going around
      // costs a beat and needs nobody trained.
      if (!verb.skill && !verb.skillFor) {
        option.noRoll = true;
        option.available = act.lands;
        options.push(option);
        continue;
      }
      let best = null;
      for (let ri = 0; ri < upright.length; ri++) {
        const runner = upright[ri];
        // Read per runner: `shoot` is whatever THEY are carrying, and
        // a rifle is marksmanship where a shotgun is firearms.
        // Some verbs need the runner to be HOLDING the right thing —
        // no gun, no shooting, whatever their firearms rank says.
        if (verb.carries && !verb.carries(runner)) continue;
        const skill = MJ.verbSkill(verb, runner);
        if (!skill || (eff[ri][skill] || 0) <= 0) continue;
        // Ranked by the pool they will ACTUALLY roll — the same
        // definition resolveTask uses, so the toolkit-holder wins
        // ties against a bare-handed equal, and the runner with the
        // better linked attribute wins against an equally-trained
        // one. Computing this separately is what let the popup show
        // a number a whole attribute short of the real roll.
        const pool = MJ.dicePoolFor(runner, skill,
          MJ.gearBonusFor(runner, skill) + spellPoolMods(run, runner, skill));
        const cand = { runner: runner, skill: skill, pool: pool, through: true };
        // Against something that does not fight back, dice are the
        // wrong ranking: the crack shot with a holdout cannot hurt an
        // armoured door and the labourer with a shotgun can. Who gets
        // THROUGH comes first, then who rolls best.
        if (verb.damaging && !obstacle.fights) {
          cand.through = penetrates(forceProfileFor(runner, verb), obstacle);
        }
        if (!best) best = cand;
        else if (cand.through !== best.through) { if (cand.through) best = cand; }
        else if (cand.pool > best.pool) best = cand;
      }
      if (best) {
        option.runner = best.runner;
        option.skill = best.skill;
        option.pool = best.pool;
        // Now that a runner is attached, the label can say what THEY
        // are actually bringing to it.
        option.verb = MJ.verbLabel(verb, obstacle, best.runner);
      }
      delete option._relabel;
      option.discovered = knownUseless(run, obstacle, option.skill);
      // Nothing is used up. A way in is unavailable only when nobody
      // can attempt it, when it is the wrong kind of act for this
      // thing, or when the crew has learned it cannot work here.
      option.available = !!best && act.lands && !option.discovered;
      options.push(option);
    }
    // Live ways first — the menu keeps everything, but it does not
    // make the player read past nine dead entries to find the two
    // that work.
    return options.sort((a, b) => (a.available === b.available ? 0 : a.available ? -1 : 1));
  }

  // What the crew is looking at, and every way they could take it.
  function missionPrompt(run) {
    if (missionDone(run)) return null;
    if (run.extended) return extendedPrompt(run);
    const obstacle = run.obstacles[run.index];
    return {
      obstacle: obstacle,
      label: obstacle.label,
      tier: obstacle.tier,
      projection: obstacle.projection,
      index: run.index,
      total: run.obstacles.length,
      options: optionsFor(run, obstacle),
      // What detection magic has already bought about the ground
      // ahead — null until somebody paid Drain for it.
      revealed: revealedRead(run),
    };
  }

  // One decision, one roll. `choice` is { skill, runner } — or null,
  // meaning nobody could touch it and the crew stalls out loudly.
  // ── Combat, entered from a mission ─────────────────────────────
  // A violent approach is not a check. §07: turn-based starts either
  // FORCED ("a witnessed or failed takedown, a tripped alarm, a
  // spotted crew") or CHOSEN, and choosing it while still undetected
  // is the ambush — a surprise round nobody can answer. That is the
  // whole reason to open a fight deliberately rather than blunder
  // into one, and it is why the threat read matters right up to the
  // moment somebody pulls a trigger.
  const DEATH_ON_TAKEDOWN = 0.05; // 1 in 20; the other 19 take a wound

  // Tier is how much security a site has BOUGHT — coverage, density,
  // budget — not how good any individual is. Mapping it straight onto
  // skill made a tier-8 guard roll 14 dice against a median crew's 8,
  // i.e. better trained than any runner the player could afford, which
  // is not what a security rating is supposed to mean. Skill and
  // attributes therefore rise at roughly HALF tier, so the ladder runs
  // from a rent-a-cop to genuine corp security without ever leaving
  // the range a real crew competes in. What high tier actually buys
  // the site is more of them, better armed and better armoured — the
  // density the alert system already trades in.
  function enemyStatBlock(obstacle) {
    const t = obstacle.tier;
    const skill = 1 + Math.ceil(t / 2);       // T1 -> 2, T10 -> 6
    return {
      label: obstacle.label + " T" + t,
      attributes: {
        agility: 2 + Math.ceil(t / 3),        // T1 -> 3, T10 -> 6
        intelligence: 2 + Math.floor(t / 3),
        body: 2 + Math.ceil(t / 3),
        willpower: 2 + Math.ceil(t / 3),
        strength: 2 + Math.floor(t / 3),
      },
      skills: { firearms: skill, melee: skill, marksmanship: skill },
    };
  }

  function enemiesFor(run, obstacle) {
    const spawn = (o) => {
      const c = MJ.makeCombatant(enemyStatBlock(o),
        { side: "enemy", armour: o.armour, weaponId: o.weapon, ammo: 999 });
      c.sourceObstacle = o;
      return c;
    };
    const foes = [spawn(obstacle)];
    // Anything else that can fight and shares this ground joins in.
    // Opening fire in a room with two guards is a fight with two
    // guards — that is what makes clearing the eyes first matter.
    for (const o of run.obstacles) {
      if (o === obstacle || !o.fights || run.neutralized.has(o)) continue;
      if (!o.rooms || !obstacle.rooms || !o.rooms.some((r) => obstacle.rooms.indexOf(r) !== -1)) continue;
      foes.push(spawn(o));
    }
    return foes;
  }

  function crewCombatants(run) {
    const crew = run.runners.filter((r) => !run.downed || !run.downed.has(r)).map((r) =>
      MJ.makeCombatant(r, Object.assign({ side: "crew", ammo: 30 }, MJ.combatLoadoutFor(r))));
    // Spells held open WALK INTO THE FIGHT with the crew: the Armor
    // on the tank and the sustaining weight on the mage both arrive
    // as the ordinary effects they are. Cast before the shooting
    // starts is exactly what a preparation spell is FOR.
    if (MJ.registerSpellEffects) MJ.registerSpellEffects();
    for (const held of run.sustaining || []) {
      const byC = crew.find((c) => c.source === held.caster);
      const def = MJ.spellDef(held.spell) || {};
      const stacks = MJ.effectStacksFor(def, held.force);
      if (held.effect) {
        // A barrier covers the GROUND the crew is standing on, so
        // everyone gets it; everything else sits on whoever it was
        // cast on.
        const holders = def.home === "barrier"
          ? crew
          : crew.filter((c) => c.source === (held.target || held.caster));
        for (const h of holders) MJ.applyEffect(h, held.effect, { stacks: stacks, source: held.spell });
      }
      if (byC) MJ.applyEffect(byC, "sustaining", { source: held.spell });
    }
    return crew;
  }

  // Going down is where mission risk has teeth. The player watches
  // the tracks fill, chooses to press or withdraw, and can pull out;
  // a death they saw coming is a consequence rather than an ambush.
  //
  // Survive it and the boxes come home. Overflow — damage past the
  // end of the track — is what decides whether they get up at all,
  // and how much of the beating is still on them tomorrow: being
  // dropped by a tier-9 hardsuit marks a career in a way a
  // rent-a-cop does not.
  function resolveTakedown(run, combatant) {
    const runner = combatant.source;
    const overflow = Math.max(0,
      (combatant.physical - combatant.physicalMax) + (combatant.stun - combatant.stunMax));
    // ── WHICH TRACK PUT THEM DOWN ────────────────────────────────
    // Filling the stun track is UNCONSCIOUS: they are out of the
    // operation and carried home, but nobody is dying of exhaustion
    // and nothing needs a medic. Filling the physical track is the
    // one that can kill. Treating a drained mage like a shot one
    // would have handed every hard casting day a 1-in-20 funeral and
    // a full physical track, which is not what Drain is.
    const byStunOnly = (combatant.physical || 0) < (combatant.physicalMax || 0);
    if (byStunOnly) {
      runner.stun = MJ.stunTrack(runner); // out cold, and still carrying it
      return {
        runner: runner.identity.handle, died: false, wounds: runner.wounds || 0,
        unconscious: true, stun: runner.stun,
      };
    }
    if (run.rng.chance(DEATH_ON_TAKEDOWN)) {
      // ── Stabilize: the spell between the wound and the grave ────
      // Canon: it stops dying, nothing more — the runner is exactly
      // as down and exactly as hurt, they just get to BE hurt
      // tomorrow. A standing crew mage who knows it gets one cast,
      // pays the Drain either way, and a failed cast is a failed
      // cast. This is what makes a healthMage worth a crew slot at
      // the exact moment the 1-in-20 lands.
      const healer = (run.runners || []).find((r) =>
        r !== runner && (!run.downed || !run.downed.has(r)) &&
        MJ.knowsSpell && MJ.knowsSpell(r, "stabilize") &&
        ((r.attributes && r.attributes.magic) || 0) > 0 &&
        (MJ.getEffectiveSkills(r).sorcery || 0) > 0);
      let stabilized = false;
      if (healer) {
        const cast = MJ.castSpell(run.rng, healer, "stabilize", { force: healer.attributes.magic });
        if (cast.ok) {
          applyDrain(run, healer, cast.drain);
          stabilized = !!cast.success;
        }
      }
      if (stabilized) {
        const severity = combatant.physicalMax + Math.floor(overflow / 4);
        runner.wounds = Math.max(runner.wounds, severity);
        return {
          runner: runner.identity.handle, died: false, wounds: severity,
          stabilized: true, by: healer.identity.handle,
        };
      }
      // `dead` is its own flag, deliberately NOT market.phase="kia".
      // The phase machine describes runners on the WATCH LIST and
      // hiring suppresses it, so a corpse with a market phase would
      // read as still cycling through availability. Dying on a job
      // is not a market state; the roster sweep removes them at
      // day's end.
      runner.dead = true;
      if (runner.market) runner.market.hired = null; // the contract ends with them
      return { runner: runner.identity.handle, died: true };
    }
    // They filled the track, so the track is what they carry out —
    // a full physical box count — and overflow adds on top of it.
    // Anyone who goes down leaves the field badly hurt by
    // definition, which is what makes pulling out early a real call.
    const severity = combatant.physicalMax + Math.floor(overflow / 4);
    runner.wounds = Math.max(runner.wounds, severity);
    return { runner: runner.identity.handle, died: false, wounds: severity };
  }

  // Which spell — if any — this combatant would throw at this target
  // instead of pulling a trigger. Null means shoot. Mana never
  // touches the unliving, nothing physical reaches a thing that
  // lives only on the wire, and the whole question only exists for
  // someone with a combat spell on their dossier.
  function combatSpellPick(actor, target) {
    const src = actor.source;
    if (!src || !MJ.bestSpellOfShape) return null;
    const ob = target.sourceObstacle;
    if (ob && (ob.presence || []).every((p) => p === "matrix")) return null; // no spell reaches the wire
    const living = ob ? !!ob.living : true;
    const pick = (living && MJ.bestSpellOfShape(src, "directMana")) ||
      MJ.bestSpellOfShape(src, "directPhys") ||
      MJ.bestSpellOfShape(src, "indirect");
    if (!pick) return null;
    const weapon = MJ.weaponProfile(actor.weaponId);
    const weaponPower = (weapon.power || 0) + (actor.weaponQuality || 0) +
      (weapon.useStrength ? (actor.attributes.strength || 0) : 0);
    const gunUseless = weaponPower <= Math.max(0, target.armour + (weapon.ap || 0));
    if (gunUseless) return pick;
    const weaponPool = MJ.dicePoolFor(src, weapon.skill, 0);
    const spellPool = MJ.dicePoolFor(src, "sorcery", 0);
    return spellPool > weaponPool ? pick : null;
  }

  // ── AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME ──────────────────
  // This runs the WHOLE fight itself and hands back one task. That is
  // the harness, not the design: turn-based is the COMMAND MODE, and
  // §07's action is three axes the PLAYER picks — Stance (open /
  // cover / flanking / full defence), Method (which weapon, spell or
  // program) and Mode (SS/SA/BF/FA, aim, called shot | spell Force |
  // Matrix Attack vs Sleaze). None of that is offered here; the house
  // picks cover for the crew, open for the enemy, burst if the weapon
  // has it, and targets whoever is closest to dropping.
  //
  // Wiring the player's seat is the outstanding work on P2.2/P2.3.
  // The engine underneath — initiative passes, the three gates, dual
  // tracks, postures as effect channels — does not change when it
  // lands, because postures ARE the seam. See SYSTEM-STATE.md.
  function runCombat(run, obstacle, opts) {
    opts = opts || {};
    const crew = crewCombatants(run);
    const foes = enemiesFor(run, obstacle);
    const combat = MJ.beginCombat(run.rng, crew, foes, { surprise: !!opts.surprise });

    // Bounded in ROUNDS, not actions. Counting actions meant a big
    // fight hit the cap after only a handful of rounds, and worse:
    // when neither side can hurt the other — a pistol crew against
    // an armoured spirit, where every shot bounces off gate 2 — the
    // exchange simply never ended, and "some of the crew is still
    // standing" was being scored as a WIN. A fight you cannot finish
    // is not a fight you won; it is one you have to walk away from.
    const MAX_ROUNDS = 10;
    let guard = 0;
    while (!MJ.combatOver(combat) && combat.round <= MAX_ROUNDS && guard++ < 800) {
      const slot = MJ.combatActor(combat);
      if (!slot) break;
      const actor = slot.actor;
      const targets = combat.combatants.filter((c) => c.side !== actor.side && !c.down);
      if (!targets.length) break;
      // House policy: hit the one closest to dropping, so a fight
      // shortens instead of spreading damage evenly.
      const target = targets.reduce((a, b) =>
        (a.physical + a.stun) >= (b.physical + b.stun) ? a : b);

      // A crew mage CASTS when the grimoire beats the gun — when the
      // gun cannot penetrate at all (the wipe scenario: holdouts on
      // hardsuits, where a direct spell is the only thing in the
      // room that works), or when their sorcery simply out-rolls
      // their marksmanship. House policy, same as every choice here.
      if (actor.side === "crew") {
        const pick = combatSpellPick(actor, target);
        if (pick) {
          MJ.applyEffect(actor, "cover");
          actor.stance = "cover";
          combat.cursor += 1; // the cast IS the action
          const res = MJ.spellCombatAction(combat, actor, pick.id, target,
            { force: (actor.source.attributes || {}).magic || 1 });
          combat.log.push({
            event: "spell", round: combat.round, pass: slot.pass,
            actor: actor.name, target: target.name,
            spell: res.label || pick.def.label, force: res.force,
            drainTaken: res.drainTaken || 0, casterDown: !!res.casterDown,
            hits: res.hits || null, sustained: !!res.sustained,
            result: res.casterDown ? "the Drain drops the caster"
              : res.sustained ? "held up on " + res.on
              : (res.hits || []).map((h) => h.target + ": " +
                  (h.result === "hit" ? h.damage + (h.stun ? "S" : "P") + (h.direct ? " straight through armour" : "") : h.result)
                ).join("; ") || res.result || "cast",
          });
          continue;
        }
      }
      const weapon = MJ.weaponProfile(actor.weaponId);
      const mode = weapon.modes.indexOf("BF") !== -1 ? "BF" : weapon.modes[0];
      MJ.combatAct(combat, { target: target, mode: mode, stance: actor.side === "crew" ? "cover" : "open" });
    }

    const casualties = [];
    const injured = [];
    for (const c of crew) {
      if (c.down) {
        if (!run.downed) run.downed = new Set();
        run.downed.add(c.source);
        casualties.push(resolveTakedown(run, c));
        continue;
      }
      // Walking out of a firefight is not the same as walking out
      // unhurt. Whatever physical damage they are still carrying
      // goes on the dossier and stays there — the stun does not,
      // because a beating wears off and a bullet wound does not.
      const took = MJ.carryDamageHome(c);
      if (took > 0) injured.push({ runner: c.source.identity.handle, wounds: took });
    }
    // Only a cleared field counts. Standing there unable to finish
    // them is a stalemate — the crew breaks off, the obstacle is
    // still there, and every round of it fed the alert.
    const enemiesLeft = foes.some((f) => !f.down);
    const crewLeft = crew.some((c) => !c.down);
    const won = crewLeft && !enemiesLeft;
    const stalemate = crewLeft && enemiesLeft;
    if (won) for (const f of foes) if (f.sourceObstacle) run.neutralized.add(f.sourceObstacle);

    return {
      won: won, stalemate: stalemate, rounds: combat.round,
      casualties: casualties, injured: injured,
      enemies: foes.map((f) => f.name),
      enemiesDown: foes.filter((f) => f.down).length,
      surprise: !!opts.surprise,
      log: combat.log,
    };
  }

  // ── ONE DRAIN LAW, EVERYWHERE ───────────────────────────────────
  // Drain lands on the caster, not the target. Stun normally — they
  // are wrung out, and it clears with rest. PHYSICAL if they
  // overcast, because reaching past what you can hold is an injury,
  // and that is the line the mage chooses to cross or not.
  //
  // It goes on the DOSSIER'S OWN TRACKS. There is no per-run
  // accumulator any more and no invented threshold: a caster drops
  // when their stun track FILLS, which is the same rule a stun baton
  // obeys, and they carry what is left of it into the next mission
  // because an operation is many missions long.
  //
  // Every path bills through here — meatspace verbs, utility casts,
  // the astral's lattice, spirit binding. Four workarounds used to
  // live where this one function does, which is why the same Force-6
  // Stunbolt cost three different things depending on which door the
  // mage cast through, and cost NOTHING on the astral.
  function applyDrain(run, runner, drain) {
    if (!drain || drain.damage <= 0) return drain;
    const hit = MJ.takeDamage(runner, drain.damage, !drain.physical);
    drain.overflowed = hit.overflow;
    if (!hit.down) return drain;
    if (!run) return drain; // no run to fall out of — the caller owns it
    if (!run.downed) run.downed = new Set();
    if (run.downed.has(runner)) return drain;
    run.downed.add(runner);
    drain.dropped = true;
    drain.casualty = resolveTakedown(run, {
      source: runner,
      physical: runner.wounds || 0, physicalMax: MJ.physicalTrack(runner),
      stun: runner.stun || 0, stunMax: MJ.stunTrack(runner),
    });
    return drain;
  }

  // ── Casting a utility spell, ANYWHERE IN MEATSPACE ──────────────
  // The meatspace quick cast: one action, one beat. Invisibility
  // before the corridor, Hush before the shot, Clairvoyance before
  // the corner, Analyze Device at the box in front of you. This is
  // the mage's version of the decker hacking the maglock from the
  // hallway — the deep thread-by-thread cast lives on the astral
  // (the lattice), same rules, different rendering.
  //
  // NOTHING HERE ASSUMES AN OBSTACLE, and that is deliberate. A spell
  // is not a way of answering the thing in front of you; it is
  // something a mage does, and the most valuable moment to do it is
  // BEFORE anyone is looking — Armor and Invisibility go up in the
  // empty corridor, not six feet from the guard, because the threat
  // only lands if something SEES it. Callers that happen to be at an
  // obstacle pass one; callers that are not, do not.
  //
  // `opts.obstacle` the thing being analyzed / the ground being cast
  //                 on. Optional: absent means open ground.
  // `opts.target`   a crew member for the spells that land on people.
  // `opts.force`    the player's Force pick (§14). Defaults to Magic.
  function castUtilitySpell(run, runner, spellId, opts) {
    opts = opts || {};
    const def = MJ.spellDef(spellId);
    if (!def) return { ok: false, error: "no such spell" };
    if (def.combat) return { ok: false, error: "that is thrown at something, not put up" };
    if (run.downed && run.downed.has(runner)) return { ok: false, error: "they are down" };

    const sustainedCount = (run.sustaining || []).filter((s) => s.caster === runner).length;
    const cast = MJ.castSpell(run.rng, runner, spellId, {
      force: opts.force,
      sustainedCount: sustainedCount,
      bonusDice: run.intelBonus + MJ.gearBonusFor(runner, "sorcery"),
    });
    if (!cast.ok) return cast;
    cast.target = opts.target || null;
    applyDrain(run, runner, cast.drain);
    tickTether(run);

    const applied = cast.success ? MJ.applySpellToRun(run, runner, cast) : null;

    // The analyze home: read ONE thing's truth. What it buys is the
    // exact knowledge an attempt normally pays for — the immunities —
    // without the attempt. Recon in a bottle, priced in Drain.
    let learned = null;
    if (cast.success && def.home === "analyze" && opts.obstacle) {
      const ob = opts.obstacle;
      const rightKind = def.analyzes === "sapient" ? !!ob.sapient : !ob.living;
      if (rightKind) {
        learned = [];
        for (const skill of Object.keys(ob.immune || {})) {
          markUseless(run, ob, skill, ob.immune[skill]);
          learned.push(skill);
        }
      }
    }

    // ── WHO, IF ANYONE, IS AROUND TO SEE THIS ───────────────────
    // `opts.prep` is the crew still outside, before the route has
    // been entered: genuinely nobody is there, so nothing can witness
    // it. That must be explicit rather than inferred, because
    // `run.obstacles[run.index]` is the FIRST obstacle from the
    // moment the run is built — a prep cast that fell through to it
    // would have been "seen" by a guard the crew has not walked up to
    // yet, which is precisely the situation pre-casting exists to
    // avoid.
    const here = opts.prep ? null : (opts.obstacle || run.obstacles[run.index]);

    const task = {
      cast: true, spell: spellId, verb: def.label,
      runner: runner.identity.handle,
      prep: !!opts.prep,
      force: cast.force, pool: cast.pool, hits: cast.hits,
      success: cast.success, drain: cast.drain,
      applied: applied, learned: learned,
      result: !cast.success ? def.label + " — the circuit would not hold"
        : learned ? def.label + " — " + (learned.length ? "it will not answer to: " + learned.join(", ") : "nothing is hidden about it")
        : def.label + (applied && applied.sustained ? " — holding it" : ""),
    };

    // Casting is a real act on real ground, and WHAT IT READS AS is
    // the spell's own business: a detection spell is a mage staring a
    // beat too long, while Armor going up is a man watching someone
    // prepare for violence. Both only matter if something SEES it —
    // which is the whole reason to cast in the empty corridor rather
    // than in front of the guard.
    const cls = MJ.spellThreat(def);
    if (here && cls !== MJ.THREAT.NORMAL && castNoticedBy(run, here, runner)) {
      const appliedRead = MJ.witnessAct(run.state, run.day, cls);
      task.read = {
        threatClass: cls, band: appliedRead.band,
        changed: appliedRead.band !== appliedRead.before, awkward: appliedRead.awkward,
      };
      if (appliedRead.tipped) {
        run.engagedAlert = true;
        task.responders = spawnResponders(run).map((o) => o.label + " T" + o.tier);
      }
    }
    if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
    run.tasks.push(task);
    return task;
  }

  // What detection magic has bought the crew, said against what is
  // actually ahead — read live off the route, never cached, so it
  // stays true as obstacles fall.
  function revealedRead(run) {
    if (!run.revealed) return null;
    const ahead = run.obstacles.slice(run.index + 1);
    const out = {};
    if (run.revealed.ground) {
      out.ground = !ahead.length ? "clear ground to the objective"
        : ahead[0].label + " T" + ahead[0].tier +
          (ahead.length > 1 ? ", then " + (ahead.length - 1) + " more" : ", then clear");
    }
    if (run.revealed.life) {
      const living = ahead.filter((o) => o.living);
      out.life = living.length ? living.map((o) => o.label).join(", ") + " breathing ahead" : "nothing breathing ahead";
    }
    if (run.revealed.magic) {
      const astral = ahead.filter((o) => o.projection === "astral");
      out.magic = astral.length ? astral.map((o) => o.label).join(", ") + " on the astral ahead" : "nothing magical ahead";
    }
    return out;
  }

  // A critical glitch lands the same way whoever caused it and
  // however: armor eats it first (reusable this mission), then a
  // patch (consumed), and only then does the wound land. Shared so
  // the extended path cannot drift from the single-roll one.
  function applyCriticalGlitch(run, runner) {
    if (run.armorGuard.get(runner) > 0) {
      run.armorGuard.set(runner, run.armorGuard.get(runner) - 1);
      return "armor";
    }
    const patch = MJ.findConsumable(runner, "absorbWound", null);
    if (patch) {
      MJ.consumeItem(patch);
      return patch.label;
    }
    // A fumble outside a firefight — a bad landing, a hand in the
    // wrong place, a fall down a shaft. One box on the same physical
    // track a bullet fills, and it rides home like any other.
    runner.wounds += 1;
    return null;
  }

  // Advance or abandon an extended approach already under way.
  // `keepGoing` false is the crew deciding the minutes aren't worth
  // it — that costs the attempt but nothing else, and the obstacle
  // is still there to try another way.
  function missionExtendedStep(run, keepGoing) {
    const w = run.extended;
    if (!w) return null;
    const obstacle = run.obstacles[run.index];

    if (!keepGoing) {
      run.extended = null;
      const task = {
        obstacle: obstacle.label, tier: obstacle.tier,
        runner: w.runner.identity.handle, skill: w.test.skillId,
        extended: true, intervals: w.test.intervals,
        hits: w.test.hits, threshold: w.test.threshold,
        success: false, abandoned: true,
        result: "backed off after " + w.test.intervals + " — not worth the minutes",
      };
      run.tasks.push(task);
      if (remainingApproaches(run) === 0) { run.failed = true; run.index += 1; }
      return task;
    }

    MJ.extendedTestStep(run.rng, w.test);
    tickTether(run); // working slowly out there costs the same clock
    // Every interval is time on the clock. If they are already being
    // hunted, standing still working a lock is the worst thing you
    // can do, and the response keeps building while you do it.
    if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
    if (!w.test.done) return null; // still working — caller re-prompts
    return finishExtended(run, w);
  }

  function finishExtended(run, w) {
    const obstacle = run.obstacles[run.index];
    const test = w.test;
    run.extended = null;

    if (test.success && w.act && w.act.def.disables) {
      run.neutralized.add(obstacle);
    }
    if (test.criticalGlitch) {
      applyCriticalGlitch(run, w.runner);
    }

    // The attempt is spent whether or not anybody saw it — otherwise
    // an unwitnessed failure left the approach infinitely retryable,
    // because the attempt was only being counted inside the witness
    // path.
    const tries = countTry(run, obstacle, w.approach);

    const task = {
      obstacle: obstacle.label, tier: obstacle.tier,
      runner: w.runner.identity.handle, skill: test.skillId, verb: w.verb,
      extended: true, intervals: test.intervals,
      hits: test.hits, threshold: test.threshold,
      pool: w.startPool, loud: !!(w.act && w.act.loud),
      success: test.success, glitch: test.glitch, criticalGlitch: test.criticalGlitch,
      exhausted: test.exhausted,
    };

    const read = witnessExtended(run, obstacle, w, test, tries);
    if (read) { task.read = read.read; if (read.responders) task.responders = read.responders; }
    run.tasks.push(task);

    if (test.success) {
      run.index += 1;
    } else if (remainingApproaches(run) === 0) {
      run.failed = true;
      run.index += 1;
    }
    return task;
  }

  // Same rule as a single roll: a clean quiet finish registers
  // nothing, a fumble registers, and something else with eyes on the
  // same ground can see either.
  function witnessExtended(run, obstacle, w, test, tries) {
    if (!wasWitnessed(run, obstacle, w.act, test.success, w.runner)) return null;
    const cls = threatClassFor(w.act && w.act.def, tries);
    if (cls === MJ.THREAT.NORMAL) return null;
    const applied = MJ.witnessAct(run.state, run.day, cls);
    const out = {
      read: {
        threatClass: cls, band: applied.band,
        changed: applied.band !== applied.before, awkward: applied.awkward,
      },
    };
    if (applied.tipped) {
      run.engagedAlert = true;
      out.responders = spawnResponders(run).map((o) => o.label + " T" + o.tier);
    }
    return out;
  }

  // Which verb the caller meant. The prompt hands back a verb id, so
  // that is the primary key; a caller that never had a prompt in
  // front of it (an older probe, a script) can still name a skill and
  // get the best way in that skill fronts. Resolving through the
  // SAME option list the player was shown is what keeps the thing
  // chosen and the thing resolved identical.
  function actFor(run, obstacle, choice) {
    const options = optionsFor(run, obstacle);
    const wanted = choice.approach || choice.verbId;
    let opt = wanted ? options.find((o) => o.verbId === wanted) : null;
    if (!opt && choice.skill) {
      opt = options.find((o) => o.skill === choice.skill && o.available) ||
        options.find((o) => o.skill === choice.skill);
    }
    if (!opt) return null;
    const verb = MJ.verbDef(opt.verbId);
    const runner = choice.runner || opt.runner;
    // The skill is read off the verb and the runner, never taken on
    // trust from the caller — `shoot` is whatever THEY are carrying.
    const skill = runner ? MJ.verbSkill(verb, runner) : opt.skill;
    return {
      option: opt, def: verb, verbId: opt.verbId, verb: opt.verb,
      runner: runner, skill: skill,
      loud: !!verb.loud, lands: opt.lands, why: opt.why,
      // The hidden truth, as opposed to what the crew has learned.
      immune: (obstacle.immune || {})[skill] || null,
      // The world this act happens in — the verb's own pillar.
      plane: MJ.verbPlane(verb, runPlane(run)),
    };
  }

  // An act that was never going to accomplish anything. Two ways to
  // get here and they are different in kind: the thing is the wrong
  // KIND of thing (you talked at a camera), or it carries a Watsonian
  // immunity nothing visible announced (the box is air-gapped). Both
  // cost the beat, both are real acts something can witness, and
  // neither is ever removed from the menu — the second one is what
  // the crew was buying with the attempt.
  function resolveIneffective(run, obstacle, act) {
    const tries = countTry(run, obstacle, act.verbId);
    if (act.immune) markUseless(run, obstacle, act.skill, act.immune);
    const why = act.immune || act.why || "it does nothing to this";
    const task = {
      obstacle: obstacle.label, tier: obstacle.tier,
      runner: act.runner ? act.runner.identity.handle : null,
      skill: act.skill, verb: act.verb, pool: 0,
      loud: act.loud, success: false, ineffective: true,
      rejected: why,
      result: act.verb + " — " + why,
    };
    // Nothing was rolled, but something was still DONE, and doing
    // something pointless in front of a camera is doing something in
    // front of a camera.
    if (wasWitnessed(run, obstacle, act, false, act.runner)) {
      const cls = threatClassFor(act.def, tries);
      if (cls !== MJ.THREAT.NORMAL) {
        const applied = MJ.witnessAct(run.state, run.day, cls);
        task.read = {
          threatClass: cls, band: applied.band,
          changed: applied.band !== applied.before, awkward: applied.awkward,
        };
        if (applied.tipped) {
          run.engagedAlert = true;
          task.responders = spawnResponders(run).map((o) => o.label + " T" + o.tier);
        }
      }
    }
    if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
    run.tasks.push(task);
    if (remainingApproaches(run) === 0) { run.failed = true; run.index += 1; }
    return task;
  }

  // ── Force against something that cannot fight back ─────────────
  // A door, a camera, a ward, a wall of barrier ICE. Not a skill
  // check — the three-gate chain, so the question is never "did you
  // try hard enough" but "does what you are holding get through what
  // it is made of." A pistol sparks off a hardened door forever; a
  // rifle, a Force-6 blast or a breaching charge opens it in two
  // swings. That is what makes brute force always AVAILABLE without
  // making it always work.
  function forceThrough(run, obstacle, act, drain) {
    const runner = act.runner;
    const force = forceProfileFor(runner, act.def, { force: run.castForce, spellId: run.castSpellId });
    const pool = MJ.dicePoolFor(runner, act.skill, run.intelBonus +
      MJ.gearBonusFor(runner, act.skill) + suppressionBonus(run.site, obstacle.projection, run.day) +
      spellPoolMods(run, runner, act.skill));
    // How much this thing has taken THIS RUN — held here, keyed by
    // the object, exactly like tries and discoveries. The site's own
    // walls are never written to.
    const hit = MJ.forceAgainstThing(run.rng, {
      pool: pool, weapon: force.profile, quality: force.quality,
      strength: force.strength, carried: run.damaged.get(obstacle) || 0,
    }, obstacle);
    run.damaged.set(obstacle, hit.damageTotal);

    run.anyLoud = true;
    const tries = countTry(run, obstacle, act.verbId);
    tickTether(run);
    // Through it — but through is not always gone. A mana barrier
    // knits closed behind the hole you made, so the crew passes and
    // the wall stays standing. Anything else that comes apart, stays
    // apart for the rest of the run.
    if (hit.destroyed && !obstacle.repairs) run.neutralized.add(obstacle);
    // What bounced once bounces forever. That is a fact about the
    // wall, not a counter about the crew, so it is filed the same way
    // any other Watsonian discovery is — against the skill, learned by
    // trying, and marked rather than deleted.
    if (hit.hit && !hit.penetrated) {
      markUseless(run, obstacle, act.skill,
        "bounces off — " + force.profile.label + " at Power " + hit.power +
        " against Armour " + hit.armour);
    }

    const task = {
      obstacle: obstacle.label, tier: obstacle.tier,
      runner: runner.identity.handle, skill: act.skill, verb: act.verb,
      pool: pool, loud: true, force: true, weapon: force.profile.label,
      // A mage who throws Force at a wall pays for it exactly like a
      // mage who throws it at a person. The bill was taken before we
      // got here; this is it showing up on the line that earned it.
      drain: drain || null,
      power: hit.power, armour: hit.armour,
      penetrated: hit.penetrated, damage: hit.damage,
      damageTotal: hit.damageTotal, structure: hit.structure,
      success: hit.destroyed,
      result: !hit.hit ? "missed it entirely"
        : !hit.penetrated ? "bounced — Power " + hit.power + " against Armour " + hit.armour
        : hit.destroyed ? (obstacle.repairs
            ? "a hole, and through it — " + obstacle.label + " is already knitting closed"
            : "through it — " + obstacle.label + " is off the board")
        : "hurt it — " + hit.damageTotal + " of " + hit.structure,
    };

    // Loud is witnessed no matter what: a shot is a shot whether or
    // not it did anything.
    const cls = threatClassFor(act.def, tries);
    const applied = MJ.witnessAct(run.state, run.day, cls);
    task.read = {
      threatClass: cls, band: applied.band,
      changed: applied.band !== applied.before, awkward: applied.awkward,
    };
    if (applied.tipped) {
      run.engagedAlert = true;
      task.responders = spawnResponders(run).map((o) => o.label + " T" + o.tier);
    }
    if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
    run.tasks.push(task);

    if (hit.destroyed) run.index += 1;
    else if (remainingApproaches(run) === 0) { run.failed = true; run.index += 1; }
    return task;
  }

  function missionChoose(run, choice) {
    if (missionDone(run)) return null;
    if (run.extended) return missionExtendedStep(run, choice !== null);
    const obstacle = run.obstacles[run.index];
    if (!choice) {
      run.failed = true;
      run.anyLoud = true;
      // Say WHAT was missing. "Stalled" teaches nothing; "nobody here
      // has demolitions, and that door wants it" is the next hire.
      const gap = blockingGap(run);
      const task = {
        obstacle: obstacle.label, tier: obstacle.tier, gap: gap,
        result: gap ? "no way through — " + describeGap(gap) : "no usable approach — stalled",
      };
      run.tasks.push(task);
      run.index += 1;
      return task;
    }
    const act = actFor(run, obstacle, choice);
    // The caller named something this thing has no verb for at all.
    // Not a stall — just nothing to resolve.
    if (!act) return null;
    const runner = act.runner;
    const skill = act.skill;

    // Magic asks a question no other approach does: how hard are you
    // pushing? Force adds dice to the casting AND raises the Drain
    // that comes back, so a mage who reaches for a big result is
    // deliberately risking dropping themselves. Default is a safe
    // cast at their own Magic; the popup can offer more.
    //
    // WHICH ACTS OWE DRAIN IS THE VERB'S OWN BUSINESS, not the
    // plane's. Spellcasting, summoning and banishing bill the caster;
    // ASSENSING DOES NOT — it is perception, not sorcery, and
    // charging a mage for looking at something is not a rule that
    // exists in the source. Keying this off "is it astral" billed
    // every read of an aura as if it were a spell.
    let drain = null;
    if (runner && act.def.drains && (runner.attributes.magic || 0) > 0) {
      const force = Math.max(1, Math.min(MJ.maxForceFor(runner),
        choice.force || runner.attributes.magic));
      // A verb fronting a REAL SPELL bills that spell's printed
      // Drain — Force plus its modifier, min 2 — which is the canon
      // pricing that makes Punch nearly free and area spells brutal.
      // The astral's own verbs (unwind, banish) keep the generic
      // curve; they are not spellcasting.
      //
      // `choice.spellId` is the player naming WHICH spell from the
      // submenu — honoured when the dossier actually holds it,
      // otherwise the verb's own derivation stands.
      const chosen = choice.spellId && MJ.knowsSpell(runner, choice.spellId) ? choice.spellId : null;
      const spellId = chosen || act.def.spellId ||
        (act.def.spellShape && (MJ.bestSpellOfShape(runner, act.def.spellShape) || {}).id) ||
        ((act.verbId === "castCommand" || act.verbId === "blast") &&
          ((act.verbId === "castCommand" ? MJ.bestCommandSpell(runner) : MJ.bestCombatSpell(runner)) || {}).id) || null;
      const spellDef = spellId && MJ.spellDef(spellId);
      drain = MJ.resistDrain(run.rng, runner, force,
        spellDef ? { drainValue: MJ.drainValueOf(spellDef, force) } : undefined);
      run.castForce = force;
      run.castSpellId = spellId; // so forceThrough throws THIS spell
      applyDrain(run, runner, drain);
    }

    // Gate 2 said no, or this thing is quietly immune to that skill.
    // Still attemptable, still on the menu — it simply does nothing,
    // and now the crew knows.
    if (!act.lands || act.immune) return resolveIneffective(run, obstacle, act);
    // Nobody on their feet can front it at all. Not an act, not a
    // beat — there is nothing to resolve.
    if (!runner && !act.option.noRoll) return null;

    // A violent approach against something that can fight back opens
    // COMBAT rather than resolving as one roll. You never run out of
    // the ability to shoot; you are limited by what shooting costs,
    // and the cost is the exchange itself plus everything it summons.
    if (act.def.damaging && obstacle.fights) {
      // Undetected when the shooting starts = the ambush. Once they
      // already read you as threatening there is no surprise to have.
      const band = MJ.threatBand(run.state, run.day);
      const surprise = band === "normal" && !MJ.alertEngaged(run.state);
      // Combat forces turn-based in every pillar, and hands the
      // player's own choice back when the shooting stops.
      MJ.enterCombat(run.tempo);
      const fight = runCombat(run, obstacle, { surprise: surprise });
      MJ.exitCombat(run.tempo);

      run.anyLoud = true;
      countTry(run, obstacle, act.verbId);

      const task = {
        obstacle: obstacle.label, tier: obstacle.tier,
        runner: runner.identity.handle, skill: skill, verb: act.verb,
        combat: true, surprise: fight.surprise, rounds: fight.rounds,
        enemies: fight.enemies, enemiesDown: fight.enemiesDown,
        casualties: fight.casualties, injured: fight.injured, loud: true,
        stalemate: fight.stalemate,
        // The blow-by-blow. A fight the player cannot watch is a fight
        // they have to take on trust, and "did that actually resolve
        // or did it flip a coin" is a fair question to be able to
        // answer from the screen.
        log: fight.log,
        success: fight.won,
      };

      // Gunfire is witnessed no matter what — loud is the one thing
      // success cannot hide.
      const applied = MJ.witnessAct(run.state, run.day, MJ.THREAT.THREATENING);
      task.read = {
        threatClass: MJ.THREAT.THREATENING, band: applied.band,
        changed: applied.band !== applied.before, awkward: applied.awkward,
      };
      if (applied.tipped) {
        run.engagedAlert = true;
        task.responders = spawnResponders(run).map((o) => o.label + " T" + o.tier);
      }
      if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
      run.tasks.push(task);

      if (fight.won) { run.index += 1; return task; }
      // Broke off but still standing: the obstacle is untouched and
      // they can try another way, if they have one left.
      if (fight.stalemate) {
        if (remainingApproaches(run) === 0) { run.failed = true; run.index += 1; }
        return task;
      }
      // Everyone is down. Nobody is walking any further.
      run.failed = true;
      run.aborted = true;
      return task;
    }

    // Force against something that cannot fight back is not a check
    // either — it is the three-gate chain against armour and
    // structure, and it is the reason kicking a hardened door is
    // always offered and never works.
    if (act.def.damaging) return forceThrough(run, obstacle, act, drain);

    // An extended approach opens a piece of WORK rather than taking a
    // swing. The first interval rolls immediately so the player has
    // something to judge, then the run parks in that state and every
    // subsequent prompt asks the only question that matters: another
    // interval, or cut losses?
    if (act.def.extended) {
      const startPool = MJ.dicePoolFor(runner, skill, run.intelBonus +
        MJ.gearBonusFor(runner, skill) + suppressionBonus(run.site, obstacle.projection, run.day) +
        spellPoolMods(run, runner, skill));
      run.extended = {
        runner: runner, verb: act.verb, act: act,
        approach: act.verbId, startPool: startPool,
        test: MJ.beginExtendedTest(runner, skill, extendedThreshold(obstacle.tier), {}),
      };
      run.extended.test.pool = startPool; // gear/intel/suppression all count
      return missionExtendedStep(run, true);
    }

    // The no-roll approach: nobody tests anything, it just costs the
    // beat. It still counts as an act, so a normal-class route-around
    // reads as nothing while a louder one would still be seen.
    if (!skill) {
      const noRollTries = countTry(run, obstacle, act.verbId);
      const task = {
        obstacle: obstacle.label, tier: obstacle.tier,
        verb: act.verb, success: true, result: act.verb,
      };
      // Nothing was rolled, so nothing was fumbled — a no-roll
      // approach can only be seen by being loud.
      if (wasWitnessed(run, obstacle, act, true, null)) {
        const cls = threatClassFor(act.def, noRollTries);
        if (cls !== MJ.THREAT.NORMAL) {
          const applied = MJ.witnessAct(run.state, run.day, cls);
          task.read = { threatClass: cls, band: applied.band };
          if (applied.tipped) {
            run.engagedAlert = true;
            task.responders = spawnResponders(run).map((o) => o.label + " T" + o.tier);
          }
        }
      }
      if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
      run.tasks.push(task);
      run.index += 1;
      return task;
    }
    // Boost consumables: burned for this roll, then gone.
    let boostDice = 0;
    let boostLabel = null;
    const boostItem = MJ.findConsumable(runner, "boost", skill);
    if (boostItem) {
      boostDice = MJ.gearBonusForTier(boostItem.tier);
      boostLabel = boostItem.label;
      MJ.consumeItem(boostItem);
    }
    const outcome = MJ.resolveTask(run.rng, runner, obstacle, skill, {
      verb: act.verb, loud: act.loud,
      bonusDice: run.intelBonus + MJ.gearBonusFor(runner, skill) + boostDice +
        suppressionBonus(run.site, obstacle.projection, run.day) +
        spellPoolMods(run, runner, skill),
    });
    if (act.loud) run.anyLoud = true;
    if (outcome.glitch) run.anyGlitch = true;
    let guarded = null;
    if (outcome.criticalGlitch) guarded = applyCriticalGlitch(run, runner);
    // Anything that removes a set of eyes has to do so BEFORE the
    // witness check, or the thing you just took down gets a vote.
    // `disables` is a property of the VERB: putting a guard on the
    // floor stops him having opinions, slipping past him does not.
    if (outcome.success && act.def.disables) {
      run.neutralized.add(obstacle);
    }
    // Every exchange out there is time on the tether.
    tickTether(run);

    // What did that reveal, and did anything see it?
    const tries = countTry(run, obstacle, act.verbId);
    let read = null;
    let tipped = false;
    if (wasWitnessed(run, obstacle, act, outcome.success, runner)) {
      const cls = threatClassFor(act.def, tries);
      if (cls !== MJ.THREAT.NORMAL) {
        const applied = MJ.witnessAct(run.state, run.day, cls);
        read = {
          threatClass: cls, band: applied.band,
          changed: applied.band !== applied.before,
          awkward: applied.awkward,
        };
        tipped = applied.tipped;
        if (applied.band === "threatening") run.engagedAlert = true;
      }
    }
    // Exceptional success buys headroom back — the thoroughly
    // bamboozled guard who decides you are fine, actually.
    if (outcome.success && outcome.margin >= EXCEPTIONAL_MARGIN && !tipped) {
      MJ.grantHeadroom(run.state, run.day, 1);
    }
    // While they are actively responding, every beat you survive
    // buys them the next one.
    if (MJ.alertEngaged(run.state)) {
      MJ.addAlertPointsAll(run.state, ALERT_POINTS_PER_BEAT);
    }

    const task = {
      obstacle: obstacle.label, tier: obstacle.tier,
      runner: runner.identity.handle, skill: skill, verb: act.verb,
      pool: outcome.poolSize,
      loud: act.loud, hits: outcome.hits, threshold: outcome.threshold,
      success: outcome.success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch,
      boosted: boostLabel, guarded: guarded,
      read: read, tipped: tipped,
      drain: drain,
    };
    run.tasks.push(task);

    // Tipping over brings the response into the corridor with you.
    if (tipped) {
      const spawned = spawnResponders(run);
      task.responders = spawned.map((o) => o.label + " T" + o.tier);
    }

    // A failed approach is not a failed obstacle. The guard who told
    // you to get lost is exactly as sneak-past-able as he was — so
    // stay here and pick another way. Only running out of ways
    // actually stops the crew.
    if (outcome.success) {
      run.index += 1;
    } else if (remainingApproaches(run) === 0) {
      run.failed = true;
      run.index += 1;
    }
    return task;
  }

  // How many ways of getting past THIS obstacle the crew still has.
  // Read off the SAME option list the player is shown, so a crew can
  // never be declared out of options with a live one still sitting on
  // the screen — nor be kept alive by a dead one.
  function remainingApproaches(run) {
    const obstacle = run.obstacles[run.index];
    if (!obstacle) return 0;
    return optionsFor(run, obstacle).filter((o) => o.available).length;
  }

  // Walk away. The mission fails, but nothing else gets rolled — no
  // further wounds, no further noise. "Is it worth another swing"
  // is the decision this exists to make real.
  // ── Why the crew could not proceed ─────────────────────────────
  // A withdrawal is not only "half of us are down." It is just as
  // often "that door is rated past anything we can pick, and nobody
  // here carries explosives." That verdict is INTEL — it names the
  // specialist this operation needs — so it goes on the record
  // instead of vanishing into a generic failure.
  function blockingGap(run) {
    const obstacle = run.obstacles && run.obstacles[run.index];
    if (!obstacle) return null;
    const upright = run.runners.filter((r) => !run.downed || !run.downed.has(r));
    const eff = upright.map((r) => MJ.getEffectiveSkills(r));
    const missing = [];   // nobody trained at all
    const outclassed = []; // trained, but the rating is beyond them
    // Only ways that would WORK here are worth naming as the next
    // hire. Hiring a face because the camera has no opinion to change
    // would be a lesson worse than no lesson.
    for (const act of MJ.actsFor(obstacle)) {
      const skill = act.def.skill;
      if (!skill || !act.effective) continue;
      if (knownUseless(run, obstacle, skill)) continue;
      // ── A SPELL VERB IS NOT A SKILL GAP ──────────────────────────
      // Spell verbs are gated on the GRIMOIRE, not the skill, so
      // counting them by `def.skill` taught two wrong lessons: a
      // crew with no mage was told to hire "sorcery" — any mage will
      // do — when what the guard needs is a mage who knows an attack
      // spell; and a mage with the wrong book (all Heal, no bolts)
      // had sorcery ranks, so the gap vanished and the stall taught
      // nothing at all.
      if (act.def.carries) {
        if (upright.some((r) => act.def.carries(r))) continue; // somebody can — no gap
        const want = act.def.spellShape || act.def.spellId ? "a spell that answers this" : null;
        if (want && missing.indexOf(want) === -1) missing.push(want);
        continue;
      }
      let bestRank = 0;
      for (const skills of eff) bestRank = Math.max(bestRank, skills[skill] || 0);
      // One thing can offer the same skill twice (a guard can be
      // slipped past OR put down quietly, both stealth), and naming
      // it twice reads as a bug.
      if (bestRank <= 0) { if (missing.indexOf(skill) === -1) missing.push(skill); }
      else if (bestRank < Math.ceil(obstacle.tier / 2)) {
        const note = skill + " " + bestRank;
        if (outclassed.indexOf(note) === -1) outclassed.push(note);
      }
    }
    if (!missing.length && !outclassed.length) return null;
    return {
      obstacle: obstacle.label, tier: obstacle.tier,
      needs: missing, outclassed: outclassed,
    };
  }

  // Phrased as the next hire, because that is what it is worth.
  // Three names is enough to act on; the full list of everything the
  // crew lacks is noise.
  function describeGap(gap) {
    if (!gap) return "";
    if (gap.needs.length) {
      const shown = gap.needs.slice(0, 3).join(", ");
      const extra = gap.needs.length - 3;
      const more = extra > 0 ? ", or " + extra + " other way" + (extra === 1 ? "" : "s") + " in" : "";
      return gap.obstacle + " T" + gap.tier + " needs " + shown + more +
        " — this crew has none of it";
    }
    return gap.obstacle + " T" + gap.tier + " is rated past this crew (best: " +
      gap.outclassed.slice(0, 3).join(", ") + ")";
  }

  function missionAbort(run) {
    if (run.aborted) return run;
    run.aborted = true;
    run.failed = true;
    const gap = blockingGap(run);
    run.gap = gap;
    run.tasks.push({
      obstacle: gap ? gap.obstacle : "—", tier: gap ? gap.tier : 0,
      gap: gap,
      result: gap ? "withdrew — " + describeGap(gap) : "withdrew — the crew pulled out",
    });
    return run;
  }

  // ══════════════════════════════════════════════════════════════
  //  AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.
  //
  //  This is a HARNESS. It exists so the systems can be built and
  //  probed without a human clicking through every obstacle — 94,000
  //  assertions and 360 simulated days do not click — and it doubles
  //  as the player's skip button once they are in the chair.
  //
  //  THE PLAYER CONTROLS WHAT HAPPENS DURING MISSIONS. Stance,
  //  method, mode, which approach, how much Force, press or withdraw
  //  — action by action, runner by runner. missionPrompt and
  //  missionChoose are that seat. Everything below is a robot sitting
  //  in it while the seat is being built.
  //
  //  So: NEVER read this function to learn how the game plays. Its
  //  choices are a stand-in for a player, not a statement about the
  //  design, and describing the game by describing this has already
  //  gone wrong more than once. See UNDERSTANDING.md §1, §14, §15.
  // ══════════════════════════════════════════════════════════════
  // ── Quick resolve: the stepper, driven by the auto-chooser ──────
  // The auto-chooser only sees what the crew still actually has:
  // untried-or-unexhausted approaches nobody has discovered to be
  // useless here. Quiet beats loud, then the biggest pool. This is
  // the house playing your hand for you — the same seat the popup
  // hands to the player, and deliberately the same stepper.
  // How many fruitless swings the house takes at one obstacle before
  // calling it. Violence has no attempt budget — a crew never runs
  // out of the ability to shoot — so the thing that used to end a
  // hopeless obstacle no longer does. That is correct for a PLAYER,
  // who can see it going badly and choose to withdraw; the
  // auto-chooser needs the same judgement written down. It stands in
  // for a player's patience, which is a policy, not a rule of the
  // world, and it lives here rather than in the mechanics for
  // exactly that reason.
  const AUTO_PATIENCE = 4;

  function autoResolve(run) {
    let guard = 0;
    let swings = 0;
    let atObstacle = -1;
    while (!missionDone(run) && guard++ < 500) {
      if (run.index !== atObstacle) { atObstacle = run.index; swings = 0; }
      const prompt = missionPrompt(run);
      // Mid-extended-work, the house keeps going. The test ends
      // itself when the pool runs dry or somebody fumbles, so this
      // terminates on its own — it does not need a patience rule.
      if (prompt.extended) { missionExtendedStep(run, true); continue; }
      const usable = prompt.options.filter((o) => o.available);
      let best = null;
      for (const o of usable) {
        if (!best) best = o;
        else if (best.loud && !o.loud) best = o;
        else if (best.loud === o.loud && o.pool > best.pool) best = o;
      }
      // Out of patience on this one: the only thing left is to keep
      // making noise at it, and that has not been working.
      if (best && best.loud && swings >= AUTO_PATIENCE) {
        missionAbort(run);
        break;
      }
      swings += 1;
      missionChoose(run, best ? { skill: best.skill, runner: best.runner, approach: best.approach } : null);
    }
    return run;
  }

  function resolveSiteMission(rng, mission, runners, day) {
    return finishMission(rng, autoResolve(beginMission(rng, mission, runners, day)));
  }

  function finishMission(rng, run) {
    const site = run.site;
    const kind = run.kind;
    const mission = run.mission;
    const runners = run.runners;
    const day = run.day;
    const state = run.state;
    const start = run.start;
    const obstacles = run.obstacles;
    const tasks = run.tasks;
    const anyLoud = run.anyLoud;
    const anyGlitch = run.anyGlitch;
    const failed = run.failed;

    const success = !failed;
    // Placeholder noise model: the site hears any loud approach, or
    // a failure of any kind; glitches add noise on top. A clean,
    // all-quiet success lands zero Alert — the ghost run.
    // The incident settles: wherever the response ended up becomes
    // the site's new standing posture. Trip them and pull out and
    // nothing ratchets — Alert never rose above where it started.
    const incident = run.engagedAlert
      ? MJ.settleIncident(state)
      : { ratcheted: false, maxGrew: false, movedAxes: [] };
    const band = MJ.threatBand(state, day);

    // What the crew saw goes on the site's record. Interaction alone
    // no longer CONFIRMS anything — see securityRead: a floor is free
    // and a ceiling has to be earned by patience. A recon sweep is
    // still the exception, because looking is the entire job.
    // A completed leg confirms what it walked through. The crew was
    // there and met the place's own security; responders are excluded
    // because a squad that turned up because of the noise says nothing
    // about what the site normally fields.
    const confirmedAxes = new Set(
      obstacles.slice(0, run.index).filter(isStanding).map((o) => o.projection));
    // A recon sweep is the exception: LOOKING is the whole job, so it
    // confirms its own lens on the strength of having gone and looked.
    if (kind === "recon" && (success || obstacles.length > 0)) confirmedAxes.add(mission.lens);
    for (const axis of confirmedAxes) {
      if (axis !== "physical" && axis !== "astral" && axis !== "matrix") continue;
      site.intel[axis] = {
        snapshot: {
          security: { physical: start.physical, astral: start.astral, matrix: start.matrix },
          band: band,
          obstaclesSeen: tasks.map((t) => t.obstacle),
        },
        dayTaken: day,
      };
    }

    let karmaAward = 0;
    let suppression = null;
    if (success) {
      if (kind === "recon") {
        karmaAward = Math.max(1, Math.round(RECON_KARMA_PER_SECURITY * start[mission.lens]));
      } else {
        const avg = (start.physical + start.astral + start.matrix) / 3;
        karmaAward = Math.max(1, Math.round(KARMA_PER_SECURITY * avg));
      }
      for (const runner of runners) MJ.growRunner(runner, karmaAward, rng);
      mission.resolved = true;
      mission.karmaAward = karmaAward;
      // The win softens the target for the rest of the day.
      const axis = suppressionAxisFor(kind, mission);
      suppression = { axis: axis, level: applySuppression(site, axis, day) };
    }

    const result = {
      kind: kind, success: success, karmaAward: karmaAward,
      // How far the crew actually got — not how long the route grew.
      // Responders splice in ahead of them, so obstacles.length
      // counts things they may never have reached, and withdrawing
      // stops the count where they stopped.
      obstaclesFaced: run.index, tasks: tasks,
      intelBonusApplied: run.intelBonus > 0,
      suppression: suppression, aborted: run.aborted,
      threatBand: band, incident: incident, forcedResponse: run.engagedAlert,
      walkedIntoResponse: run.walkedIntoResponse || null,
    };
    // The Matrix's second payday. §05: "the run's real profit is
    // often the data, not the pay" — and it is capped by the deck
    // you brought, so storage is the difference between getting paid
    // and getting rich.
    if (kind === "matrixRun") {
      result.hostPath = (run.hostRoute && run.hostRoute.path) || [];
      if (success) {
        const haul = haulData(run);
        if (haul) result.dataHaul = haul;
      }
    }
    if (success && kind === "resourceGathering") {
      // Draw from the site's own probability chart (§09: the loot
      // table is as canonical as the walls — same name, same odds).
      const table = site.lootTable;
      if (table) {
        // You come back with what you went looking for — but HOW MUCH
        // is the place's business, not yours. The loot table's weights
        // already encode how rich this address is in each kind
        // (orientation drives them), so asking for reagents at a scrap
        // yard finds reagents, just not many.
        const sought = mission.wants
          ? table.entries.find((e) => String(e.kind) === mission.wants) : null;
        const entry = sought
          || rng.weighted(table.entries.map((e) => ({ item: e, weight: e.weight })));
        const richest = table.entries.reduce((m, e) => Math.max(m, e.weight), 1);
        const share = sought ? sought.weight / richest : 1;
        result.yield = {
          kind: entry.kind,
          amount: Math.max(1, Math.round(rng.int(1, entry.amountMax) * share)),
        };
        if (rng.chance(table.itemDropChance)) {
          const pool = Object.keys(MJ.ITEM_TEMPLATES).filter((id) =>
            ["weapon", "gear", "consumable", "program", "focus"].indexOf(MJ.ITEM_TEMPLATES[id].category) !== -1);
          result.bonusItem = MJ.makeItem(rng.pick(pool));
        }
      } else {
        const kindTag = (site.tags.find((t) => String(t.tag).startsWith("resource:")) || {}).tag;
        result.yield = { kind: kindTag || "resource:generic", amount: 1 + Math.max(0, Math.round(start.astral / 3)) };
      }
    }
    return result;
  }

  // ── Crafting resolution: a pseudo-task at the hub ───────────────
  const CRAFTING_SKILLS = ["computer", "electronics", "rigging", "enchanting", "medicine"];

  function resolveCraftingMission(rng, mission, runners) {
    // Template mode crafts a REAL armory item: the template dictates
    // the trade skill and the difficulty tier, and success yields an
    // instance (the integration layer stores it). Legacy mode keeps
    // the old best-of-trades generic exercise for the bench.
    const template = mission.templateId ? MJ.ITEM_TEMPLATES[mission.templateId] : null;
    const skills = template ? [template.craftSkill] : CRAFTING_SKILLS;
    let bestRunner = runners[0];
    let bestSkill = skills[0];
    let bestPool = -1;
    for (const runner of runners) {
      const eff = MJ.getEffectiveSkills(runner);
      for (const skill of skills) {
        const pool = (eff[skill] || 0) + MJ.gearBonusFor(runner, skill);
        if (pool > bestPool) {
          bestPool = pool;
          bestRunner = runner;
          bestSkill = skill;
        }
      }
    }
    const tier = template ? template.tier : (mission.itemTier || DEFAULT_CRAFT_TIER);
    // Bench work is a plain check against a difficulty — there is no
    // thing at an encounter point, so there are no verbs to cross.
    const outcome = MJ.resolveTask(rng, bestRunner, { tier: tier }, bestSkill,
      { verb: "craft", bonusDice: MJ.gearBonusFor(bestRunner, bestSkill) });
    const success = outcome.success;
    let karmaAward = 0;
    if (success) {
      karmaAward = Math.max(1, Math.round(SUPPORT_KARMA_RATE * tier)); // scales with the item, below the fieldwork rate
      for (const runner of runners) MJ.growRunner(runner, karmaAward, rng);
      mission.resolved = true;
      mission.karmaAward = karmaAward;
    }
    const label = template ? `${template.label} (T${tier})` : `item T${tier}`;
    return {
      kind: "crafting", success: success, karmaAward: karmaAward,
      tasks: [{ obstacle: `workbench — ${label}`, tier: tier, runner: bestRunner.identity.handle, skill: bestSkill, pool: outcome.poolSize, hits: outcome.hits, threshold: outcome.threshold, success: success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch }],
      // A crafted item is never merely equal to the shop's. Quality
      // starts at 1 and rises with the margin, so a great crafter
      // makes a genuinely better thing — which is what makes keeping
      // a specialist at the bench worth a roster slot, and what makes
      // building a new deck for a decker who already owns the best
      // one on the market a sensible use of days.
      yield: success
        ? (template
          ? { item: MJ.markCrafted(MJ.makeItem(mission.templateId), MJ.craftQualityFromMargin(outcome.margin), rng) }
          : { kind: "craftedItem", amount: 1 })
        : undefined,
    };
  }

  // ── Medicae resolution: the medic's mission, the patient's day ──
  // Case severity = wounds + the patient's spent Essence (§03:
  // therapy is penalized by Essence loss — chromed bodies are hard
  // to heal). Success removes one wound; the medic earns support
  // Karma scaled to the case.
  const MEDICAL_SKILLS = ["medicine", "sorcery"]; // street doc / healer-mage

  function resolveMedicalMission(rng, mission, runners) {
    const patient = mission.patient;
    if (!patient || patient.wounds <= 0) {
      return { kind: "medical", success: false, error: "no wounds to treat", tasks: [], karmaAward: 0 };
    }
    let bestRunner = runners[0];
    let bestSkill = MEDICAL_SKILLS[0];
    let bestPool = -1;
    for (const runner of runners) {
      const eff = MJ.getEffectiveSkills(runner);
      for (const skill of MEDICAL_SKILLS) {
        const pool = (eff[skill] || 0) + MJ.gearBonusFor(runner, skill);
        if (pool > bestPool) {
          bestPool = pool;
          bestRunner = runner;
          bestSkill = skill;
        }
      }
    }
    // How hard the case is, on the same 1-10 tier scale everything
    // else in the game uses. Wounds are BOXES — a full physical
    // track is ten or twelve of them — so a box is half a tier, and
    // the worst injury a body can hold is a hard case rather than
    // automatically the hardest thing in the world. Chrome
    // complicates surgery on top of that: every point of Essence
    // already spent is another system that has to be worked around.
    const essenceSpent = Math.max(0, patient.essence.max - patient.essence.current);
    const tier = Math.max(1, Math.min(10,
      Math.ceil(patient.wounds / 2) + Math.floor(essenceSpent)));
    const outcome = MJ.resolveTask(rng, bestRunner, { tier: tier }, bestSkill,
      { verb: "treat", bonusDice: MJ.gearBonusFor(bestRunner, bestSkill) });
    let karmaAward = 0;
    let healed = 0;
    if (outcome.success) {
      // A good medic closes more than one box. Boxes healed = the
      // threshold they had to clear plus every hit beyond it, so a
      // hard case in skilled hands still moves, and the same session
      // in poor hands barely does. Physical damage is the only kind
      // that survives the trip home, so it is the only kind treated.
      healed = Math.min(patient.wounds, 1 + (outcome.margin || 0));
      patient.wounds -= healed;
      karmaAward = Math.max(1, Math.round(SUPPORT_KARMA_RATE * tier));
      for (const runner of runners) MJ.growRunner(runner, karmaAward, rng);
      mission.resolved = true;
      mission.karmaAward = karmaAward;
    }
    return {
      kind: "medical", success: outcome.success, karmaAward: karmaAward,
      patient: patient.identity.handle, woundsNow: patient.wounds, healed: healed,
      tasks: [{ obstacle: `treatment (case T${tier})`, tier: tier, runner: bestRunner.identity.handle, skill: bestSkill, hits: outcome.hits, threshold: outcome.threshold, success: outcome.success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch }],
    };
  }

  // ── What the player knows about a site ──────────────────────────
  // Estimated: the handed-to-player numbers (true 1-10 form, only
  // ESTIMATE_ACCURACY of them actually right — the same perception
  // clients price off, §06). Confirmed: recon's day-stamped actuals,
  // per lens, stale past INTEL_FRESH_DAYS. A lens only ever
  // confirms its own axis.
  function siteIntelView(site, day) {
    const view = {};
    for (const axis of ["physical", "astral", "matrix"]) {
      // A site with no rolled estimate yet falls back to its public
      // profile ceiling — shouldn't happen once every entry path
      // (job introduction, discovery) rolls one, but never crash.
      view[axis] = {
        estimated: site.estimatedSecurity ? site.estimatedSecurity[axis] : site.security[axis],
        confirmed: null,
      };
    }
    for (const [lens, entry] of Object.entries(site.intel || {})) {
      if (!view[lens] || !entry.snapshot || !entry.snapshot.security) continue;
      view[lens].confirmed = {
        value: entry.snapshot.security[lens],
        dayTaken: entry.dayTaken,
        fresh: day >= entry.dayTaken && day - entry.dayTaken <= INTEL_FRESH_DAYS,
      };
    }
    return view;
  }

  // ── The action period: one day, one queue, resolved in order ────
  // dispatches: [ { mission, runners: [...] } ], in the player's
  // chosen order. Each runner acts at most once per period; a
  // runner already used (or not under contract) is dropped from
  // the crew, and a dispatch with no crew left fails without
  // rolling anything. Every dispatched runner's contract is
  // consumed at dispatch time, success or fail.
  // ── Opening a dispatch: everything that happens before the dice ──
  // Validation, the chain gate, and contract consumption — the costs
  // a dispatch incurs simply by being attempted. Returns either a
  // finished `result` (nothing for a player to decide) or a live
  // `run` for the caller to step. runActionPeriod drives that run
  // with the auto-chooser; the popup drives it with a person. Both
  // reach the dice through exactly this path, so the interactive
  // game cannot drift from the simulation it was proven in.
  function openDispatch(rng, d, day, acted) {
    const kind = missionKind(d.mission);
    const refuse = (error) => ({ kind: kind, done: true, result: { kind: kind, success: false, error: error, tasks: [], karmaAward: 0 } });

    // Chain gate (§06): some contracts only work in order —
    // "acquire the item, deliver it, plug it in." A gated leg
    // can't be dispatched until its prerequisite resolves, and a
    // refused dispatch costs nothing: no actions, no contracts.
    if (d.mission.requiresMission && !d.mission.requiresMission.resolved) {
      return refuse("gated — prerequisite mission not yet complete");
    }
    const crew = (d.runners || []).filter((r) => isDispatchable(r) && !acted.has(r));
    if (crew.length === 0) {
      return refuse("no dispatchable crew (uncontracted, KIA, or already acted this period)");
    }
    // A treatment session occupies the patient for the period —
    // no action, no contract, but they can't also be somewhere
    // else today (and the medic can't operate on themselves).
    if (kind === "medical") {
      const patient = d.mission.patient;
      if (!patient || !patient.market.hired || acted.has(patient) || crew.includes(patient)) {
        return refuse("patient unavailable (not on the roster, already acted this period, or is the medic)");
      }
      acted.add(patient);
    }
    const contractEvents = [];
    for (const runner of crew) {
      acted.add(runner);
      contractEvents.push({ runner: runner.identity.handle, ...MJ.consumeContractMission(runner, rng) });
    }
    const entry = { kind: kind, crew: crew, contractEvents: contractEvents, dispatch: d };
    if (kind === "crafting" || kind === "medical" || kind === "search") {
      entry.done = true;
      entry.result = closeDispatch(entry, kind === "crafting"
        ? resolveCraftingMission(rng, d.mission, crew)
        : kind === "medical"
          ? resolveMedicalMission(rng, d.mission, crew)
          : resolveSearchMission(rng, d.mission, crew));
      return entry;
    }
    entry.done = false;
    entry.run = beginMission(rng, d.mission, crew, day);
    return entry;
  }

  // Stamp the crew and the contract cost onto a finished result. The
  // contracts were spent at open time whatever the dice later said.
  function closeDispatch(entry, result) {
    result.crew = entry.crew.map((r) => r.identity.handle);
    result.contractEvents = entry.contractEvents;
    return result;
  }

  function runActionPeriod(rng, dispatches, day) {
    const acted = new Set();
    const results = [];
    for (const d of dispatches) {
      const entry = openDispatch(rng, d, day, acted);
      if (entry.done) { results.push(entry.result); continue; }
      autoResolve(entry.run);
      results.push(closeDispatch(entry, finishMission(rng, entry.run)));
    }
    return results;
  }

  MJ.RECON_LENSES = RECON_LENSES;
  MJ.isDispatchable = isDispatchable;
  MJ.createReconMission = createReconMission;
  MJ.createMatrixMission = createMatrixMission;
  MJ.createAstralMission = createAstralMission;
  // The three pillars' routes, all the same shape ({path, obstacles})
  // so anything that draws a run can draw any of them.
  // The player's granularity control, exposed so a renderer can
  // offer the toggle. Refused during combat and remembered.
  MJ.missionSetMode = function (run, mode) { return MJ.setMode(run.tempo, mode); };
  MJ.missionToggleMode = function (run) { return MJ.toggleMode(run.tempo); };
  MJ.missionTempo = function (run) { return MJ.describeTempo(run.tempo); };

  MJ.streetRoute = routeObstacles;
  MJ.astralRoute = astralRoute;
  MJ.tetherFor = tetherFor;
  // The astral pillar's clock, exported so models/astral.js can spend
  // it. Every verb out there costs a tick — that is the whole economy
  // of being out of body.
  MJ.tickTether = tickTether;
  MJ.hostRoute = hostRoute;
  MJ.hostPaths = hostPaths;
  MJ.createCraftingMission = createCraftingMission;
  MJ.createMedicalMission = createMedicalMission;
  MJ.createResourceMission = createResourceMission;
  MJ.createSearchMission = createSearchMission;
  MJ.generateSecurityEstimate = generateSecurityEstimate;
  MJ.siteIntelView = siteIntelView;
  MJ.suppressionBonus = suppressionBonus;
  MJ.applySuppression = applySuppression;
  // The stepper — interactive resolution drives these directly;
  // resolveSiteMission drives them with its own auto-chooser.
  MJ.beginMission = beginMission;
  MJ.missionPrompt = missionPrompt;
  MJ.missionChoose = missionChoose;
  // Exported so a probe can hold the two to each other: what the
  // player is offered and what decides "no way through" must be one
  // count, because they are one function.
  MJ.remainingApproaches = remainingApproaches;
  MJ.axisProven = axisProven;
  MJ.missionExtendedStep = missionExtendedStep;
  MJ.extendedThreshold = extendedThreshold;
  // The mage's mid-run actions: put a spell up, read the ground.
  MJ.castUtilitySpell = castUtilitySpell;
  MJ.revealedRead = revealedRead;
  // THE one drain law. Exported so the astral and the conjuring
  // bench bill through the same function the street does, instead of
  // each inventing what Drain costs on their own plane.
  MJ.applyDrain = applyDrain;
  // Who can see the crew from where they stand. Exported so the
  // street pillar asks the SAME question the witness rules ask,
  // rather than re-deriving it with slightly different filtering.
  MJ.perceiversNear = perceiversNear;
  MJ.missionAbort = missionAbort;
  MJ.missionDone = missionDone;
  MJ.finishMission = finishMission;
  MJ.discoverResourceSite = discoverResourceSite;
  MJ.missionKind = missionKind;
  MJ.missionPlanes = missionPlanes;
  MJ.autoResolve = autoResolve;
  MJ.openDispatch = openDispatch;
  MJ.closeDispatch = closeDispatch;
  MJ.runActionPeriod = runActionPeriod;
})();
