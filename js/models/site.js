/* ============================================================
   Mr. Johnson — models/site.js
   The site record: generation from a seed, per current understanding §09
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

  // ── Flavor: districts & owners ─────────────────────────────────
  // FACTIONS are the seven CLIENTS/OWNERS with agendas — the only
  // parties who hire. Site OWNERSHIP is wider: a site can also be
  // Unowned (squatters, ferals, nobody's ledger). And the sprawl
  // has edges: the wilderness districts (the elf-touched forests
  // outside the metroplex) exist mostly for resource sites and
  // whatever the player calls in.
  const DISTRICTS = ["Downtown", "Redmond Barrens", "Bellevue", "Renton", "Tacoma", "Everett", "Puyallup"];
  const WILD_DISTRICTS = ["Salish Wilds", "Snoqualmie Forest"];
  const SITE_DISTRICTS = DISTRICTS.concat(WILD_DISTRICTS); // 9 — the full encodable space
  const FACTIONS = ["Ares", "Renraku", "Mitsuhama", "Yakuza", "Ork Underground", "Independent", "Ancients"];
  const OWNERS = FACTIONS.concat(["Unowned"]); // 8 — the full encodable space

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
  // a strongly-leaned site reads as genuinely lopsided (the current understanding's
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
  // Matches the current understanding's own worked examples (§09) directly.
  // Every template carries 2+ distinct non-loud skill-bearing
  // affordances (or a skill-less "always available" option like
  // route-around) plus exactly one loud brute-force fallback, which
  // is never eligible for immunity. The quiet options are also what
  // keeps Attention low (§08) — this is the same "get past without
  // being noticed" shape meatspace already has, not new content.
  // ── Threat classes (§09 "Threat read") ─────────────────────────
  // What an act reveals about your intent IF something witnesses it
  // — intrinsic to the act, not to whether it worked. `escalates`
  // marks approaches whose class rises on repetition, because the
  // obstacle's own safeguard handled the first try: a ward keeps
  // dual-natured beings out, a guard tells a bad liar to get lost,
  // an account locks itself. Persisting past a safeguard is what
  // turns a curiosity into someone with a purpose.
  const THREAT = { NORMAL: "normal", AWKWARD: "awkward", QUESTIONABLE: "questionable", THREATENING: "threatening" };

  // ── Which world an act happens in ──────────────────────────────
  // An act is only witnessed by things that perceive on ITS plane.
  // A decker jacked into a terminal out of a guard's line of sight
  // kills the camera and the guard does not know — the work happened
  // in the Matrix, and a dead camera does not phone anyone. He can
  // then walk up and put the guard down, and still nothing has been
  // witnessed, because nothing was there to witness it.
  //
  // The plane follows the SKILL by default, because the skill is
  // what says where the runner's attention actually is. The
  // exception that matters: doing the same job with your hands is a
  // physical act even when the target is a machine — "loop the feed"
  // is someone at the camera with a splice, "kill it remotely" is
  // someone in the host. Same obstacle, same result, different
  // witnesses. An affordance can override with `plane`.
  const SKILL_PLANE = {
    hacking: "matrix",
    sorcery: "astral", conjuring: "astral", assensing: "astral", enchanting: "astral",
  };

  function planeOfAffordance(affordance) {
    if (!affordance) return "physical";
    if (affordance.plane) return affordance.plane;
    return SKILL_PLANE[affordance.skill] || "physical";
  }

  const OBSTACLE_TEMPLATES = {
    // Meatspace idiom
    maglock: {
      label: "Maglock door",
      // A lock forms no opinions, on any plane.
      senses: [],
      affordances: [
        { skill: "electronics", verb: "pick the lock", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "larceny",     verb: "pick the lock", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "hacking",     verb: "unlock it remotely", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "con",         verb: "lift the key off a guard", loud: false, threat: THREAT.THREATENING, attempts: 1 },
        { skill: "demolitions", verb: "breach it", loud: true, threat: THREAT.THREATENING, attempts: 1 },
      ],
    },
    guard: {
      label: "Guard",
      // Eyes, in meatspace only. A guard cannot see a decker working
      // in the Matrix or a mage moving on the astral — that is the
      // whole point of those being separate worlds.
      senses: ["physical"],
      // Shoots back. A camera does not, a maglock cannot — only
      // things that can fight turn a violent approach into an
      // actual exchange rather than target practice.
      fights: true,
      armour: 3, weapon: "smg",
      affordances: [
        { skill: "stealth",  verb: "slip past unseen", loud: false, threat: THREAT.QUESTIONABLE, attempts: 1 },
        // One shot: you cannot re-smooth-talk someone who just called
        // your bluff, and adjacent guards are one audience.
        { skill: "con",      verb: "talk your way past", loud: false, threat: THREAT.AWKWARD, attempts: 1 },
        // `neutralizes` = this obstacle stops being able to see. That
        // is the whole point of a takedown: done cleanly against the
        // only pair of eyes in the room, there is nobody left to have
        // an opinion. Done in front of a camera, there is.
        { skill: "stealth",  verb: "silent takedown", loud: false, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
        // Loud without being dangerous — a belligerent asshole, not
        // someone who needs shooting.
        { skill: "intimidation", verb: "taunt and draw them off", loud: false, threat: THREAT.AWKWARD, attempts: 1 },
        { skill: "firearms", verb: "fight", loud: true, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
      ],
    },
    camera: {
      label: "Camera",
      // Watches the room. It does not watch the host it lives on —
      // a camera has no idea it is being hacked, and it certainly
      // does not announce having been switched off.
      senses: ["physical"],
      affordances: [
        // A looped feed is a blind camera — it is still bolted to the
        // wall, but it cannot witness anything after this.
        { skill: "electronics", verb: "loop the feed", loud: false, threat: THREAT.QUESTIONABLE, extended: true, neutralizes: true },
        { skill: "hacking",     verb: "kill it remotely", loud: false, threat: THREAT.QUESTIONABLE, extended: true, neutralizes: true },
        // Staying out of the arc leaves it live and watching.
        { skill: "stealth",     verb: "stay out of its arc", loud: false, threat: THREAT.QUESTIONABLE, attempts: 1 },
        { skill: "firearms",    verb: "shoot it out", loud: true, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
      ],
    },
    // Astral idiom — the same two structural roles (barrier, sentry)
    // recast in magic's terms, not a reskin of the meatspace verbs.
    ward: {
      label: "Ward",
      // A ward is a barrier, not a sentry. It keeps you out; it does
      // not form an opinion or tell anyone. Leaning on it repeatedly
      // still escalates what the act LOOKS like — but only if
      // something with eyes (a spirit, a guard, a camera) is there to
      // see you doing it.
      senses: [],
      affordances: [
        { skill: null,         verb: "route around", loud: false, threat: THREAT.NORMAL, attempts: 1 },
        // The ward keeps you out on its own — that safeguard is why
        // a first press is merely offputting, and why leaning on it
        // again is not.
        { skill: "assensing",  verb: "pick it slowly", loud: false, threat: THREAT.AWKWARD, escalates: true, extended: true },
        { skill: "sorcery",    verb: "break it", loud: true, threat: THREAT.THREATENING, attempts: 1 },
      ],
    },
    // ── Matrix idiom ─────────────────────────────────────────────
    // Ice is the host's security, and it senses in the MATRIX only —
    // which is the whole reason a decker working from a terminal is
    // invisible to the guard standing next to him, and equally why
    // fumbling a hack is seen by things the guard will never hear
    // about. Same structural roles as everywhere else: a barrier to
    // get through, a sentry that objects, one loud way past.
    barrierIce: {
      label: "Barrier ICE",
      senses: [],  // a wall logs nothing; it simply does not open
      affordances: [
        { skill: "hacking",     verb: "slip the barrier", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "electronics", verb: "spoof its credentials", loud: false, threat: THREAT.AWKWARD, escalates: true, attempts: 2 },
        { skill: null,          verb: "route around the node", loud: false, threat: THREAT.NORMAL, attempts: 1 },
        { skill: "hacking",     verb: "hammer it down", loud: true, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
      ],
    },
    patrolIce: {
      label: "Patrol ICE",
      senses: ["matrix"],
      affordances: [
        { skill: "hacking",     verb: "mask your icon", loud: false, threat: THREAT.QUESTIONABLE, attempts: 1 },
        { skill: "computer",    verb: "pass as legitimate traffic", loud: false, threat: THREAT.AWKWARD, escalates: true, attempts: 2 },
        { skill: "hacking",     verb: "corrupt its patrol route", loud: false, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
        { skill: "hacking",     verb: "burn it out", loud: true, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
      ],
    },
    blackIce: {
      label: "Black ICE",
      senses: ["matrix"],
      // It bites back. A decker in hot sim takes real damage, which
      // is why a Matrix run is not a safe alternative to a break-in.
      fights: true,
      armour: 4, weapon: "blackHammer",
      affordances: [
        { skill: "hacking",     verb: "slide past it", loud: false, threat: THREAT.QUESTIONABLE, attempts: 1 },
        { skill: "computer",    verb: "feed it a decoy icon", loud: false, threat: THREAT.AWKWARD, escalates: true, attempts: 2 },
        { skill: "hacking",     verb: "attack it directly", loud: true, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
      ],
    },
    spirit: {
      label: "Spirit",
      // DUAL-NATURED: a materialised spirit perceives the astral and
      // the physical at once, which is exactly what makes it the
      // hardest thing on a site to work around.
      senses: ["astral", "physical"],
      dualNatured: true,
      fights: true,
      armour: 4, weapon: "unarmed",
      affordances: [
        { skill: "conjuring",  verb: "banish it", loud: false, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
        // Two ways past a sentry, astral or otherwise: out of its
        // notice, or in plain view and unremarkable. Blowing the
        // covert one is worse than blowing the overt one — being
        // caught sneaking says more about you than being sensed
        // walking through does. (Stealth vs. awareness gets its own
        // treatment later; this is the structure, not the depth.)
        { skill: "stealth",    verb: "sneak around it", loud: false, threat: THREAT.QUESTIONABLE, attempts: 1 },
        { skill: "assensing",  verb: "walk past without tripping it", loud: false, threat: THREAT.AWKWARD, escalates: true, attempts: 3 },
        { skill: null,         verb: "route around", loud: false, threat: THREAT.NORMAL, attempts: 1 },
        { skill: "sorcery",    verb: "blast it down", loud: true, threat: THREAT.THREATENING, attempts: 1, neutralizes: true },
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
    intimidation: "unshakeable — doesn't rattle, doesn't scare off",
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

    // `senses` rides the instance: WHICH WORLDS this thing can
    // witness an act in. A guard has eyes in meatspace only; a
    // materialised spirit is dual-natured and sees both the astral
    // and the physical; a maglock sees nothing anywhere. `perceives`
    // stays as a convenience for "can it witness anything at all".
    // `fights` and its loadout ride along too: a guard shoots back,
    // a maglock does not, and that is the difference between a fight
    // and target practice. Armour and attributes scale with tier —
    // a T9 guard is corp security in a hardsuit, a T1 is a rent-a-cop.
    return {
      type: typeId, label: template.label, tier, projection,
      senses: (template.senses || []).slice(),
      perceives: (template.senses || []).length > 0,
      dualNatured: !!template.dualNatured,
      fights: !!template.fights,
      armour: template.fights ? (template.armour || 0) + Math.floor(tier / 2) : 0,
      weapon: template.weapon || "unarmed",
      affordances,
    };
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

  // ── The host: the Matrix's own graph ───────────────────────────
  // `security.matrix` used to generate NOTHING — 4198 physical and
  // 1452 astral obstacles across 600 sites, and exactly 0 matrix.
  // A Matrix-leaning site was mechanically empty on its own axis:
  // the number was decorative, and the third pillar had no content
  // to be a pillar of.
  //
  // A host is not the building. Walls mean nothing here; what
  // constrains a decker is the topology of the system itself, so
  // this is its own graph with its own node types — never the room
  // graph reskinned. Node 0 is always the entry (the public face);
  // the objective sits deepest.
  //
  // §05's four layers are Intel, Loadout, Route and Encounter. This
  // builds ROUTE and ENCOUNTER, which is what scene-text owes: the
  // node-traversal puzzle, with ice as ordinary affordance-bearing
  // obstacles so the whole existing stepper drives it. Loadout as a
  // RAM/card economy is the deck-building layer on top, later.
  const NODE_TYPES = {
    spu:       { label: "SPU",        alert: 1, canHoldObjective: false },
    datastore: { label: "Datastore",  alert: 2, canHoldObjective: true, data: true },
    slave:     { label: "Slave node", alert: 2, canHoldObjective: false, controlsDevices: true },
    ds:        { label: "Data store", alert: 3, canHoldObjective: true, data: true },
    cpu:       { label: "CPU",        alert: 4, canHoldObjective: true },
  };

  const ICE_TYPES = ["barrierIce", "patrolIce", "blackIce"];

  function generateHost(rng, security) {
    const rating = security.matrix;
    // Node count tracks the rating the same way physical coverage
    // does — a bigger system is a longer crawl, not just a harder one.
    const nodeCount = Math.max(2, Math.round(rating * 0.8) + rng.int(1, 2));
    const nodes = [];
    for (let i = 0; i < nodeCount; i++) {
      let type;
      if (i === 0) type = "spu";                       // the public face
      else if (i === nodeCount - 1) type = "cpu";      // the deep end
      else type = rng.weighted([
        { item: "spu", weight: 4 },
        { item: "datastore", weight: 3 },
        { item: "slave", weight: 2 },
        { item: "ds", weight: 2 },
      ]);
      nodes.push({
        id: i, type: type, label: NODE_TYPES[type].label,
        alertPerAction: NODE_TYPES[type].alert,
        holdsData: !!NODE_TYPES[type].data,
        ice: [],
      });
    }
    // A spine so there is always a route, plus a shortcut or two —
    // the long quiet way versus the short exposed one is the whole
    // Route decision (§05), and it needs at least two ways down.
    const edges = [];
    for (let i = 1; i < nodes.length; i++) edges.push({ from: i - 1, to: i });
    const shortcuts = Math.min(2, Math.floor(nodeCount / 3));
    for (let s = 0; s < shortcuts; s++) {
      const from = rng.int(0, nodeCount - 3);
      const to = rng.int(from + 2, nodeCount - 1);
      if (!edges.some((e) => e.from === from && e.to === to)) edges.push({ from: from, to: to });
    }

    // Ice budget mirrors the physical rule: each point of the rating
    // is 10% coverage of the host's own encounter points.
    const slots = nodes.length;
    let budget = Math.round(slots * (rating / 10));
    if (budget < 1 && rating >= 1) budget = 1;
    let guard = 0;
    while (budget > 0 && guard++ < 200) {
      const node = nodes[rng.int(1, nodes.length - 1)]; // never the entry
      const type = rng.weighted([
        { item: "barrierIce", weight: 4 },
        { item: "patrolIce", weight: 3 },
        { item: "blackIce", weight: Math.max(1, Math.floor(rating / 3)) },
      ]);
      const tier = Math.max(1, Math.min(10, rating + rng.int(-1, 1)));
      node.ice.push(generateObstacleInstance(rng, type, tier, "matrix"));
      budget -= 1;
    }

    return {
      rating: rating,
      nodes: nodes,
      edges: edges,
      entryNode: 0,
      objectiveNode: nodes.length - 1,
    };
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

  // ── Visual theme & loot: what a place LOOKS like and coughs up ──
  // Both derive from the site's own stream — a named site's theme
  // and probability chart are as canonical as its walls.
  const URBAN_THEMES = [
    "corporate tower", "warehouse complex", "research annex", "nightclub",
    "street clinic", "tenement block", "datacenter", "shipping depot",
    "temple", "arcology floor", "parking structure", "media studio",
  ];
  const WILD_THEMES = [
    "reagent grove", "cavern system", "pre-Awakening ruin",
    "squatter encampment", "forest shrine", "crash site",
  ];

  function generateLootTable(rng, value, orientation) {
    // The probability chart of what can be found here: harvest draws
    // from it (and future loot systems will too). Orientation leans
    // the weights, value scales the amounts and the odds of an
    // actual item turning up.
    const weights = {
      "resource:scrap": orientation === "physical" ? 5 : orientation === "balanced" ? 3 : 2,
      "resource:reagents": orientation === "astral" ? 5 : orientation === "balanced" ? 3 : 1,
      "resource:data": orientation === "matrix" ? 5 : orientation === "balanced" ? 3 : 1,
    };
    return {
      entries: Object.keys(weights).map((kind) => ({
        kind: kind,
        weight: weights[kind],
        amountMax: 1 + Math.ceil(value / 3) + rng.int(0, 1),
      })),
      itemDropChance: Math.min(0.35, 0.05 + value * 0.02),
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
    const host = generateHost(r, security);
    const population = generatePopulation(r, security);
    const district = options.district || r.pick(DISTRICTS);
    const isWild = WILD_DISTRICTS.indexOf(district) !== -1;
    const theme = r.pick(isWild ? WILD_THEMES : URBAN_THEMES);
    const lootTable = generateLootTable(r, value, orientation);

    return {
      identity: {
        district: district,
        owningFaction: options.faction || r.pick(FACTIONS),
        value: value,             // 1-10 — what the job board matches a job slot's tier against
        orientation: orientation, // "physical" | "astral" | "matrix" | "balanced"
        theme: theme,             // what the place LOOKS like — canonical per name
      },
      security: security,
      layout: layout,
      host: host,
      population: population,
      lootTable: lootTable,       // the probability chart of what's findable here
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

  // ── The universe site registry: lazy, infinite, balanced ────────
  // Sites are never pre-generated. The universe seed defines a pure
  // function from index -> site, evaluated only when a job (or a
  // player discovery) actually needs one — "when a job requires a
  // site, you have a universe seed to pull from" (§09, confirmed).
  // The integration layer owns the mint counter (saved state); this
  // is just the function. Consequence, by design: reloading to
  // before a job generated loses that contract forever (jobs are
  // timestamp-seeded), but the next job needing a fresh site mints
  // the same next index — the building behind the next door is
  // universe-fixed, the deal offered against it is not.
  //
  // District and faction come from SHUFFLE-BAGS keyed to the index,
  // not uniform rolls — uniform streaks ("everything is in Tacoma,
  // Mitsuhama owns every building") break immersion immediately at
  // scale. Every consecutive block of N sites visits all N
  // districts exactly once (reshuffled per block, so no fixed
  // rotation), and factions ride an independently shuffled bag so
  // the district<->faction pairing never locks either.
  function bagPick(universeSeed, bagLabel, pool, index) {
    const block = Math.floor(index / pool.length);
    const order = MJ.makeRNG(universeSeed).fork(bagLabel + "-" + block).shuffle(pool);
    return order[index % pool.length];
  }

  function siteIdentityFromIndex(universeSeed, index) {
    return {
      district: bagPick(universeSeed, "district-bag", DISTRICTS, index),
      owningFaction: bagPick(universeSeed, "faction-bag", FACTIONS, index),
    };
  }

  // ── Site names: Adverb-Color-Adjective-Noun-#### ────────────────
  // The what3words idea, fully weaponized: the NAME IS THE COMPLETE
  // SEED, and the name's structure ENCODES the site's qualities —
  // so when the universe randomly needs "a safe-band physical site
  // in Tacoma owned by Mitsuhama," it selects those qualities and
  // CONSTRUCTS the name that means them (no search, no override,
  // no algorithm guessing). Decoding the same name in any universe
  // reproduces the same site, qualities and all:
  //   Color     -> owner        (16 colors / 8 owners, 2 each)
  //   Adjective -> district     (64 adjectives / 9 districts)
  //   Noun      -> value x orientation (64 nouns / 40 combos)
  //   Adverb + 4 digits -> pure uniquifier (64 x 10,000 per combo)
  // ~4.2 billion names. Veterans can learn to read addresses —
  // that's street knowledge, and everything encoded is information
  // the UI already shows on known sites. Theme and loot need no
  // encoding budget: they derive from the name hash.
  const NAME_ADVERBS = [
    "Absurdly", "Almost", "Awfully", "Badly", "Barely", "Blindly",
    "Boldly", "Briskly", "Broadly", "Calmly", "Carefully", "Cheaply",
    "Cleanly", "Clearly", "Coldly", "Crudely", "Curiously", "Daily",
    "Darkly", "Dearly", "Deeply", "Dimly", "Doubly", "Dryly",
    "Eagerly", "Early", "Easily", "Evenly", "Exactly", "Faintly",
    "Fairly", "Fiercely", "Finally", "Firmly", "Fondly", "Freely",
    "Freshly", "Gently", "Gladly", "Grandly", "Gravely", "Greatly",
    "Grimly", "Half", "Hardly", "Hastily", "Highly", "Honestly",
    "Hourly", "Idly", "Justly", "Keenly", "Kindly", "Lately",
    "Lightly", "Loosely", "Loudly", "Madly", "Mildly", "Mostly",
    "Nearly", "Neatly", "Newly", "Nicely",
  ];
  const NAME_ADJECTIVES = [
    "Amber", "Ancient", "Ashen", "Bitter", "Bright", "Broken",
    "Bronze", "Cheerful", "Chilly", "Civil", "Clever", "Cloudy",
    "Copper", "Crimson", "Crooked", "Curious", "Dusty", "Eager",
    "Electric", "Elegant", "Faded", "Famous", "Fickle", "Formal",
    "Fragrant", "Frozen", "Gentle", "Gilded", "Glass", "Golden",
    "Graceful", "Gray", "Green", "Heavy", "Hidden", "Hollow",
    "Humble", "Iron", "Ivory", "Jagged", "Jolly", "Lanky",
    "Lavender", "Little", "Lonely", "Loyal", "Lucky", "Marble",
    "Mellow", "Misty", "Modest", "Narrow", "Nimble", "Olive",
    "Patient", "Pearl", "Proud", "Quiet", "Rapid", "Rusty",
    "Scarlet", "Silent", "Silver", "Velvet",
  ];
  const NAME_NOUNS = [
    "Anchor", "Anthem", "Arrow", "Badger", "Balloon", "Banjo",
    "Beacon", "Bell", "Bicycle", "Bottle", "Bridge", "Bucket",
    "Button", "Candle", "Canyon", "Castle", "Chimney", "Compass",
    "Cricket", "Crown", "Dolphin", "Drum", "Falcon", "Feather",
    "Fiddle", "Flag", "Fountain", "Garden", "Hammer", "Harbor",
    "Heron", "Kettle", "Ladder", "Lantern", "Lemon", "Magnet",
    "Marble", "Mirror", "Mountain", "Needle", "Orchard", "Otter",
    "Paddle", "Pepper", "Piano", "Pigeon", "Pillar", "Prairie",
    "Rabbit", "Ribbon", "River", "Rocket", "Saddle", "Sparrow",
    "Spindle", "Steeple", "Tangerine", "Telescope", "Thimble",
    "Trumpet", "Tunnel", "Turbine", "Walnut", "Windmill",
  ];

  const NAME_COLORS = [
    "Amber", "Azure", "Cobalt", "Coral", "Crimson", "Emerald",
    "Indigo", "Ivory", "Jade", "Obsidian", "Onyx", "Saffron",
    "Scarlet", "Teal", "Umber", "Violet",
  ];

  // ── The encoding tables (stable by index — never reorder) ──────
  // adjective i -> district i % 9; color i -> owner i % 8;
  // noun i -> combo i % 40, combo = (value-1) + 10 * orientationIdx.
  function wordsFor(pool, groupCount, groupIndex) {
    const out = [];
    for (let i = 0; i < pool.length; i++) {
      if (i % groupCount === groupIndex) out.push(pool[i]);
    }
    return out;
  }

  function encodeSiteName(qualities, rng) {
    const districtIdx = SITE_DISTRICTS.indexOf(qualities.district);
    const ownerIdx = OWNERS.indexOf(qualities.owner);
    const orientationIdx = ORIENTATIONS.indexOf(qualities.orientation);
    const combo = (qualities.value - 1) + 10 * orientationIdx;
    const adjective = rng.pick(wordsFor(NAME_ADJECTIVES, 9, districtIdx));
    const color = rng.pick(wordsFor(NAME_COLORS, 8, ownerIdx));
    const noun = rng.pick(wordsFor(NAME_NOUNS, 40, combo));
    const adverb = rng.pick(NAME_ADVERBS);
    const num = String(rng.int(0, 9999)).padStart(4, "0");
    return adverb + "-" + color + "-" + adjective + "-" + noun + "-" + num;
  }

  function decodeSiteName(name) {
    const parts = String(name).split("-");
    if (parts.length !== 5 || !/^\d{4}$/.test(parts[4])) return null;
    const colorIdx = NAME_COLORS.indexOf(parts[1]);
    const adjIdx = NAME_ADJECTIVES.indexOf(parts[2]);
    const nounIdx = NAME_NOUNS.indexOf(parts[3]);
    if (NAME_ADVERBS.indexOf(parts[0]) === -1 || colorIdx === -1 || adjIdx === -1 || nounIdx === -1) return null;
    const combo = nounIdx % 40;
    return {
      district: SITE_DISTRICTS[adjIdx % 9],
      owner: OWNERS[colorIdx % 8],
      value: (combo % 10) + 1,
      orientation: ORIENTATIONS[Math.floor(combo / 10)],
    };
  }

  // Mint the universe's site #index. Layout, population, and
  // obstacle rolls all derive from (universeSeed, index) alone —
  // same index, same universe, same site, forever. value/orientation
  // stay caller-supplied where a job's needs dictate them (the
  // request is part of the reveal, not the universe).
  // ── The one true mint: a name, nothing else ─────────────────────
  // Decode the qualities the name encodes, inject them, and let the
  // name-hashed stream generate everything else. No options, no
  // overrides — the same name is the same site, everywhere, always.
  // Returns null for a name that isn't in the grammar.
  function mintSiteByName(name) {
    const q = decodeSiteName(name);
    if (!q) return null;
    const rng = MJ.makeRNG("site|" + name);
    const site = generateSite(rng, {
      district: q.district,
      faction: q.owner,
      value: q.value,
      orientation: q.orientation,
    });
    site.identity.name = name;
    // Resting security posture rides the name too — the same
    // building is the same nut to crack in every universe.
    MJ.initSecurityState(MJ.makeRNG("site-security|" + name), site);
    return site;
  }

  // The universe's deal: the governor SELECTS the qualities this
  // slot actually needs (bags for balance, the job's band and
  // orientation as requirements), CONSTRUCTS the name that encodes
  // them (uniquifier + word choices from the universe's own
  // stream), and mints it. Selection, never modification — and the
  // dealt site is its full canonical self in every other universe.
  // req: { value?, orientation?, district?, owner?, excludeOwner? }
  function mintSite(universeSeed, index, req) {
    req = req || {};
    const rng = MJ.makeRNG(universeSeed).fork("site-name-" + index);
    let owner = req.owner || siteIdentityFromIndex(universeSeed, index).owningFaction;
    if (req.excludeOwner && owner === req.excludeOwner) {
      owner = FACTIONS[(FACTIONS.indexOf(owner) + 1) % FACTIONS.length];
    }
    const qualities = {
      district: req.district || siteIdentityFromIndex(universeSeed, index).district,
      owner: owner,
      value: req.value !== undefined ? req.value : rng.int(1, 10),
      orientation: req.orientation || rng.pick(ORIENTATIONS),
    };
    const name = encodeSiteName(qualities, rng);
    const site = mintSiteByName(name);
    site.identity.universeIndex = index;
    return site;
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
    // The host counts. Leaving it out meant a Matrix scout found
    // nothing to report on a site whose whole defence is its ice —
    // the same "generated but unreachable" hole patrols and spirit
    // zones had, one pillar over.
    const matrixSlots = site.host ? site.host.nodes : [];
    return [
      ...physicalSlots.flatMap((s) => s.physicalObstacles),
      ...astralSlots.flatMap((s) => s.astralObstacles),
      ...matrixSlots.flatMap((n) => n.ice),
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

  MJ.THREAT = THREAT;
  MJ.DISTRICTS = DISTRICTS;
  MJ.WILD_DISTRICTS = WILD_DISTRICTS;
  MJ.SITE_DISTRICTS = SITE_DISTRICTS;
  MJ.FACTIONS = FACTIONS;
  MJ.OWNERS = OWNERS;
  MJ.ORIENTATIONS = ORIENTATIONS;
  MJ.OBSTACLE_TEMPLATES = OBSTACLE_TEMPLATES;
  MJ.generateObstacleInstance = generateObstacleInstance;
  MJ.generateHost = generateHost;
  MJ.NODE_TYPES = NODE_TYPES;
  MJ.planeOfAffordance = planeOfAffordance;
  MJ.SKILL_PLANE = SKILL_PLANE; // mission.js spawns responders with this
  MJ.PHYSICAL_OBSTACLE_TYPES = PHYSICAL_OBSTACLE_TYPES;
  MJ.ASTRAL_ROOM_TYPES = ASTRAL_ROOM_TYPES;
  MJ.rollValue = rollValue;
  MJ.rollOrientation = rollOrientation;
  MJ.deriveSecurity = deriveSecurity;
  MJ.generateSite = generateSite;
  MJ.siteIdentityFromIndex = siteIdentityFromIndex;
  MJ.encodeSiteName = encodeSiteName;
  MJ.decodeSiteName = decodeSiteName;
  MJ.mintSite = mintSite;
  MJ.mintSiteByName = mintSiteByName;
  MJ.allObstacles = allObstacles;
  MJ.hasBruteForceOption = hasBruteForceOption;
  MJ.usableNonLoudWays = usableNonLoudWays;
  MJ.findPaths = findPaths;
})();
