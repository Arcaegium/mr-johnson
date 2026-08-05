/* ============================================================
   Mr. Johnson — models/helpers.js
   BOUND HELPERS: watcher spirits and agents, per
   docs/PILLAR-PLAN.md §3.4.

   The user's parallel: summoning a spirit should mirror running an
   autonomous program in the Matrix. They are ONE MODEL WITH TWO
   SKINS, and the shared shape is the interesting part —

     a bound helper owes you N TASKS, and each task it spends is a
     SEPARATE ACTION.

   That last clause is the whole point. A helper does not make the
   crew better at things; it lets the crew do MORE things in the
   same beat. Two runners and a watcher spirit cover three pieces of
   ground. This is width, not power, and it is why a Johnson wants
   them without them being a straight upgrade.

   NO TECHNOMANCERS, NO SPRITES. Sprites are technomancer-only
   (Compiling, Resonance, Fading) and that class is deliberately not
   in this game. The Matrix equivalent of a watcher spirit is the
   AGENT, which is ordinary decker gear:

     rated 1-6, autonomous, its own persona icon
     occupies one PROGRAM SLOT on the deck
     a deck runs agents only up to ITS OWN RATING
     explicitly "dog-brain" - not a second decker
     on an unexpected situation: a RATING x 2 test, and on failure
       it either does the wrong thing or STOPS AND ASKS FOR
       INSTRUCTIONS

   That last mechanic is the flavour. An agent handles the routine
   and pings you the moment reality surprises it, which is exactly
   "not a lot of brains, but capable of doing some things
   autonomously."

     spirit  astral   conjured via the Lattice, capped by Force,
                      paid for in Drain
     agent   matrix   loaded onto a deck, capped by deck rating,
                      paid for in program slots

   Usage:
     MJ.bindSpirit(rng, mage, { force: 4 });
     MJ.loadAgent(deckItem, "watchdog", { rating: 3 });
     MJ.helperAct(rng, helper, "watch");   // spends one task
     MJ.helperTasksLeft(helper);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const KINDS = ["spirit", "agent"];

  // What a helper is FOR. Deliberately narrow: a helper that could
  // do anything a runner can would make the roster pointless.
  const DUTIES = {
    watch:    { label: "stand watch",      plane: "any",      describe: "eyes on ground the crew is not standing on" },
    fetch:    { label: "fetch",            plane: "any",      describe: "carry something from there to here" },
    distract: { label: "make a nuisance",  plane: "any",      describe: "pull attention somewhere the crew is not" },
    guard:    { label: "guard",            plane: "any",      describe: "stand between the crew and a thing" },
    // Matrix-only duties an agent can take on.
    sweep:    { label: "sweep a node",     plane: "matrix",   describe: "walk a node and report what is on it" },
    // Astral-only.
    assense:  { label: "assense",          plane: "astral",   describe: "read what a place feels like" },
  };

  // ── The shared model ───────────────────────────────────────────
  function makeHelper(kind, opts) {
    opts = opts || {};
    const rating = Math.max(1, Math.min(6, opts.rating || 1));
    return {
      kind: kind,
      label: opts.label || (kind === "spirit" ? "Watcher" : "Agent"),
      rating: rating,
      // Tasks owed. Spent one at a time, and each one is an action
      // the crew did not have to take themselves.
      tasks: Math.max(1, opts.tasks || rating),
      tasksSpent: 0,
      boundTo: opts.boundTo || null,   // the runner who holds it
      plane: kind === "spirit" ? "astral" : "matrix",
      // Dog-brain. An agent stalls on the unexpected; a watcher
      // spirit is not much brighter.
      stalled: false,
      dismissed: false,
      log: [],
    };
  }

  function helperTasksLeft(helper) {
    if (!helper || helper.dismissed) return 0;
    return Math.max(0, helper.tasks - helper.tasksSpent);
  }

  function helperAvailable(helper) {
    return !!helper && !helper.dismissed && !helper.stalled && helperTasksLeft(helper) > 0;
  }

  // ── Spirits: conjured through the Lattice ──────────────────────
  // Force decides how much you get and what it costs. Conjuring is
  // how strong each move on the circuit is, which the Lattice
  // already knows.
  function bindSpirit(rng, conjurer, opts) {
    opts = opts || {};
    const skills = MJ.getEffectiveSkills(conjurer);
    if ((skills.conjuring || 0) <= 0) return { ok: false, error: "untrained in conjuring" };
    const magic = (conjurer.attributes && conjurer.attributes.magic) || 0;
    if (magic <= 0) return { ok: false, error: "no Magic — nothing to call with" };
    const force = Math.max(1, Math.min(MJ.maxForceFor(conjurer), opts.force || magic));

    // Summoning IS assembling a circuit. Same puzzle, same dials.
    const lattice = MJ.beginLattice(rng.fork ? rng.fork("bind") : rng, "assemble",
      { force: force }, conjurer, { rating: force });
    return {
      ok: true, kind: "spirit", force: force, lattice: lattice, conjurer: conjurer,
      done: false,
    };
  }

  function finishBind(rng, binding) {
    if (!binding || !binding.ok) return binding;
    const success = !!(binding.lattice && binding.lattice.success);
    const drain = MJ.resistDrain(rng, binding.conjurer, binding.force);
    if (binding.lattice && binding.lattice.backlash) drain.damage += binding.lattice.backlash;
    binding.done = true;
    binding.success = success;
    binding.drain = drain;
    if (drain.damage > 0 && drain.physical) {
      binding.conjurer.wounds = (binding.conjurer.wounds || 0) + drain.damage;
    }
    if (success) {
      // Force buys both how capable it is and how long it stays.
      binding.helper = makeHelper("spirit", {
        label: "Watcher F" + binding.force,
        rating: Math.min(6, Math.max(1, Math.ceil(binding.force / 2))),
        tasks: Math.max(1, Math.ceil(binding.force / 2)),
        boundTo: binding.conjurer,
      });
    }
    return binding;
  }

  // ── Agents: gear, not magic ────────────────────────────────────
  // Loaded onto a deck. The deck's rating is the ceiling, and every
  // agent costs a program slot — so a decker chooses between another
  // pair of hands and another utility.
  function deckRating(deck) {
    if (!deck) return 0;
    return MJ.effectiveTier ? MJ.effectiveTier(deck) : (deck.tier || 0);
  }

  function agentSlotsUsed(deck) {
    return ((deck && deck.loadedAgents) || []).length;
  }

  function agentSlotsFor(deck) {
    // A bigger deck holds more at once. Deliberately tight: agents
    // are width, and width should be bought, not assumed.
    return Math.max(1, Math.floor(deckRating(deck) / 3));
  }

  function loadAgent(deck, opts) {
    opts = opts || {};
    if (!deck) return { ok: false, error: "no deck" };
    const cap = deckRating(deck);
    if (cap <= 0) return { ok: false, error: "that is not a deck" };
    const rating = Math.max(1, Math.min(6, opts.rating || Math.min(6, cap)));
    // The SR5 rule, and it is a good one: your deck is your ceiling.
    if (rating > cap) {
      return { ok: false, error: "a rating-" + rating + " agent needs a deck of at least " + rating };
    }
    deck.loadedAgents = deck.loadedAgents || [];
    if (agentSlotsUsed(deck) >= agentSlotsFor(deck)) {
      return { ok: false, error: "no program slots left on this deck" };
    }
    const helper = makeHelper("agent", {
      label: opts.label || "Agent R" + rating,
      rating: rating,
      tasks: Math.max(1, rating),
      boundTo: opts.boundTo || null,
    });
    // The back-reference is non-enumerable so a result carrying this
    // helper can still be serialized. The log stores records now, and
    // a circular deck -> agents -> deck cycle would break the save.
    Object.defineProperty(helper, "deck", { value: deck, enumerable: false, writable: true });
    deck.loadedAgents.push(helper);
    return { ok: true, helper: helper };
  }

  function unloadAgent(deck, helper) {
    if (!deck || !deck.loadedAgents) return false;
    const before = deck.loadedAgents.length;
    deck.loadedAgents = deck.loadedAgents.filter((a) => a !== helper);
    return deck.loadedAgents.length !== before;
  }

  // ── Spending a task ────────────────────────────────────────────
  // The routine it handles fine. The unexpected is where the
  // dog-brain shows: a Rating x 2 test, and on failure it either
  // does the wrong thing or stops and asks what to do.
  function helperAct(rng, helper, duty, opts) {
    opts = opts || {};
    if (!helper || helper.dismissed) return { ok: false, error: "no helper" };
    if (helper.stalled) return { ok: false, error: "waiting for instructions" };
    if (helperTasksLeft(helper) <= 0) return { ok: false, error: "out of tasks" };
    const def = DUTIES[duty];
    if (!def) return { ok: false, error: "it does not know how to do that" };
    if (def.plane !== "any" && def.plane !== helper.plane) {
      return { ok: false, error: "a " + helper.kind + " cannot " + duty };
    }

    helper.tasksSpent += 1;
    const unexpected = !!opts.unexpected;
    if (!unexpected) {
      const entry = { duty: duty, result: "done", tasksLeft: helperTasksLeft(helper) };
      helper.log.push(entry);
      return Object.assign({ ok: true, by: helper.label }, entry);
    }

    // Rating x 2 against the situation. Dog-brain, precisely.
    const pool = helper.rating * 2;
    const hits = MJ.countHits(MJ.rollDicePool(rng, pool));
    const threshold = Math.max(1, opts.threshold || 2);
    if (hits >= threshold) {
      const entry = { duty: duty, result: "improvised", hits: hits, tasksLeft: helperTasksLeft(helper) };
      helper.log.push(entry);
      return Object.assign({ ok: true, by: helper.label }, entry);
    }
    // It did not understand. Half the time it guesses wrong and half
    // the time it freezes and asks — both are the same failure to
    // think, and both cost the crew something.
    const asks = rng.chance(0.5);
    helper.stalled = asks;
    const entry = {
      duty: duty, result: asks ? "asks for instructions" : "does the wrong thing",
      hits: hits, threshold: threshold, tasksLeft: helperTasksLeft(helper),
    };
    helper.log.push(entry);
    return Object.assign({ ok: true, by: helper.label, confused: true }, entry);
  }

  // Tell a stalled helper what to do. Costs nothing but the crew's
  // attention, which in a turn-based beat is the whole cost.
  function instruct(helper) {
    if (!helper || !helper.stalled) return false;
    helper.stalled = false;
    helper.log.push({ result: "given fresh instructions" });
    return true;
  }

  function dismiss(helper) {
    if (!helper || helper.dismissed) return false;
    helper.dismissed = true;
    if (helper.deck) unloadAgent(helper.deck, helper);
    return true;
  }

  // What a readout shows.
  function describeHelper(helper) {
    if (!helper) return null;
    return {
      kind: helper.kind, label: helper.label, rating: helper.rating,
      tasksLeft: helperTasksLeft(helper), tasks: helper.tasks,
      stalled: helper.stalled, dismissed: helper.dismissed,
      plane: helper.plane,
      note: helper.stalled ? "waiting for instructions"
        : helperTasksLeft(helper) <= 0 ? "spent"
        : "ready",
    };
  }

  MJ.HELPER_KINDS = KINDS;
  MJ.HELPER_DUTIES = DUTIES;
  MJ.makeHelper = makeHelper;
  MJ.bindSpirit = bindSpirit;
  MJ.finishBind = finishBind;
  MJ.loadAgent = loadAgent;
  MJ.unloadAgent = unloadAgent;
  MJ.agentSlotsFor = agentSlotsFor;
  MJ.agentSlotsUsed = agentSlotsUsed;
  MJ.helperAct = helperAct;
  MJ.helperTasksLeft = helperTasksLeft;
  MJ.helperAvailable = helperAvailable;
  MJ.instructHelper = instruct;
  MJ.dismissHelper = dismiss;
  MJ.describeHelper = describeHelper;
})();
