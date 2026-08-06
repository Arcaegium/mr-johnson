/* ============================================================
   Mr. Johnson — models/spells.js
   THE GRIMOIRE: SR5 core rulebook spells, as printed.

   THESE ARE SHADOWRUN'S SPELLS, NOT INVENTED ONES. Names, categories,
   types, ranges, damage codes and Drain modifiers come from the SR5
   core rulebook (verified against the Chummer5a data set — 93 core
   spells). An earlier pass invented original names for canon shapes,
   which violated the project's own rule: the rules content IS the
   homage. Gear brands are original; the magic is Shadowrun's.

   57 of the 93 are implemented — every spell whose mechanical shape
   has a home in the engine. The other 36 are deferred BY NAME at the
   bottom of this file, each with the reason (no poison model, range
   geometry, no distraction hook), so adding one later is a row, not
   a system.

   THE CANON AXES, and where each lands:

     Direct vs Indirect   direct touches mind or body and ARMOUR DOES
                          NOT APPLY; indirect throws something real
                          and armour resists it normally, AP −Force.
                          The whole reason a mage answers a hardsuit
                          differently from a gun.
     Mana vs Physical     type M touches only the living (and the
                          magical); type P also touches objects. This
                          is verbs × properties' `living` gate wearing
                          canon's own clothes — Manabolt cannot open a
                          maglock and Powerbolt can.
     Touch / LOS / Area   touch is cheap Drain priced against having
                          to get adjacent; area hits everything
                          sharing the ground.
     Force                chosen per cast, up to 2× Magic (canon).
                          Above Magic is overcasting and the Drain
                          turns PHYSICAL.
     Drain                max(2, Force + the spell's printed modifier).
                          Punch is F−6, Stunball is F, Mob Mind is
                          F+1. This pricing is the spell economy.
     Sustaining           holding a spell open costs −2 dice on
                          everything else the caster does until they
                          let go.

   SPELLS LIVE ON THE DOSSIER (§8): a mage knows the spells in
   `spellsKnown` and nothing else. spellsFor() is grimoire ∩ trained,
   never the whole book — two mages at the same price knowing
   different spells are different hires, which is the entire point.

   Usage:
     MJ.spellsFor(runner)                          // their grimoire, castable
     MJ.knowsSpell(runner, "manabolt")
     MJ.bestSpellOfShape(runner, "directMana")
     MJ.castSpell(rng, caster, "heal", { force: 4 })     // quick cast
     MJ.applySpellToRun(run, caster, cast)
     MJ.spellCombatAction(combat, caster, "stunbolt", target, opts)
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const CATEGORIES = ["combat", "detection", "health", "illusion", "manipulation"];

  // ── The spell table ────────────────────────────────────────────
  // type: "M" mana / "P" physical (canon). range: "T" touch, "LOS",
  // "A" area. drain: the printed modifier on Force, min 2 applied at
  // cast. home: which piece of machinery resolves it.
  //
  // `shape` groups the attack spells for the verb bridge:
  //   directMana   living targets only, skips armour
  //   directPhys   anything physical, skips armour — opens doors
  //   indirect     anything, through the Penetrate gate, AP −Force
  const SPELLS = {
    // ── COMBAT (18 of 18 — the complete canon set) ───────────────
    acidStream:    { label: "Acid Stream",    category: "combat", type: "P", range: "LOS", damage: "P", drain: -3, combat: true, shape: "indirect", elemental: "acid" },
    toxicWave:     { label: "Toxic Wave",     category: "combat", type: "P", range: "A",   damage: "P", drain: -1, combat: true, shape: "indirect", elemental: "acid", area: true },
    punch:         { label: "Punch",          category: "combat", type: "P", range: "T",   damage: "S", drain: -6, combat: true, shape: "indirect", touch: true, stun: true },
    clout:         { label: "Clout",          category: "combat", type: "P", range: "LOS", damage: "S", drain: -3, combat: true, shape: "indirect", stun: true },
    blastSpell:    { label: "Blast",          category: "combat", type: "P", range: "A",   damage: "S", drain: 0,  combat: true, shape: "indirect", stun: true, area: true },
    deathTouch:    { label: "Death Touch",    category: "combat", type: "M", range: "T",   damage: "P", drain: -6, combat: true, shape: "directMana", touch: true },
    manabolt:      { label: "Manabolt",       category: "combat", type: "M", range: "LOS", damage: "P", drain: -3, combat: true, shape: "directMana" },
    manaball:      { label: "Manaball",       category: "combat", type: "M", range: "A",   damage: "P", drain: 0,  combat: true, shape: "directMana", area: true },
    flamethrower:  { label: "Flamethrower",   category: "combat", type: "P", range: "LOS", damage: "P", drain: -3, combat: true, shape: "indirect", elemental: "fire" },
    fireball:      { label: "Fireball",       category: "combat", type: "P", range: "A",   damage: "P", drain: -1, combat: true, shape: "indirect", elemental: "fire", area: true },
    lightningBolt: { label: "Lightning Bolt", category: "combat", type: "P", range: "LOS", damage: "P", drain: -3, combat: true, shape: "indirect", elemental: "electricity" },
    ballLightning: { label: "Ball Lightning", category: "combat", type: "P", range: "A",   damage: "P", drain: -1, combat: true, shape: "indirect", elemental: "electricity", area: true },
    shatter:       { label: "Shatter",        category: "combat", type: "P", range: "T",   damage: "P", drain: -6, combat: true, shape: "directPhys", touch: true },
    powerbolt:     { label: "Powerbolt",      category: "combat", type: "P", range: "LOS", damage: "P", drain: -3, combat: true, shape: "directPhys" },
    powerball:     { label: "Powerball",      category: "combat", type: "P", range: "A",   damage: "P", drain: 0,  combat: true, shape: "directPhys", area: true },
    knockout:      { label: "Knockout",       category: "combat", type: "M", range: "T",   damage: "S", drain: -6, combat: true, shape: "directMana", touch: true, stun: true },
    stunbolt:      { label: "Stunbolt",       category: "combat", type: "M", range: "LOS", damage: "S", drain: -3, combat: true, shape: "directMana", stun: true },
    stunball:      { label: "Stunball",       category: "combat", type: "M", range: "A",   damage: "S", drain: 0,  combat: true, shape: "directMana", stun: true, area: true },

    // ── DETECTION (9 of 18 — base forms; Extended variants are
    //    range geometry, deferred) ─────────────────────────────────
    analyzeDevice: { label: "Analyze Device", category: "detection", type: "P", range: "T", drain: -3, home: "analyze", analyzes: "device" },
    analyzeTruth:  { label: "Analyze Truth",  category: "detection", type: "M", range: "T", drain: -2, home: "analyze", analyzes: "sapient" },
    clairaudience: { label: "Clairaudience",  category: "detection", type: "M", range: "T", drain: -3, home: "reveal", reveals: "ground" },
    clairvoyance:  { label: "Clairvoyance",   category: "detection", type: "M", range: "T", drain: -3, home: "reveal", reveals: "ground" },
    combatSense:   { label: "Combat Sense",   category: "detection", type: "M", range: "T", drain: 0,  home: "buff", effect: "combatSense", sustained: true },
    detectEnemies: { label: "Detect Enemies", category: "detection", type: "M", range: "T", drain: -2, home: "reveal", reveals: "life" },
    detectLife:    { label: "Detect Life",    category: "detection", type: "M", range: "T", drain: -3, home: "reveal", reveals: "life" },
    detectMagic:   { label: "Detect Magic",   category: "detection", type: "M", range: "T", drain: -2, home: "reveal", reveals: "magic" },
    mindProbe:     { label: "Mind Probe",     category: "detection", type: "M", range: "T", drain: 0,  home: "analyze", analyzes: "sapient" },

    // ── HEALTH (6 of 11 — the rest need poison/disease models) ───
    heal:             { label: "Heal",               category: "health", type: "M", range: "T", drain: -4, home: "heal", touch: true },
    increaseReflexes: { label: "Increase Reflexes",  category: "health", type: "P", range: "T", drain: 0,  home: "buff", effect: "wired", sustained: true },
    increaseAttribute:{ label: "Increase [Attribute]", category: "health", type: "P", range: "T", drain: -3, home: "buff", effect: "bolstered", sustained: true },
    decreaseAttribute:{ label: "Decrease [Attribute]", category: "health", type: "P", range: "T", drain: -2, home: "debuff", effect: "sapped", sustained: true, onTarget: true },
    resistPain:       { label: "Resist Pain",        category: "health", type: "M", range: "T", drain: -4, home: "buff", effect: "painEdited", sustained: true },
    stabilize:        { label: "Stabilize",          category: "health", type: "M", range: "T", drain: -4, home: "stabilize", touch: true },

    // ── ILLUSION (13 of 19) ──────────────────────────────────────
    // Invisibility is the M/P split doing real work: the mana version
    // fools living eyes ONLY — a camera does not have a mind to fool.
    // Improved Invisibility bends light, so sensors miss it too.
    agony:          { label: "Agony",                 category: "illusion", type: "M", range: "LOS", drain: -4, home: "debuff", effect: "agonized", sustained: true, onTarget: true },
    massAgony:      { label: "Mass Agony",            category: "illusion", type: "M", range: "A",   drain: -2, home: "debuff", effect: "agonized", sustained: true, onTarget: true, area: true },
    chaos:          { label: "Chaos",                 category: "illusion", type: "P", range: "LOS", drain: -2, home: "debuff", effect: "rattled", effectStacks: 2, sustained: true, onTarget: true },
    chaoticWorld:   { label: "Chaotic World",         category: "illusion", type: "P", range: "A",   drain: 0,  home: "debuff", effect: "rattled", effectStacks: 2, sustained: true, onTarget: true, area: true },
    confusion:      { label: "Confusion",             category: "illusion", type: "M", range: "LOS", drain: -3, home: "debuff", effect: "rattled", effectStacks: 2, sustained: true, onTarget: true },
    massConfusion:  { label: "Mass Confusion",        category: "illusion", type: "M", range: "A",   drain: -1, home: "debuff", effect: "rattled", effectStacks: 2, sustained: true, onTarget: true, area: true },
    improvedInvisibility: { label: "Improved Invisibility", category: "illusion", type: "P", range: "LOS", drain: -1, home: "conceal", concealment: 6, vsTech: true, sustained: true },
    invisibility:   { label: "Invisibility",          category: "illusion", type: "M", range: "LOS", drain: -2, home: "conceal", concealment: 6, vsTech: false, sustained: true },
    mask:           { label: "Mask",                  category: "illusion", type: "M", range: "T",   drain: -2, home: "disguise", boostSkill: "con", boost: 2, sustained: true },
    physicalMask:   { label: "Physical Mask",         category: "illusion", type: "P", range: "T",   drain: -1, home: "disguise", boostSkill: "con", boost: 2, sustained: true },
    hush:           { label: "Hush",                  category: "illusion", type: "M", range: "A",   drain: -2, home: "silence", sustained: true },
    silence:        { label: "Silence",               category: "illusion", type: "P", range: "A",   drain: -1, home: "silence", sustained: true },
    stealth:        { label: "Stealth",               category: "illusion", type: "P", range: "LOS", drain: -2, home: "silence", single: true, sustained: true },

    // ── MANIPULATION (11 of 18) ──────────────────────────────────
    // stacksFromForce: the effect stacks to the Force it was cast at
    // (capped by the registry's maxStacks) — canon Armor grants Force
    // armour, and a flat +1 was a rounding error wearing the name.
    armor:          { label: "Armor",           category: "manipulation", type: "P", range: "LOS", drain: -2, home: "buff", effect: "spellArmor", stacksFromForce: true, sustained: true },
    controlActions: { label: "Control Actions", category: "manipulation", type: "M", range: "LOS", drain: -1, home: "command", dominates: true, sustained: true },
    controlThoughts:{ label: "Control Thoughts",category: "manipulation", type: "M", range: "LOS", drain: -1, home: "command", dominates: true, sustained: true },
    fling:          { label: "Fling",           category: "manipulation", type: "P", range: "LOS", damage: "P", drain: -2, combat: true, shape: "indirect" },
    influence:      { label: "Influence",       category: "manipulation", type: "M", range: "LOS", drain: -1, home: "command" },
    levitate:       { label: "Levitate",        category: "manipulation", type: "P", range: "LOS", drain: -2, home: "bypass", sustained: true },
    magicFingers:   { label: "Magic Fingers",   category: "manipulation", type: "P", range: "LOS", drain: -2, home: "remote", sustained: true },
    manaBarrier:    { label: "Mana Barrier",    category: "manipulation", type: "M", range: "A",   drain: -2, home: "barrier", effect: "barricaded", sustained: true },
    mobControl:     { label: "Mob Control",     category: "manipulation", type: "M", range: "A",   drain: 1,  home: "command", dominates: true, area: true, sustained: true },
    mobMind:        { label: "Mob Mind",        category: "manipulation", type: "M", range: "A",   drain: 1,  home: "command", dominates: true, area: true, sustained: true },
    physicalBarrier:{ label: "Physical Barrier",category: "manipulation", type: "P", range: "A",   drain: -1, home: "barrier", effect: "barricaded", sustained: true },
  };

  // ── Deferred, BY NAME, with reasons — adding one is a row ──────
  // Detection: Detect Enemies Extended / Detect Life Extended /
  //   Detect Magic Extended / Detect [Life Form] (+Ext) — extended-
  //   area range geometry, which scene-text defers. Detect
  //   Individual, Detect [Object] — need a specific-target registry.
  //   Mindlink — no crew-channel model yet.
  // Health: Antidote, Cure Disease, Detox, Prophylaxis — no
  //   poison/disease model. Oxygenate — no drowning/air model.
  // Illusion: Phantasm, Trid Phantasm, Entertainment, Trid
  //   Entertainment — need a distraction hook (watchers investigate
  //   a decoy). Bugs, Swarm — same shape as Agony; add free when the
  //   distraction pass lands.
  // Manipulation: Animate, Mass Animate — no object-actor model.
  //   Ice Sheet, Light, Shadow — environmental geometry (visual
  //   layer). Ignite — delayed-damage clock. Poltergeist —
  //   distraction hook, as above.

  // ── Registered spell effects ───────────────────────────────────
  // Rows on the combat effects registry, same shape as everything
  // already there. Registered lazily because combat.js loads first.
  function registerSpellEffects() {
    const E = MJ.COMBAT_EFFECTS;
    if (!E || E.sustaining) return;
    // Holding a spell open takes part of your attention with it —
    // canon −2, on the two channels attention lives on.
    E.sustaining  = { label: "sustaining",     kind: "condition", channels: { accuracy: -2 }, maxStacks: 3 };
    E.bolstered   = { label: "bolstered",      kind: "boon",      channels: { accuracy: 1, soak: 1 } };
    E.sapped      = { label: "sapped",         kind: "condition", channels: { accuracy: -1, defence: -1 }, maxStacks: 3 };
    E.agonized    = { label: "in agony",       kind: "condition", channels: { accuracy: -2, defence: -1 } };
    E.spellArmor  = { label: "mana armour",    kind: "boon",      channels: { armour: 1, soak: 1 }, maxStacks: 6 };
    E.painEdited  = { label: "pain deadened",  kind: "boon",      channels: {} }; // read by the wound-penalty paths
    E.dominated   = { label: "dominated",      kind: "condition", channels: { defence: -2 }, forfeitsAction: true, rounds: 2 };
    E.barricaded  = { label: "behind a barrier", kind: "boon",    channels: { defence: 2, soak: 1 } };
  }

  function spellDef(id) {
    return SPELLS[id] || null;
  }

  // ── What CASTING THIS looks like to a watcher ──────────────────
  // Magic in the open is not one flat "odd moment". What the act
  // READS AS depends on what it visibly is, and the ladder is the
  // same one every other act uses:
  //
  //   THREATENING  you are visibly arming yourself or the air is
  //                hardening into a wall. Armour going up in front of
  //                a guard is not awkward — it is a man watching
  //                someone prepare for violence, and he responds to
  //                it like one.
  //   QUESTIONABLE something obviously happened: a person blurred out
  //                of sight, sound died in a room, hands glowed over
  //                a wounded runner.
  //   AWKWARD      a mage staring a beat too long at a door.
  //
  // THIS IS WHY YOU CAST BEFORE YOU WALK UP. The threat only lands if
  // something SEES it (mission.js wasWitnessed), so Armor in an empty
  // corridor costs nothing and the same spell six feet from a guard
  // costs the whole room. That is the decision the grimoire exists to
  // offer, and it is why the grimoire cannot live only at the moment
  // you are already standing in front of the thing.
  const HOME_THREAT = {
    buff:      "THREATENING",
    barrier:   "THREATENING",
    conceal:   "QUESTIONABLE",
    silence:   "QUESTIONABLE",
    heal:      "QUESTIONABLE",
    stabilize: "QUESTIONABLE",
    disguise:  "QUESTIONABLE",
    debuff:    "THREATENING",
    analyze:   "AWKWARD",
    reveal:    "AWKWARD",
  };

  function spellThreat(def) {
    const T = MJ.THREAT || {};
    if (!def) return T.NORMAL;
    if (def.combat) return T.THREATENING;
    return T[def.threat || HOME_THREAT[def.home] || "QUESTIONABLE"] || T.QUESTIONABLE;
  }

  // ── The Force dial ─────────────────────────────────────────────
  // §14 says the player picks Force, and until now every cast went
  // out at full Magic because nothing asked. Force is the one dial
  // magic has that nothing else does: it scales what the spell DOES
  // and what it costs, in the same breath.
  //
  // Not 1..2×Magic as a wall of rows — a ladder of the decisions
  // actually worth making, with the overcast line (Magic+1, where
  // Drain turns PHYSICAL) always on it because that is the line the
  // player is choosing to cross or not.
  function forceLadder(caster) {
    const magic = (caster && caster.attributes && caster.attributes.magic) || 0;
    if (magic <= 0) return [];
    const max = MJ.maxForceFor(caster);
    const rungs = [1, Math.ceil(magic / 2), magic, magic + 1, Math.ceil(magic * 1.5), max];
    const seen = {};
    return rungs
      .map((f) => Math.max(1, Math.min(max, Math.round(f))))
      .filter((f) => (seen[f] ? false : (seen[f] = true)))
      .sort((a, b) => a - b)
      .map((f) => ({ force: f, overcast: f > magic }));
  }

  // What a given Force costs THIS spell, before any dice: the canon
  // Drain value, and which track it will land on.
  function drainPreview(caster, def, force) {
    const magic = (caster && caster.attributes && caster.attributes.magic) || 0;
    return {
      force: force,
      value: Math.max(2, force + ((def && def.drain) || 0)),
      overcast: force > magic,
      physical: force > magic,
      resistPool: ((caster && caster.attributes && caster.attributes.willpower) || 0) + magic,
    };
  }

  // ── The dossier is the authority ───────────────────────────────
  // What a runner can cast: the spells THEY KNOW, gated by Magic and
  // training. Never the whole book — §8: spells live on the dossier,
  // they are what you hired.
  function grimoireOf(runner) {
    return (runner && runner.classification && runner.classification.spellsKnown) || [];
  }

  function knowsSpell(runner, spellId) {
    return grimoireOf(runner).indexOf(spellId) !== -1;
  }

  function spellsFor(runner) {
    if (!runner) return [];
    const magic = (runner.attributes && runner.attributes.magic) || 0;
    if (magic <= 0) return [];
    const skills = MJ.getEffectiveSkills(runner);
    if ((skills.sorcery || 0) <= 0) return [];
    return grimoireOf(runner).filter((id) => SPELLS[id]);
  }

  // The best attack spell of a given shape this runner knows —
  // "best" is LOS over touch, then heavier damage. Deterministic, so
  // the label on the menu is the spell that resolves.
  function bestSpellOfShape(runner, shape) {
    let best = null;
    for (const id of spellsFor(runner)) {
      const def = SPELLS[id];
      if (!def.combat || def.shape !== shape) continue;
      const grade = (def.touch ? 0 : 2) + (def.damage === "P" ? 1 : 0);
      if (!best || grade > best.grade) best = { id: id, def: def, grade: grade };
    }
    return best;
  }

  function knowsSpellOfShape(runner, shape) {
    return !!bestSpellOfShape(runner, shape);
  }

  // The best combat spell they know, in the order the gates favour:
  // direct mana (skips armour, touches the living and the magical),
  // direct physical (skips armour, touches anything), then indirect.
  // This is what the astral pillar's `blast` fronts — throwing mana
  // at a ward stopped being an anonymous act the day the grimoire
  // became the authority on what a mage can throw.
  function bestCombatSpell(runner) {
    return bestSpellOfShape(runner, "directMana") ||
      bestSpellOfShape(runner, "directPhys") ||
      bestSpellOfShape(runner, "indirect") || null;
  }

  // The best mind-bending spell they know — what the `command` verb
  // fronts. Influence plants one suggestion; the Control line
  // puppets outright, so it ranks higher.
  const COMMAND_SPELLS = ["controlThoughts", "controlActions", "mobMind", "mobControl", "influence"];
  function bestCommandSpell(runner) {
    for (const id of COMMAND_SPELLS) {
      if (knowsSpell(runner, id)) {
        const def = SPELLS[id];
        if (def) return { id: id, def: def };
      }
    }
    return null;
  }

  // ── Drain, per canon ───────────────────────────────────────────
  // Force plus the spell's printed modifier, never below 2. Resisted
  // with Willpower + Magic; what gets through lands on the STUN
  // track, or PHYSICAL when overcasting. resistDrain owns the roll;
  // this owns the canon value.
  function spellDrain(rng, caster, def, force) {
    const drain = MJ.resistDrain(rng, caster, force, {
      drainValue: Math.max(2, force + (def.drain || 0)),
    });
    return drain;
  }

  // ── Casting: the meatspace quick cast ──────────────────────────
  // From a body standing in the world, a cast is ONE action: roll
  // Sorcery + Magic, pay the Drain, done. This is the same
  // abstraction as the decker hacking the maglock from the corridor
  // — the deep, thread-by-thread version of the SAME act is the
  // lattice, reached by astral projection (opts.viaLattice), exactly
  // as the fidelity ladder demands: one set of rules, two renderings.
  function castSpell(rng, caster, spellId, opts) {
    opts = opts || {};
    const def = spellDef(spellId);
    if (!def) return { ok: false, error: "no such spell" };
    if (!knowsSpell(caster, spellId)) return { ok: false, error: "not in their grimoire" };
    const skills = MJ.getEffectiveSkills(caster);
    if ((skills.sorcery || 0) <= 0) return { ok: false, error: "untrained in sorcery" };
    const magic = (caster.attributes && caster.attributes.magic) || 0;
    if (magic <= 0) return { ok: false, error: "no Magic — nothing to reach with" };

    const maxForce = MJ.maxForceFor(caster);
    const force = Math.max(1, Math.min(maxForce, opts.force || magic));

    if (opts.viaLattice) {
      // The astral's own grammar: assemble the circuit thread by
      // thread. The caller drives the lattice and calls finishCast.
      const lattice = MJ.beginLattice(rng.fork ? rng.fork("cast") : rng, "assemble",
        { force: force }, caster, { rating: opts.rating || force, shape: opts.shape });
      return {
        ok: true, spell: spellId, def: def, force: force,
        overcast: force > magic, lattice: lattice, caster: caster, done: false,
      };
    }

    // Quick cast: Sorcery + Magic, minus the weight of anything
    // already being sustained.
    const pool = Math.max(0, MJ.dicePoolFor(caster, "sorcery",
      (opts.bonusDice || 0) - 2 * (opts.sustainedCount || 0)));
    const dice = MJ.rollDicePool(rng, pool);
    const hits = MJ.countHits(dice);
    const drain = spellDrain(rng, caster, def, force);
    // THIS FUNCTION DOES NOT BILL THE DRAIN. It rolls it and hands
    // it back; the caller applies it through the one drain law
    // (mission.js applyDrain), which owns the tracks and the drop.
    // Writing wounds here as well would charge an overcasting mage
    // twice for the same push — and it did, until the tracks became
    // one system.
    return {
      ok: true, spell: spellId, def: def, force: force,
      overcast: force > magic, caster: caster,
      pool: pool, hits: hits, success: hits > 0, done: true, drain: drain,
    };
  }

  function finishCast(rng, cast) {
    if (!cast || !cast.ok || cast.done) return cast;
    const success = !!(cast.lattice && cast.lattice.success);
    const drain = spellDrain(rng, cast.caster, cast.def, cast.force);
    if (cast.lattice && cast.lattice.backlash) drain.damage += cast.lattice.backlash;
    cast.done = true;
    cast.success = success;
    cast.drain = drain;
    return cast; // the caller bills it — see castSpell
  }

  // ── Out of combat: what a cast does to a run ───────────────────
  // Reads the spell's `home`. mission.js owns the run record; this
  // writes the hooks mission.js reads (concealment, silence,
  // reveals, sustaining) and nothing else.
  function applySpellToRun(run, caster, cast) {
    if (!run || !cast || !cast.success) return null;
    const def = cast.def;
    const applied = { spell: cast.spell, label: def.label, home: def.home || (def.combat ? "attack" : null) };

    if (def.home === "conceal") {
      // Force throttles how well it hides them, and the M/P split
      // decides WHO it hides them from: mana fools minds, so a
      // camera — which has none — sees straight through Invisibility
      // and is beaten only by the physical version.
      const gained = Math.round(def.concealment * (cast.force / Math.max(1, MJ.maxForceFor(caster))));
      run.spellConcealment = run.spellConcealment || [];
      run.spellConcealment.push({ amount: gained, vsTech: !!def.vsTech, caster: caster });
      applied.concealment = gained;
      applied.vsTech = !!def.vsTech;
    }
    if (def.home === "silence") {
      // Hush/Silence blanket the crew's ground; Stealth quiets one
      // runner. While held, a loud act is not automatically heard —
      // it still has to survive being SEEN.
      if (def.single) { run.silencedRunners = run.silencedRunners || new Set(); run.silencedRunners.add(cast.target || caster); }
      else run.silenced = true;
      applied.silenced = true;
    }
    if (def.home === "heal") {
      const target = cast.target || caster;
      const before = target.wounds || 0;
      const closed = Math.min(before, Math.max(1, Math.ceil(cast.force / 2)));
      target.wounds = before - closed;
      applied.healed = closed;
    }
    if (def.home === "reveal") {
      applied.revealed = def.reveals;
      run.revealed = run.revealed || {};
      run.revealed[def.reveals] = true;
    }
    if (def.home === "disguise") {
      run.spellBoosts = run.spellBoosts || new Map();
      const target = cast.target || caster;
      const boosts = run.spellBoosts.get(target) || {};
      boosts[def.boostSkill] = Math.max(boosts[def.boostSkill] || 0, def.boost);
      run.spellBoosts.set(target, boosts);
      applied.boosted = def.boostSkill;
    }
    if (def.home === "buff") {
      // Carried as a standing intent; crewCombatants applies the
      // effect when a fight actually starts.
      applied.effect = def.effect;
    }
    if (def.sustained) {
      run.sustaining = run.sustaining || [];
      run.sustaining.push({
        spell: cast.spell, caster: caster, force: cast.force,
        effect: def.effect || null,
        // Who the spell is ON — Armor goes on the tank, the −2 goes
        // on the mage. Combat entry reads both ends.
        target: cast.target || caster,
      });
      applied.sustained = true;
    }
    return applied;
  }

  // How much a caster's OTHER work suffers right now: −2 per spell
  // they are holding open. Read by every pool the mission computes.
  function sustainPenaltyFor(run, runner) {
    if (!run || !run.sustaining) return 0;
    return -2 * run.sustaining.filter((s) => s.caster === runner).length;
  }

  function dropSustainedInRun(run, caster, spellId) {
    if (!run || !run.sustaining) return false;
    const before = run.sustaining.length;
    run.sustaining = run.sustaining.filter((s) => !(s.caster === caster && (!spellId || s.spell === spellId)));
    return run.sustaining.length !== before;
  }

  // ── In combat: a spell as an action ────────────────────────────
  // Direct spells skip the armour gate entirely — the reason a mage
  // answers a hardsuit differently from a gun. Area spells hit
  // everything on the other side sharing the ground. Touch spells
  // resolve like a melee engagement: the defender reads the swing
  // coming, priced into the cheap Drain.
  function spellCombatAction(combat, caster, spellId, target, opts) {
    opts = opts || {};
    const def = spellDef(spellId);
    if (!def) return { ok: false, error: "no such spell" };
    registerSpellEffects();
    const source = caster.source || caster;
    if (!knowsSpell(source, spellId)) return { ok: false, error: "not in their grimoire" };
    const magic = (source.attributes && source.attributes.magic) || 0;
    const force = Math.max(1, Math.min(MJ.maxForceFor(source), opts.force || magic));

    const out = { ok: true, spell: spellId, label: def.label, force: force, caster: caster.name };

    // Drain is owed on the attempt, not the outcome.
    const drain = spellDrain(combat.rng, source, def, force);
    out.drain = drain;
    if (drain.damage > 0) {
      // Inside a fight the caster IS a combatant, so it lands on the
      // combatant's tracks and rides home through carryDamageHome
      // like every other box taken in the exchange — no separate
      // write to the dossier, which used to charge the runner twice.
      MJ.applyDamage(caster, drain.damage, !drain.physical);
      out.drainTaken = drain.damage;
      if (caster.down) { out.casterDown = true; return out; }
    }

    // Sustained non-attack spells go UP rather than being thrown.
    if (def.sustained && !def.combat) {
      const holder = def.onTarget ? target : caster;
      const stacks = def.stacksFromForce ? force : (def.effectStacks || 1);
      if (def.effect) MJ.applyEffect(holder, def.effect, { stacks: stacks, source: spellId });
      if (def.dominates) MJ.applyEffect(target, "dominated", { source: spellId });
      MJ.applyEffect(caster, "sustaining", { source: spellId });
      out.sustained = true;
      out.on = (def.onTarget || def.dominates ? target : caster).name;
      return out;
    }

    if (def.home === "heal") {
      const before = target.physical || 0;
      const closed = Math.min(before, Math.max(1, Math.ceil(force / 2)));
      target.physical = before - closed;
      if (target.source && typeof target.source.wounds === "number") {
        target.source.wounds = Math.max(0, target.source.wounds - closed);
      }
      out.healed = closed;
      out.on = target.name;
      return out;
    }

    // An attack spell. Mana touches only the living — read off the
    // OBSTACLE behind the combatant, because that is where `living`
    // is a fact; a crew member is living by definition.
    const targetLiving = target.sourceObstacle ? !!target.sourceObstacle.living : true;
    if (def.shape === "directMana" && !targetLiving) {
      return { ok: true, spell: spellId, result: "ineffective", why: "mana does not touch the unliving" };
    }
    const targets = def.area
      ? combat.combatants.filter((c) => c.side === target.side && !c.down)
      : [target];
    out.hits = [];
    for (const tgt of targets) {
      const pool = Math.max(0, MJ.dicePoolFor(source, "sorcery", MJ.effectModifier(caster, "accuracy")));
      const atk = MJ.countHits(MJ.rollDicePool(combat.rng, pool));
      // Touch spells are read like a melee swing; LOS spells are
      // dodged on instinct — canon resists direct with the target's
      // own resilience, and we fold that into the defence roll.
      const defencePool = Math.max(0, (def.shape === "directMana"
        ? (tgt.attributes.willpower || 0)
        : (tgt.attributes.agility || 0)) + MJ.effectModifier(tgt, "defence"));
      const dfn = MJ.countHits(MJ.rollDicePool(combat.rng, defencePool));
      const net = atk - dfn;
      if (net <= 0) { out.hits.push({ target: tgt.name, result: "miss", atkHits: atk, defHits: dfn }); continue; }

      const direct = def.shape === "directMana" || def.shape === "directPhys";
      const dv = force + net;
      const armour = direct ? 0
        : Math.max(0, tgt.armour + MJ.effectModifier(tgt, "armour") - force); // AP −Force, canon indirect
      const soakPool = Math.max(0, (tgt.attributes.body || 0) + armour + MJ.effectModifier(tgt, "soak"));
      const soaked = MJ.countHits(MJ.rollDicePool(combat.rng, soakPool));
      const damage = Math.max(0, dv - soaked);
      if (damage > 0) MJ.applyDamage(tgt, damage, !!def.stun);
      out.hits.push({
        target: tgt.name, result: damage > 0 ? "hit" : "soaked",
        direct: direct, stun: !!def.stun, atkHits: atk, defHits: dfn,
        dv: dv, armourApplied: armour, soaked: soaked, damage: damage,
        downed: !!tgt.down,
      });
    }
    return out;
  }

  // Drop a sustained spell in combat — hands the attention back.
  function dropSustained(caster, spellId) {
    if (!caster) return false;
    MJ.clearEffect(caster, "sustaining");
    const def = spellDef(spellId);
    if (def && def.effect) MJ.clearEffect(caster, def.effect);
    return true;
  }

  registerSpellEffects();

  // ── One formula per spell, into the armoury ────────────────────
  // The grimoire owns its own shop rows: every implemented spell has
  // a learnable formula, named for the spell (canon names, no
  // invented brands — the magic IS the homage). Tier rides the
  // printed Drain, so the formulas for the big expensive spells cost
  // real money and the touch-range cheap ones are pocket change —
  // the same pricing logic the Drain economy already is. This file
  // loads after armory.js by design; spells.js is the authority on
  // what is castable, so it is the authority on what is teachable.
  if (MJ.ITEM_TEMPLATES) {
    for (const id of Object.keys(SPELLS)) {
      const def = SPELLS[id];
      MJ.ITEM_TEMPLATES["fml_" + id] = {
        label: "Formula: " + def.label,
        category: "formula",
        tier: Math.max(1, Math.min(9, 5 + (def.drain || 0))),
        spellId: id,
        spellCategory: def.category,
        craftSkill: "enchanting",
      };
    }
  }

  MJ.SPELLS = SPELLS;
  MJ.SPELL_CATEGORIES = CATEGORIES;
  MJ.spellDef = spellDef;
  MJ.spellThreat = spellThreat;
  MJ.forceLadder = forceLadder;
  MJ.drainPreview = drainPreview;
  MJ.spellsFor = spellsFor;
  MJ.knowsSpell = knowsSpell;
  MJ.knowsSpellOfShape = knowsSpellOfShape;
  MJ.bestSpellOfShape = bestSpellOfShape;
  MJ.bestCombatSpell = bestCombatSpell;
  MJ.bestCommandSpell = bestCommandSpell;
  MJ.spellDrain = spellDrain;
  MJ.castSpell = castSpell;
  MJ.finishCast = finishCast;
  MJ.applySpellToRun = applySpellToRun;
  MJ.sustainPenaltyFor = sustainPenaltyFor;
  MJ.dropSustainedInRun = dropSustainedInRun;
  MJ.spellCombatAction = spellCombatAction;
  MJ.dropSustained = dropSustained;
  MJ.registerSpellEffects = registerSpellEffects;
})();
