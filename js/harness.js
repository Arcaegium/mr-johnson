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

  // ── P1 — job board: a job is 1+ missions in a window, one client ─
  function fmtCrew(intendedCrew) {
    if (intendedCrew.fixed !== undefined) return `${intendedCrew.fixed} runner(s)`;
    return `${intendedCrew.min}-${intendedCrew.max} runners`;
  }

  function dumpMission(mission, i, total, all) {
    const verb = MJ.OBJECTIVE_VERBS[mission.objectiveVerb];
    const reqIdx = mission.requiresMission && all ? all.indexOf(mission.requiresMission) : -1;
    log(`    mission ${i + 1}/${total}: ${verb.label} (${mission.payloadDomain})  —  ${MJ.JOB_FAMILIES[mission.family].label}  —  tier: ${mission.tier}${reqIdx >= 0 ? `   [GATED — requires mission ${reqIdx + 1}]` : ""}`);
    log(`      target: ${mission.targetFaction}   crew: ${fmtCrew(mission.intendedCrew)}   pay contribution: ~${mission.payContribution}`);
    log(`      site: ${mission.site.identity.district} (${mission.site.identity.owningFaction})  value:${mission.site.identity.value} orientation:${mission.site.identity.orientation}`);
    const view = MJ.siteIntelView(mission.site, 1);
    log(`      est. security — P:${view.physical.estimated}  A:${view.astral.estimated}  M:${view.matrix.estimated}   (60-70% of these are true; recon confirms)`);
    log(`      fail state: ${verb.failState}`);
  }

  function dumpJob(entry, index) {
    const { job, siteResults } = entry;
    const reusedCount = siteResults.filter((s) => s.wasReused).length;
    log(`[${index}] hiring faction: ${job.hiringFaction}   pay: ~${job.pay} (rush x${job.rushMultiplier.toFixed(2)} — ${job.daysPerMission}d/mission)   expires day ${job.expiryDay}   (${job.missions.length} mission(s), ${reusedCount} reused${job.chained ? ", CHAINED" : ""})`);
    job.missions.forEach((m, i) => dumpMission(m, i, job.missions.length, job.missions));
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
    log("");

    // The handed-to-player estimate: verify the BS rate is in spec.
    const statRng = MJ.makeRNG(seed + "-est-stats");
    let exact = 0;
    let total = 0;
    for (let i = 0; i < 300; i++) {
      const s = MJ.generateSite(statRng.fork("s" + i));
      MJ.generateSecurityEstimate(statRng.fork("e" + i), s);
      for (const axis of ["physical", "astral", "matrix"]) {
        total++;
        if (s.estimatedSecurity[axis] === s.securityState.axes[axis].current) exact++;
      }
    }
    log(`estimate accuracy across ${total} axis estimates: ${((100 * exact) / total).toFixed(1)}% exact   (spec: 60-70% — the rest is BS that teaches recon)`);

    // Rush premium: a shorter window must pay more for the same legs.
    const rushRng = MJ.makeRNG(seed + "-rush-stats");
    const buckets = {};
    for (let i = 0; i < 500; i++) {
      const { job } = MJ.generateJob(rushRng.fork("j" + i), [], 1);
      buckets[job.daysPerMission] = job.rushMultiplier;
    }
    log(`rush premium by window: ` + Object.keys(buckets).sort((a, b) => a - b).map((d) => `${d}d:x${buckets[d].toFixed(2)}`).join("  "));
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
    log(`watched. state:${runner.market.state} phase:${runner.market.phase} shelfDays:${runner.market.shelfDaysRemaining}`);
    log("");

    let day = 1;
    let hired = false;
    for (; day <= 120 && runner.market.phase !== "kia"; day++) {
      const result = MJ.advanceMarketDay(runner, rng);
      if (result.event !== "none" && result.event !== "protected") {
        log(`day ${day}: ${result.event}   (phase:${runner.market.phase}  hired:${runner.market.hired ? runner.market.hired.tier : "no"})`);
      }
      // Once we see a real Available window, hire on a retainer to
      // demonstrate the cycle being suppressed.
      if (!hired && runner.market.phase === "available" && day > 5) {
        MJ.hireRunner(runner, "retainer");
        hired = true;
        log(`day ${day}: HIRED (retainer)   missionsRemaining:${runner.market.hired.missionsRemaining}`);
      }
      // Burn the retainer down with a dispatch every few days —
      // contracts end by consumption, never by calendar. Quiet
      // stretches in between prove downtime costs nothing.
      if (runner.market.hired && day % 4 === 0) {
        const c = MJ.consumeContractMission(runner, rng);
        log(`day ${day}: dispatched -> ${c.event}${c.event === "consumed" ? "  remaining:" + c.missionsRemaining : ""}`);
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
    save.johnson.money = 30000;
    log(`starting money: ${save.johnson.money}   reputation: ${save.johnson.reputation}   boardCapacity: ${save.johnson.boardCapacity}`);
    log("");

    const runner = MJ.generateRunner(rng);
    log(`runner: ${runner.identity.handle} — ${MJ.describeDiscipline(runner)}   computePrice:${MJ.computePrice(runner)}`);
    log(`  freelance cost: ${MJ.hireCost(runner, "freelance")}`);
    log(`  retainer cost:  ${MJ.hireCost(runner, "retainer")}`);
    log(`  permanent cost: ${MJ.hireCost(runner, "permanent")}`);
    log("");

    const hireResult = MJ.hireRunnerWithCost(save, runner, "retainer");
    log(`hire (retainer): ${hireResult.ok ? "OK" : "FAILED — " + hireResult.error}   cost:${hireResult.cost}   money now: ${save.johnson.money}${hireResult.ok ? "   missionsRemaining:" + runner.market.hired.missionsRemaining : ""}`);
    log("");

    const { job } = MJ.generateJob(rng, [], 1);
    log(`job: ${job.missions.length} mission(s) for ${job.hiringFaction}   total pay:${job.pay}`);
    const beforeMoney = save.johnson.money;
    const beforeRep = save.johnson.reputation;
    MJ.collectJobPay(save, job);
    log(`collected pay: ${beforeMoney} -> ${save.johnson.money}   reputation: ${beforeRep} -> ${save.johnson.reputation}`);
    log("");

    // Top the ledger up so the expansion demo shows the cost curve
    // actually being climbed, not just the guard rejecting.
    save.johnson.money = 60000;
    log(`board capacity expansion, three steps (money topped up to ${save.johnson.money}):`);
    for (let i = 0; i < 3; i++) {
      const cost = MJ.expandBoardCapacityCost(save);
      const result = MJ.expandBoardCapacity(save);
      log(`  capacity ${result.ok ? result.newCapacity - 1 : save.johnson.boardCapacity} -> ${result.ok ? result.newCapacity : "FAILED"}   cost:${cost}   money now: ${save.johnson.money}`);
    }
    log("");

    // Overspend check: try to hire something the operation can't
    // afford. (The runner hired above is released first so this
    // tests the ledger guard, not the hireable guard below.)
    MJ.releaseRunner(runner, rng);
    save.johnson.money = 100;
    const overspend = MJ.hireRunnerWithCost(save, runner, "permanent");
    log(`overspend guard: attempted permanent hire with only 100 nuyen  →  ${overspend.ok ? "SUCCEEDED (bug!)" : "correctly rejected"}   money unchanged: ${save.johnson.money}`);

    // Hireable check: money can't buy a runner who isn't on the
    // market to be bought — under contract or KIA (QA fix: the
    // wrapper now enforces market.js's own isHireable rule).
    save.johnson.money = 999999;
    const dead = MJ.generateRunner(rng);
    MJ.watchRunner(dead, rng);
    dead.market.phase = "kia";
    const kiaHire = MJ.hireRunnerWithCost(save, dead, "freelance");
    log(`hireable guard: attempted to hire a KIA runner with plenty of nuyen  →  ${kiaHire.ok ? "SUCCEEDED (bug!)" : "correctly rejected"}   money unchanged: ${save.johnson.money}`);
  }

  // ── P1 — live security: the band, the read, and the response ────
  function fmtSecState(state, day) {
    const ax = MJ.SECURITY_AXES.map((axis) => {
      const a = state.axes[axis];
      const lvl = MJ.alertEngaged(state) ? "/alert " + MJ.alertLevel(state, axis) : "";
      return `${axis[0].toUpperCase()}:${a.min}/${a.current}/${a.max}${lvl}`;
    }).join("  ");
    return `read:${MJ.threatBand(state, day)}  ${ax}`;
  }

  function testAlert() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    log("SEED: " + seed);
    log("");

    const site = MJ.mintSite(seed + "-alert-u", 0, { value: 6, orientation: "physical" });
    const st = site.securityState;
    log(`site: ${site.identity.district} (${site.identity.owningFaction})  "${site.identity.name}"`);
    log(`the band is Min/Current/Max per axis; Current is "how much room for bullshit today"`);
    log(`  ${fmtSecState(st, 1)}`);
    log("");

    log("PHASE A — three awkward acts (a bad liar working the front desk)");
    for (let i = 1; i <= 3; i++) {
      const r = MJ.witnessAct(st, 1, MJ.THREAT.AWKWARD);
      log(`  awkward #${i}: read is now ${r.band}${r.tipped ? "  << RESPONSE ENGAGED" : ""}`);
    }
    log(`  nothing mechanical has happened yet — response engaged: ${MJ.alertEngaged(st)}`);
    log("");

    log("PHASE B — one more questionable act while already questionable");
    const tip = MJ.witnessAct(st, 1, MJ.THREAT.QUESTIONABLE);
    log(`  read: ${tip.band}${tip.tipped ? "  << RESPONSE ENGAGED" : ""}`);
    log(`  ${fmtSecState(st, 1)}`);
    log(`  each axis answers at its OWN Current — never below today's posture, never above what it can field`);
    log("");

    log("PHASE C — surviving what they send buys them the next wave");
    for (let beat = 1; beat <= 12; beat++) {
      MJ.addAlertPointsAll(st, 3);
      if (beat % 4 === 0) log(`  after ${beat} beats: ${fmtSecState(st, 1)}`);
    }
    log("");

    log("PHASE D — the incident settles: where the response ended IS the new posture");
    const before = MJ.SECURITY_AXES.map((a) => st.axes[a].current).join(",");
    const settled = MJ.settleIncident(st);
    log(`  Current ${before} -> ${MJ.SECURITY_AXES.map((a) => st.axes[a].current).join(",")}   ratcheted:${settled.ratcheted}  maxGrew:${settled.maxGrew}`);
    log("");

    log("PHASE E — trip them and withdraw at once: nothing should ratchet");
    const site2 = MJ.mintSite(seed + "-alert-u2", 1, { value: 6 });
    const st2 = site2.securityState;
    const pre = MJ.SECURITY_AXES.map((a) => st2.axes[a].current).join(",");
    MJ.witnessAct(st2, 1, MJ.THREAT.THREATENING);
    const s2 = MJ.settleIncident(st2);
    log(`  Current ${pre} -> ${MJ.SECURITY_AXES.map((a) => st2.axes[a].current).join(",")}   ratcheted:${s2.ratcheted} ${s2.ratcheted ? "(BUG)" : "(OK — Alert never rose above where it started)"}`);
    log("");

    log("PHASE F — quiet days cool Current back toward Min; the read resets nightly");
    for (let d = 0; d < 12; d++) {
      MJ.advanceSiteDay(st);
      if (d % 4 === 3) log(`  day +${d + 1}: ${fmtSecState(st, 100 + d)}`);
    }
    log("");

    log("INVARIANT SWEEP — 300 sites x 60 days of random activity");
    log("  every step: min <= current <= max, max never decreases, alert level within [current, max]");
    const sweepRng = MJ.makeRNG(seed + "-alert-sweep");
    let failures = 0, ratchets = 0, tips = 0;
    const CLASSES = [MJ.THREAT.AWKWARD, MJ.THREAT.QUESTIONABLE, MJ.THREAT.THREATENING];
    for (let s = 0; s < 300; s++) {
      const sw = MJ.mintSite(seed + "-sweep", s, {});
      const sst = sw.securityState;
      const prevMax = {};
      for (const axis of MJ.SECURITY_AXES) prevMax[axis] = sst.axes[axis].max;
      for (let day = 1; day <= 60; day++) {
        const acts = sweepRng.int(0, 3);
        for (let a = 0; a < acts; a++) {
          if (MJ.witnessAct(sst, day, sweepRng.pick(CLASSES)).tipped) tips++;
        }
        if (MJ.alertEngaged(sst)) {
          for (let b = 0; b < sweepRng.int(0, 4); b++) MJ.addAlertPointsAll(sst, 3);
          for (const axis of MJ.SECURITY_AXES) {
            const lvl = MJ.alertLevel(sst, axis);
            if (lvl < sst.axes[axis].current || lvl > sst.axes[axis].max) failures++;
          }
          if (MJ.settleIncident(sst).ratcheted) ratchets++;
        }
        MJ.advanceSiteDay(sst);
        for (const axis of MJ.SECURITY_AXES) {
          const ax = sst.axes[axis];
          if (ax.min > ax.current || ax.current > ax.max || ax.max < prevMax[axis] || ax.min < 1) failures++;
          prevMax[axis] = ax.max;
        }
      }
    }
    log(`  tips to threatening: ${tips}   ratchet events: ${ratchets}   invariant failures: ${failures} ${failures === 0 ? "(OK)" : "(BUG)"}`);
  }

  // ── P1 — the full loop: job -> recon -> strike -> pay -> growth ─
  function fmtMissionResult(r) {
    const head = `  ${r.kind}  ${r.success ? "SUCCESS" : "FAILED"}  crew:[${(r.crew || []).join(", ")}]  karma:+${r.karmaAward}${r.intelBonusApplied ? "  (intel bonus)" : ""}`;
    const lines = [head];
    for (const t of r.tasks || []) {
      if (!t.runner) lines.push(`      ${t.obstacle} T${t.tier}: ${t.result}`);
      else if (t.rejected) lines.push(`      ${t.obstacle} T${t.tier}: ${t.runner} tried ${t.skill} — ${t.rejected}`);
      else lines.push(`      ${t.obstacle} T${t.tier}: ${t.runner} ${t.skill}${t.loud ? " (LOUD)" : ""} ${t.hits}/${t.threshold} ${t.success ? "ok" : "MISS"}${t.criticalGlitch ? " CRITGLITCH+WOUND" : t.glitch ? " glitch" : ""}`);
      if (t.responders && t.responders.length) lines.push(`        RESPONSE: ${t.responders.join(", ")}`);
    }
    if (r.error) lines.push(`      (${r.error})`);
    if (r.patient) lines.push(`      patient: ${r.patient} — wounds now ${r.woundsNow}`);
    if (r.noise) lines.push(`      noise:${r.noise.noise}${r.noise.ratcheted ? "  << RATCHET" + (r.noise.maxGrew ? "+MAXGROW" : "") : ""}`);
    if (r.yield) lines.push(`      yield: ${r.yield.kind} x${r.yield.amount}`);
    for (const c of r.contractEvents || []) {
      if (c.event === "contractCompleted") lines.push(`      contract: ${c.runner} — block used up, back on the market`);
    }
    return lines.join("\n");
  }

  function testDispatch() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed);
    log("THE FULL LOOP — accept a job, recon it, run it, get paid; runners grow, the site remembers.");
    log("");

    const save = MJ.defaultSave(seed);
    save.johnson.money = 200000;

    const mage = MJ.generateRunner(rng.fork("crew-mage"), { family: "mage" });
    const decker = MJ.generateRunner(rng.fork("crew-decker"), { family: "decker" });
    const ghost = MJ.generateRunner(rng.fork("crew-ghost"), { family: "fighter", focusId: "stealth" });
    const crew = [mage, decker, ghost];

    // Contracts are the gate: an unhired runner can't be dispatched.
    const preHire = MJ.runActionPeriod(rng, [{ mission: MJ.createCraftingMission(), runners: [mage] }], 1);
    log(`dispatch before hiring: ${preHire[0].error ? "correctly rejected" : "SUCCEEDED (bug!)"}`);
    log("");

    for (const r of crew) {
      MJ.watchRunner(r, rng);
      const h = MJ.hireRunnerWithCost(save, r, "retainer");
      log(`hired ${r.identity.handle} (${MJ.describeDiscipline(r)} — ${r.classification.focusLabel}) on retainer   cost:${h.cost}  missions:${r.market.hired.missionsRemaining}`);
    }
    log(`money after hiring: ${save.johnson.money}`);
    log("");

    // Pick like a sane Johnson: a rookie crew has no business on a
    // stretch contract, so take a safe-band job (every leg value<=3)
    // off the pile. (First run of this demo proved the point the
    // hard way — 14 straight days failing a value-7 site while its
    // security ratcheted 7->9.)
    let job = null;
    let fallback = null;
    for (let i = 0; i < 300 && !job; i++) {
      const candidate = MJ.generateJob(rng.fork("job-" + i), [], 1, { missionCount: 2 }).job;
      if (!candidate.missions.every((m) => m.site.identity.value <= 3)) continue;
      if (!fallback) fallback = candidate;
      if (candidate.chained) job = candidate; // prefer a chain so the gate demo always shows
    }
    job = job || fallback;
    log(`JOB accepted (safe-band pick${job.chained ? ", CHAINED — legs only work in order" : ""}): ${job.missions.length} mission(s) for ${job.hiringFaction}   pay:${job.pay}   expires day ${job.expiryDay}`);
    job.missions.forEach((m, i) => {
      log(`  leg ${i + 1}: ${MJ.OBJECTIVE_VERBS[m.objectiveVerb].label} (${m.payloadDomain}) vs ${m.targetFaction} @ ${m.site.identity.district} (value:${m.site.identity.value} ${m.site.identity.orientation})`);
      const v = MJ.siteIntelView(m.site, 1);
      log(`         est. security — P:${v.physical.estimated}  A:${v.astral.estimated}  M:${v.matrix.estimated}   (word on the street — believe at your own risk)`);
    });
    log("");

    const karmaBefore = {};
    crew.forEach((r) => (karmaBefore[r.identity.handle] = r.karma));

    let day = 1;
    const site1 = job.missions[0].site;
    log(`— DAY ${day}: recon sweep, queued astral -> matrix -> physical (plus an illegal 4th dispatch reusing the mage) —`);
    const reconResults = MJ.runActionPeriod(rng, [
      { mission: MJ.createReconMission(site1, "astral"), runners: [mage] },
      { mission: MJ.createReconMission(site1, "matrix"), runners: [decker] },
      { mission: MJ.createReconMission(site1, "physical"), runners: [ghost] },
      { mission: MJ.createReconMission(site1, "astral"), runners: [mage] }, // one action per runner per period
    ], day);
    reconResults.forEach((r) => log(fmtMissionResult(r)));
    log(`  intel on file: [${Object.keys(site1.intel).join(", ")}]   alert now: ${site1.securityState ? site1.securityState.alert : 0}`);
    const pv = MJ.siteIntelView(site1, day);
    log(`  player view: ` + ["physical", "astral", "matrix"].map((a) =>
      `${a}: est ${pv[a].estimated}${pv[a].confirmed ? ` / CONFIRMED ${pv[a].confirmed.value} (day ${pv[a].confirmed.dayTaken}${pv[a].confirmed.fresh ? ", fresh" : ", stale"})` : ""}`
    ).join("   "));
    log("");

    for (day = 2; day <= 15 && !MJ.isJobComplete(job); day++) {
      const target = job.missions.find((m) => !m.resolved);
      for (const r of crew) {
        if (!r.market.hired && r.market.phase !== "kia") {
          const h = MJ.hireRunnerWithCost(save, r, "freelance");
          log(`  (re-armed ${r.identity.handle} freelance for ${h.cost})`);
        }
      }
      const queue = [];
      // On the first strike day of a chained job, try to skip ahead
      // to the gated leg first — the dispatch layer must refuse it,
      // costing nothing, before the legitimate leg runs.
      if (day === 2 && job.chained && job.missions[1].requiresMission) {
        log(`— DAY ${day}: trying gated leg 2 first (must be refused), then leg ${job.missions.indexOf(target) + 1} —`);
        queue.push({ mission: job.missions[1], runners: crew });
      } else {
        log(`— DAY ${day}: full crew vs leg ${job.missions.indexOf(target) + 1} @ ${target.site.identity.district} —`);
      }
      queue.push({ mission: target, runners: crew });
      MJ.runActionPeriod(rng, queue, day).forEach((r) => log(fmtMissionResult(r)));
    }
    log("");

    if (MJ.isJobComplete(job)) {
      const before = save.johnson.money;
      MJ.collectJobPay(save, job);
      log(`JOB COMPLETE — paid ${job.pay}: ${before} -> ${save.johnson.money}   reputation: ${save.johnson.reputation}`);
      const again = save.johnson.money;
      MJ.collectJobPay(save, job);
      log(`double-collection guard: ${save.johnson.money === again ? "OK — second collect pays nothing" : "BUG"}`);
    } else {
      log(`job NOT complete by day ${day - 1} — the dice were brutal this seed (a real outcome, not a bug)`);
    }
    log("");

    log(`— DAY ${day}: downtime economy — decker crafts at the hub, the other two harvest a discovered scrap site —`);
    const scrapSite = MJ.discoverResourceSite(rng.fork("scrap"), "scrap");
    for (const r of crew) {
      if (!r.market.hired && r.market.phase !== "kia") MJ.hireRunnerWithCost(save, r, "freelance");
    }
    MJ.runActionPeriod(rng, [
      { mission: MJ.createCraftingMission(4), runners: [decker] },
      { mission: MJ.createResourceMission(scrapSite), runners: [mage, ghost] },
    ], day).forEach((r) => log(fmtMissionResult(r)));
    log("");

    day++;
    if (!crew.some((r) => r.wounds > 0)) {
      ghost.wounds += 1;
      log(`(simulating a field wound on ${ghost.identity.handle} for the Medicae demo)`);
    }
    const patient = crew.find((r) => r.wounds > 0);
    const medic = crew.find((r) => r !== patient);
    for (const r of crew) {
      if (!r.market.hired && r.market.phase !== "kia") MJ.hireRunnerWithCost(save, r, "freelance");
    }
    log(`— DAY ${day}: Medicae — ${medic.identity.handle} treats ${patient.identity.handle} (the medic's mission; the patient is occupied but spends nothing) —`);
    MJ.runActionPeriod(rng, [
      { mission: MJ.createMedicalMission(patient), runners: [medic] },
    ], day).forEach((r) => log(fmtMissionResult(r)));
    log("");

    log("— AFTERMATH —");
    for (const r of crew) {
      log(`${r.identity.handle}: karma ${karmaBefore[r.identity.handle]} -> ${r.karma}   wounds:${r.wounds}   contract: ${r.market.hired ? r.market.hired.tier + " (" + r.market.hired.missionsRemaining + " left)" : "none"}`);
      log(`   skills now: ${fmtSkills(r.skills)}`);
    }
    if (site1.securityState) {
      log(`site after the campaign: ${fmtSecState(site1.securityState)}`);
    }
    log(`operation: money ${save.johnson.money}   reputation ${save.johnson.reputation}`);
  }

  // ── P1 — the site list: known sites, watching, compression ─────
  function fmtIntelAxis(v) {
    return v.confirmed
      ? `${v.confirmed.value} CONFIRMED d${v.confirmed.dayTaken}${v.confirmed.fresh ? "" : " (stale)"}`
      : `~${v.estimated}`;
  }

  function testSiteList() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const universe = seed + "-universe";
    const rng = MJ.makeRNG(seed + "-sitelist");
    log("SEED: " + seed + "   universe: " + universe);
    log("");

    // Three sites enter the player's world: two via jobs, one found
    // while looking for scrap.
    const list = [];
    const siteA = MJ.mintSite(universe, 0, { value: 2 });
    const siteB = MJ.mintSite(universe, 1, { value: 3, orientation: "matrix" });
    const siteC = MJ.mintSite(universe, 2, {});
    for (const [s, src] of [[siteA, "job"], [siteB, "job"], [siteC, "discovery"]]) {
      MJ.generateSecurityEstimate(rng.fork("est-" + s.identity.universeIndex), s);
      MJ.addKnownSite(list, s, 1, src);
    }
    MJ.watchSite(siteB);
    log("KNOWN SITES (day 1) — estimates only, nothing scouted yet:");
    for (const row of MJ.siteListView(list, 1)) {
      log(`  #${row.universeIndex} ${row.district} (${row.owningFaction})  v:${row.value} ${row.orientation}  ${row.watched ? "[WATCHED] " : ""}via ${row.source}  P:${fmtIntelAxis(row.security.physical)}  A:${fmtIntelAxis(row.security.astral)}  M:${fmtIntelAxis(row.security.matrix)}`);
    }
    log("");

    // Recon the watched site; the list view flips estimate -> confirmed.
    const scout = MJ.generateRunner(rng.fork("scout"), { family: "decker" });
    MJ.watchRunner(scout, rng);
    MJ.hireRunner(scout, "permanent");
    let reconOk = false;
    for (let day = 2; day <= 6 && !reconOk; day++) {
      const r = MJ.runActionPeriod(rng, [{ mission: MJ.createReconMission(siteB, "matrix"), runners: [scout] }], day)[0];
      if (r.success) {
        reconOk = true;
        log(`day ${day}: matrix recon of watched site #1 SUCCEEDS`);
        const row = MJ.siteListView(list, day).find((x) => x.universeIndex === 1);
        log(`  list now shows:  M:${fmtIntelAxis(row.security.matrix)}   (P/A still estimates: P:${fmtIntelAxis(row.security.physical)} A:${fmtIntelAxis(row.security.astral)})`);
        const laterRow = MJ.siteListView(list, day + 9).find((x) => x.universeIndex === 1);
        log(`  nine days later, unrefreshed:  M:${fmtIntelAxis(laterRow.security.matrix)}`);
      }
    }
    if (!reconOk) log("(recon kept failing this seed — estimates stay estimates until it lands)");
    log("");

    // The watch feed: boards keep rolling; when a contract touches a
    // watched site, it surfaces.
    let feedHit = null;
    let boardsRolled = 0;
    for (let i = 0; i < 40 && !feedHit; i++) {
      boardsRolled++;
      const board = MJ.generateBoard(rng.fork("board-" + i), list, 10, 4);
      const hits = MJ.jobsAtWatchedSites(board.map((e) => e.job), list);
      if (hits.length > 0) feedHit = hits[0];
    }
    if (feedHit) {
      log(`WATCH FEED (after ${boardsRolled} board refreshes): contract touching watched site #${feedHit.site.identity.universeIndex}!`);
      log(`  ${feedHit.job.hiringFaction} wants ${MJ.OBJECTIVE_VERBS[feedHit.mission.objectiveVerb].label} (${feedHit.mission.payloadDomain}) there — leg ${feedHit.legIndex + 1} of ${feedHit.job.missions.length}, pay ~${feedHit.job.pay}`);
    } else {
      log(`WATCH FEED: no contract touched the watched site in ${boardsRolled} refreshes (reuse dice — rerun)`);
    }
    log("");

    // Compression: the runner asymmetry, applied to sites.
    log("COMPRESSION (§09 — the save grows with attachment, not time):");
    const rec = MJ.compressSite(siteC);
    log(`  site #2 (discovered, untouched): compressible -> ${rec !== null ? "YES" : "NO (bug!)"}   record: ${JSON.stringify(rec)}`);
    const revived = JSON.stringify(MJ.reviveSite(universe, rec));
    const original = JSON.parse(JSON.stringify(siteC));
    if (original.securityState) original.securityState.quietDays = 0; // transient pacing, normalized on revival
    log(`  revive round-trip byte-identical: ${revived === JSON.stringify(original) ? "YES" : "NO (bug!)"}`);
    log(`  site #1 (watched + intel): compressible -> ${MJ.isSiteCompressible(siteB) ? "YES (bug!)" : "NO — attachment persists"}`);
    const crew2 = MJ.generateRunner(rng.fork("hitter"), { family: "fighter" });
    MJ.watchRunner(crew2, rng);
    MJ.hireRunner(crew2, "permanent");
    MJ.runActionPeriod(rng, [{ mission: MJ.createResourceMission(siteA), runners: [crew2] }], 8);
    log(`  site #0 after taking a hit (alert ${siteA.securityState.alert}): compressible -> ${MJ.isSiteCompressible(siteA) ? "YES (bug!)" : "NO — hot sites don't compress"}`);
    let coolDays = 0;
    while (siteA.securityState.alert > 0 && coolDays++ < 20) MJ.advanceSiteDay(siteA.securityState);
    log(`  after ${coolDays} quiet day(s) (alert ${siteA.securityState.alert}): compressible -> ${MJ.isSiteCompressible(siteA) ? "YES — cooled sites compress again" : "NO (still escalated — Current above Min sticks around longer)"}`);
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
    document.getElementById("btn-dispatch").addEventListener("click", testDispatch);
    document.getElementById("btn-sitelist").addEventListener("click", testSiteList);
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
