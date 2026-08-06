/* ============================================================
   Mr. Johnson — ui-text.js
   The four functions every readout needs, declared once.

   `esc`, `nm`, `num` and `dim` were copy-pasted into three files.
   Nothing had gone wrong yet, but they are the vocabulary the whole
   console speaks: if one copy ever learns to handle a null or picks
   a different class name, two screens start describing the same
   runner in two different voices, and the divergence is invisible
   until somebody notices the colours do not match.

   These are PRESENTATION ONLY. Nothing here knows what a runner or
   a site is — a name is a name because of where it sits in a
   sentence, not because of what kind of object produced it.

   Loaded before every renderer.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // Anything that came from generated content goes through here
  // before it reaches innerHTML — site names, runner handles and
  // item labels are all built from word tables, and a table is a
  // thing somebody edits.
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // A NAME — a runner, a site, a spell, a thing being acted on.
  const nm = (s) => '<span class="w-name">' + esc(s) + "</span>";
  // A NUMBER the player is meant to weigh: a pool, a price, a tier.
  const num = (s) => '<span class="w-num">' + esc(s) + "</span>";
  // Supporting text — units, asides, the reason something is greyed.
  const dim = (s) => '<span class="dimmed">' + esc(s) + "</span>";

  MJ.text = { esc: esc, nm: nm, num: num, dim: dim };
})();
