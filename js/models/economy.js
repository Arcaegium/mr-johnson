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

   Also in scope now that the armory exists: gear purchase/resale
   (itemCost/buyItem/sellItem) and material sales (sellMaterials).

   Explicitly OUT of scope — needs a system that doesn't exist yet:
     - Data sales (needs the Matrix pillar's run-yield mechanic).
     - Wound therapy / cyberware surgery COST (surgery itself lives
       in armory.js but charges nothing yet — the Street Doc
       internal-job flow will price it).
     - Gear replacement after a wipe (needs wipe outcomes in
       mission resolution).

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
     MJ.hireRunnerWithCost(save, runner, "retainer");
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
    if (job.paid) return save.johnson.money; // one contract, one payout — never twice
    job.paid = true;
    save.johnson.reputation += REPUTATION_PER_JOB;
    return earn(save, job.pay);
  }

  // ── Hiring: a ladder of contracted missions (§03) ───────────────
  // Contracts are counted in missions consumed (market.js's
  // CONTRACT_MISSIONS), so pricing is per-mission by construction:
  // freelance buys exactly one at market price, retainer buys the
  // block at a discount, permanent is the lump-sum buyout.
  // Playtest-recalibrated (v0 round 2): at 50, one freelance dispatch
  // (~3-7K) cost more than most whole safe-rung jobs paid — the loop
  // could not sustain itself at any skill level. At 12, a rookie
  // freelance dispatch runs ~700-1700, a retainer block ~2500-6000
  // (~500-1200/mission — planning pays), a permanent ~7-17K. Still a
  // placeholder SHAPE, tuned against job.js's NUYEN_PER_MISSION_VALUE
  // — the two dials must move together: a safe job must be able to
  // out-earn the dispatches it takes at matching rung, or the game
  // is arithmetic-dead on arrival.
  // computePrice's karma-cost scale -> nuyen. Halved from 12 when
  // attributes entered the dice pool: attributes are now part of a
  // runner's value, which roughly doubled computePrice, and leaving
  // this dial alone put a median 3-runner freelance crew at ~6.5k
  // against a ~4.2k median job leg. Every job would have lost money.
  // The two dials have to move together (see below).
  const NUYEN_PER_VALUE = 6;
  const RETAINER_DISCOUNT = 0.7;    // "a contracted block... at a discount off current price"
  const PERMANENT_MULTIPLIER = 10;  // "a lump sum relative to current price"

  // Permanent staff draw a wage. A one-time buyout with no running
  // cost meant a mature operation banked nuyen with nothing pulling
  // it back out — the endgame leak is an ACTIVE elite crew earning
  // without limit, not a full bench. Charged per day and scaled off
  // the runner's own market value, so an elite costs more to keep
  // than a ganger.
  //
  // Deliberately small: the tier ladder must still hold, so a
  // permanent hire stays the cheapest way to field someone you
  // actually use. At 2% of a freelance dispatch per day it takes
  // ~50 idle days to burn what one freelance mission costs, against
  // a buyout that pays for itself in 10 dispatches.
  //
  // Retainers pay NOTHING. An undispatched bench-warmer is not the
  // problem this solves, and the bible blesses the untouched
  // retainer on purpose (§03).
  const PERMANENT_UPKEEP_RATE = 0.02;

  function dailyUpkeep(runner) {
    const hired = runner.market.hired;
    if (!hired || hired.tier !== "permanent") return 0;
    return Math.round(MJ.computePrice(runner) * NUYEN_PER_VALUE * PERMANENT_UPKEEP_RATE);
  }

  // The whole payroll for one day. Returns what was owed and what
  // was actually paid — a short operation still owes the wage, so
  // the shortfall is reported rather than silently forgiven.
  function payUpkeep(save, roster) {
    let owed = 0;
    for (const r of roster) owed += dailyUpkeep(r);
    if (owed <= 0) return { owed: 0, paid: 0, shortfall: 0 };
    const paid = Math.min(owed, save.johnson.money);
    save.johnson.money -= paid;
    return { owed: owed, paid: paid, shortfall: owed - paid };
  }

  function hireCost(runner, tier) {
    const base = MJ.computePrice(runner) * NUYEN_PER_VALUE; // one mission at market price
    if (tier === "freelance") return Math.round(base);
    if (tier === "permanent") return Math.round(base * PERMANENT_MULTIPLIER);
    if (tier === "retainer") {
      return Math.round(base * MJ.CONTRACT_MISSIONS.retainer * RETAINER_DISCOUNT);
    }
    return 0;
  }

  // Charges the ledger, then applies the hire via market.js — only
  // if the runner is actually hireable (market.js's own rule: not
  // already under contract, not KIA) and the operation can afford
  // it. Returns { ok, cost }.
  function hireRunnerWithCost(save, runner, tier) {
    if (!MJ.isHireable(runner)) {
      return { ok: false, cost: 0, error: "not hireable — already under contract, or KIA" };
    }
    const cost = hireCost(runner, tier);
    if (!spend(save, cost)) {
      return { ok: false, cost, error: "can't afford it" };
    }
    MJ.hireRunner(runner, tier);
    runner.market.hired.pricePaid = cost;
    return { ok: true, cost };
  }

  // ── Contract upgrades: pro-rata credit, today's price ───────────
  // Upgrading (freelance->retainer->permanent) credits the unused
  // share of what was paid, against the NEW tier at TODAY's price —
  // so a runner who leveled up since signing costs more to lock in,
  // but the player never eats the remaining block (user ruling).
  const TIER_ORDER = ["freelance", "retainer", "permanent"];

  function upgradeCredit(runner) {
    const hired = runner.market.hired;
    if (!hired || !hired.pricePaid || !hired.blockSize) return 0;
    if (hired.missionsRemaining === Infinity) return 0;
    return Math.round(hired.pricePaid * (hired.missionsRemaining / hired.blockSize));
  }

  function upgradeCost(runner, newTier) {
    return Math.max(0, hireCost(runner, newTier) - upgradeCredit(runner));
  }

  function upgradeContractWithCost(save, runner, newTier) {
    const hired = runner.market.hired;
    if (!hired) return { ok: false, error: "not under contract — hire instead" };
    if (runner.market.phase === "kia") return { ok: false, error: "they're gone" };
    if (TIER_ORDER.indexOf(newTier) <= TIER_ORDER.indexOf(hired.tier)) {
      return { ok: false, error: "that's not an upgrade" };
    }
    const cost = upgradeCost(runner, newTier);
    if (!spend(save, cost)) return { ok: false, cost: cost, error: "can't afford it" };
    MJ.hireRunner(runner, newTier);
    runner.market.hired.pricePaid = hireCost(runner, newTier); // full list value — future credits price off the real contract
    return { ok: true, cost: cost };
  }

  // ── Gear: buy, resell, and material sales (armory is live) ──────
  // Costs ride the item tier on the same curve family as everything
  // else (tier*(tier+1)); resale takes the street's cut. All
  // placeholder scales, flagged — same shape rule as hiring: gear
  // must be affordable from job pay at matching rung.
  const ITEM_COST_SCALE = 150;
  const ITEM_RESALE_RATIO = 0.4;
  const MATERIAL_PRICES = { "resource:scrap": 150, "resource:reagents": 250, "resource:data": 400 };

  function itemCost(templateId) {
    const t = MJ.ITEM_TEMPLATES[templateId];
    return ITEM_COST_SCALE * t.tier * (t.tier + 1);
  }

  function buyItem(save, templateId) {
    const cost = itemCost(templateId);
    if (!spend(save, cost)) return { ok: false, cost: cost, error: "can't afford it" };
    const item = MJ.makeItem(templateId);
    save.armory.items.push(item);
    return { ok: true, item: item, cost: cost };
  }

  function sellItem(save, item) {
    if (item.issuedTo) return { ok: false, error: "reclaim it first — it's in someone's hands" };
    const i = save.armory.items.indexOf(item);
    if (i === -1) return { ok: false, error: "not in the armory" };
    save.armory.items.splice(i, 1);
    const price = Math.round(itemCost(item.templateId) * ITEM_RESALE_RATIO);
    earn(save, price);
    return { ok: true, price: price };
  }

  function sellMaterials(save, kind) {
    const amount = (save.armory.materials && save.armory.materials[kind]) || 0;
    if (amount <= 0) return { ok: false, error: "nothing stocked" };
    const price = amount * (MATERIAL_PRICES[kind] || 100);
    save.armory.materials[kind] = 0;
    earn(save, price);
    return { ok: true, amount: amount, price: price };
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
  MJ.dailyUpkeep = dailyUpkeep;
  MJ.payUpkeep = payUpkeep;
  MJ.hireCost = hireCost;
  MJ.hireRunnerWithCost = hireRunnerWithCost;
  MJ.upgradeCredit = upgradeCredit;
  MJ.upgradeCost = upgradeCost;
  MJ.upgradeContractWithCost = upgradeContractWithCost;
  MJ.itemCost = itemCost;
  MJ.buyItem = buyItem;
  MJ.sellItem = sellItem;
  MJ.sellMaterials = sellMaterials;
  MJ.expandBoardCapacityCost = expandBoardCapacityCost;
  MJ.expandBoardCapacity = expandBoardCapacity;
})();
