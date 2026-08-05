/* ============================================================
   Mr. Johnson — models/spells.js
   Spells in MEATSPACE, in and out of combat, per
   docs/PILLAR-PLAN.md §3.5.

   Magic is not an astral-only pillar. A mage walks the street with
   the crew, and SR5 spells are cast INTO physical reality from a
   body standing in it. The astral is where you PROJECT; casting is
   something you do anywhere.

   STUBS. The point is the seams, not a grimoire. Each of SR5's five
   categories gets a representative entry or two, and every one of
   them lands on machinery that already exists:

     Force / Drain      maxForceFor, drainValueFor, resistDrain,
                        with overcast Drain going physical
     The Lattice        casting resolves as ASSEMBLING A CIRCUIT
     Effect channels    accuracy defence power damage armour soak
                        initiative initiativeDice — a sustained
                        combat spell IS an effect, nothing new needed
     run.concealment    built when the witness rules changed,
                        explicitly as the hook a spell plugs into
     runner.wounds      boxes on the physical track, what Heal treats

   DIRECT VS INDIRECT is the one combat distinction worth having up
   front: a direct spell touches the target's mind or body and
   ARMOUR DOES NOT APPLY; an indirect one throws something physical
   and armour resists it normally. That single flag is why a mage
   answers an armoured hardsuit differently from a gun.

   SUSTAINING is what makes a spell a decision rather than free
   power: holding one open costs the caster dice for as long as they
   hold it. Expressed as an ordinary effect, because the effects
   layer already does exactly this.

   Usage:
     MJ.spellsFor(runner);                       // what they can cast
     MJ.castSpell(rng, caster, "invisibility", { force: 4 });
     MJ.applySpellToRun(run, caster, result);    // out of combat
     MJ.spellCombatAction(combat, caster, "manabolt", target, opts);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const CATEGORIES = ["combat", "detection", "health", "illusion", "manipulation"];

  // Drain modifier is on top of the standard ceil(Force/2): the
  // tabletop prices spells against each other this way, and it is
  // what stops the strongest option also being the cheapest.
  const SPELLS = {
    // ── Combat ───────────────────────────────────────────────────
    manabolt: {
      label: "Manabolt", category: "combat", skill: "sorcery",
      combat: true, direct: true, drainMod: 0,
      // Direct: reaches past armour entirely, but only touches the
      // living. A drone or a maglock is not a valid target.
      livingOnly: true,
      describe: "raw mana, straight through armour — living things only",
    },
    fireball: {
      label: "Fireball", category: "combat", skill: "sorcery",
      combat: true, direct: false, drainMod: 1, area: true,
      describe: "throws real fire; armour resists it like anything else",
    },
    // ── Detection ────────────────────────────────────────────────
    detectLife: {
      label: "Detect Life", category: "detection", skill: "sorcery",
      combat: false, drainMod: -1, reveals: "life",
      describe: "what is breathing nearby, through walls",
    },
    clairvoyance: {
      label: "Clairvoyance", category: "detection", skill: "sorcery",
      combat: false, drainMod: 1, reveals: "ground",
      describe: "see ground the crew has not reached yet",
    },
    // ── Health ───────────────────────────────────────────────────
    heal: {
      label: "Heal", category: "health", skill: "sorcery",
      combat: true, drainMod: 0, heals: true,
      describe: "closes boxes on the physical track",
    },
    increaseReflexes: {
      label: "Increase Reflexes", category: "health", skill: "sorcery",
      combat: true, drainMod: 2, sustained: true,
      // The initiativeDice channel was built as the seam Wired and
      // Improved Reflexes would land on. This is the third.
      effect: "wired",
      describe: "another action a round, for as long as it is held",
    },
    // ── Illusion ─────────────────────────────────────────────────
    invisibility: {
      label: "Invisibility", category: "illusion", skill: "sorcery",
      combat: true, drainMod: 0, sustained: true,
      // Straight into the concealment hook: a watcher who is present
      // and CAN respond still has to notice, and this is what stops
      // them. The guard ten feet away never turns round.
      concealment: 6,
      describe: "the crew stops being something worth looking at",
    },
    confusion: {
      label: "Confusion", category: "illusion", skill: "sorcery",
      combat: true, drainMod: 0, sustained: true,
      effect: "rattled", effectStacks: 2, onTarget: true,
      describe: "the target cannot hold a thought straight",
    },
    // ── Manipulation ─────────────────────────────────────────────
    armorSpell: {
      label: "Armor", category: "manipulation", skill: "sorcery",
      combat: true, drainMod: -1, sustained: true,
      effect: "combatSense", armourBonus: true,
      describe: "mana hardens around them",
    },
    levitate: {
      label: "Levitate", category: "manipulation", skill: "sorcery",
      combat: false, drainMod: 0, bypasses: "physical",
      describe: "over the wall instead of through the door",
    },
  };

  // A sustained spell costs you while you hold it. Registered on the
  // effects layer so it stacks and expires like anything else.
  function registerSustainEffect() {
    if (!MJ.COMBAT_EFFECTS || MJ.COMBAT_EFFECTS.sustaining) return;
    MJ.COMBAT_EFFECTS.sustaining = {
      label: "sustaining", kind: "condition",
      // Holding a spell open takes part of your attention with it.
      channels: { accuracy: -2, defence: -1 },
      maxStacks: 3,
    };
  }

  function spellDef(id) {
    return SPELLS[id] || null;
  }

  // What a runner can actually cast: trained in the skill, and with
  // Magic to push it. Chrome cannot buy this — an Essence-burned
  // samurai has nothing to reach with.
  function spellsFor(runner) {
    if (!runner) return [];
    const skills = MJ.getEffectiveSkills(runner);
    const magic = (runner.attributes && runner.attributes.magic) || 0;
    if (magic <= 0) return [];
    return Object.keys(SPELLS).filter((id) => (skills[SPELLS[id].skill] || 0) > 0);
  }

  function spellDrain(rng, caster, def, force) {
    const drain = MJ.resistDrain(rng, caster, force);
    // The spell's own weight, on top of the standard Force cost.
    const adjusted = Math.max(2, drain.drainValue + (def.drainMod || 0));
    drain.drainValue = adjusted;
    drain.damage = Math.max(0, adjusted - drain.hits);
    return drain;
  }

  // ── Casting ────────────────────────────────────────────────────
  // Resolves as assembling a circuit: the Lattice is HOW a spell is
  // built, so a mage's sorcery and assensing shape the attempt the
  // same way they shape breaking a ward.
  function castSpell(rng, caster, spellId, opts) {
    opts = opts || {};
    const def = spellDef(spellId);
    if (!def) return { ok: false, error: "no such spell" };
    const skills = MJ.getEffectiveSkills(caster);
    if ((skills[def.skill] || 0) <= 0) return { ok: false, error: "untrained in " + def.skill };
    // Magic is the gate, not the skill. `spellsFor` already knew
    // that; this did not, so a mundane with sorcery ranks could cast
    // a spell that never appeared in their own list. Chrome cannot
    // buy this — an Essence-burned samurai has nothing to reach with.
    if (((caster.attributes && caster.attributes.magic) || 0) <= 0) {
      return { ok: false, error: "no Magic — nothing to reach with" };
    }
    const maxForce = MJ.maxForceFor(caster);
    const force = Math.max(1, Math.min(maxForce, opts.force || (caster.attributes.magic || 1)));

    const lattice = MJ.beginLattice(rng.fork ? rng.fork("cast") : rng, "assemble",
      { force: force }, caster, { rating: opts.rating || force, shape: opts.shape });
    return {
      ok: true, spell: spellId, def: def, force: force,
      overcast: force > (caster.attributes.magic || 0),
      lattice: lattice, caster: caster,
      // Not resolved yet — the circuit has to be built first. The
      // caller drives the lattice, then calls finishCast.
      done: false,
    };
  }

  function finishCast(rng, cast) {
    if (!cast || !cast.ok) return cast;
    const success = !!(cast.lattice && cast.lattice.success);
    const drain = spellDrain(rng, cast.caster, cast.def, cast.force);
    if (cast.lattice && cast.lattice.backlash) drain.damage += cast.lattice.backlash;
    cast.done = true;
    cast.success = success;
    cast.drain = drain;
    // Drain lands on the caster the same way it does everywhere:
    // stun normally, physical when overcasting.
    if (drain.damage > 0) {
      if (drain.physical) cast.caster.wounds = (cast.caster.wounds || 0) + drain.damage;
    }
    return cast;
  }

  // ── Out of combat: what a cast spell does to a run ──────────────
  function applySpellToRun(run, caster, cast) {
    if (!run || !cast || !cast.success) return null;
    const def = cast.def;
    const applied = { spell: cast.spell, label: def.label };

    if (def.concealment) {
      // Force decides how well it hides them — the same throttle
      // every other magical act runs on.
      const gained = Math.round(def.concealment * (cast.force / Math.max(1, MJ.maxForceFor(caster))));
      run.concealment = (run.concealment || 0) + gained;
      applied.concealment = gained;
    }
    if (def.heals) {
      const before = caster.wounds || 0;
      const closed = Math.min(before, Math.max(1, Math.ceil(cast.force / 2)));
      caster.wounds = before - closed;
      applied.healed = closed;
    }
    if (def.reveals) {
      // Detection buys knowledge, which is `observe` through mana.
      applied.revealed = def.reveals;
      run.revealed = run.revealed || {};
      run.revealed[def.reveals] = true;
    }
    if (def.sustained) {
      run.sustaining = run.sustaining || [];
      run.sustaining.push({ spell: cast.spell, caster: caster, force: cast.force });
      applied.sustained = true;
    }
    return applied;
  }

  // ── In combat: a spell as an action ────────────────────────────
  // Sits alongside a weapon attack rather than replacing it. Direct
  // spells skip the armour gate entirely, which is the whole reason
  // a mage answers a hardsuit differently from a gun.
  function spellCombatAction(combat, caster, spellId, target, opts) {
    opts = opts || {};
    const def = spellDef(spellId);
    if (!def || !def.combat) return { ok: false, error: "not a combat spell" };
    registerSustainEffect();
    const source = caster.source || caster;
    const force = Math.max(1, Math.min(MJ.maxForceFor(source), opts.force || (source.attributes.magic || 1)));

    // A sustained spell is put UP, not thrown: it lands as an effect
    // and charges the caster for holding it.
    if (def.sustained) {
      const holder = def.onTarget ? target : caster;
      if (def.effect) MJ.applyEffect(holder, def.effect, { stacks: def.effectStacks || 1, source: spellId });
      MJ.applyEffect(caster, "sustaining", { source: spellId });
      return { ok: true, spell: spellId, sustained: true, on: holder.name, force: force };
    }

    if (def.heals) {
      const before = target.physical || 0;
      const closed = Math.min(before, Math.max(1, Math.ceil(force / 2)));
      target.physical = before - closed;
      if (target.source && typeof target.source.wounds === "number") {
        target.source.wounds = Math.max(0, target.source.wounds - closed);
      }
      return { ok: true, spell: spellId, healed: closed, on: target.name };
    }

    // An attack spell. Opposed like any attack, then damage —
    // skipping gate 2 when direct.
    const pool = MJ.dicePoolFor(source, def.skill, MJ.effectModifier(caster, "accuracy"));
    const atk = MJ.countHits(MJ.rollDicePool(combat.rng, pool));
    const defencePool = Math.max(0, (target.attributes.willpower || 0) + MJ.effectModifier(target, "defence"));
    const dfn = MJ.countHits(MJ.rollDicePool(combat.rng, defencePool));
    const net = atk - dfn;
    if (net <= 0) return { ok: true, spell: spellId, result: "miss", atkHits: atk, defHits: dfn };

    const dv = force + net;
    const armour = def.direct ? 0 : Math.max(0, target.armour + MJ.effectModifier(target, "armour"));
    const soakPool = Math.max(0, (target.attributes.body || 0) + armour + MJ.effectModifier(target, "soak"));
    const soaked = MJ.countHits(MJ.rollDicePool(combat.rng, soakPool));
    const damage = Math.max(0, dv - soaked);
    if (damage > 0) {
      target.physical += damage;
      if (target.physical >= target.physicalMax) { target.down = true; target.downedBy = "physical"; }
    }
    return {
      ok: true, spell: spellId, result: damage > 0 ? "hit" : "soaked",
      direct: !!def.direct, atkHits: atk, defHits: dfn, netHits: net,
      dv: dv, armourApplied: armour, soaked: soaked, damage: damage,
      downed: !!target.down,
    };
  }

  // Drop a sustained spell — hands the caster their attention back.
  function dropSustained(caster, spellId) {
    if (!caster) return false;
    MJ.clearEffect(caster, "sustaining");
    const def = spellDef(spellId);
    if (def && def.effect) MJ.clearEffect(caster, def.effect);
    return true;
  }

  registerSustainEffect();

  MJ.SPELLS = SPELLS;
  MJ.SPELL_CATEGORIES = CATEGORIES;
  MJ.spellDef = spellDef;
  MJ.spellsFor = spellsFor;
  MJ.castSpell = castSpell;
  MJ.finishCast = finishCast;
  MJ.applySpellToRun = applySpellToRun;
  MJ.spellCombatAction = spellCombatAction;
  MJ.dropSustained = dropSustained;
})();
