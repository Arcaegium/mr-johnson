/* ============================================================
   Mr. Johnson — models/astral.js
   THE ASTRAL PILLAR'S VERBS, per docs/PILLAR-PLAN.md §3.3.

   The three pillars share a mode structure (core/tempo.js) and
   differ in what you DO inside it. This is the astral's half of
   that: what a projecting mage can do that nobody else in the game
   can, and what it costs them.

     assense   read the aura of what is here. The astral's core
               verb — nothing else in the game perceives this way.
               Buys INFORMATION, which is what turns a ward from a
               wall into a puzzle you can see the shape of.
     drift     move. Walls mean nothing out here; only a ward
               actually stops you, which is why the astral route
               ignores the room graph entirely.
     manifest  become perceptible to the physical world. Powerful,
               and instantly witnessable by anything with eyes —
               the one way an astral form can be seen by a guard.
     engage    take on what is in front of you, through the Lattice:
               a ward is UNWOUND, a spirit's binding is UNRAVELLED.

   THE PRESSURE CLOCK IS THE TETHER. Everything here ticks it. Where
   the street measures exposure and the Matrix measures a trace, the
   astral measures TIME OUT OF BODY — and running out is not a
   setback, it is a snap-back and a wound.

   Assensing is the verb that pays for itself: reading a construct
   before touching it is what raises the Lattice's read depth from
   "blind" to something you can act on. A mage who charges in
   without looking is solving the same puzzle with less of it
   visible.

   Usage:
     MJ.astralPrompt(run);                  // verbs available now
     MJ.astralAct(rng, run, "assense");     // spends a tick
     MJ.astralEngage(rng, run);             // opens the Lattice
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const VERBS = {
    assense: {
      label: "assense it", skill: "assensing",
      describe: "read the aura — what it is, and where it is weak",
    },
    drift: {
      label: "drift past", skill: null,
      describe: "walls are nothing out here; only a ward stops you",
    },
    manifest: {
      label: "manifest", skill: "sorcery",
      describe: "become visible to the living — and to everything watching",
    },
    engage: {
      label: "take it on", skill: null,
      describe: "unwind a ward, or unravel what binds a spirit",
    },
  };

  function isAstralRun(run) {
    return !!run && run.kind === "astralRun";
  }

  // The projecting mage: the strongest Magic on the crew, which is
  // the same runner tetherFor sizes the clock against.
  function projector(run) {
    if (!run || !run.runners || !run.runners.length) return null;
    return run.runners.reduce((a, b) =>
      ((a.attributes.magic || 0) >= (b.attributes.magic || 0) ? a : b));
  }

  // ── What assensing buys ────────────────────────────────────────
  // Recorded per obstacle, by identity — the same rule the rest of
  // the run follows, so a responder splicing in cannot inherit a
  // reading it never earned.
  function studied(run, obstacle) {
    if (!run.assensed) return 0;
    return run.assensed.get(obstacle) || 0;
  }

  function noteStudy(run, obstacle, depth) {
    if (!run.assensed) run.assensed = new Map();
    run.assensed.set(obstacle, Math.max(studied(run, obstacle), depth));
  }

  function astralPrompt(run) {
    if (!isAstralRun(run) || MJ.missionDone(run)) return null;
    const obstacle = run.obstacles[run.index];
    const mage = projector(run);
    if (!mage) return null;
    const skills = MJ.getEffectiveSkills(mage);
    const options = [];
    for (const id of Object.keys(VERBS)) {
      const v = VERBS[id];
      const trained = !v.skill || (skills[v.skill] || 0) > 0;
      options.push({
        verb: id, label: v.label, describe: v.describe,
        skill: v.skill,
        pool: v.skill ? MJ.dicePoolFor(mage, v.skill, 0) : 0,
        available: trained && !(id === "manifest" && run.manifested),
        runner: mage,
      });
    }
    return {
      pillar: "astral",
      obstacle: obstacle,
      label: obstacle ? obstacle.label : null,
      tier: obstacle ? obstacle.tier : 0,
      index: run.index,
      total: run.obstacles.length,
      // The clock that defines this pillar.
      tether: run.tether,
      tetherMax: run.tetherMax,
      manifested: !!run.manifested,
      studied: obstacle ? studied(run, obstacle) : 0,
      options: options,
    };
  }

  // ── One astral act ─────────────────────────────────────────────
  // Every verb costs a tick of the tether. That is the pillar's
  // whole economy: out here, the currency is time.
  function astralAct(rng, run, verb, opts) {
    opts = opts || {};
    if (!isAstralRun(run)) return { ok: false, error: "not an astral run" };
    if (MJ.missionDone(run)) return { ok: false, error: "the run is over" };
    const def = VERBS[verb];
    if (!def) return { ok: false, error: "not something a projecting mage can do" };
    const mage = projector(run);
    const obstacle = run.obstacles[run.index];

    if (verb === "assense") {
      const pool = MJ.dicePoolFor(mage, "assensing", 0);
      if (pool <= 0) return { ok: false, error: "nobody here can assense" };
      const hits = MJ.countHits(MJ.rollDicePool(rng, pool));
      if (obstacle) noteStudy(run, obstacle, hits);
      MJ.tickTether(run);
      return {
        ok: true, verb: verb, hits: hits,
        // What the reading actually told them. This is the payoff:
        // a studied construct opens as a Lattice you can see into.
        learned: obstacle ? {
          label: obstacle.label, tier: obstacle.tier,
          kind: obstacle.type === "ward" ? "a barrier" : "something aware",
          depth: hits,
        } : null,
      };
    }

    if (verb === "drift") {
      // Only a ward actually stops an astral form. Anything else is
      // scenery you float past.
      const blocked = obstacle && obstacle.type === "ward" && !run.neutralized.has(obstacle);
      MJ.tickTether(run);
      if (blocked) {
        return { ok: true, verb: verb, blocked: true, by: obstacle.label,
          note: "the ward holds — it is the one thing out here that is a wall" };
      }
      run.index += 1;
      return { ok: true, verb: verb, moved: true };
    }

    if (verb === "manifest") {
      if (run.manifested) return { ok: false, error: "already manifested" };
      const pool = MJ.dicePoolFor(mage, "sorcery", 0);
      if (pool <= 0) return { ok: false, error: "no sorcery to hold a form with" };
      run.manifested = true;
      MJ.tickTether(run);
      // Manifesting is the one way a projecting mage becomes visible
      // to the living, so it is witnessed as a threatening act by
      // anything with physical eyes. Power with an immediate price.
      const applied = MJ.witnessAct(run.state, run.day, MJ.THREAT.THREATENING);
      return {
        ok: true, verb: verb, manifested: true,
        read: { threatClass: MJ.THREAT.THREATENING, band: applied.band, changed: applied.band !== applied.before },
      };
    }

    // engage — handled by astralEngage so the caller can drive the
    // Lattice move by move.
    return { ok: false, error: "use astralEngage for that" };
  }

  // ── Engaging: the Lattice IS how the astral resolves things ────
  // A ward gets UNWOUND (race its re-closing). A spirit's binding
  // gets UNRAVELLED (right order, or it re-forms). Studying it first
  // is what makes either survivable.
  function astralEngage(rng, run, opts) {
    opts = opts || {};
    if (!isAstralRun(run)) return { ok: false, error: "not an astral run" };
    const obstacle = run.obstacles[run.index];
    if (!obstacle) return { ok: false, error: "nothing in front of you" };
    const mage = projector(run);
    const mode = obstacle.type === "ward" ? "unwind" : "unravel";
    const force = Math.max(1, Math.min(MJ.maxForceFor(mage), opts.force || (mage.attributes.magic || 1)));

    const lattice = MJ.beginLattice(rng.fork ? rng.fork("astral") : rng, mode,
      { force: force }, mage, { rating: obstacle.tier });
    // A construct the mage has already read opens further. This is
    // what assensing bought, and why charging in blind is a choice
    // with teeth rather than a missing feature.
    const study = studied(run, obstacle);
    if (study > 0 && lattice) {
      lattice.studyBonus = study;
      const lifted = Math.min(6, (mage.attributes && MJ.getEffectiveSkills(mage).assensing || 0) + study);
      lattice.depth = MJ.latticeReadDepth(lifted);
    }
    run.lattice = lattice;
    run.latticeFor = obstacle;
    return { ok: true, mode: mode, lattice: lattice, force: force, studied: study };
  }

  // Resolve an open Lattice back into the run: a broken ward is
  // neutralised, a banished spirit is gone, and either way the mage
  // owes Drain and the tether has been running the whole time.
  function astralResolve(rng, run) {
    const lattice = run.lattice;
    if (!lattice) return { ok: false, error: "nothing open" };
    if (!MJ.latticeDone(lattice)) return { ok: false, error: "still working it" };
    const obstacle = run.latticeFor;
    const drain = MJ.latticeDrain(rng.fork ? rng.fork("ld") : rng, lattice);
    const mage = projector(run);
    // ONE DRAIN LAW. This used to write wounds only when overcast and
    // silently discard stun Drain — which made the astral the one
    // plane where a mage could push flat out forever for free, on
    // exactly the pillar where Drain is supposed to be the tether's
    // partner. It bills through mission.js like every other cast now,
    // tracks and drop included.
    MJ.applyDrain(run, mage, drain);

    // Every move at the lattice was time out of body.
    for (let i = 0; i < Math.max(1, lattice.moves); i++) MJ.tickTether(run);

    if (lattice.success && obstacle) {
      run.neutralized.add(obstacle);
      run.index += 1;
    } else if (lattice.flared) {
      // A binding that snapped back is felt by whatever it belonged
      // to. Out here that is always something aware.
      MJ.witnessAct(run.state, run.day, MJ.THREAT.THREATENING);
    }
    const result = {
      ok: true, success: !!lattice.success, mode: lattice.mode,
      moves: lattice.moves, backlash: lattice.backlash, flared: !!lattice.flared,
      drain: drain.damage, physical: !!drain.physical,
      obstacle: obstacle ? obstacle.label : null,
    };
    run.lattice = null;
    run.latticeFor = null;
    return result;
  }

  MJ.ASTRAL_VERBS = VERBS;
  MJ.isAstralRun = isAstralRun;
  MJ.astralProjector = projector;
  MJ.astralPrompt = astralPrompt;
  MJ.astralAct = astralAct;
  MJ.astralEngage = astralEngage;
  MJ.astralResolve = astralResolve;
  MJ.astralStudied = studied;
})();
