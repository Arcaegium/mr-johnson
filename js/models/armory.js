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
  const ITEM_TEMPLATES = {
    smartgun:     { label: "Smartgun",         category: "weapon", tier: 3, skill: "firearms",     craftSkill: "electronics" },
    sniperRig:    { label: "Sniper Rig",       category: "weapon", tier: 4, skill: "marksmanship", craftSkill: "electronics" },
    monoblade:    { label: "Monoblade",        category: "weapon", tier: 3, skill: "melee",        craftSkill: "electronics" },
    deckMk1:      { label: "Cyberdeck Mk1",    category: "deck",   tier: 3, skill: "hacking",      craftSkill: "computer" },
    deckMk2:      { label: "Cyberdeck Mk2",    category: "deck",   tier: 6, skill: "hacking",      craftSkill: "computer" },
    droneMk1:     { label: "Drone Kit Mk1",    category: "drone",  tier: 3, skill: "rigging",      craftSkill: "rigging" },
    droneMk2:     { label: "Drone Kit Mk2",    category: "drone",  tier: 6, skill: "rigging",      craftSkill: "rigging" },
    sorceryFocus: { label: "Sorcery Focus",    category: "focus",  tier: 4, skill: "sorcery",      craftSkill: "enchanting" },
    spiritFetish: { label: "Spirit Fetish",    category: "focus",  tier: 4, skill: "conjuring",    craftSkill: "enchanting" },
    stealthSuit:  { label: "Stealth Suit",     category: "gear",   tier: 3, skill: "stealth",      craftSkill: "electronics" },
    medkit:       { label: "Medkit",           category: "gear",   tier: 3, skill: "medicine",     craftSkill: "medicine" },
    toolkit:      { label: "Toolkit",          category: "gear",   tier: 3, skill: "electronics",  craftSkill: "electronics" },
    lockpicks:    { label: "Lockpick Set",     category: "gear",   tier: 2, skill: "larceny",      craftSkill: "electronics" },
    disguiseKit:  { label: "Disguise Kit",     category: "gear",   tier: 3, skill: "con",          craftSkill: "electronics" },
    // Cyberware — implanted, not issued; surgery consumes the item.
    smartlink:       { label: "Smartlink",        category: "cyberware", tier: 3, essenceCost: 0.6, skillMods: { firearms: 2 } },
    reflexWiring:    { label: "Reflex Wiring",    category: "cyberware", tier: 5, essenceCost: 1.2, skillMods: { firearms: 1, melee: 1 } },
    cerebralBooster: { label: "Cerebral Booster", category: "cyberware", tier: 4, essenceCost: 0.8, skillMods: { computer: 1, electronics: 1 } },
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
  function gearBonusFor(runner, skillId) {
    let best = 0;
    for (const item of runner.gear || []) {
      const t = ITEM_TEMPLATES[item.templateId];
      if (t && t.skill === skillId) best = Math.max(best, gearBonusForTier(item.tier));
    }
    return best;
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
  MJ.implantSurgery = implantSurgery;
})();
