/* ============================================================
   Mr. Johnson — core/rng.js
   Seeded, deterministic pseudo-random number generator.

   Everything in the game (runners, sites, jobs) is generated
   FROM a seed, so the save file can store seeds instead of
   content and reproduce anything exactly. This module is the
   foundation that guarantee rests on: same seed in, same
   sequence out, on every machine, forever.

   Usage:
     const rng = MJ.makeRNG("some-seed");   // string or number
     rng.float();            // 0..1
     rng.int(1, 6);          // inclusive integer
     rng.chance(0.10);       // true ~10% of the time
     rng.pick(["a","b"]);    // random element
     rng.weighted([{item:"x",weight:3},{item:"y",weight:1}]);
     rng.shuffle([1,2,3]);   // shuffled copy (original untouched)
     const child = rng.fork("runners");  // independent sub-stream
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // xmur3: hash a string into a well-mixed 32-bit seed.
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }

  // mulberry32: fast, solid 32-bit generator. Returns floats in [0,1).
  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRNG(seed) {
    const seedStr = String(seed);
    const next = mulberry32(xmur3(seedStr)());

    const api = {
      seed: seedStr,

      // Raw float in [0, 1).
      float: next,

      // Inclusive integer in [min, max].
      int(min, max) {
        return Math.floor(next() * (max - min + 1)) + min;
      },

      // Float in [min, max).
      range(min, max) {
        return next() * (max - min) + min;
      },

      // True with probability p (0..1).
      chance(p) {
        return next() < p;
      },

      // Uniform random element of an array.
      pick(arr) {
        return arr[Math.floor(next() * arr.length)];
      },

      // Weighted pick. entries: [{ item, weight }, ...] (weights > 0).
      // Returns the chosen item.
      weighted(entries) {
        let total = 0;
        for (const e of entries) total += e.weight;
        let roll = next() * total;
        for (const e of entries) {
          roll -= e.weight;
          if (roll < 0) return e.item;
        }
        return entries[entries.length - 1].item; // float-safety fallback
      },

      // Fisher-Yates shuffle. Returns a NEW array; input untouched.
      shuffle(arr) {
        const out = arr.slice();
        for (let i = out.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          [out[i], out[j]] = [out[j], out[i]];
        }
        return out;
      },

      // Derive an independent, deterministic child generator.
      // Used to give each generated entity its own reproducible
      // sub-stream from a parent seed (the save's seed-tree).
      fork(label) {
        return makeRNG(seedStr + ":" + label);
      },
    };

    return api;
  }

  MJ.makeRNG = makeRNG;
})();
