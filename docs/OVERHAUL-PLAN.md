# THE GENERATION OVERHAUL — complete plan

**Written 2026-08-06.** This document exists so the overhaul survives a lost
context window. It is self-contained: every decision, the reasoning behind it,
and what remains to build. Read this first when resuming.

Companions: `docs/MAGE-SHAPES.md` and `docs/RUNNER-SHAPES.md` (the presentation
tables — Phase A, complete). Governing docs remain `UNDERSTANDING.md` and
`SYSTEM-STATE.md`.

---

## 0. STATE OF THE TREE — read before touching code

`js/models/runner.js` has **uncommitted, half-finished work** and the suite is
**red: 4 failures** (C2, C11, C17, C22 — listed in §7).

That work implemented a *share-split* allocator (each tier gets a fixed
percentage of the pool). **That approach is superseded** — see D3. It produced
zero variance: every runner of a given archetype got identical off-stats.

**Recommended first action: revert `runner.js` to `HEAD` and start from clean.**
The salvageable ideas are already recorded here; the code is not worth keeping.

```
git checkout -- js/models/runner.js
```

Last good commit: `b1bd922`.

---

## 1. WHAT BROKE, AND WHY THIS IS AN OVERHAUL

Five findings, in the order they surfaced. Each is measured, not suspected.

1. **Generation was never karma-based.** Skills were rolled from `rng.int`
   bands; nothing was priced; no budget was spent. Meanwhile `trueValue` priced
   the *result* in karma, and `growRunner` spends karma for the rest of the
   runner's life. A runner was valued in a currency they were never built from.

2. **Tertiary skills were a hard zero.** `generateSkillSpread` filled primary
   and secondary only. This is the root cause of the mute mage (sorcery filed
   tertiary → sorcery 0 → a grimoire they cannot cast) and of conjurers with no
   Assensing. Both were patched at the symptom; neither was fixed at the source.

3. **The four floors were free.** firearms / assensing / perception / computer
   were tacked on after the roll at no cost, so a runner's price and their sheet
   described different people.

4. **`attributePriority` is skill-derived, and every magic skill maps to Magic.**
   It therefore cannot distinguish a Puppeteer (Charisma) from a Banisher
   (Willpower) from an Analyst (Intelligence) — identical skill sheets, three
   different professions. **Presentation cannot be inferred from skills.**

5. **The capability card under-counts.** The Armor spell doesn't reach the
   armour rating; gear contributions are incomplete. This makes the card lie in
   both directions and violates the Green Light Invariant (§3).

### Measured baseline (the old generator, priced on the SR5 curves)

| | skills | attributes | total |
|---|---|---|---|
| generalist | ~80k | ~255k | ~335k |
| specialist | ~84k | ~255k | ~339k |

Attributes are ~76% of a runner's cost because the attribute curve is ×5 per
point against skills' ×2. **Any new allocator must land near ~335k total** or it
has moved power, not just shape.

---

## 2. LOCKED DECISIONS

Decided in session, not to be relitigated without cause.

**D1 — One karma pool.** SR5's karma build buys everything from a single pile;
there is no separate attribute allowance. Attributes and skills come from one
pool. (SR5 karmagen starts at 800 for a full PC; ours are street-level hires at
roughly a third of that, who grow into the work.)

**D2 — The curves are already canon; don't touch them.**
- skills: `karmaCost(rank) = rank × (rank+1)` — the cumulative of SR5's
  "new rating × 2".
- attributes: `attributeCost(rating) = (rating+1) × 5` — SR5's "new rating × 5".
These were already correct. Only the *spending* was wrong.

**D3 — Bands, consumed in priority order. Not share-splits.**
Each tier has a **band** a rank can roll within. Roll each in priority order —
random primary, then secondaries, then tertiary — and **subtract its karma cost
from the pool as you go.** When the pool runs dry, later entries get less or
nothing.

This is the variance engine. A runner who rolls a towering primary has less left
for everything after it. The tradeoff is created by the pool; the variance by
the bands.

**D4 — Playable minimums, not survival minimums.** Fed FIRST, out of the pool,
before band rolling. The floor is about being *playable in your role*, not
surviving any given fight.

> Nobody automatically survives. A low-level weak fighter loses to a mid-high
> weak decker. But at the same level, a weak fighter should usually beat a weak
> decker. Just because some combats need Body 4 does not mean every runner needs
> Body 4.

