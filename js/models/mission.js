/* ============================================================
   Mr. Johnson — models/mission.js
   The mission dispatch system: the one mechanism every kind of
   runner assignment goes through (design bible §06). Recon,
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
       earlier mission's effects (fresh intel, a hotter Alert) are
       real for later missions the same day. Security ratings don't
       move within a day of their own accord — but Alert does.
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

   V1 resolution is deliberately shallow (approved scope): walk
   the shortest entry->objective route, pick the crew's best
   usable approach per obstacle (quiet preferred over loud at any
   pool size), one resolveTask roll each; the mission succeeds if
   every obstacle is overcome. Placeholders, flagged:
     - Noise model: the site hears a hit if any loud affordance
       was used OR the mission failed; glitches add noise. A clean
       all-quiet success is a ghost run (zero Alert).
     - Wounds: a critical glitch wounds the runner who rolled it.
     - Karma formulas (KARMA_PER_SECURITY etc.), the intel bonus
       size, route/recon sample caps, crafting tier: all shape-
       only numbers for tuning later.
     - Resource yields are returned in the result, stored nowhere
       (no armory yet). Matrix recon samples hacking/electronics-
       bearing obstacles (the card-based Matrix pillar isn't
       built).

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
  const MAX_ROUTE_OBSTACLES = 6;     // V1 cap on how much of a site one mission touches
  const RECON_SAMPLE = 3;            // obstacles a recon pass examines

  // ── Eligibility: a dispatch is what a contract buys ─────────────
  function isDispatchable(runner) {
    return !!runner.market.hired && runner.market.phase !== "kia";
  }

  // ── Player-initiated mission records ────────────────────────────
  // Same record family as job.js's job-derived missions — `kind`
  // distinguishes; a job mission has no kind and resolves as
  // "jobObjective".
  function createReconMission(site, lens) {
    return { kind: "recon", lens: lens, site: site, locationType: "site", resolved: false, karmaAward: null };
  }

  function createCraftingMission(itemTier) {
    return { kind: "crafting", itemTier: itemTier || DEFAULT_CRAFT_TIER, site: null, locationType: "hub", resolved: false, karmaAward: null };
  }

  // A treatment session: the medic's mission, the patient's day on
  // the table. The patient spends nothing — no action, no contract.
  function createMedicalMission(patient) {
    return { kind: "medical", patient: patient, site: null, locationType: "hub", resolved: false, karmaAward: null };
  }

  function createResourceMission(site) {
    return { kind: "resourceGathering", site: site, locationType: "site", resolved: false, karmaAward: null };
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

  // ── Route + recon obstacle selection ────────────────────────────
  // V1: the shortest entry->objective path, gathering the physical
  // obstacles along it plus the astral obstacles attached to its
  // rooms — one crew walks one route, both projections are real.
  function routeObstacles(site) {
    const paths = MJ.findPaths(site);
    if (paths.length === 0) return [];
    const path = paths.reduce((a, b) => (a.length <= b.length ? a : b));
    const roomSet = new Set(path);
    const obstacles = [];
    const entry = site.layout.entryPoints.find((e) => e.roomId === path[0]);
    if (entry) obstacles.push(...entry.physicalObstacles);
    for (const edge of site.layout.edges) {
      if (roomSet.has(edge.from) && roomSet.has(edge.to)) obstacles.push(...edge.physicalObstacles);
    }
    for (const room of site.layout.rooms) {
      if (!roomSet.has(room.id)) continue;
      for (const slot of room.postSlots) obstacles.push(...slot.physicalObstacles);
      obstacles.push(...room.astralObstacles);
    }
    return obstacles.slice(0, MAX_ROUTE_OBSTACLES);
  }

  function reconObstacles(site, lens) {
    const all = MJ.allObstacles(site);
    const pool = lens === "matrix"
      ? all.filter((o) => o.affordances.some((a) => a.skill === "hacking" || a.skill === "electronics"))
      : all.filter((o) => o.projection === lens);
    return pool.slice(0, RECON_SAMPLE);
  }

  function hasFreshIntel(site, day) {
    return Object.values(site.intel || {}).some(
      (x) => day >= x.dayTaken && day - x.dayTaken <= INTEL_FRESH_DAYS
    );
  }

  // ── Approach selection: the crew's best usable option ───────────
  // Quiet beats loud at ANY pool size (ghost runs are the ideal
  // outcome); among equals, the biggest dice pool wins. Returns
  // null when nobody in the crew can use any affordance at all —
  // every option blocked or untrained across the whole crew.
  function pickApproach(runners, obstacle) {
    let best = null;
    for (const a of obstacle.affordances) {
      if (!a.skill || a.blocked) continue;
      for (const runner of runners) {
        const pool = MJ.getEffectiveSkills(runner)[a.skill] || 0;
        if (pool <= 0) continue;
        const cand = { runner: runner, skill: a.skill, loud: a.loud, pool: pool };
        if (!best) best = cand;
        else if (best.loud && !cand.loud) best = cand;
        else if (best.loud === cand.loud && cand.pool > best.pool) best = cand;
      }
    }
    return best;
  }

  // ── Site-mission resolution (jobObjective / recon / resource) ───
  function resolveSiteMission(rng, mission, runners, day) {
    const site = mission.site;
    const kind = missionKind(mission);
    if (!site.securityState) MJ.initSecurityState(rng, site);
    const state = site.securityState;

    // Karma keys off the START of the mission — snapshot first.
    const start = {
      physical: state.axes.physical.current,
      astral: state.axes.astral.current,
      matrix: state.axes.matrix.current,
    };
    const bonusDice = hasFreshIntel(site, day) ? INTEL_BONUS_DICE : 0;

    const obstacles = kind === "recon" ? reconObstacles(site, mission.lens) : routeObstacles(site);
    let anyLoud = false;
    let anyGlitch = false;
    let failed = false;
    const tasks = [];

    for (const obstacle of obstacles) {
      const approach = pickApproach(runners, obstacle);
      if (!approach) {
        // Nobody can touch it — the crew stalls out, loudly.
        failed = true;
        anyLoud = true;
        tasks.push({ obstacle: obstacle.label, tier: obstacle.tier, result: "no usable approach — stalled" });
        continue;
      }
      const outcome = MJ.resolveTask(rng, approach.runner, obstacle, approach.skill, { bonusDice: bonusDice });
      if (approach.loud) anyLoud = true;
      if (outcome.glitch) anyGlitch = true;
      if (outcome.criticalGlitch) approach.runner.wounds += 1; // placeholder wound rule
      if (!outcome.success) failed = true;
      tasks.push({
        obstacle: obstacle.label, tier: obstacle.tier,
        runner: approach.runner.identity.handle, skill: approach.skill,
        loud: approach.loud, hits: outcome.hits, threshold: outcome.threshold,
        success: outcome.success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch,
      });
    }

    const success = !failed;
    // Placeholder noise model: the site hears any loud approach, or
    // a failure of any kind; glitches add noise on top. A clean,
    // all-quiet success lands zero Alert — the ghost run.
    const hit = MJ.recordHit(state, { loud: anyLoud || !success, glitch: anyGlitch });

    // Interaction confirms security (user ruling): a crew that comes
    // home knows what it actually touched — success OR failure, a
    // completed attempt is a fresh, day-stamped confirmed read on
    // every axis it interacted with. Faced obstacles confirm their
    // projection; working a deck (hacking) confirms matrix; a recon
    // sweep confirms its own lens once it faced anything at all.
    const confirmedAxes = new Set(obstacles.map((o) => o.projection));
    if (tasks.some((t) => t.skill === "hacking")) confirmedAxes.add("matrix");
    if (kind === "recon" && (success || obstacles.length > 0)) confirmedAxes.add(mission.lens);
    for (const axis of confirmedAxes) {
      if (axis !== "physical" && axis !== "astral" && axis !== "matrix") continue;
      site.intel[axis] = {
        snapshot: {
          security: { physical: start.physical, astral: start.astral, matrix: start.matrix },
          alert: state.alert,
          obstaclesSeen: tasks.map((t) => t.obstacle),
        },
        dayTaken: day,
      };
    }

    let karmaAward = 0;
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
    }

    const result = {
      kind: kind, success: success, karmaAward: karmaAward,
      obstaclesFaced: obstacles.length, tasks: tasks,
      noise: hit, intelBonusApplied: bonusDice > 0,
    };
    if (success && kind === "resourceGathering") {
      // Yield goes nowhere yet — no armory to receive it (flagged).
      const kindTag = (site.tags.find((t) => String(t.tag).startsWith("resource:")) || {}).tag;
      result.yield = { kind: kindTag || "resource:generic", amount: 1 + Math.max(0, Math.round(start.astral / 3)) };
    }
    return result;
  }

  // ── Crafting resolution: a pseudo-task at the hub ───────────────
  const CRAFTING_SKILLS = ["computer", "electronics", "rigging", "enchanting", "medicine"];

  function resolveCraftingMission(rng, mission, runners) {
    // The crafter rolls their best trade skill against a flat tier —
    // reusing resolveTask via a pseudo-obstacle so the dice rules
    // stay in one place.
    let bestRunner = runners[0];
    let bestSkill = CRAFTING_SKILLS[0];
    let bestPool = -1;
    for (const runner of runners) {
      const eff = MJ.getEffectiveSkills(runner);
      for (const skill of CRAFTING_SKILLS) {
        if ((eff[skill] || 0) > bestPool) {
          bestPool = eff[skill] || 0;
          bestRunner = runner;
          bestSkill = skill;
        }
      }
    }
    const tier = mission.itemTier || DEFAULT_CRAFT_TIER;
    const pseudo = { tier: tier, affordances: [{ skill: bestSkill, verb: "craft", loud: false }] };
    const outcome = MJ.resolveTask(rng, bestRunner, pseudo, bestSkill);
    const success = outcome.success;
    let karmaAward = 0;
    if (success) {
      karmaAward = Math.max(1, Math.round(SUPPORT_KARMA_RATE * tier)); // scales with the item, below the fieldwork rate
      for (const runner of runners) MJ.growRunner(runner, karmaAward, rng);
      mission.resolved = true;
      mission.karmaAward = karmaAward;
    }
    return {
      kind: "crafting", success: success, karmaAward: karmaAward,
      tasks: [{ obstacle: `workbench (item T${tier})`, tier: tier, runner: bestRunner.identity.handle, skill: bestSkill, hits: outcome.hits, threshold: outcome.threshold, success: success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch }],
      yield: success ? { kind: "craftedItem", amount: 1 } : undefined,
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
        if ((eff[skill] || 0) > bestPool) {
          bestPool = eff[skill] || 0;
          bestRunner = runner;
          bestSkill = skill;
        }
      }
    }
    const essenceSpent = Math.max(0, patient.essence.max - patient.essence.current);
    const tier = Math.max(1, Math.min(10, patient.wounds + Math.floor(essenceSpent)));
    const pseudo = { tier: tier, affordances: [{ skill: bestSkill, verb: "treat", loud: false }] };
    const outcome = MJ.resolveTask(rng, bestRunner, pseudo, bestSkill);
    let karmaAward = 0;
    if (outcome.success) {
      patient.wounds -= 1;
      karmaAward = Math.max(1, Math.round(SUPPORT_KARMA_RATE * tier));
      for (const runner of runners) MJ.growRunner(runner, karmaAward, rng);
      mission.resolved = true;
      mission.karmaAward = karmaAward;
    }
    return {
      kind: "medical", success: outcome.success, karmaAward: karmaAward,
      patient: patient.identity.handle, woundsNow: patient.wounds,
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
      view[axis] = {
        // A site with no rolled estimate yet falls back to its public
        // profile ceiling — shouldn't happen once every entry path
        // (job introduction, discovery) rolls one, but never crash.
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
  function runActionPeriod(rng, dispatches, day) {
    const acted = new Set();
    const results = [];
    for (const d of dispatches) {
      const kind = missionKind(d.mission);
      // Chain gate (§06): some contracts only work in order —
      // "acquire the item, deliver it, plug it in." A gated leg
      // can't be dispatched until its prerequisite resolves, and a
      // refused dispatch costs nothing: no actions, no contracts.
      if (d.mission.requiresMission && !d.mission.requiresMission.resolved) {
        results.push({ kind: kind, success: false, error: "gated — prerequisite mission not yet complete", tasks: [], karmaAward: 0 });
        continue;
      }
      const crew = (d.runners || []).filter((r) => isDispatchable(r) && !acted.has(r));
      if (crew.length === 0) {
        results.push({ kind: kind, success: false, error: "no dispatchable crew (uncontracted, KIA, or already acted this period)", tasks: [], karmaAward: 0 });
        continue;
      }
      // A treatment session occupies the patient for the period —
      // no action, no contract, but they can't also be somewhere
      // else today (and the medic can't operate on themselves).
      if (kind === "medical") {
        const patient = d.mission.patient;
        if (!patient || !patient.market.hired || acted.has(patient) || crew.includes(patient)) {
          results.push({ kind: kind, success: false, error: "patient unavailable (not on the roster, already acted this period, or is the medic)", tasks: [], karmaAward: 0 });
          continue;
        }
        acted.add(patient);
      }
      const contractEvents = [];
      for (const runner of crew) {
        acted.add(runner);
        contractEvents.push({ runner: runner.identity.handle, ...MJ.consumeContractMission(runner, rng) });
      }
      const result = kind === "crafting"
        ? resolveCraftingMission(rng, d.mission, crew)
        : kind === "medical"
          ? resolveMedicalMission(rng, d.mission, crew)
          : kind === "search"
            ? resolveSearchMission(rng, d.mission, crew)
            : resolveSiteMission(rng, d.mission, crew, day);
      result.crew = crew.map((r) => r.identity.handle);
      result.contractEvents = contractEvents;
      results.push(result);
    }
    return results;
  }

  MJ.RECON_LENSES = RECON_LENSES;
  MJ.isDispatchable = isDispatchable;
  MJ.createReconMission = createReconMission;
  MJ.createCraftingMission = createCraftingMission;
  MJ.createMedicalMission = createMedicalMission;
  MJ.createResourceMission = createResourceMission;
  MJ.createSearchMission = createSearchMission;
  MJ.generateSecurityEstimate = generateSecurityEstimate;
  MJ.siteIntelView = siteIntelView;
  MJ.discoverResourceSite = discoverResourceSite;
  MJ.missionKind = missionKind;
  MJ.runActionPeriod = runActionPeriod;
})();
