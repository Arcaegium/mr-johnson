/* ============================================================
   Mr. Johnson — models/economy.js
   The nuyen ledger and the sinks/sources that already connect to
   real systems (design bible §03 "The economy: sources, sinks, and
   the binding constraint").

   In scope this pass — the ledger itself, plus the sources/sinks
   that already have a real system behind them:
     - The ledger: earn/spend against save.johnson.money.
     - Job pay (the primary source) -> collectJobPay.
     - Hiring, any tier -> hireCost + hireRunnerWithCost (wraps
       models/market.js's hireRunner with an actual nuyen charge).
     - Board/roster capacity expansion -> the "increasing cost" sink,
       reusing the same rank*(rank+1) super-linear shape runner.js's
       karmaCost already uses, for the same reason: concentration vs.
       breadth (here: fewer-but-cheaper vs. more-but-pricier roster
       slots) should get disproportionately expensive at scale, on
       purpose, matching §01's "gaps grow with scale."

   Explicitly OUT of scope — needs a system that doesn't exist yet:
     - Data sales (needs the Matrix pillar's run-yield mechanic).
     - Loot/gear resale, gear purchase, crafting, consumables restock
       (all need the armory, not built).
     - Wound therapy / cyberware surgery cost (needs the healer-mage
       and Street Doc internal-job flow, not built).
     - Gear replacement after a wipe (needs mission resolution and
       the armory both).

   NOTE — scale: NUYEN_PER_VALUE and every multiplier below are
   first-pass placeholders (the design bible's own open note flags
   the hiring-tier ratios as "needs revalidation"), not calibrated
   numbers. They give the right *shape* (freelance cheapest per-use,
   retainer discounted-but-block-priced, permanent an expensive lump
   sum; capacity expansion super-linear) so the loop is provably
   testable now, with real tuning deferred to playtesting.

   Usage:
     MJ.canAfford(save, amount);
     MJ.spend(save, amount);              // false if unaffordable
     MJ.earn(save, amount);
     MJ.collectJobPay(save, job);
     MJ.hireCost(runner, "retainer");
     MJ.hireRunnerWithCost(save, runner, rng, "retainer", currentDay);
     MJ.expandBoardCapacityCost(save);
     MJ.expandBoardCapacity(save);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── The ledger ───────────────────────────────────────────────────
  function canAfford(save, amount) {
    return save.johnson.money >= amount;
  }

  function spend(save, amount) {
    if (!canAfford(save, amount)) return false;
    save.johnson.money -= amount;
    return true;
  }

  function earn(save, amount) {
    save.johnson.money += amount;
    return save.johnson.money;
  }

  // ── Job pay: the primary source ─────────────────────────────────
  // Paid once, on completing the job's success criteria (generally
  // "every included mission done") — never per mission (§06). Also
  // bumps Reputation, the Johnson's negotiating-power trait (§03).
  // NOTE: +1 flat per job is a bare placeholder — the user explicitly
  // asked for the actual scaling and impact (discounts, access) to
  // be defined later, not guessed at here. See the build plan
  // backlog.
  const REPUTATION_PER_JOB = 1;

  function collectJobPay(save, job) {
    save.johnson.reputation += REPUTATION_PER_JOB;
    return earn(save, job.pay);
  }

  // ── Hiring: a ladder of protection duration (§03) ───────────────
  const NUYEN_PER_VALUE = 50;       // computePrice's karma-cost scale -> nuyen
  const RETAINER_AVG_DAYS = 20;     // matches market.js's rng.int(10,30) average, pricing only
  const RETAINER_JOB_SPAN_DAYS = 5; // assumed days/job, for estimating the block size
  const RETAINER_DISCOUNT = 0.7;    // "a contracted block... at a discount off current price"
  const PERMANENT_MULTIPLIER = 10;  // "a lump sum relative to current price"

  function hireCost(runner, tier) {
    const base = MJ.computePrice(runner) * NUYEN_PER_VALUE;
    if (tier === "freelance") return Math.round(base);
    if (tier === "permanent") return Math.round(base * PERMANENT_MULTIPLIER);
    if (tier === "retainer") {
      const approxJobs = Math.max(1, Math.round(RETAINER_AVG_DAYS / RETAINER_JOB_SPAN_DAYS));
      return Math.round(base * approxJobs * RETAINER_DISCOUNT);
    }
    return 0;
  }

  // Charges the ledger, then applies the hire via market.js — only
  // if the operation can actually afford it. Returns { ok, cost }.
  function hireRunnerWithCost(save, runner, rng, tier, currentDay) {
    const cost = hireCost(runner, tier);
    if (!spend(save, cost)) {
      return { ok: false, cost, error: "can't afford it" };
    }
    MJ.hireRunner(runner, rng, tier, currentDay);
    return { ok: true, cost };
  }

  // ── Board/roster capacity expansion: an increasing cost (§03) ───
  // Reuses runner.js's karmaCost shape (rank*(rank+1)) at a nuyen
  // scale — the same "disproportionately expensive at scale" curve
  // already established for skills, applied here to roster slots.
  const CAPACITY_COST_SCALE = 500;

  function expandBoardCapacityCost(save) {
    const n = save.johnson.boardCapacity;
    return CAPACITY_COST_SCALE * n * (n + 1);
  }

  function expandBoardCapacity(save) {
    const cost = expandBoardCapacityCost(save);
    if (!spend(save, cost)) return { ok: false, cost };
    save.johnson.boardCapacity += 1;
    return { ok: true, cost, newCapacity: save.johnson.boardCapacity };
  }

  MJ.canAfford = canAfford;
  MJ.spend = spend;
  MJ.earn = earn;
  MJ.collectJobPay = collectJobPay;
  MJ.hireCost = hireCost;
  MJ.hireRunnerWithCost = hireRunnerWithCost;
  MJ.expandBoardCapacityCost = expandBoardCapacityCost;
  MJ.expandBoardCapacity = expandBoardCapacity;
})();
