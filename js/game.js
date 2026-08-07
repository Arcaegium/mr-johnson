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
     Layer 2 (history): the session object IS the history, and it
       round-trips whole through serializeSession/deserializeSession
       — sites travel as names, since a name is a complete seed.
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

  // ── The log ─────────────────────────────────────────────────────
  // The hub keeps a log at every fidelity: a scrolling text pane
  // today, a readout on a drawn console later. So an entry is a
  // RECORD, not a sentence — `text` is one rendering of it, and a
  // renderer that wants to colour the money lines, filter to one
  // runner, or make a site name clickable has the pieces to do it
  // without parsing English back out of a string.
  //
  //   seq  — monotonic, so a view can append what it has not shown
  //   day  — the game day it happened on
  //   kind — a small vocabulary, for filtering and styling
  //   text — the placeholder shell's sentence
  //   refs — what the line is ABOUT: handles, site names, job number
  const LOG_KINDS = ["note", "job", "money", "roster", "dispatch", "site", "system"];

  function logLine(session, text, kind, refs) {
    const entry = {
      seq: session.logSeq = (session.logSeq || 0) + 1,
      day: session.day,
      kind: LOG_KINDS.indexOf(kind) !== -1 ? kind : "note",
      text: text,
      refs: refs || null,
    };
    session.log.push(entry);
    return entry;
  }

  // One rendering of an entry, for anything that wants a line of
  // text. Tolerates the bare strings older saves stored.
  function logText(entry) {
    if (typeof entry === "string") return entry;
    if (!entry) return "";
    return "day " + entry.day + ": " + entry.text;
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
      log: [],            // event records; see logLine
      logSeq: 0,
    };
    session.save = MJ.defaultSave(session.universeSeed);
    session.save.johnson.money = STARTING_MONEY;
    fillMarket(session);
    logLine(session, "new game — universe \"" + session.universeSeed + "\", stake " + STARTING_MONEY + " nuyen", "system", { universe: session.universeSeed });
    return session;
  }

  // ── Filling the market, and SCOUTING a class ────────────────────
  // `family` narrows the pool to one class. It does NOT mint a
  // different kind of runner at a given index — runner #N of a
  // universe stays a pure function of (universeSeed, index), which is
  // the whole entropy model. It ADVANCES PAST the ones that do not
  // match, which is exactly what scouting for specific talent is:
  // you look through more people to find the one you want.
  const MINT_SCAN_CAP = 400; // a family this rare does not exist; a guard, not a rule
  function fillMarket(session, family) {
    let scanned = 0;
    while (session.market.length < MARKET_SLOTS && scanned < MINT_SCAN_CAP) {
      const runner = MJ.mintRunner(session.universeSeed, session.runnerMintIndex++);
      scanned += 1;
      if (family && runner.classification.family !== family) continue;
      session.market.push(runner);
    }
    return session.market;
  }

  function siteProviderFor(session) {
    return {
      mint: (value, orientation, excludeOwner) =>
        MJ.mintSite(session.universeSeed, session.siteMintIndex++, { value: value, orientation: orientation, excludeOwner: excludeOwner }),
    };
  }

  // ── The board (layer 3: arrivals) ───────────────────────────────
  function refreshBoard(session, rngOverride) {
    const rng = rngOverride || MJ.makeRNG(session.universeSeed + "|board|" + Date.now() + "|" + Math.random());
    session.board = MJ.generateBoard(rng, session.knownSites, session.day, session.save.johnson.boardCapacity, {
      siteProvider: siteProviderFor(session),
    });
    logLine(session, "board refreshed — " + session.board.length + " offers (the old ones are gone for good)", "system", { offers: session.board.length });
    return session.board;
  }

  // New faces: the current crowd moves on, the next indices mint in.
  // Refreshing costs, so the RNG cannot be farmed for free. Thirty
  // refreshes hunting one affordable mage is not a decision, it is a
  // slot machine — a price makes each pull a choice.
  const MARKET_REFRESH_COST = 100;

  function refreshMarket(session, family) {
    if (!MJ.canAfford(session.save, MARKET_REFRESH_COST)) {
      return { ok: false, error: "can't cover the asking fee for a fresh sweep" };
    }
    MJ.spend(session.save, MARKET_REFRESH_COST);
    session.market = [];
    fillMarket(session, family);
    logLine(session,
      family
        ? `scouted the ${family} circuit — ¥${MARKET_REFRESH_COST} to the fixers`
        : `market refreshed — new faces, ¥${MARKET_REFRESH_COST} to the fixers`,
      "system", { money: -MARKET_REFRESH_COST });
    return { ok: true, market: session.market };
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
    logLine(session, "ACCEPTED Job #" + entry.job.contractNumber + " — " + entry.job.hiringFaction + ", " + entry.job.missions.length + " leg(s), pay " + entry.job.pay + ", expires day " + entry.job.expiryDay + (entry.job.chained ? " (CHAINED)" : ""),
      "job", { job: entry.job.contractNumber, faction: entry.job.hiringFaction, expiryDay: entry.job.expiryDay });
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
    logLine(session, "watching " + runner.identity.handle + " (" + MJ.describeDiscipline(runner) + ")",
      "roster", { runners: [runner.identity.handle], watched: true });
    fillMarket(session);
    return { ok: true, runner: runner };
  }

  // Hiring straight off the market is legal — you can see someone and
  // sign them on the spot. But it has to actually MOVE them: a
  // contract without a roster place left them sitting in the market
  // wearing "permanent", which is a runner in two states at once.
  // Routed through watchFromMarket so the watch cap, the roster push
  // and the market refill all still happen exactly once.
  function hire(session, runner, tier) {
    const inMarket = session.market.indexOf(runner);
    if (inMarket !== -1) {
      const moved = watchFromMarket(session, inMarket);
      if (!moved.ok) return moved;
    }
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

  function upgrade(session, runner, newTier) {
    const result = MJ.upgradeContractWithCost(session.save, runner, newTier);
    logLine(session, result.ok
      ? "upgraded " + runner.identity.handle + " to " + newTier + " for " + result.cost + " (unused block credited)"
      : "upgrade refused for " + runner.identity.handle + " — " + result.error);
    return result;
  }

  function release(session, runner, rngOverride) {
    MJ.releaseRunner(runner, rngOverride || liveRNG());
    // Their issued gear comes off them the moment they walk — the
    // sweep at settleDay would catch it tonight anyway, but the racks
    // should read true the moment the player looks.
    const returned = MJ.reclaimUnentitled(session.save.armory.items);
    logLine(session, "released " + runner.identity.handle + " from contract" +
      (returned.length ? " — armoury reclaimed " + returned.map((it) => it.label).join(", ") : ""));
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

  // Call in a site by its key name ("Boldly-Modest-Teal-Falcon-0250") —
  // cross-universe knowledge made playable: the name is the seed,
  // so the same building answers in every universe. Called-in sites
  // arrive with their CANONICAL identity (district/owner rolled
  // from the name) — the balance bags only govern what the
  // universe deals randomly; a deliberate player choice carries no
  // such duty (user ruling). v0: a free lookup, not a dispatch.
  function canonicalSiteName(raw) {
    const parts = String(raw).trim().split("-").filter((p) => p.length);
    if (parts.length !== 5) return null;
    if (!/^\d{4}$/.test(parts[4])) return null;
    for (let i = 0; i < 4; i++) {
      if (!/^[A-Za-z]+$/.test(parts[i])) return null;
      parts[i] = parts[i].charAt(0).toUpperCase() + parts[i].slice(1).toLowerCase();
    }
    return parts.join("-");
  }

  function discoverByName(session, rawName, rngOverride) {
    const name = canonicalSiteName(rawName);
    if (!name) {
      logLine(session, "\"" + rawName + "\" isn't a site key (Adverb-Adjective-Color-Noun-####)");
      return { ok: false, error: "bad site key format" };
    }
    const existing = session.knownSites.find((s) => s.identity.name === name);
    if (existing) {
      logLine(session, name + " is already on the list");
      return { ok: true, site: existing, alreadyKnown: true };
    }
    const site = MJ.mintSiteByName(name);
    if (!site) {
      logLine(session, "no place answers to \"" + name + "\" — those words aren't in the atlas");
      return { ok: false, error: "words not in the grammar" };
    }
    MJ.generateSecurityEstimate(rngOverride || liveRNG(), site);
    MJ.addKnownSite(session.knownSites, site, session.day, "called-in");
    logLine(session, "called in \"" + name + "\" — " + site.identity.theme + ", " + site.identity.district + " (" + site.identity.owningFaction + "), the word checks out",
      "site", { site: name, district: site.identity.district, owner: site.identity.owningFaction });
    return { ok: true, site: site };
  }

  // Search is a real dispatch (user ruling, "Search / Scrap" on the
  // action menu): the mission carries a callback that mints and
  // registers the find when it resolves — the runner spends their
  // action and contract mission on the legwork.
  function makeSearchMission(session, kind) {
    return MJ.createSearchMission(kind, (rng) => discoverResource(session, kind, rng).site);
  }

  function discoverResource(session, kind, rngOverride) {
    const rng = rngOverride || liveRNG();
    // Found places live at the sprawl's edges: wilderness districts,
    // owned by nobody.
    const site = MJ.mintSite(session.universeSeed, session.siteMintIndex++, {
      orientation: kind === "reagents" ? "astral" : "physical",
      district: rng.pick(MJ.WILD_DISTRICTS),
      owner: "Unowned",
    });
    site.tags.push({ tag: "resource:" + kind, expiryDay: Infinity });
    MJ.generateSecurityEstimate(rng, site);
    MJ.addKnownSite(session.knownSites, site, session.day, "discovery");
    logLine(session, "discovered a " + kind + " site: \"" + site.identity.name + "\" — " + site.identity.theme + ", " + site.identity.district,
      "site", { site: site.identity.name, district: site.identity.district, discovered: true });
    return { ok: true, site: site };
  }

  // ── The armory: buy, sell, issue, implant ───────────────────────
  function buyGear(session, templateId) {
    const result = MJ.buyItem(session.save, templateId);
    logLine(session, result.ok
      ? "bought " + result.item.label + " (T" + result.item.tier + ") for " + result.cost
      : "purchase refused (" + MJ.ITEM_TEMPLATES[templateId].label + ") — " + result.error);
    return result;
  }

  function sellGear(session, item) {
    const result = MJ.sellItem(session.save, item);
    logLine(session, result.ok
      ? "sold " + item.label + " for " + result.price
      : "sale refused (" + item.label + ") — " + result.error);
    return result;
  }

  function issueGear(session, item, runner) {
    if (!runner) {
      MJ.reclaimItem(item);
      logLine(session, item.label + " reclaimed to the armory");
      return { ok: true };
    }
    const result = MJ.issueItem(item, runner);
    logLine(session, result.ok
      ? item.label + " issued to " + runner.identity.handle
      : "issue refused — " + result.error);
    return result;
  }

  function implantGear(session, item, runner) {
    const result = MJ.implantSurgery(runner, item, session.save.armory.items);
    logLine(session, result.ok
      ? item.label + " implanted into " + runner.identity.handle + " (essence now " + runner.essence.current + ") — it's not coming back out"
      : "surgery refused (" + runner.identity.handle + ") — " + result.error);
    return result;
  }

  function teachGear(session, item, runner) {
    const result = MJ.teachFormula(runner, item, session.save.armory.items);
    logLine(session, result.ok
      ? runner.identity.handle + " began studying " + item.label +
        " — the next " + result.cost + " karma they earn pays for it before anything else grows"
      : "study refused (" + item.label + ") — " + result.error);
    return result;
  }

  function sellStock(session, kind) {
    const result = MJ.sellMaterials(session.save, kind);
    logLine(session, result.ok
      ? "sold " + result.amount + "x " + kind.replace("resource:", "") + " for " + result.price
      : "no " + kind.replace("resource:", "") + " to sell");
    return result;
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

  // ── The day, in three parts ─────────────────────────────────────
  // beginDay opens every dispatch (validation, contracts, and the
  // walk to the door), the caller resolves each one, settleDay pays
  // and ticks. endDay chains all three with the auto-chooser in the
  // middle; the popup puts the player there instead. One code path,
  // two drivers — the interactive game and the stress suite cannot
  // diverge, because there is only one thing to diverge from.
  function beginDay(session, rngOverride) {
    const rng = rngOverride || liveRNG(); // layer 4: fresh dice, always
    const live = !rngOverride;
    // ── THE MORNING, KEPT ─────────────────────────────────────────
    // Written BEFORE a single dispatch opens, because runners die on
    // jobs and the player must never be shut out of that decision.
    // Nothing is written again until settleDay, so from here until the
    // day is settled the player can walk away from everything that
    // happened — and once it IS settled, this slot still holds the
    // morning, so the choice outlives the dismissal that used to end
    // it. An injected rng means the suite or a replay is driving, and
    // must never touch the player's slots.
    if (live) MJ.saveRewindPoint(serializeSession(session));
    const acted = new Set();
    const entries = session.queue.map((d) => {
      const entry = MJ.openDispatch(rng, d, session.day, acted);
      entry.label = d.label;
      return entry;
    });
    return { rng: rng, entries: entries, live: live };
  }

  // Put the day back the way it was this morning. Everything the day
  // did — deaths included — is discarded, and the dice are fresh when
  // it is played again, because this recreates the DECISION, never
  // the outcome (the same rule repeatPlan follows).
  function rewindDay() {
    return MJ.loadRewindPoint().then((record) => {
      if (!record) return null;
      const session = deserializeSession(record);
      // The morning is now the live save, and the rewind point is
      // spent — one step back, not an undo stack.
      return MJ.saveGame(record)
        .then(() => MJ.clearRewindPoint())
        .then(() => {
          logLine(session, "rewound to the morning of day " + session.day +
            " — today has not happened", "system", { rewound: true });
          return session;
        });
    });
  }

  function hasRewindPoint() {
    return MJ.loadRewindPoint().then((r) => !!r);
  }

  // Finish one opened dispatch, however it was steered, and write it
  // to the log. Safe to call on an already-finished entry.
  function resolveEntry(session, day, entry) {
    if (!entry.done) {
      entry.result = MJ.closeDispatch(entry, MJ.finishMission(day.rng, entry.run));
      entry.done = true;
    }
    logResult(session, entry.label, entry.result);
    return entry.result;
  }

  // What that act did to the site's read of you, said only when
  // there is something to say: the band moved, or an odd moment got
  // banked toward moving it. Once they already read you as
  // threatening, "suspicion raised" is just noise.
  function readNote(read) {
    if (!read) return "";
    if (read.changed) return " — suspicion raised to " + read.band;
    if (read.band === "threatening") return ""; // nothing left to raise
    if (read.awkward) return " — noted (" + read.awkward + " odd moment" + (read.awkward === 1 ? "" : "s") + " here today)";
    return "";
  }

  function logResult(session, label, res) {
    const crew = (res.crew || []).join(", ");
    if (res.error) {
      logLine(session, (label || res.kind) + ": REFUSED — " + res.error,
        "dispatch", { runners: res.crew || [], refused: true });
    } else {
      logLine(session, (label || res.kind) + " [" + crew + "]: " + (res.success ? "SUCCESS" : "failed") +
        (res.karmaAward ? " (+" + res.karmaAward + " karma each)" : ""),
        "dispatch", { runners: res.crew || [], success: !!res.success, karma: res.karmaAward || 0, missionKind: res.kind });
    }
    // The full readout, roll by roll — the opponent's numbers are
    // information too, and a failed run is still a fresh read on
    // what's actually guarding the place.
    for (const t of res.tasks || []) {
      if (!t.runner) {
        // A withdrawal that names what the crew lacked is the most
        // useful line a failed run produces — it is the next hire.
        logLine(session, "    " + t.obstacle + " T" + t.tier + ": " + t.result,
          t.gap ? "dispatch" : "note",
          t.gap ? { needs: t.gap.needs, outclassed: t.gap.outclassed, site: t.obstacle, tier: t.gap.tier } : null);
      } else if (t.combat) {
        logLine(session, "    " + t.obstacle + " T" + t.tier + ": " + (t.surprise ? "AMBUSH — " : "FIREFIGHT — ") +
          t.enemies.join(", ") + " — " + t.rounds + " round" + (t.rounds === 1 ? "" : "s") + ": " +
          (t.success ? "crew held the ground" : t.stalemate ? "broke off — could not finish them" : "THE CREW WENT DOWN") + readNote(t.read));
        for (const c of t.casualties || []) {
          logLine(session, "      " + c.runner + (c.died
            ? " was KILLED" : " went down — carried out with " + c.wounds + " box" + (c.wounds === 1 ? "" : "es")),
            "roster", { runners: [c.runner], died: !!c.died, wounds: c.wounds || 0 });
        }
        // Everyone who stayed on their feet but did not stay whole.
        for (const inj of t.injured || []) {
          logLine(session, "      " + inj.runner + " took " + inj.wounds + " box" + (inj.wounds === 1 ? "" : "es") + " and kept going",
            "roster", { runners: [inj.runner], wounds: inj.wounds });
        }
      } else if (t.extended) {
        const outcome = t.abandoned ? "backed off"
          : t.success ? "through"
          : t.glitch ? "FUMBLED IT" : "ran dry";
        logLine(session, "    " + t.obstacle + " T" + t.tier + ": " + t.runner + " worked it (" + t.skill +
          (t.pool !== undefined ? " " + t.pool + "d" : "") + ") — " + t.hits + "/" + t.threshold +
          " over " + t.intervals + " interval" + (t.intervals === 1 ? "" : "s") + ": " + outcome +
          (t.criticalGlitch ? " + CRITICAL GLITCH" : "") + readNote(t.read));
      } else if (t.cast) {
        // A CAST IS NOT A SKILL CHECK, and it has no obstacle when it
        // is put up on open ground before the crew goes in. Falling
        // through to the generic line printed "undefined Tundefined
        // ... vs undefined needed", because every field that line
        // reads belongs to an approach against a thing.
        logLine(session, "    " + t.runner + " cast " + t.verb +
          (t.prep ? " before going in" : "") + " at Force " + t.force +
          " (" + t.pool + "d, " + t.hits + " hit" + (t.hits === 1 ? "" : "s") + "): " +
          // t.result already opens with the spell's name, so strip it
          // rather than saying it twice on one line.
          (t.success
            ? String(t.result).replace(t.verb + " — ", "").replace(t.verb, "held")
            : "the circuit would not hold") + readNote(t.read),
          "dispatch", { runners: [t.runner], spell: t.spell, force: t.force, success: !!t.success });
        if (t.drain && t.drain.damage > 0) {
          logLine(session, "      Drain: " + t.drain.damage +
            (t.drain.physical ? " PHYSICAL (overcast)" : " stun") +
            (t.drain.dropped ? " — " + t.runner + " DROPPED" : ""),
            "roster", { runners: [t.runner], stun: t.drain.physical ? 0 : t.drain.damage });
        }
      } else if (t.rejected) {
        // Found out the hard way — that's what the attempt bought.
        logLine(session, "    " + t.obstacle + " T" + t.tier + ": " + t.runner + " tried " + t.skill + " — " + t.rejected);
      } else {
        logLine(session, "    " + t.obstacle + " T" + t.tier + ": " + t.runner + " (" + t.skill + (t.pool !== undefined ? " " + t.pool + "d" : "") + (t.loud ? ", LOUD" : "") + (t.boosted ? ", +" + t.boosted : "") + ") — " + t.hits + " hits vs " + t.threshold + " needed: " + (t.success ? "passed" : "MISSED") + (t.criticalGlitch ? " + CRITICAL GLITCH" + (t.guarded ? " (absorbed by " + t.guarded + ")" : "") : t.glitch ? " + glitch" : "") + readNote(t.read));
        if (t.drain && t.drain.damage > 0) {
          logLine(session, "      Drain: Force " + t.drain.force + (t.drain.overcast ? " (OVERCAST)" : "") +
            " — " + t.drain.damage + (t.drain.physical ? " physical" : " stun") +
            (t.drain.dropped ? " — " + t.runner + " DROPPED" +
              (t.drain.casualty && t.drain.casualty.died ? " and did not get back up" : "") : ""));
        }
      }
      if (t.responders && t.responders.length) {
        logLine(session, "      RESPONSE: " + t.responders.join(", ") + " — they are coming");
      }
    }
    if (res.walkedIntoResponse) {
      logLine(session, "  they were still up from earlier — " + res.walkedIntoResponse.join(", ") + " waiting at the door");
    }
    if (res.threatBand && res.threatBand !== "normal") {
      logLine(session, "  the site reads you as " + res.threatBand.toUpperCase() +
        (res.forcedResponse ? " — they are responding in force" : ""));
    }
    if (res.incident && res.incident.ratcheted) {
      logLine(session, "  they held what they escalated to — the site's standing posture is higher now" +
        (res.incident.maxGrew ? ", and they have approved more budget" : ""));
    }
    if (res.suppression) logLine(session, "  softened: the site's " + res.suppression.axis + " grid is degraded for the rest of the day (+" + res.suppression.level + "d vs " + res.suppression.axis + " obstacles)");
    if (res.patient) logLine(session, "  patient " + res.patient + " now at " + res.woundsNow + " box(es)" +
      (res.healed ? " — closed " + res.healed : ""),
      "roster", { runners: [res.patient], wounds: res.woundsNow, healed: res.healed || 0 });
    if (res.dataHaul) {
      logLine(session, "  pulled " + res.dataHaul.files + " datafile(s) from " +
        res.dataHaul.nodesLooted + " node(s) — deck storage " + res.dataHaul.storage);
    }
    if (res.discovered) logLine(session, "  found: site #" + res.discovered.universeIndex + " in " + res.discovered.district);
    if (res.bonusItem) {
      session.save.armory.items.push(res.bonusItem);
      logLine(session, "  scavenged: " + res.bonusItem.label + " (T" + res.bonusItem.tier + ") — in the armory");
    }
    if (res.yield) {
      if (res.yield.item) {
        session.save.armory.items.push(res.yield.item);
        logLine(session, "  crafted: " + res.yield.item.label + " (T" + res.yield.item.tier + ") — in the armory");
      } else if (res.yield.kind && res.yield.kind.indexOf("resource:") === 0) {
        const mats = session.save.armory.materials;
        mats[res.yield.kind] = (mats[res.yield.kind] || 0) + res.yield.amount;
        logLine(session, "  stored: " + res.yield.kind.replace("resource:", "") + " x" + res.yield.amount + " (stock now " + mats[res.yield.kind] + ")");
      } else {
        logLine(session, "  yield: " + res.yield.kind + " x" + res.yield.amount);
      }
    }
    for (const c of res.contractEvents || []) {
      if (c.event === "contractCompleted") logLine(session, "  " + c.runner + "'s contract block is used up — back on the shelf");
    }
  }

  // ── Settling: pay, tick, expire, save ───────────────────────────
  function settleDay(session, day) {
    const rng = day.rng;

    for (const job of session.jobs) {
      if (!job.paid && !job.expired && MJ.isJobComplete(job)) {
        const before = session.save.johnson.money;
        MJ.collectJobPay(session.save, job);
        logLine(session, "JOB COMPLETE — " + job.hiringFaction + " pays " + (session.save.johnson.money - before) + " (reputation +1)",
          "money", { job: job.contractNumber, delta: session.save.johnson.money - before, faction: job.hiringFaction });
      }
    }

    // The armoury takes its property back BEFORE the burial sweep
    // deletes anyone — killed on the job, a freelance or retainer
    // contract that completed today, whatever the reason the holder
    // stopped being the operation's people. Nobody loses a deck to a
    // forgotten unequip or a bad roll of the dice; the racks are the
    // operation's, and they come home with the day.
    {
      const returned = MJ.reclaimUnentitled(session.save.armory.items);
      if (returned.length) {
        logLine(session, "armoury reclaimed: " + returned.map((it) => it.label).join(", "),
          "system", { reclaimed: returned.length });
      }
    }

    // Bury the dead before anything else touches the roster — they
    // do not draw a wage, do not cycle on the market, and are not
    // available tomorrow.
    for (let i = session.roster.length - 1; i >= 0; i--) {
      if (!session.roster[i].dead) continue;
      logLine(session, session.roster[i].identity.handle + " did not come back — the operation is short a runner",
        "roster", { runners: [session.roster[i].identity.handle], died: true });
      session.roster.splice(i, 1);
    }

    // Payroll, before the day rolls over.
    const wages = MJ.payUpkeep(session.save, session.roster);
    if (wages.owed > 0) {
      logLine(session, "payroll: " + wages.paid + " to permanent staff" +
        (wages.shortfall ? " — SHORT " + wages.shortfall + ", they noticed" : ""),
        "money", { delta: -wages.paid, shortfall: wages.shortfall || 0 });
    }

    for (const site of session.knownSites) {
      if (site.securityState) MJ.advanceSiteDay(site.securityState);
    }
    // Who worked today. A runner who was out on a job did not spend
    // the day healing, so their rest counter starts over.
    const worked = new Set();
    for (const entry of day.entries || []) {
      for (const r of entry.crew || []) worked.add(r);
      if (entry.dispatch && entry.dispatch.mission && entry.dispatch.mission.patient) {
        worked.add(entry.dispatch.mission.patient);
      }
    }
    for (const runner of session.roster) {
      if (worked.has(runner)) runner.restedDays = 0;
      else {
        runner.restedDays = (runner.restedDays || 0) + 1;
        const mended = MJ.restDay(runner, runner.restedDays);
        if (mended > 0 && !runner.wounds && !runner.stun) {
          logLine(session, runner.identity.handle + " is back to full health",
            "roster", { runners: [runner.identity.handle], wounds: 0 });
        }
      }
      const ev = MJ.advanceMarketDay(runner, rng);
      if (ev.event === "kia") logLine(session, runner.identity.handle + " was KILLED between jobs — the street keeps what it takes",
        "roster", { runners: [runner.identity.handle], died: true });
      else if (ev.event !== "none" && ev.event !== "protected") logLine(session, runner.identity.handle + ": " + ev.event,
        "roster", { runners: [runner.identity.handle], event: ev.event });
    }
    for (let i = session.market.length - 1; i >= 0; i--) {
      const ev = MJ.advanceMarketDay(session.market[i], rng);
      if (ev.event === "unwatchedExpired") session.market.splice(i, 1);
    }
    fillMarket(session);

    // Sweep spent consumables off the racks.
    for (let i = session.save.armory.items.length - 1; i >= 0; i--) {
      if (session.save.armory.items[i].consumed) session.save.armory.items.splice(i, 1);
    }

    session.day += 1;

    // Expiry has teeth (the standing backlog item, now enforced):
    for (const job of session.jobs) {
      if (!job.paid && !job.expired && session.day > job.expiryDay && !MJ.isJobComplete(job)) {
        job.expired = true;
        logLine(session, "JOB FAILED — " + job.hiringFaction + "'s window closed unfinished (day " + job.expiryDay + " passed, no pay)",
          "job", { job: job.contractNumber, faction: job.hiringFaction, failed: true });
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
    // EVERY field a mission is rebuilt from, or the repeat quietly
    // becomes a different play: a reagent harvest without its `kind`
    // repeats as a generic one, a crafting job without its
    // `templateId` regresses to the legacy tier-only exercise, and a
    // matrix or astral run with no branch at all repeats as "no
    // longer applicable".
    session.lastPlan = session.queue.map((q) => {
      const m = q.mission;
      return {
        kind: MJ.missionKind(m), label: q.label, runners: q.runners.slice(),
        mission: MJ.missionKind(m) === "jobObjective" ? m : null,
        site: m.site || null, lens: m.lens || null,
        resourceKind: m.resourceKind || m.kindWanted || null,
        templateId: m.templateId || null,
        itemTier: m.itemTier || null, patient: m.patient || null,
        searchKind: m.searchKind || null,
        wantData: !!m.wantData,
      };
    });

    session.queue = [];

    // Every day-spend is an autosave point (§09) — but only LIVE
    // days: an injected rng means a test/replay is driving, and the
    // suite must never clobber the player's save slot.
    if (day.live) saveSession(session);
  }

  // The whole day, auto-resolved — what the suite and the "quick
  // resolve" button run.
  function endDay(session, rngOverride) {
    const day = beginDay(session, rngOverride);
    const results = day.entries.map((entry) => {
      if (!entry.done) MJ.autoResolve(entry.run);
      return resolveEntry(session, day, entry);
    });
    settleDay(session, day);
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
    else if (p.kind === "resourceGathering") mission = MJ.createResourceMission(p.site, p.resourceKind);
    else if (p.kind === "crafting") mission = MJ.createCraftingMission(p.templateId || p.itemTier);
    else if (p.kind === "medical") mission = p.patient && p.patient.wounds > 0 ? MJ.createMedicalMission(p.patient) : null;
    else if (p.kind === "search") mission = makeSearchMission(session, p.searchKind);
    // The two pillar runs were simply absent, so every astral or
    // matrix play repeated as "no longer applicable".
    else if (p.kind === "matrixRun") mission = MJ.createMatrixMission(p.site, { wantData: p.wantData });
    else if (p.kind === "astralRun") mission = MJ.createAstralMission(p.site);
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

  // ── Persistence: seeds + deltas, for real (§09) ─────────────────
  // Sites serialize as name + deltas (the name is the complete
  // seed); runners are plain records once gear refs become ids;
  // missions point at sites by name and prerequisites by index.
  // Dice never serialize — layer 4 is fresh entropy by design.
  // The day-planning queue and lastPlan are transient and drop.
  function serializeSession(session) {
    const rosterIndex = (r) => session.roster.indexOf(r);
    const siteRecord = (site) => ({
      siteName: site.identity.name,
      universeIndex: site.identity.universeIndex,
      tags: site.tags,
      intel: site.intel,
      estimatedSecurity: site.estimatedSecurity || null,
      knownMeta: site.knownMeta || null,
      securityState: site.securityState || null,
    });
    const missionRecord = (m, all) => ({
      siteName: m.site ? m.site.identity.name : null,
      siteEstimate: m.site ? m.site.estimatedSecurity || null : null,
      targetFaction: m.targetFaction, hiringFaction: m.hiringFaction,
      locationType: m.locationType, objectiveVerb: m.objectiveVerb,
      payloadDomain: m.payloadDomain, family: m.family, tier: m.tier,
      intendedCrew: m.intendedCrew, payContribution: m.payContribution,
      resolved: m.resolved, karmaAward: m.karmaAward,
      requiresIndex: m.requiresMission ? all.indexOf(m.requiresMission) : -1,
    });
    const jobRecord = (job) => ({
      hiringFaction: job.hiringFaction, pay: job.pay,
      daysPerMission: job.daysPerMission, rushMultiplier: job.rushMultiplier,
      chained: !!job.chained, successCriteria: job.successCriteria,
      expiryDay: job.expiryDay, contractNumber: job.contractNumber || null,
      paid: !!job.paid, expired: !!job.expired,
      missions: job.missions.map((m) => missionRecord(m, job.missions)),
    });
    const runnerRecord = (r) => {
      const copy = Object.assign({}, r);
      // Issued gear rebuilds from the armoury's own item records, so
      // it is dropped here. PERSONAL kit is not in the armoury — it
      // belongs to the runner and would simply vanish on reload — so
      // it rides along on the dossier instead, minus the back-pointer
      // that makes gear circular in the first place.
      copy.personalKit = (r.gear || [])
        .filter((it) => it.personal)
        .map((it) => ({ id: it.id, templateId: it.templateId, label: it.label, tier: it.tier }));
      delete copy.gear;
      return JSON.parse(JSON.stringify(copy));
    };
    return {
      schemaVersion: MJ.SCHEMA_VERSION,
      universeSeed: session.universeSeed,
      day: session.day,
      contractCounter: session.contractCounter,
      runnerMintIndex: session.runnerMintIndex,
      siteMintIndex: session.siteMintIndex,
      johnson: JSON.parse(JSON.stringify(session.save.johnson)),
      materials: JSON.parse(JSON.stringify(session.save.armory.materials || {})),
      items: session.save.armory.items.map((it) => ({
        id: it.id, templateId: it.templateId, label: it.label, tier: it.tier,
        crafted: !!it.crafted, quality: it.quality || 0, mark: it.mark || null,
        issuedToRoster: it.issuedTo ? rosterIndex(it.issuedTo) : -1,
      })),
      roster: session.roster.map(runnerRecord),
      market: session.market.map(runnerRecord),
      knownSites: session.knownSites.map(siteRecord),
      jobs: session.jobs.map(jobRecord),
      board: session.board.map((e) => jobRecord(e.job)),
      log: session.log.slice(-200),
    };
  }

  function deserializeSession(record) {
    const session = {
      universeSeed: record.universeSeed,
      day: record.day,
      save: MJ.defaultSave(record.universeSeed),
      roster: record.roster,
      market: record.market,
      runnerMintIndex: record.runnerMintIndex,
      siteMintIndex: record.siteMintIndex,
      contractCounter: record.contractCounter,
      knownSites: [],
      jobs: [],
      board: [],
      queue: [],
      lastPlan: null, // transient — repeat resumes after the next played day
      log: record.log || [],
    };
    // A save from before the log carried records holds bare strings.
    // Keep them readable rather than dropping the history: they
    // render through logText untouched, and `logSeq` picks up past
    // whatever is already there so new entries stay ordered.
    session.logSeq = session.log.reduce((n, e) => Math.max(n, (e && e.seq) || 0), 0);
    session.save.johnson = record.johnson;
    session.save.armory.materials = record.materials || {};
    // JSON can't carry Infinity — it lands as null. The only fields
    // that legitimately hold it get restored here.
    const fixRunner = (r) => {
      if (r.market && r.market.hired) {
        if (r.market.hired.missionsRemaining === null) r.market.hired.missionsRemaining = Infinity;
        if (r.market.hired.blockSize === null) r.market.hired.blockSize = Infinity;
      }
    };
    session.roster.forEach(fixRunner);
    session.market.forEach(fixRunner);
    // Sites: mint from the name, then lay the saved deltas back on.
    const siteByName = new Map();
    const reviveSite = (siteName, estimate) => {
      if (siteByName.has(siteName)) return siteByName.get(siteName);
      const site = MJ.mintSiteByName(siteName);
      if (estimate) site.estimatedSecurity = estimate;
      siteByName.set(siteName, site);
      return site;
    };
    for (const rec of record.knownSites) {
      const site = reviveSite(rec.siteName, rec.estimatedSecurity);
      if (rec.universeIndex !== undefined && rec.universeIndex !== null) site.identity.universeIndex = rec.universeIndex;
      site.tags = (rec.tags || []).map((t) => (t.expiryDay === null ? Object.assign({}, t, { expiryDay: Infinity }) : t));
      site.intel = rec.intel || {};
      if (rec.knownMeta) site.knownMeta = rec.knownMeta;
      if (rec.securityState) site.securityState = rec.securityState;
      session.knownSites.push(site);
    }
    const reviveJob = (jr) => {
      const job = {
        hiringFaction: jr.hiringFaction, pay: jr.pay,
        daysPerMission: jr.daysPerMission, rushMultiplier: jr.rushMultiplier,
        chained: jr.chained, successCriteria: jr.successCriteria,
        expiryDay: jr.expiryDay, contractNumber: jr.contractNumber,
        paid: jr.paid, expired: jr.expired,
        staticFacts: [], dynamicFacts: [],
        missions: jr.missions.map((mr) => ({
          site: mr.siteName ? reviveSite(mr.siteName, mr.siteEstimate) : null,
          targetFaction: mr.targetFaction, hiringFaction: mr.hiringFaction,
          locationType: mr.locationType, objectiveVerb: mr.objectiveVerb,
          payloadDomain: mr.payloadDomain, family: mr.family, tier: mr.tier,
          intendedCrew: mr.intendedCrew, payContribution: mr.payContribution,
          resolved: mr.resolved, karmaAward: mr.karmaAward,
          requiresMission: null,
        })),
      };
      jr.missions.forEach((mr, i) => {
        if (mr.requiresIndex >= 0) job.missions[i].requiresMission = job.missions[mr.requiresIndex];
      });
      return job;
    };
    session.jobs = record.jobs.map(reviveJob);
    session.board = record.board.map((jr) => ({ job: reviveJob(jr), siteResults: [] }));
    // Personal kit first, so a runner is never briefly empty-handed
    // and the armoury's issued items can push on top of it.
    for (const r of session.roster.concat(session.market)) {
      r.gear = (r.personalKit || []).map((k) => ({
        id: k.id, templateId: k.templateId, label: k.label, tier: k.tier,
        personal: true, issuedTo: r,
      }));
      delete r.personalKit;
    }
    // Items: rebuild the two-way gear refs.
    session.save.armory.items = record.items.map((ir) => {
      const item = { id: ir.id, templateId: ir.templateId, label: ir.label, tier: ir.tier,
        crafted: !!ir.crafted, quality: ir.quality || 0, mark: ir.mark || null, issuedTo: null };
      if (ir.issuedToRoster >= 0 && session.roster[ir.issuedToRoster]) {
        const holder = session.roster[ir.issuedToRoster];
        item.issuedTo = holder;
        holder.gear = holder.gear || [];
        holder.gear.push(item);
      }
      return item;
    });
    return session;
  }

  function saveSession(session) {
    const record = serializeSession(session);
    // Log synchronously — async confirmation lines would interleave
    // nondeterministically with later commands' log lines.
    logLine(session, "saved (day " + session.day + ")", "system", { saved: true });
    return MJ.saveGame(record).then(() => ({ ok: true })).catch((e) => {
      logLine(session, "save WRITE FAILED — " + e, "system", { saveFailed: true });
      return { ok: false, error: String(e) };
    });
  }

  function loadSession() {
    return MJ.loadGame().then((record) => {
      if (!record || !record.universeSeed) return null;
      const session = deserializeSession(record);
      logLine(session, "loaded — day " + session.day + ", universe \"" + session.universeSeed + "\"", "system", { loaded: true });
      return session;
    });
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

  // Reading the log needs no session, so it sits on MJ directly —
  // any renderer, at any fidelity, can turn a record into a line.
  MJ.logText = logText;
  MJ.LOG_KINDS = LOG_KINDS;

  MJ.game = {
    // A renderer's own line in the log — a refused click, a note to
    // the player. Goes through the same record shape as everything
    // else so no view has to hand-build one.
    note: logLine,
    newGame: newGame,
    refreshBoard: refreshBoard,
    refreshMarket: refreshMarket,
    watchCapacity: watchCapacity,
    hiredCount: hiredCount,
    acceptJob: acceptJob,
    watchFromMarket: watchFromMarket,
    hire: hire,
    upgrade: upgrade,
    release: release,
    unwatch: unwatch,
    expandCapacity: expandCapacity,
    toggleWatchSite: toggleWatchSite,
    discoverResource: discoverResource,
    discoverByName: discoverByName,
    canonicalSiteName: canonicalSiteName,
    makeSearchMission: makeSearchMission,
    repeatLastPlan: repeatLastPlan,
    repeatOne: repeatOne,
    buyGear: buyGear,
    sellGear: sellGear,
    issueGear: issueGear,
    implantGear: implantGear,
    teachGear: teachGear,
    sellStock: sellStock,
    queueDispatch: queueDispatch,
    unqueue: unqueue,
    moveQueued: moveQueued,
    endDay: endDay,
    beginDay: beginDay,
    resolveEntry: resolveEntry,
    settleDay: settleDay,
    logResult: logResult,
    availableJobObjectives: availableJobObjectives,
    serializeSession: serializeSession,
    deserializeSession: deserializeSession,
    saveSession: saveSession,
    loadSession: loadSession,
    rewindDay: rewindDay,
    hasRewindPoint: hasRewindPoint,
    liveRNG: liveRNG,
  };
})();
