/* ============================================================
   Mr. Johnson — models/job.js
   The job record: generation from a seed, per design bible §06
   ("Jobs, The Board & Missions").

   Core rules this file implements:
     - A job is a grammar, not a type: objective verb x payload
       domain x a matched site x a derived tier. No hand-authored
       job list.
     - Security is a result of the site (§09, site.js) — a job's
       tier and pay are simply a readout of whichever site got
       matched, never an independent roll. Payload domain maps to
       the Orientation a matching site is sought for (physical ->
       Physical, data -> Matrix, astral -> Astral).
     - Reuse vs. introduce (§06): given an existing site pool, a job
       either reuses the closest Value/Orientation match or
       introduces a fresh site calibrated to what the slot wants.
       The match is loose on purpose — a job can run a bit harder
       or easier than its tier label implies, and that gap is meant
       to be discoverable through scouting later, not hidden here.
     - Crew size: intended (fixed or a range) is board-card metadata,
       never a hard requirement — runnable-vs-solvable is a mission-
       resolution concern, not something this generator enforces.
     - This file does NOT implement: faction standing/heat (needs
       persistent cross-job state the save layer doesn't carry yet),
       tags/combos (needs job outcomes, which need a resolution
       system that doesn't exist), or static/dynamic complications
       (needs scouting). Deliberately deferred, not forgotten — see
       the build plan backlog.

   Usage:
     const { job, site, wasReused } = MJ.generateJob(rng, sitePool, currentDay);
     const board = MJ.generateBoard(rng, sitePool, currentDay, 6);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── The job grammar: objective verb x payload domain ────────────
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

  // ── The three job families (§06) ────────────────────────────────
  const JOB_FAMILIES = {
    infiltration: { label: "Infiltration", maxCrew: 4, verbs: ["acquire", "extract", "eliminate", "sabotage", "intel", "plant"] },
    gauntlet:     { label: "Gauntlet",     maxCrew: 4, verbs: ["protect", "deliver"] },
    remote:       { label: "Remote",       maxCrew: 1, verbs: ["acquire", "intel", "eliminate"] },
  };
  const FAMILY_IDS = Object.keys(JOB_FAMILIES);

  // ── Intended crew size: fixed number or a suggested range (§06) ─
  // Board-card metadata, visible before commit — never a hard
  // requirement (runnable is universal, solvable is a separate
  // question, both mission-resolution concerns, not this file's).
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
  // stretch). A job's tier is simply which band its matched site's
  // Value fell into, not a separate roll.
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
  // Loose match on purpose: prefer a pool site whose Value falls in
  // the desired band, but don't require an exact Orientation hit —
  // a mismatch here is exactly what scouting exists to surface later
  // (a "safe" job that landed on an unusually well-defended site).
  const REUSE_RATIO = 0.4; // tuning dial, per the bible's own language

  function matchSite(rng, sitePool, tierId, orientation) {
    const band = TIER_BANDS[tierId];
    const candidates = (sitePool || []).filter(
      (s) => s.identity.value >= band.min && s.identity.value <= band.max
    );
    if (candidates.length > 0 && rng.chance(REUSE_RATIO)) {
      return { site: rng.pick(candidates), wasReused: true };
    }
    const value = rng.int(band.min, band.max);
    const site = MJ.generateSite(rng, { value, orientation });
    return { site, wasReused: false };
  }

  // ── Client / target (§06) ───────────────────────────────────────
  // Target is simply the matched site's owning faction — you're
  // sent against whoever already owns the place. Client is a
  // different faction who hired you. Standing/heat tracking is
  // deferred (needs persistent cross-job state the save layer
  // doesn't carry yet).
  function pickClient(rng, targetFaction) {
    const candidates = MJ.FACTIONS.filter((f) => f !== targetFaction);
    return rng.pick(candidates);
  }

  // NOTE — scale: like runner.js's computePrice, this is a
  // placeholder shape (roughly proportional to Value), not a
  // calibrated nuyen figure. Real economy calibration is deferred
  // to when hiring costs, gear prices, and upkeep all exist to
  // weigh it against.
  function estimatePay(rng, value) {
    return Math.round(value * 100 * rng.range(0.85, 1.15));
  }

  // ── Top-level generator ──────────────────────────────────────────
  // sitePool: the persistent site pool to reuse from (an array of
  // already-generated sites) — pass [] or omit if none exist yet.
  // currentDay: for stamping the job's expiry.
  function generateJob(rng, sitePool, currentDay, options) {
    options = options || {};
    const r = rng;

    const familyId = options.familyId || r.pick(FAMILY_IDS);
    const family = JOB_FAMILIES[familyId];
    const verbId = options.verbId || r.pick(family.verbs);
    const domain = options.domain || r.pick(PAYLOAD_DOMAINS);
    const tierId = options.tierId || r.pick(TIER_IDS);

    const orientation = DOMAIN_TO_ORIENTATION[domain];
    const { site, wasReused } = matchSite(r, sitePool, tierId, orientation);
    const actualTierId = tierForValue(site.identity.value); // the site is the source of truth

    const intendedCrew = rollIntendedCrew(r, familyId);
    const target = site.identity.owningFaction;
    const client = pickClient(r, target);
    const pay = estimatePay(r, site.identity.value);
    const expiryDay = currentDay + r.int(3, 10);

    const job = {
      objectiveVerb: verbId,
      payloadDomain: domain,
      family: familyId,
      tier: actualTierId,       // derived from the matched site's Value, not an independent roll
      intendedCrew: intendedCrew,
      client: client,
      target: target,
      pay: pay,
      expiryDay: expiryDay,
      // Reserved, not yet populated — needs standing/heat, scouting,
      // and a resolution system this file doesn't build:
      staticFacts: [],
      dynamicFacts: [],
    };

    return { job, site, wasReused };
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
  MJ.generateJob = generateJob;
  MJ.generateBoard = generateBoard;
})();
