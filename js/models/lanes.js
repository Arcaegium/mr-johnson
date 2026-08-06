/* ============================================================
   Mr. Johnson — models/lanes.js
   The character sheet, on both sides of the table.

   THE PROBLEM THIS SOLVES. A job card said "est P:4 A:2 M:6" and a
   crew read said "brings P:12d". Twelve of what, against four of
   what? The two numbers were in different units and neither said
   anything about a PERSON. "What fills the P pool — Firearms?
   Athletics? Does 9d of Assensing mean I am ready for A:4?" had no
   answer anywhere in the game, because the axes were budget
   categories the generator spends, never a statement about what a
   runner can do.

   Lanes are the answer, and there are seven of them:

     Sneak      stealth, larceny
     Face       con, intimidation
     Tech       hacking, electronics
     Banish     conjuring, sorcery
     Attack     firearms, marksmanship, melee, heavyWeapons,
                demolitions, sorcery
     Defense    armour (no skill — you cannot roll not-being-shot)
     Awareness  assensing, perception

   SORCERY IS IN TWO LANES ON PURPOSE. It is the one skill that acts
   on both astral beings and physical ones — it unwinds a ward and it
   throws mana at a guard — so it fronts Banish and Attack both. That
   is not double-counting; it is what makes a combat mage worth the
   Drain.

   WHAT IS NOT ON THE CARD, and why:
     computer, enchanting  bench skills. They craft. Neither may ever
                           front a way past a thing (stress C22).
     medicine, leadership  never appear as a site's requirement.
     athletics             terrain, which is a visual-layer concern.
     rigging               a force multiplier — a drone carries the
                           lane, it is not a lane.

   ── LANES FORECAST. THEY DO NOT RESOLVE. ──────────────────────────
   Nothing in here is ever consulted to decide whether an act
   succeeds. Resolution is verbs × properties and it stays exactly
   where it is: PRESENCE, then NATURE, then dice. A lane is what the
   player reads BEFORE committing a crew, and the moment it starts
   gating anything it has become a second, sloppier rules engine
   sitting on top of the real one.

   ── THE IMPRECISION IS THE POINT. ─────────────────────────────────
   Bundling two or six skills into one number is not a simplification
   for the player's benefit — it is deliberate blur. A lane says "you
   are roughly short here"; it will not say which of the six skills
   would fix it or what exactly is waiting. That gap is what makes
   recon worth a day. A perfectly precise report card would delete
   scouting from the game.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // `skills` is the bag a lane reads. `unit` says what the two
  // numbers mean — every lane compares like against like, but not
  // every lane is dice.
  const LANE_DEFS = {
    sneak: {
      label: "Sneak", unit: "dice",
      skills: ["stealth", "larceny"],
    },
    face: {
      label: "Face", unit: "dice",
      skills: ["con", "intimidation"],
    },
    tech: {
      label: "Tech", unit: "dice",
      // Decking is ONE skill. Every Matrix verb rolls hacking, and
      // electronics is the same job done by hand on the box in front
      // of you — splice the wiring rather than reach it over the air.
      skills: ["hacking", "electronics"],
    },
    banish: {
      label: "Banish", unit: "dice",
      skills: ["conjuring", "sorcery"],
    },
    attack: {
      label: "Attack", unit: "dice",
      skills: ["firearms", "marksmanship", "melee", "heavyWeapons", "demolitions", "sorcery"],
    },
    defense: {
      label: "Defense", unit: "armour",
      // NO SKILL, and no roll. There is no verb for not being shot.
      // What decides whether incoming fire hurts is the Penetrate
      // gate — Power against Armour — so this lane is armour points
      // against the effective Power of the worst gun on site.
      skills: [],
      passive: true,
    },
    awareness: {
      label: "Awareness", unit: "dice",
      // Passive in the sense that it is not something you spend an
      // action on — but it is a real contested roll and the site has
      // been making its half of it all along (mission.js noticePool
      // vs concealmentPool). This is the crew's half.
      skills: ["assensing", "perception"],
    },
  };

  const LANE_ORDER = ["sneak", "face", "tech", "banish", "attack", "defense", "awareness"];

  const SKILL_LANES = {};
  for (const id of LANE_ORDER) {
    for (const skill of LANE_DEFS[id].skills) {
      (SKILL_LANES[skill] = SKILL_LANES[skill] || []).push(id);
    }
  }

  function lanesOfSkill(skillId) {
    return SKILL_LANES[skillId] || [];
  }

  // Which lane a VERB belongs to. `shoot` has no fixed skill — it is
  // whatever the runner is carrying — so it is read off the verb's
  // own nature instead: anything damaging is Attack, whatever gun
  // happens to be in the hand.
  function lanesOfVerb(def) {
    if (!def) return [];
    if (def.skill) return lanesOfSkill(def.skill);
    if (def.damaging) return ["attack"];
    return [];
  }

  // ── What ONE runner brings to a lane ───────────────────────────
  // The best of the lane's skills, as a real dice pool — the same
  // dicePoolFor every prompt and every roll uses, gear included. Not
  // a sum: a runner with Stealth 5 and Larceny 5 is not a 10-dice
  // sneak, they are two different five-dice answers.
  function runnerLane(runner, laneId) {
    const def = LANE_DEFS[laneId];
    if (!def || !runner) return { pool: 0, rank: 0, skill: null };
    if (laneId === "defense") {
      return { pool: MJ.armourRatingFor(runner), rank: 0, skill: null };
    }
    const skills = MJ.getEffectiveSkills(runner);
    let best = { pool: 0, rank: 0, skill: null };
    for (const skill of def.skills) {
      const pool = MJ.dicePoolFor(runner, skill, MJ.gearBonusFor(runner, skill));
      if (pool > best.pool) best = { pool: pool, rank: skills[skill] || 0, skill: skill };
    }
    return best;
  }

  // ── What a CREW brings to a lane ───────────────────────────────
  // Teamwork, out of the source: assistants roll their own pool and
  // every hit hands the lead one extra die, capped at the lead's own
  // skill rating. Expected hits are a third of a pool, so an
  // assistant is worth floor(pool / 3) up to that cap.
  //
  // NOT a sum, and not a max either. A flat max said four runners
  // were worth exactly as much as the best one, which is wrong in
  // formation mode — the others are right there. A sum said four
  // mediocre runners beat one specialist at anything, which deletes
  // the reason to hire a specialist. This lands where the tabletop
  // put it: help is real, help is bounded, and the lead still has to
  // be good.
  function teamworkStack(entries) {
    const live = entries.filter((e) => e.pool > 0).sort((a, b) => b.pool - a.pool);
    if (!live.length) return 0;
    const lead = live[0];
    let total = lead.pool;
    for (let i = 1; i < live.length; i++) {
      total += Math.min(Math.floor(live[i].pool / 3), lead.rank);
    }
    return total;
  }

  function crewLane(runners, laneId) {
    const crew = runners || [];
    if (!crew.length) return 0;
    const entries = crew.map((r) => runnerLane(r, laneId));
    // Defense does not stack in either direction. Nobody soaks a
    // bullet on someone else's behalf, so a crew is exactly as
    // armoured as its worst-dressed member — and that runner is the
    // one who comes home in pieces.
    if (laneId === "defense") {
      return entries.reduce((min, e) => Math.min(min, e.pool), Infinity);
    }
    // Awareness is the sharpest pair of eyes, NOT a teamwork test.
    // You cannot help someone else look at something — in the source
    // everyone rolls their own Perception and whoever makes it is
    // told what they see. Stacking it made a crew of four ordinary
    // people out-notice anything the game can field, so the lane went
    // permanently green and stopped saying anything.
    if (laneId === "awareness") {
      return entries.reduce((max, e) => Math.max(max, e.pool), 0);
    }
    return teamworkStack(entries);
  }

  // ── Every thing this site has standing in it ───────────────────
  // Walked off the site's own record, which is generated from its
  // seed and therefore already fixed — this reads what is there, it
  // never rolls anything.
  function siteObstacles(site) {
    const out = [];
    const push = (list) => { for (const o of list || []) out.push(o); };
    const layout = (site && site.layout) || {};
    for (const room of layout.rooms || []) {
      for (const slot of room.postSlots || []) push(slot.physicalObstacles);
      push(room.astralObstacles);
    }
    for (const e of layout.edges || []) push(e.physicalObstacles);
    for (const ep of layout.entryPoints || []) push(ep.physicalObstacles);
    for (const p of layout.patrols || []) push(p.physicalObstacles);
    for (const z of layout.spiritZones || []) push(z.astralObstacles);
    for (const n of ((site && site.host) || {}).nodes || []) push(n.ice);
    return out;
  }

  // ── The site's own character sheet ─────────────────────────────
  // WHICH lanes a site demands is read off what it actually fields,
  // crossed with the verb table: a lane is demanded only if some
  // verb it fronts would genuinely land on something standing there.
  // A site with cameras and locks and no people does not demand a
  // Face, and saying so is the whole value of the readout.
  //
  // HOW MUCH it demands comes from the number the PLAYER HAS — the
  // estimate, or a confirmed reading if they earned one. Never the
  // true tier. So the card tells you which fights are waiting and
  // stays honestly vague about how hard, which is exactly the shape
  // of a briefing.
  //
  // `shown` is { physical, astral, matrix } as raw 1-10 values.
  // `confirmed` is the same keys as booleans: has the crew actually
  // proven that axis, or is this still the briefing talking? It never
  // changes a number — it only lets the readout admit which of these
  // it is standing behind, the same way the header already prints
  // "~4d" against "4d✓".
  function laneDemands(site, shown, confirmed) {
    shown = shown || {};
    confirmed = confirmed || {};
    const demands = {};
    const note = (laneId, projection) => {
      const value = Math.max(1, Math.min(10, Math.round(shown[projection] || 1)));
      const need = MJ.diceForSecurity(value);
      const cur = demands[laneId];
      if (!cur || need > cur.need) {
        demands[laneId] = {
          lane: laneId, need: need, unit: "dice", from: projection,
          estimated: !confirmed[projection],
        };
      }
    };

    const things = siteObstacles(site);
    let typicalPower = 0;    // the hit you should EXPECT to take
    let worstArmour = 0;     // the toughest thing that shoots back
    let toughest = null;     // and the thing itself, for the Attack gate
    let sharpestEyes = 0;    // the best pair of eyes on the ground

    for (const thing of things) {
      const projection = thing.projection || "physical";
      // Tier is the site's secret. Everything derived below reads the
      // player's own number for that axis instead, so a site cannot
      // leak how good its guards are through the report card.
      const asTier = Math.max(1, Math.min(10, Math.round(shown[projection] || 1)));

      for (const act of MJ.actsFor(thing)) {
        if (!act.effective) continue;
        for (const laneId of lanesOfVerb(act.def)) note(laneId, projection);
      }

      // ── ONLY THINGS WITH A BODY JOIN THE FIGHT READ ────────────
      // Black ICE has `fights: true`, armour 4 and a Black Hammer,
      // and NONE of that is a firefight. It burns a decker's brain —
      // biofeedback, straight onto the stun track — so no coat in the
      // armoury does anything about it, and no gun in the armoury
      // does anything TO it (there is no Matrix attack verb, by
      // design). Letting it into this read broke the card twice:
      //
      //   Defense — a P4 site demanded armour 8, quoting the Power of
      //     something that will never be in the room.
      //   Attack  — ICE was the "toughest thing that fights back", so
      //     `attackPowerFor` found no verb that could even reach it,
      //     every runner failed the gate, and a wired samurai read
      //     Attack 0 against a building full of ordinary guards.
      //
      // The second one is worse than the first: a false zero in the
      // one lane whose whole job is to warn you honestly. Getting
      // caught by ICE is real exposure, but it is Tech's problem —
      // don't be seen — not something you answer with armour or a gun.
      if (thing.fights && (thing.presence || []).some((p) => p !== "matrix")) {
        // ── DEFENSE READS THE TYPICAL HIT, NOT THE WORST GUN ──────
        // Obstacle tiers are drawn uniformly across 1..rating, so the
        // single hardest thing a site COULD field is an outlier — and
        // nobody standing outside the building knows whether it is in
        // there. Reading Defense off that outlier made the lane
        // structurally red: at the softest security band in the game
        // the best affordable coat was still a point short, which
        // trains a player to ignore the one chip trying to tell them
        // they are going to bleed.
        //
        // The MEDIAN tier is what you should expect to be shot by,
        // and Defense is not a gate you clear once. It is ATTRITION —
        // you get shot at repeatedly by whatever turns up, and it is
        // the ordinary round that decides whether the crew comes
        // home. The Attack gate below deliberately keeps the WORST
        // case, because that one really is pass/fail: a guard you
        // cannot scratch is a fight you cannot win, and softening it
        // would restore the exact silence that lost a crew.
        const typicalTier = Math.max(1, Math.ceil(asTier / 2));
        const w = MJ.weaponProfile(MJ.weaponForTier(MJ.OBSTACLE_TEMPLATE(thing.type) || {}, typicalTier));
        // Strength rides melee Power, and a site's fighters scale
        // their attributes with tier exactly as mission.js builds
        // them — 2 + floor(t/3).
        const strength = 2 + Math.floor(typicalTier / 3);
        const power = (w.power || 0) + (w.useStrength ? strength : 0);
        // AP eats armour, so folding it in here keeps both sides of
        // the Defense line in plain armour points: you are safe from
        // this weapon when your rating reaches Power minus AP.
        typicalPower = Math.max(typicalPower, power - (w.ap || 0));
        const templateArmour = (MJ.OBSTACLE_TEMPLATE(thing.type) || {}).armour || 0;
        const armour = templateArmour + Math.floor(asTier / 2);
        if (armour >= worstArmour) { worstArmour = armour; toughest = thing; }
      }
      if ((thing.senses || []).length) {
        // The same pool the site already rolls to spot the crew
        // (mission.js noticePool), at the tier the player believes.
        sharpestEyes = Math.max(sharpestEyes, (1 + Math.ceil(asTier / 2)) + (2 + Math.floor(asTier / 3)));
      }
    }

    if (typicalPower > 0) {
      demands.defense = {
        lane: "defense", need: typicalPower, unit: "armour", from: "physical",
        estimated: !confirmed.physical,
      };
    }
    if (sharpestEyes > 0) {
      demands.awareness = {
        lane: "awareness", need: sharpestEyes, unit: "dice", from: "physical",
        estimated: !confirmed.physical,
      };
    }
    // Carried for the Attack read below — the wall a bullet has to
    // get through before the dice matter at all, and the thing it
    // belongs to, so the gate can be asked with the real verb table
    // rather than a guess about which verbs count as fighting.
    demands._fightArmour = worstArmour;
    demands._toughest = toughest;
    return demands;
  }

  // ── Can this runner hurt what fights back? ─────────────────────
  // The Penetrate gate, asked before the pool. A crew wiped against
  // T4 guards not because they rolled badly but because holdouts at
  // Power 4 cannot get through Armour 5 — no number of dice fixes
  // that, and nothing in the game said so before they walked in.
  //
  // Read off the damaging verbs rather than a hardcoded list, so a
  // new way of hitting things is covered the day it is added.
  //
  // `against` is the thing being hit, and passing it matters: the
  // breaching charge is Power 14 and is NOT an answer to a fight —
  // it is placed against something that is standing still, which the
  // verb table already says (`breach` requires living: false). Left
  // ungated, every runner with Demolitions read as able to punch
  // through any armour in the game.
  function attackPowerFor(runner, against) {
    if (!runner) return 0;
    const skills = MJ.getEffectiveSkills(runner);
    let best = 0;
    for (const id of Object.keys(MJ.VERBS)) {
      const v = MJ.VERBS[id];
      if (!v.damaging) continue;
      if (against && !(MJ.verbReaches(v, against) && MJ.verbLands(v, against))) continue;
      const skill = MJ.verbSkill(v, runner);
      if (!skill || (skills[skill] || 0) <= 0) continue;
      if (v.carries && !v.carries(runner)) continue;
      let power = 0;
      if (skill === "sorcery") {
        // mission.js's manaProfile: Force + 3, and a caster reaches
        // as far as their Magic without overcasting.
        power = (runner.attributes.magic || 0) + 3;
      } else if (v.weaponFor) {
        const pick = MJ.meleeProfileFor(runner);
        const w = MJ.weaponProfile(pick.id);
        power = (w.power || 0) + (pick.quality || 0) +
          (w.useStrength ? (runner.attributes.strength || 0) : 0);
      } else if (v.weapon) {
        power = MJ.weaponProfile(v.weapon).power || 0;
      } else {
        const loadout = MJ.combatLoadoutFor(runner);
        const w = MJ.weaponProfile(loadout.weaponId);
        power = (w.power || 0) + (loadout.weaponQuality || 0) +
          (w.useStrength ? (runner.attributes.strength || 0) : 0);
      }
      if (power > best) best = power;
    }
    return best;
  }

  // ── The report card ────────────────────────────────────────────
  // One row per lane the site actually demands, in a fixed order so
  // the card does not reshuffle itself between two jobs. Lanes the
  // site has no use for are simply absent — a card that always lists
  // seven rows says nothing about the building.
  function laneReport(runners, site, shown, confirmed) {
    const crew = (runners || []).slice();
    const demands = laneDemands(site, shown, confirmed);
    const fightArmour = demands._fightArmour || 0;
    const toughest = demands._toughest || null;
    const rows = [];
    for (const laneId of LANE_ORDER) {
      const demand = demands[laneId];
      if (!demand) continue;
      const def = LANE_DEFS[laneId];
      let have;
      if (laneId === "attack") {
        // Only the runners who can actually get through count. A
        // holdout against a hardsuit contributes exactly nothing to
        // this lane, however good its owner is, and the whole point
        // of the row is to say so BEFORE the dispatch.
        const able = crew.filter((r) => attackPowerFor(r, toughest) > fightArmour);
        have = crewLane(able, laneId);
      } else {
        have = crewLane(crew, laneId);
      }
      if (!isFinite(have)) have = 0;
      rows.push({
        lane: laneId,
        label: def.label,
        unit: demand.unit,
        have: have,
        need: demand.need,
        // Still the briefing talking. The crew's own side is never
        // marked — they know what they hired and what they issued.
        estimated: !!demand.estimated,
        covered: have >= demand.need,
      });
    }
    return rows;
  }

  MJ.LANE_DEFS = LANE_DEFS;
  MJ.LANE_ORDER = LANE_ORDER;
  MJ.lanesOfSkill = lanesOfSkill;
  MJ.lanesOfVerb = lanesOfVerb;
  MJ.runnerLane = runnerLane;
  MJ.crewLane = crewLane;
  MJ.teamworkStack = teamworkStack;
  MJ.siteObstacles = siteObstacles;
  MJ.laneDemands = laneDemands;
  MJ.attackPowerFor = attackPowerFor;
  MJ.laneReport = laneReport;
})();
