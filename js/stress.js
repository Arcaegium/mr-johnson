/* ============================================================
   Mr. Johnson — stress.js
   Mechanical stress harness. Not part of the game, and not a
   balance tool: this hunts PLUMBING bugs — data that doesn't
   cross a system boundary, state that mutates when an operation
   was refused, parallel pieces communicating at the wrong time.
   Organized by failure class, not by module, because the bugs it
   exists for live BETWEEN modules.

   Classes:
     1. Determinism — same seed + same actions = identical world,
        byte for byte. (The seed fixes the WORLD, never the story:
        any different action diverges everything after it.)
     2. Upstream->downstream integrity — noise really lands on
        Alert; karma ledgers reconcile exactly; recon really
        writes intel; job pay really equals its formula.
     3. Timing / same-day communication — queue order effects are
        real (a ratchet mid-period raises a later mission's karma);
        a chain gate opens same-day once its prerequisite resolves
        (confirmed design: speed is a reward); the acted-set holds.
     4. Refusal purity — a refused operation leaves ZERO
        fingerprints: snapshot before === snapshot after.
     5. State-machine legality — KIA is truly terminal (no
        resurrection by any path); contracts never go negative;
        permanent never completes.
     6. Aliasing safety — shared site objects share ratchets on
        purpose but estimates are first-write-wins; templates stay
        pristine; securityState is never silently re-initialized.
     7. The soak — randomized multi-seed campaigns, the full
        invariant battery asserted after EVERY day, illegal
        dispatches injected throughout. Failures report seed+day
        so they replay exactly.

   Zero tolerance: the suite ends in one verdict line. Every
   future system has to keep it green.
   ============================================================ */
