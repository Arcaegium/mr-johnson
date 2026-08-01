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
     - Hiring (any tier) suppresses the whole cycle for the
       contract's duration — a hired runner cannot roll KIA out from
       under the player. Permanent hires suppress it forever;
       freelance/retainer contracts expire back into Available.
     - Growth is explicitly NOT this file's job (design bible §03,
       corrected): a Watched-but-not-hired runner cycling through
       these phases never grows from it — these states are about
       availability and risk, never a hidden leveling clock. Nothing
       in here calls growRunner.

   Usage:
     MJ.watchRunner(runner, rng);
     MJ.hireRunner(runner, rng, "retainer", currentDay);
     MJ.releaseRunner(runner, rng);
     const result = MJ.advanceMarketDay(runner, rng, currentDay);
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
  function watchRunner(runner, rng) {
    runner.market.state = "watched";
    runner.market.phase = "available";
    runner.market.hiddenShelfDaysRemaining = rng.int(3, 14);
    return runner;
  }

  // ── Hiring tiers — a ladder of protection duration (§03) ────────
  // NOTE: freelance's "one job's duration" is a placeholder (3 days)
  // until a real mission-length model exists to derive it from.
  // Nuyen cost is deliberately not calculated here — the economy
  // isn't calibrated yet (runner.js's own computePrice carries the
  // same disclaimer).
  const HIRE_PROTECTION_DAYS = {
    freelance: () => 3,
    retainer: (rng) => rng.int(10, 30),
    permanent: () => Infinity,
  };

  function hireRunner(runner, rng, tier, currentDay) {
    runner.market.state = "watched"; // all Hired runners are Watched (§03)
    const days = HIRE_PROTECTION_DAYS[tier](rng);
    runner.market.hired = {
      tier: tier,
      protectedUntilDay: days === Infinity ? Infinity : currentDay + days,
    };
    runner.market.phase = null; // suppressed while under contract
    return runner;
  }

  function releaseRunner(runner, rng) {
    runner.market.hired = null;
    runner.market.phase = "available";
    runner.market.hiddenShelfDaysRemaining = rng.int(3, 14);
    return runner;
  }

  function isHireable(runner) {
    return !runner.market.hired && runner.market.phase !== "kia";
  }

  // ── The daily tick: advances exactly one runner's market state by
  // one day. Returns a small event descriptor so the caller (the
  // eventual roster board) can react — replace an expired unwatched
  // slot, notify the player of a KIA, etc. Never touches skills.
  function advanceMarketDay(runner, rng, currentDay) {
    const m = runner.market;

    if (m.hired) {
      if (m.hired.tier !== "permanent" && currentDay >= m.hired.protectedUntilDay) {
        m.hired = null;
        m.phase = "available";
        m.hiddenShelfDaysRemaining = rng.int(3, 14);
        return { event: "contractExpired" };
      }
      return { event: "protected" };
    }

    if (m.state === "unwatched") {
      m.hiddenShelfDaysRemaining -= 1;
      if (m.hiddenShelfDaysRemaining <= 0) {
        return { event: "unwatchedExpired" }; // caller replaces this slot
      }
      return { event: "none" };
    }

    // Watched, not hired.
    if (m.phase === "kia") {
      return { event: "kia" }; // terminal — nothing changes again
    }

    m.hiddenShelfDaysRemaining -= 1;
    if (m.hiddenShelfDaysRemaining > 0) {
      return { event: "none" };
    }

    if (m.phase === "available") {
      if (rng.chance(kiaChance(runner))) {
        m.phase = "kia";
        return { event: "kia" };
      }
      m.phase = rng.chance(0.5) ? "working" : "outOfTown";
      m.hiddenShelfDaysRemaining = rng.int(2, 10);
      return { event: m.phase };
    }

    // phase was "working" or "outOfTown" — the gig ended, back on
    // the shelf with a fresh Available window before anything rolls
    // again.
    m.phase = "available";
    m.hiddenShelfDaysRemaining = rng.int(3, 14);
    return { event: "returnedAvailable" };
  }

  MJ.kiaChance = kiaChance;
  MJ.watchRunner = watchRunner;
  MJ.hireRunner = hireRunner;
  MJ.releaseRunner = releaseRunner;
  MJ.isHireable = isHireable;
  MJ.advanceMarketDay = advanceMarketDay;
})();
