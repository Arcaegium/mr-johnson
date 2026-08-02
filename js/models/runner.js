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

  // ── The 19-skill registry (design bible §09 + the gated-skill split) ─
  // Every skill maps to real verbs elsewhere in the design; this
  // list is the canonical set every runner's skill map is keyed by.
  const SKILLS = [
    "firearms", "heavyWeapons", "marksmanship", "melee", "demolitions",
    "stealth", "athletics", "medicine", "presence", "con", "larceny",
    "computer", "hacking", "electronics", "rigging",
    "sorcery", "conjuring", "enchanting", "assensing",
  ];

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

  // ── Focus templates: family, key skill, allowed origins ───────
  // Origins (cyber/magic/infected/mundane) live per-focus below —
  // cyber: mundane, chrome, Essence starts partially spent; magic:
  // adept/mage, full Essence kept, Magic attribute granted; infected:
  // HMHVV-flavored, mundane stats, distinct flavor only.
  // This table is the whole "systems are expensive, rows are
  // cheap" bet — every archetype in the bible is just a row here.
  const FOCUSES = [
    // Fighters
    { id: "heavyWeapons", label: "Heavy Weapons", family: "fighter", keySkill: "heavyWeapons", origins: ["cyber", "magic"] },
    { id: "demolitions",  label: "Demolitions",   family: "fighter", keySkill: "demolitions",  origins: ["cyber", "magic"] },
    { id: "stealth",      label: "Stealth",       family: "fighter", keySkill: "stealth",      origins: ["cyber", "magic", "infected"] },
    { id: "melee",        label: "Melee",         family: "fighter", keySkill: "melee",        origins: ["cyber", "magic"] },
    { id: "marksman",     label: "Marksman",      family: "fighter", keySkill: "marksmanship", origins: ["cyber", "magic"] },
    { id: "tank",         label: "Tank",          family: "fighter", keySkill: "presence",     origins: ["cyber", "magic"] },
    { id: "combatMedic",  label: "Combat Medic",  family: "fighter", keySkill: "medicine",     origins: ["cyber", "mundane"] },
    { id: "streetDoc",    label: "Street Doc",    family: "fighter", keySkill: "medicine",     origins: ["mundane"] },
    // Face / Thief
    { id: "face",         label: "Face",          family: "face",    keySkill: "con",          origins: ["mundane", "magic", "infected"] },
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
    stealth:          { list: ["stealth", "firearms", "larceny", "athletics", "melee"],                  specialistSecondary: 1, generalistSecondary: 3 },
    melee:            { list: ["melee", "athletics", "firearms", "presence", "stealth"],                 specialistSecondary: 1, generalistSecondary: 3 },
    marksman:         { list: ["marksmanship", "firearms", "stealth", "athletics"],                      specialistSecondary: 1, generalistSecondary: 2 },
    tank:             { list: ["presence", "melee", "firearms", "athletics", "heavyWeapons"],             specialistSecondary: 1, generalistSecondary: 3 },
    combatMedic:      { list: ["medicine", "firearms", "melee", "athletics", "stealth"],                  specialistSecondary: 1, generalistSecondary: 3 },
    streetDoc:        { list: ["medicine", "electronics", "presence", "con"],                             specialistSecondary: 1, generalistSecondary: 2 },
    face:             { list: ["con", "presence", "larceny", "athletics"],                                specialistSecondary: 1, generalistSecondary: 2 },
    decker:           { list: ["hacking", "computer", "electronics", "stealth", "larceny"],               specialistSecondary: 1, generalistSecondary: 3 },
    rigger:           { list: ["rigging", "electronics", "computer", "firearms", "athletics"],            specialistSecondary: 1, generalistSecondary: 3 },
    combatMage:       { list: ["sorcery", "assensing", "athletics", "stealth", "firearms"],               specialistSecondary: 1, generalistSecondary: 3 },
    detectionMage:    { list: ["assensing", "sorcery", "stealth", "athletics"],                           specialistSecondary: 1, generalistSecondary: 2 },
    healthMage:       { list: ["sorcery", "assensing", "enchanting", "presence"],                         specialistSecondary: 1, generalistSecondary: 2 },
    illusionMage:     { list: ["sorcery", "con", "stealth", "presence"],                                  specialistSecondary: 1, generalistSecondary: 2 },
    manipulationMage: { list: ["sorcery", "con", "presence", "assensing"],                                specialistSecondary: 1, generalistSecondary: 2 },
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

  function growRunner(runner, karmaAward, rng) {
    const tiers = runner.classification.skillTiers;
    const priorityOrder = [tiers.primary, ...tiers.secondary, ...tiers.tertiary];
    let remaining = karmaAward;
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

  // NOTE — scale: this returns a karma-cost-derived value (roughly
  // 40-250 for a fresh runner), NOT a final nuyen figure. The rest
  // of the design (job pay, gear, hiring costs) runs in the
  // thousands of nuyen. The conversion multiplier (NUYEN_PER_VALUE)
  // now lives in models/economy.js's hireCost(), which is the only
  // place this karma-cost scale actually gets turned into nuyen.
  function computePrice(runner) {
    const base = trueValue(getEffectiveSkills(runner));
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
    const key = runner.classification.focusKeySkill;
    if (runner.wounds > 0 && out[key] !== undefined) {
      out[key] = Math.max(0, out[key] - runner.wounds);
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
    const skillTiers = buildSkillTiers(r, focus, trueArchetype);
    const skills = generateSkillSpread(r, focus, trueArchetype, skillTiers);

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
        skillTiers: skillTiers,                // { primary, secondary[], tertiary[], overflow[] } — growth priority order
      },
      attributes: attrs,
      essence: essence,
      skills: skills,
      wounds: 0,
      karma: 0,
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

    return runner;
  }

  // ── The universe runner registry (§09 layer 1) ─────────────────
  // Same pattern as site.js's mintSite: runner #N of a universe is a
  // pure function of (universeSeed, index) — lazy, infinite, and
  // identical every time that universe asks.
  function mintRunner(universeSeed, index, options) {
    const runner = generateRunner(MJ.makeRNG(universeSeed).fork("runner-" + index), options);
    runner.identity.universeIndex = index;
    return runner;
  }

  MJ.SKILLS = SKILLS;
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
