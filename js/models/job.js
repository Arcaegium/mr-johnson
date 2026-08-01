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
     - A job's total scope (however many missions/sites get chained
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
  // not the whole job (a job can sequence missions of different
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

  // ── Reuse vs. introduce, matched on Value + Orientation (§06) ───
  // Loose match on purpose — see site.js. excludeFaction keeps a
  // mission's target from accidentally being the same faction
  // that's hiring the job (client != target, per §06's "hired by
  // someone to hit someone else").
  const REUSE_RATIO = 0.4; // tuning dial, per the bible's own language

  function matchSite(rng, sitePool, tierId, orientation, excludeFaction) {
    const band = TIER_BANDS[tierId];
    let candidates = (sitePool || []).filter(
      (s) => s.identity.value >= band.min && s.identity.value <= band.max
    );
    if (excludeFaction) {
      candidates = candidates.filter((s) => s.identity.owningFaction !== excludeFaction);
    }
    if (candidates.length > 0 && rng.chance(REUSE_RATIO)) {
      return { site: rng.pick(candidates), wasReused: true };
    }
    const value = rng.int(band.min, band.max);
    let site = MJ.generateSite(rng, { value, orientation });
    let guard = 0;
    while (excludeFaction && site.identity.owningFaction === excludeFaction && guard++ < 10) {
      site = MJ.generateSite(rng, { value, orientation });
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
  function estimateMissionPay(rng, value) {
    return Math.round(value * 100 * rng.range(0.85, 1.15));
  }

  // ── One mission: the actual dispatch unit ───────────────────────
  function generateMission(rng, sitePool, hiringFaction) {
    const familyId = rng.pick(FAMILY_IDS);
    const family = JOB_FAMILIES[familyId];
    const verbId = rng.pick(family.verbs);
    const domain = rng.pick(PAYLOAD_DOMAINS);
    const tierId = rng.pick(TIER_IDS);
    const orientation = DOMAIN_TO_ORIENTATION[domain];

    const { site, wasReused } = matchSite(rng, sitePool, tierId, orientation, hiringFaction);
    const tier = tierForValue(site.identity.value);
    const intendedCrew = rollIntendedCrew(rng, familyId);

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
      // Reserved — needs a runner-dispatch and resolution system
      // that doesn't exist yet. Karma is earned per mission, per
      // runner, on success, regardless of whether this mission was
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
      const { mission, site, wasReused } = generateMission(r, sitePool, hiringFaction);
      missions.push(mission);
      siteResults.push({ site, wasReused });
    }

    const pay = missions.reduce((sum, m) => sum + m.payContribution, 0);
    // More legs, more time allowed — a placeholder shape, not tuned.
    const expiryDay = currentDay + r.int(3, 10) * missionCount;

    const job = {
      hiringFaction: hiringFaction,
      missions: missions,
      pay: pay,
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
  function generateBoard(rng, sitePool, currentDay, count) {
    const results = [];
    for (let i = 0; i < (count || 6); i++) {
      results.push(generateJob(rng, sitePool, currentDay));
    }
    return results;
  }

  MJ.OBJECTIVE_VERBS = OBJECTIVE_VERBS;
  MJ.PAYLOAD_DOMAINS = PAYLOAD_DOMAINS;
  MJ.JOB_FAMILIES = JOB_FAMILIES;
  MJ.TIER_BANDS = TIER_BANDS;
  MJ.tierForValue = tierForValue;
  MJ.generateMission = generateMission;
  MJ.generateJob = generateJob;
  MJ.generateBoard = generateBoard;
})();
