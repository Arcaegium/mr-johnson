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
      // PRESENCE: where it can be TOUCHED, not what it perceives.
      // A lock senses nothing but is a physical object AND a device on
      // the host — which is why hacking it was always a real option.
      presence: ["physical", "matrix"],
      structure: 12, armour: 8,
      living: false, sapient: false, summoned: false,
      // A lock forms no opinions, on any plane.
      senses: [],
      affordances: [
        { skill: "electronics", verb: "pick the lock", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "larceny",     verb: "pick the lock", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "hacking",     verb: "unlock it remotely", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "con",         verb: "lift the key off a guard", loud: false, threat: THREAT.THREATENING },
        { skill: "demolitions", verb: "breach it", loud: true, threat: THREAT.THREATENING },
      ],
    },
    guard: {
      label: "Guard",
      // Physical body, living aura on the astral. No matrix
      // presence: a guard is not a device.
      presence: ["physical", "astral"],
      structure: 10,
      living: true, sapient: true, summoned: false,
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
        { skill: "stealth",  verb: "slip past unseen", loud: false, threat: THREAT.QUESTIONABLE },
        // One shot: you cannot re-smooth-talk someone who just called
        // your bluff, and adjacent guards are one audience.
        { skill: "con",      verb: "talk your way past", loud: false, threat: THREAT.AWKWARD },
        // `neutralizes` = this obstacle stops being able to see. That
        // is the whole point of a takedown: done cleanly against the
        // only pair of eyes in the room, there is nobody left to have
        // an opinion. Done in front of a camera, there is.
        { skill: "stealth",  verb: "silent takedown", loud: false, threat: THREAT.THREATENING, neutralizes: true },
        // Loud without being dangerous — a belligerent asshole, not
        // someone who needs shooting.
        { skill: "intimidation", verb: "taunt and draw them off", loud: false, threat: THREAT.AWKWARD },
        { skill: "firearms", verb: "fight", loud: true, threat: THREAT.THREATENING, neutralizes: true },
      ],
    },
    camera: {
      label: "Camera",
      // A device bolted to a wall: physically breakable, and on
      // the host that runs it.
      presence: ["physical", "matrix"],
      structure: 4, armour: 2,
      living: false, sapient: false, summoned: false,
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
        { skill: "stealth",     verb: "stay out of its arc", loud: false, threat: THREAT.QUESTIONABLE },
        { skill: "firearms",    verb: "shoot it out", loud: true, threat: THREAT.THREATENING, neutralizes: true },
      ],
    },
    // Astral idiom — the same two structural roles (barrier, sentry)
    // recast in magic's terms, not a reskin of the meatspace verbs.
    ward: {
      label: "Ward",
      // Astral only. Nothing to shoot — a bullet passes through the
      // space where it is. Not summoned, so it is unwound, never
      // banished.
      presence: ["astral"],
      structure: 8,
      // A ward is a MADE structure of mana — that is what can be
      // taken apart. A living aura is not a construct, which is why
      // you cannot unwind a guard.
      construct: true,
      living: false, sapient: false, summoned: false,
      // A ward is a barrier, not a sentry. It keeps you out; it does
      // not form an opinion or tell anyone. Leaning on it repeatedly
      // still escalates what the act LOOKS like — but only if
      // something with eyes (a spirit, a guard, a camera) is there to
      // see you doing it.
      senses: [],
      affordances: [
        { skill: null,         verb: "route around", loud: false, threat: THREAT.NORMAL },
        // The ward keeps you out on its own — that safeguard is why
        // a first press is merely offputting, and why leaning on it
        // again is not.
        { skill: "assensing",  verb: "pick it slowly", loud: false, threat: THREAT.AWKWARD, escalates: true, extended: true },
        { skill: "sorcery",    verb: "break it", loud: true, threat: THREAT.THREATENING },
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
      // Matrix only. Code has no body.
      presence: ["matrix"],
      structure: 8,
      living: false, sapient: false, summoned: false,
      senses: [],  // a wall logs nothing; it simply does not open
      affordances: [
        { skill: "hacking",     verb: "slip the barrier", loud: false, threat: THREAT.QUESTIONABLE, extended: true },
        { skill: "electronics", verb: "spoof its credentials", loud: false, threat: THREAT.AWKWARD, escalates: true },
        { skill: null,          verb: "route around the node", loud: false, threat: THREAT.NORMAL },
        { skill: "hacking",     verb: "hammer it down", loud: true, threat: THREAT.THREATENING, neutralizes: true },
      ],
    },
    patrolIce: {
      label: "Patrol ICE",
      presence: ["matrix"],
      structure: 6,
      living: false, sapient: false, summoned: false,
      senses: ["matrix"],
      affordances: [
        { skill: "hacking",     verb: "mask your icon", loud: false, threat: THREAT.QUESTIONABLE },
        { skill: "computer",    verb: "pass as legitimate traffic", loud: false, threat: THREAT.AWKWARD, escalates: true },
        { skill: "hacking",     verb: "corrupt its patrol route", loud: false, threat: THREAT.THREATENING, neutralizes: true },
        { skill: "hacking",     verb: "burn it out", loud: true, threat: THREAT.THREATENING, neutralizes: true },
      ],
    },
    blackIce: {
      label: "Black ICE",
      presence: ["matrix"],
      structure: 8,
      living: false, sapient: false, summoned: false,
      senses: ["matrix"],
      // It bites back. A decker in hot sim takes real damage, which
      // is why a Matrix run is not a safe alternative to a break-in.
      fights: true,
      armour: 4, weapon: "blackHammer",
      affordances: [
        { skill: "hacking",     verb: "slide past it", loud: false, threat: THREAT.QUESTIONABLE },
        { skill: "computer",    verb: "feed it a decoy icon", loud: false, threat: THREAT.AWKWARD, escalates: true },
        { skill: "hacking",     verb: "attack it directly", loud: true, threat: THREAT.THREATENING, neutralizes: true },
      ],
    },
    spirit: {
      label: "Spirit",
      // Dual-natured: present on BOTH, which is why it can be shot
      // and assensed. Summoned, so it can be banished — the one thing
      // in the game that can.
      presence: ["astral", "physical"],
      structure: 10,
      living: true, sapient: true, summoned: true,
      // DUAL-NATURED: a materialised spirit perceives the astral and
      // the physical at once, which is exactly what makes it the
      // hardest thing on a site to work around.
      senses: ["astral", "physical"],
      dualNatured: true,
      fights: true,
      armour: 4, weapon: "unarmed",
      affordances: [
        { skill: "conjuring",  verb: "banish it", loud: false, threat: THREAT.THREATENING, neutralizes: true },
        // Two ways past a sentry, astral or otherwise: out of its
        // notice, or in plain view and unremarkable. Blowing the
        // covert one is worse than blowing the overt one — being
        // caught sneaking says more about you than being sensed
        // walking through does. (Stealth vs. awareness gets its own
        // treatment later; this is the structure, not the depth.)
        { skill: "stealth",    verb: "sneak around it", loud: false, threat: THREAT.QUESTIONABLE },
        { skill: "assensing",  verb: "walk past without tripping it", loud: false, threat: THREAT.AWKWARD, escalates: true },
        { skill: null,         verb: "route around", loud: false, threat: THREAT.NORMAL },
        { skill: "sorcery",    verb: "blast it down", loud: true, threat: THREAT.THREATENING, neutralizes: true },
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
      // ── PRESENCE: which planes this thing can be TOUCHED on ─────
      // Not the same question as `senses`, which is only what it
      // PERCEIVES. A maglock senses nothing and is still a physical
      // object and a device on the host. This is what makes a verb
      // from one pillar meaningful against a thing at all, and what
      // stops you sleazing a spirit or banishing a guard.
      presence: (template.presence || [projection]).slice(),
      // ── NATURE: what kind of thing it is ────────────────────────
      // Decides which verbs LAND rather than merely being possible.
      living: !!template.living,
      construct: !!template.construct,
      sapient: !!template.sapient,
      summoned: !!template.summoned,
      // ── Taking force ────────────────────────────────────────────
      // Armour is the gate (Power must beat it); structure is how
      // much it takes before it stops being in the way. Everything
      // physical has both now, not only things that shoot back —
      // a door has to survive being shot at.
      armour: (template.armour || 0) + Math.floor(tier / 2),
      structure: Math.max(1, (template.structure || 6) + tier),
      damage: 0,
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
  // `cond` leans WHICH type each slot buys. The budget decides how
  // much a site fields; the weights decide what it fields, which is
  // where a derelict block and a corporate tower of the same rating
  // stop resembling each other.
  function distributeObstacles(rng, allSlots, mobileSlotSet, securityValue, staticTypes, mobileTypes, fieldName, projection, cond) {
    const target = allSlots.length * (securityValue / 10);
    const base = Math.floor(target);
    const remainder = target - base;
    let budget = base + (rng.chance(remainder) ? 1 : 0);
    const staticWeighted = weightedTypes(staticTypes, cond);
    const mobileWeighted = weightedTypes(mobileTypes, cond);

    let guardLoop = 0;
    while (budget > 0 && guardLoop++ < 200) {
      const pass = rng.shuffle(allSlots);
      for (const slot of pass) {
        if (budget <= 0) break;
        const isMobile = mobileSlotSet.has(slot);
        const typeId = rng.weighted(isMobile ? mobileWeighted : staticWeighted);
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

  // `cond` is the condition's structural nudges — how much cover the
  // place offers, how many patrols walk it, how many ways in it has.
  // All of them clamp, so no condition can produce a site with no
  // route in or a negative number of anything.
  function generateLayout(rng, security, cond) {
    cond = cond || {};
    const roomCount = rng.int(4, 7);
    const rooms = [];
    for (let i = 0; i < roomCount; i++) {
      const { size, slots } = generatePostSlots(rng);
      rooms.push({
        id: i,
        label: i === 0 ? "Objective Room" : `Room ${i}`,
        size: size,
        // A derelict or half-built place is full of things to get
        // behind; a posh lobby is a shooting gallery.
        coverFlags: rng.shuffle(["low", "high", "open"]).slice(0, Math.max(1, Math.min(3, rng.int(1, 2) + (cond.cover || 0)))),
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
    // A fortified site seals it; a half-built one has a third hole
    // in the wall where the loading bay will eventually go.
    // Generator invariant 2 (≥1 additional distinct solution chain)
    // survives either way: the shortest path always exists, and a
    // fortified site still has its main entry.
    const extraEntries = Math.max(0, Math.min(2, 1 + (cond.entries || 0)));
    if (roomCount >= 3 && extraEntries > 0) {
      const midRoom = chainOrder[Math.floor(chainOrder.length / 2)];
      entryPoints.push({
        id: 1,
        type: rng.pick(ENTRY_TYPES),
        roomId: midRoom,
        physicalObstacles: [],
      });
      if (extraEntries > 1) {
        entryPoints.push({
          id: 2,
          type: rng.pick(ENTRY_TYPES),
          roomId: chainOrder[Math.max(1, Math.floor(chainOrder.length / 4))],
          physicalObstacles: [],
        });
      }
    }

    // Physical patrol routes: 0-2 per site (provisional default —
    // build plan backlog).
    const patrolCount = Math.max(0, Math.min(4, rng.int(0, 2) + (cond.patrols || 0)));
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
    distributeObstacles(rng, physicalSlots, new Set(patrols), security.physical, PHYSICAL_OBSTACLE_TYPES, PHYSICAL_PATROL_TYPES, "physicalObstacles", "physical", cond);

    // Astral spirit zones: 0-2 per site, roaming 2-3 rooms with no
    // adjacency requirement (walls don't stop them).
    const spiritZoneCount = Math.max(0, Math.min(4, rng.int(0, 2) + (cond.zones || 0)));
    const spiritZones = [];
    for (let i = 0; i < spiritZoneCount; i++) {
      spiritZones.push(generateSpiritZone(rng, roomCount));
    }

    // Astral coverage: rooms themselves (a room can be warded or
    // hold a stationed spirit) + spirit zones, funded by
    // security.astral — its own slot pool, not physical's.
    const astralSlots = [...rooms, ...spiritZones];
    distributeObstacles(rng, astralSlots, new Set(spiritZones), security.astral, ASTRAL_ROOM_TYPES, ASTRAL_ZONE_TYPES, "astralObstacles", "astral", cond);

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

  // Condition and theme are ORTHOGONAL. Any building can fall into
  // disrepair, flood, or fill up with squatters — an arcology floor
  // that was sealed off rather than dealt with is a better location
  // than a tenement, not a disallowed one. Gating themes by
  // condition would quietly delete the most interesting half of the
  // space: the derelict datacenter, the flooded corporate tower, the
  // haunted arcology. Every theme is available under every
  // condition, and the pairing is the flavour.

  function generateLootTable(rng, value, orientation, cond) {
    // The probability chart of what can be found here: harvest draws
    // from it (and future loot systems will too). Orientation leans
    // the weights, value scales the amounts and the odds of an
    // actual item turning up, and the site's condition decides
    // whether there is anything left worth taking — a gutted place
    // has been picked over, a posh one has not.
    cond = cond || {};
    const weights = {
      "resource:scrap": orientation === "physical" ? 5 : orientation === "balanced" ? 3 : 2,
      "resource:reagents": orientation === "astral" ? 5 : orientation === "balanced" ? 3 : 1,
      "resource:data": orientation === "matrix" ? 5 : orientation === "balanced" ? 3 : 1,
    };
    const loot = cond.loot || 0;
    return {
      entries: Object.keys(weights).map((kind) => ({
        kind: kind,
        weight: weights[kind],
        amountMax: Math.max(1, 1 + Math.ceil(value / 3) + rng.int(0, 1) + loot),
      })),
      itemDropChance: Math.max(0.02, Math.min(0.5, 0.05 + value * 0.02 + loot * 0.1)),
    };
  }

  // ── Top-level generator ──────────────────────────────────────────
  function generateSite(rng, options) {
    options = options || {};
    const r = rng; // consume directly — see runner.js's fork-bug note; same rule applies here

    const value = options.value || rollValue(r);
    const orientation = options.orientation || rollOrientation(r);
    // Condition shifts the budget BEFORE it is spent, so it changes
    // what the site can afford to post rather than being repainted
    // over a fixed roster of guards.
    const condition = options.condition || r.pick(CONDITION_IDS);
    const security = applyCondition(deriveSecurity(r, value, orientation), condition);
    const layout = generateLayout(r, security, CONDITIONS[condition]);
    const host = generateHost(r, security);
    const population = generatePopulation(r, security);
    const district = options.district || r.pick(DISTRICTS);
    const isWild = WILD_DISTRICTS.indexOf(district) !== -1;
    const theme = r.pick(isWild ? WILD_THEMES : URBAN_THEMES);
    const lootTable = generateLootTable(r, value, orientation, CONDITIONS[condition]);

    return {
      identity: {
        district: district,
        owningFaction: options.faction || r.pick(FACTIONS),
        value: value,             // 1-10 — what the job board matches a job slot's tier against
        orientation: orientation, // "physical" | "astral" | "matrix" | "balanced"
        // What state the place is IN — the first word of its name.
        // Same district, same owner, same value, different night.
        condition: condition,
        conditionLabel: CONDITIONS[condition].label,
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

  // ── Site names: Adverb-Adjective-Color-Noun-#### ────────────────
  // The what3words idea, fully weaponized: the NAME IS THE COMPLETE
  // SEED, and it says the site's qualities OUTRIGHT. When the
  // universe needs "a safe-band physical site in Tacoma owned by
  // Mitsuhama," it picks a word from Tacoma's list, a word from
  // Mitsuhama's list, and the noun that means physical-value-3.
  // Reading a name back is the same tables the other way: each slot
  // is a lookup, not a computation.
  //
  //   Adjective -> district      one list of adjectives per district
  //   Color     -> owner         two colours per owner
  //   Noun      -> orientation, and its POSITION in that
  //                orientation's list is the value (1-10)
  //   Adverb + 4 digits -> the uniquifier, meaning nothing
  //
  // Every word belongs to exactly one entry in its OWN table, which
  // is what lets a slot be read directly. Words may repeat ACROSS
  // tables — Amber and Crimson are perfectly good adjectives and
  // perfectly good colours — because the slot says which table
  // applies. That makes slot order load-bearing rather than
  // cosmetic, and a stress probe holds it.
  //
  // The qualities are the CLASS; the name is the INDIVIDUAL. There
  // are 9 x 8 x 4 x 10 = 2,880 quality combinations, but the full
  // name string is what seeds generation — so two names carrying the
  // same qualities are two different buildings that happen to share
  // a district, an owner, a value and an orientation. Same security
  // triple, different theme, different floor plan. 26.2 billion
  // names in all, which is why theme and loot need no room in the
  // name: they fall out of its hash.
  //
  // Veterans can learn to read addresses — that's street knowledge,
  // and everything a name carries is information the UI already
  // shows on known sites.
  // ── Condition: the first word, and the one that changes the most ─
  // The same building in a different state. "Downtown / Ares" is a
  // place; "Derelict / Downtown / Ares" and "Posh / Downtown / Ares"
  // are two very different nights out. Change one word in an address
  // and you get the same district, the same owner, the same value —
  // wearing a different life.
  //
  // Eight conditions, eight words each, so the name space is exactly
  // what it was when this slot was a meaningless uniquifier. The
  // words within a condition are flavour: a Crumbling site and a
  // Gutted one are the same mechanical condition, described
  // differently.
  const CONDITION_WORDS = {
    derelict:  ["Derelict", "Crumbling", "Gutted", "Abandoned", "Rotting", "Sagging", "Forsaken", "Hollowed"],
    posh:      ["Posh", "Plush", "Opulent", "Lavish", "Pristine", "Immaculate", "Refined", "Stately"],
    fortified: ["Fortified", "Hardened", "Bunkered", "Armored", "Reinforced", "Bastioned", "Walled", "Garrisoned"],
    haunted:   ["Haunted", "Cursed", "Restless", "Shrouded", "Whispering", "Veiled", "Blighted", "Keening"],
    wired:     ["Wired", "Networked", "Automated", "Humming", "Meshed", "Instrumented", "Sensored", "Gridlit"],
    bustling:  ["Bustling", "Crowded", "Teeming", "Thronged", "Packed", "Swarming", "Lively", "Heaving"],
    flooded:   ["Flooded", "Drowned", "Waterlogged", "Sunken", "Silted", "Brackish", "Seeping", "Tidal"],
    raw:       ["Raw", "Unfinished", "Scaffolded", "Skeletal", "Framed", "Bare", "Halfbuilt", "Rough"],
  };

  // What each condition DOES.
  //
  // The main lever is COMPOSITION, not amount. A derelict building is
  // not an undefended one — it is one defended by whoever moved in.
  // The corporate systems are dead (no power, no maintenance, water
  // in the risers), and the bodies holding the place are squatters,
  // gangers, things that eat people. A posh building is the reverse:
  // fewer bodies, and cameras and maglocks everywhere the money
  // reached. Both can be ferociously hard; they are hard in ways
  // that ask a crew for completely different skills.
  //
  // So `weights` multiplies each obstacle type's chance of being what
  // a slot buys, and `security` moves the BUDGET only where the
  // condition genuinely destroys or creates capability — water and
  // neglect really do kill a host; money really does buy more of
  // everything. Value is untouched throughout: a derelict tier-9
  // target is still a tier-9 payday, and the player reads what kind
  // of fight it is off the first word of the address.
  const CONDITIONS = {
    // The systems are dead; the population is the security.
    derelict:  { label: "derelict",  security: { physical: 0, astral: 1, matrix: -3 },
                 weights: { maglock: 0.2, camera: 0.2, guard: 2.2, ward: 0.3, spirit: 1.8 },
                 cover: 1, patrols: -1, zones: 1, loot: -1 },
    // Money buys systems, and systems mean fewer people on the floor.
    posh:      { label: "posh",      security: { physical: 1, astral: 0, matrix: 2 },
                 weights: { maglock: 1.6, camera: 1.8, guard: 0.7, ward: 1.6, spirit: 0.6 },
                 cover: -1, loot: 1 },
    // Fortified hardens the ways in; it does not brick them up.
    // Removing an entry point costs the site its second distinct
    // route to the objective (generator invariant 2), which is the
    // player's whole ability to plan an approach.
    // +2 rather than +3: fortified already stacks an extra patrol and
    // a lean toward guards, and at +3 a value-9 site pinned physical
    // at 10 — a wall rather than a hard job. The identity is in the
    // composition and the patrol, not in the size of the number.
    fortified: { label: "fortified", security: { physical: 2, astral: 0, matrix: 1 },
                 weights: { maglock: 1.3, camera: 1.2, guard: 1.5, ward: 1.2, spirit: 1.0 },
                 patrols: 1 },
    // Thin on the ground, thick on the other side of it.
    haunted:   { label: "haunted",   security: { physical: -1, astral: 3, matrix: -1 },
                 weights: { maglock: 0.7, camera: 0.7, guard: 0.5, ward: 0.7, spirit: 2.0 },
                 zones: 1 },
    // No hostNodes dial: node count already tracks matrix security,
    // so the +3 grows the crawl on its own.
    wired:     { label: "wired",     security: { physical: 0, astral: -1, matrix: 3 },
                 weights: { maglock: 1.7, camera: 1.9, guard: 0.5, ward: 0.8, spirit: 0.7 } },
    // People everywhere — cover, witnesses, and hands to grab you.
    bustling:  { label: "bustling",  security: { physical: 1, astral: 0, matrix: 0 },
                 weights: { maglock: 0.7, camera: 1.0, guard: 1.9, ward: 0.9, spirit: 0.9 },
                 cover: 1, patrols: 1 },
    // Water is what actually kills a building's electronics.
    flooded:   { label: "flooded",   security: { physical: 0, astral: 0, matrix: -3 },
                 weights: { maglock: 0.3, camera: 0.3, guard: 1.4, ward: 0.8, spirit: 1.4 },
                 cover: 1 },
    // Nothing is installed yet; the security is the site crew.
    raw:       { label: "raw",       security: { physical: -1, astral: 0, matrix: -2 },
                 weights: { maglock: 0.4, camera: 0.5, guard: 1.6, ward: 0.5, spirit: 1.0 },
                 entries: 1, cover: 1 },
  };

  // Baseline chance of each obstacle type before a condition leans
  // on it. A condition's `weights` multiply these.
  const TYPE_WEIGHTS = { maglock: 3, guard: 4, camera: 3, ward: 3, spirit: 3 };

  function weightedTypes(types, cond) {
    const mult = (cond && cond.weights) || {};
    return types.map((id) => ({
      item: id,
      weight: Math.max(0.01, (TYPE_WEIGHTS[id] || 1) * (mult[id] === undefined ? 1 : mult[id])),
    }));
  }

  // Each district owns its adjectives outright. Adding a word to a
  // district widens that district's names and nothing else.
  const DISTRICT_ADJECTIVES = {
    "Downtown": [
      "Amber", "Civil", "Electric", "Gilded", "Humble", "Loyal",
      "Patient", "Velvet",
    ],
    "Redmond Barrens": ["Ancient", "Clever", "Elegant", "Glass", "Iron", "Lucky", "Pearl"],
    "Bellevue": ["Ashen", "Cloudy", "Faded", "Golden", "Ivory", "Marble", "Proud"],
    "Renton": [
      "Bitter", "Copper", "Famous", "Graceful", "Jagged", "Mellow",
      "Quiet",
    ],
    "Tacoma": ["Bright", "Crimson", "Fickle", "Gray", "Jolly", "Misty", "Rapid"],
    "Everett": ["Broken", "Crooked", "Formal", "Green", "Lanky", "Modest", "Rusty"],
    "Puyallup": [
      "Bronze", "Curious", "Fragrant", "Heavy", "Lavender", "Narrow",
      "Scarlet",
    ],
    "Salish Wilds": [
      "Cheerful", "Dusty", "Frozen", "Hidden", "Little", "Nimble",
      "Silent",
    ],
    "Snoqualmie Forest": ["Chilly", "Eager", "Gentle", "Hollow", "Lonely", "Olive", "Silver"],
  };

  // Two colours per owner, so an owner is legible at a glance
  // without either colour being the whole tell.
  const OWNER_COLORS = {
    "Ares": ["Amber", "Jade"],
    "Renraku": ["Azure", "Obsidian"],
    "Mitsuhama": ["Cobalt", "Onyx"],
    "Yakuza": ["Coral", "Saffron"],
    "Ork Underground": ["Crimson", "Scarlet"],
    "Independent": ["Emerald", "Teal"],
    "Ancients": ["Indigo", "Umber"],
    "Unowned": ["Ivory", "Violet"],
  };

  // The noun says orientation by WHICH list it is in and value by
  // WHERE in that list it sits — index 0 is value 1, index 9 is
  // value 10. So "Candle" is an astral site of value 4, always and
  // everywhere, and the noun alone is the whole of what a site is
  // before anybody defends it. Uniqueness rides on the adverb and
  // the digits, which is what they are for.
  const ORIENTATION_NOUNS = {
    "physical": [
      "Anchor", "Anthem", "Arrow", "Badger", "Balloon", "Banjo",
      "Beacon", "Bell", "Bicycle", "Bottle",
    ],
    "astral": [
      "Bridge", "Bucket", "Button", "Candle", "Canyon", "Castle",
      "Chimney", "Compass", "Cricket", "Crown",
    ],
    "matrix": [
      "Dolphin", "Drum", "Falcon", "Feather", "Fiddle", "Flag",
      "Fountain", "Garden", "Hammer", "Harbor",
    ],
    "balanced": [
      "Heron", "Kettle", "Ladder", "Lantern", "Lemon", "Magnet",
      "Orchard", "Mirror", "Mountain", "Needle",
    ],
  };

  // Reading a slot is a lookup, built once from the tables above so
  // the two directions can never disagree. A word that appears twice
  // within one table would make its slot ambiguous, so the build
  // refuses it rather than silently keeping the last one.
  function indexWords(table, what) {
    const out = {};
    for (const key of Object.keys(table)) {
      table[key].forEach((word, i) => {
        if (out[word]) throw new Error('site names: "' + word + '" claims two ' + what + " slots");
        out[word] = { key: key, position: i };
      });
    }
    return out;
  }

  const CONDITION_OF = indexWords(CONDITION_WORDS, "condition");
  const DISTRICT_OF = indexWords(DISTRICT_ADJECTIVES, "district");
  const OWNER_OF = indexWords(OWNER_COLORS, "owner");
  const ORIENTATION_OF = indexWords(ORIENTATION_NOUNS, "orientation");
  const CONDITION_IDS = Object.keys(CONDITION_WORDS);

  // Write the name that means these qualities: a word for the
  // condition, one from the district's list, one from the owner's,
  // and the one noun that means this orientation at this value.
  // Condition-Adjective-Color-Noun-NNNN — the colour sits last among
  // the adjectives, the way English stacks them: a Derelict-Bitter-
  // Coral-Anthem, never a Derelict-Coral-Bitter one.
  function encodeSiteName(qualities, rng) {
    const adjectives = DISTRICT_ADJECTIVES[qualities.district];
    const colors = OWNER_COLORS[qualities.owner];
    const nouns = ORIENTATION_NOUNS[qualities.orientation];
    if (!adjectives || !colors || !nouns) return null;
    const noun = nouns[qualities.value - 1];
    if (!noun) return null;
    // Condition is a quality like any other; callers that do not
    // care get one dealt from their own stream.
    const conditionId = qualities.condition || rng.pick(CONDITION_IDS);
    const conditionWords = CONDITION_WORDS[conditionId];
    if (!conditionWords) return null;
    return [
      rng.pick(conditionWords),
      rng.pick(adjectives),
      rng.pick(colors),
      noun,
      String(rng.int(0, 9999)).padStart(4, "0"),
    ].join("-");
  }

  // Read the qualities straight back out: each slot names its own
  // table, and the table says what the word means. A word may appear
  // in more than one table — Amber is a colour and an adjective —
  // which is exactly why the slot decides, and why slot ORDER is
  // load-bearing rather than cosmetic.
  function decodeSiteName(name) {
    const parts = String(name).split("-");
    if (parts.length !== 5 || !/^\d{4}$/.test(parts[4])) return null;
    const condition = CONDITION_OF[parts[0]];
    const district = DISTRICT_OF[parts[1]];
    const owner = OWNER_OF[parts[2]];
    const noun = ORIENTATION_OF[parts[3]];
    if (!condition || !district || !owner || !noun) return null;
    return {
      condition: condition.key,
      district: district.key,
      owner: owner.key,
      orientation: noun.key,
      value: noun.position + 1,
    };
  }

  // The condition's shift to the security triple, applied BEFORE
  // anything is bought with it — so a derelict site genuinely cannot
  // afford the guards a fortified one posts, rather than having them
  // painted over afterwards.
  function applyCondition(security, conditionId) {
    const cond = CONDITIONS[conditionId];
    if (!cond) return security;
    const out = {};
    for (const axis of ["physical", "astral", "matrix"]) {
      out[axis] = Math.max(1, Math.min(10, security[axis] + (cond.security[axis] || 0)));
    }
    return out;
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
      condition: q.condition,
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
  MJ.CONDITIONS = CONDITIONS;
  MJ.CONDITION_IDS = CONDITION_IDS;
  MJ.CONDITION_WORDS = CONDITION_WORDS;
  MJ.encodeSiteName = encodeSiteName;
  MJ.decodeSiteName = decodeSiteName;
  MJ.mintSite = mintSite;
  MJ.mintSiteByName = mintSiteByName;
  MJ.allObstacles = allObstacles;
  MJ.hasBruteForceOption = hasBruteForceOption;
  MJ.usableNonLoudWays = usableNonLoudWays;
  MJ.findPaths = findPaths;
})();
