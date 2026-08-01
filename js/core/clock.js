/* ============================================================
   Mr. Johnson — core/clock.js
   The day clock (design bible §06): time is spent, not elapsed.
   A day is an action period. Nothing advances except what's
   spent — running a job, scouting, resting, crafting — so there
   is no real-time ticking, only advanceDay, called whenever the
   player actually spends a period. currentDay lives on the save
   file's `meta` block (see core/save.js); this just operates on
   any object with a currentDay field.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  function advanceDay(meta, days) {
    meta.currentDay += (days === undefined ? 1 : days);
    return meta;
  }

  MJ.advanceDay = advanceDay;
})();
