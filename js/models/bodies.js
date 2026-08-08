/* ============================================================
   Mr. Johnson — models/bodies.js
   EXTRA BODIES: what a conjurer calls up and what a rigger flies.

   ── THE RULE ────────────────────────────────────────────────
   A body is a body. A spirit and a drone are the same SHAPE of
   thing as a runner — attributes, skills, tracks, a position on
   the clock, a turn — because every system downstream already
   knows how to read that shape, and teaching each of them about
   two more kinds of participant is how a codebase rots.

   So these are runner-shaped objects with `bodyKind` on them.
   The party column, the run clock, the option menu, the
   witness check and the fight all pick them up without being
   told anything new. What they are NOT is runners: no contract,
   no karma, no market, no upkeep, and they do not survive the
   run.

   ── SERVICES ────────────────────────────────────────────────
   A summoned spirit owes a NUMBER OF SERVICES and each one is
   an action. Not a duration, not a buff — the crew gets to do
   MORE THINGS in the same beat, which is width rather than
   power, and it is why a Johnson wants one without it being a
   straight upgrade. Spent to zero, the spirit goes. Unspent at
   the end of the run, it goes anyway: nothing here is kept.

   models/helpers.js already owns the binding — the Lattice
   circuit, the Drain, the tasks-owed model. This is the layer
   that turns what it produces into something that can stand in
   a room and take a turn.

   ── RIGGERS ─────────────────────────────────────────────────
   WARM JUMP: the rigger flies a drone by remote and stays
   themselves. They are two bodies and both act.

   HOT JUMP: the rigger goes into the drone. Their own body
   drops where it stands, inert, and it is A LIABILITY — it can
   be found and it can be hurt, and it does not act until they
   come back out. The drone is their primary body for the
   duration.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── The shared shape ───────────────────────────────────────────
  // Everything a system downstream reads off a runner, present and
  // correct, so nothing has to ask what kind of thing it is holding.
  let bodySeq = 0;
  function makeBody(spec) {
    bodySeq += 1;
    return {
      identity: { handle: spec.handle, metatype: spec.metatype || null },
      classification: {
        family: spec.family || "construct",
        focusId: spec.focusId || null,
        focusLabel: spec.focusLabel || spec.handle,
        focusKeySkill: spec.keySkill || null,
        origin: spec.origin || "construct",
        presentation: null,
        presentationLabel: spec.presentationLabel || null,
        spellsKnown: null, powersKnown: null, spellQueue: null,
        disciplineLabel: null, trueArchetype: null,
        skillTiers: { primary: spec.keySkill || null, secondary: [], tertiary: [], overflow: [] },
      },
      attributes: spec.attributes,
      essence: { current: 6, max: 6 },
      skills: spec.skills || {},
      wounds: 0,
      stun: 0,
      restedDays: 0,
      karma: 0,
      attributeFund: 0,
      gear: [],
      // Declared, not carried — see combatLoadoutFor's note.
      loadout: spec.loadout,
      // What every reader keys off to know this is not a person.
      bodyKind: spec.bodyKind,
      tacticalId: spec.bodyKind + ":" + bodySeq,
      speed: spec.speed,
      boundTo: spec.boundTo || null,
      // Services owed. Null on a drone: a machine does not owe you
      // favours, it runs until it is broken or you land it.
      services: spec.services === undefined ? null : spec.services,
      servicesSpent: 0,
      market: { state: "unwatched", hired: null, phase: null, daysOnMarket: 0, shelfDaysRemaining: 0 },
    };
  }

  const isExtraBody = (b) => !!(b && b.bodyKind);

  function servicesLeft(b) {
    if (!b || b.services === null || b.services === undefined) return Infinity;
    return Math.max(0, b.services - b.servicesSpent);
  }

  // Spend one. Returns whether the body is still owed to you after —
  // a spirit that has run out is released on the spot, which is what
  // "limited by services" has to mean or the limit is decorative.
  function spendService(run, b) {
    if (!isExtraBody(b) || servicesLeft(b) === Infinity) return true;
    b.servicesSpent += 1;
    if (servicesLeft(b) > 0) return true;
    release(run, b, "its last service is spent");
    return false;
  }

  // ── The four elements ──────────────────────────────────────────
  // Kept deliberately to four, by ruling. Force sets the scale and
  // the element decides the SHAPE of it — one is a wall, one is a
  // knife, one mends, one is quick. Everything is derived from Force
  // so a Force 6 spirit is a Force 6 spirit whatever it is made of.
  const ELEMENTS = {
    earth: {
      label: "Earth Elemental", blurb: "slow, and very hard to move",
      attrs: (f) => ({ body: f + 2, agility: Math.max(1, f - 2), strength: f + 2,
                       willpower: f, intelligence: Math.max(1, f - 1), charisma: Math.max(1, f - 2), magic: f }),
      skills: (f) => ({ melee: f, athletics: Math.max(1, f - 2), perception: Math.max(1, f - 1) }),
      loadout: (f) => ({ weaponId: "unarmed", weaponQuality: Math.ceil(f / 3), weaponLabel: "stone fists", armour: f + 2 }),
      speed: (f) => Math.max(1, Math.floor(f / 2)),
    },
    fire: {
      label: "Fire Elemental", blurb: "burns what it touches, and does not last",
      attrs: (f) => ({ body: Math.max(1, f - 1), agility: f + 1, strength: f,
                       willpower: f, intelligence: Math.max(1, f - 1), charisma: f, magic: f }),
      skills: (f) => ({ melee: f + 1, athletics: f, perception: Math.max(1, f - 1) }),
      loadout: (f) => ({ weaponId: "unarmed", weaponQuality: Math.ceil(f / 2), weaponLabel: "burning hands", armour: Math.max(0, f - 2) }),
      speed: (f) => Math.max(2, f),
    },
    water: {
      label: "Water Elemental", blurb: "mends, smothers, and gets in everywhere",
      attrs: (f) => ({ body: f, agility: f, strength: Math.max(1, f - 1),
                       willpower: f + 1, intelligence: f, charisma: f, magic: f }),
      skills: (f) => ({ medicine: f + 1, melee: Math.max(1, f - 1), stealth: f, perception: f }),
      loadout: (f) => ({ weaponId: "unarmed", weaponQuality: 0, weaponLabel: "crushing weight", armour: f }),
      speed: (f) => Math.max(2, f - 1),
    },
    wind: {
      label: "Air Elemental", blurb: "there before you have finished looking",
      attrs: (f) => ({ body: Math.max(1, f - 2), agility: f + 3, strength: Math.max(1, f - 2),
                       willpower: f, intelligence: f, charisma: f, magic: f }),
      skills: (f) => ({ stealth: f + 1, athletics: f + 1, perception: f, melee: Math.max(1, f - 1) }),
      loadout: (f) => ({ weaponId: "unarmed", weaponQuality: 0, weaponLabel: "battering wind", armour: Math.max(0, f - 3) }),
      speed: (f) => f + 2,
    },
  };
  const ELEMENT_IDS = Object.keys(ELEMENTS);

  // Build the body a successful summoning produced. `services` is
  // what the summoner earned, never a flat number — that is the whole
  // reason the roll matters.
  function makeSpirit(element, force, services, conjurer) {
    const e = ELEMENTS[element] || ELEMENTS.earth;
    const f = Math.max(1, force);
    return makeBody({
      handle: e.label + " (F" + f + ")",
      bodyKind: "spirit",
      family: "spirit",
      focusLabel: e.label,
      presentationLabel: e.label,
      keySkill: element === "water" ? "medicine" : element === "wind" ? "stealth" : "melee",
      origin: "magic",
      attributes: e.attrs(f),
      skills: e.skills(f),
      loadout: e.loadout(f),
      speed: e.speed(f),
      services: Math.max(1, services),
      boundTo: conjurer,
      element: element,
      force: f,
    });
  }

  // ── The four drone roles ───────────────────────────────────────
  // A drone is a MACHINE: it does not owe services and it does not
  // evaporate, it runs until it is broken or landed. What it does is
  // decided at purchase, not on the night — which is the difference
  // between a rigger's planning and a conjurer's.
  const DRONE_ROLES = {
    attack: {
      label: "Assault Drone", blurb: "a gun that walks",
      attrs: (t) => ({ body: t + 2, agility: t + 1, strength: t, willpower: 1, intelligence: t, charisma: 1, magic: 0 }),
      skills: (t) => ({ firearms: t + 1, perception: t }),
      loadout: (t) => ({ weaponId: t >= 5 ? "rifle" : "smg", weaponQuality: Math.ceil(t / 3), weaponLabel: "mounted gun", armour: t }),
      speed: (t) => Math.max(2, t),
    },
    defense: {
      label: "Bulwark Drone", blurb: "stands in front of things",
      attrs: (t) => ({ body: t + 4, agility: Math.max(1, t - 1), strength: t + 2, willpower: 1, intelligence: t, charisma: 1, magic: 0 }),
      skills: (t) => ({ melee: t, firearms: Math.max(1, t - 1), perception: t }),
      loadout: (t) => ({ weaponId: "shockBaton", weaponQuality: 0, weaponLabel: "shock arm", armour: t + 3 }),
      speed: (t) => Math.max(1, t - 1),
    },
    medic: {
      label: "Medevac Drone", blurb: "gets to them before you can",
      attrs: (t) => ({ body: t, agility: t + 1, strength: t, willpower: 1, intelligence: t + 1, charisma: 1, magic: 0 }),
      skills: (t) => ({ medicine: t + 2, perception: t }),
      loadout: (t) => ({ weaponId: "unarmed", weaponQuality: 0, weaponLabel: "manipulator", armour: t }),
      speed: (t) => Math.max(2, t + 1),
    },
    heavy: {
      label: "Sunder Drone", blurb: "for when one of them is not the problem",
      attrs: (t) => ({ body: t + 3, agility: Math.max(1, t - 1), strength: t + 3, willpower: 1, intelligence: t, charisma: 1, magic: 0 }),
      skills: (t) => ({ heavyWeapons: t + 1, demolitions: t, perception: Math.max(1, t - 1) }),
      loadout: (t) => ({ weaponId: "doorknocker", weaponQuality: Math.ceil(t / 3), weaponLabel: "breaching gun", armour: t + 1 }),
      speed: (t) => Math.max(1, t - 1),
    },
  };
  const DRONE_ROLE_IDS = Object.keys(DRONE_ROLES);

  function makeDrone(role, tier, rigger) {
    const d = DRONE_ROLES[role] || DRONE_ROLES.attack;
    const t = Math.max(1, tier);
    return makeBody({
      handle: d.label + " T" + t,
      bodyKind: "drone",
      family: "drone",
      focusLabel: d.label,
      presentationLabel: d.label,
      keySkill: role === "medic" ? "medicine" : role === "heavy" ? "heavyWeapons" : "firearms",
      origin: "construct",
      attributes: d.attrs(t),
      skills: d.skills(t),
      loadout: d.loadout(t),
      speed: d.speed(t),
      boundTo: rigger,
      role: role,
      tier: t,
    });
  }

  // ── Joining and leaving the formation ──────────────────────────
  function join(run, body) {
    run.extraBodies = run.extraBodies || [];
    if (run.extraBodies.indexOf(body) === -1) run.extraBodies.push(body);
    // The clock has to be told there is somebody new to seat and to
    // order; it re-derives both from the body list.
    if (MJ.tactical && run.tactical) MJ.tactical.reseat(run);
    return body;
  }

  function release(run, body, why) {
    if (!run.extraBodies) return;
    const i = run.extraBodies.indexOf(body);
    if (i !== -1) run.extraBodies.splice(i, 1);
    body.released = why || "released";
    // A body that leaves mid-run must leave the ORDER too, or the
    // clock hands a turn to something that is not there any more.
    if (MJ.tactical && run.tactical) MJ.tactical.reseat(run);
  }

  // NOTHING IS KEPT. A spirit goes when the run ends whether or not
  // its services are spent, and a drone that was flying comes home —
  // the rigger's body wakes up wherever it was left.
  function releaseAll(run) {
    for (const b of (run.extraBodies || []).slice()) release(run, b, "the run ended");
    for (const r of run.runners || []) if (r.jump) endJump(run, r);
    run.extraBodies = [];
  }

  // ── Jumping ────────────────────────────────────────────────────
  // WARM is remote: two bodies, both act, and the rigger is standing
  // there in person the whole time. HOT is presence: the rigger's own
  // body drops where it stands and does nothing until they come back,
  // and while they are gone it is exactly as findable and as
  // breakable as any other body in the room.
  function jumpIn(run, rigger, drone, mode) {
    if (!rigger || !drone || drone.bodyKind !== "drone") {
      return { ok: false, error: "nothing to jump into" };
    }
    if ((MJ.getEffectiveSkills(rigger).rigging || 0) <= 0) {
      return { ok: false, error: "untrained in rigging" };
    }
    if (rigger.jump) return { ok: false, error: "already flying one" };
    const hot = mode === "hot";
    rigger.jump = { drone: drone, hot: hot };
    drone.pilot = rigger;
    // A jumped drone answers to the rigger's own skill — that is the
    // point of being in it rather than beside it — and hot beats warm
    // because there is no lag between wanting and doing.
    const rig = MJ.getEffectiveSkills(rigger).rigging || 0;
    drone.jumpBonus = hot ? Math.ceil(rig / 2) : Math.ceil(rig / 3);
    if (hot) rigger.slumped = true;
    if (MJ.tactical && run.tactical) MJ.tactical.reseat(run);
    return { ok: true, hot: hot, bonus: drone.jumpBonus };
  }

  function endJump(run, rigger) {
    if (!rigger || !rigger.jump) return { ok: false, error: "not flying anything" };
    const drone = rigger.jump.drone;
    if (drone) { drone.pilot = null; drone.jumpBonus = 0; }
    rigger.jump = null;
    rigger.slumped = false;
    if (MJ.tactical && run.tactical) MJ.tactical.reseat(run);
    return { ok: true };
  }

  // A slumped body is present, findable and breakable — it simply
  // does not act. Every "can this one do something" check reads this.
  const canAct = (b) => !!b && !b.slumped && !b.released;

  MJ.bodies = {
    ELEMENTS: ELEMENTS,
    ELEMENT_IDS: ELEMENT_IDS,
    DRONE_ROLES: DRONE_ROLES,
    DRONE_ROLE_IDS: DRONE_ROLE_IDS,
    makeBody: makeBody,
    makeSpirit: makeSpirit,
    makeDrone: makeDrone,
    isExtraBody: isExtraBody,
    servicesLeft: servicesLeft,
    spendService: spendService,
    join: join,
    release: release,
    releaseAll: releaseAll,
    jumpIn: jumpIn,
    endJump: endJump,
    canAct: canAct,
  };
})();
