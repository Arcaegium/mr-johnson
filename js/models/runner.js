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
  const SKILL_GATES = {
    sorcery: "mage",
    conjuring: "mage",
    enchanting: "mage",
    assensing: "mage",
    hacking: "decker",
    rigging: "rigger",
  };

  function isSkillEligible(skillId, family) {
    const gate = SKILL_GATES[skillId];
    return !gate || gate === family;
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
  function buildSkillTiers(rng, focus, trueArchetype) {
    const entry = ARCHETYPE_SKILLS[focus.id];
    const primary = entry.list[0];
    const secondaryCount = trueArchetype === "specialist" ? entry.specialistSecondary : entry.generalistSecondary;
    const restShuffled = rng.shuffle(entry.list.slice(1));
    const secondary = restShuffled.slice(0, secondaryCount);
    const tertiary = restShuffled.slice(secondaryCount);
    const overflow = SKILLS.filter(
      (s) => !entry.list.includes(s) && isSkillEligible(s, focus.family)
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

  function generateAttributes(rng, metatypeId, family) {
    const meta = METATYPES[metatypeId];
    const base = () => rng.int(2, 5);
    const attrs = { magic: 0 };
    for (const k of PHYSICAL_ATTRS) {
      // Clamped to the metatype's own ceiling at generation too — a
      // troll should never open below 1, and an ork should never
      // open above the Intelligence they can ever reach.
      attrs[k] = Math.max(1, Math.min(meta.max[k], base() + (meta.mods[k] || 0)));
    }
    return attrs;
  }

  // Magic attribute: mages get a real casting stat; adept-origin
  // fighters/face get a smaller Magic score powering their
  // abilities (Killing Hands, Improved Reflexes) without casting.
  function applyMagic(rng, attrs, family, origin) {
    if (family === "mage") {
      attrs.magic = rng.int(3, 6);
    } else if (origin === "magic") {
      attrs.magic = rng.int(2, 4);
    }
    return attrs;
  }

  // Essence: everyone starts at 6.0 (tabletop default). Cyber-origin
  // runners already carry some augmentation, so a modest chunk is
  // pre-spent to reflect gear they came to market with (§04).
  function generateEssence(rng, origin) {
    const max = 6.0;
    let current = max;
    if (origin === "cyber") {
      current = Math.round((max - rng.range(0.5, 2.5)) * 100) / 100;
    }
    return { current, max };
  }

  // ── Skill spread: the heart of the Specialist/Generalist shape ─
  // Specialist: one towering key skill, one tight supporting skill,
  // everything else — including the rest of their own archetype's
  // list — starts at zero. Generalist: the key skill plus several
  // secondary skills at a solid, even level. Tertiary and Overflow
  // are deliberately left at 0 here; they're what growRunner fills
  // in over a career, not something pre-rolled at generation.
  function generateSkillSpread(rng, focus, trueArchetype, tiers) {
    const skills = {};
    for (const s of SKILLS) skills[s] = 0;

    if (trueArchetype === "specialist") {
      skills[tiers.primary] = rng.int(7, 9);
      for (const s of tiers.secondary) skills[s] = rng.int(2, 4);
    } else {
      skills[tiers.primary] = rng.int(4, 6);
      for (const s of tiers.secondary) skills[s] = rng.int(3, 5);
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
    if (isSkillEligible("assensing", focus.family) && skills.assensing === 0) {
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
    const tiers = runner.classification.skillTiers;
    const order = [runner.classification.focusKeySkill, tiers.primary, ...tiers.secondary, ...tiers.tertiary];
    const seen = [];
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
    // Skim the attribute share off the top and bank it. Fractions
    // carry in the fund rather than being rounded away each time.
    if (runner.attributeFund === undefined) runner.attributeFund = 0;
    const toAttributes = attributesMaxed(runner) ? 0 : karmaAward * ATTRIBUTE_SHARE;
    runner.attributeFund += toAttributes;
    spendAttributeFund(runner);

    const tiers = runner.classification.skillTiers;
    const priorityOrder = [tiers.primary, ...tiers.secondary, ...tiers.tertiary];
    // A veteran whose body has nothing left to give puts everything
    // into training instead — and any fund left stranded at that
    // wall comes back rather than sitting banked forever.
    let remaining = karmaAward - toAttributes;
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
    const base = trueValue(getEffectiveSkills(runner)) + relevantAttributeValue(runner);
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
    // Injury is not a specialist problem. `runner.wounds` counts
    // boxes on the physical track, and boxes cost dice on EVERYTHING
    // — a decker with cracked ribs is worse at talking their way out
    // of the lobby too. Tabletop rate: -1 die per three boxes, so a
    // scratch or two is shrugged off and a real mauling is felt
    // across the whole sheet until somebody treats it.
    const penalty = Math.floor((runner.wounds || 0) / WOUNDS_PER_DIE);
    if (penalty > 0) {
      for (const skill of Object.keys(out)) {
        if (out[skill] > 0) out[skill] = Math.max(0, out[skill] - penalty);
      }
    }
    return out;
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

    const trueArchetype = r.chance(0.5) ? "specialist" : "generalist";
    const disciplineLabel = generateDiscipline(r, trueArchetype);

    const attrs = applyMagic(r, generateAttributes(r, metatypeId, focus.family), focus.family, origin);
    const essence = generateEssence(r, origin);
    const skillTiers = buildSkillTiers(r, focus, trueArchetype);
    const skills = generateSkillSpread(r, focus, trueArchetype, skillTiers);

    const runner = {
      identity: generateIdentity(r, metatypeId, options.handleBase),
      classification: {
        family: focus.family,
        focusId: focus.id,
        focusLabel: focus.label,
        focusKeySkill: focus.keySkill,
        origin: origin,
        deckerAffinity: focus.family === "decker" ? generateDeckerAffinity(r) : null,
        spellFormulasKnown: focus.family === "mage" ? [] : null, // populated once spell content exists
        disciplineLabel: disciplineLabel,     // visible claim: "specialist" | "generalist"
        trueArchetype: trueArchetype,          // hidden truth: "specialist" | "generalist"
        skillTiers: skillTiers,                // { primary, secondary[], tertiary[], overflow[] } — growth priority order
      },
      attributes: attrs,
      essence: essence,
      skills: skills,
      wounds: 0,       // boxes of physical damage carried; -1 die per three
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
  MJ.FOCUSES = FOCUSES;
  MJ.focusById = focusById;
  MJ.generateRunner = generateRunner;
  MJ.getEffectiveSkills = getEffectiveSkills;
  MJ.computePrice = computePrice;
  MJ.describeDiscipline = describeDiscipline;
  MJ.karmaCost = karmaCost;   // exposed for inspection/tuning — real SR5 rank cost curve
  MJ.trueValue = trueValue;   // exposed for inspection/tuning — the undistorted honest value
  MJ.SKILL_GATES = SKILL_GATES;       // exposed — growth-cascade overflow must respect these too
  MJ.isSkillEligible = isSkillEligible;
  MJ.ARCHETYPE_SKILLS = ARCHETYPE_SKILLS;
  MJ.buildSkillTiers = buildSkillTiers;
  MJ.growRunner = growRunner;
  MJ.marginalSkillCost = marginalSkillCost;
  MJ.halfStepCost = halfStepCost;
})();
