/* ============================================================
   Mr. Johnson — models/site.js
   The site record: generation from a seed, per design bible §09
   ("Site model: one object, three projections") and §07/§08's
   "obstacles are affordance lists" rule.

   Core rules this file implements:
     - Security is a RESULT of what a site actually is, not an
       independent roll (§06/§09). Every site has a Value (how big a
       deal the target is, 1-10) and an Orientation (a lean toward
       Physical, Astral, or Matrix, or Balanced across all three).
       The leaned axis carries Value directly; the other two get a
       steep discount — a magical research annex rolls high Astral
       almost regardless of its Physical defenses, a data-heavy corp
       site rolls high Matrix, a gang warehouse leans Physical and
       can be astrally naked entirely. A Balanced site instead rolls
       all three near Value with a small independent spread. There is
       no separate site "tier" — a job's tier derives from whichever
       site it gets matched to (§06), not from anything stored here.
     - Physical and Astral are two GENUINELY DIFFERENT encounter-
       point systems, not the same graph reused. Meatspace movement
       is gated by doors/guards/cameras on rooms, edges, and entries.
       Astral movement ignores walls entirely (§08) — only a ward
       actually blocks it — so Astral obstacles attach to rooms
       directly (a ward seals an area, not a doorway) and roaming
       spirits get their own "zone" (2-3 rooms, no adjacency
       required, since walls don't constrain them). Each point of a
       security axis is still 10% coverage of *that projection's own*
       encounter-point count — a minimum requirement, not a
       probability.
     - Every obstacle instance can roll Watsonian immunities on
       specific skills (a guard who won't be Conned, a spirit that
       resists banishing) — in-fiction reasons a normally-valid
       approach doesn't work *here*. A floor always guarantees at
       least 2 genuine non-brute-force ways in survive the roll.
     - Every obstacle's affordance list already separates quiet
       options (pick it slowly, read and slip past, route around)
       from the one loud option — this is what lets a runner get
       inside a warded room and work magic without being discovered,
       the same shape as a Stealth runner slipping past a guard
       instead of shooting them. Quiet vs. loud is Attention-tier
       flavor (§08), not a new mechanic invented here.
     - Fixed hardpoints (guards-as-posted, cameras, maglocks, wards,
       stationed spirits) are generated once and never change mid-
       mission — a scout who spent a day learning the inventory
       needs that to still be true when the crew walks in. Same-day
       pressure and between-run escalation live in models/alert.js
       (the Alert pool and the Min/Current/Max live-security layer),
       not here. This file's derived `security` numbers are each
       axis's capability ceiling (Max); obstacle distribution below
       still reads them directly at generation time — re-deriving
       placement from live Current is tracked integration work.
     - Three generator invariants (below) are enforced by
       construction, then re-verified across many random seeds in
       the dev harness rather than trusted on paper alone.

   Usage:
     const s = MJ.generateSite(rng);
     MJ.findPaths(s);        // every distinct entry->objective route
     MJ.allObstacles(s);     // every obstacle instance, any slot/projection
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── Flavor: district & owning faction ──────────────────────────
  const DISTRICTS = ["Downtown", "Redmond Barrens", "Bellevue", "Renton", "Tacoma", "Everett", "Puyallup"];
  const FACTIONS = ["Ares", "Renraku", "Mitsuhama", "Yakuza", "Ork Underground", "Independent", "Ancients"];

  // ── Value & Orientation: what a site IS, before any security ────
  // exists at all (§06/§09). Value is how big a deal the target is;
  // Orientation decides which axis carries that Value. This is what
  // the job board (Phase 1, not yet built) matches job slots against
  // — a "stretch" slot wants a high-Value site, a Matrix-flavored
  // slot wants a Matrix-leaning one — rather than security being an
  // arbitrary number with no connection to what the site actually is.
  const ORIENTATIONS = ["physical", "astral", "matrix", "balanced"];
  const ORIENTATION_DISCOUNT = 0.35; // non-leaned axes, relative to Value
  const BALANCED_SPREAD = 2;          // +/- range for a Balanced site's three axes

  function rollValue(rng) {
    return rng.int(1, 10);
  }

  function rollOrientation(rng) {
    return rng.pick(ORIENTATIONS);
  }

  // Derives the three security ratings from Value + Orientation —
  // security is a RESULT, never rolled on its own. The leaned axis
  // carries Value directly; the other two take a steep discount, so
  // a strongly-leaned site reads as genuinely lopsided (the bible's
  // "astrally naked" example), not just "usually a bit lower."
  // Balanced sites instead spread all three around Value evenly.
  function deriveSecurity(rng, value, orientation) {
    if (orientation === "balanced") {
      const vary = () => Math.max(1, Math.min(10, value + rng.int(-BALANCED_SPREAD, BALANCED_SPREAD)));
      return { physical: vary(), astral: vary(), matrix: vary() };
    }
    const discounted = Math.max(1, Math.round(value * ORIENTATION_DISCOUNT));
    const security = { physical: discounted, astral: discounted, matrix: discounted };
    security[orientation] = value;
    return security;
  }

  // ── The verb registry: every obstacle's affordance options ──────
  // Matches the design bible's own worked examples (§09) directly.
  // Every template carries 2+ distinct non-loud skill-bearing
  // affordances (or a skill-less "always available" option like
  // route-around) plus exactly one loud brute-force fallback, which
  // is never eligible for immunity. The quiet options are also what
  // keeps Attention low (§08) — this is the same "get past without
  // being noticed" shape meatspace already has, not new content.
  const OBSTACLE_TEMPLATES = {
    // Meatspace idiom
    maglock: {
      label: "Maglock door",
      affordances: [
        { skill: "electronics", verb: "pick the lock", loud: false },
        { skill: "larceny",     verb: "pick the lock", loud: false },
        { skill: "hacking",     verb: "unlock it remotely", loud: false },
        { skill: "con",         verb: "lift the key off a guard", loud: false },
        { skill: "demolitions", verb: "breach it", loud: true },
      ],
    },
    guard: {
      label: "Guard",
      affordances: [
        { skill: "stealth",  verb: "slip past unseen", loud: false },
        { skill: "con",      verb: "talk your way past", loud: false },
        { skill: "stealth",  verb: "silent takedown", loud: false },
        { skill: "presence", verb: "taunt and draw them off", loud: false },
        { skill: "firearms", verb: "fight", loud: true },
      ],
    },
    camera: {
      label: "Camera",
      affordances: [
        { skill: "electronics", verb: "loop the feed", loud: false },
        { skill: "hacking",     verb: "kill it remotely", loud: false },
        { skill: "stealth",     verb: "stay out of its arc", loud: false },
        { skill: "firearms",    verb: "shoot it out", loud: true },
      ],
    },
    // Astral idiom — the same two structural roles (barrier, sentry)
    // recast in magic's terms, not a reskin of the meatspace verbs.
    ward: {
      label: "Ward",
      affordances: [
        { skill: null,         verb: "route around", loud: false },
        { skill: "assensing",  verb: "pick it slowly", loud: false },
        { skill: "sorcery",    verb: "break it", loud: true },
      ],
    },
    spirit: {
      label: "Spirit",
      affordances: [
        { skill: "conjuring",  verb: "banish it", loud: false },
        { skill: "assensing",  verb: "read it and slip past unnoticed", loud: false },
        { skill: null,         verb: "route around", loud: false },
        { skill: "sorcery",    verb: "blast it down", loud: true },
      ],
    },
  };
  // Fixed-hardpoint obstacle types, one pool per projection. Patrols
  // move by definition — a maglock or a ward can't patrol — so
  // patrol/zone slots draw from a mobile-appropriate subset.
  const PHYSICAL_OBSTACLE_TYPES = ["maglock", "guard", "camera"];
  const PHYSICAL_PATROL_TYPES = ["guard", "camera"];
  // Astral room slots: a room can be sealed (ward) or guarded by a
  // stationed spirit. Zones (roaming) are spirit-only — a ward can't
  // patrol, it's a boundary, not a presence.
  const ASTRAL_ROOM_TYPES = ["ward", "spirit"];
  const ASTRAL_ZONE_TYPES = ["spirit"];

  // ── Watsonian immunity reasons, per skill ───────────────────────
  // Flavor placeholders (one line each) — real content-volume
  // expansion is explicitly deferred (build plan backlog), this
  // just proves the mechanic. Loud skills never appear here; they're
  // never eligible for immunity.
  const IMMUNITY_REASONS = {
    con:         "won't engage — non-verbal, drone-piloted, or simply not listening",
    presence:    "unshakeable — doesn't rattle, doesn't scare off",
    stealth:     "sensor-equipped — thermal or motion-tuned, trained to notice",
    electronics: "hardened against tampering",
    hacking:     "air-gapped — no wireless signal reaches it",
    larceny:     "tamper-evident — no clean pick",
    assensing:   "cloaked — masks itself from astral perception",
    conjuring:   "resists binding — too old, too strong, or already spoken for",
  };

  // Builds one obstacle instance: type + tier + its affordance list,
  // with tier-scaled Watsonian immunities rolled on top. Immunity
  // never touches a loud or skill-less affordance, and a floor
  // guarantees at least 2 genuine non-loud ways always survive —
  // exactly 2 is a fair outcome, never fewer, at any tier and at
  // any future obstacle type this scales to.
  const MIN_NONLOUD_WAYS = 2;

  function generateObstacleInstance(rng, typeId, tier, projection) {
    const template = OBSTACLE_TEMPLATES[typeId];
    const affordances = template.affordances.map((a) => Object.assign({}, a));

    const distinctSkills = [...new Set(
      affordances.filter((a) => !a.loud && a.skill).map((a) => a.skill)
    )];
    const hasFreeOption = affordances.some((a) => !a.loud && !a.skill);

    const blocked = new Set();
    for (const skill of distinctSkills) {
      if (rng.chance(0.1 * tier)) blocked.add(skill);
    }
    while (
      distinctSkills.length - blocked.size + (hasFreeOption ? 1 : 0) < MIN_NONLOUD_WAYS &&
      blocked.size > 0
    ) {
      blocked.delete(rng.pick([...blocked]));
    }

    for (const a of affordances) {
      if (a.skill && blocked.has(a.skill)) {
        a.blocked = true;
        a.reason = IMMUNITY_REASONS[a.skill] || "doesn't work here";
      }
    }

    return { type: typeId, label: template.label, tier, projection, affordances };
  }

  // ── Room / obstacle graph (physical) ────────────────────────────
  // A connected graph of rooms. Room 0 is always the objective room.
  // Two or more rooms carry an entry point reachable from outside.
  //
  // Generator invariant 2 (≥1 additional distinct solution chain) is
  // satisfied by construction: a main chain runs every entry point
  // to the objective, and a second entry point always feeds directly
  // into a mid-chain room, giving a structurally distinct, shorter
  // route that doesn't retrace the main chain.
  const ENTRY_TYPES = ["door", "window", "roof", "vent", "loadingDock"];
  const ANCHOR_TYPES = ["safe", "target", "objective", "terminal", "vantage", "spiritNest", "reagentNode"];

  // Room size -> post-slot count. Provisional defaults (build plan
  // backlog: revisit once real missions exist to judge the feel).
  const ROOM_SIZE_POST_SLOTS = { small: 1, medium: 2, large: 3 };

  function generatePostSlots(rng) {
    const size = rng.pick(Object.keys(ROOM_SIZE_POST_SLOTS));
    const count = ROOM_SIZE_POST_SLOTS[size];
    const slots = [];
    for (let i = 0; i < count; i++) slots.push({ physicalObstacles: [] });
    return { size, slots };
  }

  // A physical patrol is a route through 2-3 connected rooms — a
  // guard or drone group moving along corridors it actually has to
  // walk. No real-time movement simulation exists yet (that's a
  // visual-layer concern), so this stage only needs the route
  // itself, not *when* along it you'd meet the patrol.
  function generatePatrolRoute(rng, roomCount, edges) {
    const adjacency = {};
    for (let i = 0; i < roomCount; i++) adjacency[i] = [];
    for (const e of edges) {
      adjacency[e.from].push(e.to);
      adjacency[e.to].push(e.from);
    }
    const start = rng.int(0, roomCount - 1);
    const hops = rng.int(1, 2); // route length: 2-3 rooms total
    const roomIds = [start];
    let current = start;
    for (let i = 0; i < hops; i++) {
      const neighbors = adjacency[current].filter((n) => !roomIds.includes(n));
      if (neighbors.length === 0) break;
      current = rng.pick(neighbors);
      roomIds.push(current);
    }
    return { roomIds, physicalObstacles: [] };
  }

  // A spirit zone is 2-3 rooms a roaming spirit haunts — no
  // adjacency requirement at all, since astral movement passes
  // through walls. Still a real, scoutable location (which rooms),
  // just not a corridor route the way a physical patrol is.
  function generateSpiritZone(rng, roomCount) {
    const zoneSize = Math.min(roomCount, rng.int(2, 3));
    const roomIds = rng.shuffle([...Array(roomCount).keys()]).slice(0, zoneSize);
    return { roomIds, astralObstacles: [] };
  }

  // Spends a security axis's coverage budget across its own set of
  // slots, reshuffling each full pass so it spreads as evenly as the
  // budget allows — a second obstacle only ever stacks onto a slot
  // once every slot already has one, never by early-shuffle luck
  // piling extras into one place. (Concentrating security nearer the
  // objective room is a deliberate future refinement — see the build
  // plan backlog — not yet modeled; today every slot is an equal
  // draw.) The fractional remainder of the coverage target resolves
  // by weighted coin flip, so the long-run average matches the exact
  // percentage even though any single site rounds to a whole number.
  function distributeObstacles(rng, allSlots, mobileSlotSet, securityValue, staticTypes, mobileTypes, fieldName, projection) {
    const target = allSlots.length * (securityValue / 10);
    const base = Math.floor(target);
    const remainder = target - base;
    let budget = base + (rng.chance(remainder) ? 1 : 0);

    let guardLoop = 0;
    while (budget > 0 && guardLoop++ < 200) {
      const pass = rng.shuffle(allSlots);
      for (const slot of pass) {
        if (budget <= 0) break;
        const isMobile = mobileSlotSet.has(slot);
        const typeId = rng.pick(isMobile ? mobileTypes : staticTypes);
        slot[fieldName].push(generateObstacleInstance(rng, typeId, rng.int(1, securityValue), projection));
        budget--;
      }
    }
  }

  function generateLayout(rng, security) {
    const roomCount = rng.int(4, 7);
    const rooms = [];
    for (let i = 0; i < roomCount; i++) {
      const { size, slots } = generatePostSlots(rng);
      rooms.push({
        id: i,
        label: i === 0 ? "Objective Room" : `Room ${i}`,
        size: size,
        coverFlags: rng.shuffle(["low", "high", "open"]).slice(0, rng.int(1, 2)),
        anchors: i === 0 ? [rng.pick(ANCHOR_TYPES)] : [],
        postSlots: slots,          // physical: guard/camera/maglock posts
        astralObstacles: [],       // astral: this room's own ward or stationed spirit
      });
    }

    const edges = [];
    function addEdge(fromRoomId, toRoomId) {
      edges.push({ from: fromRoomId, to: toRoomId, physicalObstacles: [] });
    }

    // Main chain: outside -> room[N-1] -> ... -> room[1] -> room[0].
    const chainOrder = [];
    for (let i = roomCount - 1; i >= 0; i--) chainOrder.push(i);
    const entryPoints = [{
      id: 0,
      type: rng.pick(ENTRY_TYPES),
      roomId: chainOrder[0],
      physicalObstacles: [],
    }];
    for (let i = 0; i < chainOrder.length - 1; i++) {
      addEdge(chainOrder[i], chainOrder[i + 1]);
    }

    // Alternate route: a second entry point feeding directly into a
    // mid-chain room — a structurally distinct, shorter path to the
    // objective, reusing the main chain's own edges from there on.
    if (roomCount >= 3) {
      const midRoom = chainOrder[Math.floor(chainOrder.length / 2)];
      entryPoints.push({
        id: 1,
        type: rng.pick(ENTRY_TYPES),
        roomId: midRoom,
        physicalObstacles: [],
      });
    }

    // Physical patrol routes: 0-2 per site (provisional default —
    // build plan backlog).
    const patrolCount = rng.int(0, 2);
    const patrols = [];
    for (let i = 0; i < patrolCount; i++) {
      const route = generatePatrolRoute(rng, roomCount, edges);
      if (route.roomIds.length >= 2) patrols.push(route);
    }

    // Physical coverage: rooms' post-slots + edges + entries +
    // patrols, funded by security.physical.
    const physicalSlots = [
      ...entryPoints,
      ...edges,
      ...rooms.flatMap((r) => r.postSlots),
      ...patrols,
    ];
    distributeObstacles(rng, physicalSlots, new Set(patrols), security.physical, PHYSICAL_OBSTACLE_TYPES, PHYSICAL_PATROL_TYPES, "physicalObstacles", "physical");

    // Astral spirit zones: 0-2 per site, roaming 2-3 rooms with no
    // adjacency requirement (walls don't stop them).
    const spiritZoneCount = rng.int(0, 2);
    const spiritZones = [];
    for (let i = 0; i < spiritZoneCount; i++) {
      spiritZones.push(generateSpiritZone(rng, roomCount));
    }

    // Astral coverage: rooms themselves (a room can be warded or
    // hold a stationed spirit) + spirit zones, funded by
    // security.astral — its own slot pool, not physical's.
    const astralSlots = [...rooms, ...spiritZones];
    distributeObstacles(rng, astralSlots, new Set(spiritZones), security.astral, ASTRAL_ROOM_TYPES, ASTRAL_ZONE_TYPES, "astralObstacles", "astral");

    return { rooms, edges, entryPoints, patrols, spiritZones };
  }

  // ── Population: guard/spirit presence, not yet a patrol simulation ─
  // Phase 0 scope is the schema + invariants, not AI behavior — this
  // is deliberately just counts/flags for now, ready for patrol
  // logic to slot in later without changing the record shape.
  function generatePopulation(rng, security) {
    const guardSquadCount = Math.max(1, Math.round(security.physical / 3));
    const guardsPerSquad = rng.int(2, 4);
    const dualNaturedFraction = security.astral >= 5 ? 0.25 : 0;
    return {
      guardSquadCount,
      guardsPerSquad,
      dualNaturedGuards: Math.round(guardSquadCount * guardsPerSquad * dualNaturedFraction),
    };
  }

  // ── Top-level generator ──────────────────────────────────────────
  function generateSite(rng, options) {
    options = options || {};
    const r = rng; // consume directly — see runner.js's fork-bug note; same rule applies here

    const value = options.value || rollValue(r);
    const orientation = options.orientation || rollOrientation(r);
    const security = deriveSecurity(r, value, orientation);
    const layout = generateLayout(r, security);
    const population = generatePopulation(r, security);

    return {
      identity: {
        district: options.district || r.pick(DISTRICTS),
        owningFaction: options.faction || r.pick(FACTIONS),
        value: value,             // 1-10 — what the job board matches a job slot's tier against
        orientation: orientation, // "physical" | "astral" | "matrix" | "balanced"
      },
      security: security,
      layout: layout,
      population: population,
      // Persistence is deltas only (§09) — reserved here so the
      // record shape doesn't change later, but stays empty until the
      // player actually scouts or a job leaves a mark. Layout itself
      // always regenerates from seed. `adjustments` is where the
      // live-security layer's lasting changes (models/alert.js —
      // ratcheted Current, grown Max, the Alert value) get
      // serialized once the integration layer exists — alert.js
      // currently attaches transient state, not deltas. `intel` is where
      // per-lens scouting snapshots land once that system exists —
      // a text description ("map") of what's been learned is a
      // query over this plus `layout`, not a new data model.
      tags: [],           // { tag, expiryDay }
      intel: {},          // { [lens]: { snapshot, dayTaken } }
      adjustments: [],    // { kind, appliedDay } — hardened ice, restaffing, etc.
    };
  }

  // ── Every obstacle instance on a site, any slot, any projection ─
  function allObstacles(site) {
    const physicalSlots = [
      ...site.layout.rooms.flatMap((r) => r.postSlots),
      ...site.layout.edges,
      ...site.layout.entryPoints,
      ...site.layout.patrols,
    ];
    const astralSlots = [...site.layout.rooms, ...site.layout.spiritZones];
    return [
      ...physicalSlots.flatMap((s) => s.physicalObstacles),
      ...astralSlots.flatMap((s) => s.astralObstacles),
    ];
  }

  // ── Invariant-checking helpers — used by the dev harness to
  // verify generation across many seeds, not by generation itself.
  // Invariant 1: every obstacle template carries a loud affordance
  // by construction; this confirms it held for a specific instance.
  function hasBruteForceOption(obstacle) {
    return obstacle.affordances.some((a) => a.loud);
  }

  // Invariant 3 (no obstacle single-skill-locked): counts genuinely
  // USABLE non-loud ways in — distinct non-blocked skills, plus a
  // skill-less option like "route around" if present. Must be >= 2.
  function usableNonLoudWays(obstacle) {
    const usableSkills = new Set(
      obstacle.affordances.filter((a) => !a.loud && a.skill && !a.blocked).map((a) => a.skill)
    );
    const hasFreeOption = obstacle.affordances.some((a) => !a.loud && !a.skill);
    return usableSkills.size + (hasFreeOption ? 1 : 0);
  }

  // Invariant 2 (>=1 additional distinct solution chain): finds
  // every simple path from any entry point to the objective room
  // (room 0) through the PHYSICAL edge graph — this is a meatspace-
  // traversal property; Astral doesn't use this graph at all.
  function findPaths(site) {
    const adjacency = {};
    for (const room of site.layout.rooms) adjacency[room.id] = [];
    for (const edge of site.layout.edges) {
      adjacency[edge.from].push({ to: edge.to, edge });
      adjacency[edge.to].push({ to: edge.from, edge });
    }

    const paths = [];
    for (const entry of site.layout.entryPoints) {
      const seen = new Set();
      const stack = [{ roomId: entry.roomId, path: [entry.roomId], edgeKeys: new Set() }];
      while (stack.length) {
        const cur = stack.pop();
        if (cur.roomId === 0) {
          const key = [...cur.edgeKeys].sort().join("|");
          if (!seen.has(key)) {
            seen.add(key);
            paths.push(cur.path);
          }
          continue;
        }
        for (const next of adjacency[cur.roomId] || []) {
          if (cur.path.includes(next.to)) continue;
          const edgeKey = Math.min(cur.roomId, next.to) + "-" + Math.max(cur.roomId, next.to);
          if (cur.edgeKeys.has(edgeKey)) continue;
          const nextEdgeKeys = new Set(cur.edgeKeys);
          nextEdgeKeys.add(edgeKey);
          stack.push({ roomId: next.to, path: [...cur.path, next.to], edgeKeys: nextEdgeKeys });
        }
      }
    }
    return paths;
  }

  MJ.DISTRICTS = DISTRICTS;
  MJ.FACTIONS = FACTIONS;
  MJ.ORIENTATIONS = ORIENTATIONS;
  MJ.OBSTACLE_TEMPLATES = OBSTACLE_TEMPLATES;
  MJ.rollValue = rollValue;
  MJ.rollOrientation = rollOrientation;
  MJ.deriveSecurity = deriveSecurity;
  MJ.generateSite = generateSite;
  MJ.allObstacles = allObstacles;
  MJ.hasBruteForceOption = hasBruteForceOption;
  MJ.usableNonLoudWays = usableNonLoudWays;
  MJ.findPaths = findPaths;
})();
