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

  // ── Suppression: tenderizing that lasts the rest of the day ─────
  // Every successful site mission leaves its mark on the defenses
  // it beat — a looped camera, a cracked ward — as per-axis
  // suppression granting bonus dice against MATCHING-projection
  // obstacles for later missions at that site the SAME DAY. Stacks
  // to a cap, vanishes overnight (alert.js clears it). Earned axis:
  // recon suppresses its lens (a MATRIX sweep suppresses the
  // PHYSICAL grid — it's the cameras and maglocks it looped);
  // astral work cracks astral; physical strikes and data payloads
  // degrade the physical grid. Applied AFTER a mission resolves, so
  // nothing self-benefits. Karma stays keyed to the unsuppressed
  // posture — softening lowers the risk, never the books.
  const SUPPRESSION_PER_SUCCESS = 1;
  const SUPPRESSION_CAP = 3;
  const EXCEPTIONAL_MARGIN = 3;      // hits beyond threshold that read as "thoroughly bamboozled"
  const ALERT_POINTS_PER_BEAT = 3;   // ~3-4 beats buys them one escalation step

  function suppressionAxisFor(kind, mission) {
    if (kind === "recon") return mission.lens === "matrix" ? "physical" : mission.lens;
    if (mission.payloadDomain === "astral") return "astral";
    return "physical";
  }

  function suppressionBonus(site, projection, day) {
    const s = site.securityState && site.securityState.suppression;
    if (!s || s.day !== day) return 0;
    return s[projection] || 0;
  }

  function applySuppression(site, axis, day) {
    const st = site.securityState;
    if (!st.suppression || st.suppression.day !== day) {
      st.suppression = { physical: 0, astral: 0, day: day };
    }
    st.suppression[axis] = Math.min(SUPPRESSION_CAP, (st.suppression[axis] || 0) + SUPPRESSION_PER_SUCCESS);
    return st.suppression[axis];
  }

  function hasFreshIntel(site, day) {
    return Object.values(site.intel || {}).some(
      (x) => day >= x.dayTaken && day - x.dayTaken <= INTEL_FRESH_DAYS
    );
  }

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
      obstacles: kind === "recon" ? reconObstacles(site, mission.lens) : routeObstacles(site),
      index: 0, tasks: [], armorGuard: armorGuard,
      anyLoud: false, anyGlitch: false, failed: false, aborted: false,
      attempts: {},        // "obstacleIndex:skill" -> tries, for budgets and escalation
      discovered: {},      // "obstacleIndex:skill" -> why it will never work here
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

  // ── Witnessing (§09) ────────────────────────────────────────────
  // An act only reveals anything if something perceived it. The
  // obstacle you are touching decides that below questionable; once
  // the site reads you as questionable it is watching you generally,
  // which is how a camera catches you working a lock it isn't part
  // of. Loud is always witnessed — not because loud means dangerous
  // (a taunt is neither), but because it is heard.
  function wasWitnessed(run, obstacle, affordance) {
    if (affordance && affordance.loud) return true;
    if (obstacle.perceives) return true;
    const band = MJ.threatBand(run.state, run.day);
    return band === "questionable" || band === "threatening";
  }

  // Repetition past a safeguard escalates the read: the ward keeps
  // you out on its own, so a first press is merely offputting —
  // leaning on it again is a person with a purpose.
  function threatClassFor(affordance, tries) {
    if (!affordance || !affordance.threat) return MJ.THREAT.NORMAL;
    if (affordance.escalates && tries > 1 && affordance.threat === MJ.THREAT.AWKWARD) {
      return MJ.THREAT.QUESTIONABLE;
    }
    return affordance.threat;
  }

  // ── Attempt budgets ─────────────────────────────────────────────
  // An approach runs out: one shot to talk your way past (you cannot
  // work the same room twice), a few tries at credentials before the
  // account locks itself. Spending the last one removes the option
  // WITHOUT an alarm — the lockout already ended the credible threat.
  function attemptKey(index, skill) {
    return index + ":" + skill;
  }

  function attemptsLeft(run, index, affordance) {
    const budget = affordance.attempts === undefined ? 1 : affordance.attempts;
    return budget - (run.attempts[attemptKey(index, affordance.skill)] || 0);
  }

  // ── Responders: what an engaged axis actually sends ─────────────
  // Each axis fields a challenge at its own alert level, in its own
  // idiom. Matrix has no obstacle vocabulary of its own yet, so its
  // response manifests physically — doors sealing, turrets waking —
  // rather than inventing ice the unbuilt Matrix pillar would have
  // to contradict later.
  const RESPONDER_TYPES = {
    physical: ["guard", "camera"],
    astral: ["spirit"],
    matrix: ["maglock", "camera"],
  };

  function spawnResponders(run, atIndex) {
    const spawned = [];
    for (const axis of MJ.SECURITY_AXES) {
      const tier = MJ.alertLevel(run.state, axis);
      if (tier < 1) continue;
      const typeId = run.rng.pick(RESPONDER_TYPES[axis]);
      const projection = axis === "astral" ? "astral" : "physical";
      const ob = MJ.generateObstacleInstance(run.rng, typeId, Math.min(10, tier), projection);
      ob.responder = axis;
      spawned.push(ob);
    }
    // They arrive in front of you — next, not at the end of the route.
    run.obstacles.splice(atIndex === undefined ? run.index + 1 : atIndex, 0, ...spawned);
    return spawned;
  }

  function missionDone(run) {
    return run.aborted || run.index >= run.obstacles.length;
  }

  // What the crew is looking at, and every way they could take it.
  // Blocked affordances are included on purpose — a Watsonian
  // immunity is only knowable by trying it (§06: information isn't
  // confirmed until experienced), so the UI decides what to reveal.
  function missionPrompt(run) {
    if (missionDone(run)) return null;
    const obstacle = run.obstacles[run.index];
    const options = [];
    // Effective skills are recomputed per prompt, not cached on the
    // run: a critical glitch mid-mission changes them. Once per
    // runner rather than once per runner PER affordance, though —
    // this used to allocate a fresh skill map fifteen times a prompt.
    const eff = run.runners.map((r) => MJ.getEffectiveSkills(r));
    for (const a of obstacle.affordances) {
      if (!a.skill) continue;
      let best = null;
      for (let ri = 0; ri < run.runners.length; ri++) {
        const runner = run.runners[ri];
        const trained = eff[ri][a.skill] || 0;
        if (trained <= 0) continue;
        // Ranked by effective pool, so the toolkit-holder naturally
        // wins ties against an equally-skilled bare-handed runner.
        const pool = trained + MJ.gearBonusFor(runner, a.skill);
        if (!best || pool > best.pool) best = { runner: runner, pool: pool };
      }
      const left = attemptsLeft(run, run.index, a);
      const known = run.discovered[attemptKey(run.index, a.skill)] || null;
      options.push({
        skill: a.skill, verb: a.verb, loud: !!a.loud,
        blocked: !!a.blocked, reason: a.reason || null,
        // What the CREW knows — a Watsonian immunity is only knowable
        // by trying it, so the UI shows `discovered`, never `blocked`.
        discovered: known,
        runner: best ? best.runner : null,
        pool: best ? best.pool : 0,
        attemptsLeft: left,
        available: !!best && left > 0 && !known,
      });
    }
    return {
      obstacle: obstacle,
      label: obstacle.label,
      tier: obstacle.tier,
      projection: obstacle.projection,
      index: run.index,
      total: run.obstacles.length,
      options: options,
    };
  }

  // One decision, one roll. `choice` is { skill, runner } — or null,
  // meaning nobody could touch it and the crew stalls out loudly.
  function missionChoose(run, choice) {
    if (missionDone(run)) return null;
    const obstacle = run.obstacles[run.index];
    if (!choice) {
      run.failed = true;
      run.anyLoud = true;
      const task = { obstacle: obstacle.label, tier: obstacle.tier, result: "no usable approach — stalled" };
      run.tasks.push(task);
      run.index += 1;
      return task;
    }
    const runner = choice.runner;
    const skill = choice.skill;
    const affordance = obstacle.affordances.find((a) => a.skill === skill);
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
      bonusDice: run.intelBonus + MJ.gearBonusFor(runner, skill) + boostDice +
        suppressionBonus(run.site, obstacle.projection, run.day),
    });
    if (affordance && affordance.loud) run.anyLoud = true;
    if (outcome.glitch) run.anyGlitch = true;
    let guarded = null;
    if (outcome.criticalGlitch) {
      // Armor eats it first (reusable this mission); then a patch
      // (consumed); only then does the wound land.
      if (run.armorGuard.get(runner) > 0) {
        run.armorGuard.set(runner, run.armorGuard.get(runner) - 1);
        guarded = "armor";
      } else {
        const patch = MJ.findConsumable(runner, "absorbWound", null);
        if (patch) {
          guarded = patch.label;
          MJ.consumeItem(patch);
        } else {
          runner.wounds += 1; // placeholder wound rule
        }
      }
    }
    // What did that reveal, and did anything see it?
    const key = attemptKey(run.index, skill);
    run.attempts[key] = (run.attempts[key] || 0) + 1;
    // A blocked affordance is discovered by trying it — you learn the
    // box is air-gapped by reaching for a signal that isn't there.
    if (outcome.ok === false && affordance && affordance.blocked) {
      run.discovered[key] = affordance.reason || "doesn't work here";
    }
    let read = null;
    let tipped = false;
    if (wasWitnessed(run, obstacle, affordance)) {
      const cls = threatClassFor(affordance, run.attempts[key]);
      if (cls !== MJ.THREAT.NORMAL) {
        const applied = MJ.witnessAct(run.state, run.day, cls);
        read = { threatClass: cls, band: applied.band };
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
      runner: runner.identity.handle, skill: skill, pool: outcome.poolSize,
      loud: affordance ? !!affordance.loud : false, hits: outcome.hits, threshold: outcome.threshold,
      success: outcome.success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch,
      boosted: boostLabel, guarded: guarded,
      rejected: outcome.ok === false ? outcome.error : null,
      read: read, tipped: tipped,
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

  // How many ways of getting past THIS obstacle the crew still has:
  // trained, budget left, and not yet discovered to be useless here.
  function remainingApproaches(run) {
    const obstacle = run.obstacles[run.index];
    if (!obstacle) return 0;
    const eff = run.runners.map((r) => MJ.getEffectiveSkills(r));
    let n = 0;
    for (const a of obstacle.affordances) {
      if (!a.skill) continue;
      if (run.discovered[attemptKey(run.index, a.skill)]) continue;
      if (attemptsLeft(run, run.index, a) <= 0) continue;
      if (eff.some((e) => (e[a.skill] || 0) > 0)) n += 1;
    }
    return n;
  }

  // Walk away. The mission fails, but nothing else gets rolled — no
  // further wounds, no further noise. "Is it worth another swing"
  // is the decision this exists to make real.
  function missionAbort(run) {
    if (run.aborted) return run;
    run.aborted = true;
    run.failed = true;
    run.tasks.push({ obstacle: "—", tier: 0, result: "withdrew — the crew pulled out" });
    return run;
  }

  // ── Site-mission resolution (jobObjective / recon / resource) ───
  // Quick resolve: the stepper, driven by the auto-chooser.
  function resolveSiteMission(rng, mission, runners, day) {
    const run = beginMission(rng, mission, runners, day);
    let guard = 0;
    while (!missionDone(run) && guard++ < 500) {
      const prompt = missionPrompt(run);
      // The auto-chooser only sees what the crew still actually has:
      // untried-or-unexhausted approaches nobody has discovered to be
      // useless here. Quiet beats loud, then the biggest pool.
      const usable = prompt.options.filter((o) => o.available);
      let best = null;
      for (const o of usable) {
        if (!best) best = o;
        else if (best.loud && !o.loud) best = o;
        else if (best.loud === o.loud && o.pool > best.pool) best = o;
      }
      missionChoose(run, best ? { skill: best.skill, runner: best.runner } : null);
    }
    return finishMission(rng, run);
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
      : { ratcheted: false, maxGrew: false };
    const band = MJ.threatBand(state, day);

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
    if (success && kind === "resourceGathering") {
      // Draw from the site's own probability chart (§09: the loot
      // table is as canonical as the walls — same name, same odds).
      const table = site.lootTable;
      if (table) {
        const entry = rng.weighted(table.entries.map((e) => ({ item: e, weight: e.weight })));
        result.yield = { kind: entry.kind, amount: rng.int(1, entry.amountMax) };
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
    const pseudo = { tier: tier, affordances: [{ skill: bestSkill, verb: "craft", loud: false }] };
    const outcome = MJ.resolveTask(rng, bestRunner, pseudo, bestSkill, { bonusDice: MJ.gearBonusFor(bestRunner, bestSkill) });
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
      yield: success ? (template ? { item: MJ.makeItem(mission.templateId) } : { kind: "craftedItem", amount: 1 }) : undefined,
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
    const essenceSpent = Math.max(0, patient.essence.max - patient.essence.current);
    const tier = Math.max(1, Math.min(10, patient.wounds + Math.floor(essenceSpent)));
    const pseudo = { tier: tier, affordances: [{ skill: bestSkill, verb: "treat", loud: false }] };
    const outcome = MJ.resolveTask(rng, bestRunner, pseudo, bestSkill, { bonusDice: MJ.gearBonusFor(bestRunner, bestSkill) });
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
  MJ.suppressionBonus = suppressionBonus;
  MJ.applySuppression = applySuppression;
  // The stepper — interactive resolution drives these directly;
  // resolveSiteMission drives them with its own auto-chooser.
  MJ.beginMission = beginMission;
  MJ.missionPrompt = missionPrompt;
  MJ.missionChoose = missionChoose;
  MJ.missionAbort = missionAbort;
  MJ.missionDone = missionDone;
  MJ.finishMission = finishMission;
  MJ.discoverResourceSite = discoverResourceSite;
  MJ.missionKind = missionKind;
  MJ.runActionPeriod = runActionPeriod;
})();
