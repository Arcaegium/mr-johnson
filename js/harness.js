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

  window.addEventListener("DOMContentLoaded", () => {
    document.getElementById("btn-rng").addEventListener("click", testRNG);
    log("Mr. Johnson — Phase 0 inspector ready.");
    log('Enter a seed and hit a button. Same seed always reproduces.');
  });
})();