So minimums are **role-relative and power-level-scaled**, never universal.

**D5 — The tails are the point.** Glass cannons (high Magic, low Willpower —
hurts itself), rubber bands (spread so thin nothing works), and occasional
beautifully-constructed accidents must all fall out of the system at natural
rates. They are outcomes, not bugs. The market should be able to offer all three.

**D6 — Class identifiers MUST NEVER LIE.** Presentation (Summoner, Puppeteer,
Infiltrator…) is **visible and always true**. More runner types is the depth
we want: more specialised classes means more for the player to chase, and more
complexity from adding pieces to the same chessboard rather than new boards.

**Specialist/Generalist may still mislead** — and now has an in-fiction reason:
people think they're greater than they are, or that they can multi-task when
they can't. `disciplineLabel` stays the one axis of deception; it is
self-assessment, not fraud.

**D7 — Counterspeller and Disenchanter are CUT.** No place in this game.

**D8 — Summoner and Binder are ONE thing.** Summoned spirits are a force
multiplier that puts **additional bodies in the formation/squad**, limited by
**number of services** (a time/action budget, per SR5).

> **Note discovered while planning:** drones are *not* this system yet either.
> They are currently gear granting dice to `rigging`; armory.js marks jump-in as
> Phase 2. So this is not "make spirits like drones" — it is **build the
> extra-bodies system that spirits and drones both need**, and put drones on it.

**D9 — The Artificer exists and matters.** Bench specialists are a character
type we have always allowed. The design goal is the runner you *have to* field
to earn the XP that makes them better on the bench — the same tension as a
Computer specialist with low Body and Agility. Formulas craft off `enchanting`,
so the enchanter fills other mages' grimoires; that closes the spell bootstrap
without any auto-unlock.

---

## 3. THE GREEN LIGHT INVARIANT

The most load-bearing rule to come out of this session. State it in code
comments wherever the card is computed.

> **If the card reports GREEN from current information, the crew must genuinely
> be qualified. A green that is accurate must be true.**
>
> The only permitted cause of a wrong green is **stale information** — intel
> that was correct when gathered and has since changed.
>
> A failure after an accurate green must be because the player played their
> cards wrong, or because the situation changed and the intel is now known to be
> old. Never because the card computed a green from inputs it was not counting.

Consequences:

- **Everything that contributes must be counted.** Magic *and* gear. The Armor
  spell must reach the armour rating. Buffs, barriers, heals, and issued gear
  all move the numbers they actually move.
- Force-multiplier presentations (Sentry, Warder, Force Multiplier, Showman)
  currently score near zero because the lane model reads *verbs*. They are not
  weak, they are **unreadable** — same class of bug as the mute mage.
- Under-counting is as much a violation as over-counting: a false red teaches
  the player to distrust a card that is supposed to be their instrument.

This is the acceptance test for the whole lane/card subsystem.

---

## 4. THE MAGE SHAPES (summary — full table in `MAGE-SHAPES.md`)

**Generative principle:** our four magic skills each collapse an entire SR5
skill *group*. The presentations are those hidden sub-skills coming back as
archetypes, crossed with **which attribute pays for the work**.

| our skill | SR5 group |
|---|---|
| `sorcery` | Spellcasting, Counterspelling, Ritual |
| `conjuring` | Summoning, **Binding**, **Banishing** |
| `enchanting` | Alchemy, Artificing, Disenchanting |
| `assensing` | Assensing |

**The three attributes that decide a mage's profession:** Willpower (Drain and
the stun track — the caster's role-relative floor), Charisma (the social
presentations), Intelligence (the reading presentations). Magic is necessary for
all and distinguishes none.

Presentations, after D7 cuts:

- **combatMage** — Artillery (Willpower, loud, area), Assassin (Intelligence +
  Stealth, direct mana, quiet), Sandman (nonlethal stun).
- **detectionMage** — Astral Scout (Intelligence), Interrogator (Charisma),
  Analyst (Intelligence + Electronics), Sentry (support).
- **healthMage** — Field Medic (Intelligence + Medicine), Force Multiplier
  (Willpower, sustaining), Saboteur (debuff).
- **illusionMage** — Infiltrator (Agility + Stealth), Showman (Charisma),
  Impersonator (Charisma + Con), Tormentor (debuff).
- **manipulationMage** — Puppeteer (Charisma + Willpower), Telekinetic
  (Intelligence), Warder (Willpower, barriers), Controller.
