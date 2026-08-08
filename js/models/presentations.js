/* ============================================================
   Mr. Johnson — models/presentations.js
   WHAT KIND OF <FOCUS> THIS ONE IS.

   A focus says what someone trained in. A PRESENTATION says what
   they became. Two Conjuring Mages can hold identical skills and be
   different professions — one calls spirits, one strips them off a
   warded site — because SR5's Summoning and Banishing are different
   skills that our `conjuring` collapsed into one. The presentations
   are those hidden sub-skills coming back, crossed with the
   attribute that pays for the work.

   THIS IS THE THING SKILLS CANNOT TELL YOU. `attributePriority` is
   derived from a runner's skills, and every magic skill maps to
   Magic — so a Puppeteer (Charisma), a Banisher (Willpower) and an
   Analyst (Intelligence) are indistinguishable by skill sheet and
   completely different hires. Presentation carries its own attribute
   order, and that order is the whole point of the file.

   THE CLASS IDENTIFIER NEVER LIES (design ruling). A runner labelled
   Summoner IS a summoner. More runner types is the depth we want:
   more specialised classes means more for the player to chase, from
   adding pieces to the same chessboard rather than new boards.
   What may still mislead is `disciplineLabel` — Specialist vs
   Generalist — and that has a reason in fiction: people think they
   are greater than they are, or that they can multi-task when they
   cannot. Self-assessment, not fraud.

   `attrs` is an ORDERED attribute priority, best first. It replaces
   the skill-derived order at birth. `favours` names the skills this
   presentation leans on beyond the focus's own primary, so the band
   allocator knows where the karma should go.
   ============================================================ */
