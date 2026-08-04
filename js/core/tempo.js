/* ============================================================
   Mr. Johnson — core/tempo.js
   The shared frame all three pillars run inside, per
   docs/PILLAR-PLAN.md §2.

   The reference is the Sega Genesis Shadowrun loop: one top-down
   view for both moving around and fighting, flowing in real time,
   with fights that are short. On top of that the player gets a
   control the Genesis game did not have — they can drop into
   TURN-BASED whenever they want a decision made carefully, and
   combat drops them into it whether they asked or not.

     free        the crew acts and the world advances alongside
     turnBased   discrete, ordered, one actor at a time

   TWO RULES THAT NEVER BEND:

   1. Mode changes GRANULARITY, never math. The same dice resolve
      the same way in both. A player who prefers turn-based is not
      playing an easier or harder game, only a slower one.
   2. Combat FORCES turn-based, in every pillar, and holds it until
      the fight ends. Leaving combat restores whatever the player
      had chosen.

   THE WORLD-ADVANCE SEAM — deliberately inert:
   `advanceWorld` is the hook a real-time street eventually hangs
   its patrol routes and camera arcs on. Right now it does nothing
   but COUNT. That is on purpose and it is a hard constraint: a
   real-time clock must not affect a player whose interface still
   reads as turn-based. Until the visual layer lands, this
   accumulates ticks, exposes them for tests, and changes no
   outcome anywhere. Anything that wants to make it bite has to
   land at the same time as the renderer that shows it biting.

   Usage:
     const t = MJ.newTempo();          // starts free, tick 0
     MJ.setMode(t, "turnBased");       // player's choice
     MJ.enterCombat(t);                // forces turnBased, remembers
     MJ.exitCombat(t);                 // restores the player's choice
     MJ.advanceWorld(t, 1);            // clocking ONLY
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const MODES = ["free", "turnBased"];

  function newTempo(opts) {
    opts = opts || {};
    return {
      // What the player is actually playing in right now.
      mode: MODES.indexOf(opts.mode) !== -1 ? opts.mode : "free",
      // What they chose, so combat can hand it back afterwards.
      preferred: MODES.indexOf(opts.mode) !== -1 ? opts.mode : "free",
      inCombat: false,
      // The seam's counters. Read by tests; read by nothing that
      // decides an outcome.
      tick: 0,
      ticksInFree: 0,
      ticksInTurnBased: 0,
      ticksInCombat: 0,
    };
  }

  function isTurnBased(tempo) {
    return !tempo || tempo.mode === "turnBased";
  }

  // A player's choice of granularity. Refused during combat, which
  // owns the mode for as long as it lasts — but remembered, so
  // asking for free mode mid-firefight takes effect the moment the
  // shooting stops rather than being silently dropped.
  function setMode(tempo, mode) {
    if (!tempo || MODES.indexOf(mode) === -1) return false;
    tempo.preferred = mode;
    if (tempo.inCombat) return false;
    tempo.mode = mode;
    return true;
  }

  function toggleMode(tempo) {
    return setMode(tempo, isTurnBased(tempo) ? "free" : "turnBased");
  }

  function enterCombat(tempo) {
    if (!tempo || tempo.inCombat) return tempo;
    tempo.inCombat = true;
    tempo.mode = "turnBased";
    return tempo;
  }

  function exitCombat(tempo) {
    if (!tempo || !tempo.inCombat) return tempo;
    tempo.inCombat = false;
    tempo.mode = tempo.preferred;
    return tempo;
  }

  // ── The seam ────────────────────────────────────────────────────
  // Counts, and only counts. Returns the tick it advanced to so a
  // caller can record when something happened without anything
  // acting on it yet.
  function advanceWorld(tempo, ticks) {
    if (!tempo) return 0;
    const n = Math.max(0, Math.floor(ticks === undefined ? 1 : ticks));
    tempo.tick += n;
    if (tempo.inCombat) tempo.ticksInCombat += n;
    if (tempo.mode === "turnBased") tempo.ticksInTurnBased += n;
    else tempo.ticksInFree += n;
    return tempo.tick;
  }

  // For a readout that wants to say where the player is without
  // reaching into the object.
  function describeTempo(tempo) {
    if (!tempo) return { mode: "turnBased", label: "turn-based", locked: false };
    return {
      mode: tempo.mode,
      label: tempo.mode === "turnBased" ? "turn-based" : "free",
      // Locked means the player cannot change it right now, and why.
      locked: tempo.inCombat,
      lockedBy: tempo.inCombat ? "combat" : null,
      preferred: tempo.preferred,
      tick: tempo.tick,
    };
  }

  MJ.TEMPO_MODES = MODES;
  MJ.newTempo = newTempo;
  MJ.isTurnBased = isTurnBased;
  MJ.setMode = setMode;
  MJ.toggleMode = toggleMode;
  MJ.enterCombat = enterCombat;
  MJ.exitCombat = exitCombat;
  MJ.advanceWorld = advanceWorld;
  MJ.describeTempo = describeTempo;
})();
