/* ============================================================
   Mr. Johnson — models/verbs.js
   VERBS × PROPERTIES, per docs/PILLAR-PLAN.md §3.6.

   THE RULE:
     Every verb is attemptable against every thing WITHIN ITS
     PILLAR. The qualities of the thing decide whether there is even
     a challenge to roll, let alone what the result is.

   This replaces hand-authored affordance lists. The old shape made
   the MENU the authority on what was possible — a maglock could
   only be breached with demolitions because nobody had written a
   "kick it" line, not because kicking a door is impossible. The
   world decides now.

   TWO GATES, in order:

     1. PRESENCE — can this verb reach the thing at all?
        A verb belongs to a pillar; the thing must be PRESENT on
        that pillar's plane. This is what stops you sleazing a
        spirit (no matrix presence) or banishing a guard (no astral
        summoning to undo). Note this is NOT `senses` — a maglock
        perceives nothing and is still very much a physical object
        and a device on the host.

     2. NATURE — does the verb LAND?
        Present but wrong kind of thing: you can talk at a camera
        all day. `requires` names what the thing must BE for the
        verb to mean anything.

   A verb that passes gate 1 but fails gate 2 is still OFFERED and
   still ATTEMPTABLE — it simply does nothing, and once tried it is
   annotated as ineffective. Nothing is ever removed from the menu.
   That is the ruling, and it is the same principle attempt caps
   died for.

   DAMAGING VERBS route through the three-gate chain combat already
   uses: Hit → Penetrate (Power vs Armour) → Damage, accumulating
   against structure. So a pistol sparks off a hardened door forever
   however many times it is fired, while a rifle or a Force-6
   fireball gets through. Perseverance only pays if you can
   penetrate at all — no special case required.

   Kicking is a MELEE ATTACK with the `unarmed` profile that already
   exists. Demolitions stays a trained skill needing equipment,
   because having feet and having explosives are different
   categories of thing.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const T = () => MJ.THREAT;

  // `requires` is checked against the THING. Every key must hold.
  //   living / sapient / summoned   nature flags
  //   presence                      handled separately, per pillar
  const VERBS = {
    // ── Physical pillar ──────────────────────────────────────────
    kick: {
      pillar: "physical", label: "kick it in", skill: "melee", weapon: "unarmed",
      damaging: true, loud: true, threat: "THREATENING",
      describe: "feet and perseverance — everyone has both",
    },
    shoot: {
      pillar: "physical", label: "shoot it", skill: "firearms", weapon: null,
      damaging: true, loud: true, threat: "THREATENING",
      describe: "whatever they are carrying, pointed at it",
    },
    breach: {
      pillar: "physical", label: "breach it", skill: "demolitions", weapon: "demolitions",
      damaging: true, loud: true, threat: "THREATENING", needsGear: "demolitions",
      describe: "the right tool, and the training to use it",
    },
    sneak: {
      pillar: "physical", label: "slip past unseen", skill: "stealth",
      requires: { perceives: true },
      loud: false, threat: "QUESTIONABLE",
      describe: "there is nothing to sneak past if nothing is looking",
    },
    con: {
      pillar: "physical", label: "talk your way past", skill: "con",
      requires: { sapient: true },
      loud: false, threat: "AWKWARD", escalates: true,
      describe: "a camera has no opinion to change",
    },
    intimidate: {
      pillar: "physical", label: "lean on it", skill: "intimidation",
      requires: { sapient: true },
      loud: false, threat: "AWKWARD", escalates: true,
      describe: "you cannot frighten a door",
    },
    pick: {
      pillar: "physical", label: "work the lock", skill: "larceny",
      requires: { living: false },
      loud: false, threat: "QUESTIONABLE", extended: true,
      describe: "patience against a mechanism",
    },
    tamper: {
      pillar: "physical", label: "tamper with it", skill: "electronics",
      requires: { living: false },
      loud: false, threat: "QUESTIONABLE", extended: true,
      describe: "its own wiring, turned against it",
    },
    routeAround: {
      pillar: "physical", label: "route around", skill: null,
      loud: false, threat: "NORMAL",
      describe: "the long way — costs the time, nothing else",
    },

    // ── Matrix pillar ────────────────────────────────────────────
    hackDevice: {
      pillar: "matrix", label: "unlock it remotely", skill: "hacking",
      loud: false, threat: "QUESTIONABLE", extended: true,
      describe: "it is a device, and devices answer",
    },
    sleaze: {
      pillar: "matrix", label: "pass as legitimate traffic", skill: "computer",
      requires: { perceives: true },
      loud: false, threat: "AWKWARD", escalates: true,
      describe: "nothing to fool if nothing is watching the wire",
    },
    attackIce: {
      pillar: "matrix", label: "hammer it down", skill: "hacking",
      damaging: true, loud: true, threat: "THREATENING", weapon: "blackHammer",
      describe: "brute force, in the only currency code understands",
    },

    // ── Astral pillar ────────────────────────────────────────────
    assense: {
      pillar: "astral", label: "assense it", skill: "assensing",
      loud: false, threat: "NORMAL",
      describe: "read the aura — what it is, and where it is weak",
    },
    banish: {
      pillar: "astral", label: "banish it", skill: "conjuring",
      requires: { summoned: true },
      loud: false, threat: "THREATENING",
      describe: "unravel what binds it here — only works on something called",
    },
    unwind: {
      pillar: "astral", label: "unwind it", skill: "sorcery",
      // A MADE structure of mana. A living aura is astrally present
      // and is not a construct — there is nothing there to take
      // apart, which is why this does not land on a guard.
      requires: { construct: true },
      loud: false, threat: "AWKWARD", escalates: true,
      describe: "a structure of mana, taken apart",
    },
    blast: {
      pillar: "astral", label: "blast it down", skill: "sorcery",
      damaging: true, loud: true, threat: "THREATENING",
      describe: "mana, thrown hard",
    },
  };

  function verbDef(id) {
    return VERBS[id] || null;
  }

  // Gate 1: can this verb reach the thing at all?
  function reaches(verb, thing) {
    if (!verb || !thing) return false;
    const presence = thing.presence || [];
    return presence.indexOf(verb.pillar) !== -1;
  }

  // Gate 2: does it LAND? A verb that reaches but does not land is
  // still offered and still attemptable — it just accomplishes
  // nothing, which the player finds out by doing it.
  function lands(verb, thing) {
    const req = verb.requires;
    if (!req) return true;
    for (const key of Object.keys(req)) {
      if (!!thing[key] !== !!req[key]) return false;
    }
    return true;
  }

  // Why it does not land, in words a readout can print. This is what
  // gets annotated onto the option after the crew tries it once.
  function whyNot(verb, thing) {
    if (!reaches(verb, thing)) {
      return "nothing of it is " + (verb.pillar === "physical" ? "here to touch"
        : verb.pillar === "matrix" ? "on the grid"
        : "on the astral");
    }
    const req = verb.requires || {};
    if (req.sapient && !thing.sapient) return "it has no opinion to change";
    if (req.summoned && !thing.summoned) return "nothing called it here, so nothing sends it back";
    if (req.construct && !thing.construct) return "it is not a made thing; there is no structure to take apart";
    if (req.perceives && !thing.perceives) return "it is not watching anything";
    if (req.living === false && thing.living) return "it is alive; that is not a mechanism";
    return "it does nothing to this";
  }

  // Every verb of a pillar, crossed with one thing. The caller
  // decides what to do with the ones that do not land — the ruling
  // is that they stay on the menu.
  function verbsFor(pillar, thing) {
    const out = [];
    for (const id of Object.keys(VERBS)) {
      const v = VERBS[id];
      if (v.pillar !== pillar) continue;
      const canReach = reaches(v, thing);
      const willLand = canReach && lands(v, thing);
      out.push({
        id: id, def: v,
        reaches: canReach,
        lands: willLand,
        // Effective only when both gates pass. Anything else is a
        // real action with no useful result.
        effective: canReach && willLand,
        why: (canReach && willLand) ? null : whyNot(v, thing),
      });
    }
    return out;
  }

  // The threat class this verb carries, resolved from the string on
  // the definition so verbs.js does not need THREAT at load time.
  function threatOf(verb) {
    const t = T();
    return (verb && verb.threat && t[verb.threat]) || t.NORMAL;
  }

  MJ.VERBS = VERBS;
  MJ.verbDef = verbDef;
  MJ.verbReaches = reaches;
  MJ.verbLands = lands;
  MJ.verbWhyNot = whyNot;
  MJ.verbsFor = verbsFor;
  MJ.verbThreat = threatOf;
})();