- **conjuringMage** — Summoner/Binder (Charisma — spirits are negotiated with),
  Banisher (Willpower — spirits are overpowered), Astral Intruder
  (Intelligence).
- **enchantingMage** — Artificer (Intelligence, bench), Alchemist
  (preparations).

The Summoner/Banisher pair is the clearest argument for D6+finding 4: **same
skill, opposite attributes, different profession.**

---

## 5. BUILD SEQUENCE

Ordered by dependency. Do not skip ahead — later steps assume earlier ones.

### Phase A — the shape tables (design, no code) — **COMPLETE**
- [x] A1. Mage presentations — `MAGE-SHAPES.md`
- [x] A2. Fighter presentations — `RUNNER-SHAPES.md`
- [x] A3. Decker presentations — the affinity becomes the presentation; the
      Coder is D9's low-Body Computer specialist
- [x] A4. Rigger presentations — **three of four blocked on Phase D**; only the
      Mechanic is buildable now
- [x] A5. Face presentations
- [x] A6. Adepts — see the finding in §9

### What Phase A surfaced (fold into Phase B)

- **The bench profession is a pattern, not a special case.** Artificer (mage),
  Surgeon (streetDoc), Coder (decker), Mechanic (rigger) are one shape four
  times: best in the workshop, must be fielded to earn the karma that improves
  the workshop. D9 deserves ONE systemic answer, not four.
- **The unattended body is a pattern too.** Astral Intruder, Jumped-In rigger,
  and a decker going slump all leave a meat body for the crew to guard. The
  plane/turn-ratio note in `UNDERSTANDING.md` is the system all three need.
- **`tank` and `streetDoc` are mis-shaped.** `tank`'s keySkill is
  `intimidation`, which is Charisma-linked — a fighter focus paid for by a Face
  attribute, able to generate a runner bad at their own nameplate.
  `streetDoc` is a fighter-family focus whose list holds no combat skill at all.
  **Review both before writing bands.**
- **The band table cannot be one shape for all five families.** Mages separate
  on *attributes* (identical skills, different profession). Deckers all want
  Intelligence and separate on *skills and physical stats*. Fighters separate on
  both.
- **The Commander is the only force multiplier the card can already see** —
  `lanes.js` implements teamwork stacking. Worth studying before Phase C, since
  it is the working example of a support role that reads correctly.

### Phase B — the birth allocator
- [ ] B1. Revert the half-finished `runner.js` work (§0).
- [ ] B2. `presentation` as a generated, always-true trait carrying its own
      attribute priority order. This replaces skill-derived `attributePriority`
      *at birth* (growth may keep using the derived order — decide when there).
- [ ] B3. Playable minimums table: per presentation, per power level (D4).
- [ ] B4. Band table: per presentation, per tier (D3).
- [ ] B5. The allocator — minimums first, then bands in priority order,
      subtracting from one pool (D1/D3/D4).
- [ ] B6. Calibrate to ~335k total (§1) and verify the tails exist (D5):
      measure the rate of glass cannons, rubber bands, and gems.
- [ ] B7. Fix the 4 failing probes and add probes for the new invariants.

### Phase C — the Green Light Invariant
- [ ] C1. Audit every input to the capability card. Enumerate what contributes
      and what is currently counted.
- [ ] C2. Gear contributions complete — including armour from gear.
- [ ] C3. Magic contributions complete — the Armor spell reaches the armour
      rating; barriers, buffs and heals reach what they affect.
- [ ] C4. Support presentations become readable (§3).
- [ ] C5. A probe that asserts the invariant directly: across many sites, an
      accurate green is never genuinely unqualified.

### Phase D — extra bodies (D8)
- [ ] D1. The formation/squad model: additional bodies that are not runners.
- [ ] D2. Spirits — summoned, limited by services.
- [ ] D3. Drones moved onto the same system (currently gear-only).

### Phase E — the player's own runner
- [ ] E1. Character creation over the **same** birth allocator, never a parallel
      system. Player picks class → generalist/specialist → focus → primary →
      the N secondaries; presentation chosen, not rolled.
- [ ] E2. Mage creation picks spells up to `min(Magic, Sorcery+1)`.
- [ ] E3. One free permanent runner; killable; no dispatch requirement; caps
      like everyone else.

