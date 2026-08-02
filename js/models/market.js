/* ============================================================
   Mr. Johnson — models/market.js
   The roster/market state machine (design bible §03).

   Core rules this file implements:
     - Unwatched runners have one hidden shelf-life timer and
       nothing else: no roll, no growth, no closure. When it hits
       zero they're simply gone — the caller replaces that market
       slot with a freshly generated runner.
     - Watching a runner turns on the real state machine: Available
       (shelf-life rolled) -> expires -> roll outcome -> Working or
       Out of Town (a rolled duration) -> expires -> back to
       Available, or -> KIA (terminal). Odds are tier-weighted off
       the runner's own trueValue (§04/§09) — a genuinely skilled
       runner is simply too good at not dying, not a separate stat.
     - Hiring (any tier) suppresses the whole cycle while the
       contract lasts — a hired runner cannot roll KIA out from
       under the player. Contracts are counted in MISSIONS CONSUMED,
       never calendar days (§03, confirmed): freelance is exactly 1
       dispatch, retainer a block of them, permanent is forever.
       Contracts end via consumeContractMission, never by the daily
       tick.
     - Growth is explicitly NOT this file's job (design bible §03,
       corrected): a Watched-but-not-hired runner cycling through
       these phases never grows from it — these states are about
       availability and risk, never a hidden leveling clock. Nothing
       in here calls growRunner.

   Usage:
     MJ.watchRunner(runner, rng);
     MJ.hireRunner(runner, "retainer");
     MJ.consumeContractMission(runner, rng);  // per dispatch
     MJ.releaseRunner(runner, rng);
     const result = MJ.advanceMarketDay(runner, rng);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── KIA risk: tier-weighted off real invested Karma, not a
  // separate stat. Fresh-runner trueValue runs roughly 40-250
  // (runner.js's own note) — map that onto a real risk (low-tier)
  // down to a rare one (top-tier), both ends tunable placeholders.
  const KIA_CHANCE_LOW = 0.28;  // a low-value runner's risk per Available expiry
  const KIA_CHANCE_HIGH = 0.04; // a high-value runner's risk per Available expiry
  const VALUE_FLOOR = 40;
  const VALUE_CEILING = 250;

  function kiaChance(runner) {
    const value = MJ.trueValue(MJ.getEffectiveSkills(runner));
    const clamped = Math.max(VALUE_FLOOR, Math.min(VALUE_CEILING, value));
    const t = (clamped - VALUE_FLOOR) / (VALUE_CEILING - VALUE_FLOOR); // 0 (low) .. 1 (high)
    return KIA_CHANCE_LOW - t * (KIA_CHANCE_LOW - KIA_CHANCE_HIGH);
  }

  // ── Watching: turns on the state machine, no growth implied ────
  // KIA is terminal (§03): watching a dead runner must never revive
  // them — found by the mechanical stress plan's resurrection audit.
  function watchRunner(runner, rng) {
    if (runner.market.phase === "kia") return runner;
    runner.market.state = "watched";
    runner.market.phase = "available";
    runner.market.shelfDaysRemaining = rng.int(3, 14);
    return runner;
  }

  // ── Hiring tiers — a ladder of contracted missions (§03) ────────
  // Counted in missions consumed, never calendar days (confirmed
  // design): the money paid to the runner is for the tasks they
  // actually do. Downtime — healing in the Medicae, sitting benched
  // — burns nothing, and an untouched retainer never lapses, on
  // purpose: a benched runner doesn't grow while the operation
  // scales past them, so holding a beloved roll is its own real
  // cost, an aesthetic choice honored rather than punished.
  // RETAINER_BLOCK_MISSIONS is a flat first-pass block size —
  // negotiated/variable blocks are a natural future Reputation hook.
  // Nuyen cost is deliberately not calculated here — models/
  // economy.js's hireRunnerWithCost() charges the ledger before
  // calling this.
  const RETAINER_BLOCK_MISSIONS = 5;
  const CONTRACT_MISSIONS = {
    freelance: 1,
    retainer: RETAINER_BLOCK_MISSIONS,
    permanent: Infinity,
  };

  function hireRunner(runner, tier) {
    runner.market.state = "watched"; // all Hired runners are Watched (§03)
    runner.market.hired = {
      tier: tier,
      missionsRemaining: CONTRACT_MISSIONS[tier],
    };
    runner.market.phase = null; // suppressed while under contract
    return runner;
  }

  // One dispatch = one consumption, charged at dispatch time — the
  // task is what was bought, succeed or fail. The eventual mission
  // dispatch system calls this for every hired runner it sends out
  // (crafting duty included: a dispatch is a dispatch). At zero the
  // contract completes and the runner lands back on the shelf with
  // a fresh Available window.
  function consumeContractMission(runner, rng) {
    const hired = runner.market.hired;
    if (!hired) return { event: "notUnderContract" };
    if (hired.tier === "permanent") {
      return { event: "consumed", missionsRemaining: Infinity };
    }
    hired.missionsRemaining -= 1;
    if (hired.missionsRemaining <= 0) {
      runner.market.hired = null;
      runner.market.phase = "available";
      runner.market.shelfDaysRemaining = rng.int(3, 14);
      return { event: "contractCompleted" };
    }
    return { event: "consumed", missionsRemaining: hired.missionsRemaining };
  }

  function releaseRunner(runner, rng) {
    runner.market.hired = null;
    if (runner.market.phase === "kia") return runner; // terminal stays terminal
    runner.market.phase = "available";
    runner.market.shelfDaysRemaining = rng.int(3, 14);
    return runner;
  }

  function isHireable(runner) {
    return !runner.market.hired && runner.market.phase !== "kia";
  }

  // ── The daily tick: advances exactly one runner's market state by
  // one day. Returns a small event descriptor so the caller (the
  // eventual roster board) can react — replace an expired unwatched
  // slot, notify the player of a KIA, etc. Never touches skills.
  function advanceMarketDay(runner, rng) {
    const m = runner.market;
    m.daysOnMarket += 1; // a simple age counter, independent of state/phase

    if (m.hired) {
      // Contracts never expire by calendar — only consumption ends
      // them (consumeContractMission). The daily tick just confirms
      // the market cycle stays suppressed.
      return { event: "protected" };
    }

    if (m.state === "unwatched") {
      m.shelfDaysRemaining -= 1;
      if (m.shelfDaysRemaining <= 0) {
        return { event: "unwatchedExpired" }; // caller replaces this slot
      }
      return { event: "none" };
    }

    // Watched, not hired.
    if (m.phase === "kia") {
      return { event: "kia" }; // terminal — nothing changes again
    }

    m.shelfDaysRemaining -= 1;
    if (m.shelfDaysRemaining > 0) {
      return { event: "none" };
    }

    if (m.phase === "available") {
      if (rng.chance(kiaChance(runner))) {
        m.phase = "kia";
        return { event: "kia" };
      }
      m.phase = rng.chance(0.5) ? "working" : "outOfTown";
      m.shelfDaysRemaining = rng.int(2, 10);
      return { event: m.phase };
    }

    // phase was "working" or "outOfTown" — the gig ended, back on
    // the shelf with a fresh Available window before anything rolls
    // again.
    m.phase = "available";
    m.shelfDaysRemaining = rng.int(3, 14);
    return { event: "returnedAvailable" };
  }

  MJ.kiaChance = kiaChance;
  MJ.watchRunner = watchRunner;
  MJ.CONTRACT_MISSIONS = CONTRACT_MISSIONS;
  MJ.hireRunner = hireRunner;
  MJ.consumeContractMission = consumeContractMission;
  MJ.releaseRunner = releaseRunner;
  MJ.isHireable = isHireable;
  MJ.advanceMarketDay = advanceMarketDay;
})();
