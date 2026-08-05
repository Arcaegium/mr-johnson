/* ============================================================
   Mr. Johnson — models/street.js
   THE MEATSPACE PILLAR'S VERBS, per docs/PILLAR-PLAN.md §3.1.

   The Genesis game is top-down for BOTH exploration and combat —
   one view, no separate battle screen — with real-time movement and
   short fights. That is the destination, and the thing which makes
   it that rather than a menu is POSITION: where the crew is standing
   decides who can see them, and moving is the decision.

     move      advance along the walk. routeObstacles already makes
               the route a real traversal with rooms and legs; this
               makes GOING somewhere a choice the player makes
               rather than something that happens to them.
     observe   read the room before committing. Costs a beat, buys
               certainty about what is here and what has eyes.
     approach  work the obstacle in front of you — the existing
               affordance interaction, unchanged.
     engage    deliberately start the fight. Forces turn-based, the
               way combat does in every pillar.

   THE PRESSURE CLOCK IS THE ALERT BANDS, which already exist and
   are already surfaced by the awareness meter. The street's
   character is that its clock is SOCIAL: it only moves when
   something perceives you, so going carefully genuinely costs
   nothing but time. Contrast the astral, where the tether runs
   whether anyone noticed or not, and the Matrix, where Overwatch
   climbs the moment you touch anything.

   That difference is the point. Three pillars, three clocks, three
   reasons to hurry:
     street   they might see you
     astral   your body is waiting and the cord is finite
     matrix   they are already counting

   Usage:
     MJ.streetPrompt(run);
     MJ.streetAct(rng, run, "observe");
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const VERBS = {
    move:     { label: "move up", skill: null,
                describe: "on to the next ground — and whatever is standing on it" },
    observe:  { label: "take a look first", skill: "stealth",
                describe: "what is here, and what has eyes on it" },
    approach: { label: "work the obstacle", skill: null,
                describe: "the thing in front of you, on its own terms" },
    engage:   { label: "start it", skill: "firearms",
                describe: "open fire — this becomes a firefight, turn by turn" },
  };

  function isStreetRun(run) {
    return !!run && (run.kind === "jobObjective" || run.kind === "recon" ||
      run.kind === "resourceGathering" || run.kind === "search") && !!run.streetRoute;
  }

  function observed(run, obstacle) {
    return !!(run.observed && run.observed.get(obstacle));
  }

  // What else can see the crew from where they are standing. The
  // same rule witnessing uses, exposed as something the player can
  // ask about BEFORE acting rather than discover afterwards.
  function watchersHere(run) {
    const obstacle = run.obstacles[run.index];
    if (!obstacle || !obstacle.rooms) return [];
    return run.obstacles.filter((o) =>
      o !== obstacle && !run.neutralized.has(o) &&
      (o.senses || []).indexOf("physical") !== -1 &&
      o.rooms && o.rooms.some((r) => obstacle.rooms.indexOf(r) !== -1));
  }

  function streetPrompt(run) {
    if (!isStreetRun(run) || MJ.missionDone(run)) return null;
    const obstacle = run.obstacles[run.index];
    const upright = run.runners.filter((r) => !run.downed || !run.downed.has(r));
    if (!upright.length) return null;
    const route = run.streetRoute;
    const leg = obstacle && obstacle.leg !== undefined ? obstacle.leg : 0;

    const options = [];
    for (const id of Object.keys(VERBS)) {
      const v = VERBS[id];
      let best = null;
      if (v.skill) {
        for (const r of upright) {
          const pool = MJ.dicePoolFor(r, v.skill, MJ.gearBonusFor(r, v.skill));
          if (!best || pool > best.pool) best = { runner: r, pool: pool };
        }
      }
      let available = !v.skill || (best && best.pool > 0);
      // You cannot start a fight with something that cannot fight.
      if (id === "engage") available = available && !!(obstacle && obstacle.fights);
      // Looking twice at the same ground tells you nothing new.
      if (id === "observe") available = available && !observed(run, obstacle);
      options.push({
        verb: id, label: v.label, describe: v.describe, skill: v.skill,
        runner: best ? best.runner : null,
        pool: best ? best.pool : 0,
        available: !!available,
      });
    }

    return {
      pillar: "street",
      obstacle: obstacle,
      label: obstacle ? obstacle.label : null,
      tier: obstacle ? obstacle.tier : 0,
      // WHERE they are — the pillar's defining fact.
      leg: leg,
      legs: route && route.path ? route.path.length : 0,
      where: obstacle ? obstacle.where : null,
      observed: obstacle ? observed(run, obstacle) : false,
      // The street's clock is social: it only moves when seen.
      awareness: run.site && run.site.securityState && MJ.awarenessRead
        ? MJ.awarenessRead(run.site.securityState, run.day) : null,
      watchers: watchersHere(run).map((o) => o.label),
      options: options,
    };
  }

  function streetAct(rng, run, verb, opts) {
    opts = opts || {};
    if (!isStreetRun(run)) return { ok: false, error: "not a street run" };
    if (MJ.missionDone(run)) return { ok: false, error: "the run is over" };
    const def = VERBS[verb];
    if (!def) return { ok: false, error: "not something a crew does on the ground" };
    const obstacle = run.obstacles[run.index];

    if (verb === "observe") {
      if (observed(run, obstacle)) return { ok: false, error: "you have already had a good look" };
      const upright = run.runners.filter((r) => !run.downed || !run.downed.has(r));
      let best = null;
      for (const r of upright) {
        const pool = MJ.dicePoolFor(r, "stealth", MJ.gearBonusFor(r, "stealth"));
        if (!best || pool > best.pool) best = { runner: r, pool: pool };
      }
      if (!best || best.pool <= 0) return { ok: false, error: "nobody here can case a room quietly" };
      const hits = MJ.countHits(MJ.rollDicePool(rng, best.pool));
      if (!run.observed) run.observed = new Map();
      run.observed.set(obstacle, hits);
      // Looking costs a beat. If they are ALREADY hunting, standing
      // still to look is its own risk — the same rule extended work
      // follows.
      if (MJ.alertEngaged(run.state)) MJ.addAlertPointsAll(run.state, 1);
      const watchers = watchersHere(run);
      return {
        ok: true, verb: verb, hits: hits, by: best.runner.identity.handle,
        learned: {
          label: obstacle.label, tier: obstacle.tier,
          fights: !!obstacle.fights,
          // A good look tells you what your options actually are.
          ways: hits >= 2 ? obstacle.affordances.map((a) => a.verb) : null,
          watching: watchers.map((o) => o.label),
        },
      };
    }

    if (verb === "move") {
      // Advancing past an obstacle without dealing with it is a real
      // choice — it stays behind you, still watching, and the
      // witnessing rules already know what that means.
      run.index += 1;
      return { ok: true, verb: verb, leftBehind: obstacle ? obstacle.label : null, index: run.index };
    }

    if (verb === "engage") {
      if (!obstacle || !obstacle.fights) return { ok: false, error: "there is nothing there to fight" };
      // Combat forces turn-based in every pillar. The tempo layer
      // owns that; this just says when.
      MJ.enterCombat(run.tempo);
      return { ok: true, verb: verb, opensCombat: true, against: obstacle.label,
        mode: MJ.describeTempo(run.tempo) };
    }

    // approach — the existing affordance interaction, which already
    // works. Kept as a named verb so the pillar's grammar is
    // complete rather than half-here and half-elsewhere.
    return { ok: false, error: "use missionChoose for an approach" };
  }

  MJ.STREET_VERBS = VERBS;
  MJ.isStreetRun = isStreetRun;
  MJ.streetPrompt = streetPrompt;
  MJ.streetAct = streetAct;
  MJ.streetObserved = observed;
  MJ.streetWatchers = watchersHere;
})();
