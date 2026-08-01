/* ============================================================
   Mr. Johnson — harness.js
   Developer inspector, Phase 0 and now Phase 1. Not part of the
   game — a bench for proving the foundational systems produce
   sane, varied, reproducible output before any real UI exists.
   ============================================================ */
(function () {
  const out = () => document.getElementById("out");

  function log(line) {
    out().textContent += line + "\n";
  }
  function clear() {
    out().textContent = "";
  }

  // ── P0.2 — prove the RNG is deterministic and useful ──────────
  function testRNG() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";

    log("SEED: " + seed);
    log("");

    // Determinism: two generators, same seed, identical sequences.
    const a = MJ.makeRNG(seed);
    const b = MJ.makeRNG(seed);
    const seqA = Array.from({ length: 5 }, () => a.int(1, 100));
    const seqB = Array.from({ length: 5 }, () => b.int(1, 100));
    const identical = seqA.every((v, i) => v === seqB[i]);
    log("determinism  same seed → same sequence");
    log("   run 1: [" + seqA.join(", ") + "]");
    log("   run 2: [" + seqB.join(", ") + "]");
    log("   " + (identical ? "PASS — identical" : "FAIL — diverged"));
    log("");

    // Independence: a different seed diverges.
    const c = MJ.makeRNG(seed + "-other");
    const seqC = Array.from({ length: 5 }, () => c.int(1, 100));
    log("variety      different seed → different sequence");
    log("   other:  [" + seqC.join(", ") + "]");
    log("");

    // The helper surface the generators will lean on.
    const r = MJ.makeRNG(seed);
    log("helpers");
    log("   float()      " + r.float().toFixed(4));
    log("   int(1,6)     " + r.int(1, 6));
    log("   chance(.5)   " + r.chance(0.5));
    log("   pick         " + r.pick(["cyber", "adept", "infected", "tech"]));
    log("   weighted     " + r.weighted([
      { item: "Generalist", weight: 4 },
      { item: "Specialist", weight: 4 },
    ]));
    log("   shuffle      [" + r.shuffle([1, 2, 3, 4, 5]).join(", ") + "]");
    log("");

    // Forking: independent, reproducible sub-streams from one parent.
    const root = MJ.makeRNG(seed);
    const runnersRng = root.fork("runners");
    const sitesRng = root.fork("sites");
    log("fork         parent → independent, reproducible children");
    log("   runners: [" + Array.from({ length: 3 }, () => runnersRng.int(1, 100)).join(", ") + "]");
    log("   sites:   [" + Array.from({ length: 3 }, () => sitesRng.int(1, 100)).join(", ") + "]");
  }

  // ── P0.3 — inspect a single generated runner ──────────────────
  // Sorts by the raw (possibly half-step) value so a skill sitting
  // at X.5 correctly outranks one still at X.0, but always DISPLAYS
  // the floored integer — the player never sees the internal .5.
  function fmtSkills(skills) {
    return Object.entries(skills)
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${Math.floor(v)}`)
      .join("  ");
  }

  function dumpRunner(r) {
    const c = r.classification;
    log(`${r.identity.handle}  (${r.identity.metatypeLabel})`);
    log(`  "${r.identity.personalityLine}"`);
    log(`  "${r.identity.aimsLine}"`);
    log(`  focus: ${c.focusLabel} (${c.family})   origin: ${c.origin}`);
    if (c.deckerAffinity) log(`  decker affinity: ${c.deckerAffinity}`);
    log(`  Discipline (visible): ${MJ.describeDiscipline(r)}`);
    log(`  true archetype (hidden): ${c.trueArchetype}  ${c.trueArchetype === c.disciplineLabel ? "[match]" : "[MISMATCH]"}`);
    log(`  attrs: body ${r.attributes.body}  agi ${r.attributes.agility}  will ${r.attributes.willpower}  int ${r.attributes.intelligence}  cha ${r.attributes.charisma}  magic ${r.attributes.magic}`);
    log(`  essence: ${r.essence.current}/${r.essence.max}`);
    log(`  skills:  ${fmtSkills(r.skills)}`);
    log(`  true value (karma cost): ${MJ.trueValue(MJ.getEffectiveSkills(r))}   →  listed price: ${MJ.computePrice(r)}`);
    log("");
  }

  function testRunner() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("");
    dumpRunner(MJ.generateRunner(rng));
  }

  // ── P0.3 — a small market, to eyeball shape/label/price variety ─
  function testMarket() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed + "   (10 runners, unfiltered)");
    log("");
    for (let i = 0; i < 10; i++) {
      dumpRunner(MJ.generateRunner(rng));
    }
  }

  // ── P0.3 — karma growth cascade: watch a career unfold ─────────
  // Generates one runner, then feeds it a two-phase career: rising
  // Karma awards (phase 1), then flat/stagnant awards (phase 2) —
  // the exact pattern used to verify the growth cascade before it
  // was built. Watch skills climb fast while escalating, then
  // plateau and spill into Tertiary/Overflow once escalation stops.
  function testGrowth() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    const runner = MJ.generateRunner(rng);

    log("SEED: " + seed);
    log("");
    log(`${runner.identity.handle}  —  ${MJ.describeDiscipline(runner)}  (true archetype: ${runner.classification.trueArchetype})`);
    log(`focus: ${runner.classification.focusLabel}   family: ${runner.classification.family}`);
    const t = runner.classification.skillTiers;
    log(`primary: ${t.primary}   secondary: [${t.secondary.join(", ")}]   tertiary: [${t.tertiary.join(", ")}]`);
    log(`overflow pool: ${t.overflow.length} skill(s) this family is eligible for`);
    log("");
    log(`starting skills:  ${fmtSkills(runner.skills)}`);
    log("");

    log("── Phase 1: escalating jobs (Karma award rising each job) ──");
    for (let job = 0; job < 15; job++) {
      const award = 20 + job * 4;
      MJ.growRunner(runner, award, rng);
      if (job % 3 === 0 || job === 14) {
        log(`  job ${String(job).padStart(2)}  award=${String(award).padStart(3)}  ${fmtSkills(runner.skills)}`);
      }
    }
    log("");
    log("── Phase 2: same runner, jobs stop escalating (flat Karma award) ──");
    for (let job = 15; job < 40; job++) {
      const leftover = MJ.growRunner(runner, 20, rng);
      if (job % 5 === 0 || job === 39) {
        log(`  job ${String(job).padStart(2)}  award= 20  leftover=${leftover.toFixed(0).padStart(2)}  ${fmtSkills(runner.skills)}`);
      }
    }
    log("");
    log("final dossier:");
    dumpRunner(runner);
  }

  // ── P0.4 — inspect a generated site and its invariants ──────────
  function fmtObstacle(obs) {
    const afford = obs.affordances.map((a) => {
      const tag = a.skill || "—";
      if (a.blocked) return `~~${tag}~~(${a.reason})`;
      return `${tag}${a.loud ? "*" : ""}`;
    }).join("/");
    return `[${obs.label} T${obs.tier}]  ${afford}`;
  }

  function fmtPhysicalSlot(slotLabel, slot) {
    if (slot.physicalObstacles.length === 0) return `    ${slotLabel}   (clear)`;
    return `    ${slotLabel}   ` + slot.physicalObstacles.map(fmtObstacle).join("   +   ");
  }

  function dumpSite(site) {
    log(`${site.identity.district} — ${site.identity.owningFaction}`);
    log(`  value:${site.identity.value}  orientation:${site.identity.orientation}   →  security — physical:${site.security.physical}  astral:${site.security.astral}  matrix:${site.security.matrix}`);
    log(`  rooms: ${site.layout.rooms.map((r) => `${r.label}(${r.size})`).join(", ")}`);
    log("  entry points:");
    for (const entry of site.layout.entryPoints) {
      log(fmtPhysicalSlot(`${entry.type}@room${entry.roomId}`, entry));
    }
    log("  edges:");
    for (const edge of site.layout.edges) {
      log(fmtPhysicalSlot(`room${edge.from} <-> room${edge.to}`, edge));
    }
    log("  room posts (physical) + room astral state:");
    for (const room of site.layout.rooms) {
      room.postSlots.forEach((slot, i) => {
        log(fmtPhysicalSlot(`${room.label} post ${i + 1}/${room.postSlots.length}`, slot));
      });
      if (room.astralObstacles.length > 0) {
        log(`    ${room.label} [ASTRAL]   ` + room.astralObstacles.map(fmtObstacle).join("   +   "));
      }
    }
    if (site.layout.patrols.length > 0) {
      log("  physical patrols:");
      for (const patrol of site.layout.patrols) {
        log(fmtPhysicalSlot(`route ${patrol.roomIds.map((id) => "room" + id).join("->")}`, patrol));
      }
    }
    if (site.layout.spiritZones.length > 0) {
      log("  astral spirit zones:");
      for (const zone of site.layout.spiritZones) {
        const label = `zone {${zone.roomIds.map((id) => "room" + id).join(", ")}}`;
        if (zone.astralObstacles.length === 0) log(`    ${label}   (clear)`);
        else log(`    ${label}   ` + zone.astralObstacles.map(fmtObstacle).join("   +   "));
      }
    }
    log(`  population: ${site.population.guardSquadCount} squad(s) x ${site.population.guardsPerSquad}, ${site.population.dualNaturedGuards} dual-natured`);

    const paths = MJ.findPaths(site);
    log(`  distinct entry->objective paths: ${paths.length}  ${paths.map((p) => p.join("->")).join("  |  ")}`);

    const obstacles = MJ.allObstacles(site);
    const physCount = obstacles.filter((o) => o.projection === "physical").length;
    const astralCount = obstacles.filter((o) => o.projection === "astral").length;
    const bruteForceOk = obstacles.every(MJ.hasBruteForceOption);
    const waysOk = obstacles.every((o) => MJ.usableNonLoudWays(o) >= 2);
    const alternatePathOk = paths.length >= 2;
    log(`  total obstacles: ${obstacles.length}  (physical: ${physCount}, budget ${site.security.physical}/10 coverage)  (astral: ${astralCount}, budget ${site.security.astral}/10 coverage)`);
    log(`  invariants — brute force always available: ${bruteForceOk}   >=2 usable non-loud ways per obstacle: ${waysOk}   >=2 distinct paths: ${alternatePathOk}`);
    log("");
  }

  function testSite() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("");
    dumpSite(MJ.generateSite(rng));
  }

  // ── P1 — job board: a job is 1+ sequential missions, one client ─
  function fmtCrew(intendedCrew) {
    if (intendedCrew.fixed !== undefined) return `${intendedCrew.fixed} runner(s)`;
    return `${intendedCrew.min}-${intendedCrew.max} runners`;
  }

  function dumpMission(mission, i, total) {
    const verb = MJ.OBJECTIVE_VERBS[mission.objectiveVerb];
    log(`    mission ${i + 1}/${total}: ${verb.label} (${mission.payloadDomain})  —  ${MJ.JOB_FAMILIES[mission.family].label}  —  tier: ${mission.tier}`);
    log(`      target: ${mission.targetFaction}   crew: ${fmtCrew(mission.intendedCrew)}   pay contribution: ~${mission.payContribution}`);
    log(`      site: ${mission.site.identity.district} (${mission.site.identity.owningFaction})  value:${mission.site.identity.value} orientation:${mission.site.identity.orientation}`);
    log(`      fail state: ${verb.failState}`);
  }

  function dumpJob(entry, index) {
    const { job, siteResults } = entry;
    const reusedCount = siteResults.filter((s) => s.wasReused).length;
    log(`[${index}] hiring faction: ${job.hiringFaction}   pay: ~${job.pay}   expires day ${job.expiryDay}   (${job.missions.length} mission(s), ${reusedCount} reused)`);
    job.missions.forEach((m, i) => dumpMission(m, i, job.missions.length));
    log("");
  }

  function testBoard() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed + "   (board of 6, empty starting site pool)");
    log("");

    // A fresh operation starts with no persistent site pool — every
    // mission on day one has to introduce. A returning pool would
    // let some of these reuse instead.
    const sitePool = [];
    const currentDay = 1;
    const board = MJ.generateBoard(rng, sitePool, currentDay, 6);
    board.forEach((entry, i) => dumpJob(entry, i));

    const totalMissions = board.reduce((sum, e) => sum + e.job.missions.length, 0);
    const reusedMissions = board.reduce((sum, e) => sum + e.siteResults.filter((s) => s.wasReused).length, 0);
    log(`total missions across board: ${totalMissions}   reused: ${reusedMissions}   (expected 0 — pool was empty)`);
  }

  // ── P1 — task/skill resolution: one runner, one obstacle, one
  // affordance, resolve. Runs a handful of picks so both a trained
  // and an untrained attempt, and a blocked one, all show up.
  function fmtOutcome(outcome) {
    if (!outcome.ok) return `REJECTED — ${outcome.error}`;
    const diceStr = outcome.dice.length ? `[${outcome.dice.join(",")}]` : "(no dice — untrained)";
    const glitchTag = outcome.criticalGlitch ? "  CRITICAL GLITCH" : outcome.glitch ? "  glitch" : "";
    return `pool=${outcome.poolSize} dice=${diceStr} hits=${outcome.hits} threshold=${outcome.threshold} margin=${outcome.margin >= 0 ? "+" : ""}${outcome.margin}  →  ${outcome.success ? "SUCCESS" : "FAIL"}${glitchTag}`;
  }

  function testResolve() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("");

    const runner = MJ.generateRunner(rng);
    const site = MJ.generateSite(rng);
    log(`runner: ${runner.identity.handle} — ${MJ.describeDiscipline(runner)}  (${runner.classification.focusLabel})`);
    log(`site: ${site.identity.district} — value:${site.identity.value} orientation:${site.identity.orientation}`);
    log("");

    const obstacles = MJ.allObstacles(site);
    if (obstacles.length === 0) {
      log("(this site rolled zero obstacles — try another seed)");
      return;
    }

    // Try every affordance on a handful of obstacles, so a trained
    // hit, an untrained automatic-fail, and a blocked rejection all
    // have a real chance to show up in one pass.
    let shown = 0;
    for (const obstacle of obstacles) {
      if (shown >= 6) break;
      for (const affordance of obstacle.affordances) {
        if (!affordance.skill) continue; // skip the skill-less "route around" option
        if (shown >= 6) break;
        const outcome = MJ.resolveTask(rng, runner, obstacle, affordance.skill);
        log(`[${obstacle.label} T${obstacle.tier}] attempt "${affordance.skill}" (${affordance.verb}):`);
        log(`  ${fmtOutcome(outcome)}`);
        log("");
        shown++;
      }
    }
  }

  // ── P1 — roster/market state machine: watch, cycle, hire ────────
  function testMarketCycle() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("");

    const runner = MJ.generateRunner(rng);
    const value = MJ.trueValue(MJ.getEffectiveSkills(runner));
    log(`${runner.identity.handle} — ${MJ.describeDiscipline(runner)}  trueValue:${value}  KIA chance per Available window: ${(MJ.kiaChance(runner) * 100).toFixed(1)}%`);
    log("");

    MJ.watchRunner(runner, rng);
    log(`watched. state:${runner.market.state} phase:${runner.market.phase} shelfDays:${runner.market.hiddenShelfDaysRemaining}`);
    log("");

    let day = 1;
    let hired = false;
    for (; day <= 120 && runner.market.phase !== "kia"; day++) {
      const result = MJ.advanceMarketDay(runner, rng, day);
      if (result.event !== "none" && result.event !== "protected") {
        log(`day ${day}: ${result.event}   (phase:${runner.market.phase}  hired:${runner.market.hired ? runner.market.hired.tier : "no"})`);
      }
      // Once we see a real Available window, hire on a retainer to
      // demonstrate the cycle being suppressed.
      if (!hired && runner.market.phase === "available" && day > 5) {
        MJ.hireRunner(runner, rng, "retainer", day);
        hired = true;
        log(`day ${day}: HIRED (retainer)   protectedUntilDay:${runner.market.hired.protectedUntilDay}`);
      }
    }
    log("");
    log(`stopped at day ${day - 1}. final phase:${runner.market.phase}  hired:${runner.market.hired ? runner.market.hired.tier : "no"}`);
  }

  // ── P1 — the nuyen ledger: job pay, hiring costs, capacity ──────
  function testEconomy() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("");

    const save = MJ.defaultSave(seed);
    save.johnson.money = 20000;
    log(`starting money: ${save.johnson.money}   reputation: ${save.johnson.reputation}   boardCapacity: ${save.johnson.boardCapacity}`);
    log("");

    const runner = MJ.generateRunner(rng);
    log(`runner: ${runner.identity.handle} — ${MJ.describeDiscipline(runner)}   computePrice:${MJ.computePrice(runner)}`);
    log(`  freelance cost: ${MJ.hireCost(runner, "freelance")}`);
    log(`  retainer cost:  ${MJ.hireCost(runner, "retainer")}`);
    log(`  permanent cost: ${MJ.hireCost(runner, "permanent")}`);
    log("");

    const hireResult = MJ.hireRunnerWithCost(save, runner, rng, "retainer", 1);
    log(`hire (retainer): ${hireResult.ok ? "OK" : "FAILED"}   cost:${hireResult.cost}   money now: ${save.johnson.money}`);
    log("");

    const { job } = MJ.generateJob(rng, [], 1);
    log(`job: ${job.missions.length} mission(s) for ${job.hiringFaction}   total pay:${job.pay}`);
    const beforeMoney = save.johnson.money;
    const beforeRep = save.johnson.reputation;
    MJ.collectJobPay(save, job);
    log(`collected pay: ${beforeMoney} -> ${save.johnson.money}   reputation: ${beforeRep} -> ${save.johnson.reputation}`);
    log("");

    log("board capacity expansion, three steps:");
    for (let i = 0; i < 3; i++) {
      const cost = MJ.expandBoardCapacityCost(save);
      const result = MJ.expandBoardCapacity(save);
      log(`  capacity ${result.ok ? result.newCapacity - 1 : save.johnson.boardCapacity} -> ${result.ok ? result.newCapacity : "FAILED"}   cost:${cost}   money now: ${save.johnson.money}`);
    }
    log("");

    // Overspend check: try to hire something the operation can't afford.
    save.johnson.money = 100;
    const overspend = MJ.hireRunnerWithCost(save, runner, rng, "permanent", 1);
    log(`overspend guard: attempted permanent hire with only 100 nuyen  →  ${overspend.ok ? "SUCCEEDED (bug!)" : "correctly rejected"}   money unchanged: ${save.johnson.money}`);
  }

  // ── P1 — live security: Min/Current/Max triples + the Alert pool
  function fmtSecState(state) {
    const ax = MJ.SECURITY_AXES.map((axis) => {
      const a = state.axes[axis];
      return `${axis[0].toUpperCase()}:${a.min}/${a.current}/${a.max}`;
    }).join("  ");
    return `alert:${state.alert}/${state.alertMax}  ${ax}`;
  }

  function testAlert() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("");

    const site = MJ.generateSite(rng.fork("alert-site"));
    const state = MJ.initSecurityState(rng.fork("alert-init"), site);
    log(`site: ${site.identity.district} district (${site.identity.owningFaction})   value:${site.identity.value}  orientation:${site.identity.orientation}`);
    log(`triples are Min/Current/Max per axis; Current starts at rest (=Min)`);
    log(`  ${fmtSecState(state)}`);
    log("");

    // Phase A — sustained loud pressure: 12 days, 2 loud hits/day.
    log("PHASE A — hammer it: 2 loud hits/day for 12 days");
    for (let day = 1; day <= 12; day++) {
      const events = [];
      for (let h = 0; h < 2; h++) {
        const r = MJ.recordHit(state, { loud: true });
        if (r.ratcheted) events.push(r.maxGrew ? "RATCHET+MAX-GROWTH" : "RATCHET");
      }
      MJ.advanceSiteDay(state);
      log(`  day ${String(day).padStart(2)}: ${fmtSecState(state)}${events.length ? "   << " + events.join(", ") : ""}`);
    }
    log("");

    // Phase B — full quiet: Alert bleeds, Current cools to Min, Max holds.
    log("PHASE B — go quiet: 15 days, no hits");
    const maxesBefore = MJ.SECURITY_AXES.map((x) => state.axes[x].max).join(",");
    for (let day = 13; day <= 27; day++) {
      MJ.advanceSiteDay(state);
      log(`  day ${String(day).padStart(2)}: ${fmtSecState(state)}`);
    }
    const maxesAfter = MJ.SECURITY_AXES.map((x) => state.axes[x].max).join(",");
    log(`  maxes held through the cooldown: ${maxesBefore} -> ${maxesAfter}   ${maxesBefore === maxesAfter ? "OK" : "BUG: Max decreased"}`);
    log("");

    // Phase C — ghost runs: quiet no-glitch hits must never ratchet.
    log("PHASE C — 10 ghost runs (quiet, no glitch) on one day");
    const beforeGhost = fmtSecState(state);
    let ghostRatchets = 0;
    for (let h = 0; h < 10; h++) {
      if (MJ.recordHit(state, {}).ratcheted) ghostRatchets += 1;
    }
    log(`  before: ${beforeGhost}`);
    log(`  after:  ${fmtSecState(state)}   ratchets:${ghostRatchets} ${ghostRatchets === 0 ? "(OK — a ghost run stays a ghost run)" : "(BUG)"}`);
    log("");

    // Invariant sweep: many sites, many days of random activity.
    log("INVARIANT SWEEP — 300 sites x 60 days of random activity");
    log("  checks, every single step: min <= current <= max, 0 <= alert <= alertMax, max never decreases");
    const sweepRng = MJ.makeRNG(seed + "-alert-sweep");
    let failures = 0;
    let totalRatchets = 0;
    let totalMaxGrowths = 0;
    for (let s = 0; s < 300; s++) {
      const sw = MJ.generateSite(sweepRng.fork("site-" + s));
      const st = MJ.initSecurityState(sweepRng.fork("init-" + s), sw);
      const prevMax = {};
      for (const axis of MJ.SECURITY_AXES) prevMax[axis] = st.axes[axis].max;
      let prevAlertMax = st.alertMax;
      for (let day = 0; day < 60; day++) {
        const hits = sweepRng.int(0, 3);
        for (let h = 0; h < hits; h++) {
          const r = MJ.recordHit(st, { loud: sweepRng.chance(0.5), glitch: sweepRng.chance(0.2) });
          if (r.ratcheted) totalRatchets += 1;
          if (r.maxGrew) totalMaxGrowths += 1;
        }
        MJ.advanceSiteDay(st);
        if (st.alert < 0 || st.alert > st.alertMax || st.alertMax < prevAlertMax) failures += 1;
        prevAlertMax = st.alertMax;
        for (const axis of MJ.SECURITY_AXES) {
          const a = st.axes[axis];
          if (a.min > a.current || a.current > a.max || a.max < prevMax[axis] || a.min < 1) failures += 1;
          prevMax[axis] = a.max;
        }
      }
    }
    log(`  ratchet events: ${totalRatchets}   max-growth events: ${totalMaxGrowths}   invariant failures: ${failures} ${failures === 0 ? "(OK)" : "(BUG)"}`);
  }

  // ── P0.5/P0.6 — day clock + IndexedDB save, kept as real,
  // persistent state across button clicks (not a scripted one-shot
  // demo) — this is what "roll the day" and "save and reload" are
  // supposed to feel like once a real save exists.
  let currentSave = null;

  function updateDayStatus() {
    const el = document.getElementById("day-status");
    el.textContent = currentSave
      ? `Day ${currentSave.meta.currentDay}  —  rootSeed: ${currentSave.meta.rootSeed}  (schema v${currentSave.meta.schemaVersion})`
      : "No save loaded.";
  }

  async function newGame() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    currentSave = MJ.defaultSave(seed);
    await MJ.saveGame(currentSave);
    updateDayStatus();
    log(`New game started on seed "${seed}".`);
    log(`  schemaVersion: ${currentSave.meta.schemaVersion}  currentDay: ${currentSave.meta.currentDay}`);
    log("  (saved to IndexedDB immediately — every day-spend is an autosave point, §09)");
  }

  async function rollDay() {
    clear();
    if (!currentSave) {
      log("No save loaded — click New Game first.");
      return;
    }
    const before = currentSave.meta.currentDay;
    MJ.advanceDay(currentSave.meta, 1);
    await MJ.saveGame(currentSave);
    updateDayStatus();
    log(`Rolled one action period: day ${before} → day ${currentSave.meta.currentDay}.`);
    log("  (saved — reload the page and hit Reload Save to prove this actually persisted)");
  }

  async function reloadSave() {
    clear();
    const loaded = await MJ.loadGame();
    if (!loaded) {
      log("No save found in IndexedDB.");
      currentSave = null;
    } else {
      currentSave = loaded;
      log(`Loaded save from IndexedDB: day ${loaded.meta.currentDay}, rootSeed "${loaded.meta.rootSeed}".`);
      const rng = MJ.makeRNG(loaded.meta.rootSeed);
      const runner = MJ.generateRunner(rng);
      log(`  regenerated from rootSeed: ${runner.identity.handle} — ${MJ.describeDiscipline(runner)}`);
      log("  (matches whatever seed 'Generate Runner' produces for this same seed — nothing but seeds+deltas is ever stored)");
    }
    updateDayStatus();
  }

  window.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("btn-rng").addEventListener("click", testRNG);
    document.getElementById("btn-runner").addEventListener("click", testRunner);
    document.getElementById("btn-market").addEventListener("click", testMarket);
    document.getElementById("btn-growth").addEventListener("click", testGrowth);
    document.getElementById("btn-site").addEventListener("click", testSite);
    document.getElementById("btn-board").addEventListener("click", testBoard);
    document.getElementById("btn-resolve").addEventListener("click", testResolve);
    document.getElementById("btn-market-cycle").addEventListener("click", testMarketCycle);
    document.getElementById("btn-economy").addEventListener("click", testEconomy);
    document.getElementById("btn-alert").addEventListener("click", testAlert);
    document.getElementById("btn-new-game").addEventListener("click", newGame);
    document.getElementById("btn-roll-day").addEventListener("click", rollDay);
    document.getElementById("btn-reload-save").addEventListener("click", reloadSave);

    // Pick up an existing save on load, same as a real page refresh would.
    currentSave = await MJ.loadGame();
    updateDayStatus();

    log("Mr. Johnson — dev inspector ready.");
    log('Enter a seed and hit a button. Same seed always reproduces.');
    if (currentSave) log(`Existing save found: day ${currentSave.meta.currentDay}.`);
  });
})();
