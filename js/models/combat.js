/* ============================================================
   Mr. Johnson — models/combat.js
   Turn-based resolution, per current understanding §07.

   This is the layer the whole mission system was missing. Until
   now an obstacle was a check: one roll, pass or fail, and the
   only cost of losing a fight was that you did not get past. A
   fight is not a check. It is an exchange with an order, an
   action economy, and a running tally of what it has done to you
   — and it is the only place a mission can WEAR A CREW DOWN,
   which is what makes "more security" mean anything at all.
   Without depletion, twenty guards is the same as one, just
   slower.

   THREE THINGS, straight from §07:

   1. INITIATIVE IS DETERMINISTIC. "Turn order is deterministic —
      perfect information, plannable, chess." Initiative Attribute
      = Agility + Intelligence, flat, no roll. You can see the
      order before you commit, which is what makes an ambush a
      plan rather than a gamble.

   2. INITIATIVE DICE ARE ACTION COUNT, not a bonus to order —
      "the mechanic worth building the combat economy around." One
      for a mundane guard, three or four for a wired samurai.
      Resolution runs in PASSES: everyone acts in pass 1, then
      only those with 2+ actions act in pass 2, then 3+. Because
      order within each pass is by initiative, fast units lead
      every pass and read as constantly in motion — and everyone
      is guaranteed their pass-1 action before anyone doubles, so
      slow units are never deleted before they move.

   3. THE THREE-GATE CHAIN kills the single meta weapon.
        Hit       — attacker accuracy vs evasion and cover
        Penetrate — the weapon's Power vs the target's Armor
        Damage    — only what got through, onto a health track
      A high-damage low-Power weapon does nothing to a plated
      tank; an armour-piercing rifle chews through it.

   DUAL TRACKS: Body drives physical, Willpower drives stun.
   Lethal weapons fill physical, stun weapons (gel rounds, batons,
   stun spells) fill stun. Either full = down. That gives
   non-lethal a real mechanical lane, so a capture contract is a
   loadout decision rather than a fiction.

   WHAT THIS FILE DOES NOT DO: positioning. Scene-text abstracts
   the spatial layer into a chosen STANCE (§02 of the build plan:
   scene-text defers "exact positioning, cover angles, the radius
   dance" and nothing else). Stance feeds the Hit gate exactly
   where real geometry will later, so the visual layer replaces
   one input rather than rewriting the engine.

   Usage:
     const c = MJ.beginCombat(rng, crew, enemies, { surprise: true });
     MJ.combatActor(c);              // whose turn it is
     MJ.combatAct(c, { attacker, target, weapon, mode, stance });
     MJ.combatOver(c);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── Health tracks ──────────────────────────────────────────────
  // Tabletop track sizes: 8 + half the governing attribute, round
  // up. Body carries the physical track, Willpower the stun one —
  // the two attributes that hold no skills earn their keep here.
  function physicalTrack(c) {
    return 8 + Math.ceil((c.attributes.body || 1) / 2);
  }
  function stunTrack(c) {
    return 8 + Math.ceil((c.attributes.willpower || 1) / 2);
  }

  // ── Stance: the scene-text stand-in for position ───────────────
  // `defence` is dice added to the target's evasion; `accuracy`
  // modifies the attacker's own pool. Flanking trades your own
  // cover for a better angle; full defence gives up your action
  // entirely to be very hard to hit. This is the seam the spatial
  // layer plugs real geometry into.
  const STANCES = {
    open:       { label: "in the open",  defence: 0, accuracy: 0 },
    cover:      { label: "behind cover", defence: 2, accuracy: -1 },
    flanking:   { label: "flanking",     defence: -1, accuracy: 2 },
    fullDefence:{ label: "full defence", defence: 4, accuracy: 0, forfeitsAction: true },
  };

  // ── Fire modes ─────────────────────────────────────────────────
  // Rate of fire buys accuracy against the target's ability to
  // dodge, and pays for it in ammunition. This is what makes ammo
  // a resource rather than bookkeeping: full auto genuinely wins
  // exchanges and genuinely empties a magazine.
  const MODES = {
    SS: { label: "single shot",     rounds: 1, defencePenalty: 0 },
    SA: { label: "semi-auto",       rounds: 2, defencePenalty: 1 },
    BF: { label: "burst",           rounds: 3, defencePenalty: 2 },
    FA: { label: "full auto",       rounds: 6, defencePenalty: 5 },
    melee: { label: "melee",        rounds: 0, defencePenalty: 0 },
  };

  // ── Weapon profiles ────────────────────────────────────────────
  // Power vs Armour is gate 2, so `power` and `ap` are what make
  // weapon choice a real decision against a given target rather
  // than a damage race. `useStrength` is why Strength had to come
  // back as its own attribute: melee Power scales with the arm
  // swinging it, so a troll and an elf do NOT hit the same with
  // the same knife.
  const WEAPONS = {
    unarmed:   { label: "Unarmed",      skill: "melee",        power: 0, dv: 2, ap: 0,  useStrength: true, stun: true,  modes: ["melee"] },
    baton:     { label: "Stun baton",   skill: "melee",        power: 4, dv: 5, ap: 0,  useStrength: true, stun: true,  modes: ["melee"] },
    blade:     { label: "Blade",        skill: "melee",        power: 5, dv: 4, ap: -2, useStrength: true,              modes: ["melee"] },
    holdout:   { label: "Holdout",      skill: "firearms",     power: 4, dv: 4, ap: 0,  modes: ["SS", "SA"] },
    pistol:    { label: "Pistol",       skill: "firearms",     power: 6, dv: 6, ap: -1, modes: ["SS", "SA"] },
    smg:       { label: "SMG",          skill: "firearms",     power: 6, dv: 6, ap: -2, modes: ["SA", "BF", "FA"] },
    shotgun:   { label: "Shotgun",      skill: "firearms",     power: 9, dv: 9, ap: 1,  modes: ["SS", "SA"] },
    rifle:     { label: "Rifle",        skill: "marksmanship", power: 9, dv: 8, ap: -3, modes: ["SS", "SA"] },
    machinegun:{ label: "Machine gun",  skill: "heavyWeapons", power: 10, dv: 9, ap: -3, modes: ["BF", "FA"] },
    gel:       { label: "Gel rounds",   skill: "firearms",     power: 6, dv: 7, ap: 2,  stun: true, modes: ["SS", "SA"] },
  };

  function weaponProfile(id) {
    return WEAPONS[id] || WEAPONS.unarmed;
  }

  // ── Combatants ─────────────────────────────────────────────────
  // A combatant wraps either a roster runner or a generated
  // opponent. Everything the engine needs is on this record, so
  // the same code fights a decker and a security spider.
  function makeCombatant(source, opts) {
    opts = opts || {};
    const attrs = source.attributes || {};
    const c = {
      source: source,
      name: (source.identity && source.identity.handle) || source.label || "combatant",
      side: opts.side || "crew",
      attributes: attrs,
      skills: source.skills || {},
      armour: opts.armour !== undefined ? opts.armour : (source.armour || 0),
      weaponId: opts.weaponId || "unarmed",
      // A crafted instance of a weapon is genuinely better than the
      // shop's: quality lifts Power (so it beats armour the plain
      // version bounces off) and damage. That is what keeps the
      // bench worth using even for a runner who already owns the
      // best thing money buys.
      weaponQuality: opts.weaponQuality || 0,
      // Action count. One is a mundane body; more is bought with
      // Wired Reflexes (cyber) or Improved Reflexes (adept magic) —
      // neither generated yet, so this is the seam they land on.
      initiativeDice: opts.initiativeDice || source.initiativeDice || 1,
      ammo: opts.ammo !== undefined ? opts.ammo : 30,
      physical: 0,
      stun: 0,
      down: false,
      stance: opts.stance || "open",
    };
    c.physicalMax = physicalTrack(c);
    c.stunMax = stunTrack(c);
    return c;
  }

  // Flat, no roll — you can read the whole order before committing.
  function initiativeScore(c) {
    return (c.attributes.agility || 0) + (c.attributes.intelligence || 0);
  }

  // ── The pass structure ─────────────────────────────────────────
  // Pass N contains everyone with at least N initiative dice, in
  // initiative order. Fast units therefore lead EVERY pass rather
  // than clustering at the round's tail, which is what reads as
  // being constantly in motion.
  function buildRound(combat) {
    const alive = combat.combatants.filter((c) => !c.down);
    const maxDice = alive.reduce((m, c) => Math.max(m, c.initiativeDice), 0);
    const order = [];
    for (let pass = 1; pass <= maxDice; pass++) {
      alive
        .filter((c) => c.initiativeDice >= pass)
        .sort((a, b) => initiativeScore(b) - initiativeScore(a))
        .forEach((c) => order.push({ actor: c, pass: pass }));
    }
    return order;
  }

  function beginCombat(rng, crew, enemies, opts) {
    opts = opts || {};
    const combat = {
      rng: rng,
      combatants: crew.concat(enemies),
      round: 0,
      order: [],
      cursor: 0,
      log: [],
      // Chosen while undetected: the crew acts once before anyone
      // can respond. The tabletop's surprise round, and the whole
      // reason to enter turn-based deliberately rather than being
      // forced into it.
      surprise: !!opts.surprise,
      over: false,
    };
    nextRound(combat);
    if (combat.surprise) {
      combat.order = combat.order.filter((slot) => slot.actor.side === "crew");
      combat.log.push({ event: "surprise", text: "the crew moves first — nobody has reacted yet" });
    }
    return combat;
  }

  function nextRound(combat) {
    combat.round += 1;
    combat.order = buildRound(combat);
    combat.cursor = 0;
  }

  function sideAlive(combat, side) {
    return combat.combatants.some((c) => c.side === side && !c.down);
  }

  function combatOver(combat) {
    if (combat.over) return true;
    if (!sideAlive(combat, "crew") || !sideAlive(combat, "enemy")) {
      combat.over = true;
      return true;
    }
    return false;
  }

  // Whose turn it is, skipping anyone dropped since the round was
  // built. Rolls into the next round when the order runs out.
  function combatActor(combat) {
    if (combatOver(combat)) return null;
    let guard = 0;
    while (guard++ < 500) {
      while (combat.cursor < combat.order.length && combat.order[combat.cursor].actor.down) combat.cursor += 1;
      if (combat.cursor < combat.order.length) return combat.order[combat.cursor];
      nextRound(combat);
      if (combat.order.length === 0) { combat.over = true; return null; }
    }
    return null;
  }

  // ── Gate 1: Hit ────────────────────────────────────────────────
  // Opposed. The attacker's pool is skill + attribute (the same
  // dicePoolFor everything else uses), shifted by their stance and
  // the weapon's rate of fire; the defender rolls evasion — Agility
  // — plus whatever their own stance is worth. Net hits carry into
  // damage, so a clean hit hurts more than a graze.
  function attackPool(attacker, weapon, stanceId) {
    const stance = STANCES[stanceId] || STANCES.open;
    return Math.max(0, MJ.dicePoolFor(attacker.source, weapon.skill, stance.accuracy));
  }

  function defencePool(defender, mode) {
    const stance = STANCES[defender.stance] || STANCES.open;
    const base = (defender.attributes.agility || 0) + stance.defence;
    return Math.max(0, base - (MODES[mode] ? MODES[mode].defencePenalty : 0));
  }

  // ── Gate 2 & 3: Penetrate, then Damage ─────────────────────────
  // Armour is reduced by the weapon's AP. If the weapon's Power
  // cannot beat the armour it faces, it does not penetrate — the
  // hit lands and does nothing but noise. Anything that gets
  // through is soaked with Body + remaining armour, one point of
  // damage removed per hit.
  function resolveDamage(combat, attacker, defender, weapon, netHits) {
    const armour = Math.max(0, defender.armour + (weapon.ap || 0));
    const power = (weapon.power || 0) + (attacker.weaponQuality || 0) +
      (weapon.useStrength ? (attacker.attributes.strength || 0) : 0);
    if (power <= armour) {
      return { penetrated: false, armour: armour, power: power, damage: 0 };
    }
    const dv = (weapon.dv || 0) + (attacker.weaponQuality || 0) + netHits +
      (weapon.useStrength ? Math.floor((attacker.attributes.strength || 0) / 2) : 0);
    const soakPool = (defender.attributes.body || 0) + armour;
    const soakDice = MJ.rollDicePool(combat.rng, soakPool);
    const soaked = MJ.countHits(soakDice);
    const damage = Math.max(0, dv - soaked);
    return { penetrated: true, armour: armour, power: power, dv: dv, soaked: soaked, damage: damage };
  }

  function applyDamage(defender, damage, isStun) {
    if (damage <= 0) return { down: false, overflow: 0 };
    if (isStun) {
      defender.stun += damage;
      if (defender.stun >= defender.stunMax) { defender.down = true; defender.downedBy = "stun"; }
    } else {
      defender.physical += damage;
      if (defender.physical >= defender.physicalMax) { defender.down = true; defender.downedBy = "physical"; }
    }
    return { down: defender.down, overflow: isStun
      ? Math.max(0, defender.stun - defender.stunMax)
      : Math.max(0, defender.physical - defender.physicalMax) };
  }

  // ── One action ─────────────────────────────────────────────────
  function combatAct(combat, choice) {
    const slot = combatActor(combat);
    if (!slot) return null;
    const attacker = slot.actor;
    combat.cursor += 1;

    if (choice && choice.stance) attacker.stance = choice.stance;
    const stanceDef = STANCES[attacker.stance] || STANCES.open;

    // Full defence buys survivability with the entire action.
    if (stanceDef.forfeitsAction || !choice || !choice.target) {
      const entry = { event: "hold", round: combat.round, pass: slot.pass, actor: attacker.name, stance: attacker.stance };
      combat.log.push(entry);
      combatOver(combat);
      return entry;
    }

    const weapon = weaponProfile(choice.weaponId || attacker.weaponId);
    const mode = (choice.mode && weapon.modes.indexOf(choice.mode) !== -1) ? choice.mode : weapon.modes[0];
    const target = choice.target;

    // Ammunition. Rate of fire is only a real decision if running
    // dry is a real outcome.
    const cost = MODES[mode].rounds;
    if (cost > 0 && attacker.ammo < cost) {
      const entry = { event: "dry", round: combat.round, pass: slot.pass, actor: attacker.name, weapon: weapon.label };
      combat.log.push(entry);
      return entry;
    }
    attacker.ammo -= cost;

    const atkDice = MJ.rollDicePool(combat.rng, attackPool(attacker, weapon, attacker.stance));
    const defDice = MJ.rollDicePool(combat.rng, defencePool(target, mode));
    const atkHits = MJ.countHits(atkDice);
    const defHits = MJ.countHits(defDice);
    const netHits = atkHits - defHits;

    const entry = {
      event: "attack", round: combat.round, pass: slot.pass,
      actor: attacker.name, target: target.name,
      weapon: weapon.label, mode: MODES[mode].label,
      atkHits: atkHits, defHits: defHits, netHits: netHits,
      ammoLeft: attacker.ammo,
    };

    if (netHits <= 0) {
      entry.result = "miss";
      combat.log.push(entry);
      combatOver(combat);
      return entry;
    }

    const dmg = resolveDamage(combat, attacker, target, weapon, netHits);
    entry.power = dmg.power;
    entry.armour = dmg.armour;
    if (!dmg.penetrated) {
      entry.result = "no penetration";
      combat.log.push(entry);
      combatOver(combat);
      return entry;
    }
    entry.dv = dmg.dv;
    entry.soaked = dmg.soaked;
    entry.damage = dmg.damage;
    entry.stun = !!weapon.stun;

    const applied = applyDamage(target, dmg.damage, !!weapon.stun);
    entry.result = dmg.damage > 0 ? "hit" : "soaked";
    entry.targetPhysical = target.physical;
    entry.targetStun = target.stun;
    if (applied.down) {
      entry.downed = true;
      entry.downedBy = target.downedBy;
    }
    combat.log.push(entry);
    combatOver(combat);
    return entry;
  }

  MJ.WEAPONS = WEAPONS;
  MJ.COMBAT_STANCES = STANCES;
  MJ.FIRE_MODES = MODES;
  MJ.weaponProfile = weaponProfile;
  MJ.makeCombatant = makeCombatant;
  MJ.initiativeScore = initiativeScore;
  MJ.buildRound = buildRound;
  MJ.beginCombat = beginCombat;
  MJ.combatActor = combatActor;
  MJ.combatAct = combatAct;
  MJ.combatOver = combatOver;
  MJ.physicalTrack = physicalTrack;
  MJ.stunTrack = stunTrack;
})();
