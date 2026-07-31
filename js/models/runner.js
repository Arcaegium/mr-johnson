/* ============================================================
   Mr. Johnson — models/runner.js
   The runner record: generation from a seed, and the
   Generalist/Specialist shape-vs-label-vs-price system
   (design bible §04 / §09).

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

  // ── The 18-skill registry (design bible §09) ──────────────────
  // Every skill maps to real verbs elsewhere in the design; this
  // list is the canonical set every runner's skill map is keyed by.
  const SKILLS = [
    "firearms", "heavyWeapons", "marksmanship", "melee", "demolitions",
    "stealth", "athletics", "medicine", "presence", "con", "larceny",
    "computer", "electronics", "rigging",
    "sorcery", "conjuring", "enchanting", "assensing",
  ];

  // ── Metatypes: light attribute-range flavor, not hard rules ───
  // Deltas applied on top of a base roll. Kept small on purpose —
  // flavor and minor differentiation, not a redesign of the attrs.
  const METATYPES = {
    human:  { label: "Human",  mods: {} },
    elf:    { label: "Elf",    mods: { agility: 1, charisma: 1, body: -1 } },
    dwarf:  { label: "Dwarf",  mods: { body: 1, willpower: 1, agility: -1 } },
    ork:    { label: "Ork",    mods: { body: 2, charisma: -1 } },
    troll:  { label: "Troll",  mods: { body: 3, agility: -1, intelligence: -1 } },
  };
  const METATYPE_IDS = Object.keys(METATYPES);

  // ── Origins: the power source behind a focus (§04) ────────────
  // cyber: mundane, chrome. Essence starts partially spent.
  // magic: adept/mage. Full Essence kept; Magic attribute granted.
  // infected: HMHVV-flavored. Mundane stats, distinct flavor only.
  const ORIGINS = ["cyber", "magic", "infected", "mundane"];

  // ── Focus templates: family, key skill, allowed origins ───────
  // This table is the whole "systems are expensive, rows are
  // cheap" bet — every archetype in the bible is just a row here.
  const FOCUSES = [
    // Fighters
    { id: "heavyWeapons", label: "Heavy Weapons", family: "fighter", keySkill: "heavyWeapons", origins: ["cyber", "magic"] },
    { id: "demolitions",  label: "Demolitions",   family: "fighter", keySkill: "demolitions",  origins: ["cyber", "magic"] },
    { id: "stealth",      label: "Stealth",       family: "fighter", keySkill: "stealth",      origins: ["cyber", "magic", "infected"] },
    { id: "melee",        label: "Melee",         family: "fighter", keySkill: "melee",        origins: ["cyber", "magic"] },
    { id: "marksman",     label: "Marksman",      family: "fighter", keySkill: "marksmanship", origins: ["cyber", "magic"] },
    { id: "athletics",    label: "2nd-Story",     family: "fighter", keySkill: "athletics",    origins: ["cyber", "magic", "infected"] },
    { id: "tank",         label: "Tank",          family: "fighter", keySkill: "presence",     origins: ["cyber", "magic"] },
    { id: "combatMedic",  label: "Combat Medic",  family: "fighter", keySkill: "medicine",     origins: ["cyber", "mundane"] },
    { id: "streetDoc",    label: "Street Doc",    family: "fighter", keySkill: "medicine",     origins: ["mundane"] },
    // Face / Thief
    { id: "face",         label: "Face",          family: "face",    keySkill: "con",          origins: ["mundane", "magic", "infected"] },
    // Decker (one archetype, tilted by affinity — see generateRunner)
    { id: "decker",       label: "Decker",        family: "decker",  keySkill: "computer",     origins: ["cyber", "mundane"] },
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

  // ── Flavor pools ───────────────────────────────────────────────
  // Deliberately small placeholders, and deliberately NOT wired to
  // any mechanical value — personality/aims text stays inert per
  // the design rule (§03): the only legible market signal is the
  // Discipline line, never the flavor text.
  const HANDLES = [
    "Chrome", "Dodger", "Wraith", "Static", "Copper", "Halcyon", "Torque",
    "Marrow", "Ledger", "Vex", "Quill", "Ballast", "Ember", "Thistle",
    "Grit", "Nickel", "Ferro", "Lumen", "Ratchet", "Sable",
  ];
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
  function generateAttributes(rng, metatypeId, family) {
    const mods = METATYPES[metatypeId].mods;
    const base = () => rng.int(2, 5);
    const attrs = {
      body: base() + (mods.body || 0),
      agility: base() + (mods.agility || 0),
      willpower: base() + (mods.willpower || 0),
      intelligence: base() + (mods.intelligence || 0),
      charisma: base() + (mods.charisma || 0),
      magic: 0,
    };
    for (const k of Object.keys(attrs)) {
      if (k !== "magic") attrs[k] = Math.max(1, attrs[k]);
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
  // Specialist: one towering key skill, a couple of supporting
  // skills at a modest level, everything else near zero.
  // Generalist: a broad handful of skills at a solid, even level,
  // no single skill allowed to look like a true peak.
  function generateSkillSpread(rng, focus, trueArchetype) {
    const skills = {};
    for (const s of SKILLS) skills[s] = 0;

    // Every runner gets baseline competence in Firearms — the
    // common (not universal) formation contribution (§09) — unless
    // their family has no combat presence at all (pure mages lean
    // on spells instead, but a little firearms familiarity is fine).
    skills.firearms = rng.int(1, 3);

    if (trueArchetype === "specialist") {
      skills[focus.keySkill] = rng.int(7, 9);
      // A couple of supporting skills at a modest level — enough
      // to be a person, not enough to look like a second peak.
      const supportPool = SKILLS.filter((s) => s !== focus.keySkill && s !== "firearms");
      const supportCount = rng.int(2, 3);
      for (const s of rng.shuffle(supportPool).slice(0, supportCount)) {
        skills[s] = rng.int(2, 4);
      }
    } else {
      // Generalist: a broader set at solid-but-unspectacular levels.
      // Include the focus's key skill among them — they're still
      // recognizably in that line of work, just not a spike at it.
      const pool = SKILLS.filter((s) => s !== "firearms" && s !== focus.keySkill);
      const spreadCount = rng.int(4, 6);
      skills[focus.keySkill] = rng.int(4, 6);
      for (const s of rng.shuffle(pool).slice(0, spreadCount)) {
        skills[s] = rng.int(3, 5);
      }
    }
    return skills;
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

  // NOTE — scale: this returns a karma-cost-derived value (roughly
  // 40-250 for a fresh runner), NOT a final nuyen figure. The rest
  // of the design (job pay, gear, hiring costs) runs in the
  // thousands of nuyen. A NUYEN_PER_VALUE conversion multiplier
  // belongs in Phase 1 once the wider economy exists to calibrate
  // against — deliberately not guessed at here.
  function computePrice(runner) {
    const base = trueValue(getEffectiveSkills(runner));
    const c = runner.classification;
    if (c.disciplineLabel === c.trueArchetype) return Math.round(base);
    const mult = c.disciplineLabel === "specialist" ? KARMA_HYPE_MULT : KARMA_BARGAIN_MULT;
    return Math.round(base * mult);
  }

  // ── Effective skills: base minus wound penalty on the key skill ─
  // Implant modifiers aren't generated yet (no crafting/armory in
  // Phase 0) — this is the read-time formula from §09, ready for
  // implant bonuses to slot into later without changing callers.
  function getEffectiveSkills(runner) {
    const out = Object.assign({}, runner.skills);
    const key = runner.classification.focusKeySkill;
    if (runner.wounds > 0 && out[key] !== undefined) {
      out[key] = Math.max(0, out[key] - runner.wounds);
    }
    return out;
  }

  function describeDiscipline(runner) {
    const c = runner.classification;
    return c.disciplineLabel === "specialist"
      ? `Specialist: ${c.focusLabel}`
      : "Generalist";
  }

  // ── Decker affinity (a tilt on the one archetype, §04) ────────
  function generateDeckerAffinity(rng) {
    return rng.pick(["masking", "attack", "search"]);
  }

  // ── Identity ───────────────────────────────────────────────────
  function generateIdentity(rng, metatypeId) {
    return {
      handle: rng.pick(HANDLES) + "_" + rng.int(10, 99),
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
    const focus = r.pick(candidates);

    const origin = options.origin || r.pick(focus.origins);
    const metatypeId = options.metatype || r.pick(METATYPE_IDS);

    const trueArchetype = r.chance(0.5) ? "specialist" : "generalist";
    const disciplineLabel = generateDiscipline(r, trueArchetype);

    const attrs = applyMagic(r, generateAttributes(r, metatypeId, focus.family), focus.family, origin);
    const essence = generateEssence(r, origin);
    const skills = generateSkillSpread(r, focus, trueArchetype);

    const runner = {
      identity: generateIdentity(r, metatypeId),
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
      },
      attributes: attrs,
      essence: essence,
      skills: skills,
      wounds: 0,
      karma: 0,
      market: {
        state: "unwatched", // "unwatched" | "watched"
        hired: null,        // null | { tier: "freelance"|"retainer"|"permanent", ... }
        daysOnMarket: 0,
        // Shelf-life / Working / OutOfTown / KIA state machine (§03)
        // is Phase 1 roster-board territory — fields reserved here
        // so the record shape doesn't change shape later.
        hiddenShelfDaysRemaining: r.int(3, 14),
      },
    };

    return runner;
  }

  MJ.SKILLS = SKILLS;
  MJ.METATYPES = METATYPES;
  MJ.FOCUSES = FOCUSES;
  MJ.focusById = focusById;
  MJ.generateRunner = generateRunner;
  MJ.getEffectiveSkills = getEffectiveSkills;
  MJ.computePrice = computePrice;
  MJ.describeDiscipline = describeDiscipline;
  MJ.karmaCost = karmaCost;   // exposed for inspection/tuning — real SR5 rank cost curve
  MJ.trueValue = trueValue;   // exposed for inspection/tuning — the undistorted honest value
})();