(function () {
  window.MJ = window.MJ || {};

  const P = (id, label, attrs, favours, note) =>
    ({ id: id, label: label, attrs: attrs, favours: favours || [], note: note || "" });

  const PRESENTATIONS = {
    // ── Fighters ──────────────────────────────────────────────────
    heavyWeapons: [
      P("suppressor", "Suppressor", ["strength", "body", "agility"], ["heavyWeapons", "athletics"],
        "nobody crosses that hallway"),
      P("breacher", "Breacher", ["strength", "intelligence", "body"], ["demolitions", "heavyWeapons"],
        "the wall becomes a door"),
      P("cannoneer", "Cannoneer", ["agility", "strength", "intelligence"], ["marksmanship", "perception"],
        "precision at a calibre that should not have it"),
    ],
    demolitions: [
      P("breacher", "Breacher", ["intelligence", "agility", "body"], ["demolitions", "electronics"],
        "opens anything, on a timer"),
      P("trapper", "Trapper", ["intelligence", "agility", "willpower"], ["perception", "stealth"],
        "the room was ready before they arrived"),
      P("wrecker", "Wrecker", ["strength", "intelligence", "body"], ["heavyWeapons", "demolitions"],
        "removes the objective's building"),
    ],
    stealth: [
      P("infiltrator", "Infiltrator", ["agility", "intelligence", "willpower"], ["stealth", "athletics"],
        "in and out, no record"),
      P("secondStorey", "Second-Storey", ["agility", "intelligence", "body"], ["larceny", "perception"],
        "locks are a formality"),
      P("scout", "Scout", ["intelligence", "agility", "willpower"], ["perception", "stealth"],
        "the crew knew before they walked in"),
      P("ghostshooter", "Ghostshooter", ["agility", "intelligence", "strength"], ["marksmanship", "firearms"],
        "one shot, from somewhere nobody looked"),
    ],
    melee: [
      P("brawler", "Brawler", ["strength", "body", "agility"], ["melee", "athletics"],
        "wins by still standing"),
      P("blade", "Blade", ["agility", "strength", "intelligence"], ["melee", "stealth"],
        "quiet, close, finished"),
      P("bodyguard", "Bodyguard", ["body", "strength", "intelligence"], ["intimidation", "perception"],
        "the client is untouched"),
    ],
    marksman: [
      P("overwatch", "Overwatch", ["intelligence", "agility", "willpower"], ["perception", "marksmanship"],
        "sees it coming and ends it"),
      P("assassin", "Assassin", ["agility", "intelligence", "willpower"], ["stealth", "marksmanship"],
        "one shot, one contract"),
      P("designated", "Designated Shooter", ["agility", "strength", "body"], ["firearms", "marksmanship"],
        "reliable damage, every exchange"),
    ],
    // `tank` leads on intimidation, which is Charisma-linked: drawing
    // the attack is a social act, absorbing it is Body. The focus is
    // sound; only the name was wrong.
    tank: [
      P("wall", "Wall", ["body", "strength", "willpower"], ["athletics", "melee"],
        "the crew's damage goes here"),
      P("enforcer", "Enforcer", ["charisma", "body", "strength"], ["intimidation", "melee"],
        "the room does what he says"),
      P("frontline", "Frontline", ["body", "strength", "agility"], ["melee", "firearms"],
        "goes first, on purpose"),
    ],
    combatMedic: [
      P("fieldMedic", "Field Medic", ["intelligence", "body", "agility"], ["medicine", "athletics"],
        "the operation keeps its people"),
      P("traumaShooter", "Trauma Shooter", ["agility", "intelligence", "body"], ["firearms", "medicine"],
        "fights, then patches"),
    ],
    // The fighter family's CRAFTER. Cyberware is the only gear
    // category with no crafter and implants currently need no
    // surgeon; medicine is the skill that closes both.
    streetDoc: [
      P("surgeon", "Surgeon", ["intelligence", "agility", "willpower"], ["medicine", "electronics"],
        "the reason that chrome went in cleanly"),
      P("clinic", "Clinic", ["charisma", "intelligence", "willpower"], ["con", "leadership"],
        "knows who to call and what it costs"),
    ],

    // ── Faces ─────────────────────────────────────────────────────
    face: [
      P("grifter", "Grifter", ["charisma", "intelligence", "agility"], ["con"],
        "they wanted to believe him"),
      P("fixer", "Fixer", ["charisma", "intelligence", "willpower"], ["leadership", "con"],
        "knew a guy before the job started"),
      P("badge", "Badge", ["charisma", "agility", "intelligence"], ["con", "larceny"],
        "walked in through the front door"),
    ],
    leader: [
      P("commander", "Commander", ["charisma", "intelligence", "willpower"], ["leadership"],
        "the crew is better than its parts"),
      P("negotiator", "Negotiator", ["charisma", "intelligence", "willpower"], ["con", "leadership"],
        "the price moved"),
      P("sergeant", "Sergeant", ["charisma", "body", "agility"], ["firearms", "intimidation"],
        "leads from the front"),
    ],

    // ── Decker ────────────────────────────────────────────────────
    // The first three ARE `deckerAffinity`, which has been generated
    // all along and never meant anything. The fourth is the bench
    // decker: programs craft on `computer`, not `hacking`.
    decker: [
      P("ghost", "Ghost", ["intelligence", "agility", "willpower"], ["hacking", "stealth"],
        "was never in the host"),
      P("icebreaker", "Icebreaker", ["intelligence", "willpower", "body"], ["hacking", "computer"],
        "the ICE is gone, and everyone knows"),
      P("datamancer", "Datamancer", ["intelligence", "willpower", "agility"], ["computer", "hacking"],
        "comes out knowing everything"),
      P("coder", "Coder", ["intelligence", "willpower", "charisma"], ["computer", "electronics"],
        "writes what the others run"),
    ],

    // ── Rigger ────────────────────────────────────────────────────
    // Three of four wait on the extra-bodies system; the Mechanic is
    // buildable now and is the rigger's bench.
    rigger: [
      P("combatRigger", "Combat Rigger", ["intelligence", "agility", "willpower"], ["rigging", "firearms"],
        "brings bodies that are not people"),
      P("reconRigger", "Recon Rigger", ["intelligence", "willpower", "agility"], ["rigging", "perception"],
        "eyes everywhere, none of them his"),
      P("jumpedIn", "Jumped-In", ["agility", "intelligence", "body"], ["rigging"],
        "is the drone"),
      P("mechanic", "Mechanic", ["intelligence", "agility", "willpower"], ["electronics", "computer"],
        "keeps the fleet flying"),
    ],

    // ── Mages ─────────────────────────────────────────────────────
    // Willpower is the caster's real floor: it resists Drain and sets
    // the stun track. Every presentation that wants Force needs it,
    // and the ones that do not are genuinely different jobs.
    combatMage: [
      P("artillery", "Artillery", ["magic", "willpower", "body"], ["sorcery"],
        "levels the room, and is heard doing it"),
      P("spellAssassin", "Assassin", ["magic", "intelligence", "willpower"], ["sorcery", "stealth"],
        "one clean kill, no report"),
      P("sandman", "Sandman", ["magic", "willpower", "intelligence"], ["sorcery", "stealth"],
        "takes people off the board without bodies"),
    ],
    detectionMage: [
      P("astralScout", "Astral Scout", ["intelligence", "magic", "willpower"], ["assensing", "stealth"],
        "walks the site before the crew does"),
      P("interrogator", "Interrogator", ["charisma", "intelligence", "magic"], ["con", "assensing"],
        "the reason the guard's story fell apart"),
      P("analyst", "Analyst", ["intelligence", "magic", "willpower"], ["assensing", "electronics"],
        "reads the lock instead of picking it"),
      P("sentry", "Sentry", ["intelligence", "willpower", "magic"], ["perception", "assensing"],
        "nobody gets the drop on this crew"),
    ],
    healthMage: [
      P("healer", "Field Medic", ["intelligence", "magic", "willpower"], ["sorcery", "medicine"],
        "the reason the operation still has that runner"),
      P("forceMultiplier", "Force Multiplier", ["willpower", "magic", "charisma"], ["sorcery", "leadership"],
        "makes the samurai better than the samurai is"),
      P("saboteur", "Saboteur", ["magic", "willpower", "intelligence"], ["sorcery", "assensing"],
        "the enemy gets worse instead"),
    ],
    illusionMage: [
      P("veil", "Infiltrator", ["agility", "magic", "intelligence"], ["sorcery", "stealth"],
        "nobody was ever here"),
      P("showman", "Showman", ["charisma", "magic", "willpower"], ["sorcery", "con"],
        "everyone is looking at the wrong thing"),
      P("impersonator", "Impersonator", ["charisma", "intelligence", "magic"], ["sorcery", "con"],
        "walks in wearing someone else's face"),
      P("tormentor", "Tormentor", ["magic", "willpower", "charisma"], ["sorcery", "intimidation"],
        "wins by making it unbearable"),
    ],
    manipulationMage: [
      P("puppeteer", "Puppeteer", ["charisma", "willpower", "magic"], ["sorcery", "con"],
        "the guard opens the door himself"),
      P("telekinetic", "Telekinetic", ["intelligence", "magic", "agility"], ["sorcery", "larceny"],
        "never touches anything"),
      // NOT "Warder" — a ward is an obstacle type on a site, an astral
      // barrier somebody else built. This presentation casts Mana
      // Barrier and Physical Barrier, which are Manipulation SPELLS:
      // one action, then sustained. Two different things, and one name
      // between them would have read as though this mage made the
      // scenery.
      P("bulwark", "Bulwark", ["willpower", "magic", "body"], ["sorcery", "assensing"],
        "the crew survives the exchange"),
      P("controller", "Controller", ["magic", "willpower", "intelligence"], ["sorcery", "perception"],
        "shapes the fight before it starts"),
    ],
    conjuringMage: [
      P("summoner", "Summoner", ["magic", "willpower", "charisma"], ["conjuring", "assensing"],
        "brings more bodies than the crew has"),
      P("banisher", "Banisher", ["willpower", "magic", "intelligence"], ["conjuring", "assensing"],
        "strips the site of what is bound to it"),
      P("astralIntruder", "Astral Intruder", ["intelligence", "magic", "willpower"], ["assensing", "conjuring"],
        "goes in without a body"),
    ],
    enchantingMage: [
      P("artificer", "Artificer", ["intelligence", "magic", "willpower"], ["enchanting", "computer"],
        "writes the formulas other mages learn from"),
      P("alchemist", "Alchemist", ["intelligence", "magic", "willpower"], ["enchanting", "sorcery"],
        "the spell goes off without him there"),
    ],
  };

  function presentationsFor(focusId) {
    return PRESENTATIONS[focusId] || [];
  }

  function presentationDef(focusId, id) {
    return presentationsFor(focusId).find((p) => p.id === id) || null;
  }

  // A decker's affinity has been rolled since the beginning and never
  // meant anything. Where one exists, it IS the presentation — a
  // masking decker is a Ghost — rather than a second unrelated roll
  // that could contradict it.
  const AFFINITY_PRESENTATION = { masking: "ghost", attack: "icebreaker", search: "datamancer" };

  // The same link read backwards, for character creation: a player who
  // CHOSE Ghost must end up with the masking affinity underneath it,
  // or the two contradict each other in exactly the way pairing them
  // was meant to stop.
  function affinityForPresentation(presentationId) {
    for (const [affinity, id] of Object.entries(AFFINITY_PRESENTATION)) {
      if (id === presentationId) return affinity;
    }
    return null;
  }

  function pickPresentation(rng, focus, opts) {
    opts = opts || {};
    const list = presentationsFor(focus.id);
    if (!list.length) return null;
    if (opts.affinity && AFFINITY_PRESENTATION[opts.affinity]) {
      const matched = presentationDef(focus.id, AFFINITY_PRESENTATION[opts.affinity]);
      if (matched) return matched;
    }
    return rng.pick(list);
  }

  MJ.PRESENTATIONS = PRESENTATIONS;
  MJ.presentationsFor = presentationsFor;
  MJ.presentationDef = presentationDef;
  MJ.pickPresentation = pickPresentation;
  MJ.affinityForPresentation = affinityForPresentation;
})();
