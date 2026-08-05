/* ============================================================
   Mr. Johnson — models/verbs.js
   VERBS × PROPERTIES. The model is UNDERSTANDING.md §11.5.

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

   EVADING SOMETHING IS PILLAR-BOUND. `requiresSense` marks the
   verbs that work by staying outside a watcher's attention —
   sneaking, masking an icon. You
   can only hide from a watcher IN THE MEDIUM IT WATCHES, so each of
   those requires the thing to sense the verb's own pillar. Sneaking
   past a maglock is meaningless (it is looking at nothing), masking
   your icon from a camera that only has eyes in the room is
   meaningless. Getting a thing to ACCEPT you is a different act — `con` and
   `sleaze` talk a sapient or a system into letting you through, and
   neither needs the thing to be watching.

   DAMAGING VERBS route through the three-gate chain combat already
   uses: Hit → Penetrate (Power vs Armour) → Damage, accumulating
   against structure. So a pistol sparks off a hardened door forever
   however many times it is fired, while a rifle or a Force-6
   fireball gets through. Perseverance only pays if you can
   penetrate at all — no special case required.

   Kicking is a MELEE ATTACK with the `unarmed` profile that already
   exists. Demolitions stays a trained skill — the breaching charge
   in the armory is a BOOST on that roll, not a licence to make it.
   Having feet and having explosives are different categories of
   thing, and the skill is what says which one you have.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const T = () => MJ.THREAT;

  // A verb reads its own label off the thing where the phrasing
  // genuinely changes with what is being handled — looping a feed
  // and splicing a lock are one verb (`tamper`) doing one job, and
  // saying so in the same words twice would read as a bug. The
  // BRANCHES ARE PROPERTIES, never obstacle types, so a new kind of
  // thing inherits sensible wording without being authored for.
  const matrixOnly = (t) => (t.presence || []).length === 1 && (t.presence || [])[0] === "matrix";

  // `requires` is checked against the THING. Every key must hold.
  //   living / sapient / summoned / construct / fights / bypassable
  //   presence     — gate 1, handled per pillar
  //   requiresSense— gate 2 for evasion: senses THIS verb's pillar
  const VERBS = {
    // ── Physical pillar ──────────────────────────────────────────
    sneak: {
      pillar: "physical", label: "slip past unseen", skill: "stealth",
      requiresSense: true,
      loud: false, threat: "QUESTIONABLE",
      describe: "there is nothing to sneak past if nothing is looking",
    },
    takedown: {
      pillar: "physical", skill: "stealth",
      label: (t) => (t.sapient ? "silent takedown" : "put it down quietly"),
      // A body, and one nobody called up. You cannot cut the throat
      // of something that was summoned here — undoing that is
      // conjuring's job, not a knife's.
      requires: { living: true, summoned: false },
      loud: false, threat: "THREATENING", disables: true,
      describe: "a body can be put on the floor; a lock cannot",
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
      loud: false, threat: "QUESTIONABLE", extended: true, disables: true,
      describe: "patience against a mechanism",
    },
    tamper: {
      pillar: "physical", skill: "electronics",
      label: (t) => (t.perceives ? "loop the feed" : "splice its wiring"),
      requires: { living: false },
      loud: false, threat: "QUESTIONABLE", extended: true, disables: true,
      describe: "its own wiring, turned against it",
    },
    kick: {
      pillar: "physical", label: "kick it in", skill: "melee", weapon: "unarmed",
      damaging: true, loud: true, threat: "THREATENING",
      describe: "feet and perseverance — everyone has both",
    },
    shoot: {
      pillar: "physical", label: "shoot it",
      // Whatever they are actually carrying, which is why the skill
      // is read off the weapon rather than assumed: a rifle is
      // marksmanship and a shotgun is firearms, and the pool shown
      // has to be the pool rolled.
      //
      // But you cannot shoot with a knife. `carries` gates the verb on
      // the runner's own loadout, not on the thing being shot at — a
      // runner holding a blade was being offered "shoot it" and
      // quoted a MELEE pool for it, which is two different weapons in
      // one sentence.
      skill: null,
      skillFor: (runner) => MJ.weaponProfile(MJ.combatLoadoutFor(runner).weaponId).skill,
      carries: (runner) => {
        const w = MJ.weaponProfile(MJ.combatLoadoutFor(runner).weaponId);
        return (w.modes || []).some((m) => m !== "melee");
      },
      weapon: null,
      damaging: true, loud: true, threat: "THREATENING",
      describe: "whatever they are carrying, pointed at it",
    },
    breach: {
      pillar: "physical", label: "breach it", skill: "demolitions", weapon: "demolitions",
      // A shaped charge is placed against a thing that is standing
      // still. Throwing one at a man is a different act with a
      // different name, and "breach it" is not it.
      requires: { living: false },
      damaging: true, loud: true, threat: "THREATENING",
      describe: "the right tool, and the training to use it",
    },
    // Not an act against the thing at all — which is why it belongs
    // to no pillar and always reaches. What decides it is whether
    // the thing is something there is a way around: a roaming
    // spirit or a sealed area, yes; the one door into the vault, no.
    routeAround: {
      anywhere: true, label: "go around it", skill: null,
      requires: { bypassable: true },
      loud: false, threat: "NORMAL",
      describe: "the long way — costs the time, nothing else",
    },

    // ── Matrix pillar ────────────────────────────────────────────
    hackDevice: {
      pillar: "matrix", skill: "hacking",
      label: (t) => (t.perceives ? "kill it remotely"
        : matrixOnly(t) ? "unpick its code" : "unlock it remotely"),
      // A device answers. Something that bites back is not answering
      // — Black ICE is an active countermeasure, and the way past it
      // is to hide from it, fool it, or fight it.
      requires: { fights: false },
      loud: false, threat: "QUESTIONABLE", extended: true, disables: true,
      describe: "it is a device, and devices answer",
    },
    maskIcon: {
      pillar: "matrix", label: "mask your icon", skill: "hacking",
      requiresSense: true,
      loud: false, threat: "QUESTIONABLE",
      describe: "nothing to hide from if nothing is watching the wire",
    },
    sleaze: {
      pillar: "matrix", label: "pass as legitimate traffic", skill: "computer",
      loud: false, threat: "AWKWARD", escalates: true,
      describe: "credentials it has no reason to doubt",
    },
    attackIce: {
      pillar: "matrix", label: "hammer it down", skill: "hacking",
      damaging: true, loud: true, threat: "THREATENING", weapon: "blackHammer",
      describe: "brute force, in the only currency code understands",
    },

    // ── Astral pillar ────────────────────────────────────────────
    // ── Assensing is NOT here, and that is the point ─────────────
    // It is RECEPTIVE: it takes information in. It does not do
    // anything TO a thing, so it can never be a way past one. An
    // earlier pass had it as "walk past without tripping it", which
    // produced the absurdity of a runner reading a guard's aura for
    // seven intervals in his face and thereby getting around him.
    //
    // Reading auras lives in the astral pillar's own grammar
    // (astral.js), where what it buys is Lattice read depth. Later it
    // will reveal obstacles and reveal facts about them. It will
    // never SOLVE one. See UNDERSTANDING.md §3.4: assensing governs
    // the quality of information, never passage.
    banish: {
      pillar: "astral", label: "banish it", skill: "conjuring",
      requires: { summoned: true },
      // This one genuinely removes it: unravel what binds it here and
      // it goes home. The deep version is the Lattice's `unravel`.
      loud: false, threat: "THREATENING", disables: true, drains: true,
      describe: "unravel what binds it here — only works on something called",
    },
    unwind: {
      pillar: "astral", label: "unwind it", skill: "sorcery",
      // A MADE structure of mana. A living aura is astrally present
      // and is not a construct — there is nothing there to take
      // apart, which is why this does not land on a guard.
      requires: { construct: true },
      // NOT `disables`. You are not breaking a ward, you are opening a
      // window in it and going through before it cranks shut — a
      // mana barrier repairs itself, which is the whole character of
      // the mode (lattice.js `recloseRate`, and `latticeAbandon`: a
      // half-unwound ward re-closes). This is what makes the way home
      // a real problem: the wall you came through is still there.
      loud: false, threat: "AWKWARD", escalates: true, extended: true, drains: true,
      describe: "open a window in it and go through before it closes",
    },
    blast: {
      pillar: "astral", label: "blast it down", skill: "sorcery",
      damaging: true, loud: true, threat: "THREATENING", drains: true,
      describe: "mana, thrown hard",
    },
  };

  function verbDef(id) {
    return VERBS[id] || null;
  }

  // What this verb is called against THIS thing.
  function labelOf(verb, thing) {
    if (!verb) return "";
    return typeof verb.label === "function" ? verb.label(thing || {}) : verb.label;
  }

  // Which skill a given runner would actually roll. Constant for
  // almost everything; read off the weapon for the verbs that use
  // whatever the runner is carrying.
  function skillOf(verb, runner) {
    if (!verb) return null;
    if (verb.skillFor && runner) {
      try { return verb.skillFor(runner); } catch (e) { return verb.skill; }
    }
    return verb.skill;
  }

  const sensesPillar = (thing, pillar) => (thing.senses || []).indexOf(pillar) !== -1;

  // Gate 1: can this verb reach the thing at all?
  function reaches(verb, thing) {
    if (!verb || !thing) return false;
    if (verb.anywhere) return true;
    const presence = thing.presence || [];
    return presence.indexOf(verb.pillar) !== -1;
  }

  // Gate 2: does it LAND? A verb that reaches but does not land is
  // still offered and still attemptable — it just accomplishes
  // nothing, which the player finds out by doing it.
  function lands(verb, thing) {
    if (verb.requiresSense && !sensesPillar(thing, verb.pillar)) return false;
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
    if (verb.requiresSense && !sensesPillar(thing, verb.pillar)) {
      return verb.pillar === "matrix" ? "it is not watching the wire"
        : verb.pillar === "astral" ? "it has no astral regard to step outside of"
        : "it is not watching anything";
    }
    const req = verb.requires || {};
    if (req.sapient && !thing.sapient) return "it has no opinion to change";
    if (req.summoned && !thing.summoned) return "nothing called it here, so nothing sends it back";
    if (req.summoned === false && thing.summoned) return "it was called here; a knife does not send it back";
    if (req.construct && !thing.construct) return "it is not a made thing; there is no structure to take apart";
    if (req.bypassable && !thing.bypassable) return "there is no way around it — this IS the way";
    if (req.living && !thing.living) return "there is no body here to put down";
    if (req.living === false && thing.living) return "it is alive; that is not a mechanism";
    if (req.fights === false && thing.fights) return "it bites back — it is not a device waiting to answer";
    return "it does nothing to this";
  }

  // One verb crossed with one thing.
  function crossOne(id, thing) {
    const v = VERBS[id];
    const canReach = reaches(v, thing);
    const willLand = canReach && lands(v, thing);
    return {
      id: id, def: v,
      label: labelOf(v, thing),
      reaches: canReach,
      lands: willLand,
      // Effective only when both gates pass. Anything else is a
      // real action with no useful result.
      effective: canReach && willLand,
      why: (canReach && willLand) ? null : whyNot(v, thing),
    };
  }

  // Every verb of a pillar, crossed with one thing. The caller
  // decides what to do with the ones that do not land — the ruling
  // is that they stay on the menu.
  function verbsFor(pillar, thing) {
    return Object.keys(VERBS)
      .filter((id) => VERBS[id].pillar === pillar)
      .map((id) => crossOne(id, thing));
  }

  // Everything that REACHES this thing, from every pillar at once —
  // which is the real question a crew standing in front of it has.
  // A maglock is a physical object and a device on the host, so the
  // decker and the lockpick are looking at the same door.
  function actsFor(thing) {
    return Object.keys(VERBS)
      .map((id) => crossOne(id, thing))
      .filter((a) => a.reaches);
  }

  // Which world an act happens in — the verb's own pillar, because
  // the pillar IS the medium the runner's attention is in. Reading
  // it off the SKILL instead quietly filed spoofed credentials
  // (`computer`) as a physical act, so a guard in the corridor got a
  // vote on something that happened inside a host.
  function planeOf(verb, fallback) {
    if (!verb) return fallback || "physical";
    return verb.pillar || fallback || "physical";
  }

  // The threat class this verb carries, resolved from the string on
  // the definition so verbs.js does not need THREAT at load time.
  function threatOf(verb) {
    const t = T();
    return (verb && verb.threat && t[verb.threat]) || t.NORMAL;
  }

  MJ.VERBS = VERBS;
  MJ.verbDef = verbDef;
  MJ.verbLabel = labelOf;
  MJ.verbSkill = skillOf;
  MJ.verbReaches = reaches;
  MJ.verbLands = lands;
  MJ.verbWhyNot = whyNot;
  MJ.verbsFor = verbsFor;
  MJ.actsFor = actsFor;
  MJ.verbPlane = planeOf;
  MJ.verbThreat = threatOf;
})();