### Phase F — the save/death gate (independent; can be done any time)
- [ ] F1. **No save may be written while a mission outcome is unacknowledged.**
      `settleDay` currently autosaves at day end while missions resolve inside
      the day, so a death is committed with no player gate. One slot
      (`SAVE_KEY = "current"`, `put` overwrites) means no rewind exists.
- [ ] F2. Snapshot `current` → `previous` at `beginDay`.
- [ ] F3. The player's dismissal of the outcome is what commits it. Refresh or
      load before that, and the day did not happen.
- [ ] F4. This is a turn-based combat game: **there must be no situation where a
      runner is hurt or killed and the player is not involved.** Auto-resolve is
      scaffolding, not the game.

---

## 6. OPEN QUESTIONS

- **Growth vs birth attribute priority.** Presentation drives it at birth (B2).
  Does growth follow presentation too, or keep the skill-derived order? Growth
  following presentation is more coherent but makes a runner's trajectory fully
  determined at birth.
- **Does presentation show on the market card, or only on the dossier after
  watching?** D6 says it never lies; it does not say when it is revealed.
- **Alchemist preparations** — a stored spell cast at a time you guessed in
  advance. Real mechanic or flavour?
- **Astral Intruder leaves a body behind.** The docs mention plane/turn ratios
  for exactly this (a decker jacking in and going slump). Same system.

---

## 7. THE 4 FAILING PROBES (from the parked work)

Diagnosed but not fixed. Two are certainly probe-expectation drift; two were
still under investigation when work stopped.

- **C17 — "an untrained mage — a pure conjurer — carries none."** *Expectation
  drift, and the fix working.* Once tertiary stops being zero, every mage has
  some sorcery, so empty books no longer occur at birth. The *rule* (untrained →
  no castable spells) should stay; the *expectation that empty books occur*
  should go.
- **C22 — "the bounce probe never met its conditions."** Setup no longer
  reproduces: runners got stronger, so the kick probably penetrates where it
  used to bounce. Probe needs a harder wall, not a code change. Verify.
- **C2 — "a guard in the room must sometimes catch a by-hand job."** `sawIt`
  hit 0 across 200 trials. Runners now have better Stealth/Agility, so the
  guard never wins the contest. **Investigate whether this is balance drift or
  the runners being genuinely over-tuned** — this one may be a real signal.
- **C11 — "a program without a deck must be dead weight."** Was mid-diagnosis.
  Observed: a generated decker carries `deckMk1` in their starting kit, so
  `gearBonusFor(hacking)` was 1, not 0, after the probe reclaimed the *other*
  deck. Likely the probe assumes a decker with no personal deck. Confirm — gear
  bonuses should not be affected by generation at all, so if it is not the
  starting kit, it is a real bug.

---

## 8. THE ADEPT FINDING

**Measured, 2026-08-06: an adept's Magic attribute is completely inert.**

Adepts are `origin: "magic"` on a non-mage focus — **9.3% of the generated
market** over a 600-runner sample. Comparing the same runner at Magic 4 and
Magic 0:

- identical dice pools on every skill
- identical values in every lane
- **identical price** — `attributePriority` is skill-derived, adepts hold no
  magic-linked skills, so Magic is never counted

`runner.js` states the intent plainly: adepts "get a smaller Magic score
powering their abilities (Killing Hands, Improved Reflexes) without casting."
Those abilities were never built. Nearly a tenth of the market generates
carrying a defining trait that changes nothing.

This is the mute mage in a different costume. Fix it at the source.

**The build is cheaper than it looks.** SR5 gives adepts Power Points equal to
their Magic rating, spent on powers — structurally identical to the grimoire: a
per-runner list, bounded by an attribute, read by the verb layer. `spellsFor`,
the `carries` gate and `bestCombatSpell` are the working model to copy.

**Open modelling question for Phase B:** adept presentations cross focus lines
(a Presence adept could be a `face` or a `tank`; a Striker could be `melee` or
`tank`). So adept presentation is a **second axis**, not a replacement for
focus. Decide how that composes before writing the band table.

---

## 9. STANDING PROJECT RULES THAT CONSTRAIN ALL OF THIS

- **AUTO-RESOLVE IS SCAFFOLDING, NOT THE GAME.**
- **A rating is a SPREAD.** No number quoted at the player is read off the
  maximum.
- **Never give the player perfect information they would not have.**
- Build each mechanic to the depth the design specifies, whatever is currently
  rendering it.
- Verify every changed path live, not a sample.
