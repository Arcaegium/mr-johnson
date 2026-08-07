/* ============================================================
   Mr. Johnson — models/powers.js
   ADEPT POWERS — the other kind of Awakened.

   A mage spends their spark casting. An adept burns it on their own
   body. Same attribute, opposite direction, and until this file
   existed the second kind did nothing at all: an adept's Magic was
   measured inert — identical dice pools, identical lanes, identical
   price at Magic 4 and Magic 0 — across ~9% of the generated market.

   THIS FILE IS THE GRIMOIRE'S TWIN, deliberately. Powers are assigned
   the way spells are (models/runner.js generatePowers mirrors
   generateGrimoire), known on the dossier the way spells are, priced
   the way spells are, and they reach the world the way spells do —
   as rows in the effects registry, never as resolver changes.

   NO POWER POINTS. SR5 gives adepts Power Points equal to Magic and
   charges 5 karma each to anyone buying them outright. Power Points
   are a hand-calculation abstraction for a table; the app does the
   arithmetic, so powers carry KARMA prices directly (the SR5 cost x 5,
   settled here once) and the cap converts with them:

       total power karma <= Magic x 5, for life.

   That is the one place adepts and mages genuinely differ. A mage's
   Magic bounds their STARTING book and nothing else — learning is
   unlimited, paid in karma. An adept's Magic bounds their powers
   PERMANENTLY, because a power is not studied, it is how much magic
   is in the person. Want more? Raise Magic.

   Three ways a power reaches the game, and no fourth:
     effect     a row in combat.js's registry, applied in an exchange
     skillMods  read by getEffectiveSkills beside implant chrome —
                chrome and magic augment training the same way, and
                neither ever rescues the untrained
     grants     a capability flag the verb layer reads

   Usage:
     MJ.powersFor(runner)            // what they can actually use
     MJ.knowsPower(runner, id)
     MJ.powerKarmaSpent(runner)      // against MJ.powerKarmaCap(runner)
     MJ.powerSkillMods(runner)       // merged, for getEffectiveSkills
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // SR5 cost x 5, rounded to whole karma at authoring time so no
  // fraction ever reaches the code. `pp` is kept only so the
  // derivation stays checkable against the source book.
  const POWERS = {
    improvedReflexes: {
      label: "Improved Reflexes", pp: 1.5, karma: 8,
      effect: "quickened",
      note: "acts sooner, and more often",
    },
    combatSenseAdept: {
      label: "Combat Sense", pp: 0.5, karma: 3,
      effect: "combatSense",
      note: "reads the attack before it lands",
    },
    mysticArmor: {
      label: "Mystic Armor", pp: 0.5, karma: 3,
      effect: "mysticArmor",
      note: "armour that is not worn and cannot be taken off",
    },
    painResistance: {
      label: "Pain Resistance", pp: 0.5, karma: 3,
      effect: "painResistance",
      note: "the body argues with the wound",
    },
    killingHands: {
      label: "Killing Hands", pp: 0.5, karma: 3,
      grants: "lethalUnarmed",
      note: "needs no weapon issued, and never runs dry",
    },
    astralPerception: {
      label: "Astral Perception", pp: 1.0, karma: 5,
      grants: "astralSight",
      note: "opens the eyes they were always entitled to",
    },
    improvedFirearms: {
      label: "Improved Ability (Firearms)", pp: 0.5, karma: 3,
      skillMods: { firearms: 2 },
    },
    improvedMelee: {
      label: "Improved Ability (Melee)", pp: 0.5, karma: 3,
      skillMods: { melee: 2 },
    },
    improvedStealth: {
      label: "Improved Ability (Stealth)", pp: 0.5, karma: 3,
      skillMods: { stealth: 2 },
    },
    improvedMarksmanship: {
      label: "Improved Ability (Marksmanship)", pp: 0.5, karma: 3,
      skillMods: { marksmanship: 2 },
    },
    enhancedPerception: {
      label: "Enhanced Perception", pp: 0.5, karma: 3,
      skillMods: { perception: 2 },
    },
    kinesics: {
      label: "Kinesics", pp: 0.5, karma: 3,
      skillMods: { con: 2 },
    },
    commandingVoice: {
      label: "Commanding Voice", pp: 0.5, karma: 3,
      skillMods: { leadership: 1, intimidation: 1 },
    },
    greatLeap: {
      label: "Great Leap", pp: 0.5, karma: 3,
      skillMods: { athletics: 2 },
    },
  };

  // ── The effect rows this file owns ──────────────────────────────
  // Registered into combat.js's table at load, exactly as spells.js
  // registers its eight. `combatSense` already exists there as chrome
  // and is reused rather than duplicated — the ROW says what happens,
  // the `source` on the applied effect says who did it, which is what
  // lets counterspell strip the magical one and leave the wired one.
  const POWER_EFFECTS = {
    quickened:      { label: "quickened",      kind: "boon", channels: { initiative: 4, initiativeDice: 1 } },
    mysticArmor:    { label: "mystic armour",  kind: "boon", channels: { armour: 2 }, maxStacks: 3 },
    painResistance: { label: "pain resistance", kind: "boon", channels: { soak: 2 } },
  };

  // Registered lazily, same as spells.js — combat.js loads first and
  // owns the table.
  function registerPowerEffects() {
    const E = MJ.COMBAT_EFFECTS;
    if (!E) return false;
    for (const id of Object.keys(POWER_EFFECTS)) {
      if (!E[id]) E[id] = POWER_EFFECTS[id];
    }
    return true;
  }

  function powerDef(id) { return POWERS[id] || null; }

  function powersKnownOf(runner) {
    const c = runner && runner.classification;
    return (c && c.powersKnown) || [];
  }

  function knowsPower(runner, id) {
    return powersKnownOf(runner).some((p) => (p.id || p) === id);
  }

  // The permanent ceiling. Magic is how much magic is IN them, and a
  // power is a piece of it spent — so unlike a grimoire this does not
  // grow with study, only with the attribute.
  function powerKarmaCap(runner) {
    const magic = (runner && runner.attributes && runner.attributes.magic) || 0;
    return magic * (MJ.MAGIC_KARMA_PER_UNIT || 5);
  }

  function powerKarmaSpent(runner) {
    return powersKnownOf(runner).reduce((sum, p) => {
      const def = powerDef(p.id || p);
      return sum + (def ? def.karma : 0);
    }, 0);
  }

  function canAffordPower(runner, id) {
    const def = powerDef(id);
    if (!def) return false;
    return powerKarmaSpent(runner) + def.karma <= powerKarmaCap(runner);
  }

  // What they can actually USE. The dossier is the authority, the same
  // rule spellsFor follows — and Magic 0 means the spark is gone
  // (Essence burn), which takes the powers with it.
  function powersFor(runner) {
    if (!runner) return [];
    const magic = (runner.attributes && runner.attributes.magic) || 0;
    if (magic <= 0) return [];
    return powersKnownOf(runner)
      .map((p) => p.id || p)
      .filter((id) => !!POWERS[id]);
  }

  // Merged skill bonuses from every power they know. Shaped exactly
  // like an implant's skillMods so getEffectiveSkills can apply both
  // through one path — chrome and magic augment training the same
  // way, and neither rescues a skill with no ranks.
  function powerSkillMods(runner) {
    const out = {};
    for (const id of powersFor(runner)) {
      const mods = POWERS[id].skillMods;
      if (!mods) continue;
      for (const skill of Object.keys(mods)) {
        out[skill] = (out[skill] || 0) + mods[skill];
      }
    }
    return out;
  }

  function powerGrants(runner, flag) {
    return powersFor(runner).some((id) => POWERS[id].grants === flag);
  }

  // Combat effects a power puts up. Sourced by POWER ID, which is how
  // anything asking "was this magic?" gets a truthful answer without
  // a second field — the same trick spells.js uses.
  function applyPowerEffects(combatant, runner) {
    const applied = [];
    for (const id of powersFor(runner)) {
      const def = POWERS[id];
      if (!def.effect) continue;
      MJ.applyEffect(combatant, def.effect, { source: id });
      applied.push(id);
    }
    return applied;
  }

  // Is this active effect magical — and therefore dispellable? A
  // spell id or a power id in `source` is the whole test; chrome and
  // gear name neither.
  function isMagicalEffect(active) {
    const src = active && active.source;
    if (!src) return false;
    return !!(MJ.SPELLS && MJ.SPELLS[src]) || !!POWERS[src];
  }

  registerPowerEffects();

  MJ.POWERS = POWERS;
  MJ.powerDef = powerDef;
  MJ.powersFor = powersFor;
  MJ.knowsPower = knowsPower;
  MJ.powerKarmaCap = powerKarmaCap;
  MJ.powerKarmaSpent = powerKarmaSpent;
  MJ.canAffordPower = canAffordPower;
  MJ.powerSkillMods = powerSkillMods;
  MJ.powerGrants = powerGrants;
  MJ.applyPowerEffects = applyPowerEffects;
  MJ.isMagicalEffect = isMagicalEffect;
  MJ.registerPowerEffects = registerPowerEffects;
})();
