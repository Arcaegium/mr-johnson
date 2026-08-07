/* ============================================================
   Mr. Johnson — core/resolve.js
   The dice. One check at a time: a runner, a skill, and a thing with
   a tier to beat. Chaining checks into a whole mission's worth of
   wounds/Karma/pay belongs to mission.js — this file only answers
   "did this one check succeed," and it answers it the same way for
   every rung of the fidelity ladder. Quick-resolve and a played-out
   scene roll identical dice; they differ in how many decisions the
   player makes between rolls, never in the math.

   It deliberately does NOT ask what the act WAS. Whether a verb
   reaches, whether it lands, and whether this thing happens to be
   immune to it are all questions about the world, answered by
   verbs.js and mission.js before any dice come out. A resolver that
   also owned the menu is what let the menu become the authority on
   what was possible.

   Real SR5 dice mechanics, not an invented probability curve:
     - Dice pool = effective skill rank + the skill's linked
       attribute + situational bonus dice, from `dicePoolFor` — the
       one definition the resolver, the chooser and every readout
       all call, so the number shown is always the number rolled.
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
     - A skill the runner has zero ranks in rolls zero dice --
       automatic failure, no glitch chance (nothing rolled). Matches
       SR5's own rule that most Active Skills can't be defaulted
       from untrained.

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

  // ── A RATING IS A BAND: THE TIER, GIVE OR TAKE ONE ──────────────
  // BY RULING. The old model drew obstacle tiers uniformly across
  // 1..rating — a "T8" site fielded T1 mall cops as often as T8
  // troopers — and then needed band mathematics on top so a card
  // could guess at its own building. Too convoluted to plan a job
  // against, which defeats the entire point of a job board.
  //
  // Now a site IS its tier. What is inside distributes across
  // [T-1, T+1], clamped to 1..10, so a T5 building is T4-T6 problems
  // and the number on the board MEANS something. The player still
  // never sees exact truth — estimates carry error until confirmed,
  // and the ±1 keeps every quote honest rather than exact:
  //   mid   what you should expect: the rating itself.
  //   high  what you should pack for: one over.
  // These two stay the ONLY way any readout converts a rating to a
  // tier, so the band law lives in one place.
  function tierBandMid(rating) {
    return Math.max(1, Math.min(10, Math.round(rating || 1)));
  }
  function tierBandHigh(rating) {
    return Math.min(10, tierBandMid(rating) + 1);
  }

  // ── A security rating, stated in DICE ───────────────────────────
  // The rating is not a number a player can hold a runner up against,
  // and that mismatch is the whole reason "your crew brings 12d"
  // against "security P:4" told nobody anything. Twelve of what,
  // against four of what?
  //
  // So what the PLAYER sees is a POOL: same units as a dossier, same
  // units as a crew read, so the comparison is a glance instead of an
  // essay. It is the pool it takes to beat the HIGH END OF TYPICAL for
  // that rating — a floor, honestly stated, not a guarantee. Bring
  // exactly this and the top of the spread will still beat you
  // sometimes; that is what makes scouting worth a day and what
  // teaches a player to pack above the number.
  //
  // Exact, not sampled: hits are Binomial(n, 1/3), and this is the
  // smallest n whose chance of clearing the threshold reaches
  // CHALLENGE_CONFIDENCE. "Enough to win" means winning most of the
  // time, not scraping a coin flip.
  const CHALLENGE_CONFIDENCE = 0.8;
  const HIT_CHANCE = 1 / 3;

  function atLeastHits(n, k) {
    // P(X >= k) for X ~ Bin(n, 1/3)
    let below = 0;
    for (let i = 0; i < k; i++) {
      let c = 1;
      for (let j = 0; j < i; j++) c = (c * (n - j)) / (j + 1);
      below += c * Math.pow(HIT_CHANCE, i) * Math.pow(1 - HIT_CHANCE, n - i);
    }
    return 1 - below;
  }

  const DICE_FOR_VALUE = [];
  function diceForSecurity(value) {
    const v = Math.max(1, Math.min(10, Math.round(value || 0)));
    if (DICE_FOR_VALUE[v] === undefined) {
      // Clearing an obstacle is pass/fail — being under the bar once
      // is not made up for by being over it twice — so this reads the
      // HIGH band, never the rating itself.
      const need = thresholdForTier(tierBandHigh(v));
      let n = 1;
      while (n < 60 && atLeastHits(n, need) < CHALLENGE_CONFIDENCE) n += 1;
      DICE_FOR_VALUE[v] = n;
    }
    return DICE_FOR_VALUE[v];
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
    // ONE skill, not the whole sheet. This used to build a fresh
    // 21-key effective-skills object to read a single entry, and it
    // is the hottest path in the game — over a hundred thousand
    // calls in one suite run, measured as the largest single cost in
    // the codebase. Same formula, same answer.
    const rank = MJ.effectiveSkill(runner, skillId);
    if (rank <= 0) return 0;
    const attrId = MJ.attributeFor(skillId);
    const attr = attrId ? (runner.attributes[attrId] || 0) : 0;
    return rank + attr + (bonusDice || 0);
  }

  // opts.bonusDice: situational extra dice on top of a TRAINED pool
  // (e.g. mission.js's fresh-intel bonus). Never rescues untrained —
  // a zero-rank skill stays an automatic failure, bonus or not.
  // opts.verb / opts.loud are carried through onto the outcome for
  // the readout's benefit; they are description, never a gate.
  function resolveTask(rng, runner, obstacle, skillId, opts) {
    opts = opts || {};
    const threshold = thresholdForTier(obstacle.tier);
    const poolSize = dicePoolFor(runner, skillId, opts.bonusDice);

    if (poolSize <= 0) {
      // Untrained: nothing to roll, an automatic failure, not a
      // glitch (a glitch requires dice that were actually rolled).
      return {
        ok: true, skillId, verb: opts.verb || null, loud: !!opts.loud,
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
      ok: true, skillId, verb: opts.verb || null, loud: !!opts.loud,
      poolSize, dice, hits, threshold, margin: hits - threshold,
      success, glitch, criticalGlitch,
    };
  }

  // ── Force and Drain: the mage's own gamble ─────────────────────
  // Every other approach in the game asks "can you do this?" Magic
  // asks "how hard do you want to push?" — and answers with a bill.
  // Force is chosen per casting: it raises the effect AND the Drain
  // that comes back at you, resisted with Willpower. That is the
  // whole decision, and it is the reason Willpower carries no skills
  // and still earns a place on the sheet.
  //
  // Drain lands on the STUN track, so a mage who overreaches drops
  // themselves — the same track combat fills, which is what makes
  // "cast big early" a real risk rather than a free opener.
  //
  // Overcasting — Force above the caster's Magic — is where Drain
  // turns PHYSICAL. That is the line between tired and injured, and
  // it is deliberately available: a desperate mage can reach past
  // what they safely hold, and pay for it in a way rest will not fix.
  function drainValueFor(force, overcast) {
    // The GENERIC cost of pushing mana — what the lattice and the
    // astral verbs bill when no spell is naming its own price. Half
    // Force, floor 2, and overcasting hurts more.
    //
    // SPELLCASTING does not use this: a spell's Drain is canon —
    // Force plus its printed modifier, min 2 — and spells.js passes
    // it in via opts.drainValue below. Punch at F−6 being nearly
    // free and Mob Mind at F+1 being brutal IS the spell economy,
    // and one flat curve erased it.
    return Math.max(2, Math.ceil(force / 2) + (overcast ? 2 : 0));
  }

  // opts.drainValue: a caller that knows the canon cost of THIS act
  // (a spell's printed Drain) supplies it; otherwise the generic
  // curve applies. Overcast still turns the damage physical either
  // way — that line is about the caster, not the spell.
  function resistDrain(rng, runner, force, opts) {
    opts = opts || {};
    const magic = (runner.attributes && runner.attributes.magic) || 0;
    const overcast = force > magic;
    const dv = opts.drainValue !== undefined
      ? Math.max(2, opts.drainValue)
      : drainValueFor(force, overcast);
    const pool = ((runner.attributes && runner.attributes.willpower) || 0) + magic;
    const dice = rollDicePool(rng, pool);
    const hits = countHits(dice);
    const damage = Math.max(0, dv - hits);
    return {
      force: force, magic: magic, overcast: overcast,
      drainValue: dv, resistPool: pool, hits: hits,
      damage: damage,
      physical: overcast, // overcast Drain is physical, not stun
    };
  }

  // The most a caster can reach: TWICE Magic, per canon. Everything
  // above Magic itself is overcasting — the Drain turns physical —
  // so the top half of the range is always an act of self-harm the
  // mage chooses. The old house cap of Magic+2 quietly denied a
  // desperate adept the big reach the source deliberately allows.
  function maxForceFor(runner) {
    return Math.max(1, ((runner.attributes && runner.attributes.magic) || 0) * 2);
  }

  // ── Extended tests: work that takes as long as it takes ────────
  // Some tasks aren't one swing. Cracking an on-prem host, picking a
  // serious lock, coaxing a spirit — you chip at it, accumulating
  // hits toward a threshold across INTERVALS, and each interval
  // costs time. The pool shrinks by one every interval: you are
  // getting tired, the system is adapting, the guard's round is
  // coming back. That shrink is what gives the whole thing a
  // natural end — a big enough pool will get there, a marginal one
  // grinds to nothing and you have to decide whether that was worth
  // the minutes.
  //
  // A glitch ends it outright. That is the real tension: every extra
  // interval is another chance to fumble, so pressing a hard test is
  // a genuine gamble rather than a formality with a time cost.
  //
  // This is what replaces `attempts: N` on technical work. An
  // attempt budget is an arbitrary cap; an extended test is the same
  // idea with a reason — you can always keep trying, it just costs
  // time you may not have and risks a fumble you cannot take back.
  function beginExtendedTest(runner, skillId, threshold, opts) {
    opts = opts || {};
    return {
      runner: runner, skillId: skillId, threshold: threshold,
      pool: dicePoolFor(runner, skillId, opts.bonusDice),
      hits: 0, intervals: 0, rolls: [],
      done: false, success: false, glitch: false, criticalGlitch: false,
      exhausted: false,
    };
  }

  // One interval. Returns the same test object, advanced.
  function extendedTestStep(rng, test) {
    if (test.done) return test;
    if (test.pool <= 0) {
      test.done = true; test.exhausted = true;
      return test;
    }
    const dice = rollDicePool(rng, test.pool);
    const hits = countHits(dice);
    const glitch = countOnes(dice) > dice.length / 2;
    test.intervals += 1;
    test.hits += hits;
    test.rolls.push({ pool: test.pool, hits: hits, glitch: glitch });

    if (glitch) {
      // Everything accumulated is lost with it — a fumble on the
      // twelfth minute of a hack is not a partial success.
      test.done = true;
      test.glitch = true;
      test.criticalGlitch = hits === 0;
      return test;
    }
    if (test.hits >= test.threshold) {
      test.done = true;
      test.success = true;
      return test;
    }
    test.pool -= 1;
    if (test.pool <= 0) { test.done = true; test.exhausted = true; }
    return test;
  }

  // Run it to completion — the quick-resolve path, and the shape the
  // auto-chooser uses. `maxIntervals` caps how long a crew is willing
  // to stand there; leaving it out means "as long as the dice last."
  function resolveExtendedTest(rng, runner, skillId, threshold, opts) {
    opts = opts || {};
    const test = beginExtendedTest(runner, skillId, threshold, opts);
    const cap = opts.maxIntervals || Infinity;
    while (!test.done && test.intervals < cap) extendedTestStep(rng, test);
    if (!test.done) { test.done = true; test.gaveUp = true; }
    return test;
  }

  MJ.rollDicePool = rollDicePool;
  MJ.countHits = countHits;
  MJ.thresholdForTier = thresholdForTier;
  MJ.tierBandMid = tierBandMid;
  MJ.tierBandHigh = tierBandHigh;
  MJ.diceForSecurity = diceForSecurity;
  MJ.dicePoolFor = dicePoolFor;
  MJ.resolveTask = resolveTask;
  MJ.drainValueFor = drainValueFor;
  MJ.resistDrain = resistDrain;
  MJ.maxForceFor = maxForceFor;
  MJ.beginExtendedTest = beginExtendedTest;
  MJ.extendedTestStep = extendedTestStep;
  MJ.resolveExtendedTest = resolveExtendedTest;
})();
