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
  //
  // Both read `.attributes`, which a roster runner and a combatant
  // both have, so either can be measured without being in a fight.
  // The roster needs that: a runner's carried injuries are boxes on
  // the same physical track they would fill in combat.
  function physicalTrack(c) {
    return 8 + Math.ceil(((c.attributes || {}).body || 1) / 2);
  }
  function stunTrack(c) {
    return 8 + Math.ceil(((c.attributes || {}).willpower || 1) / 2);
  }

  // The two damages differ in what they are, so they differ in what
  // they leave behind. Physical damage is injury — it rides home on
  // the runner and is still there next week unless somebody treats
  // it. Stun is exhaustion, a beating, the ringing after a stun
  // baton: real inside the fight, gone by the next job.
  function carriedDamage(runner) {
    return Math.max(0, Math.min(runner.wounds || 0, physicalTrack(runner)));
  }

  // Bodies mend on their own, slowly. Body is the attribute that
  // decides how fast: a troll shrugs off a day that puts a wired
  // elf on the bench. Returns boxes closed, so a caller can say so.
  //
  // This is the reason injury is a clock rather than a ratchet —
  // without it every scratch would need a medic, and the roster
  // would only ever get worse. Paying for Medicae buys speed, and
  // speed is what matters when a contract has a window.
  const REST_DAYS_PER_BOX = 4;
  function restDay(runner, daysRested) {
    if (!runner || !runner.wounds) return 0;
    const rate = REST_DAYS_PER_BOX - Math.floor((runner.attributes.body || 1) / 3);
    const every = Math.max(1, rate);
    if (daysRested % every !== 0) return 0;
    const healed = Math.min(runner.wounds, 1);
    runner.wounds -= healed;
    return healed;
  }

  // ── Effects: everything that shifts the numbers ────────────────
  // One layer for every modifier a combatant can be under — posture,
  // cover, a status condition, a spell, a piece of chrome. The
  // combat math never asks "what stance is this?"; it asks "what is
  // the total on this channel?", so adding a new source of modifiers
  // is adding a row here, not editing the resolver.
  //
  // CHANNELS — what an effect can move:
  //   accuracy       dice on the holder's attack pool
  //   defence        dice on the holder's defence pool
  //   power          Power on the holder's attacks (armour gate)
  //   damage         DV on the holder's attacks
  //   armour         the holder's armour rating
  //   soak           dice resisting damage the holder takes
  //   initiative     the holder's place in the order
  //   initiativeDice extra actions per round — the seam Wired
  //                  Reflexes and Improved Reflexes land on
  //
  // FLAGS: `forfeitsAction` skips the holder's action.
  //
  // STACKING: effects sharing an `exclusive` group replace each
  // other, so a combatant has exactly one posture and exactly one
  // cover state. Everything else stacks, capped by `maxStacks`.
  //
  // DURATION: `rounds` counts down at the top of each round;
  // absent means it lasts the whole fight until something clears it.
  const CHANNELS = ["accuracy", "defence", "power", "damage", "armour", "soak", "initiative", "initiativeDice"];

  const EFFECTS = {
    // Postures — what the combatant is doing with their body. The
    // spatial layer replaces these with real geometry; until then
    // they are the choice a player makes about exposure.
    open:        { label: "in the open",   kind: "posture", exclusive: "posture", channels: {} },
    cover:       { label: "behind cover",  kind: "posture", exclusive: "posture", channels: { defence: 2, accuracy: -1 } },
    flanking:    { label: "flanking",      kind: "posture", exclusive: "posture", channels: { defence: -1, accuracy: 2 } },
    fullDefence: { label: "full defence",  kind: "posture", exclusive: "posture", channels: { defence: 4 }, forfeitsAction: true },

    // Conditions — things done TO a combatant. All of these are
    // reachable from the mechanics already in the game: a flashbang
    // blinds, a burst pins, a stun baton rattles.
    prone:      { label: "prone",       kind: "condition", channels: { defence: 2, accuracy: -2 } },
    blinded:    { label: "blinded",     kind: "condition", channels: { accuracy: -4, defence: -2 }, rounds: 2 },
    deafened:   { label: "deafened",    kind: "condition", channels: { initiative: -2 }, rounds: 2 },
    suppressed: { label: "under fire",  kind: "condition", channels: { accuracy: -2, defence: -1 }, rounds: 1 },
    rattled:    { label: "rattled",     kind: "condition", channels: { accuracy: -1 }, rounds: 1, maxStacks: 3 },
    // Injury already costs dice on the ATTACK side through
    // getEffectiveSkills, which every attack pool reads. Defence is
    // raw Agility and never passes through there, so the penalty is
    // applied on that channel only — counting it on both would
    // charge a wounded runner twice for the same wound.
    wounded:    { label: "wounded",     kind: "condition", channels: { defence: 0 }, derived: true },

    // Boons — chrome, magic, drugs. Nothing generates these yet;
    // they are here so the systems that will can plug in without
    // touching the resolver.
    wired:       { label: "wired reflexes",  kind: "boon", channels: { initiative: 4, initiativeDice: 1 } },
    combatSense: { label: "combat sense",    kind: "boon", channels: { defence: 2 } },
    painEditor:  { label: "pain editor",     kind: "boon", channels: { soak: 2 } },
  };

  function effectDef(id) {
    return EFFECTS[id] || null;
  }

  // Put an effect on a combatant. Anything in the same `exclusive`
  // group it already carries comes off first — that is what makes a
  // posture a posture rather than a pile.
  function applyEffect(combatant, id, opts) {
    const def = effectDef(id);
    if (!def) return null;
    opts = opts || {};
    combatant.effects = combatant.effects || [];
    if (def.exclusive) {
      combatant.effects = combatant.effects.filter((e) => effectDef(e.id).exclusive !== def.exclusive);
    }
    const existing = combatant.effects.find((e) => e.id === id);
    if (existing) {
      const cap = def.maxStacks || 1;
      existing.stacks = Math.min(cap, existing.stacks + (opts.stacks || 1));
      // A fresh application refreshes the clock rather than adding
      // to it: being suppressed again means another round pinned,
      // not two rounds banked.
      if (opts.rounds !== undefined || def.rounds !== undefined) {
        existing.roundsLeft = opts.rounds !== undefined ? opts.rounds : def.rounds;
      }
      return existing;
    }
    const active = {
      id: id,
      stacks: Math.min(def.maxStacks || 1, opts.stacks || 1),
      roundsLeft: opts.rounds !== undefined ? opts.rounds : def.rounds,
      source: opts.source || null,
    };
    combatant.effects.push(active);
    return active;
  }

  function clearEffect(combatant, id) {
    if (!combatant.effects) return false;
    const before = combatant.effects.length;
    combatant.effects = combatant.effects.filter((e) => e.id !== id);
    return combatant.effects.length !== before;
  }

  function hasEffect(combatant, id) {
    return !!(combatant.effects || []).some((e) => e.id === id);
  }

  // The current posture's id, for anything that wants to name it.
  function postureOf(combatant) {
    const found = (combatant.effects || []).find((e) => {
      const def = effectDef(e.id);
      return def && def.kind === "posture";
    });
    return found ? found.id : "open";
  }

  // The only question the resolver asks. Sums every active effect on
  // one channel, stacks included.
  function modifier(combatant, channel) {
    let total = 0;
    for (const active of combatant.effects || []) {
      const def = effectDef(active.id);
      if (!def) continue;
      const per = def.channels[channel];
      if (per) total += per * (active.stacks || 1);
      // Injury scales with the boxes actually taken rather than
      // being a fixed step, at the same rate it costs skill dice.
      if (active.id === "wounded" && channel === "defence") {
        total -= Math.floor((combatant.physical || 0) / 3);
      }
    }
    return total;
  }

  function forfeitsAction(combatant) {
    return (combatant.effects || []).some((e) => {
      const def = effectDef(e.id);
      return def && def.forfeitsAction;
    });
  }

  // Count down every timed effect and drop the expired ones. Called
  // once per combatant per round.
  function tickEffects(combatant) {
    if (!combatant.effects) return [];
    const expired = [];
    combatant.effects = combatant.effects.filter((active) => {
      if (active.roundsLeft === undefined) return true;
      active.roundsLeft -= 1;
      if (active.roundsLeft > 0) return true;
      expired.push(active.id);
      return false;
    });
    return expired;
  }

  // What a readout shows. Postures and conditions read differently
  // to a player, so they come back separated and pre-labelled.
  function describeEffects(combatant) {
    return (combatant.effects || []).map((active) => {
      const def = effectDef(active.id);
      return {
        id: active.id,
        label: def.label + (active.stacks > 1 ? " x" + active.stacks : ""),
        kind: def.kind,
        roundsLeft: active.roundsLeft,
        channels: def.channels,
      };
    });
  }

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
    // Matrix. Black ICE burns a decker's own brain — biofeedback,
    // so it fills the STUN track and a hot-sim run can drop the
    // decker in their chair. Attacking it back is a hacking test,
    // not a gun, which is why a wired samurai is no help in a host.
    blackHammer: { label: "Black hammer", skill: "hacking", power: 7, dv: 6, ap: -1, stun: true, modes: ["melee"] },
    dataSpike:   { label: "Data spike",   skill: "hacking", power: 6, dv: 5, ap: -2, stun: true, modes: ["melee"] },
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
      // Base action count. A mundane body gets one; the rest is
      // bought, and anything that buys it does so through the
      // `initiativeDice` channel rather than by writing here.
      baseInitiativeDice: opts.initiativeDice || source.initiativeDice || 1,
      ammo: opts.ammo !== undefined ? opts.ammo : 30,
      // A runner walks in carrying whatever they have not healed.
      // Turning up to a firefight with four boxes already filled is
      // the whole reason a Johnson keeps a bench and pays a medic.
      physical: opts.physical !== undefined ? opts.physical : carriedDamage(source),
      stun: 0,
      down: false,
      effects: [],
    };
    c.physicalMax = physicalTrack(c);
    c.stunMax = stunTrack(c);
    c.physical = Math.min(c.physical, c.physicalMax);
    applyEffect(c, EFFECTS[opts.stance] ? opts.stance : "open");
    // Injury is carried as an effect like anything else, so a
    // readout listing what is on a combatant lists it too.
    if (c.physical > 0) applyEffect(c, "wounded");
    c.stance = postureOf(c);
    for (const id of opts.effects || []) applyEffect(c, id);
    return c;
  }

  // Actions this round: the body's own, plus whatever chrome, magic
  // or drugs are adding. Never below one — being slowed takes your
  // edge, not your turn.
  function actionsFor(c) {
    return Math.max(1, c.baseInitiativeDice + modifier(c, "initiativeDice"));
  }

  // What the fight leaves on the roster. Called for everyone still
  // standing when it ends; the ones who went down are the takedown
  // path's business, since going down is where dying is decided.
  function carryDamageHome(combatant) {
    const runner = combatant.source;
    if (!runner || typeof runner.wounds !== "number") return 0;
    const before = runner.wounds;
    runner.wounds = Math.max(runner.wounds, combatant.physical);
    return runner.wounds - before;
  }

  // Flat, no roll — you can read the whole order before committing.
  // Anything that makes a combatant faster does it on the
  // `initiative` channel, so boosts and penalties share one path.
  function initiativeScore(c) {
    return (c.attributes.agility || 0) + (c.attributes.intelligence || 0) + modifier(c, "initiative");
  }

  // ── The pass structure ─────────────────────────────────────────
  // Pass N contains everyone with at least N initiative dice, in
  // initiative order. Fast units therefore lead EVERY pass rather
  // than clustering at the round's tail, which is what reads as
  // being constantly in motion.
  function buildRound(combat) {
    const alive = combat.combatants.filter((c) => !c.down);
    const maxDice = alive.reduce((m, c) => Math.max(m, actionsFor(c)), 0);
    const order = [];
    for (let pass = 1; pass <= maxDice; pass++) {
      alive
        .filter((c) => actionsFor(c) >= pass)
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
    // Timed effects burn down between rounds, before the order is
    // built — so a combatant whose speed boost just lapsed gets the
    // slower order this round, not next.
    for (const c of combat.combatants) {
      if (c.down) continue;
      for (const id of tickEffects(c)) {
        combat.log.push({ event: "effectEnded", round: combat.round, actor: c.name, effect: id });
      }
      // Injury tracks the boxes, so it goes on when the first one
      // lands and comes off when they are treated between fights.
      if (c.physical > 0) applyEffect(c, "wounded"); else clearEffect(c, "wounded");
      c.stance = postureOf(c);
    }
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
  function attackPool(attacker, weapon) {
    return Math.max(0, MJ.dicePoolFor(attacker.source, weapon.skill, modifier(attacker, "accuracy")));
  }

  function defencePool(defender, mode) {
    const base = (defender.attributes.agility || 0) + modifier(defender, "defence");
    return Math.max(0, base - (MODES[mode] ? MODES[mode].defencePenalty : 0));
  }

  // ── Gate 2 & 3: Penetrate, then Damage ─────────────────────────
  // Armour is reduced by the weapon's AP. If the weapon's Power
  // cannot beat the armour it faces, it does not penetrate — the
  // hit lands and does nothing but noise. Anything that gets
  // through is soaked with Body + remaining armour, one point of
  // damage removed per hit.
  function resolveDamage(combat, attacker, defender, weapon, netHits) {
    const armour = Math.max(0, defender.armour + modifier(defender, "armour") + (weapon.ap || 0));
    const power = (weapon.power || 0) + (attacker.weaponQuality || 0) + modifier(attacker, "power") +
      (weapon.useStrength ? (attacker.attributes.strength || 0) : 0);
    if (power <= armour) {
      return { penetrated: false, armour: armour, power: power, damage: 0 };
    }
    const dv = (weapon.dv || 0) + (attacker.weaponQuality || 0) + netHits + modifier(attacker, "damage") +
      (weapon.useStrength ? Math.floor((attacker.attributes.strength || 0) / 2) : 0);
    const soakPool = Math.max(0, (defender.attributes.body || 0) + armour + modifier(defender, "soak"));
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

    // A posture is chosen with the action, and choosing one replaces
    // whatever posture they were holding. Any other effect on them
    // stays exactly where it is.
    if (choice && choice.stance) applyEffect(attacker, choice.stance);
    attacker.stance = postureOf(attacker);

    // Full defence buys survivability with the entire action.
    if (forfeitsAction(attacker) || !choice || !choice.target) {
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

    const atkDice = MJ.rollDicePool(combat.rng, attackPool(attacker, weapon));
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
      // What each side was under when the shot went out. A readout
      // that can say WHY the numbers were what they were is the
      // difference between a dice log and a fight worth watching.
      actorEffects: describeEffects(attacker).map((e) => e.label),
      targetEffects: describeEffects(target).map((e) => e.label),
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
  MJ.FIRE_MODES = MODES;
  // The modifier layer. Everything that shifts a combat number goes
  // through here, so a new source of modifiers is a row in EFFECTS
  // rather than an edit to the resolver.
  MJ.COMBAT_EFFECTS = EFFECTS;
  MJ.COMBAT_CHANNELS = CHANNELS;
  MJ.COMBAT_POSTURES = Object.keys(EFFECTS).filter((id) => EFFECTS[id].kind === "posture");
  MJ.effectDef = effectDef;
  MJ.applyEffect = applyEffect;
  MJ.clearEffect = clearEffect;
  MJ.hasEffect = hasEffect;
  MJ.effectModifier = modifier;
  MJ.tickEffects = tickEffects;
  MJ.describeEffects = describeEffects;
  MJ.postureOf = postureOf;
  MJ.actionsFor = actionsFor;
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
  MJ.carriedDamage = carriedDamage;
  MJ.carryDamageHome = carryDamageHome;
  MJ.restDay = restDay;
})();
