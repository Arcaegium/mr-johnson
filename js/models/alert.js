/* ============================================================
   Mr. Johnson — models/alert.js
   Live security: the Min/Current/Max triple per axis and the
   one-pool-per-site Alert machine (design bible §09 "Security is
   live: Min / Current / Max, and the Alert pool").

   Core rules this file implements:
     - Each security axis (physical/astral/matrix) is a triple:
       Max is site.js's Value+Orientation derivation (the capability
       ceiling), Min is the per-site resting posture (a design knob:
       tough-nut sites rest near their ceiling, sleepy ones far
       below), Current is the live number obstacles/thresholds/Karma
       actually read. Value stays frozen economic identity — worth
       vs. difficulty are different numbers now (§09).
     - Alert is ONE pool per site spanning all three pillars, fed by
       noise (loud actions, glitches — clean quiet work barely
       registers), decaying a step per day. Its ceiling is seeded
       from Value and grows with the fortification layer, never a
       flat universal 10.
     - Sustained pressure (noisy hits landing while Alert is still
       elevated) ratchets Current up across all axes, capped at Max.
       Pressure that keeps coming while an axis is pinned at Max
       grows Current AND Max together at a slower pace. Max never
       decreases. When fully cooled, Current bleeds back toward Min.

   Confirmed design (not a placeholder): a zero-noise hit (clean,
   quiet, no glitch) does NOT count as sustained pressure even while
   Alert is elevated — the site can't respond to what it never
   noticed. A ghost run staying a ghost run all the way down is
   exactly why it's the ideal outcome of a mission. Also confirmed:
   under long sustained pressure, orientation-weak axes pin early
   and grow Max often, so a lopsided site converges toward balanced
   — heavily farmed sites are exactly the ones that would invest in
   overall improved security. Intended, not an artifact.

   This file does NOT implement: what generates a "hit" (that's
   mission resolution, not built), re-deriving obstacle placement
   from Current instead of generation-time security (integration
   work, tracked in the build plan), or serializing this state into
   save.world.sitePool deltas (integration layer, same).

   NOTE — scale: every constant below is a first-pass placeholder
   giving the confirmed *shape* (noise feeds Alert, elevated-window
   pressure ratchets, pinned pressure grows Max slower, quiet cools
   Current toward Min), not a calibrated number.

   Usage:
     MJ.initSecurityState(rng, site);       // attaches site.securityState
     MJ.recordHit(state, { loud, glitch }); // one run's noise landing
     MJ.advanceSiteDay(state);              // daily decay/cooling tick
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const AXES = ["physical", "astral", "matrix"];

  // ── Tuning dials (all placeholder, shape only) ──────────────────
  const ALERT_LOUD = 2;          // a loud hit's Alert contribution
  const ALERT_GLITCH_EXTRA = 1;  // added on top when the crew glitched
  const ALERT_DECAY_PER_DAY = 1;
  const RATCHET_THRESHOLD = 3;   // sustained noisy hits -> one ratchet
  const PINNED_RATCHETS_PER_MAX_GROWTH = 2; // "slower pace" for Max
  const QUIET_DAYS_PER_COOL_STEP = 5;       // fully-cooled days -> Current -1
  const MIN_FRACTION_LOW = 0.4;  // resting-posture roll, as a share of Max
  const MIN_FRACTION_HIGH = 1.0; // (1.0 = "tough nut": never relaxes at all)

  // ── Init: wrap site.js's derived security into live triples ────
  // site.security (the Value+Orientation derivation) becomes each
  // axis's Max; Min is rolled per axis as the resting-posture knob;
  // Current starts at rest. Alert's ceiling seeds from Value.
  function initSecurityState(rng, site) {
    const axes = {};
    for (const axis of AXES) {
      const max = site.security[axis];
      const min = Math.max(1, Math.min(max, Math.round(max * rng.range(MIN_FRACTION_LOW, MIN_FRACTION_HIGH))));
      axes[axis] = { min: min, current: min, max: max, pinnedRatchets: 0 };
    }
    site.securityState = {
      alert: 0,
      alertMax: site.identity.value,
      sustainedHits: 0,
      quietDays: 0,
      // Latched forever on the first capacity expansion — permanent
      // history that (among other things) blocks §09 compression.
      everGrew: false,
      axes: axes,
    };
    return site.securityState;
  }

  // ── One ratchet event: Current up everywhere, Max slower ────────
  // Below Max: posture escalates (+1 Current). Pinned at Max: every
  // PINNED_RATCHETS_PER_MAX_GROWTHth ratchet expands actual capacity
  // (+1 Current AND Max). Any capacity expansion also raises the
  // Alert ceiling — a bigger operation can get more worked up too.
  function ratchet(state) {
    let anyMaxGrew = false;
    for (const axis of AXES) {
      const a = state.axes[axis];
      if (a.current < a.max) {
        a.current += 1;
      } else {
        a.pinnedRatchets += 1;
        if (a.pinnedRatchets >= PINNED_RATCHETS_PER_MAX_GROWTH) {
          a.max += 1;
          a.current += 1;
          a.pinnedRatchets = 0;
          anyMaxGrew = true;
        }
      }
    }
    if (anyMaxGrew) {
      state.alertMax += 1;
      state.everGrew = true;
    }
    return anyMaxGrew;
  }

  // ── A run's noise landing on the site ───────────────────────────
  // opts: { loud, glitch }. Sustained pressure = a NOISY hit landing
  // while Alert was already elevated (see the judgment call in the
  // header). Returns what happened, for callers/logs.
  function recordHit(state, opts) {
    opts = opts || {};
    const noise = (opts.loud ? ALERT_LOUD : 0) + (opts.glitch ? ALERT_GLITCH_EXTRA : 0);
    const wasElevated = state.alert > 0;

    state.alert = Math.min(state.alertMax, state.alert + noise);
    // A hit the site never noticed can't interrupt its cooldown
    // either — only noise resets the quiet-day counter (QA fix: the
    // ghost-run rule applies to cooling, not just to pressure).
    if (noise > 0) state.quietDays = 0;

    let ratcheted = false;
    let maxGrew = false;
    if (noise > 0 && wasElevated) {
      state.sustainedHits += 1;
      if (state.sustainedHits >= RATCHET_THRESHOLD) {
        maxGrew = ratchet(state);
        ratcheted = true;
        state.sustainedHits = 0;
      }
    }
    return { noise: noise, ratcheted: ratcheted, maxGrew: maxGrew };
  }

  // ── The daily tick: Alert bleeds first, then Current cools ──────
  // Pressure only counts within one elevated window: fully cooling
  // resets the sustained-hit count, so the next round of pressure
  // starts fresh from the (possibly higher) new baseline. Current
  // only cools toward Min after sustained full calm — and Max never
  // moves here at all.
  function advanceSiteDay(state) {
    // The night resets what the crew switched off — suppression
    // (mission.js's same-day tenderizing) never survives a day tick.
    state.suppression = null;
    state.alert = Math.max(0, state.alert - ALERT_DECAY_PER_DAY);
    if (state.alert > 0) return;

    state.sustainedHits = 0;
    state.quietDays += 1;
    if (state.quietDays >= QUIET_DAYS_PER_COOL_STEP) {
      for (const axis of AXES) {
        const a = state.axes[axis];
        a.current = Math.max(a.min, a.current - 1);
      }
      state.quietDays = 0;
    }
  }

  MJ.SECURITY_AXES = AXES;
  MJ.initSecurityState = initSecurityState;
  MJ.recordHit = recordHit;
  MJ.advanceSiteDay = advanceSiteDay;
})();
