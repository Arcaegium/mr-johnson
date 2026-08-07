/* ============================================================
   Mr. Johnson — grimoire.js
   THE GRIMOIRE, ANYWHERE IN MEATSPACE.

   A mage's spells are not an obstacle-resolution feature. They are
   something a runner CAN DO, and the most valuable moment to do most
   of them is before anybody is looking — Armor and Invisibility go up
   in the empty corridor, because a guard who watches you armour up
   six feet from his post reads it as exactly what it is (spells.js
   spellThreat: a buff going up is THREATENING, not awkward).

   So this file owns the grimoire and knows nothing about obstacles.
   It answers two questions and renders one menu:

     entriesFor(caster, ctx)   every spell they know, each marked
                               castable-here or greyed with the
                               reason. ctx.obstacle is OPTIONAL —
                               without one, the spells that need
                               something in front of them say so.
     open(opts)                the two-step menu: pick the spell,
                               then pick the FORCE.

   THE SUBMENU SHOWS WHAT WILL NOT WORK, and that is a deliberate
   break from the obstacle menu's rule. The obstacle menu hides dead
   approaches because they are noise between the player and the
   transcript. This is the CHARACTER SHEET: reading what your mage
   cannot do here is how the player learns what the spells are, and
   that knowledge was bought at hire.

   Callers: the obstacle prompt's "cast a spell" row, and the pre-run
   prep step. Anything else that wants a mage to cast — a hub screen,
   an astral scene, a future overworld — calls the same two functions
   and gets the same rules.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // Shared with every other readout — see js/ui-text.js.
  const esc = MJ.text.esc, nm = MJ.text.nm, num = MJ.text.num, dim = MJ.text.dim;

  // Which verb a thrown spell resolves through. The verb table still
  // owns whether it LANDS — this is only the routing.
  const SHAPE_VERB = { directMana: "castDirectMana", directPhys: "castDirectPhysical", indirect: "castIndirect" };
  const HOME_VERB = { remote: "castRemote", bypass: "castBypass", command: "castCommand" };
  // Every verb the obstacle menu funnels into "cast a spell".
  const SPELL_VERB_IDS = ["castDirectMana", "castDirectPhysical", "castIndirect",
    "castRemote", "castBypass", "castCommand", "blast"];

  // ── Every spell they know, against this moment ─────────────────
  // ctx: { run, crew, obstacle?, options? }
  //   obstacle  what is in front of them, if anything
  //   options   the obstacle prompt's option list, when there is one —
  //             so a thrown spell inherits the SAME lands/discovered
  //             verdict the main menu is showing, rather than
  //             re-deriving it and risking a different answer
  function entriesFor(caster, ctx) {
    ctx = ctx || {};
    const run = ctx.run || {};
    const crew = (ctx.crew || run.runners || []).filter((r) => !run.downed || !run.downed.has(r));
    const held = (run.sustaining || []).filter((s) => s.caster === caster).length;
    const pool = Math.max(0, MJ.dicePoolFor(caster, "sorcery",
      MJ.gearBonusFor(caster, "sorcery") - 2 * held));
    const byVerb = {};
    for (const o of ctx.options || []) byVerb[o.verbId] = o;

    // A thrown/targeted spell needs something in front of them AND a
    // verb that lands on it.
    const viaVerb = (e, verbId) => {
      if (!ctx.obstacle) { e.why = "nothing in front of them to cast it at"; return; }
      const opt = byVerb[verbId];
      if (!opt) { e.why = "nothing of it is here to reach"; return; }
      if (opt.discovered) { e.why = opt.discovered; return; }
      if (!opt.lands) { e.why = opt.why || "it would do nothing to this"; return; }
      e.available = true;
      e.verbId = verbId;
      // A spell thrown through a verb reads as THE VERB does, not as
      // its own home would — and `readsAs` is the projected class
      // WITH repeat-escalation already counted, which is the number
      // the player is about to live with. Quoting the home instead
      // would show one threat and apply another.
      e.readsAs = opt.readsAs;
    };

    return MJ.spellsFor(caster).map((id) => {
      const def = MJ.spellDef(id);
      const e = { spellId: id, def: def, caster: caster, available: false, why: null, verbId: null, target: null };

      if (def.combat) viaVerb(e, SHAPE_VERB[def.shape] && byVerb[SHAPE_VERB[def.shape]] ? SHAPE_VERB[def.shape] : "blast");
      else if (HOME_VERB[def.home]) viaVerb(e, HOME_VERB[def.home]);
      else if (def.home === "debuff") e.why = "thrown at somebody — the exchange will offer it";
      else if (def.home === "stabilize") e.why = "casts itself the moment somebody falls";
      else if (def.home === "silence") {
        if (!def.single && run.silenced) e.why = "the ground is already silent";
        else e.available = true;
      } else if (def.home === "conceal") {
        if ((run.spellConcealment || []).some((c) => c.vsTech === !!def.vsTech)) e.why = "already holding it over the crew";
        else e.available = true;
      } else if (def.home === "heal") {
        const hurt = crew.filter((r) => (r.wounds || 0) > 0);
        if (!hurt.length) e.why = "nobody is bleeding";
        else { e.available = true; e.target = hurt.reduce((a, b) => (a.wounds >= b.wounds ? a : b)); }
      } else if (def.home === "analyze") {
        if (!ctx.obstacle) e.why = "nothing in front of them to read";
        else {
          const rightKind = def.analyzes === "sapient" ? !!ctx.obstacle.sapient : !ctx.obstacle.living;
          if (!rightKind) e.why = def.analyzes === "sapient" ? "it has no mind to probe" : "it is not a made thing to read";
          else e.available = true;
        }
      } else if ((run.sustaining || []).some((s) => s.spell === id && s.caster === caster)) {
        // Holding it — so the useful act is LETTING GO. Sustaining
        // costs the caster −2 on everything else, and until this
        // existed there was no way to hand that back short of ending
        // the run.
        e.why = "holding it — cast again to let it go";
        e.available = true;
        e.release = true;
      } else if ((run.sustaining || []).some((s) => s.spell === id)) {
        e.why = "somebody else is already holding it";
      } else {
        // Buffs and barriers go up from wherever they are standing.
        // Armor lands on the worst-dressed runner — the same person
        // the Defense lane measures, so the forecast and the cast
        // agree about who is being protected.
        e.available = true;
        if (id === "armor" && crew.length) {
          e.target = crew.reduce((a, b) => (MJ.armourRatingFor(a) <= MJ.armourRatingFor(b) ? a : b));
        }
      }

      const T = MJ.THREAT || {};
      const cls = e.readsAs || MJ.spellThreat(def);
      const clsName = Object.keys(T).find((k) => T[k] === cls) || "";
      e.pool = pool;
      e.held = held;
      e.threat = cls;
      e.html = e.available ? nm(def.label) : dim(def.label);
      e.meta = e.release
        ? dim("let it go — hands back the −2 it is costing them")
        : e.available
        ? "sorcery " + num(pool + "d") +
          dim(" · drain F" + (def.drain >= 0 ? "+" + def.drain : def.drain)) +
          (e.target && e.target !== caster ? dim(" · on " + e.target.identity.handle) : "") +
          (clsName ? dim(" · reads " + clsName.toLowerCase()) : "") +
          (held ? dim(" · holding " + held) : "")
        : dim(e.why);
      e.dead = !e.available;
      return e;
    }).concat(
      // Spells still being STUDIED — taught, queued, not yet paid for
      // in karma. Never castable, always shown: this menu is the
      // character sheet, and watching the debt come due is part of
      // owning the mage.
      (((caster.classification || {}).spellQueue) || []).map((q) => {
        const def = MJ.spellDef(q.spellId);
        return {
          spellId: q.spellId, def: def, caster: caster,
          available: false, dead: true, verbId: null, target: null,
          why: "still studying",
          html: dim(def ? def.label : q.spellId),
          meta: dim("still studying — " + q.paid + "/" + q.cost + " karma earned toward it"),
        };
      })
    );
  }

  // ── The Force step ─────────────────────────────────────────────
  // §14: the player picks Force. It is the one dial magic has that
  // nothing else does — it scales what the spell DOES and what it
  // costs in the same breath — and until this menu existed every
  // cast silently went out at full Magic, which is why a Magic-6
  // mage could drain-drop through three defaults before a fight.
  //
  // Each rung says what it buys and what it will cost to resist, and
  // the overcast rungs say PHYSICAL out loud, because that is the
  // line the player is choosing to cross.
  function forceRows(caster, def) {
    return MJ.forceLadder(caster).map((rung) => {
      const p = MJ.drainPreview(caster, def, rung.force);
      return {
        force: rung.force,
        html: (rung.overcast ? '<span class="w-warn">Force ' + rung.force + "</span>" : num("Force " + rung.force)) +
          (effectNote(def, rung.force) ? dim(" — " + effectNote(def, rung.force)) : ""),
        meta: dim("drain ") + num(p.value) +
          dim(" vs " + p.resistPool + "d resist · ") +
          (p.physical ? '<span class="w-warn">PHYSICAL — overcasting</span>' : dim("stun")),
        tone: rung.overcast ? "warn-btn" : null,
      };
    });
  }

  // What this Force actually buys, where the spell scales with it.
  // Said plainly so the dial is a decision rather than a number.
  function effectNote(def, force) {
    if (!def) return "";
    if (def.stacksFromForce) return force + " armour";
    if (def.home === "heal") return "closes up to " + Math.max(1, Math.ceil(force / 2));
    if (def.combat) return "DV " + force + (def.shape === "indirect" ? ", AP −" + force : ", past armour");
    return "";
  }

  // ── The menu ───────────────────────────────────────────────────
  // opts: {
  //   caster, ctx, chrome: { title, subtitle, context, transcript },
  //   heading,                       what this moment is
  //   onCast(entry, force),          the caller decides how to resolve
  //   onBack(),                      dismissed
  //   backLabel
  // }
  // Spells that land ON a crew member — the ones where "on whom" is
  // a real decision the player makes, not a detail the code guesses.
  function crewTargeted(def) {
    if (!def) return false;
    return def.home === "buff" || def.home === "heal" || def.home === "disguise" ||
      (def.home === "silence" && def.single);
  }

  // What the pick needs to show about each candidate: the numbers the
  // spell actually interacts with. Armor is judged against armour,
  // Heal against wounds — and the tracks ride along on every row so
  // the player is never asked to remember a sheet they cannot see.
  function targetReadout(r, def) {
    const bits = [];
    bits.push(dim("armour ") + num(MJ.armourRatingFor(r)));
    const w = r.wounds || 0, s = r.stun || 0;
    bits.push(dim("P ") + (w ? '<span class="w-warn">' + w + "</span>" : num(0)) + dim("/" + MJ.physicalTrack(r)) +
      dim(" S ") + (s ? '<span class="w-warn">' + s + "</span>" : num(0)) + dim("/" + MJ.stunTrack(r)));
    if (def && def.home === "heal" && !w) bits.push(dim("nothing to close"));
    return bits.join(dim(" · "));
  }

  function open(opts) {
    const caster = opts.caster;
    const chrome = opts.chrome || {};
    const entries = entriesFor(caster, opts.ctx);
    const ctxRun = (opts.ctx || {}).run || {};
    const crewOf = ((opts.ctx || {}).crew || ctxRun.runners || [])
      .filter((r) => !ctxRun.downed || !ctxRun.downed.has(r));

    function pickSpell() {
      MJ.decide.open({
        title: chrome.title, subtitle: chrome.subtitle || dim("the grimoire"),
        context: chrome.context, party: chrome.party, transcript: chrome.transcript,
        heading: opts.heading || (nm(caster.identity.handle) + dim(" — what they know") +
          '<div class="ask">Cast which?</div>'),
        options: entries.map((e) => ({ html: e.html, meta: e.meta, dead: e.dead })),
        actions: [{ id: "back", label: opts.backLabel || "put the grimoire away", tone: "warn-btn" }],
        onChoose: (opt, i) => {
          const e = entries[i];
          if (!e || !e.available) return;
          // Letting go is not a cast — no Force, no Drain, no roll.
          if (e.release) return opts.onRelease && opts.onRelease(e);
          // ON WHOM is a decision, not a guess. Armor used to land on
          // whoever the code judged worst-dressed and the player was
          // never asked — so a mage who wanted it on someone else
          // simply could not say so. Skipped when there is nobody to
          // choose between.
          if (crewTargeted(e.def) && crewOf.length > 1) return pickTarget(e);
          pickForce(e);
        },
        onAction: () => opts.onBack && opts.onBack(),
      });
    }

    // The target step. Every candidate shows the numbers this spell
    // actually touches, so "who needs the Armor" is answerable from
    // the screen instead of from memory. The code's own pick is
    // offered first and labelled — a default, never a decision made
    // on the player's behalf.
    function pickTarget(entry) {
      const suggested = entry.target || caster;
      const ordered = crewOf.slice().sort((a, b) =>
        (a === suggested ? -1 : 0) - (b === suggested ? -1 : 0));
      const rows = ordered.map((r) => ({
        html: nm(r.identity.handle) +
          (r === caster ? dim(" — themselves") : "") +
          (r === suggested ? dim(" · ") + '<span class="w-ok">suggested</span>' : ""),
        meta: targetReadout(r, entry.def),
      }));
      MJ.decide.open({
        title: chrome.title, subtitle: dim("on whom?"),
        context: chrome.context, party: chrome.party, transcript: chrome.transcript,
        heading: nm(caster.identity.handle) + dim(" casting ") + nm(entry.def.label) +
          '<div class="ask">On whom?</div>',
        options: rows,
        actions: [{ id: "back", label: "pick a different spell", tone: "warn-btn" }],
        onChoose: (opt, i) => {
          const chosen = Object.assign({}, entry, { target: ordered[i] });
          pickForce(chosen);
        },
        onAction: () => pickSpell(),
      });
    }

    function pickForce(entry) {
      const rows = forceRows(caster, entry.def);
      MJ.decide.open({
        title: chrome.title, subtitle: dim("how hard?"),
        context: chrome.context, party: chrome.party, transcript: chrome.transcript,
        heading: nm(caster.identity.handle) + dim(" casting ") + nm(entry.def.label) +
          (entry.target && entry.target !== caster ? dim(" on ") + nm(entry.target.identity.handle) : "") +
          '<div class="ask">How hard are they pushing?</div>',
        options: rows,
        actions: [{ id: "back", label: "pick a different spell", tone: "warn-btn" }],
        onChoose: (opt, i) => opts.onCast && opts.onCast(entry, rows[i].force),
        onAction: () => pickSpell(),
      });
    }

    pickSpell();
  }

  // Everyone on this crew who could open a grimoire at all.
  function castersIn(run, crew) {
    return (crew || run.runners || [])
      .filter((r) => (!run.downed || !run.downed.has(r)) && MJ.spellsFor(r).length > 0);
  }

  MJ.grimoire = {
    entriesFor: entriesFor,
    forceRows: forceRows,
    open: open,
    castersIn: castersIn,
    SPELL_VERB_IDS: SPELL_VERB_IDS,
  };
})();
