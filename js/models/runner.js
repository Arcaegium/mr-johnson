/* ============================================================
   Mr. Johnson — models/runner.js
   The runner record: generation from a seed, and the
   Generalist/Specialist shape-vs-label-vs-price system
   (current understanding §04 / §09).

   Core rule this file implements:
     - Every runner has a TRUE ARCHETYPE (Specialist or
       Generalist) that shapes their actual skill spread.
       This is internal truth, not shown directly to the player.
     - Every runner also has a DISCIPLINE LABEL — the visible
       dossier line the market prices them by. It matches the
       true archetype 80% of the time. The other 20% splits
       evenly: claiming more focused than they are (label
       Specialist, true Generalist — the "hype", overpriced),
       or claiming broader than they are (label Generalist,
       true Specialist — the "hidden gem", underpriced).
     - Price is DERIVED, never stored: it's computed by
       applying the DISCIPLINE LABEL's lens to the runner's
       ACTUAL visible skills. The lens is what can be wrong;
       the skills themselves are always fully visible and true.

   Usage:
     const r = MJ.generateRunner(rng, { family: "fighter" });
     MJ.getEffectiveSkills(r);      // skills after wound penalty
     MJ.computePrice(r);            // derived nuyen price
     MJ.describeDiscipline(r);      // "Generalist" / "Specialist: Stealth"
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // ── The 21-skill registry (current understanding §09 + the gated-skill split) ─
  // Every skill maps to real verbs elsewhere in the design; this
  // list is the canonical set every runner's skill map is keyed by.
  const SKILLS = [
    "firearms", "heavyWeapons", "marksmanship", "melee", "demolitions",
    "stealth", "athletics", "medicine", "leadership", "intimidation", "con", "larceny",
    "computer", "hacking", "electronics", "rigging", "perception",
    "sorcery", "conjuring", "enchanting", "assensing",
  ];

  // ── Every skill's linked attribute ────────────────────────────
  // The dice pool is Skill + Attribute. Mapped off the tabletop's
  // own links, collapsed where our attribute set is narrower than
  // the source's: Reaction folds into Agility and Intuition into
  // Intelligence (the current understanding fixes both by defining Initiative as
  // Agility + Intelligence), and Logic joins Intuition there.
  //
  // Strength is NOT folded into Body. No attack roll is Strength-
  // linked in the source — melee and heavy weapons roll Agility and
  // Strength feeds damage — but with no Strength at all, Body ends
  // up doing the attack roll, the damage track AND the soak, and
  // melee Power goes flat so a troll and an elf hit identically
  // with the same knife.
  //
  // Body and Willpower deliberately carry NO skills. They are the
  // two pure defensive stats: physical track and stun track, soak,
  // Drain, Full Defense.
  const SKILL_ATTRIBUTE = {
    firearms: "agility", marksmanship: "agility", stealth: "agility",
    larceny: "agility", rigging: "agility",

    heavyWeapons: "strength", melee: "strength", athletics: "strength",

    demolitions: "intelligence", medicine: "intelligence", computer: "intelligence",
    hacking: "intelligence", electronics: "intelligence",
    // The source links Perception to Intuition; Intuition folded into
    // Intelligence when the attribute set was collapsed, so it lands
    // here with the rest of the noticing skills.
    perception: "intelligence",

    con: "charisma", leadership: "charisma", intimidation: "charisma",

    sorcery: "magic", conjuring: "magic", enchanting: "magic", assensing: "magic",
  };

  function attributeFor(skillId) {
    return SKILL_ATTRIBUTE[skillId] || null;
  }

  // ── Skill gates: some skills require a matching family ────────
  // Most skills are universal — anyone can pick them up. A handful
  // are genuinely exclusive to the family that can actually perform
  // them: a mage can write code on a keyboard (computer stays
  // universal) but can't jack in and hack live (hacking is decker-
  // only); a technician can maintain a maglock or a drone chassis
  // (electronics stays universal) but can't jump in and pilot one
  // (rigging is rigger-only); nobody casts, assenses, summons, or
  // enchants without being Awakened (mage-only, all four). This is
  // a family gate, not just a Magic-attribute gate — an adept has
  // Magic but isn't a spellcaster, so adept-origin fighters still
  // don't qualify for the four magic skills.
  // CASTING IS GATED BY FAMILY. PERCEIVING IS GATED BY BEING AWAKENED.
  // These are not the same rule, and running them together left every
  // adept in the game blind on a plane they exist on. Sorcery,
  // conjuring and enchanting are things you DO with magic and are
  // rightly mage-only — an adept has a spark, not a spellbook.
  // Assensing is not one of them: it is astral PERCEPTION, and it got
  // swept in only because it was filed under "the four magic skills".
  // Anyone Awakened can open their eyes.
  const SKILL_GATES = {
    sorcery: "mage",
    conjuring: "mage",
    enchanting: "mage",
    assensing: "awakened",
    hacking: "decker",
    rigging: "rigger",
  };

  // `origin` is only consulted by the awakened gate. Callers who pass
  // two arguments get the old family-only behaviour, which for every
  // other gate is the same answer.
  function isSkillEligible(skillId, family, origin) {
    const gate = SKILL_GATES[skillId];
    if (!gate) return true;
    if (gate === "awakened") return family === "mage" || origin === "magic";
    return gate === family;
  }

  // Awakened: carries a spark at all. A mage casts with it, an adept
  // burns it on their own body — both of them can see with it.
  function isAwakened(runner) {
    const c = runner && runner.classification;
    return !!c && (c.family === "mage" || c.origin === "magic");
  }

  // ── Metatypes: starting deltas AND lifetime ceilings ──────────
  // `mods` shift the opening roll; `max` is the wall that runner can
  // never grow past. The ceiling is the real mechanical identity —
  // a troll out-lifts a human permanently, not merely on average at
  // generation — and it is what makes the metatype line on a
  // dossier worth reading at hire time, because it tells you where
  // that runner's career ends. Numbers follow the tabletop's own
  // metatype maxima, collapsed to our attribute set.
  //
  // `weight` is population share. Humans are clearly dominant and
  // orks are the clear second, as the source has it; the rest are
  // real minorities without being background-noise rarities.
  const METATYPES = {
    human: {
      label: "Human", weight: 50, mods: {},
      max: { body: 6, agility: 6, strength: 6, willpower: 6, intelligence: 6, charisma: 6 },
    },
    elf: {
      label: "Elf", weight: 10, mods: { agility: 1, charisma: 1, body: -1 },
      max: { body: 6, agility: 7, strength: 6, willpower: 6, intelligence: 6, charisma: 8 },
    },
    dwarf: {
      label: "Dwarf", weight: 10, mods: { body: 1, strength: 1, willpower: 1, agility: -1 },
      max: { body: 8, agility: 6, strength: 8, willpower: 10, intelligence: 6, charisma: 6 },
    },
    ork: {
      label: "Ork", weight: 20, mods: { body: 2, strength: 1, charisma: -1, intelligence: -1 },
      max: { body: 9, agility: 6, strength: 8, willpower: 6, intelligence: 5, charisma: 6 },
    },
    troll: {
      label: "Troll", weight: 10, mods: { body: 3, strength: 2, agility: -1, intelligence: -1, charisma: -2 },
      max: { body: 10, agility: 5, strength: 10, willpower: 6, intelligence: 5, charisma: 4 },
    },
  };
  const METATYPE_IDS = Object.keys(METATYPES);
  const MAGIC_MAX = 6; // Essence caps it further; see applyMagic/growth
  const WOUNDS_PER_DIE = 3; // boxes of physical damage per -1 die, everywhere

  function attributeCeiling(runner, attrId) {
    if (attrId === "magic") {
      // essence is { current, max } — reading it as a bare number
      // yielded NaN, and `rating >= NaN` is false, so Magic grew
      // without any ceiling at all until this was caught.
      const ess = runner.essence && typeof runner.essence.current === "number"
        ? runner.essence.current : MAGIC_MAX;
      return Math.min(MAGIC_MAX, Math.floor(ess));
    }
    const meta = METATYPES[runner.identity.metatype];
    return (meta && meta.max[attrId]) || 6;
  }

  function pickMetatype(rng) {
    return rng.weighted(METATYPE_IDS.map((id) => ({ item: id, weight: METATYPES[id].weight })));
  }

  // ── Focus templates: family, key skill, allowed origins ───────
  // Origins (cyber/magic/infected/mundane) live per-focus below —
  // cyber: mundane, chrome, Essence starts partially spent; magic:
  // adept/mage, full Essence kept, Magic attribute granted; infected:
  // HMHVV-flavored, mundane stats, distinct flavor only.
  // This table is the whole "systems are expensive, rows are
  // cheap" bet — every archetype in the current understanding is just a row here.
  const FOCUSES = [
    // Fighters
    { id: "heavyWeapons", label: "Heavy Weapons", family: "fighter", keySkill: "heavyWeapons", origins: ["cyber", "magic"] },
    { id: "demolitions",  label: "Demolitions",   family: "fighter", keySkill: "demolitions",  origins: ["cyber", "magic"] },
    { id: "stealth",      label: "Stealth",       family: "fighter", keySkill: "stealth",      origins: ["cyber", "magic", "infected"] },
    { id: "melee",        label: "Melee",         family: "fighter", keySkill: "melee",        origins: ["cyber", "magic"] },
    { id: "marksman",     label: "Marksman",      family: "fighter", keySkill: "marksmanship", origins: ["cyber", "magic"] },
    { id: "tank",         label: "Tank",          family: "fighter", keySkill: "intimidation", origins: ["cyber", "magic"] },
    { id: "combatMedic",  label: "Combat Medic",  family: "fighter", keySkill: "medicine",     origins: ["cyber", "mundane"] },
    { id: "streetDoc",    label: "Street Doc",    family: "fighter", keySkill: "medicine",     origins: ["mundane"] },
    // Face family — three distinct social verbs, not one "presence".
    // Deception, command, and threat are different jobs that different
    // runners are good at; "presence" was the Face's whole remit and
    // so could never be a specialisation.
    { id: "face",         label: "Face",          family: "face",    keySkill: "con",          origins: ["mundane", "magic", "infected"] },
    { id: "leader",       label: "Leader",        family: "face",    keySkill: "leadership",   origins: ["mundane", "cyber"] },
    // Decker (one archetype, tilted by affinity — see generateRunner)
    { id: "decker",       label: "Decker",        family: "decker",  keySkill: "hacking",      origins: ["cyber", "mundane"] },
    // Rigger (one archetype, drone class defines the verb elsewhere)
    { id: "rigger",       label: "Rigger",        family: "rigger",  keySkill: "rigging",      origins: ["cyber", "mundane"] },
    // Mages — spell categories. Most lean on Sorcery; Conjuring and
    // Enchanting are their own skills per §04/§09.
    { id: "combatMage",      label: "Combat",      family: "mage", keySkill: "sorcery",    origins: ["magic"] },
    { id: "detectionMage",   label: "Detection",   family: "mage", keySkill: "assensing",  origins: ["magic"] },
    { id: "healthMage",      label: "Health",      family: "mage", keySkill: "sorcery",    origins: ["magic"] },
    { id: "illusionMage",    label: "Illusion",    family: "mage", keySkill: "sorcery",    origins: ["magic"] },
    { id: "manipulationMage",label: "Manipulation",family: "mage", keySkill: "sorcery",    origins: ["magic"] },
    { id: "conjuringMage",   label: "Conjuring",   family: "mage", keySkill: "conjuring",  origins: ["magic"] },
    { id: "enchantingMage",  label: "Enchanting",  family: "mage", keySkill: "enchanting", origins: ["magic"] },
  ];

  function focusById(id) {
    return FOCUSES.find((f) => f.id === id);
  }

  // ── Market composition: how often the Awakened turn up ────────
  // Two dials, and they only work together. Every mage focus is
  // Awakened by construction, so the mage focuses' share of the
  // focus draw sets a FLOOR on Awakened frequency before origin is
  // ever consulted — with a flat draw that floor was already ~37%,
  // which is why weighting origin alone would have changed nothing.
  //
  // Target: Awakened about a third of the market — ~25% mages and
  // ~8% physical adepts. Far above the setting's ~1% baseline,
  // because a runner market is self-selected for outliers; far
  // below an even split, because humans have to read as the norm.
  const MAGE_FOCUS_WEIGHT = 4;
  const OTHER_FOCUS_WEIGHT = 7;   // 7 mage x4 = 28 vs 12 other x7 = 84 -> mages 25%
  const ORIGIN_WEIGHT = { mundane: 40, cyber: 40, infected: 11, magic: 9 };

  function focusWeight(focus) {
    return focus.family === "mage" ? MAGE_FOCUS_WEIGHT : OTHER_FOCUS_WEIGHT;
  }

  function pickFocus(rng, candidates) {
    return rng.weighted(candidates.map((f) => ({ item: f, weight: focusWeight(f) })));
  }

  // Magic sits low against mundane/cyber, so an adept is a genuine
  // find rather than a coin flip on every fighter.
  function pickOrigin(rng, focus) {
    return rng.weighted(focus.origins.map((o) => ({ item: o, weight: ORIGIN_WEIGHT[o] || 1 })));
  }

  // ── Archetype skill lists — the primary/secondary/tertiary heatmap ─
  // Each archetype's list[0] is always its keySkill (the Primary).
  // The rest of list[] is the archetype's natural pool: at generation,
  // that pool is shuffled and the first N (specialistSecondary or
  // generalistSecondary, by true archetype) become Secondary; whatever
  // remains is Tertiary. Skills outside the list entirely are Overflow
  // — every universal skill this runner's family is eligible for
  // (SKILL_GATES) but that isn't part of this archetype's natural
  // shape. Primary/Secondary get real starting ranks; Tertiary and
  // Overflow start at 0 and are only reached through karma growth
  // (growRunner) — that's what lets a stalled specialist visibly
  // broaden over a career instead of every skill being pre-rolled.
  // List sizes and secondary counts were balanced against the skill-
  // weight rubric (verb breadth × encounter frequency × pillar
  // centrality) so no archetype's list badly out- or under-classes
  // another in total opportunity to matter, even though list sizes
  // differ — that asymmetry mirrors how the pillars themselves are
  // shaped (meatspace: many narrow skills; Matrix/Astral: few skills
  // that each carry more weight).
  const ARCHETYPE_SKILLS = {
    heavyWeapons:     { list: ["heavyWeapons", "firearms", "demolitions", "marksmanship", "athletics"], specialistSecondary: 1, generalistSecondary: 3 },
    demolitions:      { list: ["demolitions", "firearms", "electronics", "athletics", "heavyWeapons"],   specialistSecondary: 1, generalistSecondary: 3 },
    stealth:          { list: ["stealth", "perception", "firearms", "larceny", "athletics"],                  specialistSecondary: 1, generalistSecondary: 3 },
    melee:            { list: ["melee", "athletics", "firearms", "intimidation", "stealth"],             specialistSecondary: 1, generalistSecondary: 3 },
    marksman:         { list: ["marksmanship", "perception", "firearms", "stealth"],                      specialistSecondary: 1, generalistSecondary: 2 },
    tank:             { list: ["intimidation", "melee", "firearms", "athletics", "heavyWeapons"],         specialistSecondary: 1, generalistSecondary: 3 },
    combatMedic:      { list: ["medicine", "firearms", "melee", "athletics", "stealth"],                  specialistSecondary: 1, generalistSecondary: 3 },
    streetDoc:        { list: ["medicine", "electronics", "leadership", "con"],                           specialistSecondary: 1, generalistSecondary: 2 },
    face:             { list: ["con", "leadership", "intimidation", "larceny"],                           specialistSecondary: 1, generalistSecondary: 2 },
    leader:           { list: ["leadership", "con", "intimidation", "firearms"],                          specialistSecondary: 1, generalistSecondary: 2 },
    decker:           { list: ["hacking", "computer", "electronics", "stealth", "larceny"],               specialistSecondary: 1, generalistSecondary: 3 },
    rigger:           { list: ["rigging", "electronics", "computer", "perception", "firearms"],            specialistSecondary: 1, generalistSecondary: 3 },
    combatMage:       { list: ["sorcery", "assensing", "athletics", "stealth", "firearms"],               specialistSecondary: 1, generalistSecondary: 3 },
    detectionMage:    { list: ["assensing", "perception", "sorcery", "stealth"],                           specialistSecondary: 1, generalistSecondary: 2 },
    healthMage:       { list: ["sorcery", "assensing", "enchanting", "leadership"],                       specialistSecondary: 1, generalistSecondary: 2 },
    illusionMage:     { list: ["sorcery", "con", "stealth", "intimidation"],                              specialistSecondary: 1, generalistSecondary: 2 },
    manipulationMage: { list: ["sorcery", "con", "leadership", "assensing"],                              specialistSecondary: 1, generalistSecondary: 2 },
    conjuringMage:    { list: ["conjuring", "sorcery", "assensing", "enchanting"],                         specialistSecondary: 1, generalistSecondary: 2 },
    enchantingMage:   { list: ["enchanting", "sorcery", "conjuring", "assensing"],                         specialistSecondary: 1, generalistSecondary: 2 },
  };

  // Rolls, for one specific runner, which of their archetype's list
  // skills land in Secondary vs Tertiary, plus the Overflow pool
  // (every gate-eligible skill outside the list). This is rolled once
  // at generation and stored on the runner — it's an identity trait,
  // not something growth re-rolls.
  // `chosen` — the player's own secondaries, from character creation.
  // THE PRIMARY IS NEVER A CHOICE: it is `entry.list[0]`, which IS
  // `focus.keySkill`, which is what makes a Marksman a Marksman.
  // Letting it be picked would let the class identifier lie, and that
  // is the one thing generation may never do. Picking the FOCUS is
  // picking the primary; they are the same decision said twice.
  //
  // Anything unpicked, or picked illegally, falls back to the roll —
  // a half-specified runner is still a whole runner, and creation must
  // never be able to produce a shape generation could not.
  function buildSkillTiers(rng, focus, trueArchetype, origin, chosen) {
    const entry = ARCHETYPE_SKILLS[focus.id];
    const primary = entry.list[0];
    const secondaryCount = trueArchetype === "specialist" ? entry.specialistSecondary : entry.generalistSecondary;
    const rest = entry.list.slice(1);
    let secondary;
    const legal = (chosen || []).filter((s, i, a) => rest.indexOf(s) !== -1 && a.indexOf(s) === i);
    if (legal.length === secondaryCount) {
      secondary = legal;
    } else {
      // Honour what was legally picked, roll for the remainder — so a
      // partial choice is still the player's choice as far as it went.
      const pool = rng.shuffle(rest.filter((s) => legal.indexOf(s) === -1));
      secondary = legal.slice(0, secondaryCount)
        .concat(pool.slice(0, Math.max(0, secondaryCount - legal.length)));
    }
    const tertiary = rest.filter((s) => secondary.indexOf(s) === -1);
    const overflow = SKILLS.filter(
      (s) => !entry.list.includes(s) && isSkillEligible(s, focus.family, origin)
    );
    return { primary, secondary, tertiary, overflow };
  }

  // ── Flavor pools ───────────────────────────────────────────────
  // Deliberately small placeholders, and deliberately NOT wired to
  // any mechanical value — personality/aims text stays inert per
  // the design rule (§03): the only legible market signal is the
  // Discipline line, never the flavor text.
  // ── Street handles ─────────────────────────────────────────────
  // A big base pool, dealt per-universe from a shuffle-bag (below)
  // so the same base can't recur until the whole pool is exhausted —
  // "Static_32" and "Static_42" in one universe is brand confusion,
  // and the bag makes it structurally near-impossible. Per-runner
  // styling (leet substitutions, suffix shapes) varies on top.
  const HANDLES = [
    "Chrome", "Dodger", "Wraith", "Static", "Copper", "Halcyon", "Torque",
    "Marrow", "Ledger", "Vex", "Quill", "Ballast", "Ember", "Thistle",
    "Grit", "Nickel", "Ferro", "Lumen", "Ratchet", "Sable",
    "Anvil", "Aria", "Ash", "Aspect", "Axiom", "Bishop", "Blindside",
    "Bolt", "Breaker", "Brick", "Cache", "Cadence", "Canto", "Cinder",
    "Cipher", "Clank", "Cobalt", "Comet", "Crank", "Creed", "Crow",
    "Dazzle", "Delta", "Dice", "Diesel", "Dirge", "Draft", "Drift",
    "Echo", "Eclipse", "Edge", "Enigma", "Fade", "Fathom", "Feral",
    "Fidget", "Flint", "Fracture", "Frost", "Fuse", "Gale", "Gauge",
    "Ghostlight", "Gimbal", "Glimmer", "Gloam", "Gouge", "Grackle",
    "Grifter", "Gutter", "Half-Life", "Hallow", "Harrow", "Hatchet",
    "Havoc", "Haze", "Hex", "Hollow", "Hush", "Ion", "Jackal", "Jinx",
    "Karma", "Keel", "Kindle", "Knuckle", "Lacuna", "Larkspur", "Latch",
    "Lattice", "Locus", "Lowdown", "Lynx", "Mantis", "Mercury", "Mirage",
    "Miter", "Mongoose", "Monsoon", "Moth", "Muffler", "Needle", "Neon",
    "Nightjar", "Nimble", "Nocturne", "Null", "Ochre", "Onyx", "Oracle",
    "Osprey", "Paradox", "Parallax", "Patch", "Pewter", "Phantom",
    "Pincer", "Pivot", "Prism", "Prowl", "Pulse", "Quarrel", "Quartz",
    "Quicksilver", "Ramble", "Rasp", "Raven", "Razor", "Redline",
    "Relay", "Requiem", "Ricochet", "Riddle", "Rime", "Ripcord",
    "Rook", "Rumor", "Rust", "Saffron", "Scatter", "Sepia", "Shale",
    "Shard", "Shiver", "Signal", "Sixgun", "Sketch", "Slate", "Slink",
    "Smolder", "Snare", "Solder", "Sonnet", "Spindle", "Splice",
    "Stanza", "Stiletto", "Strobe", "Switch", "Sythe", "Tangent",
    "Tarnish", "Tempo", "Tether", "Tinder", "Trace", "Trellis",
    "Tremor", "Trick", "Umbra", "Undertow", "Valve", "Vandal",
    "Vapor", "Vector", "Verdict", "Vesper", "Vice", "Vigil", "Volt",
    "Warden", "Whisper", "Wick", "Widget", "Willow", "Wisp", "Zephyr",
  ];

  // Leet styling: one or two substitutions, applied sparingly so
  // handles stay readable ("St4tic", not "5747!c").
  const LEET_MAP = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7" };

  function leetify(base, rng) {
    const candidates = [];
    for (let i = 0; i < base.length; i++) {
      if (LEET_MAP[base[i].toLowerCase()]) candidates.push(i);
    }
    if (candidates.length === 0) return base;
    const swaps = rng.shuffle(candidates).slice(0, rng.int(1, Math.min(2, candidates.length)));
    let out = "";
    for (let i = 0; i < base.length; i++) {
      out += swaps.indexOf(i) !== -1 ? LEET_MAP[base[i].toLowerCase()] : base[i];
    }
    return out;
  }

  // The universe deals base handles from index-keyed shuffle-bags —
  // same pattern as site.js's district bags: every consecutive block
  // of HANDLES.length mints uses every base exactly once.
  function handleBaseFromIndex(universeSeed, index) {
    const block = Math.floor(index / HANDLES.length);
    const order = MJ.makeRNG(universeSeed).fork("handle-bag-" + block).shuffle(HANDLES);
    return order[index % HANDLES.length];
  }

  function styleHandle(base, rng) {
    const styled = rng.chance(0.3) ? leetify(base, rng) : base;
    const roll = rng.float();
    if (roll < 0.4) return styled + "_" + rng.int(10, 99);
    if (roll < 0.6) return styled + rng.int(2, 99);
    return styled; // bare — the bag already guarantees base uniqueness per block
  }
  const PERSONALITY_LINES = [
    "Doesn't talk about the last job. Or the one before that.",
    "Chews gum like it owes them money.",
    "Keeps a photo of someone in a coat pocket that never comes out.",
    "Laughs at the wrong moments. Every time.",
    "Superstitious about which door they walk through first.",
    "Never raises their voice. Never has to.",
    "Collects something small and useless from every job.",
    "Talks to their gear like it's listening.",
  ];
  const AIMS_LINES = [
    "Says they're saving up for something. Won't say what.",
    "Wants off the streets before the streets decide for them.",
    "In it for the work, not the money. Mostly.",
    "Building a reputation, one careful job at a time.",
    "Owes someone, somewhere, and it's catching up.",
    "Just wants steady contracts and no surprises.",
  ];

  // ── Attribute generation ──────────────────────────────────────
  const PHYSICAL_ATTRS = ["body", "agility", "strength", "willpower", "intelligence", "charisma"];

  // ══ THE BIRTH POOL ════════════════════════════════════════════
  // ONE pile of karma buys everything, on the same two curves growth
  // uses for the rest of the runner's career — SR5's karma build has
  // no separate allowance for attributes and neither do we. Sized
  // against what the old band-rolled generator already produced when
  // priced on those curves (~82k of skills, ~255k of attributes,
  // ~335k all in), so this moves the SHAPE of a runner without moving
  // their POWER.
  // The pool is set BELOW the target embodied value on purpose: a
  // metatype's mods are free (they are nature, not a purchase), so a
  // runner ends up worth their pool plus whatever their metatype gave
  // them. Measured at roughly 25 karma of difference, which is why
  // ~310 of pool lands at ~335 of value.
  const BIRTH_KARMA = { min: 270, max: 355 };

  // BANDS, not fixed shares. Each entry is what a rank in that slot
  // can look like; the value is ROLLED inside the band and then PAID
  // FOR out of the pool, in priority order. That is the whole variance
  // engine: a runner who rolls a towering primary has less left for
  // everything after it, and one who rolls low across the board is
  // spread too thin to be good at anything.
  //
  // The tails are the point, not a defect. Glass cannons (a lead
  // attribute that outran the Body to survive using it), rubber bands
  // (stretched so thin they snap), and the occasional beautifully
  // built accident all have to fall out at natural rates, because
  // that is what makes reading the market a skill.
  const SKILL_BANDS = {
    specialist: { primary: [6, 9], secondary: [2, 4], tertiary: [1, 3] },
    generalist: { primary: [4, 6], secondary: [3, 5], tertiary: [1, 2] },
  };
  // By position in the presentation's own attribute order — its lead
  // attribute is the one paying for its primary skill.
  const ATTR_BANDS = [[4, 6], [3, 5], [2, 4]];
  const ATTR_BAND_REST = [2, 3];

  // ── PLAYABLE minimums, not survival minimums ──────────────────
  // Nobody automatically survives anything. A low-level weak fighter
  // loses to a mid-high weak decker, and that is correct; at the SAME
  // level a weak fighter should usually beat a weak decker, and that
  // is what these protect. Some combats need Body 4 — that does not
  // mean every runner is owed Body 4.
  //
  // So this is a floor on being PLAYABLE IN YOUR OWN ROLE, it is
  // relative to power level, and it is fed FIRST out of the pool.
  // Everything above it is bought with what remains.
  function playableFloor(pool) {
    return Math.max(1, Math.min(4, Math.round(pool / 150)));
  }

  // Which attributes this runner cannot be left destitute in. Body is
  // universal — a damage track of nothing is not a fragile character,
  // it is an unplayable one. Willpower joins it for anyone Awakened,
  // because Drain is resisted with Willpower and a caster without it
  // kills themselves on their own first spell. Everything else is the
  // presentation's business.
  function floorAttrsFor(runner) {
    const attrs = ["body"];
    if ((runner.attributes.magic || 0) > 0) attrs.push("willpower");
    return attrs;
  }

  // WHERE A RUNNER STANDS BEFORE ANY KARMA IS SPENT — the metatype's
  // own body and nothing bought. Attributes used to be rolled 2-5 and
  // skills rolled from their own bands, so a runner was PRICED in a
  // currency they were never BUILT from, and the player's character
  // could never be made the same way as the people they hire.
  //
  // A metatype's mods are its nature, not a purchase: a troll IS
  // bigger. They shift the floor and the pool buys up from there,
  // which is also why a troll ends up worth more for the same karma.
  function baseAttributes(metatypeId, family, origin) {
    const meta = METATYPES[metatypeId];
    const attrs = { magic: 0 };
    for (const k of PHYSICAL_ATTRS) {
      attrs[k] = Math.max(1, Math.min(meta.max[k], 1 + (meta.mods[k] || 0)));
    }
    // Being Awakened is a qualification, not a purchase — you have a
    // spark or you do not. Magic 1 IS that spark; every point above it
    // comes out of the pool like any other attribute, which is why a
    // mage's Magic competes with their Sorcery for the same karma.
    if (family === "mage" || origin === "magic") attrs.magic = 1;
    return attrs;
  }

  // Raise one attribute toward a target, paying the real curve, and
  // stop the moment the pool or the metatype ceiling says so. Returns
  // what it cost — the caller is tracking one pile of karma.
  function buyAttribute(shell, attr, target, purse) {
    let spent = 0;
    const ceiling = attributeCeiling(shell, attr);
    while ((shell.attributes[attr] || 0) < Math.min(target, ceiling)) {
      const step = attributeCost(shell.attributes[attr] || 0);
      if (step > purse - spent) break;
      shell.attributes[attr] = (shell.attributes[attr] || 0) + 1;
      spent += step;
    }
    return spent;
  }

  // Same, for a skill, on the skill curve.
  function buySkill(skills, skill, target, purse) {
    const now = skills[skill] || 0;
    if (target <= now) return 0;
    const cost = karmaCost(target) - karmaCost(now);
    if (cost > purse) {
      // Buy as much of it as the pool can still afford rather than
      // nothing — a runner who ran short is worse at the thing, not
      // untrained in it.
      let best = now;
      while (best < target && karmaCost(best + 1) - karmaCost(now) <= purse) best += 1;
      skills[skill] = best;
      return karmaCost(best) - karmaCost(now);
    }
    skills[skill] = target;
    return cost;
  }

  // Essence: everyone starts at 6.0 (tabletop default). Cyber-origin
  // runners already carry some augmentation, so a modest chunk is
  // pre-spent to reflect gear they came to market with (§04).
  // EVERYONE STARTS WHOLE. Essence is 6 and comes down for chrome that
  // is actually on the sheet — nothing else.
  //
  // This used to dock a cyber-origin runner a random 0.5-2.5 for
  // implants nobody could name, which meant the number was a mood
  // rather than a ledger: two identical deckers had different Magic
  // ceilings and different soak for no readable reason, and a datajack
  // that DID appear on the sheet had to be paid for twice or not at
  // all. Personal kit deducts what it grants (see armory.js), and the
  // implant path already deducts what it implants, so the figure is
  // now the sum of things you can point at.
  function generateEssence() {
    return { current: 6.0, max: 6.0 };
  }

  // ── Skill spread: the heart of the Specialist/Generalist shape ─
  // Specialist: one towering key skill, one tight supporting skill,
  // everything else — including the rest of their own archetype's
  // list — starts at zero. Generalist: the key skill plus several
  // secondary skills at a solid, even level. Tertiary and Overflow
  // are deliberately left at 0 here; they're what growRunner fills
  // in over a career, not something pre-rolled at generation.
  function generateSkillSpread(rng, focus, trueArchetype, tiers, origin, ctx) {
    const skills = {};
    for (const s of SKILLS) skills[s] = 0;

    // ── SPEND THE POOL ────────────────────────────────────────────
    // Minimums are already fed (spendBirthPool ran them before this).
    // What is left is spent in PRIORITY ORDER, each slot rolled inside
    // its band and paid for on the real curve, so running out is a
    // real outcome and the runner who rolled a towering primary is
    // measurably poorer everywhere after it.
    if (ctx && ctx.purse !== undefined) {
      const band = SKILL_BANDS[trueArchetype] || SKILL_BANDS.generalist;
      const roll = (b) => rng.int(b[0], b[1]);
      // The presentation says which skills it leans on beyond the
      // focus's own primary; those get looked at before the rest of
      // the tier, so a Banisher's conjuring outranks their assensing
      // and a Ghost's hacking outranks their stealth.
      const favours = (ctx.presentation && ctx.presentation.favours) || [];
      const order = []
        .concat([tiers.primary])
        .concat(favours.filter((s) => s !== tiers.primary && skills[s] !== undefined))
        .concat(tiers.secondary)
        .concat(tiers.tertiary);
      const done = new Set();
      for (const skill of order) {
        if (done.has(skill) || skills[skill] === undefined) continue;
        done.add(skill);
        if (!isSkillEligible(skill, focus.family, origin)) continue;
        const tier = skill === tiers.primary ? band.primary
          : tiers.secondary.indexOf(skill) !== -1 || favours.indexOf(skill) !== -1 ? band.secondary
          : band.tertiary;
        ctx.purse -= buySkill(skills, skill, roll(tier), ctx.purse);
        if (ctx.purse <= 0) break;
      }
    } else {
      // No pool given — the legacy shape, kept so a caller that has
      // not been taught about the allocator still gets a runner.
      if (trueArchetype === "specialist") {
        skills[tiers.primary] = rng.int(7, 9);
        for (const s of tiers.secondary) skills[s] = rng.int(2, 4);
      } else {
        skills[tiers.primary] = rng.int(4, 6);
        for (const s of tiers.secondary) skills[s] = rng.int(3, 5);
      }
    }

    // Baseline Firearms competence — the common (not universal)
    // formation contribution (§09) — for anyone who didn't already
    // land Firearms as their Primary or Secondary at a higher rank.
    if (skills.firearms === 0) {
      skills.firearms = rng.int(1, 3);
    }

    // ── Baseline Assensing: astral perception is the Awakened sense ──
    // Same shape as the Firearms baseline above, and for the same
    // reason: some things are what it MEANS to be that kind of person
    // rather than a specialisation on top.
    //
    // Measured before adding this: across 1,448 generated mages, ZERO
    // had all four magic skills, and Assensing specifically was absent
    // from 70% of Conjuring specialists and 100% of Illusionists. That
    // is not a rare roll, it is structural — generation fills only
    // primary + secondary, and a 4-long mage list with 2 secondary
    // slots can never fill all four.
    //
    // The result was a conjurer who summons and commands spirits THEY
    // CANNOT SEE, which the astral pillar makes nonsense of: assensing
    // is the verb that reads anything out there, so a mage without it
    // is blind on the one plane they are the specialist for.
    //
    // This does NOT make the four common — conjuring and enchanting
    // stay genuinely specialist, which is correct. It makes the
    // Awakened able to perceive.
    if (isSkillEligible("assensing", focus.family, origin) && skills.assensing === 0) {
      skills.assensing = rng.int(1, 3);
    }

    // ── Baseline Perception: everyone has eyes ──────────────────────
    // Awareness is PASSIVE — it is not a verb you spend an action on,
    // it is whether you clock the guard before he clocks you. The site
    // has always rolled this against the crew (noticePool vs
    // concealment); this is the missing half of a check that already
    // existed, and a runner with none of it would be walking around
    // with their eyes shut.
    //
    // So everyone gets some, and nobody gets much for free — the
    // difference between noticing and noticing IN TIME is bought with
    // karma like any other skill.
    if (skills.perception === 0) {
      skills.perception = rng.int(1, 3);
    }

    // ── Baseline Computer: a decker programs, by definition ─────────
    // Third case of the same shape, and the same reasoning. Measured:
    // 50% of deckers rolled ZERO Computer, and 74% of decker
    // specialists — so half the archetype could not work the program
    // forge that §10 says a Computer-skilled runner is what lights up.
    //
    // The split between the two skills is the whole reason this is
    // decker-only rather than universal. COMPUTER is programming:
    // studied, portable, and anybody could take it up. HACKING is
    // what needs a datajack and a deck in your hands, which is why it
    // is gated the way it is and why it departs from the source.
    // So: anyone COULD build Computer. A decker WILL have some.
    if (focus.family === "decker" && skills.computer === 0) {
      skills.computer = rng.int(1, 3);
    }
    return skills;
  }

  // ── Growth: karma auto-allocated along the archetype's heatmap ──
  // Priority order is Primary, then Secondary, then Tertiary — each
  // pass tries every skill in that order and spends on the first one
  // whose next step is affordable (not just the top of the list, so
  // a plateaued Primary doesn't waste Karma the rest of the priority
  // order could still use). Only once every skill in the archetype's
  // own list is unaffordable does growth fall through to Overflow —
  // a random not-yet-known gate-eligible skill outside the list, at
  // the flat rank-0->1 cost. This is what makes a Specialist visibly
  // broaden if never given escalating jobs, and what stops a
  // Generalist's early leader from permanently starving the rest of
  // their spread (§ growth-cascade simulation, verified prior to
  // building this).
  //
  // Archetype-list skills (Primary/Secondary/Tertiary only, never
  // Overflow) advance in HALF-STEPS: X.0 -> X.5 -> (X+1).0, each half
  // costing exactly half the full marginal cost — so a leftover
  // amount that can't complete a whole rank still goes toward that
  // skill instead of getting diverted into a cheap, unrelated
  // Overflow purchase (verified bug: without this, a small leftover
  // would buy a brand-new Overflow skill at flat cost 2 rather than
  // make any progress on an almost-affordable archetype skill, since
  // "start something new" has no threshold to clear). The player only
  // ever sees the floored integer (getEffectiveSkills, display) — the
  // .5 state is internal pacing, not a visible half-rank. Overflow
  // keeps whole-rank-only, no half-steps, on purpose — it stays the
  // cheap, unrelated-dabbling lane, never competing for partial credit.
  function marginalSkillCost(rank) {
    return 2 * (rank + 1); // matches karmaCost's cumulative curve rank*(rank+1)
  }

  function halfStepCost(rank) {
    return Math.floor(rank) + 1; // half of marginalSkillCost(floor(rank)) either way
  }

  // ── Attributes grow from a reserved share, not by competing ────
  // The tabletop charges rating x5 for an attribute against rating
  // x2 for a skill, and that pricing works there because a PLAYER
  // decides to save up for it. Our cascade has no such patience: it
  // walks a priority order and buys the first affordable thing, so
  // against a 25-karma attribute step a brand-new overflow skill at
  // 2 karma wins every time, forever. Attributes would never rise
  // at all. Pricing cannot solve an allocation problem.
  //
  // So a fixed share of every award is set aside and BANKED until it
  // can afford the next step — attributes then advance steadily and
  // thematically, and can neither be starved by cheap skills nor eat
  // the whole award.
  const ATTRIBUTE_SHARE = 0.25;
  const ATTRIBUTE_COST_MULT = 5;

  function attributeCost(rating) {
    return (rating + 1) * ATTRIBUTE_COST_MULT;
  }

  // Which attributes this runner cares about, best first: the one
  // behind their focus's key skill, then the ones behind the rest of
  // their archetype list. An attribute nobody's skills use never
  // gets bought — growth stays thematic by construction rather than
  // by a rule that says so.
  function attributePriority(runner) {
    // PRESENTATION FIRST, because skills cannot answer this question.
    // Every magic skill maps to Magic, so a Puppeteer (Charisma), a
    // Banisher (Willpower) and an Analyst (Intelligence) derive an
    // IDENTICAL order from an identical skill sheet while being three
    // different professions. The presentation carries the truth; the
    // skill-derived order below is the fallback for anyone generated
    // before presentations existed, and for focuses with no table.
    const c = runner.classification;
    const shown = c.presentation && MJ.presentationDef
      ? MJ.presentationDef(c.focusId, c.presentation)
      : null;
    const seen = shown ? shown.attrs.slice() : [];

    // Whatever the presentation did not name still matters if a skill
    // uses it — a Puppeteer's Charisma leads, but their Magic is not
    // therefore worthless.
    const tiers = c.skillTiers;
    const order = [c.focusKeySkill, tiers.primary, ...tiers.secondary, ...tiers.tertiary];
    for (const skill of order) {
      const attr = attributeFor(skill);
      if (attr && seen.indexOf(attr) === -1) seen.push(attr);
    }
    return seen;
  }

  function spendAttributeFund(runner) {
    const priority = attributePriority(runner);
    let bought = null;
    let guard = 0;
    while (guard++ < 100) {
      let spent = false;
      for (const attr of priority) {
        const now = runner.attributes[attr] || 0;
        if (now >= attributeCeiling(runner, attr)) continue; // walled by metatype
        const cost = attributeCost(now);
        if (runner.attributeFund >= cost) {
          runner.attributes[attr] = now + 1;
          runner.attributeFund -= cost;
          bought = attr;
          spent = true;
          break;
        }
      }
      if (!spent) break;
    }
    return bought;
  }

  // True once nothing this runner's skills use can rise any further —
  // every relevant attribute is at its metatype (or Essence) wall.
  function attributesMaxed(runner) {
    return attributePriority(runner).every(
      (a) => (runner.attributes[a] || 0) >= attributeCeiling(runner, a));
  }

  function growRunner(runner, karmaAward, rng) {
    // ── Queued spells eat FIRST ────────────────────────────────────
    // A formula is taught up front (armory.js teachFormula) and PAID
    // FOR here: every award services the study queue at TOP PRIORITY
    // — before the attribute skim, before any skill — until the
    // spell's price is met. Paid in full, it materializes onto the
    // grimoire, and whatever is left of the award flows to the next
    // spell in line or on to normal growth. The price is therefore
    // real: it is growth the runner visibly does not get while they
    // study, not a debit against a bookkeeping counter.
    let award = karmaAward;
    const queue = runner.classification && runner.classification.spellQueue;
    if (queue && queue.length) {
      const known = runner.classification.spellsKnown =
        runner.classification.spellsKnown || [];
      while (queue.length && award > 0) {
        const head = queue[0];
        const pay = Math.min(award, head.cost - head.paid);
        head.paid += pay;
        award -= pay;
        if (head.paid >= head.cost) {
          known.push(head.spellId);
          queue.shift();
        }
      }
    }

    // Skim the attribute share off the top and bank it. Fractions
    // carry in the fund rather than being rounded away each time.
    if (runner.attributeFund === undefined) runner.attributeFund = 0;
    const toAttributes = attributesMaxed(runner) ? 0 : award * ATTRIBUTE_SHARE;
    runner.attributeFund += toAttributes;
    spendAttributeFund(runner);

    const tiers = runner.classification.skillTiers;
    const priorityOrder = [tiers.primary, ...tiers.secondary, ...tiers.tertiary];
    // A veteran whose body has nothing left to give puts everything
    // into training instead — and any fund left stranded at that
    // wall comes back rather than sitting banked forever.
    let remaining = award - toAttributes;
    if (toAttributes === 0 && runner.attributeFund > 0) {
      remaining += runner.attributeFund;
      runner.attributeFund = 0;
    }
    let guard = 0;
    while (remaining > 0 && guard++ < 10000) {
      let spent = false;

      // 1) the archetype's own list, in priority order — first
      // affordable half-step wins (not just the top of the list, so
      // a plateaued Primary doesn't strand Karma the rest of the
      // priority order could still spend).
      for (const id of priorityOrder) {
        const cost = halfStepCost(runner.skills[id]);
        if (remaining >= cost) {
          runner.skills[id] += 0.5;
          remaining -= cost;
          spent = true;
          break;
        }
      }

      // 2) already-started Overflow skills can keep growing too —
      // reinforced by current rank descending, same cascade logic
      // as the archetype list. Without this, a started Overflow
      // skill would freeze at rank 1 forever the moment the whole
      // archetype list plateaus, wasting every further award once
      // Overflow ran out of brand-new skills to start.
      if (!spent) {
        const knownOverflow = tiers.overflow
          .filter((s) => runner.skills[s] > 0)
          .sort((a, b) => runner.skills[b] - runner.skills[a]);
        for (const id of knownOverflow) {
          const cost = marginalSkillCost(runner.skills[id]);
          if (remaining >= cost) {
            runner.skills[id] += 1;
            remaining -= cost;
            spent = true;
            break;
          }
        }
      }

      // 3) nothing known (list or Overflow) is affordable — start a
      // brand new random Overflow skill at the flat rank 0->1 cost.
      if (!spent) {
        const unknownOverflow = tiers.overflow.filter((s) => runner.skills[s] === 0);
        if (remaining >= 2 && unknownOverflow.length > 0) {
          runner.skills[rng.pick(unknownOverflow)] = 1;
          remaining -= 2;
          spent = true;
        }
      }

      if (!spent) break; // nothing affordable anywhere — leftover is lost this award
    }
    runner.karma += karmaAward;
    return remaining; // unspent leftover, for inspection/logging
  }

  // ── Discipline: the visible claim, matching truth 80% of the time ─
  function generateDiscipline(rng, trueArchetype) {
    const matches = rng.chance(0.8);
    const label = matches
      ? (trueArchetype === "specialist" ? "specialist" : "generalist")
      : (trueArchetype === "specialist" ? "generalist" : "specialist");
    return label; // "specialist" | "generalist" — the CLAIM, not the truth
  }

  // ── Pricing: a real karma-cost TrueValue, distorted only by mismatch ─
  // First pass used flat linear "points" (1 rank = 1 unit of value)
  // with artificially different per-point rates for the Specialist
  // ("peak only") vs Generalist ("sum of all") lens — a hack tuned
  // purely to make the mismatch mechanic produce reliable over/under-
  // pricing. That's wrong on its own terms: Shadowrun skill ranks
  // are NOT linear. The real cumulative Karma cost to reach Active
  // Skill rank N is N*(N+1) (rank x2 Karma per step, verified against
  // the SR5 Karma Advancement Table — rank 3 = 12, rank 8 = 72, rank
  // 9 = 90). Once cost-per-rank is realistically steep, a lone high
  // peak and a broad spread of medium skills land much closer in
  // total invested value than flat point-counting implied — verified
  // by simulation: with the real curve and NO artificial premium, a
  // matched Specialist (one skill at rank 7-9, little else) actually
  // priced *below* a matched Generalist (several skills at rank 3-6)
  // on average, because summing real Karma cost across many moderate
  // skills outweighs one expensive peak. The old peak-vs-sum lens
  // swap doesn't survive a non-linear curve at all — it was
  // implicitly leaning on flat-point math to keep mismatch reliable
  // (mismatch reliability dropped to 0% under the real curve).
  //
  // Fix: stop swapping WHICH skills count based on the label. Compute
  // one honest TrueValue — real Karma cost, summed over every known
  // skill, identical formula regardless of archetype — then apply a
  // flat market-perception MULTIPLIER only when the visible Discipline
  // label doesn't match the hidden true archetype. This is reliable
  // by construction (the multiplier is >1 or <1 by definition, not by
  // hoping specific stats land a certain way), and the TrueValue
  // number itself is now a real, grounded measure of invested Karma.
  const KARMA_HYPE_MULT = 1.4;    // labeled Specialist, true Generalist — market overpays
  const KARMA_BARGAIN_MULT = 0.65; // labeled Generalist, true Specialist — market underpays

  function karmaCost(rank) {
    return rank > 0 ? rank * (rank + 1) : 0;
  }

  function trueValue(effectiveSkills) {
    return Object.values(effectiveSkills).reduce((sum, rank) => sum + karmaCost(rank), 0);
  }

  // ── WHAT MAGIC COST, WHICH IS ALSO WHAT IT IS WORTH ─────────────
  // SR5 charges 5 karma to learn a spell, and 5 karma per Power Point
  // for anyone buying powers with karma rather than a chargen
  // abstraction — which is us, permanently, because the app does the
  // arithmetic. One rate, both kinds of Awakened.
  //
  // This has to be in the PRICE as well as the pool. `trueValue`
  // called itself "a real, grounded measure of invested Karma" while
  // reading skills only, so a mage priced identically at nought
  // spells and ten. Harmless while grimoires were free; the moment
  // they cost pool karma it means every point a mage spends on
  // spells DISAPPEARS from their valuation, and the market hands out
  // magic for nothing. It also leaves an adept's Magic unpriced,
  // since `attributePriority` is skill-derived and an adept owns no
  // magic-linked skill — give them powers that cost karma and the
  // attribute finally has something to be relevant to.
  const MAGIC_KARMA_PER_UNIT = 5;

  function grimoireValue(runner) {
    const c = runner && runner.classification;
    if (!c) return 0;
    // A formula in your head stays knowledge even if you cannot
    // currently cast it — a burnt-out mage still knows the spell.
    const known = (c.spellsKnown || []).length;
    // A POWER IS NOT KNOWLEDGE, it is a piece of the spark spent. If
    // the Magic is gone the power is gone with it, so this prices
    // what `powersFor` says they still have rather than what the
    // dossier remembers. Priced in karma directly — Power Points are
    // the hand-calculation abstraction we do not need (see
    // docs/OVERHAUL-PLAN.md); a power's `karma` is its SR5 cost x 5,
    // settled once when the table was written.
    const live = MJ.powersFor ? MJ.powersFor(runner) : [];
    const powers = live.reduce((sum, id) => {
      const def = MJ.powerDef ? MJ.powerDef(id) : null;
      return sum + (def ? def.karma : 0);
    }, 0);
    // Study still owed is NOT value — it is a debt the buyer inherits.
    return known * MAGIC_KARMA_PER_UNIT + powers;
  }

  // Cumulative karma sunk into an attribute, by the same logic as
  // karmaCost but on the attribute curve (each step costs
  // rating x ATTRIBUTE_COST_MULT). Attributes are in the dice pool
  // now, so they have to be in the price: without this a troll and
  // a human with identical skill sheets cost the same while the
  // troll rolls four more dice on every Strength test.
  //
  // Only the attributes this runner's own skills actually USE are
  // counted. A mage's Strength is real but nobody is paying a
  // premium for it, and pricing it would quietly make metatypes
  // with high ceilings expensive regardless of whether the runner
  // can do anything with them.
  function attributeKarmaValue(rating) {
    if (rating <= 1) return 0;
    return ATTRIBUTE_COST_MULT * ((rating * (rating + 1)) / 2 - 1);
  }

  function relevantAttributeValue(runner) {
    let sum = 0;
    for (const attr of attributePriority(runner)) {
      sum += attributeKarmaValue(runner.attributes[attr] || 0);
    }
    return sum;
  }

  // NOTE — scale: this returns a karma-cost-derived value (roughly
  // 40-250 for a fresh runner), NOT a final nuyen figure. The rest
  // of the design (job pay, gear, hiring costs) runs in the
  // thousands of nuyen. The conversion multiplier (NUYEN_PER_VALUE)
  // now lives in models/economy.js's hireCost(), which is the only
  // place this karma-cost scale actually gets turned into nuyen.
  function computePrice(runner) {
    const base = trueValue(getEffectiveSkills(runner))
      + relevantAttributeValue(runner)
      + grimoireValue(runner);
    const c = runner.classification;
    if (c.disciplineLabel === c.trueArchetype) return Math.round(base);
    const mult = c.disciplineLabel === "specialist" ? KARMA_HYPE_MULT : KARMA_BARGAIN_MULT;
    return Math.round(base * mult);
  }

  // ── Effective skills: base minus wound penalty on the key skill ─
  // Also floors every value — archetype-tier skills can hold an
  // internal .5 half-step (growRunner) that the player never sees;
  // a "1.5" isn't worth 1.5 ranks of competence, so pricing, wound
  // math, and anything else reading effective skills always sees
  // the plain integer rank. Implant modifiers aren't generated yet
  // (no crafting/armory in Phase 0) — this is the read-time formula
  // from §09, ready for implant bonuses to slot in later.
  function getEffectiveSkills(runner) {
    const out = {};
    for (const skill of Object.keys(runner.skills)) {
      out[skill] = Math.floor(runner.skills[skill]);
    }
    // Implant modifiers — the §09 read-time slot, now live (armory).
    // Chrome augments training, it never substitutes for it: a mod
    // only applies to a skill with real ranks (same never-rescue-
    // untrained rule as gear and intel bonuses).
    for (const implant of runner.implants || []) {
      for (const skill of Object.keys(implant.skillMods || {})) {
        if (out[skill] !== undefined && out[skill] > 0) out[skill] += implant.skillMods[skill];
      }
    }
    // Adept powers ride the SAME path, and obey the same rule. Chrome
    // and magic both augment training; neither invents it. An adept
    // with Improved Ability (Firearms) and no Firearms rank still
    // cannot shoot — which is why this reuses the slot rather than
    // adding a second one that could drift from it.
    if (MJ.powerSkillMods) {
      const mods = MJ.powerSkillMods(runner);
      for (const skill of Object.keys(mods)) {
        if (out[skill] !== undefined && out[skill] > 0) out[skill] += mods[skill];
      }
    }
    // Injury is not a specialist problem. Boxes cost dice on
    // EVERYTHING — a decker with cracked ribs is worse at talking
    // their way out of the lobby too. Tabletop rate: -1 die per
    // three boxes, so a scratch or two is shrugged off and a real
    // mauling is felt across the whole sheet until somebody treats
    // it.
    //
    // BOTH TRACKS CHARGE, and they charge SEPARATELY — canon. Three
    // boxes of wounds and three of Drain is -2 dice, not -1, because
    // being hurt and being wrung out are two different problems
    // arriving at the same hands. This is what finally makes a mage
    // who overreached early genuinely worse for the rest of the
    // operation rather than merely closer to a threshold.
    const penalty = Math.floor((runner.wounds || 0) / WOUNDS_PER_DIE) +
      Math.floor((runner.stun || 0) / WOUNDS_PER_DIE);
    if (penalty > 0) {
      for (const skill of Object.keys(out)) {
        if (out[skill] > 0) out[skill] = Math.max(0, out[skill] - penalty);
      }
    }
    return out;
  }

  // ── ONE skill, when one skill is all you wanted ────────────────
  // getEffectiveSkills builds a fresh 21-key object every call, and
  // `dicePoolFor` was calling it to read a single entry — a hundred
  // thousand times in one suite run, which measured as the single
  // largest cost in the codebase. Same formula, same answer, none of
  // the allocation.
  //
  // It stays a THIN MIRROR of the function above rather than a
  // clever cache: memoising a runner's sheet means invalidating it
  // on every wound, every point of Drain, every implant and every
  // half-step of growth, and a stale dice pool is a far worse bug
  // than a slow one. A stress probe holds the two to each other.
  function effectiveSkill(runner, skillId) {
    let rank = Math.floor(runner.skills[skillId] || 0);
    if (rank > 0) {
      for (const implant of runner.implants || []) {
        const mod = (implant.skillMods || {})[skillId];
        if (mod) rank += mod;
      }
    }
    if (rank <= 0) return rank;
    const penalty = Math.floor((runner.wounds || 0) / WOUNDS_PER_DIE) +
      Math.floor((runner.stun || 0) / WOUNDS_PER_DIE);
    return penalty > 0 ? Math.max(0, rank - penalty) : rank;
  }

  // The market's claim line. A "Specialist" claim names the SKILL
  // the runner supposedly concentrates in — their top visible skill,
  // which is the market's read of them (user ruling: "Specialist:
  // Detection" on a Detection mage named the class, not a
  // specialization). Naming the top visible skill also resolves the
  // mismatch case for free: a hype-labeled generalist's claim still
  // points at whatever they happen to be best at.
  function describeDiscipline(runner) {
    const c = runner.classification;
    if (c.disciplineLabel !== "specialist") return "Generalist";
    const eff = getEffectiveSkills(runner);
    let top = null;
    for (const k of Object.keys(eff)) {
      if (top === null || eff[k] > eff[top]) top = k;
    }
    return "Specialist (" + top + ")";
  }

  // ── Decker affinity (a tilt on the one archetype, §04) ────────
  function generateDeckerAffinity(rng) {
    return rng.pick(["masking", "attack", "search"]);
  }

  // ── Identity ───────────────────────────────────────────────────
  // handleBase comes from the universe bag when minting; bench
  // generation without one just picks from the pool.
  function generateIdentity(rng, metatypeId, handleBase) {
    return {
      handle: styleHandle(handleBase || rng.pick(HANDLES), rng),
      metatype: metatypeId,
      metatypeLabel: METATYPES[metatypeId].label,
      portraitSeed: rng.int(1, 1e9),
      personalityLine: rng.pick(PERSONALITY_LINES),
      aimsLine: rng.pick(AIMS_LINES),
    };
  }

  // ── The starting grimoire ──────────────────────────────────────
  // SPELLS LIVE ON THE DOSSIER — they are what you hired (§8). A
  // mage generates knowing `Magic rating` spells, drawn from their
  // focus's own list with the signature spell guaranteed first, then
  // padded from the street-mage staples. Two mages at the same price
  // knowing different spells are DIFFERENT HIRES, which is the same
  // texture the skill spread gives everyone else.
  //
  // Ids reference MJ.SPELLS (models/spells.js — canon SR5 spells).
  // spells.js loads after this file, but grimoires are drawn at
  // GENERATION time, never at load, so the order is safe.
  const FOCUS_SPELLS = {
    combatMage:       ["manabolt", "stunbolt", "powerbolt", "fireball", "flamethrower", "manaball", "stunball", "lightningBolt", "clout", "armor"],
    detectionMage:    ["clairvoyance", "detectLife", "analyzeDevice", "combatSense", "detectMagic", "mindProbe", "detectEnemies", "analyzeTruth", "clairaudience"],
    healthMage:       ["heal", "stabilize", "increaseReflexes", "resistPain", "increaseAttribute", "decreaseAttribute", "stunbolt"],
    illusionMage:     ["invisibility", "improvedInvisibility", "confusion", "hush", "silence", "stealth", "mask", "physicalMask", "massConfusion", "agony", "chaos"],
    manipulationMage: ["magicFingers", "levitate", "influence", "armor", "controlThoughts", "controlActions", "physicalBarrier", "manaBarrier", "fling", "mobMind"],
    // Conjurers and enchanters lean on their own systems — spirits
    // and the bench — so they carry a small practical kit rather
    // than a specialty grimoire.
    conjuringMage:    ["armor", "detectMagic", "stunbolt", "combatSense", "manaBarrier", "heal"],
    enchantingMage:   ["detectMagic", "analyzeDevice", "magicFingers", "armor", "heal", "analyzeTruth"],
  };
  // What any street mage might have picked up along the way.
  const STAPLE_SPELLS = ["stunbolt", "heal", "invisibility", "armor", "detectLife", "clairvoyance", "manabolt", "levitate"];

  // THE BOOK IS BOUNDED BY THE TRAINING, NOT JUST THE TALENT.
  // Magic says how much a mage could hold; Sorcery is whether anybody
  // ever taught them to cast. Sizing the grimoire off Magic alone
  // handed conjurers, enchanters and detection mages — the three
  // focuses that file sorcery under tertiary — a full spell list they
  // could not cast a word of: measured at 27% of all mages generated,
  // walking around with six spells and a permanently empty menu,
  // because `spellsFor` quite rightly refuses to cast without the
  // skill. A conjurer with no Spellcasting is not broken, it is a
  // conjurer; what was broken was printing spells on their sheet.
  // Their Magic goes into spirits, and the Banish lane already reads
  // that.
  // `chosen` — the book a player wrote at creation. The COUNT is not
  // negotiable: min(Magic, Sorcery+1) is what the spark and the
  // training can hold, the same ceiling a generated mage lives under.
  // Neither is the SIGNATURE: a Combat mage always knows their combat
  // spell, because that is the half of "Combat mage" the label
  // promises. Everything after it is what they chose to study.
  function generateGrimoire(rng, focus, attrs, skills, chosen) {
    if (focus.family !== "mage") return null;
    const trained = (skills && skills.sorcery) || 0;
    if (trained <= 0) return [];      // a mage, with an empty book
    const count = Math.max(1, Math.min(attrs.magic || 1, trained + 1));
    const list = FOCUS_SPELLS[focus.id] || STAPLE_SPELLS;
    // The signature is certain; the rest of their training is not.
    const known = [list[0]];
    if (chosen && chosen.length) {
      for (const id of chosen) {
        if (known.length >= count) break;
        if (known.indexOf(id) !== -1) continue;
        if (!MJ.spellDef || !MJ.spellDef(id)) continue;   // must be a real spell
        known.push(id);
      }
      // A short book is a legal book — the roll below tops it up the
      // same way it would for anyone who left the choice open.
    }
    const own = rng.shuffle(list.slice(1));
    const wantOwn = Math.min(own.length, Math.max(0, Math.ceil((count * 2) / 3) - 1));
    for (let i = 0; i < wantOwn && known.length < count; i++) {
      if (known.indexOf(own[i]) === -1) known.push(own[i]);
    }
    for (const id of rng.shuffle(STAPLE_SPELLS.slice())) {
      if (known.length >= count) break;
      if (known.indexOf(id) === -1) known.push(id);
    }
    for (const id of own) {
      if (known.length >= count) break;
      if (known.indexOf(id) === -1) known.push(id);
    }
    return known.slice(0, count);
  }

  // ══ THE BIRTH ALLOCATOR ═══════════════════════════════════════
  // One pool, spent in one order, and the order is the design:
  //
  //   1. PLAYABLE MINIMUMS, fed first. Not survival — playability in
  //      your own role. A runner who cannot swing their own primary
  //      or who has no damage track at all is not a fragile
  //      character, they are a broken one.
  //   2. The LEAD attribute and the PRIMARY skill — what this runner
  //      IS, rolled in their bands and paid for.
  //   3. The rest of the presentation's attributes, then their
  //      favoured and secondary skills, then tertiary.
  //   4. Whatever is left goes where they would have put it.
  //
  // Running out partway is a REAL OUTCOME and the point of the whole
  // arrangement. Glass cannons, runners spread too thin to be good at
  // anything, and the occasional beautifully built accident all fall
  // out of the same arithmetic at their own natural rates.
  function spendBirthPool(rng, shell, focus, trueArchetype, tiers, presentation, pool) {
    let purse = pool;
    const floor = playableFloor(pool);
    const attrOrder = (presentation && presentation.attrs) || [];

    // 1. Minimums, first, out of the same pool as everything else.
    for (const attr of floorAttrsFor(shell)) {
      purse -= buyAttribute(shell, attr, floor, purse);
    }
    // The attribute their own primary rolls against is part of being
    // playable: a Puppeteer with no Charisma cannot do the one thing
    // a Puppeteer is for.
    if (attrOrder[0]) purse -= buyAttribute(shell, attrOrder[0], floor, purse);

    // 2-3. The presentation's attributes, in its own order, each
    // rolled inside the band for its position.
    attrOrder.forEach((attr, i) => {
      if (purse <= 0) return;
      const band = ATTR_BANDS[i] || ATTR_BAND_REST;
      purse -= buyAttribute(shell, attr, rng.int(band[0], band[1]), purse);
    });

    // Skills, in priority order, from the same purse.
    const ctx = { purse: purse, presentation: presentation };
    const skills = generateSkillSpread(rng, focus, trueArchetype, tiers, shell.origin, ctx);
    purse = ctx.purse;

    // 4. Anything left tops up the attributes nobody has spoken for —
    // a person does not leave their own Body at 1 to bank karma.
    for (const attr of PHYSICAL_ATTRS) {
      if (purse <= 0) break;
      if (attrOrder.indexOf(attr) !== -1) continue;
      purse -= buyAttribute(shell, attr, rng.int(ATTR_BAND_REST[0], ATTR_BAND_REST[1]), purse);
    }

    // 5. SPEND IT DOWN. Karma left in the purse is karma the runner
    // was priced for and never received — measured at a median of 33
    // and as much as 135 before this existed, which is most of a rank
    // in their own primary. A rich roll has to BUY something or the
    // pool stops meaning anything.
    //
    // One step at a time, around the same priority order, so the
    // remainder lands where the rest of the karma went rather than
    // pooling into whatever happens to be cheapest. This can carry a
    // slot past its band, and should: a runner who rolled a big pool
    // IS better than one who did not, and that is where the
    // occasional beautifully built accident comes from.
    const stepOrder = attrOrder.concat(PHYSICAL_ATTRS.filter((a) => attrOrder.indexOf(a) === -1));
    const skillOrder = [tiers.primary].concat(tiers.secondary, tiers.tertiary)
      .filter((s) => skills[s] !== undefined && isSkillEligible(s, focus.family, shell.origin));
    let progressed = true;
    while (progressed && purse > 0) {
      progressed = false;
      for (const attr of stepOrder) {
        if (purse <= 0) break;
        const before = shell.attributes[attr] || 0;
        purse -= buyAttribute(shell, attr, before + 1, purse);
        if ((shell.attributes[attr] || 0) > before) progressed = true;
      }
      for (const skill of skillOrder) {
        if (purse <= 0) break;
        const before = skills[skill] || 0;
        purse -= buySkill(skills, skill, before + 1, purse);
        if ((skills[skill] || 0) > before) progressed = true;
      }
    }
    return { skills: skills, unspent: Math.max(0, purse) };
  }

  // ── The starting powers ────────────────────────────────────────
  // THE ADEPT'S GRIMOIRE, and built to the same shape: a focus-
  // weighted draw with the signature guaranteed first, padded from
  // what any adept might have found in themselves. What differs is
  // the ceiling — Magic x 5 karma of powers, permanently, because a
  // power is not studied, it is how much magic is in the person.
  //
  // Powers live in models/powers.js, which loads after this file;
  // like the grimoire, this runs at GENERATION time, never at load,
  // so the order is safe.
  const FOCUS_POWERS = {
    melee:        ["killingHands", "improvedMelee", "improvedReflexes", "painResistance", "mysticArmor"],
    tank:         ["painResistance", "mysticArmor", "commandingVoice", "improvedMelee", "improvedReflexes"],
    marksman:     ["improvedMarksmanship", "enhancedPerception", "improvedReflexes", "combatSenseAdept"],
    heavyWeapons: ["improvedFirearms", "painResistance", "mysticArmor", "improvedReflexes"],
    demolitions:  ["enhancedPerception", "improvedReflexes", "combatSenseAdept", "greatLeap"],
    stealth:      ["improvedStealth", "greatLeap", "enhancedPerception", "improvedReflexes", "astralPerception"],
    face:         ["kinesics", "commandingVoice", "astralPerception", "enhancedPerception"],
  };
  // What any adept might turn up carrying, whatever they trained for.
  const STAPLE_POWERS = ["improvedReflexes", "combatSenseAdept", "painResistance",
    "astralPerception", "enhancedPerception", "mysticArmor"];

  function generatePowers(rng, focus, attrs, origin) {
    if (focus.family === "mage" || origin !== "magic") return null;
    const cap = (attrs.magic || 0) * MAGIC_KARMA_PER_UNIT;
    if (cap <= 0) return [];
    const list = FOCUS_POWERS[focus.id] || STAPLE_POWERS;
    const defs = (MJ.POWERS) || {};
    const known = [];
    let spent = 0;
    const take = (id) => {
      const def = defs[id];
      if (!def || known.some((k) => k.id === id)) return false;
      if (spent + def.karma > cap) return false;
      known.push({ id: id, label: def.label, karma: def.karma });
      spent += def.karma;
      return true;
    };
    // The signature is certain, if it fits at all.
    take(list[0]);
    for (const id of rng.shuffle(list.slice(1))) take(id);
    for (const id of rng.shuffle(STAPLE_POWERS.slice())) take(id);
    return known;
  }

  // ── Top-level generator ────────────────────────────────────────
  // options: { focusId?: string, family?: string, origin?: string }
  // If focusId isn't given, one is picked (optionally filtered by
  // family) at random from the FOCUSES table.
  function generateRunner(rng, options) {
    options = options || {};
    // Consume the passed-in stream directly — do NOT fork with a fixed
    // label here. fork() derives a child purely from (seed + label),
    // ignoring the parent's advancing position, so forking a constant
    // label inside a function called repeatedly on the same rng would
    // hand back the identical child every time (found via the P0.3
    // verification pass: 2000 calls on one rng produced one runner,
    // copied). Callers who want each runner on its own reproducible
    // sub-stream should fork a *unique* label per slot themselves
    // (e.g. rng.fork("market-slot-" + index)) before calling this.
    const r = rng;

    let candidates = FOCUSES;
    if (options.focusId) {
      candidates = [focusById(options.focusId)];
    } else if (options.family) {
      candidates = FOCUSES.filter((f) => f.family === options.family);
    }
    const focus = candidates.length === 1 ? candidates[0] : pickFocus(r, candidates);

    const origin = options.origin || pickOrigin(r, focus);
    const metatypeId = options.metatype || pickMetatype(r);

    const trueArchetype = options.trueArchetype === "specialist" || options.trueArchetype === "generalist"
      ? options.trueArchetype
      : (r.chance(0.5) ? "specialist" : "generalist");
    // THE ONE CLAIM THAT MAY STILL MISLEAD, and it stays rolled even
    // for a made runner. disciplineLabel is a SELF-ASSESSMENT — people
    // misjudge their own breadth — so letting the player set it would
    // turn the game's one honest piece of unreliable narration into a
    // form field. What they picked is the truth; what the sheet claims
    // is the character's own opinion of themselves.
    const disciplineLabel = generateDiscipline(r, trueArchetype);

    // A decker's affinity has been rolled since the beginning and
    // never meant anything; it now decides the presentation, so the
    // two can never contradict each other. A CHOSEN presentation has
    // to run that derivation BACKWARDS, or a player who picked Ghost
    // would get an Icebreaker's affinity underneath it — the exact
    // contradiction the affinity/presentation link exists to prevent.
    let presentation = null;
    if (options.presentationId && MJ.presentationDef) {
      presentation = MJ.presentationDef(focus.id, options.presentationId);
    }
    let deckerAffinity = null;
    if (focus.family === "decker") {
      deckerAffinity = (presentation && MJ.affinityForPresentation
        ? MJ.affinityForPresentation(presentation.id) : null) || generateDeckerAffinity(r);
    }
    if (!presentation && MJ.pickPresentation) {
      presentation = MJ.pickPresentation(r, focus, { affinity: deckerAffinity });
    }

    // ONE POOL buys everything below this line, on the same curves
    // growth uses for the rest of their career.
    const pool = options.karma || r.int(BIRTH_KARMA.min, BIRTH_KARMA.max);
    const attrs = baseAttributes(metatypeId, focus.family, origin);
    const essence = generateEssence();
    const skillTiers = buildSkillTiers(r, focus, trueArchetype, origin, options.secondaries);

    // The allocator reads the finished shape — attributeCeiling wants
    // a metatype and an Essence — so it gets a runner one step early.
    const shell = {
      identity: { metatype: metatypeId },
      classification: { focusKeySkill: focus.keySkill, skillTiers: skillTiers },
      attributes: attrs,
      essence: essence,
      origin: origin,
    };
    // A STARTER SPEC REPLACES THE ROLL, and nothing else about the
    // build changes: same shell, same tiers, same ceilings, same
    // grimoire and powers grant below. Only where the numbers came
    // from is different — rolled for somebody you met, chosen for the
    // one you built.
    shell.classification.family = focus.family;
    const built = options.starter
      ? applyStarterBuild(shell, skillTiers, options.starter)
      : spendBirthPool(r, shell, focus, trueArchetype, skillTiers, presentation, pool);
    const skills = built.skills;

    const runner = {
      identity: generateIdentity(r, metatypeId, options.handleBase),
      classification: {
        family: focus.family,
        focusId: focus.id,
        focusLabel: focus.label,
        focusKeySkill: focus.keySkill,
        origin: origin,
        deckerAffinity: deckerAffinity,
        // WHAT KIND OF <FOCUS> THIS ONE IS, and it never lies. The
        // visible claim that CAN mislead is disciplineLabel below —
        // people misjudge their own breadth. Nobody misreports being
        // a Banisher.
        presentation: presentation ? presentation.id : null,
        presentationLabel: presentation ? presentation.label : null,
        // Spell IDS into MJ.SPELLS — the grimoire is what you hired.
        spellsKnown: generateGrimoire(r, focus, attrs, skills, options.spells),
        // The adept's half of the same idea — powers into MJ.POWERS,
        // capped at Magic x 5 karma for life. null for anyone whose
        // spark is not the burn-it-on-your-own-body kind.
        powersKnown: generatePowers(r, focus, attrs, origin),
        // Formulas taught but not yet paid for in karma — the study
        // queue growRunner services at top priority.
        spellQueue: focus.family === "mage" ? [] : null,
        disciplineLabel: disciplineLabel,     // visible claim: "specialist" | "generalist"
        trueArchetype: trueArchetype,          // hidden truth: "specialist" | "generalist"
        skillTiers: skillTiers,                // { primary, secondary[], tertiary[], overflow[] } — growth priority order
      },
      attributes: attrs,
      essence: essence,
      skills: skills,
      wounds: 0,       // boxes of PHYSICAL damage carried; -1 die per three
      // Boxes of STUN. Drain, stun batons, gel rounds, biofeedback —
      // real and persistent, because an operation is many missions
      // long and a mage who burned out at the second door is still
      // burned out at the fifth. Clears fast with rest, unlike a
      // wound. Same -1 die per three.
      stun: 0,
      restedDays: 0,   // consecutive days off the job, which is how they mend
      karma: 0,
      attributeFund: 0, // banked share of past awards, waiting on the next attribute step
      gear: [],         // personal kit below, plus whatever the operation issues
      market: {
        state: "unwatched", // "unwatched" | "watched"
        hired: null,        // null | { tier: "freelance"|"retainer"|"permanent", missionsRemaining } — mission-counted contracts (models/market.js)
        daysOnMarket: 0,
        // Shelf-life / Working / OutOfTown / KIA state machine (§03,
        // implemented in models/market.js). `phase` only means
        // something once state === "watched"; an unwatched runner
        // just ticks shelfDaysRemaining down to zero and is
        // gone, no phase involved.
        phase: null, // null | "available" | "working" | "outOfTown" | "kia"
        shelfDaysRemaining: r.int(3, 14),
      },
    };

    // What they already own when you meet them. A professional turns
    // up with a sidearm; nobody turns up with a milspec hardsuit —
    // that stays the armoury's job, which is what keeps §03's
    // "two deckers, one top-tier deck" decision real.
    runner.gear = MJ.generatePersonalKit ? MJ.generatePersonalKit(runner) : [];

    return runner;
  }

  // ══ THE STARTER BUILD ═════════════════════════════════════════
  // THE FIRST RUNNER IS BOUGHT, NOT ROLLED. The market's allocator
  // rolls bands out of one karma pool, which is right for people you
  // MEET — the variance is what makes a market worth reading. It is
  // wrong for the one person the player builds, for two reasons: a
  // creation screen that hands you a different character each time you
  // press the button teaches nothing, and the whole point of building
  // the first one is to see where a runner's numbers come from.
  //
  // So creation is a point buy, shaped like SR5's priority table at
  // street level. Separate purses, fixed sizes, nothing rolled:
  //
  //   ATTRIBUTES   16 points, one point per rating, on top of the
  //                metatype's own floor and capped at its ceiling.
  //                (SR5 Priority C.)
  //   PRIMARY      free at rank 4 — the focus IS this skill, and a
  //                professional turns up already able to do their job.
  //   SECONDARY    6 ranks to spread over the ones they chose.
  //   TERTIARY     4 ranks over the rest of the class list.
  //   UNIVERSAL    4 ranks over everything else they are allowed —
  //                Perception, Firearms, Athletics and the rest are
  //                nobody's class property and are purchasable on
  //                every build.
  //
  // Eighteen skill ranks total, which is SR5's Priority E — correct
  // for somebody who is going to grow into the work rather than
  // arrive finished. Magic, spells and adept powers are NOT bought
  // here: a spark is a qualification, not a purchase, and the free
  // grant is whatever generation already gives that shape.
  const STARTER = {
    attributePoints: 16,
    primaryRank: 4,
    secondaryPool: 6,
    tertiaryPool: 4,
    universalPool: 4,
    // SR5 caps a starting skill at 6. Growth is where 7+ lives.
    skillCap: 6,
  };

  // Which skills are NOBODY'S class property. Everything the gates do
  // not reserve — sorcery/conjuring/enchanting want a mage, assensing
  // wants a spark, hacking wants a decker, rigging wants a rigger, and
  // everything else is just a thing a person can learn.
  function universalSkillsFor(family, origin) {
    return SKILLS.filter((s) => !SKILL_GATES[s] && isSkillEligible(s, family, origin));
  }

  // Spend the player's answers. Deliberately NOT spendBirthPool: same
  // tables, same ceilings, same skill list, different chooser. The
  // runner that comes out is the same SHAPE as any other — that part
  // is not negotiable and C27 holds it.
  function applyStarterBuild(shell, tiers, spec) {
    spec = spec || {};
    const skills = {};
    for (const s of SKILLS) skills[s] = 0;
    // The primary comes free at its fixed rank; it is what the focus
    // means.
    skills[tiers.primary] = STARTER.primaryRank;
    for (const s of Object.keys(spec.skills || {})) {
      if (SKILLS.indexOf(s) === -1) continue;
      if (!isSkillEligible(s, shell.classification.family || shell.family, shell.origin)) continue;
      skills[s] = Math.max(skills[s] || 0, Math.min(STARTER.skillCap, spec.skills[s] | 0));
    }
    for (const attr of Object.keys(spec.attributes || {})) {
      if (!(attr in shell.attributes)) continue;
      // A SPARK IS NOT A PURCHASE. baseAttributes grants Magic 1 to
      // anyone who has one and 0 to everyone else; points can deepen
      // a spark but they can never buy one. attributeCeiling reads
      // Essence, which a mundane also has, so without this a cyber
      // ork Marksman could spend four points and walk out Awakened —
      // caught live on the build screen.
      if (attr === "magic" && !shell.attributes.magic) continue;
      const ceiling = attributeCeiling(shell, attr);
      shell.attributes[attr] = Math.max(
        shell.attributes[attr],
        Math.min(ceiling, (shell.attributes[attr] || 0) + (spec.attributes[attr] | 0)));
    }
    return { skills: skills };
  }

  // ══ CHARACTER CREATION ════════════════════════════════════════
  // ONE ALLOCATOR, NEVER TWO. Everything a player picks arrives as
  // `options` on generateRunner and is spent by the same
  // spendBirthPool the market uses — same karma pool, same playable
  // minimums, same bands, same curves. A made runner and a met runner
  // are the same kind of object, built the same way, and the only
  // difference is who answered the questions.
  //
  // That is the point of creation as a teaching tool: what the player
  // learns making one is TRUE of everyone they will ever hire.
  //
  // This is the menu — what is legal at each step, read off the same
  // tables generation reads. The UI renders it and never hardcodes a
  // list of its own, so a focus added to FOCUSES appears in creation
  // without anyone remembering to go and add it.
  function creationMenu(picks) {
    picks = picks || {};
    const families = [];
    for (const f of FOCUSES) {
      if (families.indexOf(f.family) === -1) families.push(f.family);
    }
    const focusList = picks.family ? FOCUSES.filter((f) => f.family === picks.family) : [];
    const focus = picks.focusId ? focusById(picks.focusId) : null;
    const entry = focus ? ARCHETYPE_SKILLS[focus.id] : null;
    const arch = picks.trueArchetype === "specialist" ? "specialist" : "generalist";
    const secondaryCount = entry
      ? (arch === "specialist" ? entry.specialistSecondary : entry.generalistSecondary) : 0;
    const magic = focus && (focus.family === "mage" || (picks.origin || "") === "magic");
    return {
      families: families,
      focuses: focusList.map((f) => ({ id: f.id, label: f.label, family: f.family, keySkill: f.keySkill })),
      // Specialist buys fewer, deeper secondaries; generalist more,
      // shallower. The COUNT is the whole difference and it is shown.
      archetypes: entry ? [
        { id: "specialist", label: "Specialist", secondaries: entry.specialistSecondary },
        { id: "generalist", label: "Generalist", secondaries: entry.generalistSecondary },
      ] : [],
      // Fixed by the focus, shown so the player knows what they bought.
      primary: entry ? entry.list[0] : null,
      secondaryCount: secondaryCount,
      secondaryPool: entry ? entry.list.slice(1) : [],
      // ── The four tiers, as the build screen has to show them ────
      // Choosing the secondaries is what DEFINES the tertiary tier —
      // it is the remainder of the class list — and seeing that
      // happen is half of what building the first runner teaches.
      tertiary: entry && picks.secondaries
        ? entry.list.slice(1).filter((s) => picks.secondaries.indexOf(s) === -1) : [],
      // THE OVERFLOW: everything they are allowed that their class
      // list does not already speak for. Perception and Firearms are
      // nobody's property — they are here on every build where the
      // class does not already cover them, and where it DOES they are
      // simply bought from that tier's purse instead. Either way no
      // build can be denied them, and no skill is ever buyable twice
      // out of two different purses.
      universal: focus && entry
        ? universalSkillsFor(focus.family, picks.origin || (focus.origins || [])[0])
            .filter((s) => entry.list.indexOf(s) === -1)
        : [],
      starter: STARTER,
      // Only origins this focus can actually have — a Street Doc is
      // mundane, and offering "magic" would be offering a lie.
      origins: focus ? focus.origins.slice() : [],
      metatypes: MJ.METATYPE_IDS ? MJ.METATYPE_IDS.slice() : [],
      presentations: focus && MJ.presentationsFor
        ? MJ.presentationsFor(focus.id).map((p) => ({ id: p.id, label: p.label, blurb: p.blurb })) : [],
      // The book, for a mage. The signature is not on the menu — it is
      // the focus's own spell and it comes for free, because it is the
      // half of the label that must stay true.
      signatureSpell: focus && focus.family === "mage"
        ? (FOCUS_SPELLS[focus.id] || STAPLE_SPELLS)[0] : null,
      spellPool: magic && MJ.SPELLS ? Object.keys(MJ.SPELLS) : [],
    };
  }

  // Build one to the player's spec. Returns the runner AND what the
  // allocator actually did with the picks, so the creation screen can
  // show the sheet before it is committed — nothing is hidden behind
  // the confirm button.
  function createRunner(seed, picks) {
    picks = picks || {};
    const runner = generateRunner(MJ.makeRNG(seed || ("made-" + Date.now())), {
      family: picks.family,
      focusId: picks.focusId,
      origin: picks.origin,
      metatype: picks.metatype,
      trueArchetype: picks.trueArchetype,
      presentationId: picks.presentationId,
      secondaries: picks.secondaries,
      spells: picks.spells,
      // The point buy. Absent means roll them like anybody else.
      starter: picks.starter,
      // NO HANDLE PICK. A street name is dealt from the universe's own
      // shuffle-bag, same as everyone's — it is how the world names
      // people, and the player's runner is a person in that world.
    });
    runner.identity.madeByPlayer = true;
    return runner;
  }

  // ── The universe runner registry (§09 layer 1) ─────────────────
  // Same pattern as site.js's mintSite: runner #N of a universe is a
  // pure function of (universeSeed, index) — lazy, infinite, and
  // identical every time that universe asks.
  function mintRunner(universeSeed, index, options) {
    const opts = Object.assign({}, options, { handleBase: handleBaseFromIndex(universeSeed, index) });
    const runner = generateRunner(MJ.makeRNG(universeSeed).fork("runner-" + index), opts);
    runner.identity.universeIndex = index;
    return runner;
  }

  MJ.SKILLS = SKILLS;
  MJ.SKILL_ATTRIBUTE = SKILL_ATTRIBUTE;
  MJ.attributeFor = attributeFor;
  MJ.attributeCeiling = attributeCeiling;
  MJ.attributeCost = attributeCost;
  MJ.attributePriority = attributePriority;
  MJ.ATTRIBUTE_SHARE = ATTRIBUTE_SHARE;
  MJ.HANDLES = HANDLES;
  MJ.handleBaseFromIndex = handleBaseFromIndex;
  MJ.mintRunner = mintRunner;
  MJ.METATYPES = METATYPES;
  MJ.METATYPE_IDS = METATYPE_IDS;
  MJ.FOCUSES = FOCUSES;
  MJ.focusById = focusById;
  MJ.generateRunner = generateRunner;
  // Character creation — the menu, and the builder. Both read the same
  // tables generation reads; neither is a second system.
  MJ.creationMenu = creationMenu;
  MJ.createRunner = createRunner;
  MJ.STARTER = STARTER;
  MJ.universalSkillsFor = universalSkillsFor;
  MJ.getEffectiveSkills = getEffectiveSkills;
  MJ.effectiveSkill = effectiveSkill;
  MJ.computePrice = computePrice;
  MJ.describeDiscipline = describeDiscipline;
  MJ.karmaCost = karmaCost;   // exposed for inspection/tuning — real SR5 rank cost curve
  MJ.trueValue = trueValue;   // exposed for inspection/tuning — the undistorted honest value
  MJ.grimoireValue = grimoireValue;   // spells + powers, at SR5's 5 karma apiece
  MJ.MAGIC_KARMA_PER_UNIT = MAGIC_KARMA_PER_UNIT;
  MJ.isAwakened = isAwakened;
  MJ.SKILL_GATES = SKILL_GATES;       // exposed — growth-cascade overflow must respect these too
  MJ.isSkillEligible = isSkillEligible;
  MJ.ARCHETYPE_SKILLS = ARCHETYPE_SKILLS;
  MJ.buildSkillTiers = buildSkillTiers;
  MJ.growRunner = growRunner;
  MJ.marginalSkillCost = marginalSkillCost;
  MJ.halfStepCost = halfStepCost;
})();
