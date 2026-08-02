/* ============================================================
   Mr. Johnson — models/armory.js
   Equipment: the operation's second roster (design bible §09
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
    holdout:      { label: "Vesper Holdout Pistol",  category: "weapon", tier: 1, skill: "firearms",     craftSkill: "electronics" },
    heavyPistol:  { label: "Kestrel Heavy Pistol",   category: "weapon", tier: 3, skill: "firearms",     craftSkill: "electronics" },
    smartgun:     { label: "Smartgun",               category: "weapon", tier: 3, skill: "firearms",     craftSkill: "electronics" },
    hornetSmg:    { label: "Hornet SMG",             category: "weapon", tier: 4, skill: "firearms",     craftSkill: "electronics" },
    longhornAR:   { label: "Longhorn Assault Rifle", category: "weapon", tier: 5, skill: "firearms",     craftSkill: "electronics" },
    doorknocker:  { label: "Doorknocker Shotgun",    category: "weapon", tier: 4, skill: "firearms",     craftSkill: "electronics" },
    sniperRig:    { label: "Sniper Rig",             category: "weapon", tier: 4, skill: "marksmanship", craftSkill: "electronics" },
    farsight:     { label: "Farsight Rail Rifle",    category: "weapon", tier: 7, skill: "marksmanship", craftSkill: "electronics" },
    sledgeLmg:    { label: "Sledge LMG",             category: "weapon", tier: 5, skill: "heavyWeapons", craftSkill: "electronics" },
    mortarboy:    { label: "Mortarboy Launcher",     category: "weapon", tier: 7, skill: "heavyWeapons", craftSkill: "electronics" },
    shockBaton:   { label: "Shock Baton",            category: "weapon", tier: 2, skill: "melee",        craftSkill: "electronics" },
    monoblade:    { label: "Monoblade",              category: "weapon", tier: 3, skill: "melee",        craftSkill: "electronics" },
    fangBlade:    { label: "Fang Blade",             category: "weapon", tier: 5, skill: "melee",        craftSkill: "electronics" },
    filamentWhip: { label: "Filament Whip",          category: "weapon", tier: 7, skill: "melee",        craftSkill: "electronics" },
    demoKit:      { label: "Demolitions Kit",        category: "weapon", tier: 4, skill: "demolitions",  craftSkill: "electronics" },
    // ── Armor (woundGuard = absorbs crit-glitch wounds/mission) ──
    linedCoat:    { label: "Lined Streetcoat",       category: "armor", tier: 2, craftSkill: "electronics" },
    kevlarLong:   { label: "Kevlar Longcoat",        category: "armor", tier: 3, craftSkill: "electronics" },
    riotCarapace: { label: "Riot Carapace",          category: "armor", tier: 6, craftSkill: "electronics" },
    milspecSuit:  { label: "Milspec Hardsuit",       category: "armor", tier: 8, craftSkill: "electronics" },
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
    squadlink:    { label: "Squadlink Comms",        category: "gear", tier: 3, skill: "presence",    craftSkill: "electronics" },
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

  // ── Issue / reclaim: exclusive, always-consistent both ways ─────
  function issueItem(item, runner) {
    const t = ITEM_TEMPLATES[item.templateId];
    if (t.category === "cyberware") return { ok: false, error: "cyberware is implanted, not issued" };
    if (t.category === "formula") return { ok: false, error: "formulas are taught, not carried" };
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
      best = Math.max(best, gearBonusForTier(item.tier));
    }
    return best;
  }

  // ── Armor: reusable per-mission wound guards ────────────────────
  function woundGuardFor(runner) {
    let best = 0;
    for (const item of runner.gear || []) {
      if (item.consumed) continue;
      const t = ITEM_TEMPLATES[item.templateId];
      if (t && t.category === "armor") best = Math.max(best, gearBonusForTier(item.tier));
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

  MJ.ITEM_TEMPLATES = ITEM_TEMPLATES;
  MJ.gearBonusForTier = gearBonusForTier;
  MJ.makeItem = makeItem;
  MJ.issueItem = issueItem;
  MJ.reclaimItem = reclaimItem;
  MJ.gearBonusFor = gearBonusFor;
  MJ.woundGuardFor = woundGuardFor;
  MJ.findConsumable = findConsumable;
  MJ.consumeItem = consumeItem;
  MJ.teachFormula = teachFormula;
  MJ.carriesCategory = carriesCategory;
  MJ.implantSurgery = implantSurgery;
})();