(function () {
  const out = () => document.getElementById("out");
  const log = (line) => { out().textContent += line + "\n"; };
  const clear = () => { out().textContent = ""; };

  let failures = [];
  let assertions = 0;

  function check(cond, label) {
    assertions += 1;
    if (!cond) failures.push(label);
    return cond;
  }

  const snap = (o) => JSON.stringify(o);
  const AXES = ["physical", "astral", "matrix"];

  // Roster helper: unique handles so ledger bookkeeping can key on
  // them without collision.
  function makeRoster(rng, count, families) {
    const roster = [];
    const seen = new Set();
    let i = 0;
    while (roster.length < count && i < count * 30) {
      const r = MJ.generateRunner(rng.fork("roster-" + i), families ? { family: families[roster.length % families.length] } : {});
      i += 1;
      if (seen.has(r.identity.handle)) continue;
      seen.add(r.identity.handle);
      roster.push(r);
    }
    return roster;
  }

  // ── Class 1: determinism ────────────────────────────────────────
  function scriptedCampaign(seed) {
    const rng = MJ.makeRNG(seed);
    const save = MJ.defaultSave(seed);
    save.johnson.money = 500000;
    const crew = makeRoster(rng, 3, ["mage", "decker", "fighter"]);
    for (const r of crew) {
      MJ.watchRunner(r, rng);
      MJ.hireRunnerWithCost(save, r, "retainer");
    }
    const sitePool = [];
    const jobs = [];
    for (let i = 0; i < 3; i++) {
      jobs.push(MJ.generateJob(rng.fork("job" + i), sitePool, 1).job);
      for (const m of jobs[i].missions) if (!sitePool.includes(m.site)) sitePool.push(m.site);
    }
    for (let day = 1; day <= 30; day++) {
      for (const r of crew) {
        if (!r.market.hired && MJ.isHireable(r)) MJ.hireRunnerWithCost(save, r, "freelance");
      }
      const queue = [];
      const wounded = crew.find((r) => r.wounds > 0 && MJ.isDispatchable(r));
      if (day % 5 === 1) {
        queue.push({ mission: MJ.createReconMission(sitePool[(day * 7) % sitePool.length], MJ.RECON_LENSES[day % 3]), runners: [crew[day % 3]] });
        queue.push({ mission: MJ.createCraftingMission(1 + (day % 5)), runners: [crew[(day + 1) % 3]] });
      } else if (wounded && day % 5 === 2) {
        const medic = crew.find((r) => r !== wounded && MJ.isDispatchable(r));
        if (medic) queue.push({ mission: MJ.createMedicalMission(wounded), runners: [medic] });
      } else {
        const job = jobs.find((j) => !MJ.isJobComplete(j));
        if (job) {
          const target = job.missions.find((m) => !m.resolved && (!m.requiresMission || m.requiresMission.resolved));
          if (target) queue.push({ mission: target, runners: crew.filter(MJ.isDispatchable) });
        }
      }
      MJ.runActionPeriod(rng, queue, day);
      for (const j of jobs) if (MJ.isJobComplete(j)) MJ.collectJobPay(save, j);
      for (const s of sitePool) if (s.securityState) MJ.advanceSiteDay(s.securityState);
      for (const r of crew) MJ.advanceMarketDay(r, rng);
    }
    return snap({
      save: save,
      crew: crew,
      jobs: jobs.map((j) => ({ paid: !!j.paid, pay: j.pay, resolved: j.missions.map((m) => m.resolved) })),
      sites: sitePool.map((s) => ({ sec: s.securityState || null, est: s.estimatedSecurity || null, intel: s.intel })),
    });
  }

  function class1_determinism() {
    const a = scriptedCampaign("stress-det");
    const b = scriptedCampaign("stress-det");
    check(a === b, "C1: same seed + same actions must produce byte-identical final state");
    const c = scriptedCampaign("stress-det-other");
    check(a !== c, "C1: a different seed should diverge (sanity check on the comparison itself)");
  }

  // ── Class 2: upstream -> downstream integrity ───────────────────
  function class2_dataIntegrity() {
    // Noise -> Alert: the site's pool must move by exactly what the
    // mission result reported, every time.
    const rngN = MJ.makeRNG("stress-noise");
    let noiseChecked = 0;
    for (let i = 0; i < 60; i++) {
      const site = MJ.generateSite(rngN.fork("s" + i));
      MJ.generateSecurityEstimate(rngN.fork("e" + i), site);
      const r = makeRoster(rngN.fork("rr" + i), 1)[0];
      MJ.watchRunner(r, rngN);
      MJ.hireRunner(r, "permanent");
      const before = site.securityState.alert;
      const cap = site.securityState.alertMax;
      const res = MJ.runActionPeriod(rngN, [{ mission: MJ.createResourceMission(site), runners: [r] }], 1)[0];
      if (res.error) continue;
      noiseChecked += 1;
      check(site.securityState.alert === Math.min(cap, before + res.noise.noise), "C2: noise->alert mismatch (site " + i + ")");
    }
    check(noiseChecked > 30, "C2: noise probe barely ran (" + noiseChecked + ")");

    // Recon -> intel: stamped today, own axis only, estimates untouched.
    let intelProved = false;
    for (let i = 0; i < 100 && !intelProved; i++) {
      const rng = MJ.makeRNG("stress-intel-" + i);
      const site = MJ.generateSite(rng.fork("s"), { value: 3 });
      MJ.generateSecurityEstimate(rng.fork("e"), site);
      const estBefore = snap(site.estimatedSecurity);
      const r = makeRoster(rng.fork("r"), 1, ["mage"])[0];
      MJ.watchRunner(r, rng);
      MJ.hireRunner(r, "permanent");
      const res = MJ.runActionPeriod(rng, [{ mission: MJ.createReconMission(site, "astral"), runners: [r] }], 7)[0];
      if (!res.success) continue;
      intelProved = true;
      check(site.intel.astral && site.intel.astral.dayTaken === 7, "C2: intel must be stamped with the recon day");
      const view = MJ.siteIntelView(site, 8);
      check(view.astral.confirmed && view.astral.confirmed.fresh === true, "C2: fresh confirmation missing");
      check(view.physical.confirmed === null && view.matrix.confirmed === null, "C2: a lens must confirm only its own axis");
      check(snap(site.estimatedSecurity) === estBefore, "C2: recon must never mutate the handed estimate");
      check(MJ.siteIntelView(site, 13).astral.confirmed.fresh === false, "C2: staleness horizon not enforced");
    }
    check(intelProved, "C2: no successful recon in 100 attempts (suspicious)");

    // Bonus dice: applies on top of trained pools, never rescues untrained.
    const rngB = MJ.makeRNG("stress-bonus");
    const rb = makeRoster(rngB, 1, ["fighter"])[0];
    const eff = MJ.getEffectiveSkills(rb);
    const trained = Object.keys(eff).find((k) => eff[k] > 0);
    const untrained = Object.keys(eff).find((k) => eff[k] === 0);
    const obT = { tier: 2, affordances: [{ skill: trained, verb: "x", loud: false }] };
    const obU = { tier: 2, affordances: [{ skill: untrained, verb: "x", loud: false }] };
    check(MJ.resolveTask(rngB, rb, obT, trained, { bonusDice: 2 }).poolSize === eff[trained] + 2, "C2: bonus dice must add to a trained pool");
    check(MJ.resolveTask(rngB, rb, obU, untrained, { bonusDice: 2 }).poolSize === 0, "C2: bonus dice must never rescue untrained");

    // Job pay formula + chain wiring, in bulk.
    const rngJ = MJ.makeRNG("stress-pay");
    for (let i = 0; i < 1000; i++) {
      const { job } = MJ.generateJob(rngJ.fork("j" + i), [], 1);
      const sum = job.missions.reduce((t, m) => t + m.payContribution, 0);
      check(job.pay === Math.round(sum * job.rushMultiplier), "C2: pay formula broken (job " + i + ")");
      if (job.chained) {
        for (let k = 1; k < job.missions.length; k++) {
          check(job.missions[k].requiresMission === job.missions[k - 1], "C2: chain wiring broken (job " + i + ")");
        }
      } else {
        check(job.missions.every((m) => !m.requiresMission), "C2: unchained job carries a gate (job " + i + ")");
      }
    }

    // collectJobPay: exact delta, exactly once, reputation rides along.
    const save = MJ.defaultSave("stress-collect");
    const { job } = MJ.generateJob(MJ.makeRNG("stress-collect"), [], 1);
    for (const m of job.missions) m.resolved = true; // fabricated completion, probe only
    MJ.collectJobPay(save, job);
    check(save.johnson.money === job.pay && save.johnson.reputation === 1, "C2: collectJobPay wrong delta");
    MJ.collectJobPay(save, job);
    check(save.johnson.money === job.pay && save.johnson.reputation === 1, "C2: double collection must be inert");
  }

  // ── Class 3: timing / same-day communication ────────────────────
  function class3_timing() {
    // A ratchet fired by an earlier mission in the queue must raise a
    // later mission's karma (start-of-mission Current snapshot).
    let proved = false;
    for (let i = 0; i < 200 && !proved; i++) {
      const build = () => {
        const rng = MJ.makeRNG("stress-queue-" + i);
        const site = MJ.generateSite(rng.fork("s"), { value: 2, orientation: "physical" });
        MJ.generateSecurityEstimate(rng.fork("e"), site);
        const good = makeRoster(rng.fork("g"), 1, ["fighter"])[0];
        MJ.growRunner(good, 300, rng.fork("gr"));
        MJ.watchRunner(good, rng);
        MJ.hireRunner(good, "permanent");
        const bad = makeRoster(rng.fork("b"), 1, ["mage"])[0];
        for (const k of Object.keys(bad.skills)) bad.skills[k] = 0; // guaranteed stall
        MJ.watchRunner(bad, rng);
        MJ.hireRunner(bad, "permanent");
        return { rng, site, good, bad };
      };
      const A = build();
      const B = build();
      B.site.securityState.alert = 3;      // pre-loaded pressure so B's
      B.site.securityState.sustainedHits = 2; // first noisy hit ratchets
      const run = (X) => MJ.runActionPeriod(X.rng, [
        { mission: MJ.createResourceMission(X.site), runners: [X.bad] },
        { mission: MJ.createResourceMission(X.site), runners: [X.good] },
      ], 1);
      const ra = run(A);
      const rb = run(B);
      if (!(rb[0].noise && rb[0].noise.ratcheted)) continue;
      if (!(ra[1].success && rb[1].success)) continue;
      check(rb[1].karmaAward >= ra[1].karmaAward, "C3: added same-day pressure must never lower a later mission's karma");
      if (rb[1].karmaAward > ra[1].karmaAward) proved = true;
    }
    check(proved, "C3: never observed a same-day ratchet raising a later mission's karma (visibility broken?)");

    // Same-day gate opening (confirmed design): prerequisite resolved
    // earlier in the period opens the gated leg immediately — with a
    // second crew, since each runner still only acts once.
    let gateProved = false;
    for (let i = 0; i < 200 && !gateProved; i++) {
      const rng = MJ.makeRNG("stress-gate-" + i);
      const { job } = MJ.generateJob(rng.fork("j"), [], 1, { missionCount: 2 });
      if (!job.chained || !job.missions.every((m) => m.site.identity.value <= 2)) continue;
      const crewA = makeRoster(rng.fork("ca"), 2, ["fighter", "decker"]);
      const crewB = makeRoster(rng.fork("cb"), 2, ["fighter", "mage"]);
      for (const r of [...crewA, ...crewB]) {
        MJ.growRunner(r, 400, rng.fork("gr" + r.identity.handle));
        MJ.watchRunner(r, rng);
        MJ.hireRunner(r, "permanent");
      }
      const refused = MJ.runActionPeriod(rng.fork("ctrl"), [{ mission: job.missions[1], runners: crewA }], 1)[0];
      check(refused.error && refused.error.indexOf("gated") === 0, "C3: gate must refuse before the prerequisite");
      const res = MJ.runActionPeriod(rng.fork("run"), [
        { mission: job.missions[0], runners: crewA },
        { mission: job.missions[1], runners: crewB },
      ], 2);
      if (!res[0].success) continue;
      check(!res[1].error, "C3: gate must open same-day once the prerequisite resolved earlier in the period");
      gateProved = true;
    }
    check(gateProved, "C3: same-day gate probe never met its conditions");

    // Acted-set: one action per runner per period, across roles.
    const rngA = MJ.makeRNG("stress-acted");
    const pair = makeRoster(rngA, 2, ["decker", "fighter"]);
    for (const r of pair) { MJ.watchRunner(r, rngA); MJ.hireRunner(r, "retainer"); }
    const remBefore = pair[0].market.hired.missionsRemaining;
    const twice = MJ.runActionPeriod(rngA, [
      { mission: MJ.createCraftingMission(2), runners: [pair[0]] },
      { mission: MJ.createCraftingMission(2), runners: [pair[0]] },
    ], 1);
    check(!!twice[1].error, "C3: second dispatch of the same runner in one period must be refused");
    check(pair[0].market.hired.missionsRemaining === remBefore - 1, "C3: refused double-dispatch must consume exactly one contract mission");
    pair[1].wounds = 1;
    const busy = MJ.runActionPeriod(rngA, [
      { mission: MJ.createCraftingMission(2), runners: [pair[1]] },
      { mission: MJ.createMedicalMission(pair[1]), runners: [pair[0]] },
    ], 2);
    check(!!busy[1].error, "C3: a runner who already acted cannot also be a patient");
    // The medic never legitimately acted on day 2 (the craft was the
    // patient's; the treatment was refused before consumption), so
    // their contract still shows only day 1's craft.
    check(pair[0].market.hired.missionsRemaining === remBefore - 1, "C3: medic's contract must be untouched by the refused treatment");
  }

  // ── Class 4: refusal purity — refused means untouched ───────────
  function class4_refusalPurity() {
    function pure(label, entities, attempt, isRefused) {
      const before = snap(entities);
      const result = attempt();
      check(isRefused(result), "C4: " + label + " — expected a refusal");
      check(snap(entities) === before, "C4: " + label + " — refusal left fingerprints on state");
    }

    // Gated leg.
    {
      const rng = MJ.makeRNG("stress-p1");
      let job = null;
      for (let i = 0; i < 100 && !job; i++) {
        const cand = MJ.generateJob(rng.fork("j" + i), [], 1, { missionCount: 2 }).job;
        if (cand.chained) job = cand;
      }
      const crew = makeRoster(rng.fork("c"), 2);
      for (const r of crew) { MJ.watchRunner(r, rng); MJ.hireRunner(r, "permanent"); }
      pure("gated dispatch", { job: { paid: !!job.paid, missions: job.missions.map((m) => ({ resolved: m.resolved, karmaAward: m.karmaAward })) }, crew: crew, sites: job.missions.map((m) => m.site.securityState) },
        () => MJ.runActionPeriod(rng, [{ mission: job.missions[1], runners: crew }], 1)[0],
        (r) => !!r.error);
    }

    // Uncontracted dispatch.
    {
      const rng = MJ.makeRNG("stress-p2");
      const r = makeRoster(rng, 1)[0]; // unwatched, unhired
      pure("uncontracted dispatch", { r: r },
        () => MJ.runActionPeriod(rng, [{ mission: MJ.createCraftingMission(2), runners: [r] }], 1)[0],
        (res) => !!res.error);
    }

    // Medical: no wounds / self-treatment.
    {
      const rng = MJ.makeRNG("stress-p3");
      const pair = makeRoster(rng, 2, ["mage", "fighter"]);
      for (const r of pair) { MJ.watchRunner(r, rng); MJ.hireRunner(r, "permanent"); }
      pure("treating the unwounded", { pair: pair },
        () => MJ.runActionPeriod(rng, [{ mission: MJ.createMedicalMission(pair[1]), runners: [pair[0]] }], 1)[0],
        (res) => !!res.error);
      pair[0].wounds = 1;
      pure("self-treatment", { pair: pair },
        () => MJ.runActionPeriod(rng, [{ mission: MJ.createMedicalMission(pair[0]), runners: [pair[0]] }], 2)[0],
        (res) => !!res.error);
    }

    // Economy: hiring a KIA runner, and overspending.
    {
      const rng = MJ.makeRNG("stress-p4");
      const save = MJ.defaultSave("stress-p4");
      save.johnson.money = 999999;
      const dead = makeRoster(rng, 1)[0];
      MJ.watchRunner(dead, rng);
      dead.market.phase = "kia";
      pure("hiring the dead", { save: save, dead: dead },
        () => MJ.hireRunnerWithCost(save, dead, "freelance"),
        (res) => res.ok === false);
      const broke = MJ.defaultSave("stress-p4b");
      broke.johnson.money = 10;
      const alive = makeRoster(rng.fork("x"), 1)[0];
      MJ.watchRunner(alive, rng);
      pure("overspending", { save: broke, alive: alive },
        () => MJ.hireRunnerWithCost(broke, alive, "permanent"),
        (res) => res.ok === false);
    }

    // consumeContractMission on the uncontracted.
    {
      const rng = MJ.makeRNG("stress-p5");
      const r = makeRoster(rng, 1)[0];
      pure("consuming a nonexistent contract", { r: r },
        () => MJ.consumeContractMission(r, rng),
        (res) => res.event === "notUnderContract");
    }
  }

  // ── Class 5: state-machine legality ─────────────────────────────
  function class5_stateMachines() {
    const rng = MJ.makeRNG("stress-sm");

    // KIA is terminal: no path revives.
    const dead = makeRoster(rng, 1)[0];
    MJ.watchRunner(dead, rng);
    dead.market.phase = "kia";
    MJ.watchRunner(dead, rng);
    check(dead.market.phase === "kia", "C5: watchRunner resurrected a KIA runner");
    MJ.releaseRunner(dead, rng);
    check(dead.market.phase === "kia", "C5: releaseRunner resurrected a KIA runner");
    MJ.advanceMarketDay(dead, rng);
    check(dead.market.phase === "kia", "C5: the daily tick moved a KIA runner");
    check(MJ.isHireable(dead) === false && MJ.isDispatchable(dead) === false, "C5: a KIA runner is hireable or dispatchable");

    // Permanent contracts never complete; counters never go negative.
    const perm = makeRoster(rng.fork("perm"), 1)[0];
    MJ.watchRunner(perm, rng);
    MJ.hireRunner(perm, "permanent");
    for (let i = 0; i < 30; i++) MJ.consumeContractMission(perm, rng);
    check(!!perm.market.hired && perm.market.hired.tier === "permanent", "C5: a permanent contract completed");
    const free = makeRoster(rng.fork("free"), 1)[0];
    MJ.watchRunner(free, rng);
    MJ.hireRunner(free, "freelance");
    MJ.consumeContractMission(free, rng);
    check(free.market.hired === null && free.market.phase === "available", "C5: freelance must complete after exactly one dispatch");
    const after = MJ.consumeContractMission(free, rng);
    check(after.event === "notUnderContract", "C5: consuming after completion must be inert");
  }

  // ── Class 6: aliasing safety ────────────────────────────────────
  function class6_aliasing() {
    // Templates must stay pristine through heavy generation.
    const templatesBefore = snap(MJ.OBSTACLE_TEMPLATES);
    const rng = MJ.makeRNG("stress-alias");
    for (let i = 0; i < 1500; i++) {
      const s = MJ.generateSite(rng.fork("s" + i));
      MJ.generateSecurityEstimate(rng.fork("e" + i), s);
    }
    check(snap(MJ.OBSTACLE_TEMPLATES) === templatesBefore, "C6: obstacle templates were mutated by instance generation");

    // Estimates are first-write-wins across job reuse.
    let reuseProved = false;
    for (let i = 0; i < 300 && !reuseProved; i++) {
      const r2 = MJ.makeRNG("stress-alias2-" + i);
      const site = MJ.generateSite(r2.fork("s"));
      MJ.generateSecurityEstimate(r2.fork("e"), site);
      const est = snap(site.estimatedSecurity);
      const { job } = MJ.generateJob(r2.fork("j"), [site], 1);
      if (!job.missions.some((m) => m.site === site)) continue;
      reuseProved = true;
      check(snap(site.estimatedSecurity) === est, "C6: reuse re-rolled a site's handed estimate");
    }
    check(reuseProved, "C6: reuse probe never reused (300 tries — suspicious)");

    // securityState is never silently re-initialized.
    const r3 = MJ.makeRNG("stress-alias3");
    const site3 = MJ.generateSite(r3.fork("s"));
    MJ.generateSecurityEstimate(r3.fork("e"), site3);
    const stateRef = site3.securityState;
    stateRef.alert = 4;
    stateRef.axes.physical.max += 2;
    stateRef.axes.physical.current = stateRef.axes.physical.max;
    const runner3 = makeRoster(r3.fork("r"), 1)[0];
    MJ.watchRunner(runner3, r3);
    MJ.hireRunner(runner3, "permanent");
    MJ.runActionPeriod(r3, [{ mission: MJ.createResourceMission(site3), runners: [runner3] }], 1);
    MJ.generateSecurityEstimate(r3.fork("e2-should-not-matter"), site3); // direct call — must not re-init either
    check(site3.securityState === stateRef, "C6: securityState object identity changed (re-initialized)");
    check(site3.securityState.axes.physical.max === stateRef.axes.physical.max, "C6: accumulated Max was wiped");
  }

  // ── Class 7: the soak ───────────────────────────────────────────
  function class7_soak() {
    const LEGAL_PHASES = [null, "available", "working", "outOfTown", "kia"];
    let daysRun = 0;
    for (let s = 0; s < 6; s++) {
      const seedName = "soak-" + s;
      const rng = MJ.makeRNG(seedName);
      const save = MJ.defaultSave(seedName);
      save.johnson.money = 300000;
      const roster = makeRoster(rng, 5);
      const tierFor = (i) => (i === 0 ? "permanent" : i % 2 ? "retainer" : "freelance");
      roster.forEach((r, i) => {
        MJ.watchRunner(r, rng);
        MJ.hireRunnerWithCost(save, r, tierFor(i));
      });
      const byHandle = new Map(roster.map((r) => [r.identity.handle, r]));
      const expectedKarma = new Map(roster.map((r) => [r, 0]));
      const prevSkills = new Map(roster.map((r) => [r, Object.assign({}, r.skills)]));
      const kiaLatch = new Set();
      const jobs = [];
      const sites = [];
      const prevMax = new Map();
      const estSnap = new Map();
      let completedJobs = 0;

      const fail = (day, label) => check(false, "C7[" + seedName + " day " + day + "]: " + label);
      const ok = (cond, day, label) => { assertions += 1; if (!cond) failures.push("C7[" + seedName + " day " + day + "]: " + label); };

      for (let day = 1; day <= 60; day++) {
        daysRun += 1;
        if (save.johnson.money < 50000) save.johnson.money += 200000; // mechanical top-up; economics is not on trial here
        for (const r of roster) {
          if (!r.market.hired && MJ.isHireable(r)) MJ.hireRunnerWithCost(save, r, rng.chance(0.3) ? "retainer" : "freelance");
        }
        if (jobs.filter((j) => !MJ.isJobComplete(j)).length < 2 && rng.chance(0.5)) {
          const { job } = MJ.generateJob(rng.fork("job-d" + day), sites, day);
          jobs.push(job);
          for (const m of job.missions) {
            if (!sites.includes(m.site)) {
              sites.push(m.site);
              estSnap.set(m.site, snap(m.site.estimatedSecurity));
              prevMax.set(m.site, null);
            }
          }
        }
        const queue = [];
        const avail = roster.filter((r) => MJ.isDispatchable(r));
        const activeJob = jobs.find((j) => !MJ.isJobComplete(j));
        if (activeJob && avail.length) {
          const gated = activeJob.missions.find((m) => m.requiresMission && !m.requiresMission.resolved);
          if (gated && rng.chance(0.3)) queue.push({ mission: gated, runners: avail }); // deliberate illegal injection
          const target = activeJob.missions.find((m) => !m.resolved && (!m.requiresMission || m.requiresMission.resolved));
          if (target) queue.push({ mission: target, runners: avail.slice(0, 1 + rng.int(0, Math.max(0, Math.min(2, avail.length - 1)))) });
        }
        if (sites.length && avail.length > 2 && rng.chance(0.5)) {
          queue.push({ mission: MJ.createReconMission(rng.pick(sites), rng.pick(MJ.RECON_LENSES)), runners: [avail[avail.length - 1]] });
        }
        const wounded = roster.find((r) => r.wounds > 0 && MJ.isDispatchable(r));
        if (wounded && rng.chance(0.6)) {
          const medic = roster.find((r) => r !== wounded && MJ.isDispatchable(r));
          if (medic) queue.push({ mission: MJ.createMedicalMission(wounded), runners: [medic] });
        }
        if (rng.chance(0.3) && avail.length) queue.push({ mission: MJ.createCraftingMission(1 + rng.int(0, 4)), runners: [rng.pick(avail)] });

        const results = MJ.runActionPeriod(rng, queue, day);
        for (const res of results) {
          if (res.success && res.karmaAward) {
            for (const h of res.crew) {
              const rr = byHandle.get(h);
              if (rr) expectedKarma.set(rr, expectedKarma.get(rr) + res.karmaAward);
            }
          }
        }
        for (const j of jobs) {
          if (MJ.isJobComplete(j) && !j.paid) {
            const before = save.johnson.money;
            MJ.collectJobPay(save, j);
            completedJobs += 1;
            ok(save.johnson.money === before + j.pay, day, "collectJobPay delta wrong");
          }
        }
        for (const site of sites) if (site.securityState) MJ.advanceSiteDay(site.securityState);
        for (const r of roster) MJ.advanceMarketDay(r, rng);

        // ── the daily battery ──
        ok(Number.isFinite(save.johnson.money) && save.johnson.money >= 0, day, "ledger corrupt");
        ok(save.johnson.reputation === completedJobs, day, "reputation out of sync with completed jobs");
        for (const r of roster) {
          ok(r.karma === expectedKarma.get(r), day, "karma ledger mismatch for " + r.identity.handle + " (have " + r.karma + ", expected " + expectedKarma.get(r) + ")");
          ok(r.wounds >= 0 && Number.isFinite(r.wounds), day, "wounds corrupt");
          const prev = prevSkills.get(r);
          for (const k of Object.keys(r.skills)) {
            ok(r.skills[k] >= prev[k], day, "skill " + k + " decreased for " + r.identity.handle);
          }
          prevSkills.set(r, Object.assign({}, r.skills));
          ok(LEGAL_PHASES.indexOf(r.market.phase) !== -1, day, "illegal phase " + r.market.phase);
          if (r.market.hired) {
            ok(r.market.phase === null, day, "hired runner has an active market phase");
            ok(r.market.hired.missionsRemaining > 0, day, "hired with a non-positive contract");
          }
          if (r.market.phase === "kia") kiaLatch.add(r);
          if (kiaLatch.has(r)) ok(r.market.phase === "kia" && !r.market.hired, day, "KIA runner came back: " + r.identity.handle);
        }
        for (const site of sites) {
          const st = site.securityState;
          if (!st) continue;
          for (const axis of AXES) {
            const a = st.axes[axis];
            ok(a.min >= 1 && a.min <= a.current && a.current <= a.max, day, "security triple out of order (" + axis + ")");
            const pm = prevMax.get(site);
            if (pm) ok(a.max >= pm[axis], day, "Max decreased (" + axis + ")");
          }
          ok(st.alert >= 0 && st.alert <= st.alertMax, day, "alert out of bounds");
          const pm = prevMax.get(site);
          if (pm) ok(st.alertMax >= pm.alertMax, day, "alertMax decreased");
          prevMax.set(site, { physical: st.axes.physical.max, astral: st.axes.astral.max, matrix: st.axes.matrix.max, alertMax: st.alertMax });
          ok(snap(site.estimatedSecurity) === estSnap.get(site), day, "a handed estimate mutated");
          for (const lens of Object.keys(site.intel || {})) {
            ok(site.intel[lens].dayTaken <= day, day, "intel stamped in the future");
          }
        }
        for (const j of jobs) {
          const sum = j.missions.reduce((t, m) => t + m.payContribution, 0);
          ok(j.pay === Math.round(sum * j.rushMultiplier), day, "job pay drifted");
          for (const m of j.missions) {
            if (m.resolved && m.requiresMission) ok(m.requiresMission.resolved, day, "a gated mission resolved before its prerequisite");
            if (m.resolved) ok(m.karmaAward >= 1, day, "resolved mission with no karma award");
          }
          if (j.paid) ok(MJ.isJobComplete(j), day, "a job paid out before completion");
        }
      }
    }
    log("  soak: " + daysRun + " simulated days across 6 seeds, battery asserted after every day");
  }

  // ── Class 8: the universe site registry ─────────────────────────
  // Lazy, infinite, deterministic, and faction/district-balanced —
  // the §09 "pull from the universe seed on demand" contract.
  function class8_registry() {
    const U = "stress-universe";

    // Determinism: same universe + same index = byte-identical site.
    const a = snap(MJ.mintSite(U, 42, { value: 5, orientation: "matrix" }));
    const b = snap(MJ.mintSite(U, 42, { value: 5, orientation: "matrix" }));
    check(a === b, "C8: minting the same index twice must be byte-identical");
    const c = snap(MJ.mintSite(U, 43, { value: 5, orientation: "matrix" }));
    check(a !== c, "C8: adjacent indices must differ");
    const d = snap(MJ.mintSite("stress-universe-2", 42, { value: 5, orientation: "matrix" }));
    check(a !== d, "C8: a different universe must yield a different site at the same index");

    // Infinity: huge indices work and stay deterministic.
    const far1 = snap(MJ.mintSite(U, 1048576, {}));
    const far2 = snap(MJ.mintSite(U, 1048576, {}));
    check(far1 === far2 && far1.length > 100, "C8: the registry must be lazy-infinite (index 1048576)");

    // Balance: every consecutive block of N indices visits all N
    // districts and all N factions exactly once — no streaks, ever.
    const D = MJ.DISTRICTS.length;
    const F = MJ.FACTIONS.length;
    const SPAN = 700;
    const ids = [];
    for (let i = 0; i < SPAN; i++) ids.push(MJ.siteIdentityFromIndex(U, i));
    for (let block = 0; block * D + D <= SPAN; block++) {
      const districts = new Set(ids.slice(block * D, block * D + D).map((x) => x.district));
      check(districts.size === D, "C8: district bag leaked a repeat in block " + block);
    }
    for (let block = 0; block * F + F <= SPAN; block++) {
      const factions = new Set(ids.slice(block * F, block * F + F).map((x) => x.owningFaction));
      check(factions.size === F, "C8: faction bag leaked a repeat in block " + block);
    }

    // Independence: the district<->faction pairing must not lock
    // ("every building in Tacoma is owned by Mitsuhama" is the
    // immersion-breaker this exists to prevent).
    const pairings = new Map();
    for (const id of ids) {
      if (!pairings.has(id.district)) pairings.set(id.district, new Set());
      pairings.get(id.district).add(id.owningFaction);
    }
    for (const [district, owners] of pairings) {
      check(owners.size >= Math.min(F, 4), "C8: district " + district + " is owned by too few factions (" + owners.size + ") — pairing has locked");
    }

    // Runner handles: the universe deals base names from a bag —
    // within one full block, every base appears exactly once (no
    // "Static_32" + "Static_42" brand confusion), handles are
    // deterministic per index, and styling keeps them distinct.
    const N = MJ.HANDLES.length;
    check(N >= 150, "C8: handle pool too small (" + N + ")");
    const bases = new Set();
    const handles = new Set();
    for (let i = 0; i < N; i++) {
      bases.add(MJ.handleBaseFromIndex(U, i));
      handles.add(MJ.mintRunner(U, i).identity.handle);
    }
    check(bases.size === N, "C8: base-name bag leaked a repeat (" + bases.size + "/" + N + ")");
    check(handles.size === N, "C8: full handles collided within one block");
    check(MJ.mintRunner(U, 7).identity.handle === MJ.mintRunner(U, 7).identity.handle, "C8: handle must be deterministic per index");

    // No fixed rotation: consecutive blocks must not deal the bag in
    // the same order every time.
    const block0 = ids.slice(0, D).map((x) => x.district).join("|");
    const block1 = ids.slice(D, 2 * D).map((x) => x.district).join("|");
    const block2 = ids.slice(2 * D, 3 * D).map((x) => x.district).join("|");
    check(!(block0 === block1 && block1 === block2), "C8: the bag deals a fixed rotation — reshuffle per block is broken");
  }

  // ── Class 9: site list & compression ────────────────────────────
  // The §09 seeds+deltas promise, proven live: an untouched known
  // site compresses to a bare record and revives byte-identical;
  // every kind of attachment or heat blocks compression.
  function class9_sitelist() {
    const U = "stress-list-universe";
    const rngE = MJ.makeRNG("stress-list");

    // Round-trip across every mint-option shape, including "no
    // options at all" (rolls must resync on revival).
    let roundTrips = 0;
    for (let i = 0; i < 60; i++) {
      const opts = i % 3 === 0 ? {} : i % 3 === 1 ? { value: 1 + (i % 10) } : { value: 1 + (i % 10), orientation: MJ.ORIENTATIONS[i % 4] };
      const site = MJ.mintSite(U, i, opts);
      MJ.generateSecurityEstimate(rngE.fork("e" + i), site);
      MJ.addKnownSite([], site, 3, "job");
      const rec = MJ.compressSite(site);
      if (!check(rec !== null, "C9: untouched minted site must be compressible (i=" + i + ")")) continue;
      const revived = snap(MJ.reviveSite(U, rec));
      const norm = JSON.parse(snap(site));
      if (norm.securityState) norm.securityState.quietDays = 0; // transient cooldown pacing, normalized
      check(revived === snap(norm), "C9: compress->revive round-trip diverged (i=" + i + ")");
      roundTrips += 1;
    }
    check(roundTrips >= 60, "C9: round-trip probe incomplete (" + roundTrips + "/60)");

    // Every attachment/heat gate must block compression.
    let gi = 500;
    function gate(label, mutate) {
      const s = MJ.mintSite(U, gi++, {});
      MJ.generateSecurityEstimate(rngE.fork("g" + gi), s);
      MJ.addKnownSite([], s, 1, "job");
      mutate(s);
      check(!MJ.isSiteCompressible(s), "C9: " + label + " must block compression");
    }
    gate("watching", (s) => MJ.watchSite(s));
    gate("a tag", (s) => s.tags.push({ tag: "x", expiryDay: 9 }));
    gate("intel", (s) => { s.intel.astral = { snapshot: {}, dayTaken: 1 }; });
    gate("heat (alert)", (s) => { s.securityState.alert = 2; });
    gate("escalated posture", (s) => { const a = s.securityState.axes.physical; a.min = 1; a.current = 2; a.max = Math.max(a.max, 3); });
    gate("grown Max", (s) => { s.securityState.everGrew = true; });
    const pre = MJ.generateSite(MJ.makeRNG("stress-preregistry"));
    check(!MJ.isSiteCompressible(pre), "C9: a pre-registry site (no universeIndex) must never claim compressibility");

    // Cooling restores compressibility.
    const hot = MJ.mintSite(U, 900, {});
    MJ.generateSecurityEstimate(rngE.fork("hot"), hot);
    MJ.addKnownSite([], hot, 1, "job");
    hot.securityState.alert = 2;
    check(!MJ.isSiteCompressible(hot), "C9: hot site compressed");
    MJ.advanceSiteDay(hot.securityState);
    MJ.advanceSiteDay(hot.securityState);
    check(MJ.isSiteCompressible(hot), "C9: cooled site must compress again");

    // The watch feed matches by mission site, and only for watched.
    const list = [];
    const w = MJ.addKnownSite(list, MJ.mintSite(U, 901, {}), 1, "job");
    const other = MJ.addKnownSite(list, MJ.mintSite(U, 902, {}), 1, "job");
    MJ.watchSite(w);
    const fakeJobs = [
      { hiringFaction: "X", missions: [{ site: other }, { site: w }] },
      { hiringFaction: "Y", missions: [{ site: other }] },
    ];
    const hits = MJ.jobsAtWatchedSites(fakeJobs, list);
    check(hits.length === 1 && hits[0].legIndex === 1 && hits[0].site === w, "C9: watch feed matched wrong");

    // De-dupe: adding the same universe index twice keeps one entry.
    const dupList = [];
    MJ.addKnownSite(dupList, MJ.mintSite(U, 903, {}), 1, "job");
    MJ.addKnownSite(dupList, MJ.mintSite(U, 903, {}), 5, "discovery");
    check(dupList.length === 1 && dupList[0].knownMeta.dayKnown === 1, "C9: duplicate universe index must not double-list");
  }

  // ── Class 10: the integration layer (game.js) ───────────────────
  // The session commands, driven with injected rng: deterministic
  // when injected, expiry teeth real, capacity enforced, registry
  // sites flowing through the board, arrivals genuinely ephemeral.
  function class10_integration() {
    function playScript(tag) {
      const s = MJ.game.newGame("itest-universe");
      const rng = MJ.makeRNG("itest-flow");
      MJ.game.refreshBoard(s, rng.fork("board"));
      check(s.board.length === s.save.johnson.boardCapacity, "C10: board size must equal capacity" + tag);
      // §06's rung deal: a rookie board must always contain
      // attemptable work — at least two all-safe-band contracts.
      const safeJobs = s.board.filter((e) => e.job.missions.every((m) => m.site.identity.value <= 3)).length;
      check(safeJobs >= 2, "C10: board deal must guarantee the safe rung (got " + safeJobs + ")" + tag);
      MJ.game.watchFromMarket(s, 0, rng.fork("w0"));
      MJ.game.watchFromMarket(s, 0, rng.fork("w1"));
      const a = s.roster[0];
      const b = s.roster[1];
      MJ.game.hire(s, a, "retainer");
      MJ.game.hire(s, b, "retainer");
      MJ.game.acceptJob(s, 0);
      const job = s.jobs[0];
      check(s.knownSites.length >= 1 && s.knownSites.every((x) => x.estimatedSecurity && x.knownMeta), "C10: accepted sites must be known, with estimates" + tag);
      check(s.knownSites.every((x) => x.identity.universeIndex !== undefined), "C10: introduced sites must come from the registry" + tag);
      for (let d = 0; d < 14 && !MJ.isJobComplete(job) && !job.expired; d++) {
        for (const r of [a, b]) if (!r.market.hired && MJ.isHireable(r)) MJ.game.hire(s, r, "freelance");
        const target = job.missions.find((m) => !m.resolved && (!m.requiresMission || m.requiresMission.resolved));
        if (target && MJ.isDispatchable(a)) {
          check(MJ.game.queueDispatch(s, target, [a, b].filter(MJ.isDispatchable), "leg").ok, "C10: legal queue refused" + tag);
        }
        MJ.game.endDay(s, rng.fork("day" + d));
      }
      return {
        s: s, job: job,
        snapshot: snap({
          day: s.day, money: s.save.johnson.money, rep: s.save.johnson.reputation,
          roster: s.roster, known: s.knownSites.length, mint: [s.runnerMintIndex, s.siteMintIndex],
          jobs: s.jobs.map((j) => ({ paid: !!j.paid, expired: !!j.expired, resolved: j.missions.map((m) => m.resolved) })),
          log: s.log,
        }),
      };
    }
    const r1 = playScript(" (run 1)");
    const r2 = playScript(" (run 2)");
    check(r1.snapshot === r2.snapshot, "C10: identical command script + injected rng must byte-match");
    if (r1.job.paid) check(r1.s.save.johnson.reputation >= 1, "C10: paid job without reputation");

    // Expiry teeth: an untouched contract fails at its window, its
    // legs refuse queuing forever after, and dead offers leave the board.
    const s3 = MJ.game.newGame("itest-expiry");
    const rng3 = MJ.makeRNG("itest-expiry-flow");
    MJ.game.refreshBoard(s3, rng3.fork("board"));
    MJ.game.acceptJob(s3, 0);
    const j3 = s3.jobs[0];
    for (let d = 0; s3.day <= j3.expiryDay + 1; d++) MJ.game.endDay(s3, rng3.fork("d" + d));
    check(j3.expired === true && !j3.paid, "C10: an untouched contract must fail at its window, unpaid");
    MJ.game.watchFromMarket(s3, 0, rng3.fork("w"));
    MJ.game.hire(s3, s3.roster[0], "freelance");
    check(MJ.game.queueDispatch(s3, j3.missions[0], [s3.roster[0]]).ok === false, "C10: expired contract legs must refuse queuing");
    check(s3.board.every((e) => s3.day <= e.job.expiryDay), "C10: expired offers must leave the board");

    // Split caps: watch list is wider than the crew (watch = 2x
    // boardCapacity, hired <= boardCapacity).
    const s4 = MJ.game.newGame("itest-cap");
    const rng4 = MJ.makeRNG("itest-cap-flow");
    s4.save.johnson.money = 500000;
    const watchCap = MJ.game.watchCapacity(s4);
    check(watchCap > s4.save.johnson.boardCapacity, "C10: watch capacity must exceed crew capacity");
    for (let i = 0; i < watchCap; i++) {
      check(MJ.game.watchFromMarket(s4, 0, rng4.fork("w" + i)).ok, "C10: watch under capacity refused (i=" + i + ")");
    }
    check(MJ.game.watchFromMarket(s4, 0, rng4.fork("wx")).ok === false, "C10: watch beyond capacity must refuse");
    for (let i = 0; i < s4.save.johnson.boardCapacity; i++) {
      check(MJ.game.hire(s4, s4.roster[i], "freelance").ok, "C10: hire under crew cap refused (i=" + i + ")");
    }
    check(MJ.game.hire(s4, s4.roster[s4.save.johnson.boardCapacity], "freelance").ok === false, "C10: hire beyond crew cap must refuse");
    check(MJ.game.hiredCount(s4) === s4.save.johnson.boardCapacity, "C10: hired count wrong after cap test");

    // Queue-time double-booking refusal: one action per runner per
    // day is enforced when the PLAN is made, not just at resolution.
    const q1 = MJ.game.queueDispatch(s4, MJ.createCraftingMission(2), [s4.roster[0]], "craft A");
    check(q1.ok, "C10: first queue refused");
    const q2 = MJ.game.queueDispatch(s4, MJ.createCraftingMission(2), [s4.roster[0]], "craft B");
    check(q2.ok === false && q2.error.indexOf("already committed") !== -1, "C10: double-booking a runner must refuse at queue time");
    s4.queue = [];

    // Market refresh: new faces, same slot count, indices advance.
    const beforeCount = s4.market.length;
    const beforeFaces = snap(s4.market.map((r) => r.identity.universeIndex));
    const beforeMint = s4.runnerMintIndex;
    MJ.game.refreshMarket(s4);
    check(s4.market.length === beforeCount && s4.runnerMintIndex > beforeMint, "C10: market refresh must keep slot count and advance the mint");
    check(snap(s4.market.map((r) => r.identity.universeIndex)) !== beforeFaces, "C10: market refresh left the same crowd");

    // Round-4 mechanics: contract numbering, search-as-dispatch,
    // interaction-confirmed intel, and plan repetition.
    const s6 = MJ.game.newGame("itest-round4");
    const rng6 = MJ.makeRNG("itest-round4-flow");
    s6.save.johnson.money = 500000;
    MJ.game.refreshBoard(s6, rng6.fork("b"));
    MJ.game.acceptJob(s6, 0);
    MJ.game.acceptJob(s6, 0);
    check(s6.jobs[0].contractNumber === 1 && s6.jobs[1].contractNumber === 2, "C10: contracts must number by acceptance order");
    MJ.game.watchFromMarket(s6, 0, rng6.fork("w"));
    const searcher = s6.roster[0];
    MJ.game.hire(s6, searcher, "freelance");
    const knownBefore = s6.knownSites.length;
    check(MJ.game.queueDispatch(s6, MJ.game.makeSearchMission(s6, "scrap"), [searcher], "search: scrap").ok, "C10: search queue refused");
    MJ.game.endDay(s6, rng6.fork("d1"));
    check(s6.knownSites.length === knownBefore + 1, "C10: search must discover and register a site");
    check(searcher.market.hired === null, "C10: search must consume the freelance block");
    const found = s6.knownSites[s6.knownSites.length - 1];
    check(!!found.estimatedSecurity && found.knownMeta.source === "discovery", "C10: a discovered site must carry an estimate and provenance");
    MJ.game.watchFromMarket(s6, 0, rng6.fork("w2"));
    const worker = s6.roster[1];
    MJ.game.hire(s6, worker, "permanent");
    MJ.game.queueDispatch(s6, MJ.createResourceMission(found), [worker], "harvest");
    const day2 = MJ.game.endDay(s6, rng6.fork("d2"));
    if (day2[0].obstaclesFaced > 0) {
      const lenses = Object.keys(found.intel);
      check(lenses.length > 0, "C10: a run that faced obstacles must confirm intel by interaction");
      check(lenses.every((l) => found.intel[l].dayTaken === 2), "C10: interaction intel must stamp the mission day");
    }
    const rep = MJ.game.repeatLastPlan(s6);
    check(rep.ok === true, "C10: repeat refused outright");
    if (MJ.isDispatchable(worker)) {
      check(s6.queue.length === 1 && s6.queue[0].label === "harvest", "C10: repeat should requeue the harvest with the same label");
    }
    s6.queue = [];

    // Layer 3 sanity: two live (timestamped) refreshes differ.
    const s5 = MJ.game.newGame("itest-arrivals");
    MJ.game.refreshBoard(s5);
    const b1 = snap(s5.board.map((e) => e.job.pay + "|" + e.job.hiringFaction));
    MJ.game.refreshBoard(s5);
    const b2 = snap(s5.board.map((e) => e.job.pay + "|" + e.job.hiringFaction));
    check(b1 !== b2, "C10: two live board refreshes matched exactly (astronomically unlikely — check the wiring)");
  }

  // ── Class 11: the armory ────────────────────────────────────────
  // Equipment is the operation's second roster: exclusive issue,
  // best-tool-no-stacking, gear never rescues untrained, cyberware
  // consumes and spends Essence permanently, crafting yields real
  // items, and the ledger moves by exact amounts.
  function class11_armory() {
    const save = MJ.defaultSave("stress-armory");
    save.johnson.money = 100000;
    const rng = MJ.makeRNG("stress-armory");
    const decker = makeRoster(rng, 1, ["decker"])[0];
    MJ.watchRunner(decker, rng);
    MJ.hireRunner(decker, "permanent");

    // Buy: exact delta, item lands unissued.
    const m0 = save.johnson.money;
    const buy = MJ.buyItem(save, "deckMk1");
    check(buy.ok && save.johnson.money === m0 - MJ.itemCost("deckMk1"), "C11: buy must move exactly itemCost");
    check(save.armory.items.length === 1 && buy.item.issuedTo === null, "C11: bought item must land unissued");

    // Issue: both sides stay consistent; bonus applies; best tool wins.
    MJ.issueItem(buy.item, decker);
    check(buy.item.issuedTo === decker && decker.gear.indexOf(buy.item) !== -1, "C11: issue must sync item and carrier");
    check(MJ.gearBonusFor(decker, "hacking") === 1, "C11: T3 deck must grant +1");
    const deck2 = MJ.makeItem("deckMk2");
    save.armory.items.push(deck2);
    MJ.issueItem(deck2, decker);
    check(MJ.gearBonusFor(decker, "hacking") === 2, "C11: best tool wins — never stacked (+2, not +3)");
    check(MJ.gearBonusFor(decker, "sorcery") === 0, "C11: no focus, no bonus");

    // Pool math through resolveTask; untrained never rescued.
    const eff = MJ.getEffectiveSkills(decker);
    const ob = { tier: 2, affordances: [{ skill: "hacking", verb: "x", loud: false }] };
    check(MJ.resolveTask(rng, decker, ob, "hacking", { bonusDice: MJ.gearBonusFor(decker, "hacking") }).poolSize === eff.hacking + 2, "C11: pool must include gear dice");
    const untrained = Object.keys(eff).find((k) => eff[k] === 0);
    const obU = { tier: 2, affordances: [{ skill: untrained, verb: "x", loud: false }] };
    check(MJ.resolveTask(rng, decker, obU, untrained, { bonusDice: 2 }).poolSize === 0, "C11: gear must never rescue untrained");

    // Reissue moves cleanly off the old carrier.
    const soldier = makeRoster(rng.fork("s"), 1, ["fighter"])[0];
    MJ.watchRunner(soldier, rng);
    MJ.hireRunner(soldier, "permanent");
    MJ.issueItem(buy.item, soldier);
    check(buy.item.issuedTo === soldier && decker.gear.indexOf(buy.item) === -1, "C11: reissue must leave the old carrier empty-handed");

    // Sell: refused while issued; exact resale once reclaimed.
    check(MJ.sellItem(save, buy.item).ok === false, "C11: selling issued gear must refuse");
    MJ.reclaimItem(buy.item);
    const m1 = save.johnson.money;
    const sale = MJ.sellItem(save, buy.item);
    check(sale.ok && save.johnson.money === m1 + Math.round(MJ.itemCost("deckMk1") * 0.4), "C11: resale ratio wrong");
    check(save.armory.items.indexOf(buy.item) === -1, "C11: sold item must leave the armory");

    // Template crafting yields the real item through the dispatch loop.
    let crafted = null;
    for (let i = 0; i < 60 && !crafted; i++) {
      const doc = MJ.generateRunner(rng.fork("doc" + i), { focusId: "streetDoc" });
      MJ.watchRunner(doc, rng);
      MJ.hireRunner(doc, "permanent");
      const res = MJ.runActionPeriod(rng.fork("cd" + i), [{ mission: MJ.createCraftingMission("medkit"), runners: [doc] }], 1)[0];
      if (res.success) crafted = res;
    }
    check(!!crafted && !!crafted.yield && !!crafted.yield.item && crafted.yield.item.templateId === "medkit", "C11: template crafting must yield the actual item");

    // Cyberware: essence spent exactly, mods live only where trained,
    // the item is consumed, and the floor holds.
    const cyber = MJ.makeItem("smartlink");
    save.armory.items.push(cyber);
    check(MJ.issueItem(cyber, soldier).ok === false, "C11: cyberware must refuse issue");
    const effB = MJ.getEffectiveSkills(soldier);
    const essB = soldier.essence.current;
    const surgery = MJ.implantSurgery(soldier, cyber, save.armory.items);
    check(surgery.ok && soldier.essence.current === Math.round((essB - 0.6) * 100) / 100, "C11: surgery must spend exact Essence");
    check(save.armory.items.indexOf(cyber) === -1, "C11: implant must be consumed");
    const effA = MJ.getEffectiveSkills(soldier);
    if (effB.firearms > 0) check(effA.firearms === effB.firearms + 2, "C11: implant skillMod must apply to trained skill");
    soldier.essence.current = 0.7;
    const cyber2 = MJ.makeItem("reflexWiring");
    save.armory.items.push(cyber2);
    check(MJ.implantSurgery(soldier, cyber2, save.armory.items).ok === false, "C11: Essence floor must hold");
    check(save.armory.items.indexOf(cyber2) !== -1, "C11: refused surgery must not consume the item");

    // Programs only run on a deck.
    const prog = MJ.makeItem("ghostware");
    save.armory.items.push(prog);
    MJ.issueItem(prog, decker); // decker currently carries deckMk2
    check(MJ.gearBonusFor(decker, "hacking") === 2, "C11: program must not beat the deck alone (best tool)");
    MJ.reclaimItem(deck2);
    check(MJ.gearBonusFor(decker, "hacking") === 0, "C11: a program without a deck must be dead weight");
    MJ.issueItem(deck2, decker);
    check(MJ.gearBonusFor(decker, "hacking") === 2, "C11: program+deck restores the bonus");

    // Armor guards and patches absorb critical-glitch wounds.
    const tank = MJ.generateRunner(rng.fork("tank"), { family: "fighter" });
    MJ.watchRunner(tank, rng);
    MJ.hireRunner(tank, "permanent");
    const vest = MJ.makeItem("riotCarapace");
    save.armory.items.push(vest);
    MJ.issueItem(vest, tank);
    check(MJ.woundGuardFor(tank) === 2, "C11: T6 armor must guard 2 wounds");
    const patch = MJ.makeItem("traumaPatch");
    save.armory.items.push(patch);
    MJ.issueItem(patch, tank);
    check(MJ.findConsumable(tank, "absorbWound", null) === patch, "C11: patch must be findable");
    MJ.consumeItem(patch);
    check(patch.consumed === true && tank.gear.indexOf(patch) === -1, "C11: consumption must strip the carrier");
    check(MJ.findConsumable(tank, "absorbWound", null) === null, "C11: consumed patch must not be found again");

    // Boost consumables: found by skill, burned on use.
    const smoke = MJ.makeItem("smokeGrenade");
    save.armory.items.push(smoke);
    MJ.issueItem(smoke, tank);
    check(MJ.findConsumable(tank, "boost", "stealth") === smoke, "C11: boost must match its skill");
    check(MJ.findConsumable(tank, "boost", "firearms") === null, "C11: boost must not match other skills");
    check(MJ.gearBonusFor(tank, "stealth") === 0, "C11: consumables must not count as passive gear");

    // Formulas: mages only, recorded on the dossier, copy consumed.
    const formula = MJ.makeItem("fmlManabolt");
    save.armory.items.push(formula);
    check(MJ.issueItem(formula, tank).ok === false, "C11: formulas must refuse issue");
    check(MJ.teachFormula(tank, formula, save.armory.items).ok === false, "C11: non-mage must refuse formulas");
    const mage = MJ.generateRunner(rng.fork("mage"), { family: "mage" });
    MJ.watchRunner(mage, rng);
    MJ.hireRunner(mage, "permanent");
    check(MJ.teachFormula(mage, formula, save.armory.items).ok === true, "C11: mage must learn the formula");
    check(mage.classification.spellFormulasKnown.indexOf("Formula: Manabolt") !== -1, "C11: formula must land on the dossier");
    check(save.armory.items.indexOf(formula) === -1, "C11: taught formula must be consumed");
    const formula2 = MJ.makeItem("fmlManabolt");
    save.armory.items.push(formula2);
    check(MJ.teachFormula(mage, formula2, save.armory.items).ok === false, "C11: re-learning the same formula must refuse");

    // Materials: exact sale, stock zeroed.
    save.armory.materials["resource:scrap"] = 3;
    const m2 = save.johnson.money;
    const matSale = MJ.sellMaterials(save, "resource:scrap");
    check(matSale.ok && save.johnson.money === m2 + 3 * 150 && save.armory.materials["resource:scrap"] === 0, "C11: material sale must be exact and zero the stock");
    check(MJ.sellMaterials(save, "resource:scrap").ok === false, "C11: empty stock must refuse");
  }

  // ── Runner ──────────────────────────────────────────────────────
  function runStress() {
    clear();
    failures = [];
    assertions = 0;
    log("MECHANICAL STRESS SUITE — plumbing, not balance. Zero tolerance.");
    log("");
    const classes = [
      ["1. Determinism (seed fixes the world, never the story)", class1_determinism],
      ["2. Upstream->downstream data integrity", class2_dataIntegrity],
      ["3. Timing & same-day communication", class3_timing],
      ["4. Refusal purity (refused means untouched)", class4_refusalPurity],
      ["5. State-machine legality (KIA is terminal, contracts behave)", class5_stateMachines],
      ["6. Aliasing safety (shared refs share on purpose only)", class6_aliasing],
      ["7. Randomized soak", class7_soak],
      ["8. Universe site registry (lazy, infinite, balanced)", class8_registry],
      ["9. Site list & compression (seeds+deltas, proven live)", class9_sitelist],
      ["10. Integration layer (session commands, expiry teeth)", class10_integration],
      ["11. Armory (second roster: issue, chrome, craft, ledger)", class11_armory],
    ];
    for (const [label, fn] of classes) {
      const before = failures.length;
      const beforeAsserts = assertions;
      fn();
      const newFails = failures.length - before;
      log((newFails === 0 ? "PASS" : "FAIL(" + newFails + ")") + "  " + label + "   [" + (assertions - beforeAsserts) + " assertions]");
    }
    log("");
    if (failures.length === 0) {
      log("VERDICT: 0 failures across " + assertions + " assertions. The pieces are locked in.");
    } else {
      log("VERDICT: " + failures.length + " FAILURES across " + assertions + " assertions:");
      failures.slice(0, 20).forEach((f) => log("  ✗ " + f));
      if (failures.length > 20) log("  ... and " + (failures.length - 20) + " more");
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-stress").addEventListener("click", runStress);
  });
})();
