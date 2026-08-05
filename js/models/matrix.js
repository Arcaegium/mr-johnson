/* ============================================================
   Mr. Johnson — models/matrix.js
   THE MATRIX PILLAR'S VERBS, per docs/PILLAR-PLAN.md §3.2.

   The Genesis game's Matrix is the reference: the runner is
   REPLACED BY A PERSONA which navigates GEOMETRIC NODE STRUCTURES —
   CPU, data stores — avoiding IC, to steal data, erase files, or
   crash the system at the CPU. That is a crawl through a topology,
   not a corridor with different scenery, and the host graph has
   existed here for a while without the verbs to treat it as one.

     traverse    move the persona to an adjacent node. The graph was
                 always there; moving through it becomes a CHOICE
                 rather than a fixed route walked for you.
     probe       read a node before entering it — what ice sits on
                 it, whether it holds anything worth taking. Costs
                 Overwatch, buys knowledge.
     run         execute against the ice in front of you.
     exfiltrate  pull data out. Taking it is an ACT with a price,
                 not a reward that lands quietly at the end.
     jackOut     leave. Clean if untraced; it hurts if you are not.

   THE PRESSURE CLOCK IS OVERWATCH — SR5's Overwatch Score. Every
   illegal act raises it, and at convergence the host has you
   located and the run ends regardless of how well it was going.
   This is the decker's own timer, and no other pillar has one like
   it: the street can go quiet and wait, the astral is racing a
   tether it can feel, but a decker is being ARITHMETICALLY hunted
   from the moment they touch anything.

   Probing costs Overwatch too, which is the whole tension: the
   knowledge that keeps you alive is bought with the clock that
   kills you.

   Usage:
     MJ.matrixPrompt(run);
     MJ.matrixAct(rng, run, "probe", { node: 2 });
     MJ.overwatchOf(run);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // SR5: GOD converges at 40. Kept, because it is a good number —
  // long enough to do real work, short enough to feel it.
  const CONVERGENCE = 40;

  // What each act costs on the clock. Illegal ones cost more; the
  // gradient is what makes a careful decker different from a fast
  // one rather than just slower.
  const OVERWATCH_COST = {
    traverse: 1,
    probe: 2,
    run: 4,
    exfiltrate: 6,
    jackOut: 0,
  };

  const VERBS = {
    traverse:   { label: "move to another node", skill: null,
                  describe: "the persona walks the system's own topology" },
    probe:      { label: "probe the node", skill: "computer",
                  describe: "what is on it, before you are standing on it" },
    run:        { label: "run against the ice", skill: "hacking",
                  describe: "execute — the ice gets a say" },
    exfiltrate: { label: "pull the data", skill: "hacking",
                  describe: "take it, and be louder for having taken it" },
    jackOut:    { label: "jack out", skill: null,
                  describe: "leave — clean if they have not found you" },
  };

  function isMatrixRun(run) {
    return !!run && run.kind === "matrixRun";
  }

  function decker(run) {
    if (!run || !run.runners || !run.runners.length) return null;
    const skills = run.runners.map((r) => MJ.getEffectiveSkills(r));
    let best = 0;
    run.runners.forEach((r, i) => {
      if ((skills[i].hacking || 0) > (skills[best].hacking || 0)) best = i;
    });
    return run.runners[best];
  }

  function ensureOverwatch(run) {
    if (run.overwatch === undefined) run.overwatch = 0;
    return run.overwatch;
  }

  function overwatchOf(run) {
    return {
      score: ensureOverwatch(run),
      convergence: CONVERGENCE,
      remaining: Math.max(0, CONVERGENCE - ensureOverwatch(run)),
      converged: ensureOverwatch(run) >= CONVERGENCE,
    };
  }

  // Raise it, and check whether the host has finally placed them.
  // Convergence is not a warning — it is the end of the run.
  function raiseOverwatch(run, amount) {
    ensureOverwatch(run);
    run.overwatch += Math.max(0, amount || 0);
    if (run.overwatch >= CONVERGENCE && !run.converged) {
      run.converged = true;
      // They know exactly where the persona is. Everything the host
      // owns is now looking at it.
      MJ.witnessAct(run.state, run.day, MJ.THREAT.THREATENING);
      return true;
    }
    return false;
  }

  // Which nodes the persona can reach from where it stands.
  function adjacentNodes(run) {
    const route = run.hostRoute;
    if (!route || !route.host) return [];
    const host = route.host;
    const at = run.node === undefined ? (route.path && route.path[0]) || 0 : run.node;
    const out = [];
    for (const edge of host.edges || []) {
      if (edge.from === at && out.indexOf(edge.to) === -1) out.push(edge.to);
      if (edge.to === at && out.indexOf(edge.from) === -1) out.push(edge.from);
    }
    return out;
  }

  function nodeAt(run, id) {
    const host = run.hostRoute && run.hostRoute.host;
    if (!host) return null;
    return (host.nodes || []).find((n) => n.id === id) || null;
  }

  function probed(run, nodeId) {
    return !!(run.probedNodes && run.probedNodes[nodeId]);
  }

  function matrixPrompt(run) {
    if (!isMatrixRun(run) || MJ.missionDone(run)) return null;
    const dk = decker(run);
    if (!dk) return null;
    const skills = MJ.getEffectiveSkills(dk);
    const at = run.node === undefined ? ((run.hostRoute && run.hostRoute.path && run.hostRoute.path[0]) || 0) : run.node;
    const here = nodeAt(run, at);
    const ow = overwatchOf(run);
    const options = [];
    for (const id of Object.keys(VERBS)) {
      const v = VERBS[id];
      const trained = !v.skill || (skills[v.skill] || 0) > 0;
      let available = trained && !ow.converged;
      if (id === "exfiltrate") available = available && !!(here && here.holdsData) && !((run.drained || {})[at]);
      if (id === "traverse") available = available && adjacentNodes(run).length > 0;
      options.push({
        verb: id, label: v.label, describe: v.describe, skill: v.skill,
        pool: v.skill ? MJ.dicePoolFor(dk, v.skill, MJ.gearBonusFor(dk, v.skill)) : 0,
        // The clock is the decision, so it is shown on every option.
        overwatchCost: OVERWATCH_COST[id] || 0,
        available: available,
        runner: dk,
      });
    }
    return {
      pillar: "matrix",
      node: at,
      nodeLabel: here ? (here.label || here.type) : null,
      nodeProbed: probed(run, at),
      adjacent: adjacentNodes(run),
      overwatch: ow,
      dataHere: !!(here && here.holdsData),
      haul: (run.dataHaul || []).length,
      options: options,
    };
  }

  function matrixAct(rng, run, verb, opts) {
    opts = opts || {};
    if (!isMatrixRun(run)) return { ok: false, error: "not a Matrix run" };
    const def = VERBS[verb];
    if (!def) return { ok: false, error: "not something a persona can do" };
    const ow = overwatchOf(run);
    if (ow.converged && verb !== "jackOut") {
      return { ok: false, error: "they have you — the only move left is out" };
    }
    const dk = decker(run);
    const at = run.node === undefined ? ((run.hostRoute && run.hostRoute.path && run.hostRoute.path[0]) || 0) : run.node;

    if (verb === "traverse") {
      const reachable = adjacentNodes(run);
      const to = opts.node !== undefined ? opts.node : reachable[0];
      if (reachable.indexOf(to) === -1) return { ok: false, error: "no route from here to that node" };
      run.node = to;
      const converged = raiseOverwatch(run, OVERWATCH_COST.traverse);
      return { ok: true, verb: verb, from: at, to: to, converged: converged, overwatch: overwatchOf(run) };
    }

    if (verb === "probe") {
      const pool = MJ.dicePoolFor(dk, "computer", MJ.gearBonusFor(dk, "computer"));
      if (pool <= 0) return { ok: false, error: "nobody here can read a node" };
      const target = opts.node !== undefined ? opts.node : at;
      const node = nodeAt(run, target);
      const hits = MJ.countHits(MJ.rollDicePool(rng, pool));
      run.probedNodes = run.probedNodes || {};
      run.probedNodes[target] = hits;
      const converged = raiseOverwatch(run, OVERWATCH_COST.probe);
      return {
        ok: true, verb: verb, node: target, hits: hits, converged: converged,
        // Knowledge bought with the clock that kills you.
        learned: node ? {
          type: node.type, label: node.label || node.type,
          holdsData: !!node.holdsData,
          ice: hits >= 2 ? (node.ice || []).map((i) => i.label) : (node.ice || []).length ? ["something is watching"] : [],
        } : null,
        overwatch: overwatchOf(run),
      };
    }

    if (verb === "run") {
      const pool = MJ.dicePoolFor(dk, "hacking", MJ.gearBonusFor(dk, "hacking"));
      if (pool <= 0) return { ok: false, error: "no hacking to run with" };
      const converged = raiseOverwatch(run, OVERWATCH_COST.run);
      const hits = MJ.countHits(MJ.rollDicePool(rng, pool));
      return { ok: true, verb: verb, hits: hits, converged: converged, overwatch: overwatchOf(run) };
    }

    if (verb === "exfiltrate") {
      const node = nodeAt(run, at);
      if (!node || !node.holdsData) return { ok: false, error: "nothing here worth taking" };
      // A store holds what it holds. Milking one node forever would
      // make the whole topology pointless — the reason to go deeper
      // is that the data is spread across it, so taking a node's
      // contents empties it. Tracked on the RUN, never on the shared
      // site object, or a second visit would find it looted.
      run.drained = run.drained || {};
      if (run.drained[at]) return { ok: false, error: "already stripped this node" };
      const pool = MJ.dicePoolFor(dk, "hacking", MJ.gearBonusFor(dk, "hacking"));
      const hits = MJ.countHits(MJ.rollDicePool(rng, pool));
      const converged = raiseOverwatch(run, OVERWATCH_COST.exfiltrate);
      run.drained[at] = true;
      if (hits <= 0) {
        // Fumbled the pull AND spent the noise. The store is still
        // open, but you have burned the moment on it.
        return { ok: true, verb: verb, took: 0, converged: converged, overwatch: overwatchOf(run) };
      }
      run.dataHaul = run.dataHaul || [];
      run.dataHaul.push({ node: at, files: hits });
      return { ok: true, verb: verb, took: hits, converged: converged, overwatch: overwatchOf(run) };
    }

    // jackOut — leaving is free of Overwatch, but not free.
    run.jackedOut = true;
    const traced = ow.converged;
    if (traced) {
      // Yanked rather than walked. Biofeedback fills the stun track,
      // which is what makes convergence something to fear rather
      // than a soft ending.
      const dmg = 3;
      dk.wounds = (dk.wounds || 0) + Math.ceil(dmg / 2);
      if (!run.downed) run.downed = new Set();
      run.downed.add(dk);
    }
    return { ok: true, verb: verb, traced: traced, overwatch: overwatchOf(run) };
  }

  MJ.MATRIX_VERBS = VERBS;
  MJ.MATRIX_CONVERGENCE = CONVERGENCE;
  MJ.MATRIX_OVERWATCH_COST = OVERWATCH_COST;
  MJ.isMatrixRun = isMatrixRun;
  MJ.matrixDecker = decker;
  MJ.matrixPrompt = matrixPrompt;
  MJ.matrixAct = matrixAct;
  MJ.overwatchOf = overwatchOf;
  MJ.raiseOverwatch = raiseOverwatch;
  MJ.matrixAdjacent = adjacentNodes;
})();
