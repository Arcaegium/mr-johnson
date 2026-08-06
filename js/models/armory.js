/* ============================================================
   Mr. Johnson — models/armory.js
   Equipment: the operation's second roster (current understanding §09
   "Equipment belongs to the operation, not to any one runner").

   Core rules this file implements:
     - Gear is property: owned by the operation, issued to a
       runner for as long as the player says, reclaimed and
       reassigned freely. Runners are people, priced dynamically,
       at risk; equipment is bought once and allocated. "Two
       deckers, one top-tier deck" is a real decision — issuing is
       exclusive, and reissuing takes it off the old carrier.
     - In the management layer, gear is DICE: an item grants bonus
       dice to its one skill (Wave 1 abstraction — decks become
       the §05 card game, drones the rigger's jump-in, foci real
       casting, only in the Phase 2 pillar systems). Bonus scales
       with item tier (ceil(tier/3)); the best tool in hand wins —
       NO stacking two decks. Gear never rescues untrained
       (resolve.js's rule): a smartgun helps a shooter, not a
       surgeon.
     - Cyberware is the exception to reassignable equipment (§09):
       surgery CONSUMES the item, spends the runner's Essence
       (never recovered), and leaves permanent skill modifiers on
       the dossier. Essence loss already bites elsewhere — Medicae
       case severity — so chrome is a real trade, not a free buff.
     - Crafting produces these items (mission.js's template-mode
       crafting yields real instances that land in save.armory via
       the integration layer). Harvested materials stack in
       save.armory.materials for resale.

   Placeholders, flagged: the template list is a starter registry
   ("systems are expensive, rows are cheap" — every future item is
   a row); the tier->bonus curve, Essence floor (0.5), and the
   one-skill-per-item shape are v1 dials; material-consuming
   crafting recipes and surgery-as-a-Medicae-dispatch are future
   work.

   Usage:
     const item = MJ.makeItem("deckMk1");
     MJ.issueItem(item, runner); MJ.reclaimItem(item);
     MJ.gearBonusFor(runner, "hacking");   // -> bonus dice
     MJ.implantSurgery(runner, item, save.armory.items);
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  // Tier -> bonus dice: T1-3 +1, T4-6 +2, T7-9 +3 (placeholder shape).
  function gearBonusForTier(tier) {
    return Math.ceil(tier / 3);
  }

  // ── The template registry ───────────────────────────────────────
  // skill: the one skill the item boosts when issued.
  // craftSkill: what a crafter rolls to make one (cyberware is
  // buy-only in v1). Note droneMk kits craft on rigging — gated to
  // riggers, which is thematically right: only a rigger builds one.
  // Category coverage researched against SR5's gear taxonomy
  // (weapon classes; armor; decks + programs; drones; the foci
  // families; spell formulas; medical patches / combat drugs /
  // grenades) — names are ORIGINAL, roles are the homage.
  // New effect shapes beyond skill-boost gear:
  //   armor       -> woundGuard: absorbs critical-glitch wounds
  //                  per mission, tier-scaled, reusable.
  //   consumable  -> single use, auto-triggered, then gone:
  //                  effect "boost" adds dice to ONE roll of its
  //                  skill; effect "absorbWound" eats a wound.
  //   program     -> boosts its skill only while the carrier also
  //                  holds a deck (requires: "deck").
  //   formula     -> taught to a mage (consumed), recorded in
  //                  spellFormulasKnown — real casting mechanics
  //                  arrive with the Phase 2 magic pillar, flagged.
  const ITEM_TEMPLATES = {
    // ── Weapons ──────────────────────────────────────────────────
    holdout:      { label: "Vesper Holdout Pistol",  category: "weapon", tier: 1, skill: "firearms",     craftSkill: "electronics", combat: "holdout" },
    heavyPistol:  { label: "Kestrel Heavy Pistol",   category: "weapon", tier: 3, skill: "firearms",     craftSkill: "electronics", combat: "pistol" },
    smartgun:     { label: "Smartgun",               category: "weapon", tier: 3, skill: "firearms",     craftSkill: "electronics", combat: "pistol" },
    hornetSmg:    { label: "Hornet SMG",             category: "weapon", tier: 4, skill: "firearms",     craftSkill: "electronics", combat: "smg" },
    longhornAR:   { label: "Longhorn Assault Rifle", category: "weapon", tier: 5, skill: "firearms",     craftSkill: "electronics", combat: "smg" },
    doorknocker:  { label: "Doorknocker Shotgun",    category: "weapon", tier: 4, skill: "firearms",     craftSkill: "electronics", combat: "shotgun" },
    sniperRig:    { label: "Sniper Rig",             category: "weapon", tier: 4, skill: "marksmanship", craftSkill: "electronics", combat: "rifle" },
    farsight:     { label: "Farsight Rail Rifle",    category: "weapon", tier: 7, skill: "marksmanship", craftSkill: "electronics", combat: "rifle" },
    sledgeLmg:    { label: "Sledge LMG",             category: "weapon", tier: 5, skill: "heavyWeapons", craftSkill: "electronics", combat: "machinegun" },
    mortarboy:    { label: "Mortarboy Launcher",     category: "weapon", tier: 7, skill: "heavyWeapons", craftSkill: "electronics", combat: "machinegun" },
    shockBaton:   { label: "Shock Baton",            category: "weapon", tier: 2, skill: "melee",        craftSkill: "electronics", combat: "baton" },
    monoblade:    { label: "Monoblade",              category: "weapon", tier: 3, skill: "melee",        craftSkill: "electronics", combat: "blade" },
    fangBlade:    { label: "Fang Blade",             category: "weapon", tier: 5, skill: "melee",        craftSkill: "electronics", combat: "blade" },
    filamentWhip: { label: "Filament Whip",          category: "weapon", tier: 7, skill: "melee",        craftSkill: "electronics", combat: "blade" },
    demoKit:      { label: "Demolitions Kit",        category: "weapon", tier: 4, skill: "demolitions",  craftSkill: "electronics" },
    // ── Armor (woundGuard = absorbs crit-glitch wounds/mission) ──
    // The bottom rung, and it has to exist. Personal kit caps a
    // runner's armour at ceil(rank/2), so a combat rank of 1 or 2
    // allows tier 1 only — and with nothing at tier 1 the armour slot
    // came up EMPTY. Measured: 39% of all runners walked in with no
    // armour at all, 0% at ranks 1-2 and 100% from rank 3, which is a
    // threshold, not a curve. A decker and a mage turning up naked to
    // a firefight is not "lightly equipped", it is one SMG burst each.
    // ── THE LADDER IS CONTIGUOUS, 1-8, AND THAT MATTERS ──────────
    // It used to run 1, 2, 3, 6, 8, and the holes were not cosmetic.
    // Armour is one side of the Penetrate gate (Power vs Armour), so
    // every armour rating a weapon can demand has to be BUYABLE or
    // the gate has bands nobody can ever stand in. With a hole at 4-5
    // the best affordable coat left a crew one point short of the
    // softest target in the game, and the next rung up was a 3.5x
    // price jump — so "buy better armour" was not a decision, it was
    // a wall with a door on the far side of it.
    paddedVest:      { label: "Padded Vest",          category: "armor", tier: 1, craftSkill: "electronics" },
    linedCoat:       { label: "Lined Streetcoat",     category: "armor", tier: 2, craftSkill: "electronics" },
    kevlarLong:      { label: "Kevlar Longcoat",      category: "armor", tier: 3, craftSkill: "electronics" },
    ballisticJacket: { label: "Ballistic Jacket",     category: "armor", tier: 4, craftSkill: "electronics" },
    corpsecPlate:    { label: "Corpsec Plate",        category: "armor", tier: 5, craftSkill: "electronics" },
    riotCarapace:    { label: "Riot Carapace",        category: "armor", tier: 6, craftSkill: "electronics" },
    breacherRig:     { label: "Breacher Rig",         category: "armor", tier: 7, craftSkill: "electronics" },
    milspecSuit:     { label: "Milspec Hardsuit",     category: "armor", tier: 8, craftSkill: "electronics" },
    // ── Decks & programs ─────────────────────────────────────────
    deckMk1:      { label: "Cyberdeck Mk1",          category: "deck", tier: 3, skill: "hacking", craftSkill: "computer" },
    deckMk2:      { label: "Cyberdeck Mk2",          category: "deck", tier: 6, skill: "hacking", craftSkill: "computer" },
    deckMk3:      { label: "Cyberdeck Mk3",          category: "deck", tier: 9, skill: "hacking", craftSkill: "computer" },
    hammerSuite:  { label: "Hammer Attack Suite",    category: "program", tier: 3, skill: "hacking",     craftSkill: "computer", requires: "deck" },
    ghostware:    { label: "Ghostware Sleaze Suite", category: "program", tier: 5, skill: "hacking",     craftSkill: "computer", requires: "deck" },
    locksmith:    { label: "Locksmith Utility",      category: "program", tier: 3, skill: "electronics", craftSkill: "computer", requires: "deck" },
    watchdog:     { label: "Watchdog Agent",         category: "program", tier: 4, skill: "computer",    craftSkill: "computer", requires: "deck" },
    // ── Drones ───────────────────────────────────────────────────
    hummingbird:  { label: "Hummingbird Spy Drone",  category: "drone", tier: 2, skill: "rigging", craftSkill: "rigging" },
    droneMk1:     { label: "Drone Kit Mk1",          category: "drone", tier: 3, skill: "rigging", craftSkill: "rigging" },
    bulldog:      { label: "Bulldog Combat Drone",   category: "drone", tier: 5, skill: "rigging", craftSkill: "rigging" },
    droneMk2:     { label: "Drone Kit Mk2",          category: "drone", tier: 6, skill: "rigging", craftSkill: "rigging" },
    // ── Foci & talismans (the SR foci families, our skills) ──────
    sorceryFocus: { label: "Spellcasting Focus",     category: "focus", tier: 4, skill: "sorcery",    craftSkill: "enchanting" },
    wardingCharm: { label: "Warding Charm",          category: "focus", tier: 3, skill: "sorcery",    craftSkill: "enchanting" },
    sustainRing:  { label: "Sustaining Ring",        category: "focus", tier: 6, skill: "sorcery",    craftSkill: "enchanting" },
    spiritFetish: { label: "Spirit Fetish",          category: "focus", tier: 4, skill: "conjuring",  craftSkill: "enchanting" },
    banishingRod: { label: "Banishing Rod",          category: "focus", tier: 6, skill: "conjuring",  craftSkill: "enchanting" },
    qiTalisman:   { label: "Qi Talisman",            category: "focus", tier: 4, skill: "assensing",  craftSkill: "enchanting" },
    alchemistKit: { label: "Alchemist's Retort",     category: "focus", tier: 3, skill: "enchanting", craftSkill: "enchanting" },
    // ── Kits & worn gear ─────────────────────────────────────────
    stealthSuit:  { label: "Stealth Suit",           category: "gear", tier: 3, skill: "stealth",     craftSkill: "electronics" },
    chameleonWeave:{ label: "Chameleon Weave",       category: "gear", tier: 6, skill: "stealth",     craftSkill: "electronics" },
    medkit:       { label: "Medkit",                 category: "gear", tier: 3, skill: "medicine",    craftSkill: "medicine" },
    surgeonField: { label: "Field Surgery Kit",      category: "gear", tier: 6, skill: "medicine",    craftSkill: "medicine" },
    toolkit:      { label: "Toolkit",                category: "gear", tier: 3, skill: "electronics", craftSkill: "electronics" },
    lockpicks:    { label: "Lockpick Set",           category: "gear", tier: 2, skill: "larceny",     craftSkill: "electronics" },
    sequencer:    { label: "Maglock Sequencer",      category: "gear", tier: 5, skill: "larceny",     craftSkill: "electronics" },
    disguiseKit:  { label: "Disguise Kit",           category: "gear", tier: 3, skill: "con",         craftSkill: "electronics" },
    voiceEcho:    { label: "Echo Voice Rig",         category: "gear", tier: 5, skill: "con",         craftSkill: "electronics" },
    ascentRig:    { label: "Ascent Climbing Rig",    category: "gear", tier: 2, skill: "athletics",   craftSkill: "electronics" },
    squadlink:    { label: "Squadlink Comms",        category: "gear", tier: 3, skill: "leadership",  craftSkill: "electronics" },
    // ── Consumables: patches, drugs, grenades (single use) ───────
    stimPatch:    { label: "Stim Patch",         category: "consumable", tier: 1, effect: "absorbWound", craftSkill: "medicine" },
    traumaPatch:  { label: "Trauma Patch",       category: "consumable", tier: 3, effect: "absorbWound", craftSkill: "medicine" },
    plateletDose: { label: "Platelet Doser",     category: "consumable", tier: 5, effect: "absorbWound", craftSkill: "medicine" },
    smokeGrenade: { label: "Smoke Grenade",      category: "consumable", tier: 3, effect: "boost", skill: "stealth",     craftSkill: "electronics" },
    flashbang:    { label: "Flashbang",          category: "consumable", tier: 3, effect: "boost", skill: "firearms",    craftSkill: "electronics" },
    breachCharge: { label: "Breaching Charge",   category: "consumable", tier: 5, effect: "boost", skill: "demolitions", craftSkill: "electronics" },
    reflexShot:   { label: "Reflex Booster Shot",category: "consumable", tier: 4, effect: "boost", skill: "firearms",    craftSkill: "medicine" },
    adrenalSpike: { label: "Adrenal Spike",      category: "consumable", tier: 3, effect: "boost", skill: "athletics",   craftSkill: "medicine" },
    silverTongue: { label: "Silver Tongue Dose", category: "consumable", tier: 3, effect: "boost", skill: "con",         craftSkill: "medicine" },
    focusDraught: { label: "Focus Draught",      category: "consumable", tier: 3, effect: "boost", skill: "sorcery",     craftSkill: "enchanting" },
    overclockChip:{ label: "Overclock Chip",     category: "consumable", tier: 3, effect: "boost", skill: "hacking",     craftSkill: "computer" },
    // ── Spell formulas (taught, not issued — §04's mage content) ─
    fmlManabolt:  { label: "Formula: Manabolt",     category: "formula", tier: 3, spellCategory: "combat",       craftSkill: "enchanting" },
    fmlHeal:      { label: "Formula: Mend",         category: "formula", tier: 3, spellCategory: "health",       craftSkill: "enchanting" },
    fmlVeil:      { label: "Formula: Veil",         category: "formula", tier: 4, spellCategory: "illusion",     craftSkill: "enchanting" },
    fmlSeeker:    { label: "Formula: Seeker's Eye", category: "formula", tier: 3, spellCategory: "detection",    craftSkill: "enchanting" },
    fmlLevitate:  { label: "Formula: Levitate",     category: "formula", tier: 4, spellCategory: "manipulation", craftSkill: "enchanting" },
    fmlBarrier:   { label: "Formula: Aegis",        category: "formula", tier: 5, spellCategory: "health",       craftSkill: "enchanting" },
    // ── Cyberware — implanted, not issued; surgery consumes ──────
    datajack:        { label: "Datajack",             category: "cyberware", tier: 2, essenceCost: 0.3, skillMods: { hacking: 1, computer: 1 } },
    smartlink:       { label: "Smartlink",            category: "cyberware", tier: 3, essenceCost: 0.6, skillMods: { firearms: 2 } },
    cybereyes:       { label: "Cybereyes",            category: "cyberware", tier: 3, essenceCost: 0.5, skillMods: { marksmanship: 2 } },
    voiceMod:        { label: "Voice Modulator",      category: "cyberware", tier: 3, essenceCost: 0.4, skillMods: { con: 2 } },
    synthacardium:   { label: "Synthacardium",        category: "cyberware", tier: 3, essenceCost: 0.6, skillMods: { athletics: 2 } },
    cerebralBooster: { label: "Cerebral Booster",     category: "cyberware", tier: 4, essenceCost: 0.8, skillMods: { computer: 1, electronics: 1 } },
    reflexWiring:    { label: "Reflex Wiring",        category: "cyberware", tier: 5, essenceCost: 1.2, skillMods: { firearms: 1, melee: 1 } },
    controlRig:      { label: "Control Rig",          category: "cyberware", tier: 5, essenceCost: 1.0, skillMods: { rigging: 2 } },
    boneLacing:      { label: "Titanium Bone Lacing", category: "cyberware", tier: 5, essenceCost: 1.5, skillMods: { melee: 2, athletics: 1 } },
    wiredReflexes:   { label: "Wired Reflexes",       category: "cyberware", tier: 7, essenceCost: 2.0, skillMods: { firearms: 2, melee: 2 } },
  };

  const ESSENCE_FLOOR = 0.5; // nobody chromes past this (placeholder)

  let nextItemId = 1;

  function makeItem(templateId) {
    const t = ITEM_TEMPLATES[templateId];
    return { id: nextItemId++, templateId: templateId, label: t.label, tier: t.tier, issuedTo: null };
  }

  // ── Personal kit: what a professional owns before you hire them ─
  // §03 says gear "is owned outright by the Johnson's operation, not
  // generated as part of a runner's dossier," and the reason it
  // gives is the allocation decision — "two decker runners but only
  // one top-tier deck." That reason survives intact here, because
  // personal kit is deliberately capped BELOW the good stuff: the
  // armoury is the only route past mid-tier, so the one Farsight
  // still forces a choice about who carries it.
  //
  // What it fixes is the absurdity underneath: a hired street
  // samurai was turning up to a firefight with their fists, because
  // every weapon in the game had to be bought and issued by hand. A
  // professional owns a sidearm. They do not own a milspec hardsuit.
  //
  // Tier scales off the skill the item serves — a rank-9 shooter
  // owns better hardware than a rank-2 ganger — because that is the
  // same thing their price is already derived from.
  const PERSONAL_TIER_CAP = 4;

  // Best personal-grade option per skill, worst first.
  const KIT_BY_SKILL = {
    firearms:     ["holdout", "heavyPistol", "hornetSmg"],
    marksmanship: ["holdout", "sniperRig"],
    heavyWeapons: ["heavyPistol", "doorknocker"],
    melee:        ["shockBaton", "monoblade"],
    demolitions:  ["demoKit"],
    hacking:      ["deckMk1"],
    rigging:      ["hummingbird", "droneMk1"],
    sorcery:      ["wardingCharm", "sorceryFocus"],
  };
  // Personal armour tops out at the tier cap, same as every other kit
  // list — a runner with a real combat record owns a jacket that
  // stops a holdout round, and turning up in a padded vest at rank 8
  // was never a statement about them, it was the list running out.
  const PERSONAL_ARMOR = ["paddedVest", "linedCoat", "kevlarLong", "ballisticJacket"];

  function personalTierFor(rank) {
    return Math.max(1, Math.min(PERSONAL_TIER_CAP, Math.ceil(rank / 2)));
  }

  // Pick the best entry whose tier the runner's rank justifies.
  function bestKitFor(list, rank) {
    const cap = personalTierFor(rank);
    let choice = null;
    for (const id of list) {
      const t = ITEM_TEMPLATES[id];
      if (!t || t.tier > cap) continue;
      if (!choice || t.tier > ITEM_TEMPLATES[choice].tier) choice = id;
    }
    return choice;
  }

  // Everything this runner turns up carrying. Marked `personal` so
  // the armoury can refuse to sell or reassign it — it is theirs,
  // and it leaves with them.
  function generatePersonalKit(runner) {
    const skills = MJ.getEffectiveSkills(runner);
    const kit = [];
    const take = (id) => {
      if (!id) return;
      const item = makeItem(id);
      item.personal = true;
      item.issuedTo = runner;
      // Deterministic id, NOT the global counter. Kit is minted
      // during runner generation, so a shared counter made an item's
      // id depend on how many runners happened to be generated
      // first — which differs between runs and broke the "same seed,
      // byte-identical state" guarantee outright. A runner's own kit
      // is a pure function of the runner, so its ids must be too.
      item.id = "kit:" + runner.identity.handle + ":" + kit.length;
      kit.push(item);
    };

    // The tool for whatever they are actually best at, among the
    // skills that HAVE a tool.
    let bestSkill = null;
    for (const skill of Object.keys(KIT_BY_SKILL)) {
      const rank = skills[skill] || 0;
      if (rank > 0 && (!bestSkill || rank > skills[bestSkill])) bestSkill = skill;
    }
    if (bestSkill) take(bestKitFor(KIT_BY_SKILL[bestSkill], skills[bestSkill]));

    // A sidearm, if their trade did not already give them one. Even
    // a decker owns something to point at people.
    const gunRank = Math.max(skills.firearms || 0, skills.marksmanship || 0);
    if (gunRank > 0 && bestSkill !== "firearms" && bestSkill !== "marksmanship") {
      take(bestKitFor(KIT_BY_SKILL.firearms, gunRank));
    }

    // Something to stop a bullet, scaled to how dangerous their work
    // is — the shooters and the sluggers turn up in real armour, the
    // face turns up in a nice coat.
    const combatRank = Math.max(
      skills.firearms || 0, skills.marksmanship || 0,
      skills.melee || 0, skills.heavyWeapons || 0);
    take(bestKitFor(PERSONAL_ARMOR, Math.max(1, combatRank)));

    return kit;
  }

  // ── Crafted quality: why you build one you could just buy ──────
  // A crafted item is ALWAYS better than the shop version of the
  // same thing. Not cheaper — better. That is what keeps the bench
  // worth using at every tier: a top-end decker who walked in with
  // the best deck money buys is still worth building a new deck
  // FOR, because yours will be tuned in a way the shop's is not.
  //
  // The edge is paid for in the one currency that never
  // replenishes: a runner's days. Someone is at the bench instead
  // of on a job while the board keeps turning. That is why crafted
  // being strictly better does not kill the shop — the shop sells
  // you TIME, which is the scarce thing.
  //
  // Quality is a small integer on top of the item's tier, so it
  // feeds everything tier already feeds — bonus dice, armour
  // rating, weapon Power — without a parallel stat system. It
  // starts at 1 (a crafted item is never merely equal) and rises
  // with how well the craft roll went.
  const MAX_CRAFT_QUALITY = 3;

  function craftQualityFromMargin(margin) {
    return Math.max(1, Math.min(MAX_CRAFT_QUALITY, 1 + Math.floor((margin || 0) / 2)));
  }

  // Effective tier: what the item behaves as. Everything that reads
  // tier for a mechanical effect must read this instead, or crafted
  // quality would be a label with no teeth.
  function effectiveTier(item) {
    return (item.tier || 0) + (item.quality || 0);
  }

  // The named edge, for the dossier. Mechanically it is all the same
  // quality number; the label is what tells the player WHY this one
  // is better, and it is drawn from what the item actually does.
  const CRAFT_MARKS = {
    weapon: ["balanced", "tuned", "hand-loaded"],
    armor: ["reinforced", "layered", "form-fitted"],
    deck: ["overclocked", "cold-booted", "custom-firmware"],
    program: ["optimised", "hardened", "streamlined"],
    drone: ["trimmed", "rebalanced", "silent-running"],
    focus: ["deep-bonded", "resonant", "true-cut"],
    consumable: ["concentrated", "pure", "double-dosed"],
    cyberware: ["low-rejection", "nerve-matched", "clean-seated"],
  };

  function markCrafted(item, quality, rng) {
    const t = ITEM_TEMPLATES[item.templateId];
    item.crafted = true;
    item.quality = quality;
    const pool = CRAFT_MARKS[t.category] || ["well-made"];
    item.mark = rng ? rng.pick(pool) : pool[0];
    item.label = t.label + " (" + item.mark + ")";
    return item;
  }

  // ── ONE PER HAND: what a runner can actually have on them ───────
  // Nothing in this file stacks. `gearBonusFor` takes the MAX over a
  // skill, `armourRatingFor` the max over armour, `combatLoadoutFor`
  // picks a single weapon. So a second Padded Vest is not "more
  // armour", it is nuyen the player spent on nothing — and the
  // armoury let them, silently, which reads as a bug because it is
  // one. You wear one coat. You jack in with one deck.
  //
  // The slot is (category, skill), which is exactly as fine-grained
  // as the stacking rules are. Armour and decks carry no skill, so
  // they collapse to one apiece. Weapons key on skill, so a pistol
  // and a sniper rig is a real loadout — two pistols is not.
  //
  // CONSUMABLES ARE EXEMPT and must stay that way: they are one-shot,
  // `findConsumable` burns them one at a time, and carrying four
  // patches is the entire point of carrying patches.
  function gearSlotOf(template) {
    return template.category + "/" + (template.skill || "-");
  }

  // PERSONAL KIT DOES NOT OCCUPY THE SLOT. A runner's own holdout is
  // theirs, cannot be taken off them, and cost the operation nothing —
  // so if it blocked the slot, a runner who turned up with a pistol
  // could never be issued a better one, which would break the entire
  // reason the armoury exists. They carry both and `combatLoadoutFor`
  // reaches for the better one. Nothing is wasted, because the free
  // thing is the one going unused.
  //
  // What this refuses is a second thing THE OPERATION PAID FOR in a
  // slot that already holds one.
  function slotConflict(runner, item) {
    const t = ITEM_TEMPLATES[item.templateId];
    if (!t || t.category === "consumable") return null;
    const slot = gearSlotOf(t);
    for (const held of runner.gear || []) {
      if (held === item || held.consumed || held.personal) continue;
      const ht = ITEM_TEMPLATES[held.templateId];
      if (ht && gearSlotOf(ht) === slot) return held;
    }
    return null;
  }

  // ── Issue / reclaim: exclusive, always-consistent both ways ─────
  function issueItem(item, runner) {
    const t = ITEM_TEMPLATES[item.templateId];
    if (t.category === "cyberware") return { ok: false, error: "cyberware is implanted, not issued" };
    if (t.category === "formula") return { ok: false, error: "formulas are taught, not carried" };
    // Personal kit is theirs and leaves with them — it was never in
    // the armoury to reassign, and pooling it would turn every hire
    // into a free equipment delivery.
    if (item.personal) return { ok: false, error: "that is their own kit, not the operation's" };
    // Checked BEFORE anything moves. A refusal has to leave the world
    // exactly as it found it, including the item's old carrier — so
    // the conflict test cannot come after the reclaim.
    const clash = slotConflict(runner, item);
    if (clash) {
      return {
        ok: false, conflict: clash,
        error: "already carrying " + clash.label + " — take that off first",
      };
    }
    reclaimItem(item); // off the old carrier first — one item, one holder
    item.issuedTo = runner;
    runner.gear = runner.gear || [];
    runner.gear.push(item);
    return { ok: true };
  }

  function reclaimItem(item) {
    const holder = item.issuedTo;
    if (holder && holder.gear) {
      const i = holder.gear.indexOf(item);
      if (i !== -1) holder.gear.splice(i, 1);
    }
    item.issuedTo = null;
    return item;
  }

  // The best tool in hand for this skill — never stacked.
  // Consumables don't count here (they're one-shot, triggered at
  // roll time by mission.js); programs only run on a carried deck.
  function carriesCategory(runner, category) {
    return (runner.gear || []).some((g) => {
      const t = ITEM_TEMPLATES[g.templateId];
      return t && t.category === category && !g.consumed;
    });
  }

  function gearBonusFor(runner, skillId) {
    let best = 0;
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (!t || t.skill !== skillId) continue;
      if (t.category === "consumable") continue;
      if (t.requires && !carriesCategory(runner, t.requires)) continue;
      best = Math.max(best, gearBonusForTier(effectiveTier(item)));
    }
    return best;
  }

  // ── Armor: reusable per-mission wound guards ────────────────────
  function woundGuardFor(runner) {
    let best = 0;
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (t && t.category === "armor") best = Math.max(best, gearBonusForTier(effectiveTier(item)));
    }
    return best;
  }

  // ── The armoury, read as a combat loadout ──────────────────────
  // What a runner is actually carrying when a fight starts. The
  // weapon they bring is the best one they can USE — a monoblade in
  // the hands of someone with no melee training is worse than the
  // pistol they can actually shoot — so this ranks by the runner's
  // own skill first and the item's tier second. Nobody arrives
  // unarmed by accident; unarmed is the floor, not a bug.
  function combatWeaponFor(runner) {
    const skills = MJ.getEffectiveSkills(runner);
    let best = null;
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (!t || t.category !== "weapon" || !t.combat) continue;
      const rank = skills[t.skill] || 0;
      if (rank <= 0) continue; // cannot use what they were never taught
      const score = rank * 100 + effectiveTier(item);
      if (!best || score > best.score) best = { score: score, profile: t.combat, label: t.label };
    }
    return best ? best.profile : "unarmed";
  }

  // The whole combat loadout in one read: which weapon profile, how
  // good the specific instance is, and what they are wearing. One
  // call so the weapon and its quality can never be fetched from
  // different items.
  function combatLoadoutFor(runner) {
    const skills = MJ.getEffectiveSkills(runner);
    let best = null;
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (!t || t.category !== "weapon" || !t.combat) continue;
      const rank = skills[t.skill] || 0;
      if (rank <= 0) continue;
      const score = rank * 100 + effectiveTier(item);
      if (!best || score > best.score) {
        best = { score: score, weaponId: t.combat, quality: item.quality || 0, label: item.label };
      }
    }
    return {
      weaponId: best ? best.weaponId : "unarmed",
      weaponQuality: best ? best.quality : 0,
      weaponLabel: best ? best.label : "bare hands",
      armour: armourRatingFor(runner),
    };
  }

  // Armour rating for the Penetrate gate. Tier maps straight across:
  // a Lined Streetcoat is thin, a Milspec Hardsuit stops rifle rounds
  // that a shotgun cannot get through.
  function armourRatingFor(runner) {
    let best = 0;
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (t && t.category === "armor") best = Math.max(best, effectiveTier(item));
    }
    return best;
  }

  // ── Consumables: find and burn ──────────────────────────────────
  function findConsumable(runner, effect, skillId) {
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (!t || t.category !== "consumable" || t.effect !== effect) continue;
      if (effect === "boost" && t.skill !== skillId) continue;
      return item;
    }
    return null;
  }

  function consumeItem(item) {
    item.consumed = true; // integration sweeps consumed items from the racks
    const holder = item.issuedTo;
    if (holder && holder.gear) {
      const i = holder.gear.indexOf(item);
      if (i !== -1) holder.gear.splice(i, 1);
    }
    item.issuedTo = null;
    return item;
  }

  // ── Spell formulas: taught to a mage, consumed on learning ──────
  // Recorded on the dossier (spellFormulasKnown — the §09 field,
  // finally fed); real casting mechanics arrive with the Phase 2
  // magic pillar, flagged.
  function teachFormula(runner, item, armoryItems) {
    const t = ITEM_TEMPLATES[item.templateId];
    if (!t || t.category !== "formula") return { ok: false, error: "not a spell formula" };
    if (runner.classification.family !== "mage") return { ok: false, error: "only a mage can learn a formula" };
    runner.classification.spellFormulasKnown = runner.classification.spellFormulasKnown || [];
    if (runner.classification.spellFormulasKnown.indexOf(t.label) !== -1) {
      return { ok: false, error: "already knows it" };
    }
    runner.classification.spellFormulasKnown.push(t.label);
    const i = armoryItems.indexOf(item);
    if (i !== -1) armoryItems.splice(i, 1); // the copy is consumed in study
    return { ok: true };
  }

  // ── Cyberware surgery: consume, spend Essence, mark the dossier ─
  // v1 is an instant hub operation; making it a real Medicae
  // dispatch (Street Doc's internal job, §03) is flagged future work.
  function implantSurgery(runner, item, armoryItems) {
    const t = ITEM_TEMPLATES[item.templateId];
    if (!t || t.category !== "cyberware") return { ok: false, error: "not cyberware" };
    if (runner.essence.current - t.essenceCost < ESSENCE_FLOOR) {
      return { ok: false, error: "not enough Essence left — the body has limits" };
    }
    runner.essence.current = Math.round((runner.essence.current - t.essenceCost) * 100) / 100;
    runner.implants = runner.implants || [];
    runner.implants.push({ label: t.label, essenceCost: t.essenceCost, skillMods: Object.assign({}, t.skillMods) });
    const i = armoryItems.indexOf(item);
    if (i !== -1) armoryItems.splice(i, 1); // consumed — no taking it back out (§09)
    return { ok: true };
  }

  // What this runner would swing. Their carried weapon if it can be
  // swung, otherwise their fists — so brute force is always available
  // and a blade is never wasted. One definition, because the option
  // list, the label and the force chain must all agree on it.
  function meleeProfileFor(runner) {
    const loadout = MJ.combatLoadoutFor(runner);
    const w = MJ.weaponProfile(loadout.weaponId);
    if ((w.modes || []).indexOf("melee") !== -1) {
      return { id: loadout.weaponId, label: w.label, quality: loadout.weaponQuality || 0 };
    }
    return { id: "unarmed", label: MJ.weaponProfile("unarmed").label, quality: 0 };
  }
  MJ.meleeProfileFor = meleeProfileFor;

  MJ.ITEM_TEMPLATES = ITEM_TEMPLATES;
  MJ.gearBonusForTier = gearBonusForTier;
  MJ.makeItem = makeItem;
  MJ.issueItem = issueItem;
  MJ.reclaimItem = reclaimItem;
  MJ.gearBonusFor = gearBonusFor;
  MJ.woundGuardFor = woundGuardFor;
  MJ.gearSlotOf = gearSlotOf;
  MJ.slotConflict = slotConflict;
  MJ.generatePersonalKit = generatePersonalKit;
  MJ.personalTierFor = personalTierFor;
  MJ.PERSONAL_TIER_CAP = PERSONAL_TIER_CAP;
  MJ.combatWeaponFor = combatWeaponFor;
  MJ.combatLoadoutFor = combatLoadoutFor;
  MJ.effectiveTier = effectiveTier;
  MJ.craftQualityFromMargin = craftQualityFromMargin;
  MJ.markCrafted = markCrafted;
  MJ.MAX_CRAFT_QUALITY = MAX_CRAFT_QUALITY;
  MJ.armourRatingFor = armourRatingFor;
  MJ.findConsumable = findConsumable;
  MJ.consumeItem = consumeItem;
  MJ.teachFormula = teachFormula;
  MJ.carriesCategory = carriesCategory;
  MJ.implantSurgery = implantSurgery;
})();
