/* ============================================================
   Mr. Johnson — core/resolve.js
   The task/skill resolution system (design bible §02's
   "quick-resolve": one aggregate roll, instant). V1 scope is a
   single task at a time: pick a runner, a target obstacle, one of
   its affordances, resolve. Chaining tasks into a whole mission's
   worth of wounds/Karma/pay is a later, higher-level layer — this
   file only answers "did this one check succeed."

   Real SR5 dice mechanics, not an invented probability curve:
     - Dice pool = the runner's effective rank in the chosen skill
       (attribute pairing deliberately deferred — see the build
       plan backlog — V1 is skill-only, per direction).
     - Roll that many d6; a 5 or 6 is a hit.
     - Threshold = ceil(obstacle tier / 2), so tier 1-2 needs 1 hit,
       tier 9-10 needs 5 -- a real SR5-range threshold instead of
       inventing a new difficulty curve for a 1-10 tier scale.
     - Success = hits >= threshold. Margin (hits beyond threshold)
       is the degree of success, not just pass/fail.
     - Glitch = more than half the dice show 1 (a real complication
       even on success); Critical Glitch = a glitch with zero hits.
       This is standard SR5, not new content, and costs nothing
       extra to implement since the dice are already being rolled.
     - A skill an obstacle lists but the runner has zero ranks in
       rolls zero dice -- automatic failure, no glitch chance
       (nothing rolled). Matches SR5's own rule that most Active
       Skills can't be defaulted from untrained.
     - Selecting a `blocked` affordance (an obstacle's Watsonian
       immunity, §09) is rejected outright, before any dice are
       rolled -- it was never a real option.

   Usage:
     const outcome = MJ.resolveTask(rng, runner, obstacle, "stealth");
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  function rollDicePool(rng, poolSize) {
    const dice = [];
    for (let i = 0; i < poolSize; i++) dice.push(rng.int(1, 6));
    return dice;
  }

  function countHits(dice) {
    return dice.filter((d) => d >= 5).length;
  }

  function countOnes(dice) {
    return dice.filter((d) => d === 1).length;
  }

  function thresholdForTier(tier) {
    return Math.max(1, Math.ceil(tier / 2));
  }

  // ── The one definition of a dice pool ──────────────────────────
  // Skill + Attribute, plus whatever situational dice the caller
  // brings. Everything that needs to KNOW a pool — the resolver that
  // rolls it, the prompt that shows it to the player, the chooser
  // that ranks approaches by it — reads this. The popup used to
  // compute its own and quietly fell a whole attribute short of what
  // actually got rolled, which is exactly the drift a shared
  // definition exists to prevent.
  //
  // Untrained rolls nothing: a zero-rank skill is an automatic
  // failure however gifted the runner, so neither the attribute nor
  // any bonus can rescue it.
  function dicePoolFor(runner, skillId, bonusDice) {
    const rank = MJ.getEffectiveSkills(runner)[skillId] || 0;
    if (rank <= 0) return 0;
    const attrId = MJ.attributeFor(skillId);
    const attr = attrId ? (runner.attributes[attrId] || 0) : 0;
    return rank + attr + (bonusDice || 0);
  }

  // opts.bonusDice: situational extra dice on top of a TRAINED pool
  // (e.g. mission.js's fresh-intel bonus). Never rescues untrained —
  // a zero-rank skill stays an automatic failure, bonus or not.
  function resolveTask(rng, runner, obstacle, skillId, opts) {
    opts = opts || {};
    const affordance = obstacle.affordances.find((a) => a.skill === skillId);
    if (!affordance) {
      return { ok: false, error: `"${skillId}" isn't an option for this obstacle` };
    }
    if (affordance.blocked) {
      return { ok: false, error: `blocked — ${affordance.reason}` };
    }

    const threshold = thresholdForTier(obstacle.tier);
    const poolSize = dicePoolFor(runner, skillId, opts.bonusDice);

    if (poolSize <= 0) {
      // Untrained: nothing to roll, an automatic failure, not a
      // glitch (a glitch requires dice that were actually rolled).
      return {
        ok: true, skillId, verb: affordance.verb, loud: affordance.loud,
        poolSize: 0, dice: [], hits: 0, threshold, margin: -threshold,
        success: false, glitch: false, criticalGlitch: false,
      };
    }

    const dice = rollDicePool(rng, poolSize);
    const hits = countHits(dice);
    const glitch = countOnes(dice) > dice.length / 2;
    const success = hits >= threshold;
    const criticalGlitch = glitch && hits === 0;

    return {
      ok: true, skillId, verb: affordance.verb, loud: affordance.loud,
      poolSize, dice, hits, threshold, margin: hits - threshold,
      success, glitch, criticalGlitch,
    };
  }

  MJ.rollDicePool = rollDicePool;
  MJ.countHits = countHits;
  MJ.thresholdForTier = thresholdForTier;
  MJ.dicePoolFor = dicePoolFor;
  MJ.resolveTask = resolveTask;
})();
