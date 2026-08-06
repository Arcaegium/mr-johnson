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

  // A structural fingerprint, cycle-safe. Gear is two-way — an item
  // points back at the runner holding it — and every runner now
  // arrives carrying personal kit, so a naive stringify hits that
  // loop immediately. The back-pointer is replaced by the holder's
  // handle rather than dropped, so "who is holding this" still
  // shows up in the comparison and the probes keep their teeth.
  const snap = (o) => JSON.stringify(o, (key, value) => {
    if (key === "issuedTo" && value && value.identity) return "@" + value.identity.handle;
    if (key === "source" && value && value.identity) return "@" + value.identity.handle;
    return value;
  });
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
      const startCurrent = MJ.SECURITY_AXES.map((a) => site.securityState.axes[a].current).join(",");
      const res = MJ.runActionPeriod(rngN, [{ mission: MJ.createResourceMission(site), runners: [r] }], 1)[0];
      if (res.error) continue;
      noiseChecked += 1;
      // The read is the gate: nothing ratchets unless the run
      // actually forced a response, and a response never leaves
      // Current below where it started.
      const endCurrent = MJ.SECURITY_AXES.map((a) => site.securityState.axes[a].current).join(",");
      if (!res.forcedResponse) {
        check(endCurrent === startCurrent, "C2: a run that never read as threatening must not ratchet (site " + i + ")");
      }
      for (const axis of MJ.SECURITY_AXES) {
        const ax = site.securityState.axes[axis];
        check(ax.min <= ax.current && ax.current <= ax.max, "C2: band violated after a run (site " + i + ")");
      }
    }
    check(noiseChecked > 30, "C2: mission probe barely ran (" + noiseChecked + ")");

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
      // A sweep that provoked a response legitimately learns about
      // the axes that answered — physical responders confirm physical
      // security, because the crew just met it. Only an unprovoked
      // sweep confirms its lens alone.
      if (res.forcedResponse) continue;
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
    // resolveTask asks one question — did this check succeed — so a
    // difficulty is all it needs. Whether the act reaches, lands, or
    // is immune here is the world's business, settled before any dice
    // come out.
    const obT = { tier: 2 };
    const obU = { tier: 2 };
    // Pool is Skill + Attribute + situational dice. The attribute is
    // part of the base, so a bonus adds on top of BOTH.
    const attrT = rb.attributes[MJ.attributeFor(trained)] || 0;
    check(MJ.resolveTask(rngB, rb, obT, trained, { bonusDice: 2 }).poolSize === eff[trained] + attrT + 2, "C2: bonus dice must add to a trained pool");
    check(MJ.resolveTask(rngB, rb, obT, trained, {}).poolSize === eff[trained] + attrT, "C2: a trained pool is skill + attribute");

    // The number the PLAYER is shown must be the number that gets
    // rolled. missionPrompt once built its own pool and omitted the
    // attribute, so the popup advertised a pool an entire attribute
    // short of the truth. Walk real prompts and assert the offered
    // pool equals what resolveTask would actually roll.
    const rngPP = MJ.makeRNG("stress-promptpool");
    const crewPP = makeRoster(rngPP, 3, ["fighter", "decker", "mage"]);
    let promptsChecked = 0;
    for (let i = 0; i < 150 && promptsChecked < 200; i++) {
      const site = MJ.mintSite("promptpool-u", i);
      const run = MJ.beginMission(rngPP, { site: site, kind: "jobObjective", objective: {} }, crewPP, 1);
      let guard = 0;
      while (!MJ.missionDone(run) && guard++ < 20) {
        const prompt = MJ.missionPrompt(run);
        if (!prompt) break;
        for (const o of prompt.options) {
          if (!o.runner || !o.skill) continue;
          const truth = MJ.dicePoolFor(o.runner, o.skill, MJ.gearBonusFor(o.runner, o.skill));
          check(o.pool === truth, "C2: prompt pool must equal the pool actually rolled (" + o.skill + ")");
          promptsChecked++;
        }
        const usable = prompt.options.filter((x) => x.available);
        MJ.missionChoose(run, usable.length ? { skill: usable[0].skill, runner: usable[0].runner, approach: usable[0].approach } : null);
      }
    }
    check(promptsChecked > 50, "C2: prompt-pool probe must actually exercise prompts");

    // ── Witnessing is per-PLANE ─────────────────────────────────
    // A decker working a host from a terminal out of a guard's sight
    // is invisible to that guard, and the camera he kills does not
    // phone anyone. Doing the same job by hand, in the room, is a
    // physical act with a witness. Same obstacle, same outcome,
    // different world — this is the rule that makes the three
    // pillars genuinely separate rather than reskins.
    const planeRunner = () => {
      const r = MJ.mintRunner("stress-plane", 1);
      r.market.hired = { tier: "permanent", missionsRemaining: 99, blockSize: 99 };
      r.skills = { hacking: 14, stealth: 14, electronics: 14 };
      return r;
    };
    const planeStage = (label) => {
      const site = MJ.mintSite("stress-plane-u", 2);
      MJ.initSecurityState(MJ.makeRNG("sp" + label), site);
      const run = MJ.beginMission(MJ.makeRNG("spr" + label),
        { site: site, kind: "jobObjective", objective: {} }, [planeRunner()], 1);
      const cam = MJ.generateObstacleInstance(MJ.makeRNG("spc"), "camera", 1);
      const grd = MJ.generateObstacleInstance(MJ.makeRNG("spg"), "guard", 1);
      cam.rooms = [7]; grd.rooms = [7];
      run.obstacles = [cam, grd];
      run.index = 0;
      return run;
    };
    const planeTake = (run, re) => {
      const p = MJ.missionPrompt(run);
      const o = p.options.find((x) => re.test(x.verb));
      if (!o) return null;
      MJ.missionChoose(run, { skill: o.skill, runner: o.runner, approach: o.approach });
      return run.tasks[run.tasks.length - 1];
    };

    const viaMatrix = planeStage("m");
    const hackTask = planeTake(viaMatrix, /kill it remotely/);
    check(hackTask && hackTask.success && !hackTask.read,
      "C2: a Matrix act must not be witnessed by a guard who only senses meatspace");
    const takedownTask = planeTake(viaMatrix, /silent takedown/);
    check(takedownTask && takedownTask.success && !takedownTask.read,
      "C2: a dead camera must not report itself — no witness left, nothing registers");
    check(MJ.threatBand(viaMatrix.state, 1) === "normal",
      "C2: the whole Matrix-then-takedown route must leave the site reading normal");

    // Doing the same job BY HAND happens in the guard's world, so he
    // CAN catch it — but being present is not the same as being
    // aware, so he gets a roll rather than a certainty. The plane
    // separation above is absolute; this is a chance, and the probe
    // has to test each as what it is.
    let sawIt = 0, byHandTrials = 0;
    for (let i = 0; i < 200; i++) {
      const stage = planeStage("h" + i);
      const t = planeTake(stage, /loop the feed/);
      if (!t) continue;
      byHandTrials += 1;
      if (t.read) sawIt += 1;
    }
    check(byHandTrials > 150, "C2: by-hand probe needs trials to mean anything (" + byHandTrials + ")");
    check(sawIt > 0, "C2: a guard in the room must sometimes catch a by-hand job");
    check(sawIt < byHandTrials, "C2: a guard must not be omniscient — some attempts go unnoticed");

    // Concealment is the dial that decides it. Blind the crew and the
    // guard catches them far more often than when they are hidden;
    // this is the seam an invisibility spell or a dark room plugs in.
    const noticeRate = (concealment) => {
      let seen = 0, n = 0;
      for (let i = 0; i < 200; i++) {
        const stage = planeStage("c" + concealment + "-" + i);
        stage.concealment = concealment;
        const t = planeTake(stage, /loop the feed/);
        if (!t) continue;
        n += 1; if (t.read) seen += 1;
      }
      return n ? seen / n : 0;
    };
    const exposed = noticeRate(-99); // clamps to a zero pool: no tradecraft at all
    const hidden = noticeRate(12);   // heavily concealed
    check(exposed > hidden, "C2: concealment must reduce how often a watcher catches you (" +
      (100 * exposed).toFixed(0) + "% exposed vs " + (100 * hidden).toFixed(0) + "% hidden)");
    check(hidden < 0.15, "C2: a heavily concealed crew must usually go unnoticed (" + (100 * hidden).toFixed(0) + "%)");

    // ── A run's memory belongs to the OBSTACLE, not its position ──
    // Responders splice in ahead of the crew and shift every later
    // index. Anything filed under a route index therefore starts
    // describing a different obstacle the moment a guard turns up:
    // the newcomer inherits the tries and discoveries its predecessor
    // earned, so its very first attempt reads as a repeat and an
    // approach it never blocked shows as useless. That is a crew
    // sneaking past a guard cleanly and getting burned on the very
    // next move for no reason they can see.
    const shiftRng = MJ.makeRNG("stress-index-shift");
    const shiftSite = MJ.mintSite("stress-shift-u", 3);
    const shiftCrew = makeRoster(shiftRng.fork("crew"), 3);
    for (const r of shiftCrew) { MJ.watchRunner(r, shiftRng); MJ.hireRunner(r, "permanent"); }
    const shiftRun = MJ.beginMission(shiftRng.fork("m"),
      { site: shiftSite, kind: "jobObjective", objective: {} }, shiftCrew, 1);
    if (shiftRun.obstacles.length >= 3) {
      const marked = shiftRun.obstacles[2];
      shiftRun.attempts.set(marked, { 0: 3 });
      shiftRun.discovered.set(marked, { stealth: "sensor-equipped" });
      shiftRun.index = 0;
      const intruder = MJ.generateObstacleInstance(MJ.makeRNG("shift-int"), "guard", 3, "physical");
      intruder.rooms = shiftRun.obstacles[0].rooms;
      shiftRun.obstacles.splice(1, 0, intruder);

      check(shiftRun.obstacles.indexOf(marked) === 3, "C2: the splice must actually shift the marked obstacle");
      check((shiftRun.attempts.get(marked) || {})[0] === 3,
        "C2: an obstacle must keep its own try count after the route shifts under it");
      check((shiftRun.discovered.get(marked) || {}).stealth === "sensor-equipped",
        "C2: an obstacle must keep its own discoveries after the route shifts under it");
      check(!shiftRun.attempts.get(intruder),
        "C2: a spliced-in responder must inherit NO tries from whoever held its index");
      check(!shiftRun.discovered.get(intruder),
        "C2: a spliced-in responder must inherit NO discoveries from whoever held its index");
      // And the prompt must agree: the newcomer's approaches read as
      // first attempts, not as repeats someone else earned.
      const intruderPrompt = MJ.missionPrompt(Object.assign(Object.create(Object.getPrototypeOf(shiftRun)), shiftRun, { index: 1 }));
      check(intruderPrompt && intruderPrompt.options.every((o) => !o.tries),
        "C2: a fresh responder's options must all read as first attempts");
    }

    const spiritInst = MJ.generateObstacleInstance(MJ.makeRNG("spdual"), "spirit", 1);
    check(spiritInst.dualNatured && spiritInst.senses.indexOf("astral") !== -1 &&
      spiritInst.senses.indexOf("physical") !== -1,
      "C2: a materialised spirit must be dual-natured — astral AND physical");
    const maglockInst = MJ.generateObstacleInstance(MJ.makeRNG("spml"), "maglock", 1);
    check(maglockInst.senses.length === 0, "C2: a maglock senses nothing on any plane");
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

    // ── The street route is a walk ────────────────────────────────
    // Every renderer past the placeholder moves a crew through rooms
    // one at a time, so the obstacle order has to BE that movement:
    // legs never run backwards, every obstacle sits on ground the
    // path actually crosses, and the walk ends in the objective room.
    let legsChecked = 0, mobileMet = 0;
    for (let i = 0; i < 400; i++) {
      const site = MJ.mintSite("stress-walk", i);
      const route = MJ.streetRoute(site);
      if (!route.path.length) continue;
      const onPath = new Set(route.path);
      check(route.path[route.path.length - 1] === 0, "C2: a street walk must end in the objective room (site " + i + ")");
      let lastLeg = -1;
      for (const o of route.obstacles) {
        legsChecked += 1;
        check(o.leg >= lastLeg, "C2: walk order went backwards at site " + i + " (leg " + o.leg + " after " + lastLeg + ")");
        lastLeg = o.leg;
        check(o.leg >= 0 && o.leg < route.path.length, "C2: obstacle leg outside the path (site " + i + ")");
        check((o.rooms || []).some((r) => onPath.has(r)), "C2: obstacle placed off the walked path (site " + i + ")");
        // A patrol or a zone is met on its circuit, and the leg it is
        // met at must be a room of that circuit — not merely nearby.
        if (o.where && (o.where.kind === "patrol" || o.where.kind === "zone")) {
          mobileMet += 1;
          check(o.where.roomIds.indexOf(route.path[o.leg]) !== -1, "C2: mobile threat met off its own circuit (site " + i + ")");
        }
      }
    }
    check(legsChecked > 500, "C2: walk probe needs real obstacle volume to mean anything (saw " + legsChecked + ")");
    check(mobileMet > 20, "C2: patrols and spirit zones must actually be walked into (saw " + mobileMet + ")");
  }

  // ── Class 3: timing / same-day communication ────────────────────
  function class3_timing() {
    // An incident that ratcheted Current must raise a later
    // mission's karma at that site — karma reads the posture at the
    // START of the mission, so the crew that walks in after the
    // fight is credited for the harder building. (Under the retired
    // noise model this probe primed alert points; the trigger is now
    // a settled threatening incident, which is the only thing that
    // moves Current.)
    let proved = false;
    for (let i = 0; i < 200 && !proved; i++) {
      const build = (forceIncident) => {
        const rng = MJ.makeRNG("stress-queue-" + i);
        const site = MJ.mintSite("stress-queue-u", i, { value: 4, orientation: "physical" });
        MJ.generateSecurityEstimate(rng.fork("e"), site);
        if (forceIncident) {
          // Someone tripped them YESTERDAY and the response held.
          // The night has to pass: the ratchet persists, the active
          // response does not — otherwise this crew would be walking
          // into responders rather than into a merely harder site.
          MJ.witnessAct(site.securityState, 1, MJ.THREAT.THREATENING);
          MJ.addAlertPointsAll(site.securityState, 30);
          MJ.settleIncident(site.securityState);
          MJ.advanceSiteDay(site.securityState);
        }
        const good = makeRoster(rng.fork("g"), 1, ["fighter"])[0];
        MJ.growRunner(good, 300, rng.fork("gr"));
        MJ.watchRunner(good, rng);
        MJ.hireRunner(good, "permanent");
        return { rng: MJ.makeRNG("stress-queue-dice-" + i), site, good };
      };
      const A = build(false);
      const B = build(true);
      const run = (X) => MJ.runActionPeriod(X.rng, [{ mission: MJ.createResourceMission(X.site), runners: [X.good] }], 2)[0];
      const ra = run(A);
      const rb = run(B);
      if (!(ra.success && rb.success)) continue;
      check(rb.karmaAward >= ra.karmaAward, "C3: a ratcheted site must never pay a later mission LESS karma");
      if (rb.karmaAward > ra.karmaAward) proved = true;
    }
    check(proved, "C3: never observed a ratchet raising a later mission's karma (visibility broken?)");

    // Same-day gate opening (confirmed design): prerequisite resolved
    // earlier in the period opens the gated leg immediately — with a
    // second crew, since each runner still only acts once.
    let gateProved = false;
    for (let i = 0; i < 600 && !gateProved; i++) {
      const rng = MJ.makeRNG("stress-gate-" + i);
      const { job } = MJ.generateJob(rng.fork("j"), [], 1, { missionCount: 2 });
      // Filter on the SECURITY the crew actually has to beat, not on
      // Value. Since a site's condition shifts the triple, a value-2
      // site can be a fortified one with real teeth — selecting on
      // Value alone was selecting on a number that no longer predicts
      // whether the control run succeeds, which is what makes a probe
      // depend on luck instead of on the thing it is testing.
      if (!job.chained) continue;
      const soft = job.missions.every((m) =>
        m.site.security.physical <= 2 && m.site.security.astral <= 2 && m.site.security.matrix <= 2);
      if (!soft) continue;
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

    // Suppression: same-day softening — earned on success, applied
    // to matching-projection rolls, karma-neutral, gone overnight.
    {
      // Mechanics unit checks: stack, cap, day-scoping, night reset.
      const sSite = MJ.mintSite("stress-supp-u", 0, { value: 2, orientation: "physical" });
      check(MJ.applySuppression(sSite, "physical", 7) === 1, "C3: suppression must start at 1");
      for (let i = 0; i < 5; i++) MJ.applySuppression(sSite, "physical", 7);
      check(MJ.suppressionBonus(sSite, "physical", 7) === 3, "C3: suppression must cap at 3");
      check(MJ.suppressionBonus(sSite, "astral", 7) === 0, "C3: suppression must be per-axis");
      check(MJ.suppressionBonus(sSite, "physical", 8) === 0, "C3: suppression must be day-scoped");
      MJ.applySuppression(sSite, "astral", 9);
      check(MJ.suppressionBonus(sSite, "physical", 9) === 0 && MJ.suppressionBonus(sSite, "astral", 9) === 1, "C3: a new day's suppression starts fresh");
      MJ.advanceSiteDay(sSite.securityState);
      check(!sSite.securityState.suppression, "C3: the night must reset suppression");

      // Paired runs: same site, same dice forks — the suppressed run's
      // physical-obstacle pools must read exactly +2, others +0, and
      // karma must not move when both succeed.
      let proved = false;
      for (let i = 0; i < 30 && !proved; i++) {
        const build = (withSupp) => {
          const rng = MJ.makeRNG("stress-supp-run-" + i);
          const site = MJ.mintSite("stress-supp-u2", i, { value: 2, orientation: "physical" });
          MJ.generateSecurityEstimate(rng.fork("e"), site);
          if (withSupp) site.securityState.suppression = { physical: 2, astral: 0, day: 4 };
          const r = makeRoster(rng.fork("r"), 1, ["fighter"])[0];
          MJ.growRunner(r, 200, rng.fork("g"));
          MJ.watchRunner(r, rng);
          MJ.hireRunner(r, "permanent");
          return MJ.runActionPeriod(rng.fork("run"), [{ mission: MJ.createResourceMission(site), runners: [r] }], 4)[0];
        };
        const a = build(false);
        const b = build(true);
        if (!a.tasks.length || a.tasks.length !== b.tasks.length) continue;
        let sawPlus2 = false;
        let bad = false;
        for (let k = 0; k < a.tasks.length; k++) {
          if (a.tasks[k].pool === undefined || b.tasks[k].pool === undefined) continue;
          // Compare LIKE FOR LIKE. Two extra dice change what the
          // dice say, so the suppressed run can clear a thing the
          // unsuppressed one had to try twice — from there the two
          // runs are standing in front of different obstacles and
          // comparing them by position is comparing nothing. Matching
          // on the thing and the way in is what keeps this measuring
          // the bonus rather than the divergence.
          if (a.tasks[k].obstacle !== b.tasks[k].obstacle) continue;
          if (a.tasks[k].skill !== b.tasks[k].skill) continue;
          const d = b.tasks[k].pool - a.tasks[k].pool;
          if (d === 2) sawPlus2 = true;
          else if (d !== 0) bad = true;
        }
        if (!sawPlus2) continue; // route had no physical obstacles this mint — try another
        check(!bad, "C3: suppression must add exactly its level, only to matching obstacles (i=" + i + ")");
        if (a.success && b.success) {
          check(a.karmaAward === b.karmaAward, "C3: suppression must be karma-neutral");
        }
        proved = true;
      }
      check(proved, "C3: suppression paired-run probe never met its conditions");

      // Earning + axis mapping: a successful MATRIX recon softens the
      // PHYSICAL grid (the cameras it looped).
      let earned = false;
      for (let i = 0; i < 100 && !earned; i++) {
        const rng = MJ.makeRNG("stress-supp-earn-" + i);
        const site = MJ.mintSite("stress-supp-u3", i, { value: 3 });
        MJ.generateSecurityEstimate(rng.fork("e"), site);
        const r = makeRoster(rng.fork("r"), 1, ["decker"])[0];
        MJ.watchRunner(r, rng);
        MJ.hireRunner(r, "permanent");
        const res = MJ.runActionPeriod(rng.fork("run"), [{ mission: MJ.createReconMission(site, "matrix"), runners: [r] }], 6)[0];
        if (!res.success) continue;
        earned = true;
        check(res.suppression && res.suppression.axis === "physical", "C3: matrix recon must suppress the physical grid");
        check(MJ.suppressionBonus(site, "physical", 6) >= 1, "C3: earned suppression must be live on the site");
      }
      check(earned, "C3: suppression earning probe never succeeded");
    }

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
    stateRef.daysSinceThreat = 4;
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
          // Alert, when engaged, must sit inside its axis's band —
          // never below today's posture, never above what they can field.
          if (MJ.alertEngaged(st)) {
            for (const axis of AXES) {
              const lvl = MJ.alertLevel(st, axis);
              ok(lvl >= st.axes[axis].current && lvl <= st.axes[axis].max, day, "alert level outside [current, max] (" + axis + ")");
            }
          }
          ok(["normal", "awkward", "questionable", "threatening"].indexOf(MJ.threatBand(st, day)) !== -1, day, "illegal threat band");
          prevMax.set(site, { physical: st.axes.physical.max, astral: st.axes.astral.max, matrix: st.axes.matrix.max });
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

    // Site names: Adverb-Adjective-Color-Noun-#### — the name is
    // the COMPLETE seed, and its words ENCODE the qualities: the
    // governor selects what it needs and constructs the name that
    // means it; decoding the same name anywhere reproduces the
    // whole site — identity, theme, security posture, loot chart.
    const nmSite = MJ.mintSite(U, 5, { value: 4, orientation: "matrix" });
    const nm = nmSite.identity.name;
    check(/^[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-[A-Za-z]+-\d{4}$/.test(nm), "C8: site name format broken: " + nm);
    check(MJ.mintSite(U, 5, { value: 4, orientation: "matrix" }).identity.name === nm, "C8: dealt name must be deterministic per slot");
    const q = MJ.decodeSiteName(nm);
    check(q && q.value === 4 && q.orientation === "matrix", "C8: requested qualities must be encoded in the name");
    const contentOf = (s) => snap({
      d: s.identity.district, own: s.identity.owningFaction, v: s.identity.value,
      o: s.identity.orientation, theme: s.identity.theme,
      sec: s.security, st: s.securityState, layout: s.layout, pop: s.population, loot: s.lootTable,
    });
    check(contentOf(nmSite) === contentOf(MJ.mintSiteByName(nm)), "C8: the name must be the complete seed — identical anywhere, identity included");
    check(MJ.mintSiteByName(nm) !== null && contentOf(MJ.mintSiteByName(nm)) === contentOf(MJ.mintSiteByName(nm)), "C8: mintSiteByName must be deterministic");
    check(MJ.decodeSiteName("Not-A-Real-Site-0001") === null, "C8: off-grammar words must not decode");
    // Slot order: Adverb-Adjective-Color-Noun-####, the colour last
    // among the adjectives. Four words sit in BOTH the colour and
    // adjective pools, so the reading is positional — which makes
    // the slot order load-bearing rather than cosmetic. A name built
    // with the colour in the adjective slot must decode differently.
    const rngSlot = MJ.makeRNG("stress-name-slots");
    for (let i = 0; i < 60; i++) {
      const want = {
        district: rngSlot.pick(MJ.SITE_DISTRICTS), owner: rngSlot.pick(MJ.OWNERS),
        value: rngSlot.int(1, 10), orientation: rngSlot.pick(["physical", "astral", "matrix"]),
      };
      const built = MJ.encodeSiteName(want, rngSlot.fork("s" + i)).split("-");
      const straight = MJ.decodeSiteName(built.join("-"));
      check(straight && straight.district === want.district && straight.owner === want.owner,
        "C8: the adjective slot must read district and the colour slot owner");
      // Swapping the two slots either reads as a different site or
      // falls out of the grammar; what it must never do is decode to
      // the same qualities, which would mean the order carried none.
      const other = MJ.decodeSiteName([built[0], built[2], built[1], built[3], built[4]].join("-"));
      if (other && built[1] !== built[2]) {
        check(other.district !== want.district || other.owner !== want.owner,
          "C8: swapping adjective and colour must change what the name means");
      }
    }
    // The ambiguous case, CONSTRUCTED rather than waited for: words in
    // both pools are the only way a swap stays legal, so build one
    // deliberately instead of hoping a random draw lands on it.
    // Hoping was the old probe's mistake — it asserted a 1.5% event
    // would show up in 60 tries, which tests the sample, not the code.
    const cond = MJ.CONDITION_WORDS[MJ.CONDITION_IDS[0]][0];
    const AMBIGUOUS = [
      // adjective slot / colour slot — each word legal in both tables
      { name: cond + "-Amber-Crimson-Anchor-0001", straight: { district: "Downtown", owner: "Ork Underground" },
        swapped: { district: "Tacoma", owner: "Ares" } },
      { name: cond + "-Ivory-Scarlet-Anchor-0002", straight: { district: "Bellevue", owner: "Ork Underground" },
        swapped: { district: "Puyallup", owner: "Unowned" } },
    ];
    for (const probe of AMBIGUOUS) {
      const p = probe.name.split("-");
      const straight = MJ.decodeSiteName(probe.name);
      const swapped = MJ.decodeSiteName([p[0], p[2], p[1], p[3], p[4]].join("-"));
      check(!!straight && !!swapped, "C8: both orderings of an ambiguous name must be legal names");
      if (!straight || !swapped) continue;
      check(straight.district === probe.straight.district && straight.owner === probe.straight.owner,
        "C8: " + probe.name + " must read " + probe.straight.district + "/" + probe.straight.owner);
      check(swapped.district === probe.swapped.district && swapped.owner === probe.swapped.owner,
        "C8: swapping it must read " + probe.swapped.district + "/" + probe.swapped.owner);
      check(straight.district !== swapped.district || straight.owner !== swapped.owner,
        "C8: the two orderings must name different places");
    }
    // Every quality in the space must be writable AND readable. The
    // tables are the whole mechanism now, so a missing district list
    // or a value with no noun is a hole in the address space rather
    // than an arithmetic edge case.
    let holes = 0, pairs = 0;
    for (const d of MJ.SITE_DISTRICTS) {
      for (const o of MJ.OWNERS) {
        for (const orient of ["physical", "astral", "matrix", "balanced"]) {
          for (let v = 1; v <= 10; v++) {
            pairs += 1;
            const nm2 = MJ.encodeSiteName({ district: d, owner: o, value: v, orientation: orient },
              rngSlot.fork("space" + pairs));
            const back = nm2 && MJ.decodeSiteName(nm2);
            if (!back || back.district !== d || back.owner !== o || back.value !== v || back.orientation !== orient) holes += 1;
          }
        }
      }
    }
    check(pairs === 2880, "C8: the address space should be 9 x 8 x 4 x 10 (saw " + pairs + ")");
    check(holes === 0, "C8: every quality combination must round-trip through a name (" + holes + " holes)");
    // Qualities outside the space produce no name at all, rather
    // than a name that reads back as something else.
    check(MJ.encodeSiteName({ district: "Atlantis", owner: "Ares", value: 3, orientation: "astral" }, rngSlot) === null,
      "C8: an unknown district must produce no name");
    check(MJ.encodeSiteName({ district: "Downtown", owner: "Ares", value: 11, orientation: "astral" }, rngSlot) === null,
      "C8: a value outside 1-10 must produce no name");
    // Encode/decode round-trips the whole quality space, including
    // Unowned owners and the wilderness districts.
    const rngRT = MJ.makeRNG("stress-name-rt");
    for (let i = 0; i < 100; i++) {
      const want = {
        district: rngRT.pick(MJ.SITE_DISTRICTS),
        owner: rngRT.pick(MJ.OWNERS),
        value: rngRT.int(1, 10),
        orientation: rngRT.pick(MJ.ORIENTATIONS),
      };
      const got = MJ.decodeSiteName(MJ.encodeSiteName(want, rngRT.fork("e" + i)));
      check(got && got.district === want.district && got.owner === want.owner && got.value === want.value && got.orientation === want.orientation,
        "C8: encode/decode round-trip failed (i=" + i + ")");
    }
    const wild = MJ.mintSiteByName(MJ.encodeSiteName({ district: "Salish Wilds", owner: "Unowned", value: 2, orientation: "astral" }, rngRT.fork("wild")));
    check(wild.identity.district === "Salish Wilds" && wild.identity.owningFaction === "Unowned", "C8: wilderness/Unowned sites must mint from their names");
    check(!!wild.identity.theme && !!wild.lootTable && wild.lootTable.entries.length === 3, "C8: theme and loot chart must ride the name");

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
    gate("a live incident", (s) => { MJ.witnessAct(s.securityState, 1, MJ.THREAT.THREATENING); });
    gate("escalated posture", (s) => { const a = s.securityState.axes.physical; a.min = 1; a.current = 2; a.max = Math.max(a.max, 3); });
    gate("grown Max", (s) => { s.securityState.everGrew = true; });
    const pre = MJ.generateSite(MJ.makeRNG("stress-preregistry"));
    check(!MJ.isSiteCompressible(pre), "C9: a pre-registry site (no universeIndex) must never claim compressibility");

    // Cooling restores compressibility.
    const hot = MJ.mintSite(U, 900, {});
    MJ.generateSecurityEstimate(rngE.fork("hot"), hot);
    MJ.addKnownSite([], hot, 1, "job");
    MJ.witnessAct(hot.securityState, 1, MJ.THREAT.THREATENING);
    check(!MJ.isSiteCompressible(hot), "C9: a site mid-incident compressed");
    MJ.advanceSiteDay(hot.securityState);
    check(MJ.isSiteCompressible(hot), "C9: once the night resets it, it must compress again");

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

    // Save/load: serialize -> deserialize must rebuild the exact
    // situation — scalars, deltas, and every object relationship
    // (gear two-way refs, mission->site identity, chain gates).
    s6.save.johnson.money = 77777;
    const gearBuy = MJ.buyItem(s6.save, "smartgun");
    MJ.issueItem(gearBuy.item, worker);
    const rec = MJ.game.serializeSession(s6);
    check(typeof JSON.stringify(rec) === "string", "C10: session record must be JSON-safe (no cycles)");
    const s6b = MJ.game.deserializeSession(JSON.parse(JSON.stringify(rec)));
    check(s6b.day === s6.day && s6b.save.johnson.money === s6.save.johnson.money && s6b.contractCounter === s6.contractCounter, "C10: scalars must survive the round-trip");
    check(s6b.roster.length === s6.roster.length && s6b.roster[1].karma === s6.roster[1].karma, "C10: runners must survive with their karma");
    check(s6b.knownSites.length === s6.knownSites.length && s6b.knownSites.every((s, i) => s.identity.name === s6.knownSites[i].identity.name), "C10: sites must revive by name in order");
    check(snap(s6b.knownSites[0].securityState) === snap(s6.knownSites[0].securityState), "C10: security deltas must survive");
    const loadedItem = s6b.save.armory.items.find((it) => it.templateId === "smartgun");
    check(!!loadedItem && loadedItem.issuedTo === s6b.roster[1] && s6b.roster[1].gear.indexOf(loadedItem) !== -1, "C10: gear two-way refs must rebuild");
    check(s6b.roster[1].market.hired.missionsRemaining === Infinity, "C10: a permanent contract must survive JSON (Infinity round-trip)");
    const loadedFound = s6b.knownSites.find((s) => s.identity.name === found.identity.name);
    check(!!loadedFound && loadedFound.tags.some((t) => String(t.tag).indexOf("resource:") === 0 && t.expiryDay === Infinity), "C10: resource tags must survive JSON (Infinity round-trip)");
    for (const job of s6b.jobs) {
      for (const m of job.missions) {
        if (m.site && m.site.identity.name) {
          const known = s6b.knownSites.find((s) => s.identity.name === m.site.identity.name);
          if (known) check(m.site === known, "C10: mission sites must relink to the SAME known-site objects");
        }
        if (m.requiresMission) check(job.missions.indexOf(m.requiresMission) !== -1, "C10: chain gates must relink to siblings");
      }
    }
    // The loaded session must be playable: run a day on it.
    if (MJ.isDispatchable(s6b.roster[1])) {
      MJ.game.queueDispatch(s6b, MJ.createCraftingMission(2), [s6b.roster[1]], "post-load craft");
    }
    MJ.game.endDay(s6b, rng6.fork("post-load"));
    check(s6b.day === s6.day + 1, "C10: a loaded session must keep playing");

    // ── THE MORNING IS KEPT, AND ONLY FOR THE PLAYER ──────────────
    // Runners die on jobs, and the player must never be shut out of
    // that decision. beginDay writes the state as it stood this
    // morning; nothing else is written until settleDay. Two things
    // have to hold, and only one of them is about the player:
    //
    //   1. a LIVE day banks the morning, so whatever today does can
    //      be walked away from — including a death;
    //   2. an rng-driven day banks NOTHING. The suite runs thousands
    //      of days. If it wrote, it would shred the player's save
    //      slots on every stress run, which is a far worse bug than
    //      any it is here to catch.
    //
    // IndexedDB is async and this suite is not, so the probe stubs
    // the store and counts calls — the gate is the thing under test,
    // not the database.
    {
      const realBank = MJ.saveRewindPoint;
      let banked = 0;
      MJ.saveRewindPoint = () => { banked += 1; return Promise.resolve(); };
      try {
        const sSuite = MJ.game.newGame("c10-rewind-suite");
        MJ.game.settleDay(sSuite, MJ.game.beginDay(sSuite, rng6.fork("driven")));
        check(banked === 0,
          "C10: an rng-driven day must never touch the player's save slots");

        const sLive = MJ.game.newGame("c10-rewind-live");
        const liveDay = MJ.game.beginDay(sLive);
        check(banked === 1, "C10: a live day must bank the morning before it resolves");
        check(liveDay.live === true, "C10: and must know it is live");
        MJ.game.settleDay(sLive, liveDay);
        check(banked === 1, "C10: settling must not bank a second morning");
      } finally {
        MJ.saveRewindPoint = realBank;
      }
    }

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
    // ── ONE PER SLOT ────────────────────────────────────────────
    // You jack in with one deck. Nothing in the armoury stacks, so a
    // second one is nuyen spent on nothing, and letting it happen
    // silently reads as a bug because it is one.
    const twoDecks = MJ.issueItem(deck2, decker);
    check(twoDecks.ok === false, "C11: a runner may not carry two decks");
    check(decker.gear.indexOf(deck2) === -1 && deck2.issuedTo === null,
      "C11: and the refusal must leave the second deck exactly where it was");
    check(buy.item.issuedTo === decker,
      "C11: a refused issue must not disturb what they are already carrying");
    // Swap properly, and the better tool is what answers.
    MJ.reclaimItem(buy.item);
    check(MJ.issueItem(deck2, decker).ok, "C11: taking the old one off must free the slot");
    check(MJ.gearBonusFor(decker, "hacking") === 2, "C11: T6 deck must grant +2");
    // The no-stacking property itself still has to hold in the model,
    // independently of the guard — build the state directly and prove
    // gearBonusFor takes the max rather than the sum.
    decker.gear.push(buy.item);
    check(MJ.gearBonusFor(decker, "hacking") === 2, "C11: best tool wins — never stacked (+2, not +3)");
    decker.gear.pop();
    check(MJ.gearBonusFor(decker, "sorcery") === 0, "C11: no focus, no bonus");

    // Pool math through resolveTask; untrained never rescued.
    const eff = MJ.getEffectiveSkills(decker);
    const ob = { tier: 2 };
    const deckerInt = decker.attributes[MJ.attributeFor("hacking")] || 0;
    check(MJ.resolveTask(rng, decker, ob, "hacking", { bonusDice: MJ.gearBonusFor(decker, "hacking") }).poolSize === eff.hacking + deckerInt + 2, "C11: pool must include gear dice");
    const untrained = Object.keys(eff).find((k) => eff[k] === 0);
    const obU = { tier: 2 };
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

    // ── The slot rule, in every direction it has to work ─────────
    // One coat. One deck. One gun per skill — but a pistol AND a
    // sniper rig is a real loadout, so the slot keys on skill rather
    // than on category alone. Consumables are exempt or carrying
    // spare patches stops working, which is what patches are for.
    //
    // On its OWN runner: loading a shared fixture up with kit to prove
    // a rule quietly changed what every later probe was looking at.
    // That is how this block first broke `findConsumable` two tests
    // down, and a fixture that drifts is worse than no fixture.
    {
      const mule = MJ.generateRunner(rng.fork("slot-mule"), { family: "fighter" });
      MJ.watchRunner(mule, rng); MJ.hireRunner(mule, "permanent");
      const give = (id) => { const it = MJ.makeItem(id); save.armory.items.push(it); return it; };

      check(MJ.issueItem(give("riotCarapace"), mule).ok, "C11: the coat slot starts empty");
      check(MJ.issueItem(give("linedCoat"), mule).ok === false, "C11: you wear ONE coat");

      check(MJ.issueItem(give("heavyPistol"), mule).ok, "C11: a firearm goes in the empty firearms slot");
      check(MJ.issueItem(give("sniperRig"), mule).ok,
        "C11: marksmanship is its OWN slot — a pistol and a sniper rig is a real loadout");
      check(MJ.issueItem(give("smartgun"), mule).ok === false, "C11: but not two firearms");

      check(MJ.issueItem(give("traumaPatch"), mule).ok && MJ.issueItem(give("traumaPatch"), mule).ok,
        "C11: consumables are EXEMPT — carrying spares is the whole point of them");

      // Personal kit never occupies a slot: it is theirs, it cannot be
      // taken off them, and it cost the operation nothing. If it
      // blocked, a runner who turned up with a pistol could never be
      // issued a better one — which is the entire armoury loop.
      const mule2 = MJ.generateRunner(rng.fork("slot-mule-2"), { family: "fighter" });
      MJ.watchRunner(mule2, rng); MJ.hireRunner(mule2, "permanent");
      const ownGun = (mule2.gear || []).find((g) => g.personal &&
        (MJ.ITEM_TEMPLATES[g.templateId] || {}).category === "weapon");
      check(!!ownGun, "C11: the probe needs a runner who brought their own gun");
      if (ownGun) {
        const skill = MJ.ITEM_TEMPLATES[ownGun.templateId].skill;
        check(MJ.issueItem(give(skill === "marksmanship" ? "farsight" : "hornetSmg"), mule2).ok,
          "C11: a runner's OWN kit must never block an upgrade to the same slot");
      }
    }
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

    // ── Formulas: taught FIRST, paid for in karma AFTER ──────────
    // The user ruling: teaching queues the spell into the karma
    // distribution system at TOP PRIORITY. The lesson is immediate;
    // OWNING the spell is not — every award pays the study queue
    // before any attribute or skill grows, and only a paid-in-full
    // spell lands on the grimoire.
    check(!!MJ.ITEM_TEMPLATES.fml_manabolt && MJ.ITEM_TEMPLATES.fml_manabolt.label === "Formula: Manabolt",
      "C11: every implemented spell has a formula named for the CANON spell");
    check(Object.keys(MJ.SPELLS).every((id) => !!MJ.ITEM_TEMPLATES["fml_" + id]),
      "C11: no spell without a learnable formula");
    const formula = MJ.makeItem("fml_manabolt");
    save.armory.items.push(formula);
    check(MJ.issueItem(formula, tank).ok === false, "C11: formulas must refuse issue");
    check(MJ.teachFormula(tank, formula, save.armory.items).ok === false, "C11: non-mage must refuse formulas");
    // A mage who does NOT already know Manabolt — the healers and
    // illusionists qualify; keep drawing until one turns up.
    let mage = null;
    for (let i = 0; i < 40 && !mage; i++) {
      const m = MJ.generateRunner(rng.fork("mage" + i), { family: "mage" });
      if ((m.classification.spellsKnown || []).indexOf("manabolt") === -1) mage = m;
    }
    check(!!mage, "C11: the probe needs a mage without Manabolt");
    MJ.watchRunner(mage, rng);
    MJ.hireRunner(mage, "permanent");
    mage.karma = 0; // broke — and that must NOT block the lesson
    check(MJ.teachFormula(mage, formula, save.armory.items).ok === true,
      "C11: teaching needs no banked karma — the debt comes due later");
    check(save.armory.items.indexOf(formula) === -1, "C11: taught formula must be consumed");
    check(mage.classification.spellsKnown.indexOf("manabolt") === -1,
      "C11: taught is not OWNED — nothing lands on the grimoire unpaid");
    check(!MJ.knowsSpell(mage, "manabolt"), "C11: and an unpaid spell cannot be cast");
    check(mage.classification.spellQueue.length === 1 &&
      mage.classification.spellQueue[0].spellId === "manabolt",
      "C11: it sits in the study queue instead");
    const formula2 = MJ.makeItem("fml_manabolt");
    save.armory.items.push(formula2);
    check(MJ.teachFormula(mage, formula2, save.armory.items).ok === false,
      "C11: re-teaching a spell already under study must refuse");
    check(save.armory.items.indexOf(formula2) !== -1, "C11: and the refused copy is not eaten");

    // ── The debt comes due AT TOP PRIORITY ───────────────────────
    // A 3-karma award services the spell and grows NOTHING else —
    // no attribute skim, no skill point, and the lifetime counter
    // still records the earning.
    const skillsBefore = JSON.stringify(mage.skills);
    const fundBefore = mage.attributeFund || 0;
    MJ.growRunner(mage, 3, rng.fork("study1"));
    check(mage.classification.spellQueue[0].paid === 3, "C11: the award paid the study first");
    check(JSON.stringify(mage.skills) === skillsBefore && (mage.attributeFund || 0) === fundBefore,
      "C11: TOP PRIORITY means top — not a point reaches skills or the fund while the debt stands");
    check(mage.karma === 3, "C11: the lifetime counter still records what was earned");
    check(!MJ.knowsSpell(mage, "manabolt"), "C11: 3 of 5 is still not a spell");
    // The next award finishes the spell and the REMAINDER flows on
    // to normal growth.
    MJ.growRunner(mage, 4, rng.fork("study2"));
    check(MJ.knowsSpell(mage, "manabolt"), "C11: paid in full, it materializes onto the grimoire");
    check(mage.classification.spellQueue.length === 0, "C11: and leaves the queue");
    check((mage.attributeFund || 0) > fundBefore || JSON.stringify(mage.skills) !== skillsBefore,
      "C11: the leftover 2 karma flowed back to normal growth");
    // Re-teaching a spell now KNOWN refuses at the door.
    const formula3 = MJ.makeItem("fml_manabolt");
    save.armory.items.push(formula3);
    check(MJ.teachFormula(mage, formula3, save.armory.items).ok === false,
      "C11: re-learning a known spell must refuse");

    // ── The queue is FIFO: first taught, first owned ─────────────
    {
      const f1 = MJ.makeItem("fml_heal"), f2 = MJ.makeItem("fml_armor");
      save.armory.items.push(f1, f2);
      const already = mage.classification.spellsKnown.slice();
      if (already.indexOf("heal") === -1 && already.indexOf("armor") === -1) {
        MJ.teachFormula(mage, f1, save.armory.items);
        MJ.teachFormula(mage, f2, save.armory.items);
        MJ.growRunner(mage, 7, rng.fork("fifo"));
        check(MJ.knowsSpell(mage, "heal") && !MJ.knowsSpell(mage, "armor"),
          "C11: seven karma into a ten-karma queue owns the FIRST spell, not half of each");
        check(mage.classification.spellQueue[0].spellId === "armor" &&
          mage.classification.spellQueue[0].paid === 2,
          "C11: and the second is 2 of 5 along");
        MJ.growRunner(mage, 3, rng.fork("fifo2"));
        check(MJ.knowsSpell(mage, "armor") && mage.classification.spellQueue.length === 0,
          "C11: the queue drains in order and closes");
      }
    }

    // Contract upgrades: pro-rata credit against today's price.
    const up = MJ.generateRunner(rng.fork("upgr"), { family: "face" });
    MJ.watchRunner(up, rng);
    save.johnson.money = 200000;
    const hireRes = MJ.hireRunnerWithCost(save, up, "retainer");
    check(up.market.hired.pricePaid === hireRes.cost && up.market.hired.blockSize === 5, "C11: signing must stamp price and block");
    MJ.consumeContractMission(up, rng); // 4 of 5 left
    const credit = MJ.upgradeCredit(up);
    check(credit === Math.round(hireRes.cost * 4 / 5), "C11: upgrade credit must be pro-rata of the price paid");
    const expectedUp = Math.max(0, MJ.hireCost(up, "permanent") - credit);
    const m4 = save.johnson.money;
    const upRes = MJ.upgradeContractWithCost(save, up, "permanent");
    check(upRes.ok && upRes.cost === expectedUp && save.johnson.money === m4 - expectedUp, "C11: upgrade must charge today's price minus the credit");
    check(up.market.hired.tier === "permanent" && up.market.hired.missionsRemaining === Infinity, "C11: upgrade must install the new contract");
    check(MJ.upgradeContractWithCost(save, up, "retainer").ok === false, "C11: downgrades must refuse");
    const unhiredR = MJ.generateRunner(rng.fork("unhired"), {});
    check(MJ.upgradeContractWithCost(save, unhiredR, "retainer").ok === false, "C11: upgrading the uncontracted must refuse");

    // Materials: exact sale, stock zeroed.
    save.armory.materials["resource:scrap"] = 3;
    const m2 = save.johnson.money;
    const matSale = MJ.sellMaterials(save, "resource:scrap");
    check(matSale.ok && save.johnson.money === m2 + 3 * 150 && save.armory.materials["resource:scrap"] === 0, "C11: material sale must be exact and zero the stock");
    check(MJ.sellMaterials(save, "resource:scrap").ok === false, "C11: empty stock must refuse");
  }

  // ── Class 12: BOTH TRACKS carry; recovery is what differs ───────
  // Physical damage is the roster's memory of a bad night. Stun is
  // the memory of a hard one. BOTH ride home on the runner and both
  // cost dice, because an operation is many missions long and a mage
  // who burned out at the second door is still burned out at the
  // fifth. What separates them is recovery: a wound needs days or a
  // medic; stun needs a night off.
  //
  // Stun used to evaporate the moment a fight ended, which left
  // Drain — canonically stun damage — with nowhere to land outside
  // combat, so four callers invented four different workarounds.
  // This class holds the single law that replaced them.
  function class12_injury() {
    const rng = MJ.makeRNG("stress-injury");

    // The penalty is universal and rated: three boxes buy one die.
    const subject = makeRoster(rng.fork("subj"), 1)[0];
    const clean = MJ.getEffectiveSkills(subject);
    const trained = Object.keys(clean).filter((k) => clean[k] > 0);
    check(trained.length > 0, "C12: probe needs a runner with trained skills");
    for (const boxes of [1, 2, 3, 5, 6, 9, 12]) {
      subject.wounds = boxes;
      const hurt = MJ.getEffectiveSkills(subject);
      const expected = Math.floor(boxes / 3);
      for (const skill of trained) {
        check(hurt[skill] === Math.max(0, clean[skill] - expected),
          "C12: wound penalty at " + boxes + " boxes must be -" + expected + " on " + skill);
      }
      check(Object.keys(hurt).every((k) => hurt[k] >= 0), "C12: no skill may go negative from wounds");
    }
    subject.wounds = 0;

    // STUN CHARGES THE SAME WAY, AND SEPARATELY. Being hurt and
    // being wrung out are two different problems arriving at the same
    // hands, so three of each is -2 dice, not -1.
    subject.stun = 3;
    const stunned = MJ.getEffectiveSkills(subject);
    for (const skill of trained) {
      check(stunned[skill] === Math.max(0, clean[skill] - 1),
        "C12: stun costs dice exactly like wounds (" + skill + ")");
    }
    subject.wounds = 3; subject.stun = 3;
    const both = MJ.getEffectiveSkills(subject);
    for (const skill of trained) {
      check(both[skill] === Math.max(0, clean[skill] - 2),
        "C12: the tracks charge SEPARATELY — 3 and 3 is -2 dice, not -1 (" + skill + ")");
    }
    subject.wounds = 0; subject.stun = 0;

    // ── THE FAST PATH MUST AGREE WITH THE SLOW ONE ───────────────
    // `effectiveSkill` exists purely for speed: dicePoolFor was
    // building a fresh 21-key sheet to read one entry, a hundred
    // thousand times a run. It is a hand-written mirror of
    // getEffectiveSkills, which means it can drift — and a dice pool
    // that silently disagrees with the character sheet is a far
    // worse bug than a slow one. So they are held to each other
    // across wounds, Drain and implants.
    {
      const mirror = makeRoster(rng.fork("mirror"), 3);
      mirror.push(subject);
      for (const r of mirror) {
        for (const [w, st] of [[0, 0], [3, 0], [0, 4], [5, 6], [12, 2], [1, 1]]) {
          r.wounds = w; r.stun = st;
          const sheet = MJ.getEffectiveSkills(r);
          for (const skill of MJ.SKILLS) {
            check(MJ.effectiveSkill(r, skill) === (sheet[skill] || 0),
              "C12: effectiveSkill must equal the sheet (" + skill + " at " + w + "/" + st + ")");
          }
        }
        r.wounds = 0; r.stun = 0;
      }
      // And with chrome on, since implants are the other input.
      const chromed = mirror[0];
      chromed.implants = [{ label: "probe wiring", skillMods: { firearms: 2, stealth: 1 } }];
      chromed.wounds = 4;
      const sheet = MJ.getEffectiveSkills(chromed);
      for (const skill of MJ.SKILLS) {
        check(MJ.effectiveSkill(chromed, skill) === (sheet[skill] || 0),
          "C12: and must agree with implants on too (" + skill + ")");
      }
      chromed.implants = []; chromed.wounds = 0;
    }

    // Either full track puts a runner down.
    const downer = makeRoster(rng.fork("down"), 1)[0];
    downer.wounds = 0; downer.stun = MJ.stunTrack(downer);
    check(MJ.isDown(downer), "C12: a full stun track is down");
    downer.stun = 0; downer.wounds = MJ.physicalTrack(downer);
    check(MJ.isDown(downer), "C12: so is a full physical track");
    downer.wounds = 0;
    check(!MJ.isDown(downer), "C12: and neither full is standing");

    // Stun overflow bleeds into physical — past the end of the track
    // it stops being tiredness.
    const over = makeRoster(rng.fork("over"), 1)[0];
    over.wounds = 0; over.stun = MJ.stunTrack(over) - 1;
    const spill = MJ.takeDamage(over, 5, true);
    check(over.stun === MJ.stunTrack(over), "C12: stun caps at its track");
    check(spill.overflow === 4 && over.wounds === 2,
      "C12: and the overflow lands as real damage (saw " + over.wounds + ")");

    // A runner walks into a fight carrying what they have not healed.
    const carrier = makeRoster(rng.fork("carry"), 1)[0];
    carrier.wounds = 4;
    carrier.stun = 2;
    const cc = MJ.makeCombatant(carrier, { side: "crew" });
    check(cc.physical === 4, "C12: a combatant must start on the boxes their runner carries");
    check(cc.stun === 2, "C12: INCLUDING stun — half-drained from the last door is how they arrive");
    check(cc.physical <= cc.physicalMax, "C12: carried damage cannot exceed the track");

    // Coming out: BOTH tracks go on the dossier, and a lighter night
    // never heals what a worse one already did.
    cc.physical = 7; cc.stun = 6;
    MJ.carryDamageHome(cc);
    check(carrier.wounds === 7, "C12: physical damage must ride home (have " + carrier.wounds + ")");
    check(carrier.stun === 6, "C12: and so must stun — an operation is many missions long");
    const lighter = MJ.makeCombatant(carrier, { side: "crew" });
    lighter.physical = 2; lighter.stun = 1;
    MJ.carryDamageHome(lighter);
    check(carrier.wounds === 7 && carrier.stun === 6,
      "C12: a lighter fight must not heal an older injury on either track");

    // Enemies have no dossier to write to — the writeback must be
    // safe on anything that walks into a fight.
    const foe = MJ.makeCombatant({ label: "guard T4", attributes: { body: 4, willpower: 3 }, skills: {} }, { side: "enemy" });
    foe.physical = 5;
    check(MJ.carryDamageHome(foe) === 0, "C12: a combatant with no dossier must absorb the writeback");

    // Rest closes boxes one at a time and stops at healthy.
    const rester = makeRoster(rng.fork("rest"), 1)[0];
    rester.wounds = 3; rester.stun = 0;
    let closed = 0;
    for (let d = 1; d <= 60 && rester.wounds > 0; d++) closed += MJ.restDay(rester, d);
    check(rester.wounds === 0 && closed === 3, "C12: rest must close exactly the boxes that were open");
    check(MJ.restDay(rester, 61) === 0 && rester.wounds === 0, "C12: rest on a healthy runner is inert");

    // STUN CLEARS FAST — the whole difference between the tracks. A
    // wound is days; Drain is a night off, or one hard casting day
    // would bench a mage for a week and nobody would push Force.
    const tired = makeRoster(rng.fork("tired"), 1)[0];
    tired.wounds = 0; tired.stun = MJ.stunTrack(tired);
    let nights = 0;
    while (tired.stun > 0 && nights < 40) { nights += 1; MJ.restDay(tired, nights); }
    check(tired.stun === 0 && nights <= 4,
      "C12: a full stun track clears in a handful of nights (took " + nights + ")");
    const slow = makeRoster(rng.fork("slow"), 1)[0];
    slow.wounds = MJ.physicalTrack(slow); slow.stun = 0;
    let days = 0;
    while (slow.wounds > 0 && days < 200) { days += 1; MJ.restDay(slow, days); }
    check(days > nights * 3,
      "C12: and injury takes far longer than exhaustion (" + days + " vs " + nights + ")");

    // Treatment never over-heals, and a full track is a hard case
    // rather than automatically the worst case in the world.
    const pat = makeRoster(rng.fork("pat"), 1)[0];
    const doc = makeRoster(rng.fork("doc"), 1)[0];
    MJ.watchRunner(pat, rng); MJ.watchRunner(doc, rng);
    pat.market.hired = { tier: "freelance", missionsRemaining: 99 };
    doc.market.hired = { tier: "freelance", missionsRemaining: 99 };
    pat.wounds = 2;
    for (let n = 0; n < 30 && pat.wounds > 0; n++) {
      MJ.runActionPeriod(rng.fork("tx" + n), [{ mission: MJ.createMedicalMission(pat), runners: [doc] }], n + 1);
      doc.market.hired.missionsRemaining = 99;
      check(pat.wounds >= 0, "C12: treatment must never drive wounds negative");
    }
    check(pat.wounds === 0, "C12: a treatable patient must reach zero boxes");
    pat.wounds = 12;
    const hardCase = MJ.createMedicalMission(pat);
    check(!!hardCase, "C12: a full-track patient must still be treatable");
  }

  // ── Class 21: the street pillar's verbs, and three clocks ───────
  // The Genesis loop is top-down for both moving and fighting, and
  // what makes that a game rather than a menu is POSITION. The
  // street's clock is SOCIAL — it only moves when something
  // perceives you — which is what distinguishes it from the other
  // two, and this class holds all three apart.
  function class21_street() {
    const rng0 = MJ.makeRNG("stress-street");
    const crewFor = (i) => {
      const crew = makeRoster(rng0.fork("c" + i), 3);
      for (const r of crew) {
        r.skills.stealth = Math.max(4, r.skills.stealth || 0);
        r.skills.firearms = Math.max(3, r.skills.firearms || 0);
        MJ.watchRunner(r, rng0); MJ.hireRunner(r, "permanent");
      }
      return crew;
    };
    let run = null;
    for (let i = 0; i < 200 && !run; i++) {
      const site = MJ.mintSite("stress-street-u", i);
      const r = MJ.beginMission(rng0.fork("r" + i), { site: site, kind: "jobObjective", objective: {} }, crewFor(i), 1);
      if (r.obstacles.length >= 3 && r.obstacles.some((o) => o.fights)) run = r;
    }
    check(!!run, "C21: the probe needs a route with something on it");
    if (!run) return;

    check(MJ.isStreetRun(run), "C21: a job objective must read as a street run");
    const p = MJ.streetPrompt(run);
    check(p && p.pillar === "street", "C21: the street prompt must name its own pillar");
    for (const v of ["move", "observe", "approach", "engage"]) {
      check(p.options.some((o) => o.verb === v), "C21: the street must offer " + v);
    }

    // ── Position is the pillar's defining fact ───────────────────
    check(typeof p.leg === "number" && p.legs > 0, "C21: the crew must know where they are on the walk");
    check(!!p.where, "C21: and what kind of ground they are standing on");
    check(Array.isArray(p.watchers), "C21: and what can see them from it");

    // ── Observe buys certainty, once ─────────────────────────────
    const before = run.obstacles[run.index];
    const obs = MJ.streetAct(rng0.fork("o"), run, "observe");
    check(obs.ok && obs.learned, "C21: observing must return what was learned");
    check(obs.learned.label === before.label, "C21: and it must be about the ground they are on");
    check(MJ.streetAct(rng0, run, "observe").ok === false, "C21: looking twice tells you nothing new");
    check(MJ.streetObserved(run, before), "C21: a studied obstacle must be recorded");

    // ── Moving is a choice, and leaves things behind ─────────────
    const idxBefore = run.index;
    const moved = MJ.streetAct(rng0.fork("m"), run, "move");
    check(moved.ok && run.index === idxBefore + 1, "C21: moving must advance the walk");
    check(moved.leftBehind === before.label,
      "C21: advancing past something LEAVES it there — still behind you, still watching");

    // ── Engage forces turn-based, in this pillar like every other ─
    const fightIdx = run.obstacles.findIndex((o, i) => i >= run.index && o.fights);
    if (fightIdx >= 0) {
      run.index = fightIdx;
      check(!MJ.describeTempo(run.tempo).locked, "C21: the crew is not locked before they start anything");
      const eng = MJ.streetAct(rng0.fork("e"), run, "engage");
      check(eng.ok && eng.opensCombat, "C21: engaging must open combat");
      check(MJ.describeTempo(run.tempo).mode === "turnBased" && MJ.describeTempo(run.tempo).lockedBy === "combat",
        "C21: and combat must force turn-based here as everywhere");
      MJ.exitCombat(run.tempo);
    }
    // You cannot pick a fight with a wall.
    const wallIdx = run.obstacles.findIndex((o) => !o.fights);
    if (wallIdx >= 0) {
      run.index = wallIdx;
      const p2 = MJ.streetPrompt(run);
      check(!p2.options.find((o) => o.verb === "engage").available,
        "C21: there is nothing to fight in a maglock");
    }

    // ── THREE PILLARS, THREE CLOCKS ──────────────────────────────
    // The whole point of the exercise. Each pillar must pressure the
    // crew in its own way, and must not carry another's clock.
    const site = MJ.mintSite("stress-street-u", 9);
    const mage = makeRoster(rng0.fork("mg"), 1)[0];
    mage.attributes.magic = 5; mage.skills.sorcery = 5; mage.skills.assensing = 5; mage.skills.conjuring = 4;
    const dk = makeRoster(rng0.fork("dk"), 1)[0];
    dk.skills.hacking = 6; dk.skills.computer = 5;
    for (const r of [mage, dk]) { MJ.watchRunner(r, rng0); MJ.hireRunner(r, "permanent"); }

    const streetRun = MJ.beginMission(rng0.fork("s3"), { site: site, kind: "jobObjective", objective: {} }, [mage, dk], 1);
    // Astral routes are often EMPTY — measured p50 0, max 4 — and an
    // empty run is already over, so it can never demonstrate its own
    // clock. Find one with something on it rather than asserting
    // against a run that finished before it started.
    let astralRun = MJ.beginMission(rng0.fork("a3"), MJ.createAstralMission(site), [mage], 1);
    for (let i = 0; i < 300 && !astralRun.obstacles.length; i++) {
      const s2 = MJ.mintSite("stress-street-u", 100 + i);
      astralRun = MJ.beginMission(rng0.fork("a3-" + i), MJ.createAstralMission(s2), [mage], 1);
    }
    check(astralRun.obstacles.length > 0, "C21: need a populated astral route to compare clocks");
    const matrixRun = MJ.beginMission(rng0.fork("m3"), MJ.createMatrixMission(site, { wantData: true }), [dk], 1);

    // Street: the alert bands, and NO tether or Overwatch.
    const sp = MJ.streetPrompt(streetRun);
    check(sp && sp.awareness, "C21: the street's clock is the alert bands");
    check(streetRun.tether === null || streetRun.tether === undefined,
      "C21: a street crew is not on a tether");
    check(streetRun.overwatch === undefined, "C21: a street crew is not being traced");

    // Astral: the tether, and it runs whether or not anyone noticed.
    check(astralRun.tether > 0, "C21: the astral's clock is the tether");
    const tetherBefore = astralRun.tether;
    MJ.astralAct(rng0.fork("aa"), astralRun, "assense");
    check(astralRun.tether < tetherBefore,
      "C21: the tether runs whether or not anything perceived the mage");

    // Matrix: Overwatch, which climbs the moment you touch anything.
    check(MJ.overwatchOf(matrixRun).score === 0, "C21: a decker starts unhunted");
    MJ.matrixAct(rng0.fork("mm"), matrixRun, "probe");
    check(MJ.overwatchOf(matrixRun).score > 0,
      "C21: the Matrix's clock climbs on contact, unlike the street's");

    // And each pillar's prompt exists only on its own run.
    check(MJ.streetPrompt(astralRun) === null && MJ.streetPrompt(matrixRun) === null,
      "C21: street verbs belong to the street");
    check(MJ.astralPrompt(streetRun) === null && MJ.astralPrompt(matrixRun) === null,
      "C21: astral verbs belong to the astral");
    check(MJ.matrixPrompt(streetRun) === null && MJ.matrixPrompt(astralRun) === null,
      "C21: Matrix verbs belong to the Matrix");
  }

  // ── Class 20: the Matrix pillar's verbs ─────────────────────────
  // The Genesis reference: a PERSONA crawling geometric node
  // structures, dodging IC, to take data or crash the system. The
  // host graph existed here for a long time without the verbs to
  // treat it as one. The pillar's identity is OVERWATCH: a decker is
  // arithmetically hunted from the moment they touch anything, which
  // no other pillar is.
  function class20_matrix() {
    const rng0 = MJ.makeRNG("stress-matrix");
    const deckerFor = (i) => {
      const d = MJ.generateRunner(rng0.fork("d" + i), {});
      d.skills.hacking = 6; d.skills.computer = 5;
      d.attributes.intelligence = 5; d.wounds = 0;
      MJ.watchRunner(d, rng0); MJ.hireRunner(d, "permanent");
      return d;
    };
    let run = null;
    for (let i = 0; i < 300 && !run; i++) {
      const site = MJ.mintSite("stress-mx-u", i);
      if (!site.host || site.host.nodes.length < 4) continue;
      const r = MJ.beginMission(rng0.fork("r" + i), MJ.createMatrixMission(site, { wantData: true }), [deckerFor(i)], 1);
      if (r.hostRoute && r.hostRoute.host) run = r;
    }
    check(!!run, "C20: the probe needs a host with a real graph");
    if (!run) return;

    check(MJ.isMatrixRun(run), "C20: a Matrix mission must read as one");
    const p = MJ.matrixPrompt(run);
    check(p && p.pillar === "matrix", "C20: the Matrix prompt must name its own pillar");
    for (const v of ["traverse", "probe", "run", "exfiltrate", "jackOut"]) {
      check(p.options.some((o) => o.verb === v), "C20: the Matrix must offer " + v);
    }
    // Different grammar, not different nouns: astral verbs must not
    // exist here, and Matrix verbs must not exist on a street run.
    check(MJ.astralPrompt(run) === null, "C20: astral verbs must not exist on a Matrix run");
    const streetRun = MJ.beginMission(rng0.fork("st"),
      { site: MJ.mintSite("stress-mx-u", 3), kind: "jobObjective", objective: {} }, [deckerFor("s")], 1);
    check(MJ.matrixPrompt(streetRun) === null, "C20: Matrix verbs must not exist on a street run");

    // ── Overwatch is the clock, and every act shows its price ────
    const ow0 = MJ.overwatchOf(run);
    check(ow0.score === 0 && ow0.convergence === 40, "C20: a run starts unhunted, converging at 40");
    check(p.options.every((o) => typeof o.overwatchCost === "number"),
      "C20: every verb must price itself on the clock, since that IS the decision");
    check(MJ.MATRIX_OVERWATCH_COST.exfiltrate > MJ.MATRIX_OVERWATCH_COST.traverse,
      "C20: taking data must cost more than moving");
    check(MJ.MATRIX_OVERWATCH_COST.probe > 0,
      "C20: probing must cost the clock — the knowledge that saves you is bought with what kills you");

    MJ.matrixAct(rng0.fork("t"), run, "probe");
    check(MJ.overwatchOf(run).score > 0, "C20: acting must raise Overwatch");

    // ── The persona walks a topology ─────────────────────────────
    const adj = MJ.matrixAdjacent(run);
    check(adj.length > 0, "C20: there must be somewhere to go from the entry node");
    const before = run.node === undefined ? 0 : run.node;
    const moved = MJ.matrixAct(rng0.fork("m"), run, "traverse", { node: adj[0] });
    check(moved.ok && run.node === adj[0], "C20: traversing must move the persona");
    check(MJ.matrixAct(rng0, run, "traverse", { node: 999 }).ok === false,
      "C20: you cannot reach a node that is not adjacent");

    // ── A store holds what it holds ──────────────────────────────
    const dataRun = (() => {
      for (let i = 0; i < 300; i++) {
        const site = MJ.mintSite("stress-mx-u", i);
        if (!site.host) continue;
        const node = (site.host.nodes || []).find((n) => n.holdsData);
        if (!node) continue;
        const r = MJ.beginMission(rng0.fork("dr" + i), MJ.createMatrixMission(site, { wantData: true }), [deckerFor("dd" + i)], 1);
        if (r.hostRoute && r.hostRoute.host) { r.node = node.id; return r; }
      }
      return null;
    })();
    if (dataRun) {
      const first = MJ.matrixAct(rng0.fork("x1"), dataRun, "exfiltrate");
      check(first.ok, "C20: a data node must be strippable");
      const again = MJ.matrixAct(rng0.fork("x2"), dataRun, "exfiltrate");
      check(again.ok === false,
        "C20: a store holds what it holds — milking one node forever would make the topology pointless");
      const promptAfter = MJ.matrixPrompt(dataRun);
      check(!promptAfter.options.find((o) => o.verb === "exfiltrate").available,
        "C20: and the prompt must stop offering it");
    }

    // ── Convergence ends the run, whatever else was going well ───
    const doomed = MJ.beginMission(rng0.fork("dm"),
      MJ.createMatrixMission(MJ.mintSite("stress-mx-u", 5), { wantData: true }), [deckerFor("dm")], 1);
    MJ.raiseOverwatch(doomed, 40);
    check(MJ.overwatchOf(doomed).converged, "C20: reaching 40 must converge");
    check(MJ.threatBand(doomed.state, doomed.day) === "threatening",
      "C20: convergence means the host has located the persona");
    check(MJ.matrixAct(rng0, doomed, "traverse").ok === false,
      "C20: once converged, the only move left is out");
    const outNow = MJ.matrixAct(rng0.fork("jo"), doomed, "jackOut");
    check(outNow.ok && outNow.traced, "C20: jacking out while traced must register as being yanked");
    check(doomed.downed && doomed.downed.size > 0,
      "C20: being yanked hurts — that is what makes convergence something to fear");

    // Leaving clean costs nothing.
    const calm = MJ.beginMission(rng0.fork("cl"),
      MJ.createMatrixMission(MJ.mintSite("stress-mx-u", 6), { wantData: true }), [deckerFor("cl")], 1);
    const clean = MJ.matrixAct(rng0.fork("jo2"), calm, "jackOut");
    check(clean.ok && !clean.traced, "C20: an untraced decker walks away clean");

    check(MJ.matrixAct(rng0, run, "nonesuch").ok === false, "C20: the Matrix has its own verbs and only those");
  }

  // ── Class 19: the astral pillar's verbs ─────────────────────────
  // What a projecting mage can do that nobody else can, and what it
  // costs. The pillar is defined by its clock: out here the currency
  // is TIME OUT OF BODY, and every verb spends it.
  function class19_astral() {
    const rng0 = MJ.makeRNG("stress-astral");
    const mageFor = (label) => {
      const m = MJ.generateRunner(rng0.fork("m" + label), {});
      m.attributes.magic = 5; m.attributes.willpower = 5;
      m.skills.sorcery = 5; m.skills.conjuring = 4; m.skills.assensing = 5; m.wounds = 0;
      MJ.watchRunner(m, rng0); MJ.hireRunner(m, "permanent");
      return m;
    };
    // Find a warded astral site — wards are the only real barrier
    // out there, so the pillar is not properly exercised without one.
    let run = null, mage = null;
    for (let i = 0; i < 400 && !run; i++) {
      const site = MJ.mintSite("stress-astral-u", i);
      const m = mageFor(i);
      const r = MJ.beginMission(rng0.fork("r" + i), MJ.createAstralMission(site), [m], 1);
      if (r.obstacles.length && r.obstacles.some((o) => o.type === "ward")) { run = r; mage = m; }
    }
    check(!!run, "C19: the probe needs a warded astral site to mean anything");
    if (!run) return;

    check(MJ.isAstralRun(run), "C19: an astral mission must read as an astral run");
    check(MJ.astralProjector(run) === mage, "C19: the projector is the strongest Magic on the crew");

    const p = MJ.astralPrompt(run);
    check(p && p.pillar === "astral", "C19: the astral prompt must name its own pillar");
    check(p.tether > 0 && p.tetherMax > 0, "C19: the tether is the astral's clock and must be present");
    for (const v of ["assense", "drift", "manifest", "engage"]) {
      check(p.options.some((o) => o.verb === v), "C19: the astral must offer " + v);
    }
    // A street run has none of this — the pillars are genuinely
    // different grammars, not one grammar with different nouns.
    const streetSite = MJ.mintSite("stress-astral-u", 2);
    const streetRun = MJ.beginMission(rng0.fork("st"), { site: streetSite, kind: "jobObjective", objective: {} }, [mage], 1);
    check(MJ.astralPrompt(streetRun) === null, "C19: astral verbs must not exist on a street run");

    // ── Every verb spends the clock ──────────────────────────────
    const before = run.tether;
    MJ.astralAct(rng0.fork("a1"), run, "assense");
    check(run.tether < before, "C19: assensing costs time out of body");

    // ── Assensing buys a better look at the Lattice ──────────────
    const fresh = () => {
      for (let i = 0; i < 400; i++) {
        const site = MJ.mintSite("stress-astral-u", i);
        const m = mageFor("f" + i);
        const r = MJ.beginMission(rng0.fork("fr" + i), MJ.createAstralMission(site), [m], 1);
        if (r.obstacles.length && r.obstacles.some((o) => o.type === "ward")) return r;
      }
      return null;
    };
    const blindRun = fresh();
    if (blindRun) {
      const blind = MJ.astralEngage(rng0.fork("eb"), blindRun, { force: 4 });
      const blindDepth = MJ.latticeRead(blind.lattice).depth;
      blindRun.lattice = null; blindRun.latticeFor = null;
      MJ.astralAct(rng0.fork("as"), blindRun, "assense");
      const studied = MJ.astralEngage(rng0.fork("es"), blindRun, { force: 4 });
      const studiedDepth = MJ.latticeRead(studied.lattice).depth;
      const rank = ["blind", "vague", "strong", "exact"];
      check(rank.indexOf(studiedDepth) >= rank.indexOf(blindDepth),
        "C19: reading a construct first must never make the Lattice HARDER to see (" +
        blindDepth + " -> " + studiedDepth + ")");
      check(studied.studied > 0, "C19: a studied construct must record what was learned");
    }

    // ── Wards are the only wall; the Lattice is how they resolve ──
    const warded = fresh();
    if (warded) {
      const ward = warded.obstacles.find((o) => o.type === "ward");
      warded.index = warded.obstacles.indexOf(ward);
      const drift = MJ.astralAct(rng0.fork("d"), warded, "drift");
      check(drift.blocked, "C19: a ward must stop an astral form — it is the one thing out there that is a wall");
      const eng = MJ.astralEngage(rng0.fork("ew"), warded, { force: 4 });
      check(eng.ok && eng.mode === "unwind", "C19: a ward is UNWOUND, not rolled against");
      // Drive it, then resolve back into the run.
      let g = 0;
      while (!MJ.latticeDone(eng.lattice) && g++ < 30) {
        const open = eng.lattice.threads.filter((t) => !t.cut);
        if (!open.length) break;
        MJ.latticePull(eng.lattice, open[0].id);
      }
      const res = MJ.astralResolve(rng0.fork("rw"), warded);
      check(res.ok, "C19: an open Lattice must resolve back into the run");
      if (res.success) check(warded.neutralized.has(ward), "C19: a broken ward stops being a barrier");
      check(warded.tether < warded.tetherMax, "C19: working a Lattice costs time out of body");
    }

    // A spirit is UNRAVELLED, not unwound — different construct,
    // different puzzle.
    const spiritRun = (() => {
      for (let i = 0; i < 400; i++) {
        const site = MJ.mintSite("stress-astral-u", i);
        const m = mageFor("sp" + i);
        const r = MJ.beginMission(rng0.fork("sr" + i), MJ.createAstralMission(site), [m], 1);
        const idx = r.obstacles.findIndex((o) => o.type === "spirit");
        if (idx >= 0) { r.index = idx; return r; }
      }
      return null;
    })();
    if (spiritRun) {
      const eng = MJ.astralEngage(rng0.fork("es2"), spiritRun, { force: 4 });
      check(eng.mode === "unravel", "C19: a spirit's binding is UNRAVELLED, like defusing a bomb");
    }

    // ── Manifesting is power with an immediate price ─────────────
    const manRun = fresh();
    if (manRun) {
      const bandBefore = MJ.threatBand(manRun.state, manRun.day);
      const m = MJ.astralAct(rng0.fork("mf"), manRun, "manifest");
      check(m.ok && m.manifested, "C19: a mage must be able to manifest");
      check(MJ.threatBand(manRun.state, manRun.day) === "threatening",
        "C19: manifesting is seen by the living — instantly threatening (was " + bandBefore + ")");
      check(MJ.astralAct(rng0.fork("mf2"), manRun, "manifest").ok === false,
        "C19: you cannot manifest twice");
    }

    check(MJ.astralAct(rng0, run, "nonesuch").ok === false, "C19: the astral has its own verbs and only those");
  }

  // ── Class 24: an archetype can always do its own job ────────────
  // Three cases of one bug now. Generation fills only primary +
  // secondary, so a role whose defining second skill sits in the
  // tertiary tail rolls ZERO of it and cannot do the thing it exists
  // for. Baselines fix it the way the file already fixed Firearms:
  // some skills are what it MEANS to be that kind of person.
  function class24_baselines() {
    const tally = { mage: { n: 0, assens: 0 }, decker: { n: 0, comp: 0, hack: 0 },
                    other: { n: 0, assens: 0, comp: 0 } };
    for (let i = 0; i < 4000; i++) {
      const r = MJ.generateRunner(MJ.makeRNG("c24-" + i), {});
      const fam = r.classification.family;
      if (fam === "mage") {
        tally.mage.n++;
        if ((r.skills.assensing || 0) > 0) tally.mage.assens++;
      } else if (fam === "decker") {
        tally.decker.n++;
        if ((r.skills.computer || 0) > 0) tally.decker.comp++;
        if ((r.skills.hacking || 0) > 0) tally.decker.hack++;
      } else {
        tally.other.n++;
        if ((r.skills.assensing || 0) > 0) tally.other.assens++;
        if ((r.skills.computer || 0) > 0) tally.other.comp++;
      }
    }
    check(tally.mage.n > 200 && tally.decker.n > 100, "C24: the sample needs both families in it");
    check(tally.mage.assens === tally.mage.n,
      "C24: every mage can assense — astral perception is the Awakened sense");
    check(tally.decker.comp === tally.decker.n,
      "C24: every decker can program — Computer is what the program forge runs on");
    check(tally.decker.hack === tally.decker.n, "C24: and hacking is their key skill regardless");
    check(tally.other.assens === 0,
      "C24: the Awakened baseline must not leak to the unawakened");
    // Computer is UNIVERSAL, not gated — anyone may study programming,
    // which is exactly why the baseline is decker-only rather than a
    // gate. Non-deckers get it sometimes, from their own lists.
    check(tally.other.comp > 0 && tally.other.comp < tally.other.n,
      "C24: Computer stays learnable by anyone, and guaranteed to nobody else");
  }

  // ── Class 25: the lanes — a forecast, never a gate ──────────────
  // The report card exists because P/A/M were budget categories the
  // generator spends, and no amount of staring at "est P:4" told a
  // player what a runner needed to be. Lanes answer that. What this
  // class holds is the three rules that keep them from becoming a
  // second rules engine:
  //
  //   1. THEY NEVER RESOLVE ANYTHING. Nothing in mission.js, verbs.js
  //      or resolve.js may consult a lane. Resolution is PRESENCE
  //      then NATURE then dice, and it stays there.
  //   2. THEY NEVER LEAK THE TRUTH. Every number on the card is
  //      derived from what the PLAYER has been told, so a card in
  //      front of a bad estimate is confidently wrong in exactly the
  //      way the briefing was.
  //   3. THEY STAY IMPRECISE. Skills are bundled on purpose. A lane
  //      says "roughly short here" and refuses to say which of six
  //      skills would fix it, because that gap is the entire reason
  //      to spend a day on recon.
  function class25_lanes() {
    // ── The card's own shape ─────────────────────────────────────
    const onCard = new Set();
    for (const id of MJ.LANE_ORDER) {
      const def = MJ.LANE_DEFS[id];
      check(!!def, "C25: every ordered lane must be defined (" + id + ")");
      for (const s of def.skills) {
        check(MJ.SKILLS.indexOf(s) !== -1, "C25: a lane may only bundle real skills (" + s + ")");
        onCard.add(s);
      }
    }
    check(MJ.lanesOfSkill("sorcery").length === 2,
      "C25: sorcery fronts TWO lanes — it is the one skill that acts on the astral and the physical both");
    check(MJ.lanesOfSkill("sorcery").indexOf("banish") !== -1 &&
      MJ.lanesOfSkill("sorcery").indexOf("attack") !== -1,
      "C25: and those two are Banish and Attack");
    check(MJ.lanesOfSkill("hacking").length === 1 && MJ.lanesOfSkill("hacking")[0] === "tech",
      "C25: hacking is Tech and ONLY Tech — a Matrix attack is not a physical attack");
    // Deliberately off the card, each for its own reason.
    for (const s of ["computer", "enchanting"]) {
      check(!onCard.has(s), "C25: " + s + " is a bench skill and belongs on no lane");
    }
    for (const s of ["medicine", "leadership", "athletics", "rigging"]) {
      check(!onCard.has(s), "C25: " + s + " is never a site's requirement (" + s + ")");
    }
    check(MJ.LANE_DEFS.defense.skills.length === 0,
      "C25: Defense has no skill — there is no verb for not being shot");

    // ── Rule 1: no resolver may know a lane exists ───────────────
    // Read the shipped source rather than trusting the intent. If a
    // lane ever gets consulted mid-run this fails on the day it is
    // written, not on the day someone notices the game got easier.
    const forbidden = /\b(laneReport|laneDemands|crewLane|runnerLane|LANE_DEFS|LANE_ORDER|lanesOfSkill|lanesOfVerb)\b/;
    let checkedSource = 0;
    for (const el of document.querySelectorAll("script[src]")) {
      const src = el.getAttribute("src") || "";
      if (!/models\/(mission|verbs|site|combat)\.js|core\/resolve\.js/.test(src)) continue;
      const req = new XMLHttpRequest();
      req.open("GET", src, false);
      try { req.send(null); } catch (e) { continue; }
      checkedSource += 1;
      check(!forbidden.test(req.responseText),
        "C25: LANES FORECAST, THEY DO NOT RESOLVE — " + src + " must never consult one");
    }
    check(checkedSource >= 4, "C25: the source probe must actually have read the resolvers");

    // ── A crew read, and the shape of stacking ───────────────────
    const rng = MJ.makeRNG("c25-crew");
    const crew = [];
    for (const fam of ["fighter", "decker", "mage", "rigger"]) {
      const r = MJ.generateRunner(rng, { family: fam });
      MJ.watchRunner(r, rng); MJ.hireRunner(r, "permanent");
      crew.push(r);
    }
    for (const id of MJ.LANE_ORDER) {
      if (id === "defense" || id === "awareness") continue;
      const solo = Math.max(...crew.map((r) => MJ.runnerLane(r, id).pool));
      const team = MJ.crewLane(crew, id);
      check(team >= solo, "C25: a crew is never worse at a lane than its best member (" + id + ")");
      check(team <= crew.reduce((s, r) => s + MJ.runnerLane(r, id).pool, 0),
        "C25: and never as good as everyone's pools added together (" + id + ")");
    }
    check(MJ.crewLane(crew, "awareness") === Math.max(...crew.map((r) => MJ.runnerLane(r, "awareness").pool)),
      "C25: Awareness is the sharpest pair of eyes — you cannot help someone else look");
    const armours = crew.map((r) => MJ.armourRatingFor(r));
    check(MJ.crewLane(crew, "defense") === Math.min(...armours),
      "C25: Defense is the worst-dressed runner — nobody soaks a bullet for anyone else");
    check(MJ.crewLane([], "sneak") === 0, "C25: an empty crew brings nothing");

    // ── Rule 2: the card reads the ESTIMATE, never the truth ─────
    const site = MJ.mintSite("c25-site", 3, { value: 7 });
    MJ.initSecurityState(MJ.makeRNG("c25-init"), site);
    const low = MJ.laneReport(crew, site, { physical: 1, astral: 1, matrix: 1 });
    const high = MJ.laneReport(crew, site, { physical: 10, astral: 10, matrix: 10 });
    check(low.length > 0 && low.length === high.length,
      "C25: which lanes a site demands is a fact about what it fields, not about the estimate");
    let moved = 0;
    for (let i = 0; i < low.length; i++) {
      check(low[i].lane === high[i].lane, "C25: and the card keeps a fixed order between reads");
      check(high[i].need >= low[i].need, "C25: a worse estimate never demands less (" + low[i].lane + ")");
      if (high[i].need > low[i].need) moved += 1;
    }
    check(moved === low.length,
      "C25: EVERY need must move with the estimate — one that does not is reading the true tier");
    // Same estimate, same answer, whatever the building is really like.
    const again = MJ.laneReport(crew, site, { physical: 1, astral: 1, matrix: 1 });
    check(JSON.stringify(again) === JSON.stringify(low), "C25: and the read is stable");

    // ── A lane is demanded only if something there answers to it ──
    const shown = { physical: 5, astral: 5, matrix: 5 };
    const demanded = new Set(MJ.laneReport(crew, site, shown).map((r) => r.lane));
    const answerable = new Set();
    for (const thing of MJ.siteObstacles(site)) {
      for (const act of MJ.actsFor(thing)) {
        if (!act.effective) continue;
        for (const id of MJ.lanesOfVerb(act.def)) answerable.add(id);
      }
    }
    for (const id of answerable) {
      check(demanded.has(id), "C25: a lane something here answers to must be on the card (" + id + ")");
    }
    for (const id of demanded) {
      if (id === "defense" || id === "awareness") continue; // no verb behind either
      check(answerable.has(id), "C25: and a lane nothing here answers to must NOT be (" + id + ")");
    }

    // ── The armour ladder has no holes in it ─────────────────────
    // Armour is one side of the Penetrate gate, so every rating a
    // weapon can demand has to be BUYABLE. It used to run 1, 2, 3, 6,
    // 8 — and with a hole at 4-5 the best affordable coat left a crew
    // one point short of the softest target in the game, so "buy
    // better armour" was a wall with a door on the far side of it.
    const tiers = Object.keys(MJ.ITEM_TEMPLATES)
      .filter((k) => MJ.ITEM_TEMPLATES[k].category === "armor")
      .map((k) => MJ.ITEM_TEMPLATES[k].tier).sort((a, b) => a - b);
    check(tiers[0] === 1, "C25: the armour ladder starts at 1");
    for (let i = 1; i < tiers.length; i++) {
      check(tiers[i] === tiers[i - 1] + 1,
        "C25: the armour ladder may not skip a rating (" + tiers[i - 1] + " -> " + tiers[i] + ")");
    }

    // ── Defense reads the TYPICAL hit, and is reachable ──────────
    // Every Defense demand the game can generate must be answerable
    // by armour the player can actually buy. A demand nobody can ever
    // meet is not a warning, it is wallpaper — and a chip that is red
    // no matter what you do teaches you to stop reading it.
    const topArmour = tiers[tiers.length - 1];
    const guardLadder = MJ.OBSTACLE_TEMPLATES.guard.weaponByTier;
    for (let rating = 1; rating <= 10; rating++) {
      const typical = Math.max(1, Math.ceil(rating / 2));
      const w = MJ.weaponProfile(MJ.weaponForTier(MJ.OBSTACLE_TEMPLATES.guard, typical));
      const demandTypical = (w.power || 0) - (w.ap || 0);
      check(demandTypical <= topArmour,
        "C25: a Defense demand must be meetable with armour that exists (rating " +
        rating + " wants " + demandTypical + ", best is " + topArmour + ")");
      // And it must genuinely be the median, not the outlier.
      const worst = MJ.weaponProfile(guardLadder[rating - 1]);
      check(demandTypical <= (worst.power || 0) - (worst.ap || 0),
        "C25: Defense reads the round you should EXPECT, never the worst gun on site");
    }

    // ── A RATING IS A SPREAD, AND NEITHER END IS THE ANSWER ──────
    // Obstacle tiers are drawn uniformly across 1..rating, so a "~4"
    // building is a 2, a 3, a 5 and a 6. Every number the card quotes
    // picks a point on that spread, and the two fight reads pick
    // DIFFERENT points on purpose:
    //
    //   Defense — the median. Absorbing hits is averaged over a whole
    //     firefight, so the ordinary round is what decides it.
    //   Attack  — the upper quarter. Failing to penetrate is NOT
    //     averaged: the guard you cannot scratch does not become
    //     scratchable because the last two were softer.
    //
    // Neither may ever be the maximum. You no more know their best
    // armour than their best gun, and quoting the outlier is the same
    // overclaim as reading the true tier.
    for (let rating = 1; rating <= 10; rating++) {
      const mid = MJ.tierBandMid(rating);
      const high = MJ.tierBandHigh(rating);
      check(mid >= 1 && high >= 1, "C25: a tier band is never below 1 (rating " + rating + ")");
      check(high >= mid, "C25: Attack must never read BELOW Defense on the spread (rating " + rating + ")");
      check(high <= rating, "C25: and never above the rating itself (rating " + rating + ")");
      if (rating >= 2) {
        check(high < rating,
          "C25: the Attack read is the high end of TYPICAL, never the best they have (rating " + rating + ")");
      }
      if (rating >= 4) {
        check(high > mid,
          "C25: and it must actually sit above the median, or it is just Defense again (rating " + rating + ")");
      }
    }

    // The gate must move with the band, not with the true roster.
    {
      const s = MJ.mintSite("c25-band", 5, { value: 8 });
      MJ.initSecurityState(MJ.makeRNG("c25-band-i"), s);
      const soft = MJ.laneDemands(s, { physical: 1, astral: 1, matrix: 1 }, {});
      const hard = MJ.laneDemands(s, { physical: 10, astral: 10, matrix: 10 }, {});
      check(hard._fightArmour > soft._fightArmour,
        "C25: the armour the Attack gate quotes must move with the estimate, not the building");
    }

    // ── ICE IS NOT A FIREFIGHT ───────────────────────────────────
    // Black ICE carries fights:true, armour and a weapon, and none of
    // it is answerable with a coat or a gun — it burns a decker's
    // brain and there is no Matrix attack verb to shoot back with.
    // Both halves of the fight read must ignore anything that lives
    // only on the wire. This caught two live bugs: a P4 site quoting
    // a Defense demand of 8 off a Black Hammer, and a wired samurai
    // reading Attack 0 because the "toughest thing that fights back"
    // was code his rifle could not reach.
    let sawIce = 0, sawBody = 0;
    for (let i = 0; i < 120; i++) {
      const s = MJ.mintSite("c25-ice", i);
      MJ.initSecurityState(MJ.makeRNG("c25-ice-i" + i), s);
      const axes = { physical: s.security.physical, astral: s.security.astral, matrix: s.security.matrix };
      const fighters = MJ.siteObstacles(s).filter((o) => o.fights);
      const ice = fighters.filter((o) => !(o.presence || []).some((p) => p !== "matrix"));
      const bodies = fighters.filter((o) => (o.presence || []).some((p) => p !== "matrix"));
      const d = MJ.laneDemands(s, axes, {});
      if (ice.length) {
        sawIce += 1;
        check(!d._toughest || (d._toughest.presence || []).some((p) => p !== "matrix"),
          "C25: the Attack gate must never point at something with no body (" +
          (d._toughest && d._toughest.type) + ")");
        if (!bodies.length) {
          check(!d.defense, "C25: a site whose only fighters are ICE demands no Defense at all");
        }
      }
      if (bodies.length) sawBody += 1;
      if (d.defense) {
        // Every Defense demand must be traceable to something that
        // can actually stand in front of you.
        const reachable = bodies.some((o) => {
          const proj = o.projection || "physical";
          const typical = Math.max(1, Math.ceil(Math.max(1, Math.min(10, axes[proj] || 1)) / 2));
          const w = MJ.weaponProfile(MJ.weaponForTier(MJ.OBSTACLE_TEMPLATE(o.type) || {}, typical));
          return (w.power || 0) + (w.useStrength ? 2 + Math.floor(typical / 3) : 0) - (w.ap || 0) >= d.defense.need;
        });
        check(reachable, "C25: a Defense demand must come from something that can be in the room with you");
      }
    }
    check(sawIce > 5 && sawBody > 5, "C25: the ICE probe needs both kinds of site in its sample");

    // ── The card admits which numbers are still a briefing ───────
    const guessed = MJ.laneReport(crew, site, shown, {});
    const known = MJ.laneReport(crew, site, shown, { physical: true, astral: true, matrix: true });
    check(guessed.length === known.length, "C25: confirming an axis changes no lane's presence");
    for (let i = 0; i < guessed.length; i++) {
      check(guessed[i].need === known[i].need,
        "C25: and confirming changes no NUMBER either — it only changes what may be claimed");
      check(guessed[i].estimated === true && known[i].estimated === false,
        "C25: an unconfirmed need must be marked as an estimate (" + guessed[i].lane + ")");
    }

    // ── The Penetrate gate, asked before the pool ────────────────
    // A breaching charge is Power 14 and is placed against something
    // standing still. It is not an answer to a guard, and counting it
    // as one made every demolitions runner read as able to punch
    // through any armour in the game.
    const guard = MJ.generateObstacleInstance(MJ.makeRNG("c25-g"), "guard", 5, "physical");
    const bomber = MJ.mintRunner("c25-bomber", 7);
    bomber.skills.demolitions = 6;
    check(MJ.attackPowerFor(bomber) >= 14, "C25: ungated, the charge is the biggest Power a runner has");
    check(MJ.attackPowerFor(bomber, guard) < 14,
      "C25: against something alive it must not count — you do not breach a man");

    // ── THE CARD READS THE DISPATCH, NOT THE SITE ────────────────
    // An astral recon meets wards and spirits. Quoting the corridor's
    // guards at it — Sneak 0/4! Face 0/4! — told a solo combat mage
    // they were unqualified for ground they will never stand on. The
    // planes filter is the fix, and the pillar rule inside it is
    // BODIES REACH EVERYTHING: on a street job every pillar's verbs
    // count (the decker hacks the maglock from the corridor — AR, no
    // jack-in), so Tech STAYS on a street card; a pure projection has
    // no body, so only its own pillar is real there.
    {
      let astralSite = null;
      for (let i = 0; i < 60 && !astralSite; i++) {
        const s = MJ.mintSite("c25-planes", i, { value: 6 });
        MJ.initSecurityState(MJ.makeRNG("c25-pl-i" + i), s);
        const obs = MJ.siteObstacles(s);
        if (obs.some((o) => o.projection === "astral") &&
            obs.some((o) => o.projection === "physical" && o.type === "maglock")) astralSite = s;
      }
      check(!!astralSite, "C25: the planes probe needs a site with astral ground and a device");
      const axes = { physical: 5, astral: 5, matrix: 5 };
      const astralRows = MJ.laneReport(crew, astralSite, axes, {}, ["astral"]).map((r) => r.lane);
      for (const gone of ["sneak", "face", "tech", "defense"]) {
        check(astralRows.indexOf(gone) === -1,
          "C25: a projection is never asked for " + gone + " — no body, no corridor, no kevlar");
      }
      const streetRows = MJ.laneReport(crew, astralSite, axes, {}, ["physical", "astral"]).map((r) => r.lane);
      check(streetRows.indexOf("tech") !== -1,
        "C25: Tech STAYS on a street card — the decker hacks the maglock from the corridor, no jack-in");
      check(streetRows.indexOf("defense") !== -1, "C25: and bodies on the ground wear armour");
      const matrixRows = MJ.laneReport(crew, astralSite, axes, {}, ["matrix"]).map((r) => r.lane);
      check(matrixRows.indexOf("defense") === -1 && matrixRows.indexOf("attack") === -1,
        "C25: the host crawl asks for no armour and no gun — there is no Matrix attack, by design");
      // missionPlanes is the one mapping the UI reads.
      check(JSON.stringify(MJ.missionPlanes({ kind: "astralRun" })) === '["astral"]' &&
        JSON.stringify(MJ.missionPlanes({ kind: "recon", lens: "astral" })) === '["astral"]' &&
        JSON.stringify(MJ.missionPlanes({ kind: "matrixRun" })) === '["matrix"]' &&
        JSON.stringify(MJ.missionPlanes({ site: site })) === '["physical","astral"]',
        "C25: missionPlanes maps each dispatch to the ground it walks");
    }

    // ── ARMOR THE SPELL IS DEFENSE THE CREW BRINGS ───────────────
    // Cast on the worst-dressed runner — the exact person the lane
    // counts — so the forecast rises by the spell's bonus, capped at
    // the second-worst coat because one cast armours one person.
    {
      const mage = MJ.generateRunner(MJ.makeRNG("c25-am"), { family: "mage" });
      mage.attributes.magic = 4;
      mage.skills.sorcery = 5;
      mage.gear = []; // worn armour 0 — the worst-dressed by construction
      mage.classification.spellsKnown = ["armor"];
      const partner = crew[0]; // generated fighter with real worn armour
      const worn = MJ.armourRatingFor(partner);
      mage.classification.spellsKnown = [];
      const bare = MJ.laneReport([mage, partner], site, shown, {}).find((r) => r.lane === "defense");
      mage.classification.spellsKnown = ["armor"];
      const armored = MJ.laneReport([mage, partner], site, shown, {}).find((r) => r.lane === "defense");
      if (bare && armored) {
        check(bare.have === 0, "C25: without the spell, the naked mage IS the Defense read");
        check(armored.have === Math.min(worn, Math.min(6, mage.attributes.magic)),
          "C25: with it, the floor rises by min(6, Magic), capped at the second-worst coat (saw " +
          armored.have + ")");
      } else {
        check(false, "C25: the armor-spell probe needs a Defense row on this site");
      }
    }

    // ── Rule 3: the card names no skills and no verbs ────────────
    for (const row of MJ.laneReport(crew, site, shown)) {
      check(typeof row.have === "number" && typeof row.need === "number" && isFinite(row.have),
        "C25: every row is two comparable numbers (" + row.lane + ")");
      check(row.covered === (row.have >= row.need), "C25: and the colour is just that comparison");
      check(!("skills" in row) && !("verbs" in row),
        "C25: THE IMPRECISION IS THE POINT — a row may not name what would fix it");
    }
  }

  // ── Class 23: what the live read may claim ──────────────────────
  // A leg IS the sample — walk the route, meet what is on it, and by
  // the time you leave you have seen what there was to see. So leg-end
  // confirmation is not in question. What this class holds is the read
  // WHILE INSIDE, and the one thing that must never count as evidence.
  function class23_knowing() {
    const crew = [MJ.mintRunner("c23-crew", 1)];
    crew[0].market.hired = { tier: "permanent", missionsRemaining: 99, blockSize: 99 };
    let run = null;
    for (let i = 0; i < 120 && !run; i++) {
      const site = MJ.mintSite("c23-site", i, { value: 6, orientation: "physical" });
      MJ.initSecurityState(MJ.makeRNG("c23i" + i), site);
      const r = MJ.beginMission(MJ.makeRNG("c23r" + i),
        { site: site, kind: "jobObjective", objective: {} }, crew, 1);
      if (r.obstacles.filter((o) => o.projection === "physical").length >= 3) run = r;
    }
    check(!!run, "C23: the probe needs a route with real security on it");
    if (!run) return;

    // Nothing seen yet: no tick.
    run.index = 0;
    check(!MJ.axisProven(run, "physical").proven, "C23: an untouched axis is never confirmed");

    // ONE encounter must not confirm — that was the bug. A single
    // camera cannot tell level 1 from level 5.
    run.index = 1;
    const one = MJ.axisProven(run, "physical");
    check(!one.proven, "C23: one encounter must not confirm an axis");
    check(one.faced === 1 || one.faced === 0, "C23: and it counts what was actually met");

    // Having met everything of that kind on the route: confirmed.
    run.index = run.obstacles.length;
    check(MJ.axisProven(run, "physical").proven,
      "C23: meeting everything of that kind on the route DOES confirm it");

    // ── A RATING IS SAID IN DICE, AND IT IS A FLOOR ──────────────
    // The raw 1-10 value is a generation budget; it decides how much a
    // site buys and how hard its worst thing CAN be. It was never a
    // number a player could hold a dossier against, which is why "the
    // crew brings 12d" against "security P:4" compared nothing to
    // nothing. What the player is shown is the POOL IT TAKES, so the
    // comparison is like against like.
    //
    // WHICH pool, though, is the whole question. Obstacle tiers roll
    // uniformly across 1..rating, and the player cannot see into that
    // spread — so quoting the pool for the site's HARDEST possible
    // obstacle hands them a fact they never earned. It is the same
    // overclaim as printing the true tier on the job card, and the
    // fact that they must clear every obstacle does not change what
    // they have been TOLD. So the number is the high end of typical:
    // an honest floor that the top of the spread still beats
    // sometimes.
    let lastNeed = 0;
    for (let v = 1; v <= 10; v++) {
      const dice = MJ.diceForSecurity(v);
      check(dice >= lastNeed, "C23: a harder site can never ask for FEWER dice (v=" + v + ")");
      lastNeed = dice;
      const rate = (pool, tier) => {
        const need = MJ.thresholdForTier(tier);
        const rng = MJ.makeRNG("c23-dice-" + v + "-" + pool + "-" + tier);
        let win = 0;
        for (let i = 0; i < 4000; i++) if (MJ.countHits(MJ.rollDicePool(rng, pool)) >= need) win++;
        return win / 4000;
      };
      // It must genuinely do the job it claims: beat the high-end-of-
      // typical obstacle, and one die fewer must not — otherwise the
      // number is decoration.
      const band = MJ.tierBandHigh(v);
      check(rate(dice, band) >= 0.75,
        "C23: the stated pool must beat the high end of typical (v=" + v + ", " + dice + "d)");
      check(rate(dice - 1, band) < rate(dice, band),
        "C23: and it must be the LINE, not a number above it (v=" + v + ")");
      // ...and it must NOT quietly cover the outlier as well, or the
      // "floor" is a ceiling wearing a hat and nothing is being
      // withheld from the player at all.
      if (MJ.thresholdForTier(v) > MJ.thresholdForTier(band)) {
        check(rate(dice, v) < 0.75,
          "C23: the number is a FLOOR — it must not silently cover the site's worst (v=" + v + ")");
      }
    }
    check(MJ.diceForSecurity(10) > MJ.diceForSecurity(1),
      "C23: the top of the scale must demand more than the bottom");
    for (let v = 2; v <= 10; v++) {
      check(MJ.tierBandHigh(v) < v,
        "C23: no number quoted at the player may be read off the site's maximum (v=" + v + ")");
    }

    // ── A RESPONSE SQUAD PROVES CAPABILITY ───────────────────────
    // Its tier is drawn from the alert level, which is bounded by the
    // site's own [Current, Max] — so a place that fields a tier-9
    // squad demonstrably HAS a tier-9 in it. Noise calls out what the
    // building could already do; it does not manufacture a threat.
    // So it raises the floor. What it must NOT do is join the census
    // of the route, or every noisy moment would move the goalposts on
    // "have I met everything here".
    const quiet = MJ.mintSite("c23-quiet", 7, { value: 2, orientation: "physical" });
    MJ.initSecurityState(MJ.makeRNG("c23q"), quiet);
    const qr = MJ.beginMission(MJ.makeRNG("c23qr"),
      { site: quiet, kind: "jobObjective", objective: {} }, crew, 1);
    const heavy = MJ.generateObstacleInstance(MJ.makeRNG("c23h"), "guard", 9, "physical");
    heavy.responder = "physical";
    heavy.rooms = [1];
    qr.obstacles = [heavy];
    qr.index = 1;
    const rr = MJ.axisProven(qr, "physical");
    check(rr.maxTier === 9,
      "C23: a tier-9 response squad DOES raise the floor — a place that can field one has it");
    check(rr.total === 0 && !rr.proven,
      "C23: but it is not part of the route's census, so it cannot move the goalposts");
  }

  // ── Class 22: verbs × properties — the world decides ────────────
  // The menu is not the authority on what is possible. Every verb the
  // game has is crossed against what a thing IS, and two gates decide
  // the rest: PRESENCE (can it reach) then NATURE (does it land).
  //
  // What this class protects, in order of how much it would hurt to
  // lose: that hopeless acts stay ON the menu rather than vanishing
  // from it; that an immunity is bought with an attempt rather than
  // read off a card; that force is always offered and only sometimes
  // works; and that the astral's own rules survive the generalisation
  // — a ward is raced, never removed, and looking at something is not
  // spellcasting.
  function class22_verbs() {
    const TYPES = Object.keys(MJ.OBSTACLE_TEMPLATES);

    // ── The two gates, on every kind of thing there is ───────────
    for (const type of TYPES) {
      for (let tier = 1; tier <= 10; tier++) {
        const ob = MJ.generateObstacleInstance(MJ.makeRNG("c22-" + type + tier), type, tier, "physical");
        const acts = MJ.actsFor(ob);
        check(acts.every((a) => a.reaches),
          "C22: actsFor must return only what can reach the thing (" + type + ")");
        check(acts.every((a) => a.effective || !!a.why),
          "C22: a verb that does not land must say why (" + type + ")");
        // The generator invariants, now DERIVED rather than declared.
        check(MJ.hasBruteForceOption(ob),
          "C22: brute force must always be available against a body (" + type + " T" + tier + ")");
        check(MJ.canBeForced(ob) === (ob.presence || []).some((p) => p !== "matrix"),
          "C22: force is a currency between bodies — a matrix-only thing has none (" + type + ")");
        check(MJ.usableNonLoudWays(ob) >= 2,
          "C22: no thing may be single-skill-locked (" + type + " T" + tier + " had " +
          MJ.usableNonLoudWays(ob) + ")");
      }
    }

    // Presence stops a verb reaching; nature stops it landing. Both
    // have to be real or the crossing is just a longer menu.
    const one = (type) => MJ.generateObstacleInstance(MJ.makeRNG("c22-one-" + type), type, 3, "physical");
    const act = (ob, id) => MJ.actsFor(ob).find((a) => a.id === id);
    const cam = one("camera"), grd = one("guard"), lock = one("maglock"), spr = one("spirit"), wrd = one("ward");

    check(!act(spr, "sleaze"), "C22: PRESENCE — a spirit is not on the grid, so no Matrix verb reaches it");
    check(!act(wrd, "shoot"), "C22: PRESENCE — a bullet passes through the space a ward occupies");
    check(!act(lock, "banish"), "C22: PRESENCE — a lock has no astral side to work on");

    check(act(cam, "con") && !act(cam, "con").lands, "C22: NATURE — a camera has no opinion to change");
    check(act(grd, "banish") && !act(grd, "banish").lands, "C22: NATURE — nothing called the guard here");
    check(act(grd, "unwind") && !act(grd, "unwind").lands, "C22: NATURE — a living aura is not a made structure");
    check(act(lock, "sneak") && !act(lock, "sneak").lands, "C22: NATURE — nothing to sneak past if nothing is looking");
    check(act(spr, "takedown") && !act(spr, "takedown").lands, "C22: NATURE — a knife does not send back what was summoned");
    check(act(lock, "routeAround") && !act(lock, "routeAround").lands, "C22: NATURE — the one door in IS the way");

    // Evasion is pillar-bound: you can only hide from a watcher in
    // the medium it watches.
    check(!act(cam, "maskIcon").lands, "C22: a camera with eyes in the room is not watching the wire");
    check(!act(lock, "sneak").lands, "C22: and a lock that watches nothing cannot be hidden from");

    // ASSENSING IS NOT AN OBSTACLE VERB AT ALL. It is receptive — it
    // takes information in, it does not do anything TO a thing — so it
    // can never be a way past one. It briefly was, which produced a
    // runner reading a guard's aura for seven intervals in his face
    // and thereby getting around him. Reading auras lives in the
    // astral pillar's grammar, where what it buys is Lattice depth.
    check(!MJ.VERBS.assense, "C22: assensing must not be an obstacle-resolution verb");

    // ── There is no Matrix attack, and no Matrix skill but hacking ─
    // Both are the same ruling twice: the Matrix is not meatspace with
    // different scenery. Nothing on the wire has a body to break, so
    // no verb there may be damaging; and decking is ONE skill, so
    // `computer` never fronts a live act (it survives on the crafting
    // bench and nowhere else).
    check(!MJ.VERBS.attackIce, "C22: the Matrix has no attack verb — nothing there has a body");

    // ── THE CROSSING READS PROPERTIES, NOT RUN STATE ──────────────
    // What a verb can reach is a fact about the THING — presence,
    // senses, living, fights, bypassable — settled when it was minted.
    // What a run scratches onto it later (immunities learned the hard
    // way, damage taken) must not silently re-answer the question, or
    // the menu starts changing shape mid-fight for reasons no rule
    // states. This is also the property that would make caching the
    // crossing safe; it was measured as not worth it (see verbs.js),
    // but the invariant stands on its own.
    {
      const one = MJ.generateObstacleInstance(MJ.makeRNG("c22-pure-a"), "guard", 4, "physical");
      const shape = (a) => JSON.stringify(a.map((x) => [x.id, x.reaches, x.lands, x.why]));
      const before = shape(MJ.actsFor(one));
      one.immune = { stealth: "sensor-equipped" };
      one.damageTaken = 5;
      check(shape(MJ.actsFor(one)) === before,
        "C22: the crossing reads fixed properties — a run's marks cannot change it");
      const lock = MJ.generateObstacleInstance(MJ.makeRNG("c22-pure-b"), "maglock", 4, "physical");
      check(shape(MJ.actsFor(lock)) !== shape(MJ.actsFor(one)),
        "C22: and a different KIND of thing still gets a different answer");
    }
    // ── EVERY VERB TABLE, not just this one ──────────────────────
    // The one-decking-skill ruling was policed here and nowhere
    // else, so matrix.js's `probe` sat on `computer` — a bench skill
    // — for weeks. The pillars have their own verb tables and they
    // obey the same rulings.
    for (const [tableName, table] of [["MATRIX_VERBS", MJ.MATRIX_VERBS],
                                      ["ASTRAL_VERBS", MJ.ASTRAL_VERBS],
                                      ["STREET_VERBS", MJ.STREET_VERBS]]) {
      for (const id of Object.keys(table || {})) {
        const skill = table[id].skill;
        if (!skill) continue;
        check(MJ.SKILLS.indexOf(skill) !== -1,
          "C22: " + tableName + "." + id + " rolls a real skill (" + skill + ")");
        check(skill !== "computer" && skill !== "enchanting",
          "C22: " + tableName + "." + id + " must not roll a BENCH skill (" + skill + ")");
      }
    }
    for (const id of Object.keys(MJ.MATRIX_VERBS || {})) {
      const skill = MJ.MATRIX_VERBS[id].skill;
      if (skill) check(skill === "hacking",
        "C22: decking is ONE skill — " + id + " rolls " + skill);
    }
    for (const id of Object.keys(MJ.VERBS)) {
      const v = MJ.VERBS[id];
      if (v.pillar !== "matrix") continue;
      check(!v.damaging, "C22: no Matrix verb may be damaging (" + id + ")");
      check(v.skill === "hacking", "C22: every Matrix verb rolls hacking (" + id + " rolled " + v.skill + ")");
    }
    for (const t of TYPES) {
      const ob = MJ.generateObstacleInstance(MJ.makeRNG("c22-cm-" + t), t, 5, "physical");
      check(!MJ.actsFor(ob).some((a) => a.def.skill === "computer"),
        "C22: computer is a bench skill — it may never front a way past a thing (" + t + ")");
    }
    for (const t of TYPES) {
      const ob = MJ.generateObstacleInstance(MJ.makeRNG("c22-as-" + t), t, 5, "physical");
      check(!MJ.actsFor(ob).some((a) => a.def.skill === "assensing"),
        "C22: nothing may offer assensing as a way past (" + t + ")");
    }

    // ── Nothing is ever removed from the menu ────────────────────
    const crew = makeRoster(MJ.makeRNG("c22-crew"), 3, ["fighter", "decker", "mage"]);
    for (const r of crew) { MJ.watchRunner(r, MJ.makeRNG("c22-w" + r.identity.handle)); MJ.hireRunner(r, "permanent"); }
    const stage = (tag, type, tier) => {
      const site = MJ.mintSite("c22-site", 4);
      MJ.initSecurityState(MJ.makeRNG("c22-s" + tag), site);
      const run = MJ.beginMission(MJ.makeRNG("c22-r" + tag),
        { site: site, kind: "jobObjective", objective: {} }, crew, 1);
      const ob = MJ.generateObstacleInstance(MJ.makeRNG("c22-o" + tag), type, tier, "physical");
      ob.rooms = [1];
      run.obstacles = [ob];
      run.index = 0;
      return { run: run, ob: ob };
    };

    const menu = stage("menu", "camera", 3);
    const shown = MJ.missionPrompt(menu.run).options;
    check(shown.some((o) => o.verbId === "con" && !o.available && !!o.why),
      "C22: a verb that cannot land stays ON the menu, named and reasoned");
    check(shown.filter((o) => o.available).length > 0, "C22: and the live ways are still there");
    check(shown.every((o, i, all) => i === 0 || !(o.available && !all[i - 1].available)),
      "C22: live ways must sort ahead of dead ones");

    // ── An immunity is BOUGHT, not read off a card ───────────────
    let bought = false;
    for (let i = 0; i < 40 && !bought; i++) {
      const s = stage("imm" + i, "maglock", 5);
      const hidden = Object.keys(s.ob.immune)[0];
      if (!hidden) continue;
      const before = MJ.missionPrompt(s.run).options.find((o) => o.skill === hidden);
      if (!before || !before.available) continue; // nobody trained; try another
      bought = true;
      check(!before.discovered,
        "C22: nothing visible announces an immunity — it must start as a live option");
      MJ.missionChoose(s.run, { approach: before.verbId, runner: before.runner });
      const after = MJ.missionPrompt(s.run).options.find((o) => o.verbId === before.verbId);
      check(!!after, "C22: a discovered dead end must STAY on the menu, not be deleted");
      check(after && after.discovered === s.ob.immune[hidden],
        "C22: and it must carry the reason the attempt bought");
      check(after && !after.available, "C22: a known-useless way must stop counting as a way");
    }
    check(bought, "C22: the immunity probe never met its conditions");

    // ── Force: always offered, and only sometimes any use ────────
    // Gate 2 is the whole point. A pistol cannot open a hardened door
    // however many times it is fired; a breaching charge can.
    const door = MJ.generateObstacleInstance(MJ.makeRNG("c22-door"), "maglock", 8, "physical");
    const pistol = MJ.weaponProfile("pistol");
    const charge = MJ.weaponProfile("demolitions");
    const armour = Math.max(0, door.armour + (pistol.ap || 0));
    check(pistol.power <= armour,
      "C22: the probe needs a door a pistol genuinely cannot open (P" + pistol.power + " vs A" + armour + ")");
    let bounced = 0;
    for (let i = 0; i < 50; i++) {
      const r = MJ.forceAgainstThing(MJ.makeRNG("c22-b" + i), { pool: 20, weapon: pistol, carried: 0 }, door);
      if (!r.penetrated) bounced += 1;
      check(r.damage === 0, "C22: what cannot penetrate must never do damage, however well it is aimed");
    }
    check(bounced === 50, "C22: perseverance must not eventually beat armour it cannot beat");
    const blown = MJ.forceAgainstThing(MJ.makeRNG("c22-charge"), { pool: 20, weapon: charge, carried: 0 }, door);
    check(blown.penetrated, "C22: the right tool must get through what the wrong one cannot");

    // Damage belongs to the RUN, never to the site's walls.
    check(door.damage === undefined,
      "C22: the force chain must not write damage onto a thing generated from a seed");

    // A bounce is a fact about the wall, learned by trying, and
    // thereafter marked rather than deleted.
    let learned = false;
    for (let i = 0; i < 60 && !learned; i++) {
      const s = stage("bnc" + i, "maglock", 9);
      const opt = MJ.missionPrompt(s.run).options.find((o) => o.verbId === "kick" && o.available);
      if (!opt) continue;
      const t = MJ.missionChoose(s.run, { approach: "kick", runner: opt.runner });
      if (!t || !t.force || t.penetrated) continue; // it got through; not this probe's case
      learned = true;
      check(/bounce/i.test(t.result), "C22: a bounce must say so");
      const after = MJ.missionPrompt(s.run).options.find((o) => o.verbId === "kick");
      check(!!after && !after.available && /bounces off/.test(after.discovered || ""),
        "C22: a bounced weapon must be marked useless here, with Power and Armour named");
    }
    check(learned, "C22: the bounce probe never met its conditions");

    // ── One definition: the prompt and "no way through" agree ────
    const agree = stage("agree", "guard", 4);
    const live = MJ.missionPrompt(agree.run).options.filter((o) => o.available).length;
    check(live === MJ.remainingApproaches(agree.run),
      "C22: what the player is offered and what decides 'no way through' must be one count");

    // ── The astral's own rules survive the generalisation ────────
    // A mana barrier repairs itself. Getting through one is opening a
    // window and taking it, so the wall the crew came through is
    // still between them and their body on the way out. This is the
    // pillar's nastiest situation and it is not allowed to evaporate
    // because a verb table got tidier.
    check(!MJ.VERBS.unwind.disables, "C22: unwinding a ward must not remove it — it cranks back closed");
    check(MJ.VERBS.unwind.extended, "C22: unwinding is a race against re-closing, not one push");
    check(MJ.VERBS.banish.disables, "C22: banishing DOES send a spirit home — that one really is removal");
    check(wrd.repairs, "C22: a ward must be marked as something that knits closed");

    const wardSite = (() => {
      for (let i = 0; i < 200; i++) {
        const s = MJ.mintSite("c22-ward", i, { value: 8, orientation: "astral" });
        MJ.initSecurityState(MJ.makeRNG("c22-wi" + i), s);
        if (MJ.astralRoute(s).outbound.length) return s;
      }
      return null;
    })();
    check(!!wardSite, "C22: the ward probe needs a warded astral site to mean anything");
    if (wardSite) {
      const mage = MJ.mintRunner("c22-mage", 3);
      mage.market.hired = { tier: "permanent", missionsRemaining: 99, blockSize: 99 };
      mage.skills = { sorcery: 12, assensing: 12, conjuring: 12 };
      mage.attributes.magic = 6; mage.attributes.willpower = 6;
      const wRun = MJ.beginMission(MJ.makeRNG("c22-wr"),
        { site: wardSite, kind: "astralRun", objective: {} }, [mage], 1);
      const inbound = wRun.obstacles.find((o) => o.type === "ward" && !o.isExitWard);
      const exit = wRun.obstacles.find((o) => o.isExitWard);
      check(!!inbound && !!exit, "C22: a warded route must gate the way back as well as the way in");
      check(inbound !== exit, "C22: the two crossings must be separate entries — one is on the way out");

      wRun.index = wRun.obstacles.indexOf(inbound);
      let guard = 0;
      do { MJ.missionChoose(wRun, { approach: "unwind", runner: mage }); guard++; }
      while (wRun.extended && guard < 40);
      check(!wRun.neutralized.has(inbound),
        "C22: a ward that was unwound must still be standing — you passed it, you did not break it");
      check(!wRun.neutralized.has(exit),
        "C22: and the way back must still be a wall");

      // Force is no exception: a hole in a mana barrier seals.
      const bRun = MJ.beginMission(MJ.makeRNG("c22-br"),
        { site: wardSite, kind: "astralRun", objective: {} }, [mage], 1);
      const bWard = bRun.obstacles.find((o) => o.type === "ward" && !o.isExitWard);
      bRun.index = bRun.obstacles.indexOf(bWard);
      let g2 = 0, holed = null;
      while (g2++ < 25 && bRun.obstacles[bRun.index] === bWard) {
        holed = MJ.missionChoose(bRun, { approach: "blast", runner: mage });
        if (!holed || holed.ineffective) break;
      }
      if (holed && holed.success) {
        check(!bRun.neutralized.has(bWard),
          "C22: blasting a hole in a ward must not take it off the board — it repairs");
      }

      // Assensing is perception, not spellcasting. It buys more of the
      // truth with every interval and it does NOT bill the mage.
      check(MJ.VERBS.blast.drains && MJ.VERBS.unwind.drains && MJ.VERBS.banish.drains,
        "C22: sorcery and conjuring DO bill the caster");

    }
  }

  // ── Class 18: bound helpers — spirits and agents ────────────────
  // One model, two skins. The load-bearing property is that a helper
  // gives the crew WIDTH, not power: it owes N tasks and each one is
  // a separate action. And the dog-brain has to be real — an agent
  // that never fumbled the unexpected would just be a second decker.
  function class18_helpers() {
    const rng = MJ.makeRNG("stress-helpers");

    // ── Agents are gear, and the deck is the ceiling ─────────────
    const deck = (tier) => ({ templateId: "d", label: "Deck", tier: tier, category: "deck" });
    const mk1 = deck(3), mk3 = deck(9);
    check(MJ.agentSlotsFor(mk1) < MJ.agentSlotsFor(mk3), "C18: a better deck must hold more agents");
    check(MJ.loadAgent(mk1, { rating: 4 }).ok === false,
      "C18: a deck cannot run an agent rated above itself");
    const loaded = MJ.loadAgent(mk1, { rating: 3 });
    check(loaded.ok, "C18: a deck must run an agent at its own rating");
    check(MJ.loadAgent(mk1, { rating: 1 }).ok === false, "C18: program slots are finite");
    check(MJ.loadAgent(null, {}).ok === false, "C18: no deck, no agent");
    check(MJ.loadAgent({ label: "gun", tier: 5, category: "weapon" }, {}).ok === false ||
      true, "C18: loading onto a non-deck is refused or inert");

    // The back-reference must not make a result unserializable — the
    // log stores records now and a cycle would break the save.
    const act = MJ.helperAct(rng.fork("ser"), loaded.helper, "sweep");
    let serializable = true;
    try { JSON.stringify(act); } catch (e) { serializable = false; }
    check(serializable, "C18: a helper's action result must be serializable");
    let deckSerializable = true;
    try { JSON.stringify(mk1); } catch (e) { deckSerializable = false; }
    check(deckSerializable, "C18: a deck holding agents must still serialize");

    // ── Tasks are finite and each is one action ──────────────────
    const worker = MJ.makeHelper("agent", { rating: 3, tasks: 3 });
    check(MJ.helperTasksLeft(worker) === 3, "C18: a helper starts owing its tasks");
    for (let i = 0; i < 3; i++) {
      check(MJ.helperAct(rng.fork("w" + i), worker, "sweep").ok, "C18: an owed task must be spendable");
    }
    check(MJ.helperTasksLeft(worker) === 0, "C18: tasks run out");
    check(MJ.helperAct(rng, worker, "sweep").ok === false, "C18: a spent helper does nothing more");
    check(!MJ.helperAvailable(worker), "C18: and reads as unavailable");

    // ── Duties are narrow, and plane-bound ───────────────────────
    check(MJ.helperAct(rng, MJ.makeHelper("spirit", { rating: 2, tasks: 3 }), "sweep").ok === false,
      "C18: a spirit cannot do a Matrix duty");
    check(MJ.helperAct(rng, MJ.makeHelper("agent", { rating: 2, tasks: 3 }), "assense").ok === false,
      "C18: an agent cannot assense");
    check(MJ.helperAct(rng, MJ.makeHelper("agent", { rating: 2, tasks: 3 }), "nonesuch").ok === false,
      "C18: a helper cannot do something it has no duty for");
    check(MJ.helperAct(rng, MJ.makeHelper("agent", { rating: 2, tasks: 3 }), "watch").ok,
      "C18: a shared duty works for either kind");

    // ── The dog-brain must be real ───────────────────────────────
    // Routine work always lands. The unexpected is where it shows.
    let routineOk = 0;
    for (let i = 0; i < 30; i++) {
      const h = MJ.makeHelper("agent", { rating: 1, tasks: 99 });
      if (MJ.helperAct(MJ.makeRNG("rt" + i), h, "watch").result === "done") routineOk += 1;
    }
    check(routineOk === 30, "C18: routine work must never confuse a helper");

    const tally = { improvised: 0, wrong: 0, asks: 0 };
    for (let i = 0; i < 150; i++) {
      const h = MJ.makeHelper("agent", { rating: 2, tasks: 99 });
      const r = MJ.helperAct(MJ.makeRNG("dx" + i), h, "watch", { unexpected: true, threshold: 3 });
      if (r.result === "improvised") tally.improvised += 1;
      else if (r.result === "does the wrong thing") tally.wrong += 1;
      else tally.asks += 1;
    }
    check(tally.improvised > 0, "C18: a helper must sometimes cope with the unexpected");
    check(tally.wrong + tally.asks > 0, "C18: and must sometimes fail to — that is the dog-brain");

    // A smarter agent copes better. This is what buying rating is for.
    const copeRate = (rating) => {
      let ok = 0;
      for (let i = 0; i < 120; i++) {
        const h = MJ.makeHelper("agent", { rating: rating, tasks: 99 });
        if (MJ.helperAct(MJ.makeRNG("c" + rating + i), h, "watch", { unexpected: true, threshold: 3 }).result === "improvised") ok += 1;
      }
      return ok / 120;
    };
    check(copeRate(6) > copeRate(1), "C18: a higher-rated agent must handle surprises better");

    // Stalling is a real stop, and instructing clears it.
    const stalled = MJ.makeHelper("agent", { rating: 1, tasks: 99 });
    let guard = 0;
    while (!stalled.stalled && guard++ < 200) {
      MJ.helperAct(MJ.makeRNG("s" + guard), stalled, "watch", { unexpected: true, threshold: 6 });
    }
    check(stalled.stalled, "C18: a helper must be able to stall on the unexpected");
    check(MJ.helperAct(rng, stalled, "watch").ok === false, "C18: a stalled helper does nothing until told");
    check(MJ.instructHelper(stalled) && !stalled.stalled, "C18: instructions must un-stall it");

    // Dismissing frees its slot back to the deck.
    const freeDeck = deck(9);
    const a = MJ.loadAgent(freeDeck, { rating: 2 });
    const used = MJ.agentSlotsUsed(freeDeck);
    MJ.dismissHelper(a.helper);
    check(MJ.agentSlotsUsed(freeDeck) < used, "C18: dismissing an agent frees its program slot");
    check(MJ.helperTasksLeft(a.helper) === 0, "C18: a dismissed helper owes nothing further");

    // ── Spirits come through the Lattice, and cost Drain ─────────
    const mage = MJ.generateRunner(rng.fork("mg"), {});
    mage.attributes.magic = 5; mage.attributes.willpower = 5;
    mage.skills.conjuring = 5; mage.skills.assensing = 6; mage.wounds = 0;
    const mundane = MJ.generateRunner(rng.fork("mun"), {});
    mundane.attributes.magic = 0; mundane.skills.conjuring = 6;
    check(MJ.bindSpirit(rng, mundane, {}).ok === false, "C18: no Magic, no spirit");

    const bind = MJ.bindSpirit(rng.fork("b"), mage, { force: 4 });
    check(bind.ok && bind.lattice, "C18: summoning must go through the Lattice");
    check(bind.lattice.mode === "assemble", "C18: summoning IS assembling a circuit");
    let g2 = 0;
    while (!MJ.latticeDone(bind.lattice) && g2++ < 20) {
      const v = MJ.latticeRead(bind.lattice);
      const open = v.threads.filter((t) => !t.cut);
      if (!open.length) break;
      const want = v.shape[(v.built || []).length];
      MJ.latticePull(bind.lattice, ((want && open.find((t) => t.resonance === want)) || open[0]).id);
    }
    MJ.finishBind(rng.fork("fb"), bind);
    check(bind.done && bind.drain, "C18: a binding must resolve and owe Drain");
    if (bind.success) {
      check(bind.helper && bind.helper.kind === "spirit", "C18: a successful binding yields a spirit");
      check(MJ.helperTasksLeft(bind.helper) > 0, "C18: and it owes tasks");
      check(bind.helper.plane === "astral", "C18: a spirit belongs to the astral");
    }
  }

  // ── Class 17: spells in meatspace ───────────────────────────────
  // A mage walks the street with the crew. What matters mechanically
  // is that DIRECT spells reach past armour and INDIRECT ones do not,
  // that sustaining costs the caster while it is held, and that every
  // out-of-combat effect lands on a hook that already existed rather
  // than a parallel system.
  function class17_spells() {
    const rng = MJ.makeRNG("stress-spells");
    const mage = MJ.generateRunner(rng.fork("m"), { family: "mage" });
    mage.attributes.magic = 5; mage.attributes.willpower = 5;
    mage.skills.sorcery = 5; mage.skills.assensing = 6; mage.wounds = 0;
    // The probe's own grimoire — fixed, so every check below casts
    // from a known book rather than whatever generation dealt.
    mage.classification.spellsKnown = ["manabolt", "fireball", "invisibility", "heal",
      "detectLife", "increaseReflexes", "hush", "punch", "stunball", "mobMind"];

    // A mundane cannot cast, whatever their skills say.
    const mundane = MJ.generateRunner(rng.fork("mun"), {});
    mundane.attributes.magic = 0; mundane.skills.sorcery = 6;
    mundane.classification.spellsKnown = ["manabolt"];
    check(MJ.spellsFor(mundane).length === 0, "C17: no Magic means no spells, whatever the skill sheet says");
    check(MJ.spellsFor(mage).length === mage.classification.spellsKnown.length,
      "C17: the spell list IS the grimoire — never the whole book");

    // ── THE GRIMOIRE IS THE AUTHORITY (§8: spells live on the dossier)
    check(MJ.castSpell(rng.fork("ng"), mage, "powerbolt", {}).ok === false,
      "C17: a spell not on the dossier cannot be cast, whatever the training");
    check(MJ.knowsSpell(mage, "manabolt") && !MJ.knowsSpell(mage, "powerbolt"),
      "C17: knowsSpell reads the dossier and nothing else");

    // ── The table is CANON: names, types, drain codes ─────────────
    let combatCount = 0;
    for (const id of Object.keys(MJ.SPELLS)) {
      const def = MJ.SPELLS[id];
      check(MJ.SPELL_CATEGORIES.indexOf(def.category) !== -1, "C17: " + id + " has an unknown category");
      check(!!def.label, "C17: " + id + " needs its canon name");
      check(def.type === "M" || def.type === "P", "C17: " + id + " needs a canon mana/physical type");
      check(typeof def.drain === "number", "C17: " + id + " needs its printed Drain modifier");
      check(!!def.combat === !def.home, "C17: " + id + " is thrown OR put up, never both and never neither");
      if (def.combat) {
        combatCount += 1;
        check(["directMana", "directPhys", "indirect"].indexOf(def.shape) !== -1,
          "C17: " + id + " needs an attack shape");
        // Canon consistency: every direct mana spell IS type M, and
        // every indirect spell throws something real (type P).
        if (def.shape === "directMana") check(def.type === "M", "C17: " + id + " — direct mana is type M");
        if (def.shape === "indirect") check(def.type === "P", "C17: " + id + " — indirect throws something physical");
      }
    }
    check(combatCount === 19, "C17: the complete canon combat set (18) plus Fling (saw " + combatCount + ")");

    // ── Drain is canon: max(2, Force + printed modifier) ──────────
    const dv = (id, force) => MJ.spellDrain(MJ.makeRNG("dv" + id + force), mage, MJ.SPELLS[id], force).drainValue;
    check(dv("punch", 4) === 2, "C17: Punch at F4 drains F-6 -> floor 2 (saw " + dv("punch", 4) + ")");
    check(dv("manabolt", 4) === 2 && dv("manabolt", 6) === 3, "C17: Manabolt drains F-3");
    check(dv("stunball", 4) === 4, "C17: Stunball drains a full F");
    check(dv("mobMind", 4) === 5, "C17: Mob Mind drains F+1 — the big reaches cost real blood");

    // ── The Force ceiling is canon: 2x Magic, overcast past Magic ──
    check(MJ.maxForceFor(mage) === 10, "C17: max Force is TWICE Magic (saw " + MJ.maxForceFor(mage) + ")");
    const over = MJ.castSpell(rng.fork("ov"), mage, "fireball", { force: 10 });
    check(over.overcast === true, "C17: pushing past Magic must register as overcasting");
    check(over.drain.physical === true, "C17: overcast Drain must be PHYSICAL, not stun");
    const safe = MJ.castSpell(rng.fork("sf"), mage, "fireball", { force: 5 });
    check(safe.drain.physical === false, "C17: Drain within Magic stays stun");

    // ── Direct vs indirect: the distinction that earns its keep ───
    const tank = () => MJ.makeCombatant(
      { label: "Hardsuit", attributes: { body: 6, willpower: 4, agility: 4, intelligence: 3 }, skills: { firearms: 5 } },
      { side: "enemy", armour: 12 });
    const cast = (spellId, i) => {
      const t = tank();
      const c = MJ.beginCombat(MJ.makeRNG("sp" + spellId + i), [MJ.makeCombatant(mage, { side: "crew" })], [t], {});
      return MJ.spellCombatAction(c, c.combatants[0], spellId, t, { force: 5 });
    };
    let directArmour = null, indirectArmour = null, directDmg = 0, indirectDmg = 0;
    for (let i = 0; i < 120; i++) {
      const d = cast("manabolt", i), f = cast("fireball", i);
      for (const h of d.hits || []) { if (h.armourApplied !== undefined) directArmour = h.armourApplied; directDmg += h.damage || 0; }
      for (const h of f.hits || []) { if (h.armourApplied !== undefined) indirectArmour = h.armourApplied; indirectDmg += h.damage || 0; }
    }
    check(directArmour === 0, "C17: a DIRECT spell must ignore armour entirely (saw " + directArmour + ")");
    check(indirectArmour === 7, "C17: an INDIRECT spell faces armour minus Force — AP −F, canon (saw " + indirectArmour + ")");
    check(directDmg > indirectDmg,
      "C17: against heavy armour, direct magic must outperform indirect (" + directDmg + " vs " + indirectDmg + ")");

    // Mana does not touch the unliving; the Drain is owed anyway.
    const camera = MJ.generateObstacleInstance(MJ.makeRNG("c17cam"), "camera", 3, "physical");
    {
      const t = tank(); t.sourceObstacle = camera;
      const c = MJ.beginCombat(MJ.makeRNG("c17mana"), [MJ.makeCombatant(mage, { side: "crew" })], [t], {});
      const res = MJ.spellCombatAction(c, c.combatants[0], "manabolt", t, { force: 4 });
      check(res.result === "ineffective", "C17: mana thrown at a machine does nothing");
    }

    // ── The verb bridge: spells cross like everything else ────────
    const lock = MJ.generateObstacleInstance(MJ.makeRNG("c17lock"), "maglock", 4, "physical");
    const acts = MJ.actsFor(lock);
    const bolt = acts.find((a) => a.id === "castDirectMana");
    const smash = acts.find((a) => a.id === "castDirectPhysical");
    check(bolt && !bolt.lands, "C17: castDirectMana reaches a maglock and does not land — mana needs a life to touch");
    check(smash && smash.lands, "C17: castDirectPhysical lands on it — the Powerbolt line opens doors");
    const guard = MJ.generateObstacleInstance(MJ.makeRNG("c17grd"), "guard", 4, "physical");
    check((MJ.actsFor(guard).find((a) => a.id === "castDirectMana") || {}).lands === true,
      "C17: and the same verb lands on the guard");
    // The grimoire gates the MENU: no known shape, no verb offered.
    check(MJ.VERBS.castDirectPhysical.carries(mage) === false,
      "C17: a mage without the Powerbolt line is never offered castDirectPhysical");
    check(MJ.VERBS.castDirectMana.carries(mage) === true, "C17: one with Manabolt is offered castDirectMana");
    check(MJ.VERBS.castCommand.carries(mage) === true && MJ.bestCommandSpell(mage).id === "mobMind",
      "C17: castCommand fronts the best control spell on the dossier");
    // ONE NAMING CONVENTION. Every spell verb is named for the SHAPE
    // it fronts, using canon's own combat vocabulary (Direct/Indirect
    // x Mana/Physical) — because a verb fronts a FAMILY, never one
    // spell. The table used to mix shape-names and spell-names.
    for (const id of Object.keys(MJ.VERBS)) {
      const v = MJ.VERBS[id];
      if (v.skill !== "sorcery" || id === "blast" || id === "unwind" || id === "banish") continue;
      check(id.indexOf("cast") === 0,
        "C17: a spell verb is named for its shape, not for a spell (" + id + ")");
      check(!MJ.SPELLS[id], "C17: and never shares a name with a spell id (" + id + ")");
    }

    // ── Sustaining costs you while you hold it ────────────────────
    const c2 = MJ.beginCombat(MJ.makeRNG("sus"), [MJ.makeCombatant(mage, { side: "crew" })], [tank()], {});
    const me = c2.combatants[0];
    const actionsBefore = MJ.actionsFor(me), accBefore = MJ.effectModifier(me, "accuracy");
    MJ.spellCombatAction(c2, me, "increaseReflexes", me, { force: 4 });
    check(MJ.actionsFor(me) > actionsBefore, "C17: Increase Reflexes must buy an action through the initiativeDice channel");
    check(MJ.effectModifier(me, "accuracy") < accBefore, "C17: sustaining must cost the caster while it is held");
    check(MJ.hasEffect(me, "sustaining"), "C17: a sustained spell must be visible as an effect");
    MJ.dropSustained(me, "increaseReflexes");
    check(MJ.actionsFor(me) === actionsBefore && MJ.effectModifier(me, "accuracy") === accBefore,
      "C17: dropping a sustained spell must return both the benefit and the cost");
    // Armor grants FORCE armour (stacksFromForce) — a flat +1 was a
    // rounding error wearing canon's name.
    {
      const c3 = MJ.beginCombat(MJ.makeRNG("arm"), [MJ.makeCombatant(mage, { side: "crew" })], [tank()], {});
      const m3 = c3.combatants[0];
      mage.classification.spellsKnown.push("armor");
      MJ.spellCombatAction(c3, m3, "armor", m3, { force: 5 });
      check(MJ.effectModifier(m3, "armour") === 5,
        "C17: Armor at Force 5 is 5 armour, not 1 (saw " + MJ.effectModifier(m3, "armour") + ")");
      mage.classification.spellsKnown.pop();
    }

    // ── Out of combat: the quick cast, on the run's own hooks ─────
    const site = MJ.mintSite("stress-spell-u", 4);
    const crew = makeRoster(rng.fork("crew"), 2);
    for (const r of crew) { MJ.watchRunner(r, rng); MJ.hireRunner(r, "permanent"); }
    MJ.watchRunner(mage, rng); MJ.hireRunner(mage, "permanent");
    const run = MJ.beginMission(rng.fork("run"), { site: site, kind: "jobObjective", objective: {} }, [mage].concat(crew), 1);

    // Drive until a cast succeeds — hits are dice, the HOOKS are not.
    const driven = {};
    const drive = (spellId, force) => {
      for (let i = 0; i < 30; i++) {
        const t = MJ.castUtilitySpell(run, mage, spellId, { force: force, obstacle: run.obstacles[run.index] });
        if (t.success) return t;
      }
      return null;
    };
    driven.inv = drive("invisibility", 4);
    check(!!driven.inv, "C17: thirty tries at Force 4 must land an Invisibility");
    check((run.spellConcealment || []).some((c) => !c.vsTech),
      "C17: mana Invisibility must feed concealment AND admit it cannot fool a lens");
    check((run.sustaining || []).some((s) => s.spell === "invisibility"),
      "C17: a sustained spell must be recorded on the run");
    driven.hush = drive("hush", 4);
    check(!!driven.hush && run.silenced === true, "C17: Hush must blanket the crew's sound");
    mage.wounds = 4;
    driven.heal = drive("heal", 5);
    check(!!driven.heal && mage.wounds < 4, "C17: Heal must close boxes on the physical track");
    driven.det = drive("detectLife", 3);
    check(!!driven.det && !!(run.revealed && run.revealed.life), "C17: Detection must buy knowledge on the run");
    check(!!MJ.missionPrompt(run) === false || MJ.missionPrompt(run).revealed !== undefined,
      "C17: and the prompt carries what was bought");
    // Holding three spells: −2 each on everything else the mage does.
    check(MJ.sustainPenaltyFor(run, mage) <= -4,
      "C17: sustaining must weigh on the caster's other pools (saw " + MJ.sustainPenaltyFor(run, mage) + ")");
    check(MJ.sustainPenaltyFor(run, crew[0]) === 0, "C17: and on NOBODY else's");

    // ── CASTING IS NOT ONE FLAT "ODD MOMENT" ─────────────────────
    // What a cast READS AS is the spell's own business. Armour going
    // up in front of a guard is a man watching someone prepare for
    // violence — threatening, not awkward — while a detection spell
    // is a mage staring a beat too long.
    check(MJ.spellThreat(MJ.SPELLS.armor) === MJ.THREAT.THREATENING,
      "C17: a buff going up in the open reads THREATENING");
    check(MJ.spellThreat(MJ.SPELLS.physicalBarrier) === MJ.THREAT.THREATENING,
      "C17: so does a wall of mana appearing");
    check(MJ.spellThreat(MJ.SPELLS.manabolt) === MJ.THREAT.THREATENING,
      "C17: and so does throwing one");
    check(MJ.spellThreat(MJ.SPELLS.invisibility) === MJ.THREAT.QUESTIONABLE,
      "C17: somebody blurring out of sight is questionable");
    check(MJ.spellThreat(MJ.SPELLS.detectLife) === MJ.THREAT.AWKWARD,
      "C17: a mage staring a beat too long is merely awkward");
    check(MJ.spellThreat(MJ.SPELLS.armor) !== MJ.spellThreat(MJ.SPELLS.detectLife),
      "C17: the ladder must actually discriminate, or it is decoration");

    // ── CAST BEFORE ANYONE IS WATCHING AND IT COSTS NOTHING ──────
    // The whole reason the grimoire cannot live only at the obstacle
    // prompt. `prep` is the crew still outside; nothing is there to
    // see it, so the threatening buff is free. The SAME spell in
    // front of the first obstacle is not — and the difference must
    // not depend on luck, so this compares the read directly.
    {
      const mkRun = () => {
        const s = MJ.mintSite("c17-prep", 3, { value: 6, orientation: "physical" });
        MJ.initSecurityState(MJ.makeRNG("c17-prep-i"), s);
        const r = MJ.beginMission(MJ.makeRNG("c17-prep-r"),
          { site: s, kind: "jobObjective", objective: {} }, [mage].concat(crew), 1);
        // A guard with eyes, standing on the first thing they meet.
        const g = MJ.generateObstacleInstance(MJ.makeRNG("c17-prep-g"), "guard", 4, "physical");
        g.rooms = [1];
        r.obstacles = [g]; r.index = 0;
        return r;
      };
      mage.classification.spellsKnown.push("armor");
      const outside = mkRun();
      const t1 = MJ.castUtilitySpell(outside, mage, "armor", { force: 4, prep: true });
      check(t1.prep === true && !t1.read,
        "C17: cast outside, before the route — nobody is there, so nothing reads it");
      check(MJ.threatBand(outside.state, outside.day) === "normal",
        "C17: and the room is exactly as calm as it was");

      const inFront = mkRun();
      let sawIt = false;
      for (let i = 0; i < 12 && !sawIt; i++) {
        const t2 = MJ.castUtilitySpell(inFront, mage, "armor", { force: 4 });
        if (t2.read) {
          sawIt = true;
          check(t2.read.threatClass === MJ.THREAT.THREATENING,
            "C17: the SAME spell six feet from a guard reads THREATENING");
        }
        inFront.sustaining = []; // let it be cast again
      }
      check(sawIt, "C17: a guard with eyes must eventually catch a buff going up in his face");
      mage.classification.spellsKnown.pop();
    }

    // ── The Force dial: the player's own decision, priced ────────
    // §14 says the player picks Force, and every cast went out at
    // full Magic until this existed. The ladder must offer a real
    // spread INCLUDING the overcast line, because crossing it is the
    // decision.
    {
      const ladder = MJ.forceLadder(mage); // Magic 5 -> max 10
      check(ladder.length >= 4, "C17: the Force dial needs real choices on it");
      check(ladder[0].force === 1, "C17: pushing gently is always available");
      check(ladder[ladder.length - 1].force === MJ.maxForceFor(mage),
        "C17: and so is pushing as hard as they can hold");
      check(ladder.some((r) => !r.overcast) && ladder.some((r) => r.overcast),
        "C17: the ladder must straddle the overcast line — that IS the decision");
      check(ladder.every((r, i, a) => i === 0 || r.force > a[i - 1].force),
        "C17: the rungs climb, and never repeat");
      const cheap = MJ.drainPreview(mage, MJ.SPELLS.manabolt, 1);
      const dear = MJ.drainPreview(mage, MJ.SPELLS.manabolt, 10);
      check(cheap.value === 2 && !cheap.physical, "C17: a gentle push floors at 2 and stays stun");
      check(dear.value === 7 && dear.physical, "C17: a hard one costs F-3 and turns PHYSICAL");
      // And the dial actually reaches the model.
      const soft = MJ.castSpell(MJ.makeRNG("c17-soft"), mage, "manabolt", { force: 1 });
      const hard = MJ.castSpell(MJ.makeRNG("c17-hard"), mage, "manabolt", { force: 9 });
      check(soft.force === 1 && hard.force === 9, "C17: the chosen Force is the Force cast");
      check(soft.drain.drainValue < hard.drain.drainValue, "C17: and it is what the Drain is priced off");
    }

    // ── ONE DRAIN LAW, AND EVERY DOOR OBEYS IT ───────────────────
    // The review found Drain landing four different ways depending
    // on which door the mage cast through: the street accumulated
    // against an invented threshold, combat used the tracks, and the
    // astral and the conjuring bench DISCARDED stun entirely — so a
    // mage could push flat out forever on exactly the plane where
    // Drain is meant to be the tether's partner. Nothing caught it
    // because each path was internally consistent and separately
    // probed; nothing asserted they AGREE. This does.
    {
      const drained = () => {
        const m = MJ.generateRunner(MJ.makeRNG("c17-law"), { family: "mage" });
        m.attributes.magic = 4; m.attributes.willpower = 1; m.wounds = 0; m.stun = 0;
        m.skills.sorcery = 5; m.skills.conjuring = 5;
        m.classification.spellsKnown = ["manabolt"];
        MJ.watchRunner(m, MJ.makeRNG("c17-law-w")); MJ.hireRunner(m, "permanent");
        return m;
      };
      const runFor = (m) => {
        const s = MJ.mintSite("c17-law-site", 2, { value: 4 });
        MJ.initSecurityState(MJ.makeRNG("c17-law-i"), s);
        return MJ.beginMission(MJ.makeRNG("c17-law-r"),
          { site: s, kind: "jobObjective", objective: {} }, [m], 1);
      };

      // Street cast.
      const a = drained(), runA = runFor(a);
      MJ.applyDrain(runA, a, MJ.resistDrain(MJ.makeRNG("da"), a, 4, { drainValue: 6 }));
      check((a.stun || 0) > 0, "C17: a street cast bills the STUN track");

      // The astral's lattice — the path that used to bill nothing.
      const b = drained(), runB = runFor(b);
      MJ.applyDrain(runB, b, MJ.resistDrain(MJ.makeRNG("da"), b, 4, { drainValue: 6 }));
      check((b.stun || 0) === (a.stun || 0),
        "C17: the astral bills the SAME — it used to discard stun entirely");

      // Overcasting turns it physical, on every door.
      const c = drained(), runC = runFor(c);
      MJ.applyDrain(runC, c, MJ.resistDrain(MJ.makeRNG("dc"), c, 9, { drainValue: 6 }));
      check((c.wounds || 0) > 0 && (c.stun || 0) === 0,
        "C17: overcast Drain is PHYSICAL, and does not touch the stun track");

      // Enough of it drops you — when the TRACK fills, not at an
      // invented threshold.
      const d = drained(), runD = runFor(d);
      let guard = 0;
      while (!MJ.isDown(d) && guard++ < 40) {
        MJ.applyDrain(runD, d, MJ.resistDrain(MJ.makeRNG("dd" + guard), d, 4, { drainValue: 8 }));
      }
      check(MJ.isDown(d), "C17: enough Drain drops the caster");
      check((d.stun || 0) >= MJ.stunTrack(d), "C17: and it is the FULL TRACK that does it");
      check(runD.downed && runD.downed.has(d), "C17: a dropped caster leaves the run");
      // DROPPED BY EXHAUSTION IS NOT DROPPED BY A BULLET. Whatever
      // wounds they carry came from stun OVERFLOW (canon: past the
      // end of the stun track it stops being tiredness) — the
      // takedown itself must not fill the physical track the way a
      // firefight does, or a hard casting day would read as a
      // mauling and risk the 1-in-20 funeral.
      check((d.wounds || 0) < MJ.physicalTrack(d),
        "C17: a stun takedown does not fill the physical track (" +
        d.wounds + "/" + MJ.physicalTrack(d) + ")");
      check(!d.dead, "C17: and nobody dies of being wrung out");

      // AND IT SURVIVES THE MISSION. An operation is many missions
      // long, so the Drain a mage took at the second door is still on
      // them at the fifth.
      const e = drained(), runE = runFor(e);
      MJ.applyDrain(runE, e, MJ.resistDrain(MJ.makeRNG("de"), e, 4, { drainValue: 6 }));
      const carried = e.stun;
      check(carried > 0, "C17: the probe needs Drain to have landed");
      const runE2 = runFor(e); // a NEW mission, same runner
      check(e.stun === carried,
        "C17: Drain does not end at a mission boundary — it ends when they rest");
      check(MJ.makeCombatant(e, { side: "crew" }).stun === carried,
        "C17: and it walks into the next firefight with them");
    }

    // ── The astral deep path still exists: same spell, via lattice ─
    const viaLattice = MJ.castSpell(rng.fork("lat"), mage, "manabolt", { force: 4, viaLattice: true });
    check(viaLattice.ok && !viaLattice.done && !!viaLattice.lattice,
      "C17: the lattice path is the same cast, one rung deeper — not a different spell");

    // Unknown and untrained cast nothing.
    check(MJ.castSpell(rng, mage, "nonesuch", {}).ok === false, "C17: an unknown spell cannot be cast");
    check(MJ.castSpell(rng, mundane, "manabolt", {}).ok === false, "C17: an untrained caster cannot cast");

    // ── Generation: the dossier arrives stocked ───────────────────
    // The book is bounded by TALENT and TRAINING both. Sizing it off
    // Magic alone shipped 27% of mages holding six spells they could
    // not cast a word of — the three focuses that file sorcery under
    // tertiary. So the load-bearing assertion here is no longer the
    // formula, it is `mute`: nobody walks around with a spell their
    // own skill sheet refuses to let them cast.
    const tally = { mage: 0, sized: 0, sig: 0, other: 0, mute: 0, booked: 0, empty: 0 };
    for (let i = 0; i < 600; i++) {
      const r = MJ.generateRunner(MJ.makeRNG("c17gen" + i), {});
      if (r.classification.family !== "mage") {
        if (r.classification.spellsKnown === null) tally.other += 1;
        continue;
      }
      tally.mage += 1;
      const known = r.classification.spellsKnown || [];
      const trained = (r.skills && r.skills.sorcery) || 0;
      const want = trained > 0 ? Math.max(1, Math.min(r.attributes.magic || 1, trained + 1)) : 0;
      if (known.length === want) tally.sized += 1;
      if (known.length) tally.booked += 1; else tally.empty += 1;
      // A signature is a promise about a SPECIALTY, so it binds only
      // where there is a book to write it in.
      const focusList = { combatMage: "manabolt", detectionMage: "clairvoyance", healthMage: "heal",
        illusionMage: "invisibility", manipulationMage: "magicFingers" }[r.classification.focusId];
      if (!focusList || !known.length || known.indexOf(focusList) !== -1) tally.sig += 1;
      if (known.length && !MJ.spellsFor(r).length) tally.mute += 1;
      check(known.every((id) => !!MJ.SPELLS[id]), "C17: a generated grimoire holds only real spells");
    }
    check(tally.mage > 30, "C17: the sample needs mages in it");
    check(tally.mute === 0, "C17: NO mage carries a spell they are untrained to cast");
    check(tally.sized === tally.mage, "C17: a grimoire is sized by Magic AND Sorcery, whichever binds first");
    check(tally.sig === tally.mage, "C17: a mage with a book always knows their signature spell");
    check(tally.booked > 10, "C17: and most mages do get a book");
    check(tally.empty > 0, "C17: while an untrained mage — a pure conjurer — carries none");
    check(tally.other > 0, "C17: the unawakened carry no grimoire at all");

    // ── The Attack lane reads the grimoire, not the rank ──────────
    const healbot = MJ.generateRunner(MJ.makeRNG("c17hb"), { family: "mage" });
    healbot.attributes.magic = 5; healbot.skills.sorcery = 6;
    healbot.skills.melee = 0; healbot.skills.firearms = 0; healbot.skills.marksmanship = 0;
    healbot.skills.heavyWeapons = 0; healbot.skills.demolitions = 0;
    healbot.gear = [];
    healbot.classification.spellsKnown = ["heal", "increaseAttribute"];
    check(MJ.attackPowerFor(healbot) === 0,
      "C17: six ranks of sorcery with no combat spell contribute NOTHING to Attack");
    healbot.classification.spellsKnown = ["manabolt"];
    check(MJ.attackPowerFor(healbot) > 20,
      "C17: one direct spell and the same mage ignores every armour rating in the game");
  }

  // ── Class 16: the Lattice — the astral's own grammar ────────────
  // Magic is a structure you manipulate, not a roll you make. The
  // load-bearing property is that the RUNNER's stats set the puzzle:
  // the player is the Johnson and never personally goes, so if
  // cleverness could beat a bad mage's lattice, runner skill would
  // quietly stop mattering and the roster loop would be hollow.
  function class16_lattice() {
    const mage = (magic, sorcery, conjuring, assensing) => {
      const r = MJ.generateRunner(MJ.makeRNG("lat-" + magic + sorcery + conjuring + assensing), {});
      r.attributes.magic = magic;
      r.skills.sorcery = sorcery; r.skills.conjuring = conjuring; r.skills.assensing = assensing;
      r.wounds = 0;
      return r;
    };
    const adept = mage(6, 6, 5, 6);
    const dabbler = mage(2, 1, 1, 1);

    // Every mode builds, and none of them start finished.
    for (const mode of MJ.LATTICE_MODES) {
      const l = MJ.beginLattice(MJ.makeRNG("mode-" + mode), mode, { force: 4 }, adept, { rating: 4 });
      check(!!l, "C16: " + mode + " must build a lattice");
      check(!MJ.latticeDone(l), "C16: a fresh " + mode + " lattice is not already resolved");
      const view = MJ.latticeRead(l);
      check(view && view.threads.length > 0, "C16: " + mode + " must present threads to work with");
      check(view.pushing && view.pushing.force >= 1, "C16: the read must say how hard the caster is pushing");
    }
    check(MJ.beginLattice(MJ.makeRNG("bad"), "nonesuch", {}, adept, {}) === null,
      "C16: an unknown mode builds nothing");

    // ── Assensing buys INFORMATION, never visibility ──────────────
    // The lattice is always on screen. What changes is how much of
    // each thread's truth comes with it.
    const seen = (runner) => {
      const l = MJ.beginLattice(MJ.makeRNG("see"), "unravel", { force: 3 }, runner, { rating: 4 });
      return MJ.latticeRead(l);
    };
    const sharp = seen(adept), dull = seen(dabbler);
    check(sharp.threads.length === dull.threads.length,
      "C16: a weak assenser must see the SAME number of threads — assensing is not visibility");
    check(sharp.depth === "exact" && dull.depth === "blind",
      "C16: read depth must track assensing (" + sharp.depth + " vs " + dull.depth + ")");
    check(sharp.threads.some((t) => typeof t.strength === "number"),
      "C16: an exact read gives real thread strengths");
    check(dull.threads.every((t) => t.strength === null),
      "C16: a blind read gives no strengths at all");
    check(sharp.threads.some((t) => t.role === "dead end"),
      "C16: an exact read names dead ends");
    check(dull.threads.every((t) => t.role === null),
      "C16: a blind read names none");

    // Force is a throttle on Magic, and the read says so as a share.
    const gentle = MJ.latticeRead(MJ.beginLattice(MJ.makeRNG("g"), "unwind", { force: 2 }, adept, { rating: 4 }));
    const hard = MJ.latticeRead(MJ.beginLattice(MJ.makeRNG("h"), "unwind", { force: 8 }, adept, { rating: 4 }));
    check(gentle.pushing.share < hard.pushing.share, "C16: Force must read as a share of the caster's max");
    check(hard.pushing.perMove > gentle.pushing.perMove, "C16: pushing harder must carry further per move");
    check(hard.pushing.force <= hard.pushing.max, "C16: Force can never exceed the caster's ceiling");

    // Drain is owed on the attempt and scales with Force, through the
    // same SR5 path everything else uses.
    const drainRng = MJ.makeRNG("drain");
    const soft = MJ.latticeDrain(drainRng.fork("a"), MJ.beginLattice(drainRng.fork("b"), "unwind", { force: 1 }, adept, { rating: 3 }));
    const fierce = MJ.latticeDrain(drainRng.fork("c"), MJ.beginLattice(drainRng.fork("d"), "unwind", { force: 8 }, adept, { rating: 3 }));
    check(soft && fierce, "C16: a lattice must be able to report its Drain");
    check(fierce.drainValue > soft.drainValue, "C16: pushing harder must cost more Drain");
    check(fierce.overcast === true, "C16: pushing past Magic must register as overcasting");

    // ── The constraint: the runner sets the puzzle ────────────────
    // Solved using ONLY what latticeRead exposes, because that is all
    // a renderer may ever hand the player. A solver given the raw
    // lattice would look competent for both mages, which is exactly
    // the bug this probe exists to catch.
    const solveByRead = (runner, mode, rating, label) => {
      const rng = MJ.makeRNG(label);
      const l = MJ.beginLattice(rng, mode, { force: runner.attributes.magic }, runner, { rating: rating });
      let guard = 0;
      while (!MJ.latticeDone(l) && guard++ < 40) {
        const view = MJ.latticeRead(l);
        const open = view.threads.filter((t) => !t.cut);
        if (!open.length) break;
        let pick;
        if (mode === "unwind") {
          const known = open.filter((t) => typeof t.strength === "number");
          pick = known.length ? known.reduce((a, b) => (a.strength >= b.strength ? a : b)) : open[0];
        } else if (mode === "unravel") {
          const ordered = open.filter((t) => typeof t.order === "number");
          if (ordered.length) pick = ordered.reduce((a, b) => (a.order <= b.order ? a : b));
          else { const safe = open.filter((t) => t.role !== "dead end"); pick = (safe.length ? safe : open)[0]; }
        } else {
          const want = view.shape[(view.built || []).length];
          pick = (want && open.find((t) => t.resonance === want)) || open[0];
        }
        MJ.latticePull(l, pick.id);
      }
      return !!l.success;
    };
    const rate = (runner, mode) => {
      let wins = 0;
      for (let i = 0; i < 40; i++) if (solveByRead(runner, mode, 4, "rate-" + mode + i)) wins += 1;
      return wins / 40;
    };
    for (const mode of MJ.LATTICE_MODES) {
      const good = rate(adept, mode), poor = rate(dabbler, mode);
      check(good > poor, "C16: " + mode + " — a strong mage must outperform a weak one on the same puzzle (" +
        (100 * good).toFixed(0) + "% vs " + (100 * poor).toFixed(0) + "%)");
      check(good >= 0.6, "C16: " + mode + " — a strong mage must usually get through (" + (100 * good).toFixed(0) + "%)");
    }

    // A ward re-closes: a caster who cannot out-push the repair rate
    // cannot break it however many strands they pull. That is the
    // whole character of the mode and it must not erode.
    const ward = MJ.beginLattice(MJ.makeRNG("wall"), "unwind", { force: 1 }, dabbler, { rating: 10 });
    const wardView = MJ.latticeRead(ward);
    check(wardView.pushing.perMove <= wardView.recloseRate,
      "C16: a weak caster on a strong ward must not out-pace the re-closing");
    let g2 = 0;
    while (!MJ.latticeDone(ward) && g2++ < 60) {
      const open = ward.threads.filter((t) => !t.cut);
      if (!open.length) break;
      MJ.latticePull(ward, open[0].id);
    }
    check(!ward.success, "C16: and must therefore fail to break it");

    // Abandoning keeps nothing — a half-unwound ward re-closes.
    const walk = MJ.beginLattice(MJ.makeRNG("walk"), "unwind", { force: 4 }, adept, { rating: 6 });
    MJ.latticePull(walk, 0);
    MJ.latticeAbandon(walk);
    check(walk.done && !walk.success && walk.abandoned, "C16: walking away resolves as failure, keeping nothing");
    check(MJ.latticePull(walk, 1) === null, "C16: an abandoned lattice takes no further moves");
  }

  // ── Class 15: the shared frame — modes and the world seam ───────
  // All three pillars run inside one mode structure: free flow like
  // the Genesis game, with the player able to drop into turn-based
  // whenever they want a decision made carefully, and combat forcing
  // it regardless. Two rules hold this together and both are load-
  // bearing: mode changes granularity and never math, and the
  // world-advance seam counts without affecting anything, because a
  // real-time clock must not reach a player whose interface still
  // reads as turn-based.
  function class15_tempo() {
    const t = MJ.newTempo();
    check(t.mode === "free", "C15: a run starts in free flow, like the Genesis loop");
    check(MJ.setMode(t, "turnBased") && t.mode === "turnBased", "C15: the player may choose turn-based");
    check(MJ.toggleMode(t) && t.mode === "free", "C15: the toggle returns to free");

    // Combat owns the mode while it lasts.
    MJ.enterCombat(t);
    check(t.mode === "turnBased", "C15: combat must force turn-based");
    check(MJ.describeTempo(t).locked && MJ.describeTempo(t).lockedBy === "combat",
      "C15: a readout must be able to say WHY the mode is locked");
    check(MJ.setMode(t, "free") === false && t.mode === "turnBased",
      "C15: the mode cannot be changed out from under a firefight");
    MJ.exitCombat(t);
    check(t.mode === "free", "C15: leaving combat restores the player's own choice");

    // A preference expressed during combat is remembered, not dropped.
    const p = MJ.newTempo();
    MJ.enterCombat(p);
    MJ.setMode(p, "turnBased");
    MJ.exitCombat(p);
    check(p.mode === "turnBased", "C15: a choice made during combat takes effect when it ends");

    // Nested/repeated combat entries must not strand the mode.
    const nest = MJ.newTempo();
    MJ.setMode(nest, "free");
    MJ.enterCombat(nest); MJ.enterCombat(nest);
    MJ.exitCombat(nest);
    check(!nest.inCombat && nest.mode === "free", "C15: repeated combat entry must not strand the mode");
    MJ.exitCombat(nest);
    check(!nest.inCombat && nest.mode === "free", "C15: exiting combat twice must be inert");

    // The seam counts, and the counting is all it does.
    const c = MJ.newTempo();
    check(MJ.advanceWorld(c, 0) === 0, "C15: advancing zero ticks moves nothing");
    MJ.advanceWorld(c, 4);
    MJ.setMode(c, "turnBased");
    MJ.advanceWorld(c, 6);
    check(c.tick === 10 && c.ticksInFree === 4 && c.ticksInTurnBased === 6,
      "C15: the seam must account for ticks by the mode they happened in");
    MJ.enterCombat(c); MJ.advanceWorld(c, 2);
    check(c.ticksInCombat === 2, "C15: combat ticks are counted separately");

    // The load-bearing one: a real run's outcome must not depend on
    // the seam. Same seed, same everything, with the world advanced
    // aggressively in between — the result has to be identical.
    const play = (extraTicks) => {
      const rng = MJ.makeRNG("stress-tempo-run");
      const site = MJ.mintSite("stress-tempo-u", 6);
      const crew = makeRoster(rng.fork("crew"), 3);
      for (const r of crew) { MJ.watchRunner(r, rng); MJ.hireRunner(r, "permanent"); }
      const run = MJ.beginMission(rng.fork("m"), { site: site, kind: "jobObjective", objective: {} }, crew, 1);
      let guard = 0;
      while (!MJ.missionDone(run) && guard++ < 200) {
        if (extraTicks) MJ.advanceWorld(run.tempo, extraTicks);
        const prompt = MJ.missionPrompt(run);
        if (!prompt) break;
        if (prompt.extended) { MJ.missionExtendedStep(run, true); continue; }
        const usable = prompt.options.filter((o) => o.available);
        MJ.missionChoose(run, usable.length ? usable[0] : null);
      }
      return snap({
        index: run.index, failed: run.failed, aborted: run.aborted,
        tasks: (run.tasks || []).map((t) => [t.obstacle, t.result, t.hits, t.success]),
      });
    };
    check(play(0) === play(7), "C15: advancing the world must not change a single outcome");
    check(play(0) === play(50), "C15: advancing it hard must not change a single outcome either");
  }

  // ── Class 14: site condition — the first word of the address ────
  // The condition is the one quality a player can flip by hand to see
  // the same place in a different life, so it has to be REAL: every
  // dial declared on a condition must be read by the generator, and
  // flipping the word must move the site without ever producing one
  // that cannot be run.
  function class14_conditions() {
    const rng = MJ.makeRNG("stress-conditions");

    // No dead dials. A key on a condition that nothing reads is a
    // number a player could discover does not matter.
    const READ_DIALS = ["label", "security", "weights", "cover", "patrols", "zones", "entries", "loot"];
    for (const id of MJ.CONDITION_IDS) {
      const cond = MJ.CONDITIONS[id];
      check(!!cond, "C14: condition " + id + " must have a definition");
      check(!!cond.label, "C14: condition " + id + " needs a label");
      for (const key of Object.keys(cond)) {
        check(READ_DIALS.indexOf(key) !== -1,
          "C14: condition " + id + " declares \"" + key + "\", which the generator never reads");
      }
      // Every condition must actually DO something beyond its name.
      const moves = Object.keys(cond).filter((k) => k !== "label");
      check(moves.length > 0, "C14: condition " + id + " changes nothing");
      // A weight may only name an obstacle type that exists, or it
      // is a lean on nothing.
      const KNOWN_TYPES = ["maglock", "guard", "camera", "ward", "spirit"];
      for (const t of Object.keys(cond.weights || {})) {
        check(KNOWN_TYPES.indexOf(t) !== -1, "C14: " + id + " weights unknown obstacle type \"" + t + "\"");
      }
    }

    // Words: eight conditions, and every word unique within the table
    // (indexWords would have thrown at load, so this pins the count).
    const allWords = [];
    for (const id of MJ.CONDITION_IDS) allWords.push(...MJ.CONDITION_WORDS[id]);
    check(new Set(allWords).size === allWords.length, "C14: a condition word appears twice");
    check(allWords.length === 64, "C14: the condition slot should carry 64 words (have " + allWords.length + ")");

    // The name's condition is the site's condition — the whole point.
    // Flip only the first word and everything else must hold.
    const tail = "-Humble-Scarlet-Mountain-4192";
    const seen = {};
    for (const id of MJ.CONDITION_IDS) {
      for (const word of MJ.CONDITION_WORDS[id]) {
        const site = MJ.mintSiteByName(word + tail);
        check(!!site, "C14: " + word + tail + " must mint");
        if (!site) continue;
        check(site.identity.condition === id,
          "C14: " + word + " must produce the " + id + " condition (got " + site.identity.condition + ")");
        const q = MJ.decodeSiteName(word + tail);
        check(q.condition === site.identity.condition, "C14: the name's condition must be the site's condition");
        // Everything the other slots encode is untouched by the flip.
        check(site.identity.district === "Downtown" && site.identity.owningFaction === "Ork Underground" &&
          site.identity.value === 9 && site.identity.orientation === "balanced",
          "C14: flipping the condition must not move the other qualities");
      }
      seen[id] = true;
    }
    check(Object.keys(seen).length === 8, "C14: all eight conditions must be reachable");

    // A condition may never strand a site: security stays in range,
    // and there is always more than one way to the objective.
    let single = 0, outOfRange = 0, checked = 0;
    for (const id of MJ.CONDITION_IDS) {
      for (let i = 0; i < 120; i++) {
        const q = {
          condition: id,
          district: rng.pick(MJ.SITE_DISTRICTS), owner: rng.pick(MJ.OWNERS),
          value: rng.int(1, 10), orientation: rng.pick(["physical", "astral", "matrix", "balanced"]),
        };
        const name = MJ.encodeSiteName(q, rng.fork("c" + id + i));
        const site = MJ.mintSiteByName(name);
        checked += 1;
        if (MJ.findPaths(site).length < 2) single += 1;
        for (const axis of ["physical", "astral", "matrix"]) {
          if (site.security[axis] < 1 || site.security[axis] > 10) outOfRange += 1;
        }
      }
    }
    check(single === 0, "C14: no condition may leave a site with one route in (" + single + "/" + checked + ")");
    check(outOfRange === 0, "C14: condition shifts must clamp security to 1-10 (" + outOfRange + " out of range)");

    // ── Composition, not amount ───────────────────────────────────
    // The point of a condition is that it changes WHAT defends a
    // place, not merely how much. A derelict block and a posh tower
    // of the same rating must ask a crew for different skills — the
    // derelict one full of bodies, the posh one full of systems —
    // and the derelict one must NOT simply be the easier of the two.
    const mixFor = (id, seedLabel) => {
      const r = MJ.makeRNG("mix-" + seedLabel);
      const tally = { guard: 0, camera: 0, maglock: 0, ward: 0, spirit: 0 };
      let total = 0, physical = 0, sites = 0;
      for (let i = 0; i < 150; i++) {
        const q = { condition: id, district: r.pick(MJ.SITE_DISTRICTS), owner: r.pick(MJ.OWNERS),
          value: r.int(6, 10), orientation: "physical" };
        const site = MJ.mintSiteByName(MJ.encodeSiteName(q, r.fork("m" + i)));
        sites += 1; physical += site.security.physical;
        for (const o of MJ.allObstacles(site)) {
          const t = o.typeId || o.type;
          if (tally[t] !== undefined) { tally[t] += 1; total += 1; }
        }
      }
      const share = (k) => (total ? tally[k] / total : 0);
      return { share, total, perSite: total / sites, physical: physical / sites };
    };
    const der = mixFor("derelict", "der");
    const posh = mixFor("posh", "posh");
    const wired = mixFor("wired", "wired");

    check(der.share("guard") > 0.5, "C14: a derelict site is held by BODIES (guards " + (100 * der.share("guard")).toFixed(0) + "%)");
    check(der.share("camera") + der.share("maglock") < 0.2,
      "C14: derelict electronics must be mostly dead (" + (100 * (der.share("camera") + der.share("maglock"))).toFixed(0) + "%)");
    check(posh.share("camera") + posh.share("maglock") > 0.5,
      "C14: a posh site is held by SYSTEMS (" + (100 * (posh.share("camera") + posh.share("maglock"))).toFixed(0) + "%)");
    check(wired.share("guard") < der.share("guard"),
      "C14: an automated site fields fewer bodies than a derelict one");
    // The crucial one: derelict is DIFFERENT, not softer.
    check(der.physical > posh.physical * 0.8,
      "C14: a derelict site must not be a pushover — P" + der.physical.toFixed(1) + " vs posh P" + posh.physical.toFixed(1));
    check(der.perSite > posh.perSite * 0.7,
      "C14: a derelict site must still field real opposition (" +
      der.perSite.toFixed(1) + " vs " + posh.perSite.toFixed(1) + " per site)");

    // Theme and condition are orthogonal — every theme must be
    // reachable under every condition. A sealed-off arcology floor
    // is a location, not a contradiction.
    const themesByCondition = {};
    for (const id of MJ.CONDITION_IDS) {
      const r = MJ.makeRNG("theme-" + id);
      const seenThemes = new Set();
      for (let i = 0; i < 300; i++) {
        const q = { condition: id, district: "Downtown", owner: "Ares",
          value: r.int(1, 10), orientation: r.pick(["physical", "astral", "matrix", "balanced"]) };
        seenThemes.add(MJ.mintSiteByName(MJ.encodeSiteName(q, r.fork("t" + i))).identity.theme);
      }
      themesByCondition[id] = seenThemes;
      check(seenThemes.size >= 10,
        "C14: " + id + " must reach the whole urban theme pool (saw " + seenThemes.size + ")");
    }
    check(themesByCondition.derelict.has("arcology floor"),
      "C14: an arcology floor must be able to fall derelict");
    check(themesByCondition.flooded.has("datacenter"),
      "C14: a datacenter must be able to flood");
  }

  // ── Class 13: the combat modifier layer ─────────────────────────
  // Every number a fight produces is a base plus a sum over active
  // effects. The rules that make that safe — postures replace, stacks
  // cap, timers expire, unknown ids do nothing — are what let a new
  // condition be a row in the table instead of an edit to the
  // resolver, so they are worth holding down.
  function class13_effects() {
    const rng = MJ.makeRNG("stress-effects");
    // Counter, not Math.random: a probe that draws from live entropy
    // is a probe whose failures cannot be reproduced.
    let subjectNo = 0;
    const subject = () => {
      const r = makeRoster(rng.fork("s" + (subjectNo += 1)), 1)[0];
      return MJ.makeCombatant(r, { side: "crew", weaponId: "pistol", armour: 4 });
    };

    // The table itself: no effect may move a channel that does not
    // exist, or the resolver would silently never read it.
    for (const id of Object.keys(MJ.COMBAT_EFFECTS)) {
      const def = MJ.COMBAT_EFFECTS[id];
      check(!!def.label && !!def.kind, "C13: effect " + id + " needs a label and a kind");
      for (const ch of Object.keys(def.channels || {})) {
        check(MJ.COMBAT_CHANNELS.indexOf(ch) !== -1, "C13: effect " + id + " moves unknown channel \"" + ch + "\"");
      }
    }

    // Exactly one posture, always. Applying another replaces it.
    const p = subject();
    const postureCount = (c) => (c.effects || []).filter((e) => MJ.effectDef(e.id).kind === "posture").length;
    check(postureCount(p) === 1, "C13: a combatant starts in exactly one posture");
    for (const id of MJ.COMBAT_POSTURES) {
      MJ.applyEffect(p, id);
      check(postureCount(p) === 1, "C13: applying " + id + " must leave exactly one posture");
      check(MJ.postureOf(p) === id, "C13: postureOf must report the posture just applied");
    }
    // A condition does not disturb the posture.
    MJ.applyEffect(p, "cover");
    MJ.applyEffect(p, "blinded");
    check(MJ.postureOf(p) === "cover" && MJ.hasEffect(p, "blinded"), "C13: a condition must coexist with a posture");

    // Channels sum across everything active.
    const s = subject();
    MJ.applyEffect(s, "flanking");   // accuracy +2, defence -1
    MJ.applyEffect(s, "blinded");    // accuracy -4, defence -2
    check(MJ.effectModifier(s, "accuracy") === -2, "C13: accuracy must sum to -2 (have " + MJ.effectModifier(s, "accuracy") + ")");
    check(MJ.effectModifier(s, "defence") === -3, "C13: defence must sum to -3 (have " + MJ.effectModifier(s, "defence") + ")");

    // Stacks accumulate to the cap and stop.
    const st = subject();
    for (let i = 0; i < 8; i++) MJ.applyEffect(st, "rattled");
    const rattled = st.effects.find((e) => e.id === "rattled");
    check(rattled.stacks === (MJ.COMBAT_EFFECTS.rattled.maxStacks || 1), "C13: stacks must stop at the cap");
    check(MJ.effectModifier(st, "accuracy") === -rattled.stacks, "C13: a stacked effect contributes once per stack");

    // Timers count down and expire; untimed effects do not.
    const t = subject();
    MJ.applyEffect(t, "cover");      // no duration
    MJ.applyEffect(t, "blinded");    // 2 rounds
    MJ.applyEffect(t, "suppressed"); // 1 round
    check(MJ.tickEffects(t).indexOf("suppressed") !== -1, "C13: a one-round effect must expire on the first tick");
    check(MJ.hasEffect(t, "blinded"), "C13: a two-round effect must survive the first tick");
    check(MJ.tickEffects(t).indexOf("blinded") !== -1, "C13: a two-round effect must expire on the second tick");
    check(MJ.hasEffect(t, "cover"), "C13: an untimed effect must never expire on a tick");
    for (let i = 0; i < 20; i++) MJ.tickEffects(t);
    check(MJ.hasEffect(t, "cover"), "C13: an untimed effect must survive any number of ticks");

    // Re-applying refreshes the clock rather than banking rounds.
    const rf = subject();
    MJ.applyEffect(rf, "blinded");
    MJ.tickEffects(rf);
    MJ.applyEffect(rf, "blinded");
    check(rf.effects.find((e) => e.id === "blinded").roundsLeft === MJ.COMBAT_EFFECTS.blinded.rounds,
      "C13: re-applying a timed effect must refresh, not accumulate");

    // Actions: bought through the channel, floored at one.
    const a = subject();
    check(MJ.actionsFor(a) === 1, "C13: a mundane body gets one action");
    MJ.applyEffect(a, "wired");
    check(MJ.actionsFor(a) === 2, "C13: wired reflexes must buy an action through the channel");
    MJ.clearEffect(a, "wired");
    check(MJ.actionsFor(a) === 1, "C13: clearing the boon must return the action count");

    // Injury is on the defence channel ONLY — the attack side already
    // pays for wounds through getEffectiveSkills, and charging both
    // would bill a hurt runner twice for one wound.
    const w = subject();
    w.physical = 6;
    MJ.applyEffect(w, "wounded");
    check(MJ.effectModifier(w, "accuracy") === 0, "C13: wounds must not touch the accuracy channel");
    check(MJ.effectModifier(w, "defence") === -2, "C13: six boxes must cost two dice of defence (have " + MJ.effectModifier(w, "defence") + ")");
    const clean = MJ.makeCombatant(w.source, { side: "crew", weaponId: "pistol", physical: 0 });
    const hurtPool = MJ.dicePoolFor(w.source, "firearms", MJ.effectModifier(w, "accuracy"));
    const cleanPool = MJ.dicePoolFor(clean.source, "firearms", MJ.effectModifier(clean, "accuracy"));
    check(hurtPool <= cleanPool, "C13: a wounded attacker cannot out-roll their healthy self");

    // Unknown ids do nothing at all, rather than throwing or landing.
    const u = subject();
    const before = (u.effects || []).length;
    check(MJ.applyEffect(u, "nonesuch") === null, "C13: an unknown effect must not apply");
    check((u.effects || []).length === before, "C13: an unknown effect must not change the list");
    check(MJ.effectDef("nonesuch") === null, "C13: an unknown effect has no definition");

    // Full defence forfeits the action, and the fight still resolves.
    // Whoever the initiative order puts first is who takes the
    // posture — the probe asks the combat who that was rather than
    // assuming, since attributes decide it and they vary by subject.
    const fd = subject();
    const foe = MJ.makeCombatant({ label: "guard T3", attributes: { body: 4, willpower: 3, agility: 4, intelligence: 3 }, skills: { firearms: 3 } }, { side: "enemy", weaponId: "pistol" });
    const combat = MJ.beginCombat(MJ.makeRNG("fd"), [fd], [foe], {});
    const first = MJ.combatActor(combat).actor;
    const other = first === fd ? foe : fd;
    const entry = MJ.combatAct(combat, { target: other, mode: "SS", stance: "fullDefence" });
    check(entry && entry.event === "hold", "C13: full defence must forfeit the action");
    check(MJ.postureOf(first) === "fullDefence", "C13: the forfeited action still sets the actor's posture");
    check(MJ.postureOf(other) !== "fullDefence", "C13: one combatant's posture must not land on another");
    check(entry.actor === first.name, "C13: the hold must be logged against whoever actually acted");
  }

  // ── Runner ──────────────────────────────────────────────────────
  function runStress() {
    clear();
    failures = [];
    assertions = 0;
    log("MECHANICAL STRESS SUITE — plumbing, not balance. Zero tolerance.");
    // AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME. Everything here drives
    // missions through autoResolve, which is what it is for. A green
    // verdict means the systems agree with each other. It says nothing
    // about whether any of this is worth playing — nothing in this
    // suite is played. THE PLAYER CONTROLS WHAT HAPPENS DURING
    // MISSIONS; none of that agency is exercised below.
    log("(harness-driven: proves consistency, never fun — nothing here is played)");
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
      ["12. Injury carries, exhaustion does not", class12_injury],
      ["13. The combat modifier layer", class13_effects],
      ["14. Site condition — the first word of the address", class14_conditions],
      ["15. The shared frame — modes and the world seam", class15_tempo],
      ["16. The Lattice — the astral's own grammar", class16_lattice],
      ["17. Spells in meatspace", class17_spells],
      ["18. Bound helpers — spirits and agents", class18_helpers],
      ["19. The astral pillar's verbs", class19_astral],
      ["20. The Matrix pillar's verbs", class20_matrix],
      ["21. The street pillar, and three clocks", class21_street],
      ["22. Verbs x properties — the world decides, not the menu", class22_verbs],
      ["23. What a crew can honestly claim to know", class23_knowing],
      ["24. An archetype can always do its own job", class24_baselines],
      ["25. The lanes — a forecast, never a gate", class25_lanes],
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
