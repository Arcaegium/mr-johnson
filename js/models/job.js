/* ============================================================
   Mr. Johnson — models/job.js
   The job/mission records: generation from a seed, per design
   bible §06 ("Jobs, The Board & Missions").

   Core rules this file implements:
     - A JOB is the contract: one hiring faction, one nuyen payout,
       paid once on completing the success criteria (generally "all
       included missions done"). A job can have multiple TARGET
       factions across its missions, even though the client stays
       the same throughout.
     - A MISSION is the actual dispatch unit: its own target
       faction, its own site (or, later, a route between two
       sites — see locationType below), its own objective, its own
       intended crew. Completing a mission's objective pays Karma to
       the runners who ran it — never nuyen. Nuyen is a job-level
       event, tied to the contract's deliverable, not to any one
       mission along the way. This is what makes "soften up a
       target with a couple of recon/removal missions, then send
       the closing team in" a real, meaningful choice: every runner
       involved grows from what they actually did, but the player
       only gets paid once, for the thing they were actually hired
       to do.
     - A job is NOT inherently a sequence (§06, amended twice): by
       default its missions complete in any order, interleaved with
       anything else the operation runs, and the only universal
       constraint is the window (daysPerMission x missionCount,
       below). But some contracts are genuine CHAINS — "acquire the
       item, deliver it, plug it in" is three missions that only
       work in order — so a mission can carry `requiresMission`, and
       the dispatch layer refuses a gated leg until its prerequisite
       resolves. Order is per-job structure where the fiction
       demands it, never a blanket rule in either direction.
     - A job's total scope (however many missions/sites get bundled
       into it) is what scales without bound as the operation grows
       — never any single site's Value, which is capped at 10
       forever by design (§09). Job pay is the SUM of its missions'
       site-derived contributions, so a job's payout genuinely
       scales with how elaborate an operation the player can mount,
       not with a single site's ceiling.
     - Reuse vs. introduce, per mission (§06): each mission
       independently reuses the closest Value/Orientation match from
       the site pool or introduces a fresh site. The match is loose
       on purpose — see site.js's own notes on this.
     - This file does NOT implement: faction standing/heat, tags/
       combos, static/dynamic complications, or actual mission
       resolution (playing out a mission's objective against its
       site's obstacles) or Karma awarding (that needs a runner-
       dispatch system this file has no knowledge of). `karmaAward`
       and `resolved` are reserved fields, not yet populated.
       Route-type missions (movement between two sites) are a
       reserved shape too — site.js can't generate a route-shaped
       site yet, so `locationType` is always "site" for now.

   Usage:
     const { job, siteResults } = MJ.generateJob(rng, sitePool, currentDay);
     const board = MJ.generateBoard(rng, sitePool, currentDay, 6);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── The mission grammar: objective verb x payload domain ────────
  // Every verb names its natural fail state (§06) — flavor/UI text,
  // not yet wired to a resolution system.
  const OBJECTIVE_VERBS = {
    acquire:   { label: "Acquire",   description: "Get an object out of a secured site", failState: "Object destroyed, or its carrier downed and it's lost" },
    extract:   { label: "Extract",   description: "Get a person out, willing or not", failState: "The person dies" },
    eliminate: { label: "Eliminate", description: "Neutralize a target — person, gang, nest, spirit", failState: "Target escapes" },
    sabotage:  { label: "Sabotage",  description: "Destroy or disable a thing", failState: "The thing survives intact" },
    intel:     { label: "Intel",     description: "Gather information and leave unseen", failState: "Detected — the one verb where being seen is the failure" },
    plant:     { label: "Plant",     description: "Place something — evidence, a bug, a charge, a frame", failState: "Placement witnessed, or the plant found" },
    protect:   { label: "Protect",   description: "Keep a payload alive through a threat window", failState: "Payload lost" },
    deliver:   { label: "Deliver",   description: "Move a payload through hostile ground to a drop", failState: "Payload lost en route" },
  };

  // physical -> a vault break-in; data -> a Matrix heist; astral ->
  // a banishing/astral espionage. Routes the verb, doesn't change it.
  const PAYLOAD_DOMAINS = ["physical", "data", "astral"];

  // Payload domain -> the site Orientation a matching site is sought
  // for (site.js: "physical" | "astral" | "matrix" | "balanced").
  const DOMAIN_TO_ORIENTATION = { physical: "physical", data: "matrix", astral: "astral" };

  // ── The three mission families (§06) — the shape of ONE mission,
  // not the whole job (a job can bundle missions of different
  // families/verbs/domains together).
  const JOB_FAMILIES = {
    infiltration: { label: "Infiltration", maxCrew: 4, verbs: ["acquire", "extract", "eliminate", "sabotage", "intel", "plant"] },
    gauntlet:     { label: "Gauntlet",     maxCrew: 4, verbs: ["protect", "deliver"] },
    remote:       { label: "Remote",       maxCrew: 1, verbs: ["acquire", "intel", "eliminate"] },
  };
  const FAMILY_IDS = Object.keys(JOB_FAMILIES);

  // ── Intended crew size: fixed number or a suggested range (§06) ─
  // Board-card metadata, per mission — never a hard requirement
  // (runnable is universal, solvable is a separate question, both
  // mission-resolution concerns, not this file's).
  function rollIntendedCrew(rng, familyId) {
    const family = JOB_FAMILIES[familyId];
    if (familyId === "remote") return { fixed: 1 };
    if (rng.chance(0.4)) {
      return { fixed: rng.int(1, family.maxCrew) };
    }
    const min = rng.int(1, family.maxCrew - 1);
    const max = rng.int(min + 1, family.maxCrew);
    return { min, max };
  }

  // ── Tier bands: value ranges the board's three rungs look for ───
  // (§06 "Board size, refresh & scaling" — safe / bread-and-butter /
  // stretch). A mission's tier is simply which band its matched
  // site's Value fell into, not a separate roll. A job no longer
  // has one single tier — it can span missions of different tiers —
  // so tier lives on the mission, not the job.
  const TIER_BANDS = {
    safe: { min: 1, max: 3 },
    breadAndButter: { min: 4, max: 7 },
    stretch: { min: 8, max: 10 },
  };
  const TIER_IDS = Object.keys(TIER_BANDS);

  function tierForValue(value) {
    for (const [id, band] of Object.entries(TIER_BANDS)) {
      if (value >= band.min && value <= band.max) return id;
    }
    return "breadAndButter";
  }

  // ── Reuse vs. introduce (§06): reuse matches on Value band ONLY —
  // deliberately Orientation-agnostic (confirmed design). Any site
  // with the right anchor can host any mission, whatever its
  // security leans; a mismatch is a scouting discovery, not an
  // error ("weak matrix, high physical — take over their cameras to
  // crack the building"). What a mismatch SHOULD eventually shape
  // is pay: clients price off the PERCEIVED (estimated) security
  // relevant to the mission's domain, so a believed-matrix-lite
  // target commands a lower fee for a data heist. estimateMissionPay
  // below doesn't model that yet (flat off Value) — future work,
  // needs the estimated-security/scouting layer to exist first.
  // Orientation still steers the INTRODUCE path, so fresh sites fit
  // their mission's flavor on average. excludeFaction keeps a
  // mission's target from accidentally being the same faction
  // that's hiring the job (client != target, per §06's "hired by
  // someone to hit someone else").
  // ── How often the board reaches for a building you already know ──
  // This was a flat 0.4, and a flat 40% is wrong at both ends. Early
  // it is catastrophic: a new crew only draws safe-rung work, so the
  // matching pool is two or three buildings and every repeat lands on
  // the same ones — measured live at 8 mission slots yielding 5.7
  // distinct sites. Late it is still wrong, because PERCEPTION IS NOT
  // CALIBRATED: people count repeats and discount novelty, so a true
  // 40% reads as "it's always the same places" long before it is.
  //
  // THE MAP NEVER GOING STALE IS THE REPLAYABILITY. Permutations of
  // fresh sites are what lets the same crew keep playing as they
  // level, so reuse has to stay a rare flavour note for a very long
  // time. Recon is what you do BEFORE a mission; scavenging and data
  // hauls are what you do when there is no mission. Neither one needs
  // the board to hand you the same building twice.
  //
  // So the chance scales with how much of the world you have actually
  // seen, and it stretches out a very long way:
  //
  //     100 sites known ->  1%
  //   1,000 sites known ->  5%
  //  10,000 sites known -> 25% (the cap)
  //
  // Ten times the world for five times the chance — a power law, and
  // the exponent falls straight out of those two anchors rather than
  // being tuned by hand. Below a hundred it rounds to nothing, which
  // is exactly right: a player's first dozen contracts should be a
  // dozen new buildings.
  const REUSE_AT_100 = 0.01;
  const REUSE_GROWTH = Math.log10(5);   // 5x the chance per 10x the sites
  const REUSE_K = REUSE_AT_100 / Math.pow(100, REUSE_GROWTH);
  const REUSE_CAP = 0.25;

  // `known` is the whole pool the player has seen, not the band-matched
  // shortlist: the question is how big their world is, and whether a
  // reuse is POSSIBLE is a separate matter the caller settles.
  function reuseChanceFor(known) {
    if (!known || known <= 0) return 0;
    return Math.min(REUSE_CAP, REUSE_K * Math.pow(known, REUSE_GROWTH));
  }
  const CHAINED_JOB_CHANCE = 0.35; // share of multi-mission contracts that are order-gated chains (placeholder)

  // siteProvider (optional): { mint(value, orientation) } — the
  // integration layer passes one backed by the universe registry
  // (site.js's mintSite + a saved counter), so introduced sites are
  // universe-fixed buildings and only the CONTRACT is timestamped.
  // Without a provider (tests, bench), sites generate off the
  // passed rng as before.
  // `wantValue` — a specific rung, not a band. A player asking the
  // street for T1 work means T1, and a band-wide draw hands them the
  // top of the band nearly every time: measured at T1:3% / T2:29% /
  // T3:52% when the answer to "any T1 jobs?" should have been mostly
  // T1. The band is still what a REUSED site has to fall inside,
  // because a site's value is already fixed and cannot be asked to
  // move; the mint is where the request actually bites.
  function matchSite(rng, sitePool, tierId, orientation, excludeFaction, siteProvider, wantValue) {
    const band = TIER_BANDS[tierId];
    // ZERO IS AN ASK. `wantValue` is a rung, and rung 0 — an unsecured
    // building — is a real one, so the test has to be "was a rung
    // named", not "is it truthy". Reading it as falsy sent every
    // request for the softest work there is down the random path.
    const asked = wantValue !== null && wantValue !== undefined;
    const lo = asked ? Math.max(1, wantValue - 1) : band.min;
    const hi = asked ? Math.min(10, wantValue + 1) : band.max;
    let candidates = (sitePool || []).filter(
      (s) => s.identity.value >= lo && s.identity.value <= hi
    );
    if (excludeFaction) {
      candidates = candidates.filter((s) => s.identity.owningFaction !== excludeFaction);
    }
    if (candidates.length > 0 && rng.chance(reuseChanceFor((sitePool || []).length))) {
      return { site: rng.pick(candidates), wasReused: true };
    }
    // ── GRADE = VALUE + LIFT, SO DEAL THE PAIR ───────────────────
    // A site's shown grade is its strongest axis, and its condition
    // adds a flat shift to one — so choosing the value and letting the
    // condition fall where it may was choosing one of two terms and
    // hoping. Six of the eight conditions put a value-1 building above
    // T1 all by themselves, which is why "any T1 work?" answered with
    // T3s no matter how many times the board redealt.
    //
    // Pick the lift first, take the value that lands the pair on the
    // asked-for rung, then take a condition that actually lifts by
    // that much. The whole condition table stays in play — a T5 ask
    // can be a wired value-2 or a raw value-5, which are two very
    // different nights at the same grade.
    let value, condition = null;
    if (asked) {
      // A name only encodes values 1-10, so the softest thing that can
      // be MINTED is a value-1 building — an unsecured one is that
      // building with a condition that took its axes away, which is
      // exactly the lift-0 pick below.
      const floor = Math.max(1, wantValue);
      const want = Math.min(MJ.MAX_CONDITION_LIFT, Math.max(0, floor - 1));
      const lift = Math.min(want, rng.weighted([
        { item: 0, weight: 3 }, { item: 1, weight: 3 },
        { item: 2, weight: 2 }, { item: 3, weight: 2 },
      ]));
      value = Math.max(1, Math.min(10, floor - lift));
      condition = rng.pick(MJ.conditionsWithLift(floor - value));
    } else {
      value = rng.int(band.min, band.max);
    }
    const mint = () => (siteProvider
      ? siteProvider.mint(value, orientation, excludeFaction, condition)
      : MJ.generateSite(rng, { value, orientation, condition: condition || undefined }));
    let site = mint();
    let guard = 0;
    while (excludeFaction && site.identity.owningFaction === excludeFaction && guard++ < 10) {
      site = mint();
    }
    return { site, wasReused: false };
  }

  // NOTE — scale: a placeholder shape (roughly proportional to
  // Value), not a calibrated nuyen figure — see economy.js, the one
  // place karma-cost-scale/site-value-scale numbers actually become
  // nuyen. A job's total pay sums this across every mission it
  // contains, which is the actual mechanism for job pay scaling
  // without bound (§06) — never any single mission's site Value,
  // which stays capped at 10 forever.
  // Playtest-recalibrated (v0 round 2) alongside economy.js's
  // NUYEN_PER_VALUE — see the note there; the pair is what makes a
  // safe job coverable by a small crew's dispatch costs with margin
  // for a failure or two, while stretch legs fund permanents.
  const NUYEN_PER_MISSION_VALUE = 600;

  function estimateMissionPay(rng, value) {
    return Math.round(value * NUYEN_PER_MISSION_VALUE * rng.range(0.85, 1.15));
  }

  // ── One mission: the actual dispatch unit ───────────────────────
  function generateMission(rng, sitePool, hiringFaction, siteProvider, tierBias, wantValue) {
    const familyId = rng.pick(FAMILY_IDS);
    const family = JOB_FAMILIES[familyId];
    const verbId = rng.pick(family.verbs);
    const domain = rng.pick(PAYLOAD_DOMAINS);
    const tierId = tierBias || rng.pick(TIER_IDS);
    const orientation = DOMAIN_TO_ORIENTATION[domain];

    const { site, wasReused } = matchSite(rng, sitePool, tierId, orientation, hiringFaction, siteProvider, wantValue);
    const tier = tierForValue(site.identity.value);
    const intendedCrew = rollIntendedCrew(rng, familyId);

    // The moment a site enters the player's world it gets handed
    // over with first-impression security numbers — true 1-10 form,
    // only partly true (models/mission.js's ESTIMATE_ACCURACY).
    if (!site.estimatedSecurity) MJ.generateSecurityEstimate(rng, site);

    const mission = {
      hiringFaction: hiringFaction,
      targetFaction: site.identity.owningFaction,
      // "site" today; "route" (movement between two sites, excluding
      // both endpoints — a Gauntlet-style transit) is a reserved
      // shape site.js can't generate yet (§07: "the site model must
      // support route-shaped sites, not just buildings").
      locationType: "site",
      site: site,
      objectiveVerb: verbId,
      payloadDomain: domain,
      family: familyId,
      tier: tier,
      intendedCrew: intendedCrew,
      payContribution: estimateMissionPay(rng, site.identity.value),
      // Set by generateJob when the contract is a chain: the sibling
      // mission that must resolve before this one can be dispatched.
      // A direct object reference — fine in memory; the save layer
      // will need to serialize this as an index (integration work).
      requiresMission: null,
      // Karma is earned per mission, per runner, on success (via
      // models/mission.js), regardless of whether this mission was
      // the job's actual contracted deliverable or just prep work.
      resolved: false,
      karmaAward: null,
    };

    return { mission, site, wasReused };
  }

  // ── The job: one contract, one hiring faction, 1+ missions ──────
  // options: { hiringFaction?, missionCount? } — missionCount is a
  // placeholder (1-3, uniform) for how many legs a contract bundles;
  // a real distribution (and the player's own choice to run extra,
  // non-contracted prep missions against the same targets) is later
  // work, not this generator's job.
  function generateJob(rng, sitePool, currentDay, options) {
    options = options || {};
    const r = rng;

    const hiringFaction = options.hiringFaction || r.pick(MJ.FACTIONS);
    const missionCount = options.missionCount || r.int(1, 3);

    const missions = [];
    const siteResults = [];
    for (let i = 0; i < missionCount; i++) {
      const { mission, site, wasReused } = generateMission(r, sitePool, hiringFaction, options.siteProvider, options.tierBias, options.wantValue);
      missions.push(mission);
      siteResults.push({ site, wasReused });
    }

    // Some contracts are genuine chains (§06): "acquire the item,
    // deliver it, plug it in" only works in order. Others are
    // independent bundles — hit these three depots, any order, by
    // the deadline. A chained job gates each leg on the previous
    // one. Whether a chain's verbs read as a coherent story
    // (acquire -> deliver -> plant, not protect -> intel) is content
    // polish, deliberately not modeled yet.
    const chained = missionCount > 1 && r.chance(CHAINED_JOB_CHANCE);
    if (chained) {
      for (let i = 1; i < missions.length; i++) {
        missions[i].requiresMission = missions[i - 1];
      }
    }

    const basePay = missions.reduce((sum, m) => sum + m.payContribution, 0);
    // Deadline is a price axis (§06, confirmed design): a tight
    // window forces committing more of the roster at once — higher
    // odds of running dry or eating a permanent wound — so shorter
    // days-per-mission pays a premium. Placeholder shape: 3d/mission
    // -> x1.56, 10d/mission -> x1.00, linear between.
    const daysPerMission = r.int(3, 10);
    const rushMultiplier = 1 + (10 - daysPerMission) * 0.08;
    const pay = Math.round(basePay * rushMultiplier);
    const expiryDay = currentDay + daysPerMission * missionCount;

    const job = {
      hiringFaction: hiringFaction,
      missions: missions,
      pay: pay,
      daysPerMission: daysPerMission,
      rushMultiplier: rushMultiplier,
      chained: chained,
      successCriteria: "allMissions", // placeholder — generally "complete every included mission"
      expiryDay: expiryDay,
      // Reserved, not yet populated — needs standing/heat, scouting,
      // and a resolution system this file doesn't build:
      staticFacts: [],
      dynamicFacts: [],
    };

    return { job, siteResults };
  }

  // ── A small board: a handful of active contracts (§06: 4-8) ────
  // The board is DEALT by rung (§06's safe / bread-and-butter /
  // stretch), not rolled uniformly — the bottom rungs must always
  // exist so a rookie operation has work it can actually attempt,
  // and the stretch rung exists to be visibly out of reach. How
  // this mix shifts with Reputation (rep = access) is future
  // design, flagged in the build backlog.
  const BOARD_RUNG_DEAL = ["safe", "safe", "breadAndButter", "stretch"];
  const boardRungFor = (i) => BOARD_RUNG_DEAL[i % BOARD_RUNG_DEAL.length];

  // ── Fishing the board for your own lane ─────────────────────────
  // `options.wantTier` (1-10) deals the whole board off the band that
  // tier falls in, so a player who knows they can handle T1-T2 does
  // not refresh fifty times looking for work. Bias here means bias —
  // the street is not an order form, but the share of offers that
  // come back off-request is game.js's call to make, because only the
  // session can read the grade the PLAYER sees (a site's current
  // posture) rather than the band it was minted into.
  function generateBoard(rng, sitePool, currentDay, count, options) {
    options = options || {};
    const want = options.wantTier ? tierForValue(options.wantTier) : null;
    const results = [];
    for (let i = 0; i < (count || 6); i++) {
      const rung = want || boardRungFor(i);
      results.push(generateJob(rng, sitePool, currentDay, Object.assign({}, options, {
        tierBias: rung,
        // The RUNG the player asked for, not just its band — see
        // matchSite. Absent when nobody asked for anything.
        wantValue: options.wantTier || null,
      })));
    }
    return results;
  }

  MJ.OBJECTIVE_VERBS = OBJECTIVE_VERBS;
  MJ.PAYLOAD_DOMAINS = PAYLOAD_DOMAINS;
  MJ.JOB_FAMILIES = JOB_FAMILIES;
  MJ.TIER_BANDS = TIER_BANDS;
  MJ.tierForValue = tierForValue;
  MJ.boardRungFor = boardRungFor;
  MJ.reuseChanceFor = reuseChanceFor;
  // Contract-layer helper: a job COMPLETES when its success criteria
  // are met — for the current "allMissions" criteria, every included
  // mission resolved (by the dispatch layer, models/mission.js).
  // Whether/when to pay is economy.js's collectJobPay, not this.
  function isJobComplete(job) {
    return job.missions.every((m) => m.resolved);
  }

  MJ.generateMission = generateMission;
  MJ.isJobComplete = isJobComplete;
  MJ.generateJob = generateJob;
  MJ.generateBoard = generateBoard;
})();
