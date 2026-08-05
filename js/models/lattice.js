/* ============================================================
   Mr. Johnson — models/lattice.js
   THE ASTRAL'S OWN GRAMMAR, per docs/PILLAR-PLAN.md §3.3.

   Magic here is not a roll you make, it is a STRUCTURE YOU
   MANIPULATE. Every construct — a ward, a spirit's binding, a spell
   being assembled — is a lattice of mana threads. One metaphor,
   three uses:

     unwind    break a ward: unwind it far enough to slip through
               before it cranks itself back closed. Progress
               against decay — you are racing a thing that repairs
               itself.
     unravel   banish a spirit: cut the threads in the RIGHT ORDER,
               like defusing a bomb. A wrong cut backlashes.
     assemble  cast a spell or summon a spirit: build your own
               circuit to a shape the spell or spirit dictates.

   THE DIALS — every one of them is the RUNNER's, never the
   player's:

     Magic      how hard you can push at MAX. Your ceiling, and
                your maximum threads when assembling.
     Force      what PERCENTAGE of that max you are pushing right
                now. A throttle, and Drain scales with it.
     Sorcery    how strong a single move is — how far one push
                carries you toward the goal.
     Conjuring  the same measure, for summoning and banishing.
     Assensing  the QUALITY OF INFORMATION about each thread: its
                strength, whether it is a dead end. NOT whether
                threads are visible. You always see the lattice;
                assensing decides how much you understand of what
                you are looking at.

   THE CONSTRAINT THAT MUST HOLD:
   The player is the Johnson. They never personally go. So this can
   never become a test of the PLAYER's dexterity or pattern
   recognition — that would make a brilliant mage and a mediocre one
   play identically, quietly replacing runner skill with player
   skill, and the whole game is about cultivating runners. The
   runner's stats set the puzzle's parameters. The player chooses
   which thread to pull and how hard to push, and those choices
   matter — but a bad mage hands the player a bad puzzle and no
   amount of cleverness fixes that.

   Usage:
     const l = MJ.beginLattice(rng, "unwind", { force: 4 }, runner, target);
     MJ.latticeRead(l);              // what the crew can see of it
     MJ.latticePull(l, threadId);    // one move
     MJ.latticeDone(l);              // resolved either way?
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const MODES = ["unwind", "unravel", "assemble"];

  // Threads carry a resonance. It is flavour with teeth: matching
  // resonance is what makes an assembled circuit hold, and reading
  // it is what assensing buys.
  const RESONANCES = ["fire", "water", "earth", "air", "man", "beast", "shadow", "light"];

  // ── What the runner brings ─────────────────────────────────────
  // Read once at the start so a lattice is a fixed problem rather
  // than one that shifts under the player mid-solve.
  function casterProfile(runner, opts) {
    opts = opts || {};
    const attrs = (runner && runner.attributes) || {};
    const skills = runner ? MJ.getEffectiveSkills(runner) : {};
    const magic = attrs.magic || 0;
    // Force is expressed as a share of the caster's ceiling, which is
    // what makes "how hard are you pushing" a legible decision. The
    // absolute number is still what Drain keys off, because that is
    // the tabletop's unit and resistDrain already speaks it.
    const maxForce = MJ.maxForceFor ? MJ.maxForceFor(runner) : magic + 2;
    const force = Math.max(1, Math.min(maxForce, opts.force || magic || 1));
    return {
      magic: magic,
      force: force,
      maxForce: maxForce,
      forceShare: maxForce > 0 ? force / maxForce : 0,
      sorcery: skills.sorcery || 0,
      conjuring: skills.conjuring || 0,
      assensing: skills.assensing || 0,
    };
  }

  // How far one move carries you. The governing skill sets the base
  // and Force multiplies it, so a strong mage pushing gently and a
  // weak one pushing flat out can land in the same place — and pay
  // very different Drain for it.
  function moveStrength(profile, mode) {
    const skill = mode === "assemble" || mode === "unravel"
      ? Math.max(profile.conjuring, profile.sorcery)
      : profile.sorcery;
    // Half-skill base, throttled by Force. Tuned so a competent mage
    // takes several moves at a ward rather than tearing it open in
    // two, and a weak one cannot outpace the re-closing at all —
    // which is the point of the mode: not everyone can break a ward.
    return Math.max(1, Math.round((1 + skill / 2) * (0.5 + profile.forceShare)));
  }

  // ── What assensing buys ────────────────────────────────────────
  // Never visibility — the lattice is always on screen. Assensing
  // decides how much of each thread's TRUTH comes with it. Below the
  // threshold a reading is absent; above it, progressively exact.
  function readDepth(assensing) {
    if (assensing >= 6) return "exact";   // strength and role, precisely
    if (assensing >= 4) return "strong";  // strength banded, dead ends named
    if (assensing >= 2) return "vague";   // a sense of heavy or light
    return "blind";                        // it is a shape and nothing more
  }

  function describeThread(thread, depth) {
    const out = { id: thread.id, resonance: thread.resonance, cut: !!thread.cut };
    if (depth === "blind") return Object.assign(out, { strength: null, role: null, note: "unreadable" });
    if (depth === "vague") {
      return Object.assign(out, {
        strength: thread.strength >= 4 ? "heavy" : "light",
        role: null,
        note: thread.strength >= 4 ? "it resists" : "it gives",
      });
    }
    if (depth === "strong") {
      // Dead ends named, and the OPENING of the sequence readable —
      // you can see how the pattern starts but not how it ends.
      // Without this, four ranks of assensing bought nothing on a
      // binding and the difference between a journeyman and a
      // dabbler was pure luck, which is not what the skill is for.
      const opening = thread.order !== null && thread.order <= 1;
      return Object.assign(out, {
        strength: thread.strength,
        role: thread.deadEnd ? "dead end" : "load-bearing",
        order: opening ? thread.order : null,
        note: thread.deadEnd ? "goes nowhere"
          : opening ? "you can see where this one sits"
          : "holds the pattern, position unclear",
      });
    }
    return Object.assign(out, {
      strength: thread.strength, role: thread.deadEnd ? "dead end" : "load-bearing",
      order: thread.order, note: thread.deadEnd ? "goes nowhere" : "holds the pattern",
    });
  }

  // ── Building a lattice ─────────────────────────────────────────
  function makeThreads(rng, count, opts) {
    opts = opts || {};
    const threads = [];
    for (let i = 0; i < count; i++) {
      threads.push({
        id: i,
        resonance: rng.pick(RESONANCES),
        strength: rng.int(1, 6),
        deadEnd: false,
        cut: false,
        order: null,
      });
    }
    if (opts.orderMatters) {
      // The defusal sequence. Some strands genuinely go nowhere —
      // cutting one is safe but wastes the move, which is what makes
      // assensing worth having rather than a nicety.
      const shuffled = rng.shuffle(threads.slice());
      const live = shuffled.slice(0, Math.max(2, Math.ceil(count / 2)));
      live.forEach((t, i) => { t.order = i; });
      shuffled.slice(live.length).forEach((t) => { t.deadEnd = true; });
    }
    return threads;
  }

  function beginLattice(rng, mode, opts, runner, target) {
    opts = opts || {};
    target = target || {};
    if (MODES.indexOf(mode) === -1) return null;
    const profile = casterProfile(runner, opts);
    // The construct's own rating: a ward's Force, a spirit's Force,
    // the demanded shape of a spell. Everything scales off it.
    const rating = Math.max(1, target.rating || target.tier || target.force || 3);

    const lattice = {
      mode: mode,
      rating: rating,
      profile: profile,
      runner: runner,
      rng: rng,
      moves: 0,
      progress: 0,
      // How far you have to get. Unwinding needs a window wide
      // enough to pass; assembling needs the shape closed.
      goal: rating * 3,
      done: false,
      success: false,
      backlash: 0,       // wrong cuts, felt as Drain later
      flared: false,     // the construct noticed and reacted
      log: [],
      threads: [],
      depth: readDepth(profile.assensing),
    };

    if (mode === "unwind") {
      lattice.threads = makeThreads(rng, Math.max(4, Math.min(10, rating + 4)));
      lattice.goal = rating * 4;
      // It cranks itself back closed. This is the whole character of
      // breaking a ward: you are not beating a threshold, you are
      // outpacing a repair. A mage whose per-move push is at or below
      // this rate literally cannot get through, no matter how many
      // strands they pull — which is correct.
      lattice.recloseRate = Math.max(1, Math.ceil(rating / 2));
    } else if (mode === "unravel") {
      lattice.threads = makeThreads(rng, Math.max(3, Math.min(8, rating + 2)), { orderMatters: true });
      lattice.nextOrder = 0;
      lattice.liveThreads = lattice.threads.filter((t) => !t.deadEnd).length;
    } else {
      // Assemble. Magic sets how many threads you can hold at once;
      // Force decides how many you actually commit. The shape comes
      // from the spell or spirit being built.
      lattice.maxThreads = Math.max(1, profile.magic);
      lattice.committed = Math.max(2, Math.min(lattice.maxThreads, Math.round(profile.magic * profile.forceShare) || 1));
      lattice.shape = (target.shape || []).slice();
      if (!lattice.shape.length) {
        for (let i = 0; i < Math.max(2, Math.min(6, rating)); i++) lattice.shape.push(rng.pick(RESONANCES));
      }
      lattice.built = [];
      // The threads are the caster's OWN mana, so their resonances are
      // known. What assensing buys here is sight of the SHAPE — how
      // far ahead you can read the pattern you are being asked to
      // build. A great mage plans the whole circuit; a poor one lays
      // one thread and finds out. That is the puzzle: not "can you
      // see your hand" but "do you know what it is for."
      lattice.shapeVisible = profile.assensing >= 6 ? lattice.shape.length
        : profile.assensing >= 4 ? 3
        : profile.assensing >= 2 ? 1
        : 0;
      // A solvable hand: every resonance the shape needs is present,
      // padded with decoys. Laying the wrong one still burns it, so
      // the cost of building blind is real without being hopeless.
      const hand = lattice.shape.slice();
      const decoys = Math.max(2, lattice.committed);
      for (let i = 0; i < decoys; i++) hand.push(rng.pick(RESONANCES));
      lattice.threads = rng.shuffle(hand).map((res, i) => ({
        id: i, resonance: res, strength: rng.int(1, 6),
        deadEnd: false, cut: false, order: null,
      }));
      lattice.goal = lattice.shape.length;
    }
    return lattice;
  }

  // ── One move ───────────────────────────────────────────────────
  // The player picks a thread. What that is worth is the runner's.
  function latticePull(lattice, threadId) {
    if (!lattice || lattice.done) return null;
    const thread = lattice.threads[threadId];
    if (!thread || thread.cut) return { ok: false, error: "no such thread" };
    lattice.moves += 1;
    const strength = moveStrength(lattice.profile, lattice.mode);

    if (lattice.mode === "unwind") {
      // Pulling a heavy strand gives more, but the construct repairs
      // between pulls. Net progress is what matters.
      thread.cut = true;
      // The strand's own weight helps, but the push is the caster's.
      const gained = strength + Math.floor(thread.strength / 2);
      lattice.progress = Math.max(0, lattice.progress + gained - lattice.recloseRate);
      lattice.log.push({ move: lattice.moves, thread: threadId, gained: gained, reclosed: lattice.recloseRate, progress: lattice.progress });
      if (lattice.progress >= lattice.goal) { lattice.done = true; lattice.success = true; }
      else if (lattice.threads.every((t) => t.cut)) {
        // Out of strands and the window never opened: it holds.
        lattice.done = true; lattice.success = false;
      }
      return { ok: true, gained: gained, progress: lattice.progress, goal: lattice.goal };
    }

    if (lattice.mode === "unravel") {
      thread.cut = true;
      if (thread.deadEnd) {
        // Safe, but a wasted move — and the thing you are unravelling
        // gets a beat you did not want to give it.
        lattice.log.push({ move: lattice.moves, thread: threadId, result: "dead end" });
        return { ok: true, deadEnd: true, progress: lattice.progress, goal: lattice.goal };
      }
      if (thread.order === lattice.nextOrder) {
        lattice.nextOrder += 1;
        lattice.progress += 1;
        lattice.log.push({ move: lattice.moves, thread: threadId, result: "clean cut", progress: lattice.progress });
        if (lattice.nextOrder >= lattice.liveThreads) { lattice.done = true; lattice.success = true; }
        return { ok: true, clean: true, progress: lattice.progress, goal: lattice.liveThreads };
      }
      // Out of order. The binding snaps back and it knows you are
      // there — this is the bomb going off in your hands.
      lattice.backlash += 1;
      lattice.flared = true;
      lattice.nextOrder = 0;
      for (const t of lattice.threads) { if (!t.deadEnd) t.cut = false; }
      lattice.progress = 0;
      lattice.log.push({ move: lattice.moves, thread: threadId, result: "OUT OF ORDER — it re-forms" });
      if (lattice.backlash >= 3) { lattice.done = true; lattice.success = false; }
      return { ok: true, backlash: true, progress: 0 };
    }

    // Assemble: lay this thread into the circuit. It holds if its
    // resonance is the one the shape wants next.
    const wanted = lattice.shape[lattice.built.length];
    thread.cut = true;
    if (thread.resonance === wanted) {
      lattice.built.push(thread.resonance);
      lattice.progress = lattice.built.length;
      lattice.log.push({ move: lattice.moves, thread: threadId, result: "holds", progress: lattice.progress });
      if (lattice.built.length >= lattice.shape.length) { lattice.done = true; lattice.success = true; }
      return { ok: true, held: true, progress: lattice.progress, goal: lattice.goal };
    }
    // Wrong resonance: the thread burns off. Committed threads are
    // finite, so this is the real cost of building blind.
    lattice.backlash += 1;
    lattice.log.push({ move: lattice.moves, thread: threadId, result: "burns off", wanted: wanted, got: thread.resonance });
    if (lattice.backlash >= lattice.committed) { lattice.done = true; lattice.success = false; }
    return { ok: true, burned: true, wanted: wanted, progress: lattice.progress };
  }

  // Walk away mid-solve. A half-unwound ward re-closes; a half-cut
  // binding re-forms. Nothing is kept.
  function latticeAbandon(lattice) {
    if (!lattice || lattice.done) return lattice;
    lattice.done = true;
    lattice.success = false;
    lattice.abandoned = true;
    return lattice;
  }

  function latticeDone(lattice) {
    return !lattice || !!lattice.done;
  }

  // What a renderer shows. Plain here; the impressionist astral makes
  // it beautiful later without the model changing.
  function latticeRead(lattice) {
    if (!lattice) return null;
    return {
      mode: lattice.mode,
      rating: lattice.rating,
      depth: lattice.depth,
      progress: lattice.progress,
      goal: lattice.mode === "unravel" ? lattice.liveThreads : lattice.goal,
      moves: lattice.moves,
      backlash: lattice.backlash,
      flared: lattice.flared,
      done: lattice.done,
      success: lattice.success,
      // The caster's dials, so a readout can explain WHY the puzzle
      // looks the way it does rather than just presenting it.
      pushing: {
        force: lattice.profile.force,
        max: lattice.profile.maxForce,
        share: Math.round(lattice.profile.forceShare * 100),
        perMove: moveStrength(lattice.profile, lattice.mode),
      },
      recloseRate: lattice.recloseRate || 0,
      // Only as much of the pattern as this caster can actually read.
      shape: lattice.shape
        ? lattice.shape.map((r, i) => (i < (lattice.shapeVisible || 0) + (lattice.built ? lattice.built.length : 0) ? r : null))
        : null,
      shapeVisible: lattice.shapeVisible === undefined ? null : lattice.shapeVisible,
      built: lattice.built ? lattice.built.slice() : null,
      committed: lattice.committed || null,
      threads: lattice.threads.map((t) => describeThread(t, lattice.depth)),
    };
  }

  // Drain is owed on what was attempted, not on whether it worked,
  // and backlash adds to it. Resolved through the existing SR5 path
  // so magic costs the same here as everywhere else.
  function latticeDrain(rng, lattice) {
    if (!lattice) return null;
    const drain = MJ.resistDrain(rng, lattice.runner, lattice.profile.force);
    if (lattice.backlash > 0) drain.damage += lattice.backlash;
    drain.backlash = lattice.backlash;
    return drain;
  }

  MJ.LATTICE_MODES = MODES;
  MJ.LATTICE_RESONANCES = RESONANCES;
  MJ.beginLattice = beginLattice;
  MJ.latticePull = latticePull;
  MJ.latticeAbandon = latticeAbandon;
  MJ.latticeDone = latticeDone;
  MJ.latticeRead = latticeRead;
  MJ.latticeDrain = latticeDrain;
  MJ.latticeMoveStrength = moveStrength;
  MJ.latticeReadDepth = readDepth;
})();
