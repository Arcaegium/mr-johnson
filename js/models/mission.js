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
  const MAX_ROUTE_OBSTACLES = 6;     // V1 cap on how much of a site one mission touches
  const RECON_SAMPLE = 3;            // obstacles a recon pass examines

  // ── Eligibility: a dispatch is what a contract buys ─────────────
  function isDispatchable(runner) {
    if (runner.dead) return false; // died on a job — not a market state
    return !!runner.market.hired && runner.market.phase !== "kia";
  }

  // ── Reading your own crew ──────────────────────────────────────
  // The third leg of the triangle. A job card advertises a site's
  // security as an ESTIMATE (est P:~3 A:~5) that only experience
  // confirms — but a player cannot judge whether ~5 is a problem
  // without knowing what their own crew brings against it.
  //
  // This is legitimate to show in full, by the same rule that shows
  // the dice pool in a mission prompt: it is their crew, they know
  // what they hired and what they issued. The site's number stays an
  // estimate; the gap between the two is the decision.
  const AXIS_SKILLS = {
    physical: ["stealth", "firearms", "marksmanship", "melee", "con", "intimidation", "larceny", "demolitions", "electronics"],
    astral: ["assensing", "conjuring", "sorcery"],
    matrix: ["hacking", "computer", "electronics"],
  };

  // Best pool any one crew member can bring to that axis — a team is
  // as good as its specialist, not its average.
  function crewCapability(runners) {
    const out = {};
    for (const axis of Object.keys(AXIS_SKILLS)) {
      let best = 0;
      for (const runner of runners || []) {
        for (const skill of AXIS_SKILLS[axis]) {
          const pool = MJ.dicePoolFor(runner, skill, MJ.gearBonusFor(runner, skill));
          if (pool > best) best = pool;
        }
      }
      out[axis] = best;
    }
    return out;
  }

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
    // Each obstacle carries WHERE it is, because witnessing is about
    // what else can see you from the same ground (§07). Derived
    // straight from the layout, so stamping it on the shared instance
    // is idempotent — the same obstacle is always in the same place.
    const at = (rooms, list) => {
      for (const o of list) { o.rooms = rooms; obstacles.push(o); }
    };
    const entry = site.layout.entryPoints.find((e) => e.roomId === path[0]);
    if (entry) at([entry.roomId], entry.physicalObstacles);
    for (const edge of site.layout.edges) {
      if (roomSet.has(edge.from) && roomSet.has(edge.to)) at([edge.from, edge.to], edge.physicalObstacles);
    }
    for (const room of site.layout.rooms) {
      if (!roomSet.has(room.id)) continue;
      for (const slot of room.postSlots) at([room.id], slot.physicalObstacles);
      at([room.id], room.astralObstacles);
    }
    // Patrols and spirit zones cover a BEAT of rooms rather than
    // sitting in one, so they are only met if the route crosses
    // their circuit — but met they must be. Both were generated,
    // counted toward the site's security rating, and then never
    // walked into: a guard on patrol and a spirit in its zone were
    // furniture the crew could not touch, which quietly made the
    // astral axis thin on runs and let some sites resolve with no
    // obstacles at all — a free success at a place with two guards
    // and a spirit in it.
    // KNOWN ARTIFACT: appended last, so on a route already at
    // MAX_ROUTE_OBSTACLES these are the first thing the cap drops.
    // The list is collection-ordered rather than walk-ordered
    // throughout (edges precede rooms too); making it a true
    // traversal is its own change.
    const crosses = (ids) => (ids || []).some((id) => roomSet.has(id));
    // A patrol or a zone covers its whole circuit, so it can witness
    // you anywhere along it — not just at one room.
    for (const patrol of site.layout.patrols || []) {
      if (crosses(patrol.roomIds)) at(patrol.roomIds, patrol.physicalObstacles);
    }
    for (const zone of site.layout.spiritZones || []) {
      if (crosses(zone.roomIds)) at(zone.roomIds, zone.astralObstacles);
    }
    return obstacles.slice(0, MAX_ROUTE_OBSTACLES);
  }

  // ── The host crawl ─────────────────────────────────────────────
  // A Matrix run is not the building. Walls mean nothing; what
  // constrains a decker is the system's own topology, so this walks
  // the host graph rather than the room graph — the third pillar
  // finally having its own space to be a pillar of.
  //
  // §05's Route layer is the trade this implements: the long way
  // passes more nodes, which means more ice AND more datastores, so
  // greed and exposure are the same decision. The short way skips
  // both. `wantData` is what a data-hungry run picks.
  function hostPaths(host) {
    const out = [];
    const walk = (at, seen) => {
      if (at === host.objectiveNode) { out.push(seen.concat([at])); return; }
      if (seen.length > 12) return;
      for (const e of host.edges) {
        if (e.from !== at || seen.indexOf(e.to) !== -1) continue;
        walk(e.to, seen.concat([at]));
      }
    };
    walk(host.entryNode, []);
    return out;
  }

  function hostRoute(site, opts) {
    opts = opts || {};
    const host = site.host;
    if (!host) return { path: [], obstacles: [], dataNodes: [] };
    const paths = hostPaths(host);
    if (!paths.length) return { path: [], obstacles: [], dataNodes: [] };

    // Greedy route wants datastores; a quiet run wants the fewest
    // nodes it can get away with. Same graph, opposite priorities.
    const score = (p) => {
      const dataCount = p.filter((id) => host.nodes[id].holdsData).length;
      return opts.wantData ? (dataCount * 10 - p.length) : -p.length;
    };
    const path = paths.reduce((a, b) => (score(a) >= score(b) ? a : b));

    const obstacles = [];
    const dataNodes = [];
    for (const id of path) {
      const node = host.nodes[id];
      if (node.holdsData) dataNodes.push(node);
      for (const ice of node.ice) {
        // Co-location inside the host, so witnessing works exactly
        // as it does in meatspace: two pieces of ice on one node see
        // each other's business.
        ice.rooms = ["node" + id];
        ice.hostNode = id;
        obstacles.push(ice);
      }
    }
    return { path: path, obstacles: obstacles.slice(0, MAX_ROUTE_OBSTACLES), dataNodes: dataNodes, host: host };
  }

  // ── The astral run ─────────────────────────────────────────────
  // The inverse of a break-in. §08: "movement is free, vision is
  // constrained" — an astral form passes through walls, so the whole
  // room graph the meatspace crew has to solve is simply irrelevant.
  // A corridor of guards is nothing to a projecting mage.
  //
  // Two things constrain them instead, and they are the level design:
  //   1. WARDS. "The one wall that works both ways." A ward seals an
  //      area; nothing else stops astral movement at all.
  //   2. WHAT LIVES THERE. Spirits, in their zones.
  //
  // Which yields the pillar's nastiest situation for free, straight
  // from §08: "a ward between you and your body blocks the way home."
  // Every ward crossed on the way in has to be crossed again on the
  // way out — going in is only half the budget, and a mage who
  // spends everything reaching the objective is stranded inside it.
  function astralRoute(site) {
    const objective = site.layout.rooms[0]; // room 0 is always the objective
    const inbound = [];
    for (const ward of objective.astralObstacles || []) {
      ward.rooms = ["astral-objective"];
      inbound.push(ward);
    }
    for (const zone of site.layout.spiritZones || []) {
      if ((zone.roomIds || []).indexOf(objective.id) === -1) continue;
      for (const spirit of zone.astralObstacles || []) {
        spirit.rooms = ["astral-objective"];
        inbound.push(spirit);
      }
    }
    // The way home. Only WARDS gate the exit — a spirit you slipped
    // past is not standing between you and your body, but a wall of
    // light is.
    const outbound = inbound
      .filter((o) => o.type === "ward")
      .map((ward) => Object.assign({}, ward, {
        label: ward.label + " (the way back)",
        affordances: ward.affordances.map((a) => Object.assign({}, a)),
        rooms: ["astral-objective"],
        isExitWard: true,
      }));
    return { inbound: inbound, outbound: outbound, obstacles: inbound.concat(outbound) };
  }

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
  const TETHER_PER_MAGIC = 2; // astral runs at 2 dice to meatspace's 1

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
    const matrixRun = kind === "matrixRun" ? hostRoute(site, { wantData: !!mission.wantData }) : null;
    const astralRun = kind === "astralRun" ? astralRoute(site) : null;
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
        : routeObstacles(site),
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
      neutralized: new Set(),
      extended: null, // in-progress extended work, if any (P2.1)
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
  // A quiet action only registers if it FAILED. Switch a camera off
  // properly and it has nothing left to report; read a spirit
  // correctly and it never knew you were there. Security reacts to
  // the fumble, not the deed — so a clean quiet approach is silence,
  // and an affordance's threat class is the price of getting it
  // WRONG, not the cost of doing it.
  //
  // Loud is the exception, and the only one: a gunshot is a gunshot
  // whether or not it hits.
  // Anything else on this ground that still has eyes. A guard you
  // already put down is not one; a camera you looped is not one; a
  // maglock never was. Patrols and spirit zones count anywhere along
  // their circuit, which is what makes a wide patrol route genuinely
  // worse to work under than a stationary post.
  const sensesPlane = (o, plane) => (o.senses || []).indexOf(plane) !== -1;

  function otherPerceiver(run, target, plane) {
    const here = target.rooms;
    if (!here) return false;
    return run.obstacles.some((o) =>
      o !== target && sensesPlane(o, plane) && !run.neutralized.has(o) &&
      o.rooms && o.rooms.some((r) => here.indexOf(r) !== -1));
  }

  function wasWitnessed(run, obstacle, affordance, succeeded) {
    if (affordance && affordance.loud) return true; // gunfire carries regardless

    // WHICH WORLD did this happen in? Only things that perceive on
    // that plane can have seen it. A guard has eyes in meatspace
    // only, so a decker working a host from a terminal out of his
    // sight is invisible to him — and the camera he kills does not
    // phone anyone about it. A materialised spirit is dual-natured
    // and catches both.
    const plane = MJ.planeOfAffordance(affordance);

    // A clean quiet act is seen only by something OTHER than what you
    // just handled. Take down the one guard in the room and there is
    // nobody left to have an opinion; do it in front of a camera, or
    // his partner, and "silent" was never on the table.
    if (succeeded) return otherPerceiver(run, obstacle, plane);
    // It failed. The thing you fumbled saw it if it has eyes ON THIS
    // PLANE — fumbling a hack is witnessed by the host's watchers,
    // not by the guard leaning on the door outside.
    if (sensesPlane(obstacle, plane)) return true;
    // ...and if it does not, something else on this plane may.
    if (otherPerceiver(run, obstacle, plane)) return true;
    // Nothing here perceives — but if they are already suspicious
    // they are watching the place, not the equipment.
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
  // Budgets are per AFFORDANCE, not per skill. A guard offers two
  // different stealth plays — slip past him, or put him down quietly
  // — and they are not the same swing: sharing a key meant trying
  // one silently spent the other.
  function attemptKey(index, approach) {
    return index + "#" + approach;
  }

  // What you LEARNED, though, is about the obstacle and the skill:
  // finding out he is sensor-equipped rules out sneaking generally,
  // however you found it out.
  function discoveryKey(index, skill) {
    return index + ":" + skill;
  }

  function attemptsLeft(run, index, affordance, approach) {
    const budget = affordance.attempts === undefined ? 1 : affordance.attempts;
    return budget - (run.attempts[attemptKey(index, approach)] || 0);
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

  // What the crew is looking at, and every way they could take it.
  // Blocked affordances are included on purpose — a Watsonian
  // immunity is only knowable by trying it (§06: information isn't
  // confirmed until experienced), so the UI decides what to reveal.
  function missionPrompt(run) {
    if (missionDone(run)) return null;
    if (run.extended) return extendedPrompt(run);
    const obstacle = run.obstacles[run.index];
    const options = [];
    // Effective skills are recomputed per prompt, not cached on the
    // run: a critical glitch mid-mission changes them. Once per
    // runner rather than once per runner PER affordance, though —
    // this used to allocate a fresh skill map fifteen times a prompt.
    // Anyone dropped in a firefight is out of the run — they cannot
    // front an approach from the floor.
    const upright = run.runners.filter((r) => !run.downed || !run.downed.has(r));
    const eff = upright.map((r) => MJ.getEffectiveSkills(r));
    for (let approach = 0; approach < obstacle.affordances.length; approach++) {
      const a = obstacle.affordances[approach];
      // Skill-less affordances are real approaches, not filler:
      // "route around" costs a beat and needs nobody trained. These
      // used to be dropped here, which meant a crew with no magic
      // was told there was NOTHING to try against a spirit it could
      // simply have walked around.
      if (!a.skill) {
        const leftNoSkill = attemptsLeft(run, run.index, a, approach);
        options.push({
          skill: null, approach: approach, verb: a.verb, loud: !!a.loud,
          blocked: !!a.blocked, reason: a.reason || null,
          discovered: null, runner: null, pool: 0,
          attemptsLeft: leftNoSkill, noRoll: true,
          available: leftNoSkill > 0,
        });
        continue;
      }
      let best = null;
      for (let ri = 0; ri < upright.length; ri++) {
        const runner = upright[ri];
        const trained = eff[ri][a.skill] || 0;
        if (trained <= 0) continue;
        // Ranked by the pool they will ACTUALLY roll — the same
        // definition resolveTask uses, so the toolkit-holder wins
        // ties against a bare-handed equal, and the runner with the
        // better linked attribute wins against an equally-trained
        // one. Computing this separately is what let the popup show
        // a number a whole attribute short of the real roll.
        const pool = MJ.dicePoolFor(runner, a.skill, MJ.gearBonusFor(runner, a.skill));
        if (!best || pool > best.pool) best = { runner: runner, pool: pool };
      }
      const left = attemptsLeft(run, run.index, a, approach);
      const known = run.discovered[discoveryKey(run.index, a.skill)] || null;
      options.push({
        skill: a.skill, approach: approach, verb: a.verb, loud: !!a.loud,
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
    return run.runners.filter((r) => !run.downed || !run.downed.has(r)).map((r) =>
      MJ.makeCombatant(r, Object.assign({ side: "crew", ammo: 30 }, MJ.combatLoadoutFor(r))));
  }

  // Going down is where mission risk finally has teeth. The bible's
  // old "a runner can never die on a job" was written when a mission
  // was a dice check nobody watched; now the player sees the tracks
  // fill, chooses to press or withdraw, and can pull out. A death
  // they saw coming is a consequence, not an ambush.
  //
  // The wound scales with how badly they were overmatched, rather
  // than a flat -1: being dropped by a tier-9 hardsuit marks a
  // career in a way a rent-a-cop does not.
  function resolveTakedown(run, combatant) {
    const runner = combatant.source;
    const overflow = Math.max(0,
      (combatant.physical - combatant.physicalMax) + (combatant.stun - combatant.stunMax));
    if (run.rng.chance(DEATH_ON_TAKEDOWN)) {
      // `dead` is its own flag, deliberately NOT market.phase="kia".
      // The phase machine describes runners on the WATCH LIST, and
      // hiring suppresses it — writing a phase onto a hired runner
      // both broke that invariant and made a corpse look like it was
      // still cycling through availability. Dying on a job is not a
      // market state; the roster sweep removes them at day's end.
      runner.dead = true;
      if (runner.market) runner.market.hired = null; // the contract ends with them
      return { runner: runner.identity.handle, died: true };
    }
    const severity = 1 + Math.floor(overflow / 4);
    runner.wounds += severity;
    return { runner: runner.identity.handle, died: false, wounds: severity };
  }

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
      const weapon = MJ.weaponProfile(actor.weaponId);
      const mode = weapon.modes.indexOf("BF") !== -1 ? "BF" : weapon.modes[0];
      MJ.combatAct(combat, { target: target, mode: mode, stance: actor.side === "crew" ? "cover" : "open" });
    }

    const casualties = [];
    for (const c of crew) {
      if (!c.down) continue;
      if (!run.downed) run.downed = new Set();
      run.downed.add(c.source);
      casualties.push(resolveTakedown(run, c));
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
      won: won, stalemate: stalemate, rounds: combat.round, casualties: casualties,
      enemies: foes.map((f) => f.name),
      enemiesDown: foes.filter((f) => f.down).length,
      surprise: !!opts.surprise,
      log: combat.log,
    };
  }

  // Drain lands on the caster, not the target. Stun normally — they
  // are wrung out, and it clears with rest. PHYSICAL if they
  // overcast, because reaching past what you can hold is an injury,
  // and that is the line the mage chooses to cross or not.
  //
  // Enough Drain drops them out of the run, exactly like a takedown:
  // a mage who overreaches on the second door is not walking to the
  // fifth. Wounds land through the same path as any other casualty.
  const DRAIN_DOWN_THRESHOLD = 8;

  function applyDrain(run, runner, drain) {
    if (!drain || drain.damage <= 0) return drain;
    if (!run.drainTaken) run.drainTaken = new Map();
    const total = (run.drainTaken.get(runner) || 0) + drain.damage;
    run.drainTaken.set(runner, total);
    if (total >= DRAIN_DOWN_THRESHOLD) {
      if (!run.downed) run.downed = new Set();
      if (!run.downed.has(runner)) {
        run.downed.add(runner);
        drain.dropped = true;
        drain.casualty = resolveTakedown(run, {
          source: runner,
          physical: drain.physical ? total : 0,
          physicalMax: DRAIN_DOWN_THRESHOLD,
          stun: drain.physical ? 0 : total,
          stunMax: DRAIN_DOWN_THRESHOLD,
        });
      }
    }
    return drain;
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
    runner.wounds += 1; // placeholder wound rule — real damage lands in P2.3
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

    if (test.success && w.affordance && w.affordance.neutralizes) {
      run.neutralized.add(obstacle);
    }
    if (test.criticalGlitch) {
      applyCriticalGlitch(run, w.runner);
    }

    // The attempt is spent whether or not anybody saw it — otherwise
    // an unwitnessed failure left the approach infinitely retryable,
    // because the attempt was only being counted inside the witness
    // path.
    const key = attemptKey(run.index, w.approach);
    run.attempts[key] = (run.attempts[key] || 0) + 1;

    const task = {
      obstacle: obstacle.label, tier: obstacle.tier,
      runner: w.runner.identity.handle, skill: test.skillId,
      extended: true, intervals: test.intervals,
      hits: test.hits, threshold: test.threshold,
      pool: w.startPool, loud: !!(w.affordance && w.affordance.loud),
      success: test.success, glitch: test.glitch, criticalGlitch: test.criticalGlitch,
      exhausted: test.exhausted,
    };

    const read = witnessExtended(run, obstacle, w, test, run.attempts[key]);
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
    if (!wasWitnessed(run, obstacle, w.affordance, test.success)) return null;
    const cls = threatClassFor(w.affordance, tries);
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

  function missionChoose(run, choice) {
    if (missionDone(run)) return null;
    if (run.extended) return missionExtendedStep(run, choice !== null);
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
    // Resolve the affordance the caller actually picked. Finding it
    // by skill alone silently collapsed distinct approaches: choose
    // "silent takedown" against a guard and you got "slip past
    // unseen" instead — a different verb AND a different threat
    // class (threatening vs. questionable). `approach` comes back
    // from missionPrompt; the by-skill lookup stays for callers that
    // never had a prompt in front of them.
    const approach = typeof choice.approach === "number" ? choice.approach
      : obstacle.affordances.findIndex((a) => a.skill === skill);
    const affordance = obstacle.affordances[approach];

    // Magic asks a question no other approach does: how hard are you
    // pushing? Force adds dice to the casting AND raises the Drain
    // that comes back, so a mage who reaches for a big result is
    // deliberately risking dropping themselves. Default is a safe
    // cast at their own Magic; the popup can offer more.
    let drain = null;
    if (affordance && MJ.SKILL_PLANE[skill] === "astral" && (runner.attributes.magic || 0) > 0) {
      const force = Math.max(1, Math.min(MJ.maxForceFor(runner),
        choice.force || runner.attributes.magic));
      drain = MJ.resistDrain(run.rng, runner, force);
      run.castForce = force;
      applyDrain(run, runner, drain);
    }

    // A violent approach against something that can fight back opens
    // COMBAT rather than resolving as one roll. This is what finally
    // kills `attempts: 1` on "fight": you never ran out of ability to
    // shoot, you were only ever limited by what shooting costs — and
    // the cost is the exchange itself, plus everything it summons.
    if (affordance && affordance.loud && obstacle.fights) {
      // Undetected when the shooting starts = the ambush. Once they
      // already read you as threatening there is no surprise to have.
      const band = MJ.threatBand(run.state, run.day);
      const surprise = band === "normal" && !MJ.alertEngaged(run.state);
      const fight = runCombat(run, obstacle, { surprise: surprise });

      run.anyLoud = true;
      const key = attemptKey(run.index, approach);
      run.attempts[key] = (run.attempts[key] || 0) + 1;

      const task = {
        obstacle: obstacle.label, tier: obstacle.tier,
        runner: runner.identity.handle, skill: skill,
        combat: true, surprise: fight.surprise, rounds: fight.rounds,
        enemies: fight.enemies, enemiesDown: fight.enemiesDown,
        casualties: fight.casualties, loud: true,
        stalemate: fight.stalemate,
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

    // An extended approach opens a piece of WORK rather than taking a
    // swing. The first interval rolls immediately so the player has
    // something to judge, then the run parks in that state and every
    // subsequent prompt asks the only question that matters: another
    // interval, or cut losses?
    if (affordance && affordance.extended) {
      const startPool = MJ.dicePoolFor(runner, skill, run.intelBonus +
        MJ.gearBonusFor(runner, skill) + suppressionBonus(run.site, obstacle.projection, run.day));
      run.extended = {
        runner: runner, verb: affordance.verb, affordance: affordance,
        approach: approach, startPool: startPool,
        test: MJ.beginExtendedTest(runner, skill, extendedThreshold(obstacle.tier), {}),
      };
      run.extended.test.pool = startPool; // gear/intel/suppression all count
      return missionExtendedStep(run, true);
    }

    // The no-roll approach: nobody tests anything, it just costs the
    // beat. It still counts as an act, so a normal-class route-around
    // reads as nothing while a louder one would still be seen.
    if (!skill) {
      // Same key attemptsLeft derives from, or the budget would
      // never tick down and "route around" would be infinite.
      const noRollKey = attemptKey(run.index, approach);
      run.attempts[noRollKey] = (run.attempts[noRollKey] || 0) + 1;
      const task = { obstacle: obstacle.label, tier: obstacle.tier, result: affordance ? affordance.verb : "went around" };
      // Nothing was rolled, so nothing was fumbled — a no-roll
      // approach can only be seen by being loud.
      if (wasWitnessed(run, obstacle, affordance, true)) {
        const cls = threatClassFor(affordance, run.attempts[noRollKey]);
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
      bonusDice: run.intelBonus + MJ.gearBonusFor(runner, skill) + boostDice +
        suppressionBonus(run.site, obstacle.projection, run.day),
    });
    if (affordance && affordance.loud) run.anyLoud = true;
    if (outcome.glitch) run.anyGlitch = true;
    let guarded = null;
    if (outcome.criticalGlitch) guarded = applyCriticalGlitch(run, runner);
    // Anything that removes a set of eyes has to do so BEFORE the
    // witness check, or the thing you just took down gets a vote.
    if (outcome.success && affordance && affordance.neutralizes) {
      run.neutralized.add(obstacle);
    }
    // Every exchange out there is time on the tether.
    tickTether(run);

    // What did that reveal, and did anything see it?
    const key = attemptKey(run.index, approach);
    run.attempts[key] = (run.attempts[key] || 0) + 1;
    // A blocked affordance is discovered by trying it — you learn the
    // box is air-gapped by reaching for a signal that isn't there.
    // Filed against the SKILL: what you found out is that this
    // approach does not work on this thing, not that this one verb
    // does not.
    if (outcome.ok === false && affordance && affordance.blocked) {
      run.discovered[discoveryKey(run.index, skill)] = affordance.reason || "doesn't work here";
    }
    let read = null;
    let tipped = false;
    if (wasWitnessed(run, obstacle, affordance, outcome.success)) {
      const cls = threatClassFor(affordance, run.attempts[key]);
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
      runner: runner.identity.handle, skill: skill, pool: outcome.poolSize,
      loud: affordance ? !!affordance.loud : false, hits: outcome.hits, threshold: outcome.threshold,
      success: outcome.success, glitch: outcome.glitch, criticalGlitch: outcome.criticalGlitch,
      boosted: boostLabel, guarded: guarded,
      rejected: outcome.ok === false ? outcome.error : null,
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

  // How many ways of getting past THIS obstacle the crew still has:
  // trained, budget left, and not yet discovered to be useless here.
  function remainingApproaches(run) {
    const obstacle = run.obstacles[run.index];
    if (!obstacle) return 0;
    const eff = run.runners
      .filter((r) => !run.downed || !run.downed.has(r))
      .map((r) => MJ.getEffectiveSkills(r));
    let n = 0;
    for (let approach = 0; approach < obstacle.affordances.length; approach++) {
      const a = obstacle.affordances[approach];
      if (attemptsLeft(run, run.index, a, approach) <= 0) continue;
      // A skill-less approach needs nobody trained and nothing
      // known — it counts. Skipping it here while missionPrompt
      // offered it meant a crew could be declared out of options
      // with "route around" still sitting on the screen.
      if (!a.skill) { n += 1; continue; }
      if (run.discovered[discoveryKey(run.index, a.skill)]) continue;
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

  // ── Quick resolve: the stepper, driven by the auto-chooser ──────
  // The auto-chooser only sees what the crew still actually has:
  // untried-or-unexhausted approaches nobody has discovered to be
  // useless here. Quiet beats loud, then the biggest pool. This is
  // the house playing your hand for you — the same seat the popup
  // hands to the player, and deliberately the same stepper.
  function autoResolve(run) {
    let guard = 0;
    while (!missionDone(run) && guard++ < 500) {
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

  MJ.crewCapability = crewCapability;
  MJ.AXIS_SKILLS = AXIS_SKILLS;
  MJ.RECON_LENSES = RECON_LENSES;
  MJ.isDispatchable = isDispatchable;
  MJ.createReconMission = createReconMission;
  MJ.createMatrixMission = createMatrixMission;
  MJ.createAstralMission = createAstralMission;
  MJ.astralRoute = astralRoute;
  MJ.tetherFor = tetherFor;
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
  MJ.missionExtendedStep = missionExtendedStep;
  MJ.extendedThreshold = extendedThreshold;
  MJ.missionAbort = missionAbort;
  MJ.missionDone = missionDone;
  MJ.finishMission = finishMission;
  MJ.discoverResourceSite = discoverResourceSite;
  MJ.missionKind = missionKind;
  MJ.autoResolve = autoResolve;
  MJ.openDispatch = openDispatch;
  MJ.closeDispatch = closeDispatch;
  MJ.runActionPeriod = runActionPeriod;
})();
