/* ============================================================
   Mr. Johnson — harness.js
   Phase 0 developer inspector. Not part of the game — a bench
   for proving the foundational systems produce sane, varied,
   reproducible output before any real UI exists.
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

  // ── P1 — job board: reuse vs. introduce, tier derived from site ─
  function fmtCrew(intendedCrew) {
    if (intendedCrew.fixed !== undefined) return `${intendedCrew.fixed} runner(s)`;
    return `${intendedCrew.min}-${intendedCrew.max} runners`;
  }

  function dumpJob(entry, index) {
    const { job, site, wasReused } = entry;
    const verb = MJ.OBJECTIVE_VERBS[job.objectiveVerb];
    log(`[${index}] ${verb.label} (${job.payloadDomain})  —  ${MJ.JOB_FAMILIES[job.family].label}  —  tier: ${job.tier}`);
    log(`    client: ${job.client}   target: ${job.target}   pay: ~${job.pay}   crew: ${fmtCrew(job.intendedCrew)}   expires day ${job.expiryDay}`);
    log(`    site: ${site.identity.district} (${site.identity.owningFaction})  value:${site.identity.value} orientation:${site.identity.orientation}  ${wasReused ? "[REUSED]" : "[introduced]"}`);
    log(`    fail state: ${verb.failState}`);
    log("");
  }

  function testBoard() {
    clear();
    const seed = document.getElementById("seed").value || "mr-johnson";
    const rng = MJ.makeRNG(seed);
    log("SEED: " + seed + "   (board of 6, empty starting site pool)");
    log("");

    // A fresh operation starts with no persistent site pool — every
    // job on day one has to introduce. A returning pool would let
    // some of these reuse instead (see the harness console notes).
    const sitePool = [];
    const currentDay = 1;
    const board = MJ.generateBoard(rng, sitePool, currentDay, 6);
    board.forEach((entry, i) => dumpJob(entry, i));

    const reusedCount = board.filter((e) => e.wasReused).length;
    log(`reused: ${reusedCount}/${board.length}   (expected 0 — pool was empty)`);
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
    document.getElementById("btn-new-game").addEventListener("click", newGame);
    document.getElementById("btn-roll-day").addEventListener("click", rollDay);
    document.getElementById("btn-reload-save").addEventListener("click", reloadSave);

    // Pick up an existing save on load, same as a real page refresh would.
    currentSave = await MJ.loadGame();
    updateDayStatus();

    log("Mr. Johnson — Phase 0 inspector ready.");
    log('Enter a seed and hit a button. Same seed always reproduces.');
    if (currentSave) log(`Existing save found: day ${currentSave.meta.currentDay}.`);
  });
})();
