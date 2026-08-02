/* ============================================================
   Mr. Johnson — game.js
   The integration layer, v0: the one object that owns a running
   game, mutated only through commands. This is the layer every
   module's header has been calling "integration work" — it wires
   the verified systems together and nothing more.

   DOM-free on purpose: the UI (game-ui.js) renders sessions and
   calls commands; the stress suite drives the same commands with
   injected rng and asserts on the results. Every command that
   consumes randomness accepts an optional rng override — omitted,
   it draws from the correct layer of the §09 entropy model:

     Layer 1 (universe): runners and sites mint from the universe
       seed by saved counters (runnerMintIndex / siteMintIndex).
     Layer 2 (history): the session object IS the history; full
       serialization to IndexedDB is the flagged v0.5 follow-up
       (save.js works, but site/mission object graphs need the
       compressSite-style record forms first).
     Layer 3 (arrivals): refreshBoard seeds off the wall clock —
       reload to before a refresh and those offers never existed.
     Layer 4 (live action): endDay resolves the queue on fresh
       entropy — replaying a day never replays its dice.

   v0 teeth included: job expiry is ENFORCED here (the standing
   backlog item) — an accepted job unfinished past its window is
   failed, unpaid; board offers expire off the board.

   v0 placeholders, flagged: STARTING_MONEY stake; discovery of
   resource sites is a free menu action (not yet a dispatch);
   unwatch-runner doesn't exist (watch is commitment; release
   handles contracts); crafting/harvest yields are logged, not
   stored (armory pending); expired jobs have no standing/heat
   consequence yet (needs faction standing, unbuilt).

   Usage:
     const s = MJ.game.newGame();           // or newGame(seed)
     MJ.game.refreshBoard(s); MJ.game.acceptJob(s, 0);
     MJ.game.watchFromMarket(s, 0); MJ.game.hire(s, runner, "retainer");
     MJ.game.queueDispatch(s, mission, [r1, r2], "label");
     MJ.game.endDay(s);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const STARTING_MONEY = 25000; // placeholder stake, not calibrated
  const MARKET_SLOTS = 8;
  // The watch list is deliberately wider than the crew (user ruling):
  // watching is scouting the market, hiring is commitment. Both caps
  // ride boardCapacity so the one expansion sink lifts everything —
  // the ratio is a placeholder dial.
  const WATCH_CAP_MULTIPLIER = 2;

  function watchCapacity(session) {
    return session.save.johnson.boardCapacity * WATCH_CAP_MULTIPLIER;
  }

  function hiredCount(session) {
    return session.roster.filter((r) => r.market.hired).length;
  }

  // Layer 4: fresh entropy, never replayable.
  function liveRNG() {
    return MJ.makeRNG("live|" + Date.now() + "|" + Math.random());
  }

  function logLine(session, text) {
    session.log.push("day " + session.day + ": " + text);
  }

  // ── Session ─────────────────────────────────────────────────────
  function newGame(universeSeed) {
    const session = {
      universeSeed: universeSeed || ("universe-" + Date.now() + "-" + Math.floor(Math.random() * 1e6)),
      day: 1,
      save: null,
      roster: [],        // watched/hired runners — full records
      market: [],        // unwatched market slots
      runnerMintIndex: 0,
      siteMintIndex: 0,
      knownSites: [],
      jobs: [],          // accepted contracts (active, completed, failed)
      contractCounter: 0, // contracts number by acceptance order — "Job #3"
      board: [],         // current offers [{job, siteResults}]
      queue: [],         // today's planned dispatches [{mission, runners, label}]
      lastPlan: null,    // yesterday's queue, as replayable specs (repeatLastPlan)
      log: [],
    };
    session.save = MJ.defaultSave(session.universeSeed);
    session.save.johnson.money = STARTING_MONEY;
    fillMarket(session);
    logLine(session, "new game — universe \"" + session.universeSeed + "\", stake " + STARTING_MONEY + " nuyen");
    return session;
  }

  function fillMarket(session) {
    while (session.market.length < MARKET_SLOTS) {
      session.market.push(MJ.mintRunner(session.universeSeed, session.runnerMintIndex++));
    }
  }

  function siteProviderFor(session) {
    return {
      mint: (value, orientation) =>
        MJ.mintSite(session.universeSeed, session.siteMintIndex++, { value: value, orientation: orientation }),
    };
  }

  // ── The board (layer 3: arrivals) ───────────────────────────────
  function refreshBoard(session, rngOverride) {
    const rng = rngOverride || MJ.makeRNG(session.universeSeed + "|board|" + Date.now() + "|" + Math.random());
    session.board = MJ.generateBoard(rng, session.knownSites, session.day, session.save.johnson.boardCapacity, {
      siteProvider: siteProviderFor(session),
    });
    logLine(session, "board refreshed — " + session.board.length + " offers (the old ones are gone for good)");
    return session.board;
  }

  // New faces: the current crowd moves on, the next indices mint in.
  function refreshMarket(session) {
    session.market = [];
    fillMarket(session);
    logLine(session, "market refreshed — new faces (the old ones moved on)");
    return session.market;
  }

  function acceptJob(session, boardIndex) {
    const entry = session.board[boardIndex];
    if (!entry) return { ok: false, error: "no such offer" };
    session.board.splice(boardIndex, 1);
    entry.job.contractNumber = ++session.contractCounter;
    session.jobs.push(entry.job);
    for (const m of entry.job.missions) {
      MJ.addKnownSite(session.knownSites, m.site, session.day, "job");
    }
    logLine(session, "ACCEPTED Job #" + entry.job.contractNumber + " — " + entry.job.hiringFaction + ", " + entry.job.missions.length + " leg(s), pay " + entry.job.pay + ", expires day " + entry.job.expiryDay + (entry.job.chained ? " (CHAINED)" : ""));
    return { ok: true, job: entry.job };
  }

  // ── Roster & market ─────────────────────────────────────────────
  function watchFromMarket(session, marketIndex, rngOverride) {
    if (session.roster.length >= watchCapacity(session)) {
      return { ok: false, error: "watch list is full — expand board capacity" };
    }
    const runner = session.market[marketIndex];
    if (!runner) return { ok: false, error: "no such market slot" };
    session.market.splice(marketIndex, 1);
    MJ.watchRunner(runner, rngOverride || liveRNG());
    session.roster.push(runner);
    logLine(session, "watching " + runner.identity.handle + " (" + MJ.describeDiscipline(runner) + ")");
    fillMarket(session);
    return { ok: true, runner: runner };
  }

  function hire(session, runner, tier) {
    if (!runner.market.hired && hiredCount(session) >= session.save.johnson.boardCapacity) {
      const result = { ok: false, error: "crew is full — release someone or expand capacity" };
      logLine(session, "hire refused for " + runner.identity.handle + " — " + result.error);
      return result;
    }
    const result = MJ.hireRunnerWithCost(session.save, runner, tier);
    logLine(session, result.ok
      ? "hired " + runner.identity.handle + " (" + tier + ") for " + result.cost
      : "hire refused for " + runner.identity.handle + " — " + result.error);
    return result;
  }

  function release(session, runner, rngOverride) {
    MJ.releaseRunner(runner, rngOverride || liveRNG());
    logLine(session, "released " + runner.identity.handle + " from contract");
    return { ok: true };
  }

  // Unwatch: the runner goes back to being a face in the crowd — an
  // unwatched market entry with a fresh shelf timer (§03). A runner
  // under contract must be released first; a KIA runner is simply
  // struck from the list (nothing comes back).
  function unwatch(session, runner, rngOverride) {
    if (runner.market.hired) return { ok: false, error: "under contract — release first" };
    const i = session.roster.indexOf(runner);
    if (i === -1) return { ok: false, error: "not on the watch list" };
    session.roster.splice(i, 1);
    if (runner.market.phase === "kia") {
      logLine(session, "struck " + runner.identity.handle + " from the list");
      return { ok: true };
    }
    runner.market.state = "unwatched";
    runner.market.phase = null;
    runner.market.shelfDaysRemaining = (rngOverride || liveRNG()).int(3, 14);
    session.market.push(runner);
    logLine(session, "unwatched " + runner.identity.handle + " — back into the crowd");
    return { ok: true };
  }

  function expandCapacity(session) {
    const result = MJ.expandBoardCapacity(session.save);
    logLine(session, result.ok
      ? "board capacity expanded to " + result.newCapacity + " for " + result.cost
      : "capacity expansion refused — costs " + result.cost);
    return result;
  }

  // ── Sites ───────────────────────────────────────────────────────
  function toggleWatchSite(session, site) {
    if (!site.knownMeta) return { ok: false, error: "not a known site" };
    if (site.knownMeta.watched) MJ.unwatchSite(site);
    else MJ.watchSite(site);
    logLine(session, (site.knownMeta.watched ? "watching" : "unwatched") + " site #" + site.identity.universeIndex + " (" + site.identity.district + ")");
    return { ok: true, watched: site.knownMeta.watched };
  }

  // Search is a real dispatch (user ruling, "Search / Scrap" on the
  // action menu): the mission carries a callback that mints and
  // registers the find when it resolves — the runner spends their
  // action and contract mission on the legwork.
  function makeSearchMission(session, kind) {
    return MJ.createSearchMission(kind, (rng) => discoverResource(session, kind, rng).site);
  }

  function discoverResource(session, kind, rngOverride) {
    const orientation = kind === "reagents" ? "astral" : "physical";
    const site = MJ.mintSite(session.universeSeed, session.siteMintIndex++, { orientation: orientation });
    site.tags.push({ tag: "resource:" + kind, expiryDay: Infinity });
    MJ.generateSecurityEstimate(rngOverride || liveRNG(), site);
    MJ.addKnownSite(session.knownSites, site, session.day, "discovery");
    logLine(session, "discovered a " + kind + " site: #" + site.identity.universeIndex + " in " + site.identity.district);
    return { ok: true, site: site };
  }

  // ── The dispatch queue ──────────────────────────────────────────
  function jobOfMission(session, mission) {
    return session.jobs.find((j) => j.missions.indexOf(mission) !== -1) || null;
  }

  function queueDispatch(session, mission, runners, label) {
    if (!mission) return { ok: false, error: "no objective selected" };
    if (!runners || runners.length === 0) return { ok: false, error: "no runners selected" };
    if (mission.resolved) return { ok: false, error: "that objective is already done" };
    const job = jobOfMission(session, mission);
    if (job && job.expired) return { ok: false, error: "that contract's window has closed" };
    // One action per runner per period is a hard rule — refuse an
    // impossible plan at queue time instead of silently dropping
    // people at resolution (playtest round 3).
    const committed = new Set();
    for (const q of session.queue) {
      for (const r of q.runners) committed.add(r);
      if (q.mission.patient) committed.add(q.mission.patient);
    }
    const clash = runners.find((r) => committed.has(r));
    if (clash) return { ok: false, error: clash.identity.handle + " is already committed today — one action per runner per day" };
    if (mission.patient && committed.has(mission.patient)) {
      return { ok: false, error: mission.patient.identity.handle + " is already committed today and can't also be on the table" };
    }
    session.queue.push({ mission: mission, runners: runners.slice(), label: label || MJ.missionKind(mission) });
    return { ok: true };
  }

  function unqueue(session, index) {
    session.queue.splice(index, 1);
  }

  function moveQueued(session, index, delta) {
    const to = index + delta;
    if (to < 0 || to >= session.queue.length) return;
    const item = session.queue.splice(index, 1)[0];
    session.queue.splice(to, 0, item);
  }

  // ── End of day: resolve, settle, tick, expire ──────────────────
  function endDay(session, rngOverride) {
    const rng = rngOverride || liveRNG(); // layer 4: fresh dice, always
    const results = MJ.runActionPeriod(rng, session.queue, session.day);

    results.forEach((res, i) => {
      const q = session.queue[i];
      const crew = (res.crew || []).join(", ");
      if (res.error) {
        logLine(session, (q ? q.label : res.kind) + ": REFUSED — " + res.error);
      } else {
        logLine(session, (q ? q.label : res.kind) + " [" + crew + "]: " + (res.success ? "SUCCESS" : "failed") +
          (res.karmaAward ? " (+" + res.karmaAward + " karma each)" : "") +
          (res.noise && res.noise.ratcheted ? " — the site RATCHETED its security" : ""));
      }
      // The full readout, roll by roll — the opponent's numbers are
      // information too, and a failed run is still a fresh read on
      // what's actually guarding the place.
      for (const t of res.tasks || []) {
        logLine(session, t.runner
          ? "    " + t.obstacle + " T" + t.tier + ": " + t.runner + " (" + t.skill + (t.loud ? ", LOUD" : "") + ") — " + t.hits + " hits vs " + t.threshold + " needed: " + (t.success ? "passed" : "MISSED") + (t.criticalGlitch ? " + CRITICAL GLITCH" : t.glitch ? " + glitch" : "")
          : "    " + t.obstacle + " T" + t.tier + ": " + t.result);
      }
      if (res.patient) logLine(session, "  patient " + res.patient + " now at " + res.woundsNow + " wound(s)");
      if (res.discovered) logLine(session, "  found: site #" + res.discovered.universeIndex + " in " + res.discovered.district);
      if (res.yield) logLine(session, "  yield: " + res.yield.kind + " x" + res.yield.amount + " (no armory yet — logged only)");
      for (const c of res.contractEvents || []) {
        if (c.event === "contractCompleted") logLine(session, "  " + c.runner + "'s contract block is used up — back on the shelf");
      }
    });

    for (const job of session.jobs) {
      if (!job.paid && !job.expired && MJ.isJobComplete(job)) {
        const before = session.save.johnson.money;
        MJ.collectJobPay(session.save, job);
        logLine(session, "JOB COMPLETE — " + job.hiringFaction + " pays " + (session.save.johnson.money - before) + " (reputation +1)");
      }
    }

    for (const site of session.knownSites) {
      if (site.securityState) MJ.advanceSiteDay(site.securityState);
    }
    for (const runner of session.roster) {
      const ev = MJ.advanceMarketDay(runner, rng);
      if (ev.event === "kia") logLine(session, runner.identity.handle + " was KILLED between jobs — the street keeps what it takes");
      else if (ev.event !== "none" && ev.event !== "protected") logLine(session, runner.identity.handle + ": " + ev.event);
    }
    for (let i = session.market.length - 1; i >= 0; i--) {
      const ev = MJ.advanceMarketDay(session.market[i], rng);
      if (ev.event === "unwatchedExpired") session.market.splice(i, 1);
    }
    fillMarket(session);

    session.day += 1;

    // Expiry has teeth (the standing backlog item, now enforced):
    for (const job of session.jobs) {
      if (!job.paid && !job.expired && session.day > job.expiryDay && !MJ.isJobComplete(job)) {
        job.expired = true;
        logLine(session, "JOB FAILED — " + job.hiringFaction + "'s window closed unfinished (day " + job.expiryDay + " passed, no pay)");
      }
    }
    session.board = session.board.filter((entry) => {
      if (session.day > entry.job.expiryDay) {
        logLine(session, "offer expired off the board: " + entry.job.hiringFaction + " (" + entry.job.pay + ")");
        return false;
      }
      return true;
    });

    // Keep the day's plan as replayable SPECS — the intent, never the
    // dice (layer 4 stays fresh on every attempt, by design).
    session.lastPlan = session.queue.map((q) => {
      const m = q.mission;
      return {
        kind: MJ.missionKind(m), label: q.label, runners: q.runners.slice(),
        mission: MJ.missionKind(m) === "jobObjective" ? m : null,
        site: m.site || null, lens: m.lens || null,
        itemTier: m.itemTier || null, patient: m.patient || null,
        searchKind: m.searchKind || null,
      };
    });

    session.queue = [];
    return results;
  }

  // ── Repeat yesterday's plan: replay the INTENT against today ────
  // Same objectives, same crews — validated against the current
  // state (resolved legs, dead contracts, unavailable runners get
  // skipped with a log line) and rolled on fresh dice like any
  // other day. Recreating player decisions, never outcomes.
  function repeatPlanEntry(session, p) {
    const crew = p.runners.filter((r) => MJ.isDispatchable(r));
    if (crew.length === 0) {
      logLine(session, "repeat: skipped \"" + p.label + "\" — nobody from that crew is dispatchable");
      return { ok: false, error: "no dispatchable crew" };
    }
    let mission = null;
    if (p.kind === "jobObjective") {
      mission = p.mission && !p.mission.resolved ? p.mission : null;
      if (mission) {
        const job = jobOfMission(session, mission);
        if (job && (job.expired || job.paid)) mission = null;
      }
    } else if (p.kind === "recon") mission = MJ.createReconMission(p.site, p.lens);
    else if (p.kind === "resourceGathering") mission = MJ.createResourceMission(p.site);
    else if (p.kind === "crafting") mission = MJ.createCraftingMission(p.itemTier);
    else if (p.kind === "medical") mission = p.patient && p.patient.wounds > 0 ? MJ.createMedicalMission(p.patient) : null;
    else if (p.kind === "search") mission = makeSearchMission(session, p.searchKind);
    if (!mission) {
      logLine(session, "repeat: skipped \"" + p.label + "\" — no longer applicable");
      return { ok: false, error: "no longer applicable" };
    }
    const res = queueDispatch(session, mission, crew, p.label);
    if (!res.ok) logLine(session, "repeat: skipped \"" + p.label + "\" — " + res.error);
    return res;
  }

  // Requeue ONE dispatch from yesterday — the repeat unit is the
  // individual play, not the whole day, once the player runs
  // parallel operations (user ruling).
  function repeatOne(session, index) {
    const p = session.lastPlan && session.lastPlan[index];
    if (!p) return { ok: false, error: "no such play in yesterday's plan" };
    return repeatPlanEntry(session, p);
  }

  function repeatLastPlan(session) {
    if (!session.lastPlan || session.lastPlan.length === 0) {
      return { ok: false, error: "no previous plan to repeat" };
    }
    let queued = 0;
    for (const p of session.lastPlan) {
      if (repeatPlanEntry(session, p).ok) queued += 1;
    }
    logLine(session, "repeated yesterday's plan — " + queued + " of " + session.lastPlan.length + " dispatch(es) re-queued");
    return { ok: true, queued: queued };
  }

  // ── UI helper: what can be dispatched right now ─────────────────
  function availableJobObjectives(session) {
    const out = [];
    session.jobs.forEach((job, jobIndex) => {
      if (job.paid || job.expired) return;
      job.missions.forEach((mission, legIndex) => {
        if (mission.resolved) return;
        const gated = !!(mission.requiresMission && !mission.requiresMission.resolved);
        out.push({ job: job, jobIndex: jobIndex, mission: mission, legIndex: legIndex, gated: gated });
      });
    });
    return out;
  }

  MJ.game = {
    newGame: newGame,
    refreshBoard: refreshBoard,
    refreshMarket: refreshMarket,
    watchCapacity: watchCapacity,
    hiredCount: hiredCount,
    acceptJob: acceptJob,
    watchFromMarket: watchFromMarket,
    hire: hire,
    release: release,
    unwatch: unwatch,
    expandCapacity: expandCapacity,
    toggleWatchSite: toggleWatchSite,
    discoverResource: discoverResource,
    makeSearchMission: makeSearchMission,
    repeatLastPlan: repeatLastPlan,
    repeatOne: repeatOne,
    queueDispatch: queueDispatch,
    unqueue: unqueue,
    moveQueued: moveQueued,
    endDay: endDay,
    availableJobObjectives: availableJobObjectives,
    liveRNG: liveRNG,
  };
})();
